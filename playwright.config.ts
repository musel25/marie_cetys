import { defineConfig } from "@playwright/test";

const baseURL = "http://127.0.0.1:4177";

export default defineConfig({
  testDir: "./tests",
  testMatch: "browser.spec.ts",
  use: { baseURL, trace: "retain-on-failure" },
  webServer: {
    command: "npm run dev -- --port 4177 --strictPort",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
});
