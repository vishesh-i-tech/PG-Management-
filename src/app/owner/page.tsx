import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/roles";
import { redirect } from "next/navigation";
import { OwnerDashboardClient } from "./OwnerDashboardClient";
import type { RoomData } from "@/components/dashboard/RoomsBedsMatrix";
import type { TenantWithAssignment } from "@/components/dashboard/TenantDirectory";
import type { GateEventItem, NightOutRequestItem, CurfewAlertTenant, SimpleTenant } from "@/components/dashboard/GateRegister";
import type { ComplaintItem } from "@/components/dashboard/ComplaintsBoard";
import type { InquiryItem } from "@/components/dashboard/InquiriesCRM";
import type { MessMenuItem } from "@/components/dashboard/MessMenuPlanner";
import type { RentRecordItem, PaymentItem } from "@/components/dashboard/FinancialLedger";

export default async function OwnerPage() {
  const context = await getAuthContext();

  if (!context || !context.primaryMembership) {
    redirect("/onboarding");
  }

  const pgId = context.primaryMembership.pg_id;
  const supabase = await createClient();

  // Parallel fetch of all core operational tables
  const [
    { data: pg },
    { data: rawRooms },
    { data: rawBeds },
    { data: activeAssignments },
    { data: rawTenants },
    { data: rawKyc },
    { data: rawGateStates },
    { data: rawGateEvents },
    { data: rawNightOuts },
    { data: curfewRaw },
    { data: rawComplaints },
    { data: rawInquiries },
    { data: rawFollowUps },
    { data: rawMenu },
    { data: rawRentRecords },
    { data: rawPayments },
  ] = await Promise.all([
    supabase.from("pgs").select("*").eq("id", pgId).single(),
    supabase.from("rooms").select("*").eq("pg_id", pgId).order("room_number", { ascending: true }),
    supabase.from("beds").select("*").eq("pg_id", pgId).order("bed_label", { ascending: true }),
    supabase.from("tenant_bed_assignments").select("*").eq("pg_id", pgId).eq("is_active", true),
    supabase.from("tenants").select("*").eq("pg_id", pgId).order("created_at", { ascending: false }),
    supabase.from("tenant_sensitive_kyc").select("id, tenant_id").eq("pg_id", pgId),
    supabase.from("tenant_gate_states").select("current_state, tenant_id").eq("pg_id", pgId),
    supabase.from("gate_events").select("*").eq("pg_id", pgId).order("logged_at", { ascending: false }).limit(25),
    supabase.from("night_out_requests").select("*").eq("pg_id", pgId).eq("status", "pending").order("created_at", { ascending: false }),
    supabase.rpc("get_tenants_outside_for_gate_alert", {}),
    supabase.from("complaints").select("*").eq("pg_id", pgId).order("created_at", { ascending: false }).limit(30),
    supabase.from("inquiries").select("*").eq("pg_id", pgId).order("created_at", { ascending: false }).limit(30),
    supabase.from("inquiry_follow_ups").select("*").eq("pg_id", pgId).order("created_at", { ascending: false }),
    supabase.from("mess_menu").select("*").eq("pg_id", pgId).eq("is_active", true),
    supabase.from("rent_records").select("*").eq("pg_id", pgId).order("due_date", { ascending: false }),
    supabase.from("payments").select("*").eq("pg_id", pgId).order("created_at", { ascending: false }).limit(50),
  ]);

  if (!pg) {
    redirect("/onboarding");
  }

  // Build lookup maps
  const tenantMap = new Map((rawTenants || []).map((t) => [t.id, t]));
  const roomMap = new Map((rawRooms || []).map((r) => [r.id, r]));
  const bedMap = new Map((rawBeds || []).map((b) => [b.id, b]));
  const assignmentByBedId = new Map((activeAssignments || []).map((a) => [a.bed_id, a]));
  const assignmentByTenantId = new Map((activeAssignments || []).map((a) => [a.tenant_id, a]));
  const kycTenantSet = new Set((rawKyc || []).map((k) => k.tenant_id));
  const gateStateMap = new Map((rawGateStates || []).map((s) => [s.tenant_id, s.current_state]));

  // 1. Rooms & Beds Structure
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
      beds: roomBeds.map((b) => {
        const assignment = assignmentByBedId.get(b.id);
        const assignedTenant = assignment ? tenantMap.get(assignment.tenant_id) : null;
        return {
          id: b.id,
          pg_id: b.pg_id,
          room_id: b.room_id,
          bed_label: b.bed_label,
          monthly_rent: b.monthly_rent,
          status: b.status,
          current_tenant_id: assignedTenant?.id || null,
          current_tenant_name: assignedTenant?.full_name || null,
          assignment_id: assignment?.id || null,
        };
      }),
    };
  });

  // 2. Tenants Structure
  const tenants: TenantWithAssignment[] = (rawTenants || []).map((t) => {
    const activeAssignment = assignmentByTenantId.get(t.id);
    const assignedBed = activeAssignment ? bedMap.get(activeAssignment.bed_id) : null;
    const assignedRoom = assignedBed ? roomMap.get(assignedBed.room_id) : null;

    return {
      id: t.id,
      pg_id: t.pg_id,
      full_name: t.full_name,
      phone: t.phone,
      email: t.email,
      emergency_contact_name: t.emergency_contact_name,
      emergency_contact_phone: t.emergency_contact_phone,
      workplace_or_college: t.employer_or_college,
      joining_date: activeAssignment?.assigned_from || t.created_at.split("T")[0],
      security_deposit_amount: t.security_deposit_amount,
      security_deposit_status: t.security_deposit_status,
      status: t.status,
      has_kyc_verified: kycTenantSet.has(t.id),
      current_bed: activeAssignment && assignedBed ? {
        id: assignedBed.id,
        bed_label: assignedBed.bed_label,
        room_number: assignedRoom?.room_number || "—",
        monthly_rent: activeAssignment.agreed_monthly_rent,
        assignment_id: activeAssignment.id,
        assigned_from: activeAssignment.assigned_from,
      } : null,
    };
  });

  // 3. Gate Presence & Events
  const gateSummary = {
    inside_count: (rawGateStates || []).filter((s) => s.current_state === "inside").length,
    outside_count: (rawGateStates || []).filter((s) => s.current_state === "outside").length,
    night_out_count: (rawGateStates || []).filter((s) => s.current_state === "night_out").length,
  };

  const simpleTenants: SimpleTenant[] = tenants.map((t) => ({
    id: t.id,
    full_name: t.full_name,
    phone: t.phone,
    current_state: gateStateMap.get(t.id) || "inside",
    room_number: t.current_bed?.room_number || null,
  }));

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

  // 4. Complaints Structure
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

  // 5. Inquiries & Follow-ups Structure
  const followUpsByInquiryId = new Map<string, typeof rawFollowUps>();
  for (const f of rawFollowUps || []) {
    const list = followUpsByInquiryId.get(f.inquiry_id) || [];
    list.push(f);
    followUpsByInquiryId.set(f.inquiry_id, list);
  }

  const inquiries: InquiryItem[] = (rawInquiries || []).map((i) => ({
    id: i.id,
    pg_id: i.pg_id,
    prospect_name: i.prospect_name,
    phone: i.phone,
    email: i.email,
    desired_room_type: i.desired_room_type,
    expected_joining_date: i.expected_joining_date,
    budget: i.budget,
    source: i.source,
    status: i.status,
    notes: i.notes,
    created_at: i.created_at,
    follow_ups: (followUpsByInquiryId.get(i.id) || []).map((f) => ({
      id: f.id,
      channel: f.follow_up_channel,
      notes: f.notes,
      created_at: f.created_at,
    })),
  }));

  // 6. Mess Menu
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

  // 7. Finances & Ledgers
  const rentRecords: RentRecordItem[] = (rawRentRecords || []).map((r) => {
    const t = tenantMap.get(r.tenant_id);
    const a = assignmentByTenantId.get(r.tenant_id);
    const b = a ? bedMap.get(a.bed_id) : null;
    const rm = b ? roomMap.get(b.room_id) : null;

    return {
      id: r.id,
      pg_id: r.pg_id,
      tenant_id: r.tenant_id,
      tenant_name: t?.full_name || "Resident",
      room_number: rm?.room_number || null,
      bed_label: b?.bed_label || null,
      billing_month: r.billing_month,
      due_date: r.due_date,
      base_rent_amount: r.base_rent_amount,
      utility_charges: r.utility_charges,
      late_fees: r.late_fee_amount,
      discount_amount: r.discount_amount,
      total_amount_due: r.total_due_amount,
      paid_amount: r.paid_amount,
      balance_due: r.balance_amount,
      status: r.status,
      created_at: r.created_at,
    };
  });

  const recentPayments: PaymentItem[] = (rawPayments || []).map((p) => {
    const t = tenantMap.get(p.tenant_id);
    return {
      id: p.id,
      tenant_id: p.tenant_id,
      tenant_name: t?.full_name || "Resident",
      amount: p.amount,
      payment_method: p.payment_method,
      payment_status: p.payment_status,
      notes: p.notes,
      created_at: p.created_at,
    };
  });

  const availableBeds = rooms.flatMap((r) =>
    r.beds
      .filter((b) => b.status === "vacant")
      .map((b) => ({
        id: b.id,
        bed_label: b.bed_label,
        room_number: r.room_number,
        monthly_rent: b.monthly_rent,
      }))
  );

  const availableTenants = tenants
    .filter((t) => t.status === "active" && !t.current_bed)
    .map((t) => ({ id: t.id, full_name: t.full_name, phone: t.phone }));

  return (
    <OwnerDashboardClient
      pg={pg}
      ownerName={context.fullName || "PG Owner"}
      rooms={rooms}
      tenants={tenants}
      availableBeds={availableBeds}
      availableTenants={availableTenants}
      gateSummary={gateSummary}
      recentGateEvents={recentGateEvents}
      pendingNightOuts={pendingNightOuts}
      curfewAlerts={curfewAlerts}
      simpleTenants={simpleTenants}
      complaints={complaints}
      inquiries={inquiries}
      menuItems={menuItems}
      rentRecords={rentRecords}
      recentPayments={recentPayments}
    />
  );
}
