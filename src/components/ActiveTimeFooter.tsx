"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const TICK_MS = 1000;
const SAVE_EVERY_S = 30;

function hms(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Shows how long this session has been open and how long the app has been
 * used today in total. Only counts time while the tab is actually visible,
 * so leaving it open overnight doesn't inflate the number.
 */
export default function ActiveTimeFooter() {
  const supabase = createClient();
  const [sessionS, setSessionS] = useState(0);
  const [todayS, setTodayS] = useState<number | null>(null);
  const unsaved = useRef(0);

  // Today's running total from the database.
  useEffect(() => {
    supabase
      .rpc("my_active_seconds_today")
      .then(({ data }) => setTodayS(typeof data === "number" ? data : 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden) return;
      setSessionS((s) => s + 1);
      setTodayS((t) => (t === null ? t : t + 1));
      unsaved.current += 1;

      if (unsaved.current >= SAVE_EVERY_S) {
        const delta = unsaved.current;
        unsaved.current = 0;
        supabase.rpc("add_active_seconds", { delta }).then(({ data }) => {
          if (typeof data === "number") setTodayS(data);
        });
      }
    }, TICK_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Don't lose the last partial interval when the tab closes.
  useEffect(() => {
    function flush() {
      if (unsaved.current > 0) {
        const delta = unsaved.current;
        unsaved.current = 0;
        supabase.rpc("add_active_seconds", { delta });
      }
    }
    window.addEventListener("pagehide", flush);
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <footer className="border-t border-line mt-8">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 text-xs text-ink-soft">
        <span>
          Time on the app this session:{" "}
          <strong className="text-ink tabular-nums font-mono">
            {hms(sessionS)}
          </strong>
        </span>
        <span>
          Today in total:{" "}
          <strong className="text-ink tabular-nums font-mono">
            {todayS === null ? "—" : hms(todayS)}
          </strong>
        </span>
        <span className="text-ink-soft/70">🌱 Blair Lawn Care</span>
      </div>
    </footer>
  );
}
