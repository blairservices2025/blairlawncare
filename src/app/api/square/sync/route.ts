import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fullSync } from "@/lib/square-sync";
import { squareConfigured, squareEnv } from "@/lib/square";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Boss-only: pull every customer and invoice from Square right now. */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "boss") {
    return NextResponse.json({ error: "Boss only" }, { status: 403 });
  }

  if (!squareConfigured()) {
    return NextResponse.json(
      { error: "SQUARE_ACCESS_TOKEN is not set in this deployment." },
      { status: 400 }
    );
  }

  try {
    const result = await fullSync();
    return NextResponse.json({ ok: true, environment: squareEnv(), ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    try {
      await createAdminClient()
        .from("square_sync_log")
        .insert({ source: "manual", error: message });
    } catch {
      // Logging the failure must not mask the original error.
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Whether Square is wired up in this deployment, for the Settings page. */
export async function GET() {
  return NextResponse.json({
    configured: squareConfigured(),
    environment: squareEnv(),
    webhookConfigured: Boolean(process.env.SQUARE_WEBHOOK_SIGNATURE_KEY),
    serviceKeyConfigured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  });
}
