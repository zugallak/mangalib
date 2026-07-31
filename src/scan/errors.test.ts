import { describe, expect, it } from "vitest";

import { ScanTechnicalError, classifyProviderError, extractErrorInfo } from "@/scan/errors";

describe("classifyProviderError", () => {
  it("passes an existing ScanTechnicalError through unchanged", () => {
    const original = new ScanTechnicalError("gemini", "timeout", "slow");
    expect(classifyProviderError("gemini", original)).toBe(original);
  });

  it("classifies a 429 as rate_limit", () => {
    const err = classifyProviderError("openai", { status: 429, message: "Too Many Requests" });
    expect(err.category).toBe("rate_limit");
    expect(err.status).toBe(429);
  });

  it("distinguishes insufficient_quota from a plain rate limit", () => {
    const err = classifyProviderError("openai", {
      status: 429,
      code: "insufficient_quota",
      message: "You exceeded your current quota",
    });
    expect(err.category).toBe("insufficient_quota");
  });

  it("classifies 5xx as server and 404 as not_found", () => {
    expect(classifyProviderError("gemini", { status: 503 }).category).toBe("server");
    expect(classifyProviderError("gemini", { status: 404 }).category).toBe("not_found");
  });

  it("classifies 401/403 as auth and 400 as invalid_request", () => {
    expect(classifyProviderError("gemini", { status: 401 }).category).toBe("auth");
    expect(classifyProviderError("gemini", { status: 400 }).category).toBe("invalid_request");
  });

  it("classifies a transport failure (fetch failed, no status) as network", () => {
    const fetchErr = Object.assign(new TypeError("fetch failed"), {
      cause: Object.assign(new Error("getaddrinfo ENOTFOUND generativelanguage.googleapis.com"), {
        code: "ENOTFOUND",
      }),
    });
    const err = classifyProviderError("gemini", fetchErr);
    expect(err.category).toBe("network");
    expect(err.code).toBe("ENOTFOUND");
    // This is exactly the case that previously collapsed into "unknown".
    expect(err.category).not.toBe("unknown");
  });

  it("falls back to unknown only when nothing is identifiable", () => {
    expect(classifyProviderError("gemini", { message: "weird" }).category).toBe("unknown");
  });
});

describe("extractErrorInfo", () => {
  it("pulls status/code/message out of a @google/genai-style JSON error message", () => {
    const info = extractErrorInfo({
      name: "ApiError",
      status: 404,
      message: JSON.stringify({
        error: { code: 404, message: "models/foo is not found", status: "NOT_FOUND" },
      }),
    });
    expect(info.status).toBe(404);
    expect(info.code).toBe("NOT_FOUND");
    expect(info.reason).toBe("models/foo is not found");
  });

  it("never returns an over-long reason", () => {
    const info = extractErrorInfo({ message: "x".repeat(1000) });
    expect(info.reason.length).toBeLessThanOrEqual(301);
  });
});
