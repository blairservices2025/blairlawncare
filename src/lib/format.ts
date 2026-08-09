export const usd = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n % 1 === 0 ? 0 : 2,
  });

export const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

export const fmtClock = (t: string) => {
  // "13:30:00" -> "1:30 PM"
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, "0")} ${ampm}`;
};

export const hoursBetween = (a: string, b: string | null) => {
  const end = b ? new Date(b).getTime() : Date.now();
  return (end - new Date(a).getTime()) / 3600000;
};

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const addDays = (iso: string, days: number) => {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * The Sunday that starts the week containing the given ISO date.
 *
 * The working week here runs Sunday to Saturday, so a new board comes up on
 * Sunday morning rather than the crew spending that day looking at the week
 * they have just finished.
 */
export const weekStartOf = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return addDays(iso, -d.getDay());
};

/**
 * The oldest a to-do can be and still appear on a list.
 *
 * A week is long enough to be useful; past that the list becomes a scroll of
 * things nobody is going to do, and the ones that matter get lost in it.
 *
 * Nothing is deleted — an old to-do is only hidden, so it still comes out in
 * the spreadsheet export on the Settings page. Cut to the day rather than to
 * the hour so the list doesn't quietly change while someone is reading it.
 */
export const todoCutoff = () => addDays(todayISO(), -7);

export const dayLabel = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

export const daysOverdue = (dueDate: string) => {
  const due = new Date(dueDate + "T00:00:00").getTime();
  return Math.floor((Date.now() - due) / 86400000);
};

export const fmtDuration = (hours: number) => {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
};
