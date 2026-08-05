"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, Empty, Label, Select, StatTile } from "@/components/ui";
import ReceiptCapture from "@/components/ReceiptCapture";
import { fmtDate, usd } from "@/lib/format";

import type { Receipt } from "@/lib/types";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

type ReceiptWithUrl = Receipt & { url?: string };

export default function ReceiptsPage() {
  const supabase = createClient();
  const [receipts, setReceipts] = useState<ReceiptWithUrl[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setMeId(user?.id ?? null);

    const { data } = await supabase
      .from("receipts")
      .select("*, profiles(full_name)")
      .order("created_at", { ascending: false });
    const rows = (data as ReceiptWithUrl[]) ?? [];
    // Signed URLs (bucket is private)
    if (rows.length > 0) {
      const { data: signed } = await supabase.storage
        .from("receipts")
        .createSignedUrls(
          rows.map((r) => r.file_path),
          3600
        );
      signed?.forEach((s, idx) => {
        if (s.signedUrl) rows[idx].url = s.signedUrl;
      });
    }
    setReceipts(rows);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function remove(r: Receipt) {
    if (!confirm("Delete this receipt?")) return;
    await supabase.storage.from("receipts").remove([r.file_path]);
    await supabase.from("receipts").delete().eq("id", r.id);
    load();
  }

  // Years that actually have receipts, newest first, so the picker only
  // offers what exists.
  const years = Array.from(
    new Set(receipts.map((r) => new Date(r.created_at).getFullYear()))
  ).sort((a, b) => b - a);

  const forYear = receipts.filter(
    (r) => new Date(r.created_at).getFullYear() === year
  );
  const yearTotal = forYear.reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
  const missingAmount = forYear.filter((r) => r.amount == null).length;

  // Spend per month, for the shape of the year.
  const byMonth = Array.from({ length: 12 }, (_, m) =>
    forYear
      .filter((r) => new Date(r.created_at).getMonth() === m)
      .reduce((sum, r) => sum + Number(r.amount ?? 0), 0)
  );
  const monthMax = Math.max(...byMonth, 1);
  const thisMonth =
    year === new Date().getFullYear() ? byMonth[new Date().getMonth()] : null;

  if (loading) return <p className="text-ink-soft text-sm">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <h1 className="display text-[26px] font-semibold tracking-[-0.2px]">
          Receipts
        </h1>
        {years.length > 0 && (
          <div>
            <Label>Year</Label>
            <Select
              value={String(year)}
              onChange={(e) => setYear(Number(e.target.value))}
              className="!w-auto"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label={`Total spent in ${year}`}
          value={usd(yearTotal)}
          sub={
            missingAmount > 0
              ? `${missingAmount} receipt${missingAmount === 1 ? "" : "s"} with no amount entered`
              : `${forYear.length} receipt${forYear.length === 1 ? "" : "s"}`
          }
          tone={missingAmount > 0 ? "warn" : "default"}
          accent={0}
        />
        <StatTile
          label="This month"
          value={thisMonth != null ? usd(thisMonth) : "—"}
          accent={1}
        />
        <StatTile
          label="Receipts logged"
          value={String(forYear.length)}
          accent={2}
        />
        <StatTile
          label="Average receipt"
          value={
            forYear.length - missingAmount > 0
              ? usd(yearTotal / (forYear.length - missingAmount))
              : "—"
          }
          accent={3}
        />
      </div>

      {yearTotal > 0 && (
        <Card title={`Spending by month — ${year}`}>
          <div className="flex items-end gap-1.5 h-28">
            {byMonth.map((amount, m) => (
              <div key={m} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full rounded-t-[4px] bg-cut"
                  style={{
                    height: `${Math.max(amount > 0 ? 4 : 0, (amount / monthMax) * 100)}%`,
                  }}
                  title={`${MONTHS[m]}: ${usd(amount)}`}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-1.5 mt-1.5">
            {MONTHS.map((label, m) => (
              <div
                key={m}
                className="flex-1 text-center text-[10px] text-ink-soft"
              >
                {label.charAt(0)}
              </div>
            ))}
          </div>
        </Card>
      )}

      <ReceiptCapture uploaderId={meId} onSaved={load} />

      <Card title={`Receipt log — ${year}`}>
        {forYear.length === 0 ? (
          <Empty>
            No receipts in {year}. Crew members upload them from the employee
            view, and you can add one above.
          </Empty>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {forYear.map((r) => (
              <figure
                key={r.id}
                className="border border-line rounded-xl overflow-hidden bg-paper group relative"
              >
                {r.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <a href={r.url} target="_blank" rel="noreferrer">
                    <img
                      src={r.url}
                      alt={r.note ?? "Receipt"}
                      className="w-full h-36 object-cover"
                    />
                  </a>
                ) : (
                  <div className="w-full h-36 flex items-center justify-center text-ink-soft text-xs">
                    File unavailable
                  </div>
                )}
                <figcaption className="p-2 text-xs">
                  <div className="font-medium truncate">
                    {r.note || "Receipt"}
                    {r.amount != null ? ` · ${usd(Number(r.amount))}` : ""}
                  </div>
                  <div className="text-ink-soft">
                    {r.profiles?.full_name} · {fmtDate(r.created_at)}
                  </div>
                </figcaption>
                <button
                  onClick={() => remove(r)}
                  className="absolute top-1.5 right-1.5 bg-black/50 text-[var(--white)] rounded-full w-6 h-6 text-xs opacity-0 group-hover:opacity-100"
                  aria-label="Delete receipt"
                >
                  ✕
                </button>
              </figure>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
