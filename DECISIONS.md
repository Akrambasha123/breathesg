# Architecture & Ingestion Decisions

This document outlines key technical decisions, resolutions of business logic ambiguities, and justifications for the scopes chosen during the engineering of this platform.

---

## 1. Tenancy Architecture

### Dual Isolation Level
We chose a **Single Database, Multi-Tenant Shared Schema** model:
- **How it works**: A primary `Company` model acts as the root tenant. All operational models (`User`, `DataSource`, `UploadBatch`, `NormalizedRecord`, `AuditLog`) maintain a direct foreign key to `Company`.
- **Enforcement**: In Django, we implement custom view filters and scoping to automatically enforce a `company` constraint based on the simulated tenant headers. This prevents cross-tenant data leaks at the database query level, providing a solid foundation for SaaS platforms without the overhead of maintaining dynamic PostgreSQL schemas or spinning up multiple containerized database instances.

---

## 2. Ingestion & Normalization Design

### German Decimal & Mixed Formatting
*SAP CSV files* generated from German ERP installations represent numbers using comma decimal separators and point thousands separators (e.g., `1.500,50` to mean `1500.50`). Standard Python float casting of such values throws an exception.
- **Decision**: We created a unified parsing function `clean_numeric(value)` that strips thousands separators, replaces commas with points, and converts to a float. If the conversion fails, the row is flagged rather than crashing the batch pipeline.
- **Mixed Date Handling**: The pipeline attempts multiple parser patterns sequentially (e.g., `%d.%m.%Y`, `%Y-%m-%d`, `%m/%d/%Y`). If no format matches, the system stores the date as a flagged null and maps the raw date value to `validation_flags` for human review.

### Utility Billing Gaps & Overlaps
Utility bills do not respect neat calendar months (e.g., a bill might cover April 12th to May 11th).
- **Decisions**:
  - **Normalization Date**: The normalized `activity_date` is assigned as the `billing_end_date` of the statement.
  - **Period Gaps**: The pipeline fetches prior batches for the same `meter_id` and checks if the new `billing_start_date` is greater than `prior_billing_end_date + 1 day`. If a gap is found, the record is flagged.
  - **Overlaps**: If `billing_start_date` is less than `prior_billing_end_date`, an overlap error is flagged.
  - **Spike Detection**: Calculates daily usage average `kWh / billing_days`. If it exceeds $5\times$ the historical daily usage average for that specific meter, the row is marked as `flagged` with a `"consumption_spike"` tag.

### Travel Distance Inference & Mock Geolocation
Corporate travel CSVs or APIs from Concur/Navan often have incomplete distance metrics for short or long-haul flights.
- **Decision**: We seeded a dictionary of coordinate lookups for major global airports:
  - `JFK` (New York): (40.6413, -73.7781)
  - `LAX` (Los Angeles): (33.9416, -118.4085)
  - `SFO` (San Francisco): (37.6213, -122.3790)
  - `LHR` (London): (51.4700, -0.4543)
  - `CDG` (Paris): (49.0097, 2.5479)
  - `SIN` (Singapore): (1.3644, 103.9915)
  - `SYD` (Sydney): (-33.9461, 151.1772)
  - `HND` (Tokyo): (35.5494, 139.7798)
- **Distance Calculation**: If `distance_km` is missing, we calculate the Great-Circle distance using the **Haversine formula**:
  $$d = 2r \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta \phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta \lambda}{2}\right)}\right)$$
  Where $r = 6371\text{ km}$. If an unknown airport code is parsed, the system flags the record as `"unknown_airport_code"`.

---

## 3. Workflow & Locking Immutability

### Immutability Implementation
Once a `NormalizedRecord` is set to `locked`, any attempts to call `.save()` or `.delete()` at the Django ORM level are blocked by raising a `ValidationError`. This guarantees that once data is finalized for audit by an enterprise manager:
- It cannot be modified by standard users or APIs.
- The record remains frozen in time.
- The corresponding `RawRecord` is also frozen.

### Audit Diff Engine
Manual corrections to `NormalizedRecord` write a detailed audit history. Instead of storing general action strings, our custom `.save()` override tracks modified fields by comparing the model's loaded database state with its unsaved memory state. It saves a precise field-level diff (`old_value` vs `new_value`) in `AuditLog`.

---

## 4. Subsets Handled vs. Ignored (Scope Matrix)

As required by the assignment, we explicitly define the boundaries of our prototype:

### 4.1 SAP Ingestion
* **Subsets Handled**: Flat CSV exports representing material ledger reports (like MB51/ME2N transactions) containing procurement items, quantities, units, dates, and plant scoping codes.
* **Subsets Ignored**: Live OData syncing, custom ABAP RFC connections, or real-time IDoc listener daemons. These require direct corporate SAP server connectivity, which typically involves lengthy corporate security reviews and custom ABAP scripting.

### 4.2 Utility Electricity Ingestion
* **Subsets Handled**: Portal CSV billing registers downloaded by facilities managers, containing meter IDs, billing period dates, and aggregate consumption (kWh).
* **Subsets Ignored**: PDF statement optical character recognition (OCR) pipelines. Building commercial-grade OCR is error-prone due to invoice layout drifts across utilities. We also ignored real-time smart meter APIs (like Green Button) due to OIDC authentication complexities.

### 4.3 Corporate Travel Ingestion
* **Subsets Handled**: Mock Concur/Navan API JSON structures covering flight legs, hotel night accommodation, and ground transport modes.
* **Subsets Ignored**: Ticketing workflow approvals, corporate credit card billing matching, and expense reimbursement systems.

---

## 5. What We Would Ask the PM

If we were pair programming with the Product Manager, these are the three high-impact questions we would ask:
1. **Plant Code Directory**: *"Do we have access to the master plant-to-facility mapping sheet? Plant code US02 means nothing without mapping it to a specific physical location to get localized Scope 1 combustion indices."*
2. **Pro-Rata Calendar Allocation**: *"Should we automatically pro-rate/distribute utility billing usage across calendar months? If a bill covers April 15th to May 14th, standard verifiers like carbon reports to allocate the usage pro-rata daily across April and May rather than bulk allocating to the billing end date."*
3. **Audit Rollbacks**: *"If an external auditor rejects a sealed, locked batch during verification, do we allow standard analysts to unlock it, or does that action require a manager-level digital key override and a high-priority warning log?"*
