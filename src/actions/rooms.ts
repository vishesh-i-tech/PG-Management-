"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { RoomType, BedStatus } from "@/types/database.types";

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export async function createRoomAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  if (authErr || !user) {
    return { success: false, error: "Authentication required." };
  }

  const pgId = formData.get("pg_id")?.toString();
  const roomNumber = formData.get("room_number")?.toString()?.trim();
  const floorNumber = parseInt(formData.get("floor_number")?.toString() || "0", 10);
  const roomType = formData.get("room_type")?.toString() as RoomType;
  const baseMonthlyRent = parseFloat(formData.get("base_monthly_rent")?.toString() || "0");
  const hasAttachedBathroom = formData.get("has_attached_bathroom") === "true";
  const hasAc = formData.get("has_ac") === "true";
  const hasBalcony = formData.get("has_balcony") === "true";

  if (!pgId || !roomNumber || !roomType || isNaN(baseMonthlyRent) || baseMonthlyRent <= 0) {
    return { success: false, error: "Please provide valid room details including room number and rent." };
  }

  const { data, error } = await supabase
    .from("rooms")
    .insert({
      pg_id: pgId,
      room_number: roomNumber,
      floor_number: isNaN(floorNumber) ? 0 : floorNumber,
      room_type: roomType,
      base_monthly_rent: baseMonthlyRent,
      has_attached_bathroom: hasAttachedBathroom,
      has_ac: hasAc,
      has_balcony: hasBalcony,
      status: "available",
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

export async function createBedAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  if (authErr || !user) {
    return { success: false, error: "Authentication required." };
  }

  const pgId = formData.get("pg_id")?.toString();
  const roomId = formData.get("room_id")?.toString();
  const bedLabel = formData.get("bed_label")?.toString()?.trim();
  const monthlyRent = parseFloat(formData.get("monthly_rent")?.toString() || "0");

  if (!pgId || !roomId || !bedLabel || isNaN(monthlyRent) || monthlyRent <= 0) {
    return { success: false, error: "Please provide valid bed label and monthly rent." };
  }

  const { data, error } = await supabase
    .from("beds")
    .insert({
      pg_id: pgId,
      room_id: roomId,
      bed_label: bedLabel,
      monthly_rent: monthlyRent,
      status: "vacant",
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

export async function updateBedStatusAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  if (authErr || !user) {
    return { success: false, error: "Authentication required." };
  }

  const pgId = formData.get("pg_id")?.toString();
  const bedId = formData.get("bed_id")?.toString();
  const status = formData.get("status")?.toString() as BedStatus;

  if (!pgId || !bedId || !status) {
    return { success: false, error: "Missing required bed or status." };
  }

  const { error } = await supabase
    .from("beds")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", bedId)
    .eq("pg_id", pgId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/owner");
  revalidatePath("/warden");
  return { success: true };
}
