import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TopNav from "@/components/TopNav";
import ActiveTimeFooter from "@/components/ActiveTimeFooter";
import SetupNeeded from "@/components/SetupNeeded";
import { missingEnvVars, supabaseConfigured } from "@/lib/supabase/env";
import type { Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function BossLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!supabaseConfigured) return <SetupNeeded missing={missingEnvVars} />;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "boss") redirect("/employee");

  // Offered in the "switch to employee view" picker.
  const { data: employees } = await supabase
    .from("profiles")
    .select("*")
    .eq("is_active", true)
    .order("full_name");

  return (
    <div className="min-h-screen">
      <TopNav
        name={profile.full_name}
        employees={(employees as Profile[]) ?? []}
      />
      <main className="p-4 md:p-6 max-w-7xl w-full mx-auto">{children}</main>
      <ActiveTimeFooter />
    </div>
  );
}
