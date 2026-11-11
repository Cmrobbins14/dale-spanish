import { defineConfig, devices } from '@playwright/test';

// iPad + Safari's engine (WebKit), portrait and landscape, against the
// production build served from a GitHub-Pages-style subpath.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 240_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4180/dale-spanish/',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/serve-subpath.mjs 4180 dale-spanish',
    url: 'http://localhost:4180/dale-spanish/',
    reuseExistingServer: true,
  },
  projects: [
    { name: 'ipad-portrait', use: { ...devices['iPad Pro 11'], browserName: 'webkit' } },
    { name: 'ipad-landscape', use: { ...devices['iPad Pro 11 landscape'], browserName: 'webkit' } },
  ],
});
