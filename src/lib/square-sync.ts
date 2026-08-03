import { createAdminClient } from "@/lib/supabase/admin";
import {
  getSquareCustomer,
  getSquareInvoice,
  listSquareCustomers,
  listSquareInvoices,
  toCustomerRow,
  toInvoiceRow,
  type SquareCustomer,
  type SquareInvoice,
} from "@/lib/square";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Insert or update the app's copy of a Square customer.
 *
 * Matching is by square_customer_id first. Failing that, an existing
 * customer with the same email or phone is adopted rather than
 * duplicated — which is what happens the first time someone syncs an
 * account they had already typed in by hand.
 *
 * Every database error is thrown rather than swallowed: a silent failure
 * here reports a successful sync while nothing was actually written,
 * which is impossible to diagnose from the outside.
 */
export async function upsertCustomer(db: Admin, sc: SquareCustomer) {
  const row = toCustomerRow(sc);

  const { data: bySquareId, error: findErr } = await db
    .from("customers")
    .select("id")
    .eq("square_customer_id", sc.id)
    .maybeSingle();
  if (findErr) throw new Error(`Looking up customer: ${findErr.message}`);

  if (bySquareId) {
    const { error } = await db
      .from("customers")
      .update(row)
      .eq("id", bySquareId.id);
    if (error) throw new Error(`Updating ${row.name}: ${error.message}`);
    return bySquareId.id as string;
  }

  if (sc.email_address || sc.phone_number) {
    const filters = [
      sc.email_address ? `email.eq.${sc.email_address}` : null,
      sc.phone_number ? `phone.eq.${sc.phone_number}` : null,
    ]
      .filter(Boolean)
      .join(",");

    const { data: existing, error: matchErr } = await db
      .from("customers")
      .select("id")
      .is("square_customer_id", null)
      .or(filters)
      .limit(1)
      .maybeSingle();
    if (matchErr) throw new Error(`Matching ${row.name}: ${matchErr.message}`);

    if (existing) {
      const { error } = await db
        .from("customers")
        .update(row)
        .eq("id", existing.id);
      if (error) throw new Error(`Updating ${row.name}: ${error.message}`);
      return existing.id as string;
    }
  }

  const { data: inserted, error: insertErr } = await db
    .from("customers")
    .insert(row)
    .select("id")
    .single();
  if (insertErr) throw new Error(`Adding ${row.name}: ${insertErr.message}`);
  return inserted.id as string;
}

/** Insert or update the app's copy of a Square invoice. */
export async function upsertInvoice(db: Admin, si: SquareInvoice) {
  // Link it to the customer it belongs to, if we know them.
  let customerId: string | null = null;
  const squareCustomerId = si.primary_recipient?.customer_id;
  if (squareCustomerId) {
    const { data: cust, error } = await db
      .from("customers")
      .select("id")
      .eq("square_customer_id", squareCustomerId)
      .maybeSingle();
    if (error) throw new Error(`Looking up invoice customer: ${error.message}`);

    if (cust) {
      customerId = cust.id as string;
    } else {
      // Pull the customer across so the invoice isn't orphaned.
      const sc = await getSquareCustomer(squareCustomerId);
      if (sc) customerId = await upsertCustomer(db, sc);
    }
  }

  const row = toInvoiceRow(si, customerId);

  const { data: existing, error: findErr } = await db
    .from("invoices")
    .select("id")
    .eq("square_invoice_id", si.id)
    .maybeSingle();
  if (findErr) throw new Error(`Looking up invoice: ${findErr.message}`);

  if (existing) {
    const { error } = await db.from("invoices").update(row).eq("id", existing.id);
    if (error) throw new Error(`Updating invoice: ${error.message}`);
  } else {
    const { error } = await db.from("invoices").insert(row);
    if (error) throw new Error(`Adding invoice: ${error.message}`);
  }

  // A job billed from here carries this invoice's id. Square telling us
  // the money moved is what marks the work paid, rather than assuming it
  // worked at the moment we asked.
  await syncJobPayment(db, si);
}

/** Reflect an invoice's outcome onto the job it was raised for. */
async function syncJobPayment(db: Admin, si: SquareInvoice) {
  const status = (si.status ?? "").toUpperCase();

  const paid = ["PAID", "REFUNDED", "PARTIALLY_REFUNDED"].includes(status);
  const failed = ["FAILED", "CANCELED"].includes(status);
  if (!paid && !failed) return;

  await db
    .from("scheduled_jobs")
    .update({ payment_status: paid ? "paid" : "failed" })
    .eq("square_invoice_id", si.id);
}

export interface SyncResult {
  /** How many Square returned. */
  customersFound: number;
  invoicesFound: number;
  /** How many actually reached the database. */
  customers: number;
  invoices: number;
  /** Per-record problems, so one bad record doesn't hide the rest. */
  problems: string[];
}

/** Pull everything from Square. Used by the "Sync now" button. */
export async function fullSync(): Promise<SyncResult> {
  const db = createAdminClient();
  const problems: string[] = [];

  const squareCustomers = await listSquareCustomers();
  let customers = 0;
  for (const c of squareCustomers) {
    try {
      await upsertCustomer(db, c);
      customers++;
    } catch (e) {
      problems.push(e instanceof Error ? e.message : String(e));
    }
  }

  const squareInvoices = await listSquareInvoices();
  let invoices = 0;
  for (const i of squareInvoices) {
    try {
      await upsertInvoice(db, i);
      invoices++;
    } catch (e) {
      problems.push(e instanceof Error ? e.message : String(e));
    }
  }

  // Best-effort: a missing log table must not fail an otherwise good sync.
  await db
    .from("square_sync_log")
    .insert({
      source: "manual",
      customers_synced: customers,
      invoices_synced: invoices,
      error: problems.length ? problems.slice(0, 3).join(" | ") : null,
    })
    .then(undefined, () => undefined);

  return {
    customersFound: squareCustomers.length,
    invoicesFound: squareInvoices.length,
    customers,
    invoices,
    problems,
  };
}

/** Handle one webhook event. */
export async function applyWebhookEvent(type: string, data: unknown) {
  const db = createAdminClient();
  const payload = data as {
    type?: string;
    id?: string;
    object?: { customer?: SquareCustomer; invoice?: SquareInvoice };
  };

  let customers = 0;
  let invoices = 0;

  if (type.startsWith("customer.")) {
    const customer =
      payload.object?.customer ??
      (payload.id ? await getSquareCustomer(payload.id) : null);
    if (customer) {
      await upsertCustomer(db, customer);
      customers = 1;
    }
  } else if (type.startsWith("invoice.")) {
    const invoice =
      payload.object?.invoice ??
      (payload.id ? await getSquareInvoice(payload.id) : null);
    if (invoice) {
      await upsertInvoice(db, invoice);
      invoices = 1;
    }
  }

  // Square sends whatever the subscription is signed up for. Only record
  // the ones that changed something here, so subscribing to everything
  // doesn't bury the activity list in events this app has no use for.
  if (customers || invoices) {
    await db
      .from("square_sync_log")
      .insert({
        source: "webhook",
        event_type: type,
        customers_synced: customers,
        invoices_synced: invoices,
      })
      .then(undefined, () => undefined);
  }

  return { customers, invoices };
}
