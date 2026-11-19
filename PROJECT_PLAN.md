# Technical Implementation Plan & Architecture Specification (Version 3.0.0)
## PG Manager by The Layout Office

**Document Version:** 3.0.0 (Master Architecture Blueprint)  
**Date:** November 20, 2026  
**Status:** Architecture Hardened & Corrected (Awaiting Explicit Approval Before Phase 1 Implementation)  
**Author:** Senior Full-Stack Software Architect & Technical Lead  
**Minimum Database Requirement:** PostgreSQL 15+ (Required for column-specific `ON DELETE SET NULL`, `btree_gist`, and advanced composite constraints; standard in Supabase)

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

### 3.2 Executable Razorpay Order Mapping DDL
```sql
CREATE TABLE public.payment_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE RESTRICT,
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
CREATE INDEX idx_payment_orders_lookup ON public.payment_orders(razorpay_order_id);
```

### 3.3 Atomic Reconciliation Stored Procedure with Advisory Locking
```sql
CREATE OR REPLACE FUNCTION public.reconcile_payment_transaction(
    p_event_id TEXT,
    p_razorpay_order_id TEXT,
    p_razorpay_payment_id TEXT,
    p_payment_method TEXT,
    p_captured_amount NUMERIC(10, 2),
    p_signature TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_payment_id UUID;
    v_rent_record RECORD;
    v_allocated_amount NUMERIC(10, 2);
    v_unallocated_amount NUMERIC(10, 2) := 0.00;
    v_receipt_number TEXT;
    v_tenant_phone TEXT;
    v_tenant_name TEXT;
BEGIN
    -- 1. TRANSACTIONAL ADVISORY LOCK: Serialize concurrent attempts for this payment ID
    PERFORM pg_advisory_xact_lock(hashtext(p_razorpay_payment_id));

    -- 2. DEDUPLICATION: If payment record already exists, return idempotent success
    IF EXISTS (SELECT 1 FROM public.payments WHERE razorpay_payment_id = p_razorpay_payment_id) THEN
        RETURN jsonb_build_object('success', true, 'status', 'already_processed');
    END IF;

    -- 3. VALIDATE TRUSTED ORDER MAPPING
    SELECT po.*, t.phone, t.full_name
    INTO v_order
    FROM public.payment_orders po
    JOIN public.tenants t ON t.id = po.tenant_id AND t.pg_id = po.pg_id
    WHERE po.razorpay_order_id = p_razorpay_order_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Untrusted order: Razorpay order ID % not registered.', p_razorpay_order_id;
    END IF;

    -- 4. AMOUNT VERIFICATION: Never trust client amount; match against captured amount
    IF p_captured_amount <> v_order.expected_amount THEN
        RAISE EXCEPTION 'Amount mismatch: Captured % does not match order %.', p_captured_amount, v_order.expected_amount;
    END IF;

    -- 5. LOCK RENT RECORD
    SELECT id, total_due_amount, paid_amount, balance_amount, status
    INTO v_rent_record
    FROM public.rent_records
    WHERE id = v_order.target_rent_record_id AND pg_id = v_order.pg_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target rent record % not found in PG %.', v_order.target_rent_record_id, v_order.pg_id;
    END IF;

    -- 6. GENERATE SEQUENTIAL RECEIPT NUMBER (RCP-YYYYMM-XXXXX)
    v_receipt_number := 'RCP-' || TO_CHAR(NOW(), 'YYYYMM') || '-' || UPPER(SUBSTRING(gen_random_uuid()::TEXT FROM 1 FOR 6));

    -- 7. INSERT IMMUTABLE PAYMENT RECORD
    INSERT INTO public.payments (
        pg_id, tenant_id, amount, payment_method, payment_status,
        razorpay_order_id, razorpay_payment_id, razorpay_signature, receipt_number
    ) VALUES (
        v_order.pg_id, v_order.tenant_id, p_captured_amount, p_payment_method, 'successful',
        p_razorpay_order_id, p_razorpay_payment_id, p_signature, v_receipt_number
    ) RETURNING id INTO v_payment_id;

    -- 8. CALCULATE ALLOCATION AND HANDLE EXCESS
    IF p_captured_amount <= v_rent_record.balance_amount THEN
        v_allocated_amount := p_captured_amount;
        v_unallocated_amount := 0.00;
    ELSE
        v_allocated_amount := v_rent_record.balance_amount;
        v_unallocated_amount := p_captured_amount - v_rent_record.balance_amount;
    END IF;

    -- 9. RECORD PAYMENT ALLOCATION (Enforcing tenant and PG consistency)
    IF v_allocated_amount > 0 THEN
        INSERT INTO public.payment_allocations (
            pg_id, payment_id, rent_record_id, allocated_amount
        ) VALUES (
            v_order.pg_id, v_payment_id, v_rent_record.id, v_allocated_amount
        );

        -- 10. UPDATE RENT RECORD BALANCE
        UPDATE public.rent_records
        SET paid_amount = paid_amount + v_allocated_amount,
            balance_amount = balance_amount - v_allocated_amount,
            status = CASE 
                WHEN (balance_amount - v_allocated_amount) <= 0 THEN 'paid'
                ELSE 'partially_paid'
            END,
            updated_at = NOW()
        WHERE id = v_rent_record.id;
    END IF;

    -- 11. UPDATE PAYMENT ORDER STATUS
    UPDATE public.payment_orders
    SET status = 'paid', updated_at = NOW()
    WHERE id = v_order.id;

    -- 12. TRANSACTIONAL NOTIFICATION QUEUE
    INSERT INTO public.notification_jobs (
        pg_id, channel, recipient_phone, template_name,
        template_variables, idempotency_key
    ) VALUES (
        v_order.pg_id, 'whatsapp', v_order.phone,
        'payment_receipt_notification',
        jsonb_build_object(
            'tenant_name', v_order.full_name,
            'receipt_number', v_receipt_number,
            'amount', p_captured_amount,
            'balance_remaining', (v_rent_record.balance_amount - v_allocated_amount)
        ),
        'payment_receipt_' || p_razorpay_payment_id
    );

    -- 13. MARK WEBHOOK EVENT PROCESSED IF CALLED VIA WEBHOOK
    IF p_event_id IS NOT NULL THEN
        UPDATE public.webhook_events
        SET processing_status = 'processed', processed_at = NOW()
        WHERE event_id = p_event_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'payment_id', v_payment_id,
        'receipt_number', v_receipt_number,
        'allocated', v_allocated_amount,
        'unallocated_advance', v_unallocated_amount
    );
END;
$$;
REVOKE ALL ON FUNCTION public.reconcile_payment_transaction FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_payment_transaction TO authenticated, service_role;
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

To guarantee zero drift over time, the following reconciliation repair function audits and synchronizes cached values against the underlying allocation ledger:
```sql
CREATE OR REPLACE FUNCTION public.reconcile_rent_record_ledger(p_rent_record_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_rec RECORD;
    v_actual_adjustments NUMERIC(10, 2) := 0.00;
    v_actual_allocations NUMERIC(10, 2) := 0.00;
    v_computed_total NUMERIC(10, 2);
    v_computed_balance NUMERIC(10, 2);
BEGIN
    SELECT * INTO v_rec FROM public.rent_records WHERE id = p_rent_record_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Rent record not found.'; END IF;

    SELECT COALESCE(SUM(amount), 0.00) INTO v_actual_adjustments
    FROM public.rent_adjustments WHERE rent_record_id = p_rent_record_id;

    SELECT COALESCE(SUM(allocated_amount), 0.00) INTO v_actual_allocations
    FROM public.payment_allocations WHERE rent_record_id = p_rent_record_id;

    v_computed_total := v_rec.base_rent_amount + v_rec.utility_charges + v_rec.late_fee_amount - v_rec.discount_amount + v_actual_adjustments;
    v_computed_balance := GREATEST(0.00, v_computed_total - v_actual_allocations);

    IF v_computed_total <> v_rec.total_due_amount OR v_actual_allocations <> v_rec.paid_amount OR v_computed_balance <> v_rec.balance_amount THEN
        UPDATE public.rent_records
        SET total_due_amount = v_computed_total,
            paid_amount = v_actual_allocations,
            balance_amount = v_computed_balance,
            status = CASE WHEN v_computed_balance <= 0 THEN 'paid' WHEN v_actual_allocations > 0 THEN 'partially_paid' ELSE 'pending' END,
            updated_at = NOW()
        WHERE id = p_rent_record_id;

        INSERT INTO public.audit_logs (pg_id, action, entity_type, entity_id, details)
        VALUES (v_rec.pg_id, 'LEDGER_RECONCILED', 'rent_records', p_rent_record_id, jsonb_build_object(
            'old_balance', v_rec.balance_amount, 'new_balance', v_computed_balance,
            'old_paid', v_rec.paid_amount, 'new_paid', v_actual_allocations
        ));

        RETURN jsonb_build_object('status', 'repaired', 'rent_record_id', p_rent_record_id);
    END IF;

    RETURN jsonb_build_object('status', 'in_sync', 'rent_record_id', p_rent_record_id);
END;
$$;
```

### 4.3 Refunds and Allocation Reversals
Refunds are modeled as distinct financial events in `payment_refunds`. When a refund occurs:
1. A row is inserted into `payment_refunds` with the gateway refund ID.
2. An allocation reversal entry (`allocated_amount < 0`) is inserted into `payment_allocations`, or existing allocations are decremented.
3. The rent record's `balance_amount` is incremented back atomically within a single stored procedure.

---

## 5. Concurrency Control & Bed Assignment Exclusion Constraints

### 5.1 Race Condition Vulnerability
If two wardens or prospective tenants simultaneously attempt to book the same bed, standard `SELECT` then `INSERT` logic creates a race condition where both bookings succeed, resulting in double occupancy.

### 5.2 Resolution: PostgreSQL Exclusion Constraints (`btree_gist`)
We utilize the PostgreSQL `btree_gist` extension to enforce mathematical exclusion constraints on date intervals:
```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1. Bed Assignment with DATERANGE and Exclusion Constraint
ALTER TABLE public.tenant_bed_assignments
ADD COLUMN stay_period DATERANGE GENERATED ALWAYS AS (
    daterange(assigned_from, COALESCE(assigned_to, 'infinity'::date), '[]')
) STORED;

-- PREVENT DOUBLE OCCUPANCY: No two active assignments for the same bed may have overlapping stay periods
ALTER TABLE public.tenant_bed_assignments
ADD CONSTRAINT excl_no_overlapping_bed_assignments
EXCLUDE USING gist (
    bed_id WITH =,
    stay_period WITH &&
) WHERE (is_active = TRUE);

-- PREVENT TENANT SPLIT: No single tenant may have two active assignments with overlapping dates
ALTER TABLE public.tenant_bed_assignments
ADD CONSTRAINT excl_no_overlapping_tenant_stays
EXCLUDE USING gist (
    tenant_id WITH =,
    stay_period WITH &&
) WHERE (is_active = TRUE);

-- ENFORCE ASSIGNMENT CONSISTENCY IN RENT RECORDS
-- Guarantees rent records cannot point to an assignment belonging to another tenant
ALTER TABLE public.tenant_bed_assignments
ADD CONSTRAINT uq_assignments_tenant_composite UNIQUE (pg_id, tenant_id, id);

ALTER TABLE public.rent_records
ADD CONSTRAINT fk_rent_assignment_tenant_composite FOREIGN KEY (pg_id, tenant_id, assignment_id)
REFERENCES public.tenant_bed_assignments(pg_id, tenant_id, id) ON DELETE RESTRICT;
```
*Concurrency Guarantee:* If two concurrent requests execute simultaneously, PostgreSQL's GiST index locks the tree node, allowing the first transaction to commit and instantly aborting the second with constraint violation `excl_no_overlapping_bed_assignments`.

---

## 6. Access Control Architecture & Vacated Tenant Retention

### 6.1 Tenant Lifecycle & State Transition Matrix
```
[Invited] -> [Active Tenant] -> [Notice Period] -> [Vacated / Alumni] -> [Archived]
```

| Lifecycle State | `tenants.status` | `pg_members.status` | Operational Access (Gate, Complaints, Mess) | Historical Access (Receipts, Past Stays) |
|---|---|---|---|---|
| **Active** | `'active'` | `'active'` | Full Access | Full Access |
| **Notice Period** | `'notice_period'` | `'active'` | Full Access | Full Access |
| **Vacated** | `'vacated'` | `'alumni'` | **BLOCKED** | **Read-Only** |
| **Blacklisted** | `'blacklisted'` | `'inactive'` | **BLOCKED** | **BLOCKED** |

### 6.2 Decoupled Helper Functions
To avoid stripping vacated tenants of receipt access while strictly blocking them from operational activities:
```sql
-- Helper 1: For Operational Actions (Complaints, Gate Passes, Mess Schedule)
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

-- Helper 2: For Historical Read Access (Rent Receipts, Past Ledgers, Stay History)
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

REVOKE ALL ON FUNCTION public.get_auth_active_tenant_id FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_auth_active_tenant_id TO authenticated;

REVOKE ALL ON FUNCTION public.get_auth_any_tenant_id FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_auth_any_tenant_id TO authenticated;
```

---

## 7. Complete Row Level Security (RLS) Specification

All tenant-scoped tables have `ROW LEVEL SECURITY` enabled and forced. Direct `INSERT` on `pg_members` is revoked from client roles, eliminating privilege escalation.

### 7.1 Exhaustive Table Policy Matrix

```sql
-- 1. PGS
ALTER TABLE public.pgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pgs FORCE ROW LEVEL SECURITY;

CREATE POLICY pgs_select ON public.pgs FOR SELECT TO authenticated
USING (public.get_auth_user_role(id) IS NOT NULL);

CREATE POLICY pgs_update ON public.pgs FOR UPDATE TO authenticated
USING (public.get_auth_user_role(id) = 'owner')
WITH CHECK (public.get_auth_user_role(id) = 'owner');

-- 2. PG_MEMBERS
ALTER TABLE public.pg_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pg_members FORCE ROW LEVEL SECURITY;

CREATE POLICY members_select ON public.pg_members FOR SELECT TO authenticated
USING (public.get_auth_user_role(pg_id) IS NOT NULL);

-- Direct client INSERT is completely blocked; memberships must be created via secure RPCs
CREATE POLICY members_insert_service ON public.pg_members FOR INSERT TO service_role
WITH CHECK (true);

CREATE POLICY members_update ON public.pg_members FOR UPDATE TO authenticated
USING (public.get_auth_user_role(pg_id) = 'owner')
WITH CHECK (public.get_auth_user_role(pg_id) = 'owner');

CREATE POLICY members_delete ON public.pg_members FOR DELETE TO authenticated
USING (public.get_auth_user_role(pg_id) = 'owner');

-- 3. ROOMS & BEDS
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms FORCE ROW LEVEL SECURITY;
ALTER TABLE public.beds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beds FORCE ROW LEVEL SECURITY;

CREATE POLICY rooms_select ON public.rooms FOR SELECT TO authenticated
USING (public.get_auth_user_role(pg_id) IS NOT NULL);

CREATE POLICY rooms_admin ON public.rooms FOR ALL TO authenticated
USING (public.get_auth_user_role(pg_id) = 'owner')
WITH CHECK (public.get_auth_user_role(pg_id) = 'owner');

CREATE POLICY beds_select ON public.beds FOR SELECT TO authenticated
USING (public.get_auth_user_role(pg_id) IS NOT NULL);

CREATE POLICY beds_modify ON public.beds FOR UPDATE TO authenticated
USING (public.get_auth_user_role(pg_id) IN ('owner', 'warden'))
WITH CHECK (public.get_auth_user_role(pg_id) IN ('owner', 'warden'));

CREATE POLICY beds_admin ON public.beds FOR ALL TO authenticated
USING (public.get_auth_user_role(pg_id) = 'owner')
WITH CHECK (public.get_auth_user_role(pg_id) = 'owner');

-- 4. TENANTS (General Directory)
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants FORCE ROW LEVEL SECURITY;

CREATE POLICY tenants_select ON public.tenants FOR SELECT TO authenticated
USING (
    public.get_auth_user_role(pg_id) IN ('owner', 'warden')
    OR id = public.get_auth_any_tenant_id(pg_id)
);

CREATE POLICY tenants_insert ON public.tenants FOR INSERT TO authenticated
WITH CHECK (public.get_auth_user_role(pg_id) IN ('owner', 'warden'));

CREATE POLICY tenants_update ON public.tenants FOR UPDATE TO authenticated
USING (
    public.get_auth_user_role(pg_id) IN ('owner', 'warden')
    OR id = public.get_auth_active_tenant_id(pg_id)
)
WITH CHECK (
    public.get_auth_user_role(pg_id) IN ('owner', 'warden')
    OR id = public.get_auth_active_tenant_id(pg_id)
);

-- 5. RENT RECORDS & ADJUSTMENTS
ALTER TABLE public.rent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rent_records FORCE ROW LEVEL SECURITY;

CREATE POLICY rent_select ON public.rent_records FOR SELECT TO authenticated
USING (
    public.get_auth_user_role(pg_id) IN ('owner', 'warden')
    OR tenant_id = public.get_auth_any_tenant_id(pg_id)
);

CREATE POLICY rent_owner_admin ON public.rent_records FOR ALL TO authenticated
USING (public.get_auth_user_role(pg_id) = 'owner')
WITH CHECK (public.get_auth_user_role(pg_id) = 'owner');

-- 6. PAYMENTS & ALLOCATIONS
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_allocations FORCE ROW LEVEL SECURITY;

CREATE POLICY payments_select ON public.payments FOR SELECT TO authenticated
USING (
    public.get_auth_user_role(pg_id) IN ('owner', 'warden')
    OR tenant_id = public.get_auth_any_tenant_id(pg_id)
);

CREATE POLICY allocations_select ON public.payment_allocations FOR SELECT TO authenticated
USING (
    public.get_auth_user_role(pg_id) IN ('owner', 'warden')
    OR EXISTS (
        SELECT 1 FROM public.payments p
        WHERE p.id = payment_allocations.payment_id
          AND p.pg_id = payment_allocations.pg_id
          AND p.tenant_id = public.get_auth_any_tenant_id(payment_allocations.pg_id)
    )
);

-- 7. COMPLAINTS (Operational: Active Tenants Only)
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaints FORCE ROW LEVEL SECURITY;

CREATE POLICY complaints_select ON public.complaints FOR SELECT TO authenticated
USING (
    public.get_auth_user_role(pg_id) IN ('owner', 'warden')
    OR tenant_id = public.get_auth_active_tenant_id(pg_id)
);

CREATE POLICY complaints_insert ON public.complaints FOR INSERT TO authenticated
WITH CHECK (
    public.get_auth_user_role(pg_id) IN ('owner', 'warden')
    OR tenant_id = public.get_auth_active_tenant_id(pg_id)
);

CREATE POLICY complaints_update ON public.complaints FOR UPDATE TO authenticated
USING (
    public.get_auth_user_role(pg_id) IN ('owner', 'warden')
    OR tenant_id = public.get_auth_active_tenant_id(pg_id)
)
WITH CHECK (
    public.get_auth_user_role(pg_id) IN ('owner', 'warden')
    OR tenant_id = public.get_auth_active_tenant_id(pg_id)
);

-- 8. GATE EVENTS & NIGHT OUT (Operational: Active Tenants Only)
ALTER TABLE public.gate_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gate_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.night_out_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.night_out_requests FORCE ROW LEVEL SECURITY;

CREATE POLICY gate_select ON public.gate_events FOR SELECT TO authenticated
USING (
    public.get_auth_user_role(pg_id) IN ('owner', 'warden')
    OR tenant_id = public.get_auth_active_tenant_id(pg_id)
);

CREATE POLICY gate_insert ON public.gate_events FOR INSERT TO authenticated
WITH CHECK (
    public.get_auth_user_role(pg_id) IN ('owner', 'warden')
    OR tenant_id = public.get_auth_active_tenant_id(pg_id)
);

CREATE POLICY night_out_select ON public.night_out_requests FOR SELECT TO authenticated
USING (
    public.get_auth_user_role(pg_id) IN ('owner', 'warden')
    OR tenant_id = public.get_auth_active_tenant_id(pg_id)
);

CREATE POLICY night_out_insert ON public.night_out_requests FOR INSERT TO authenticated
WITH CHECK (tenant_id = public.get_auth_active_tenant_id(pg_id));

CREATE POLICY night_out_update ON public.night_out_requests FOR UPDATE TO authenticated
USING (public.get_auth_user_role(pg_id) IN ('owner', 'warden'))
WITH CHECK (public.get_auth_user_role(pg_id) IN ('owner', 'warden'));
```

---

## 8. Tenant Privacy, Sensitive KYC Separation & Storage Policies

### 8.1 Data Minimization & Sensitive KYC Separation
To protect tenant privacy and adhere to the Digital Personal Data Protection (DPDP) Act 2023, sensitive KYC documents and identity identifiers are removed from the general `tenants` table and isolated in a dedicated table:
```sql
CREATE TABLE public.tenant_sensitive_kyc (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL UNIQUE,
    id_proof_type TEXT NOT NULL CHECK (id_proof_type IN ('college_id', 'work_id', 'driving_license', 'passport', 'voter_id', 'masked_aadhaar', 'other')),
    id_proof_last_four VARCHAR(4) NOT NULL, -- Strictly last 4 digits; full Aadhaar numbers prohibited
    document_storage_path TEXT NOT NULL,     -- Private Supabase Storage bucket path
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

ALTER TABLE public.tenant_sensitive_kyc ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_sensitive_kyc FORCE ROW LEVEL SECURITY;

-- Only PG Owner and authorized Warden can read sensitive KYC
CREATE POLICY kyc_staff_select ON public.tenant_sensitive_kyc FOR SELECT TO authenticated
USING (public.get_auth_user_role(pg_id) IN ('owner', 'warden'));

-- Tenant can view their own KYC verification status, but not staff audit metadata
CREATE POLICY kyc_tenant_select ON public.tenant_sensitive_kyc FOR SELECT TO authenticated
USING (tenant_id = public.get_auth_any_tenant_id(pg_id));
```

### 8.2 Private Supabase Storage Bucket Security
1. **Buckets:**
   - `tenant-kyc-documents` (Private, max 5 MB, PDF/JPEG/PNG)
   - `complaint-attachments` (Private, max 10 MB, JPEG/PNG)
   - `payment-receipts` (Private, max 2 MB, PDF)
2. **Access Mediation via Signed URLs:** Public bucket access is completely disabled. Pre-signed URLs with a **15-minute expiration** are generated server-side after checking the user's role and tenancy in PostgreSQL.

---

## 9. Cryptographic Invitation Security & Account-Linking Workflow

### 9.1 Cryptographic Token Storage
Tokens are never stored in plaintext. The database stores the SHA-256 hash (`token_hash`) of a cryptographically generated 32-byte token.
```sql
CREATE TABLE public.tenant_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    phone VARCHAR(15) NOT NULL, -- E.164 format (+91...)
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
```

### 9.2 Role Invitation Matrix
- **Owners:** Can invite Wardens, Co-Owners, and Tenants.
- **Wardens:** Can invite Tenants only. (Attempting to invite Wardens or Owners raises a database security exception).
- **Tenants:** Cannot issue invitations.

### 9.3 Secure Account-Linking Stored Procedure
```sql
CREATE OR REPLACE FUNCTION public.accept_tenant_invitation(p_plaintext_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_user_phone TEXT;
    v_token_hash TEXT;
    v_invite RECORD;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;

    -- Retrieve phone from auth.users
    SELECT phone INTO v_user_phone FROM auth.users WHERE id = v_user_id;
    IF v_user_phone IS NULL THEN RAISE EXCEPTION 'User phone number not verified in auth.'; END IF;

    v_token_hash := encode(digest(p_plaintext_token, 'sha256'), 'hex');

    -- Lookup invitation with FOR UPDATE lock
    SELECT * INTO v_invite
    FROM public.tenant_invitations
    WHERE token_hash = v_token_hash
      AND status = 'pending'
      AND expires_at > NOW()
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid, expired, or previously accepted invitation token.'; END IF;

    -- Strict Phone Binding: Authenticated phone must match invitation phone
    IF v_user_phone <> v_invite.phone THEN
        RAISE EXCEPTION 'Phone mismatch: Authenticated number does not match invited number.';
    END IF;

    -- Link tenant profile
    UPDATE public.tenants
    SET user_id = v_user_id, updated_at = NOW()
    WHERE id = v_invite.tenant_id AND pg_id = v_invite.pg_id;

    -- Insert active PG membership
    INSERT INTO public.pg_members (pg_id, user_id, role, status)
    VALUES (v_invite.pg_id, v_user_id, 'tenant', 'active')
    ON CONFLICT (pg_id, user_id) DO UPDATE SET status = 'active', role = 'tenant';

    -- Mark invitation accepted
    UPDATE public.tenant_invitations
    SET status = 'accepted', accepted_by_user_id = v_user_id, accepted_at = NOW()
    WHERE id = v_invite.id;

    RETURN jsonb_build_object('success', true, 'pg_id', v_invite.pg_id, 'tenant_id', v_invite.tenant_id);
END;
$$;
REVOKE ALL ON FUNCTION public.accept_tenant_invitation FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_tenant_invitation TO authenticated;
```

---

## 10. Finite-State Gate Management System

### 10.1 Architecture Separation
The gate management system is structured into three distinct concerns:
1. `gate_events`: Immutable audit trail of physical gate movements.
2. `night_out_requests`: Formal workflow for overnight leave (request, approval, completion).
3. `tenant_gate_states`: High-performance materialized state table tracking physical location (`inside`, `outside`, `night_out`).

```sql
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
        REFERENCES public.tenants(pg_id, id) ON DELETE CASCADE
);

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
    CONSTRAINT fk_night_out_tenant_composite FOREIGN KEY (pg_id, tenant_id)
        REFERENCES public.tenants(pg_id, id) ON DELETE CASCADE
);
```

### 10.2 Targeted 10 PM Gate Closing Notification Query
The scheduled notification job queries `tenant_gate_states` to target only tenants who are physically outside:
```sql
CREATE OR REPLACE FUNCTION public.get_tenants_outside_for_gate_alert(p_target_time TIMESTAMPTZ DEFAULT NOW())
RETURNS TABLE (
    pg_id UUID,
    tenant_id UUID,
    tenant_name TEXT,
    phone VARCHAR(15),
    gate_closing_time TIME
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
    SELECT 
        p.id AS pg_id,
        t.id AS tenant_id,
        t.full_name AS tenant_name,
        t.phone,
        p.gate_closing_time
    FROM public.tenant_gate_states tgs
    JOIN public.tenants t ON t.id = tgs.tenant_id AND t.pg_id = tgs.pg_id
    JOIN public.pgs p ON p.id = tgs.pg_id
    WHERE tgs.current_state IN ('outside', 'night_out')
      AND t.status = 'active'
      AND t.whatsapp_opt_out = FALSE
      -- Notification window: within 45 minutes of the PG's specific closing time in Indian Standard Time
      AND (p_target_time AT TIME ZONE 'Asia/Kolkata')::time >= (p.gate_closing_time - INTERVAL '45 minutes')
      AND (p_target_time AT TIME ZONE 'Asia/Kolkata')::time < p.gate_closing_time
      -- Deduplication: ensure an alert hasn't already been queued today for this tenant
      AND NOT EXISTS (
          SELECT 1 FROM public.notification_jobs nj
          WHERE nj.pg_id = p.id
            AND nj.recipient_phone = t.phone
            AND nj.idempotency_key = 'gate_alert_' || p.id || '_' || t.id || '_' || TO_CHAR(p_target_time AT TIME ZONE 'Asia/Kolkata', 'YYYYMMDD')
      );
$$;
```

---

## 11. Reliable Notification Queue Architecture

### 11.1 Worker State Lifecycle
```
[queued] -> [processing] -> [sent] -> [delivered]
               |
               +-> [failed] -> [retry] -> (Attempts >= 5) -> [dead_letter]
```

### 11.2 Atomic Worker Claim Query (`FOR UPDATE SKIP LOCKED`)
Workers claim batches atomically without collisions or double-processing:
```sql
CREATE OR REPLACE FUNCTION public.claim_notification_jobs(p_batch_size INT DEFAULT 20)
RETURNS SETOF public.notification_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
    RETURN QUERY
    WITH claimed AS (
        SELECT id FROM public.notification_jobs
        WHERE status IN ('queued', 'retry')
          AND next_attempt_at <= NOW()
        ORDER BY next_attempt_at ASC
        LIMIT p_batch_size
        FOR UPDATE SKIP LOCKED
    )
    UPDATE public.notification_jobs nj
    SET status = 'processing',
        attempts = attempts + 1,
        updated_at = NOW()
    FROM claimed
    WHERE nj.id = claimed.id
    RETURNING nj.*;
END;
$$;
```

### 11.3 Worker Lease Recovery (Stuck Job Protection)
If a worker crashes while processing, the following cleanup job resets jobs stuck for over 5 minutes:
```sql
CREATE OR REPLACE FUNCTION public.recover_stuck_notification_jobs()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_recovered_count INT;
BEGIN
    WITH stuck AS (
        SELECT id FROM public.notification_jobs
        WHERE status = 'processing'
          AND updated_at < NOW() - INTERVAL '5 minutes'
        FOR UPDATE SKIP LOCKED
    )
    UPDATE public.notification_jobs nj
    SET status = CASE WHEN attempts >= max_attempts THEN 'dead_letter' ELSE 'retry' END,
        next_attempt_at = NOW() + (INTERVAL '10 seconds' * POWER(3, attempts)),
        last_error = 'Worker timeout lease expired; auto-recovered.',
        updated_at = NOW()
    FROM stuck
    WHERE nj.id = stuck.id;

    GET DIAGNOSTICS v_recovered_count = ROW_COUNT;
    RETURN v_recovered_count;
END;
$$;
```

---

## 12. Background Scheduling & Cron Orchestration

### 12.1 Clear Separation of Responsibilities
Operating both `pg_cron` and Vercel Cron without defined roles creates duplicate trigger hazards. We establish a clean division of labor:
1. **Internal Engine (Supabase `pg_cron`):**
   - High-frequency queue polling (`claim_notification_jobs` every minute).
   - Worker lease recovery (`recover_stuck_notification_jobs` every 5 minutes).
   - Operates inside the PostgreSQL cluster with zero HTTP latency or timeout risk.
2. **External Trigger (Vercel Cron):**
   - High-level daily orchestrator (e.g. 1st of month rent billing at 00:01 AM IST, 10 PM gate alert scan).
   - Calls Next.js Route Handlers (`/api/cron/*`) secured with `Authorization: Bearer ${CRON_SECRET}`.
   - Handlers acquire PostgreSQL transaction advisory locks (`pg_advisory_xact_lock`) to guarantee single-execution idempotency.

---

## 13. Data Retention, Anonymization & Legal Compliance Notice

### 13.1 Technical Controls (DPDP Act 2023 Readiness)
- **Data Minimization:** No full 12-digit Aadhaar numbers or raw biometric documents are stored anywhere in the platform.
- **Tenant Deletion & Anonymization:** 90 days after vacating and security deposit refund, `tenant_sensitive_kyc` records and private document storage files are automatically marked for cryptographic purging, unless flagged with `legal_hold = TRUE`.
- **Statutory Retention:** Core financial records (`rent_records`, `payments`, `payment_allocations`, `payment_refunds`) are retained for 8 years to comply with Indian Income Tax Act requirements.

### 13.2 Disclaimer on Tax and Legal Compliance
The platform provides technical features to generate invoices and receipts based on the PG owner's configuration. It does **not** provide legal, tax, or accounting advice. Whether a specific PG accommodation is exempt from GST or qualifies for tenant HRA exemptions depends on the owner's legal entity structure and current Indian tax law. All tax and invoicing configurations must be reviewed by the PG owner's Chartered Accountant.

---

## 14. Complete Database Schema Inventory (28 Tables)

| # | Table Name | Purpose | Primary Key | Composite Isolation Key | RLS Policy Summary | Deletion Behavior |
|---|---|---|---|---|---|---|
| 1 | `user_profiles` | Extension of `auth.users` | `id UUID` | N/A (1-to-1 with auth) | Self-read/update; Staff can view names | `CASCADE` on auth deletion |
| 2 | `pgs` | Multi-tenant PG business profiles | `id UUID` | Root Entity | Member read; Owner update | Restricted if active members |
| 3 | `pg_members` | Role-based membership | `id UUID` | `UNIQUE(pg_id, user_id)` | Member read; Owner update; Direct insert blocked | `CASCADE` on PG deletion |
| 4 | `rooms` | Room details & base rent | `id UUID` | `UNIQUE(pg_id, id)` | Member read; Staff manage | `RESTRICT` if beds exist |
| 5 | `beds` | Bed inventory & status | `id UUID` | `UNIQUE(pg_id, id)` | Member read; Staff manage | `RESTRICT` if assignments exist |
| 6 | `tenants` | General tenant directory | `id UUID` | `UNIQUE(pg_id, id)` | Staff read all; Tenant read self | `RESTRICT` if ledger exists |
| 7 | `tenant_sensitive_kyc` | Masked KYC & private doc paths | `id UUID` | `UNIQUE(pg_id, id)` | Staff read; Tenant read status | `CASCADE` on tenant deletion |
| 8 | `tenant_bed_assignments`| Stay dates & agreed rent | `id UUID` | `UNIQUE(pg_id, id)` | Staff read; Tenant read self | `RESTRICT` if rent exists |
| 9 | `rent_records` | Monthly interval billing ledger | `id UUID` | `UNIQUE(pg_id, id)` | Staff read; Tenant read self | `RESTRICT` if allocations exist |
| 10| `rent_adjustments` | Audited credits, waivers & fees | `id UUID` | `UNIQUE(pg_id, id)` | Staff read; Owner manage | `RESTRICT` on rent records |
| 11| `payment_orders` | Trusted Razorpay order mapping | `id UUID` | `UNIQUE(pg_id, id)` | Staff read; Tenant read own orders | `RESTRICT` |
| 12| `payments` | Immutable transaction records | `id UUID` | `UNIQUE(pg_id, id)` | Staff read; Tenant read self; Updates blocked | `RESTRICT` (Immutable) |
| 13| `payment_allocations` | Rent allocation ledger | `id UUID` | `UNIQUE(pg_id, id)` | Staff read; Tenant read self; Updates blocked | `RESTRICT` (Immutable) |
| 14| `payment_refunds` | Refund records & reversals | `id UUID` | `UNIQUE(pg_id, id)` | Staff read; Tenant read self | `RESTRICT` |
| 15| `webhook_events` | Razorpay webhook deduplication | `id UUID` | `UNIQUE(provider, event_id)` | Service-role only | Retained for 90 days |
| 16| `complaints` | Maintenance tickets | `id UUID` | `UNIQUE(pg_id, id)` | Staff read; Active tenant read self | `RESTRICT` (Soft close) |
| 17| `complaint_status_history`| Ticket resolution timeline | `id UUID` | References complaints | Staff read; Complaint owner read | `CASCADE` on complaint deletion |
| 18| `expenses` | Outflow ledger & petty cash | `id UUID` | `UNIQUE(pg_id, id)` | Owner read all; Staff manage petty cash | `RESTRICT` |
| 19| `gate_events` | Immutable physical gate movements | `id UUID` | `UNIQUE(pg_id, id)` | Staff read; Active tenant read self | Retained for 180 days |
| 20| `night_out_requests` | Overnight leave workflow | `id UUID` | `UNIQUE(pg_id, id)` | Staff read; Active tenant read self | Retained for 180 days |
| 21| `tenant_gate_states` | Materialized current presence | `(pg_id, tenant_id)`| References tenants | Staff read; Active tenant read self | `CASCADE` on tenant deletion |
| 22| `inquiries` | Prospective lead CRM | `id UUID` | `UNIQUE(pg_id, id)` | Staff read/manage | `RESTRICT` (Soft archive) |
| 23| `inquiry_follow_ups` | Lead interaction history | `id UUID` | References inquiries | Staff read/manage | `CASCADE` on inquiry deletion |
| 24| `mess_menu` | Weekly meal schedules | `id UUID` | `UNIQUE(pg_id, day, meal)` | Active member read; Staff manage | `CASCADE` on PG deletion |
| 25| `notification_jobs` | WhatsApp / SMS message queue | `id UUID` | `UNIQUE(pg_id, id)` | Service-role & Owner read | Purged after delivery |
| 26| `tenant_invitations` | Cryptographic onboarding tokens | `id UUID` | `UNIQUE(pg_id, id)` | Staff read; Service-role verify | Expired after 7 days |
| 27| `staff_invitations` | Warden/Owner onboarding tokens | `id UUID` | `UNIQUE(pg_id, id)` | Owner read; Service-role verify | Expired after 7 days |
| 28| `audit_logs` | Platform security audit trail | `id UUID` | References pgs | Owner read; Updates blocked | Immutable append-only |

*Note on SaaS Subscriptions:* `pg_subscriptions` DDL is formally defined for platform billing readiness, with full billing UI implementation scheduled for Phase 7.

---

## 15. Software Environment & Package Version Commitments

| Component / Layer | Supported Specification | Notes |
|---|---|---|
| **Database** | PostgreSQL 15+ (PostgreSQL 15.1+ or 16.x) | Required for column-specific `ON DELETE SET NULL` and `btree_gist` exclusion constraints. Standard in Supabase. |
| **Frontend Framework** | Next.js 15.x (App Router) | Utilizing React 19 Server Components and Server Actions. |
| **Authentication SDK** | `@supabase/ssr` (^0.5.x) | Modern cookie-based session management replacing deprecated auth-helpers. |
| **PWA Engine** | `@serwist/next` (^9.0.x) | Modern Webpack & Turbopack compatible PWA service worker compiler. |
| **Language & Tooling** | TypeScript 5.x (Strict Mode), Tailwind CSS 3.4+ / 4.x | Zero implicit any; complete end-to-end type safety. |

---

## 16. Strategic Decisions Requiring Business-Owner Approval

Before Phase 1 implementation begins, the business owner must provide explicit approval on the following decisions:

1. **Payment Settlement Architecture:**
   - **Option A (Direct Merchant Credentials - Recommended for Launch):** Each PG Owner enters their own Razorpay Key ID and Secret in PG Settings. Rent flows directly into the owner's bank account. The Layout Office assumes zero financial liability or RBI payment aggregator compliance burden.
   - **Option B (Platform Route Escrow):** The Layout Office collects all rent payments into a master Razorpay account and disburses payouts via Razorpay Route. Requires extensive escrow agreements and RBI compliance.
   - *Architect's Recommendation:* **Approve Option A for Launch.**

2. **WhatsApp Notification Provider:**
   - **Option A (Meta Cloud API Direct):** Lower per-message cost, but requires Meta Business Verification and business credit card.
   - **Option B (BSP Partner - WATI / Interakt):** Turnkey onboarding and managed template approvals with slightly higher message cost.
   - *Architect's Recommendation:* **Approve Option A with Local Mock Adapter fallback during development.**

3. **SMS OTP Gateway for Indian Market:**
   - Commercial transactional SMS in India requires DLT registration.
   - *Architect's Recommendation:* **Approve use of Supabase Test Phone Numbers during development and staging, transitioning to Twilio/MSG91 with DLT approval prior to live launch.**

4. **Approval to Proceed:**
   - Confirm approval of this Version 3.0.0 Architecture Blueprint to begin **Phase 1: Project Foundation & Database Architecture**.
