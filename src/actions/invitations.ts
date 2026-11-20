"use server";

import { createClient } from "@/lib/supabase/server";
import { formatToE164, isValidIndianPhone } from "@/lib/auth/phone-validation";
import {
  generateInvitationToken,
  hashInvitationToken,
  getInvitationExpiryDate,
} from "@/lib/auth/tokens";
import { revalidatePath } from "next/cache";

export interface CreateInviteResult {
  success: boolean;
  plaintextToken?: string;
  inviteLink?: string;
  error?: string;
}

export interface AcceptInviteResult {
  success: boolean;
  role?: string;
  pgId?: string;
  redirectUrl?: string;
  error?: string;
}

/**
 * Creates a staff invitation (warden or co-owner).
 * Restrictable to PG Owners only.
 */
export async function createStaffInvitationAction(
  pgId: string,
  emailOrPhone: string,
  designatedRole: "warden" | "owner"
): Promise<CreateInviteResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Authentication required." };
  }

  // Generate cryptographic token & hash
  const plaintextToken = generateInvitationToken();
  const tokenHash = hashInvitationToken(plaintextToken);
  const expiresAt = getInvitationExpiryDate(7);

  const { error: insertError } = await supabase.from("staff_invitations").insert({
    pg_id: pgId,
    email_or_phone: emailOrPhone.trim(),
    designated_role: designatedRole,
    token_hash: tokenHash,
    expires_at: expiresAt,
    invited_by_user_id: user.id,
    status: "pending",
  });

  if (insertError) {
    return { success: false, error: insertError.message };
  }

  return {
    success: true,
    plaintextToken,
    inviteLink: `/invite/${plaintextToken}`,
  };
}

/**
 * Creates an invitation for an active tenant directory entry.
 * Can be called by PG Owner or Warden.
 */
export async function createTenantInvitationAction(
  pgId: string,
  tenantId: string,
  tenantPhone: string
): Promise<CreateInviteResult> {
  const supabase = await createClient();

  if (!isValidIndianPhone(tenantPhone)) {
    return { success: false, error: "Tenant phone must be a valid 10-digit Indian mobile number." };
  }

  let formattedPhone: string;
  try {
    formattedPhone = formatToE164(tenantPhone);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Invalid phone format.";
    return { success: false, error: msg };
  }

  const plaintextToken = generateInvitationToken();
  const tokenHash = hashInvitationToken(plaintextToken);
  const expiresAt = getInvitationExpiryDate(7);

  const { error: insertError } = await supabase.from("tenant_invitations").insert({
    pg_id: pgId,
    tenant_id: tenantId,
    phone: formattedPhone,
    token_hash: tokenHash,
    expires_at: expiresAt,
    status: "pending",
  });

  if (insertError) {
    return { success: false, error: insertError.message };
  }

  return {
    success: true,
    plaintextToken,
    inviteLink: `/invite/${plaintextToken}`,
  };
}

/**
 * Redeems an invitation token (automatically routes to tenant or staff RPC).
 */
export async function acceptInvitationAction(plaintextToken: string): Promise<AcceptInviteResult> {
  const supabase = await createClient();

  const cleanToken = plaintextToken.trim();
  if (!cleanToken) {
    return { success: false, error: "Invitation token cannot be empty." };
  }

  // 1. Try redeeming as Tenant Invitation first
  const { data: tenantResult, error: tenantError } = await supabase.rpc(
    "accept_tenant_invitation",
    { p_plaintext_token: cleanToken }
  );

  if (!tenantError && tenantResult) {
    revalidatePath("/", "layout");
    return {
      success: true,
      role: "tenant",
      pgId: (tenantResult as { pg_id?: string })?.pg_id,
      redirectUrl: "/tenant",
    };
  }

  // 2. If not tenant invite, try Staff Invitation
  const { data: staffResult, error: staffError } = await supabase.rpc(
    "accept_staff_invitation",
    { p_plaintext_token: cleanToken }
  );

  if (!staffError && staffResult) {
    const role = (staffResult as { role?: string })?.role || "warden";
    revalidatePath("/", "layout");
    return {
      success: true,
      role,
      pgId: (staffResult as { pg_id?: string })?.pg_id,
      redirectUrl: role === "owner" ? "/owner" : "/warden",
    };
  }

  // Return the error message from staff or tenant
  const errorMessage =
    staffError?.message ||
    tenantError?.message ||
    "Invalid, expired, or previously redeemed invitation token.";

  return { success: false, error: errorMessage };
}
