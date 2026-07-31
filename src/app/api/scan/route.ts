import { NextResponse } from "next/server";

import { scanImage } from "@/scan/provider";
import { ScanUnavailableError } from "@/scan/errors";
import { createClient } from "@/lib/supabase/server";
import {
  MAX_UPLOAD_BYTES,
  MIN_UPLOAD_BYTES,
  isAllowedImageType,
} from "@/lib/scan-upload";

// Node.js runtime (Buffer, provider SDKs). Allow time for the model call.
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/scan — analyze a bookshelf photo.
 *
 * Auth is validated server-side: a crafted unauthenticated request can never
 * reach the paid AI providers. The image is analyzed and discarded — never
 * stored, never logged.
 */
export async function POST(request: Request) {
  // 1) Require an authenticated session.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  // 2) Read and validate the image.
  let file: File | null = null;
  try {
    const form = await request.formData();
    const value = form.get("image");
    if (value instanceof File) file = value;
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }

  if (!file) {
    return NextResponse.json({ error: "No image provided." }, { status: 400 });
  }
  if (!isAllowedImageType(file.type)) {
    return NextResponse.json(
      { error: "Unsupported image type. Use JPEG, PNG or WebP." },
      { status: 415 },
    );
  }
  if (file.size < MIN_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Image appears to be empty." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Image is too large." }, { status: 413 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  // 3) Analyze (Gemini primary, OpenAI fallback handled inside).
  try {
    const result = await scanImage({ bytes, mimeType: file.type });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ScanUnavailableError) {
      return NextResponse.json(
        { error: "Scanning is temporarily unavailable. Please try again." },
        { status: 503 },
      );
    }
    console.error("[scan] unexpected error", err instanceof Error ? err.message : "unknown");
    return NextResponse.json({ error: "Could not analyze the image." }, { status: 500 });
  }
}
