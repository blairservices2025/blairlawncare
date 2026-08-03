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
 */
export async function upsertCustomer(db: Admin, sc: SquareCustomer) {
  const row = toCustomerRow(sc);

  const { data: bySquareId } = await db
    .from("customers")
    .select("id")
    .eq("square_customer_id", sc.id)
    .maybeSingle();

  if (bySquareId) {
    await db.from("customers").update(row).eq("id", bySquareId.id);
    return bySquareId.id as string;
  }

  if (sc.email_address || sc.phone_number) {
    const filters = [
      sc.email_address ? `email.eq.${sc.email_address}` : null,
      sc.phone_number ? `phone.eq.${sc.phone_number}` : null,
    ]
      .filter(Boolean)
      .join(",");

    const { data: existing } = await db
      .from("customers")
      .select("id")
      .is("square_customer_id", null)
      .or(filters)
      .limit(1)
      .maybeSingle();

    if (existing) {
      await db.from("customers").update(row).eq("id", existing.id);
      return existing.id as string;
    }
  }

  const { data: inserted } = await db
    .from("customers")
    .insert(row)
    .select("id")
    .single();
  return (inserted?.id as string) ?? null;
}

/** Insert or update the app's copy of a Square invoice. */
export async function upsertInvoice(db: Admin, si: SquareInvoice) {
  // Link it to the customer it belongs to, if we know them.
  let customerId: string | null = null;
  const squareCustomerId = si.primary_recipient?.customer_id;
  if (squareCustomerId) {
    const { data: cust } = await db
      .from("customers")
      .select("id")
      .eq("square_customer_id", squareCustomerId)
      .maybeSingle();

    if (cust) {
      customerId = cust.id as string;
    } else {
      // Pull the customer across so the invoice isn't orphaned.
      const sc = await getSquareCustomer(squareCustomerId);
      if (sc) customerId = await upsertCustomer(db, sc);
    }
  }

  const row = toInvoiceRow(si, customerId);

  const { data: existing } = await db
    .from("invoices")
    .select("id")
    .eq("square_invoice_id", si.id)
    .maybeSingle();

  if (existing) {
    await db.from("invoices").update(row).eq("id", existing.id);
  } else {
    await db.from("invoices").insert(row);
  }
}

/** Pull everything from Square. Used by the "Sync now" button. */
export async function fullSync() {
  const db = createAdminClient();

  const customers = await listSquareCustomers();
  for (const c of customers) await upsertCustomer(db, c);

  const invoices = await listSquareInvoices();
  for (const i of invoices) await upsertInvoice(db, i);

  await db.from("square_sync_log").insert({
    source: "manual",
    customers_synced: customers.length,
    invoices_synced: invoices.length,
  });

  return { customers: customers.length, invoices: invoices.length };
}

/** Handle one webhook event. Returns a short description for the log. */
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

  await db.from("square_sync_log").insert({
    source: "webhook",
    event_type: type,
    customers_synced: customers,
    invoices_synced: invoices,
  });

  return { customers, invoices };
}
