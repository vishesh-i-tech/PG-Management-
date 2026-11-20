-- ============================================================================
-- Migration: 20261120000005_operations_and_crm.sql
-- Description: Operations, complaints, expenses, gate movements, night out workflows, inquiries, and mess menu
-- Author: Senior Full-Stack Software Architect & Technical Lead
-- Version: 3.0.0
-- ============================================================================

-- 16. COMPLAINTS
CREATE TABLE IF NOT EXISTS public.complaints (
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
CREATE TABLE IF NOT EXISTS public.complaint_status_history (
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
CREATE TABLE IF NOT EXISTS public.expenses (
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
CREATE TABLE IF NOT EXISTS public.gate_events (
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
CREATE TABLE IF NOT EXISTS public.night_out_requests (
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
CREATE TABLE IF NOT EXISTS public.tenant_gate_states (
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
CREATE TABLE IF NOT EXISTS public.inquiries (
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
CREATE TABLE IF NOT EXISTS public.inquiry_follow_ups (
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
CREATE TABLE IF NOT EXISTS public.mess_menu (
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
