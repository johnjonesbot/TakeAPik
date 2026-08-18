import path from "node:path";
import { defineConfig } from "vitest/config";

const integration = process.env.RUN_INTEGRATION === "1";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") }
  },
  test: {
    include: integration ? ["tests/integration/**/*.test.ts"] : ["src/**/*.test.ts"],
    globalSetup: integration ? ["tests/integration/global-setup.ts"] : [],
    // Integration tests share one database; keep files sequential.
    fileParallelism: !integration,
    env: {
      NODE_ENV: "test",
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? "postgresql://takeapik:takeapik-dev@127.0.0.1:5432/takeapik_test",
      SESSION_SECRET: "test-session-secret-0123456789abcdef",
      TOKEN_HASH_PEPPER: "test-pepper-secret-0123456789abcdef",
      ROOT_DOMAIN: "takeapik.test",
      LOG_LEVEL: "error"
    }
  }
});
