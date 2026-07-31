import "server-only";

import OpenAI from "openai";

import type { RawMangaDetection, ScanInput, ScanProvider } from "@/domain/scan";
import { OPENAI_MODEL, OPENAI_TIMEOUT_MS } from "@/scan/config";
import { ScanTechnicalError, classifyProviderError, withTimeout } from "@/scan/errors";
import { SCAN_SYSTEM_PROMPT } from "@/scan/prompt";
import { OPENAI_JSON_SCHEMA, scanResponseSchema, toRawDetections } from "@/scan/schema";

const PROVIDER = "openai";

function getApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new ScanTechnicalError(PROVIDER, "refused", "OPENAI_API_KEY is not set");
  return key;
}

export const openaiScanProvider: ScanProvider = {
  name: "openai",
  async analyze(input: ScanInput): Promise<RawMangaDetection[]> {
    // maxRetries: 0 — one attempt only, so a fallback can't multiply cost.
    const client = new OpenAI({ apiKey: getApiKey(), maxRetries: 0 });
    const dataUrl = `data:${input.mimeType};base64,${Buffer.from(input.bytes).toString("base64")}`;

    let text: string;
    try {
      const completion = await withTimeout(
        client.chat.completions.create({
          model: OPENAI_MODEL,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: SCAN_SYSTEM_PROMPT },
                { type: "image_url", image_url: { url: dataUrl } },
              ],
            },
          ],
          response_format: { type: "json_schema", json_schema: OPENAI_JSON_SCHEMA },
        }),
        OPENAI_TIMEOUT_MS,
        PROVIDER,
      );
      text = completion.choices[0]?.message?.content ?? "";
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
    throw new ScanTechnicalError(PROVIDER, "invalid_response", "OpenAI returned non-JSON output");
  }
  const parsed = scanResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new ScanTechnicalError(
      PROVIDER,
      "invalid_response",
      "OpenAI output did not match the expected schema",
    );
  }
  return toRawDetections(parsed.data);
}
