"use client";

import { useState } from "react";
import { InviteModal } from "@/components/dashboard/InviteModal";
import { RoomsBedsMatrix, type RoomData, type TenantOption } from "@/components/dashboard/RoomsBedsMatrix";
import { TenantDirectory, type TenantWithAssignment, type AvailableBedOption } from "@/components/dashboard/TenantDirectory";
import { 
  GateRegister, 
  type GateStateSummary, 
  type GateEventItem, 
  type NightOutRequestItem, 
  type CurfewAlertTenant, 
  type SimpleTenant 
} from "@/components/dashboard/GateRegister";
import { ComplaintsBoard, type ComplaintItem } from "@/components/dashboard/ComplaintsBoard";
import { InquiriesCRM, type InquiryItem } from "@/components/dashboard/InquiriesCRM";
import { MessMenuPlanner, type MessMenuItem } from "@/components/dashboard/MessMenuPlanner";
import { 
  UserPlus, 
  BedDouble, 
  Users, 
  DoorClosed, 
  Wrench, 
  UtensilsCrossed, 
  MessageSquare, 
  Sparkles,
  LayoutDashboard,
  Clock,
  AlertTriangle
} from "lucide-react";

interface OwnerDashboardClientProps {
  pg: {
    id: string;
    name: string;
    slug: string;
    address_line1: string;
    city: string;
    state: string;
    pincode: string;
    contact_phone: string;
    gender_type: string;
    gate_closing_time: string;
  };
  ownerName: string;
  rooms: RoomData[];
  tenants: TenantWithAssignment[];
  availableBeds: AvailableBedOption[];
  availableTenants: TenantOption[];
  gateSummary: GateStateSummary;
  recentGateEvents: GateEventItem[];
  pendingNightOuts: NightOutRequestItem[];
  curfewAlerts: CurfewAlertTenant[];
  simpleTenants: SimpleTenant[];
  complaints: ComplaintItem[];
  inquiries: InquiryItem[];
  menuItems: MessMenuItem[];
}

export function OwnerDashboardClient({
  pg,
  ownerName,
  rooms,
  tenants,
  availableBeds,
  availableTenants,
  gateSummary,
  recentGateEvents,
  pendingNightOuts,
  curfewAlerts,
  simpleTenants,
  complaints,
  inquiries,
  menuItems,
}: OwnerDashboardClientProps) {
  const [activeTab, setActiveTab] = useState<
    "overview" | "rooms" | "tenants" | "gate" | "complaints" | "inquiries" | "mess"
  >("overview");
  const [isInviteOpen, setIsInviteOpen] = useState(false);

  // Quick stats
  const totalBeds = rooms.reduce((acc, r) => acc + r.beds.length, 0);
  const occupiedBeds = rooms.reduce((acc, r) => acc + r.beds.filter((b) => b.status === "occupied").length, 0);
  const openComplaints = complaints.filter((c) => c.status === "open" || c.status === "in_progress").length;
  const activeTenantsCount = tenants.filter((t) => t.status === "active").length;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-emerald-800 via-teal-900 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-slate-900/10 relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-semibold uppercase tracking-wider mb-2">
              <Sparkles className="w-3.5 h-3.5" /> Phase 3 Core Operations Active
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Welcome, {ownerName}
            </h1>
            <p className="text-sm text-slate-300 mt-1 max-w-xl">
              Property: <span className="font-semibold text-white">{pg.name}</span> • {pg.city}, {pg.state} • Closing: {pg.gate_closing_time}
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setIsInviteOpen(true)}
              className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-2xl text-xs shadow-lg flex items-center justify-center gap-1.5 transition-all"
            >
              <UserPlus className="w-4 h-4" />
              <span>Invite Staff / Warden</span>
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1.5 bg-white p-1.5 rounded-2xl border border-slate-200/90 shadow-xs overflow-x-auto">
        {[
          { key: "overview", label: "Overview", icon: LayoutDashboard },
          { key: "rooms", label: "Rooms & Beds", icon: BedDouble, count: rooms.length },
          { key: "tenants", label: "Residents", icon: Users, count: activeTenantsCount },
          { key: "gate", label: "Gate & Curfew", icon: DoorClosed, alert: curfewAlerts.length > 0 },
          { key: "complaints", label: "Issues / Tickets", icon: Wrench, count: openComplaints },
          { key: "inquiries", label: "Leads & CRM", icon: MessageSquare, count: inquiries.length },
          { key: "mess", label: "Mess Menu", icon: UtensilsCrossed },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;

          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                isActive
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {typeof tab.count === "number" && (
                <span className={`px-1.5 py-0.5 rounded-md text-[10px] ${
                  isActive ? "bg-slate-800 text-slate-200" : "bg-slate-100 text-slate-600"
                }`}>
                  {tab.count}
                </span>
              )}
              {tab.alert && (
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Top KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Total Occupancy</span>
              <div className="text-2xl font-black text-slate-900 mt-1">
                {totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0}%
              </div>
              <span className="text-xs text-slate-500">{occupiedBeds} occupied / {totalBeds} total beds</span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Active Residents</span>
              <div className="text-2xl font-black text-emerald-700 mt-1">{activeTenantsCount}</div>
              <span className="text-xs text-slate-500">{availableTenants.length} awaiting bed allocation</span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Gate Presence</span>
              <div className="text-2xl font-black text-blue-700 mt-1">{gateSummary.inside_count} Inside</div>
              <span className="text-xs text-slate-500">{gateSummary.outside_count} outside • {gateSummary.night_out_count} night out</span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Open Tickets</span>
              <div className="text-2xl font-black text-amber-700 mt-1">{openComplaints}</div>
              <span className="text-xs text-slate-500">{pendingNightOuts.length} night-out approvals pending</span>
            </div>
          </div>

          {/* Curfew Alert Banner */}
          {curfewAlerts.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-red-900">
                    Curfew Notice: {curfewAlerts.length} residents outside past gate closing time ({pg.gate_closing_time})
                  </div>
                  <div className="text-[11px] text-red-700">Check the Gate &amp; Curfew tab to review alerts and contact them.</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab("gate")}
                className="px-3 py-1.5 bg-red-600 text-white rounded-xl text-xs font-bold shrink-0 hover:bg-red-700 transition-colors"
              >
                View Gate Alert
              </button>
            </div>
          )}

          {/* Quick Operations Matrix Preview */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Quick Rooms Preview */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                  <BedDouble className="w-4 h-4 text-emerald-600" />
                  <span>Rooms &amp; Beds Status</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveTab("rooms")}
                  className="text-xs font-bold text-emerald-700 hover:underline"
                >
                  Manage All
                </button>
              </div>

              <div className="space-y-2">
                {rooms.slice(0, 5).map((room) => {
                  const occ = room.beds.filter((b) => b.status === "occupied").length;
                  return (
                    <div key={room.id} className="p-3 bg-slate-50 rounded-xl flex items-center justify-between text-xs">
                      <div>
                        <span className="font-bold text-slate-900">Room {room.room_number}</span>
                        <span className="text-slate-500 ml-2 capitalize">{room.room_type.replace("_", " ")}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-500">{occ}/{room.beds.length} Beds</span>
                        <span className={`w-2 h-2 rounded-full ${occ === room.beds.length ? "bg-blue-500" : "bg-emerald-500"}`} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quick Pending Night-outs / Gate events */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-600" />
                  <span>Recent Gate Activity</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveTab("gate")}
                  className="text-xs font-bold text-emerald-700 hover:underline"
                >
                  Full Register
                </button>
              </div>

              <div className="space-y-2">
                {recentGateEvents.slice(0, 5).map((evt) => (
                  <div key={evt.id} className="p-3 bg-slate-50 rounded-xl flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-slate-900">{evt.tenant_name}</span>
                      <span className="text-slate-500 ml-2">
                        {new Date(evt.logged_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                      evt.event_type === "check_in" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                    }`}>
                      {evt.event_type.replace("_", " ")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "rooms" && (
        <RoomsBedsMatrix
          pgId={pg.id}
          rooms={rooms}
          availableTenants={availableTenants}
          canManage={true}
        />
      )}

      {activeTab === "tenants" && (
        <TenantDirectory
          pgId={pg.id}
          tenants={tenants}
          availableBeds={availableBeds}
          canManage={true}
        />
      )}

      {activeTab === "gate" && (
        <GateRegister
          pgId={pg.id}
          summary={gateSummary}
          recentEvents={recentGateEvents}
          pendingNightOuts={pendingNightOuts}
          curfewAlerts={curfewAlerts}
          tenants={simpleTenants}
          canManage={true}
        />
      )}

      {activeTab === "complaints" && (
        <ComplaintsBoard
          pgId={pg.id}
          complaints={complaints}
          canManage={true}
        />
      )}

      {activeTab === "inquiries" && (
        <InquiriesCRM
          pgId={pg.id}
          inquiries={inquiries}
          canManage={true}
        />
      )}

      {activeTab === "mess" && (
        <MessMenuPlanner
          pgId={pg.id}
          menuItems={menuItems}
          canManage={true}
        />
      )}

      {/* Staff Invitation Modal */}
      <InviteModal
        pgId={pg.id}
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
      />
    </div>
  );
}
