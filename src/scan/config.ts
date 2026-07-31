import "server-only";

/**
 * Centralized scan/model configuration. Model names live here only — never
 * scattered through provider code.
 *
 * Defaults are current image-capable models. Override per-deployment with the
 * server-side env vars GEMINI_MODEL / OPENAI_MODEL (do NOT prefix with
 * NEXT_PUBLIC_ — these must stay server-only).
 */

/**
 * Default: `gemini-3.6-flash` — a fast, inexpensive, multimodal Flash model
 * with JSON response schemas, ideal for reading many spines from one photo.
 *
 * We pin a stable version rather than the `*-latest` alias on purpose: the
 * alias can move between model versions, whereas we want scan behavior to stay
 * stable unless we intentionally change it. Override per-deployment with the
 * server-side GEMINI_MODEL env var (e.g. to try a newer model).
 */
export const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.6-flash";

/**
 * GPT-4o: strong vision model with strict JSON-schema structured outputs.
 * Used only on fallback, so quality is prioritized over per-call cost.
 */
export const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o";

/** Per-provider wall-clock timeout. One attempt each; no cost-multiplying retries. */
export const GEMINI_TIMEOUT_MS = 45_000;
export const OPENAI_TIMEOUT_MS = 45_000;
