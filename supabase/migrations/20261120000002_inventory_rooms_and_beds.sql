-- ============================================================================
-- Migration: 20261120000002_inventory_rooms_and_beds.sql
-- Description: Room and bed inventory with composite foreign keys
-- Author: Senior Full-Stack Software Architect & Technical Lead
-- Version: 3.0.0
-- ============================================================================

-- 4. ROOMS
CREATE TABLE IF NOT EXISTS public.rooms (
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
CREATE TABLE IF NOT EXISTS public.beds (
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
