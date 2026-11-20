-- ============================================================================
-- Migration: 20261120000010_storage_buckets_and_policies.sql
-- Description: Supabase Storage bucket initialization and granular multi-tenant access control policies
-- Author: Senior Full-Stack Software Architect & Technical Lead
-- Version: 3.0.0
-- ============================================================================

-- BUCKET CREATION (Private Buckets)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
('tenant-kyc-documents', 'tenant-kyc-documents', false, 5242880, ARRAY['image/jpeg', 'image/png', 'application/pdf']),
('complaint-attachments', 'complaint-attachments', false, 10485760, ARRAY['image/jpeg', 'image/png']),
('payment-receipts', 'payment-receipts', false, 2097152, ARRAY['application/pdf']),
('pg-public-assets', 'pg-public-assets', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- 1. KYC STORAGE POLICIES
-- Folder naming convention: {pg_id}/{tenant_id}/{filename}
CREATE POLICY kyc_storage_staff_read ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'tenant-kyc-documents'
    AND public.get_auth_user_role((storage.foldername(name))[1]::uuid) IN ('owner', 'warden')
);

CREATE POLICY kyc_storage_tenant_read ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'tenant-kyc-documents'
    AND (storage.foldername(name))[2]::uuid = public.get_auth_any_tenant_id((storage.foldername(name))[1]::uuid)
);

CREATE POLICY kyc_storage_staff_upload ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'tenant-kyc-documents'
    AND public.get_auth_user_role((storage.foldername(name))[1]::uuid) IN ('owner', 'warden')
);

CREATE POLICY kyc_storage_tenant_upload ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'tenant-kyc-documents'
    AND (storage.foldername(name))[2]::uuid = public.get_auth_active_tenant_id((storage.foldername(name))[1]::uuid)
);

-- 2. COMPLAINT ATTACHMENTS POLICIES
-- Folder naming convention: {pg_id}/{complaint_id}/{filename}
CREATE POLICY comp_storage_read ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'complaint-attachments'
    AND public.get_auth_user_role((storage.foldername(name))[1]::uuid) IS NOT NULL
);

CREATE POLICY comp_storage_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'complaint-attachments'
    AND (
        public.get_auth_user_role((storage.foldername(name))[1]::uuid) IN ('owner', 'warden')
        OR public.get_auth_active_tenant_id((storage.foldername(name))[1]::uuid) IS NOT NULL
    )
);

-- 3. PAYMENT RECEIPTS POLICIES
-- Folder naming convention: {pg_id}/{receipt_number}.pdf
CREATE POLICY receipt_storage_read ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'payment-receipts'
    AND public.get_auth_user_role((storage.foldername(name))[1]::uuid) IS NOT NULL
);

CREATE POLICY receipt_storage_service_insert ON storage.objects FOR INSERT TO service_role
WITH CHECK (bucket_id = 'payment-receipts');
