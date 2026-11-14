import { defineConfig } from '@playwright/test';

// Browser tests run against the Vite dev server with the system Edge (Chromium) and GPU enabled.
// Set K3D_CHANNEL=chromium to use Playwright's bundled browser instead (npx playwright install chromium).
const channel = process.env.K3D_CHANNEL === 'chromium' ? undefined : process.env.K3D_CHANNEL ?? 'msedge';
const launchOptions = { args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] };
const PORT = 5174;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'test-results/e2e-results.json' }]],
  use: { baseURL: `http://localhost:${PORT}/`, channel, launchOptions, trace: 'off', video: 'off' },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    { name: 'desktop-1920', use: { viewport: { width: 1920, height: 1080 } }, testIgnore: /touch/ },
    { name: 'laptop-1366', use: { viewport: { width: 1366, height: 768 } }, testMatch: /layout|production/ },
    { name: 'mobile-390', use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 }, testMatch: /layout|touch/ },
    { name: 'mobile-360', use: { viewport: { width: 360, height: 800 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 }, testMatch: /layout|touch/ },
  ],
});
