"use server";

import { createClient } from "@/lib/supabase/server";
import { formatToE164, isValidIndianPhone } from "@/lib/auth/phone-validation";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "./rooms";
import type { IdProofType } from "@/types/database.types";

export async function createTenantAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  if (authErr || !user) {
    return { success: false, error: "Authentication required." };
  }

  const pgId = formData.get("pg_id")?.toString();
  const fullName = formData.get("full_name")?.toString()?.trim();
  const phone = formData.get("phone")?.toString()?.trim();
  const email = formData.get("email")?.toString()?.trim() || null;
  const emergencyContactName = formData.get("emergency_contact_name")?.toString()?.trim();
  const emergencyContactPhone = formData.get("emergency_contact_phone")?.toString()?.trim();
  const workplaceOrCollege = formData.get("workplace_or_college")?.toString()?.trim() || null;
  const permanentAddress = formData.get("permanent_address")?.toString()?.trim() || null;
  const joiningDate = formData.get("joining_date")?.toString() || new Date().toISOString().split("T")[0];
  const securityDepositAmount = parseFloat(formData.get("security_deposit_amount")?.toString() || "0");
  const bedId = formData.get("bed_id")?.toString()?.trim();

  if (!pgId || !fullName || !phone || !emergencyContactName || !emergencyContactPhone) {
    return { success: false, error: "Name, phone, and emergency contact details are mandatory." };
  }

  if (!isValidIndianPhone(phone)) {
    return { success: false, error: "Please enter a valid 10-digit Indian phone number for tenant." };
  }

  let formattedPhone: string;
  let formattedEmergencyPhone: string;
  try {
    formattedPhone = formatToE164(phone);
    formattedEmergencyPhone = formatToE164(emergencyContactPhone);
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Invalid phone number." };
  }

  // 1. Insert tenant
  const { data: tenant, error: tenantErr } = await supabase
    .from("tenants")
    .insert({
      pg_id: pgId,
      full_name: fullName,
      phone: formattedPhone,
      email,
      emergency_contact_name: emergencyContactName,
      emergency_contact_phone: formattedEmergencyPhone,
      emergency_contact_relation: "Guardian",
      employer_or_college: workplaceOrCollege,
      permanent_address: permanentAddress,
      security_deposit_amount: isNaN(securityDepositAmount) ? 0 : securityDepositAmount,
      security_deposit_status: securityDepositAmount > 0 ? "paid" : "pending",
      status: "active",
    })
    .select()
    .single();

  if (tenantErr) {
    return { success: false, error: tenantErr.message };
  }

  // 2. If bed_id provided, assign bed immediately
  if (bedId) {
    const { data: bed } = await supabase
      .from("beds")
      .select("monthly_rent")
      .eq("id", bedId)
      .eq("pg_id", pgId)
      .single();

    const agreedRent = bed?.monthly_rent || 0;

    const { error: assignErr } = await supabase
      .from("tenant_bed_assignments")
      .insert({
        pg_id: pgId,
        tenant_id: tenant.id,
        bed_id: bedId,
        agreed_monthly_rent: agreedRent,
        assigned_from: joiningDate,
        is_active: true,
      });

    if (assignErr) {
      return { 
        success: true, 
        data: tenant, 
        error: `Tenant created, but bed assignment failed: ${assignErr.message}` 
      };
    }

    // Update bed status to occupied
    await supabase
      .from("beds")
      .update({ status: "occupied", updated_at: new Date().toISOString() })
      .eq("id", bedId)
      .eq("pg_id", pgId);
  }

  revalidatePath("/owner");
  revalidatePath("/warden");
  return { success: true, data: tenant };
}

export async function assignBedAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  if (authErr || !user) {
    return { success: false, error: "Authentication required." };
  }

  const pgId = formData.get("pg_id")?.toString();
  const tenantId = formData.get("tenant_id")?.toString();
  const bedId = formData.get("bed_id")?.toString();
  const agreedMonthlyRent = parseFloat(formData.get("agreed_monthly_rent")?.toString() || "0");
  const assignedFrom = formData.get("assigned_from")?.toString() || new Date().toISOString().split("T")[0];

  if (!pgId || !tenantId || !bedId || isNaN(agreedMonthlyRent) || agreedMonthlyRent <= 0) {
    return { success: false, error: "Valid tenant, bed, and agreed monthly rent are required." };
  }

  const { error: assignErr } = await supabase
    .from("tenant_bed_assignments")
    .insert({
      pg_id: pgId,
      tenant_id: tenantId,
      bed_id: bedId,
      agreed_monthly_rent: agreedMonthlyRent,
      assigned_from: assignedFrom,
      is_active: true,
    });

  if (assignErr) {
    return { success: false, error: assignErr.message };
  }

  // Update bed status
  await supabase
    .from("beds")
    .update({ status: "occupied", updated_at: new Date().toISOString() })
    .eq("id", bedId)
    .eq("pg_id", pgId);

  revalidatePath("/owner");
  revalidatePath("/warden");
  return { success: true };
}

export async function vacateBedAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  if (authErr || !user) {
    return { success: false, error: "Authentication required." };
  }

  const pgId = formData.get("pg_id")?.toString();
  const assignmentId = formData.get("assignment_id")?.toString();
  const bedId = formData.get("bed_id")?.toString();
  const tenantId = formData.get("tenant_id")?.toString();
  const vacatingDate = formData.get("vacating_date")?.toString() || new Date().toISOString().split("T")[0];

  if (!pgId || !assignmentId || !bedId || !tenantId) {
    return { success: false, error: "Missing assignment or bed identifiers." };
  }

  // 1. Mark assignment inactive
  const { error: assignErr } = await supabase
    .from("tenant_bed_assignments")
    .update({
      is_active: false,
      assigned_to: vacatingDate,
      vacating_date: vacatingDate,
      updated_at: new Date().toISOString(),
    })
    .eq("id", assignmentId)
    .eq("pg_id", pgId);

  if (assignErr) {
    return { success: false, error: assignErr.message };
  }

  // 2. Set bed status back to vacant
  await supabase
    .from("beds")
    .update({ status: "vacant", updated_at: new Date().toISOString() })
    .eq("id", bedId)
    .eq("pg_id", pgId);

  // 3. Update tenant status to vacated
  await supabase
    .from("tenants")
    .update({ status: "vacated", updated_at: new Date().toISOString() })
    .eq("id", tenantId)
    .eq("pg_id", pgId);

  revalidatePath("/owner");
  revalidatePath("/warden");
  return { success: true };
}

export async function uploadKycDocumentAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  if (authErr || !user) {
    return { success: false, error: "Authentication required." };
  }

  const pgId = formData.get("pg_id")?.toString();
  const tenantId = formData.get("tenant_id")?.toString();
  const idProofType = formData.get("id_proof_type")?.toString() as IdProofType;
  const idProofLastFour = formData.get("id_proof_last_four")?.toString()?.trim();
  const file = formData.get("file") as File | null;

  if (!pgId || !tenantId || !idProofType || !idProofLastFour || !file) {
    return { success: false, error: "ID proof type, last 4 digits, and document file are required." };
  }

  if (idProofLastFour.length !== 4) {
    return { success: false, error: "Please enter exactly the last 4 digits of the identity card." };
  }

  // Upload to tenant-kyc-documents bucket with private path: {pg_id}/{tenant_id}/{filename}
  const fileExt = file.name.split(".").pop() || "pdf";
  const storagePath = `${pgId}/${tenantId}/${Date.now()}_kyc.${fileExt}`;

  const { error: uploadErr } = await supabase.storage
    .from("tenant-kyc-documents")
    .upload(storagePath, file, {
      upsert: true,
      contentType: file.type || "application/octet-stream",
    });

  if (uploadErr) {
    return { success: false, error: `Document upload failed: ${uploadErr.message}` };
  }

  // Insert sensitive KYC record
  const { error: dbErr } = await supabase
    .from("tenant_sensitive_kyc")
    .insert({
      pg_id: pgId,
      tenant_id: tenantId,
      id_proof_type: idProofType,
      id_proof_last_four: idProofLastFour,
      document_storage_path: storagePath,
      verified_by_user_id: user.id,
      verified_at: new Date().toISOString(),
    });

  if (dbErr) {
    return { success: false, error: dbErr.message };
  }

  revalidatePath("/owner");
  revalidatePath("/warden");
  return { success: true };
}
