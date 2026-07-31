/**
 * Scan error taxonomy.
 *
 * `ScanTechnicalError` marks a *technical/structural* failure of a provider
 * (network, timeout, rate-limit, unparseable/invalid response, refusal for a
 * technical reason). Only these trigger the OpenAI fallback. A valid-but-empty
 * or partial result is NOT an error — it is shown to the user.
 */

export type ScanErrorCategory =
  | "network"
  | "timeout"
  | "rate_limit"
  | "invalid_response"
  | "refused"
  | "unknown";

export class ScanTechnicalError extends Error {
  readonly category: ScanErrorCategory;
  readonly provider: string;

  constructor(provider: string, category: ScanErrorCategory, message: string) {
    super(message);
    this.name = "ScanTechnicalError";
    this.provider = provider;
    this.category = category;
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

/**
 * Race a promise against a timeout. On timeout, reject with a
 * ScanTechnicalError so the orchestrator can fall back.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  provider: string,
): Promise<T> {
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
