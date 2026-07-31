import { z } from "zod";

import type { RawMangaDetection } from "@/domain/scan";

/**
 * Single source of truth for the provider output shape:
 *  - `rawDetectionSchema` validates parsed JSON server-side (never trust raw
 *    model output).
 *  - `OPENAI_JSON_SCHEMA` / `geminiResponseSchema` express the same shape in
 *    each SDK's structured-output format.
 *
 * All fields are required + nullable so strict structured-output modes are
 * satisfied while still allowing "unknown".
 */
export const rawDetectionSchema = z.object({
  seriesTitle: z.string(),
  volumeNumber: z.number().nullable(),
  publisher: z.string().nullable(),
  editionHint: z.string().nullable(),
  confidence: z.number(),
  rawLabel: z.string().nullable(),
  notes: z.string().nullable(),
});

export const scanResponseSchema = z.object({
  detections: z.array(rawDetectionSchema),
});

export type ParsedScanResponse = z.infer<typeof scanResponseSchema>;

/** Narrowing helper: parsed items already conform to RawMangaDetection. */
export function toRawDetections(parsed: ParsedScanResponse): RawMangaDetection[] {
  return parsed.detections;
}

/**
 * OpenAI Structured Outputs JSON Schema. Strict mode requires every property
 * to be listed in `required` and `additionalProperties: false`. Nullability is
 * expressed via `type: [T, "null"]`.
 */
export const OPENAI_JSON_SCHEMA = {
  name: "manga_scan",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      detections: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            seriesTitle: { type: "string" },
            volumeNumber: { type: ["integer", "null"] },
            publisher: { type: ["string", "null"] },
            editionHint: { type: ["string", "null"] },
            confidence: { type: "number" },
            rawLabel: { type: ["string", "null"] },
            notes: { type: ["string", "null"] },
          },
          required: [
            "seriesTitle",
            "volumeNumber",
            "publisher",
            "editionHint",
            "confidence",
            "rawLabel",
            "notes",
          ],
        },
      },
    },
    required: ["detections"],
  },
} as const;
