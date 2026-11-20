-- ============================================================================
-- Migration: 20261120000006_comms_invites_audit.sql
-- Description: Message queue (notification_jobs), cryptographic invitations, and audit logs
-- Author: Senior Full-Stack Software Architect & Technical Lead
-- Version: 3.0.0
-- ============================================================================

-- 25. NOTIFICATION JOBS (Reliable Message Queue)
CREATE TABLE IF NOT EXISTS public.notification_jobs (
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
CREATE TABLE IF NOT EXISTS public.tenant_invitations (
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
CREATE TABLE IF NOT EXISTS public.staff_invitations (
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
CREATE TABLE IF NOT EXISTS public.audit_logs (
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
