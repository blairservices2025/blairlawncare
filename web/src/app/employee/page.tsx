"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Badge,
  Button,
  Card,
  Empty,
  Input,
  Label,
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

export default function EmployeePage() {
  const supabase = createClient();
  const router = useRouter();
  const [me, setMe] = useState<Profile | null>(null);
  const [openClock, setOpenClock] = useState<TimeClockEntry | null>(null);
  const [openTimer, setOpenTimer] = useState<JobTimerEntry | null>(null);
  const [recentTimers, setRecentTimers] = useState<JobTimerEntry[]>([]);
  const [shifts, setShifts] = useState<CrewShift[]>([]);
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [timeOff, setTimeOff] = useState<TimeOffRequest[]>([]);
  const [jobName, setJobName] = useState("");
  const [toForm, setToForm] = useState({ start: "", end: "", reason: "" });
  const [receiptNote, setReceiptNote] = useState("");
  const [receiptAmount, setReceiptAmount] = useState("");
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);

  useTicker(!!openClock || !!openTimer);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const weekStart = mondayOf(todayISO());
    const weekEnd = addDays(weekStart, 6);
    const [p, oc, ot, rt, sh, jb, td, to] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase
        .from("time_clock_entries")
        .select("*")
        .eq("employee_id", user.id)
        .is("clock_out", null)
        .order("clock_in", { ascending: false })
        .limit(1),
      supabase
        .from("job_timer_entries")
        .select("*")
        .eq("employee_id", user.id)
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1),
      supabase
        .from("job_timer_entries")
        .select("*")
        .eq("employee_id", user.id)
        .not("ended_at", "is", null)
        .order("started_at", { ascending: false })
        .limit(5),
      supabase
        .from("crew_shifts")
        .select("*")
        .eq("employee_id", user.id)
        .gte("shift_date", weekStart)
        .lte("shift_date", weekEnd)
        .order("shift_date"),
      supabase
        .from("scheduled_jobs")
        .select("*, customers(name, address, plan)")
        .eq("employee_id", user.id)
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
        .eq("employee_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);
    setMe(p.data as Profile);
    setOpenClock((oc.data?.[0] as TimeClockEntry) ?? null);
    setOpenTimer((ot.data?.[0] as JobTimerEntry) ?? null);
    setRecentTimers((rt.data as JobTimerEntry[]) ?? []);
    setShifts((sh.data as CrewShift[]) ?? []);
    setJobs((jb.data as ScheduledJob[]) ?? []);
    setTodos((td.data as Todo[]) ?? []);
    setTimeOff((to.data as TimeOffRequest[]) ?? []);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
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

  async function requestTimeOff() {
    if (!me || !toForm.start || !toForm.end) return;
    await supabase.from("time_off_requests").insert({
      employee_id: me.id,
      start_date: toForm.start,
      end_date: toForm.end,
      reason: toForm.reason || null,
      status: "pending",
    });
    setToForm({ start: "", end: "", reason: "" });
    load();
  }

  async function uploadReceipt(file: File) {
    if (!me) return;
    setUploadStatus("Uploading…");
    const path = `${me.id}/${crypto.randomUUID()}-${file.name}`;
    const { error: upErr } = await supabase.storage
      .from("receipts")
      .upload(path, file);
    if (upErr) {
      setUploadStatus(`Upload failed: ${upErr.message}`);
      return;
    }
    const { error: dbErr } = await supabase.from("receipts").insert({
      uploaded_by: me.id,
      file_path: path,
      note: receiptNote || null,
      amount: receiptAmount ? Number(receiptAmount) : null,
    });
    setUploadStatus(dbErr ? `Save failed: ${dbErr.message}` : "Receipt saved ✔");
    setReceiptNote("");
    setReceiptAmount("");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-background p-4">
        <p className="text-muted text-sm">Loading…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="bg-sidebar text-white px-4 py-4 flex items-center justify-between">
        <div>
          <div className="font-bold">🌱 Blair Lawn Care</div>
          <div className="text-xs text-white/60">
            {me?.full_name} · employee view
          </div>
        </div>
        <div className="flex items-center gap-3">
          {me?.role === "boss" && (
            <Link href="/dashboard" className="text-xs text-white/80 underline">
              Boss view
            </Link>
          )}
          <button onClick={signOut} className="text-xs text-white/60 hover:text-white">
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
                <div className="text-xs uppercase tracking-wide text-good font-semibold">
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
                <div className="text-xs uppercase tracking-wide text-muted font-semibold">
                  Off the clock
                </div>
                <Button onClick={clockIn} className="w-full !py-3 mt-3">
                  Clock in
                </Button>
              </>
            )}
          </div>
        </Card>

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
                  <span className="text-muted tabular-nums">
                    {fmtDuration(hoursBetween(t.started_at, t.ended_at))}
                  </span>
                </li>
              ))}
            </ul>
          )}
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
                    <span className="text-muted text-xs block">
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
                    className={`text-sm ${t.done ? "line-through text-muted" : ""}`}
                  >
                    {t.text}
                  </span>
                  {t.employee_id === null && (
                    <span className="text-xs text-muted ml-auto">everyone</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Receipt capture */}
        <Card title="Capture a receipt">
          <div className="space-y-2">
            <Input
              placeholder="Note (e.g. gas, mower blades)"
              value={receiptNote}
              onChange={(e) => setReceiptNote(e.target.value)}
            />
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="Amount (optional)"
              value={receiptAmount}
              onChange={(e) => setReceiptAmount(e.target.value)}
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadReceipt(f);
              }}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-foreground"
            />
            {uploadStatus && (
              <p className="text-sm text-muted">{uploadStatus}</p>
            )}
          </div>
        </Card>

        {/* Time off */}
        <Card title="Request time off">
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div>
              <Label>From</Label>
              <Input
                type="date"
                value={toForm.start}
                onChange={(e) => setToForm({ ...toForm, start: e.target.value })}
              />
            </div>
            <div>
              <Label>To</Label>
              <Input
                type="date"
                value={toForm.end}
                onChange={(e) => setToForm({ ...toForm, end: e.target.value })}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Reason (optional)"
              value={toForm.reason}
              onChange={(e) => setToForm({ ...toForm, reason: e.target.value })}
            />
            <Button onClick={requestTimeOff}>Request</Button>
          </div>
          {timeOff.length > 0 && (
            <ul className="mt-3 divide-y divide-line">
              {timeOff.map((t) => (
                <li key={t.id} className="py-1.5 flex justify-between items-center text-sm">
                  <span>
                    {fmtDate(t.start_date)} → {fmtDate(t.end_date)}
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
      </div>
    </main>
  );
}
