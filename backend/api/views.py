import json
from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import viewsets, status, views
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError

from core.models import Company, User, AuditLog
from ingestion.models import DataSource, UploadBatch, RawRecord, NormalizedRecord, ReviewDecision
from ingestion.pipelines import IngestionEngine, clean_numeric, parse_date
from .serializers import (
    CompanySerializer, UserSerializer, DataSourceSerializer, 
    UploadBatchSerializer, RawRecordSerializer, NormalizedRecordSerializer, 
    ReviewDecisionSerializer, AuditLogSerializer
)

class MultiTenantViewSetMixin:
    """
    Scopes standard querysets to the company provided in the 'X-Company-ID' header 
    or the authenticated user's company to guarantee tenant data isolation.
    """
    def get_company(self):
        # Allow header-based company selection for easy multi-tenant prototype switching
        company_header = self.request.headers.get('X-Company-ID') or self.request.query_params.get('company_id')
        if company_header:
            try:
                return Company.objects.get(id=int(company_header))
            except (ValueError, Company.DoesNotExist):
                pass
        
        # Fallback to demo user profile company if authenticated
        if self.request.user.is_authenticated and self.request.user.company:
            return self.request.user.company
        
        # Prototype default fallback to the first company in database if none is selected
        first_company = Company.objects.first()
        if not first_company:
            first_company = Company.objects.create(name="Acme Carbon Corp")
        return first_company

class CompanyViewSet(viewsets.ModelViewSet):
    queryset = Company.objects.all()
    serializer_class = CompanySerializer

class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer

    @action(detail=False, methods=['get'])
    def me(self, request):
        # Returns current simulated user or a mock analyst
        username = self.request.query_params.get('user', 'analyst_demo')
        role = self.request.query_params.get('role', 'analyst')
        company_id = self.request.query_params.get('company_id')
        
        # Resolve company
        company = None
        if company_id:
            company = Company.objects.filter(id=company_id).first()
        if not company:
            company = Company.objects.first()
            if not company:
                company = Company.objects.create(name="Acme Carbon Corp")
                
        user, created = User.objects.get_or_create(username=username, defaults={
            'email': f"{username}@example.com",
            'role': role,
            'company': company
        })
        
        # Update role or company if they switched on UI login
        if not created:
            user.role = role
            user.company = company
            user.save()
            
        serializer = self.get_serializer(user)
        return Response(serializer.data)

class DataSourceViewSet(MultiTenantViewSetMixin, viewsets.ModelViewSet):
    serializer_class = DataSourceSerializer

    def get_queryset(self):
        company = self.get_company()
        return DataSource.objects.filter(company=company)

    def perform_create(self, serializer):
        serializer.save(company=self.get_company())

class UploadBatchViewSet(MultiTenantViewSetMixin, viewsets.ModelViewSet):
    serializer_class = UploadBatchSerializer

    def get_queryset(self):
        company = self.get_company()
        return UploadBatch.objects.filter(company=company)

    @action(detail=False, methods=['post'])
    def upload_file(self, request):
        """
        Receives simulated raw file uploads.
        POST payload: {
            "data_source": int,
            "file_name": str,
            "file_content": str (raw text content of CSV or JSON payload)
        }
        """
        company = self.get_company()
        ds_id = self.request.data.get('data_source')
        file_name = self.request.data.get('file_name', 'upload.csv')
        file_content = self.request.data.get('file_content', '')
        
        # Resolve simulated user
        username = self.request.headers.get('X-Simulated-User') or 'analyst_demo'
        user = User.objects.filter(username=username, company=company).first()
        if not user:
            user = User.objects.filter(company=company).first()
        if not user:
            user = User.objects.create(username=username, role='analyst', company=company)
            
        try:
            ds = DataSource.objects.get(id=ds_id, company=company)
        except DataSource.DoesNotExist:
            return Response({"error": "Data source not found"}, status=status.HTTP_400_BAD_REQUEST)
            
        # 1. Create Ingestion Batch
        batch = UploadBatch.objects.create(
            company=company,
            data_source=ds,
            file_name=file_name,
            uploaded_by=user,
            status='pending'
        )
        
        # Audit Log upload created
        AuditLog.objects.create(
            company=company,
            user=user,
            action='upload_created',
            target_model='UploadBatch',
            target_id=str(batch.id),
            new_value={"file_name": file_name, "source_type": ds.source_type}
        )
        
        # 2. Run Ingestion Pipeline (Sync process for prototype)
        pipeline_success = IngestionEngine.process_batch(batch.id, file_content)
        
        # Reload batch with summary
        batch.refresh_from_db()
        
        if pipeline_success:
            return Response(UploadBatchSerializer(batch).data, status=status.HTTP_201_CREATED)
        else:
            return Response({
                "error": "Pipeline execution failed",
                "batch": UploadBatchSerializer(batch).data
            }, status=status.HTTP_422_UNPROCESSABLE_ENTITY)

class NormalizedRecordViewSet(MultiTenantViewSetMixin, viewsets.ModelViewSet):
    serializer_class = NormalizedRecordSerializer

    def get_queryset(self):
        company = self.get_company()
        queryset = NormalizedRecord.objects.filter(company=company)
        
        # Support search and filter query parameters
        status_filter = self.request.query_params.get('status')
        source_filter = self.request.query_params.get('source_type')
        scope_filter = self.request.query_params.get('scope_category')
        
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        if source_filter:
            queryset = queryset.filter(source_type=source_filter)
        if scope_filter:
            queryset = queryset.filter(scope_category=scope_filter)
            
        return queryset

    def get_user_from_headers(self, company):
        username = self.request.headers.get('X-Simulated-User') or 'analyst_demo'
        user = User.objects.filter(username=username, company=company).first()
        if not user:
            user = User.objects.create(username=username, role='analyst', company=company)
        return user

    def update(self, request, *args, **kwargs):
        """
        Supports manual Analyst Correction updates.
        Validates locked records, performs fine-grained diff-logging, and re-executes data sanity checks.
        """
        company = self.get_company()
        user = self.get_user_from_headers(company)
        record = self.get_object()
        
        if record.status == 'locked':
            return Response({"error": "This record is locked for auditing and cannot be updated."}, status=status.HTTP_403_FORBIDDEN)
            
        # Track before/after fields
        old_record_values = {
            'activity_date': str(record.activity_date) if record.activity_date else None,
            'quantity': str(record.quantity) if record.quantity else None,
            'unit': record.unit,
            'normalized_quantity': str(record.normalized_quantity) if record.normalized_quantity else None,
            'normalized_unit': record.normalized_unit,
            'status': record.status,
            'validation_flags': record.validation_flags.copy() if record.validation_flags else []
        }
        
        # Map values from request body
        req_qty = request.data.get('quantity')
        req_unit = request.data.get('unit')
        req_date = request.data.get('activity_date')
        
        # Start transactional update
        try:
            with transaction.atomic():
                # Perform manual overrides
                if req_qty is not None:
                    record.quantity = clean_numeric(req_qty)
                if req_unit is not None:
                    record.unit = str(req_unit).strip()
                if req_date is not None:
                    record.activity_date = parse_date(req_date)
                
                # Re-run normalizations & sanity validations based on source type
                flags = []
                
                # Base Conversions
                if record.source_type == 'SAP_CSV':
                    if record.quantity is None:
                        record.quantity = Decimal('0.00')
                        flags.append("invalid_quantity_format")
                    elif record.quantity < 0:
                        flags.append("negative_quantity")
                    elif record.quantity > 100000:
                        flags.append("excessive_quantity_spike")
                        
                    # Standardize Units
                    unit_upper = record.unit.upper() if record.unit else ''
                    if unit_upper in ('L', 'LIT', 'LITER', 'LITRE'):
                        record.normalized_unit = 'L'
                        record.normalized_quantity = record.quantity
                    elif unit_upper in ('GAL', 'GL', 'GALLON'):
                        record.normalized_unit = 'L'
                        record.normalized_quantity = record.quantity * Decimal('3.78541')
                    elif unit_upper in ('M3', 'CUBIC_METER'):
                        record.normalized_unit = 'm3'
                        record.normalized_quantity = record.quantity
                    else:
                        record.normalized_unit = 'unknown'
                        flags.append("unsupported_unit")
                        
                elif record.source_type == 'UTILITY_CSV':
                    if record.quantity is None:
                        record.quantity = Decimal('0.00')
                        flags.append("invalid_usage_format")
                    elif record.quantity < 0:
                        flags.append("negative_kwh_usage")
                        
                    record.normalized_unit = 'kWh'
                    record.normalized_quantity = record.quantity
                    
                elif record.source_type == 'TRAVEL_API':
                    # Travel API correction
                    if record.quantity is None or record.quantity < 0:
                        flags.append("invalid_travel_metric")
                    record.normalized_quantity = record.quantity if record.quantity else Decimal('0.00')
                    
                # Date validations
                if not record.activity_date:
                    flags.append("invalid_date_format")
                    
                record.validation_flags = flags
                
                # If an analyst is saving edits, they generally want to clear flagged status or set to pending review
                if record.status in ('flagged', 'pending'):
                    record.status = 'flagged' if flags else 'pending'
                
                # Django ORM trigger validation check
                record.clean()
                record.save()
                
                # Compute Diff Log
                new_record_values = {
                    'activity_date': str(record.activity_date) if record.activity_date else None,
                    'quantity': str(record.quantity) if record.quantity else None,
                    'unit': record.unit,
                    'normalized_quantity': str(record.normalized_quantity) if record.normalized_quantity else None,
                    'normalized_unit': record.normalized_unit,
                    'status': record.status,
                    'validation_flags': record.validation_flags
                }
                
                changed_fields = {}
                for key, val in old_record_values.items():
                    if val != new_record_values[key]:
                        changed_fields[key] = {
                            "old": val,
                            "new": new_record_values[key]
                        }
                        
                if changed_fields:
                    AuditLog.objects.create(
                        company=company,
                        user=user,
                        action='field_edited',
                        target_model='NormalizedRecord',
                        target_id=str(record.id),
                        old_value=changed_fields,
                        new_value=new_record_values
                    )
                    
            serializer = self.get_serializer(record)
            return Response(serializer.data)
            
        except DjangoValidationError as dve:
            raise ValidationError(detail=str(dve))
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def make_decision(self, request, pk=None):
        """
        Submits a Review Decision (Approve / Reject) for a single record.
        """
        company = self.get_company()
        user = self.get_user_from_headers(company)
        record = self.get_object()
        
        decision = self.request.data.get('decision') # approved or rejected
        comment = self.request.data.get('comment', '')
        
        if record.status == 'locked':
            return Response({"error": "This record is locked and cannot undergo a new review decision."}, status=status.HTTP_403_FORBIDDEN)
            
        if decision not in ('approved', 'rejected'):
            return Response({"error": "Invalid decision. Choose 'approved' or 'rejected'."}, status=status.HTTP_400_BAD_REQUEST)
            
        with transaction.atomic():
            # 1. Update record status
            record.status = decision
            record.save()
            
            # 2. Add Review Decision Tracker
            ReviewDecision.objects.create(
                normalized_record=record,
                user=user,
                decision=decision,
                comment=comment
            )
            
            # 3. Log Audit Activity
            AuditLog.objects.create(
                company=company,
                user=user,
                action=f"record_{decision}",
                target_model='NormalizedRecord',
                target_id=str(record.id),
                new_value={"decision": decision, "comment": comment}
            )
            
        return Response(self.get_serializer(record).data)

    @action(detail=True, methods=['post'])
    def lock_record(self, request, pk=None):
        """
        Locks a record, preventing any edits.
        """
        company = self.get_company()
        user = self.get_user_from_headers(company)
        record = self.get_object()
        
        # Only manager role should lock records
        if user.role not in ('manager', 'admin'):
             return Response({"error": "Access Denied: Only sustainability managers can audit-lock records."}, status=status.HTTP_403_FORBIDDEN)
             
        if record.status != 'approved':
             return Response({"error": "Only approved records can be audit-locked."}, status=status.HTTP_400_BAD_REQUEST)
             
        with transaction.atomic():
            record.status = 'locked'
            record.locked_at = timezone.now()
            record.locked_by = user
            record.save()
            
            AuditLog.objects.create(
                company=company,
                user=user,
                action='record_locked',
                target_model='NormalizedRecord',
                target_id=str(record.id),
                new_value={"locked_at": str(record.locked_at)}
            )
            
        return Response(self.get_serializer(record).data)

class ReviewDecisionViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ReviewDecisionSerializer
    
    def get_queryset(self):
        record_id = self.request.query_params.get('record_id')
        if record_id:
            return ReviewDecision.objects.filter(normalized_record_id=record_id)
        return ReviewDecision.objects.all()

class AuditLogViewSet(MultiTenantViewSetMixin, viewsets.ReadOnlyModelViewSet):
    serializer_class = AuditLogSerializer

    def get_queryset(self):
        company = self.get_company()
        queryset = AuditLog.objects.filter(company=company)
        
        target_model = self.request.query_params.get('target_model')
        target_id = self.request.query_params.get('target_id')
        
        if target_model:
            queryset = queryset.filter(target_model=target_model)
        if target_id:
            queryset = queryset.filter(target_id=target_id)
            
        return queryset
