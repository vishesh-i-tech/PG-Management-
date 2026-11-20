-- ============================================================================
-- Migration: 20261120000009_row_level_security.sql
-- Description: Complete Row Level Security policies and security definer helper functions for all 28 tables
-- Author: Senior Full-Stack Software Architect & Technical Lead
-- Version: 3.0.0
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
