import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { applyWebhookEvent } from "@/lib/square-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Receives events from Square: a customer or invoice created or changed
 * there shows up here.
 *
 * Every request is checked against the webhook signature key before it is
 * trusted — this endpoint is public, so without that check anyone could
 * post fake customers and invoices into the business's records.
 */
function isValidSignature(
  rawBody: string,
  signature: string | null,
  notificationUrl: string
) {
  const key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  if (!key || !signature) return false;

  const expected = crypto
    .createHmac("sha256", key)
    .update(notificationUrl + rawBody)
    .digest("base64");

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  // Lengths must match before timingSafeEqual, and comparing this way
  // avoids leaking information through how long the check takes.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  // Square signs against the exact URL configured in the subscription.
  const notificationUrl =
    process.env.SQUARE_WEBHOOK_URL ?? request.nextUrl.href.split("?")[0];

  const signature = request.headers.get("x-square-hmacsha256-signature");
  if (!isValidSignature(rawBody, signature, notificationUrl)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: { type?: string; data?: unknown };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Malformed body" }, { status: 400 });
  }

  if (!event.type) {
    return NextResponse.json({ error: "Missing event type" }, { status: 400 });
  }

  try {
    const result = await applyWebhookEvent(event.type, event.data);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    // Returning 500 asks Square to retry, which is what we want for a
    // transient failure.
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("Square webhook failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
