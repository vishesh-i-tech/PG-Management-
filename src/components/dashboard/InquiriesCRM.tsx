"use client";

import { useState } from "react";
import { 
  Users, 
  Phone, 
  MessageSquare, 
  Plus, 
  X, 
  Loader2, 
  AlertCircle
} from "lucide-react";
import { createInquiryAction, updateInquiryStatusAction, addInquiryFollowUpAction } from "@/actions/inquiries";
import type { InquiryStatus, RoomType, InquirySource, FollowUpChannel } from "@/types/database.types";

export interface InquiryItem {
  id: string;
  pg_id: string;
  prospect_name: string;
  phone: string;
  email: string | null;
  desired_room_type: RoomType | null;
  expected_joining_date: string | null;
  budget: number | null;
  source: InquirySource;
  status: InquiryStatus;
  notes: string | null;
  created_at: string;
  follow_ups?: {
    id: string;
    channel: FollowUpChannel;
    notes: string;
    created_at: string;
  }[];
}

interface InquiriesCRMProps {
  pgId: string;
  inquiries: InquiryItem[];
  canManage?: boolean;
}

export function InquiriesCRM({
  pgId,
  inquiries,
  canManage = true,
}: InquiriesCRMProps) {
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [followUpTarget, setFollowUpTarget] = useState<InquiryItem | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const filtered = inquiries.filter((inq) => {
    return filterStatus === "all" || inq.status === filterStatus;
  });

  const handleCreateInquiry = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    const formData = new FormData(e.currentTarget);
    formData.set("pg_id", pgId);

    const res = await createInquiryAction(formData);
    setLoading(false);
    if (!res.success) {
      setErrorMsg(res.error || "Failed to add inquiry.");
    } else {
      setIsAddOpen(false);
    }
  };

  const handleAddFollowUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!followUpTarget) return;
    setLoading(true);
    setErrorMsg(null);

    const formData = new FormData(e.currentTarget);
    formData.set("pg_id", pgId);
    formData.set("inquiry_id", followUpTarget.id);

    const res = await addInquiryFollowUpAction(formData);
    setLoading(false);
    if (!res.success) {
      setErrorMsg(res.error || "Failed to log follow up.");
    } else {
      setFollowUpTarget(null);
    }
  };

  const handleStatusChange = async (inquiryId: string, status: InquiryStatus) => {
    const formData = new FormData();
    formData.set("pg_id", pgId);
    formData.set("inquiry_id", inquiryId);
    formData.set("status", status);
    await updateInquiryStatusAction(formData);
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center bg-slate-100 p-1 rounded-xl overflow-x-auto">
          {["all", "new", "contacted", "visit_scheduled", "converted", "dropped"].map((st) => (
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

        {canManage && (
          <button
            type="button"
            onClick={() => setIsAddOpen(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-1.5 shrink-0 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>New Lead / Inquiry</span>
          </button>
        )}
      </div>

      {/* Leads Grid */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">No inquiries found</h3>
          <p className="text-xs text-slate-500 mt-1">Capture walk-ins, phone calls, and website leads here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((inq) => (
            <div
              key={inq.id}
              className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 capitalize">
                    {inq.source.replace("_", " ")}
                  </span>

                  <select
                    value={inq.status}
                    onChange={(e) => handleStatusChange(inq.id, e.target.value as InquiryStatus)}
                    className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase border-0 focus:ring-1 focus:ring-emerald-500 cursor-pointer ${
                      inq.status === "new"
                        ? "bg-blue-100 text-blue-800"
                        : inq.status === "converted"
                        ? "bg-emerald-100 text-emerald-800"
                        : inq.status === "dropped"
                        ? "bg-slate-100 text-slate-600"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    <option value="new">New</option>
                    <option value="contacted">Contacted</option>
                    <option value="visit_scheduled">Visit Scheduled</option>
                    <option value="converted">Converted</option>
                    <option value="dropped">Dropped</option>
                  </select>
                </div>

                <h4 className="font-extrabold text-slate-900 text-sm mb-1">{inq.prospect_name}</h4>
                <div className="text-xs text-slate-500 flex items-center gap-1.5 mb-3">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <a href={`tel:${inq.phone}`} className="hover:text-emerald-700 font-medium">
                    {inq.phone}
                  </a>
                </div>

                <div className="space-y-1 text-xs text-slate-600 mb-3 bg-slate-50 p-2.5 rounded-xl">
                  {inq.desired_room_type && (
                    <div><span className="text-slate-400">Pref:</span> {inq.desired_room_type.replace("_", " ")}</div>
                  )}
                  {inq.budget && (
                    <div><span className="text-slate-400">Budget:</span> ₹{inq.budget.toLocaleString("en-IN")}</div>
                  )}
                  {inq.notes && (
                    <div className="text-slate-500 italic mt-1 line-clamp-2">{inq.notes}</div>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] text-slate-400">
                  {new Date(inq.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                </span>

                {canManage && (
                  <button
                    type="button"
                    onClick={() => setFollowUpTarget(inq)}
                    className="px-2.5 py-1 text-emerald-700 hover:bg-emerald-50 font-bold rounded-lg text-[11px] inline-flex items-center gap-1 transition-colors"
                  >
                    <MessageSquare className="w-3 h-3" />
                    <span>Log Follow-up</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* --- MODAL: Add Inquiry --- */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 relative">
            <button
              type="button"
              onClick={() => setIsAddOpen(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-black text-slate-900 mb-1">Capture New Lead</h3>
            <p className="text-xs text-slate-500 mb-4">Record inquiry from walk-in, call, or referral.</p>

            {errorMsg && (
              <div className="p-3 mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleCreateInquiry} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Prospect Name</label>
                  <input
                    type="text"
                    name="prospect_name"
                    required
                    placeholder="e.g. Amit Kumar"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Phone Number</label>
                  <input
                    type="tel"
                    name="phone"
                    required
                    placeholder="10-digit mobile"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Desired Room Type</label>
                  <select
                    name="desired_room_type"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  >
                    <option value="">Any Type</option>
                    <option value="single">Single Sharing</option>
                    <option value="double">Double Sharing</option>
                    <option value="triple">Triple Sharing</option>
                    <option value="four_sharing">Four Sharing</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Budget Max (₹)</label>
                  <input
                    type="number"
                    name="budget"
                    placeholder="e.g. 9000"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Source</label>
                  <select
                    name="source"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  >
                    <option value="walk_in">Walk In</option>
                    <option value="phone_call">Phone Call</option>
                    <option value="whatsapp_inquiry">WhatsApp</option>
                    <option value="website">Website</option>
                    <option value="referral">Friend Referral</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Joining Expectation</label>
                  <input
                    type="date"
                    name="expected_joining_date"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Notes</label>
                <textarea
                  name="notes"
                  rows={2}
                  placeholder="e.g. Looking for AC room with attached washroom."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
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
                  <span>Save Lead</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL: Add Follow Up --- */}
      {followUpTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 relative">
            <button
              type="button"
              onClick={() => setFollowUpTarget(null)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-black text-slate-900 mb-1">Log Follow-up</h3>
            <p className="text-xs text-slate-500 mb-4">Prospect: {followUpTarget.prospect_name}</p>

            <form onSubmit={handleAddFollowUp} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Contact Channel</label>
                <select
                  name="channel"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                >
                  <option value="phone_call">Phone Call</option>
                  <option value="whatsapp">WhatsApp Message</option>
                  <option value="in_person">In-Person Visit</option>
                  <option value="email">Email</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Notes / Discussion</label>
                <textarea
                  name="notes"
                  required
                  rows={3}
                  placeholder="e.g. Scheduled room tour for Saturday 4 PM."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setFollowUpTarget(null)}
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
                  <span>Save Follow-up</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
