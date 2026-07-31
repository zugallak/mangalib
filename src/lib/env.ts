/**
 * Centralised access to environment variables.
 *
 * Public variables are always available (browser + server).
 * The service-role key is server-only and must never be imported into
 * client components.
 */

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

/**
 * The public client key. This variable accepts either the legacy anon JWT or
 * the newer Supabase publishable key (`sb_publishable_…`) — both are safe to
 * expose to the browser and are consumed the same way by @supabase/ssr. The
 * variable name is kept as ANON_KEY for compatibility rather than renamed.
 */
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/**
 * True when the public Supabase configuration is present. Used to let the
 * app render a friendly "not configured yet" state instead of crashing
 * before the user has set up their Supabase project.
 */
export const isSupabaseConfigured = supabaseUrl.length > 0 && supabaseAnonKey.length > 0;

/**
 * Server-only. Reading this from a client bundle will simply yield undefined
 * because the variable is not prefixed with NEXT_PUBLIC_.
 */
export function getServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }
  return key;
}
