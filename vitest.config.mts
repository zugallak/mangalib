import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Minimal Vitest setup for pure-logic unit tests only (normalization,
 * dedupe, ownership partitioning, catalog helpers, fallback orchestration).
 * No DOM, no network — those paths are covered by manual/integration checks.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
