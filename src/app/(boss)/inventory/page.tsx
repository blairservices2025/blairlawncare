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
  StatTile,
} from "@/components/ui";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { fmtDate, usd } from "@/lib/format";
import type { InventoryItem, InventoryCategory } from "@/lib/types";

const CATEGORIES: { value: InventoryCategory; label: string }[] = [
  { value: "equipment", label: "Equipment" },
  { value: "supplies", label: "Supplies" },
  { value: "parts", label: "Parts" },
  { value: "fuel", label: "Fuel" },
  { value: "chemicals", label: "Chemicals" },
  { value: "other", label: "Other" },
];

const emptyForm = {
  name: "",
  category: "supplies",
  quantity: "0",
  unit: "each",
  low_stock_at: "",
  unit_cost: "",
  location: "",
  notes: "",
  service_due: "",
};

/** Running low, or already out. */
function stockState(i: InventoryItem): "out" | "low" | "ok" {
  if (Number(i.quantity) <= 0) return "out";
  if (i.low_stock_at != null && Number(i.quantity) <= Number(i.low_stock_at))
    return "low";
  return "ok";
}

export default function InventoryPage() {
  const supabase = createClient();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState<Record<string, string>>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("inventory_items")
      .select("*")
      .eq("is_active", true)
      .order("category")
      .order("name");
    setItems((data as InventoryItem[]) ?? []);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useLiveRefresh("inventory-live", { inventory_items: load });

  /** Nudge a count up or down; the database records who and why. */
  async function adjust(item: InventoryItem, change: number) {
    // Move it on screen straight away, put it back if the write fails.
    setItems((list) =>
      list.map((x) =>
        x.id === item.id
          ? { ...x, quantity: Math.max(0, Number(x.quantity) + change) }
          : x
      )
    );
    const { error: err } = await supabase.rpc("adjust_inventory", {
      item: item.id,
      change,
      why: change > 0 ? "Restocked" : "Used",
    });
    if (err) {
      setItems((list) =>
        list.map((x) => (x.id === item.id ? { ...x, quantity: item.quantity } : x))
      );
      alert(`Could not update that: ${err.message}`);
    }
  }

  function startAdd() {
    setEditing(null);
    setForm(emptyForm);
    setError(null);
    setShowForm(true);
  }

  function startEdit(i: InventoryItem) {
    setEditing(i);
    setForm({
      name: i.name,
      category: i.category,
      quantity: String(i.quantity),
      unit: i.unit,
      low_stock_at: i.low_stock_at != null ? String(i.low_stock_at) : "",
      unit_cost: i.unit_cost != null ? String(i.unit_cost) : "",
      location: i.location ?? "",
      notes: i.notes ?? "",
      service_due: i.service_due ?? "",
    });
    setError(null);
    setShowForm(true);
  }

  async function save() {
    if (!form.name.trim()) {
      setError("Give it a name.");
      return;
    }
    setBusy(true);
    setError(null);

    const payload = {
      name: form.name.trim(),
      category: form.category,
      quantity: Number(form.quantity || 0),
      unit: form.unit.trim() || "each",
      low_stock_at: form.low_stock_at ? Number(form.low_stock_at) : null,
      unit_cost: form.unit_cost ? Number(form.unit_cost) : null,
      location: form.location || null,
      notes: form.notes || null,
      service_due: form.service_due || null,
      updated_at: new Date().toISOString(),
    };

    const { error: dbErr } = editing
      ? await supabase.from("inventory_items").update(payload).eq("id", editing.id)
      : await supabase.from("inventory_items").insert(payload);

    setBusy(false);
    if (dbErr) {
      setError(dbErr.message);
      return;
    }
    setShowForm(false);
    load();
  }

  async function remove(i: InventoryItem) {
    if (!confirm(`Remove ${i.name} from the list?`)) return;
    await supabase
      .from("inventory_items")
      .update({ is_active: false })
      .eq("id", i.id);
    load();
  }

  const visible = items.filter(
    (i) =>
      (!categoryFilter || i.category === categoryFilter) &&
      (!search ||
        i.name.toLowerCase().includes(search.toLowerCase()) ||
        (i.location ?? "").toLowerCase().includes(search.toLowerCase()))
  );

  const lowOrOut = items.filter((i) => stockState(i) !== "ok");
  const totalValue = items.reduce(
    (sum, i) => sum + Number(i.quantity) * Number(i.unit_cost ?? 0),
    0
  );
  const serviceSoon = items.filter(
    (i) =>
      i.service_due &&
      new Date(i.service_due + "T00:00:00").getTime() <
        Date.now() + 14 * 86400000
  );

  // Grouped so the list reads by kind rather than one long run.
  const grouped = CATEGORIES.map((c) => ({
    ...c,
    items: visible.filter((i) => i.category === c.value),
  })).filter((g) => g.items.length > 0);

  if (loading) return <p className="text-ink-soft text-sm">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="display text-[26px] font-semibold tracking-[-0.2px]">
          Inventory
        </h1>
        <Button onClick={startAdd}>+ Add an item</Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Items tracked" value={String(items.length)} accent={0} />
        <StatTile
          label="Running low"
          value={String(lowOrOut.length)}
          tone={lowOrOut.length > 0 ? "warn" : "default"}
          accent={1}
        />
        <StatTile
          label="Value on hand"
          value={usd(totalValue)}
          sub="Counts only items with a cost"
          accent={2}
        />
        <StatTile
          label="Service due soon"
          value={String(serviceSoon.length)}
          tone={serviceSoon.length > 0 ? "warn" : "default"}
          accent={3}
        />
      </div>

      {lowOrOut.length > 0 && (
        <Card title={`Reorder (${lowOrOut.length})`}>
          <ul className="divide-y divide-line">
            {lowOrOut.map((i) => (
              <li
                key={i.id}
                className="py-2 flex items-center justify-between gap-2"
              >
                <div>
                  <div className="text-[13.5px] font-semibold">{i.name}</div>
                  <div className="text-xs text-ink-soft">
                    {Number(i.quantity)} {i.unit} left
                    {i.low_stock_at != null
                      ? ` · reorder at ${Number(i.low_stock_at)}`
                      : ""}
                    {i.location ? ` · ${i.location}` : ""}
                  </div>
                </div>
                <Badge tone={stockState(i) === "out" ? "serious" : "warn"}>
                  {stockState(i) === "out" ? "out" : "low"}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Everything">
        <div className="flex gap-2 flex-wrap mb-3">
          <div className="flex-1 min-w-48">
            <Label>Search</Label>
            <Input
              placeholder="Name or where it's kept…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div>
            <Label>Category</Label>
            <Select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="!w-auto"
            >
              <option value="">All</option>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {grouped.length === 0 ? (
          <Empty>
            {items.length === 0
              ? "Nothing tracked yet — add your first item."
              : "Nothing matches that."}
          </Empty>
        ) : (
          grouped.map((group) => (
            <div key={group.value} className="mb-4 last:mb-0">
              <div className="text-[11px] font-semibold text-ink-soft uppercase tracking-[0.6px] mb-1">
                {group.label}
              </div>
              <ul className="divide-y divide-line">
                {group.items.map((i) => {
                  const state = stockState(i);
                  return (
                    <li
                      key={i.id}
                      className="py-2.5 flex items-center justify-between gap-3 flex-wrap"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-semibold flex items-center gap-2">
                          {i.name}
                          {state !== "ok" && (
                            <Badge tone={state === "out" ? "serious" : "warn"}>
                              {state}
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-ink-soft">
                          {i.location ?? "No location set"}
                          {i.unit_cost != null
                            ? ` · ${usd(Number(i.unit_cost))} each`
                            : ""}
                          {i.service_due
                            ? ` · service due ${fmtDate(i.service_due)}`
                            : ""}
                        </div>
                        {i.notes && (
                          <div className="text-xs text-ink-soft">{i.notes}</div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => adjust(i, -1)}
                          className="w-8 h-8 rounded-lg border border-line text-lg leading-none hover:border-cut disabled:opacity-40"
                          disabled={Number(i.quantity) <= 0}
                          aria-label={`Use one ${i.name}`}
                        >
                          −
                        </button>
                        <div className="w-20 text-center">
                          <div className="font-mono text-[15px] font-semibold">
                            {Number(i.quantity)}
                          </div>
                          <div className="text-[10px] text-ink-soft">
                            {i.unit}
                          </div>
                        </div>
                        <button
                          onClick={() => adjust(i, 1)}
                          className="w-8 h-8 rounded-lg border border-line text-lg leading-none hover:border-cut"
                          aria-label={`Add one ${i.name}`}
                        >
                          +
                        </button>
                        <Button
                          variant="secondary"
                          onClick={() => startEdit(i)}
                          className="!py-1 !px-2.5 text-xs"
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => remove(i)}
                          className="!py-1 !px-2 text-xs"
                        >
                          Remove
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </Card>

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? `Edit ${editing.name}` : "Add an item"}
        wide
      >
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <Label>Name *</Label>
            <Input
              placeholder="Trimmer line, 2-cycle oil, Toro 21in…"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <Label>Category</Label>
            <Select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Kept where</Label>
            <Input
              placeholder="Shop, trailer, truck bed…"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>How many</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              />
            </div>
            <div>
              <Label>Counted in</Label>
              <Input
                placeholder="each, gal, lb…"
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Reorder at</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="2"
                value={form.low_stock_at}
                onChange={(e) =>
                  setForm({ ...form, low_stock_at: e.target.value })
                }
              />
            </div>
            <div>
              <Label>Cost each ($)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.unit_cost}
                onChange={(e) => setForm({ ...form, unit_cost: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label>Service due</Label>
            <Input
              type="date"
              value={form.service_due}
              onChange={(e) => setForm({ ...form, service_due: e.target.value })}
            />
            <p className="text-xs text-ink-soft mt-1">
              For equipment — blade changes, oil, tune-ups.
            </p>
          </div>
          <div className="sm:col-span-2">
            <Label>Notes</Label>
            <Input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>
        {error && <p className="text-sm text-[var(--status-overdue-fg)] mt-3">{error}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" onClick={() => setShowForm(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : editing ? "Save" : "Add item"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
