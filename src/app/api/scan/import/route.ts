import { NextResponse } from "next/server";

import { importValidatedDetections } from "@/data/scan-import";
import { createClient } from "@/lib/supabase/server";
import { reviewPayloadSchema } from "@/scan/review-schema";

export const runtime = "nodejs";

/**
 * POST /api/scan/import — write. Adds only the new, validated volumes to the
 * user's library after explicit confirmation. Idempotent: already-owned
 * volumes never error or duplicate.
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
    const result = await importValidatedDetections(
      parsed.data.detections.map((d) => ({
        seriesTitle: d.seriesTitle,
        volumeNumber: d.volumeNumber,
        publisher: d.publisher,
      })),
    );
    return NextResponse.json(result);
  } catch (err) {
    console.error("[scan] import error", err instanceof Error ? err.message : "unknown");
    return NextResponse.json({ error: "Could not update your library." }, { status: 500 });
  }
}
