import csv
import json
import math
from datetime import datetime, timedelta
from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from .models import UploadBatch, RawRecord, NormalizedRecord, DataSource
from core.models import AuditLog

# Coordinate mappings for standard global airports (for Scope 3 air travel distance fallback)
AIRPORT_COORDINATES = {
    'JFK': (40.6413, -73.7781),
    'LAX': (33.9416, -118.4085),
    'SFO': (37.6213, -122.3790),
    'LHR': (51.4700, -0.4543),
    'CDG': (49.0097, 2.5479),
    'SIN': (1.3644, 103.9915),
    'SYD': (-33.9461, 151.1772),
    'HND': (35.5494, 139.7798),
}

def clean_numeric(val):
    """
    Cleans a string representation of a number, handling mixed separators 
    (e.g., German "1.200,50" -> 1200.50, "1500.50" -> 1500.50).
    """
    if not val:
        return None
    val_str = str(val).strip()
    if not val_str:
        return None
    
    # German format check: if there is a comma and a dot, and the dot comes before the comma
    # e.g., "1.200,50" -> strip dots, replace comma with dot
    # If there is just a comma, e.g., "1200,50" and no dot -> replace comma with dot
    # If there is a dot but no comma, e.g., "1200.50" -> normal float
    if ',' in val_str:
        if '.' in val_str:
            if val_str.find('.') < val_str.find(','):
                # German style dot thousands, comma decimal
                val_str = val_str.replace('.', '').replace(',', '.')
            else:
                # Comma thousands, dot decimal
                val_str = val_str.replace(',', '')
        else:
            # Just a comma, e.g., "1200,50"
            val_str = val_str.replace(',', '.')
    else:
        # Just dots or clean number
        pass
    
    try:
        return Decimal(val_str)
    except Exception:
        return None

def parse_date(date_str):
    """
    Attempts to parse heterogeneous date formats sequentially:
    - DD.MM.YYYY (German)
    - YYYY-MM-DD (ISO)
    - MM/DD/YYYY (US)
    """
    if not date_str:
        return None
    date_str = str(date_str).strip()
    for fmt in ('%d.%m.%Y', '%Y-%m-%d', '%m/%d/%Y', '%d/%m/%Y'):
        try:
            return datetime.strptime(date_str, fmt).date()
        except ValueError:
            continue
    return None

def calculate_haversine(lat1, lon1, lat2, lon2):
    """
    Computes Great-Circle distance in km between two coordinate points.
    """
    R = 6371.0 # Earth's radius in km
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    
    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) * (math.sin(delta_lambda / 2.0) ** 2))
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c

class IngestionEngine:
    @staticmethod
    def process_batch(batch_id, file_content_str):
        """
        Executes the transaction-safe normalization and validation pipeline for a batch.
        """
        try:
            batch = UploadBatch.objects.get(id=batch_id)
        except UploadBatch.DoesNotExist:
            return False

        batch.status = 'processing'
        batch.save()
        
        source_type = batch.data_source.source_type
        
        try:
            with transaction.atomic():
                if source_type == 'SAP_CSV':
                    success = IngestionEngine._process_sap_csv(batch, file_content_str)
                elif source_type == 'UTILITY_CSV':
                    success = IngestionEngine._process_utility_csv(batch, file_content_str)
                elif source_type == 'TRAVEL_API':
                    success = IngestionEngine._process_travel_json(batch, file_content_str)
                else:
                    raise ValueError(f"Unknown data source type: {source_type}")
                
                if success:
                    batch.status = 'completed'
                    # Create audit log for completion
                    AuditLog.objects.create(
                        company=batch.company,
                        user=batch.uploaded_by,
                        action='normalization_completed',
                        target_model='UploadBatch',
                        target_id=str(batch.id),
                        new_value=batch.summary
                    )
                else:
                    batch.status = 'failed'
                batch.save()
                return success
        except Exception as e:
            batch.status = 'failed'
            batch.summary = {'error': str(e), 'total_rows': 0, 'flagged_rows': 0}
            batch.save()
            return False

    @staticmethod
    def _process_sap_csv(batch, file_content_str):
        """
        Normalizes German/US SAP procurement data.
        """
        # Read lines
        lines = file_content_str.strip().splitlines()
        if not lines:
            batch.summary = {'error': 'Empty file', 'total_rows': 0, 'flagged_rows': 0}
            return False
        
        # Detect delimiter (comma or semicolon)
        first_line = lines[0]
        delimiter = ';' if ';' in first_line else ','
        
        reader = csv.DictReader(lines, delimiter=delimiter)
        
        # Clean headers to lowercase/strip quotes
        reader.fieldnames = [f.strip().strip('"').strip("'") for f in reader.fieldnames]
        
        # Normalize column maps (support German/English columns)
        # Required columns mapping
        header_map = {
            'material': ['material', 'material code', 'procurement category', 'artikel'],
            'plant': ['plant', 'werks', 'plant code'],
            'menge': ['menge', 'quantity', 'amount'],
            'einheit': ['einheit', 'unit', 'unit of measure'],
            'datum': ['datum', 'date', 'activity date', 'buchungsdatum'],
            'cost_center': ['cost center', 'cost_center', 'kostenstelle'],
            'vendor': ['vendor', 'lieferant', 'supplier']
        }
        
        resolved_headers = {}
        for key, aliases in header_map.items():
            for f in reader.fieldnames:
                if f.lower() in aliases:
                    resolved_headers[key] = f
                    break
        
        total_rows = 0
        flagged_rows = 0
        
        for idx, row in enumerate(reader):
            total_rows += 1
            # Save raw record
            raw_record = RawRecord.objects.create(
                upload_batch=batch,
                row_index=idx,
                payload=row,
                status='pending'
            )
            
            # Normalization logic
            flags = []
            
            # Extract fields with fallback to raw row keys
            raw_material = row.get(resolved_headers.get('material', 'Material'), '').strip()
            raw_plant = row.get(resolved_headers.get('plant', 'Plant'), '').strip()
            raw_menge = row.get(resolved_headers.get('menge', 'Menge'), '').strip()
            raw_einheit = row.get(resolved_headers.get('einheit', 'Einheit'), '').strip()
            raw_datum = row.get(resolved_headers.get('datum', 'Datum'), '').strip()
            
            # Numeric conversion
            qty = clean_numeric(raw_menge)
            if qty is None:
                qty = Decimal('0.00')
                flags.append("invalid_quantity_format")
            elif qty < 0:
                flags.append("negative_quantity")
            elif qty > 100000:
                flags.append("excessive_quantity_spike")
                
            # Date conversion
            act_date = parse_date(raw_datum)
            if not act_date:
                flags.append("invalid_date_format")
                
            # Unit standardization
            unit = raw_einheit.upper()
            norm_unit = 'L' # Default for fuel combustion liters
            norm_qty = qty
            
            if unit in ('L', 'LIT', 'LITER', 'LITRE'):
                norm_unit = 'L'
                norm_qty = qty
            elif unit in ('GAL', 'GL', 'GALLON', 'GALLONS'):
                norm_unit = 'L'
                norm_qty = qty * Decimal('3.78541') # 1 US Gal = 3.78541 Liters
            elif unit in ('M3', 'CUBIC_METER', 'KUBIKMETER'):
                norm_unit = 'm3'
                norm_qty = qty
            else:
                norm_unit = 'unknown'
                flags.append("unsupported_unit")
            
            # Determine Scope Category based on material
            material_lower = raw_material.lower()
            scope = 'Scope 1'
            act_type = 'fuel_combustion'
            
            if 'diesel' in material_lower:
                act_type = 'diesel_combustion'
            elif 'benzin' in material_lower or 'petrol' in material_lower or 'gasoline' in material_lower:
                act_type = 'gasoline_combustion'
            elif 'gas' in material_lower or 'natural gas' in material_lower:
                scope = 'Scope 1'
                act_type = 'natural_gas_combustion'
            elif 'electricity' in material_lower or 'strom' in material_lower:
                scope = 'Scope 2'
                act_type = 'purchased_electricity'
                norm_unit = 'kWh'
            else:
                act_type = 'other_stationary_combustion'
                
            # Check plant codes (standardized 4 character uppercase alphanumeric)
            if not raw_plant:
                flags.append("missing_plant_code")
            elif len(raw_plant) != 4 and '-' not in raw_plant:
                flags.append("non_standard_plant_code")
                
            status = 'flagged' if flags else 'pending'
            if status == 'flagged':
                flagged_rows += 1
                
            # Create Normalized Record
            NormalizedRecord.objects.create(
                company=batch.company,
                raw_record=raw_record,
                upload_batch=batch,
                source_type='SAP_CSV',
                scope_category=scope,
                activity_type=act_type,
                activity_date=act_date,
                quantity=qty if raw_menge else None,
                unit=raw_einheit,
                normalized_quantity=norm_qty,
                normalized_unit=norm_unit,
                status=status,
                validation_flags=flags
            )
            
            raw_record.status = 'normalized'
            raw_record.save()
            
        batch.summary = {
            'total_rows': total_rows,
            'flagged_rows': flagged_rows,
            'processed_rows': total_rows,
            'source': 'SAP_CSV'
        }
        return True

    @staticmethod
    def _process_utility_csv(batch, file_content_str):
        """
        Normalizes Utility electricity portal invoices, validating overlaps/gaps and usage spikes.
        """
        lines = file_content_str.strip().splitlines()
        if not lines:
            batch.summary = {'error': 'Empty file', 'total_rows': 0, 'flagged_rows': 0}
            return False
            
        reader = csv.DictReader(lines)
        reader.fieldnames = [f.strip().lower() for f in reader.fieldnames]
        
        total_rows = 0
        flagged_rows = 0
        
        for idx, row in enumerate(reader):
            total_rows += 1
            raw_record = RawRecord.objects.create(
                upload_batch=batch,
                row_index=idx,
                payload=row,
                status='pending'
            )
            
            flags = []
            raw_meter = row.get('meter_id', '').strip()
            raw_start = row.get('billing_start_date', '').strip()
            raw_end = row.get('billing_end_date', '').strip()
            raw_usage = row.get('kwh_usage', '').strip()
            
            # Clean variables
            kwh = clean_numeric(raw_usage)
            if kwh is None:
                kwh = Decimal('0.00')
                flags.append("invalid_usage_format")
            elif kwh < 0:
                flags.append("negative_kwh_usage")
                
            start_date = parse_date(raw_start)
            end_date = parse_date(raw_end)
            
            if not start_date or not end_date:
                flags.append("invalid_billing_dates")
            elif start_date >= end_date:
                flags.append("billing_start_after_end")
            else:
                billing_days = (end_date - start_date).days
                if billing_days < 15:
                    flags.append("abnormally_short_billing_period")
                elif billing_days > 45:
                    flags.append("abnormally_long_billing_period")
                
                # Check for gaps and overlaps in prior invoices for same meter
                if raw_meter:
                    prior_records = NormalizedRecord.objects.filter(
                        company=batch.company,
                        source_type='UTILITY_CSV',
                        raw_record__payload__meter_id=raw_meter
                    ).order_by('-activity_date')
                    
                    if prior_records.exists():
                        # Read raw billing dates from first prior record payload to compare
                        prior_raw = prior_records[0].raw_record.payload
                        prior_end_date = parse_date(prior_raw.get('billing_end_date', ''))
                        
                        if prior_end_date:
                            if start_date < prior_end_date:
                                flags.append("overlapping_billing_period")
                            elif start_date > prior_end_date + timedelta(days=1):
                                flags.append("gap_in_billing_period")
                                
                    # Usage spike detection (e.g. daily average > 5x historical average)
                    if prior_records.exists() and billing_days > 0:
                        daily_avg = float(kwh) / billing_days
                        
                        historical_usages = []
                        for pr in prior_records[:5]: # Take last 5 bills
                            p_start = parse_date(pr.raw_record.payload.get('billing_start_date', ''))
                            p_end = parse_date(pr.raw_record.payload.get('billing_end_date', ''))
                            p_qty = clean_numeric(pr.raw_record.payload.get('kwh_usage', '0'))
                            if p_start and p_end and p_qty and (p_end - p_start).days > 0:
                                historical_usages.append(float(p_qty) / (p_end - p_start).days)
                                
                        if historical_usages:
                            avg_hist = sum(historical_usages) / len(historical_usages)
                            if avg_hist > 0 and daily_avg > (avg_hist * 5):
                                flags.append("consumption_spike")
            
            # Standardized values
            norm_unit = 'kWh'
            norm_qty = kwh
            
            status = 'flagged' if flags else 'pending'
            if status == 'flagged':
                flagged_rows += 1
                
            NormalizedRecord.objects.create(
                company=batch.company,
                raw_record=raw_record,
                upload_batch=batch,
                source_type='UTILITY_CSV',
                scope_category='Scope 2',
                activity_type='purchased_electricity',
                activity_date=end_date,
                quantity=kwh,
                unit='kWh',
                normalized_quantity=norm_qty,
                normalized_unit=norm_unit,
                status=status,
                validation_flags=flags
            )
            
            raw_record.status = 'normalized'
            raw_record.save()
            
        batch.summary = {
            'total_rows': total_rows,
            'flagged_rows': flagged_rows,
            'processed_rows': total_rows,
            'source': 'UTILITY_CSV'
        }
        return True

    @staticmethod
    def _process_travel_json(batch, file_content_str):
        """
        Normalizes Concur/Navan style API ingestion (JSON format) and performs airport geodistance calculation.
        """
        try:
            data = json.loads(file_content_str)
        except json.JSONDecodeError as e:
            batch.summary = {'error': f'Invalid JSON payload: {str(e)}', 'total_rows': 0, 'flagged_rows': 0}
            return False
            
        # Support array format or dictionary format with a list root
        records_list = data if isinstance(data, list) else data.get('records', [])
        if not records_list:
            batch.summary = {'error': 'No records found in JSON', 'total_rows': 0, 'flagged_rows': 0}
            return False
            
        total_rows = 0
        flagged_rows = 0
        
        for idx, row in enumerate(records_list):
            total_rows += 1
            raw_record = RawRecord.objects.create(
                upload_batch=batch,
                row_index=idx,
                payload=row,
                status='pending'
            )
            
            flags = []
            
            employee_id = row.get('employee_id', '').strip()
            trip_type = row.get('trip_type', '').strip().lower()
            activity_date_raw = row.get('activity_date', row.get('date', '')).strip()
            
            # Resolve Date
            act_date = parse_date(activity_date_raw)
            if not act_date:
                act_date = timezone.now().date()
                flags.append("missing_activity_date_fallback_to_today")
                
            qty = Decimal('0.00')
            unit = 'km'
            norm_unit = 'km'
            norm_qty = Decimal('0.00')
            
            act_type = f"travel_{trip_type}" if trip_type else "travel_other"
            
            if trip_type == 'flight':
                origin = row.get('origin_airport', '').strip().upper()
                destination = row.get('destination_airport', '').strip().upper()
                dist_km = row.get('distance_km')
                
                # Check distances
                if dist_km is not None:
                    qty = clean_numeric(dist_km)
                    if qty is None or qty <= 0:
                        flags.append("invalid_provided_distance")
                    norm_qty = qty if qty else Decimal('0.00')
                else:
                    # Missing distance, perform haversine calculations on airport codes
                    if not origin or not destination:
                        flags.append("missing_airport_codes_for_distance_calc")
                    else:
                        coords1 = AIRPORT_COORDINATES.get(origin)
                        coords2 = AIRPORT_COORDINATES.get(destination)
                        
                        if not coords1 or not coords2:
                            flags.append("unknown_airport_code_distance_calc_failed")
                            if not coords1:
                                flags.append(f"unrecognized_origin_airport_{origin}")
                            if not coords2:
                                flags.append(f"unrecognized_destination_airport_{destination}")
                        else:
                            distance_calc = calculate_haversine(coords1[0], coords1[1], coords2[0], coords2[1])
                            norm_qty = Decimal(f"{distance_calc:.2f}")
                            qty = norm_qty
                            flags.append("distance_inferred_from_airport_geocodes")
                
                if norm_qty > 15000:
                    flags.append("extreme_flight_distance_flight_verification_required")
                elif norm_qty < 50:
                    flags.append("implausible_short_flight_distance")
                    
                unit = 'km'
                norm_unit = 'km'
                act_type = 'flight_travel'
                
            elif trip_type == 'hotel':
                nights = row.get('hotel_nights')
                qty = clean_numeric(nights)
                unit = 'nights'
                norm_unit = 'room_nights'
                
                if qty is None or qty <= 0:
                    qty = Decimal('0.00')
                    flags.append("invalid_hotel_nights")
                elif qty > 30:
                    flags.append("unusually_long_hotel_stay")
                
                norm_qty = qty
                act_type = 'hotel_accommodation'
                
            elif trip_type == 'ground':
                mode = row.get('transport_mode', '').strip().lower()
                dist = row.get('distance_km')
                qty = clean_numeric(dist)
                unit = 'km'
                norm_unit = 'km'
                
                if qty is None or qty <= 0:
                    qty = Decimal('0.00')
                    flags.append("invalid_ground_distance")
                norm_qty = qty
                act_type = f"ground_{mode if mode else 'general'}_travel"
                
            else:
                flags.append("unknown_travel_trip_type")
                
            status = 'flagged' if flags and any(
                "failed" in f or "invalid" in f or "unrecognized" in f or "unsupported" in f 
                for f in flags
            ) else 'pending'
            
            # Let's flag any record with anomalies for review anyway to be safe
            if flags:
                status = 'flagged'
                
            if status == 'flagged':
                flagged_rows += 1
                
            NormalizedRecord.objects.create(
                company=batch.company,
                raw_record=raw_record,
                upload_batch=batch,
                source_type='TRAVEL_API',
                scope_category='Scope 3',
                activity_type=act_type,
                activity_date=act_date,
                quantity=qty,
                unit=unit,
                normalized_quantity=norm_qty,
                normalized_unit=norm_unit,
                status=status,
                validation_flags=flags
            )
            
            raw_record.status = 'normalized'
            raw_record.save()
            
        batch.summary = {
            'total_rows': total_rows,
            'flagged_rows': flagged_rows,
            'processed_rows': total_rows,
            'source': 'TRAVEL_API'
        }
        return True
