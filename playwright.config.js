import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  timeout: 120000,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:3100',
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      executablePath: process.env.ATHENS_CHROMIUM || '/usr/bin/chromium',
      args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
    },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node tests/browser-server.js',
    url: 'http://127.0.0.1:3100/api/world',
    reuseExistingServer: false,
    timeout: 15000,
  },
});
