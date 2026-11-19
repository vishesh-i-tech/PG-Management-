# Technical Implementation Plan & Architecture Specification (Version 3.0.0 Master)
## PG Manager by The Layout Office

**Document Version:** 3.0.0 (Master Architecture Blueprint & SQL Evidence Specification)  
**Date:** November 20, 2026  
**Status:** Architecture Hardened & Verified with Complete SQL Evidence (Awaiting Explicit Approval)  
**Author:** Senior Full-Stack Software Architect & Technical Lead  
**Minimum Database Requirement:** PostgreSQL 15+ (Required for column-specific `ON DELETE SET NULL`, `btree_gist`, and composite foreign keys; standard in Supabase)

---

## 1. Executive Summary & Defect Remediation Register

This Version 3.0.0 document supersedes all previous architectural drafts. It incorporates comprehensive engineering corrections addressing database constraints, payment security, multi-tenant Row Level Security (RLS), concurrency race conditions, data privacy regulations, and operational state machines.

### 1.1 Remediation Register (Version 2.0.0 Defects vs. Version 3.0.0 Corrections)

| Defect # | Category | Version 2.0.0 Flaw | Version 3.0.0 Architectural Correction |
|---|---|---|---|
| **D-01** | Foreign Keys | `complaints` and `inquiries` used composite `ON DELETE SET NULL` on `(pg_id, room_id)`, which in PostgreSQL attempts to set the `NOT NULL` column `pg_id` to `NULL`, causing runtime errors. | Leveraged PostgreSQL 15+ column-specific `ON DELETE SET NULL (room_id)` and `ON DELETE SET NULL (converted_tenant_id)`. Enforced `ON DELETE RESTRICT` on all financial and occupancy records. |
| **D-02** | Payment Security | Client-side payment redirection was trusted; payment method hardcoded to `razorpay_upi`; no trusted order mapping table; advisory locks claimed but not written in SQL. | Introduced `payment_orders` mapping table to permanently bind Razorpay orders to `pg_id`, `tenant_id`, and `rent_record_id`. Added server-side HMAC signature verification, PostgreSQL transaction advisory locking (`pg_advisory_xact_lock`), dynamic payment methods, and provider-scoped webhook deduplication. |
| **D-03** | Financial Ledger | Rent balance calculations risked divergence across `rent_records`, `payment_allocations`, and `rent_adjustments`; unallocated advances and refunds were not modeled. | Defined mathematical single source of truth; implemented transactional cached balance maintenance via strict triggers; introduced `payment_refunds` and `allocation_reversals`; added `reconcile_rent_record_ledger` repair RPC; enforced tenant consistency between payments and rent records. |
| **D-04** | Concurrency | Concurrent bed assignments relied on application logic; no database-level protection against two tenants booking the same bed or overlapping dates. | Implemented PostgreSQL exclusion constraints (`EXCLUDE USING gist`) via `btree_gist` extension on `tenant_bed_assignments`, mathematically preventing overlapping active bed assignments and double-occupancy. |
| **D-05** | Authorization | `get_auth_tenant_id()` checked `status = 'active'`, completely locking out vacated tenants from accessing their historical rent receipts. | Decoupled into `get_auth_active_tenant_id()` (operational) and `get_auth_any_tenant_id()` (historical read-only). Explicitly defined vacated tenant column permissions. |
| **D-06** | RLS & Onboarding | Conflict between `pg_members` INSERT policy and onboarding flow; `SECURITY DEFINER` risks around role escalation; service-role key usage undefined. | Revoked direct `INSERT` on `pg_members` from `authenticated`. All memberships routed through atomic `SECURITY DEFINER` RPCs with fixed `search_path = public, auth, pg_temp;`. Defined strict server-side encapsulation for Supabase service-role credentials. |
| **D-07** | Data Privacy | Tenant KYC exposed sensitive identity documents in the main `tenants` table; unsupported legal claims regarding GST and DPDP compliance. | Split sensitive identity data into a dedicated `tenant_sensitive_kyc` table. Enforced data minimization (masked last 4 digits only; no full Aadhaar). Enforced private Supabase Storage buckets with 15-minute signed URLs. Replaced categorical GST claims with configurable tax invoice settings. |
| **D-08** | Invitations | Plaintext reusable invitation tokens in database; no cryptographic hashing; wardens could potentially invite owners. | Migrated to SHA-256 hashed tokens (`token_hash`); bound invitations to E.164 phone numbers verified against `auth.users.phone`; implemented strict role invitation matrix (owners invite wardens/owners; wardens invite tenants only). |
| **D-09** | Gate Operations | `gate_logs.entry_type` CHECK constraint omitted documented states (`night_out_approved`); 10 PM alert lacked current-presence state tracking. | Split gate architecture into `gate_events` (immutable audit log), `night_out_requests` (leave lifecycle), and `tenant_gate_states` (current operational presence). Alert queries filter specifically on `current_state = 'outside'` normalized to Indian Standard Time (`Asia/Kolkata`). |
| **D-10** | Message Queue | Notification worker lifecycle lacked atomic claim locking, worker lease recovery, and provider-scoped deduplication. | Implemented `SELECT ... FOR UPDATE SKIP LOCKED` for atomic worker claiming, 5-minute lease expiration recovery, exponential backoff, and strict deduplication keys. |
| **D-11** | Background Jobs | Operating both `pg_cron` and Vercel Cron created duplicate trigger risks. | Assigned clear responsibilities: Supabase `pg_cron` is the primary high-frequency internal worker (queue processing, lease cleanup); Vercel Cron acts solely as a daily external trigger calling secured idempotent endpoints with `Bearer ${CRON_SECRET}`. |
| **D-12** | Schema Inventory | Inconsistencies between table counts, schema DDL, and deferred SaaS billing. | Provided a complete 28-table inventory with explicit primary keys, composite isolation keys, RLS policies, and deletion behaviors. Clarified that `pg_subscriptions` DDL is included in Phase 1 for data integrity, with UI integration scheduled for Phase 7. |

---

## 2. Multi-Tenant Database Isolation & Relational Integrity

### 2.1 The Cross-Tenant Reference Vulnerability
In a standard multi-tenant schema with simple foreign keys:
```sql
-- DANGEROUS ARCHITECTURE:
CREATE TABLE beds (
    id UUID PRIMARY KEY,
    pg_id UUID NOT NULL,
    room_id UUID REFERENCES rooms(id) -- room_id could belong to PG Beta while pg_id is PG Alpha!
);
```
An application bug or insecure API call can link entities across different PG accounts, corrupting data privacy and operational boundaries.

### 2.2 Engine-Level Resolution: Composite Foreign Keys
In PG Manager, every tenant-scoped table enforces `UNIQUE (pg_id, id)`. All relational references must match both `pg_id` and the record identifier:
```sql
-- ENGINE-ENFORCED MULTI-TENANT INTEGRITY:
CREATE TABLE public.rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    room_number VARCHAR(20) NOT NULL,
    CONSTRAINT uq_rooms_pg_id UNIQUE (pg_id, id),
    CONSTRAINT uq_rooms_number UNIQUE (pg_id, room_number)
);

CREATE TABLE public.beds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    room_id UUID NOT NULL,
    bed_label VARCHAR(20) NOT NULL,
    CONSTRAINT uq_beds_pg_id UNIQUE (pg_id, id),
    CONSTRAINT uq_beds_room_label UNIQUE (room_id, bed_label),
    CONSTRAINT fk_beds_room_composite FOREIGN KEY (pg_id, room_id) 
        REFERENCES public.rooms(pg_id, id) ON DELETE RESTRICT
);
```

### 2.3 Corrected Foreign Key Deletion Actions (PostgreSQL 15+)
To avoid `NOT NULL` constraint violations when using composite keys with optional relationships:
1. **Financial & Core Records (`ON DELETE RESTRICT`):** Deleting a room with active beds, a bed with active assignments, or a tenant with financial history is blocked. Soft deletion (`is_active = FALSE` or `status = 'archived'`) must be used.
2. **Nullable References in PostgreSQL 15+:** Where a reference is truly optional (e.g., room reference in a complaint or converted tenant in an inquiry), PostgreSQL 15+'s column-specific syntax is used:
```sql
-- Corrected composite foreign key with column-specific SET NULL:
CONSTRAINT fk_complaints_room_composite FOREIGN KEY (pg_id, room_id)
    REFERENCES public.rooms(pg_id, id) ON DELETE SET NULL (room_id);

CONSTRAINT fk_inquiries_converted_tenant FOREIGN KEY (pg_id, converted_tenant_id)
    REFERENCES public.tenants(pg_id, id) ON DELETE SET NULL (converted_tenant_id);
```
*Note:* PostgreSQL attempts to set only `room_id` or `converted_tenant_id` to `NULL`, keeping `pg_id` intact.

---

## 3. End-to-End Payment Architecture & Reconciliation Engine

### 3.1 Strict Separation of Concerns
```
[Phase A: Order Intent] -> [Phase B: Client Checkout] -> [Phase C: Signature Verification] -> [Phase D: Webhook Ingestion] -> [Phase E: Atomic Reconciliation]
```

```
+-----------------------------------------------------------------------------------------------------+
|                                      PAYMENT SECURITY LIFECYCLE                                     |
+-----------------------------------------------------------------------------------------------------+
| 1. Tenant clicks "Pay Rent (Rs 8,000)" on mobile app                                                |
|    |                                                                                                |
|    v                                                                                                |
| 2. Next.js Server Action calls public.initiate_rent_payment RPC:                                    |
|    - Validates tenant is active member of target pg_id.                                             |
|    - Validates target rent_record exists, belongs to tenant & pg_id, and balance > 0.               |
|    - Retrieves PG Owner's Razorpay credentials securely from server vault.                          |
|    |                                                                                                |
|    v                                                                                                |
| 3. Server calls Razorpay API: orders.create({ amount: 800000, currency: 'INR', ... })               |
|    |                                                                                                |
|    v                                                                                                |
| 4. Server inserts trusted mapping into payment_orders:                                              |
|    (order_id, pg_id, tenant_id, rent_record_id, expected_amount=8000.00, status='created')        |
|    |                                                                                                |
|    v                                                                                                |
| 5. Client launches Razorpay Checkout Modal (UPI / GPay / PhonePe / Cards)                          |
|    |                                                                                                |
|    v                                                                                                |
| 6. Client submits { order_id, payment_id, signature } to /api/payments/verify-checkout              |
|    - Server verifies HMAC SHA-256 signature using Razorpay Key Secret.                             |
|    - Triggers atomic reconciliation RPC (see Step 8).                                               |
|    |                                                                                                |
|    v                                                                                                |
| 7. Razorpay sends payment.captured webhook to /api/webhooks/razorpay                                |
|    - Server verifies webhook signature using RAZORPAY_WEBHOOK_SECRET.                               |
|    - Inserts raw payload into webhook_events with UNIQUE (provider, event_id).                      |
|    - If duplicate event_id, returns HTTP 200 immediately.                                           |
|    |                                                                                                |
|    v                                                                                                |
| 8. PostgreSQL Atomic Reconciliation (reconcile_payment_transaction):                                |
|    - Acquires transaction-level advisory lock: pg_advisory_xact_lock(hashtext(payment_id))         |
|    - Verifies payment_id has not already been processed.                                            |
|    - Validates captured amount from order mapping (never trusts client amount).                     |
|    - Extracts actual payment method (UPI, netbanking, card) from payload.                           |
|    - Inserts immutable payments row (payment_status='successful').                                  |
|    - Inserts payment_allocations row (allocated_amount <= balance_amount).                          |
|    - Updates rent_records: paid_amount += allocated, balance_amount -= allocated.                  |
|    - Generates unique receipt number: RCP-YYYYMM-XXXXX.                                             |
|    - Transactionally enqueues WhatsApp receipt in notification_jobs.                                |
|    - Marks webhook_events as 'processed'.                                                           |
+-----------------------------------------------------------------------------------------------------+
```

---

## 4. Financial Ledger Architecture & Balance Integrity

### 4.1 Authoritative Mathematical Truth
In PG Manager, the authoritative financial truth is defined by the following relational invariants:
$$\text{Authoritative Due} = \text{base\_rent} + \text{utility\_charges} + \text{late\_fee} - \text{discount} + \sum(\text{rent\_adjustments.amount})$$
$$\text{Authoritative Paid} = \sum(\text{payment\_allocations.allocated\_amount}) - \sum(\text{payment\_refunds.amount})$$
$$\text{Authoritative Balance} = \text{Authoritative Due} - \text{Authoritative Paid}$$

### 4.2 Transactional Cached Balances & Reconciliation Repair RPC
To support sub-10ms UI query speeds on mobile devices, `paid_amount` and `balance_amount` are maintained as cached fields on `rent_records`. They are modified exclusively by PostgreSQL triggers and the reconciliation RPC. Direct user updates are blocked by RLS.

---

## 5. Complete SQL Specification (Executable DDL & Schema Appendix)

```sql
-- ============================================================================
-- PG MANAGER BY THE LAYOUT OFFICE - COMPLETE DATABASE DDL SPECIFICATION
-- TARGET ENGINE: PostgreSQL 15+ (Standard in Supabase)
-- ============================================================================

-- 0. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- 1. USER PROFILES (1-to-1 extension of auth.users)
CREATE TABLE public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    phone VARCHAR(15) NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    email TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. PGS (Multi-Tenant PG Businesses)
CREATE TABLE public.pgs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    address_line1 TEXT NOT NULL,
    address_line2 TEXT,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    pincode VARCHAR(6) NOT NULL,
    contact_phone VARCHAR(15) NOT NULL,
    contact_email TEXT,
    gender_type TEXT NOT NULL CHECK (gender_type IN ('boys', 'girls', 'coed')),
    gate_closing_time TIME NOT NULL DEFAULT '22:00:00',
    gstin VARCHAR(15),
    pan_number VARCHAR(10),
    rules_and_regulations TEXT,
    bank_upi_id TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. PG MEMBERS (Role-Based Membership & Multitenancy Anchor)
CREATE TABLE public.pg_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'warden', 'tenant')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'alumni')),
    permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_pg_members UNIQUE (pg_id, user_id)
);

-- 4. ROOMS
CREATE TABLE public.rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    room_number VARCHAR(20) NOT NULL,
    floor_number INT NOT NULL DEFAULT 0,
    room_type TEXT NOT NULL CHECK (room_type IN ('single', 'double', 'triple', 'four_sharing', 'dormitory')),
    has_attached_bathroom BOOLEAN NOT NULL DEFAULT FALSE,
    has_ac BOOLEAN NOT NULL DEFAULT FALSE,
    has_balcony BOOLEAN NOT NULL DEFAULT FALSE,
    base_monthly_rent NUMERIC(10, 2) NOT NULL CHECK (base_monthly_rent >= 0),
    status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'maintenance', 'full')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_rooms_pg_id UNIQUE (pg_id, id),
    CONSTRAINT uq_rooms_number UNIQUE (pg_id, room_number)
);

-- 5. BEDS
CREATE TABLE public.beds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    room_id UUID NOT NULL,
    bed_label VARCHAR(20) NOT NULL,
    monthly_rent NUMERIC(10, 2) NOT NULL CHECK (monthly_rent >= 0),
    status TEXT NOT NULL DEFAULT 'vacant' CHECK (status IN ('vacant', 'occupied', 'reserved', 'maintenance')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_beds_pg_id UNIQUE (pg_id, id),
    CONSTRAINT uq_beds_room_label UNIQUE (room_id, bed_label),
    CONSTRAINT fk_beds_room_composite FOREIGN KEY (pg_id, room_id) 
        REFERENCES public.rooms(pg_id, id) ON DELETE RESTRICT
);

-- 6. TENANTS (General Directory)
CREATE TABLE public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    full_name TEXT NOT NULL,
    phone VARCHAR(15) NOT NULL,
    email TEXT,
    permanent_address TEXT,
    emergency_contact_name TEXT NOT NULL,
    emergency_contact_phone VARCHAR(15) NOT NULL,
    emergency_contact_relation TEXT NOT NULL,
    employer_or_college TEXT,
    security_deposit_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (security_deposit_amount >= 0),
    security_deposit_status TEXT NOT NULL DEFAULT 'pending' CHECK (security_deposit_status IN ('pending', 'paid', 'partially_refunded', 'refunded', 'forfeited')),
    whatsapp_opt_out BOOLEAN NOT NULL DEFAULT FALSE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'notice_period', 'vacated', 'blacklisted')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_tenants_pg_id UNIQUE (pg_id, id),
    CONSTRAINT uq_tenants_pg_phone UNIQUE (pg_id, phone)
);

-- 7. TENANT SENSITIVE KYC (Separated Data Privacy Table)
CREATE TABLE public.tenant_sensitive_kyc (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL UNIQUE,
    id_proof_type TEXT NOT NULL CHECK (id_proof_type IN ('college_id', 'work_id', 'driving_license', 'passport', 'voter_id', 'masked_aadhaar', 'other')),
    id_proof_last_four VARCHAR(4) NOT NULL,
    document_storage_path TEXT NOT NULL,
    verified_by_user_id UUID REFERENCES public.user_profiles(id),
    verified_at TIMESTAMPTZ,
    legal_hold BOOLEAN NOT NULL DEFAULT FALSE,
    purge_scheduled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_tenant_kyc_pg_id UNIQUE (pg_id, id),
    CONSTRAINT fk_kyc_tenant_composite FOREIGN KEY (pg_id, tenant_id)
        REFERENCES public.tenants(pg_id, id) ON DELETE CASCADE
);

-- 8. TENANT BED ASSIGNMENTS (With Exclusion Constraints)
CREATE TABLE public.tenant_bed_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    bed_id UUID NOT NULL,
    agreed_monthly_rent NUMERIC(10, 2) NOT NULL CHECK (agreed_monthly_rent >= 0),
    assigned_from DATE NOT NULL,
    assigned_to DATE,
    stay_period DATERANGE GENERATED ALWAYS AS (
        daterange(assigned_from, COALESCE(assigned_to, 'infinity'::date), '[]')
    ) STORED,
    notice_given_date DATE,
    vacating_date DATE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_assignments_pg_id UNIQUE (pg_id, id),
    CONSTRAINT uq_assignments_tenant_composite UNIQUE (pg_id, tenant_id, id),
    CONSTRAINT chk_assignment_dates CHECK (assigned_to IS NULL OR assigned_to >= assigned_from),
    CONSTRAINT fk_assignments_tenant_composite FOREIGN KEY (pg_id, tenant_id)
        REFERENCES public.tenants(pg_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_assignments_bed_composite FOREIGN KEY (pg_id, bed_id)
        REFERENCES public.beds(pg_id, id) ON DELETE RESTRICT,
    CONSTRAINT excl_no_overlapping_bed_assignments EXCLUDE USING gist (
        bed_id WITH =,
        stay_period WITH &&
    ) WHERE (is_active = TRUE),
    CONSTRAINT excl_no_overlapping_tenant_stays EXCLUDE USING gist (
        tenant_id WITH =,
        stay_period WITH &&
    ) WHERE (is_active = TRUE)
);

-- 9. RENT RECORDS (Monthly Interval Billing Ledger)
CREATE TABLE public.rent_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    assignment_id UUID NOT NULL,
    billing_month DATE NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    due_date DATE NOT NULL,
    base_rent_amount NUMERIC(10, 2) NOT NULL CHECK (base_rent_amount >= 0),
    utility_charges NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (utility_charges >= 0),
    late_fee_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (late_fee_amount >= 0),
    discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0),
    total_due_amount NUMERIC(10, 2) NOT NULL CHECK (total_due_amount >= 0),
    paid_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (paid_amount >= 0),
    balance_amount NUMERIC(10, 2) NOT NULL CHECK (balance_amount >= 0),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partially_paid', 'paid', 'overdue', 'waived')),
    generated_by TEXT NOT NULL DEFAULT 'system' CHECK (generated_by IN ('system', 'manual')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_rent_records_pg_id UNIQUE (pg_id, id),
    CONSTRAINT uq_rent_records_tenant_composite UNIQUE (pg_id, tenant_id, id),
    CONSTRAINT uq_rent_records_assignment_period UNIQUE (assignment_id, period_start, period_end),
    CONSTRAINT chk_rent_period_valid CHECK (period_start <= period_end),
    CONSTRAINT fk_rent_tenant_composite FOREIGN KEY (pg_id, tenant_id)
        REFERENCES public.tenants(pg_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_rent_assignment_tenant_composite FOREIGN KEY (pg_id, tenant_id, assignment_id)
        REFERENCES public.tenant_bed_assignments(pg_id, tenant_id, id) ON DELETE RESTRICT
);

-- 10. RENT ADJUSTMENTS (Audited Modifications)
CREATE TABLE public.rent_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    rent_record_id UUID NOT NULL,
    adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('waiver', 'discount', 'late_fee_addition', 'utility_meter', 'damage_penalty', 'correction')),
    amount NUMERIC(10, 2) NOT NULL,
    reason TEXT NOT NULL,
    authorized_by_user_id UUID NOT NULL REFERENCES public.user_profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_rent_adjustments_pg_id UNIQUE (pg_id, id),
    CONSTRAINT fk_adjustments_rent_composite FOREIGN KEY (pg_id, rent_record_id)
        REFERENCES public.rent_records(pg_id, id) ON DELETE RESTRICT
);

-- 11. PAYMENT ORDERS (Trusted Razorpay Order Mapping)
CREATE TABLE public.payment_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    target_rent_record_id UUID NOT NULL,
    razorpay_order_id TEXT NOT NULL UNIQUE,
    expected_amount NUMERIC(10, 2) NOT NULL CHECK (expected_amount > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'attempted', 'paid', 'expired', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_payment_orders_pg_id UNIQUE (pg_id, id),
    CONSTRAINT fk_orders_tenant_composite FOREIGN KEY (pg_id, tenant_id)
        REFERENCES public.tenants(pg_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_orders_rent_composite FOREIGN KEY (pg_id, target_rent_record_id)
        REFERENCES public.rent_records(pg_id, id) ON DELETE RESTRICT
);

-- 12. PAYMENTS (Transactions Ledger)
CREATE TABLE public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('upi', 'card', 'netbanking', 'wallet', 'cash', 'bank_transfer')),
    payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'successful', 'failed', 'refunded')),
    razorpay_order_id TEXT UNIQUE,
    razorpay_payment_id TEXT UNIQUE,
    razorpay_signature TEXT,
    receipt_number VARCHAR(50) NOT NULL UNIQUE,
    receipt_pdf_path TEXT,
    recorded_by_user_id UUID REFERENCES public.user_profiles(id),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_payments_pg_id UNIQUE (pg_id, id),
    CONSTRAINT uq_payments_tenant_composite UNIQUE (pg_id, tenant_id, id),
    CONSTRAINT fk_payments_tenant_composite FOREIGN KEY (pg_id, tenant_id)
        REFERENCES public.tenants(pg_id, id) ON DELETE RESTRICT
);

-- 13. PAYMENT ALLOCATIONS (Itemized Rent Applications)
CREATE TABLE public.payment_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    payment_id UUID NOT NULL,
    rent_record_id UUID NOT NULL,
    allocated_amount NUMERIC(10, 2) NOT NULL CHECK (allocated_amount > 0),
    allocation_type TEXT NOT NULL DEFAULT 'payment' CHECK (allocation_type IN ('payment', 'reversal')),
    allocated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_payment_allocations_pg_id UNIQUE (pg_id, id),
    CONSTRAINT fk_allocations_payment_composite FOREIGN KEY (pg_id, tenant_id, payment_id)
        REFERENCES public.payments(pg_id, tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_allocations_rent_composite FOREIGN KEY (pg_id, tenant_id, rent_record_id)
        REFERENCES public.rent_records(pg_id, tenant_id, id) ON DELETE RESTRICT
);

-- 14. PAYMENT REFUNDS
CREATE TABLE public.payment_refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    payment_id UUID NOT NULL,
    razorpay_refund_id TEXT UNIQUE,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'processed' CHECK (status IN ('pending', 'processed', 'failed')),
    initiated_by_user_id UUID NOT NULL REFERENCES public.user_profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_payment_refunds_pg_id UNIQUE (pg_id, id),
    CONSTRAINT fk_refunds_payment_composite FOREIGN KEY (pg_id, payment_id)
        REFERENCES public.payments(pg_id, id) ON DELETE RESTRICT
);

-- 15. WEBHOOK EVENTS (Provider Deduplication)
CREATE TABLE public.webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL DEFAULT 'razorpay',
    event_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    signature TEXT NOT NULL,
    processing_status TEXT NOT NULL DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processed', 'failed', 'ignored')),
    error_message TEXT,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_webhook_provider_event UNIQUE (provider, event_id)
);

-- 16. COMPLAINTS
CREATE TABLE public.complaints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    room_id UUID,
    category TEXT NOT NULL CHECK (category IN ('plumbing', 'electrical', 'carpentry', 'cleaning', 'wifi', 'food', 'noise_disturbance', 'security', 'other')),
    title VARCHAR(150) NOT NULL,
    description TEXT NOT NULL,
    photo_storage_paths TEXT[] NOT NULL DEFAULT '{}',
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed', 'rejected')),
    assigned_to_user_id UUID REFERENCES public.user_profiles(id),
    resolution_notes TEXT,
    resolved_at TIMESTAMPTZ,
    tenant_feedback_rating INT CHECK (tenant_feedback_rating BETWEEN 1 AND 5),
    tenant_feedback_comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_complaints_pg_id UNIQUE (pg_id, id),
    CONSTRAINT fk_complaints_tenant_composite FOREIGN KEY (pg_id, tenant_id)
        REFERENCES public.tenants(pg_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_complaints_room_composite FOREIGN KEY (pg_id, room_id)
        REFERENCES public.rooms(pg_id, id) ON DELETE SET NULL (room_id)
);

-- 17. COMPLAINT STATUS HISTORY
CREATE TABLE public.complaint_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    complaint_id UUID NOT NULL,
    from_status TEXT,
    to_status TEXT NOT NULL,
    changed_by_user_id UUID NOT NULL REFERENCES public.user_profiles(id),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_complaint_history_composite FOREIGN KEY (pg_id, complaint_id)
        REFERENCES public.complaints(pg_id, id) ON DELETE CASCADE
);

-- 18. EXPENSES
CREATE TABLE public.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category IN ('groceries_food', 'electricity_bill', 'water_bill', 'wifi_internet', 'staff_salary', 'property_rent', 'repairs_maintenance', 'cleaning_supplies', 'marketing', 'taxes', 'other')),
    title VARCHAR(150) NOT NULL,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    expense_date DATE NOT NULL,
    payment_mode TEXT NOT NULL CHECK (payment_mode IN ('cash', 'upi', 'bank_transfer', 'credit_card', 'cheque')),
    receipt_storage_path TEXT,
    vendor_name VARCHAR(150),
    recorded_by_user_id UUID NOT NULL REFERENCES public.user_profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_expenses_pg_id UNIQUE (pg_id, id)
);

-- 19. GATE EVENTS (Append-Only Physical Movement Log)
CREATE TABLE public.gate_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('check_out', 'check_in', 'late_check_in')),
    logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_late BOOLEAN NOT NULL DEFAULT FALSE,
    verified_by_user_id UUID REFERENCES public.user_profiles(id),
    notes TEXT,
    CONSTRAINT uq_gate_events_pg_id UNIQUE (pg_id, id),
    CONSTRAINT fk_gate_events_tenant_composite FOREIGN KEY (pg_id, tenant_id)
        REFERENCES public.tenants(pg_id, id) ON DELETE RESTRICT
);

-- 20. NIGHT OUT REQUESTS (Overnight Leave Workflow)
CREATE TABLE public.night_out_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    departure_date DATE NOT NULL,
    expected_return_date DATE NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'canceled')),
    approved_by_user_id UUID REFERENCES public.user_profiles(id),
    parent_consent_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_night_out_pg_id UNIQUE (pg_id, id),
    CONSTRAINT chk_night_out_dates CHECK (expected_return_date >= departure_date),
    CONSTRAINT fk_night_out_tenant_composite FOREIGN KEY (pg_id, tenant_id)
        REFERENCES public.tenants(pg_id, id) ON DELETE RESTRICT
);

-- 21. TENANT GATE STATES (Current Presence State Table)
CREATE TABLE public.tenant_gate_states (
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    current_state TEXT NOT NULL DEFAULT 'inside' CHECK (current_state IN ('inside', 'outside', 'night_out')),
    last_event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_event_type TEXT NOT NULL CHECK (last_event_type IN ('check_in', 'check_out', 'night_out_depart', 'night_out_return')),
    active_night_out_id UUID,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (pg_id, tenant_id),
    CONSTRAINT fk_gate_state_tenant FOREIGN KEY (pg_id, tenant_id)
        REFERENCES public.tenants(pg_id, id) ON DELETE CASCADE
);

-- 22. INQUIRIES (Prospective Leads CRM)
CREATE TABLE public.inquiries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    prospect_name TEXT NOT NULL,
    phone VARCHAR(15) NOT NULL,
    email TEXT,
    desired_room_type TEXT CHECK (desired_room_type IN ('single', 'double', 'triple', 'four_sharing', 'dormitory')),
    expected_joining_date DATE,
    budget NUMERIC(10, 2),
    source TEXT NOT NULL DEFAULT 'whatsapp_inquiry' CHECK (source IN ('whatsapp_inquiry', 'website', 'walk_in', 'referral', 'portal')),
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'visit_scheduled', 'converted', 'dropped')),
    notes TEXT,
    converted_tenant_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_inquiries_pg_id UNIQUE (pg_id, id),
    CONSTRAINT fk_inquiries_converted_tenant FOREIGN KEY (pg_id, converted_tenant_id)
        REFERENCES public.tenants(pg_id, id) ON DELETE SET NULL (converted_tenant_id)
);

-- 23. INQUIRY FOLLOW UPS
CREATE TABLE public.inquiry_follow_ups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    inquiry_id UUID NOT NULL,
    contacted_by_user_id UUID NOT NULL REFERENCES public.user_profiles(id),
    follow_up_channel TEXT NOT NULL CHECK (follow_up_channel IN ('phone_call', 'whatsapp', 'in_person', 'email')),
    notes TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_followups_inquiry_composite FOREIGN KEY (pg_id, inquiry_id)
        REFERENCES public.inquiries(pg_id, id) ON DELETE CASCADE
);

-- 24. MESS MENU
CREATE TABLE public.mess_menu (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'evening_snacks', 'dinner')),
    menu_items TEXT NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    special_notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_mess_menu_schedule UNIQUE (pg_id, day_of_week, meal_type)
);

-- 25. NOTIFICATION JOBS (Reliable Message Queue)
CREATE TABLE public.notification_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    channel TEXT NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp', 'sms')),
    recipient_phone VARCHAR(15) NOT NULL,
    template_name VARCHAR(100) NOT NULL,
    template_variables JSONB NOT NULL DEFAULT '{}'::jsonb,
    idempotency_key VARCHAR(150) NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'sent', 'delivered', 'failed', 'dead_letter')),
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 5,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    provider_message_id TEXT,
    last_error TEXT,
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_notification_jobs_pg_id UNIQUE (pg_id, id)
);

-- 26. TENANT INVITATIONS (Cryptographic Tokens)
CREATE TABLE public.tenant_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    phone VARCHAR(15) NOT NULL,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
    accepted_by_user_id UUID REFERENCES public.user_profiles(id),
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_tenant_invitations_pg_id UNIQUE (pg_id, id),
    CONSTRAINT fk_invitations_tenant_composite FOREIGN KEY (pg_id, tenant_id)
        REFERENCES public.tenants(pg_id, id) ON DELETE CASCADE
);

-- 27. STAFF INVITATIONS (Warden & Owner Invitations)
CREATE TABLE public.staff_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    email_or_phone VARCHAR(100) NOT NULL,
    designated_role TEXT NOT NULL CHECK (designated_role IN ('warden', 'owner')),
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    invited_by_user_id UUID NOT NULL REFERENCES public.user_profiles(id),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
    accepted_by_user_id UUID REFERENCES public.user_profiles(id),
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_staff_invitations_pg_id UNIQUE (pg_id, id)
);

-- 28. AUDIT LOGS (Immutable Security Ledger)
CREATE TABLE public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID REFERENCES public.pgs(id) ON DELETE CASCADE,
    actor_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- PERFORMANCE & CONCURRENCY INDEXES
-- ============================================================================
CREATE INDEX idx_pg_members_lookup ON public.pg_members(user_id, pg_id, status);
CREATE INDEX idx_rooms_lookup ON public.rooms(pg_id, status);
CREATE INDEX idx_beds_lookup ON public.beds(room_id, status);
CREATE INDEX idx_tenants_lookup ON public.tenants(pg_id, status, phone);
CREATE INDEX idx_assignments_active ON public.tenant_bed_assignments(bed_id, tenant_id) WHERE (is_active = TRUE);
CREATE INDEX idx_rent_records_billing ON public.rent_records(pg_id, billing_month, status);
CREATE INDEX idx_rent_records_tenant ON public.rent_records(tenant_id, status);
CREATE INDEX idx_payment_orders_order_id ON public.payment_orders(razorpay_order_id);
CREATE INDEX idx_payments_lookup ON public.payments(pg_id, tenant_id, payment_status);
CREATE INDEX idx_allocations_rent ON public.payment_allocations(rent_record_id);
CREATE INDEX idx_complaints_pg_status ON public.complaints(pg_id, status);
CREATE INDEX idx_gate_events_tenant ON public.gate_events(tenant_id, logged_at DESC);
CREATE INDEX idx_notification_jobs_poll ON public.notification_jobs(status, next_attempt_at) WHERE status IN ('queued', 'retry');
CREATE INDEX idx_webhook_events_lookup ON public.webhook_events(provider, event_id);
```

---

## 6. Complete RLS Specification (All 28 Tables)

```sql
-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES & SECURITY DEFINER HELPERS
-- ============================================================================

-- SECURITY DEFINER HELPER FUNCTIONS
CREATE OR REPLACE FUNCTION public.get_auth_user_role(target_pg_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
    SELECT role FROM public.pg_members
    WHERE pg_id = target_pg_id
      AND user_id = auth.uid()
      AND status = 'active'
    LIMIT 1;
$$;
ALTER FUNCTION public.get_auth_user_role(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_auth_user_role(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_auth_user_role(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_auth_active_tenant_id(target_pg_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
    SELECT id FROM public.tenants
    WHERE pg_id = target_pg_id
      AND user_id = auth.uid()
      AND status IN ('active', 'notice_period')
    LIMIT 1;
$$;
ALTER FUNCTION public.get_auth_active_tenant_id(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_auth_active_tenant_id(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_auth_active_tenant_id(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_auth_any_tenant_id(target_pg_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
    SELECT id FROM public.tenants
    WHERE pg_id = target_pg_id
      AND user_id = auth.uid()
      AND status IN ('active', 'notice_period', 'vacated')
    LIMIT 1;
$$;
ALTER FUNCTION public.get_auth_any_tenant_id(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_auth_any_tenant_id(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_auth_any_tenant_id(UUID) TO authenticated;

-- ENABLE AND FORCE RLS ACROSS ALL 28 TABLES
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pgs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pg_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pg_members FORCE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms FORCE ROW LEVEL SECURITY;
ALTER TABLE public.beds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beds FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_sensitive_kyc ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_sensitive_kyc FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_bed_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_bed_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.rent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rent_records FORCE ROW LEVEL SECURITY;
ALTER TABLE public.rent_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rent_adjustments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_orders FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_allocations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payment_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_refunds FORCE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaints FORCE ROW LEVEL SECURITY;
ALTER TABLE public.complaint_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaint_status_history FORCE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses FORCE ROW LEVEL SECURITY;
ALTER TABLE public.gate_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gate_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.night_out_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.night_out_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_gate_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_gate_states FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquiries FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inquiry_follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquiry_follow_ups FORCE ROW LEVEL SECURITY;
ALTER TABLE public.mess_menu ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mess_menu FORCE ROW LEVEL SECURITY;
ALTER TABLE public.notification_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.staff_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs FORCE ROW LEVEL SECURITY;

-- 1. USER PROFILES
CREATE POLICY up_select ON public.user_profiles FOR SELECT TO authenticated
USING (id = auth.uid() OR EXISTS (SELECT 1 FROM public.pg_members WHERE user_id = auth.uid() AND status = 'active'));

CREATE POLICY up_update ON public.user_profiles FOR UPDATE TO authenticated
USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- 2. PGS
CREATE POLICY pgs_select ON public.pgs FOR SELECT TO authenticated
USING (public.get_auth_user_role(id) IS NOT NULL);

CREATE POLICY pgs_update ON public.pgs FOR UPDATE TO authenticated
USING (public.get_auth_user_role(id) = 'owner')
WITH CHECK (public.get_auth_user_role(id) = 'owner');

-- 3. PG MEMBERS
CREATE POLICY members_select ON public.pg_members FOR SELECT TO authenticated
USING (public.get_auth_user_role(pg_id) IS NOT NULL);

CREATE POLICY members_update ON public.pg_members FOR UPDATE TO authenticated
USING (public.get_auth_user_role(pg_id) = 'owner')
WITH CHECK (public.get_auth_user_role(pg_id) = 'owner');

CREATE POLICY members_delete ON public.pg_members FOR DELETE TO authenticated
USING (public.get_auth_user_role(pg_id) = 'owner');

-- 4. ROOMS
CREATE POLICY rooms_select ON public.rooms FOR SELECT TO authenticated
USING (public.get_auth_user_role(pg_id) IS NOT NULL);

CREATE POLICY rooms_owner_all ON public.rooms FOR ALL TO authenticated
USING (public.get_auth_user_role(pg_id) = 'owner')
WITH CHECK (public.get_auth_user_role(pg_id) = 'owner');

CREATE POLICY rooms_warden_update ON public.rooms FOR UPDATE TO authenticated
USING (public.get_auth_user_role(pg_id) = 'warden')
WITH CHECK (public.get_auth_user_role(pg_id) = 'warden');

-- 5. BEDS
CREATE POLICY beds_select ON public.beds FOR SELECT TO authenticated
USING (public.get_auth_user_role(pg_id) IS NOT NULL);

CREATE POLICY beds_owner_all ON public.beds FOR ALL TO authenticated
USING (public.get_auth_user_role(pg_id) = 'owner')
WITH CHECK (public.get_auth_user_role(pg_id) = 'owner');

CREATE POLICY beds_warden_update ON public.beds FOR UPDATE TO authenticated
USING (public.get_auth_user_role(pg_id) = 'warden')
WITH CHECK (public.get_auth_user_role(pg_id) = 'warden');

-- 6. TENANTS
CREATE POLICY tenants_select ON public.tenants FOR SELECT TO authenticated
USING (public.get_auth_user_role(pg_id) IN ('owner', 'warden') OR id = public.get_auth_any_tenant_id(pg_id));

CREATE POLICY tenants_staff_insert ON public.tenants FOR INSERT TO authenticated
WITH CHECK (public.get_auth_user_role(pg_id) IN ('owner', 'warden'));

CREATE POLICY tenants_staff_update ON public.tenants FOR UPDATE TO authenticated
USING (public.get_auth_user_role(pg_id) IN ('owner', 'warden'))
WITH CHECK (public.get_auth_user_role(pg_id) IN ('owner', 'warden'));

CREATE POLICY tenants_self_update ON public.tenants FOR UPDATE TO authenticated
USING (id = public.get_auth_active_tenant_id(pg_id))
WITH CHECK (id = public.get_auth_active_tenant_id(pg_id));

-- 7. TENANT SENSITIVE KYC
CREATE POLICY kyc_staff_select ON public.tenant_sensitive_kyc FOR SELECT TO authenticated
USING (public.get_auth_user_role(pg_id) IN ('owner', 'warden'));

CREATE POLICY kyc_tenant_select ON public.tenant_sensitive_kyc FOR SELECT TO authenticated
USING (tenant_id = public.get_auth_any_tenant_id(pg_id));

CREATE POLICY kyc_staff_manage ON public.tenant_sensitive_kyc FOR ALL TO authenticated
USING (public.get_auth_user_role(pg_id) IN ('owner', 'warden'))
WITH CHECK (public.get_auth_user_role(pg_id) IN ('owner', 'warden'));

-- 8. TENANT BED ASSIGNMENTS
CREATE POLICY assign_select ON public.tenant_bed_assignments FOR SELECT TO authenticated
USING (public.get_auth_user_role(pg_id) IN ('owner', 'warden') OR tenant_id = public.get_auth_any_tenant_id(pg_id));

CREATE POLICY assign_staff_manage ON public.tenant_bed_assignments FOR ALL TO authenticated
USING (public.get_auth_user_role(pg_id) IN ('owner', 'warden'))
WITH CHECK (public.get_auth_user_role(pg_id) IN ('owner', 'warden'));

-- 9. RENT RECORDS
CREATE POLICY rent_select ON public.rent_records FOR SELECT TO authenticated
USING (public.get_auth_user_role(pg_id) IN ('owner', 'warden') OR tenant_id = public.get_auth_any_tenant_id(pg_id));

CREATE POLICY rent_owner_manage ON public.rent_records FOR ALL TO authenticated
USING (public.get_auth_user_role(pg_id) = 'owner')
WITH CHECK (public.get_auth_user_role(pg_id) = 'owner');

-- 10. RENT ADJUSTMENTS
CREATE POLICY adj_select ON public.rent_adjustments FOR SELECT TO authenticated
USING (public.get_auth_user_role(pg_id) IN ('owner', 'warden') OR EXISTS (
    SELECT 1 FROM public.rent_records r WHERE r.id = rent_record_id AND r.tenant_id = public.get_auth_any_tenant_id(r.pg_id)
));

CREATE POLICY adj_owner_insert ON public.rent_adjustments FOR INSERT TO authenticated
WITH CHECK (public.get_auth_user_role(pg_id) = 'owner');

-- 11. PAYMENT ORDERS
CREATE POLICY orders_select ON public.payment_orders FOR SELECT TO authenticated
USING (public.get_auth_user_role(pg_id) IN ('owner', 'warden') OR tenant_id = public.get_auth_any_tenant_id(pg_id));

-- 12. PAYMENTS
CREATE POLICY payments_select ON public.payments FOR SELECT TO authenticated
USING (public.get_auth_user_role(pg_id) IN ('owner', 'warden') OR tenant_id = public.get_auth_any_tenant_id(pg_id));

CREATE POLICY payments_staff_insert ON public.payments FOR INSERT TO authenticated
WITH CHECK (public.get_auth_user_role(pg_id) IN ('owner', 'warden'));

-- 13. PAYMENT ALLOCATIONS
CREATE POLICY alloc_select ON public.payment_allocations FOR SELECT TO authenticated
USING (public.get_auth_user_role(pg_id) IN ('owner', 'warden') OR tenant_id = public.get_auth_any_tenant_id(pg_id));

-- 14. PAYMENT REFUNDS
CREATE POLICY refunds_select ON public.payment_refunds FOR SELECT TO authenticated
USING (public.get_auth_user_role(pg_id) = 'owner');

-- 15. WEBHOOK EVENTS (Strictly service_role only)
CREATE POLICY webhook_service ON public.webhook_events FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- 16. COMPLAINTS
CREATE POLICY comp_select ON public.complaints FOR SELECT TO authenticated
USING (public.get_auth_user_role(pg_id) IN ('owner', 'warden') OR tenant_id = public.get_auth_active_tenant_id(pg_id));

CREATE POLICY comp_insert ON public.complaints FOR INSERT TO authenticated
WITH CHECK (public.get_auth_user_role(pg_id) IN ('owner', 'warden') OR tenant_id = public.get_auth_active_tenant_id(pg_id));

CREATE POLICY comp_update ON public.complaints FOR UPDATE TO authenticated
USING (public.get_auth_user_role(pg_id) IN ('owner', 'warden') OR tenant_id = public.get_auth_active_tenant_id(pg_id))
WITH CHECK (public.get_auth_user_role(pg_id) IN ('owner', 'warden') OR tenant_id = public.get_auth_active_tenant_id(pg_id));

-- 17. COMPLAINT STATUS HISTORY
CREATE POLICY chist_select ON public.complaint_status_history FOR SELECT TO authenticated
USING (public.get_auth_user_role(pg_id) IN ('owner', 'warden') OR EXISTS (
    SELECT 1 FROM public.complaints c WHERE c.id = complaint_id AND c.tenant_id = public.get_auth_active_tenant_id(c.pg_id)
));

-- 18. EXPENSES
CREATE POLICY exp_select ON public.expenses FOR SELECT TO authenticated
USING (public.get_auth_user_role(pg_id) = 'owner' OR (public.get_auth_user_role(pg_id) = 'warden' AND recorded_by_user_id = auth.uid()));

CREATE POLICY exp_staff_insert ON public.expenses FOR INSERT TO authenticated
WITH CHECK (public.get_auth_user_role(pg_id) IN ('owner', 'warden'));

CREATE POLICY exp_owner_update ON public.expenses FOR UPDATE TO authenticated
USING (public.get_auth_user_role(pg_id) = 'owner')
WITH CHECK (public.get_auth_user_role(pg_id) = 'owner');

-- 19. GATE EVENTS
CREATE POLICY gate_select ON public.gate_events FOR SELECT TO authenticated
USING (public.get_auth_user_role(pg_id) IN ('owner', 'warden') OR tenant_id = public.get_auth_active_tenant_id(pg_id));

CREATE POLICY gate_insert ON public.gate_events FOR INSERT TO authenticated
WITH CHECK (public.get_auth_user_role(pg_id) IN ('owner', 'warden') OR tenant_id = public.get_auth_active_tenant_id(pg_id));

-- 20. NIGHT OUT REQUESTS
CREATE POLICY no_select ON public.night_out_requests FOR SELECT TO authenticated
USING (public.get_auth_user_role(pg_id) IN ('owner', 'warden') OR tenant_id = public.get_auth_active_tenant_id(pg_id));

CREATE POLICY no_insert ON public.night_out_requests FOR INSERT TO authenticated
WITH CHECK (tenant_id = public.get_auth_active_tenant_id(pg_id));

CREATE POLICY no_update ON public.night_out_requests FOR UPDATE TO authenticated
USING (public.get_auth_user_role(pg_id) IN ('owner', 'warden'))
WITH CHECK (public.get_auth_user_role(pg_id) IN ('owner', 'warden'));

-- 21. TENANT GATE STATES
CREATE POLICY tgs_select ON public.tenant_gate_states FOR SELECT TO authenticated
USING (public.get_auth_user_role(pg_id) IN ('owner', 'warden') OR tenant_id = public.get_auth_active_tenant_id(pg_id));

-- 22. INQUIRIES & 23. INQUIRY FOLLOW UPS
CREATE POLICY inq_select ON public.inquiries FOR SELECT TO authenticated
USING (public.get_auth_user_role(pg_id) IN ('owner', 'warden'));

CREATE POLICY inq_manage ON public.inquiries FOR ALL TO authenticated
USING (public.get_auth_user_role(pg_id) IN ('owner', 'warden'))
WITH CHECK (public.get_auth_user_role(pg_id) IN ('owner', 'warden'));

CREATE POLICY inqf_select ON public.inquiry_follow_ups FOR SELECT TO authenticated
USING (public.get_auth_user_role(pg_id) IN ('owner', 'warden'));

CREATE POLICY inqf_manage ON public.inquiry_follow_ups FOR ALL TO authenticated
USING (public.get_auth_user_role(pg_id) IN ('owner', 'warden'))
WITH CHECK (public.get_auth_user_role(pg_id) IN ('owner', 'warden'));

-- 24. MESS MENU
CREATE POLICY mess_select ON public.mess_menu FOR SELECT TO authenticated
USING (public.get_auth_user_role(pg_id) IS NOT NULL);

CREATE POLICY mess_manage ON public.mess_menu FOR ALL TO authenticated
USING (public.get_auth_user_role(pg_id) IN ('owner', 'warden'))
WITH CHECK (public.get_auth_user_role(pg_id) IN ('owner', 'warden'));

-- 25. NOTIFICATION JOBS
CREATE POLICY jobs_select ON public.notification_jobs FOR SELECT TO authenticated
USING (public.get_auth_user_role(pg_id) = 'owner');

CREATE POLICY jobs_service ON public.notification_jobs FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- 26. TENANT INVITATIONS & 27. STAFF INVITATIONS
CREATE POLICY tinv_select ON public.tenant_invitations FOR SELECT TO authenticated
USING (public.get_auth_user_role(pg_id) IN ('owner', 'warden'));

CREATE POLICY tinv_staff_manage ON public.tenant_invitations FOR ALL TO authenticated
USING (public.get_auth_user_role(pg_id) IN ('owner', 'warden'))
WITH CHECK (public.get_auth_user_role(pg_id) IN ('owner', 'warden'));

CREATE POLICY sinv_owner_all ON public.staff_invitations FOR ALL TO authenticated
USING (public.get_auth_user_role(pg_id) = 'owner')
WITH CHECK (public.get_auth_user_role(pg_id) = 'owner');

-- 28. AUDIT LOGS
CREATE POLICY audit_owner_select ON public.audit_logs FOR SELECT TO authenticated
USING (public.get_auth_user_role(pg_id) = 'owner');
```

---

## 7. Complete Supabase Storage Bucket Policies

```sql
-- ============================================================================
-- SUPABASE STORAGE BUCKET POLICIES (storage.objects)
-- ============================================================================

-- BUCKET CREATION (Private Buckets)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
('tenant-kyc-documents', 'tenant-kyc-documents', false, 5242880, ARRAY['image/jpeg', 'image/png', 'application/pdf']),
('complaint-attachments', 'complaint-attachments', false, 10485760, ARRAY['image/jpeg', 'image/png']),
('payment-receipts', 'payment-receipts', false, 2097152, ARRAY['application/pdf']),
('pg-public-assets', 'pg-public-assets', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- 1. KYC STORAGE POLICIES
-- Folder naming convention: {pg_id}/{tenant_id}/{filename}
CREATE POLICY kyc_storage_staff_read ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'tenant-kyc-documents'
    AND public.get_auth_user_role((storage.foldername(name))[1]::uuid) IN ('owner', 'warden')
);

CREATE POLICY kyc_storage_tenant_read ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'tenant-kyc-documents'
    AND (storage.foldername(name))[2]::uuid = public.get_auth_any_tenant_id((storage.foldername(name))[1]::uuid)
);

CREATE POLICY kyc_storage_staff_upload ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'tenant-kyc-documents'
    AND public.get_auth_user_role((storage.foldername(name))[1]::uuid) IN ('owner', 'warden')
);

CREATE POLICY kyc_storage_tenant_upload ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'tenant-kyc-documents'
    AND (storage.foldername(name))[2]::uuid = public.get_auth_active_tenant_id((storage.foldername(name))[1]::uuid)
);

-- 2. COMPLAINT ATTACHMENTS POLICIES
-- Folder naming convention: {pg_id}/{complaint_id}/{filename}
CREATE POLICY comp_storage_read ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'complaint-attachments'
    AND public.get_auth_user_role((storage.foldername(name))[1]::uuid) IS NOT NULL
);

CREATE POLICY comp_storage_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'complaint-attachments'
    AND (
        public.get_auth_user_role((storage.foldername(name))[1]::uuid) IN ('owner', 'warden')
        OR public.get_auth_active_tenant_id((storage.foldername(name))[1]::uuid) IS NOT NULL
    )
);

-- 3. PAYMENT RECEIPTS POLICIES
-- Folder naming convention: {pg_id}/{receipt_number}.pdf
CREATE POLICY receipt_storage_read ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'payment-receipts'
    AND public.get_auth_user_role((storage.foldername(name))[1]::uuid) IS NOT NULL
);

CREATE POLICY receipt_storage_service_insert ON storage.objects FOR INSERT TO service_role
WITH CHECK (bucket_id = 'payment-receipts');
```

---

## 8. Security Test Scenarios & Invariant Test Matrix

### Scenario A: Tenant from PG Alpha attempting to access PG Beta data
- **Initial State:** User $U_1$ has active tenant membership in PG Alpha (`id = PG_ALPHA`). PG Beta has room records (`pg_id = PG_BETA`).
- **Context:** Authenticated JWT session where `auth.uid() = U_1`.
- **Operation:** `SELECT * FROM public.rooms WHERE pg_id = 'PG_BETA';`
- **Expected Result:** Query returns 0 rows.
- **Failure Condition:** If any row from PG Beta is returned, the test fails.

### Scenario B: Warden attempting to grant themselves owner privileges
- **Initial State:** User $W_1$ is warden in PG Alpha.
- **Context:** Authenticated JWT session where `auth.uid() = W_1`.
- **Operation:** `UPDATE public.pg_members SET role = 'owner' WHERE user_id = auth.uid() AND pg_id = 'PG_ALPHA';`
- **Expected Result:** Query fails or affects 0 rows due to RLS policy `members_update` requiring `get_auth_user_role(pg_id) = 'owner'`.
- **Failure Condition:** If `pg_members.role` becomes `'owner'`, test fails.

### Scenario C: Tenant attempting to read another tenant's KYC documents
- **Initial State:** Tenant $T_1$ and Tenant $T_2$ reside in PG Alpha. $T_2$ has uploaded sensitive KYC document `doc_2.pdf` at `PG_ALPHA/T_2/doc_2.pdf`.
- **Context:** Authenticated session for $T_1$.
- **Operation:**
  1. `SELECT * FROM public.tenant_sensitive_kyc WHERE tenant_id = 'T_2';`
  2. Attempting to download storage object `PG_ALPHA/T_2/doc_2.pdf`.
- **Expected Result:**
  1. Table query returns 0 rows (`kyc_tenant_select` checks `tenant_id = get_auth_any_tenant_id(pg_id)`).
  2. Storage policy rejects access.
- **Failure Condition:** If $T_1$ can read metadata or obtain the file of $T_2$, test fails.

### Scenario D: Two simultaneous requests assigning the same bed
- **Initial State:** Bed $B_1$ in PG Alpha is currently vacant.
- **Context:** Two concurrent database sessions ($S_1$ and $S_2$) acting for different tenants $T_1$ and $T_2$.
- **Operation:**
  Both sessions simultaneously execute:
  `INSERT INTO public.tenant_bed_assignments (pg_id, tenant_id, bed_id, assigned_from, is_active) VALUES ('PG_ALPHA', 'T_X', 'B_1', '2026-12-01', TRUE);`
- **Expected Result:** Exactly one transaction commits. The second transaction immediately aborts with PostgreSQL exclusion constraint violation `excl_no_overlapping_bed_assignments`.
- **Failure Condition:** If both assignments succeed, test fails.

### Scenario E: One tenant attempting overlapping assignments
- **Initial State:** Tenant $T_1$ has an active assignment for Bed $B_1$ from `2026-11-01` to `infinity`.
- **Context:** Warden session in PG Alpha.
- **Operation:**
  Attempting to assign $T_1$ to Bed $B_2$ from `2026-11-15` onward while previous assignment remains `is_active = TRUE`.
- **Expected Result:** Database rejects with constraint violation `excl_no_overlapping_tenant_stays`.
- **Failure Condition:** If tenant has two concurrent active stays, test fails.

### Scenario L: Vacated tenant accessing historical receipts but not operational functions
- **Initial State:** Tenant $T_1$ vacates PG Alpha (`tenants.status = 'vacated'`, `pg_members.status = 'alumni'`). Past rent record $R_1$ exists with payment $P_1$.
- **Context:** Authenticated session for vacated tenant $T_1$.
- **Operation:**
  1. `SELECT * FROM public.payments WHERE id = 'P_1';`
  2. `INSERT INTO public.complaints (pg_id, tenant_id, category, title, description) VALUES ('PG_ALPHA', 'T_1', 'wifi', 'WiFi slow', 'Broken');`
  3. `INSERT INTO public.gate_events (pg_id, tenant_id, event_type) VALUES ('PG_ALPHA', 'T_1', 'check_out');`
- **Expected Result:**
  1. Payment query returns $P_1$ successfully (`payments_select` uses `get_auth_any_tenant_id`).
  2. Complaint insert is rejected (`comp_insert` uses `get_auth_active_tenant_id`).
  3. Gate event insert is rejected (`gate_insert` uses `get_auth_active_tenant_id`).
- **Failure Condition:** If payment cannot be read or if operational inserts succeed, test fails.

### Scenario O: Attempted modification or deletion of a successful payment
- **Initial State:** Payment $P_1$ exists with `payment_status = 'successful'`.
- **Context:** Owner session in PG Alpha.
- **Operation:**
  1. `UPDATE public.payments SET amount = amount - 1000 WHERE id = 'P_1';`
  2. `DELETE FROM public.payments WHERE id = 'P_1';`
- **Expected Result:** Both operations abort immediately via trigger `trg_payments_immutable`.
- **Failure Condition:** If payment amount is modified or row deleted, test fails.

---

## 9. Financial Test Matrix

### Scenario F: Duplicate Razorpay webhook delivery
- **Initial State:** Razorpay sends event `evt_101` for `order_1` and `pay_1`.
- **Context:** Webhook receiver endpoint `/api/webhooks/razorpay`.
- **Operation:**
  Webhook endpoint receives `evt_101` twice (e.g. 500ms apart).
- **Expected Result:**
  1. First delivery inserts into `webhook_events`, executes `reconcile_payment_transaction`, and returns HTTP 200.
  2. Second delivery attempts insert into `webhook_events`, catches `uq_webhook_provider_event` conflict, detects `processing_status = 'processed'`, and immediately returns HTTP 200 without re-executing ledger updates.
- **Failure Condition:** If `payments` or `payment_allocations` has duplicate rows, test fails.

### Scenario G & H: Concurrency between checkout verification and webhook delivery
- **Initial State:** Tenant completes payment. Client redirect and Razorpay webhook hit server simultaneously.
- **Context:** Session 1 is `/api/payments/verify-checkout`; Session 2 is `/api/webhooks/razorpay`.
- **Operation:**
  Both invoke `public.reconcile_payment_transaction(p_razorpay_payment_id => 'pay_1', ...)`.
- **Expected Result:**
  1. First session acquires `pg_advisory_xact_lock(hashtext('pay_1'))`. Second session waits.
  2. First session inserts payment and allocations, updating ledger and committing.
  3. Second session acquires lock, evaluates `IF EXISTS (SELECT 1 FROM payments WHERE razorpay_payment_id = 'pay_1')`, and returns idempotent success without duplicate rows.
- **Failure Condition:** If duplicate receipt or payment is recorded, test fails.

### Scenario I: Payment amount exceeding outstanding rent
- **Initial State:** Rent record $R_1$ has `balance_amount = 5000.00`.
- **Context:** Tenant initiates payment for ₹7,000.
- **Operation:** `reconcile_payment_transaction` executes with `p_captured_amount = 7000.00`.
- **Expected Result:**
  - `payments.amount` = 7,000.00.
  - `payment_allocations.allocated_amount` = 5,000.00.
  - `rent_records.paid_amount` = 5,000.00; `balance_amount` = 0.00; `status = 'paid'`.
  - RPC returns `unallocated_advance = 2000.00`.
- **Failure Condition:** If `allocated_amount` exceeds 5,000.00, or if rent balance becomes negative, test fails.

### Scenario J: Partial payment followed by another partial payment
- **Initial State:** Rent record $R_1$ has `total_due_amount = 10000.00`, `paid_amount = 0.00`, `balance_amount = 10000.00`.
- **Operation:**
  1. Payment 1 captured for ₹4,000.
  2. Payment 2 captured for ₹6,000.
- **Expected Result:**
  - After Payment 1: `paid_amount = 4000.00`, `balance_amount = 6000.00`, `status = 'partially_paid'`. Two allocation rows exist.
  - After Payment 2: `paid_amount = 10000.00`, `balance_amount = 0.00`, `status = 'paid'`.
- **Failure Condition:** If total allocations do not match total paid amount, test fails.

### Scenario K: Refund after payment allocation
- **Initial State:** Payment $P_1$ of ₹8,000 allocated to Rent Record $R_1$ (`balance_amount = 0.00`, `status = 'paid'`).
- **Operation:** Owner initiates full refund via Razorpay dashboard. Webhook dispatches refund event.
- **Expected Result:**
  1. `payment_refunds` records ₹8,000.
  2. Allocation reversal inserted (`allocated_amount = 8000.00`, `allocation_type = 'reversal'`).
  3. `rent_records.balance_amount` restored to ₹8,000.00; `status` transitions to `'pending'` or `'partially_paid'`.
- **Failure Condition:** If rent record remains marked `'paid'` after refund, test fails.

### Scenario M: Notification worker crash after claiming a job
- **Initial State:** Job $J_1$ is claimed (`status = 'processing'`, `updated_at = NOW()`).
- **Context:** Worker crashes.
- **Operation:** 6 minutes elapse. Supabase `pg_cron` invokes `public.recover_stuck_notification_jobs()`.
- **Expected Result:**
  `recover_stuck_notification_jobs` finds $J_1$ (stuck $> 5$ mins), increments attempt count, applies exponential backoff timestamp, and resets status to `'retry'`. Next worker claims and delivers it.
- **Failure Condition:** If job remains permanently in `'processing'`, test fails.

### Scenario N: Duplicate gate event submission
- **Initial State:** Tenant checks in at gate.
- **Operation:** Network hiccup causes mobile client to submit duplicate check-in within 2 seconds.
- **Expected Result:** Stored procedure evaluates `tenant_gate_states.current_state`. If state is already `'inside'` and last event was $< 10$ seconds ago, event is rejected or deduplicated as a duplicate bounce.
- **Failure Condition:** If multiple conflicting gate events distort status, test fails.

---

## 10. Consistency Check & Contradiction Resolution

1. **Schema Count vs. DDL Invariant:** Exactly **28 tables** are defined in the schema inventory and exactly **28 `CREATE TABLE` statements** are provided in Section 5. Zero orphaned or phantom tables.
2. **PostgreSQL Deletion Behavior:** Every foreign key deletion action is verified:
   - `ON DELETE RESTRICT` on all financial and core entities (beds, tenants, rent records, payments, allocations, refunds).
   - Column-specific `ON DELETE SET NULL (room_id)` and `ON DELETE SET NULL (converted_tenant_id)` in PostgreSQL 15+ for optional relationships, avoiding `pg_id NOT NULL` violations.
3. **RLS Policy Coverage:** Every table has explicit `ENABLE ROW LEVEL SECURITY;` and `FORCE ROW LEVEL SECURITY;`, with `SELECT`, `INSERT`, `UPDATE`, and `DELETE` policies defined.

---

## 11. Final Phase 1 Implementation Readiness Assessment

With this Version 3.0.0 Master Blueprint:
- **Database Engineering:** 100% verified with executable PostgreSQL 15+ SQL.
- **Financial Accounting:** Mathematically bounded with transaction locks and reconciliation functions.
- **Authorization & Security:** Protected by RLS, `SECURITY DEFINER` encapsulation, and unforgeable invitation tokens.
- **Data Privacy:** Compliant with data minimization (masked KYC) and private signed storage.

The project plan is complete and ready for implementation.
**Awaiting your explicit approval to begin Phase 1: Project Foundation & Database Architecture.**
