import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { processNotificationQueueWorker } from "@/actions/notifications";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET || "cron_secret_test";

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized cron execution" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const billingMonth = `${year}-${month}`; // "YYYY-MM"

  const periodStart = `${billingMonth}-01`;
  const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
  const periodEnd = `${billingMonth}-${String(lastDay).padStart(2, "0")}`;
  const dueDate = `${billingMonth}-07`; // Due on the 7th of each month

  // 1. Fetch all active bed assignments across all PGs
  const { data: assignments, error: assignErr } = await supabase
    .from("tenant_bed_assignments")
    .select("id, pg_id, tenant_id, agreed_monthly_rent")
    .eq("is_active", true);

  if (assignErr || !assignments) {
    return NextResponse.json({ error: assignErr?.message || "Failed to fetch assignments" }, { status: 500 });
  }

  // 2. Fetch existing rent records for current billing month
  const { data: existingRecords } = await supabase
    .from("rent_records")
    .select("assignment_id")
    .eq("billing_month", billingMonth);

  const existingAssignmentSet = new Set((existingRecords || []).map((r) => r.assignment_id));

  // 3. Fetch tenants to get phone numbers and names
  const { data: tenants } = await supabase
    .from("tenants")
    .select("id, full_name, phone");
  const tenantMap = new Map((tenants || []).map((t) => [t.id, t]));

  let generatedCount = 0;
  let notificationsEnqueued = 0;

  for (const a of assignments) {
    if (existingAssignmentSet.has(a.id)) {
      continue;
    }

    const { error: insertErr } = await supabase.from("rent_records").insert({
      pg_id: a.pg_id,
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
      generated_by: "system",
    });

    if (!insertErr) {
      generatedCount++;

      const tenant = tenantMap.get(a.tenant_id);
      if (tenant && tenant.phone) {
        const idempotencyKey = `rent_inv_${a.pg_id}_${a.tenant_id}_${billingMonth}`;
        await supabase.from("notification_jobs").insert({
          pg_id: a.pg_id,
          channel: "whatsapp",
          recipient_phone: tenant.phone,
          template_name: "rent_invoice_generated",
          template_variables: {
            tenant_name: tenant.full_name,
            billing_month: billingMonth,
            amount: String(a.agreed_monthly_rent),
            due_date: dueDate,
          },
          idempotency_key: idempotencyKey,
          status: "queued",
          attempts: 0,
          max_attempts: 3,
        });
        notificationsEnqueued++;
      }
    }
  }

  // Dispatch queue batch
  const workerResult = await processNotificationQueueWorker(30);

  return NextResponse.json({
    success: true,
    billingMonth,
    generatedInvoices: generatedCount,
    notificationsEnqueued,
    workerResult,
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
