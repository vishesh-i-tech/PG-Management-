import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/roles";
import { redirect } from "next/navigation";
import { TenantDashboardClient, type TenantInfo } from "./TenantDashboardClient";
import type { ComplaintItem } from "@/components/dashboard/ComplaintsBoard";
import type { MessMenuItem } from "@/components/dashboard/MessMenuPlanner";
import type { TenantRentBill } from "@/components/dashboard/TenantPaymentModal";
import type { GateState } from "@/types/database.types";

export default async function TenantPage() {
  const context = await getAuthContext();

  if (!context || !context.primaryMembership) {
    redirect("/onboarding");
  }

  const pgId = context.primaryMembership.pg_id;
  const supabase = await createClient();

  // Parallel fetch
  const [
    { data: pg },
    { data: rawTenant },
    { data: rawAssignments },
    { data: rawRooms },
    { data: rawBeds },
    { data: rawComplaints },
    { data: rawMenu },
    { data: rawRentRecords },
  ] = await Promise.all([
    supabase.from("pgs").select("id, name, city, gate_closing_time").eq("id", pgId).single(),
    supabase.from("tenants").select("*").eq("pg_id", pgId).eq("user_id", context.userId).maybeSingle(),
    supabase.from("tenant_bed_assignments").select("*").eq("pg_id", pgId).eq("is_active", true),
    supabase.from("rooms").select("*").eq("pg_id", pgId),
    supabase.from("beds").select("*").eq("pg_id", pgId),
    supabase.from("complaints").select("*").eq("pg_id", pgId).order("created_at", { ascending: false }),
    supabase.from("mess_menu").select("*").eq("pg_id", pgId).eq("is_active", true),
    supabase.from("rent_records").select("*").eq("pg_id", pgId).order("due_date", { ascending: false }),
  ]);

  if (!pg) {
    redirect("/onboarding");
  }

  // Lookup maps
  const roomMap = new Map((rawRooms || []).map((r) => [r.id, r]));
  const bedMap = new Map((rawBeds || []).map((b) => [b.id, b]));

  // Find tenant assignment
  const activeAssignment = rawTenant
    ? (rawAssignments || []).find((a) => a.tenant_id === rawTenant.id)
    : null;
  const currentBed = activeAssignment ? bedMap.get(activeAssignment.bed_id) : null;
  const currentRoom = currentBed ? roomMap.get(currentBed.room_id) : null;

  // Gate state
  let gateState: GateState = "inside";
  if (rawTenant) {
    const { data: stateRec } = await supabase
      .from("tenant_gate_states")
      .select("current_state")
      .eq("pg_id", pgId)
      .eq("tenant_id", rawTenant.id)
      .maybeSingle();

    if (stateRec?.current_state) {
      gateState = stateRec.current_state;
    }
  }

  // Find roommates sharing the same room
  let roommates: { full_name: string; bed_label: string }[] = [];
  if (currentRoom && rawTenant) {
    const bedsInRoom = (rawBeds || []).filter((b) => b.room_id === currentRoom.id);
    const bedIdsInRoom = new Set(bedsInRoom.map((b) => b.id));
    const otherAssignments = (rawAssignments || []).filter(
      (a) => bedIdsInRoom.has(a.bed_id) && a.tenant_id !== rawTenant.id
    );

    if (otherAssignments.length > 0) {
      const otherTenantIds = otherAssignments.map((a) => a.tenant_id);
      const { data: otherTenants } = await supabase
        .from("tenants")
        .select("id, full_name")
        .in("id", otherTenantIds);

      const otherMap = new Map((otherTenants || []).map((t) => [t.id, t.full_name]));
      roommates = otherAssignments.map((a) => {
        const bed = bedMap.get(a.bed_id);
        return {
          full_name: otherMap.get(a.tenant_id) || "Roommate",
          bed_label: bed?.bed_label || "Bed",
        };
      });
    }
  }

  const tenantInfo: TenantInfo = {
    id: rawTenant?.id || "",
    pg_id: pgId,
    full_name: rawTenant?.full_name || context.fullName || "Resident",
    phone: rawTenant?.phone || "",
    joining_date: activeAssignment?.assigned_from || rawTenant?.created_at?.split("T")[0] || new Date().toISOString().split("T")[0],
    current_gate_state: gateState,
    current_bed: activeAssignment && currentBed && currentRoom ? {
      bed_label: currentBed.bed_label,
      room_id: currentRoom.id,
      room_number: currentRoom.room_number,
      monthly_rent: activeAssignment.agreed_monthly_rent,
      room_type: currentRoom.room_type,
      has_ac: currentRoom.has_ac,
      has_attached_bathroom: currentRoom.has_attached_bathroom,
    } : null,
    roommates,
  };

  const tenantComplaints: ComplaintItem[] = (rawComplaints || [])
    .filter((c) => rawTenant && c.tenant_id === rawTenant.id)
    .map((c) => {
      const r = c.room_id ? roomMap.get(c.room_id) : null;
      return {
        id: c.id,
        pg_id: c.pg_id,
        tenant_id: c.tenant_id,
        tenant_name: tenantInfo.full_name,
        room_number: r?.room_number || null,
        category: c.category,
        priority: c.priority,
        title: c.title,
        description: c.description,
        photo_storage_paths: c.photo_storage_paths,
        status: c.status,
        created_at: c.created_at,
      };
    });

  const menuItems: MessMenuItem[] = (rawMenu || []).map((m) => ({
    id: m.id,
    pg_id: m.pg_id,
    day_of_week: m.day_of_week,
    meal_type: m.meal_type,
    menu_items: m.menu_items,
    start_time: m.start_time,
    end_time: m.end_time,
    special_notes: m.special_notes,
  }));

  const bills: TenantRentBill[] = (rawRentRecords || [])
    .filter((b) => !rawTenant || b.tenant_id === rawTenant.id)
    .map((b) => ({
      id: b.id,
      pg_id: b.pg_id,
      billing_month: b.billing_month,
      period_start: b.period_start,
      period_end: b.period_end,
      due_date: b.due_date,
      base_rent_amount: b.base_rent_amount,
      utility_charges: b.utility_charges,
      late_fees: b.late_fee_amount,
      discount_amount: b.discount_amount,
      total_amount_due: b.total_due_amount,
      paid_amount: b.paid_amount,
      balance_due: b.balance_amount,
      status: b.status,
    }));

  return (
    <TenantDashboardClient
      pg={pg}
      tenant={tenantInfo}
      complaints={tenantComplaints}
      menuItems={menuItems}
      bills={bills}
    />
  );
}
