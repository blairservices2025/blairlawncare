import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  supabaseConfigured,
} from "@/lib/supabase/env";

export async function proxy(request: NextRequest) {
  // Without Supabase credentials there is no session to read. Let the request
  // through so the pages can render a "setup needed" message, rather than
  // every request failing here with no explanation.
  if (!supabaseConfigured) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh the session and gate everything except /login
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The magic-link landing route must be reachable without a session —
  // that request is what creates the session in the first place.
  const path = request.nextUrl.pathname;
  const isLogin = path.startsWith("/login");
  if (path.startsWith("/auth/")) return response;

  if (!user && !isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (user && isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
