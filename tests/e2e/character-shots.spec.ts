// CHAR-P2a evidence: each profile at the Waterfront spawn, third-person, first-person and one walking frame.
// Writes to CHAR_SHOTS_DIR (default test-results/char-shots); the evidence run points it at the evidence folder.
import { test, expect } from '@playwright/test';
import { frames, start, waitChunks } from './helpers.ts';

const dir = process.env.CHAR_SHOTS_DIR ?? 'test-results/char-shots';
const profiles = ['default', 'adult-man', 'adult-woman'];

for (const id of profiles) {
  test(`shots ${id}`, async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('k3d.quality', 'high'); } catch { /* ignore */ } });
    await page.goto(`./?char=${id}`);
    await start(page, { navigate: false });
    await waitChunks(page);
    await page.waitForFunction((id) => { const c = (window as any).__k3d.character; return c.id === id && !c.loading && !c.fallback; }, id, { timeout: 60_000 });
    // Settle: idle pose, camera at rest, streaming done.
    await frames(page, 90);
    await page.screenshot({ path: `${dir}/${id}-third-person.png` });
    // One walking frame: walk forward (run for the second half) and capture mid-stride.
    await page.evaluate(() => { const k = (window as any).__k3d; k.input.touchY = 1; k.input.touchRun = true; });
    await frames(page, 45);
    await page.screenshot({ path: `${dir}/${id}-walking.png` });
    await page.evaluate(() => { const k = (window as any).__k3d; k.input.touchY = 0; k.input.touchRun = false; });
    await frames(page, 60);
    await page.keyboard.press('KeyV');
    await frames(page, 30);
    expect(await page.evaluate(() => (window as any).__k3d.player.visual.root.visible)).toBe(false);
    await page.screenshot({ path: `${dir}/${id}-first-person.png` });
  });
}
