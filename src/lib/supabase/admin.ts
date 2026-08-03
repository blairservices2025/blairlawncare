import { createClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client used by the Square routes.
 *
 * Square's webhooks arrive with no signed-in user, so there is no session
 * for the row-level security rules to check. This client uses the service
 * role key to write those records. It must never be imported into
 * anything that reaches the browser — the key bypasses every access rule.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set"
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
