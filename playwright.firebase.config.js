import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config.js';

// Same iPad/WebKit setup, against the Firebase emulators (?emulators).
export default defineConfig({
  ...base,
  testDir: 'tests/e2e-firebase',
  webServer: { ...base.webServer, command: 'node scripts/serve-subpath.mjs 4181 dale-spanish', url: 'http://localhost:4181/dale-spanish/' },
  use: { ...base.use, baseURL: 'http://localhost:4181/dale-spanish/', screenshot: 'only-on-failure' },
  projects: [{ name: 'ipad-firebase', use: { ...devices['iPad Pro 11'], browserName: 'webkit' } }],
});
