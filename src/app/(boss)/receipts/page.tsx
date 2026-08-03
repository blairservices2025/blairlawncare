"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, Empty } from "@/components/ui";
import ReceiptCapture from "@/components/ReceiptCapture";
import { fmtDate, usd } from "@/lib/format";
import type { Receipt } from "@/lib/types";

type ReceiptWithUrl = Receipt & { url?: string };

export default function ReceiptsPage() {
  const supabase = createClient();
  const [receipts, setReceipts] = useState<ReceiptWithUrl[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
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

  if (loading) return <p className="text-ink-soft text-sm">Loading…</p>;

  return (
    <div className="space-y-4">
      <h1 className="display text-[26px] font-semibold tracking-[-0.2px]">Receipts</h1>

      <ReceiptCapture uploaderId={meId} onSaved={load} />

      <Card title={`Receipt log${receipts.length ? ` (${receipts.length})` : ""}`}>
        {receipts.length === 0 ? (
          <Empty>
            No receipts captured yet. Crew members upload them from the
            employee view.
          </Empty>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {receipts.map((r) => (
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
