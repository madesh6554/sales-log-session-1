// @ts-check
const { defineConfig, devices } = require('@playwright/test');

const PORT = 3100;

module.exports = defineConfig({
  testDir: './tests',
  // One worker: the tests share a single database and read each other's totals.
  workers: 1,
  fullyParallel: false,
  reporter: [['list'], ['./tests/pass-fail-reporter.js']],

  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure'
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ],

  // Starts the app only if nothing is already serving on 3100. When it reuses an
  // existing server it leaves that server running afterwards.
  webServer: {
    command: 'npm start',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60000
  }
});
