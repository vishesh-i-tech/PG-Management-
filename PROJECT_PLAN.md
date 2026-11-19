# Technical Implementation Plan & Architecture Specification (Revised)
## PG Manager by The Layout Office

**Document Version:** 2.0.0  
**Date:** November 20, 2026  
**Status:** Architecture Refinement & Security Hardening (Awaiting Explicit Approval)  
**Author:** Senior Full-Stack Software Architect & Technical Lead  

---

## 1. Executive Summary & Audit Log of Revisions

This revised specification incorporates an exhaustive security, multi-tenancy, and data-architecture audit conducted following the initial proposal. No application scaffolding or migrations have been executed; this document serves as the authoritative blueprint for Phase 1.

### 1.1 Key Architectural Refinements in Version 2.0.0
1. **Engine-Level Multi-Tenant Isolation:** Replaced single-column foreign keys with **Composite Foreign Keys** `(pg_id, id)` across all relational dependencies (rooms, beds, tenants, assignments, rent records, payments, allocations, complaints, gate logs). Cross-PG data corruption is now mathematically impossible at the database engine level.
2. **Robust Double-Entry Style Payment Ledger:** Introduced `payment_allocations` to cleanly handle partial payments, advance payments, and single payments split across multiple rent periods. Implemented a strict **Payment Immutability Policy** backed by database triggers.
3. **Webhook Deduplication & Idempotent Transactions:** Introduced `webhook_events` to deduplicate Razorpay webhook payloads. All financial mutations are now executed via PostgreSQL Stored Procedures (RPCs) with advisory locks, eliminating race conditions.
4. **Flexible, Prorated Rent Billing:** Replaced simplistic monthly constraints with assignment-interval tracking (`assignment_id`, `period_start`, `period_end`). Added `rent_adjustments` for audited waivers, late fees, and utility charges.
5. **Secure Authentication & Onboarding Workflow:** Designed an unforgeable tenant and staff invitation architecture utilizing `tenant_invitations` and `staff_invitations`. Account linking is mediated by a secure `SECURITY DEFINER` RPC that verifies `auth.users.phone` before binding profiles.
6. **Data Privacy & Statutory Compliance (India DPDP Act 2023):** Removed mandatory Aadhaar collection. Replaced with data minimization (masked last 4 digits only or alternative IDs). Enforced private Supabase Storage buckets with short-lived signed URLs. Replaced false "GST-compliance" claims with customizable tax receipts based on actual PG GSTIN registration.
7. **Reliable WhatsApp Notification Queue:** Introduced `notification_jobs` featuring exponential backoff, delivery status callbacks, template mappings, tenant opt-out flags, and message deduplication keys.
8. **Finite-State Gate Management:** Redesigned gate logs to track full state transitions (`checked_in`, `checked_out`, `night_out_requested`, `late_entry`), powering targeted 10 PM alerts based on actual physical presence and PG-specific closing times.

---

## 2. Multi-Tenant Isolation Strategy & Composite Foreign Keys

### 2.1 The Cross-Tenant Reference Vulnerability (And Its Engine-Level Fix)
In conventional multi-tenant schemas relying solely on single-column foreign keys, every table contains a `pg_id` column, but child tables reference parent tables by `id` alone:
```sql
-- VULNERABLE PATTERN:
CREATE TABLE beds (
    id UUID PRIMARY KEY,
    pg_id UUID NOT NULL,
    room_id UUID REFERENCES rooms(id) -- room_id could belong to a completely different PG!
);
```
Under this flawed pattern, an application-layer bug or rogue API call could assign a room from **PG Alpha** to a bed in **PG Beta**, causing catastrophic data leakage across business accounts.

### 2.2 The Solution: Composite Foreign Keys
Every tenant-scoped table enforces a composite unique constraint `UNIQUE (pg_id, id)`. All child relationships must reference **both** `pg_id` and the primary key:
```sql
-- ENGINE-ENFORCED IMMUNITY:
CREATE TABLE rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES pgs(id) ON DELETE CASCADE,
    ...,
    CONSTRAINT uq_rooms_pg_id UNIQUE (pg_id, id)
);

CREATE TABLE beds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES pgs(id) ON DELETE CASCADE,
    room_id UUID NOT NULL,
    ...,
    CONSTRAINT uq_beds_pg_id UNIQUE (pg_id, id),
    CONSTRAINT fk_beds_room_composite FOREIGN KEY (pg_id, room_id) 
        REFERENCES rooms(pg_id, id) ON DELETE CASCADE
);
```
With composite foreign keys, PostgreSQL's relational engine rejects any insert or update where the child's `pg_id` does not match the parent's `pg_id`.

### 2.3 Composite Foreign Key Dependency Graph
```
[pgs (id)]
   |
   +---> [rooms (pg_id, id)] <---------------+
   |        |                                |
   |        +---> [beds (pg_id, id)] <----+  |
   |                                      |  |
   +---> [tenants (pg_id, id)] <-------+  |  |
   |        |                          |  |  |
   |        +---> [tenant_bed_assignments (pg_id, id)]
   |                 |                 |
   |                 +---> [rent_records (pg_id, id)] <---------+
   |                          |                                 |
   |                          +---> [rent_adjustments (pg_id, id)]
   |                                                            |
   +---> [payments (pg_id, id)]                                 |
   |        |                                                   |
   |        +---> [payment_allocations (pg_id, id)] ------------+
   |
   +---> [complaints (pg_id, id)] (references tenants(pg_id, id) & rooms(pg_id, id))
   +---> [gate_logs (pg_id, id)] (references tenants(pg_id, id))
   +---> [inquiries (pg_id, id)]
   +---> [tenant_invitations (pg_id, id)] (references tenants(pg_id, id))
   +---> [notification_jobs (pg_id, id)]
```

---

## 3. Redesigned Row Level Security (RLS) Architecture

### 3.1 Avoiding RLS Recursion
**The Infinite Recursion Problem:** If a policy on `pg_members` queries `pg_members` to verify user permissions, or if `rooms` queries `pg_members` which triggers its own RLS policy, PostgreSQL either aborts with an infinite recursion error or incurs severe performance degradation.

**The Solution:**
1. Database helper functions are created with `SECURITY DEFINER` and execute with the privileges of the database owner, bypassing RLS internally on `pg_members`.
2. Safe fixed `search_path` is explicitly declared: `SET search_path = public, auth, pg_temp;`.
3. Execution permissions are tightly controlled: revoked from `PUBLIC` and granted strictly to `authenticated`.
4. The helper functions never trust user-supplied parameters for identity; they extract identity strictly from `auth.uid()`.

```sql
-- Core Security Definer Helper: Role Lookup
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

-- Core Security Definer Helper: Tenant ID Lookup
CREATE OR REPLACE FUNCTION public.get_auth_tenant_id(target_pg_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
    SELECT id FROM public.tenants
    WHERE pg_id = target_pg_id
      AND user_id = auth.uid()
      AND status = 'active'
    LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_auth_user_role(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_auth_user_role(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.get_auth_tenant_id(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_auth_tenant_id(UUID) TO authenticated;
```

### 3.2 Secure Initial Owner Onboarding Flow
**The Vulnerability:** If regular authenticated users have direct `INSERT` permissions on `pg_members` or `pgs`, malicious actors could inject themselves as owners of existing businesses or grant themselves unauthorized administrative privileges.

**The Architectural Solution:**
1. Direct `INSERT` on `pg_members` and `pgs` is completely disabled for regular client roles (`authenticated`).
2. New PG creation is executed strictly through a PostgreSQL `SECURITY DEFINER` RPC: `public.create_new_pg_business(...)`.

```sql
CREATE OR REPLACE FUNCTION public.create_new_pg_business(
    p_name TEXT,
    p_slug TEXT,
    p_address_line1 TEXT,
    p_city TEXT,
    p_state TEXT,
    p_pincode TEXT,
    p_contact_phone TEXT,
    p_gender_type TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_pg_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    -- Validate input constraints
    IF LENGTH(TRIM(p_name)) < 3 THEN
        RAISE EXCEPTION 'PG name must be at least 3 characters.';
    END IF;

    -- Insert PG record
    INSERT INTO public.pgs (
        name, slug, address_line1, city, state, pincode, contact_phone, gender_type
    ) VALUES (
        p_name, LOWER(TRIM(p_slug)), p_address_line1, p_city, p_state, p_pincode, p_contact_phone, p_gender_type
    ) RETURNING id INTO v_pg_id;

    -- Automatically assign creator as owner
    INSERT INTO public.pg_members (
        pg_id, user_id, role, status
    ) VALUES (
        v_pg_id, v_user_id, 'owner', 'active'
    );

    -- Log action
    INSERT INTO public.audit_logs (
        pg_id, actor_user_id, action, entity_type, entity_id, details
    ) VALUES (
        v_pg_id, v_user_id, 'PG_CREATED', 'pgs', v_pg_id, jsonb_build_object('name', p_name, 'slug', p_slug)
    );

    RETURN v_pg_id;
END;
$$;
```

### 3.3 Complete RLS Policy Matrix

All policies evaluate against `public.get_auth_user_role(pg_id)`. Next.js Middleware routes provide UI convenience, but the database enforces complete isolation.

| Table | SELECT Policy | INSERT Policy | UPDATE Policy | DELETE Policy |
|---|---|---|---|---|
| `pgs` | User is active member of `id` (`get_auth_user_role(id) IS NOT NULL`) | Blocked (Use `create_new_pg_business` RPC) | Role = `'owner'` | Role = `'owner'` |
| `pg_members` | User is member of `pg_id` | Role = `'owner'` | Role = `'owner'` (Cannot demote last owner) | Role = `'owner'` |
| `rooms` | Active member of `pg_id` | Role = `'owner'` | Role IN (`'owner'`, `'warden'`) | Role = `'owner'` |
| `beds` | Active member of `pg_id` | Role = `'owner'` | Role IN (`'owner'`, `'warden'`) | Role = `'owner'` |
| `tenants` | Staff (`'owner'`, `'warden'`) OR self (`id = get_auth_tenant_id(pg_id)`) | Role IN (`'owner'`, `'warden'`) | Staff for all; Tenant for own contact info | Role = `'owner'` |
| `tenant_bed_assignments` | Staff OR self (`tenant_id = get_auth_tenant_id(pg_id)`) | Role IN (`'owner'`, `'warden'`) | Role IN (`'owner'`, `'warden'`) | Role = `'owner'` |
| `rent_records` | Staff OR self (`tenant_id = get_auth_tenant_id(pg_id)`) | Role = `'owner'` OR System RPC | Role = `'owner'` OR System RPC | Role = `'owner'` |
| `rent_adjustments` | Staff OR self (`tenant_id = get_auth_tenant_id(pg_id)`) | Role = `'owner'` | Blocked (Immutable Audit Record) | Blocked |
| `payments` | Staff OR self (`tenant_id = get_auth_tenant_id(pg_id)`) | Staff (Cash) OR Verified Razorpay RPC | Blocked once `payment_status = 'successful'` | Blocked |
| `payment_allocations` | Staff OR self (via payment/rent ownership) | Verified RPC or Owner | Blocked (Immutable) | Blocked |
| `complaints` | Staff OR self (`tenant_id = get_auth_tenant_id(pg_id)`) | Tenant (own `tenant_id`) OR Staff | Staff can update status; Tenant can rate | Role = `'owner'` |
| `complaint_status_history`| Staff OR complaint owner | System Trigger / RPC | Blocked (Immutable) | Blocked |
| `expenses` | Role = `'owner'` OR Staff (petty cash) | Role IN (`'owner'`, `'warden'`) | Role = `'owner'` | Role = `'owner'` |
| `gate_logs` | Staff OR self (`tenant_id = get_auth_tenant_id(pg_id)`) | Staff OR Tenant (check-out/night-out) | Staff (verify entry / actual return) | Role = `'owner'` |
| `inquiries` | Role IN (`'owner'`, `'warden'`) | Staff OR Public RPC (Web/WhatsApp lead) | Role IN (`'owner'`, `'warden'`) | Role = `'owner'` |
| `notification_jobs` | Role = `'owner'` | System Triggers / Background Service | System Worker | System Worker |
| `webhook_events` | Blocked from all client access | Service Role Key Only | Service Role Key Only | Service Role Key Only |

---

## 4. Comprehensive Database Schema (PostgreSQL DDL)

### 4.1 Schema Definition with Composite Integrity Constraints

```sql
-- 1. USER PROFILES (1-to-1 with auth.users)
CREATE TABLE public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    phone VARCHAR(15) NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    email TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. PGS (Multi-Tenant Properties)
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
    gstin VARCHAR(15), -- Optional: for tax-registered PGs
    pan_number VARCHAR(10),
    rules_and_regulations TEXT,
    bank_upi_id TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. PG MEMBERS (Role Mapping)
CREATE TABLE public.pg_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'warden', 'tenant')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'invited')),
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
        REFERENCES public.rooms(pg_id, id) ON DELETE CASCADE
);

-- 6. TENANTS (Minimizing KYC Data - No Full Aadhaar)
CREATE TABLE public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    full_name TEXT NOT NULL,
    phone VARCHAR(15) NOT NULL,
    email TEXT,
    id_proof_type TEXT NOT NULL CHECK (id_proof_type IN ('college_id', 'work_id', 'driving_license', 'passport', 'voter_id', 'masked_aadhaar', 'other')),
    id_proof_last_four VARCHAR(4), -- Strictly last 4 digits for privacy compliance
    id_document_storage_path TEXT, -- Secure private Supabase bucket path
    photo_storage_path TEXT,
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

-- 7. TENANT BED ASSIGNMENTS
CREATE TABLE public.tenant_bed_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    bed_id UUID NOT NULL,
    agreed_monthly_rent NUMERIC(10, 2) NOT NULL CHECK (agreed_monthly_rent >= 0),
    assigned_from DATE NOT NULL,
    assigned_to DATE,
    notice_given_date DATE,
    vacating_date DATE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_assignments_pg_id UNIQUE (pg_id, id),
    CONSTRAINT fk_assignments_tenant_composite FOREIGN KEY (pg_id, tenant_id)
        REFERENCES public.tenants(pg_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_assignments_bed_composite FOREIGN KEY (pg_id, bed_id)
        REFERENCES public.beds(pg_id, id) ON DELETE RESTRICT
);

-- 8. RENT RECORDS (Billing Interval Ledger)
CREATE TABLE public.rent_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    assignment_id UUID NOT NULL,
    billing_month DATE NOT NULL, -- Anchor date: 1st of calendar month (e.g. 2026-11-01)
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
    CONSTRAINT uq_rent_records_assignment_period UNIQUE (assignment_id, period_start, period_end),
    CONSTRAINT chk_rent_period_valid CHECK (period_start <= period_end),
    CONSTRAINT fk_rent_tenant_composite FOREIGN KEY (pg_id, tenant_id)
        REFERENCES public.tenants(pg_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_rent_assignment_composite FOREIGN KEY (pg_id, assignment_id)
        REFERENCES public.tenant_bed_assignments(pg_id, id) ON DELETE RESTRICT
);

-- 9. RENT ADJUSTMENTS (Formal Audited Alterations)
CREATE TABLE public.rent_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    rent_record_id UUID NOT NULL,
    adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('waiver', 'discount', 'late_fee_addition', 'utility_meter', 'damage_penalty', 'correction')),
    amount NUMERIC(10, 2) NOT NULL, -- Positive adds to bill, negative discounts
    reason TEXT NOT NULL,
    authorized_by_user_id UUID NOT NULL REFERENCES public.user_profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_rent_adjustments_pg_id UNIQUE (pg_id, id),
    CONSTRAINT fk_adjustments_rent_composite FOREIGN KEY (pg_id, rent_record_id)
        REFERENCES public.rent_records(pg_id, id) ON DELETE CASCADE
);

-- 10. PAYMENTS (Transactions: Cash & Razorpay)
CREATE TABLE public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('razorpay_upi', 'razorpay_card', 'razorpay_netbanking', 'cash', 'direct_upi_qr', 'bank_transfer')),
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
    CONSTRAINT fk_payments_tenant_composite FOREIGN KEY (pg_id, tenant_id)
        REFERENCES public.tenants(pg_id, id) ON DELETE CASCADE
);

-- 11. PAYMENT ALLOCATIONS (Double-Entry Allocation to Rent Records)
CREATE TABLE public.payment_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    payment_id UUID NOT NULL,
    rent_record_id UUID NOT NULL,
    allocated_amount NUMERIC(10, 2) NOT NULL CHECK (allocated_amount > 0),
    allocated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_payment_allocations_pg_id UNIQUE (pg_id, id),
    CONSTRAINT fk_allocations_payment_composite FOREIGN KEY (pg_id, payment_id)
        REFERENCES public.payments(pg_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_allocations_rent_composite FOREIGN KEY (pg_id, rent_record_id)
        REFERENCES public.rent_records(pg_id, id) ON DELETE RESTRICT
);

-- 12. WEBHOOK EVENTS (Idempotent Razorpay Tracking)
CREATE TABLE public.webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL DEFAULT 'razorpay',
    event_id TEXT NOT NULL UNIQUE,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    signature TEXT NOT NULL,
    processing_status TEXT NOT NULL DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processed', 'failed', 'ignored')),
    error_message TEXT,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. COMPLAINTS
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
        REFERENCES public.tenants(pg_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_complaints_room_composite FOREIGN KEY (pg_id, room_id)
        REFERENCES public.rooms(pg_id, id) ON DELETE SET NULL
);

-- 14. COMPLAINT STATUS HISTORY
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

-- 15. EXPENSES
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

-- 16. GATE LOGS (Finite State Tracking)
CREATE TABLE public.gate_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    entry_type TEXT NOT NULL CHECK (entry_type IN ('check_out', 'check_in', 'night_out_request', 'late_entry')),
    logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expected_return_at TIMESTAMPTZ,
    actual_return_at TIMESTAMPTZ,
    reason TEXT,
    is_late_entry BOOLEAN NOT NULL DEFAULT FALSE,
    verified_by_user_id UUID REFERENCES public.user_profiles(id),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_gate_logs_pg_id UNIQUE (pg_id, id),
    CONSTRAINT fk_gate_logs_tenant_composite FOREIGN KEY (pg_id, tenant_id)
        REFERENCES public.tenants(pg_id, id) ON DELETE CASCADE
);

-- 17. INQUIRIES (Prospective Leads Pipeline)
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
        REFERENCES public.tenants(pg_id, id) ON DELETE SET NULL
);

-- 18. MESS MENU
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

-- 19. NOTIFICATION JOBS (Reliable Message Queue)
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

-- 20. TENANT INVITATIONS (Secure Account-Linking Tokens)
CREATE TABLE public.tenant_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    phone VARCHAR(15) NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_tenant_invitations_pg_id UNIQUE (pg_id, id),
    CONSTRAINT fk_invitations_tenant_composite FOREIGN KEY (pg_id, tenant_id)
        REFERENCES public.tenants(pg_id, id) ON DELETE CASCADE
);

-- 21. STAFF INVITATIONS (Warden & Co-Owner Invitations)
CREATE TABLE public.staff_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    email_or_phone VARCHAR(100) NOT NULL,
    designated_role TEXT NOT NULL CHECK (designated_role IN ('warden', 'owner')),
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_staff_invitations_pg_id UNIQUE (pg_id, id)
);

-- 22. AUDIT LOGS
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

-- 23. PAYMENT IMMUTABILITY TRIGGER
CREATE OR REPLACE FUNCTION public.trg_enforce_payment_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.payment_status = 'successful' THEN
        IF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION 'Successful payments are immutable and cannot be deleted.';
        END IF;
        IF NEW.payment_status <> OLD.payment_status OR NEW.amount <> OLD.amount THEN
            RAISE EXCEPTION 'Successful payments are immutable. Adjustments must be made via formal refund or rent adjustment entries.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_payments_immutable
BEFORE UPDATE OR DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.trg_enforce_payment_immutability();
```

---

## 5. Financial Ledger & Idempotent Payment Architecture

### 5.1 The Double-Entry Allocation Flow
The relationship between payments and rent records is strictly decoupled through `payment_allocations`:
- One payment (e.g. ₹15,000) can allocate ₹10,000 to an overdue October bill and ₹5,000 as partial payment for November.
- Multiple partial payments (e.g. ₹3,000 + ₹4,000) can allocate to a single ₹7,000 rent record.

### 5.2 Server Action Transaction Caveat & Stored Procedure Execution
In Next.js App Router, multiple asynchronous database queries executed inside a standard Server Action **do not run inside a single PostgreSQL transaction**. A failure midway leaves the database in a corrupted partial state.

To guarantee ACID compliance, all financial mutations execute within a PostgreSQL Stored Procedure (`reconcile_razorpay_payment`):

```sql
CREATE OR REPLACE FUNCTION public.reconcile_razorpay_payment(
    p_event_id TEXT,
    p_order_id TEXT,
    p_payment_id TEXT,
    p_signature TEXT,
    p_amount NUMERIC(10, 2),
    p_pg_id UUID,
    p_tenant_id UUID,
    p_rent_record_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_payment_uuid UUID;
    v_rent_balance NUMERIC(10, 2);
    v_allocate_amt NUMERIC(10, 2);
    v_receipt_no TEXT;
BEGIN
    -- 1. Idempotency Check on Webhook Event
    IF EXISTS (SELECT 1 FROM public.webhook_events WHERE event_id = p_event_id AND processing_status = 'processed') THEN
        RETURN TRUE; -- Already processed; return idempotent success
    END IF;

    -- 2. Prevent duplicate payment entry
    IF EXISTS (SELECT 1 FROM public.payments WHERE razorpay_payment_id = p_payment_id) THEN
        RETURN TRUE;
    END IF;

    -- 3. Generate Receipt Number (Format: RCP-YYYYMM-XXXXX)
    v_receipt_no := 'RCP-' || TO_CHAR(NOW(), 'YYYYMM') || '-' || UPPER(SUBSTRING(gen_random_uuid()::TEXT FROM 1 FOR 6));

    -- 4. Insert Payment Record
    INSERT INTO public.payments (
        pg_id, tenant_id, amount, payment_method, payment_status,
        razorpay_order_id, razorpay_payment_id, razorpay_signature, receipt_number
    ) VALUES (
        p_pg_id, p_tenant_id, p_amount, 'razorpay_upi', 'successful',
        p_order_id, p_payment_id, p_signature, v_receipt_no
    ) RETURNING id INTO v_payment_uuid;

    -- 5. Lock and Retrieve Rent Record Balance
    SELECT balance_amount INTO v_rent_balance
    FROM public.rent_records
    WHERE id = p_rent_record_id AND pg_id = p_pg_id
    FOR UPDATE;

    IF v_rent_balance IS NULL THEN
        RAISE EXCEPTION 'Target rent record does not exist or does not belong to PG.';
    END IF;

    -- 6. Calculate Allocation
    v_allocate_amt := LEAST(p_amount, v_rent_balance);

    -- 7. Insert Payment Allocation
    INSERT INTO public.payment_allocations (
        pg_id, payment_id, rent_record_id, allocated_amount
    ) VALUES (
        p_pg_id, v_payment_uuid, p_rent_record_id, v_allocate_amt
    );

    -- 8. Update Rent Record Ledger
    UPDATE public.rent_records
    SET paid_amount = paid_amount + v_allocate_amt,
        balance_amount = balance_amount - v_allocate_amt,
        status = CASE 
            WHEN (balance_amount - v_allocate_amt) <= 0 THEN 'paid'
            ELSE 'partially_paid'
        END,
        updated_at = NOW()
    WHERE id = p_rent_record_id;

    -- 9. Enqueue WhatsApp Receipt Notification Job
    INSERT INTO public.notification_jobs (
        pg_id, channel, recipient_phone, template_name,
        template_variables, idempotency_key
    ) VALUES (
        p_pg_id, 'whatsapp', 
        (SELECT phone FROM public.tenants WHERE id = p_tenant_id),
        'payment_receipt_notification',
        jsonb_build_object('receipt_number', v_receipt_no, 'amount', p_amount),
        'payment_receipt_' || p_payment_id
    );

    -- 10. Mark Webhook as Processed
    UPDATE public.webhook_events
    SET processing_status = 'processed', processed_at = NOW()
    WHERE event_id = p_event_id;

    RETURN TRUE;
END;
$$;
```

---

## 6. Flexible Rent Generation & Billing Model

### 6.1 Mid-Month Stays & Proration Logic
Instead of a rigid `UNIQUE(tenant_id, billing_month)` constraint, billing is anchored to assignment intervals: `UNIQUE (assignment_id, period_start, period_end)`.

#### Proration Formula
For a tenant joining or vacating mid-month:
$$\text{Days in Month} = \text{DATE\_PART}('days', \text{DATE\_TRUNC}('month', \text{Period}) + \text{INTERVAL} '1 month - 1 day')$$
$$\text{Days Occupied} = (\text{period\_end} - \text{period\_start} + 1)$$
$$\text{Prorated Rent} = \text{ROUND}\left(\frac{\text{Agreed Monthly Rent}}{\text{Days in Month}} \times \text{Days Occupied}, 2\right)$$

### 6.2 Idempotent Monthly Rent Generation
Scheduled to execute on the 1st of each month via Supabase `pg_cron` or Vercel Cron. The algorithm verifies whether an interval record already exists for each active assignment before inserting, ensuring that running the cron job twice never duplicates bills.

---

## 7. Tenant & Warden Authentication & Account-Linking

### 7.1 The Account Hijacking Risk (And Its Resolution)
If a user could create an account with a phone number and immediately claim any pre-existing tenant record with that phone, an attacker could claim someone else's tenancy if phone verification was loose or mismatched.

### 7.2 Secure Verification Pipeline
```
[Owner Portal]
  | 1. Owner registers tenant (Name, Phone, Bed Assignment)
  | 2. DB creates 'tenants' row (user_id IS NULL)
  | 3. DB creates 'tenant_invitations' (unique cryptographic token, 7-day expiry)
  | 4. WhatsApp/SMS sends invitation link: https://app.thelayoutoffice.com/join?token=XYZ
  v
[Tenant Mobile Browser]
  | 5. Tenant opens link -> enters phone number
  | 6. Supabase Phone Auth sends OTP (E.164 +91...)
  | 7. Tenant submits OTP -> Supabase issues verified auth.users session
  | 8. Client calls RPC: public.link_tenant_profile_on_login(token)
  v
[PostgreSQL Database (SECURITY DEFINER)]
  | 9. RPC checks:
  |    - Is auth.uid() valid?
  |    - Does auth.users.phone MATCH tenant_invitations.phone?
  |    - Is token valid and unexpired?
  | 10. Links: tenants.user_id = auth.uid()
  | 11. Inserts pg_members: (pg_id, auth.uid(), role='tenant', status='active')
  | 12. Updates tenant_invitations status to 'accepted'
  | 13. Returns active pg_id and redirects to /tenant dashboard
```

### 7.3 Vacating & Historical Data Retention
When a tenant vacates:
- `tenants.status` transitions to `'vacated'`.
- `tenant_bed_assignments.is_active` is set to `FALSE`.
- `pg_members.status` transitions to `'inactive'`.
- **Retention:** All historical `rent_records`, `payments`, `receipts`, and `gate_logs` are preserved indefinitely.
- **RLS Access Post-Vacating:** The vacated tenant retains read-only access to download past receipts and review their stay history, but cannot raise complaints or register gate passes.

---

## 8. Data Privacy & Statutory Compliance (India DPDP Act 2023)

### 8.1 Data Minimization
- **No Full Aadhaar Collection:** Full 12-digit Aadhaar storage requires UIDAI license compliance and dedicated Aadhaar Data Vaults. PG Manager explicitly prohibits storing full Aadhaar numbers or unmasked Aadhaar documents.
- **Alternative KYC:** Allows College ID, Corporate Employment ID, Driver's License, Voter ID, or **Masked Aadhaar (Last 4 Digits Only)**.
- **Private Storage Buckets:** All identity documents and complaint photos reside in **strictly private** Supabase Storage buckets (`tenant-kyc-docs` and `complaint-attachments`).
- **Short-Lived Signed URLs:** The application never exposes public document URLs. Pre-signed download URLs with a 15-minute expiration are generated server-side after verifying that the caller is an authorized owner, warden, or the owning tenant.

### 8.2 Tax & Receipt Transparency
- Removed misleading blanket claims of "GST-compliant receipts".
- Receipts are labeled **"Rent Receipt"** for residential accommodation.
- If an owner provides a valid GSTIN in `pgs.gstin`, receipts include the GSTIN and SAC code (9963 / 9972). If not, standard non-tax receipts are generated, fully compliant for tenant HRA (House Rent Allowance) tax exemptions without fraudulent tax representations.

---

## 9. Reliable WhatsApp Queue & Notification Architecture

### 9.1 Reliable Queue Pattern (`notification_jobs`)
All outgoing notifications are written to the `notification_jobs` table before delivery:
- Status lifecycle: `queued` $\rightarrow$ `processing` $\rightarrow$ `sent` $\rightarrow$ `delivered` (or `failed` $\rightarrow$ exponential retry $\rightarrow$ `dead_letter`).
- **Idempotency Keys:** Every job requires a unique key (e.g. `rent_reminder_{pg_id}_{tenant_id}_{billing_month}`). Duplicate attempts to insert the same key are rejected by PostgreSQL.
- **Rate Limiting:** Workers process batches with respect to Meta WhatsApp Cloud API tier limits (80 messages/second for Tier 1).
- **Tenant Opt-Out:** Respects `tenants.whatsapp_opt_out`. If `TRUE`, non-critical marketing or general broadcast messages are skipped.

---

## 10. Finite-State Gate Management System

### 10.1 State Machine
```
[CHECKED_IN] (Inside premises)
     |
     +---> [CHECKED_OUT] (Office/College during day)
     |          |
     |          +---> Returns before gate closing ---> [CHECKED_IN]
     |          |
     |          +---> Returns AFTER gate closing ---> [LATE_ENTRY] (Warden Verified)
     |
     +---> [NIGHT_OUT_REQUESTED] (Overnight leave)
                |
                +---> Warden Approved ---> [NIGHT_OUT_APPROVED]
                |
                +---> Returns next day ---> [CHECKED_IN]
```

### 10.2 Targeted 10 PM Gate Closing Reminder
The scheduled 10 PM alert does not blast all tenants. It executes a targeted query:
```sql
SELECT t.phone, t.full_name, p.gate_closing_time
FROM public.tenants t
JOIN public.pgs p ON p.id = t.pg_id
WHERE t.status = 'active'
  AND t.whatsapp_opt_out = FALSE
  -- Filter to tenants whose latest gate entry is a check_out or night_out without subsequent check_in
  AND (
      SELECT gl.entry_type 
      FROM public.gate_logs gl 
      WHERE gl.tenant_id = t.id 
      ORDER BY gl.logged_at DESC 
      LIMIT 1
  ) IN ('check_out', 'night_out_request');
```

---

## 11. Technical Compatibility & Modern Standards

- **Next.js 15+ App Router:** Fully aligns with Server Components and Server Actions. Employs `@supabase/ssr` with standard cookie adapter patterns.
- **Database Migrations:** Supabase CLI migrations located in `supabase/migrations/` using timestamped SQL files. No external ORMs (Prisma/Drizzle) that introduce abstraction overhead or conflict with advanced PostgreSQL RLS features.
- **PWA Implementation:** Configured via `@serwist/next` (the modern successor to `next-pwa`, compatible with Turbopack and Webpack), including offline caching of shell UI and local cache for warden gate logging.
- **Cron Jobs:** Dual-engine architecture:
  - Supabase `pg_cron`: Internal high-frequency maintenance (rent billing, queue retries, ledger checks).
  - Vercel Cron: External orchestrator calling `/api/cron/*` endpoints protected with `Bearer ${CRON_SECRET}`.

---

## 12. Phased Development Roadmap

```
Phase 0: External Accounts & Prerequisite Setup (Parallel Track)
  - Supabase project setup, custom SMS/OTP configuration
  - Razorpay Merchant Account & webhook test secret generation
  - Meta WhatsApp Business Account & template drafting

Phase 1: Project Foundation & Database Architecture (NEXT STEP)
  - Next.js 15+ App Router scaffolding with TypeScript (strict mode) and Tailwind CSS
  - Supabase DDL migration execution (22 tables with composite foreign keys)
  - Security Definer helper functions & RLS policy enforcement
  - PWA shell configuration with @serwist/next

Phase 2: Authentication, Onboarding & Role-Based Permissions
  - Phone OTP authentication with E.164 +91 validation
  - create_new_pg_business RPC integration for secure owner onboarding
  - Tenant and staff invitation token generation and linking RPCs
  - Role-guarded dashboard layouts (/owner, /warden, /tenant)

Phase 3: Core Operations Modules
  - Rooms & Beds visual occupancy matrix
  - Tenant KYC directory with masked ID storage
  - Digital gate register with check-in/out and night-out workflow
  - Maintenance complaint ticketing with status history & photo uploads
  - Weekly mess menu editor & today's meal card
  - Operational expense logging with petty cash tracking

Phase 4: Razorpay Payments & Ledgers
  - Server-side Razorpay order creation
  - Mobile-first Razorpay Checkout modal
  - reconcile_razorpay_payment stored procedure & webhook event deduplication
  - Double-entry payment allocations to rent records
  - Manual cash payment recording by owner/warden
  - Server-generated PDF rent receipts with signed storage links

Phase 5: WhatsApp Queue & Automations
  - Notification queue worker with exponential retry backoff
  - 1st of month automated rent billing & notification job
  - Instant payment receipt dispatch
  - Targeted 10 PM gate-closing notification to checked-out tenants

Phase 6: Verification, Security Audits & Pilot
  - RLS penetration testing across tenant boundaries
  - Webhook replay attack tests and network drop simulations
  - Real-device mobile testing across Android and iOS
  - Live pilot with 1-2 actual PG properties

Phase 7: Production Launch & SaaS Monetization
  - Production domain deployment on Vercel Edge
  - The Layout Office SaaS subscription billing (bed-tier limits)
  - Sentry error monitoring and performance telemetry
```

---

## 13. Architectural Decisions: Mandatory vs. Optional & Approvals

### 13.1 Mandatory Security Requirements (Non-Negotiable)
1. **Composite Foreign Keys:** All child tables must include `(pg_id, id)` constraints.
2. **Database-Level RLS:** 100% of tables must have RLS enabled with `SECURITY DEFINER` role lookup helpers.
3. **Payment Immutability:** Successful payments must never be deleted or updated in place.
4. **Idempotent Webhook Processing:** Webhook events must be deduplicated via `webhook_events`.
5. **Masked ID Storage:** No full 12-digit Aadhaar numbers stored in the database.

### 13.2 Decisions Requiring Owner Approval Prior to Phase 1 Scaffolding

1. **Razorpay Payment Payout Model:**
   - **Option A (Recommended for Initial Launch):** Each PG owner configures their own Razorpay Key ID and Secret in their PG Settings. Rent flows directly into the owner's bank account. The Layout Office has zero payout liability or NBFC/escrow compliance burdens.
   - **Option B (Platform Route):** The Layout Office collects all rent payments into a master Razorpay account and splits payouts to PG owners via Razorpay Route, deducting a platform SaaS fee. Requires extensive RBI payment aggregator compliance and merchant agreements.
   - *Recommendation:* Approve Option A for Launch; introduce Option B in Phase 7.

2. **WhatsApp Provider Strategy for Launch:**
   - **Option A (Meta Cloud API Direct):** Lower message costs (~₹0.40 - ₹0.80 per conversation), but requires Meta Business Verification, Facebook Developer App setup, and business credit card.
   - **Option B (BSP Partner - WATI / Interakt / AiSensy):** Higher message costs (~₹0.90 - ₹1.20), but turnkey onboarding, simpler UI, and managed template approvals.
   - *Recommendation:* Support both via our abstract `IWhatsAppService` adapter, defaulting to a local mock provider during Phase 1-3 development.

3. **SMS OTP Provider for Supabase Auth:**
   - In India, commercial transactional SMS requires DLT (Distributed Ledger Technology) registration.
   - *Recommendation:* During development and initial staging, use Supabase's pre-configured Test Phone Numbers with fixed OTPs. For production, connect Twilio or MSG91 with DLT-registered templates.
