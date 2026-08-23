import { defineConfig, devices } from "@playwright/test";

const frontendPort = 15173;
const coordinatorPort = 18080;
const gameServerPort = 18081;
const frontendUrl = `http://127.0.0.1:${frontendPort}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : [["html", { open: "never" }]],
  use: {
    baseURL: frontendUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "go run ./cmd/game-server",
      cwd: "../backend",
      env: {
        PORT: String(gameServerPort),
        ALLOWED_ORIGINS: frontendUrl,
      },
      url: `http://127.0.0.1:${gameServerPort}/healthz`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "go run ./cmd/coordinator",
      cwd: "../backend",
      env: {
        PORT: String(coordinatorPort),
        GAME_SERVERS: `http://127.0.0.1:${gameServerPort}`,
        ALLOWED_ORIGINS: frontendUrl,
      },
      url: `http://127.0.0.1:${coordinatorPort}/healthz`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `npm run dev -- --host 127.0.0.1 --port ${frontendPort}`,
      env: {
        VITE_COORDINATOR_URL: `http://127.0.0.1:${coordinatorPort}`,
      },
      url: frontendUrl,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
