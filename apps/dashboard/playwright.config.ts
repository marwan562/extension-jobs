import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 8_000, toHaveScreenshot: { maxDiffPixelRatio: 0.012 } },
  fullyParallel: false,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:18970/dashboard/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    reducedMotion: 'reduce'
  },
  webServer: {
    command: 'node --experimental-strip-types apps/dashboard/e2e/fixture-server.ts',
    cwd: resolve(import.meta.dirname, '../..'),
    url: 'http://127.0.0.1:18970/health',
    reuseExistingServer: false,
    timeout: 30_000
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } } }
  ]
});
