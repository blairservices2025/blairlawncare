import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createSquareInvoice,
  listCustomerCards,
  squareConfigured,
} from "@/lib/square";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function requireBoss() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in", status: 401 as const };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "boss") return { error: "Boss only", status: 403 as const };

  return { supabase, userId: user.id };
}

/** Completed jobs that haven't been billed yet. */
export async function GET() {
  const auth = await requireBoss();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data, error } = await auth.supabase
    .from("scheduled_jobs")
    .select(
      "id, job_date, service, price, customer_id, customers(name, square_customer_id, card_last4)"
    )
    .eq("status", "done")
    .is("square_invoice_id", null)
    .order("job_date", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ jobs: data ?? [] });
}

/**
 * Bill one or more completed jobs.
 *
 * For each job: create the Square order and invoice, and publish it. When
 * the customer has a card on file, publishing charges that card and emails
 * the invoice and receipt in one step; otherwise Square emails an invoice
 * for them to pay themselves.
 *
 * The job and the invoice stay separate records with a 1:1 link. A job
 * already carrying an invoice id is skipped, so running this twice cannot
 * bill the same work twice.
 */
export async function POST(request: NextRequest) {
  const auth = await requireBoss();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!squareConfigured()) {
    return NextResponse.json(
      { error: "Square is not connected in this deployment." },
      { status: 400 }
    );
  }

  const body = (await request.json().catch(() => null)) as {
    jobIds?: string[];
    idempotencyKey?: string;
  } | null;

  if (!body?.jobIds?.length || !body.idempotencyKey) {
    return NextResponse.json(
      { error: "jobIds and idempotencyKey are required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const billed: string[] = [];
  const skipped: string[] = [];
  const problems: string[] = [];

  for (const jobId of body.jobIds) {
    try {
      const { data: job } = await auth.supabase
        .from("scheduled_jobs")
        .select(
          "id, job_date, service, price, square_invoice_id, customer_id, customers(name, square_customer_id)"
        )
        .eq("id", jobId)
        .single();

      if (!job) {
        problems.push("A job could not be found.");
        continue;
      }

      const customer = job.customers as unknown as {
        name: string;
        square_customer_id: string | null;
      } | null;

      if (job.square_invoice_id) {
        skipped.push(`${customer?.name ?? "A job"} was already billed.`);
        continue;
      }
      if (!customer?.square_customer_id) {
        problems.push(
          `${customer?.name ?? "A customer"} isn't linked to Square — sync from Settings first.`
        );
        continue;
      }
      const amount = Number(job.price ?? 0);
      if (!(amount > 0)) {
        problems.push(
          `${customer.name} has no price on that job — set one before billing.`
        );
        continue;
      }

      // Charge the saved card if there is one; otherwise Square emails an
      // invoice for them to pay.
      const cards = await listCustomerCards(customer.square_customer_id);
      const cardId = cards[0]?.id;

      const result = await createSquareInvoice({
        squareCustomerId: customer.square_customer_id,
        description: `${job.service ?? "Lawn service"} — ${job.job_date}`,
        amountCents: Math.round(amount * 100),
        dueDate: job.job_date,
        // Derived per job, so one job failing doesn't block the rest and a
        // retry cannot double-bill anything already done.
        idempotencyKey: `${body.idempotencyKey}-${jobId}`,
        publish: true,
        cardId,
      });

      await admin
        .from("scheduled_jobs")
        .update({
          square_invoice_id: result.invoiceId,
          billed_at: new Date().toISOString(),
          payment_status: cardId ? "pending" : null,
        })
        .eq("id", jobId);

      billed.push(jobId);
    } catch (e) {
      problems.push(e instanceof Error ? e.message : String(e));
    }
  }

  return NextResponse.json({
    ok: true,
    billed: billed.length,
    skipped,
    problems,
  });
}
