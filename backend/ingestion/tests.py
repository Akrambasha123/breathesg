from decimal import Decimal
import json
from datetime import date
from django.test import TestCase
from django.core.exceptions import ValidationError
from django.utils import timezone
from core.models import Company, User, AuditLog
from ingestion.models import DataSource, UploadBatch, RawRecord, NormalizedRecord
from ingestion.pipelines import IngestionEngine, clean_numeric, calculate_haversine

class IngestionPipelineTestCase(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Test Tenancy Corp")
        self.user = User.objects.create_user(
            username="analyst_test",
            password="testpassword",
            email="test@example.com",
            role="analyst",
            company=self.company
        )
        self.sap_source = DataSource.objects.create(
            company=self.company,
            name="SAP Ingestion",
            source_type="SAP_CSV"
        )
        self.utility_source = DataSource.objects.create(
            company=self.company,
            name="Utility Electricity",
            source_type="UTILITY_CSV"
        )
        self.travel_source = DataSource.objects.create(
            company=self.company,
            name="Concur API Ingest",
            source_type="TRAVEL_API"
        )

    def test_clean_numeric(self):
        # German locale checking
        self.assertEqual(clean_numeric("1.200,50"), Decimal("1200.50"))
        self.assertEqual(clean_numeric("500,25"), Decimal("500.25"))
        # Standard US format
        self.assertEqual(clean_numeric("1,200.50"), Decimal("1200.50"))
        self.assertEqual(clean_numeric("500.25"), Decimal("500.25"))
        # Clean numeric
        self.assertEqual(clean_numeric("1200"), Decimal("1200.00"))
        self.assertIsNone(clean_numeric(""))

    def test_calculate_haversine(self):
        # JFK coordinates: 40.6413, -73.7781
        # LAX coordinates: 33.9416, -118.4085
        # Distance should be roughly 3982 km
        distance = calculate_haversine(40.6413, -73.7781, 33.9416, -118.4085)
        self.assertAlmostEqual(distance, 3982.0, delta=50.0)

    def test_sap_csv_ingestion_pipeline(self):
        # Create CSV content with mixed formats, plant codes, and German locale
        csv_content = (
            "Material,Plant,Menge,Einheit,Datum,Cost Center,Vendor\n"
            "Heavy Diesel,DE01,\"1.200,50\",L,25.05.2026,CC-PROD-01,Shell\n"
            "Gasoline,US02,500.00,GAL,2026-05-20,CC-SALES-02,Chevron\n"
            "Natural Gas,IN03,3000,m3,05/18/2026,CC-OFFICE-03,GAIL\n"
        )
        
        batch = UploadBatch.objects.create(
            company=self.company,
            data_source=self.sap_source,
            file_name="sap_test.csv",
            uploaded_by=self.user
        )
        
        success = IngestionEngine.process_batch(batch.id, csv_content)
        self.assertTrue(success)
        
        batch.refresh_from_db()
        self.assertEqual(batch.status, 'completed')
        self.assertEqual(batch.summary['total_rows'], 3)
        
        # Verify normalized records
        records = NormalizedRecord.objects.filter(upload_batch=batch)
        self.assertEqual(records.count(), 3)
        
        # Row 1 (German heavy diesel, liters)
        row1 = records.get(raw_record__row_index=0)
        self.assertEqual(row1.normalized_unit, 'L')
        self.assertEqual(row1.normalized_quantity, Decimal("1200.50"))
        self.assertEqual(row1.activity_date, date(2026, 5, 25))
        self.assertEqual(row1.scope_category, 'Scope 1')
        self.assertEqual(row1.activity_type, 'diesel_combustion')
        
        # Row 2 (US gasoline, gallons converted to liters)
        row2 = records.get(raw_record__row_index=1)
        self.assertEqual(row2.normalized_unit, 'L')
        # 500 GAL * 3.78541 = 1892.705 L
        self.assertAlmostEqual(float(row2.normalized_quantity), 1892.705, delta=0.01)
        
        # Audit log verification
        completion_audit = AuditLog.objects.filter(
            company=self.company,
            action='normalization_completed',
            target_model='UploadBatch',
            target_id=str(batch.id)
        )
        self.assertTrue(completion_audit.exists())

    def test_utility_csv_gaps_and_overlaps(self):
        # Ingest first bill
        bill1 = (
            "meter_id,billing_start_date,billing_end_date,kwh_usage,tariff_type,demand_charge\n"
            "MTR-001,2026-01-01,2026-01-31,1000.00,Commercial,50.00\n"
        )
        batch1 = UploadBatch.objects.create(
            company=self.company,
            data_source=self.utility_source,
            file_name="bill1.csv",
            uploaded_by=self.user
        )
        self.assertTrue(IngestionEngine.process_batch(batch1.id, bill1))
        
        # Ingest overlapping bill
        bill2 = (
            "meter_id,billing_start_date,billing_end_date,kwh_usage,tariff_type,demand_charge\n"
            "MTR-001,2026-01-25,2026-02-25,1200.00,Commercial,50.00\n"
        )
        batch2 = UploadBatch.objects.create(
            company=self.company,
            data_source=self.utility_source,
            file_name="bill2.csv",
            uploaded_by=self.user
        )
        self.assertTrue(IngestionEngine.process_batch(batch2.id, bill2))
        
        overlap_record = NormalizedRecord.objects.get(upload_batch=batch2)
        self.assertEqual(overlap_record.status, 'flagged')
        self.assertIn("overlapping_billing_period", overlap_record.validation_flags)

    def test_travel_json_airport_distance_fallback(self):
        travel_json = json.dumps([
            {
                "employee_id": "EMP-982",
                "trip_type": "flight",
                "origin_airport": "JFK",
                "destination_airport": "LAX",
                "activity_date": "2026-05-22"
            },
            {
                "employee_id": "EMP-982",
                "trip_type": "hotel",
                "hotel_nights": 5,
                "activity_date": "2026-05-22"
            }
        ])
        
        batch = UploadBatch.objects.create(
            company=self.company,
            data_source=self.travel_source,
            file_name="concur.json",
            uploaded_by=self.user
        )
        
        self.assertTrue(IngestionEngine.process_batch(batch.id, travel_json))
        
        records = NormalizedRecord.objects.filter(upload_batch=batch)
        self.assertEqual(records.count(), 2)
        
        # Verify flight record has inferred distance
        flight = records.get(activity_type='flight_travel')
        self.assertGreater(flight.normalized_quantity, 3900) # JFK to LAX distance in km
        self.assertIn("distance_inferred_from_airport_geocodes", flight.validation_flags)

    def test_immutable_locking_policy(self):
        # Create a raw and normalized record
        raw = RawRecord.objects.create(
            upload_batch=UploadBatch.objects.create(
                company=self.company,
                data_source=self.sap_source,
                file_name="fake.csv",
                uploaded_by=self.user
            ),
            row_index=0,
            payload={}
        )
        
        record = NormalizedRecord.objects.create(
            company=self.company,
            raw_record=raw,
            upload_batch=raw.upload_batch,
            source_type='SAP_CSV',
            scope_category='Scope 1',
            activity_type='diesel_combustion',
            activity_date=timezone.now().date(),
            normalized_quantity=Decimal("500.00"),
            normalized_unit='L',
            status='locked'
        )
        
        # Verify locked editing restriction
        record.normalized_quantity = Decimal("1000.00")
        with self.assertRaises(ValidationError):
            record.save()
            
        # Verify locked deletion restriction
        with self.assertRaises(ValidationError):
            record.delete()
