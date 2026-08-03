"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Modal } from "@/components/ui";

/* Square's Web Payments SDK attaches itself to window. */
interface SquareCardField {
  attach: (selector: string) => Promise<void>;
  tokenize: () => Promise<{
    status: string;
    token?: string;
    errors?: { message: string }[];
  }>;
  destroy?: () => Promise<void>;
}
interface SquarePayments {
  card: () => Promise<SquareCardField>;
}
declare global {
  interface Window {
    Square?: {
      payments: (appId: string, locationId: string) => SquarePayments;
    };
  }
}

/**
 * Collects a card and saves it against the customer in Square.
 *
 * The card number is typed into a frame served by Square and is tokenized
 * there — it never touches this app, its server or its database, which is
 * what keeps card-industry compliance on Square's side rather than yours.
 *
 * The consent tick is not decoration: Square requires the customer to
 * have agreed before a card is kept on file for future charges, and
 * storing one without that can get the account closed.
 */
export default function AddCardModal({
  open,
  onClose,
  customerId,
  customerName,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  customerId: string | null;
  customerName: string;
  onSaved?: () => void;
}) {
  const [status, setStatus] = useState<string | null>("Loading…");
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const cardRef = useRef<SquareCardField | null>(null);

  const setup = useCallback(async () => {
    setError(null);
    setDone(null);
    setConsent(false);
    setStatus("Loading…");

    const res = await fetch("/api/square/save-card");
    const cfg = await res.json().catch(() => ({}));
    if (!cfg.ready) {
      setStatus(null);
      setError(cfg.reason ?? "Square isn't set up for saving cards yet.");
      return;
    }

    // Load the SDK once; the sandbox has its own copy.
    const src =
      cfg.environment === "sandbox"
        ? "https://sandbox.web.squarecdn.com/v1/square.js"
        : "https://web.squarecdn.com/v1/square.js";

    if (!window.Square) {
      await new Promise<void>((resolve, reject) => {
        const existing = document.querySelector<HTMLScriptElement>(
          `script[src="${src}"]`
        );
        if (existing) {
          existing.addEventListener("load", () => resolve());
          existing.addEventListener("error", () => reject());
          return;
        }
        const el = document.createElement("script");
        el.src = src;
        el.onload = () => resolve();
        el.onerror = () => reject();
        document.head.appendChild(el);
      }).catch(() => {
        setError("Could not load Square's card form.");
      });
    }

    if (!window.Square) {
      setStatus(null);
      return;
    }

    try {
      const payments = window.Square.payments(cfg.applicationId, cfg.locationId);
      const card = await payments.card();
      await card.attach("#square-card-target");
      cardRef.current = card;
      setStatus(null);
    } catch (e) {
      setStatus(null);
      setError(e instanceof Error ? e.message : "Could not start the card form.");
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setup();
    return () => {
      cardRef.current?.destroy?.().catch(() => undefined);
      cardRef.current = null;
    };
  }, [open, setup]);

  async function save() {
    if (!cardRef.current || !customerId) return;
    if (!consent) {
      setError("Tick the box confirming the customer agreed.");
      return;
    }
    setBusy(true);
    setError(null);

    try {
      const result = await cardRef.current.tokenize();
      if (result.status !== "OK" || !result.token) {
        setError(
          result.errors?.map((e) => e.message).join("; ") ??
            "Please check the card details."
        );
        setBusy(false);
        return;
      }

      const res = await fetch("/api/square/save-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          sourceId: result.token,
          idempotencyKey: crypto.randomUUID(),
          consent: true,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Could not save the card.");
      } else {
        setDone(`Saved ${body.brand ?? "card"} ending ${body.last4}.`);
        onSaved?.();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the card.");
    }
    setBusy(false);
  }

  return (
    <Modal open={open} onClose={onClose} title={`Card on file — ${customerName}`}>
      {done ? (
        <div className="space-y-3">
          <p className="text-sm text-cut font-semibold">✔ {done}</p>
          <p className="text-[13px] text-ink-soft">
            Completed jobs for {customerName} can now be charged automatically
            when you bill them.
          </p>
          <Button onClick={onClose} className="w-full">
            Done
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[13px] text-ink-soft">
            Enter the card with the customer present. The number goes straight
            to Square — it never reaches this app.
          </p>

          {status && <p className="text-sm text-ink-soft">{status}</p>}

          <div
            id="square-card-target"
            className="rounded-lg border border-line bg-paper p-2 min-h-[52px]"
          />

          <label className="flex items-start gap-2 text-[13px] bg-bone-dim rounded-lg p-3">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 accent-[var(--cut)]"
            />
            <span>
              {customerName} agrees to Blair Lawn Care keeping this card on file
              and charging it for completed work.
            </span>
          </label>

          {error && (
            <p className="text-sm text-[var(--status-overdue-fg)]">{error}</p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={save} disabled={busy || !consent}>
              {busy ? "Saving…" : "Save card"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
