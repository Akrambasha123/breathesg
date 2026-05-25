# BreatheSG: Enterprise ESG Data Ingestion & Audit Workflow Platform

A technically rigorous, multi-tenant SaaS prototype designed to ingest heterogeneous operational data from enterprise clients, normalize it into standard greenhouse gas activity datasets, automatically validate anomalies, and provide an immutable, auditable review console for compliance analysts.

**Live Production URL**: [https://breathesg.vercel.app/](https://breathesg.vercel.app/)

---

## 1. Technical Problem & Architecture Strategy

Enterprise sustainability metrics are plagued by messy, disconnected operational records. Sustainability leads frequently receive data in completely different shapes: manual SAP ERP material document dumps, utility billing portal exports, and travel management platform API logs. 

BreatheSG solves this by maintaining a strict **Dual-Storage Architecture** with a row-level **Multi-Tenancy shared database model**:

```
Heterogeneous Inputs (CSV/JSON)
      ↓
[ Ingestion Pipeline ] ── (Validations: Overlaps, Spikes, Geocodes)
      ↓
  ┌──────────────┐
  │  Multi-Tenant│
  │  MySQL/Post  │
  │  database    │
  └──────┬───────┘
         ├────────────────────────────────────────┐
         ↓                                        ↓
[ RawRecord (Preserved Truth) ]          [ NormalizedRecord (Target Schema) ]
         │                                        │
         └───────────────────┬────────────────────┘
                             ↓
             [ Analyst Review Dashboard ]
                             │
                             ├─────────── Override & Re-validate
                             ↓
                     [ Approved Status ]
                             │
                             ↓ (Locked at ORM level)
                       [ Audit Locked ]
```

### 1.1 Key Architecture Safeguards
1. **Raw Payload Preservation (`RawRecord`)**: The original row is preserved as an immutable JSON payload exactly as received (including German header strings, messy commas, etc.) to guarantee audit lineage.
2. **Standardized ESG Activity Target (`NormalizedRecord`)**: Unifies inputs to standardized metrics (combustion Liters, electricity kWh, travel passenger-kilometers) scoped under standard Scope 1, 2, and 3 classifications.
3. **ORM-Enforced Immutability**: Once a normalized record's status transitions to `locked` under manager sign-off, custom database overrides inside model `.save()` and `.delete()` methods raise a `ValidationError` to block any API or system mutations, freezing the audit record in time.
4. **Append-Only Fine-Grained Auditing (`AuditLog`)**: Manual analyst overrides compute a field-level value difference in a transaction, writing an explicit diff log (`old_value` vs `new_value`) to preserve data lineage.

---

## 2. Ingestion & Normalization Specifications

BreatheSG implements three realistic, robust ingestion engines:

### 2.1 SAP Fuel & Procurement Ingestion (CSV)
Sustainability teams typically export SAP transactions like **MB51** (Material Documents List) containing plant-scoped fuel purchases.
* **German Decimal Cleaning**: Custom parser routines clean European number notations representing points as thousands and commas as decimals (e.g. `"10.500,50"` &rarr; `10500.50`) and sequential datetime regex checks resolve `DD.MM.YYYY` date drifting.
* **Unit Standardization**: Standardizes spelling variations (e.g., `L`, `LIT`, `LITER` &rarr; `L`) and pro-rates gallons to liters (`1 US Gal = 3.78541 L`).
* **Plant Code Validation**: Flags plant identifiers that fail to match standard 4-character uppercase formats.

### 2.2 Utility Electricity Ingestion (CSV)
Ingests portal statement ledger exports from facilities managers.
* **Gap & Overlap Tracking**: Compares sequential statements for the same `meter_id`. Flags records if a new invoice's `billing_start_date` overlaps with the prior invoice or leaves a gap.
* **Consumption Spike Detection**: Compares aggregate bill usage with the meter's past 5 bills. Calculates average daily consumption (`kWh / billing_days`) and flags the row as a `consumption_spike` if it exceeds the historical baseline by $5\times$.

### 2.3 Corporate Travel Ingestion (JSON API)
Simulates expense API integrations (like Concur/Navan), sorting items into Scope 3 Categories (flights, hotels, ground transport).
* **Missing Distance Fallback (Haversine Formula)**: Flight booking data frequently omits distance metrics. If `distance_km` is null, BreatheSG fetches coordinate lookups for major global airport codes (JFK, LAX, SFO, LHR, CDG, SIN, SYD, HND) and computes the Great-Circle distance using the **Haversine formula**:
  $$d = 2r \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta \phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta \lambda}{2}\right)}\right)$$
  Where $r = 6371\text{ km}$. Unrecognized codes trigger an `unknown_airport_code` anomaly flag.

---

## 3. Platform Interface & Console

### 3.1 Tenancy Sandbox Gateway
Allows simulating logins across different client company tenancies and security roles (`analyst`, `manager`, `auditor`).

![Login Gateway Screen](/screenshots/login_screen.png)

### 3.2 Ingestion Hub
Features file upload fields, dynamic pipeline logs, and built-in mock datasets that populate German SAP decimal mismatches, billing gaps, and travel fallbacks in one click.

![Ingestion Hub](/screenshots/upload_screen.png)

### 3.3 Analyst Review Workspace
Exposes the core auditor grid where analysts filter anomalies, review side-by-side raw/normalized structures, make manual override corrections (re-triggering validations), add reasoning sign-offs, and lock files.

![Auditor Dashboard](/screenshots/review_screen.png)

---

## 4. Local Bootstrapping & Setup

### Prerequisites
* Python 3.12+
* Node.js v20+
* MySQL (Default local client) or PostgreSQL database server active

### 4.1 Backend Setup (Django + DRF)
```bash
# 1. Clone your repository
git clone YOUR_REPO_URL
cd breathe-esg-prototype/backend

# 2. Configure Virtual Environment & Install requirements
python3 -m venv venv
source venv/bin/activate  # On Windows use `venv\Scripts\activate`
pip install -r requirements.txt

# 3. Configure Database connection
# Note: Defaults to local MySQL (breathesg database, user: root, password: root123).
# If a DATABASE_URL env variable is present, it will automatically connect to PostgreSQL!

# 4. Generate & Run migrations
python manage.py migrate

# 5. Start the local server
python manage.py runserver
```
The API is active at [http://127.0.0.1:8000/](http://127.0.0.1:8000/).

### 4.2 Frontend Setup (Vite + React)
```bash
# 1. Navigate to the frontend directory
cd ../frontend

# 2. Install dependencies
npm install

# 3. Start development server
npm run dev
```
The client app is active at [http://localhost:5173/](http://localhost:5173/).

---

## 5. Automated Verification Tests

A comprehensive unit test suite verifies cleaning, haversine geodistances, overlapping utility statement dates, and ORM lock protections. Execute it at any time using:
```bash
cd backend
../venv/bin/python3 manage.py test
```

---

## 6. Deployed Infrastructure Specifications
* **Frontend**: Hosted on **Vercel** with automatic deployment bindings.
* **Backend**: Hosted on **Render** (WSGI web runner mapped using Gunicorn inside a WhiteNoise static file compressor environment).
* **Database**: Hosted on **Neon Serverless PostgreSQL**.
* **API Routing**: Configured with a dynamic endpoint routing fallback (`import.meta.env.VITE_API_URL` to local dev).
