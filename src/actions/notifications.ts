"use server";

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getWhatsAppService } from "@/lib/notifications/whatsapp";
import type { NotificationChannel, Json } from "@/types/database.types";

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface EnqueueNotificationParams {
  pgId: string;
  channel?: NotificationChannel;
  recipientPhone: string;
  templateName: string;
  templateVariables?: Record<string, string>;
  idempotencyKey: string;
}

/**
 * Enqueues a notification job into the transactional queue.
 * Idempotency key guarantees no duplicate messages for the same event.
 */
export async function enqueueNotificationJobAction(
  params: EnqueueNotificationParams
): Promise<ActionResult<{ jobId: string }>> {
  const supabase = await createClient();

  // Deduplication check via idempotency key
  const { data: existing } = await supabase
    .from("notification_jobs")
    .select("id, status")
    .eq("idempotency_key", params.idempotencyKey)
    .maybeSingle();

  if (existing) {
    return { success: true, data: { jobId: existing.id } };
  }

  const { data: job, error } = await supabase
    .from("notification_jobs")
    .insert({
      pg_id: params.pgId,
      channel: params.channel || "whatsapp",
      recipient_phone: params.recipientPhone,
      template_name: params.templateName,
      template_variables: (params.templateVariables || {}) as unknown as Json,
      idempotency_key: params.idempotencyKey,
      status: "queued",
      attempts: 0,
      max_attempts: 3,
    })
    .select("id")
    .single();

  if (error || !job) {
    return { success: false, error: error?.message || "Failed to enqueue notification job." };
  }

  return { success: true, data: { jobId: job.id } };
}

/**
 * Queue worker that claims locked batches of jobs and delivers them.
 * Safe for concurrent worker processes (uses Postgres FOR UPDATE SKIP LOCKED).
 */
export async function processNotificationQueueWorker(
  batchSize: number = 25
): Promise<{ processed: number; succeeded: number; failed: number }> {
  const supabase = createServiceRoleClient();
  const whatsapp = getWhatsAppService();

  // 1. Recover any jobs stuck in 'processing' status for > 5 minutes (due to crashed worker)
  await supabase.rpc("recover_stuck_notification_jobs", {});

  // 2. Claim locked batch
  const { data: claimedJobs, error: claimErr } = await supabase.rpc(
    "claim_notification_jobs",
    { p_batch_size: batchSize }
  );

  if (claimErr || !claimedJobs || claimedJobs.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  let succeeded = 0;
  let failed = 0;

  for (const job of claimedJobs) {
    try {
      const vars = (job.template_variables as Record<string, string>) || {};
      const sendRes = await whatsapp.sendTemplateMessage(
        job.recipient_phone,
        job.template_name,
        vars
      );

      if (sendRes.success) {
        await supabase
          .from("notification_jobs")
          .update({
            status: "sent",
            provider_message_id: sendRes.messageId || null,
            sent_at: new Date().toISOString(),
            last_error: null,
          })
          .eq("id", job.id);
        succeeded++;
      } else {
        const nextAttempts = job.attempts + 1;
        const isPermanentlyFailed = nextAttempts >= job.max_attempts;
        // Exponential backoff: 2 min, 4 min, 8 min
        const backoffMinutes = Math.pow(2, nextAttempts);
        const nextAttemptAt = new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString();

        await supabase
          .from("notification_jobs")
          .update({
            status: isPermanentlyFailed ? "failed" : "queued",
            attempts: nextAttempts,
            next_attempt_at: nextAttemptAt,
            last_error: sendRes.error || "Delivery rejected by provider",
          })
          .eq("id", job.id);
        failed++;
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Unexpected worker dispatch failure";
      const nextAttempts = job.attempts + 1;
      const isPermanentlyFailed = nextAttempts >= job.max_attempts;
      const nextAttemptAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

      await supabase
        .from("notification_jobs")
        .update({
          status: isPermanentlyFailed ? "failed" : "queued",
          attempts: nextAttempts,
          next_attempt_at: nextAttemptAt,
          last_error: errorMsg,
        })
        .eq("id", job.id);
      failed++;
    }
  }

  return {
    processed: claimedJobs.length,
    succeeded,
    failed,
  };
}
