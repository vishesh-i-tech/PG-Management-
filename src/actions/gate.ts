"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "./rooms";
import type { GateEventType } from "@/types/database.types";

export async function recordGateMovementAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  if (authErr || !user) {
    return { success: false, error: "Authentication required." };
  }

  const pgId = formData.get("pg_id")?.toString();
  const tenantId = formData.get("tenant_id")?.toString();
  const eventType = formData.get("event_type")?.toString() as GateEventType;
  const notes = formData.get("notes")?.toString()?.trim() || null;

  if (!pgId || !tenantId || !eventType) {
    return { success: false, error: "PG, tenant, and event type are mandatory." };
  }

  // Call the atomic stored procedure: record_gate_movement
  const { data, error } = await supabase.rpc("record_gate_movement", {
    p_pg_id: pgId,
    p_tenant_id: tenantId,
    p_event_type: eventType,
    p_notes: notes,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/owner");
  revalidatePath("/warden");
  revalidatePath("/tenant");
  return { success: true, data };
}

export async function requestNightOutAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  if (authErr || !user) {
    return { success: false, error: "Authentication required." };
  }

  const pgId = formData.get("pg_id")?.toString();
  const tenantId = formData.get("tenant_id")?.toString();
  const departureDate = formData.get("departure_date")?.toString();
  const expectedReturnDate = formData.get("expected_return_date")?.toString();
  const reason = formData.get("reason")?.toString()?.trim();

  if (!pgId || !tenantId || !departureDate || !expectedReturnDate || !reason) {
    return { success: false, error: "Dates and reason are required for a night out request." };
  }

  const { data, error } = await supabase
    .from("night_out_requests")
    .insert({
      pg_id: pgId,
      tenant_id: tenantId,
      departure_date: departureDate,
      expected_return_date: expectedReturnDate,
      reason,
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/tenant");
  revalidatePath("/warden");
  return { success: true, data };
}

export async function reviewNightOutAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  if (authErr || !user) {
    return { success: false, error: "Authentication required." };
  }

  const pgId = formData.get("pg_id")?.toString();
  const requestId = formData.get("request_id")?.toString();
  const status = formData.get("status")?.toString() as "approved" | "rejected";
  const parentConsentVerified = formData.get("parent_consent_verified") === "true";

  if (!pgId || !requestId || !status) {
    return { success: false, error: "Invalid review parameters." };
  }

  const { error } = await supabase
    .from("night_out_requests")
    .update({
      status,
      approved_by_user_id: user.id,
      parent_consent_verified: parentConsentVerified,
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("pg_id", pgId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/warden");
  revalidatePath("/owner");
  return { success: true };
}
