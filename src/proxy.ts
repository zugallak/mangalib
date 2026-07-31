import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

/**
 * Next.js 16 renamed the request-interception convention from `middleware`
 * to `proxy` (same capability, runs before the cache). This refreshes the
 * Supabase session and enforces auth on every navigated route.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on all request paths except static assets and metadata files so the
     * session is refreshed everywhere the user actually navigates:
     *   _next/static, _next/image, favicon, PWA manifest/icons, image files.
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
