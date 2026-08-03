"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import PinPad from "./PinPad";
import type { Profile } from "@/lib/types";

const NAV = [
  { href: "/dashboard", label: "Overview" },
  { href: "/jobs", label: "Jobs" },
  { href: "/customers", label: "Customers" },
  { href: "/invoices", label: "Invoices" },
  { href: "/revenue", label: "Revenue" },
  { href: "/schedule", label: "Schedule" },
  { href: "/receipts", label: "Receipts" },
  { href: "/timelogs", label: "Time Logs" },
  { href: "/crew", label: "Crew" },
  { href: "/settings", label: "Settings" },
];

export default function TopNav({
  name,
  employees,
}: {
  name: string;
  employees: Profile[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const [picking, setPicking] = useState(false);
  const [target, setTarget] = useState<Profile | null>(null);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  // Boss picked which employee's view to open — now ask for that
  // employee's PIN before switching.
  async function checkPin(pin: string): Promise<string | null> {
    if (!target) return "No employee selected.";

    const { data: hasPin } = await supabase.rpc("employee_has_pin", {
      employee: target.id,
    });

    // Nobody's set a PIN yet — let them through so they can create one.
    if (!hasPin) {
      router.push(`/employee?as=${target.id}&setpin=1`);
      return null;
    }

    const { data: ok, error } = await supabase.rpc("verify_employee_pin", {
      employee: target.id,
      pin,
    });
    if (error) return error.message;
    if (!ok) return "Wrong code. Try again.";

    setTarget(null);
    router.push(`/employee?as=${target.id}`);
    return null;
  }

  return (
    <>
      <header className="bg-sidebar sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4">
          {/* Title row */}
          <div className="flex items-center justify-between py-3">
            <Link href="/dashboard" className="font-bold text-white text-lg">
              🌱 Blair Lawn Care
            </Link>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setPicking(true)}
                className="text-xs text-white/80 hover:text-white border border-white/25 rounded-lg px-2.5 py-1.5"
              >
                🔀 Employee view
              </button>
              <div className="hidden sm:block text-right leading-tight">
                <div className="text-xs text-white/50">Signed in as</div>
                <div className="text-sm text-white font-medium">{name}</div>
              </div>
              <button
                onClick={signOut}
                className="text-xs text-white/60 hover:text-white"
              >
                Sign out
              </button>
            </div>
          </div>

          {/* Tab row */}
          <nav className="flex gap-1 overflow-x-auto -mx-1 px-1">
            {NAV.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`whitespace-nowrap rounded-t-lg px-3.5 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-background text-foreground"
                      : "text-white/70 hover:bg-sidebar-hover hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Which employee? */}
      {picking && !target && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setPicking(false)}
        >
          <div
            className="bg-surface rounded-2xl shadow-xl w-full max-w-xs p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold text-center mb-1">Whose view?</h3>
            <p className="text-sm text-muted text-center mb-4">
              Pick a crew member, then enter their code.
            </p>
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {employees.length === 0 && (
                <p className="text-sm text-muted text-center py-4">
                  No crew members yet.
                </p>
              )}
              {employees.map((e) => (
                <button
                  key={e.id}
                  onClick={() => setTarget(e)}
                  className="w-full text-left rounded-lg px-3 py-2.5 text-sm font-medium bg-accent-soft text-accent-strong hover:bg-accent hover:text-white transition-colors"
                >
                  {e.full_name}
                </button>
              ))}
            </div>
            <button
              onClick={() => setPicking(false)}
              className="w-full mt-3 text-sm text-muted hover:text-foreground py-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Their PIN */}
      {target && (
        <PinPad
          title={target.full_name}
          subtitle="Enter your 4-digit code"
          onComplete={checkPin}
          onCancel={() => {
            setTarget(null);
            setPicking(false);
          }}
          footer={
            <button
              onClick={() => router.push(`/employee?as=${target.id}&setpin=1`)}
              className="text-xs text-muted hover:text-accent underline"
            >
              Forgot your code?
            </button>
          }
        />
      )}
    </>
  );
}
