"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import PinPad from "@/components/PinPad";
import ReceiptCapture from "@/components/ReceiptCapture";
import {
  Badge,
  Button,
  Card,
  Empty,
  Input,
  Label,
  Textarea,
} from "@/components/ui";
import {
  addDays,
  dayLabel,
  fmtClock,
  fmtDate,
  fmtDuration,
  fmtTime,
  hoursBetween,
  mondayOf,
  todayISO,
} from "@/lib/format";
import type {
  CrewShift,
  JobBoardRow,
  JobTimerEntry,
  Profile,
  ScheduledJob,
  TimeClockEntry,
  TimeOffRequest,
  Todo,
} from "@/lib/types";

function useTicker(active: boolean) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
}

function elapsed(fromIso: string) {
  const s = Math.floor((Date.now() - new Date(fromIso).getTime()) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export default function EmployeeClient() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [me, setMe] = useState<Profile | null>(null);
  const [viewer, setViewer] = useState<Profile | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [bossGate, setBossGate] = useState(false);
  const [pinSetup, setPinSetup] = useState(false);
  const [pinStatus, setPinStatus] = useState<string | null>(null);
  const [hasPin, setHasPin] = useState(false);
  const [openClock, setOpenClock] = useState<TimeClockEntry | null>(null);
  const [openTimer, setOpenTimer] = useState<JobTimerEntry | null>(null);
  const [recentTimers, setRecentTimers] = useState<JobTimerEntry[]>([]);
  const [shifts, setShifts] = useState<CrewShift[]>([]);
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [todayJobs, setTodayJobs] = useState<JobBoardRow[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [timeOff, setTimeOff] = useState<TimeOffRequest[]>([]);
  const [jobName, setJobName] = useState("");
  const [toForm, setToForm] = useState({
    date: "",
    startTime: "",
    endTime: "",
    reason: "",
    allDay: true,
  });
  const [loading, setLoading] = useState(true);

  useTicker(!!openClock || !!openTimer);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // The boss can open a crew member's view via ?as=<id> (after entering
    // that person's code). Everyone else only ever sees their own.
    const { data: signedIn } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    setViewer(signedIn as Profile);

    const asId = searchParams.get("as");
    const viewId =
      asId && (signedIn as Profile | null)?.role === "boss" ? asId : user.id;
    setViewingId(viewId);

    const weekStart = mondayOf(todayISO());
    const weekEnd = addDays(weekStart, 6);
    const [p, oc, ot, rt, sh, jb, td, to, yl] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", viewId).single(),
      supabase
        .from("time_clock_entries")
        .select("*")
        .eq("employee_id", viewId)
        .is("clock_out", null)
        .order("clock_in", { ascending: false })
        .limit(1),
      supabase
        .from("job_timer_entries")
        .select("*")
        .eq("employee_id", viewId)
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1),
      supabase
        .from("job_timer_entries")
        .select("*")
        .eq("employee_id", viewId)
        .not("ended_at", "is", null)
        .order("started_at", { ascending: false })
        .limit(5),
      supabase
        .from("crew_shifts")
        .select("*")
        .eq("employee_id", viewId)
        .gte("shift_date", weekStart)
        .lte("shift_date", weekEnd)
        .order("shift_date"),
      supabase
        .from("scheduled_jobs")
        .select("*, customers(name, address, plan)")
        .eq("employee_id", viewId)
        .gte("job_date", weekStart)
        .lte("job_date", weekEnd)
        .order("job_date"),
      supabase
        .from("todos")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(15),
      supabase
        .from("time_off_requests")
        .select("*")
        .eq("employee_id", viewId)
        .order("created_at", { ascending: false })
        .limit(5),
      // The whole crew's route for today, names and addresses included.
      supabase
        .from("job_board")
        .select("*")
        .eq("job_date", todayISO())
        .order("job_time", { nullsFirst: false }),
    ]);
    setMe(p.data as Profile);
    setOpenClock((oc.data?.[0] as TimeClockEntry) ?? null);
    setOpenTimer((ot.data?.[0] as JobTimerEntry) ?? null);
    setRecentTimers((rt.data as JobTimerEntry[]) ?? []);
    setShifts((sh.data as CrewShift[]) ?? []);
    setJobs((jb.data as ScheduledJob[]) ?? []);
    setTodos((td.data as Todo[]) ?? []);
    setTimeOff((to.data as TimeOffRequest[]) ?? []);
    setTodayJobs((yl.data as JobBoardRow[]) ?? []);

    // Whether a code is set — asked for rather than read off the profile,
    // since the hash itself is not exposed to the browser.
    const { data: pinSet } = await supabase.rpc("employee_has_pin", {
      employee: viewId,
    });
    setHasPin(Boolean(pinSet));

    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // A yard ticked off on someone else's phone shows up here without
  // anyone refreshing.
  useEffect(() => {
    const channel = supabase
      .channel("crew-job-board")
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

  async function clockIn() {
    if (!me) return;
    await supabase
      .from("time_clock_entries")
      .insert({ employee_id: me.id });
    load();
  }

  async function clockOut() {
    if (!openClock) return;
    await supabase
      .from("time_clock_entries")
      .update({ clock_out: new Date().toISOString() })
      .eq("id", openClock.id);
    load();
  }

  async function startTimer() {
    if (!me || !jobName.trim()) return;
    await supabase
      .from("job_timer_entries")
      .insert({ employee_id: me.id, job_name: jobName.trim() });
    setJobName("");
    load();
  }

  async function stopTimer() {
    if (!openTimer) return;
    await supabase
      .from("job_timer_entries")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", openTimer.id);
    load();
  }

  async function toggleTodo(t: Todo) {
    await supabase.from("todos").update({ done: !t.done }).eq("id", t.id);
    load();
  }

  const [toError, setToError] = useState<string | null>(null);

  async function requestTimeOff() {
    if (!me) return;
    if (!toForm.date) {
      setToError("Pick a date.");
      return;
    }
    if (!toForm.allDay) {
      if (!toForm.startTime || !toForm.endTime) {
        setToError("Add a start and end time, or choose all day.");
        return;
      }
      if (toForm.endTime <= toForm.startTime) {
        setToError("The end time has to be after the start time.");
        return;
      }
    }
    setToError(null);

    const { error } = await supabase.from("time_off_requests").insert({
      employee_id: me.id,
      start_date: toForm.date,
      end_date: toForm.date,
      start_time: toForm.allDay ? null : toForm.startTime,
      end_time: toForm.allDay ? null : toForm.endTime,
      reason: toForm.reason || null,
      status: "pending",
    });
    if (error) {
      setToError(error.message);
      return;
    }
    setToForm({
      date: "",
      startTime: "",
      endTime: "",
      reason: "",
      allDay: true,
    });
    load();
  }

  /** Copy an address so it can be pasted into whichever maps app they use. */
  async function copyAddress(jobId: string, address: string) {
    try {
      await navigator.clipboard.writeText(address);
    } catch {
      // Older browsers, or a page without clipboard permission.
      const el = document.createElement("textarea");
      el.value = address;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopiedId(jobId);
    setTimeout(() => setCopiedId((id) => (id === jobId ? null : id)), 2000);
  }

  /** Tick a yard off — or put it back if it was ticked by mistake. */
  async function toggleJobDone(j: JobBoardRow) {
    const next = j.status === "done" ? "scheduled" : "done";

    // Show it immediately; the live subscription confirms it.
    setTodayJobs((list) =>
      list.map((x) => (x.id === j.id ? { ...x, status: next } : x))
    );

    // Ask for the row back: if the access rules filter it out rather
    // than rejecting it, the update reports no error and changes nothing,
    // which looks exactly like a dead button.
    const { data, error } = await supabase
      .from("scheduled_jobs")
      .update({ status: next })
      .eq("id", j.id)
      .select("id");

    if (error || !data?.length) {
      // Put it back the way it was rather than showing a false tick.
      setTodayJobs((list) =>
        list.map((x) => (x.id === j.id ? { ...x, status: j.status } : x))
      );
      alert(
        error
          ? `Could not update that job: ${error.message}`
          : "That didn't save — the database rules blocked it. Run supabase/09-crew-job-board.sql in the SQL Editor."
      );
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  // Switching to the boss view requires the boss code.
  async function checkBossCode(code: string): Promise<string | null> {
    const { data: ok, error } = await supabase.rpc("verify_boss_code", { code });
    if (error) return error.message;
    if (!ok) return "Wrong code. Try again.";
    setBossGate(false);
    router.push("/dashboard");
    return null;
  }

  // Choosing a personal code. Typing the reset code (0000) here just
  // prompts for a new one, which is what makes it a "reset".
  async function saveNewPin(pin: string): Promise<string | null> {
    if (pin === "0000") return "Pick a code other than 0000.";
    const isSelf = viewingId === viewer?.id;
    const { error } = isSelf
      ? await supabase.rpc("set_my_pin", { new_pin: pin })
      : await supabase.rpc("set_employee_pin", {
          employee: viewingId,
          new_pin: pin,
        });
    if (error) return error.message;
    setPinSetup(false);
    setPinStatus("Code saved ✔");
    return null;
  }

  // Open the code screen automatically when arriving via "Forgot your code?"
  useEffect(() => {
    if (searchParams.get("setpin") === "1") setPinSetup(true);
  }, [searchParams]);

  const doneToday = todayJobs.filter((j) => j.status === "done").length;

  if (loading) {
    return (
      <main className="min-h-screen bg-bone p-4">
        <p className="text-ink-soft text-sm">Loading…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bone">
      <header className="mow-stripes text-[var(--bone)] px-4 py-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="display font-semibold text-[15.5px]">🌱 Blair Lawn Care</div>
          <div className="text-xs text-[var(--white)]/60 truncate">
            {me?.full_name} · employee view
            {viewingId !== viewer?.id ? " (opened by the boss)" : ""}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setBossGate(true)}
            className="text-xs text-[var(--white)]/80 hover:text-[var(--white)] border border-white/25 rounded-lg px-2.5 py-1.5"
          >
            🔀 Boss view
          </button>
          <button onClick={signOut} className="text-xs text-[var(--white)]/60 hover:text-[var(--white)]">
            Sign out
          </button>
        </div>
      </header>

      <div className="max-w-xl mx-auto p-4 space-y-4">
        {/* Clock in/out */}
        <Card>
          <div className="text-center py-2">
            {openClock ? (
              <>
                <div className="text-xs uppercase tracking-wide text-cut font-semibold">
                  ● On the clock since {fmtTime(openClock.clock_in)}
                </div>
                <div className="text-4xl font-bold tabular-nums my-3">
                  {elapsed(openClock.clock_in)}
                </div>
                <Button variant="danger" onClick={clockOut} className="w-full !py-3">
                  Clock out
                </Button>
              </>
            ) : (
              <>
                <div className="text-xs uppercase tracking-wide text-ink-soft font-semibold">
                  Off the clock
                </div>
                <Button onClick={clockIn} className="w-full !py-3 mt-3">
                  Clock in
                </Button>
              </>
            )}
          </div>
        </Card>

        {/* My schedule */}
        <Card title="My schedule this week">
          {shifts.length === 0 && jobs.length === 0 ? (
            <Empty>Nothing scheduled this week.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {shifts.map((s) => (
                <li key={s.id} className="py-2 flex justify-between text-sm">
                  <span className="font-medium">{dayLabel(s.shift_date)}</span>
                  <span>
                    {fmtClock(s.start_time)} – {fmtClock(s.end_time)}
                  </span>
                </li>
              ))}
              {jobs.map((j) => (
                <li key={j.id} className="py-2 flex justify-between gap-2 text-sm">
                  <span>
                    <span className="font-medium">{dayLabel(j.job_date)}</span>{" "}
                    · 🌿 {j.customers?.name}
                    <span className="text-ink-soft text-xs block">
                      {j.customers?.address}
                    </span>
                  </span>
                  <Badge
                    tone={
                      j.status === "done"
                        ? "good"
                        : j.status === "in_progress"
                          ? "warn"
                          : "neutral"
                    }
                  >
                    {j.status.replace("_", " ")}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Yard list — shared with the whole crew */}
        <Card
          title="Yard list"
          action={
            <span className="text-xs text-ink-soft">
              {doneToday}/{todayJobs.length} done
            </span>
          }
        >
          <p className="text-[12px] text-ink-soft mb-3">
            Everything on today&apos;s route. Tick one off and it updates for
            the whole crew.
          </p>
          {todayJobs.length === 0 ? (
            <Empty>No yards scheduled for today.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {todayJobs.map((j) => {
                const done = j.status === "done";
                return (
                  <li key={j.id} className="py-2.5 flex items-start gap-3">
                    <button
                      onClick={() => toggleJobDone(j)}
                      aria-label={done ? "Mark not done" : "Mark done"}
                      className={`mt-0.5 w-7 h-7 shrink-0 rounded-full border-2 flex items-center justify-center text-sm transition-colors ${
                        done
                          ? "bg-cut border-cut text-[var(--white)]"
                          : "border-line text-transparent hover:border-cut"
                      }`}
                    >
                      ✓
                    </button>
                    <div className="min-w-0 flex-1">
                      <div
                        className={`text-[13.5px] font-semibold ${done ? "line-through text-ink-soft" : ""}`}
                      >
                        {j.customer_name ?? "Unknown"}
                      </div>
                      <div className="text-xs text-ink-soft">
                        {j.job_time ? `${fmtClock(j.job_time)} · ` : ""}
                        {j.service ?? "Mow"}
                        {j.assigned_to ? ` · ${j.assigned_to}` : " · anyone"}
                      </div>
                      {j.customer_address && (
                        <button
                          onClick={() => copyAddress(j.id, j.customer_address!)}
                          className="text-xs text-cut underline text-left"
                          title="Tap to copy"
                        >
                          {copiedId === j.id
                            ? "Address copied ✓"
                            : j.customer_address}
                        </button>
                      )}
                    </div>
                    {done && <Badge tone="good">done</Badge>}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* To-dos */}
        <Card title="To-dos from the boss">
          {todos.length === 0 ? (
            <Empty>No to-dos. 🎉</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {todos.map((t) => (
                <li key={t.id} className="py-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={t.done}
                    disabled={t.employee_id === null}
                    onChange={() => toggleTodo(t)}
                    className="accent-[var(--accent)]"
                  />
                  <span
                    className={`text-sm ${t.done ? "line-through text-ink-soft" : ""}`}
                  >
                    {t.text}
                  </span>
                  {t.employee_id === null && (
                    <span className="text-xs text-ink-soft ml-auto">everyone</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <ReceiptCapture uploaderId={viewingId} title="Capture a receipt" />

        {/* Job timer */}
        <Card title="Job timer">
          {openTimer ? (
            <div className="text-center">
              <div className="text-sm font-medium">{openTimer.job_name}</div>
              <div className="text-3xl font-bold tabular-nums my-2">
                {elapsed(openTimer.started_at)}
              </div>
              <Button variant="danger" onClick={stopTimer} className="w-full">
                Stop timer
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                placeholder="Job name (e.g. Smith front yard)"
                value={jobName}
                onChange={(e) => setJobName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && startTimer()}
              />
              <Button onClick={startTimer}>Start</Button>
            </div>
          )}
          {recentTimers.length > 0 && (
            <ul className="mt-3 divide-y divide-line">
              {recentTimers.map((t) => (
                <li key={t.id} className="py-1.5 flex justify-between text-sm">
                  <span>{t.job_name}</span>
                  <span className="text-ink-soft tabular-nums">
                    {fmtDuration(hoursBetween(t.started_at, t.ended_at))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Time off */}
        <Card title="Request time off">
          <div className="space-y-3">
            <div>
              <Label>Date</Label>
              <Input
                type="date"
                value={toForm.date}
                onChange={(e) => setToForm({ ...toForm, date: e.target.value })}
              />
            </div>

            <label className="flex items-center gap-2 text-[13px] font-medium">
              <input
                type="checkbox"
                checked={toForm.allDay}
                onChange={(e) =>
                  setToForm({ ...toForm, allDay: e.target.checked })
                }
                className="accent-[var(--cut)]"
              />
              All day
            </label>

            {!toForm.allDay && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Start time</Label>
                  <Input
                    type="time"
                    value={toForm.startTime}
                    onChange={(e) =>
                      setToForm({ ...toForm, startTime: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>End time</Label>
                  <Input
                    type="time"
                    value={toForm.endTime}
                    onChange={(e) =>
                      setToForm({ ...toForm, endTime: e.target.value })
                    }
                  />
                </div>
              </div>
            )}

            <div>
              <Label>Reason</Label>
              <Textarea
                rows={2}
                placeholder="Doctor's appointment, family thing, etc."
                value={toForm.reason}
                onChange={(e) =>
                  setToForm({ ...toForm, reason: e.target.value })
                }
              />
            </div>

            {toError && (
              <p className="text-sm text-[var(--status-overdue-fg)]">{toError}</p>
            )}
            <Button onClick={requestTimeOff}>Send request</Button>
          </div>

          {timeOff.length > 0 && (
            <ul className="mt-4 divide-y divide-line border-t border-line pt-1">
              {timeOff.map((t) => (
                <li
                  key={t.id}
                  className="py-2 flex justify-between items-start gap-2 text-[13px]"
                >
                  <span>
                    <span className="font-semibold">{fmtDate(t.start_date)}</span>
                    <span className="block text-ink-soft text-xs mt-0.5">
                      {t.start_time && t.end_time
                        ? `${fmtClock(t.start_time)} – ${fmtClock(t.end_time)}`
                        : "All day"}
                      {t.reason ? ` · ${t.reason}` : ""}
                    </span>
                  </span>
                  <Badge
                    tone={
                      t.status === "approved"
                        ? "good"
                        : t.status === "denied"
                          ? "serious"
                          : "warn"
                    }
                  >
                    {t.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Personal code */}
        <Card title="My 4-digit code">
          <p className="text-sm text-ink-soft mb-3">
            This is the code you type to open your view on a shared phone or
            tablet. Forgot it? Enter <strong>0000</strong> at the code screen
            and you&apos;ll be asked to pick a new one.
          </p>
          <Button variant="secondary" onClick={() => setPinSetup(true)}>
            {hasPin ? "Change my code" : "Set up my code"}
          </Button>
          {pinStatus && (
            <p className="text-sm text-cut mt-2">{pinStatus}</p>
          )}
        </Card>
      </div>

      {bossGate && (
        <PinPad
          title="Boss view"
          subtitle="Enter the boss code"
          onComplete={checkBossCode}
          onCancel={() => setBossGate(false)}
        />
      )}

      {pinSetup && (
        <PinPad
          title={hasPin ? "New code" : "Choose your code"}
          subtitle={`Pick 4 digits for ${me?.full_name ?? "this account"}`}
          onComplete={saveNewPin}
          onCancel={() => setPinSetup(false)}
        />
      )}
    </main>
  );
}
