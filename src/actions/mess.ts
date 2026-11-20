"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "./rooms";
import type { MealType } from "@/types/database.types";

export async function upsertMessMenuItemAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  if (authErr || !user) {
    return { success: false, error: "Authentication required." };
  }

  const pgId = formData.get("pg_id")?.toString();
  const dayOfWeek = parseInt(formData.get("day_of_week")?.toString() || "0", 10);
  const mealType = formData.get("meal_type")?.toString() as MealType;
  const menuItems = formData.get("menu_items")?.toString()?.trim();
  const startTime = formData.get("start_time")?.toString()?.trim() || "08:00";
  const endTime = formData.get("end_time")?.toString()?.trim() || "10:00";
  const specialNotes = formData.get("special_notes")?.toString()?.trim() || null;

  if (!pgId || isNaN(dayOfWeek) || !mealType || !menuItems) {
    return { success: false, error: "Day of week, meal type, and menu items are required." };
  }

  // Check if item already exists for this day and meal
  const { data: existing } = await supabase
    .from("mess_menu")
    .select("id")
    .eq("pg_id", pgId)
    .eq("day_of_week", dayOfWeek)
    .eq("meal_type", mealType)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("mess_menu")
      .update({
        menu_items: menuItems,
        start_time: startTime,
        end_time: endTime,
        special_notes: specialNotes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .eq("pg_id", pgId);

    if (error) {
      return { success: false, error: error.message };
    }
  } else {
    const { error } = await supabase
      .from("mess_menu")
      .insert({
        pg_id: pgId,
        day_of_week: dayOfWeek,
        meal_type: mealType,
        menu_items: menuItems,
        start_time: startTime,
        end_time: endTime,
        special_notes: specialNotes,
        is_active: true,
      });

    if (error) {
      return { success: false, error: error.message };
    }
  }

  revalidatePath("/owner");
  revalidatePath("/warden");
  revalidatePath("/tenant");
  return { success: true };
}
