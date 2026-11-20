"use client";

import { useState } from "react";
import { 
  Plus, 
  Receipt, 
  AlertCircle, 
  X, 
  Loader2, 
  Download,
  Sliders
} from "lucide-react";
import { 
  recordManualPaymentAction, 
  generateMonthlyInvoicesAction, 
  applyRentAdjustmentAction 
} from "@/actions/payments";
import type { RentRecordStatus } from "@/types/database.types";

export interface RentRecordItem {
  id: string;
  pg_id: string;
  tenant_id: string;
  tenant_name: string;
  room_number?: string | null;
  bed_label?: string | null;
  billing_month: string;
  due_date: string;
  base_rent_amount: number;
  utility_charges: number;
  late_fees: number;
  discount_amount: number;
  total_amount_due: number;
  paid_amount: number;
  balance_due: number;
  status: RentRecordStatus;
  created_at: string;
}

export interface PaymentItem {
  id: string;
  tenant_id: string;
  tenant_name: string;
  amount: number;
  payment_method: string;
  payment_status: string;
  notes: string | null;
  created_at: string;
}

interface FinancialLedgerProps {
  pgId: string;
  rentRecords: RentRecordItem[];
  recentPayments?: PaymentItem[];
  canManage?: boolean;
}

export function FinancialLedger({
  pgId,
  rentRecords,
  recentPayments = [],
  canManage = true,
}: FinancialLedgerProps) {
  const [filterMonth, setFilterMonth] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<RentRecordItem | null>(null);
  const [adjustmentTarget, setAdjustmentTarget] = useState<RentRecordItem | null>(null);
  const [receiptTarget, setReceiptTarget] = useState<RentRecordItem | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Extract distinct billing months
  const months = Array.from(new Set(rentRecords.map((r) => r.billing_month))).sort().reverse();

  // Filtered records
  const filteredRecords = rentRecords.filter((r) => {
    const matchesMonth = filterMonth === "all" || r.billing_month === filterMonth;
    const matchesStatus = filterStatus === "all" || r.status === filterStatus;
    return matchesMonth && matchesStatus;
  });

  // Ledger stats
  const totalBilled = filteredRecords.reduce((acc, r) => acc + r.total_amount_due, 0);
  const totalCollected = filteredRecords.reduce((acc, r) => acc + r.paid_amount, 0);
  const totalBalanceDue = filteredRecords.reduce((acc, r) => acc + r.balance_due, 0);
  const collectionRate = totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 100) : 0;

  const handleGenerateInvoices = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    const formData = new FormData(e.currentTarget);
    formData.set("pg_id", pgId);

    const res = await generateMonthlyInvoicesAction(formData);
    setLoading(false);
    if (!res.success) {
      setErrorMsg(res.error || "Failed to generate invoices.");
    } else {
      setIsGenerateOpen(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!paymentTarget) return;
    setLoading(true);
    setErrorMsg(null);

    const formData = new FormData(e.currentTarget);
    formData.set("pg_id", pgId);
    formData.set("tenant_id", paymentTarget.tenant_id);
    formData.set("rent_record_id", paymentTarget.id);

    const res = await recordManualPaymentAction(formData);
    setLoading(false);
    if (!res.success) {
      setErrorMsg(res.error || "Failed to record payment.");
    } else {
      setPaymentTarget(null);
    }
  };

  const handleApplyAdjustment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!adjustmentTarget) return;
    setLoading(true);
    setErrorMsg(null);

    const formData = new FormData(e.currentTarget);
    formData.set("pg_id", pgId);
    formData.set("rent_record_id", adjustmentTarget.id);

    const res = await applyRentAdjustmentAction(formData);
    setLoading(false);
    if (!res.success) {
      setErrorMsg(res.error || "Failed to apply adjustment.");
    } else {
      setAdjustmentTarget(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Financial Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Total Billed</span>
          <div className="text-2xl font-black text-slate-900 mt-1">₹{totalBilled.toLocaleString("en-IN")}</div>
          <span className="text-xs text-slate-500">{filteredRecords.length} invoices</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
          <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wider block">Total Collected</span>
          <div className="text-2xl font-black text-emerald-700 mt-1">₹{totalCollected.toLocaleString("en-IN")}</div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden">
            <div className="bg-emerald-600 h-full rounded-full transition-all" style={{ width: `${collectionRate}%` }} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
          <span className="text-xs font-semibold text-red-600 uppercase tracking-wider block">Outstanding Due</span>
          <div className="text-2xl font-black text-red-700 mt-1">₹{totalBalanceDue.toLocaleString("en-IN")}</div>
          <span className="text-xs text-slate-500">{collectionRate}% collection rate</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
          <span className="text-xs font-semibold text-blue-600 uppercase tracking-wider block">Recent Payments</span>
          <div className="text-2xl font-black text-blue-700 mt-1">{recentPayments.length}</div>
          <span className="text-xs text-slate-500">recorded transactions</span>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Month & Status Filters */}
        <div className="flex items-center gap-3 overflow-x-auto pb-1 sm:pb-0">
          <select
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="px-3 py-1.5 text-xs font-bold bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
          >
            <option value="all">All Months</option>
            {months.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>

          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            {["all", "paid", "pending", "partially_paid", "overdue"].map((st) => (
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
        </div>

        {canManage && (
          <button
            type="button"
            onClick={() => setIsGenerateOpen(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-1.5 shrink-0 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Generate Invoices</span>
          </button>
        )}
      </div>

      {/* Ledger Table */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
        {filteredRecords.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            <Receipt className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-800">No rent invoices found</h3>
            <p className="text-xs text-slate-500 mt-1">Generate monthly invoices for active bed residents.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[11px] font-bold">
                  <th className="py-3 px-4">Resident</th>
                  <th className="py-3 px-4">Month</th>
                  <th className="py-3 px-4">Due Date</th>
                  <th className="py-3 px-4">Total Due</th>
                  <th className="py-3 px-4">Paid</th>
                  <th className="py-3 px-4">Balance</th>
                  <th className="py-3 px-4">Status</th>
                  {canManage && <th className="py-3 px-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRecords.map((r) => {
                  const isPaid = r.status === "paid";
                  const isPending = r.status === "pending";
                  const isOverdue = r.status === "overdue";

                  return (
                    <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 text-sm">{r.tenant_name}</div>
                        <div className="text-[11px] text-slate-500">
                          {r.room_number ? `Room ${r.room_number}` : ""} {r.bed_label ? `• ${r.bed_label}` : ""}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-700">
                        {r.billing_month}
                      </td>
                      <td className="py-3 px-4 text-slate-600 font-medium">
                        {new Date(r.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900">
                        ₹{r.total_amount_due.toLocaleString("en-IN")}
                      </td>
                      <td className="py-3 px-4 font-bold text-emerald-700">
                        ₹{r.paid_amount.toLocaleString("en-IN")}
                      </td>
                      <td className="py-3 px-4 font-bold text-red-700">
                        ₹{r.balance_due.toLocaleString("en-IN")}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                          isPaid
                            ? "bg-emerald-100 text-emerald-800"
                            : isOverdue
                            ? "bg-red-100 text-red-800"
                            : isPending
                            ? "bg-amber-100 text-amber-800"
                            : "bg-blue-100 text-blue-800"
                        }`}>
                          {r.status.replace("_", " ")}
                        </span>
                      </td>
                      {canManage && (
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {!isPaid && (
                              <button
                                type="button"
                                onClick={() => setPaymentTarget(r)}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[11px] transition-colors"
                              >
                                Record Pay
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setAdjustmentTarget(r)}
                              className="px-2 py-1 text-slate-600 hover:bg-slate-100 rounded-lg font-bold text-[11px] transition-colors"
                              title="Waiver / Discount / Late Fee"
                            >
                              <Sliders className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setReceiptTarget(r)}
                              className="px-2 py-1 text-slate-600 hover:bg-slate-100 rounded-lg font-bold text-[11px] transition-colors"
                              title="View Receipt"
                            >
                              <Receipt className="w-3.5 h-3.5" />
                            </button>
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

      {/* --- MODAL: Generate Monthly Invoices --- */}
      {isGenerateOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 relative">
            <button
              type="button"
              onClick={() => setIsGenerateOpen(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-black text-slate-900 mb-1">Generate Monthly Invoices</h3>
            <p className="text-xs text-slate-500 mb-4">
              Creates rent records for all active bed assignments for the chosen month.
            </p>

            {errorMsg && (
              <div className="p-3 mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleGenerateInvoices} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Billing Month</label>
                <input
                  type="month"
                  name="billing_month"
                  required
                  defaultValue={new Date().toISOString().slice(0, 7)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Due Date</label>
                <input
                  type="date"
                  name="due_date"
                  required
                  defaultValue={new Date(Date.now() + 5 * 86400000).toISOString().split("T")[0]}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsGenerateOpen(false)}
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
                  <span>Generate Invoices</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL: Record Manual Payment --- */}
      {paymentTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 relative">
            <button
              type="button"
              onClick={() => setPaymentTarget(null)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-black text-slate-900 mb-1">Record Offline Payment</h3>
            <p className="text-xs text-slate-500 mb-4">
              Resident: <span className="font-bold text-slate-800">{paymentTarget.tenant_name}</span> • Balance: ₹{paymentTarget.balance_due.toLocaleString("en-IN")}
            </p>

            {errorMsg && (
              <div className="p-3 mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleRecordPayment} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Payment Amount (₹)</label>
                <input
                  type="number"
                  name="amount"
                  required
                  defaultValue={paymentTarget.balance_due}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Payment Mode</label>
                <select
                  name="payment_method"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                >
                  <option value="cash">Cash in Hand</option>
                  <option value="upi">Direct UPI (PhonePe / GPay QR)</option>
                  <option value="bank_transfer">Direct IMPS / NEFT Transfer</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Notes / Transaction Reference</label>
                <input
                  type="text"
                  name="notes"
                  placeholder="e.g. Cash collected by warden / UPI ref 409823"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentTarget(null)}
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
                  <span>Save Payment</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL: Apply Adjustment / Waiver --- */}
      {adjustmentTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 relative">
            <button
              type="button"
              onClick={() => setAdjustmentTarget(null)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-black text-slate-900 mb-1">Apply Ledger Adjustment</h3>
            <p className="text-xs text-slate-500 mb-4">{adjustmentTarget.tenant_name} • {adjustmentTarget.billing_month}</p>

            <form onSubmit={handleApplyAdjustment} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Adjustment Type</label>
                <select
                  name="adjustment_type"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                >
                  <option value="discount">Discount (Reduces Due)</option>
                  <option value="waiver">Waiver (Reduces Due)</option>
                  <option value="late_fee_addition">Late Fee Penalty (Increases Due)</option>
                  <option value="utility_meter">Electricity / Utility Meter Charge (Increases Due)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Adjustment Amount (₹)</label>
                <input
                  type="number"
                  name="amount"
                  required
                  placeholder="e.g. 500"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Reason / Authorization</label>
                <input
                  type="text"
                  name="reason"
                  required
                  placeholder="e.g. Submeter 50 units @ ₹10 or referral discount"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAdjustmentTarget(null)}
                  className="px-4 py-2 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-1.5"
                >
                  {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Adjustment</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL: View Receipt --- */}
      {receiptTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 relative">
            <button
              type="button"
              onClick={() => setReceiptTarget(null)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 print:hidden"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center pb-4 border-b border-slate-100">
              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest block">Official Rent Receipt</span>
              <h3 className="text-xl font-black text-slate-900 mt-0.5">PG Manager Statement</h3>
              <p className="text-xs text-slate-500">Invoice: {receiptTarget.id.slice(0, 8).toUpperCase()}</p>
            </div>

            <div className="py-4 space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-500">Resident Name</span>
                <span className="font-bold text-slate-900">{receiptTarget.tenant_name}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-500">Room / Bed</span>
                <span className="font-bold text-slate-900">Room {receiptTarget.room_number || "—"} • {receiptTarget.bed_label || "—"}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-500">Billing Month</span>
                <span className="font-bold text-slate-900 font-mono">{receiptTarget.billing_month}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-500">Base Monthly Rent</span>
                <span className="font-semibold text-slate-900">₹{receiptTarget.base_rent_amount.toLocaleString("en-IN")}</span>
              </div>
              {receiptTarget.utility_charges > 0 && (
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-500">Utility / Electricity Charges</span>
                  <span className="font-semibold text-slate-900">₹{receiptTarget.utility_charges.toLocaleString("en-IN")}</span>
                </div>
              )}
              {receiptTarget.discount_amount > 0 && (
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-emerald-700">Discount / Waiver</span>
                  <span className="font-semibold text-emerald-700">-₹{receiptTarget.discount_amount.toLocaleString("en-IN")}</span>
                </div>
              )}
              <div className="flex justify-between py-2 border-t-2 border-slate-900 text-sm font-black">
                <span>Total Amount Due</span>
                <span>₹{receiptTarget.total_amount_due.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between py-1 text-emerald-700 font-bold">
                <span>Total Paid</span>
                <span>₹{receiptTarget.paid_amount.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between py-1 text-red-700 font-bold">
                <span>Balance Remaining</span>
                <span>₹{receiptTarget.balance_due.toLocaleString("en-IN")}</span>
              </div>
            </div>

            <div className="pt-4 flex items-center justify-end gap-2 print:hidden">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-sm inline-flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Print Receipt</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
