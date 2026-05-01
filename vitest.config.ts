/**
 * Vitest configuration.
 *
 * Design notes (see Prompt 6 · Part A):
 *   - Tests are co-located under src/ with a `.test.ts` / `.test.tsx` suffix,
 *     plus a small set of API-route tests under `tests/api`.
 *   - We do NOT spin up a real database for tests. Prisma is mocked per-test
 *     with `vi.mock("@/lib/prisma", ...)`. This keeps the suite hermetic and
 *     fast so it can run in CI without infrastructure.
 *   - We use the `node` environment. We do not need jsdom — there are no
 *     React component tests at this stage.
 *   - The `@/` path alias is aligned with tsconfig.json so helpers can be
 *     imported exactly the same way as from application code.
 */
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    globals: false,
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "tests/**/*.test.ts",
    ],
    exclude: [
      "node_modules",
      ".next",
      // Match every ad-hoc build output directory (BUILD_DIR=.next-build-*).
      // The specific names used during audit / CI runs all fit this glob.
      ".next-build*/**",
    ],
    testTimeout: 10_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: [
        "src/lib/**/*.ts",
        "src/app/api/**/route.ts",
      ],
      exclude: [
        "**/*.test.ts",
        "**/*.d.ts",
      ],
    },
  },
});