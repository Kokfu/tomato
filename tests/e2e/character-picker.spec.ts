// CHAR-P5 G2: the character selection screen, in the real game (desktop, system Edge). Everything is behind ?char.
//   P1 first launch: picker before the world, nothing loaded until a choice, HUD hidden, no Cancel, choice persisted
//   P2 returning player: saved choice, no picker, toast; P3 unknown / retired saved id: picker again
//   P4 keyboard: radiogroup, roving tabindex, arrows, Enter, focus trap, Escape (first: nothing; change: back to the pause menu)
//   P5 Change Character from the pause menu: position, heading, camera mode kept; resumes; blocked in the car and in fly mode
//   P5c/P5d/P5e (fix round 1) blocked while finding the car; a trip ending behind the open picker does not resume the game; no (P) hint on touch
//   P6 selecting while the preload is incomplete (delayed GLB): Confirm waits for it, no error, one install
//   P7 load error: "Try again", "You're still playing as X", nothing persisted, the old model stays
//   P8 rapid switching through the picker; P9 no flag: the picker does not exist and is never requested
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { start, waitChunks, frames } from './helpers.ts';

const DEV_NOISE = /WebSocket|\[vite\]|Vite server/;
const SIX = ['man', 'woman', 'teen-boy', 'teen-girl', 'young-boy', 'young-girl'];
const card = (page: Page, id: string) => page.locator(`#char-picker [role=radio][data-id=${id}]`);

interface Run { errors: string[]; warns: string[]; reqs: string[] }

/** Open the game. `saved`: the k3d.character value to start with (null: none). */
async function boot(page: Page, query: string, saved: string | null, opts: { press?: boolean } = {}): Promise<Run> {
  const run: Run = { errors: [], warns: [], reqs: [] };
  page.on('request', (r) => run.reqs.push(r.url()));
  page.on('console', (m) => {
    if (m.type() === 'error' && !DEV_NOISE.test(m.text()) && !/Failed to load resource/.test(m.text())) run.errors.push(m.text());
    if (m.type() === 'warning') run.warns.push(m.text());
  });
  page.on('pageerror', (e) => { if (!DEV_NOISE.test(e.message)) run.errors.push(`pageerror: ${e.message}`); });
  await page.addInitScript((saved) => {
    try {
      localStorage.setItem('k3d.quality', 'low');
      if (!sessionStorage.getItem('k3d.test.seeded')) {
        sessionStorage.setItem('k3d.test.seeded', '1');
        if (saved === null) localStorage.removeItem('k3d.character'); else localStorage.setItem('k3d.character', saved);
      }
    } catch { /* ignore */ }
  }, saved);
  // N1-M8: life=0 keeps the walkers (N1-M6), who share the default character model, out of the request checks
  await page.goto(`./${query}${query ? '&' : '?'}life=0`);
  if (opts.press !== false) await start(page, { navigate: false });
  return run;
}
const hook = <T>(page: Page, fn: string): Promise<T> => page.evaluate(`(() => { const k = window.__k3d; return (${fn}); })()`) as Promise<T>;
const settled = (page: Page, id: string) => page.waitForFunction((id) => { const c = (window as any).__k3d.character; return c.id === id && !c.loading && !c.fallback; }, id, { timeout: 60_000 });
const saved = (page: Page) => page.evaluate(() => localStorage.getItem('k3d.character'));
const display = (page: Page, sel: string) => page.evaluate((sel) => { const e = document.querySelector(sel); return e ? getComputedStyle(e).display : 'missing'; }, sel);
const characterGlbs = (run: Run) => run.reqs.filter((u) => /\/models\/characters\/[^/?]+\.glb/.test(u)).map((u) => /([^/?]+\.glb)/.exec(u)![1]);

test.describe.configure({ mode: 'serial' });

test('P1 first launch: the picker comes before the world, loads nothing until a choice, hides the HUD, has no Cancel, and the choice is saved', async ({ page }) => {
  test.setTimeout(150_000);
  const run = await boot(page, '?char', null);
  const pk = page.locator('#char-picker');
  await expect(pk).toBeVisible({ timeout: 60_000 });
  await expect(pk).toHaveAttribute('role', 'dialog');
  await expect(page.locator('#pk-title')).toHaveText('Choose your character');
  await expect(page.locator('#pk-sub')).toContainText('Pilih watak anda');
  expect(await page.locator('#char-picker [role=radio]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.id))).toEqual(SIX);
  expect(await page.locator('#char-picker .pk-name').allTextContents()).toEqual(['Man', 'Woman', 'Teen boy', 'Teen girl', 'Young boy', 'Young girl']);
  expect(await display(page, '#hud')).toBe('none');
  expect(await display(page, '#touch')).toBe('none');
  await expect(page.locator('#pk-cancel')).toBeHidden();
  await expect(page.locator('#pk-confirm')).toBeDisabled();
  expect(characterGlbs(run), 'no character model is fetched before the player chooses').toEqual([]);
  expect(await hook(page, 'k.character.needsPick')).toBe(true);
  expect(await hook(page, 'k.input.enabled'), 'the game ignores input while the picker is open').toBe(false);
  await card(page, 'teen-girl').click();
  await expect(page.locator('#pk-confirm')).toHaveText(/Play as Teen girl/);
  await page.locator('#pk-confirm').click();
  await expect(pk).toBeHidden({ timeout: 60_000 });
  await settled(page, 'teen-girl');
  expect(await saved(page)).toBe('teen-girl');
  expect(await display(page, '#hud')).not.toBe('none');
  expect(await hook(page, 'k.input.enabled')).toBe(true);
  expect(characterGlbs(run).filter((g) => g !== 'teen-girl.glb')).toEqual([]);
  await waitChunks(page);
  expect(run.errors).toEqual([]);
});

test('P2 returning player: starts with the saved character, no picker, a toast that says where to change it', async ({ page }) => {
  test.setTimeout(150_000);
  const run = await boot(page, '?char', 'young-boy');
  await settled(page, 'young-boy');
  await expect(page.locator('#char-picker')).toHaveCount(0);
  await expect(page.locator('#toast')).toContainText('Playing as Young boy');
  await expect(page.locator('#toast')).toContainText('pause menu');
  expect(await hook(page, 'k.character.needsPick')).toBe(false);
  expect(await hook(page, 'k.input.enabled')).toBe(true);
  expect(run.errors).toEqual([]);
});

for (const bad of ['adult-man', 'adult-woman', 'removed-character-id', 'test-short']) {
  test(`P3 an unknown or retired saved id (${bad}) falls back to the picker, not to a broken game`, async ({ page }) => {
    test.setTimeout(150_000);
    const run = await boot(page, '?char', bad);
    await expect(page.locator('#char-picker')).toBeVisible({ timeout: 60_000 });
    await card(page, 'man').click();
    await page.locator('#pk-confirm').click();
    await settled(page, 'man');
    expect(await saved(page)).toBe('man');
    expect(characterGlbs(run).filter((g) => g !== 'man.glb')).toEqual([]);
    expect(run.errors).toEqual([]);
  });
}

test('P4 keyboard: radiogroup with one Tab stop, arrows, Enter confirms, the focus is trapped, Escape does nothing on first launch', async ({ page }) => {
  test.setTimeout(150_000);
  const run = await boot(page, '?char', null);
  await expect(page.locator('#char-picker')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#char-picker [role=radiogroup]')).toHaveCount(1);
  const tabStops = () => page.locator('#char-picker [role=radio]').evaluateAll((els) => els.filter((e) => (e as HTMLElement).tabIndex === 0).map((e) => (e as HTMLElement).dataset.id));
  expect(await tabStops()).toEqual(['man']);
  await expect(card(page, 'man')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(card(page, 'woman')).toBeFocused();
  await expect(card(page, 'woman')).toHaveAttribute('aria-checked', 'true');
  expect(await tabStops()).toEqual(['woman']);
  await page.keyboard.press('End');
  await expect(card(page, 'young-girl')).toBeFocused();
  await page.keyboard.press('Home');
  await expect(card(page, 'man')).toBeFocused();
  await page.keyboard.press('ArrowLeft'); // wraps
  await expect(card(page, 'young-girl')).toBeFocused();
  // Tab: card -> confirm -> (no Cancel on first launch) back to the card; Shift+Tab the other way. Never out of the dialog.
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('#char-picker')), `Tab ${i}`).toBe(true);
  }
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('#char-picker')), `Shift+Tab ${i}`).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('#char-picker')).toBeVisible();
  // game keys do not leak through while it is open
  const before = await hook<{ x: number; z: number }>(page, '({ x: k.player.position.x, z: k.player.position.z })');
  await card(page, 'teen-boy').focus();
  await page.keyboard.down('KeyW'); await page.waitForTimeout(400); await page.keyboard.up('KeyW');
  const after = await hook<{ x: number; z: number }>(page, '({ x: k.player.position.x, z: k.player.position.z })');
  expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(0.01);
  await page.keyboard.press('ArrowLeft'); // teen-boy -> woman (left neighbour)
  await page.keyboard.press('Enter');
  await expect(page.locator('#char-picker')).toBeHidden({ timeout: 60_000 });
  await settled(page, 'woman');
  expect(await saved(page)).toBe('woman');
  expect(run.errors).toEqual([]);
});

test('P5 Change Character from the pause menu: the same place and camera, resumes the game, Escape cancels back to the pause menu', async ({ page }) => {
  test.setTimeout(180_000);
  const run = await boot(page, '?char', 'man');
  await settled(page, 'man');
  await waitChunks(page);
  // move away from the spawn, turn the camera and switch to first-person so there is state to keep
  await page.keyboard.down('KeyW'); await page.waitForTimeout(900); await page.keyboard.up('KeyW');
  const snap = () => hook<{ x: number; y: number; z: number; h: number; fp: boolean; dist: number }>(page, '({ x: k.player.position.x, y: k.player.position.y, z: k.player.position.z, h: k.player.heading, fp: k.tpc.firstPerson, dist: k.tpc.distance ?? 0 })');
  await page.waitForFunction(() => (window as any).__k3d.player.speed < 0.001, null, { timeout: 10_000 }); // standing still: a glide to a stop is not part of the claim
  await frames(page, 3);
  const a = await snap();
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause')).toBeVisible();
  const btn = page.locator('#pause-char');
  await expect(btn).toBeVisible();
  await expect(btn).toHaveText(/Change character/);
  await expect(btn).not.toHaveAttribute('aria-disabled', 'true');
  // Cancel path
  await btn.click();
  await expect(page.locator('#char-picker')).toBeVisible();
  await expect(page.locator('#pause')).toBeHidden();
  await expect(card(page, 'man')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#pk-confirm')).toHaveText(/Already playing/);
  await expect(page.locator('#pk-confirm')).toBeDisabled();
  await card(page, 'woman').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#char-picker')).toBeHidden();
  await expect(page.locator('#pause')).toBeVisible();
  expect(await hook(page, 'k.character.id')).toBe('man');
  expect(await saved(page)).toBe('man');
  // Confirm path
  await btn.click();
  await card(page, 'woman').click();
  await page.locator('#pk-confirm').click();
  await settled(page, 'woman');
  await expect(page.locator('#char-picker')).toBeHidden();
  await expect(page.locator('#pause')).toBeHidden();
  await expect(page.locator('#toast')).toContainText('Playing as Woman');
  expect(await saved(page)).toBe('woman');
  await frames(page, 3);
  const b = await snap();
  test.info().annotations.push({ type: 'state before/after', description: JSON.stringify({ a, b }) });
  expect(Math.hypot(b.x - a.x, b.z - a.z), 'same place').toBeLessThan(0.05);
  expect(b.y).toBeCloseTo(a.y, 1);
  expect(b.h).toBeCloseTo(a.h, 3);
  expect(b.fp, 'camera mode kept').toBe(a.fp);
  expect(await hook(page, 'k.input.enabled')).toBe(true);
  expect(run.errors).toEqual([]);
});

test('P5b Change Character is blocked with a reason while driving and while flying, and works again afterwards', async ({ page }) => {
  test.setTimeout(180_000);
  const run = await boot(page, '?char', 'man');
  await settled(page, 'man');
  await waitChunks(page);
  const btn = page.locator('#pause-char');
  const why = page.locator('#pause-char-why');
  // fly mode (P)
  await page.keyboard.press('KeyP');
  await page.waitForFunction(() => (window as any).__k3d.fly.active === true, null, { timeout: 10_000 });
  await page.keyboard.press('Escape');
  await expect(btn).toHaveAttribute('aria-disabled', 'true');
  await expect(why).toBeVisible();
  await expect(why).toContainText('Turn off fly mode');
  await btn.click({ force: true });
  await expect(page.locator('#char-picker')).toHaveCount(0);
  expect(await hook(page, 'k.character.pickerOpen')).toBe(false);
  await page.locator('#pause-resume').click();
  await page.keyboard.press('KeyP');
  await page.waitForFunction(() => (window as any).__k3d.fly.active === false, null, { timeout: 10_000 });
  // the car
  await page.keyboard.press('Escape');
  await expect(btn).not.toHaveAttribute('aria-disabled', 'true');
  await expect(why).toBeHidden();
  await page.locator('#pause-drive').click();
  await expect(page.locator('#pause')).toBeHidden({ timeout: 60_000 });
  await page.waitForFunction(() => (window as any).__k3d.driving.canEnter((window as any).__k3d.player), null, { timeout: 30_000 });
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => (window as any).__k3d.driving.active === true, null, { timeout: 10_000 });
  await page.keyboard.press('Escape');
  await expect(btn).toHaveAttribute('aria-disabled', 'true');
  await expect(why).toContainText('Get out of the car');
  await btn.click({ force: true });
  await expect(page.locator('#char-picker')).toHaveCount(0);
  expect(await hook(page, 'k.character.openPicker("change")'), 'the guard is also in the code path').toBeUndefined();
  expect(await hook(page, 'k.character.pickerOpen')).toBe(false);
  await page.locator('#pause-resume').click();
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => (window as any).__k3d.driving.active === false, null, { timeout: 10_000 });
  await page.keyboard.press('Escape');
  await expect(btn).not.toHaveAttribute('aria-disabled', 'true');
  await btn.click();
  await expect(page.locator('#char-picker')).toBeVisible();
  expect(run.errors).toEqual([]);
});

/**
 * G2 fix round 1 (N1): a "Drive Car" that is still finding the car. The player is far from the car and every chunk request is held, so
 * the trip lasts until `release()`. Resolves with the gate once the pause menu shows "Finding the car…".
 */
async function startSlowCarTrip(page: Page): Promise<{ release: () => void; released: () => boolean }> {
  const car = await hook<{ x: number; z: number }>(page, 'k.driving.whereabouts');
  for (const d of [1500, 2500, 3500]) {
    await hook(page, `k.player.teleport(${car.x + d}, ${car.z + d})`);
    await page.waitForTimeout(3000);
    if (!(await hook<boolean>(page, 'k.world.chunks.isReady(k.driving.whereabouts.x, k.driving.whereabouts.z)'))) break;
  }
  expect(await hook<boolean>(page, 'k.world.chunks.isReady(k.driving.whereabouts.x, k.driving.whereabouts.z)'), 'the car area has been unloaded').toBe(false);
  let open = false;
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = () => { open = true; r(); }; });
  await page.route('**/chunks/**', async (route) => { await gate; await route.continue().catch(() => {}); });
  return { release, released: () => open };
}

test('P5c N1: Change Character is blocked while "Finding the car…" runs (aria-disabled, reason, focusable, no picker), and works again afterwards', async ({ page }) => {
  test.setTimeout(240_000);
  const run = await boot(page, '?char', 'man');
  await settled(page, 'man');
  await waitChunks(page);
  const gate = await startSlowCarTrip(page);
  const btn = page.locator('#pause-char');
  const why = page.locator('#pause-char-why');
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause')).toBeVisible();
  await expect(btn).not.toHaveAttribute('aria-disabled', 'true');
  await page.locator('#pause-drive').click();
  await expect(page.locator('#pause-drive')).toHaveText('Finding the car…');
  // blocked the same way as driving and flying: aria-disabled (not disabled), described by the reason, still focusable
  await expect(btn).toHaveAttribute('aria-disabled', 'true');
  await expect(btn).toHaveAttribute('aria-describedby', 'pause-char-why');
  expect(await btn.evaluate((b) => (b as HTMLButtonElement).disabled), 'aria-disabled, not the disabled attribute').toBe(false);
  await expect(why).toBeVisible();
  await expect(why).toHaveText('Wait until the car is found.');
  await btn.focus();
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('pause-char');
  await btn.click({ force: true });
  await expect(page.locator('#char-picker')).toHaveCount(0);
  expect(await hook(page, 'k.character.pickerOpen')).toBe(false);
  // no other path opens it either
  expect(await hook(page, 'k.character.openPicker("change")')).toBeUndefined();
  await page.keyboard.press('Enter'); // on the focused, blocked row
  await expect(page.locator('#char-picker')).toHaveCount(0);
  expect(await hook(page, 'k.character.pickerOpen')).toBe(false);
  expect(await hook<boolean>(page, 'k.input.enabled'), 'the game is still paused').toBe(false);
  // the trip ends: the player stands beside the car and the game resumes; the row is free again
  gate.release();
  await expect(page.locator('#pause')).toBeHidden({ timeout: 90_000 });
  await page.waitForFunction(() => (window as any).__k3d.driving.canEnter((window as any).__k3d.player), null, { timeout: 30_000 });
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause')).toBeVisible();
  await expect(btn).not.toHaveAttribute('aria-disabled', 'true');
  await expect(why).toBeHidden();
  await btn.click();
  await expect(page.locator('#char-picker')).toBeVisible();
  expect(run.errors).toEqual([]);
});

test('P5d N1: a car trip that ends while the picker is open does not resume the game behind it; Cancel returns to a paused pause menu', async ({ page }) => {
  test.setTimeout(240_000);
  const run = await boot(page, '?char', 'man');
  await settled(page, 'man');
  await waitChunks(page);
  const gate = await startSlowCarTrip(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause')).toBeVisible();
  await page.locator('#pause-char').click(); // the picker opens first ...
  await expect(page.locator('#char-picker')).toBeVisible();
  expect(await hook<boolean>(page, 'k.input.enabled')).toBe(false);
  expect(await hook(page, 'k.driveCar()')).toBeUndefined(); // ... then the wait starts behind it (same code path as the Drive Car button)
  await expect(page.locator('#pause-drive')).toHaveText('Finding the car…');
  gate.release();
  await expect(page.locator('#pause-drive')).toHaveText('Drive Car', { timeout: 90_000 }); // the trip is over: the player stands by the car
  await page.waitForFunction(() => (window as any).__k3d.driving.canEnter((window as any).__k3d.player), null, { timeout: 30_000 });
  // still paused, picker still open, nothing running behind it
  await expect(page.locator('#char-picker')).toBeVisible();
  expect(await hook(page, 'k.character.pickerOpen')).toBe(true);
  expect(await hook<boolean>(page, 'k.input.enabled'), 'input stays off while the picker is open').toBe(false);
  expect(await display(page, '#pause'), 'the pause menu stays under the picker').toBe('none');
  // Cancel: the pause menu comes back and the game is still paused (W moves nothing)
  await page.keyboard.press('Escape');
  await expect(page.locator('#char-picker')).toBeHidden();
  await expect(page.locator('#pause')).toBeVisible();
  expect(await hook<boolean>(page, 'k.input.enabled'), 'paused after Cancel').toBe(false);
  const p0 = await hook<{ x: number; z: number }>(page, '({ x: k.player.position.x, z: k.player.position.z })');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(700);
  await page.keyboard.up('KeyW');
  const p1 = await hook<{ x: number; z: number }>(page, '({ x: k.player.position.x, z: k.player.position.z })');
  expect(Math.hypot(p1.x - p0.x, p1.z - p0.z), 'W moves nothing while the pause menu is up').toBeLessThan(0.02);
  expect(run.errors).toEqual([]);
});

test.describe('touch', () => {
  test.use({ hasTouch: true, viewport: { width: 360, height: 800 } });
  test('P5e N2: on touch the fly reason has no "(P)" keyboard hint; on desktop (P5b) it keeps it', async ({ page }) => {
    test.setTimeout(150_000);
    const run = await boot(page, '?char', 'man');
    await settled(page, 'man');
    await waitChunks(page);
    expect(await page.evaluate(() => document.body.classList.contains('touch')), 'touch layout is active').toBe(true);
    await page.keyboard.press('KeyP');
    await page.waitForFunction(() => (window as any).__k3d.fly.active === true, null, { timeout: 10_000 });
    await page.keyboard.press('Escape');
    const btn = page.locator('#pause-char');
    await expect(btn).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('#pause-char-why')).toHaveText('Turn off fly mode to change character.');
    await expect(page.locator('#pause-char-why')).not.toContainText('(P)');
    await btn.tap({ force: true });
    await expect(page.locator('#char-picker')).toHaveCount(0);
    expect(run.errors).toEqual([]);
  });
});

test('P6 selecting while the model is still downloading: Confirm waits for it (Loading...), no error, one install', async ({ page }) => {
  test.setTimeout(150_000);
  const run = await boot(page, '?char', null, { press: true });
  await expect(page.locator('#char-picker')).toBeVisible({ timeout: 60_000 });
  let released = false;
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = () => { released = true; r(); }; });
  await page.route('**/models/characters/young-girl.glb', async (route) => { await gate; await route.continue(); });
  await card(page, 'young-girl').click();
  await page.locator('#pk-confirm').click(); // at once: the warm-up has not even started (settle window) and the file is held back
  await expect(page.locator('#pk-confirm')).toHaveText(/Loading/);
  await expect(page.locator('#pk-confirm')).toBeDisabled();
  await expect(page.locator('#char-picker')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#pk-status')).toContainText('getting ready');
  await page.waitForTimeout(1200);
  await expect(page.locator('#char-picker')).toBeVisible();
  expect(await hook(page, 'k.character.id'), 'nothing installed while the file is incomplete').not.toBe('young-girl');
  expect(released).toBe(false);
  release();
  await expect(page.locator('#char-picker')).toBeHidden({ timeout: 60_000 });
  await settled(page, 'young-girl');
  expect(characterGlbs(run).filter((g) => g === 'young-girl.glb').length, 'the file is fetched once').toBe(1);
  expect(run.errors).toEqual([]);
});

test('P7 a model that fails to load: the error says so, the old model stays, nothing is saved, Try again works, "You are still playing as X"', async ({ page }) => {
  test.setTimeout(150_000);
  const run = await boot(page, '?char', 'man');
  await settled(page, 'man');
  await waitChunks(page);
  await page.keyboard.press('Escape');
  await page.locator('#pause-char').click();
  let fail = true;
  await page.route('**/models/characters/teen-boy.glb', async (route) => { if (fail) await route.abort('failed'); else await route.continue(); });
  await card(page, 'teen-boy').click();
  await page.locator('#pk-confirm').click();
  const status = page.locator('#pk-status');
  await expect(status).toContainText("Couldn't load Teen boy", { timeout: 60_000 });
  await expect(status).toContainText("You're still playing as Man");
  await expect(page.locator('#pk-confirm')).toHaveText(/Try again/);
  await expect(page.locator('#pk-confirm')).toBeEnabled();
  await expect(page.locator('#char-picker .pk-err-badge')).toHaveCount(1);
  expect(await hook(page, 'k.character.id')).toBe('man');
  expect(await saved(page)).toBe('man');
  expect(await hook(page, 'k.character.fallback')).toBe(false);
  expect(await hook(page, 'k.character.lastError')).not.toBeNull();
  // the network returns: Try again (the same card) installs it. (Another card clearing the error is P7c.)
  fail = false;
  await page.locator('#pk-confirm').click();
  await expect(page.locator('#char-picker')).toBeHidden({ timeout: 60_000 });
  await settled(page, 'teen-boy');
  expect(await saved(page)).toBe('teen-boy');
  expect(run.errors.filter((e) => !/teen-boy|ERR_FAILED/.test(e))).toEqual([]);
});

test('P7b first launch with a failed model: Try again; the player is not dropped into the world without a choice', async ({ page }) => {
  test.setTimeout(150_000);
  const run = await boot(page, '?char', null);
  await expect(page.locator('#char-picker')).toBeVisible({ timeout: 60_000 });
  let fail = true;
  await page.route('**/models/characters/woman.glb', async (route) => { if (fail) await route.abort('failed'); else await route.continue(); });
  await card(page, 'woman').click();
  await page.locator('#pk-confirm').click();
  await expect(page.locator('#pk-status')).toContainText("Couldn't load Woman", { timeout: 60_000 });
  await expect(page.locator('#pk-status')).not.toContainText('still playing');
  await expect(page.locator('#char-picker')).toBeVisible();
  expect(await saved(page)).toBeNull();
  expect(await hook(page, 'k.input.enabled')).toBe(false);
  fail = false;
  await page.keyboard.press('Enter'); // Try again from the keyboard
  await expect(page.locator('#char-picker')).toBeHidden({ timeout: 60_000 });
  await settled(page, 'woman');
  expect(await saved(page)).toBe('woman');
  expect(run.errors.filter((e) => !/woman|ERR_FAILED/.test(e))).toEqual([]);
});

test('P8 rapid switching through the picker: 12 changes in a row end on the last choice, one live model, saved', async ({ page }) => {
  test.setTimeout(240_000);
  const run = await boot(page, '?char', 'man');
  await settled(page, 'man');
  await waitChunks(page);
  const seq = ['woman', 'teen-boy', 'teen-girl', 'young-boy', 'young-girl', 'man', 'young-girl', 'woman', 'teen-girl', 'man', 'teen-boy', 'young-boy'];
  for (const id of seq) {
    await page.keyboard.press('Escape');
    await page.locator('#pause-char').click();
    await card(page, id).click();
    await page.locator('#pk-confirm').click();
    await expect(page.locator('#char-picker')).toBeHidden({ timeout: 60_000 });
    await settled(page, id);
  }
  expect(await saved(page)).toBe('young-boy');
  expect(await hook(page, 'k.character.id')).toBe('young-boy');
  expect(await hook(page, 'k.character.live'), 'one live model after 12 changes (G2 fix2 N4)').toBe(1);
  // quick: pick three cards and confirm the last one without waiting
  await page.keyboard.press('Escape');
  await page.locator('#pause-char').click();
  await card(page, 'woman').click(); await card(page, 'teen-girl').click(); await card(page, 'man').click();
  await page.locator('#pk-confirm').click();
  await expect(page.locator('#char-picker')).toBeHidden({ timeout: 60_000 });
  await settled(page, 'man');
  expect(await saved(page)).toBe('man');
  // the rapid clicks left exactly one live model (the warm-ups for the cards passed over were dropped, not kept)
  await expect.poll(() => hook<number>(page, 'k.character.live'), { timeout: 10_000, message: 'one live model after the rapid clicks' }).toBe(1);
  expect(await hook(page, 'k.character.lastError')).toBeNull();
  expect(run.errors).toEqual([]);
});

test('P7c a failed model, then ANOTHER card: the error clears, the other card installs, the failed one never does', async ({ page }) => {
  test.setTimeout(150_000);
  const run = await boot(page, '?char', 'man');
  await settled(page, 'man');
  await waitChunks(page);
  await page.keyboard.press('Escape');
  await page.locator('#pause-char').click();
  await page.route('**/models/characters/teen-boy.glb', (route) => route.abort('failed'));
  await card(page, 'teen-boy').click();
  await page.locator('#pk-confirm').click();
  await expect(page.locator('#pk-status')).toContainText("Couldn't load Teen boy", { timeout: 60_000 });
  await expect(page.locator('#char-picker .pk-err-badge')).toHaveCount(1);
  await card(page, 'woman').click();
  await expect(page.locator('#char-picker .pk-err-badge'), 'the error badge is gone').toHaveCount(0);
  await expect(page.locator('#pk-status')).not.toContainText("Couldn't load");
  await expect(page.locator('#pk-confirm')).toHaveText(/Switch to Woman/);
  await expect(page.locator('#pk-confirm')).toBeEnabled();
  await page.locator('#pk-confirm').click();
  await expect(page.locator('#char-picker')).toBeHidden({ timeout: 60_000 });
  await settled(page, 'woman');
  expect(await saved(page)).toBe('woman');
  expect(await hook(page, 'k.character.live')).toBe(1);
  expect(await hook(page, 'k.character.lastError')).toBeNull();
  expect(run.errors.filter((e) => !/teen-boy|ERR_FAILED/.test(e))).toEqual([]);
});

/** A GLB request that hangs (never answers): `release()` lets every held request through (after the test, so nothing is left dangling). */
async function holdGlb(page: Page, file: string): Promise<{ release: () => void; held: () => number }> {
  let n = 0;
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  // (a retry after a stall asks for <file>?retry=N, so match the file name with or without a query)
  await page.route(new RegExp(`/models/characters/${file.replace('.', '[.]')}([#?].*)?$`), async (route) => { n++; await gate; await route.continue().catch(() => {}); });
  return { release, held: () => n };
}

test('P10 N1 first launch with a GLB that hangs: after the stall timeout the picker shows the error, and another card still plays', async ({ page }) => {
  test.setTimeout(150_000);
  const run = await boot(page, '?char&charstall=2500', null);
  await expect(page.locator('#char-picker')).toBeVisible({ timeout: 60_000 });
  const gate = await holdGlb(page, 'man.glb'); // never answers
  await card(page, 'man').click();
  await page.locator('#pk-confirm').click();
  await expect(page.locator('#pk-confirm')).toHaveText(/Loading/);
  await expect(page.locator('#char-picker')).toHaveAttribute('aria-busy', 'true');
  const t0 = Date.now();
  await expect(page.locator('#pk-status')).toContainText("Couldn't load Man", { timeout: 30_000 });
  const waited = Date.now() - t0;
  expect(waited, 'the timeout is not instant: it is the no-progress stall (charstall=2500)').toBeGreaterThan(1500);
  expect(gate.held(), 'the request really was held').toBeGreaterThan(0);
  await expect(page.locator('#char-picker')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#pk-confirm')).toHaveText(/Try again/);
  await expect(page.locator('#pk-confirm')).toBeEnabled();
  await expect(page.locator('#pk-status')).not.toContainText('still playing'); // first launch: nothing to keep
  expect(await saved(page)).toBeNull();
  expect(await hook(page, 'k.input.enabled'), 'still no way into the world without a choice').toBe(false);
  expect(await hook(page, 'k.character.pickerOpen')).toBe(true);
  // another card: the error clears and that one plays
  await card(page, 'woman').click();
  await expect(page.locator('#char-picker .pk-err-badge')).toHaveCount(0);
  await expect(page.locator('#pk-confirm')).toHaveText(/Play as Woman/);
  await page.locator('#pk-confirm').click();
  await expect(page.locator('#char-picker')).toBeHidden({ timeout: 60_000 });
  await settled(page, 'woman');
  expect(await saved(page)).toBe('woman');
  expect(await hook(page, 'k.character.live')).toBe(1);
  expect(await hook<boolean>(page, 'k.input.enabled')).toBe(true);
  gate.release(); // the hung request finally answers: its model is thrown away, nothing changes
  await page.waitForTimeout(2500);
  expect(await hook(page, 'k.character.id')).toBe('woman');
  expect(await hook(page, 'k.character.live'), 'the late arrival is not installed or kept').toBe(1);
  expect(await saved(page)).toBe('woman');
  expect(run.errors).toEqual([]);
});

test('P10b N1 change mode with a GLB that hangs: the error keeps the current character; Try again fetches again; Cancel still works', async ({ page }) => {
  test.setTimeout(150_000);
  const run = await boot(page, '?char&charstall=2500', 'man');
  await settled(page, 'man');
  await waitChunks(page);
  await page.keyboard.press('Escape');
  await page.locator('#pause-char').click();
  const gate = await holdGlb(page, 'teen-boy.glb');
  await card(page, 'teen-boy').click();
  await page.locator('#pk-confirm').click();
  await expect(page.locator('#pk-status')).toContainText("Couldn't load Teen boy", { timeout: 30_000 });
  await expect(page.locator('#pk-status')).toContainText("You're still playing as Man");
  expect(await hook(page, 'k.character.id')).toBe('man');
  expect(await saved(page)).toBe('man');
  expect(await hook(page, 'k.character.live')).toBe(1);
  const before = gate.held();
  await page.locator('#pk-confirm').click(); // Try again: a new request (the failed one was not cached), hung again
  await expect(page.locator('#pk-confirm')).toHaveText(/Loading/);
  await expect(page.locator('#pk-status')).toContainText("Couldn't load Teen boy", { timeout: 30_000 });
  expect(gate.held(), 'Try again made a new request').toBeGreaterThan(before);
  await page.keyboard.press('Escape'); // Cancel works from the error state
  await expect(page.locator('#char-picker')).toBeHidden();
  await expect(page.locator('#pause')).toBeVisible();
  expect(await hook<boolean>(page, 'k.input.enabled')).toBe(false);
  expect(await hook(page, 'k.character.id')).toBe('man');
  gate.release();
  await page.waitForTimeout(2500);
  expect(await hook(page, 'k.character.id'), 'the late arrival changes nothing').toBe('man');
  expect(await hook(page, 'k.character.live')).toBe(1);
  expect(await saved(page)).toBe('man');
  expect(run.errors).toEqual([]);
});

test('N3a Escape while a choice is Loading (change mode), then confirming a DIFFERENT character: one live model, the saved id is the last confirmed', async ({ page }) => {
  test.setTimeout(150_000);
  const run = await boot(page, '?char', 'man');
  await settled(page, 'man');
  await waitChunks(page);
  const gate = await holdGlb(page, 'woman.glb');
  await page.keyboard.press('Escape');
  await page.locator('#pause-char').click();
  await card(page, 'woman').click();
  await page.locator('#pk-confirm').click();
  await expect(page.locator('#pk-confirm')).toHaveText(/Loading/);
  await page.keyboard.press('Escape'); // abandon it while it loads
  await expect(page.locator('#char-picker')).toBeHidden();
  await expect(page.locator('#pause')).toBeVisible();
  expect(await hook(page, 'k.character.id')).toBe('man');
  expect(await saved(page), 'nothing saved by the abandoned choice').toBe('man');
  await page.locator('#pause-char').click(); // and choose someone else
  await card(page, 'teen-boy').click();
  await page.locator('#pk-confirm').click();
  await expect(page.locator('#char-picker')).toBeHidden({ timeout: 60_000 });
  await settled(page, 'teen-boy');
  expect(await saved(page)).toBe('teen-boy');
  gate.release(); // the abandoned model arrives late
  await page.waitForTimeout(3000);
  await expect.poll(() => hook<number>(page, 'k.character.live'), { timeout: 15_000, message: 'exactly one live model' }).toBe(1);
  expect(await hook(page, 'k.character.id'), 'the late woman did not replace teen-boy').toBe('teen-boy');
  expect(await saved(page), 'the saved id is the last one confirmed').toBe('teen-boy');
  expect(await hook(page, 'k.character.loading')).toBe(false);
  expect(await hook(page, 'k.character.lastError')).toBeNull();
  expect(run.errors).toEqual([]);
});

test('N3a2 (abort) Escape while a choice is Loading, then resume with NO new choice: the late file is dropped, nothing installed or saved', async ({ page }) => {
  // The case swapper.abort() in onCancel exists for: N3a cannot show it (the next confirm's own swap supersedes the abandoned one).
  // Negative control: remove `swapper.abort();` from onCancel in main.ts -> the late woman installs and is saved, and this test fails.
  test.setTimeout(150_000);
  const run = await boot(page, '?char', 'man');
  await settled(page, 'man');
  await waitChunks(page);
  await page.evaluate(() => {
    const w = window as any; w.__saves = [];
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) { if (k === 'k3d.character') w.__saves.push(v); return orig.call(this, k, v); };
  });
  const gate = await holdGlb(page, 'woman.glb');
  await page.keyboard.press('Escape');
  await page.locator('#pause-char').click();
  await card(page, 'woman').click();
  await page.locator('#pk-confirm').click();
  await expect(page.locator('#pk-confirm')).toHaveText(/Loading/);
  await page.keyboard.press('Escape'); // abandon it while it loads
  await expect(page.locator('#char-picker')).toBeHidden();
  await expect(page.locator('#pause')).toBeVisible();
  await page.keyboard.press('Escape'); // resume the game; no other choice is made
  await expect(page.locator('#pause')).toBeHidden();
  expect(gate.held(), 'the request really was held').toBeGreaterThan(0);
  gate.release(); // the abandoned file arrives late
  await page.waitForTimeout(5000);
  expect(await hook(page, 'k.character.id'), 'the late woman was dropped').toBe('man');
  expect(await hook(page, 'k.character.live')).toBe(1);
  expect(await hook(page, 'k.character.loading')).toBe(false);
  expect(await hook(page, 'k.character.lastError')).toBeNull();
  expect(await hook(page, 'k.input.enabled')).toBe(true);
  expect(await saved(page)).toBe('man');
  expect(await page.evaluate(() => (window as any).__saves), 'nothing was saved').toEqual([]);
  expect(run.errors).toEqual([]);
});

test('N3b a double confirm (Enter twice): ONE model built, one install, one saved write, no error', async ({ page }) => {
  test.setTimeout(150_000);
  const run = await boot(page, '?char', 'man');
  await settled(page, 'man');
  await waitChunks(page);
  await page.evaluate(() => {
    const w = window as any; w.__saves = [];
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) { if (k === 'k3d.character') w.__saves.push(v); return orig.call(this, k, v); };
  });
  await page.keyboard.press('Escape');
  await page.locator('#pause-char').click();
  await card(page, 'teen-girl').click();
  await expect(page.locator('#pk-confirm')).toHaveText(/Switch to Teen girl/);
  await Promise.all([page.keyboard.press('Enter'), page.keyboard.press('Enter')]);
  await expect(page.locator('#char-picker')).toBeHidden({ timeout: 60_000 });
  await settled(page, 'teen-girl');
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => (window as any).__saves), 'persisted once: one install').toEqual(['teen-girl']);
  // Saves and fetches cannot tell a second swap from the first (the second supersedes it: nothing more is saved, the cached file is not refetched).
  // Count model builds: every instance made for teen-girl (a warm-up's or a swap's) marks one 'clone' stage. Without the guard in
  // CharacterPicker.confirm() the second Enter starts a second swap and a second build. Negative control: remove that guard -> this fails.
  const builds = await hook<Array<{ id: string; stage: string }>>(page, 'k.character.timings.entries').then((es) => es.filter((e) => e.id === 'teen-girl' && /^(warm.)?clone$/.test(e.stage)));
  expect(builds.length, 'one model was built for the double confirm').toBe(1);
  expect(characterGlbs(run).filter((g) => g === 'teen-girl.glb').length, 'fetched once').toBe(1);
  expect(await hook(page, 'k.character.live')).toBe(1);
  expect(await hook(page, 'k.character.lastError')).toBeNull();
  expect(await hook(page, 'k.character.id')).toBe('teen-girl');
  expect(run.errors).toEqual([]);
});

test('P9 no flag: no picker, no portrait or picker request, no pause button, the saved choice is not read', async ({ page }) => {
  test.setTimeout(120_000);
  const run = await boot(page, '?char=0', 'woman');
  await waitChunks(page);
  await expect(page.locator('#char-picker')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-char')).toBeHidden();
  expect(await page.evaluate(() => document.body.classList.contains('char-ui'))).toBe(false);
  expect(run.reqs.filter((u) => /portraits|CharacterPicker/.test(u))).toEqual([]);
  expect(await hook(page, 'k.character')).toBeUndefined();
  expect(run.errors).toEqual([]);
});
