"use client";

import { useState } from "react";
import { 
  BedDouble, 
  DoorClosed, 
  DoorOpen, 
  Moon, 
  Wrench, 
  UtensilsCrossed, 
  CheckCircle2, 
  Loader2, 
  Sparkles,
  Users,
  X
} from "lucide-react";
import { recordGateMovementAction, requestNightOutAction } from "@/actions/gate";
import { ComplaintsBoard, type ComplaintItem } from "@/components/dashboard/ComplaintsBoard";
import { MessMenuPlanner, type MessMenuItem } from "@/components/dashboard/MessMenuPlanner";
import { TenantPaymentModal, type TenantRentBill } from "@/components/dashboard/TenantPaymentModal";
import type { GateState } from "@/types/database.types";
import { Receipt } from "lucide-react";

export interface TenantInfo {
  id: string;
  pg_id: string;
  full_name: string;
  phone: string;
  joining_date: string;
  current_bed?: {
    bed_label: string;
    room_id: string;
    room_number: string;
    monthly_rent: number;
    room_type: string;
    has_ac: boolean;
    has_attached_bathroom: boolean;
  } | null;
  roommates?: {
    full_name: string;
    bed_label: string;
  }[];
  current_gate_state: GateState;
}

interface TenantDashboardClientProps {
  pg: {
    id: string;
    name: string;
    city: string;
    gate_closing_time: string;
  };
  tenant: TenantInfo;
  complaints: ComplaintItem[];
  menuItems: MessMenuItem[];
  bills?: TenantRentBill[];
}

export function TenantDashboardClient({
  pg,
  tenant,
  complaints,
  menuItems,
  bills = [],
}: TenantDashboardClientProps) {
  const [activeTab, setActiveTab] = useState<"stay" | "payments" | "gate" | "complaints" | "mess">("stay");
  const [isNightOutOpen, setIsNightOutOpen] = useState(false);

  const pendingBillsCount = bills.filter((b) => b.balance_due > 0 && b.status !== "paid").length;

  const [loading, setLoading] = useState(false);
  const [gateMsg, setGateMsg] = useState<string | null>(null);

  const isInside = tenant.current_gate_state === "inside";
  const isNightOut = tenant.current_gate_state === "night_out";

  const handleSelfGateMovement = async (eventType: "check_in" | "check_out") => {
    setLoading(true);
    setGateMsg(null);

    const formData = new FormData();
    formData.set("pg_id", pg.id);
    formData.set("tenant_id", tenant.id);
    formData.set("event_type", eventType);
    formData.set("notes", "Self gate check via mobile app");

    const res = await recordGateMovementAction(formData);
    setLoading(false);
    if (!res.success) {
      setGateMsg(res.error || "Gate operation failed.");
    } else {
      setGateMsg(`Successfully recorded ${eventType === "check_in" ? "Check-In" : "Check-Out"}!`);
    }
  };

  const handleRequestNightOut = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setGateMsg(null);

    const formData = new FormData(e.currentTarget);
    formData.set("pg_id", pg.id);
    formData.set("tenant_id", tenant.id);

    const res = await requestNightOutAction(formData);
    setLoading(false);
    if (!res.success) {
      setGateMsg(res.error || "Night out request failed.");
    } else {
      setIsNightOutOpen(false);
      setGateMsg("Night-out request submitted for warden approval.");
    }
  };


  return (
    <div className="space-y-6">
      {/* Resident Identity Header */}
      <div className="bg-gradient-to-r from-emerald-800 via-teal-900 to-slate-900 rounded-3xl p-6 text-white shadow-xl shadow-slate-900/10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-semibold uppercase tracking-wider mb-2">
              <Sparkles className="w-3.5 h-3.5" /> Resident Portal
            </div>
            <h1 className="text-2xl font-black tracking-tight">
              Hello, {tenant.full_name}
            </h1>
            <p className="text-xs text-slate-300 mt-0.5">
              {pg.name} • Gate Curfew: <span className="font-bold text-white">{pg.gate_closing_time}</span>
            </p>
          </div>

          {/* Quick Gate Self Action */}
          <div className="bg-white/10 backdrop-blur-xs p-3 rounded-2xl border border-white/10 flex items-center gap-3">
            <div>
              <span className="text-[10px] text-slate-300 uppercase block font-bold">Your Status</span>
              <span className={`text-xs font-extrabold uppercase px-2 py-0.5 rounded-md inline-block mt-0.5 ${
                isInside ? "bg-emerald-500 text-slate-950" : isNightOut ? "bg-blue-400 text-slate-950" : "bg-amber-400 text-slate-950"
              }`}>
                {tenant.current_gate_state}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              {isInside ? (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleSelfGateMovement("check_out")}
                  className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold rounded-xl shadow-xs flex items-center gap-1 transition-all"
                >
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <DoorOpen className="w-3.5 h-3.5" />}
                  <span>Check Out</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleSelfGateMovement("check_in")}
                  className="px-3 py-1.5 bg-emerald-400 hover:bg-emerald-300 text-slate-950 text-xs font-bold rounded-xl shadow-xs flex items-center gap-1 transition-all"
                >
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  <span>Check In</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {gateMsg && (
          <div className="mt-4 p-2.5 bg-white/20 rounded-xl text-xs font-semibold text-white">
            {gateMsg}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 bg-white p-1.5 rounded-2xl border border-slate-200/90 shadow-xs overflow-x-auto">
        {[
          { key: "stay", label: "My Stay & Room", icon: BedDouble },
          { key: "payments", label: "Rent & Bills", icon: Receipt, count: pendingBillsCount },
          { key: "gate", label: "Gate & Night-Out", icon: DoorClosed },
          { key: "complaints", label: "Maintenance Tickets", icon: Wrench, count: complaints.length },
          { key: "mess", label: "Today's Food Menu", icon: UtensilsCrossed },
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
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
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
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      {activeTab === "stay" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Room Card */}
          <div className="bg-white rounded-3xl border border-slate-200/90 p-6 shadow-sm">
            <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2 mb-4">
              <BedDouble className="w-4 h-4 text-emerald-600" />
              <span>Room &amp; Bed Allocation</span>
            </h3>

            {tenant.current_bed ? (
              <div className="space-y-4">
                <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 flex items-center justify-between">
                  <div>
                    <div className="text-xl font-black text-emerald-950">
                      Room {tenant.current_bed.room_number} • {tenant.current_bed.bed_label}
                    </div>
                    <span className="text-xs text-emerald-700 capitalize font-medium">
                      {tenant.current_bed.room_type.replace("_", " ")} Sharing
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-extrabold text-emerald-950 block">
                      ₹{tenant.current_bed.monthly_rent.toLocaleString("en-IN")}/mo
                    </span>
                    <span className="text-[10px] text-emerald-700 font-semibold">Agreed Rent</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-slate-50 rounded-xl">
                    <span className="text-slate-400 block mb-0.5 font-semibold">Air Conditioning</span>
                    <span className="font-bold text-slate-800">{tenant.current_bed.has_ac ? "Included" : "Non-AC"}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl">
                    <span className="text-slate-400 block mb-0.5 font-semibold">Washroom</span>
                    <span className="font-bold text-slate-800">{tenant.current_bed.has_attached_bathroom ? "Attached" : "Common"}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-slate-400 italic">
                No bed assigned yet. Please contact your PG warden.
              </div>
            )}
          </div>

          {/* Roommates Card */}
          <div className="bg-white rounded-3xl border border-slate-200/90 p-6 shadow-sm">
            <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2 mb-4">
              <Users className="w-4 h-4 text-emerald-600" />
              <span>Roommates</span>
            </h3>

            {tenant.roommates && tenant.roommates.length > 0 ? (
              <div className="space-y-2.5">
                {tenant.roommates.map((rm, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 rounded-xl flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-900">{rm.full_name}</span>
                    <span className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded text-[11px] font-semibold">
                      {rm.bed_label}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-slate-400 italic">
                No roommates assigned in this room yet.
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "gate" && (
        <div className="bg-white rounded-3xl border border-slate-200/90 p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Digital Gate &amp; Night-Out Request</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Night curfew closing time is {pg.gate_closing_time}. Leaving overnight requires warden authorization.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsNightOutOpen(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-1.5 transition-colors shrink-0"
            >
              <Moon className="w-4 h-4" />
              <span>Request Night-Out</span>
            </button>
          </div>

          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-700 space-y-2">
            <div className="font-bold text-slate-900">Gate Policy Guidelines:</div>
            <ul className="list-disc pl-4 space-y-1 text-slate-600">
              <li>Residents returning after {pg.gate_closing_time} are logged as late check-ins and recorded in the daily curfew report.</li>
              <li>Night-out requests must be submitted at least 4 hours in advance with a verifiable guardian phone number.</li>
            </ul>
          </div>
        </div>
      )}

      {activeTab === "complaints" && (
        <ComplaintsBoard
          pgId={pg.id}
          complaints={complaints}
          canManage={false}
          tenantId={tenant.id}
          tenantRoomId={tenant.current_bed?.room_id || null}
        />
      )}

      {activeTab === "mess" && (
        <MessMenuPlanner
          pgId={pg.id}
          menuItems={menuItems}
          canManage={false}
        />
      )}

      {activeTab === "payments" && (
        <TenantPaymentModal
          pgId={pg.id}
          tenantId={tenant.id}
          tenantName={tenant.full_name}
          bills={bills}
        />
      )}

      {/* --- MODAL: Night Out Request --- */}
      {isNightOutOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 relative">
            <button
              type="button"
              onClick={() => setIsNightOutOpen(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-black text-slate-900 mb-1">Request Night-Out</h3>
            <p className="text-xs text-slate-500 mb-4">Warden will review and verify with your guardian.</p>

            <form onSubmit={handleRequestNightOut} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Departure Date</label>
                <input
                  type="date"
                  name="departure_date"
                  required
                  defaultValue={new Date().toISOString().split("T")[0]}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Expected Return Date</label>
                <input
                  type="date"
                  name="expected_return_date"
                  required
                  defaultValue={new Date(Date.now() + 86400000).toISOString().split("T")[0]}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Reason for Leave</label>
                <textarea
                  name="reason"
                  required
                  rows={3}
                  placeholder="e.g. Traveling home for weekend / college project"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNightOutOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-1.5"
                >
                  {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Submit Request</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
