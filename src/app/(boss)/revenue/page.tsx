"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BarRow, Card, Empty, StatTile } from "@/components/ui";
import {
  daysOverdue,
  fmtDuration,
  hoursBetween,
  mondayOf,
  todayISO,
  usd,
} from "@/lib/format";
import type { Customer, Invoice, TimeClockEntry } from "@/lib/types";

export default function RevenuePage() {
  const supabase = createClient();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [clock, setClock] = useState<TimeClockEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [i, c, t] = await Promise.all([
        supabase.from("invoices").select("*, customers(name)"),
        supabase.from("customers").select("*"),
        supabase.from("time_clock_entries").select("*"),
      ]);
      setInvoices((i.data as Invoice[]) ?? []);
      setCustomers((c.data as Customer[]) ?? []);
      setClock((t.data as TimeClockEntry[]) ?? []);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <p className="text-ink-soft text-sm">Loading…</p>;

  const today = todayISO();
  const weekStart = mondayOf(today);
  const monthKey = today.slice(0, 7);

  const paid = invoices.filter((i) => i.status === "paid");
  const open = invoices.filter((i) => i.status !== "paid");

  const paidThisWeek = paid
    .filter((i) => i.paid_date && i.paid_date >= weekStart)
    .reduce((s, i) => s + Number(i.amount), 0);
  const paidThisMonth = paid
    .filter((i) => i.paid_date && i.paid_date.slice(0, 7) === monthKey)
    .reduce((s, i) => s + Number(i.amount), 0);
  const outstanding = open.reduce((s, i) => s + Number(i.amount), 0);

  // Recurring revenue: sum of active recurring invoices normalized to monthly
  const recurringMonthly = invoices
    .filter((i) => i.recurrence === "weekly")
    .reduce((s, i) => s + Number(i.amount) * 4.33, 0) +
    invoices
      .filter((i) => i.recurrence === "biweekly")
      .reduce((s, i) => s + Number(i.amount) * 2.17, 0);

  // Revenue per labor hour (this month)
  const laborHoursMonth = clock
    .filter((t) => t.clock_in.slice(0, 7) === monthKey)
    .reduce((s, t) => s + hoursBetween(t.clock_in, t.clock_out), 0);
  const revPerHour = laborHoursMonth > 0 ? paidThisMonth / laborHoursMonth : 0;

  // AR aging — severity scale: light → dark as the bucket ages
  const aging = { fresh: 0, mid: 0, old: 0 };
  for (const i of open) {
    const d = daysOverdue(i.due_date);
    if (d <= 0) continue;
    if (d <= 30) aging.fresh += Number(i.amount);
    else if (d <= 60) aging.mid += Number(i.amount);
    else aging.old += Number(i.amount);
  }
  const agingMax = Math.max(aging.fresh, aging.mid, aging.old, 1);

  // Revenue by customer (paid, all time)
  const byCustomer = new Map<string, number>();
  for (const i of paid) {
    const name = i.customers?.name ?? "Unknown";
    byCustomer.set(name, (byCustomer.get(name) ?? 0) + Number(i.amount));
  }
  const custRows = [...byCustomer.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const custMax = custRows[0]?.[1] ?? 1;

  // Revenue by plan (service type)
  const byPlan = new Map<string, number>();
  for (const i of paid) {
    const cust = customers.find((c) => c.id === i.customer_id);
    const plan = cust ? cust.plan.replace("_", "-") : "unknown";
    byPlan.set(plan, (byPlan.get(plan) ?? 0) + Number(i.amount));
  }
  const planRows = [...byPlan.entries()].sort((a, b) => b[1] - a[1]);
  const planMax = planRows[0]?.[1] ?? 1;

  const withCard = customers.filter((c) => c.card_last4).length;
  const cardPct =
    customers.length > 0 ? Math.round((withCard / customers.length) * 100) : 0;

  return (
    <div className="space-y-4">
      <h1 className="display text-[26px] font-semibold tracking-[-0.2px]">Revenue</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Collected this week" value={usd(paidThisWeek)} tone="good" />
        <StatTile label="Collected this month" value={usd(paidThisMonth)} tone="good" />
        <StatTile
          label="Outstanding"
          value={usd(outstanding)}
          tone={outstanding > 0 ? "warn" : "default"}
          sub={`${open.length} open invoice${open.length === 1 ? "" : "s"}`}
        />
        <StatTile
          label="Recurring (est./mo)"
          value={usd(Math.round(recurringMonthly))}
          sub="weekly ×4.33 + bi-weekly ×2.17"
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label="Labor hours this month"
          value={fmtDuration(laborHoursMonth)}
        />
        <StatTile
          label="Revenue / labor hour"
          value={laborHoursMonth > 0 ? usd(revPerHour) : "—"}
        />
        <StatTile
          label="Cards on file"
          value={`${cardPct}%`}
          sub={`${withCard} of ${customers.length} customers`}
        />
        <StatTile
          label="Past-due total"
          value={usd(aging.fresh + aging.mid + aging.old)}
          tone={aging.old > 0 ? "serious" : aging.mid + aging.fresh > 0 ? "warn" : "default"}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="AR aging (days past due)">
          {aging.fresh + aging.mid + aging.old === 0 ? (
            <Empty>Nothing past due. 🎉</Empty>
          ) : (
            <div>
              {/* sequential severity: one hue family, light → dark */}
              {(
                [
                  ["1–30 days", aging.fresh, "#86b89a"],
                  ["31–60 days", aging.mid, "#3d8f5c"],
                  ["61+ days", aging.old, "#14532d"],
                ] as const
              ).map(([label, val, color]) => (
                <div key={label} className="flex items-center gap-3 py-1.5">
                  <div className="w-36 shrink-0 text-sm">{label}</div>
                  <div className="flex-1 h-4">
                    <div
                      className="h-4 rounded-[4px]"
                      style={{
                        width: `${Math.max(2, (val / agingMax) * 100)}%`,
                        background: color,
                      }}
                    />
                  </div>
                  <div className="w-24 shrink-0 text-right text-sm tabular-nums">
                    {usd(val)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Revenue by service plan (paid)">
          {planRows.length === 0 ? (
            <Empty>No paid invoices yet.</Empty>
          ) : (
            planRows.map(([label, val]) => (
              <BarRow
                key={label}
                label={label}
                value={val}
                max={planMax}
                format={usd}
              />
            ))
          )}
        </Card>

        <Card title="Revenue by customer (top 10, paid)" className="lg:col-span-2">
          {custRows.length === 0 ? (
            <Empty>No paid invoices yet.</Empty>
          ) : (
            custRows.map(([label, val]) => (
              <BarRow
                key={label}
                label={label}
                value={val}
                max={custMax}
                format={usd}
              />
            ))
          )}
        </Card>
      </div>
    </div>
  );
}
