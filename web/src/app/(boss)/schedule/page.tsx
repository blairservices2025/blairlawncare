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
} from "@/components/ui";
import {
  addDays,
  dayLabel,
  fmtClock,
  fmtDate,
  mondayOf,
  todayISO,
} from "@/lib/format";
import type {
  CrewShift,
  Customer,
  Profile,
  ScheduledJob,
  TimeOffRequest,
} from "@/lib/types";

export default function SchedulePage() {
  const supabase = createClient();
  const [weekStart, setWeekStart] = useState(mondayOf(todayISO()));
  const [shifts, setShifts] = useState<CrewShift[]>([]);
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [timeOff, setTimeOff] = useState<TimeOffRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const [shiftForm, setShiftForm] = useState<{
    open: boolean;
    date: string;
    employee_id: string;
    start: string;
    end: string;
  }>({ open: false, date: "", employee_id: "", start: "08:00", end: "16:00" });

  const [jobForm, setJobForm] = useState<{
    open: boolean;
    date: string;
    customer_id: string;
    employee_id: string;
    recurrence: string;
  }>({ open: false, date: "", customer_id: "", employee_id: "", recurrence: "one_time" });

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekEnd = days[6];

  const load = useCallback(async () => {
    const [s, j, e, c, t] = await Promise.all([
      supabase
        .from("crew_shifts")
        .select("*, profiles(full_name)")
        .gte("shift_date", weekStart)
        .lte("shift_date", weekEnd)
        .order("start_time"),
      supabase
        .from("scheduled_jobs")
        .select("*, customers(name, address, plan), profiles(full_name)")
        .gte("job_date", weekStart)
        .lte("job_date", weekEnd),
      supabase.from("profiles").select("*").eq("is_active", true).order("full_name"),
      supabase.from("customers").select("*").order("name"),
      supabase
        .from("time_off_requests")
        .select("*, profiles(full_name)")
        .order("created_at", { ascending: false }),
    ]);
    setShifts((s.data as CrewShift[]) ?? []);
    setJobs((j.data as ScheduledJob[]) ?? []);
    setEmployees((e.data as Profile[]) ?? []);
    setCustomers((c.data as Customer[]) ?? []);
    setTimeOff((t.data as TimeOffRequest[]) ?? []);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  useEffect(() => {
    load();
  }, [load]);

  async function addShift() {
    if (!shiftForm.employee_id) return;
    await supabase.from("crew_shifts").insert({
      employee_id: shiftForm.employee_id,
      shift_date: shiftForm.date,
      start_time: shiftForm.start,
      end_time: shiftForm.end,
    });
    setShiftForm({ ...shiftForm, open: false });
    load();
  }

  async function addJob() {
    if (!jobForm.customer_id) return;
    await supabase.from("scheduled_jobs").insert({
      customer_id: jobForm.customer_id,
      employee_id: jobForm.employee_id || null,
      job_date: jobForm.date,
      recurrence: jobForm.recurrence,
    });
    setJobForm({ ...jobForm, open: false });
    load();
  }

  async function deleteShift(id: string) {
    await supabase.from("crew_shifts").delete().eq("id", id);
    load();
  }

  async function deleteJob(id: string) {
    await supabase.from("scheduled_jobs").delete().eq("id", id);
    load();
  }

  async function moveItem(kind: "shift" | "job", id: string, newDate: string) {
    if (kind === "shift") {
      await supabase.from("crew_shifts").update({ shift_date: newDate }).eq("id", id);
    } else {
      await supabase.from("scheduled_jobs").update({ job_date: newDate }).eq("id", id);
    }
    load();
  }

  async function reviewTimeOff(id: string, status: "approved" | "denied") {
    await supabase.from("time_off_requests").update({ status }).eq("id", id);
    load();
  }

  // Recurrence-aware ghosts: customers on a plan who are DUE this week but
  // have no job scheduled this week.
  const scheduledCustomerIds = new Set(jobs.map((j) => j.customer_id));
  const ghosts = customers
    .filter((c) => c.plan === "weekly" || c.plan === "biweekly")
    .filter((c) => !scheduledCustomerIds.has(c.id))
    .map((c) => {
      if (!c.last_service_date) return { c, due: true };
      const cycle = c.plan === "weekly" ? 7 : 14;
      const nextDue = addDays(c.last_service_date, cycle);
      return { c, due: nextDue <= weekEnd };
    });

  function onDrop(e: React.DragEvent, date: string) {
    e.preventDefault();
    const data = e.dataTransfer.getData("text/plain");
    const [kind, id] = data.split(":");
    if (kind === "shift" || kind === "job") {
      moveItem(kind, id, date);
    }
  }

  if (loading) return <p className="text-muted text-sm">Loading…</p>;

  const pendingTimeOff = timeOff.filter((t) => t.status === "pending");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold">Schedule</h1>
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
      <p className="text-xs text-muted">
        Drag a shift or job card onto another day to move it.
      </p>

      <div className="overflow-x-auto pb-2">
        <div className="grid grid-cols-7 gap-2 min-w-[980px]">
          {days.map((d) => (
            <div
              key={d}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDrop(e, d)}
              className={`rounded-xl border p-2 min-h-64 flex flex-col gap-1.5 ${
                d === todayISO()
                  ? "border-accent bg-accent-soft/50"
                  : "border-line bg-surface"
              }`}
            >
              <div className="text-xs font-semibold text-center pb-1 border-b border-line">
                {dayLabel(d)}
              </div>

              {shifts
                .filter((s) => s.shift_date === d)
                .map((s) => (
                  <div
                    key={s.id}
                    draggable
                    onDragStart={(e) =>
                      e.dataTransfer.setData("text/plain", `shift:${s.id}`)
                    }
                    className="rounded-lg bg-sidebar text-white px-2 py-1.5 text-xs cursor-grab group"
                  >
                    <div className="font-medium flex justify-between">
                      {s.profiles?.full_name}
                      <button
                        onClick={() => deleteShift(s.id)}
                        className="opacity-0 group-hover:opacity-70 hover:!opacity-100"
                        aria-label="Delete shift"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="opacity-75">
                      {fmtClock(s.start_time)}–{fmtClock(s.end_time)}
                    </div>
                  </div>
                ))}

              {jobs
                .filter((j) => j.job_date === d)
                .map((j) => (
                  <div
                    key={j.id}
                    draggable
                    onDragStart={(e) =>
                      e.dataTransfer.setData("text/plain", `job:${j.id}`)
                    }
                    className={`rounded-lg px-2 py-1.5 text-xs cursor-grab group border ${
                      j.status === "done"
                        ? "bg-accent-soft border-accent/40"
                        : "bg-surface border-line"
                    }`}
                  >
                    <div className="font-medium flex justify-between gap-1">
                      <span className="truncate">🌿 {j.customers?.name}</span>
                      <button
                        onClick={() => deleteJob(j.id)}
                        className="opacity-0 group-hover:opacity-70 hover:!opacity-100"
                        aria-label="Delete job"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="text-muted truncate">
                      {j.profiles?.full_name ?? "unassigned"}
                      {j.recurrence !== "one_time" ? ` · ${j.recurrence}` : ""}
                    </div>
                  </div>
                ))}

              <div className="mt-auto flex gap-1 pt-1">
                <button
                  onClick={() =>
                    setShiftForm({ ...shiftForm, open: true, date: d })
                  }
                  className="flex-1 text-[11px] text-muted hover:text-accent border border-dashed border-line rounded-md py-1"
                >
                  + shift
                </button>
                <button
                  onClick={() => setJobForm({ ...jobForm, open: true, date: d })}
                  className="flex-1 text-[11px] text-muted hover:text-accent border border-dashed border-line rounded-md py-1"
                >
                  + job
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Recurring customers not on this week's board">
          {ghosts.length === 0 ? (
            <Empty>Every recurring customer is scheduled. 👍</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {ghosts.map(({ c, due }) => (
                <li key={c.id} className="py-2 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">{c.name}</div>
                    <div className="text-xs text-muted">
                      {c.plan.replace("_", "-")} · last service{" "}
                      {fmtDate(c.last_service_date)}
                    </div>
                  </div>
                  {due ? (
                    <Badge tone="warn">Due this week</Badge>
                  ) : (
                    <Badge tone="neutral">Not due yet</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={`Time-off requests${pendingTimeOff.length ? ` (${pendingTimeOff.length} pending)` : ""}`}>
          {timeOff.length === 0 ? (
            <Empty>No requests.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {timeOff.slice(0, 10).map((t) => (
                <li key={t.id} className="py-2 flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <div className="text-sm font-medium">
                      {t.profiles?.full_name}
                    </div>
                    <div className="text-xs text-muted">
                      {fmtDate(t.start_date)} → {fmtDate(t.end_date)}
                      {t.reason ? ` · ${t.reason}` : ""}
                    </div>
                  </div>
                  {t.status === "pending" ? (
                    <div className="flex gap-1.5">
                      <Button
                        onClick={() => reviewTimeOff(t.id, "approved")}
                        className="!py-1 !px-2 text-xs"
                      >
                        Approve
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() => reviewTimeOff(t.id, "denied")}
                        className="!py-1 !px-2 text-xs"
                      >
                        Deny
                      </Button>
                    </div>
                  ) : (
                    <Badge tone={t.status === "approved" ? "good" : "serious"}>
                      {t.status}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Add shift modal */}
      <Modal
        open={shiftForm.open}
        onClose={() => setShiftForm({ ...shiftForm, open: false })}
        title={`Add shift — ${shiftForm.date ? dayLabel(shiftForm.date) : ""}`}
      >
        <div className="space-y-3">
          <div>
            <Label>Crew member</Label>
            <Select
              value={shiftForm.employee_id}
              onChange={(e) =>
                setShiftForm({ ...shiftForm, employee_id: e.target.value })
              }
            >
              <option value="">Select…</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start</Label>
              <Input
                type="time"
                value={shiftForm.start}
                onChange={(e) =>
                  setShiftForm({ ...shiftForm, start: e.target.value })
                }
              />
            </div>
            <div>
              <Label>End</Label>
              <Input
                type="time"
                value={shiftForm.end}
                onChange={(e) =>
                  setShiftForm({ ...shiftForm, end: e.target.value })
                }
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setShiftForm({ ...shiftForm, open: false })}
            >
              Cancel
            </Button>
            <Button onClick={addShift}>Add shift</Button>
          </div>
        </div>
      </Modal>

      {/* Add job modal */}
      <Modal
        open={jobForm.open}
        onClose={() => setJobForm({ ...jobForm, open: false })}
        title={`Add job — ${jobForm.date ? dayLabel(jobForm.date) : ""}`}
      >
        <div className="space-y-3">
          <div>
            <Label>Customer</Label>
            <Select
              value={jobForm.customer_id}
              onChange={(e) =>
                setJobForm({ ...jobForm, customer_id: e.target.value })
              }
            >
              <option value="">Select…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Assign to</Label>
            <Select
              value={jobForm.employee_id}
              onChange={(e) =>
                setJobForm({ ...jobForm, employee_id: e.target.value })
              }
            >
              <option value="">Unassigned</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Recurrence</Label>
            <Select
              value={jobForm.recurrence}
              onChange={(e) =>
                setJobForm({ ...jobForm, recurrence: e.target.value })
              }
            >
              <option value="one_time">One-time</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Bi-weekly</option>
              <option value="custom">Custom</option>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setJobForm({ ...jobForm, open: false })}
            >
              Cancel
            </Button>
            <Button onClick={addJob}>Add job</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
