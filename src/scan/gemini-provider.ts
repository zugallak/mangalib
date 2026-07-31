import "server-only";

import { GoogleGenAI, Type } from "@google/genai";

import type { RawMangaDetection, ScanInput, ScanProvider } from "@/domain/scan";
import { GEMINI_MODEL, GEMINI_TIMEOUT_MS } from "@/scan/config";
import { ScanTechnicalError, withTimeout } from "@/scan/errors";
import { SCAN_SYSTEM_PROMPT } from "@/scan/prompt";
import { scanResponseSchema, toRawDetections } from "@/scan/schema";

const PROVIDER = "gemini";

/** Gemini structured-output schema (SDK-specific; mirrors schema.ts). */
const geminiResponseSchema = {
  type: Type.OBJECT,
  properties: {
    detections: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          seriesTitle: { type: Type.STRING },
          volumeNumber: { type: Type.INTEGER, nullable: true },
          publisher: { type: Type.STRING, nullable: true },
          editionHint: { type: Type.STRING, nullable: true },
          confidence: { type: Type.NUMBER },
          rawLabel: { type: Type.STRING, nullable: true },
          notes: { type: Type.STRING, nullable: true },
        },
        required: ["seriesTitle", "volumeNumber", "confidence"],
      },
    },
  },
  required: ["detections"],
} as const;

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new ScanTechnicalError(PROVIDER, "refused", "GEMINI_API_KEY is not set");
  return key;
}

/** Map an unknown SDK error to a fallback-eligible ScanTechnicalError. */
function toTechnicalError(err: unknown): ScanTechnicalError {
  if (err instanceof ScanTechnicalError) return err;
  const status =
    typeof err === "object" && err !== null && "status" in err
      ? Number((err as { status?: unknown }).status)
      : undefined;
  const category = status === 429 ? "rate_limit" : status && status >= 500 ? "network" : "unknown";
  return new ScanTechnicalError(PROVIDER, category, "Gemini request failed");
}

export const geminiScanProvider: ScanProvider = {
  name: "gemini",
  async analyze(input: ScanInput): Promise<RawMangaDetection[]> {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const base64 = Buffer.from(input.bytes).toString("base64");

    let text: string;
    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: [
            {
              role: "user",
              parts: [
                { inlineData: { mimeType: input.mimeType, data: base64 } },
                { text: SCAN_SYSTEM_PROMPT },
              ],
            },
          ],
          config: {
            responseMimeType: "application/json",
            responseSchema: geminiResponseSchema,
          },
        }),
        GEMINI_TIMEOUT_MS,
        PROVIDER,
      );
      text = response.text ?? "";
    } catch (err) {
      throw toTechnicalError(err);
    }

    return parseResponse(text);
  },
};

function parseResponse(text: string): RawMangaDetection[] {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ScanTechnicalError(PROVIDER, "invalid_response", "Gemini returned non-JSON output");
  }
  const parsed = scanResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new ScanTechnicalError(
      PROVIDER,
      "invalid_response",
      "Gemini output did not match the expected schema",
    );
  }
  return toRawDetections(parsed.data);
}
