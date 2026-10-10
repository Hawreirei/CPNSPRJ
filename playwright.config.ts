import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

/**
 * End-to-end tests against the production build (`vite preview`), so the CSP, hash router
 * and relative base are the ones users get. Build first: `npm run test:e2e` does it.
 */
export default defineConfig({
  testDir: './e2e',
  // *.e2e.ts, not *.spec.ts, so Vitest's default pattern never picks these up.
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // The PWA service worker would cache the build between tests; every test starts clean.
    serviceWorkers: 'block',
    locale: 'id-ID',
    timezoneId: 'Asia/Jakarta',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: '**/*.mobile.e2e.ts' },
    // A phone with a touch screen (#69): Pixel 7, at 360 px wide like many cheaper Android phones.
    // Only the *.mobile.e2e.ts files run here, so CI time does not double.
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 360, height: 740 } }, testMatch: '**/*.mobile.e2e.ts' },
  ],
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
