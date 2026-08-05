"use client";

import { useEffect, useState } from "react";

/**
 * A running clock that keeps its own time.
 *
 * This exists as its own component on purpose: ticking from the page
 * re-rendered every card on it once a second — the whole yard list, every
 * form — which is what made the page feel heavy while someone was clocked
 * in. Only this element repaints now.
 */
export default function Elapsed({
  from,
  className = "",
}: {
  from: string;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const total = Math.max(0, Math.floor((now - new Date(from).getTime()) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  return (
    <span className={className}>
      {h}:{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
    </span>
  );
}
