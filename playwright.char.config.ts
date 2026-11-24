import { defineConfig } from '@playwright/test';

// Untracked, CHAR-P2a only: runs tests/e2e/character*.spec.ts against my own Vite on CHAR_PORT (never 5174).
// No webServer here: the Vite process is started and stopped by PID by the caller, inside the browser slot.
const PORT = Number(process.env.CHAR_PORT ?? 5183);
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: /(character|char-regression).*\.spec\.ts/,
  timeout: 240_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'test-results/char-e2e-results.json' }]],
  use: { baseURL: `http://localhost:${PORT}/`, channel: 'msedge', launchOptions: { args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] }, trace: 'off', video: 'off' },
  projects: [{ name: 'desktop-1920', use: { viewport: { width: 1920, height: 1080 } } }],
});
