from django.db import models
from django.contrib.auth.models import AbstractUser

class Company(models.Model):
    name = models.CharField(max_length=255, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name

class User(AbstractUser):
    ROLE_CHOICES = (
        ('analyst', 'Compliance Analyst'),
        ('manager', 'Sustainability Manager'),
        ('auditor', 'External Auditor'),
    )
    company = models.ForeignKey(Company, on_delete=models.CASCADE, null=True, blank=True, related_name='users')
    role = models.CharField(max_length=50, choices=ROLE_CHOICES, default='analyst')

    def __str__(self):
        return f"{self.username} ({self.get_role_display()}) - {self.company.name if self.company else 'System'}"

class AuditLog(models.Model):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='audit_logs')
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    action = models.CharField(max_length=100) # upload_created, normalization_completed, field_edited, etc.
    target_model = models.CharField(max_length=100) # e.g. "NormalizedRecord"
    target_id = models.CharField(max_length=100) # Row PK
    old_value = models.JSONField(null=True, blank=True)
    new_value = models.JSONField(null=True, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-timestamp']

    def __str__(self):
        username = self.user.username if self.user else "System"
        return f"{username} performed {self.action} on {self.target_model}:{self.target_id} at {self.timestamp}"
