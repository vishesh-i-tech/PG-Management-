"use client";

import { useState } from "react";
import { 
  DoorOpen, 
  Moon, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Phone, 
  X, 
  Loader2,
  ShieldCheck,
  AlertCircle
} from "lucide-react";
import { recordGateMovementAction, reviewNightOutAction } from "@/actions/gate";
import type { GateEventType, GateState, NightOutStatus } from "@/types/database.types";

export interface GateStateSummary {
  inside_count: number;
  outside_count: number;
  night_out_count: number;
}

export interface GateEventItem {
  id: string;
  tenant_id: string;
  tenant_name: string;
  room_number?: string | null;
  phone: string;
  event_type: GateEventType;
  logged_at: string;
  is_late: boolean;
  notes?: string | null;
}

export interface NightOutRequestItem {
  id: string;
  tenant_id: string;
  tenant_name: string;
  room_number?: string | null;
  phone: string;
  departure_date: string;
  expected_return_date: string;
  reason: string;
  status: NightOutStatus;
  parent_consent_verified: boolean;
  created_at: string;
}

export interface CurfewAlertTenant {
  tenant_id: string;
  tenant_name: string;
  phone: string;
  gate_closing_time: string;
}

export interface SimpleTenant {
  id: string;
  full_name: string;
  phone: string;
  current_state: GateState;
  room_number?: string | null;
}

interface GateRegisterProps {
  pgId: string;
  summary: GateStateSummary;
  recentEvents: GateEventItem[];
  pendingNightOuts: NightOutRequestItem[];
  curfewAlerts: CurfewAlertTenant[];
  tenants: SimpleTenant[];
  canManage?: boolean;
}

export function GateRegister({
  pgId,
  summary,
  recentEvents,
  pendingNightOuts,
  curfewAlerts,
  tenants,
  canManage = true,
}: GateRegisterProps) {
  const [activeTab, setActiveTab] = useState<"logs" | "night_outs" | "alerts">("logs");
  const [selectedTenantId, setSelectedTenantId] = useState<string>("");
  const [movementNotes, setMovementNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [reviewNightOutTarget, setReviewNightOutTarget] = useState<NightOutRequestItem | null>(null);
  const [parentConsentChecked, setParentConsentChecked] = useState(false);

  const selectedTenant = tenants.find((t) => t.id === selectedTenantId);

  const handleRecordMovement = async (eventType: GateEventType) => {
    if (!selectedTenantId) {
      setErrorMsg("Please select a resident first.");
      return;
    }
    setLoading(true);
    setErrorMsg(null);

    const formData = new FormData();
    formData.set("pg_id", pgId);
    formData.set("tenant_id", selectedTenantId);
    formData.set("event_type", eventType);
    if (movementNotes) formData.set("notes", movementNotes);

    const res = await recordGateMovementAction(formData);
    setLoading(false);
    if (!res.success) {
      setErrorMsg(res.error || "Failed to record gate event.");
    } else {
      setSelectedTenantId("");
      setMovementNotes("");
    }
  };

  const handleReviewNightOut = async (decision: "approved" | "rejected") => {
    if (!reviewNightOutTarget) return;
    setLoading(true);
    setErrorMsg(null);

    const formData = new FormData();
    formData.set("pg_id", pgId);
    formData.set("request_id", reviewNightOutTarget.id);
    formData.set("status", decision);
    formData.set("parent_consent_verified", parentConsentChecked ? "true" : "false");

    const res = await reviewNightOutAction(formData);
    setLoading(false);
    if (!res.success) {
      setErrorMsg(res.error || "Failed to update night out request.");
    } else {
      setReviewNightOutTarget(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Presence Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
            <DoorInsideIcon className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Currently Inside</span>
            <span className="text-2xl font-black text-slate-900">{summary.inside_count}</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
            <DoorOpen className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Currently Outside</span>
            <span className="text-2xl font-black text-amber-700">{summary.outside_count}</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center shrink-0">
            <Moon className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Approved Night-Out</span>
            <span className="text-2xl font-black text-blue-800">{summary.night_out_count}</span>
          </div>
        </div>
      </div>

      {/* Curfew Late Alert Banner */}
      {curfewAlerts.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center gap-2 mb-2 text-red-800 font-black text-sm">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
            <span>Curfew Alert: {curfewAlerts.length} Residents Outside Past Closing Time</span>
          </div>
          <p className="text-xs text-red-700 mb-3">
            The following residents have not logged back inside by gate closing curfew.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {curfewAlerts.map((t) => (
              <div key={t.tenant_id} className="bg-white p-3 rounded-xl border border-red-100 flex items-center justify-between shadow-xs">
                <div>
                  <div className="font-bold text-xs text-slate-900">{t.tenant_name}</div>
                  <div className="text-[11px] text-slate-500">Curfew: {t.gate_closing_time}</div>
                </div>
                <a
                  href={`tel:${t.phone}`}
                  className="px-2.5 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1 hover:bg-red-700 transition-colors"
                >
                  <Phone className="w-3 h-3" />
                  <span>Call</span>
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Gate Logger Bar (For Warden / Owner) */}
      {canManage && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-600" />
              <span>Quick Gate Register</span>
            </h3>
            {selectedTenant && (
              <span className={`text-[11px] font-extrabold px-2 py-0.5 rounded-full uppercase ${
                selectedTenant.current_state === "inside"
                  ? "bg-emerald-100 text-emerald-800"
                  : selectedTenant.current_state === "outside"
                  ? "bg-amber-100 text-amber-800"
                  : "bg-blue-100 text-blue-800"
              }`}>
                Current: {selectedTenant.current_state}
              </span>
            )}
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex-1">
              <select
                value={selectedTenantId}
                onChange={(e) => setSelectedTenantId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden bg-white"
              >
                <option value="">-- Select Resident to Log Movement --</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.full_name} ({t.room_number ? `Room ${t.room_number}` : "No Bed"}) • Currently {t.current_state}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:w-64">
              <input
                type="text"
                value={movementNotes}
                onChange={(e) => setMovementNotes(e.target.value)}
                placeholder="Optional notes (e.g. library, coaching)"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
              />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={loading || !selectedTenantId}
                onClick={() => handleRecordMovement("check_out")}
                className="flex-1 sm:flex-none px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <DoorOpen className="w-3.5 h-3.5" />}
                <span>Check Out</span>
              </button>

              <button
                type="button"
                disabled={loading || !selectedTenantId}
                onClick={() => handleRecordMovement("check_in")}
                className="flex-1 sm:flex-none px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                <span>Check In</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab("logs")}
          className={`pb-3 px-3 text-xs font-bold transition-all relative ${
            activeTab === "logs"
              ? "text-emerald-700 border-b-2 border-emerald-600"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          Recent Activity Logs ({recentEvents.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("night_outs")}
          className={`pb-3 px-3 text-xs font-bold transition-all relative flex items-center gap-1.5 ${
            activeTab === "night_outs"
              ? "text-emerald-700 border-b-2 border-emerald-600"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <span>Pending Night-Outs</span>
          {pendingNightOuts.length > 0 && (
            <span className="w-4 h-4 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
              {pendingNightOuts.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "logs" && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
          {recentEvents.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">No gate events recorded yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[11px] font-bold">
                    <th className="py-3 px-4">Resident</th>
                    <th className="py-3 px-4">Movement</th>
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Late?</th>
                    <th className="py-3 px-4">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentEvents.map((evt) => (
                    <tr key={evt.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{evt.tenant_name}</div>
                        <div className="text-[11px] text-slate-400">
                          {evt.room_number ? `Room ${evt.room_number}` : ""} • {evt.phone}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                          evt.event_type === "check_in"
                            ? "bg-emerald-100 text-emerald-800"
                            : evt.event_type === "check_out"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-red-100 text-red-800"
                        }`}>
                          {evt.event_type.replace("_", " ")}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600 font-medium">
                        {new Date(evt.logged_at).toLocaleTimeString("en-IN", {
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: true,
                        })}
                      </td>
                      <td className="py-3 px-4">
                        {evt.is_late ? (
                          <span className="px-2 py-0.5 rounded bg-red-100 text-red-800 font-bold text-[10px]">
                            LATE
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Normal</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-500 italic max-w-xs truncate">
                        {evt.notes || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "night_outs" && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
          {pendingNightOuts.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">No pending night-out requests.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[11px] font-bold">
                    <th className="py-3 px-4">Resident</th>
                    <th className="py-3 px-4">Departure</th>
                    <th className="py-3 px-4">Expected Return</th>
                    <th className="py-3 px-4">Reason</th>
                    <th className="py-3 px-4">Parent Consent</th>
                    {canManage && <th className="py-3 px-4 text-right">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pendingNightOuts.map((req) => (
                    <tr key={req.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{req.tenant_name}</div>
                        <div className="text-[11px] text-slate-400">
                          {req.room_number ? `Room ${req.room_number}` : ""} • {req.phone}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-700">
                        {new Date(req.departure_date).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                        })}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-700">
                        {new Date(req.expected_return_date).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                        })}
                      </td>
                      <td className="py-3 px-4 text-slate-600 max-w-xs truncate">
                        {req.reason}
                      </td>
                      <td className="py-3 px-4">
                        {req.parent_consent_verified ? (
                          <span className="text-emerald-700 font-bold inline-flex items-center gap-1">
                            <ShieldCheck className="w-3.5 h-3.5" /> Verified
                          </span>
                        ) : (
                          <span className="text-amber-700 font-medium">Pending Call</span>
                        )}
                      </td>
                      {canManage && (
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setReviewNightOutTarget(req);
                              setParentConsentChecked(req.parent_consent_verified);
                            }}
                            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg transition-colors"
                          >
                            Review
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* --- MODAL: Review Night Out --- */}
      {reviewNightOutTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 relative">
            <button
              type="button"
              onClick={() => setReviewNightOutTarget(null)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-black text-slate-900 mb-1">Review Night Out</h3>
            <p className="text-xs text-slate-500 mb-4">
              Request by <span className="font-bold text-slate-900">{reviewNightOutTarget.tenant_name}</span>.
            </p>

            <div className="p-3 bg-slate-50 rounded-xl space-y-1.5 text-xs text-slate-700 mb-4">
              <div><span className="text-slate-400">Departure:</span> {new Date(reviewNightOutTarget.departure_date).toLocaleDateString("en-IN")}</div>
              <div><span className="text-slate-400">Return:</span> {new Date(reviewNightOutTarget.expected_return_date).toLocaleDateString("en-IN")}</div>
              <div><span className="text-slate-400">Reason:</span> {reviewNightOutTarget.reason}</div>
            </div>

            <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 mb-5 cursor-pointer">
              <input
                type="checkbox"
                checked={parentConsentChecked}
                onChange={(e) => setParentConsentChecked(e.target.checked)}
                className="rounded text-emerald-600 focus:ring-emerald-500"
              />
              <span>Parent / Guardian Consent Confirmed</span>
            </label>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => handleReviewNightOut("rejected")}
                className="px-4 py-2 border border-red-200 text-red-700 hover:bg-red-50 text-xs font-bold rounded-xl"
              >
                Reject
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => handleReviewNightOut("approved")}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-1.5"
              >
                {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Approve Night Out</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DoorInsideIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M18 20V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14" />
      <path d="M2 20h20" />
      <path d="M14 12v.01" />
    </svg>
  );
}
