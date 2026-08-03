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
import { daysOverdue, fmtDate, usd } from "@/lib/format";
import type { Customer, Invoice, ScheduledJob } from "@/lib/types";

const emptyForm = {
  name: "",
  phone: "",
  email: "",
  address: "",
  plan: "weekly",
  price: "",
  last_service_date: "",
  notes: "",
  card_brand: "",
  card_last4: "",
  card_exp: "",
};

export default function CustomersPage() {
  const supabase = createClient();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState<Record<string, string>>(emptyForm);
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [charging, setCharging] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("customers").select("*").order("name");
    setCustomers((data as Customer[]) ?? []);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function openDetail(c: Customer) {
    setSelected(c);
    const [inv, jb] = await Promise.all([
      supabase
        .from("invoices")
        .select("*")
        .eq("customer_id", c.id)
        .order("issue_date", { ascending: false }),
      supabase
        .from("scheduled_jobs")
        .select("*, profiles(full_name)")
        .eq("customer_id", c.id)
        .order("job_date", { ascending: false })
        .limit(15),
    ]);
    setInvoices((inv.data as Invoice[]) ?? []);
    setJobs((jb.data as ScheduledJob[]) ?? []);
  }

  function startAdd() {
    setEditing(null);
    setForm(emptyForm);
    setContractFile(null);
    setError(null);
    setShowForm(true);
  }

  function startEdit(c: Customer) {
    setEditing(c);
    setForm({
      name: c.name,
      phone: c.phone ?? "",
      email: c.email ?? "",
      address: c.address ?? "",
      plan: c.plan,
      price: c.price != null ? String(c.price) : "",
      last_service_date: c.last_service_date ?? "",
      notes: c.notes ?? "",
      card_brand: c.card_brand ?? "",
      card_last4: c.card_last4 ?? "",
      card_exp: c.card_exp ?? "",
    });
    setContractFile(null);
    setError(null);
    setShowForm(true);
  }

  async function save() {
    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }
    setBusy(true);
    setError(null);

    let contract_file_url: string | undefined;
    if (contractFile) {
      const path = `${crypto.randomUUID()}-${contractFile.name}`;
      const { error: upErr } = await supabase.storage
        .from("contracts")
        .upload(path, contractFile);
      if (upErr) {
        setError(`Contract upload failed: ${upErr.message}`);
        setBusy(false);
        return;
      }
      contract_file_url = path;
    }

    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      phone: form.phone || null,
      email: form.email || null,
      address: form.address || null,
      plan: form.plan,
      price: form.price ? Number(form.price) : null,
      last_service_date: form.last_service_date || null,
      notes: form.notes || null,
      card_brand: form.card_brand || null,
      card_last4: form.card_last4 || null,
      card_exp: form.card_exp || null,
    };
    if (contract_file_url) payload.contract_file_url = contract_file_url;

    const q = editing
      ? supabase.from("customers").update(payload).eq("id", editing.id)
      : supabase.from("customers").insert(payload);
    const { error: dbErr } = await q;
    setBusy(false);
    if (dbErr) {
      setError(dbErr.message);
      return;
    }
    setShowForm(false);
    setSelected(null);
    load();
  }

  async function viewContract(path: string) {
    const { data, error } = await supabase.storage
      .from("contracts")
      .createSignedUrl(path, 300);
    if (error || !data) return alert("Could not open contract.");
    window.open(data.signedUrl, "_blank");
  }

  async function removeCustomer(c: Customer) {
    if (!confirm(`Delete ${c.name}? This also deletes their invoices and jobs.`))
      return;
    await supabase.from("customers").delete().eq("id", c.id);
    setSelected(null);
    load();
  }

  if (loading) return <p className="text-ink-soft text-sm">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="display text-[26px] font-semibold tracking-[-0.2px]">Customers</h1>
        <Button onClick={startAdd}>+ Add customer</Button>
      </div>

      <Card>
        {customers.length === 0 ? (
          <Empty>No customers yet — add your first one.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {customers.map((c) => {
              const flag =
                c.plan === "weekly" &&
                c.last_service_date &&
                daysOverdue(c.last_service_date) >= 6;
              return (
                <li
                  key={c.id}
                  className="py-2.5 flex items-center justify-between gap-3 cursor-pointer hover:bg-bone-dim/40 -mx-2 px-2 rounded-lg"
                  onClick={() => openDetail(c)}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium flex items-center gap-2">
                      {c.name}
                      {flag && <Badge tone="serious">⚠ overdue</Badge>}
                    </div>
                    <div className="text-xs text-ink-soft truncate">
                      {c.address ?? "No address"} · {c.phone ?? "no phone"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge tone="neutral">{c.plan.replace("_", "-")}</Badge>
                    <span className="text-xs text-ink-soft">
                      Last: {fmtDate(c.last_service_date)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Detail modal */}
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.name ?? ""}
        wide
      >
        {selected && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-ink-soft">Phone</div>
                {selected.phone ?? "—"}
              </div>
              <div>
                <div className="text-xs text-ink-soft">Email</div>
                {selected.email ?? "—"}
              </div>
              <div>
                <div className="text-xs text-ink-soft">Address</div>
                {selected.address ?? "—"}
              </div>
              <div>
                <div className="text-xs text-ink-soft">Plan / price</div>
                {selected.plan.replace("_", "-")}
                {selected.price != null ? ` · ${usd(Number(selected.price))}` : ""}
              </div>
              <div>
                <div className="text-xs text-ink-soft">Last service</div>
                {fmtDate(selected.last_service_date)}
              </div>
              <div>
                <div className="text-xs text-ink-soft">Card on file (reference)</div>
                {selected.card_brand
                  ? `${selected.card_brand} •••• ${selected.card_last4} (exp ${selected.card_exp})`
                  : "None"}
              </div>
            </div>
            {selected.notes && (
              <p className="text-sm bg-bone-dim rounded-lg p-3">{selected.notes}</p>
            )}
            <div className="flex gap-2 flex-wrap">
              <Button variant="secondary" onClick={() => startEdit(selected)}>
                Edit
              </Button>
              {selected.contract_file_url && (
                <Button
                  variant="secondary"
                  onClick={() => viewContract(selected.contract_file_url!)}
                >
                  View contract
                </Button>
              )}
              <Button onClick={() => setCharging(true)}>💳 Charge a card</Button>
              <Button variant="danger" onClick={() => removeCustomer(selected)}>
                Delete
              </Button>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-1">Invoices</h4>
              {invoices.length === 0 ? (
                <p className="text-xs text-ink-soft">No invoices.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {invoices.map((i) => (
                    <li key={i.id} className="py-1.5 flex justify-between text-sm">
                      <span>
                        {i.description} · due {fmtDate(i.due_date)}
                      </span>
                      <span className="flex items-center gap-2">
                        {usd(Number(i.amount))}
                        <Badge
                          tone={
                            i.status === "paid"
                              ? "good"
                              : i.status === "overdue"
                                ? "serious"
                                : "warn"
                          }
                        >
                          {i.status}
                        </Badge>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-1">Job history</h4>
              {jobs.length === 0 ? (
                <p className="text-xs text-ink-soft">No jobs yet.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {jobs.map((j) => (
                    <li key={j.id} className="py-1.5 flex justify-between text-sm">
                      <span>
                        {fmtDate(j.job_date)}
                        {j.profiles?.full_name ? ` · ${j.profiles.full_name}` : ""}
                      </span>
                      <Badge
                        tone={
                          j.status === "done"
                            ? "good"
                            : j.status === "skipped"
                              ? "serious"
                              : "neutral"
                        }
                      >
                        {j.status.replace("_", " ")}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal>

      <ChargeCardModal
        open={charging}
        onClose={() => setCharging(false)}
        customerId={selected?.id ?? null}
        customerName={selected?.name ?? ""}
        description={`Blair Lawn Care — ${selected?.name ?? ""}`}
        onCharged={load}
      />

      {/* Add/edit form */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? `Edit ${editing.name}` : "Add customer"}
        wide
      >
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <Label>Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <Label>Phone</Label>
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Address</Label>
            <Input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
          <div>
            <Label>Plan</Label>
            <Select
              value={form.plan}
              onChange={(e) => setForm({ ...form, plan: e.target.value })}
            >
              <option value="weekly">Weekly</option>
              <option value="biweekly">Bi-weekly</option>
              <option value="monthly">Monthly</option>
              <option value="one_time">One-time</option>
            </Select>
          </div>
          <div>
            <Label>Price per service ($)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
            />
          </div>
          <div>
            <Label>Last service date</Label>
            <Input
              type="date"
              value={form.last_service_date}
              onChange={(e) =>
                setForm({ ...form, last_service_date: e.target.value })
              }
            />
          </div>
          <div>
            <Label>Contract file (PDF/image)</Label>
            <Input
              type="file"
              accept=".pdf,image/*"
              onChange={(e) => setContractFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Notes</Label>
            <Input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2 border-t border-line pt-3">
            <p className="text-xs text-ink-soft mb-2">
              Card on file — <strong>reference only</strong> (brand, last 4,
              expiry). Never enter a full card number; real charging is wired up
              later via a payment processor.
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Brand</Label>
                <Input
                  placeholder="Visa"
                  value={form.card_brand}
                  onChange={(e) =>
                    setForm({ ...form, card_brand: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>Last 4</Label>
                <Input
                  maxLength={4}
                  placeholder="4242"
                  value={form.card_last4}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      card_last4: e.target.value.replace(/\D/g, ""),
                    })
                  }
                />
              </div>
              <div>
                <Label>Expiry</Label>
                <Input
                  placeholder="12/27"
                  value={form.card_exp}
                  onChange={(e) => setForm({ ...form, card_exp: e.target.value })}
                />
              </div>
            </div>
          </div>
        </div>
        {error && <p className="text-sm text-[var(--status-overdue-fg)] mt-3">{error}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" onClick={() => setShowForm(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save customer"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
