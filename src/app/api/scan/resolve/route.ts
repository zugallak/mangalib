import { NextResponse } from "next/server";

import { summarizeResolutions } from "@/domain/catalog";
import { resolveDetections } from "@/data/catalog";
import { createClient } from "@/lib/supabase/server";
import { reviewPayloadSchema } from "@/scan/review-schema";

export const runtime = "nodejs";

/**
 * POST /api/scan/resolve — read-only. Given reviewed detections, report how
 * each resolves against the shared catalog + the user's ownership, plus a
 * summary. No AI calls, no writes. Used to show the pre-import summary.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = reviewPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const resolutions = await resolveDetections(
      parsed.data.detections.map((d) => ({
        detectionId: d.detectionId,
        seriesTitle: d.seriesTitle,
        volumeNumber: d.volumeNumber,
        publisher: d.publisher,
      })),
    );
    return NextResponse.json({ resolutions, summary: summarizeResolutions(resolutions) });
  } catch (err) {
    console.error("[scan] resolve error", err instanceof Error ? err.message : "unknown");
    return NextResponse.json({ error: "Could not check your library." }, { status: 500 });
  }
}
