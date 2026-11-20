"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "./rooms";
import type { ComplaintCategory, ComplaintPriority, ComplaintStatus } from "@/types/database.types";

export async function createComplaintAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  if (authErr || !user) {
    return { success: false, error: "Authentication required." };
  }

  const pgId = formData.get("pg_id")?.toString();
  const tenantId = formData.get("tenant_id")?.toString();
  const roomId = formData.get("room_id")?.toString() || null;
  const category = formData.get("category")?.toString() as ComplaintCategory;
  const priority = (formData.get("priority")?.toString() || "medium") as ComplaintPriority;
  const title = formData.get("title")?.toString()?.trim();
  const description = formData.get("description")?.toString()?.trim();

  if (!pgId || !tenantId || !category || !title || !description) {
    return { success: false, error: "Title, category, and description are required." };
  }

  // Handle optional photo attachments
  const files = formData.getAll("photos") as File[];
  const photoPaths: string[] = [];

  for (const file of files) {
    if (file && file.size > 0) {
      const ext = file.name.split(".").pop() || "jpg";
      const storagePath = `${pgId}/${tenantId}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("complaint-attachments")
        .upload(storagePath, file, { contentType: file.type });

      if (!uploadErr) {
        photoPaths.push(storagePath);
      }
    }
  }

  // 1. Insert complaint
  const { data: complaint, error: complaintErr } = await supabase
    .from("complaints")
    .insert({
      pg_id: pgId,
      tenant_id: tenantId,
      room_id: roomId,
      category,
      priority,
      title,
      description,
      photo_storage_paths: photoPaths,
      status: "open",
    })
    .select()
    .single();

  if (complaintErr) {
    return { success: false, error: complaintErr.message };
  }

  // 2. Add initial status history record
  await supabase.from("complaint_status_history").insert({
    pg_id: pgId,
    complaint_id: complaint.id,
    from_status: null,
    to_status: "open",
    changed_by_user_id: user.id,
    notes: "Complaint submitted by tenant.",
  });

  revalidatePath("/tenant");
  revalidatePath("/warden");
  revalidatePath("/owner");
  return { success: true, data: complaint };
}

export async function updateComplaintStatusAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  if (authErr || !user) {
    return { success: false, error: "Authentication required." };
  }

  const pgId = formData.get("pg_id")?.toString();
  const complaintId = formData.get("complaint_id")?.toString();
  const currentStatus = formData.get("current_status")?.toString() || null;
  const newStatus = formData.get("status")?.toString() as ComplaintStatus;
  const notes = formData.get("notes")?.toString()?.trim() || null;

  if (!pgId || !complaintId || !newStatus) {
    return { success: false, error: "Missing complaint or status parameters." };
  }

  const updateData: {
    status: ComplaintStatus;
    updated_at: string;
    resolved_at?: string | null;
  } = {
    status: newStatus,
    updated_at: new Date().toISOString(),
  };

  if (newStatus === "resolved" || newStatus === "closed") {
    updateData.resolved_at = new Date().toISOString();
  }

  const { error: updateErr } = await supabase
    .from("complaints")
    .update(updateData)
    .eq("id", complaintId)
    .eq("pg_id", pgId);

  if (updateErr) {
    return { success: false, error: updateErr.message };
  }

  // Log in status history
  await supabase.from("complaint_status_history").insert({
    pg_id: pgId,
    complaint_id: complaintId,
    from_status: currentStatus,
    to_status: newStatus,
    changed_by_user_id: user.id,
    notes: notes || `Status changed to ${newStatus}`,
  });

  revalidatePath("/warden");
  revalidatePath("/owner");
  revalidatePath("/tenant");
  return { success: true };
}
