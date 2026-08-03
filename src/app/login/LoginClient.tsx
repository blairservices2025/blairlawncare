"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Input, Label } from "@/components/ui";
import PinPad from "@/components/PinPad";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  // Crew sign in with their email then their 4-digit code. The boss uses
  // a password or an emailed link.
  const [mode, setMode] = useState<"pin" | "link" | "password">("pin");
  const [askingPin, setAskingPin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    searchParams.get("error")
  );
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  function continueToPin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAskingPin(true);
  }

  /** Checked server-side; returns a message to show, or null when in. */
  async function submitPin(pin: string): Promise<string | null> {
    const res = await fetch("/api/auth/pin-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), pin }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return body.error ?? "That didn't work. Try again.";
    if (!body.tokenHash) return "Signed in, but no session came back.";

    // Redeem the one-time token here so this browser's Supabase client
    // holds the session — the rest of the app reads it from there.
    const { error: sessionErr } = await supabase.auth.verifyOtp({
      type: "email",
      token_hash: body.tokenHash,
    });
    if (sessionErr) return sessionErr.message;

    router.push("/");
    router.refresh();
    return null;
  }

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        // Only people the boss has already added can sign in. Without
        // this, typing any address at all would create a new account.
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=/`,
      },
    });

    setBusy(false);
    if (error) {
      setError(
        /signups not allowed|not found|invalid/i.test(error.message)
          ? "That email isn't set up yet. Ask the boss to add you."
          : error.message
      );
      return;
    }
    setSent(true);
  }

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <main className="min-h-screen flex items-center justify-center mow-stripes p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-cut mx-auto mb-3 flex items-center justify-center text-2xl">
            🌱
          </div>
          <h1 className="display text-[28px] font-semibold text-[var(--white)]">
            Blair Lawn Care
          </h1>
          <p className="text-sm text-[var(--white)]/60 mt-1">
            {mode === "pin"
              ? "Enter your email, then your code"
              : mode === "link"
                ? "Sign in with your email"
                : "Sign in"}
          </p>
        </div>

        <div className="bg-paper border border-line rounded-xl p-6 shadow-[0_20px_60px_rgba(0,0,0,0.25)]">
          {sent ? (
            <div className="text-center space-y-3">
              <div className="text-3xl">📬</div>
              <h2 className="display text-lg font-semibold">Check your email</h2>
              <p className="text-sm text-ink-soft">
                We sent a sign-in link to{" "}
                <strong className="text-ink">{email}</strong>. Open it on this
                device and you&apos;re in — no password needed.
              </p>
              <p className="text-xs text-ink-soft">
                It can take a minute to arrive, and it may land in spam the
                first time.
              </p>
              <Button
                variant="secondary"
                onClick={() => {
                  setSent(false);
                  setError(null);
                }}
                className="w-full"
              >
                Use a different email
              </Button>
            </div>
          ) : (
            <form
              onSubmit={
                mode === "pin"
                  ? continueToPin
                  : mode === "link"
                    ? sendLink
                    : signInWithPassword
              }
              className="space-y-4"
            >
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                  autoFocus
                />
              </div>

              {mode === "password" && (
                <div>
                  <Label>Password</Label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                  />
                </div>
              )}

              {error && (
                <p className="text-sm text-[var(--status-overdue-fg)]">{error}</p>
              )}

              <Button type="submit" disabled={busy} className="w-full">
                {busy
                  ? mode === "link"
                    ? "Sending…"
                    : "Signing in…"
                  : mode === "pin"
                    ? "Continue"
                    : mode === "link"
                      ? "Email me a sign-in link"
                      : "Sign in"}
              </Button>

              <div className="flex flex-col gap-1.5 pt-1">
                {mode !== "pin" && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode("pin");
                      setError(null);
                    }}
                    className="w-full text-xs text-ink-soft hover:text-cut underline"
                  >
                    Use my 4-digit code
                  </button>
                )}
                {mode !== "password" && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode("password");
                      setError(null);
                    }}
                    className="w-full text-xs text-ink-soft hover:text-cut underline"
                  >
                    Use a password instead
                  </button>
                )}
                {mode !== "link" && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode("link");
                      setError(null);
                    }}
                    className="w-full text-xs text-ink-soft hover:text-cut underline"
                  >
                    Email me a link instead
                  </button>
                )}
              </div>
            </form>
          )}
        </div>

        {askingPin && (
          <PinPad
            title="Your code"
            subtitle={email}
            onComplete={submitPin}
            onCancel={() => setAskingPin(false)}
          />
        )}

        <p className="text-xs text-[var(--white)]/50 text-center mt-4">
          Accounts are set up by the boss. If your email isn&apos;t recognised,
          ask to be added.
        </p>
      </div>
    </main>
  );
}

export default function LoginClient() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
