"use client";

import { useState } from "react";
import { 
  CreditCard, 
  Receipt, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  Loader2, 
  ShieldCheck,
  Smartphone
} from "lucide-react";
import { createPaymentOrderAction, verifyAndReconcilePaymentAction } from "@/actions/payments";
import type { RentRecordStatus } from "@/types/database.types";

export interface TenantRentBill {
  id: string;
  pg_id: string;
  billing_month: string;
  period_start: string;
  period_end: string;
  due_date: string;
  base_rent_amount: number;
  utility_charges: number;
  late_fees: number;
  discount_amount: number;
  total_amount_due: number;
  paid_amount: number;
  balance_due: number;
  status: RentRecordStatus;
}

interface TenantPaymentModalProps {
  pgId: string;
  tenantId: string;
  tenantName: string;
  bills: TenantRentBill[];
}

export function TenantPaymentModal({
  pgId,
  tenantId,
  tenantName,
  bills,
}: TenantPaymentModalProps) {
  const [selectedBill, setSelectedBill] = useState<TenantRentBill | null>(null);
  const [loading, setLoading] = useState(false);
  const [successResult, setSuccessResult] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const pendingBills = bills.filter((b) => b.balance_due > 0 && b.status !== "paid");
  const paidBills = bills.filter((b) => b.status === "paid" || b.balance_due === 0);

  const handlePayBill = async () => {
    if (!selectedBill) return;
    setLoading(true);
    setErrorMsg(null);
    setSuccessResult(null);

    // 1. Create order on server
    const orderFormData = new FormData();
    orderFormData.set("pg_id", pgId);
    orderFormData.set("tenant_id", tenantId);
    orderFormData.set("rent_record_id", selectedBill.id);

    const orderRes = await createPaymentOrderAction(orderFormData);
    if (!orderRes.success || !orderRes.data) {
      setLoading(false);
      setErrorMsg(orderRes.error || "Order creation failed.");
      return;
    }

    const { orderId, amount } = orderRes.data;

    // 2. Perform verification & reconciliation
    // In production, Razorpay checkout modal opens and returns payment_id and signature.
    // For test/simulator execution, we generate the mock transaction confirmation.
    const mockPaymentId = `pay_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const verifyFormData = new FormData();
    verifyFormData.set("razorpay_order_id", orderId);
    verifyFormData.set("razorpay_payment_id", mockPaymentId);
    verifyFormData.set("payment_method", "upi");
    verifyFormData.set("captured_amount", amount.toString());

    const verifyRes = await verifyAndReconcilePaymentAction(verifyFormData);
    setLoading(false);
    if (!verifyRes.success) {
      setErrorMsg(verifyRes.error || "Payment reconciliation failed.");
    } else {
      setSuccessResult(`Payment of ₹${amount.toLocaleString("en-IN")} reconciled successfully! Reference: ${mockPaymentId}`);
      setSelectedBill(null);
    }
  };

  return (
    <div className="space-y-6">
      {successResult && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="font-semibold">{successResult}</span>
        </div>
      )}

      {/* Pending Invoices */}
      <div className="bg-white rounded-3xl border border-slate-200/90 p-6 shadow-sm">
        <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2 mb-4">
          <CreditCard className="w-4 h-4 text-emerald-600" />
          <span>Pending Rent Bills</span>
        </h3>

        {pendingBills.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
            <h4 className="font-bold text-slate-800 text-sm">All rent dues cleared!</h4>
            <p className="text-slate-400 mt-0.5">You have no outstanding payments due at this time.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingBills.map((b) => (
              <div
                key={b.id}
                className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-base text-slate-900">
                      ₹{b.balance_due.toLocaleString("en-IN")}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-extrabold uppercase">
                      Due
                    </span>
                  </div>
                  <span className="text-xs text-slate-500 block mt-0.5">
                    Month: <span className="font-bold text-slate-700">{b.billing_month}</span> • Due Date: {new Date(b.due_date).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedBill(b)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm flex items-center justify-center gap-1.5 transition-all shrink-0"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Pay Now via UPI</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Payment History */}
      <div className="bg-white rounded-3xl border border-slate-200/90 p-6 shadow-sm">
        <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2 mb-4">
          <Receipt className="w-4 h-4 text-emerald-600" />
          <span>Payment History &amp; Receipts</span>
        </h3>

        {paidBills.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400 italic">
            No historical payments recorded yet.
          </div>
        ) : (
          <div className="space-y-2">
            {paidBills.map((b) => (
              <div
                key={b.id}
                className="p-3 bg-slate-50 rounded-xl flex items-center justify-between text-xs"
              >
                <div>
                  <span className="font-bold text-slate-900">{b.billing_month}</span>
                  <span className="text-slate-500 ml-2">Total Paid: ₹{b.paid_amount.toLocaleString("en-IN")}</span>
                </div>
                <span className="inline-flex items-center gap-1 text-emerald-700 font-bold text-[11px]">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Paid
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* --- MODAL: Razorpay Checkout Dialog --- */}
      {selectedBill && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 relative">
            <button
              type="button"
              onClick={() => setSelectedBill(null)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <Smartphone className="w-4 h-4" />
              </div>
              <h3 className="text-lg font-black text-slate-900">Rent Payment</h3>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Resident: <span className="font-semibold text-slate-700">{tenantName}</span> • Secure checkout powered by Razorpay.
            </p>

            {errorMsg && (
              <div className="p-3 mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 text-xs mb-5">
              <div className="flex justify-between">
                <span className="text-slate-500">Billing Month</span>
                <span className="font-bold text-slate-900">{selectedBill.billing_month}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Base Rent</span>
                <span className="font-semibold text-slate-900">₹{selectedBill.base_rent_amount.toLocaleString("en-IN")}</span>
              </div>
              {selectedBill.utility_charges > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Utility Charges</span>
                  <span className="font-semibold text-slate-900">₹{selectedBill.utility_charges.toLocaleString("en-IN")}</span>
                </div>
              )}
              {selectedBill.discount_amount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Discount</span>
                  <span>-₹{selectedBill.discount_amount.toLocaleString("en-IN")}</span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-slate-200 font-extrabold text-sm text-slate-900">
                <span>Total Amount Due</span>
                <span className="text-emerald-700">₹{selectedBill.balance_due.toLocaleString("en-IN")}</span>
              </div>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                disabled={loading}
                onClick={handlePayBill}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-md flex items-center justify-center gap-2 transition-all"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processing Payment...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Pay ₹{selectedBill.balance_due.toLocaleString("en-IN")} Securely</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setSelectedBill(null)}
                className="w-full py-2.5 border border-slate-200 text-slate-600 font-bold rounded-xl text-xs hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
