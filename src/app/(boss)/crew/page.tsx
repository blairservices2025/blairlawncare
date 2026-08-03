"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge, Button, Card, Empty, Td, Th } from "@/components/ui";
import { fmtClock, fmtDate, fmtDuration, fmtTime, hoursBetween, mondayOf, todayISO } from "@/lib/format";
import type { CrewShift, Profile, TimeClockEntry } from "@/lib/types";

export default function CrewPage() {
  const supabase = createClient();
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [clockedIn, setClockedIn] = useState<TimeClockEntry[]>([]);
  const [weekClock, setWeekClock] = useState<TimeClockEntry[]>([]);
  const [shifts, setShifts] = useState<CrewShift[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const weekStart = mondayOf(todayISO());
    const [e, c, w, s] = await Promise.all([
      supabase.from("profiles").select("*").order("full_name"),
      supabase.from("time_clock_entries").select("*").is("clock_out", null),
      supabase
        .from("time_clock_entries")
        .select("*")
        .gte("clock_in", weekStart + "T00:00:00"),
      supabase
        .from("crew_shifts")
        .select("*, profiles(full_name)")
        .gte("shift_date", weekStart)
        .order("shift_date"),
    ]);
    setEmployees((e.data as Profile[]) ?? []);
    setClockedIn((c.data as TimeClockEntry[]) ?? []);
    setWeekClock((w.data as TimeClockEntry[]) ?? []);
    setShifts((s.data as CrewShift[]) ?? []);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleActive(p: Profile) {
    await supabase
      .from("profiles")
      .update({ is_active: !p.is_active })
      .eq("id", p.id);
    load();
  }

  if (loading) return <p className="text-muted text-sm">Loading…</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Crew</h1>
      <p className="text-sm text-muted">
        New crew logins are created in Supabase (Authentication → Users →
        Add user) — they appear here automatically as employees.
      </p>

      <Card title="Crew status">
        {employees.length === 0 ? (
          <Empty>No crew yet.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {employees.map((p) => {
              const entry = clockedIn.find((c) => c.employee_id === p.id);
              const weekHours = weekClock
                .filter((c) => c.employee_id === p.id)
                .reduce((s, c) => s + hoursBetween(c.clock_in, c.clock_out), 0);
              return (
                <li key={p.id} className="py-2.5 flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <div className="text-sm font-medium flex items-center gap-2">
                      {p.full_name}
                      <Badge tone={p.role === "boss" ? "good" : "neutral"}>
                        {p.role}
                      </Badge>
                      {!p.is_active && <Badge tone="serious">inactive</Badge>}
                    </div>
                    <div className="text-xs text-muted">
                      {fmtDuration(weekHours)} this week
                      {entry ? ` · on the clock since ${fmtTime(entry.clock_in)}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {entry ? (
                      <Badge tone="good">● Clocked in</Badge>
                    ) : (
                      <Badge tone="neutral">Off</Badge>
                    )}
                    {p.role !== "boss" && (
                      <Button
                        variant="ghost"
                        onClick={() => toggleActive(p)}
                        className="!py-1 !px-2 text-xs"
                      >
                        {p.is_active ? "Deactivate" : "Reactivate"}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="Shift hours (this week on)">
        {shifts.length === 0 ? (
          <Empty>No shifts scheduled.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-line">
                  <Th>Crew member</Th>
                  <Th>Date</Th>
                  <Th>Shift</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shifts.map((s) => (
                  <tr key={s.id}>
                    <Td className="font-medium">{s.profiles?.full_name}</Td>
                    <Td>{fmtDate(s.shift_date)}</Td>
                    <Td>
                      {fmtClock(s.start_time)} – {fmtClock(s.end_time)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
