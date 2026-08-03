"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge, Card, Empty, Select } from "@/components/ui";
import { addDays, dayLabel, todayISO } from "@/lib/format";
import type { ScheduledJob } from "@/lib/types";

const STATUS_TONE: Record<string, "good" | "warn" | "neutral" | "serious"> = {
  done: "good",
  in_progress: "warn",
  scheduled: "neutral",
  skipped: "serious",
};

export default function JobsPage() {
  const supabase = createClient();
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [loading, setLoading] = useState(true);
  const today = todayISO();
  const weekEnd = addDays(today, 6);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("scheduled_jobs")
      .select("*, customers(name, address, plan), profiles(full_name)")
      .gte("job_date", today)
      .lte("job_date", weekEnd)
      .order("job_date");
    setJobs((data as ScheduledJob[]) ?? []);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function setStatus(id: string, status: string) {
    await supabase.from("scheduled_jobs").update({ status }).eq("id", id);
    load();
  }

  const todays = jobs.filter((j) => j.job_date === today);
  const ahead = jobs.filter((j) => j.job_date !== today);
  const byDay = ahead.reduce<Record<string, ScheduledJob[]>>((acc, j) => {
    (acc[j.job_date] ??= []).push(j);
    return acc;
  }, {});

  if (loading) return <p className="text-muted text-sm">Loading…</p>;

  const JobRow = ({ j }: { j: ScheduledJob }) => (
    <li className="py-2 flex items-center justify-between gap-3 flex-wrap">
      <div className="min-w-0">
        <div className="text-sm font-medium">{j.customers?.name}</div>
        <div className="text-xs text-muted truncate">
          {j.customers?.address ?? ""}
          {j.profiles?.full_name ? ` · ${j.profiles.full_name}` : " · unassigned"}
          {j.note ? ` · ${j.note}` : ""}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge tone={STATUS_TONE[j.status]}>{j.status.replace("_", " ")}</Badge>
        <Select
          value={j.status}
          onChange={(e) => setStatus(j.id, e.target.value)}
          className="!w-auto text-xs"
        >
          <option value="scheduled">scheduled</option>
          <option value="in_progress">in progress</option>
          <option value="done">done</option>
          <option value="skipped">skipped</option>
        </Select>
      </div>
    </li>
  );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Jobs</h1>

      <Card title={`Today — ${dayLabel(today)}`}>
        {todays.length === 0 ? (
          <Empty>No jobs today. Schedule some on the Schedule page.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {todays.map((j) => (
              <JobRow key={j.id} j={j} />
            ))}
          </ul>
        )}
      </Card>

      <Card title="Week ahead">
        {ahead.length === 0 ? (
          <Empty>Nothing scheduled for the rest of the week.</Empty>
        ) : (
          Object.entries(byDay).map(([date, list]) => (
            <div key={date} className="mb-3">
              <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">
                {dayLabel(date)}
              </div>
              <ul className="divide-y divide-line">
                {list.map((j) => (
                  <JobRow key={j.id} j={j} />
                ))}
              </ul>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
