-- ============================================================================
-- Migration: 20261120000008_functions_and_triggers.sql
-- Description: Business logic stored procedures, payment triggers, and operational RPCs
-- Author: Senior Full-Stack Software Architect & Technical Lead
-- Version: 3.0.0
-- ============================================================================

-- 1. OWNER ONBOARDING RPC
CREATE OR REPLACE FUNCTION public.create_new_pg_business(
    p_name TEXT,
    p_slug TEXT,
    p_address_line1 TEXT,
    p_address_line2 TEXT,
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

    IF LENGTH(TRIM(p_name)) < 3 THEN
        RAISE EXCEPTION 'PG name must be at least 3 characters.';
    END IF;

    INSERT INTO public.pgs (
        name, slug, address_line1, address_line2, city, state, pincode, contact_phone, gender_type
    ) VALUES (
        p_name, LOWER(TRIM(p_slug)), p_address_line1, p_address_line2, p_city, p_state, p_pincode, p_contact_phone, p_gender_type
    ) RETURNING id INTO v_pg_id;

    INSERT INTO public.pg_members (
        pg_id, user_id, role, status
    ) VALUES (
        v_pg_id, v_user_id, 'owner', 'active'
    );

    INSERT INTO public.audit_logs (
        pg_id, actor_user_id, action, entity_type, entity_id, details
    ) VALUES (
        v_pg_id, v_user_id, 'PG_CREATED', 'pgs', v_pg_id, jsonb_build_object('name', p_name, 'slug', p_slug)
    );

    RETURN v_pg_id;
END;
$$;
ALTER FUNCTION public.create_new_pg_business OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_new_pg_business FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_new_pg_business TO authenticated;

-- 2. PAYMENT IMMUTABILITY TRIGGER FUNCTION & TRIGGER
CREATE OR REPLACE FUNCTION public.trg_enforce_payment_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
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
ALTER FUNCTION public.trg_enforce_payment_immutability OWNER TO postgres;

DROP TRIGGER IF EXISTS trg_payments_immutable ON public.payments;
CREATE TRIGGER trg_payments_immutable
BEFORE UPDATE OR DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.trg_enforce_payment_immutability();

-- 3. PAYMENT RECONCILIATION RPC (ATOMIC WITH ADVISORY LOCKING)
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
BEGIN
    -- Advisory lock serializes concurrent execution for this payment ID
    PERFORM pg_advisory_xact_lock(hashtext(p_razorpay_payment_id));

    -- Idempotency check: if payment already recorded, return success
    IF EXISTS (SELECT 1 FROM public.payments WHERE razorpay_payment_id = p_razorpay_payment_id) THEN
        RETURN jsonb_build_object('success', true, 'status', 'already_processed');
    END IF;

    -- Lookup trusted order mapping
    SELECT po.*, t.phone, t.full_name
    INTO v_order
    FROM public.payment_orders po
    JOIN public.tenants t ON t.id = po.tenant_id AND t.pg_id = po.pg_id
    WHERE po.razorpay_order_id = p_razorpay_order_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Untrusted order: Razorpay order ID % not registered.', p_razorpay_order_id;
    END IF;

    -- Amount check
    IF p_captured_amount <> v_order.expected_amount THEN
        RAISE EXCEPTION 'Amount mismatch: Captured % does not match order %.', p_captured_amount, v_order.expected_amount;
    END IF;

    -- Lock target rent record
    SELECT id, total_due_amount, paid_amount, balance_amount, status
    INTO v_rent_record
    FROM public.rent_records
    WHERE id = v_order.target_rent_record_id AND pg_id = v_order.pg_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target rent record % not found in PG %.', v_order.target_rent_record_id, v_order.pg_id;
    END IF;

    -- Generate sequential receipt number
    v_receipt_number := 'RCP-' || TO_CHAR(NOW(), 'YYYYMM') || '-' || UPPER(SUBSTRING(gen_random_uuid()::TEXT FROM 1 FOR 6));

    -- Insert payment
    INSERT INTO public.payments (
        pg_id, tenant_id, amount, payment_method, payment_status,
        razorpay_order_id, razorpay_payment_id, razorpay_signature, receipt_number
    ) VALUES (
        v_order.pg_id, v_order.tenant_id, p_captured_amount, p_payment_method, 'successful',
        p_razorpay_order_id, p_razorpay_payment_id, p_signature, v_receipt_number
    ) RETURNING id INTO v_payment_id;

    -- Allocation calculation
    IF p_captured_amount <= v_rent_record.balance_amount THEN
        v_allocated_amount := p_captured_amount;
        v_unallocated_amount := 0.00;
    ELSE
        v_allocated_amount := v_rent_record.balance_amount;
        v_unallocated_amount := p_captured_amount - v_rent_record.balance_amount;
    END IF;

    IF v_allocated_amount > 0 THEN
        INSERT INTO public.payment_allocations (
            pg_id, tenant_id, payment_id, rent_record_id, allocated_amount, allocation_type
        ) VALUES (
            v_order.pg_id, v_order.tenant_id, v_payment_id, v_rent_record.id, v_allocated_amount, 'payment'
        );

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

    UPDATE public.payment_orders
    SET status = 'paid', updated_at = NOW()
    WHERE id = v_order.id;

    -- Enqueue WhatsApp receipt
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
ALTER FUNCTION public.reconcile_payment_transaction OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reconcile_payment_transaction FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_payment_transaction TO authenticated, service_role;

-- 4. PROCESS PAYMENT REFUND RPC
CREATE OR REPLACE FUNCTION public.process_payment_refund(
    p_payment_id UUID,
    p_refund_amount NUMERIC(10, 2),
    p_razorpay_refund_id TEXT,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_pay RECORD;
    v_alloc RECORD;
    v_remaining_refund NUMERIC(10, 2) := p_refund_amount;
    v_reverse_amt NUMERIC(10, 2);
    v_refund_id UUID;
BEGIN
    SELECT * INTO v_pay FROM public.payments WHERE id = p_payment_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found.'; END IF;

    IF p_refund_amount > v_pay.amount THEN
        RAISE EXCEPTION 'Refund amount exceeds original payment amount.';
    END IF;

    INSERT INTO public.payment_refunds (
        pg_id, payment_id, razorpay_refund_id, amount, reason, status, initiated_by_user_id
    ) VALUES (
        v_pay.pg_id, v_pay.id, p_razorpay_refund_id, p_refund_amount, p_reason, 'processed', auth.uid()
    ) RETURNING id INTO v_refund_id;

    -- Reverse allocations starting from newest
    FOR v_alloc IN 
        SELECT * FROM public.payment_allocations 
        WHERE payment_id = p_payment_id AND allocation_type = 'payment'
        ORDER BY allocated_at DESC
    LOOP
        EXIT WHEN v_remaining_refund <= 0;
        v_reverse_amt := LEAST(v_remaining_refund, v_alloc.allocated_amount);

        INSERT INTO public.payment_allocations (
            pg_id, tenant_id, payment_id, rent_record_id, allocated_amount, allocation_type
        ) VALUES (
            v_pay.pg_id, v_alloc.tenant_id, v_pay.id, v_alloc.rent_record_id, v_reverse_amt, 'reversal'
        );

        UPDATE public.rent_records
        SET paid_amount = paid_amount - v_reverse_amt,
            balance_amount = balance_amount + v_reverse_amt,
            status = 'partially_paid',
            updated_at = NOW()
        WHERE id = v_alloc.rent_record_id;

        v_remaining_refund := v_remaining_refund - v_reverse_amt;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'refund_id', v_refund_id, 'refunded_amount', p_refund_amount);
END;
$$;
ALTER FUNCTION public.process_payment_refund OWNER TO postgres;
REVOKE ALL ON FUNCTION public.process_payment_refund FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_payment_refund TO authenticated;

-- 5. RENT BALANCE RECONCILIATION REPAIR RPC
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
    v_actual_reversals NUMERIC(10, 2) := 0.00;
    v_net_paid NUMERIC(10, 2);
    v_computed_total NUMERIC(10, 2);
    v_computed_balance NUMERIC(10, 2);
BEGIN
    SELECT * INTO v_rec FROM public.rent_records WHERE id = p_rent_record_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Rent record not found.'; END IF;

    SELECT COALESCE(SUM(amount), 0.00) INTO v_actual_adjustments
    FROM public.rent_adjustments WHERE rent_record_id = p_rent_record_id;

    SELECT COALESCE(SUM(allocated_amount), 0.00) INTO v_actual_allocations
    FROM public.payment_allocations WHERE rent_record_id = p_rent_record_id AND allocation_type = 'payment';

    SELECT COALESCE(SUM(allocated_amount), 0.00) INTO v_actual_reversals
    FROM public.payment_allocations WHERE rent_record_id = p_rent_record_id AND allocation_type = 'reversal';

    v_net_paid := v_actual_allocations - v_actual_reversals;
    v_computed_total := v_rec.base_rent_amount + v_rec.utility_charges + v_rec.late_fee_amount - v_rec.discount_amount + v_actual_adjustments;
    v_computed_balance := GREATEST(0.00, v_computed_total - v_net_paid);

    IF v_computed_total <> v_rec.total_due_amount OR v_net_paid <> v_rec.paid_amount OR v_computed_balance <> v_rec.balance_amount THEN
        UPDATE public.rent_records
        SET total_due_amount = v_computed_total,
            paid_amount = v_net_paid,
            balance_amount = v_computed_balance,
            status = CASE WHEN v_computed_balance <= 0 THEN 'paid' WHEN v_net_paid > 0 THEN 'partially_paid' ELSE 'pending' END,
            updated_at = NOW()
        WHERE id = p_rent_record_id;

        INSERT INTO public.audit_logs (pg_id, action, entity_type, entity_id, details)
        VALUES (v_rec.pg_id, 'LEDGER_RECONCILED', 'rent_records', p_rent_record_id, jsonb_build_object(
            'old_balance', v_rec.balance_amount, 'new_balance', v_computed_balance,
            'old_paid', v_rec.paid_amount, 'new_paid', v_net_paid
        ));

        RETURN jsonb_build_object('status', 'repaired', 'rent_record_id', p_rent_record_id);
    END IF;

    RETURN jsonb_build_object('status', 'in_sync', 'rent_record_id', p_rent_record_id);
END;
$$;
ALTER FUNCTION public.reconcile_rent_record_ledger OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reconcile_rent_record_ledger FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_rent_record_ledger TO authenticated;

-- 6. ACCEPT TENANT INVITATION RPC
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

    SELECT phone INTO v_user_phone FROM auth.users WHERE id = v_user_id;
    IF v_user_phone IS NULL THEN RAISE EXCEPTION 'User phone number not verified in auth.'; END IF;

    v_token_hash := encode(digest(p_plaintext_token, 'sha256'), 'hex');

    SELECT * INTO v_invite
    FROM public.tenant_invitations
    WHERE token_hash = v_token_hash
      AND status = 'pending'
      AND expires_at > NOW()
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid, expired, or previously accepted invitation token.'; END IF;

    IF v_user_phone <> v_invite.phone THEN
        RAISE EXCEPTION 'Phone mismatch: Authenticated number does not match invited number.';
    END IF;

    UPDATE public.tenants
    SET user_id = v_user_id, updated_at = NOW()
    WHERE id = v_invite.tenant_id AND pg_id = v_invite.pg_id;

    INSERT INTO public.pg_members (pg_id, user_id, role, status)
    VALUES (v_invite.pg_id, v_user_id, 'tenant', 'active')
    ON CONFLICT (pg_id, user_id) DO UPDATE SET status = 'active', role = 'tenant';

    UPDATE public.tenant_invitations
    SET status = 'accepted', accepted_by_user_id = v_user_id, accepted_at = NOW()
    WHERE id = v_invite.id;

    RETURN jsonb_build_object('success', true, 'pg_id', v_invite.pg_id, 'tenant_id', v_invite.tenant_id);
END;
$$;
ALTER FUNCTION public.accept_tenant_invitation OWNER TO postgres;
REVOKE ALL ON FUNCTION public.accept_tenant_invitation FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_tenant_invitation TO authenticated;

-- 7. ACCEPT STAFF INVITATION RPC
CREATE OR REPLACE FUNCTION public.accept_staff_invitation(p_plaintext_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_token_hash TEXT;
    v_invite RECORD;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;

    v_token_hash := encode(digest(p_plaintext_token, 'sha256'), 'hex');

    SELECT * INTO v_invite
    FROM public.staff_invitations
    WHERE token_hash = v_token_hash
      AND status = 'pending'
      AND expires_at > NOW()
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid or expired staff invitation token.'; END IF;

    INSERT INTO public.pg_members (pg_id, user_id, role, status)
    VALUES (v_invite.pg_id, v_user_id, v_invite.designated_role, 'active')
    ON CONFLICT (pg_id, user_id) DO UPDATE SET status = 'active', role = v_invite.designated_role;

    UPDATE public.staff_invitations
    SET status = 'accepted', accepted_by_user_id = v_user_id, accepted_at = NOW()
    WHERE id = v_invite.id;

    RETURN jsonb_build_object('success', true, 'pg_id', v_invite.pg_id, 'role', v_invite.designated_role);
END;
$$;
ALTER FUNCTION public.accept_staff_invitation OWNER TO postgres;
REVOKE ALL ON FUNCTION public.accept_staff_invitation FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_staff_invitation TO authenticated;

-- 8. CLAIM NOTIFICATION JOBS (ATOMIC WORKER BATCH)
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
ALTER FUNCTION public.claim_notification_jobs OWNER TO postgres;
REVOKE ALL ON FUNCTION public.claim_notification_jobs FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_notification_jobs TO service_role;

-- 9. RECOVER STUCK NOTIFICATION JOBS
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
ALTER FUNCTION public.recover_stuck_notification_jobs OWNER TO postgres;
REVOKE ALL ON FUNCTION public.recover_stuck_notification_jobs FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recover_stuck_notification_jobs TO service_role;

-- 10. RECORD GATE MOVEMENT RPC
CREATE OR REPLACE FUNCTION public.record_gate_movement(
    p_pg_id UUID,
    p_tenant_id UUID,
    p_event_type TEXT,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_closing_time TIME;
    v_is_late BOOLEAN := FALSE;
    v_new_state TEXT;
    v_cur_time_ist TIME;
BEGIN
    SELECT gate_closing_time INTO v_closing_time FROM public.pgs WHERE id = p_pg_id;
    v_cur_time_ist := (NOW() AT TIME ZONE 'Asia/Kolkata')::time;

    IF p_event_type IN ('check_in', 'late_check_in') THEN
        v_new_state := 'inside';
        IF v_cur_time_ist > v_closing_time OR p_event_type = 'late_check_in' THEN
            v_is_late := TRUE;
        END IF;
    ELSE
        v_new_state := 'outside';
    END IF;

    INSERT INTO public.gate_events (
        pg_id, tenant_id, event_type, is_late, verified_by_user_id, notes
    ) VALUES (
        p_pg_id, p_tenant_id, p_event_type, v_is_late, auth.uid(), p_notes
    );

    INSERT INTO public.tenant_gate_states (
        pg_id, tenant_id, current_state, last_event_at, last_event_type, updated_at
    ) VALUES (
        p_pg_id, p_tenant_id, v_new_state, NOW(), p_event_type, NOW()
    )
    ON CONFLICT (pg_id, tenant_id) DO UPDATE SET
        current_state = v_new_state,
        last_event_at = NOW(),
        last_event_type = p_event_type,
        updated_at = NOW();

    RETURN jsonb_build_object('success', true, 'current_state', v_new_state, 'is_late', v_is_late);
END;
$$;
ALTER FUNCTION public.record_gate_movement OWNER TO postgres;
REVOKE ALL ON FUNCTION public.record_gate_movement FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_gate_movement TO authenticated;

-- 11. GET TENANTS OUTSIDE FOR GATE ALERT (IST 45-MIN WINDOW)
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
      AND (p_target_time AT TIME ZONE 'Asia/Kolkata')::time >= (p.gate_closing_time - INTERVAL '45 minutes')
      AND (p_target_time AT TIME ZONE 'Asia/Kolkata')::time < p.gate_closing_time
      AND NOT EXISTS (
          SELECT 1 FROM public.notification_jobs nj
          WHERE nj.pg_id = p.id
            AND nj.recipient_phone = t.phone
            AND nj.idempotency_key = 'gate_alert_' || p.id || '_' || t.id || '_' || TO_CHAR(p_target_time AT TIME ZONE 'Asia/Kolkata', 'YYYYMMDD')
      );
$$;
ALTER FUNCTION public.get_tenants_outside_for_gate_alert OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_tenants_outside_for_gate_alert FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tenants_outside_for_gate_alert TO authenticated, service_role;
