import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { supabaseAnonKey, supabaseUrl } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Server-side Supabase client bound to the request's cookies so that
 * Row Level Security runs against the signed-in user. Use this in Server
 * Components, Route Handlers and Server Actions.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // `setAll` was called from a Server Component. This can be ignored
          // when middleware is refreshing the session, which is the case here.
        }
      },
    },
  });
}
