"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Empty } from "@/components/ui";
import { fmtDate, usd } from "@/lib/format";

interface BillableJob {
  id: string;
  job_date: string;
  service: string | null;
  price: number | null;
  customer_id: string;
  customers: {
    name: string;
    square_customer_id: string | null;
    card_last4: string | null;
  } | null;
  yards: { name: string } | null;
}

/** Square's card-on-file rate, so the cost of billing this way is visible. */
const FEE = (cents: number) => Math.round(cents * 0.035 + 15);

/**
 * End of day: everything finished today that hasn't been billed. Tick the
 * ones to charge and send them in one go — Square charges the saved card
 * and emails the invoice and receipt together.
 */
export default function BillJobsPanel() {
  const [jobs, setJobs] = useState<BillableJob[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/square/bill-jobs");
    const body = await res.json().catch(() => ({}));
    const list = (body.jobs as BillableJob[]) ?? [];
    setJobs(list);
    // Pre-tick the ones that can actually be billed.
    setChosen(
      new Set(
        list
          .filter((j) => j.customers?.square_customer_id && Number(j.price) > 0)
          .map((j) => j.id)
      )
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function toggle(id: string) {
    setChosen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selected = jobs.filter((j) => chosen.has(j.id));
  const total = selected.reduce((s, j) => s + Number(j.price ?? 0), 0);
  const fees = selected.reduce(
    (s, j) => s + FEE(Math.round(Number(j.price ?? 0) * 100)) / 100,
    0
  );

  async function bill() {
    if (selected.length === 0) return;
    const withCard = selected.filter((j) => j.customers?.card_last4).length;
    if (
      !confirm(
        `Bill ${selected.length} job${selected.length === 1 ? "" : "s"} for ${usd(total)}?\n\n` +
          `${withCard} will be charged to a saved card straight away; the rest get an invoice to pay themselves.\n\n` +
          `This takes real money and emails your customers.`
      )
    )
      return;

    setBusy(true);
    setResult(null);
    setProblems([]);

    const res = await fetch("/api/square/bill-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobIds: [...chosen],
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);

    if (!res.ok) {
      setResult(`Failed: ${body.error ?? "Unknown error"}`);
      return;
    }
    setResult(
      `Billed ${body.billed} job${body.billed === 1 ? "" : "s"}.` +
        (body.skipped?.length ? ` ${body.skipped.length} skipped.` : "")
    );
    setProblems([...(body.problems ?? []), ...(body.skipped ?? [])]);
    load();
  }

  if (loading) {
    return (
      <Card title="Ready to bill">
        <p className="text-sm text-ink-soft">Loading…</p>
      </Card>
    );
  }

  return (
    <Card
      title="Ready to bill"
      action={
        jobs.length > 0 ? (
          <button
            onClick={() =>
              setChosen(
                chosen.size === jobs.length
                  ? new Set()
                  : new Set(jobs.map((j) => j.id))
              )
            }
            className="text-[12.5px] text-cut font-semibold"
          >
            {chosen.size === jobs.length ? "Clear all" : "Select all"}
          </button>
        ) : null
      }
    >
      <p className="text-[12px] text-ink-soft mb-3">
        Finished jobs that haven&apos;t been charged. Customers with a card on
        file are charged when you send; everyone else gets an invoice to pay.
      </p>

      {jobs.length === 0 ? (
        <Empty>Nothing waiting to be billed. 🎉</Empty>
      ) : (
        <>
          <ul className="divide-y divide-line">
            {jobs.map((j) => {
              const linked = Boolean(j.customers?.square_customer_id);
              const priced = Number(j.price) > 0;
              const billable = linked && priced;
              return (
                <li key={j.id} className="py-2.5 flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={chosen.has(j.id)}
                    onChange={() => toggle(j.id)}
                    disabled={!billable}
                    className="mt-1 accent-[var(--cut)]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-semibold">
                      {j.yards?.name ?? j.customers?.name ?? "Unknown"}
                    </div>
                    {j.yards?.name && j.customers?.name && (
                      <div className="text-xs text-ink-soft">
                        {j.customers.name}
                      </div>
                    )}
                    <div className="text-xs text-ink-soft">
                      {fmtDate(j.job_date)} · {j.service ?? "Mow"}
                      {j.customers?.card_last4
                        ? ` · card •••• ${j.customers.card_last4}`
                        : " · no card on file"}
                    </div>
                    {!billable && (
                      <div className="text-xs text-[var(--status-overdue-fg)] mt-0.5">
                        {!linked
                          ? "Not linked to Square — sync from Settings."
                          : "No price set on this job."}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[13.5px] font-mono">
                      {priced ? usd(Number(j.price)) : "—"}
                    </div>
                    {j.customers?.card_last4 ? (
                      <Badge tone="good">auto-charge</Badge>
                    ) : (
                      <Badge tone="neutral">send invoice</Badge>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="border-t border-line mt-3 pt-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="text-[13px]">
              <div>
                <strong>{selected.length}</strong> selected ·{" "}
                <strong className="font-mono">{usd(total)}</strong>
              </div>
              <div className="text-xs text-ink-soft">
                Square&apos;s fee on card-on-file charges is about{" "}
                {usd(fees)} of that (3.5% + 15¢ each).
              </div>
            </div>
            <Button onClick={bill} disabled={busy || selected.length === 0}>
              {busy ? "Billing…" : `💳 Bill ${selected.length} job${selected.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </>
      )}

      {result && (
        <p
          className={`text-sm mt-3 ${result.startsWith("Failed") ? "text-[var(--status-overdue-fg)]" : "text-cut"}`}
        >
          {result}
        </p>
      )}
      {problems.length > 0 && (
        <ul className="mt-2 text-xs text-ink-soft space-y-1">
          {problems.map((p, i) => (
            <li key={i}>• {p}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}
