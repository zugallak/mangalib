import { createBrowserClient } from "@supabase/ssr";

import { supabaseAnonKey, supabaseUrl } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Browser-side Supabase client. Safe to use in client components.
 * Only ever uses the public anon key.
 */
export function createClient() {
  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
}
