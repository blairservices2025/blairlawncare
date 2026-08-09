"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useDragDrop } from "@/lib/useDragDrop";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { addDays, fmtClock, fmtDate, mondayOf, todayISO } from "@/lib/format";
import type {
  CrewShift,
  Customer,
  Yard,
  Profile,
  ScheduledJob,
  TimeOffRequest,
} from "@/lib/types";

/** Crew colours, matching the reference design's chip palette. */
const CREW_COLORS = [
  "var(--cut)",
  "var(--sky)",
  "var(--soil)",
  "var(--gold)",
  "var(--pine-lighter)",
];
const colorFor = (i: number) => CREW_COLORS[i % CREW_COLORS.length];

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type DragPayload =
  | { kind: "yard"; id: string }
  | { kind: "job"; id: string }
  | { kind: "employee"; id: string }
  | { kind: "shift"; id: string };

interface Defaults {
  jobTime: string;
  service: string;
  shiftStart: string;
  shiftEnd: string;
}

/**
 * What a chip on the board should say: the yard, then its address and whose
 * it is in small print underneath.
 *
 * One client can have several yards, so the yard leads — it's the thing
 * being mowed — matching the order the Yards page uses. Until now the owner
 * was only in a hover tooltip and the address wasn't shown at all, which is
 * no use on a phone or an iPad.
 *
 * Both small lines are dropped when they'd only repeat the title. That is
 * the normal case, not an edge one: a yard created alongside its customer is
 * named after the address when there is one, and "<owner>'s yard" when there
 * isn't. A job booked before yards existed has no yard to name, so the
 * client leads instead and there's nothing left to put below.
 */
function chipLabels(
  yardName: string | null | undefined,
  address: string | null | undefined,
  clientName: string | null | undefined
) {
  const title = yardName || clientName || "Job";
  const lines = [address, clientName].filter(
    (line): line is string => !!line && line !== title
  );
  return { title, lines };
}

export default function SchedulePage() {
  const supabase = createClient();
  const [weekStart, setWeekStart] = useState(mondayOf(todayISO()));
  const [shifts, setShifts] = useState<CrewShift[]>([]);
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [lastWeekJobs, setLastWeekJobs] = useState<ScheduledJob[]>([]);
  const [showGhosts, setShowGhosts] = useState(true);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [yards, setYards] = useState<Yard[]>([]);
  const [timeOff, setTimeOff] = useState<TimeOffRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingJob, setEditingJob] = useState<ScheduledJob | null>(null);
  const [editingShift, setEditingShift] = useState<CrewShift | null>(null);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );
  const weekEnd = days[6];

  // Reused when a drag creates a new record.
  const [defaults, setDefaults] = useState<Defaults>({
    jobTime: "09:00",
    service: "Mow & Edge",
    shiftStart: "08:00",
    shiftEnd: "16:00",
  });

  const load = useCallback(async () => {
    const prevStart = addDays(weekStart, -7);
    const prevEnd = addDays(weekEnd, -7);

    const [s, j, e, c, yd, t, pj] = await Promise.all([
      supabase
        .from("crew_shifts")
        .select("*, profiles(full_name)")
        .gte("shift_date", weekStart)
        .lte("shift_date", weekEnd)
        .order("start_time"),
      supabase
        .from("scheduled_jobs")
        .select(
          "*, customers(name, address, plan), yards(name, address), profiles(full_name)"
        )
        .gte("job_date", weekStart)
        .lte("job_date", weekEnd),
      supabase.from("profiles").select("*").eq("is_active", true).order("full_name"),
      supabase.from("customers").select("*").order("name"),
      supabase
        .from("yards")
        .select("*, customers(name, phone, card_last4)")
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("time_off_requests")
        .select("*, profiles(full_name)")
        .order("created_at", { ascending: false }),
      supabase
        .from("scheduled_jobs")
        .select(
          "*, customers(name, address, plan), yards(name, address), profiles(full_name)"
        )
        .gte("job_date", prevStart)
        .lte("job_date", prevEnd),
    ]);
    setShifts((s.data as CrewShift[]) ?? []);
    setJobs((j.data as ScheduledJob[]) ?? []);
    setEmployees((e.data as Profile[]) ?? []);
    setCustomers((c.data as Customer[]) ?? []);
    setYards((yd.data as Yard[]) ?? []);
    setTimeOff((t.data as TimeOffRequest[]) ?? []);
    setLastWeekJobs((pj.data as ScheduledJob[]) ?? []);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  useEffect(() => {
    load();
  }, [load]);

  // A request sent from the field, or a yard ticked off, shows up here
  // without anyone refreshing.
  useLiveRefresh("schedule-live", {
    time_off_requests: load,
    scheduled_jobs: load,
    crew_shifts: load,
  });

  // Lawn cells are "day:<date>"; crew cells are "cell:<employeeId>:<date>".
  const handleDrop = useCallback(
    async (payload: DragPayload, target: string) => {
      const [zone, a, b] = target.split(":");

      if (zone === "day") {
        if (payload.kind === "yard") {
          const yard = yards.find((y) => y.id === payload.id);
          if (!yard) return;
          await supabase.from("scheduled_jobs").insert({
            yard_id: yard.id,
            customer_id: yard.customer_id,
            job_date: a,
            job_time: defaults.jobTime,
            service: defaults.service,
          });
        } else if (payload.kind === "job") {
          await supabase
            .from("scheduled_jobs")
            .update({ job_date: a })
            .eq("id", payload.id);
        }
      }

      if (zone === "cell") {
        if (payload.kind === "employee") {
          await supabase.from("crew_shifts").insert({
            employee_id: a,
            shift_date: b,
            start_time: defaults.shiftStart,
            end_time: defaults.shiftEnd,
          });
        } else if (payload.kind === "shift") {
          await supabase
            .from("crew_shifts")
            .update({ employee_id: a, shift_date: b })
            .eq("id", payload.id);
        }
      }

      load();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [defaults, load, yards]
  );

  const { startDrag, ghost, overTarget, dragging } =
    useDragDrop<DragPayload>(handleDrop);

  async function deleteJob(id: string) {
    await supabase.from("scheduled_jobs").delete().eq("id", id);
    load();
  }
  async function deleteShift(id: string) {
    await supabase.from("crew_shifts").delete().eq("id", id);
    load();
  }
  async function reviewTimeOff(id: string, status: "approved" | "denied") {
    await supabase.from("time_off_requests").update({ status }).eq("id", id);
    load();
  }

  /**
   * Ghosts: what was on the board the same weekday last week, shown faded
   * so you can see at a glance what got done and repeat it. A customer
   * already scheduled anywhere this week doesn't need a reminder.
   */
  function ghostsFor(dayIndex: number): ScheduledJob[] {
    if (!showGhosts) return [];
    const lastWeekDay = addDays(weekStart, dayIndex - 7);
    return lastWeekJobs.filter(
      (j) => j.job_date === lastWeekDay && !scheduledIds.has(j.customer_id)
    );
  }

  /** Put a ghost back on the board, on the matching day this week. */
  async function repeatJob(j: ScheduledJob, date: string) {
    await supabase.from("scheduled_jobs").insert({
      customer_id: j.customer_id,
      yard_id: j.yard_id,
      employee_id: j.employee_id,
      job_date: date,
      job_time: j.job_time,
      service: j.service,
      recurrence: j.recurrence,
    });
    load();
  }

  // Palette state, as in the reference: grey = already on the board this
  // week, gold = due this week.
  const scheduledIds = new Set(
    jobs.map((j) => j.yard_id).filter(Boolean) as string[]
  );
  function paletteState(y: Yard): "scheduled" | "due" | "idle" {
    if (scheduledIds.has(y.id)) return "scheduled";
    if (y.plan !== "weekly" && y.plan !== "biweekly") return "idle";
    if (!y.last_service_date) return "due";
    const cycle = y.plan === "weekly" ? 7 : 14;
    return addDays(y.last_service_date, cycle) <= weekEnd ? "due" : "idle";
  }

  const pendingTimeOff = timeOff.filter((t) => t.status === "pending");

  if (loading) return <p className="text-ink-soft text-sm">Loading…</p>;

  return (
    <div className="space-y-4">
      {ghost}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="display text-[26px] font-semibold tracking-[-0.2px]">
          Schedule
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

      {/* ---------------- Lawns ---------------- */}
      <Card title="Lawns scheduled">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
          <p className="text-[11.5px] text-ink-soft">
            Drag a customer onto a day to schedule a mow · grey = already on
            this week · gold = due this week · drag a mow to move it · tap a
            mow to edit it
          </p>
          <label className="flex items-center gap-1.5 text-[11.5px] text-ink-soft whitespace-nowrap">
            <input
              type="checkbox"
              checked={showGhosts}
              onChange={(e) => setShowGhosts(e.target.checked)}
              className="accent-[var(--cut)]"
            />
            Show last week
          </label>
        </div>

        <div className="flex gap-2 flex-wrap mb-3">
          {yards.length === 0 && (
            <span className="text-[13px] text-ink-soft">
              No yards yet — add some on the Yards page.
            </span>
          )}
          {yards.map((c) => {
            const state = paletteState(c);
            const style =
              state === "scheduled"
                ? "bg-[var(--status-upcoming-bg)] text-ink-soft"
                : state === "due"
                  ? "bg-gold text-pine"
                  : "bg-bone-dim text-pine";
            const { title, lines } = chipLabels(
              c.name,
              c.address,
              c.customers?.name
            );
            return (
              <button
                key={c.id}
                onPointerDown={(e) =>
                  startDrag({ kind: "yard", id: c.id }, title, e)
                }
                className={`rounded-[20px] px-3.5 py-1.5 text-left leading-tight cursor-grab active:cursor-grabbing select-none touch-none ${style}`}
                title={`${c.customers?.name ?? ""} · ${
                  state === "scheduled"
                    ? "already on this week's board"
                    : state === "due"
                      ? "due this week"
                      : c.plan.replace("_", "-")
                }`}
              >
                <span className="block text-[12.5px] font-semibold">{title}</span>
                {/* Dimmed rather than recoloured, so it reads on all three
                    chip backgrounds without a variant for each. */}
                {lines.map((line) => (
                  <span
                    key={line}
                    className="block text-[10px] font-medium opacity-70"
                  >
                    {line}
                  </span>
                ))}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2">
          {days.map((d, di) => {
            const dayJobs = jobs
              .filter((j) => j.job_date === d)
              .sort((a, b) => (a.job_time ?? "").localeCompare(b.job_time ?? ""));
            const isOver = overTarget === `day:${d}`;
            return (
              <div
                key={d}
                data-drop={`day:${d}`}
                className={`rounded-lg bg-bone-dim p-2 min-h-[120px] border-2 transition-colors ${
                  isOver
                    ? "border-cut bg-bone"
                    : d === todayISO()
                      ? "border-cut"
                      : "border-transparent"
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

                {dayJobs.length === 0 && !dragging && (
                  <div className="text-[10.5px] text-ink-soft text-center pt-3">
                    Drop a customer here
                  </div>
                )}

                {dayJobs.map((j) => {
                  const { title, lines } = chipLabels(
                    j.yards?.name,
                    j.yards?.address ?? j.customers?.address,
                    j.customers?.name
                  );
                  return (
                  <div
                    key={j.id}
                    onPointerDown={(e) =>
                      startDrag({ kind: "job", id: j.id }, title, e)
                    }
                    onClick={() => setEditingJob(j)}
                    className="relative bg-paper border border-line rounded-md px-2 py-1.5 mb-1.5 text-[11px] cursor-grab active:cursor-grabbing select-none touch-none"
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteJob(j.id);
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                      className="absolute top-1 right-1.5 text-[10px] text-ink-soft hover:text-[var(--status-overdue-fg)] leading-none"
                      aria-label="Remove"
                    >
                      ✕
                    </button>
                    {j.job_time && (
                      <div className="font-mono text-[10px] text-ink-soft">
                        {fmtClock(j.job_time)}
                      </div>
                    )}
                    <div className="font-semibold text-[11.5px] pr-3 leading-tight">
                      {title}
                    </div>
                    {lines.map((line) => (
                      <div
                        key={line}
                        className="text-[10px] text-ink-soft leading-tight"
                      >
                        {line}
                      </div>
                    ))}
                    <div className="text-ink-soft mt-0.5">
                      {j.service ?? "Mow"}
                      {j.profiles?.full_name ? ` · ${j.profiles.full_name}` : ""}
                    </div>
                  </div>
                  );
                })}

                {ghostsFor(di).map((g) => {
                  const { title, lines } = chipLabels(
                    g.yards?.name,
                    g.yards?.address ?? g.customers?.address,
                    g.customers?.name
                  );
                  return (
                    <button
                      key={`ghost-${g.id}`}
                      onClick={() => repeatJob(g, d)}
                      title={`${title} was done this day last week — tap to schedule it again`}
                      className="w-full text-left bg-transparent border border-dashed border-line rounded-md px-2 py-1.5 mb-1.5 text-[11px] opacity-70 hover:opacity-100 hover:border-cut transition-opacity"
                    >
                      <div className="text-[9.5px] uppercase tracking-[0.5px] text-ink-soft">
                        Last week
                      </div>
                      <div className="font-semibold text-[11.5px] text-ink-soft leading-tight">
                        {title}
                      </div>
                      {lines.map((line) => (
                        <div
                          key={line}
                          className="text-[10px] text-ink-soft leading-tight"
                        >
                          {line}
                        </div>
                      ))}
                      <div className="text-ink-soft mt-0.5">
                        {g.service ?? "Mow"} · tap to repeat
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </Card>

      {/* ---------------- Crew shifts ---------------- */}
      <Card title="Crew shifts">
        <p className="text-[11.5px] text-ink-soft mb-3">
          Pick someone from the menu below and add their shift — or drag their
          name chip onto a day in their row. Drag a shift to move it; tap one
          to change its hours.
        </p>

        <ShiftAdder
          employees={employees}
          days={days}
          defaults={defaults}
          onAdded={load}
        />

        <div className="flex gap-2 flex-wrap my-3">
          {employees.map((e, i) => (
            <button
              key={e.id}
              onPointerDown={(ev) =>
                startDrag({ kind: "employee", id: e.id }, e.full_name, ev)
              }
              className="rounded-[20px] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--white)] cursor-grab active:cursor-grabbing select-none touch-none"
              style={{ background: colorFor(i) }}
            >
              {e.full_name}
            </button>
          ))}
        </div>

        {employees.length === 0 ? (
          <Empty>No crew members yet.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <div
              className="grid gap-px bg-line border border-line rounded-lg overflow-hidden min-w-[720px]"
              style={{ gridTemplateColumns: "110px repeat(7, 1fr)" }}
            >
              <div className="bg-bone-dim p-2" />
              {days.map((d, i) => (
                <div
                  key={d}
                  className="bg-bone-dim py-2 px-1 text-center text-[10.5px] font-bold uppercase tracking-[0.4px] text-ink-soft"
                >
                  {DOW[i]}
                  <span className="block font-normal normal-case text-[10px] mt-px">
                    {Number(d.slice(8, 10))}
                  </span>
                </div>
              ))}

              {employees.map((e, i) => (
                <div key={e.id} className="contents">
                  <div className="bg-bone-dim flex items-center gap-2 px-2 py-2 text-xs font-semibold">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: colorFor(i) }}
                    />
                    <span className="truncate">{e.full_name}</span>
                  </div>
                  {days.map((d) => {
                    const cell = `cell:${e.id}:${d}`;
                    const isOver = overTarget === cell;
                    return (
                      <div
                        key={d}
                        data-drop={cell}
                        className={`bg-paper p-1.5 min-h-[52px] ${
                          isOver
                            ? "bg-bone-dim shadow-[inset_0_0_0_2px_var(--cut)]"
                            : ""
                        }`}
                      >
                        {shifts
                          .filter((s) => s.employee_id === e.id && s.shift_date === d)
                          .map((s) => (
                            <div
                              key={s.id}
                              onPointerDown={(ev) =>
                                startDrag({ kind: "shift", id: s.id }, e.full_name, ev)
                              }
                              onClick={() => setEditingShift(s)}
                              className="rounded-[5px] px-1.5 py-1 mb-1 text-[10px] font-mono text-[var(--white)] flex items-center justify-between gap-1 cursor-grab active:cursor-grabbing select-none touch-none"
                              style={{ background: colorFor(i) }}
                            >
                              <span className="truncate">
                                {fmtClock(s.start_time)}–{fmtClock(s.end_time)}
                              </span>
                              <button
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  deleteShift(s.id);
                                }}
                                onPointerDown={(ev) => ev.stopPropagation()}
                                className="opacity-75 hover:opacity-100 shrink-0"
                                aria-label="Remove shift"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* ---------------- Schedule a lawn ---------------- */}
      <LawnForm
        yards={yards}
        employees={employees}
        defaults={defaults}
        setDefaults={setDefaults}
        onAdded={load}
      />

      {/* ---------------- Time off ---------------- */}
      <Card
        title={`Time off requests${pendingTimeOff.length ? ` (${pendingTimeOff.length} pending)` : ""}`}
      >
        {timeOff.length === 0 ? (
          <Empty>No requests.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {timeOff.slice(0, 10).map((t) => (
              <li key={t.id} className="py-2 flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <div className="text-[13.5px] font-semibold">
                    {t.profiles?.full_name}
                  </div>
                  <div className="text-xs text-ink-soft">
                    {t.start_date === t.end_date
                      ? fmtDate(t.start_date)
                      : `${fmtDate(t.start_date)} → ${fmtDate(t.end_date)}`}
                    {" · "}
                    {t.start_time && t.end_time
                      ? `${fmtClock(t.start_time)} – ${fmtClock(t.end_time)}`
                      : "All day"}
                    {t.reason ? ` · ${t.reason}` : ""}
                  </div>
                </div>
                {t.status === "pending" ? (
                  <div className="flex gap-1.5">
                    <Button onClick={() => reviewTimeOff(t.id, "approved")} className="!py-1 !px-2.5 text-xs">
                      Approve
                    </Button>
                    <Button variant="danger" onClick={() => reviewTimeOff(t.id, "denied")} className="!py-1 !px-2.5 text-xs">
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

      <EditJobModal
        job={editingJob}
        employees={employees}
        onClose={() => setEditingJob(null)}
        onSaved={load}
      />
      <EditShiftModal
        shift={editingShift}
        onClose={() => setEditingShift(null)}
        onSaved={load}
      />
    </div>
  );
}

/* ---------------- Dropdown-driven shift adder ---------------- */

function ShiftAdder({
  employees,
  days,
  defaults,
  onAdded,
}: {
  employees: Profile[];
  days: string[];
  defaults: Defaults;
  onAdded: () => void;
}) {
  const supabase = createClient();
  const [employeeId, setEmployeeId] = useState("");
  const [date, setDate] = useState(days[0]);
  const [start, setStart] = useState(defaults.shiftStart);
  const [end, setEnd] = useState(defaults.shiftEnd);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!days.includes(date)) setDate(days[0]);
  }, [days, date]);

  async function add() {
    if (!employeeId) return setError("Pick a crew member.");
    if (end <= start) return setError("The end time has to be after the start.");
    setError(null);
    const { error: dbErr } = await supabase.from("crew_shifts").insert({
      employee_id: employeeId,
      shift_date: date,
      start_time: start,
      end_time: end,
    });
    if (dbErr) return setError(dbErr.message);
    onAdded();
  }

  return (
    <div className="bg-bone-dim rounded-lg p-3">
      <div className="grid sm:grid-cols-5 gap-2 items-end">
        <div className="sm:col-span-2">
          <Label>Crew member</Label>
          <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">Select…</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.full_name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Day</Label>
          <Select value={date} onChange={(e) => setDate(e.target.value)}>
            {days.map((d, i) => (
              <option key={d} value={d}>
                {DOW[i]} {Number(d.slice(8, 10))}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Start</Label>
            <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <Label>End</Label>
            <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <Button onClick={add}>Add shift</Button>
      </div>
      {error && (
        <p className="text-sm text-[var(--status-overdue-fg)] mt-2">{error}</p>
      )}
    </div>
  );
}

/* ---------------- Schedule a lawn (full form) ---------------- */

function LawnForm({
  yards,
  employees,
  defaults,
  setDefaults,
  onAdded,
}: {
  yards: Yard[];
  employees: Profile[];
  defaults: Defaults;
  setDefaults: (d: Defaults) => void;
  onAdded: () => void;
}) {
  const supabase = createClient();
  const [form, setForm] = useState({
    yard_id: "",
    service: "Mow & Edge",
    job_date: todayISO(),
    job_time: "09:00",
    employee_id: "",
    recurrence: "one_time",
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function add() {
    if (!form.yard_id) return setError("Pick a yard.");
    const yard = yards.find((y) => y.id === form.yard_id);
    if (!yard) return setError("Pick a yard.");
    setError(null);
    const { error: dbErr } = await supabase.from("scheduled_jobs").insert({
      yard_id: yard.id,
      customer_id: yard.customer_id,
      service: form.service || null,
      job_date: form.job_date,
      job_time: form.job_time || null,
      employee_id: form.employee_id || null,
      recurrence: form.recurrence,
    });
    if (dbErr) return setError(dbErr.message);
    // Reuse these when a customer chip is dragged onto a day.
    setDefaults({ ...defaults, jobTime: form.job_time, service: form.service });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    onAdded();
  }

  return (
    <Card title="Schedule a lawn">
      <div className="grid sm:grid-cols-3 gap-3">
        <div>
          <Label>Yard</Label>
          <Select
            value={form.yard_id}
            onChange={(e) => setForm({ ...form, yard_id: e.target.value })}
          >
            <option value="">Select…</option>
            {yards.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
                {y.customers?.name ? ` — ${y.customers.name}` : ""}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Service</Label>
          <Input
            placeholder="Mow & Edge"
            value={form.service}
            onChange={(e) => setForm({ ...form, service: e.target.value })}
          />
        </div>
        <div>
          <Label>Assign to</Label>
          <Select
            value={form.employee_id}
            onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
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
          <Label>Date</Label>
          <Input
            type="date"
            value={form.job_date}
            onChange={(e) => setForm({ ...form, job_date: e.target.value })}
          />
        </div>
        <div>
          <Label>Time</Label>
          <Input
            type="time"
            value={form.job_time}
            onChange={(e) => setForm({ ...form, job_time: e.target.value })}
          />
        </div>
        <div>
          <Label>Repeats</Label>
          <Select
            value={form.recurrence}
            onChange={(e) => setForm({ ...form, recurrence: e.target.value })}
          >
            <option value="one_time">One-time</option>
            <option value="weekly">Weekly</option>
            <option value="biweekly">Bi-weekly</option>
            <option value="custom">Custom</option>
          </Select>
        </div>
      </div>
      {error && <p className="text-sm text-[var(--status-overdue-fg)] mt-3">{error}</p>}
      <div className="flex items-center gap-3 mt-3">
        <Button onClick={add}>Schedule it</Button>
        {saved && <span className="text-sm text-cut">Added ✔</span>}
      </div>
    </Card>
  );
}

/* ---------------- Edit modals ---------------- */

function EditJobModal({
  job,
  employees,
  onClose,
  onSaved,
}: {
  job: ScheduledJob | null;
  employees: Profile[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = createClient();
  const [form, setForm] = useState({
    service: "",
    job_time: "",
    employee_id: "",
    recurrence: "one_time",
    status: "scheduled",
  });

  useEffect(() => {
    if (!job) return;
    setForm({
      service: job.service ?? "",
      job_time: job.job_time?.slice(0, 5) ?? "",
      employee_id: job.employee_id ?? "",
      recurrence: job.recurrence,
      status: job.status,
    });
  }, [job]);

  async function save() {
    if (!job) return;
    await supabase
      .from("scheduled_jobs")
      .update({
        service: form.service || null,
        job_time: form.job_time || null,
        employee_id: form.employee_id || null,
        recurrence: form.recurrence,
        status: form.status,
      })
      .eq("id", job.id);
    onClose();
    onSaved();
  }

  return (
    <Modal
      open={!!job}
      onClose={onClose}
      // Titled by the yard, so it matches the chip that was tapped to get here.
      title={chipLabels(job?.yards?.name, null, job?.customers?.name).title}
    >
      <div className="space-y-3">
        <div>
          <Label>Service</Label>
          <Input
            value={form.service}
            onChange={(e) => setForm({ ...form, service: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Time</Label>
            <Input
              type="time"
              value={form.job_time}
              onChange={(e) => setForm({ ...form, job_time: e.target.value })}
            />
          </div>
          <div>
            <Label>Status</Label>
            <Select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option value="scheduled">scheduled</option>
              <option value="in_progress">in progress</option>
              <option value="done">done</option>
              <option value="skipped">skipped</option>
            </Select>
          </div>
        </div>
        <div>
          <Label>Assign to</Label>
          <Select
            value={form.employee_id}
            onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
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
          <Label>Repeats</Label>
          <Select
            value={form.recurrence}
            onChange={(e) => setForm({ ...form, recurrence: e.target.value })}
          >
            <option value="one_time">One-time</option>
            <option value="weekly">Weekly</option>
            <option value="biweekly">Bi-weekly</option>
            <option value="custom">Custom</option>
          </Select>
        </div>
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

function EditShiftModal({
  shift,
  onClose,
  onSaved,
}: {
  shift: CrewShift | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = createClient();
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("16:00");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!shift) return;
    setStart(shift.start_time.slice(0, 5));
    setEnd(shift.end_time.slice(0, 5));
    setError(null);
  }, [shift]);

  async function save() {
    if (!shift) return;
    if (end <= start) return setError("The end time has to be after the start.");
    await supabase
      .from("crew_shifts")
      .update({ start_time: start, end_time: end })
      .eq("id", shift.id);
    onClose();
    onSaved();
  }

  return (
    <Modal
      open={!!shift}
      onClose={onClose}
      title={shift?.profiles?.full_name ?? "Shift"}
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Start</Label>
            <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <Label>End</Label>
            <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
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
