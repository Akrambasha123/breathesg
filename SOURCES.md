# Research on Data Sources & Formats

This document explains our research on realistic enterprise formats for SAP, utility, and travel platforms, why our simulated mock data accurately represents real-world messy corporate data, and what would break in a real-world production deployment.

---

## 1. SAP Fuel & Procurement Data

### 1.1 Real-World Messiness & Research
Sustainability teams in multinational enterprises rarely get a clean API connection directly into SAP S/4HANA core accounting. Instead, procurement teams manually run SAP transactions like **MB51** (Material Documents List) or **ME2N** (Purchase Orders by PO Number) and export the grid to a CSV file.
* **Inconsistent Units**: Because procurement agents in different countries enter data local to their suppliers, the units vary widely. You might see `L` for liters in Germany, `GAL` or `GL` for gallons in the US, and `m3` for natural gas in France.
* **German Locale Glitches**: Standard SAP exports in Europe run under the German user locale. This causes dates to be exported as `DD.MM.YYYY` instead of ISO format, and numeric values to use a dot for thousands and a comma for decimals (e.g. `10.500,75`).
* **Plant Codes**: SAP scopes physical locations by a 4-character uppercase alphanumeric code (e.g. `DE01` for Frankfurt main assembly, `US02` for Texas warehouse, `IN03` for Pune plant). These codes must be mapped to geographical sites to determine localized Scope 1 emission indices.

### 1.2 Why Our Mock SAP Data is Realistic
Our mock SAP CSV simulates these exact quirks:
* German headers: `Material`, `Plant`, `Menge` (Quantity), `Einheit` (Unit), `Datum` (Date), `Cost_Center`, `Vendor`.
* A row with standard dates (`2026-05-20`) alongside German formatted dates (`25.05.2026`).
* Quantities written as strings with mixed separators (e.g., `"1.200,50"` and `"500.25"`).
* Mixed units: `"L"`, `"LIT"`, `"GAL"`, `"m3"`.

### 1.3 What Would Break in a Real Production Deployment
1. **Character Encoding Shifts**: SAP exports frequently default to `UTF-16LE` or `ISO-8859-1` with Byte Order Marks (BOM) instead of standard clean `UTF-8`. Standard python CSV readers will crash when encountering BOM characters or non-ascii German umlauts (e.g. `Heizöl`, `Einheit`).
2. **Dynamic Transaction Layout Customization**: SAP power-users frequently customize layout profiles in the transaction window before export. If an analyst modifies the export layout (e.g., changes columns order or changes header naming from `Plant` to `Werks`), a rigid normalizer will fail. We need a robust dynamic schema-mapping layer.

---

## 2. Utility Electricity Data

### 2.1 Real-World Messiness & Research
Most corporate sustainability offices gather electricity data from utility portals (like PG&E, National Grid, or Engie) where they download billing ledger exports.
* **Billing Period Drift**: Unlike calendar months, billing cycles are based on manual or smart meter read dates. An invoice might run from January 14 to February 12. Normalizing these requires allocating usage across days or standardizing to the end date.
* **Overlaps & Gaps**: Manual tracking is prone to errors. Sustainability teams frequently upload overlapping statements (paying twice for the same meter period) or miss an entire billing cycle (causing a data gap).
* **Usage Spikes**: Faulty meters or heating system glitches lead to extreme consumption spikes. Identifying these early is critical for audit accuracy.

### 2.2 Why Our Mock Utility Data is Realistic
Our utility CSV contains:
* Columns: `meter_id`, `billing_start_date`, `billing_end_date`, `kwh_usage`, `tariff_type`, `demand_charge`.
* Overlapping invoice ranges for the same `meter_id` to test validation flags.
* Empty gaps between sequential periods for a specific meter.
* A massive, anomalous spike (e.g., $10\times$ baseline usage) to verify the automatic validation flagging system.

### 2.3 What Would Break in a Real Production Deployment
1. **Split Billing & Tariffs**: Utilities often split usage into multiple line items within the same invoice (e.g., peak vs off-peak consumption, green tariff premiums). If an analyst uploads a ledger where the same meter appears in multiple rows for the same billing period, standard gap/overlap logic will trigger a false overlap error.
2. **Estimated Readings & Corrections**: If the utility fails to read the physical meter, they print an "Estimated" bill and perform a "Correction" in the subsequent billing cycle. This correction can result in a negative usage adjustment row in the portal exports, triggering negative kWh alerts.

---

## 3. Corporate Travel Data

### 3.1 Real-World Messiness & Research
Modern enterprises ingest travel data from corporate travel management software APIs like Concur, Navan (formerly TripActions), or Egencia. These platforms provide structured JSON or CSV data.
* **Scope 3 Category 6 Isolation**: Corporate travel represents Scope 3 emissions. Travel items must be parsed into:
  - Flight segments (air travel).
  - Hotel nights (accommodation).
  - Ground transport (rental cars, trains, taxis).
* **Missing Distance Data**: Due to user booking entries, flight distances in kilometers are frequently omitted. However, origin and destination airport IATA codes (e.g., `JFK`, `LHR`, `SIN`) are always present.
* **Validation Anomalies**: An employee entering an invalid airport code or booking a hotel stay that spans several months due to a typo.

### 3.2 Why Our Mock Travel Data is Realistic
Our Concur JSON payload simulates:
* Elements representing flights, hotels, and ground transport.
* Flight records with missing `distance_km` but containing `origin_airport` and `destination_airport` codes to trigger the great-circle haversine fallback engine.
* Hotel records with negative or extreme nights to verify validator safety rules.

### 3.3 What Would Break in a Real Production Deployment
1. **Stopover Flight Legs**: Flight API payloads represent multi-leg flights (e.g., SFO -> LHR -> SIN) as separate segments or as a single line item with stopover attributes. Our basic origin-destination Haversine calculation will compute the straight line between SFO and SIN, significantly underestimating the actual flight distance (and emissions).
2. **Airport Code Collisions**: Standardizing to IATA 3-letter codes assumes all travel uses registered commercial airports. Charter flights or private regional airfields might use ICAO 4-letter codes or custom strings, causing geocode lookup failures.
