import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/roles";
import { redirect } from "next/navigation";
import { WardenDashboardClient } from "./WardenDashboardClient";
import type { RoomData } from "@/components/dashboard/RoomsBedsMatrix";
import type { GateEventItem, NightOutRequestItem, CurfewAlertTenant, SimpleTenant } from "@/components/dashboard/GateRegister";
import type { ComplaintItem } from "@/components/dashboard/ComplaintsBoard";
import type { MessMenuItem } from "@/components/dashboard/MessMenuPlanner";

export default async function WardenPage() {
  const context = await getAuthContext();

  if (!context || !context.primaryMembership) {
    redirect("/onboarding");
  }

  const pgId = context.primaryMembership.pg_id;
  const supabase = await createClient();

  // Parallel fetch of warden operational tables
  const [
    { data: pg },
    { data: rawGateStates },
    { data: rawTenants },
    { data: rawAssignments },
    { data: rawRooms },
    { data: rawBeds },
    { data: rawGateEvents },
    { data: rawNightOuts },
    { data: curfewRaw },
    { data: rawComplaints },
    { data: rawMenu },
  ] = await Promise.all([
    supabase.from("pgs").select("*").eq("id", pgId).single(),
    supabase.from("tenant_gate_states").select("current_state, tenant_id").eq("pg_id", pgId),
    supabase.from("tenants").select("*").eq("pg_id", pgId).eq("status", "active"),
    supabase.from("tenant_bed_assignments").select("*").eq("pg_id", pgId).eq("is_active", true),
    supabase.from("rooms").select("*").eq("pg_id", pgId).order("room_number", { ascending: true }),
    supabase.from("beds").select("*").eq("pg_id", pgId).order("bed_label", { ascending: true }),
    supabase.from("gate_events").select("*").eq("pg_id", pgId).order("logged_at", { ascending: false }).limit(30),
    supabase.from("night_out_requests").select("*").eq("pg_id", pgId).eq("status", "pending").order("created_at", { ascending: false }),
    supabase.rpc("get_tenants_outside_for_gate_alert", {}),
    supabase.from("complaints").select("*").eq("pg_id", pgId).order("created_at", { ascending: false }).limit(30),
    supabase.from("mess_menu").select("*").eq("pg_id", pgId).eq("is_active", true),
  ]);

  if (!pg) {
    redirect("/onboarding");
  }

  // Lookup Maps
  const tenantMap = new Map((rawTenants || []).map((t) => [t.id, t]));
  const roomMap = new Map((rawRooms || []).map((r) => [r.id, r]));
  const bedMap = new Map((rawBeds || []).map((b) => [b.id, b]));
  const assignmentByTenantId = new Map((rawAssignments || []).map((a) => [a.tenant_id, a]));
  const gateStateMap = new Map((rawGateStates || []).map((s) => [s.tenant_id, s.current_state]));

  // Gate summary
  const gateSummary = {
    inside_count: (rawGateStates || []).filter((s) => s.current_state === "inside").length,
    outside_count: (rawGateStates || []).filter((s) => s.current_state === "outside").length,
    night_out_count: (rawGateStates || []).filter((s) => s.current_state === "night_out").length,
  };

  const simpleTenants: SimpleTenant[] = (rawTenants || []).map((t) => {
    const a = assignmentByTenantId.get(t.id);
    const b = a ? bedMap.get(a.bed_id) : null;
    const r = b ? roomMap.get(b.room_id) : null;

    return {
      id: t.id,
      full_name: t.full_name,
      phone: t.phone,
      current_state: gateStateMap.get(t.id) || "inside",
      room_number: r?.room_number || null,
    };
  });

  const recentGateEvents: GateEventItem[] = (rawGateEvents || []).map((e) => {
    const t = tenantMap.get(e.tenant_id);
    const a = assignmentByTenantId.get(e.tenant_id);
    const b = a ? bedMap.get(a.bed_id) : null;
    const r = b ? roomMap.get(b.room_id) : null;

    return {
      id: e.id,
      tenant_id: e.tenant_id,
      tenant_name: t?.full_name || "Resident",
      room_number: r?.room_number || null,
      phone: t?.phone || "",
      event_type: e.event_type,
      logged_at: e.logged_at,
      is_late: e.is_late,
      notes: e.notes,
    };
  });

  const pendingNightOuts: NightOutRequestItem[] = (rawNightOuts || []).map((n) => {
    const t = tenantMap.get(n.tenant_id);
    const a = assignmentByTenantId.get(n.tenant_id);
    const b = a ? bedMap.get(a.bed_id) : null;
    const r = b ? roomMap.get(b.room_id) : null;

    return {
      id: n.id,
      tenant_id: n.tenant_id,
      tenant_name: t?.full_name || "Resident",
      room_number: r?.room_number || null,
      phone: t?.phone || "",
      departure_date: n.departure_date,
      expected_return_date: n.expected_return_date,
      reason: n.reason,
      status: n.status,
      parent_consent_verified: n.parent_consent_verified,
      created_at: n.created_at,
    };
  });

  const curfewAlerts: CurfewAlertTenant[] = (curfewRaw || []).filter((c) => c.pg_id === pgId);

  // Beds by room
  const bedsByRoomId = new Map<string, typeof rawBeds>();
  for (const bed of rawBeds || []) {
    const list = bedsByRoomId.get(bed.room_id) || [];
    list.push(bed);
    bedsByRoomId.set(bed.room_id, list);
  }

  const rooms: RoomData[] = (rawRooms || []).map((r) => {
    const roomBeds = bedsByRoomId.get(r.id) || [];
    return {
      id: r.id,
      pg_id: r.pg_id,
      room_number: r.room_number,
      floor_number: r.floor_number,
      room_type: r.room_type,
      base_monthly_rent: r.base_monthly_rent,
      has_attached_bathroom: r.has_attached_bathroom,
      has_ac: r.has_ac,
      has_balcony: r.has_balcony,
      status: r.status,
      beds: roomBeds.map((b) => ({
        id: b.id,
        pg_id: b.pg_id,
        room_id: b.room_id,
        bed_label: b.bed_label,
        monthly_rent: b.monthly_rent,
        status: b.status,
      })),
    };
  });

  const complaints: ComplaintItem[] = (rawComplaints || []).map((c) => {
    const t = tenantMap.get(c.tenant_id);
    const r = c.room_id ? roomMap.get(c.room_id) : null;

    return {
      id: c.id,
      pg_id: c.pg_id,
      tenant_id: c.tenant_id,
      tenant_name: t?.full_name || "Resident",
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

  return (
    <WardenDashboardClient
      pg={pg}
      wardenName={context.fullName || "Warden"}
      gateSummary={gateSummary}
      recentGateEvents={recentGateEvents}
      pendingNightOuts={pendingNightOuts}
      curfewAlerts={curfewAlerts}
      tenants={simpleTenants}
      rooms={rooms}
      complaints={complaints}
      menuItems={menuItems}
    />
  );
}
