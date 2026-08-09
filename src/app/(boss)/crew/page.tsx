"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge, Button, Card, Empty, Td, Th } from "@/components/ui";
import PinPad from "@/components/PinPad";
import { fmtClock, fmtDate, fmtDuration, fmtTime, hoursBetween, weekStartOf, todayISO } from "@/lib/format";
import type { CrewShift, Profile, TimeClockEntry } from "@/lib/types";

export default function CrewPage() {
  const supabase = createClient();
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [clockedIn, setClockedIn] = useState<TimeClockEntry[]>([]);
  const [weekClock, setWeekClock] = useState<TimeClockEntry[]>([]);
  const [shifts, setShifts] = useState<CrewShift[]>([]);
  const [pinStatus, setPinStatus] = useState<Record<string, boolean>>({});
  const [settingPinFor, setSettingPinFor] = useState<Profile | null>(null);
  const [pinMessage, setPinMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const weekStart = weekStartOf(todayISO());
    const [e, c, w, s, ps] = await Promise.all([
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
      supabase.rpc("crew_pin_status"),
    ]);
    setEmployees((e.data as Profile[]) ?? []);
    setClockedIn((c.data as TimeClockEntry[]) ?? []);
    setWeekClock((w.data as TimeClockEntry[]) ?? []);
    setShifts((s.data as CrewShift[]) ?? []);
    setPinStatus(
      Object.fromEntries(
        ((ps.data as { id: string; has_pin: boolean }[]) ?? []).map((r) => [
          r.id,
          r.has_pin,
        ])
      )
    );
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

  /** Set or reset someone's code for them. */
  async function saveCodeFor(pin: string): Promise<string | null> {
    if (!settingPinFor) return "No one selected.";
    if (pin === "0000") return "Pick a code other than 0000.";
    const { error } = await supabase.rpc("set_employee_pin", {
      employee: settingPinFor.id,
      new_pin: pin,
    });
    if (error) return error.message;
    setPinMessage(`Code set for ${settingPinFor.full_name}.`);
    setSettingPinFor(null);
    load();
    return null;
  }

  if (loading) return <p className="text-ink-soft text-sm">Loading…</p>;

  return (
    <div className="space-y-4">
      <h1 className="display text-[26px] font-semibold tracking-[-0.2px]">Crew</h1>
      <p className="text-sm text-ink-soft">
        New crew logins are created in Supabase (Authentication → Users →
        Add user) — they appear here automatically as employees.
      </p>

      {pinMessage && (
        <p className="text-sm text-cut">{pinMessage}</p>
      )}

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
                    <div className="text-xs text-ink-soft">
                      {fmtDuration(weekHours)} this week
                      {entry ? ` · on the clock since ${fmtTime(entry.clock_in)}` : ""}
                      {p.email ? ` · ${p.email}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {entry ? (
                      <Badge tone="good">● Clocked in</Badge>
                    ) : (
                      <Badge tone="neutral">Off</Badge>
                    )}
                    <Badge tone={pinStatus[p.id] ? "good" : "warn"}>
                      {pinStatus[p.id] ? "code set" : "no code"}
                    </Badge>
                    <Button
                      variant="secondary"
                      onClick={() => setSettingPinFor(p)}
                      className="!py-1 !px-2.5 text-xs"
                    >
                      {pinStatus[p.id] ? "Reset code" : "Set code"}
                    </Button>
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
      {settingPinFor && (
        <PinPad
          title={`Code for ${settingPinFor.full_name}`}
          subtitle="Pick 4 digits, then tell them what it is"
          onComplete={saveCodeFor}
          onCancel={() => setSettingPinFor(null)}
        />
      )}
    </div>
  );
}
