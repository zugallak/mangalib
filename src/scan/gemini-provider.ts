import "server-only";

import { GoogleGenAI } from "@google/genai";

import type { RawMangaDetection, ScanInput, ScanProvider } from "@/domain/scan";
import { GEMINI_MODEL, GEMINI_TIMEOUT_MS } from "@/scan/config";
import { ScanTechnicalError, classifyProviderError, withTimeout } from "@/scan/errors";
import { SCAN_SYSTEM_PROMPT } from "@/scan/prompt";
import { SCAN_GEMINI_JSON_SCHEMA, scanResponseSchema, toRawDetections } from "@/scan/schema";

const PROVIDER = "gemini";

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new ScanTechnicalError(PROVIDER, "refused", "GEMINI_API_KEY is not set");
  return key;
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
            // Current standard JSON Schema representation (not legacy nullable).
            responseJsonSchema: SCAN_GEMINI_JSON_SCHEMA,
          },
        }),
        GEMINI_TIMEOUT_MS,
        PROVIDER,
      );
      text = response.text ?? "";
    } catch (err) {
      throw classifyProviderError(PROVIDER, err);
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
