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
import AddCardModal from "@/components/AddCardModal";
import { daysOverdue, fmtDate, usd } from "@/lib/format";
import type {
  Customer,
  Invoice,
  PaymentAttempt,
  ScheduledJob,
  Yard,
} from "@/lib/types";

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
  const [yards, setYards] = useState<Yard[]>([]);
  const [yardForm, setYardForm] = useState<{ open: boolean; yard: Yard | null; customerId: string }>(
    { open: false, yard: null, customerId: "" }
  );
  const [selected, setSelected] = useState<Customer | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [payments, setPayments] = useState<PaymentAttempt[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState<Record<string, string>>(emptyForm);
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [charging, setCharging] = useState(false);
  const [addingCard, setAddingCard] = useState(false);

  const load = useCallback(async () => {
    const [cu, yd] = await Promise.all([
      supabase.from("customers").select("*").order("name"),
      supabase
        .from("yards")
        .select("*, customers(name, phone, card_last4)")
        .order("name"),
    ]);
    setCustomers((cu.data as Customer[]) ?? []);
    setYards((yd.data as Yard[]) ?? []);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function openDetail(c: Customer) {
    setSelected(c);
    const [inv, jb, pay] = await Promise.all([
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
      supabase
        .from("payment_attempts")
        .select("*")
        .eq("customer_id", c.id)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    setInvoices((inv.data as Invoice[]) ?? []);
    setJobs((jb.data as ScheduledJob[]) ?? []);
    setPayments((pay.data as PaymentAttempt[]) ?? []);
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

  async function saveYard(form: {
    id?: string;
    customer_id: string;
    name: string;
    address: string;
    plan: string;
    price: string;
    gate_code: string;
    notes: string;
    last_service_date: string;
  }) {
    const payload = {
      customer_id: form.customer_id,
      name: form.name.trim(),
      address: form.address || null,
      plan: form.plan,
      price: form.price ? Number(form.price) : null,
      gate_code: form.gate_code || null,
      notes: form.notes || null,
      last_service_date: form.last_service_date || null,
    };
    const { error } = form.id
      ? await supabase.from("yards").update(payload).eq("id", form.id)
      : await supabase.from("yards").insert(payload);
    if (error) return error.message;
    setYardForm({ open: false, yard: null, customerId: "" });
    load();
    return null;
  }

  async function removeYard(y: Yard) {
    if (
      !confirm(
        `Delete the yard "${y.name}"? Its scheduled jobs go with it. The client stays.`
      )
    )
      return;
    await supabase.from("yards").delete().eq("id", y.id);
    load();
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
        <div>
          <h1 className="display text-[26px] font-semibold tracking-[-0.2px]">
            Yards
          </h1>
          <p className="text-[13px] text-ink-soft mt-0.5">
            {yards.length} yard{yards.length === 1 ? "" : "s"} across{" "}
            {customers.length} client{customers.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button onClick={startAdd}>+ Add client</Button>
      </div>

      <Card>
        {yards.length === 0 ? (
          <Empty>No yards yet — add a client and their first yard.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {yards.map((y) => {
              const flag =
                y.plan === "weekly" &&
                y.last_service_date &&
                daysOverdue(y.last_service_date) >= 6;
              const client = customers.find((c) => c.id === y.customer_id);
              return (
                <li
                  key={y.id}
                  className="py-2.5 flex items-center justify-between gap-3 cursor-pointer hover:bg-bone-dim/40 -mx-2 px-2 rounded-lg"
                  onClick={() => client && openDetail(client)}
                >
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold flex items-center gap-2">
                      {y.name}
                      {flag && <Badge tone="serious">⚠ overdue</Badge>}
                    </div>
                    <div className="text-xs text-ink-soft truncate">
                      {y.customers?.name ?? client?.name ?? "Unknown client"}
                      {y.address ? ` · ${y.address}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge tone="neutral">{y.plan.replace("_", "-")}</Badge>
                    {y.price != null && (
                      <span className="text-xs font-mono">{usd(Number(y.price))}</span>
                    )}
                    <span className="text-xs text-ink-soft hidden sm:inline">
                      Last: {fmtDate(y.last_service_date)}
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
              <Button variant="secondary" onClick={() => setAddingCard(true)}>
                ＋ Card on file
              </Button>
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
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-sm font-semibold">Yards</h4>
                <button
                  onClick={() =>
                    setYardForm({
                      open: true,
                      yard: null,
                      customerId: selected.id,
                    })
                  }
                  className="text-[12.5px] text-cut font-semibold"
                >
                  + Add a yard
                </button>
              </div>
              {yards.filter((y) => y.customer_id === selected.id).length === 0 ? (
                <p className="text-xs text-ink-soft">
                  No yards yet for this client.
                </p>
              ) : (
                <ul className="divide-y divide-line">
                  {yards
                    .filter((y) => y.customer_id === selected.id)
                    .map((y) => (
                      <li
                        key={y.id}
                        className="py-2 flex items-start justify-between gap-2 text-sm"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold">{y.name}</div>
                          <div className="text-xs text-ink-soft">
                            {y.address ?? "No address"} ·{" "}
                            {y.plan.replace("_", "-")}
                            {y.price != null ? ` · ${usd(Number(y.price))}` : ""}
                            {y.gate_code ? ` · gate ${y.gate_code}` : ""}
                          </div>
                          <div className="text-xs text-ink-soft">
                            Last service: {fmtDate(y.last_service_date)}
                          </div>
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          <Button
                            variant="secondary"
                            onClick={() =>
                              setYardForm({
                                open: true,
                                yard: y,
                                customerId: selected.id,
                              })
                            }
                            className="!py-1 !px-2 text-xs"
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => removeYard(y)}
                            className="!py-1 !px-2 text-xs"
                          >
                            Delete
                          </Button>
                        </div>
                      </li>
                    ))}
                </ul>
              )}
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-1">Card payments</h4>
              {payments.length === 0 ? (
                <p className="text-xs text-ink-soft">
                  No card charges to this customer yet.
                </p>
              ) : (
                <ul className="divide-y divide-line">
                  {payments.map((p) => (
                    <li
                      key={p.id}
                      className="py-1.5 flex justify-between items-start gap-2 text-sm"
                    >
                      <span>
                        {fmtDate(p.created_at)}
                        {p.card_last4 ? ` · •••• ${p.card_last4}` : ""}
                        {p.error && (
                          <span className="block text-xs text-[var(--status-overdue-fg)]">
                            {p.error}
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        {usd(Number(p.amount))}
                        <Badge
                          tone={p.status === "completed" ? "good" : "serious"}
                        >
                          {p.status === "completed" ? "paid" : "failed"}
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

      <AddCardModal
        open={addingCard}
        onClose={() => setAddingCard(false)}
        customerId={selected?.id ?? null}
        customerName={selected?.name ?? ""}
        onSaved={load}
      />

      <ChargeCardModal
        open={charging}
        onClose={() => setCharging(false)}
        customerId={selected?.id ?? null}
        customerName={selected?.name ?? ""}
        description={`Blair Lawn Care — ${selected?.name ?? ""}`}
        onCharged={load}
      />

      <YardFormModal
        state={yardForm}
        onClose={() => setYardForm({ open: false, yard: null, customerId: "" })}
        onSave={saveYard}
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


/* ---------------- Yard add / edit ---------------- */

function YardFormModal({
  state,
  onClose,
  onSave,
}: {
  state: { open: boolean; yard: Yard | null; customerId: string };
  onClose: () => void;
  onSave: (form: {
    id?: string;
    customer_id: string;
    name: string;
    address: string;
    plan: string;
    price: string;
    gate_code: string;
    notes: string;
    last_service_date: string;
  }) => Promise<string | null>;
}) {
  const [form, setForm] = useState({
    name: "",
    address: "",
    plan: "weekly",
    price: "",
    gate_code: "",
    notes: "",
    last_service_date: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!state.open) return;
    const y = state.yard;
    setForm({
      name: y?.name ?? "",
      address: y?.address ?? "",
      plan: y?.plan ?? "weekly",
      price: y?.price != null ? String(y.price) : "",
      gate_code: y?.gate_code ?? "",
      notes: y?.notes ?? "",
      last_service_date: y?.last_service_date ?? "",
    });
    setError(null);
  }, [state]);

  async function submit() {
    if (!form.name.trim()) {
      setError("Give the yard a name — it's what the crew will look for.");
      return;
    }
    setBusy(true);
    const err = await onSave({
      id: state.yard?.id,
      customer_id: state.customerId,
      ...form,
    });
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <Modal
      open={state.open}
      onClose={onClose}
      title={state.yard ? `Edit ${state.yard.name}` : "Add a yard"}
    >
      <div className="space-y-3">
        <div>
          <Label>Yard name *</Label>
          <Input
            placeholder="Main house, Rental on 5th, Shop lot…"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <p className="text-xs text-ink-soft mt-1">
            This is the heading the crew see on their list.
          </p>
        </div>
        <div>
          <Label>Address</Label>
          <Input
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
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
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Gate code</Label>
            <Input
              value={form.gate_code}
              onChange={(e) => setForm({ ...form, gate_code: e.target.value })}
            />
          </div>
          <div>
            <Label>Last service</Label>
            <Input
              type="date"
              value={form.last_service_date}
              onChange={(e) =>
                setForm({ ...form, last_service_date: e.target.value })
              }
            />
          </div>
        </div>
        <div>
          <Label>Notes for the crew</Label>
          <Input
            placeholder="Dog in the back, skip the side strip…"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>
        {error && (
          <p className="text-sm text-[var(--status-overdue-fg)]">{error}</p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Saving…" : state.yard ? "Save yard" : "Add yard"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
