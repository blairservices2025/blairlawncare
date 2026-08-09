"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import {
  Badge,
  Button,
  Card,
  Empty,
  Input,
  Select,
  StatTile,
} from "@/components/ui";
import {
  fmtClock,
  fmtDate,
  fmtTime,
  todayISO,
  todoCutoff,
  usd,
  daysOverdue,
} from "@/lib/format";
import type {
  Customer,
  Invoice,
  Profile,
  ScheduledJob,
  TimeClockEntry,
  TimeOffRequest,
  Todo,
} from "@/lib/types";

export default function OverviewPage() {
  const supabase = createClient();
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [clockedIn, setClockedIn] = useState<TimeClockEntry[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [timeOff, setTimeOff] = useState<TimeOffRequest[]>([]);
  const [newTodo, setNewTodo] = useState("");
  const [todoFor, setTodoFor] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const today = todayISO();
    const [j, c, i, cu, t, e, to] = await Promise.all([
      supabase
        .from("scheduled_jobs")
        .select("*, customers(name, address, plan), profiles(full_name)")
        .eq("job_date", today)
        .order("created_at"),
      supabase
        .from("time_clock_entries")
        .select("*, profiles(full_name)")
        .is("clock_out", null),
      supabase.from("invoices").select("*, customers(name)"),
      supabase.from("customers").select("*").order("name"),
      supabase
        .from("todos")
        .select("*, profiles(full_name)")
        .gte("created_at", todoCutoff())
        .order("created_at", { ascending: false })
        .limit(20),
      supabase.from("profiles").select("*").eq("is_active", true).order("full_name"),
      supabase
        .from("time_off_requests")
        .select("*, profiles(full_name)")
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
    ]);
    setJobs((j.data as ScheduledJob[]) ?? []);
    setClockedIn((c.data as TimeClockEntry[]) ?? []);
    setInvoices((i.data as Invoice[]) ?? []);
    setCustomers((cu.data as Customer[]) ?? []);
    setTodos((t.data as Todo[]) ?? []);
    setEmployees((e.data as Profile[]) ?? []);
    setTimeOff((to.data as TimeOffRequest[]) ?? []);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refreshTimeOff = useCallback(async () => {
    const { data } = await supabase
      .from("time_off_requests")
      .select("*, profiles(full_name)")
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    setTimeOff((data as TimeOffRequest[]) ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshTodos = useCallback(async () => {
    const { data } = await supabase
      .from("todos")
      .select("*, profiles(full_name)")
      .gte("created_at", todoCutoff())
      .order("created_at", { ascending: false })
      .limit(20);
    setTodos((data as Todo[]) ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshClock = useCallback(async () => {
    const { data } = await supabase
      .from("time_clock_entries")
      .select("*, profiles(full_name)")
      .is("clock_out", null);
    setClockedIn((data as TimeClockEntry[]) ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshJobs = useCallback(async () => {
    const { data } = await supabase
      .from("scheduled_jobs")
      .select("*, customers(name, address, plan), profiles(full_name)")
      .eq("job_date", todayISO())
      .order("created_at");
    setJobs((data as ScheduledJob[]) ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Requests and clock-ins arrive while this page sits open.
  useLiveRefresh("overview-live", {
    time_off_requests: refreshTimeOff,
    time_clock_entries: refreshClock,
    scheduled_jobs: refreshJobs,
    todos: refreshTodos,
  });

  async function reviewTimeOff(id: string, status: "approved" | "denied") {
    setTimeOff((list) => list.filter((t) => t.id !== id));
    const { error } = await supabase
      .from("time_off_requests")
      .update({ status })
      .eq("id", id);
    if (error) refreshTimeOff();
  }

  async function addTodo() {
    const text = newTodo.trim();
    if (!text) return;
    setNewTodo("");
    const { error } = await supabase
      .from("todos")
      .insert({ text, employee_id: todoFor || null });
    if (error) {
      setNewTodo(text);
      alert(`Could not add that: ${error.message}`);
      return;
    }
    refreshTodos();
  }

  async function toggleTodo(t: Todo) {
    // Flip it straight away; put it back only if the write fails.
    setTodos((list) =>
      list.map((x) => (x.id === t.id ? { ...x, done: !t.done } : x))
    );
    const { error } = await supabase
      .from("todos")
      .update({ done: !t.done })
      .eq("id", t.id);
    if (error) {
      setTodos((list) =>
        list.map((x) => (x.id === t.id ? { ...x, done: t.done } : x))
      );
    }
  }

  async function deleteTodo(id: string) {
    const previous = todos;
    setTodos((list) => list.filter((x) => x.id !== id));
    const { error } = await supabase.from("todos").delete().eq("id", id);
    if (error) setTodos(previous);
  }

  const outstanding = invoices
    .filter((i) => i.status !== "paid")
    .reduce((s, i) => s + Number(i.amount), 0);
  const paidThisMonth = invoices
    .filter(
      (i) =>
        i.status === "paid" &&
        i.paid_date &&
        i.paid_date.slice(0, 7) === todayISO().slice(0, 7)
    )
    .reduce((s, i) => s + Number(i.amount), 0);
  const overdueFlags = customers.filter(
    (c) =>
      c.plan === "weekly" &&
      c.last_service_date &&
      daysOverdue(c.last_service_date) >= 6
  );

  if (loading) return <p className="text-ink-soft text-sm">Loading…</p>;

  return (
    <div className="space-y-4">
      <h1 className="display text-[26px] font-semibold tracking-[-0.2px]">Overview</h1>

      {timeOff.length > 0 && (
        <Card
          title={`Time off to review (${timeOff.length})`}
          className="border-gold"
        >
          <ul className="divide-y divide-line">
            {timeOff.map((t) => (
              <li
                key={t.id}
                className="py-2 flex items-center justify-between gap-2 flex-wrap"
              >
                <div>
                  <div className="text-[13.5px] font-semibold">
                    {t.profiles?.full_name}
                  </div>
                  <div className="text-xs text-ink-soft">
                    {fmtDate(t.start_date)}
                    {t.start_date !== t.end_date
                      ? ` → ${fmtDate(t.end_date)}`
                      : ""}
                    {" · "}
                    {t.start_time && t.end_time
                      ? `${fmtClock(t.start_time)} – ${fmtClock(t.end_time)}`
                      : "All day"}
                    {t.reason ? ` · ${t.reason}` : ""}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <Button
                    onClick={() => reviewTimeOff(t.id, "approved")}
                    className="!py-1 !px-2.5 text-xs"
                  >
                    Approve
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => reviewTimeOff(t.id, "denied")}
                    className="!py-1 !px-2.5 text-xs"
                  >
                    Deny
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Jobs today" value={String(jobs.length)} />
        <StatTile
          label="Crew clocked in"
          value={String(clockedIn.length)}
          tone={clockedIn.length > 0 ? "good" : "default"}
        />
        <StatTile
          label="Collected this month"
          value={usd(paidThisMonth)}
          tone="good"
        />
        <StatTile
          label="Outstanding"
          value={usd(outstanding)}
          tone={outstanding > 0 ? "warn" : "default"}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card
          title="Today's schedule"
          action={
            <Link href="/schedule" className="text-xs text-cut font-medium">
              Full schedule →
            </Link>
          }
        >
          {jobs.length === 0 ? (
            <Empty>No jobs scheduled for today.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {jobs.map((j) => (
                <li key={j.id} className="py-2 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">
                      {j.customers?.name ?? "Unknown"}
                    </div>
                    <div className="text-xs text-ink-soft">
                      {j.customers?.address ?? ""}
                      {j.profiles?.full_name
                        ? ` · ${j.profiles.full_name}`
                        : " · unassigned"}
                    </div>
                  </div>
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

        <Card
          title="Crew status"
          action={
            <Link href="/crew" className="text-xs text-cut font-medium">
              Crew →
            </Link>
          }
        >
          {employees.length === 0 ? (
            <Empty>No crew members yet.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {employees.map((e) => {
                const entry = clockedIn.find((c) => c.employee_id === e.id);
                return (
                  <li key={e.id} className="py-2 flex items-center justify-between">
                    <span className="text-sm font-medium">{e.full_name}</span>
                    {entry ? (
                      <Badge tone="good">
                        ● On the clock since {fmtTime(entry.clock_in)}
                      </Badge>
                    ) : (
                      <Badge tone="neutral">Off the clock</Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="To-dos">
          <div className="flex gap-2 mb-3">
            <Input
              value={newTodo}
              onChange={(e) => setNewTodo(e.target.value)}
              placeholder="Add a to-do…"
              onKeyDown={(e) => e.key === "Enter" && addTodo()}
            />
            <Select
              value={todoFor}
              onChange={(e) => setTodoFor(e.target.value)}
              className="max-w-36"
            >
              <option value="">Everyone</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name}
                </option>
              ))}
            </Select>
            <Button onClick={addTodo}>Add</Button>
          </div>
          {todos.length === 0 ? (
            <Empty>Nothing on the list.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {todos.map((t) => (
                <li key={t.id} className="py-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={t.done}
                    onChange={() => toggleTodo(t)}
                    className="accent-[var(--accent)]"
                  />
                  <span
                    className={`text-sm flex-1 ${t.done ? "line-through text-ink-soft" : ""}`}
                  >
                    {t.text}
                  </span>
                  <span className="text-xs text-ink-soft">
                    {t.profiles?.full_name ?? "Everyone"}
                  </span>
                  <button
                    onClick={() => deleteTodo(t.id)}
                    className="text-ink-soft hover:text-[var(--status-overdue-fg)] text-sm"
                    aria-label="Delete"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Service flags"
          action={
            <Link href="/customers" className="text-xs text-cut font-medium">
              Customers →
            </Link>
          }
        >
          {overdueFlags.length === 0 ? (
            <Empty>No weekly customers overdue. 👍</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {overdueFlags.map((c) => (
                <li key={c.id} className="py-2 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">{c.name}</div>
                    <div className="text-xs text-ink-soft">{c.address}</div>
                  </div>
                  <Badge tone="serious">
                    ⚠ {daysOverdue(c.last_service_date!)} days since service
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
