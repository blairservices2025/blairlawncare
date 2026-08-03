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
  Td,
  Th,
} from "@/components/ui";
import { fmtDate, fmtDuration, fmtTime, hoursBetween } from "@/lib/format";
import type { JobTimerEntry, Profile, TimeClockEntry } from "@/lib/types";

/** "2026-08-03T13:45:00Z" -> the "2026-08-03T13:45" a datetime-local wants. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

export default function TimeLogsPage() {
  const supabase = createClient();
  const [clock, setClock] = useState<TimeClockEntry[]>([]);
  const [timers, setTimers] = useState<JobTimerEntry[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editClock, setEditClock] = useState<TimeClockEntry | null>(null);
  const [editTimer, setEditTimer] = useState<JobTimerEntry | null>(null);
  const [addingClock, setAddingClock] = useState(false);

  const load = useCallback(async () => {
    const [c, t, e] = await Promise.all([
      supabase
        .from("time_clock_entries")
        .select("*, profiles(full_name)")
        .order("clock_in", { ascending: false })
        .limit(200),
      supabase
        .from("job_timer_entries")
        .select("*, profiles(full_name)")
        .order("started_at", { ascending: false })
        .limit(200),
      supabase.from("profiles").select("*").order("full_name"),
    ]);
    setClock((c.data as TimeClockEntry[]) ?? []);
    setTimers((t.data as JobTimerEntry[]) ?? []);
    setEmployees((e.data as Profile[]) ?? []);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function deleteClock(e: TimeClockEntry) {
    if (
      !confirm(
        `Delete ${e.profiles?.full_name ?? "this"} entry from ${fmtDate(e.clock_in)}? This can't be undone.`
      )
    )
      return;
    await supabase.from("time_clock_entries").delete().eq("id", e.id);
    load();
  }

  async function deleteTimer(t: JobTimerEntry) {
    if (!confirm(`Delete the "${t.job_name}" timer entry? This can't be undone.`))
      return;
    await supabase.from("job_timer_entries").delete().eq("id", t.id);
    load();
  }

  if (loading) return <p className="text-ink-soft text-sm">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="display text-[26px] font-semibold tracking-[-0.2px]">
          Time Logs
        </h1>
        <Button onClick={() => setAddingClock(true)}>+ Add an entry</Button>
      </div>
      <p className="text-[13px] text-ink-soft">
        Tap <strong>Edit</strong> on any row to correct a clock in or out — for
        a forgotten punch, or a wrong time. Hours recalculate automatically.
      </p>

      <Card title="Clock in / out">
        {clock.length === 0 ? (
          <Empty>No clock entries yet.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Crew member</Th>
                  <Th>Date</Th>
                  <Th>In</Th>
                  <Th>Out</Th>
                  <Th>Hours</Th>
                  <Th>{""}</Th>
                </tr>
              </thead>
              <tbody>
                {clock.map((e) => (
                  <tr key={e.id}>
                    <Td className="font-semibold">{e.profiles?.full_name}</Td>
                    <Td>{fmtDate(e.clock_in)}</Td>
                    <Td className="font-mono">{fmtTime(e.clock_in)}</Td>
                    <Td className="font-mono">
                      {e.clock_out ? (
                        fmtTime(e.clock_out)
                      ) : (
                        <Badge tone="good">● on the clock</Badge>
                      )}
                    </Td>
                    <Td className="font-mono">
                      {fmtDuration(hoursBetween(e.clock_in, e.clock_out))}
                    </Td>
                    <Td>
                      <div className="flex gap-1.5 justify-end">
                        <Button
                          variant="secondary"
                          onClick={() => setEditClock(e)}
                          className="!py-1 !px-2.5 text-xs"
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => deleteClock(e)}
                          className="!py-1 !px-2 text-xs"
                        >
                          Delete
                        </Button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Job timers">
        {timers.length === 0 ? (
          <Empty>No job timer entries yet.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Crew member</Th>
                  <Th>Job</Th>
                  <Th>Date</Th>
                  <Th>Duration</Th>
                  <Th>{""}</Th>
                </tr>
              </thead>
              <tbody>
                {timers.map((t) => (
                  <tr key={t.id}>
                    <Td className="font-semibold">{t.profiles?.full_name}</Td>
                    <Td>{t.job_name}</Td>
                    <Td>{fmtDate(t.started_at)}</Td>
                    <Td className="font-mono">
                      {t.ended_at ? (
                        fmtDuration(hoursBetween(t.started_at, t.ended_at))
                      ) : (
                        <Badge tone="warn">running</Badge>
                      )}
                    </Td>
                    <Td>
                      <div className="flex gap-1.5 justify-end">
                        <Button
                          variant="secondary"
                          onClick={() => setEditTimer(t)}
                          className="!py-1 !px-2.5 text-xs"
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => deleteTimer(t)}
                          className="!py-1 !px-2 text-xs"
                        >
                          Delete
                        </Button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <EditClockModal
        entry={editClock}
        onClose={() => setEditClock(null)}
        onSaved={load}
      />
      <EditTimerModal
        entry={editTimer}
        onClose={() => setEditTimer(null)}
        onSaved={load}
      />
      <AddClockModal
        open={addingClock}
        employees={employees}
        onClose={() => setAddingClock(false)}
        onSaved={load}
      />
    </div>
  );
}

/* ---------------- Edit a clock entry ---------------- */

function EditClockModal({
  entry,
  onClose,
  onSaved,
}: {
  entry: TimeClockEntry | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = createClient();
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!entry) return;
    setClockIn(toLocalInput(entry.clock_in));
    setClockOut(toLocalInput(entry.clock_out));
    setError(null);
  }, [entry]);

  const preview =
    clockIn && clockOut && new Date(clockOut) > new Date(clockIn)
      ? fmtDuration(
          (new Date(clockOut).getTime() - new Date(clockIn).getTime()) / 3600000
        )
      : null;

  async function save() {
    if (!entry) return;
    if (!clockIn) return setError("A clock-in time is required.");
    if (clockOut && new Date(clockOut) <= new Date(clockIn))
      return setError("The clock out has to be after the clock in.");

    const { error: dbErr } = await supabase
      .from("time_clock_entries")
      .update({
        clock_in: fromLocalInput(clockIn),
        clock_out: fromLocalInput(clockOut),
      })
      .eq("id", entry.id);
    if (dbErr) return setError(dbErr.message);
    onClose();
    onSaved();
  }

  return (
    <Modal
      open={!!entry}
      onClose={onClose}
      title={`Edit — ${entry?.profiles?.full_name ?? ""}`}
    >
      <div className="space-y-3">
        <div>
          <Label>Clocked in</Label>
          <Input
            type="datetime-local"
            value={clockIn}
            onChange={(e) => setClockIn(e.target.value)}
          />
        </div>
        <div>
          <Label>Clocked out</Label>
          <Input
            type="datetime-local"
            value={clockOut}
            onChange={(e) => setClockOut(e.target.value)}
          />
          <p className="text-xs text-ink-soft mt-1">
            Leave this empty to put them back on the clock.
          </p>
        </div>
        <div className="bg-bone-dim rounded-lg px-3 py-2 text-[13px]">
          Total:{" "}
          <strong className="font-mono">
            {preview ?? (clockOut ? "—" : "still running")}
          </strong>
        </div>
        {error && <p className="text-sm text-[var(--status-overdue-fg)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- Edit a job timer entry ---------------- */

function EditTimerModal({
  entry,
  onClose,
  onSaved,
}: {
  entry: JobTimerEntry | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = createClient();
  const [jobName, setJobName] = useState("");
  const [startedAt, setStartedAt] = useState("");
  const [endedAt, setEndedAt] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!entry) return;
    setJobName(entry.job_name);
    setStartedAt(toLocalInput(entry.started_at));
    setEndedAt(toLocalInput(entry.ended_at));
    setError(null);
  }, [entry]);

  const preview =
    startedAt && endedAt && new Date(endedAt) > new Date(startedAt)
      ? fmtDuration(
          (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 3600000
        )
      : null;

  async function save() {
    if (!entry) return;
    if (!jobName.trim()) return setError("A job name is required.");
    if (!startedAt) return setError("A start time is required.");
    if (endedAt && new Date(endedAt) <= new Date(startedAt))
      return setError("The end has to be after the start.");

    const { error: dbErr } = await supabase
      .from("job_timer_entries")
      .update({
        job_name: jobName.trim(),
        started_at: fromLocalInput(startedAt),
        ended_at: fromLocalInput(endedAt),
      })
      .eq("id", entry.id);
    if (dbErr) return setError(dbErr.message);
    onClose();
    onSaved();
  }

  return (
    <Modal
      open={!!entry}
      onClose={onClose}
      title={`Edit — ${entry?.profiles?.full_name ?? ""}`}
    >
      <div className="space-y-3">
        <div>
          <Label>Job</Label>
          <Input value={jobName} onChange={(e) => setJobName(e.target.value)} />
        </div>
        <div>
          <Label>Started</Label>
          <Input
            type="datetime-local"
            value={startedAt}
            onChange={(e) => setStartedAt(e.target.value)}
          />
        </div>
        <div>
          <Label>Ended</Label>
          <Input
            type="datetime-local"
            value={endedAt}
            onChange={(e) => setEndedAt(e.target.value)}
          />
        </div>
        <div className="bg-bone-dim rounded-lg px-3 py-2 text-[13px]">
          Total:{" "}
          <strong className="font-mono">
            {preview ?? (endedAt ? "—" : "still running")}
          </strong>
        </div>
        {error && <p className="text-sm text-[var(--status-overdue-fg)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- Add a missing entry by hand ---------------- */

function AddClockModal({
  open,
  employees,
  onClose,
  onSaved,
}: {
  open: boolean;
  employees: Profile[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = createClient();
  const [employeeId, setEmployeeId] = useState("");
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!employeeId) return setError("Pick a crew member.");
    if (!clockIn) return setError("A clock-in time is required.");
    if (clockOut && new Date(clockOut) <= new Date(clockIn))
      return setError("The clock out has to be after the clock in.");

    const { error: dbErr } = await supabase.from("time_clock_entries").insert({
      employee_id: employeeId,
      clock_in: fromLocalInput(clockIn),
      clock_out: fromLocalInput(clockOut),
    });
    if (dbErr) return setError(dbErr.message);
    setEmployeeId("");
    setClockIn("");
    setClockOut("");
    setError(null);
    onClose();
    onSaved();
  }

  return (
    <Modal open={open} onClose={onClose} title="Add a time entry">
      <div className="space-y-3">
        <p className="text-[13px] text-ink-soft">
          For a shift someone forgot to clock in for.
        </p>
        <div>
          <Label>Crew member</Label>
          <Select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
          >
            <option value="">Select…</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.full_name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Clocked in</Label>
          <Input
            type="datetime-local"
            value={clockIn}
            onChange={(e) => setClockIn(e.target.value)}
          />
        </div>
        <div>
          <Label>Clocked out</Label>
          <Input
            type="datetime-local"
            value={clockOut}
            onChange={(e) => setClockOut(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-[var(--status-overdue-fg)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Add entry</Button>
        </div>
      </div>
    </Modal>
  );
}
