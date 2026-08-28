import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    globals: true,
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    env: {
      TURNSTILE_TEST_BYPASS: 'true',
      TURNSTILE_SECRET_KEY: 'integration-test-only',
    },
  },
});
