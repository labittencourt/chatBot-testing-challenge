import { defineConfig, devices } from "@playwright/test";

// Two projects, both against the real dev servers and the real local Ollama
// model (never mocked, unlike unit/API):
// - "e2e": drives a real browser through the chat UI.
// - "eval": hits the backend directly via the `request` fixture (no
//   browser) to evaluate LLM response quality/consistency.
export default defineConfig({
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    {
      name: "e2e",
      testDir: "./tests/e2e",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:5173",
        trace: "on-first-retry",
      },
    },
    {
      name: "eval",
      testDir: "./tests/eval",
      use: {
        baseURL: "http://localhost:3001",
      },
    },
  ],
});
