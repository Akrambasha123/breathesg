from rest_framework import serializers
from core.models import Company, User, AuditLog
from ingestion.models import DataSource, UploadBatch, RawRecord, NormalizedRecord, ReviewDecision

class CompanySerializer(serializers.ModelSerializer):
    class Meta:
        model = Company
        fields = ['id', 'name', 'created_at', 'updated_at']

class UserSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source='company.name', read_only=True)
    role_display = serializers.CharField(source='get_role_display', read_only=True)
    
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'company', 'company_name', 'role', 'role_display']

class DataSourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = DataSource
        fields = ['id', 'company', 'name', 'source_type', 'config', 'created_at']
        read_only_fields = ['company']

class UploadBatchSerializer(serializers.ModelSerializer):
    uploaded_by_username = serializers.CharField(source='uploaded_by.username', read_only=True)
    data_source_name = serializers.CharField(source='data_source.name', read_only=True)
    data_source_type = serializers.CharField(source='data_source.source_type', read_only=True)
    
    class Meta:
        model = UploadBatch
        fields = [
            'id', 'company', 'data_source', 'data_source_name', 'data_source_type', 
            'file_name', 'uploaded_by', 'uploaded_by_username', 'status', 'summary', 'created_at'
        ]
        read_only_fields = ['company']

class RawRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = RawRecord
        fields = ['id', 'upload_batch', 'row_index', 'payload', 'status', 'error_message', 'created_at']

class NormalizedRecordSerializer(serializers.ModelSerializer):
    raw_payload = serializers.JSONField(source='raw_record.payload', read_only=True)
    
    class Meta:
        model = NormalizedRecord
        fields = [
            'id', 'company', 'raw_record', 'raw_payload', 'upload_batch', 'source_type', 
            'scope_category', 'activity_type', 'activity_date', 'quantity', 'unit', 
            'normalized_quantity', 'normalized_unit', 'status', 'validation_flags', 
            'locked_at', 'locked_by', 'created_at', 'updated_at'
        ]

class ReviewDecisionSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    
    class Meta:
        model = ReviewDecision
        fields = ['id', 'normalized_record', 'user', 'username', 'decision', 'comment', 'created_at']

class AuditLogSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    
    class Meta:
        model = AuditLog
        fields = ['id', 'company', 'user', 'username', 'action', 'target_model', 'target_id', 'old_value', 'new_value', 'timestamp']
