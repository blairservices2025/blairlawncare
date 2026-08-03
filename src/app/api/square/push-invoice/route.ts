import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSquareInvoice, squareConfigured } from "@/lib/square";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Send one of our invoices to Square. Boss only.
 *
 * `publish: false` leaves it as a draft in Square for review;
 * `publish: true` has Square email it to the customer.
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
    invoiceId?: string;
    publish?: boolean;
    idempotencyKey?: string;
  } | null;

  if (!body?.invoiceId || !body.idempotencyKey) {
    return NextResponse.json(
      { error: "invoiceId and idempotencyKey are required" },
      { status: 400 }
    );
  }

  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, description, amount, due_date, customer_id, square_invoice_id")
    .eq("id", body.invoiceId)
    .single();

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }
  if (invoice.square_invoice_id) {
    return NextResponse.json(
      { error: "That invoice is already in Square." },
      { status: 409 }
    );
  }

  const { data: customer } = await supabase
    .from("customers")
    .select("square_customer_id, name")
    .eq("id", invoice.customer_id)
    .single();

  if (!customer?.square_customer_id) {
    return NextResponse.json(
      {
        error:
          "That customer isn't linked to Square yet. Add them in Square, then sync from Settings.",
      },
      { status: 400 }
    );
  }

  try {
    const result = await createSquareInvoice({
      squareCustomerId: customer.square_customer_id,
      description: invoice.description,
      amountCents: Math.round(Number(invoice.amount) * 100),
      dueDate: invoice.due_date,
      idempotencyKey: body.idempotencyKey,
      publish: Boolean(body.publish),
    });

    // Record the link so the webhook updates this invoice rather than
    // creating a second copy of it.
    await createAdminClient()
      .from("invoices")
      .update({
        square_invoice_id: result.invoiceId,
        synced_from_square_at: new Date().toISOString(),
      })
      .eq("id", invoice.id);

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not create the invoice" },
      { status: 502 }
    );
  }
}
