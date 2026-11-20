-- ============================================================================
-- Migration: 20261120000001_initial_extensions_and_core.sql
-- Description: Enable required extensions and initialize user_profiles, pgs, and pg_members
-- Author: Senior Full-Stack Software Architect & Technical Lead
-- Version: 3.0.0
-- ============================================================================

-- 0. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- 1. USER PROFILES (1-to-1 extension of auth.users)
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    phone VARCHAR(15) NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    email TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. PGS (Multi-Tenant PG Businesses)
CREATE TABLE IF NOT EXISTS public.pgs (
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
CREATE TABLE IF NOT EXISTS public.pg_members (
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
