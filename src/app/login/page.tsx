import LoginClient from "./LoginClient";
import SetupNeeded from "@/components/SetupNeeded";
import { missingEnvVars, supabaseConfigured } from "@/lib/supabase/env";

// Rendered per-request so the build doesn't depend on the Supabase env vars.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  if (!supabaseConfigured) return <SetupNeeded missing={missingEnvVars} />;
  return <LoginClient />;
}
