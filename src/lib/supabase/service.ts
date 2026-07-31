import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { getServiceRoleKey, supabaseUrl } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Service-role Supabase client. Bypasses Row Level Security.
 *
 * The `server-only` import guarantees a build error if this module is ever
 * pulled into a client bundle. Use it exclusively for trusted server-side
 * work such as writing shared catalog data (series / editions / volumes)
 * during the scan-import flow.
 */
export function createServiceClient() {
  return createSupabaseClient<Database>(supabaseUrl, getServiceRoleKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
