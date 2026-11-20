"use client";

import { useState } from "react";
import { 
  AlertCircle, 
  Wrench, 
  X, 
  Loader2, 
  Plus
} from "lucide-react";
import { createComplaintAction, updateComplaintStatusAction } from "@/actions/complaints";
import type { ComplaintCategory, ComplaintPriority, ComplaintStatus } from "@/types/database.types";

export interface ComplaintItem {
  id: string;
  pg_id: string;
  tenant_id: string;
  tenant_name: string;
  room_number?: string | null;
  category: ComplaintCategory;
  priority: ComplaintPriority;
  title: string;
  description: string;
  photo_storage_paths: string[];
  status: ComplaintStatus;
  created_at: string;
}

interface ComplaintsBoardProps {
  pgId: string;
  complaints: ComplaintItem[];
  canManage?: boolean;
  tenantId?: string;
  tenantRoomId?: string | null;
}

export function ComplaintsBoard({
  pgId,
  complaints,
  canManage = true,
  tenantId,
  tenantRoomId,
}: ComplaintsBoardProps) {
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [isSubmitOpen, setIsSubmitOpen] = useState(false);
  const [statusUpdateTarget, setStatusUpdateTarget] = useState<ComplaintItem | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const filtered = complaints.filter((c) => {
    return filterStatus === "all" || c.status === filterStatus;
  });

  const handleSubmitComplaint = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!tenantId) return;
    setLoading(true);
    setErrorMsg(null);

    const formData = new FormData(e.currentTarget);
    formData.set("pg_id", pgId);
    formData.set("tenant_id", tenantId);
    if (tenantRoomId) formData.set("room_id", tenantRoomId);

    const res = await createComplaintAction(formData);
    setLoading(false);
    if (!res.success) {
      setErrorMsg(res.error || "Failed to submit complaint.");
    } else {
      setIsSubmitOpen(false);
    }
  };

  const handleUpdateStatus = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!statusUpdateTarget) return;
    setLoading(true);
    setErrorMsg(null);

    const formData = new FormData(e.currentTarget);
    formData.set("pg_id", pgId);
    formData.set("complaint_id", statusUpdateTarget.id);
    formData.set("current_status", statusUpdateTarget.status);

    const res = await updateComplaintStatusAction(formData);
    setLoading(false);
    if (!res.success) {
      setErrorMsg(res.error || "Failed to update complaint status.");
    } else {
      setStatusUpdateTarget(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Status Filter */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl overflow-x-auto">
          {["all", "open", "in_progress", "resolved", "closed"].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setFilterStatus(st)}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all capitalize whitespace-nowrap ${
                filterStatus === st
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {st.replace("_", " ")}
            </button>
          ))}
        </div>

        {tenantId && (
          <button
            type="button"
            onClick={() => setIsSubmitOpen(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-1.5 shrink-0 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Raise Issue / Ticket</span>
          </button>
        )}
      </div>

      {/* Complaints Grid */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center">
          <Wrench className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">No issues matching criteria</h3>
          <p className="text-xs text-slate-500 mt-1">All maintenance issues are currently addressed.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => {
            const isOpen = item.status === "open";
            const isInProgress = item.status === "in_progress";
            const isResolved = item.status === "resolved";

            return (
              <div
                key={item.id}
                className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                      item.priority === "urgent"
                        ? "bg-red-100 text-red-800"
                        : item.priority === "high"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-slate-100 text-slate-700"
                    }`}>
                      {item.priority}
                    </span>

                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                      isOpen
                        ? "bg-red-100 text-red-800"
                        : isInProgress
                        ? "bg-blue-100 text-blue-800"
                        : isResolved
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-slate-100 text-slate-600"
                    }`}>
                      {item.status.replace("_", " ")}
                    </span>
                  </div>

                  <h4 className="font-extrabold text-slate-900 text-sm mb-1">{item.title}</h4>
                  <p className="text-xs text-slate-600 line-clamp-3 mb-3">{item.description}</p>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
                  <div className="text-slate-500">
                    <span className="font-bold text-slate-700 capitalize">{item.category}</span>
                    {item.room_number ? ` • Room ${item.room_number}` : ""}
                  </div>

                  {canManage && (
                    <button
                      type="button"
                      onClick={() => setStatusUpdateTarget(item)}
                      className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg text-[11px] transition-colors"
                    >
                      Update
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* --- MODAL: Raise Complaint (Tenant) --- */}
      {isSubmitOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 relative">
            <button
              type="button"
              onClick={() => setIsSubmitOpen(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-black text-slate-900 mb-1">Raise Maintenance Issue</h3>
            <p className="text-xs text-slate-500 mb-4">PG Warden and Staff will be notified to resolve this promptly.</p>

            {errorMsg && (
              <div className="p-3 mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmitComplaint} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Category</label>
                  <select
                    name="category"
                    required
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  >
                    <option value="plumbing">Plumbing / Water</option>
                    <option value="electrical">Electrical / Power</option>
                    <option value="wifi">WiFi / Internet</option>
                    <option value="carpentry">Furniture / Bed</option>
                    <option value="cleaning">Housekeeping</option>
                    <option value="food">Mess / Food</option>
                    <option value="security">Security</option>
                    <option value="other">Other Issue</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Priority</label>
                  <select
                    name="priority"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  >
                    <option value="medium">Medium Priority</option>
                    <option value="low">Low</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent / Emergency</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Short Title</label>
                <input
                  type="text"
                  name="title"
                  required
                  placeholder="e.g. Geyser not heating water"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Detailed Description</label>
                <textarea
                  name="description"
                  required
                  rows={3}
                  placeholder="Describe the problem in detail..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Attach Photo (Optional)</label>
                <input
                  type="file"
                  name="photos"
                  accept="image/*"
                  className="w-full text-xs text-slate-500 file:mr-2 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsSubmitOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-1.5"
                >
                  {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Submit Ticket</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL: Update Complaint Status (Warden/Owner) --- */}
      {statusUpdateTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 relative">
            <button
              type="button"
              onClick={() => setStatusUpdateTarget(null)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-black text-slate-900 mb-1">Update Ticket Status</h3>
            <p className="text-xs text-slate-500 mb-4">{statusUpdateTarget.title}</p>

            <form onSubmit={handleUpdateStatus} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Target Status</label>
                <select
                  name="status"
                  defaultValue={statusUpdateTarget.status}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                >
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Resolution / Progress Notes</label>
                <textarea
                  name="notes"
                  rows={2}
                  placeholder="e.g. Plumber dispatched, repaired valve."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setStatusUpdateTarget(null)}
                  className="px-4 py-2 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-1.5"
                >
                  {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Status</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
