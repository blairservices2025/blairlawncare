"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge, Button, Card } from "@/components/ui";
import { fmtDate, fmtTime } from "@/lib/format";

interface Status {
  configured: boolean;
  environment: string;
  webhookConfigured: boolean;
  serviceKeyConfigured: boolean;
}

interface LogRow {
  id: number;
  source: string;
  event_type: string | null;
  customers_synced: number;
  invoices_synced: number;
  error: string | null;
  created_at: string;
}

export default function SquarePanel() {
  const supabase = createClient();
  const [status, setStatus] = useState<Status | null>(null);
  const [log, setLog] = useState<LogRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState("");

  const loadLog = useCallback(async () => {
    const { data } = await supabase
      .from("square_sync_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(8);
    setLog((data as LogRow[]) ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetch("/api/square/sync")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));
    setWebhookUrl(`${window.location.origin}/api/square/webhook`);
    loadLog();
  }, [loadLog]);

  async function syncNow() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/square/sync", { method: "POST" });
      const body = await res.json();
      setResult(
        res.ok
          ? `Pulled ${body.customers} customer${body.customers === 1 ? "" : "s"} and ${body.invoices} invoice${body.invoices === 1 ? "" : "s"} from Square.`
          : `Failed: ${body.error}`
      );
    } catch (e) {
      setResult(`Failed: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
    setBusy(false);
    loadLog();
  }

  const ready =
    status?.configured && status?.webhookConfigured && status?.serviceKeyConfigured;

  return (
    <Card
      title="Square"
      action={
        status ? (
          <Badge tone={ready ? "good" : status.configured ? "warn" : "neutral"}>
            {ready
              ? `Connected · ${status.environment}`
              : status.configured
                ? "Partly set up"
                : "Not connected"}
          </Badge>
        ) : null
      }
    >
      <p className="text-[13px] text-ink-soft mb-3">
        When Square is connected, customers and invoices you create there
        appear here automatically. Existing customers are matched on email or
        phone rather than duplicated.
      </p>

      {status && !ready && (
        <div className="bg-bone-dim rounded-lg p-3 mb-3">
          <p className="text-[13px] font-semibold mb-2">
            Still needed in Vercel → Settings → Environment Variables:
          </p>
          <ul className="text-[13px] space-y-1 font-mono">
            {!status.configured && <li>• SQUARE_ACCESS_TOKEN</li>}
            {!status.webhookConfigured && (
              <li>• SQUARE_WEBHOOK_SIGNATURE_KEY</li>
            )}
            {!status.serviceKeyConfigured && (
              <li>• SUPABASE_SERVICE_ROLE_KEY</li>
            )}
          </ul>
          <p className="text-xs text-ink-soft mt-2">
            Add them, then redeploy — environment variables only take effect
            on a new deployment.
          </p>
        </div>
      )}

      <div className="mb-3">
        <div className="text-xs font-medium text-ink-soft mb-1">
          Your webhook address — paste this into Square
        </div>
        <div className="flex gap-2">
          <code className="flex-1 bg-bone-dim rounded-lg px-3 py-2 text-[12px] break-all">
            {webhookUrl || "…"}
          </code>
          <Button
            variant="secondary"
            onClick={() => navigator.clipboard?.writeText(webhookUrl)}
          >
            Copy
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={syncNow} disabled={busy || !status?.configured}>
          {busy ? "Syncing…" : "⟳ Sync now"}
        </Button>
        <span className="text-[13px] text-ink-soft">
          Pulls everything across. Useful the first time, or to catch up.
        </span>
      </div>
      {result && (
        <p
          className={`text-sm mt-2 ${result.startsWith("Failed") ? "text-[var(--status-overdue-fg)]" : "text-cut"}`}
        >
          {result}
        </p>
      )}

      {log.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <div className="text-xs font-semibold text-ink-soft uppercase tracking-[0.6px] mb-2">
            Recent activity
          </div>
          <ul className="divide-y divide-line">
            {log.map((l) => (
              <li key={l.id} className="py-1.5 flex justify-between gap-2 text-[13px]">
                <span>
                  {l.source === "webhook" ? "From Square" : "Manual sync"}
                  {l.event_type ? ` · ${l.event_type}` : ""}
                  {l.error ? (
                    <span className="text-[var(--status-overdue-fg)]">
                      {" "}
                      · {l.error}
                    </span>
                  ) : (
                    <span className="text-ink-soft">
                      {" "}
                      · {l.customers_synced} customers, {l.invoices_synced}{" "}
                      invoices
                    </span>
                  )}
                </span>
                <span className="text-ink-soft whitespace-nowrap">
                  {fmtDate(l.created_at)} {fmtTime(l.created_at)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
