"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import crypto from "node:crypto";
import type { ActionResult } from "./rooms";
import type { PaymentMethod, RentAdjustmentType } from "@/types/database.types";

export interface CreateOrderResult {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
  pgId: string;
  tenantId: string;
  rentRecordId: string;
}

/**
 * Creates a trusted payment_orders entry permanently binding the PG, Tenant, and Rent Record.
 */
export async function createPaymentOrderAction(formData: FormData): Promise<ActionResult<CreateOrderResult>> {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  if (authErr || !user) {
    return { success: false, error: "Authentication required." };
  }

  const pgId = formData.get("pg_id")?.toString();
  const tenantId = formData.get("tenant_id")?.toString();
  const rentRecordId = formData.get("rent_record_id")?.toString();

  if (!pgId || !tenantId || !rentRecordId) {
    return { success: false, error: "Missing required order parameters." };
  }

  // 1. Fetch rent record to get validated balance due
  const { data: rentRecord, error: rentErr } = await supabase
    .from("rent_records")
    .select("balance_amount, status")
    .eq("id", rentRecordId)
    .eq("pg_id", pgId)
    .single();

  if (rentErr || !rentRecord) {
    return { success: false, error: "Rent record not found." };
  }

  if (rentRecord.balance_amount <= 0 || rentRecord.status === "paid") {
    return { success: false, error: "This rent invoice has already been fully paid." };
  }

  // Generate unique order reference (in production, this also syncs with Razorpay API)
  const razorpayOrderId = `order_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const amountToCharge = rentRecord.balance_amount;

  // 2. Insert into payment_orders
  const { error: orderErr } = await supabase
    .from("payment_orders")
    .insert({
      pg_id: pgId,
      tenant_id: tenantId,
      target_rent_record_id: rentRecordId,
      razorpay_order_id: razorpayOrderId,
      expected_amount: amountToCharge,
      currency: "INR",
      status: "created",
    });

  if (orderErr) {
    return { success: false, error: `Failed to create payment order: ${orderErr.message}` };
  }

  const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "rzp_test_pgmanager";

  return {
    success: true,
    data: {
      orderId: razorpayOrderId,
      amount: amountToCharge,
      currency: "INR",
      keyId,
      pgId,
      tenantId,
      rentRecordId,
    },
  };
}

/**
 * Server-side signature verification & atomic reconciliation via reconcile_payment_transaction RPC.
 */
export async function verifyAndReconcilePaymentAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  if (authErr || !user) {
    return { success: false, error: "Authentication required." };
  }

  const razorpayOrderId = formData.get("razorpay_order_id")?.toString();
  const razorpayPaymentId = formData.get("razorpay_payment_id")?.toString();
  const razorpaySignature = formData.get("razorpay_signature")?.toString() || "";
  const paymentMethod = (formData.get("payment_method")?.toString() || "upi") as PaymentMethod;
  const capturedAmount = parseFloat(formData.get("captured_amount")?.toString() || "0");

  if (!razorpayOrderId || !razorpayPaymentId || isNaN(capturedAmount) || capturedAmount <= 0) {
    return { success: false, error: "Invalid payment verification arguments." };
  }

  // If Razorpay secret is set in environment, verify HMAC SHA-256 signature
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (keySecret && razorpaySignature) {
    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest("hex");

    if (expectedSignature !== razorpaySignature) {
      return { success: false, error: "Cryptographic payment signature mismatch. Transaction aborted." };
    }
  }

  // Execute database atomic reconciliation stored procedure
  const { data: reconciliationResult, error: rpcErr } = await supabase.rpc("reconcile_payment_transaction", {
    p_event_id: null,
    p_razorpay_order_id: razorpayOrderId,
    p_razorpay_payment_id: razorpayPaymentId,
    p_payment_method: paymentMethod,
    p_captured_amount: capturedAmount,
    p_signature: razorpaySignature || null,
  });

  if (rpcErr) {
    return { success: false, error: `Reconciliation failed: ${rpcErr.message}` };
  }

  revalidatePath("/tenant");
  revalidatePath("/owner");
  revalidatePath("/warden");
  return { success: true, data: reconciliationResult };
}

/**
 * Records an offline manual payment (Cash, Direct Bank Transfer, or Physical UPI) by Warden or Owner.
 */
export async function recordManualPaymentAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  if (authErr || !user) {
    return { success: false, error: "Authentication required." };
  }

  const pgId = formData.get("pg_id")?.toString();
  const tenantId = formData.get("tenant_id")?.toString();
  const rentRecordId = formData.get("rent_record_id")?.toString();
  const amount = parseFloat(formData.get("amount")?.toString() || "0");
  const paymentMethod = (formData.get("payment_method")?.toString() || "cash") as PaymentMethod;
  const notes = formData.get("notes")?.toString()?.trim() || "Manual offline payment recorded by staff";

  if (!pgId || !tenantId || !rentRecordId || isNaN(amount) || amount <= 0) {
    return { success: false, error: "Valid tenant, invoice, and payment amount are required." };
  }

  // 1. Insert into immutable payments table
  const receiptNumber = `REC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

  const { data: payment, error: payErr } = await supabase
    .from("payments")
    .insert({
      pg_id: pgId,
      tenant_id: tenantId,
      amount,
      payment_method: paymentMethod,
      payment_status: "successful",
      receipt_number: receiptNumber,
      notes,
    })
    .select()
    .single();

  if (payErr || !payment) {
    return { success: false, error: payErr?.message || "Failed to record payment." };
  }

  // 2. Insert payment allocation
  const { error: allocErr } = await supabase
    .from("payment_allocations")
    .insert({
      pg_id: pgId,
      tenant_id: tenantId,
      payment_id: payment.id,
      rent_record_id: rentRecordId,
      allocated_amount: amount,
      allocation_type: "payment",
    });

  if (allocErr) {
    return { success: false, error: allocErr.message };
  }

  // 3. Invoke ledger balance repair/reconciliation RPC
  const { error: rpcErr } = await supabase.rpc("reconcile_rent_record_ledger", {
    p_rent_record_id: rentRecordId,
  });

  if (rpcErr) {
    return { success: false, error: rpcErr.message };
  }

  revalidatePath("/owner");
  revalidatePath("/warden");
  revalidatePath("/tenant");
  return { success: true, data: payment };
}

/**
 * Batch generates monthly rent bills for all currently active bed assignments.
 */
export async function generateMonthlyInvoicesAction(formData: FormData): Promise<ActionResult<{ generatedCount: number }>> {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  if (authErr || !user) {
    return { success: false, error: "Authentication required." };
  }

  const pgId = formData.get("pg_id")?.toString();
  const billingMonth = formData.get("billing_month")?.toString(); // Format: "YYYY-MM"
  const dueDate = formData.get("due_date")?.toString();

  if (!pgId || !billingMonth || !dueDate) {
    return { success: false, error: "Billing month (YYYY-MM) and due date are required." };
  }

  // Period start and end
  const periodStart = `${billingMonth}-01`;
  const [year, month] = billingMonth.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const periodEnd = `${billingMonth}-${String(lastDay).padStart(2, "0")}`;

  // 1. Fetch all active bed assignments in this PG
  const { data: assignments, error: assErr } = await supabase
    .from("tenant_bed_assignments")
    .select("id, tenant_id, agreed_monthly_rent")
    .eq("pg_id", pgId)
    .eq("is_active", true);

  if (assErr || !assignments) {
    return { success: false, error: assErr?.message || "Failed to load active assignments." };
  }

  // 2. Fetch existing rent records for this billing month to prevent duplicates
  const { data: existingRecords } = await supabase
    .from("rent_records")
    .select("tenant_id")
    .eq("pg_id", pgId)
    .eq("billing_month", billingMonth);

  const existingTenantSet = new Set((existingRecords || []).map((r) => r.tenant_id));

  let generatedCount = 0;
  for (const a of assignments) {
    if (!existingTenantSet.has(a.tenant_id)) {
      const { error: insertErr } = await supabase.from("rent_records").insert({
        pg_id: pgId,
        tenant_id: a.tenant_id,
        assignment_id: a.id,
        billing_month: billingMonth,
        period_start: periodStart,
        period_end: periodEnd,
        due_date: dueDate,
        base_rent_amount: a.agreed_monthly_rent,
        utility_charges: 0,
        late_fee_amount: 0,
        discount_amount: 0,
        total_due_amount: a.agreed_monthly_rent,
        paid_amount: 0,
        balance_amount: a.agreed_monthly_rent,
        status: "pending",
      });

      if (!insertErr) {
        generatedCount++;
      }
    }
  }

  revalidatePath("/owner");
  revalidatePath("/warden");
  return { success: true, data: { generatedCount } };
}

/**
 * Applies a financial adjustment (waiver, discount, late fee addition) to a rent record.
 */
export async function applyRentAdjustmentAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  if (authErr || !user) {
    return { success: false, error: "Authentication required." };
  }

  const pgId = formData.get("pg_id")?.toString();
  const rentRecordId = formData.get("rent_record_id")?.toString();
  const adjustmentType = formData.get("adjustment_type")?.toString() as RentAdjustmentType;
  const amount = parseFloat(formData.get("amount")?.toString() || "0");
  const reason = formData.get("reason")?.toString()?.trim();

  if (!pgId || !rentRecordId || !adjustmentType || isNaN(amount) || amount <= 0 || !reason) {
    return { success: false, error: "Valid adjustment type, amount, and reason are required." };
  }

  // 1. Insert adjustment
  const { error: adjErr } = await supabase.from("rent_adjustments").insert({
    pg_id: pgId,
    rent_record_id: rentRecordId,
    adjustment_type: adjustmentType,
    amount,
    reason,
    authorized_by_user_id: user.id,
  });

  if (adjErr) {
    return { success: false, error: adjErr.message };
  }

  // 2. Invoke stored procedure to recalculate single source of truth balance
  const { error: rpcErr } = await supabase.rpc("reconcile_rent_record_ledger", {
    p_rent_record_id: rentRecordId,
  });

  if (rpcErr) {
    return { success: false, error: rpcErr.message };
  }

  revalidatePath("/owner");
  revalidatePath("/warden");
  revalidatePath("/tenant");
  return { success: true };
}
