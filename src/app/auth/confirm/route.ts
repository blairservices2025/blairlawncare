import { type EmailOtpType } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Where the sign-in link in the email lands. Exchanges the one-time token
 * for a session, then sends them on to their dashboard.
 *
 * The link is single use and expires, so a forwarded or leaked email
 * cannot be replayed later.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  if (!token_hash || !type) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("That sign-in link was incomplete. Please request a new one.")}`
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash });

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(
        "That link has expired or was already used. Please request a new one."
      )}`
    );
  }

  // Only allow redirects inside this app.
  const target = next.startsWith("/") ? next : "/";
  return NextResponse.redirect(`${origin}${target}`);
}
