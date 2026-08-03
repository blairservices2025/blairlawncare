import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SetupNeeded from "@/components/SetupNeeded";
import { missingEnvVars, supabaseConfigured } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!supabaseConfigured) return <SetupNeeded missing={missingEnvVars} />;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role === "boss") redirect("/dashboard");
  redirect("/employee");
}
