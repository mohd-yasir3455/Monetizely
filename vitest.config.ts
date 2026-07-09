import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Unit tests cover the pure pricing engine. The e2e suite (Playwright)
    // lives in ./e2e and is run separately with `npm run test:e2e`.
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: { "@": resolve(__dirname, "./src") },
  },
});
