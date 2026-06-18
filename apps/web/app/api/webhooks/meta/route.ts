import { NextResponse, after } from "next/server";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { verifyMetaSignature } from "@/lib/meta";
import { serverEnv } from "@/lib/env";
import { processWebhookPayload } from "@/features/webhooks/process";
import { logEvent, captureError } from "@/lib/observability";

export const dynamic = "force-dynamic";

/** Webhook verification handshake. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const verifyToken = serverEnv().FB_WEBHOOK_VERIFY_TOKEN;
  if (
    searchParams.get("hub.mode") === "subscribe" &&
    searchParams.get("hub.verify_token") === verifyToken
  ) {
    return new NextResponse(searchParams.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("Verification failed", { status: 403 });
}

/**
 * Ingest. Verifies signature, stores the raw event (deduped), returns 200
 * immediately, and processes after the response. In production the Cloudflare
 * webhook-worker is the primary ingress; this is a fully-working fallback.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const env = serverEnv();
  const signature = req.headers.get("x-hub-signature-256");
  const valid = await verifyMetaSignature(raw, signature, env.FB_APP_SECRET ?? "");
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const dedupHash = createHash("sha256").update(raw).digest("hex");
  try {
    await prisma.webhookEvent.create({
      data: { source: "meta", dedupHash, payload: payload as object, signatureValid: true },
    });
  } catch {
    // Duplicate delivery (unique dedup_hash) — acknowledge without reprocessing.
    logEvent("webhook.duplicate_event", { dedupHash });
    return NextResponse.json({ ok: true, duplicate: true });
  }

  after(async () => {
    try {
      await processWebhookPayload(payload);
    } catch (e) {
      captureError(e, { scope: "webhook.process" });
    }
  });

  logEvent("webhook.received", {});
  return NextResponse.json({ ok: true });
}
