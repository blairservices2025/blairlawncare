"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Reload when any of these tables change, but at most once every
 * `waitMs`.
 *
 * Without the wait, a burst of changes — importing a client list,
 * scheduling a week of work, a crew member ticking off five yards in a
 * row — fires one full page reload per row. Each of those reloads is
 * several queries, so the page spends its time re-fetching instead of
 * responding. Collapsing a burst into a single refresh keeps it feeling
 * immediate without the pile-up.
 */
export function useLiveRefresh(
  channelName: string,
  tables: string[],
  reload: () => void,
  waitMs = 250
) {
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  const tableKey = tables.join(",");

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        reloadRef.current();
      }, waitMs);
    };

    let channel = supabase.channel(channelName);
    for (const table of tableKey.split(",")) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        schedule
      );
    }
    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [channelName, tableKey, waitMs]);
}
