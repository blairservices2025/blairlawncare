"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import { Button, Card } from "@/components/ui";
import { todayISO } from "@/lib/format";

const TABLES: { table: string; sheet: string; select: string }[] = [
  { table: "customers", sheet: "Customers", select: "*" },
  { table: "invoices", sheet: "Invoices", select: "*, customers(name)" },
  { table: "crew_shifts", sheet: "Shifts", select: "*, profiles(full_name)" },
  {
    table: "time_clock_entries",
    sheet: "Timesheets",
    select: "*, profiles(full_name)",
  },
  {
    table: "job_timer_entries",
    sheet: "Timer Logs",
    select: "*, profiles(full_name)",
  },
  {
    table: "time_off_requests",
    sheet: "Time Off",
    select: "*, profiles(full_name)",
  },
  { table: "todos", sheet: "To-dos", select: "*" },
  { table: "receipts", sheet: "Receipts", select: "*, profiles(full_name)" },
  { table: "scheduled_jobs", sheet: "Jobs", select: "*, customers(name)" },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function flatten(rows: any[]): any[] {
  return rows.map((r) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(r)) {
      if (v && typeof v === "object" && !Array.isArray(v)) {
        for (const [k2, v2] of Object.entries(v)) out[`${k}_${k2}`] = v2;
      } else {
        out[k] = v;
      }
    }
    return out;
  });
}

export default function SettingsPage() {
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function exportAll() {
    setBusy(true);
    setStatus("Gathering data…");
    try {
      const wb = XLSX.utils.book_new();
      for (const t of TABLES) {
        const { data, error } = await supabase.from(t.table).select(t.select);
        if (error) throw new Error(`${t.table}: ${error.message}`);
        const ws = XLSX.utils.json_to_sheet(flatten(data ?? []));
        XLSX.utils.book_append_sheet(wb, ws, t.sheet);
      }
      XLSX.writeFile(wb, `blair-lawn-care-backup-${todayISO()}.xlsx`);
      setStatus("Export downloaded ✔");
    } catch (e) {
      setStatus(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <h1 className="display text-[26px] font-semibold tracking-[-0.2px]">Settings</h1>

      <Card title="Backup / export">
        <p className="text-sm text-ink-soft mb-3">
          Download every table as a single Excel workbook — one sheet each for
          invoices, customers, shifts, timesheets, timer logs, time off,
          to-dos, receipts, and jobs. Your data also lives safely in Supabase
          (with automatic backups on their side); this export is for your own
          records or your bookkeeper.
        </p>
        <Button onClick={exportAll} disabled={busy}>
          {busy ? "Exporting…" : "⬇ Export all data (.xlsx)"}
        </Button>
        {status && <p className="text-sm text-ink-soft mt-2">{status}</p>}
      </Card>

      <Card title="Accounts">
        <p className="text-sm text-ink-soft">
          Crew logins are managed in the Supabase dashboard (Authentication →
          Users). The first account ever created is the boss; everyone added
          after is an employee. To promote someone, edit their row in the{" "}
          <code className="bg-bone-dim px-1 rounded">profiles</code> table.
        </p>
      </Card>

      <Card title="What's next (from the build plan)">
        <ul className="text-sm text-ink-soft list-disc pl-5 space-y-1">
          <li>Phase 2 — QuickBooks accounting sync (invoices & customers)</li>
          <li>Phase 3 — QuickBooks Payments: real "charge card on file"</li>
          <li>Phase 5 — Payroll API (apply early; approval takes weeks)</li>
        </ul>
      </Card>
    </div>
  );
}
