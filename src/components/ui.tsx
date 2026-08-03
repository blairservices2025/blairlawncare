"use client";

import { ReactNode } from "react";

export function Card({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`bg-paper border border-line rounded-[10px] px-[22px] py-5 ${className}`}
    >
      {(title || action) && (
        <div className="flex items-baseline justify-between mb-4">
          {title && (
            <h2 className="display text-[16.5px] font-semibold text-ink">
              {title}
            </h2>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Accent stripe down the left edge of a KPI card, cycled by position. */
const STRIPES = ["bg-cut", "bg-sky", "bg-gold", "bg-soil"] as const;

export function StatTile({
  label,
  value,
  sub,
  tone = "default",
  accent = 0,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "good" | "warn" | "serious";
  accent?: number;
}) {
  const toneClass =
    tone === "good"
      ? "text-cut"
      : tone === "warn"
        ? "text-[var(--status-progress-fg)]"
        : tone === "serious"
          ? "text-[var(--status-overdue-fg)]"
          : "text-ink";
  return (
    <div className="relative overflow-hidden bg-paper border border-line rounded-[10px] px-5 py-[18px]">
      <span
        className={`absolute left-0 top-0 bottom-0 w-1 ${STRIPES[accent % STRIPES.length]}`}
      />
      <div className="text-xs font-medium text-ink-soft mb-2">{label}</div>
      <div className={`display text-[29px] font-semibold leading-none ${toneClass}`}>
        {value}
      </div>
      {sub && <div className="text-xs text-ink-soft mt-[7px]">{sub}</div>}
    </div>
  );
}

const badgeTones: Record<string, string> = {
  good: "bg-[var(--status-done-bg)] text-pine-light",
  warn: "bg-[var(--status-progress-bg)] text-[var(--status-progress-fg)]",
  serious: "bg-[var(--status-overdue-bg)] text-[var(--status-overdue-fg)]",
  neutral: "bg-[var(--status-upcoming-bg)] text-ink-soft",
};

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "good" | "warn" | "serious" | "neutral";
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-[20px] px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap ${badgeTones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Button({
  children,
  onClick,
  type = "button",
  variant = "primary",
  disabled,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "primary" | "secondary" | "danger" | "ghost";
  disabled?: boolean;
  className?: string;
}) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-[7px] px-4 py-2.5 text-[13px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-pine text-[var(--white)] hover:bg-pine-light",
    secondary:
      "bg-paper border border-line text-ink hover:border-cut hover:text-pine",
    danger:
      "bg-[var(--status-overdue-fg)] text-[var(--white)] hover:opacity-90",
    ghost: "text-ink-soft hover:text-pine hover:bg-bone-dim",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

const fieldClass =
  "w-full rounded-[7px] border border-line bg-paper px-3 py-2.5 text-[13px] text-ink placeholder:text-ink-soft/60 focus:outline-none focus:border-cut focus:ring-2 focus:ring-[var(--cut)]/20";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input {...props} className={`${fieldClass} ${props.className ?? ""}`} />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`${fieldClass} ${props.className ?? ""}`} />
  );
}

export function Textarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>
) {
  return (
    <textarea {...props} className={`${fieldClass} ${props.className ?? ""}`} />
  );
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <label className="block text-xs font-medium text-ink-soft mb-1.5">
      {children}
    </label>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-[rgba(30,32,25,0.45)] px-5 py-16 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className={`bg-paper rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.25)] w-full ${wide ? "max-w-[720px]" : "max-w-md"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-6 py-5">
          <h3 className="display text-lg font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="bg-bone-dim hover:bg-line w-[30px] h-[30px] rounded-full text-[15px] text-ink-soft flex items-center justify-center shrink-0"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="px-6 pt-2 pb-5">{children}</div>
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="text-[13px] text-ink-soft py-2">{children}</div>;
}

export function Th({ children }: { children: ReactNode }) {
  return (
    <th className="text-left text-[11px] font-semibold text-ink-soft uppercase tracking-[0.6px] pb-2.5 border-b border-line pr-3">
      {children}
    </th>
  );
}

export function Td({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <td className={`py-3 pr-3 border-b border-line text-[13.5px] align-middle ${className}`}>
      {children}
    </td>
  );
}

/** Horizontal magnitude bar — single hue, light track. */
export function BarRow({
  label,
  value,
  max,
  format,
}: {
  label: string;
  value: number;
  max: number;
  format: (v: number) => string;
}) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="w-36 shrink-0 truncate text-[13px]" title={label}>
        {label}
      </div>
      <div className="flex-1 h-4 rounded-[4px] bg-bone-dim overflow-hidden">
        <div className="h-4 rounded-[4px] bg-cut" style={{ width: `${pct}%` }} />
      </div>
      <div className="w-24 shrink-0 text-right text-[13px] font-mono text-ink">
        {format(value)}
      </div>
    </div>
  );
}
