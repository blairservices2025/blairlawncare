"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Subscribe to table changes and refresh only what changed.
 *
 * Each table gets its own refresh function rather than everything
 * sharing one. A new to-do used to trigger a reload of the whole page —
 * shifts, jobs, timers, time off, the lot — so the wait to see it was
 * the sum of every query on the page rather than the one that mattered.
 *
 * Each table's refreshes are also collapsed: a burst of changes (a week
 * scheduled at once, five yards ticked off in a row) fires one refresh
 * rather than one per row. The wait is short enough to still read as
 * immediate, and it keeps a burst from queueing up behind itself.
 */
export function useLiveRefresh(
  channelName: string,
  handlers: Record<string, () => void>,
  waitMs = 120
) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const tableKey = Object.keys(handlers).sort().join(",");

  useEffect(() => {
    const supabase = createClient();
    const timers = new Map<string, ReturnType<typeof setTimeout>>();

    const schedule = (table: string) => {
      const existing = timers.get(table);
      if (existing) clearTimeout(existing);
      timers.set(
        table,
        setTimeout(() => {
          timers.delete(table);
          handlersRef.current[table]?.();
        }, waitMs)
      );
    };

    let channel = supabase.channel(channelName);
    for (const table of tableKey.split(",")) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => schedule(table)
      );
    }
    channel.subscribe();

    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
      supabase.removeChannel(channel);
    };
  }, [channelName, tableKey, waitMs]);
}
