"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Input, Label } from "@/components/ui";

export default function LoginClient() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email,
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
          <div className="w-12 h-12 rounded-xl bg-cut mx-auto mb-3 flex items-center justify-center text-2xl">🌱</div>
          <h1 className="display text-[28px] font-semibold text-[var(--white)]">Blair Lawn Care</h1>
          <p className="text-sm text-[var(--white)]/60 mt-1">
            Sign in to your dashboard
          </p>
        </div>
        <form
          onSubmit={signIn}
          className="bg-paper border border-line rounded-xl p-6 shadow-[0_20px_60px_rgba(0,0,0,0.25)] space-y-4"
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
            />
          </div>
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
          {error && <p className="text-sm text-[var(--status-overdue-fg)]">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Signing in…" : "Sign in"}
          </Button>
          <p className="text-xs text-ink-soft text-center">
            Accounts are created by the boss in the Supabase dashboard.
          </p>
        </form>
      </div>
    </main>
  );
}
