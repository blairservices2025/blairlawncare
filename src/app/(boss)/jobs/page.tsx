"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  Badge,
  Button,
  Card,
  Empty,
  Label,
  Modal,
  Select,
  StatTile,
} from "@/components/ui";
import { addDays, fmtClock, fmtDate, mondayOf, todayISO } from "@/lib/format";
import type { Profile, ScheduledJob } from "@/lib/types";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const STATUS_TONE: Record<string, "good" | "warn" | "neutral" | "serious"> = {
  done: "good",
  in_progress: "warn",
  scheduled: "neutral",
  skipped: "serious",
};

/** Left edge colour of a job card, so status reads at a glance. */
const STATUS_EDGE: Record<string, string> = {
  done: "var(--cut)",
  in_progress: "var(--gold)",
  scheduled: "var(--sky)",
  skipped: "var(--status-overdue-fg)",
};

export default function JobsPage() {
  const supabase = createClient();
  const [weekStart, setWeekStart] = useState(mondayOf(todayISO()));
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [crewFilter, setCrewFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<ScheduledJob | null>(null);
  const [loading, setLoading] = useState(true);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );
  const weekEnd = days[6];

  const load = useCallback(async () => {
    const [j, e] = await Promise.all([
      supabase
        .from("scheduled_jobs")
        .select("*, customers(name, address, plan), profiles(full_name)")
        .gte("job_date", weekStart)
        .lte("job_date", weekEnd),
      supabase.from("profiles").select("*").eq("is_active", true).order("full_name"),
    ]);
    setJobs((j.data as ScheduledJob[]) ?? []);
    setEmployees((e.data as Profile[]) ?? []);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  useEffect(() => {
    load();
  }, [load]);

  // A yard ticked off in the field shows here without a refresh.
  useEffect(() => {
    const channel = supabase
      .channel("jobs-calendar")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "scheduled_jobs" },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  async function setStatus(id: string, status: string) {
    await supabase.from("scheduled_jobs").update({ status }).eq("id", id);
    setSelected(null);
    load();
  }

  const visible = jobs.filter(
    (j) =>
      (!crewFilter ||
        (crewFilter === "unassigned"
          ? !j.employee_id
          : j.employee_id === crewFilter)) &&
      (!statusFilter || j.status === statusFilter)
  );

  const doneCount = visible.filter((j) => j.status === "done").length;
  const todayCount = visible.filter((j) => j.job_date === todayISO()).length;

  if (loading) return <p className="text-ink-soft text-sm">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="display text-[26px] font-semibold tracking-[-0.2px]">
          Jobs
        </h1>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setWeekStart(addDays(weekStart, -7))}>
            ← Prev
          </Button>
          <Button variant="secondary" onClick={() => setWeekStart(mondayOf(todayISO()))}>
            This week
          </Button>
          <Button variant="secondary" onClick={() => setWeekStart(addDays(weekStart, 7))}>
            Next →
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Jobs this week" value={String(visible.length)} accent={0} />
        <StatTile label="Today" value={String(todayCount)} accent={1} />
        <StatTile
          label="Done"
          value={`${doneCount}/${visible.length}`}
          tone={doneCount === visible.length && visible.length > 0 ? "good" : "default"}
          accent={2}
        />
        <StatTile
          label="Still to do"
          value={String(visible.length - doneCount)}
          accent={3}
        />
      </div>

      <Card
        title={`Week of ${fmtDate(weekStart)}`}
        action={
          <Link href="/schedule" className="text-[12.5px] text-cut font-semibold">
            Edit in Schedule →
          </Link>
        }
      >
        <div className="flex gap-2 flex-wrap mb-3">
          <div>
            <Label>Crew member</Label>
            <Select
              value={crewFilter}
              onChange={(e) => setCrewFilter(e.target.value)}
              className="!w-auto"
            >
              <option value="">Everyone</option>
              <option value="unassigned">Unassigned</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="!w-auto"
            >
              <option value="">Any</option>
              <option value="scheduled">Scheduled</option>
              <option value="in_progress">In progress</option>
              <option value="done">Done</option>
              <option value="skipped">Skipped</option>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2">
          {days.map((d, di) => {
            const dayJobs = visible
              .filter((j) => j.job_date === d)
              .sort((a, b) => (a.job_time ?? "").localeCompare(b.job_time ?? ""));
            const isToday = d === todayISO();
            return (
              <div
                key={d}
                className={`rounded-lg bg-bone-dim p-2 min-h-[140px] border-2 ${
                  isToday ? "border-cut" : "border-transparent"
                }`}
              >
                <div className="text-center mb-2">
                  <div className="text-[10.5px] font-bold uppercase tracking-[0.4px] text-ink-soft">
                    {DOW[di]}
                  </div>
                  <div className="display text-base font-semibold">
                    {Number(d.slice(8, 10))}
                  </div>
                </div>

                {dayJobs.length === 0 ? (
                  <div className="text-[10.5px] text-ink-soft text-center pt-3">
                    —
                  </div>
                ) : (
                  dayJobs.map((j) => (
                    <button
                      key={j.id}
                      onClick={() => setSelected(j)}
                      className="relative w-full text-left bg-paper border border-line rounded-md pl-2.5 pr-2 py-1.5 mb-1.5 text-[11px] hover:border-cut transition-colors overflow-hidden"
                    >
                      <span
                        className="absolute left-0 top-0 bottom-0 w-1"
                        style={{ background: STATUS_EDGE[j.status] }}
                      />
                      {j.job_time && (
                        <div className="font-mono text-[10px] text-ink-soft">
                          {fmtClock(j.job_time)}
                        </div>
                      )}
                      <div
                        className={`font-semibold text-[11.5px] ${
                          j.status === "done" ? "line-through text-ink-soft" : ""
                        }`}
                      >
                        {j.customers?.name}
                      </div>
                      <div className="text-ink-soft truncate">
                        {j.service ?? "Mow"}
                        {j.profiles?.full_name
                          ? ` · ${j.profiles.full_name}`
                          : " · unassigned"}
                      </div>
                    </button>
                  ))
                )}
              </div>
            );
          })}
        </div>

        <div className="flex gap-4 flex-wrap mt-3 pt-3 border-t border-line text-[11px] text-ink-soft">
          {Object.entries(STATUS_EDGE).map(([status, color]) => (
            <span key={status} className="flex items-center gap-1.5">
              <span
                className="w-3 h-3 rounded-[3px]"
                style={{ background: color }}
              />
              {status.replace("_", " ")}
            </span>
          ))}
        </div>
      </Card>

      {visible.length === 0 && (
        <Card>
          <Empty>
            Nothing scheduled this week
            {crewFilter || statusFilter ? " for that filter" : ""}. Add jobs on
            the Schedule tab.
          </Empty>
        </Card>
      )}

      {/* Tap a job to change its status */}
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.customers?.name ?? "Job"}
      >
        {selected && (
          <div className="space-y-3">
            <div className="text-[13px] space-y-1">
              <div>
                <span className="text-ink-soft">When: </span>
                {fmtDate(selected.job_date)}
                {selected.job_time ? ` at ${fmtClock(selected.job_time)}` : ""}
              </div>
              <div>
                <span className="text-ink-soft">Service: </span>
                {selected.service ?? "Mow"}
              </div>
              <div>
                <span className="text-ink-soft">Crew: </span>
                {selected.profiles?.full_name ?? "Unassigned"}
              </div>
              {selected.customers?.address && (
                <div>
                  <span className="text-ink-soft">Address: </span>
                  {selected.customers.address}
                </div>
              )}
              <div className="flex items-center gap-2 pt-1">
                <span className="text-ink-soft">Status: </span>
                <Badge tone={STATUS_TONE[selected.status]}>
                  {selected.status.replace("_", " ")}
                </Badge>
              </div>
            </div>

            <div>
              <Label>Mark it as</Label>
              <div className="grid grid-cols-2 gap-2">
                {["scheduled", "in_progress", "done", "skipped"].map((st) => (
                  <Button
                    key={st}
                    variant={selected.status === st ? "primary" : "secondary"}
                    onClick={() => setStatus(selected.id, st)}
                  >
                    {st.replace("_", " ")}
                  </Button>
                ))}
              </div>
            </div>

            <Link
              href="/schedule"
              className="block text-center text-[12.5px] text-cut font-semibold pt-1"
            >
              Reschedule or reassign in the Schedule tab →
            </Link>
          </div>
        )}
      </Modal>
    </div>
  );
}
