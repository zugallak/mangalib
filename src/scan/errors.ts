/**
 * Scan error taxonomy.
 *
 * `ScanTechnicalError` marks a *technical/structural* failure of a provider
 * (network, timeout, rate-limit, unparseable/invalid response, refusal for a
 * technical reason). Only these trigger the OpenAI fallback. A valid-but-empty
 * or partial result is NOT an error — it is shown to the user.
 */

export type ScanErrorCategory =
  | "network" // transport failure (DNS, connection, fetch failed) — no HTTP status
  | "timeout"
  | "rate_limit" // 429, temporary
  | "insufficient_quota" // 429 caused by billing/quota exhaustion
  | "server" // 5xx
  | "not_found" // 404 (e.g. model unavailable for this key)
  | "invalid_request" // 400
  | "auth" // 401 / 403
  | "invalid_response" // 2xx but unparseable / schema mismatch
  | "refused" // provider technically refused (e.g. missing key)
  | "unknown";

export class ScanTechnicalError extends Error {
  readonly category: ScanErrorCategory;
  readonly provider: string;
  /** HTTP status when the failure was an API response. */
  readonly status?: number;
  /** SDK/API error code (e.g. "insufficient_quota", "ENOTFOUND", "NOT_FOUND"). */
  readonly code?: string;

  constructor(
    provider: string,
    category: ScanErrorCategory,
    message: string,
    extra?: { status?: number; code?: string },
  ) {
    super(message);
    this.name = "ScanTechnicalError";
    this.provider = provider;
    this.category = category;
    this.status = extra?.status;
    this.code = extra?.code;
  }
}

export function isScanTechnicalError(err: unknown): err is ScanTechnicalError {
  return err instanceof ScanTechnicalError;
}

/** Raised when neither provider could produce a result. */
export class ScanUnavailableError extends Error {
  constructor(message = "All scan providers are unavailable") {
    super(message);
    this.name = "ScanUnavailableError";
  }
}

// ---------------------------------------------------------------------------
// Safe error introspection. Extracts non-sensitive diagnostic metadata from
// whatever a provider SDK throws. NEVER touches request bodies, image data or
// credentials — only the error's own name/status/code/message (+ fetch cause).
// ---------------------------------------------------------------------------

export interface ProviderErrorInfo {
  name: string;
  status?: number;
  code?: string;
  /** Short, sanitized human reason for server logs. */
  reason: string;
}

function truncate(text: string, max = 300): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function tryParseJson(text: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function extractErrorInfo(err: unknown): ProviderErrorInfo {
  if (err instanceof ScanTechnicalError) {
    return { name: err.name, status: err.status, code: err.code, reason: err.message };
  }

  const e = err as {
    name?: unknown;
    message?: unknown;
    status?: unknown;
    statusCode?: unknown;
    code?: unknown;
    cause?: { code?: unknown; message?: unknown };
  } | null;

  const name = typeof e?.name === "string" ? e.name : "Error";

  let status: number | undefined;
  const rawStatus = e?.status ?? e?.statusCode;
  if (typeof rawStatus === "number") status = rawStatus;
  else if (typeof rawStatus === "string" && /^\d+$/.test(rawStatus)) status = Number(rawStatus);

  let code: string | undefined = typeof e?.code === "string" ? e.code : undefined;
  let reason = typeof e?.message === "string" ? e.message : String(err ?? "unknown error");

  // @google/genai ApiError puts the Google error JSON in `message`.
  const parsed = tryParseJson(reason);
  const googleError = parsed?.error as
    | { code?: unknown; message?: unknown; status?: unknown }
    | undefined;
  if (googleError) {
    if (typeof googleError.status === "string" && !code) code = googleError.status; // e.g. NOT_FOUND
    if (typeof googleError.code === "number" && status === undefined) status = googleError.code;
    if (typeof googleError.message === "string") reason = googleError.message;
  }

  // undici fetch transport failures wrap the real reason in `cause`.
  const cause = e?.cause;
  if (cause && (name === "TypeError" || reason === "fetch failed")) {
    if (typeof cause.code === "string" && !code) code = cause.code;
    if (typeof cause.message === "string") reason = cause.message;
  }

  return { name, status, code, reason: truncate(reason) };
}

function categorize(info: ProviderErrorInfo): ScanErrorCategory {
  const { status, code, name, reason } = info;

  if (status === 429) {
    // OpenAI distinguishes billing exhaustion from a temporary rate limit.
    return code === "insufficient_quota" ? "insufficient_quota" : "rate_limit";
  }
  if (status !== undefined && status >= 500) return "server";
  if (status === 404) return "not_found";
  if (status === 400) return "invalid_request";
  if (status === 401 || status === 403) return "auth";

  // No usable HTTP status → likely a transport failure (this is the class of
  // error that previously collapsed into "unknown").
  const transportSignal =
    name === "TypeError" ||
    /fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up/i.test(
      reason,
    ) ||
    /^E[A-Z]+$/.test(code ?? "");
  if (status === undefined && transportSignal) return "network";

  return "unknown";
}

/**
 * Turn any provider error into a fallback-eligible ScanTechnicalError carrying
 * sanitized diagnostic metadata (status/code/reason) for server logs.
 */
export function classifyProviderError(provider: string, err: unknown): ScanTechnicalError {
  if (err instanceof ScanTechnicalError) return err;
  const info = extractErrorInfo(err);
  return new ScanTechnicalError(provider, categorize(info), info.reason, {
    status: info.status,
    code: info.code,
  });
}

/**
 * Race a promise against a timeout. On timeout, reject with a
 * ScanTechnicalError so the orchestrator can fall back.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, provider: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new ScanTechnicalError(provider, "timeout", `${provider} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
