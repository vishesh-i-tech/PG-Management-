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
  const today = new Date().toISOString().split("T")[0];

  // 1. Call database procedure to identify tenants outside past curfew
  const { data: outsideTenants, error: alertErr } = await supabase.rpc(
    "get_tenants_outside_for_gate_alert",
    {}
  );

  if (alertErr) {
    return NextResponse.json({ error: alertErr.message }, { status: 500 });
  }

  if (!outsideTenants || outsideTenants.length === 0) {
    return NextResponse.json({
      success: true,
      message: "No curfew violations detected.",
      alertsSent: 0,
    });
  }

  // 2. Fetch emergency contacts for the violators
  const tenantIds = outsideTenants.map((t) => t.tenant_id);
  const { data: fullTenants } = await supabase
    .from("tenants")
    .select("id, emergency_contact_name, emergency_contact_phone")
    .in("id", tenantIds);

  const emergencyMap = new Map(
    (fullTenants || []).map((t) => [t.id, t])
  );

  let alertsEnqueued = 0;

  for (const record of outsideTenants) {
    // 1. Urgent reminder to the tenant
    const tenantKey = `curfew_tenant_${record.tenant_id}_${today}`;
    await supabase.from("notification_jobs").insert({
      pg_id: record.pg_id,
      channel: "whatsapp",
      recipient_phone: record.phone,
      template_name: "curfew_violation_urgent",
      template_variables: {
        tenant_name: record.tenant_name,
        gate_closing_time: record.gate_closing_time,
      },
      idempotency_key: tenantKey,
      status: "queued",
      attempts: 0,
      max_attempts: 3,
    });
    alertsEnqueued++;

    // 2. Alert to Guardian / Emergency Contact
    const details = emergencyMap.get(record.tenant_id);
    if (details?.emergency_contact_phone) {
      const parentKey = `curfew_parent_${record.tenant_id}_${today}`;
      await supabase.from("notification_jobs").insert({
        pg_id: record.pg_id,
        channel: "whatsapp",
        recipient_phone: details.emergency_contact_phone,
        template_name: "curfew_parent_notification",
        template_variables: {
          guardian_name: details.emergency_contact_name || "Guardian",
          resident_name: record.tenant_name,
          gate_closing_time: record.gate_closing_time,
        },
        idempotency_key: parentKey,
        status: "queued",
        attempts: 0,
        max_attempts: 3,
      });
      alertsEnqueued++;
    }
  }

  // Dispatch queue batch
  const workerResult = await processNotificationQueueWorker(30);

  return NextResponse.json({
    success: true,
    violationsDetected: outsideTenants.length,
    alertsEnqueued,
    workerResult,
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
