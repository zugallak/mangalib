import { z } from "zod";

import type { RawMangaDetection } from "@/domain/scan";

/**
 * Single source of truth for the provider output shape:
 *  - `rawDetectionSchema` validates parsed JSON server-side (never trust raw
 *    model output).
 *  - `SCAN_GEMINI_JSON_SCHEMA` / `OPENAI_JSON_SCHEMA` express the same shape in
 *    each SDK's structured-output format, both as standard JSON Schema.
 *
 * Nullability uses proper JSON Schema semantics (`type: [T, "null"]`) rather
 * than the legacy Gemini-native `{ nullable: true }` representation.
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

// Shared JSON Schema building blocks (kept in sync across providers).
const detectionProperties = {
  seriesTitle: { type: "string" },
  volumeNumber: { type: ["integer", "null"] },
  publisher: { type: ["string", "null"] },
  editionHint: { type: ["string", "null"] },
  confidence: { type: "number" },
  rawLabel: { type: ["string", "null"] },
  notes: { type: ["string", "null"] },
} as const;

const detectionRequired = [
  "seriesTitle",
  "volumeNumber",
  "publisher",
  "editionHint",
  "confidence",
  "rawLabel",
  "notes",
] as const;

/**
 * Gemini structured output. Passed via `responseJsonSchema` (current, standard
 * JSON Schema) — the SDK forwards it as-is, no legacy `Type`/`nullable`
 * conversion. `additionalProperties` is omitted (Gemini is strict about its
 * supported JSON Schema subset).
 */
export const SCAN_GEMINI_JSON_SCHEMA = {
  type: "object",
  properties: {
    detections: {
      type: "array",
      items: {
        type: "object",
        properties: detectionProperties,
        required: detectionRequired,
      },
    },
  },
  required: ["detections"],
} as const;

/**
 * OpenAI Structured Outputs JSON Schema. Strict mode requires every property in
 * `required` and `additionalProperties: false`.
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
          properties: detectionProperties,
          required: detectionRequired,
        },
      },
    },
    required: ["detections"],
  },
} as const;
