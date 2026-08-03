import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  firstLocationId,
  saveCardOnFile,
  squareConfigured,
  squareEnv,
} from "@/lib/square";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** What the browser needs to render Square's card form. */
export async function GET() {
  const applicationId = process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID ?? null;
  if (!squareConfigured() || !applicationId) {
    return NextResponse.json({
      ready: false,
      reason: !applicationId
        ? "NEXT_PUBLIC_SQUARE_APPLICATION_ID is not set in this deployment."
        : "Square is not connected in this deployment.",
    });
  }

  try {
    const locationId = await firstLocationId();
    return NextResponse.json({
      ready: true,
      applicationId,
      locationId,
      environment: squareEnv(),
    });
  } catch (e) {
    return NextResponse.json({
      ready: false,
      reason: e instanceof Error ? e.message : "Could not reach Square",
    });
  }
}

/**
 * Save a card against a customer. Boss only.
 *
 * The browser sends a single-use token from Square's card form — the card
 * number goes straight from the customer's browser to Square and never
 * reaches this app or its database. All that comes back is a reference
 * that can be charged later.
 *
 * Square requires the customer to have agreed to their card being kept
 * and charged for future work; that agreement is collected in the form
 * that produces the token. `consent` is recorded here so there is a note
 * of who confirmed it and when.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "boss") {
    return NextResponse.json({ error: "Boss only" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    customerId?: string;
    sourceId?: string;
    idempotencyKey?: string;
    consent?: boolean;
  } | null;

  if (!body?.customerId || !body.sourceId || !body.idempotencyKey) {
    return NextResponse.json(
      { error: "customerId, sourceId and idempotencyKey are required" },
      { status: 400 }
    );
  }
  if (!body.consent) {
    return NextResponse.json(
      {
        error:
          "The customer has to agree to their card being saved before it can be stored.",
      },
      { status: 400 }
    );
  }

  const { data: customer } = await supabase
    .from("customers")
    .select("id, name, square_customer_id")
    .eq("id", body.customerId)
    .single();

  if (!customer?.square_customer_id) {
    return NextResponse.json(
      {
        error:
          "That customer isn't linked to Square yet. Sync from Settings, or add them in Square first.",
      },
      { status: 400 }
    );
  }

  try {
    const card = await saveCardOnFile({
      sourceId: body.sourceId,
      squareCustomerId: customer.square_customer_id,
      idempotencyKey: body.idempotencyKey,
      cardholderName: customer.name,
    });

    // Keep the reference details only — brand, last four, expiry.
    await createAdminClient()
      .from("customers")
      .update({
        card_brand: card.card_brand ?? null,
        card_last4: card.last_4 ?? null,
        card_exp:
          card.exp_month && card.exp_year
            ? `${String(card.exp_month).padStart(2, "0")}/${String(card.exp_year).slice(-2)}`
            : null,
      })
      .eq("id", customer.id);

    return NextResponse.json({
      ok: true,
      brand: card.card_brand,
      last4: card.last_4,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not save the card" },
      { status: 502 }
    );
  }
}
