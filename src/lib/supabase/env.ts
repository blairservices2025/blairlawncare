/**
 * The app needs these two values to reach Supabase. They're set in Vercel
 * under Settings → Environment Variables (and in .env.local for local dev).
 *
 * When they're missing we want a page that SAYS so, not a crash — a crashed
 * request surfaces as an unexplained error, which is very hard to diagnose.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const missingEnvVars = [
  !SUPABASE_URL && "NEXT_PUBLIC_SUPABASE_URL",
  !SUPABASE_ANON_KEY && "NEXT_PUBLIC_SUPABASE_ANON_KEY",
].filter(Boolean) as string[];
