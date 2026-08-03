"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Badge,
  Button,
  Card,
  Empty,
  Input,
  Label,
  Modal,
  Select,
} from "@/components/ui";
import ChargeCardModal from "@/components/ChargeCardModal";
import { addDays, fmtDate, todayISO, usd } from "@/lib/format";
import type { Customer, Invoice } from "@/lib/types";

export default function InvoicesPage() {
  const supabase = createClient();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filter, setFilter] = useState<"all" | "unpaid" | "paid" | "overdue">(
    "all"
  );
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    customer_id: "",
    description: "",
    amount: "",
    due_date: addDays(todayISO(), 14),
    recurrence: "one_time",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [chargingInvoice, setChargingInvoice] = useState<Invoice | null>(null);
  const [pushing, setPushing] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [i, c] = await Promise.all([
      supabase
        .from("invoices")
        .select("*, customers(name)")
        .order("issue_date", { ascending: false }),
      supabase.from("customers").select("*").order("name"),
    ]);
    setInvoices((i.data as Invoice[]) ?? []);
    setCustomers((c.data as Customer[]) ?? []);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const effectiveStatus = (i: Invoice) =>
    i.status === "unpaid" && i.due_date < todayISO() ? "overdue" : i.status;

  async function create() {
    if (!form.customer_id || !form.description.trim() || !form.amount) {
      setError("Customer, description and amount are required.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: dbErr } = await supabase.from("invoices").insert({
      customer_id: form.customer_id,
      description: form.description.trim(),
      amount: Number(form.amount),
      due_date: form.due_date,
      recurrence: form.recurrence,
    });
    setBusy(false);
    if (dbErr) {
      setError(dbErr.message);
      return;
    }
    setShowForm(false);
    setForm({
      customer_id: "",
      description: "",
      amount: "",
      due_date: addDays(todayISO(), 14),
      recurrence: "one_time",
    });
    load();
  }

  async function markPaid(i: Invoice) {
    await supabase
      .from("invoices")
      .update({ status: "paid", paid_date: todayISO() })
      .eq("id", i.id);
    load();
  }

  async function markUnpaid(i: Invoice) {
    await supabase
      .from("invoices")
      .update({ status: "unpaid", paid_date: null })
      .eq("id", i.id);
    load();
  }

  async function pushToSquare(i: Invoice, publish: boolean) {
    const cust = customers.find((c) => c.id === i.customer_id);
    if (!cust?.square_customer_id) {
      alert(
        "That customer isn't linked to Square yet. Add them in Square, then sync from Settings."
      );
      return;
    }
    if (
      !confirm(
        publish
          ? `Send this invoice to ${cust.name} through Square? They'll get an email from Square asking to pay ${usd(Number(i.amount))}.`
          : `Create this invoice in Square as a draft for ${cust.name}? Nothing is sent to them yet.`
      )
    )
      return;

    setPushing(i.id);
    const res = await fetch("/api/square/push-invoice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invoiceId: i.id,
        publish,
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    const body = await res.json();
    setPushing(null);
    if (!res.ok) {
      alert(`Could not send to Square: ${body.error}`);
      return;
    }
    load();
    if (body.publicUrl && confirm("Sent. Open it in Square?")) {
      window.open(body.publicUrl, "_blank");
    }
  }

  async function remove(i: Invoice) {
    if (!confirm("Delete this invoice?")) return;
    await supabase.from("invoices").delete().eq("id", i.id);
    load();
  }

  const filtered = invoices.filter(
    (i) => filter === "all" || effectiveStatus(i) === filter
  );

  if (loading) return <p className="text-ink-soft text-sm">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="display text-[26px] font-semibold tracking-[-0.2px]">Invoices</h1>
        <div className="flex gap-2 items-center">
          <Select
            value={filter}
            onChange={(e) =>
              setFilter(e.target.value as typeof filter)
            }
            className="!w-auto"
          >
            <option value="all">All</option>
            <option value="unpaid">Unpaid</option>
            <option value="overdue">Overdue</option>
            <option value="paid">Paid</option>
          </Select>
          <Button onClick={() => setShowForm(true)}>+ New invoice</Button>
        </div>
      </div>

      <Card>
        {filtered.length === 0 ? (
          <Empty>No invoices{filter !== "all" ? ` (${filter})` : ""}.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {filtered.map((i) => {
              const st = effectiveStatus(i);
              const cust = customers.find((c) => c.id === i.customer_id);
              return (
                <li
                  key={i.id}
                  className="py-2.5 flex items-center justify-between gap-3 flex-wrap"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium">
                      {i.customers?.name ?? "Unknown"} — {i.description}
                    </div>
                    <div className="text-xs text-ink-soft">
                      Issued {fmtDate(i.issue_date)} · Due {fmtDate(i.due_date)}
                      {i.recurrence !== "one_time"
                        ? ` · repeats ${i.recurrence.replace("_", "-")}`
                        : ""}
                      {i.paid_date ? ` · paid ${fmtDate(i.paid_date)}` : ""}
                      {i.square_invoice_id ? " · in Square" : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-semibold tabular-nums">
                      {usd(Number(i.amount))}
                    </span>
                    <Badge
                      tone={
                        st === "paid"
                          ? "good"
                          : st === "overdue"
                            ? "serious"
                            : "warn"
                      }
                    >
                      {st}
                    </Badge>
                    {st !== "paid" ? (
                      <>
                        {cust?.square_customer_id && (
                          <Button
                            variant="secondary"
                            onClick={() => setChargingInvoice(i)}
                            className="!py-1 !px-2 text-xs"
                          >
                            💳 Charge card
                          </Button>
                        )}
                        <Button
                          variant="secondary"
                          onClick={() => markPaid(i)}
                          className="!py-1 !px-2 text-xs"
                        >
                          Mark paid
                        </Button>
                        {cust?.square_customer_id && !i.square_invoice_id && (
                          <Button
                            variant="secondary"
                            onClick={() => pushToSquare(i, true)}
                            disabled={pushing === i.id}
                            className="!py-1 !px-2 text-xs"
                          >
                            {pushing === i.id ? "Sending…" : "⬆ Send via Square"}
                          </Button>
                        )}
                      </>
                    ) : (
                      <Button
                        variant="ghost"
                        onClick={() => markUnpaid(i)}
                        className="!py-1 !px-2 text-xs"
                      >
                        Undo
                      </Button>
                    )}
                    <button
                      onClick={() => remove(i)}
                      className="text-ink-soft hover:text-[var(--status-overdue-fg)] text-sm"
                      aria-label="Delete invoice"
                    >
                      ✕
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <ChargeCardModal
        open={!!chargingInvoice}
        onClose={() => setChargingInvoice(null)}
        customerId={chargingInvoice?.customer_id ?? null}
        customerName={chargingInvoice?.customers?.name ?? ""}
        invoiceId={chargingInvoice?.id}
        defaultAmount={
          chargingInvoice ? Number(chargingInvoice.amount) : undefined
        }
        description={chargingInvoice?.description}
        onCharged={load}
      />

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title="New invoice"
      >
        <div className="space-y-3">
          <div>
            <Label>Customer *</Label>
            <Select
              value={form.customer_id}
              onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
            >
              <option value="">Select a customer…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Description *</Label>
            <Input
              placeholder="Weekly mow & edge"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Amount ($) *</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            <div>
              <Label>Due date</Label>
              <Input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label>Recurrence</Label>
            <Select
              value={form.recurrence}
              onChange={(e) => setForm({ ...form, recurrence: e.target.value })}
            >
              <option value="one_time">One-time</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Bi-weekly</option>
              <option value="custom">Custom</option>
            </Select>
          </div>
          {error && <p className="text-sm text-[var(--status-overdue-fg)]">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button onClick={create} disabled={busy}>
              {busy ? "Creating…" : "Create invoice"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
