"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
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
  fmtTime,
  todayISO,
  usd,
  daysOverdue,
} from "@/lib/format";
import type {
  Customer,
  Invoice,
  Profile,
  ScheduledJob,
  TimeClockEntry,
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
  const [newTodo, setNewTodo] = useState("");
  const [todoFor, setTodoFor] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const today = todayISO();
    const [j, c, i, cu, t, e] = await Promise.all([
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
        .order("created_at", { ascending: false })
        .limit(20),
      supabase.from("profiles").select("*").eq("is_active", true).order("full_name"),
    ]);
    setJobs((j.data as ScheduledJob[]) ?? []);
    setClockedIn((c.data as TimeClockEntry[]) ?? []);
    setInvoices((i.data as Invoice[]) ?? []);
    setCustomers((cu.data as Customer[]) ?? []);
    setTodos((t.data as Todo[]) ?? []);
    setEmployees((e.data as Profile[]) ?? []);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addTodo() {
    if (!newTodo.trim()) return;
    await supabase.from("todos").insert({
      text: newTodo.trim(),
      employee_id: todoFor || null,
    });
    setNewTodo("");
    load();
  }

  async function toggleTodo(t: Todo) {
    await supabase.from("todos").update({ done: !t.done }).eq("id", t.id);
    load();
  }

  async function deleteTodo(id: string) {
    await supabase.from("todos").delete().eq("id", id);
    load();
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
