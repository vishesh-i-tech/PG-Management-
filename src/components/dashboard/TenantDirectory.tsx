"use client";

import { useState } from "react";
import { 
  Users, 
  UserPlus, 
  Phone, 
  Search, 
  ShieldCheck, 
  FileText, 
  LogOut, 
  AlertCircle, 
  X, 
  Loader2, 
  BedDouble, 
  Lock
} from "lucide-react";
import { createTenantAction, vacateBedAction, uploadKycDocumentAction } from "@/actions/tenants";
import type { TenantStatus } from "@/types/database.types";

export interface TenantWithAssignment {
  id: string;
  pg_id: string;
  full_name: string;
  phone: string;
  email: string | null;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  workplace_or_college: string | null;
  joining_date: string;
  security_deposit_amount: number;
  security_deposit_status: string;
  status: TenantStatus;
  current_bed?: {
    id: string;
    bed_label: string;
    room_number: string;
    monthly_rent: number;
    assignment_id: string;
    assigned_from: string;
  } | null;
  has_kyc_verified?: boolean;
}

export interface AvailableBedOption {
  id: string;
  bed_label: string;
  room_number: string;
  monthly_rent: number;
}

interface TenantDirectoryProps {
  pgId: string;
  tenants: TenantWithAssignment[];
  availableBeds?: AvailableBedOption[];
  canManage?: boolean;
}

export function TenantDirectory({
  pgId,
  tenants,
  availableBeds = [],
  canManage = true,
}: TenantDirectoryProps) {
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [kycTargetTenant, setKycTargetTenant] = useState<TenantWithAssignment | null>(null);
  const [vacateTargetTenant, setVacateTargetTenant] = useState<TenantWithAssignment | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filter tenants
  const filteredTenants = tenants.filter((t) => {
    const matchesStatus = filterStatus === "all" || t.status === filterStatus;
    const matchesSearch = 
      t.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.phone.includes(searchQuery) ||
      (t.current_bed?.room_number && t.current_bed.room_number.includes(searchQuery));
    return matchesStatus && matchesSearch;
  });

  const handleRegisterTenant = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    const formData = new FormData(e.currentTarget);
    formData.set("pg_id", pgId);

    const res = await createTenantAction(formData);
    setLoading(false);
    if (!res.success) {
      setErrorMsg(res.error || "Failed to register tenant.");
    } else {
      setIsRegisterOpen(false);
    }
  };

  const handleUploadKyc = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!kycTargetTenant) return;
    setLoading(true);
    setErrorMsg(null);
    const formData = new FormData(e.currentTarget);
    formData.set("pg_id", pgId);
    formData.set("tenant_id", kycTargetTenant.id);

    const res = await uploadKycDocumentAction(formData);
    setLoading(false);
    if (!res.success) {
      setErrorMsg(res.error || "Failed to upload KYC document.");
    } else {
      setKycTargetTenant(null);
    }
  };

  const handleVacateTenant = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!vacateTargetTenant || !vacateTargetTenant.current_bed) return;
    setLoading(true);
    setErrorMsg(null);
    const formData = new FormData(e.currentTarget);
    formData.set("pg_id", pgId);
    formData.set("tenant_id", vacateTargetTenant.id);
    formData.set("bed_id", vacateTargetTenant.current_bed.id);
    formData.set("assignment_id", vacateTargetTenant.current_bed.assignment_id);

    const res = await vacateBedAction(formData);
    setLoading(false);
    if (!res.success) {
      setErrorMsg(res.error || "Failed to vacate tenant.");
    } else {
      setVacateTargetTenant(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, phone, or room..."
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden bg-white shadow-xs"
          />
        </div>

        {/* Filter Tabs & Register Action */}
        <div className="flex items-center gap-2 overflow-x-auto">
          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            {["all", "active", "notice_period", "vacated"].map((st) => (
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
              onClick={() => setIsRegisterOpen(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-1.5 shrink-0 transition-all"
            >
              <UserPlus className="w-4 h-4" />
              <span>Register Resident</span>
            </button>
          )}
        </div>
      </div>

      {/* Tenants Table */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
        {filteredTenants.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-800">No residents match criteria</h3>
            <p className="text-xs text-slate-500 mt-1">Register new residents or adjust filter terms.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[11px] font-bold">
                  <th className="py-3 px-4">Resident</th>
                  <th className="py-3 px-4">Room &amp; Bed</th>
                  <th className="py-3 px-4">Emergency Contact</th>
                  <th className="py-3 px-4">Joining Date</th>
                  <th className="py-3 px-4">KYC Status</th>
                  <th className="py-3 px-4">Status</th>
                  {canManage && <th className="py-3 px-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTenants.map((tenant) => {
                  const isActive = tenant.status === "active";
                  const hasBed = !!tenant.current_bed;

                  return (
                    <tr key={tenant.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Name & Phone */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 text-sm">{tenant.full_name}</div>
                        <div className="text-slate-500 flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span>{tenant.phone}</span>
                        </div>
                      </td>

                      {/* Bed Badge */}
                      <td className="py-3 px-4">
                        {hasBed ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold">
                            <BedDouble className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Room {tenant.current_bed?.room_number} • {tenant.current_bed?.bed_label}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">No bed assigned</span>
                        )}
                      </td>

                      {/* Emergency Contact */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-700">{tenant.emergency_contact_name}</div>
                        <div className="text-slate-500 text-[11px]">{tenant.emergency_contact_phone}</div>
                      </td>

                      {/* Joining Date */}
                      <td className="py-3 px-4 text-slate-600 font-medium">
                        {new Date(tenant.joining_date).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>

                      {/* KYC Badge */}
                      <td className="py-3 px-4">
                        {tenant.has_kyc_verified ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                            <ShieldCheck className="w-3 h-3 text-emerald-600" /> Verified
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setKycTargetTenant(tenant)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 font-bold text-[10px] hover:bg-amber-100 transition-colors"
                          >
                            <FileText className="w-3 h-3 text-amber-600" /> Upload KYC
                          </button>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                          isActive
                            ? "bg-emerald-100 text-emerald-800"
                            : tenant.status === "notice_period"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-slate-100 text-slate-600"
                        }`}>
                          {tenant.status.replace("_", " ")}
                        </span>
                      </td>

                      {/* Actions */}
                      {canManage && (
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {hasBed && isActive && (
                              <button
                                type="button"
                                onClick={() => setVacateTargetTenant(tenant)}
                                className="px-2.5 py-1 text-slate-600 hover:text-red-700 border border-slate-200 hover:border-red-200 rounded-lg font-bold text-[11px] inline-flex items-center gap-1 transition-colors"
                              >
                                <LogOut className="w-3 h-3" />
                                <span>Vacate</span>
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* --- MODAL: Register New Resident --- */}
      {isRegisterOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 relative max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setIsRegisterOpen(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-black text-slate-900 mb-1">Register Resident</h3>
            <p className="text-xs text-slate-500 mb-4">Add new tenant and optionally allocate an available bed.</p>

            {errorMsg && (
              <div className="p-3 mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleRegisterTenant} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Full Name</label>
                  <input
                    type="text"
                    name="full_name"
                    required
                    placeholder="e.g. Rahul Sharma"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Mobile Number (India)</label>
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
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Emergency Contact Name</label>
                  <input
                    type="text"
                    name="emergency_contact_name"
                    required
                    placeholder="e.g. Suresh Sharma (Father)"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Emergency Phone</label>
                  <input
                    type="tel"
                    name="emergency_contact_phone"
                    required
                    placeholder="10-digit emergency phone"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Joining Date</label>
                  <input
                    type="date"
                    name="joining_date"
                    required
                    defaultValue={new Date().toISOString().split("T")[0]}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Security Deposit (₹)</label>
                  <input
                    type="number"
                    name="security_deposit_amount"
                    defaultValue={10000}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Initial Bed Assignment (Optional)</label>
                <select
                  name="bed_id"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                >
                  <option value="">-- Assign Bed Later --</option>
                  {availableBeds.map((b) => (
                    <option key={b.id} value={b.id}>
                      Room {b.room_number} • {b.bed_label} (₹{b.monthly_rent.toLocaleString("en-IN")}/mo)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Workplace or College</label>
                <input
                  type="text"
                  name="workplace_or_college"
                  placeholder="e.g. Infosys / Tech Mahindra"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsRegisterOpen(false)}
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
                  <span>Save Resident</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL: Upload KYC Document --- */}
      {kycTargetTenant && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 relative">
            <button
              type="button"
              onClick={() => setKycTargetTenant(null)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
                <Lock className="w-4 h-4" />
              </div>
              <h3 className="text-lg font-black text-slate-900">Upload KYC Document</h3>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              India DPDP compliance: Only the last 4 digits are recorded. File is stored in a private signed bucket.
            </p>

            {errorMsg && (
              <div className="p-3 mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleUploadKyc} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Identity Proof Type</label>
                <select
                  name="id_proof_type"
                  required
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                >
                  <option value="masked_aadhaar">Aadhaar Card (Masked)</option>
                  <option value="passport">Passport</option>
                  <option value="driving_license">Driving License</option>
                  <option value="voter_id">Voter ID</option>
                  <option value="college_id">College / Student ID</option>
                  <option value="work_id">Company / Work ID</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Last 4 Digits of Document</label>
                <input
                  type="text"
                  name="id_proof_last_four"
                  required
                  maxLength={4}
                  minLength={4}
                  placeholder="e.g. 7894"
                  className="w-full px-3 py-2 text-sm font-mono tracking-widest border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Document Attachment (PDF or Image)</label>
                <input
                  type="file"
                  name="file"
                  required
                  accept="image/*,application/pdf"
                  className="w-full text-xs text-slate-500 file:mr-2 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setKycTargetTenant(null)}
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
                  <span>Upload &amp; Encrypt</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL: Vacate Tenant --- */}
      {vacateTargetTenant && vacateTargetTenant.current_bed && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 relative">
            <button
              type="button"
              onClick={() => setVacateTargetTenant(null)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-black text-slate-900 mb-1">Vacate Resident</h3>
            <p className="text-xs text-slate-500 mb-4">
              Vacating {vacateTargetTenant.full_name} will release {vacateTargetTenant.current_bed.bed_label} in Room {vacateTargetTenant.current_bed.room_number}.
            </p>

            {errorMsg && (
              <div className="p-3 mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleVacateTenant} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Effective Vacating Date</label>
                <input
                  type="date"
                  name="vacating_date"
                  required
                  defaultValue={new Date().toISOString().split("T")[0]}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-800">
                ⚠️ Historical rent records and payment receipts will remain permanently accessible to the vacated resident under read-only RLS policy.
              </div>

              <div className="pt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setVacateTargetTenant(null)}
                  className="px-4 py-2 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-1.5"
                >
                  {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Confirm Vacate</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
