"use server";

import { createClient } from "@/lib/supabase/server";
import { formatToE164, isValidIndianPhone } from "@/lib/auth/phone-validation";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "./rooms";
import type { RoomType, InquirySource, InquiryStatus, FollowUpChannel } from "@/types/database.types";

export async function createInquiryAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  if (authErr || !user) {
    return { success: false, error: "Authentication required." };
  }

  const pgId = formData.get("pg_id")?.toString();
  const prospectName = formData.get("prospect_name")?.toString()?.trim();
  const rawPhone = formData.get("phone")?.toString()?.trim();
  const email = formData.get("email")?.toString()?.trim() || null;
  const desiredRoomType = (formData.get("desired_room_type")?.toString() || null) as RoomType | null;
  const expectedJoiningDate = formData.get("expected_joining_date")?.toString() || null;
  const budget = parseFloat(formData.get("budget")?.toString() || "0");
  const source = (formData.get("source")?.toString() || "walk_in") as InquirySource;
  const notes = formData.get("notes")?.toString()?.trim() || null;

  if (!pgId || !prospectName || !rawPhone) {
    return { success: false, error: "Prospect name and contact phone are required." };
  }

  if (!isValidIndianPhone(rawPhone)) {
    return { success: false, error: "Please enter a valid 10-digit Indian phone number." };
  }

  let formattedPhone: string;
  try {
    formattedPhone = formatToE164(rawPhone);
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Invalid phone number." };
  }

  const { data, error } = await supabase
    .from("inquiries")
    .insert({
      pg_id: pgId,
      prospect_name: prospectName,
      phone: formattedPhone,
      email,
      desired_room_type: desiredRoomType,
      expected_joining_date: expectedJoiningDate,
      budget: isNaN(budget) || budget <= 0 ? null : budget,
      source,
      status: "new",
      notes,
    })
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/owner");
  revalidatePath("/warden");
  return { success: true, data };
}

export async function addInquiryFollowUpAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  if (authErr || !user) {
    return { success: false, error: "Authentication required." };
  }

  const pgId = formData.get("pg_id")?.toString();
  const inquiryId = formData.get("inquiry_id")?.toString();
  const channel = (formData.get("channel")?.toString() || "phone_call") as FollowUpChannel;
  const notes = formData.get("notes")?.toString()?.trim();

  if (!pgId || !inquiryId || !notes) {
    return { success: false, error: "Follow up notes are required." };
  }

  const { error } = await supabase.from("inquiry_follow_ups").insert({
    pg_id: pgId,
    inquiry_id: inquiryId,
    contacted_by_user_id: user.id,
    follow_up_channel: channel,
    notes,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/owner");
  revalidatePath("/warden");
  return { success: true };
}

export async function updateInquiryStatusAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  if (authErr || !user) {
    return { success: false, error: "Authentication required." };
  }

  const pgId = formData.get("pg_id")?.toString();
  const inquiryId = formData.get("inquiry_id")?.toString();
  const status = formData.get("status")?.toString() as InquiryStatus;

  if (!pgId || !inquiryId || !status) {
    return { success: false, error: "Inquiry ID and new status are required." };
  }

  const { error } = await supabase
    .from("inquiries")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", inquiryId)
    .eq("pg_id", pgId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/owner");
  revalidatePath("/warden");
  return { success: true };
}
