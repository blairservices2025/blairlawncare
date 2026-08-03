/**
 * Square API helpers.
 *
 * Credentials live only on the server — they are read from environment
 * variables that do NOT start with NEXT_PUBLIC_, so they are never sent
 * to the browser.
 *
 * Required in Vercel → Settings → Environment Variables:
 *   SQUARE_ACCESS_TOKEN           from developer.squareup.com
 *   SQUARE_WEBHOOK_SIGNATURE_KEY  from the webhook subscription
 *   SQUARE_ENVIRONMENT            "sandbox" or "production" (default production)
 *   SUPABASE_SERVICE_ROLE_KEY     so webhooks can write without a signed-in user
 */

const SQUARE_VERSION = "2025-01-23";

export const squareEnv = () =>
  (process.env.SQUARE_ENVIRONMENT ?? "production").toLowerCase() === "sandbox"
    ? "sandbox"
    : "production";

export const squareBaseUrl = () =>
  squareEnv() === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";

export const squareConfigured = () =>
  Boolean(process.env.SQUARE_ACCESS_TOKEN);

async function squareFetch(path: string, init?: RequestInit) {
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) throw new Error("SQUARE_ACCESS_TOKEN is not set");

  const res = await fetch(`${squareBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Square-Version": SQUARE_VERSION,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail =
      body?.errors?.map((e: { detail?: string }) => e.detail).join("; ") ??
      res.statusText;
    throw new Error(`Square ${res.status}: ${detail}`);
  }
  return body;
}

export interface SquareCustomer {
  id: string;
  given_name?: string;
  family_name?: string;
  company_name?: string;
  email_address?: string;
  phone_number?: string;
  address?: {
    address_line_1?: string;
    address_line_2?: string;
    locality?: string;
    administrative_district_level_1?: string;
    postal_code?: string;
  };
  note?: string;
  cards?: { card_brand?: string; last_4?: string; exp_month?: number; exp_year?: number }[];
}

export interface SquareInvoice {
  id: string;
  invoice_number?: string;
  title?: string;
  description?: string;
  status?: string;
  primary_recipient?: { customer_id?: string };
  payment_requests?: { due_date?: string; computed_amount_money?: { amount?: number } }[];
  created_at?: string;
  order_id?: string;
}

/** Every customer in the Square account, following pagination. */
export async function listSquareCustomers(): Promise<SquareCustomer[]> {
  const out: SquareCustomer[] = [];
  let cursor: string | undefined;
  do {
    const qs = new URLSearchParams({ limit: "100" });
    if (cursor) qs.set("cursor", cursor);
    const body = await squareFetch(`/v2/customers?${qs}`);
    out.push(...((body.customers ?? []) as SquareCustomer[]));
    cursor = body.cursor;
  } while (cursor);
  return out;
}

export async function getSquareCustomer(id: string): Promise<SquareCustomer | null> {
  try {
    const body = await squareFetch(`/v2/customers/${id}`);
    return (body.customer as SquareCustomer) ?? null;
  } catch {
    return null;
  }
}

async function listLocationIds(): Promise<string[]> {
  const body = await squareFetch("/v2/locations");
  return ((body.locations ?? []) as { id: string }[]).map((l) => l.id);
}

/** Every invoice across all locations. */
export async function listSquareInvoices(): Promise<SquareInvoice[]> {
  const locations = await listLocationIds();
  const out: SquareInvoice[] = [];
  for (const locationId of locations) {
    let cursor: string | undefined;
    do {
      const qs = new URLSearchParams({ location_id: locationId, limit: "100" });
      if (cursor) qs.set("cursor", cursor);
      const body = await squareFetch(`/v2/invoices?${qs}`);
      out.push(...((body.invoices ?? []) as SquareInvoice[]));
      cursor = body.cursor;
    } while (cursor);
  }
  return out;
}

export async function getSquareInvoice(id: string): Promise<SquareInvoice | null> {
  try {
    const body = await squareFetch(`/v2/invoices/${id}`);
    return (body.invoice as SquareInvoice) ?? null;
  } catch {
    return null;
  }
}

// ---------- shaping Square records into our tables ----------

export function customerName(c: SquareCustomer) {
  const person = [c.given_name, c.family_name].filter(Boolean).join(" ").trim();
  return person || c.company_name || c.email_address || "Unnamed Square customer";
}

export function customerAddress(c: SquareCustomer) {
  const a = c.address;
  if (!a) return null;
  const line = [
    a.address_line_1,
    a.address_line_2,
    a.locality,
    a.administrative_district_level_1,
    a.postal_code,
  ]
    .filter(Boolean)
    .join(", ");
  return line || null;
}

export function toCustomerRow(c: SquareCustomer) {
  const card = c.cards?.[0];
  return {
    square_customer_id: c.id,
    name: customerName(c),
    email: c.email_address ?? null,
    phone: c.phone_number ?? null,
    address: customerAddress(c),
    notes: c.note ?? null,
    card_brand: card?.card_brand ?? null,
    card_last4: card?.last_4 ?? null,
    card_exp:
      card?.exp_month && card?.exp_year
        ? `${String(card.exp_month).padStart(2, "0")}/${String(card.exp_year).slice(-2)}`
        : null,
    synced_from_square_at: new Date().toISOString(),
  };
}

/** Square money is in cents. */
const centsToDollars = (cents?: number) => (cents ?? 0) / 100;

const STATUS_MAP: Record<string, "paid" | "unpaid" | "overdue"> = {
  PAID: "paid",
  REFUNDED: "paid",
  PARTIALLY_PAID: "unpaid",
  PARTIALLY_REFUNDED: "paid",
  UNPAID: "unpaid",
  SCHEDULED: "unpaid",
  DRAFT: "unpaid",
  CANCELED: "unpaid",
  FAILED: "unpaid",
};

export function toInvoiceRow(inv: SquareInvoice, customerId: string | null) {
  const request = inv.payment_requests?.[0];
  const dueDate =
    request?.due_date ??
    (inv.created_at ? inv.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10));
  const status = STATUS_MAP[inv.status ?? ""] ?? "unpaid";

  return {
    square_invoice_id: inv.id,
    customer_id: customerId,
    description:
      inv.title ||
      inv.description ||
      (inv.invoice_number ? `Square invoice ${inv.invoice_number}` : "Square invoice"),
    amount: centsToDollars(request?.computed_amount_money?.amount),
    status,
    issue_date: inv.created_at ? inv.created_at.slice(0, 10) : dueDate,
    due_date: dueDate,
    paid_date: status === "paid" ? dueDate : null,
    synced_from_square_at: new Date().toISOString(),
  };
}

// ---------- cards on file & charging ----------

export interface SquareCard {
  id: string;
  card_brand?: string;
  last_4?: string;
  exp_month?: number;
  exp_year?: number;
  cardholder_name?: string;
  enabled?: boolean;
}

/**
 * The cards this customer has saved in Square.
 *
 * The app never sees or stores a card number — Square keeps the card and
 * hands back an id that can be charged. That is the only lawful way to do
 * this without becoming subject to card-industry compliance yourself.
 */
export async function listCustomerCards(
  squareCustomerId: string
): Promise<SquareCard[]> {
  const qs = new URLSearchParams({
    customer_id: squareCustomerId,
    include_disabled: "false",
  });
  const body = await squareFetch(`/v2/cards?${qs}`);
  return ((body.cards ?? []) as SquareCard[]).filter((c) => c.enabled !== false);
}

export interface ChargeResult {
  paymentId: string;
  status: string;
  amount: number;
}

/**
 * Charge a saved card.
 *
 * `idempotencyKey` must be unique per intended charge and stable across
 * retries: if the same key arrives twice, Square returns the original
 * payment instead of taking the money again. Without it, a double click
 * or a network retry charges the customer twice.
 */
export async function chargeSavedCard(opts: {
  cardId: string;
  squareCustomerId: string;
  amountCents: number;
  idempotencyKey: string;
  note?: string;
}): Promise<ChargeResult> {
  if (!Number.isInteger(opts.amountCents) || opts.amountCents <= 0) {
    throw new Error("Charge amount must be a positive whole number of cents");
  }

  const body = await squareFetch("/v2/payments", {
    method: "POST",
    body: JSON.stringify({
      source_id: opts.cardId,
      customer_id: opts.squareCustomerId,
      idempotency_key: opts.idempotencyKey,
      amount_money: { amount: opts.amountCents, currency: "USD" },
      autocomplete: true,
      note: opts.note?.slice(0, 500),
    }),
  });

  const payment = body.payment as {
    id: string;
    status: string;
    amount_money?: { amount?: number };
  };

  return {
    paymentId: payment.id,
    status: payment.status,
    amount: (payment.amount_money?.amount ?? opts.amountCents) / 100,
  };
}

// ---------- sending an invoice to Square ----------

/** The first location on the account — invoices must belong to one. */
export async function firstLocationId(): Promise<string> {
  const body = await squareFetch("/v2/locations");
  const locations = (body.locations ?? []) as { id: string; status?: string }[];
  const active = locations.find((l) => l.status !== "INACTIVE") ?? locations[0];
  if (!active) throw new Error("No Square location found on this account");
  return active.id;
}

/**
 * Create a Square invoice from one of ours.
 *
 * Square needs an order first — the order holds the line items and the
 * money, the invoice is the thing that gets delivered to the customer.
 *
 * `publish` decides whether Square actually sends it. Left off, it lands
 * in Square as a draft for review, which is the safer default for the
 * first few.
 */
export async function createSquareInvoice(opts: {
  squareCustomerId: string;
  description: string;
  amountCents: number;
  dueDate: string;
  idempotencyKey: string;
  publish: boolean;
  /**
   * When given, Square charges this saved card the moment the invoice is
   * published and emails the customer the invoice and receipt together —
   * one step, rather than billing and notifying separately.
   */
  cardId?: string;
}): Promise<{ invoiceId: string; status: string; publicUrl?: string }> {
  if (!Number.isInteger(opts.amountCents) || opts.amountCents <= 0) {
    throw new Error("Invoice amount must be a positive whole number of cents");
  }

  const locationId = await firstLocationId();

  const orderBody = await squareFetch("/v2/orders", {
    method: "POST",
    body: JSON.stringify({
      idempotency_key: `${opts.idempotencyKey}-order`,
      order: {
        location_id: locationId,
        customer_id: opts.squareCustomerId,
        line_items: [
          {
            name: opts.description.slice(0, 500),
            quantity: "1",
            base_price_money: { amount: opts.amountCents, currency: "USD" },
          },
        ],
      },
    }),
  });

  const orderId = (orderBody.order as { id: string }).id;

  const invoiceBody = await squareFetch("/v2/invoices", {
    method: "POST",
    body: JSON.stringify({
      idempotency_key: `${opts.idempotencyKey}-invoice`,
      invoice: {
        location_id: locationId,
        order_id: orderId,
        primary_recipient: { customer_id: opts.squareCustomerId },
        title: opts.description.slice(0, 250),
        delivery_method: "EMAIL",
        accepted_payment_methods: { card: true, bank_account: false },
        payment_requests: [
          {
            request_type: "BALANCE",
            due_date: opts.dueDate,
            automatic_payment_source: opts.cardId ? "CARD_ON_FILE" : "NONE",
            ...(opts.cardId ? { card_id: opts.cardId } : {}),
          },
        ],
      },
    }),
  });

  const invoice = invoiceBody.invoice as {
    id: string;
    version: number;
    status: string;
    public_url?: string;
  };

  if (!opts.publish) {
    return { invoiceId: invoice.id, status: invoice.status };
  }

  const published = await squareFetch(`/v2/invoices/${invoice.id}/publish`, {
    method: "POST",
    body: JSON.stringify({
      idempotency_key: `${opts.idempotencyKey}-publish`,
      version: invoice.version,
    }),
  });

  const pub = published.invoice as { id: string; status: string; public_url?: string };
  return {
    invoiceId: pub.id,
    status: pub.status,
    publicUrl: pub.public_url,
  };
}

/**
 * Save a card against a Square customer.
 *
 * `sourceId` is a single-use token produced in the browser by Square's
 * Web Payments SDK — the card number goes straight from the customer's
 * browser to Square and never passes through this app or its database.
 *
 * Square requires the customer to have agreed to the card being kept and
 * charged later. That consent is collected in the form that produces the
 * token; storing a card without it can get the account shut down.
 */
export async function saveCardOnFile(opts: {
  sourceId: string;
  squareCustomerId: string;
  idempotencyKey: string;
  cardholderName?: string;
}): Promise<SquareCard> {
  const body = await squareFetch("/v2/cards", {
    method: "POST",
    body: JSON.stringify({
      idempotency_key: opts.idempotencyKey,
      source_id: opts.sourceId,
      card: {
        customer_id: opts.squareCustomerId,
        ...(opts.cardholderName ? { cardholder_name: opts.cardholderName } : {}),
      },
    }),
  });
  return body.card as SquareCard;
}

/** Card-on-file charges sit on Square's card-not-present rate. */
export const CARD_ON_FILE_RATE = { percent: 3.5, fixedCents: 15 };

export function estimateSquareFee(amountCents: number) {
  return Math.round(
    (amountCents * CARD_ON_FILE_RATE.percent) / 100 + CARD_ON_FILE_RATE.fixedCents
  );
}
