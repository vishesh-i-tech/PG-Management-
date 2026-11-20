-- ============================================================================
-- Migration: 20261120000003_tenants_kyc_and_assignments.sql
-- Description: Tenant records, sensitive KYC privacy table, and bed assignments with exclusion constraints
-- Author: Senior Full-Stack Software Architect & Technical Lead
-- Version: 3.0.0
-- ============================================================================

-- 6. TENANTS (General Directory)
CREATE TABLE IF NOT EXISTS public.tenants (
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
CREATE TABLE IF NOT EXISTS public.tenant_sensitive_kyc (
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
CREATE TABLE IF NOT EXISTS public.tenant_bed_assignments (
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
