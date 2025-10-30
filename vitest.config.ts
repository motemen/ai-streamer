import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [
      "**/node_modules/**",
      "**/tests/**", // PlaywrightのE2Eテストディレクトリを除外
      "**/*.e2e.test.{ts,js}",
      "**/playwright-report/**",
      "**/test-results/**",
    ],
  },
});
