"use client";

import { useEffect, useState } from "react";

/**
 * A 4-digit keypad. Big touch targets so it works on a phone or a tablet
 * in the truck. `onComplete` fires as soon as the 4th digit is entered and
 * returns an error message to show, or null when the code was accepted.
 */
export default function PinPad({
  title,
  subtitle,
  onComplete,
  onCancel,
  footer,
}: {
  title: string;
  subtitle?: string;
  onComplete: (pin: string) => Promise<string | null>;
  onCancel: () => void;
  footer?: React.ReactNode;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (pin.length !== 4 || checking) return;
    setChecking(true);
    onComplete(pin).then((err) => {
      setChecking(false);
      if (err) {
        setError(err);
        setPin("");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  // Physical keyboard support — handy on a laptop.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (checking) return;
      if (/^\d$/.test(e.key)) {
        setError(null);
        setPin((p) => (p.length < 4 ? p + e.key : p));
      } else if (e.key === "Backspace") {
        setPin((p) => p.slice(0, -1));
      } else if (e.key === "Escape") {
        onCancel();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking]);

  function press(d: string) {
    if (checking) return;
    setError(null);
    setPin((p) => (p.length < 4 ? p + d : p));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-paper rounded-2xl shadow-xl w-full max-w-xs p-6">
        <h3 className="display text-center font-semibold text-lg">{title}</h3>
        {subtitle && (
          <p className="text-center text-sm text-ink-soft mt-1">{subtitle}</p>
        )}

        {/* Dots */}
        <div className="flex justify-center gap-3 my-6" aria-live="polite">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`w-4 h-4 rounded-full border-2 transition-colors ${
                i < pin.length
                  ? "bg-cut border-cut"
                  : "border-line bg-transparent"
              }`}
            />
          ))}
        </div>

        {error && (
          <p className="text-center text-sm text-[var(--status-overdue-fg)] mb-3">{error}</p>
        )}

        <div className="grid grid-cols-3 gap-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button
              key={d}
              onClick={() => press(d)}
              disabled={checking}
              className="h-14 rounded-xl bg-bone-dim text-xl font-semibold text-pine hover:bg-cut hover:text-[var(--white)] transition-colors disabled:opacity-50"
            >
              {d}
            </button>
          ))}
          <button
            onClick={onCancel}
            className="h-14 rounded-xl text-sm font-medium text-ink-soft hover:bg-bone-dim"
          >
            Cancel
          </button>
          <button
            onClick={() => press("0")}
            disabled={checking}
            className="h-14 rounded-xl bg-bone-dim text-xl font-semibold text-pine hover:bg-cut hover:text-[var(--white)] transition-colors disabled:opacity-50"
          >
            0
          </button>
          <button
            onClick={() => setPin((p) => p.slice(0, -1))}
            disabled={checking}
            className="h-14 rounded-xl text-xl text-ink-soft hover:bg-bone-dim disabled:opacity-50"
            aria-label="Delete"
          >
            ⌫
          </button>
        </div>

        {checking && (
          <p className="text-center text-xs text-ink-soft mt-3">Checking…</p>
        )}
        {footer && <div className="mt-4 text-center">{footer}</div>}
      </div>
    </div>
  );
}
