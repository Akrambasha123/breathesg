from django.db import models
from django.core.exceptions import ValidationError
from core.models import Company, User

class DataSource(models.Model):
    SOURCE_TYPES = (
        ('SAP_CSV', 'SAP Fuel & Procurement CSV'),
        ('UTILITY_CSV', 'Utility Electricity Portal CSV'),
        ('TRAVEL_API', 'Corporate Travel API JSON'),
    )
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='data_sources')
    name = models.CharField(max_length=255)
    source_type = models.CharField(max_length=50, choices=SOURCE_TYPES)
    config = models.JSONField(default=dict, blank=True, help_text="Mapping configuration schemas")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.get_source_type_display()}) - {self.company.name}"

class UploadBatch(models.Model):
    STATUS_CHOICES = (
        ('pending', 'Pending Ingestion'),
        ('processing', 'Processing Ingestion'),
        ('completed', 'Normalization Completed'),
        ('failed', 'Ingestion Failed'),
    )
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='upload_batches')
    data_source = models.ForeignKey(DataSource, on_delete=models.CASCADE, related_name='batches')
    file_name = models.CharField(max_length=255)
    uploaded_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='pending')
    summary = models.JSONField(default=dict, blank=True) # e.g. {"total_rows": 100, "flagged_rows": 5, "errors": []}
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Batch #{self.id} ({self.file_name}) - {self.status}"

class RawRecord(models.Model):
    STATUS_CHOICES = (
        ('pending', 'Pending Processing'),
        ('normalized', 'Successfully Normalized'),
        ('failed', 'Normalization Failed'),
    )
    upload_batch = models.ForeignKey(UploadBatch, on_delete=models.CASCADE, related_name='raw_records')
    row_index = models.IntegerField()
    payload = models.JSONField() # Raw JSON representation of the row
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='pending')
    error_message = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['row_index']

    def __str__(self):
        return f"RawRecord #{self.id} [Batch {self.upload_batch.id}, Row {self.row_index}]"

class NormalizedRecord(models.Model):
    STATUS_CHOICES = (
        ('pending', 'Pending Review'),
        ('flagged', 'Flagged for Suspicious Data'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('locked', 'Audit Locked'),
    )
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='normalized_records')
    raw_record = models.OneToOneField(RawRecord, on_delete=models.CASCADE, related_name='normalized_record')
    upload_batch = models.ForeignKey(UploadBatch, on_delete=models.CASCADE, related_name='normalized_records')
    source_type = models.CharField(max_length=50) # SAP_CSV, UTILITY_CSV, etc.
    scope_category = models.CharField(max_length=20) # Scope 1, Scope 2, Scope 3
    activity_type = models.CharField(max_length=100) # fuel_combustion, electricity_consumption, business_travel
    activity_date = models.DateField(null=True, blank=True)
    
    # original amounts
    quantity = models.DecimalField(max_digits=18, decimal_places=4, null=True, blank=True)
    unit = models.CharField(max_length=50, null=True, blank=True)
    
    # standardized amounts
    normalized_quantity = models.DecimalField(max_digits=18, decimal_places=4, null=True, blank=True)
    normalized_unit = models.CharField(max_length=50, null=True, blank=True)
    
    # review states
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='pending')
    validation_flags = models.JSONField(default=list, blank=True) # list of strings, e.g. ["negative_kwh", "consumption_spike"]
    
    locked_at = models.DateTimeField(null=True, blank=True)
    locked_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='locked_records')
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-activity_date', '-created_at']

    def clean(self):
        # Prevent edits if record is locked
        if self.pk:
            original = NormalizedRecord.objects.get(pk=self.pk)
            if original.status == 'locked' and self.status == 'locked':
                raise ValidationError("This record is audit-locked and cannot be modified.")

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        if self.status == 'locked':
            raise ValidationError("This record is audit-locked and cannot be deleted.")
        super().delete(*args, **kwargs)

    def __str__(self):
        return f"NormalizedRecord #{self.id} ({self.activity_type}) - Qty: {self.normalized_quantity} {self.normalized_unit} - Status: {self.status}"

class ReviewDecision(models.Model):
    DECISION_CHOICES = (
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('flagged', 'Flagged'),
    )
    normalized_record = models.ForeignKey(NormalizedRecord, on_delete=models.CASCADE, related_name='decisions')
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    decision = models.CharField(max_length=50, choices=DECISION_CHOICES)
    comment = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Decision #{self.id} ({self.decision}) by {self.user.username} on Record #{self.normalized_record.id}"
