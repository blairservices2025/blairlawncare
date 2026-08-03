import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { chargeSavedCard, squareConfigured } from "@/lib/square";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Charge a customer's saved Square card. Boss only.
 *
 * Real money moves here, so: the role is checked server-side, the amount
 * is taken from the invoice rather than trusted from the browser where
 * one exists, and the caller's idempotency key is passed to Square so a
 * double click or a retry cannot charge twice.
 *
 * Every attempt is recorded, successful or not.
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

  if (!squareConfigured()) {
    return NextResponse.json(
      { error: "Square is not connected in this deployment." },
      { status: 400 }
    );
  }

  const body = (await request.json().catch(() => null)) as {
    customerId?: string;
    cardId?: string;
    invoiceId?: string | null;
    amount?: number;
    cardLast4?: string;
    idempotencyKey?: string;
    note?: string;
  } | null;

  if (!body?.customerId || !body.cardId || !body.idempotencyKey) {
    return NextResponse.json(
      { error: "customerId, cardId and idempotencyKey are required" },
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
      { error: "That customer isn't linked to Square." },
      { status: 400 }
    );
  }

  // Prefer the invoice's own amount — the browser doesn't get to decide
  // how much to charge when there's a record of it.
  let amount = Number(body.amount ?? 0);
  if (body.invoiceId) {
    const { data: invoice } = await supabase
      .from("invoices")
      .select("amount, status")
      .eq("id", body.invoiceId)
      .single();
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    }
    if (invoice.status === "paid") {
      return NextResponse.json(
        { error: "That invoice is already marked paid." },
        { status: 409 }
      );
    }
    amount = Number(invoice.amount);
  }

  if (!(amount > 0)) {
    return NextResponse.json(
      { error: "Enter an amount greater than zero." },
      { status: 400 }
    );
  }

  const amountCents = Math.round(amount * 100);
  const admin = createAdminClient();

  try {
    const result = await chargeSavedCard({
      cardId: body.cardId,
      squareCustomerId: customer.square_customer_id,
      amountCents,
      idempotencyKey: body.idempotencyKey,
      note: body.note || `Blair Lawn Care — ${customer.name}`,
    });

    await admin.from("payment_attempts").insert({
      invoice_id: body.invoiceId ?? null,
      customer_id: customer.id,
      charged_by: user.id,
      amount,
      card_last4: body.cardLast4 ?? null,
      status: "completed",
      square_payment_id: result.paymentId,
    });

    if (body.invoiceId) {
      await admin
        .from("invoices")
        .update({
          status: "paid",
          paid_date: new Date().toISOString().slice(0, 10),
          paid_amount: amount,
          square_payment_id: result.paymentId,
        })
        .eq("id", body.invoiceId);
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Charge failed";

    await admin
      .from("payment_attempts")
      .insert({
        invoice_id: body.invoiceId ?? null,
        customer_id: customer.id,
        charged_by: user.id,
        amount,
        card_last4: body.cardLast4 ?? null,
        status: "failed",
        error: message,
      })
      .then(undefined, () => undefined);

    return NextResponse.json({ error: message }, { status: 402 });
  }
}
