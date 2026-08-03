"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge, Card, Empty, Td, Th } from "@/components/ui";
import {
  fmtDate,
  fmtDuration,
  fmtTime,
  hoursBetween,
} from "@/lib/format";
import type { JobTimerEntry, TimeClockEntry } from "@/lib/types";

export default function TimeLogsPage() {
  const supabase = createClient();
  const [clock, setClock] = useState<TimeClockEntry[]>([]);
  const [timers, setTimers] = useState<JobTimerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [c, t] = await Promise.all([
        supabase
          .from("time_clock_entries")
          .select("*, profiles(full_name)")
          .order("clock_in", { ascending: false })
          .limit(100),
        supabase
          .from("job_timer_entries")
          .select("*, profiles(full_name)")
          .order("started_at", { ascending: false })
          .limit(100),
      ]);
      setClock((c.data as TimeClockEntry[]) ?? []);
      setTimers((t.data as JobTimerEntry[]) ?? []);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <p className="text-muted text-sm">Loading…</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Time Logs</h1>

      <Card title="Clock in / out">
        {clock.length === 0 ? (
          <Empty>No clock entries yet.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-line">
                  <Th>Crew member</Th>
                  <Th>Date</Th>
                  <Th>In</Th>
                  <Th>Out</Th>
                  <Th>Hours</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {clock.map((e) => (
                  <tr key={e.id}>
                    <Td className="font-medium">{e.profiles?.full_name}</Td>
                    <Td>{fmtDate(e.clock_in)}</Td>
                    <Td>{fmtTime(e.clock_in)}</Td>
                    <Td>
                      {e.clock_out ? (
                        fmtTime(e.clock_out)
                      ) : (
                        <Badge tone="good">● on the clock</Badge>
                      )}
                    </Td>
                    <Td className="tabular-nums">
                      {fmtDuration(hoursBetween(e.clock_in, e.clock_out))}
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
                <tr className="border-b border-line">
                  <Th>Crew member</Th>
                  <Th>Job</Th>
                  <Th>Date</Th>
                  <Th>Duration</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {timers.map((t) => (
                  <tr key={t.id}>
                    <Td className="font-medium">{t.profiles?.full_name}</Td>
                    <Td>{t.job_name}</Td>
                    <Td>{fmtDate(t.started_at)}</Td>
                    <Td className="tabular-nums">
                      {t.ended_at ? (
                        fmtDuration(hoursBetween(t.started_at, t.ended_at))
                      ) : (
                        <Badge tone="warn">running</Badge>
                      )}
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
