"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: "🏠" },
  { href: "/jobs", label: "Jobs", icon: "🌿" },
  { href: "/customers", label: "Customers", icon: "👥" },
  { href: "/invoices", label: "Invoices", icon: "🧾" },
  { href: "/revenue", label: "Revenue", icon: "📈" },
  { href: "/schedule", label: "Schedule", icon: "📅" },
  { href: "/receipts", label: "Receipts", icon: "📸" },
  { href: "/timelogs", label: "Time Logs", icon: "⏱️" },
  { href: "/crew", label: "Crew", icon: "🧑‍🌾" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

export default function Sidebar({ name }: { name: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const nav = (
    <nav className="flex-1 space-y-0.5 px-3">
      {NAV.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-accent text-white"
                : "text-white/70 hover:bg-sidebar-hover hover:text-white"
            }`}
          >
            <span className="text-base leading-none">{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
      <Link
        href="/employee"
        onClick={() => setOpen(false)}
        className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-white/70 hover:bg-sidebar-hover hover:text-white mt-4 border-t border-white/10 pt-4"
      >
        <span className="text-base leading-none">🔀</span>
        Employee view
      </Link>
    </nav>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden sticky top-0 z-40 flex items-center justify-between bg-sidebar px-4 py-3">
        <span className="font-bold text-white">🌱 Blair Lawn Care</span>
        <button
          onClick={() => setOpen(!open)}
          className="text-white text-xl"
          aria-label="Toggle menu"
        >
          ☰
        </button>
      </div>
      {open && (
        <div className="md:hidden fixed inset-0 z-40 bg-sidebar pt-14 flex flex-col pb-4">
          {nav}
          <div className="px-6 pt-3">
            <button
              onClick={signOut}
              className="text-sm text-white/60 hover:text-white"
            >
              Sign out ({name})
            </button>
          </div>
        </div>
      )}
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 shrink-0 flex-col bg-sidebar min-h-screen sticky top-0 max-h-screen">
        <div className="px-5 py-5">
          <div className="text-lg font-bold text-white leading-tight">
            🌱 Blair
            <br />
            Lawn Care
          </div>
        </div>
        {nav}
        <div className="px-6 py-4 border-t border-white/10">
          <div className="text-xs text-white/50 mb-1">Signed in as</div>
          <div className="text-sm text-white font-medium truncate">{name}</div>
          <button
            onClick={signOut}
            className="text-xs text-white/60 hover:text-white mt-2"
          >
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
