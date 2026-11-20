-- ============================================================================
-- Migration: 20261120000004_financial_ledger.sql
-- Description: Financial billing ledger, payments, allocations, refunds, and webhooks
-- Author: Senior Full-Stack Software Architect & Technical Lead
-- Version: 3.0.0
-- ============================================================================

-- 9. RENT RECORDS (Monthly Interval Billing Ledger)
CREATE TABLE IF NOT EXISTS public.rent_records (
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
CREATE TABLE IF NOT EXISTS public.rent_adjustments (
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
CREATE TABLE IF NOT EXISTS public.payment_orders (
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
CREATE TABLE IF NOT EXISTS public.payments (
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
CREATE TABLE IF NOT EXISTS public.payment_allocations (
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
CREATE TABLE IF NOT EXISTS public.payment_refunds (
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
CREATE TABLE IF NOT EXISTS public.webhook_events (
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
