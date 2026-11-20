"use server";

import { createClient } from "@/lib/supabase/server";
import { formatToE164 } from "@/lib/auth/phone-validation";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export interface SyncProfileResult {
  success: boolean;
  error?: string;
}

/**
 * Ensures user_profiles table is populated with user's full name and phone number.
 */
export async function syncUserProfile(formData: FormData): Promise<SyncProfileResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: "Authentication required." };
  }

  const fullName = formData.get("fullName")?.toString()?.trim();
  const rawPhone = formData.get("phone")?.toString()?.trim() || user.phone || "";

  if (!fullName || fullName.length < 2) {
    return { success: false, error: "Full name must be at least 2 characters." };
  }

  let formattedPhone = user.phone;
  if (rawPhone) {
    try {
      formattedPhone = formatToE164(rawPhone);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid phone number format.";
      return { success: false, error: msg };
    }
  }

  if (!formattedPhone) {
    return { success: false, error: "A valid verified phone number is required." };
  }

  const { error: upsertError } = await supabase.from("user_profiles").upsert(
    {
      id: user.id,
      phone: formattedPhone,
      full_name: fullName,
      email: user.email || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  if (upsertError) {
    return { success: false, error: upsertError.message };
  }

  revalidatePath("/", "layout");
  return { success: true };
}

/**
 * Signs the user out and clears session cookies.
 */
export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/auth/login");
}
