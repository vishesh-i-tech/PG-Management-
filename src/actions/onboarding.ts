"use server";

import { createClient } from "@/lib/supabase/server";
import { formatToE164, isValidIndianPhone } from "@/lib/auth/phone-validation";
import { revalidatePath } from "next/cache";

export interface CreatePGResult {
  success: boolean;
  pgId?: string;
  error?: string;
}

/**
 * Server Action: Creates a new PG business and sets authenticated user as owner
 * Executes atomic SECURITY DEFINER RPC `create_new_pg_business`.
 */
export async function createPGBusinessAction(formData: FormData): Promise<CreatePGResult> {
  const supabase = await createClient();

  // Verify authentication
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { success: false, error: "Authentication required to create a PG." };
  }

  // Extract form inputs
  const name = formData.get("name")?.toString()?.trim() || "";
  let slug = formData.get("slug")?.toString()?.trim() || "";
  const addressLine1 = formData.get("addressLine1")?.toString()?.trim() || "";
  const addressLine2 = formData.get("addressLine2")?.toString()?.trim() || "";
  const city = formData.get("city")?.toString()?.trim() || "";
  const state = formData.get("state")?.toString()?.trim() || "";
  const pincode = formData.get("pincode")?.toString()?.trim() || "";
  const rawContactPhone = formData.get("contactPhone")?.toString()?.trim() || "";
  const genderType = formData.get("genderType")?.toString()?.trim() || "coed";
  const fullName = formData.get("fullName")?.toString()?.trim() || "";

  // Validation
  if (name.length < 3) {
    return { success: false, error: "PG property name must be at least 3 characters." };
  }

  if (!slug) {
    slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  } else {
    slug = slug.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  if (!addressLine1 || !city || !state) {
    return { success: false, error: "Address line 1, city, and state are required." };
  }

  if (!/^\d{6}$/.test(pincode)) {
    return { success: false, error: "Pincode must be exactly 6 digits." };
  }

  if (!rawContactPhone || !isValidIndianPhone(rawContactPhone)) {
    return { success: false, error: "Contact phone must be a valid 10-digit Indian mobile number." };
  }

  let formattedContactPhone: string;
  try {
    formattedContactPhone = formatToE164(rawContactPhone);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Invalid phone format.";
    return { success: false, error: msg };
  }

  if (!["boys", "girls", "coed"].includes(genderType)) {
    return { success: false, error: "Invalid gender type. Allowed: boys, girls, coed." };
  }

  // Ensure user profile exists
  const effectiveName = fullName || user.user_metadata?.full_name || "PG Owner";
  const userPhone = user.phone || formattedContactPhone;

  await supabase.from("user_profiles").upsert(
    {
      id: user.id,
      phone: userPhone,
      full_name: effectiveName,
      email: user.email || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  // Invoke atomic RPC: create_new_pg_business
  const { data: pgId, error: rpcError } = await supabase.rpc("create_new_pg_business", {
    p_name: name,
    p_slug: slug,
    p_address_line1: addressLine1,
    p_address_line2: addressLine2 || null,
    p_city: city,
    p_state: state,
    p_pincode: pincode,
    p_contact_phone: formattedContactPhone,
    p_gender_type: genderType,
  });

  if (rpcError) {
    return { success: false, error: rpcError.message };
  }

  revalidatePath("/", "layout");
  return { success: true, pgId: pgId as string };
}
