import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listCustomerCards, squareConfigured } from "@/lib/square";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Boss-only: the cards a customer has saved in Square. */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "boss") {
    return NextResponse.json({ error: "Boss only" }, { status: 403 });
  }

  if (!squareConfigured()) {
    return NextResponse.json({ cards: [], reason: "Square is not connected." });
  }

  const customerId = request.nextUrl.searchParams.get("customerId");
  if (!customerId) {
    return NextResponse.json({ error: "customerId is required" }, { status: 400 });
  }

  const { data: customer } = await supabase
    .from("customers")
    .select("square_customer_id")
    .eq("id", customerId)
    .single();

  if (!customer?.square_customer_id) {
    return NextResponse.json({
      cards: [],
      reason:
        "This customer isn't linked to Square yet. Sync from Settings, or add them in Square first.",
    });
  }

  try {
    const cards = await listCustomerCards(customer.square_customer_id);
    return NextResponse.json({ cards });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not reach Square" },
      { status: 502 }
    );
  }
}
