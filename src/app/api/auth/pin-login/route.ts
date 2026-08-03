import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_FAILURES = 5;

/**
 * Sign a crew member in with their email and 4-digit code.
 *
 * There is no session yet when this runs, so the checks happen with the
 * service key. Once the code checks out, a one-time token is generated
 * and redeemed here on the server — the crew member never sees an email,
 * but the session they end up with is an ordinary Supabase session.
 *
 * Only employees can sign in this way. Four digits is a reasonable lock
 * on someone's own timesheet; it is not a reasonable lock on customer
 * records, invoices and card charging, so the boss account still needs a
 * password or a magic link.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    email?: string;
    pin?: string;
  } | null;

  const email = body?.email?.trim().toLowerCase();
  const pin = body?.pin?.trim();

  if (!email || !pin) {
    return NextResponse.json(
      { error: "Enter your email and code." },
      { status: 400 }
    );
  }
  if (!/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: "The code is 4 digits." }, { status: 400 });
  }

  const admin = createAdminClient();

  // Too many wrong guesses recently? Stop here.
  const { data: failures } = await admin.rpc("pin_login_recent_failures", {
    check_email: email,
  });
  if (typeof failures === "number" && failures >= MAX_FAILURES) {
    return NextResponse.json(
      {
        error:
          "Too many wrong codes. Wait 15 minutes and try again, or ask the boss to reset your code.",
      },
      { status: 429 }
    );
  }

  const { data: rows, error: checkErr } = await admin.rpc("check_pin_login", {
    check_email: email,
    check_pin: pin,
  });
  if (checkErr) {
    return NextResponse.json({ error: checkErr.message }, { status: 500 });
  }

  const result = Array.isArray(rows) ? rows[0] : rows;
  const matched = Boolean(result?.matched);

  if (!matched) {
    await admin.rpc("record_pin_login_attempt", {
      check_email: email,
      was_ok: false,
    });
    // Same wording whether the email is unknown or the code was wrong,
    // so this can't be used to find out who has an account.
    return NextResponse.json(
      { error: "That email and code don't match." },
      { status: 401 }
    );
  }

  if (result.role !== "employee") {
    await admin.rpc("record_pin_login_attempt", {
      check_email: email,
      was_ok: false,
    });
    return NextResponse.json(
      {
        error:
          "Admin accounts sign in with a password or an email link, not a 4-digit code.",
      },
      { status: 403 }
    );
  }

  // Mint a one-time token and redeem it here, which sets the session
  // cookies on the response without an email ever being sent.
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkErr || !link?.properties?.hashed_token) {
    return NextResponse.json(
      { error: linkErr?.message ?? "Could not start a session." },
      { status: 500 }
    );
  }

  const supabase = await createClient();
  const { error: verifyErr } = await supabase.auth.verifyOtp({
    type: "email",
    token_hash: link.properties.hashed_token,
  });
  if (verifyErr) {
    return NextResponse.json({ error: verifyErr.message }, { status: 500 });
  }

  await admin.rpc("record_pin_login_attempt", {
    check_email: email,
    was_ok: true,
  });
  await admin.rpc("clear_pin_login_failures", { check_email: email });

  return NextResponse.json({ ok: true });
}
