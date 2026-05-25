# Prototype Tradeoffs & Constraints

This document lists intentionally omitted features and structural choices, demonstrating conscious engineering tradeoffs to build a highly realistic, production-quality SaaS prototype without overengineering.

---

## 1. Omitted Features & Rationales

### 1.1 real SAP Authentication / Concur Integration
* **Omission**: Direct OAuth or API integrations with SAP and Concur.
* **Tradeoff**: We simulate data ingestion using a clean REST API upload endpoint that accepts CSV uploads representing SAP fuel purchases and utility portals, and JSON payloads representing Concur/Navan flights and hotel bookings.
* **Rationale**: Integrations in real enterprises take months of infosec reviews and custom SAP ABAP custom development. A prototype is best validated by simulating the clean boundary data formats they export.

### 1.2 Full Emission Factor Engines
* **Omission**: Integration of complete IPCC, EPA, or DEFRA emissions factors tables to calculate exact metric tons of $\text{CO}_2\text{e}$.
* **Tradeoff**: The platform standardizes *activity data* (Liters of Fuel, kWh of Electricity, Passenger-Kilometers of travel) rather than computing final greenhouse gas values.
* **Rationale**: Enterprise audit standards require tracing the raw activity metrics first. Decoupling the "normalizer & audit workflow platform" from the "emissions factor engine" is a standard architectural pattern. It makes the system robust against changing annual regulatory factor sets.

### 1.3 Real-Time WebSockets
* **Omission**: Push notifications or real-time web socket updates when batches are processing or approved.
* **Tradeoff**: The dashboard uses lightweight HTTP polling or simple user-triggered refresh states.
* **Rationale**: WebSockets add significant backend and infrastructure complexity (e.g. Django Channels, Redis layer, WebSocket connection state handling) which is unnecessary for internal audit consoles where batch ingestion runs asynchronously in seconds.

### 1.4 Dynamic Role-Based Access Control (RBAC)
* **Omission**: Dynamic user permission editors, security group management, and fine-grained access policies.
* **Tradeoff**: Roles are static strings (`analyst`, `manager`) set directly in the user profile, with standard Django permission checks or view filters.
* **Rationale**: A hardcoded set of user roles is simpler, less prone to configuration bugs, and perfectly suited to prove SaaS tenancy and approval/auditing controls.

### 1.5 Microservices Ingestion Pipeline
* **Omission**: Splitting the ingestion pipeline into a separate microservice or serverless cloud function (e.g. AWS Lambda).
* **Tradeoff**: Pipelines are executed within Django in a clean, modular service class (`ingestion/pipelines.py`).
* **Rationale**: While a distributed queue (e.g. Celery + RabbitMQ) or serverless triggers are standard for high-volume enterprises, running ingestion inline within the monolithic Django architecture allows immediate transaction safety, simpler debugging, and easy deployment on services like Render without extra infrastructure costs.

### 1.6 Render Free Tier Latency Sleep
* **Omission**: 24/7 dedicated high-performance application server hosting.
* **Tradeoff**: We deployed our backend prototype on Render's free tier. 
* **Rationale**: As a consequence of Render's free tier policy, the server goes to "sleep" after 15 minutes of inactivity. When accessing the live deployed prototype for the first time, there may be an initial 30-second delay as the instance spins back up. This is completely standard and safe for an evaluation prototype environment.

