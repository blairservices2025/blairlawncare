import LoginClient from "./LoginClient";

// Rendered per-request so the build doesn't depend on the Supabase env vars.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <LoginClient />;
}
