import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import crypto from "node:crypto";
import type { PaymentMethod } from "@/types/database.types";

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-razorpay-signature");

    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    // 1. Signature Verification
    if (webhookSecret && signature) {
      const expectedSignature = crypto
        .createHmac("sha256", webhookSecret)
        .update(rawBody)
        .digest("hex");

      if (expectedSignature !== signature) {
        return NextResponse.json(
          { error: "Invalid webhook cryptographic signature" },
          { status: 401 }
        );
      }
    }

    const payload = JSON.parse(rawBody);
    const eventId = payload.event_id || payload.id || `evt_${Date.now()}`;
    const eventType = payload.event as string;

    const supabase = createServiceRoleClient();

    // 2. Deduplication check in webhook_events
    const { data: existingEvent } = await supabase
      .from("webhook_events")
      .select("id, processing_status")
      .eq("event_id", eventId)
      .maybeSingle();

    if (existingEvent && existingEvent.processing_status === "processed") {
      return NextResponse.json({ message: "Event already processed (idempotent no-op)" }, { status: 200 });
    }

    // 3. Record or update webhook event entry
    if (!existingEvent) {
      await supabase.from("webhook_events").insert({
        provider: "razorpay",
        event_id: eventId,
        event_type: eventType,
        payload,
        signature: signature || "simulated_signature",
        processing_status: "pending",
      });
    }

    // 4. Handle payment.captured
    if (eventType === "payment.captured") {
      const paymentEntity = payload.payload?.payment?.entity;
      const orderId = paymentEntity?.order_id as string;
      const paymentId = paymentEntity?.id as string;
      const amountInPaise = paymentEntity?.amount as number;
      const capturedAmount = amountInPaise ? amountInPaise / 100 : 0;
      const method = (paymentEntity?.method || "upi") as PaymentMethod;

      if (orderId && paymentId && capturedAmount > 0) {
        // Execute atomic database reconciliation procedure
        const { error: rpcErr } = await supabase.rpc("reconcile_payment_transaction", {
          p_event_id: eventId,
          p_razorpay_order_id: orderId,
          p_razorpay_payment_id: paymentId,
          p_payment_method: method,
          p_captured_amount: capturedAmount,
          p_signature: signature || null,
        });

        if (rpcErr) {
          await supabase
            .from("webhook_events")
            .update({
              processing_status: "failed",
              error_message: rpcErr.message,
              processed_at: new Date().toISOString(),
            })
            .eq("event_id", eventId);

          return NextResponse.json({ error: rpcErr.message }, { status: 500 });
        }
      }
    }

    // Mark event processed
    await supabase
      .from("webhook_events")
      .update({
        processing_status: "processed",
        processed_at: new Date().toISOString(),
      })
      .eq("event_id", eventId);

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal webhook processing error";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
