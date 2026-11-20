-- ============================================================================
-- Migration: 20261120000007_performance_indexes.sql
-- Description: Performance and concurrency indexes for high-throughput sub-10ms queries
-- Author: Senior Full-Stack Software Architect & Technical Lead
-- Version: 3.0.0
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_pg_members_lookup ON public.pg_members(user_id, pg_id, status);
CREATE INDEX IF NOT EXISTS idx_rooms_lookup ON public.rooms(pg_id, status);
CREATE INDEX IF NOT EXISTS idx_beds_lookup ON public.beds(room_id, status);
CREATE INDEX IF NOT EXISTS idx_tenants_lookup ON public.tenants(pg_id, status, phone);
CREATE INDEX IF NOT EXISTS idx_assignments_active ON public.tenant_bed_assignments(bed_id, tenant_id) WHERE (is_active = TRUE);
CREATE INDEX IF NOT EXISTS idx_rent_records_billing ON public.rent_records(pg_id, billing_month, status);
CREATE INDEX IF NOT EXISTS idx_rent_records_tenant ON public.rent_records(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_payment_orders_order_id ON public.payment_orders(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_lookup ON public.payments(pg_id, tenant_id, payment_status);
CREATE INDEX IF NOT EXISTS idx_allocations_rent ON public.payment_allocations(rent_record_id);
CREATE INDEX IF NOT EXISTS idx_complaints_pg_status ON public.complaints(pg_id, status);
CREATE INDEX IF NOT EXISTS idx_gate_events_tenant ON public.gate_events(tenant_id, logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_jobs_poll ON public.notification_jobs(status, next_attempt_at) WHERE status IN ('queued', 'retry');
CREATE INDEX IF NOT EXISTS idx_webhook_events_lookup ON public.webhook_events(provider, event_id);
