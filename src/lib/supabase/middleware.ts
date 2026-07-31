import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

/** Route that hosts the sign-in / create-account form. */
const LOGIN_PATH = "/login";

/**
 * Refreshes the Supabase session on every request and enforces auth
 * server-side (the recommended @supabase/ssr pattern for the Next.js App
 * Router):
 *   - unauthenticated + protected route  → redirect to /login
 *   - authenticated + /login             → redirect to /
 *
 * IMPORTANT: do not run other logic between creating the client and calling
 * getUser(), and always return the `supabaseResponse` (or copy its cookies)
 * so refreshed auth cookies reach the browser.
 *
 * When Supabase env is absent the app is in its "not configured" state; we
 * pass through so the setup notices can render instead of redirect-looping.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let supabaseResponse = NextResponse.next({ request });

  if (!isSupabaseConfigured) return supabaseResponse;

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        supabaseResponse = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLoginRoute = request.nextUrl.pathname === LOGIN_PATH;

  if (!user && !isLoginRoute) {
    const url = request.nextUrl.clone();
    url.pathname = LOGIN_PATH;
    return NextResponse.redirect(url);
  }

  if (user && isLoginRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
