"""
URL configuration for esg_platform project.
"""
from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from api.views import (
    CompanyViewSet, UserViewSet, DataSourceViewSet, 
    UploadBatchViewSet, NormalizedRecordViewSet, 
    ReviewDecisionViewSet, AuditLogViewSet
)

router = DefaultRouter()
router.register(r'companies', CompanyViewSet, basename='company')
router.register(r'users', UserViewSet, basename='user')
router.register(r'data-sources', DataSourceViewSet, basename='datasource')
router.register(r'batches', UploadBatchViewSet, basename='batch')
router.register(r'normalized-records', NormalizedRecordViewSet, basename='normalizedrecord')
router.register(r'review-decisions', ReviewDecisionViewSet, basename='reviewdecision')
router.register(r'audit-logs', AuditLogViewSet, basename='auditlog')

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include(router.urls)),
]
