"use client";

import { useEffect, useState } from "react";
import { Button, Input, Label, Modal } from "@/components/ui";
import { usd } from "@/lib/format";

export interface SquareCardOption {
  id: string;
  card_brand?: string;
  last_4?: string;
  exp_month?: number;
  exp_year?: number;
}

/**
 * Takes a real payment, so it asks once, plainly, showing the amount and
 * which card. The idempotency key is generated when the dialog opens and
 * reused for retries, so a double click or a flaky connection cannot
 * charge the customer twice.
 */
export default function ChargeCardModal({
  open,
  onClose,
  customerId,
  customerName,
  invoiceId,
  defaultAmount,
  description,
  onCharged,
}: {
  open: boolean;
  onClose: () => void;
  customerId: string | null;
  customerName: string;
  invoiceId?: string | null;
  defaultAmount?: number;
  description?: string;
  onCharged?: () => void;
}) {
  const [cards, setCards] = useState<SquareCardOption[]>([]);
  const [cardId, setCardId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [idempotencyKey, setIdempotencyKey] = useState("");

  useEffect(() => {
    if (!open || !customerId) return;
    setLoading(true);
    setError(null);
    setDone(null);
    setReason(null);
    setAmount(defaultAmount != null ? String(defaultAmount) : "");
    setIdempotencyKey(crypto.randomUUID());

    fetch(`/api/square/cards?customerId=${customerId}`)
      .then((r) => r.json())
      .then((body) => {
        setCards(body.cards ?? []);
        setCardId(body.cards?.[0]?.id ?? "");
        if (body.reason) setReason(body.reason);
        if (body.error) setError(body.error);
      })
      .catch(() => setError("Could not load cards from Square."))
      .finally(() => setLoading(false));
  }, [open, customerId, defaultAmount]);

  const selected = cards.find((c) => c.id === cardId);
  const numericAmount = Number(amount);

  async function charge() {
    if (!customerId || !cardId) return;
    if (!(numericAmount > 0)) {
      setError("Enter an amount greater than zero.");
      return;
    }
    if (
      !confirm(
        `Charge ${usd(numericAmount)} to ${customerName}'s ${selected?.card_brand ?? "card"} ending ${selected?.last_4 ?? "????"}?\n\nThis takes a real payment.`
      )
    )
      return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/square/charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          cardId,
          invoiceId: invoiceId ?? null,
          amount: numericAmount,
          cardLast4: selected?.last_4,
          idempotencyKey,
          note: description,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "The charge did not go through.");
      } else {
        setDone(
          `Charged ${usd(body.amount)} — Square says ${String(body.status).toLowerCase()}.`
        );
        onCharged?.();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "The charge did not go through.");
    }
    setBusy(false);
  }

  return (
    <Modal open={open} onClose={onClose} title={`Charge ${customerName}`}>
      {loading ? (
        <p className="text-sm text-ink-soft">Loading cards from Square…</p>
      ) : done ? (
        <div className="space-y-3">
          <p className="text-sm text-cut font-semibold">✔ {done}</p>
          <p className="text-[13px] text-ink-soft">
            {invoiceId
              ? "The invoice has been marked paid."
              : "Recorded in the payment history."}
          </p>
          <Button onClick={onClose} className="w-full">
            Done
          </Button>
        </div>
      ) : cards.length === 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-soft">
            {reason ??
              "This customer has no card saved in Square. A card has to be added on Square's side first — the app never handles card numbers."}
          </p>
          <Button variant="secondary" onClick={onClose} className="w-full">
            Close
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <Label>Card on file</Label>
            <div className="space-y-1.5">
              {cards.map((c) => (
                <label
                  key={c.id}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-[13px] cursor-pointer ${
                    cardId === c.id
                      ? "border-cut bg-bone-dim"
                      : "border-line hover:bg-bone-dim"
                  }`}
                >
                  <input
                    type="radio"
                    name="card"
                    checked={cardId === c.id}
                    onChange={() => setCardId(c.id)}
                    className="accent-[var(--cut)]"
                  />
                  <span className="font-semibold">{c.card_brand ?? "Card"}</span>
                  <span className="font-mono">•••• {c.last_4}</span>
                  {c.exp_month && c.exp_year && (
                    <span className="text-ink-soft ml-auto">
                      exp {String(c.exp_month).padStart(2, "0")}/
                      {String(c.exp_year).slice(-2)}
                    </span>
                  )}
                </label>
              ))}
            </div>
          </div>

          <div>
            <Label>Amount</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={!!invoiceId}
            />
            {invoiceId && (
              <p className="text-xs text-ink-soft mt-1">
                Taken from the invoice.
              </p>
            )}
          </div>

          {error && (
            <p className="text-sm text-[var(--status-overdue-fg)]">{error}</p>
          )}

          <div className="bg-bone-dim rounded-lg px-3 py-2 text-[13px]">
            About to charge{" "}
            <strong>
              {numericAmount > 0 ? usd(numericAmount) : "—"}
            </strong>{" "}
            to {selected?.card_brand ?? "card"} ending{" "}
            <strong>{selected?.last_4 ?? "????"}</strong>. This is real money.
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={charge} disabled={busy || !cardId}>
              {busy ? "Charging…" : "💳 Charge card"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
