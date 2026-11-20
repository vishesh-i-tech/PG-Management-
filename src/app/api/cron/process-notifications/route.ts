import { NextRequest, NextResponse } from "next/server";
import { processNotificationQueueWorker } from "@/actions/notifications";

export async function GET(req: NextRequest) {
  // Validate bearer token authorization
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET || "cron_secret_test";

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized cron execution" }, { status: 401 });
  }

  const result = await processNotificationQueueWorker(30);

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    workerSummary: result,
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
