// CHAR-P5 gate 1: character switching and mid-air performance on the desktop, in the real game with ?char.
//   E1.1 12 cycle-order swaps after warm-up: worst frame from the tap to 20 frames + 1 s after (the CHAR-P4 window) <= 50 ms
//        (<= 100 ms with a 4x CPU throttle: EMULATION, not a phone)
//   E1.2 the stage timings exist, in order, and no build step holds the main thread for more than 25 ms
//   E2.1 landing soles for all six characters; airborne update cost against grounded
//   E3.1 18 laps = 108 switches: renderer geometries / textures / programs stay flat; one live model plus at most one warm one
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { start, waitChunks, frames } from './helpers.ts';

/** The Vite dev server's hot-reload socket (its port is not the one the page was served from) is not a game error. */
const DEV_NOISE = /WebSocket|\[vite\]|Vite server/;
const MPFB = ['man', 'woman', 'teen-boy', 'teen-girl', 'young-boy', 'young-girl'];

// G2 (owner D3): the dev server defaults to the diagnostic configuration (shader checks on); these tests assert performance, so they run the benchmark one.
async function boot(page: Page, query = '?char=default&charcfg=benchmark'): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' && !DEV_NOISE.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => { if (!DEV_NOISE.test(e.message)) errors.push(`pageerror: ${e.message}`); });
  await page.addInitScript(() => { try { localStorage.setItem('k3d.quality', 'low'); localStorage.removeItem('k3d.character'); } catch { /* ignore */ } });
  await page.goto(`./${query}`);
  await start(page, { navigate: false });
  await waitChunks(page);
  await page.waitForFunction(() => { const c = (window as any).__k3d.character; return c && !c.loading; }, null, { timeout: 60_000 });
  return errors;
}

/** One swap with the CHAR-P4 frame window: collector from 0.3 s before the tap to 20 frames + 1 s after the swap resolved. */
const swapWindow = (page: Page, id: string, warmFirst: boolean) => page.evaluate(([id, warmFirst]) => new Promise<{ ok: boolean; worstMs: number; swapMs: number; fetchedBefore: number; fetchedAfter: number }>((resolve) => {
  const k = (window as any).__k3d;
  const go = async () => {
    if (warmFirst) { await k.character.warm(id); await new Promise((r) => setTimeout(r, 400)); }
    const d: number[] = []; let last = performance.now(), on = true;
    const f = (t: number) => { if (!on) return; d.push(t - last); last = t; requestAnimationFrame(f); };
    requestAnimationFrame(f);
    const fetchedBefore = k.character.fetchCount;
    setTimeout(() => {
      const t0 = performance.now();
      k.character.swap(id).then((ok: boolean) => {
        const swapMs = performance.now() - t0; let n = 0;
        const g = () => { if (++n < 20) return requestAnimationFrame(g); setTimeout(() => { on = false; const s = d.slice(1); resolve({ ok, worstMs: Math.max(...s), swapMs, fetchedBefore, fetchedAfter: k.character.fetchCount }); }, 1000); };
        requestAnimationFrame(g);
      });
    }, 300);
  };
  void go();
}), [id, warmFirst] as [string, boolean]);

async function cycle(page: Page, laps: number, throttle: number) {
  const cdp = await page.context().newCDPSession(page);
  if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  const rows: { id: string; worstMs: number; swapMs: number; fetched: number }[] = [];
  // a first pass loads and caches the six files (the cold file fetch is not part of the claim)
  for (const id of MPFB) await page.evaluate((id) => (window as any).__k3d.character.swap(id), id);
  for (let lap = 0; lap < laps; lap++) for (const id of MPFB) {
    const r = await swapWindow(page, id, true);
    expect(r.ok, `swap to ${id}`).toBe(true);
    rows.push({ id, worstMs: r.worstMs, swapMs: r.swapMs, fetched: r.fetchedAfter - r.fetchedBefore });
  }
  if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  return rows;
}

test.describe.configure({ mode: 'serial' });

test('E1.1 desktop: 12 swaps in cycle order after warm-up, worst frame from tap to 1 s after <= 50 ms', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await boot(page);
  const rows = await cycle(page, 2, 1);
  const worst = Math.max(...rows.map((r) => r.worstMs));
  test.info().annotations.push({ type: 'swaps', description: rows.map((r) => `${r.id} worst ${r.worstMs.toFixed(1)} swap ${r.swapMs.toFixed(1)}`).join('; ') });
  expect(rows.length).toBe(12);
  expect(rows.every((r) => r.fetched === 0), 'a warmed swap fetches nothing').toBe(true);
  expect(worst, `worst frame over 12 warmed swaps (ms): ${rows.map((r) => r.worstMs.toFixed(0)).join(' ')}`).toBeLessThanOrEqual(50);
  expect(errors).toEqual([]);
});

test('E1.1 4x CPU throttle (emulation, not a phone): worst frame <= 100 ms', async ({ page }) => {
  test.setTimeout(400_000);
  await boot(page);
  const rows = await cycle(page, 2, 4);
  const worst = Math.max(...rows.map((r) => r.worstMs));
  test.info().annotations.push({ type: 'swaps-4x-emulated', description: rows.map((r) => `${r.id} worst ${r.worstMs.toFixed(1)}`).join('; ') });
  expect(worst, `worst frame, 12 warmed swaps at 4x emulated CPU (ms): ${rows.map((r) => r.worstMs.toFixed(0)).join(' ')}`).toBeLessThanOrEqual(100);
});

test('E1.2 stage timings: present, in order, and no build step longer than 25 ms', async ({ page }) => {
  test.setTimeout(240_000);
  await boot(page);
  const r = await page.evaluate(async () => {
    const k = (window as any).__k3d, t = k.character.timings;
    t.clear();
    await k.character.swap('woman'); // cold: fetch, clone, build, prepare, install
    const cold = t.entries.map((e: any) => e.stage);
    const coldLast = { ...t.last };
    t.clear();
    await k.character.swap('teen-girl'); // cold too, to see a second one
    await k.character.warm('man');
    const warmStages = t.entries.filter((e: any) => e.stage.startsWith('warm.')).map((e: any) => e.stage);
    t.clear();
    await k.character.swap('man'); // from the warm slot: just the install
    return { cold, coldLast, warmStages, warmSwap: t.entries.map((e: any) => e.stage), noHook: typeof k.character.timings };
  });
  const order = (names: string[], seq: string[]) => { let i = -1; for (const s of seq) { const j = names.indexOf(s, i + 1); expect(j, `${s} after ${i} in ${names.join(',')}`).toBeGreaterThan(i); i = j; } };
  order(r.cold, ['source', 'clone', 'build.bbox', 'build.gait', 'build.sole', 'build.crease', 'prepare.textures', 'prepare.compile', 'prepare', 'install', 'total']);
  order(r.warmStages, ['warm.source', 'warm.clone', 'warm.build.crease', 'warm.prepare', 'warm.predraw']);
  expect(r.warmSwap).toEqual(['install', 'total']);
  expect(r.coldLast['build.maxChunk'], 'the longest uninterrupted stretch of the build (ms)').toBeLessThanOrEqual(25);
  expect(r.coldLast.install, 'install in one block (ms)').toBeLessThanOrEqual(10);
});

test('E2.1 landing and the airborne update cost, all six characters', async ({ page }) => {
  test.setTimeout(400_000);
  await boot(page);
  const cdp = await page.context().newCDPSession(page);
  for (const throttle of [1, 4]) {
    if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
    for (const id of MPFB) {
      await page.evaluate((id) => (window as any).__k3d.character.swap(id), id);
      await frames(page, 10);
      const r = await page.evaluate(() => {
        const k = (window as any).__k3d, vis = k.player.visual, dt = 1 / 60, N = 600;
        const run = (st: any) => { for (let i = 0; i < 120; i++) vis.update(dt, st); const T0 = performance.now(); for (let i = 0; i < N; i++) vis.update(dt, st); return (performance.now() - T0) / N; };
        const g = run({ speed: 5.2, grounded: true, vy: 0 }), a = run({ speed: 5.2, grounded: false, vy: 1 });
        vis.update(0, { speed: 0, grounded: true, vy: 0 });
        return { g, a, verts: vis.soleVerts ? vis.soleVerts.length : 0 };
      });
      test.info().annotations.push({ type: `update-${throttle}x`, description: `${id}: grounded ${(r.g * 1000).toFixed(0)} us, airborne ${(r.a * 1000).toFixed(0)} us, ${r.verts} sole vertices` });
      expect(r.verts, `${id}: one sole vertex per distinct position`).toBeLessThanOrEqual(800);
      expect(r.a, `${id} ${throttle}x: airborne update (ms) against grounded ${r.g.toFixed(3)} ms`).toBeLessThanOrEqual(2 * r.g + 0.1 * throttle);
    }
    if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  }
  // the soles on landing, the same method as the CHAR-P4 jump test, after a swap (the lean build) for each character
  for (const id of MPFB) {
    await page.evaluate((id) => (window as any).__k3d.character.swap(id), id);
    await frames(page, 10);
    const r = await page.evaluate(() => new Promise<{ landed: boolean; minSoleCm: number; minAfterLandCm: number }>((resolve) => {
      const k = (window as any).__k3d; const root = k.player.visual.root; const meshes: any[] = []; root.traverse((o: any) => { if (o.isSkinnedMesh) meshes.push(o); });
      const v = new (root.position.constructor)();
      const soleCm = () => { root.updateMatrixWorld(true); const ry = root.matrixWorld.elements[13]; let low = Infinity; for (const m of meshes) { const n = m.geometry.attributes.position.count; for (let i = 0; i < n; i++) { m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld); if (v.y < low) low = v.y; } } return (low - ry) * 100; };
      k.setSimulatedDt(1 / 60); k.setStepsPerFrame(1);
      let f = 0, minSole = Infinity, minAfter = Infinity, left = false, landedAt = -1;
      const tick = () => {
        if (f === 3) k.input.jump = true; if (f === 4) k.input.jump = false;
        if (f >= 4) { const g = k.player.grounded; if (!g) left = true; if (left && g && landedAt < 0) landedAt = f; const c = soleCm(); minSole = Math.min(minSole, c); if (landedAt >= 0 && f <= landedAt + 40) minAfter = Math.min(minAfter, c); }
        if (f++ >= 160) { k.setSimulatedDt(0); return resolve({ landed: landedAt >= 0, minSoleCm: minSole, minAfterLandCm: minAfter }); }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }));
    expect(r.landed, `${id} landed`).toBe(true);
    expect(r.minSoleCm, `${id}: lowest sole over the jump (cm)`).toBeGreaterThanOrEqual(-1);
    expect(r.minAfterLandCm, `${id}: lowest sole after touch-down (cm)`).toBeGreaterThanOrEqual(-1);
  }
});

test('E3.1 18 laps = 108 switches with the pause-menu flow (swap, then warm the next): renderer counts flat, no model piles up', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = await boot(page);
  const snap = () => page.evaluate(() => { const k = (window as any).__k3d, i = k.renderer.info, c = k.character; return { geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs.length, live: c.live, cachedCount: c.cachedCount, fetchCount: c.fetchCount }; });
  let base: Awaited<ReturnType<typeof snap>> | null = null, maxLive = 0, n = 0;
  for (let lap = 1; lap <= 18; lap++) {
    for (let i = 0; i < MPFB.length; i++) {
      const ok = await page.evaluate(async ([id, next]) => { const k = (window as any).__k3d; const r = await k.character.swap(id); await k.character.warm(next); return r; }, [MPFB[i], MPFB[(i + 1) % 6]]);
      expect(ok, `swap ${++n}`).toBe(true);
      maxLive = Math.max(maxLive, (await snap()).live);
    }
    if (lap === 1) base = await snap();
  }
  const end = await snap();
  test.info().annotations.push({ type: 'counts', description: `after lap 1 ${JSON.stringify(base)}; after 108 switches ${JSON.stringify(end)}` });
  expect(n).toBe(108);
  expect(Math.abs(end.geometries - base!.geometries), 'geometries').toBeLessThanOrEqual(2);
  expect(Math.abs(end.textures - base!.textures), 'textures').toBeLessThanOrEqual(2);
  expect(Math.abs(end.programs - base!.programs), 'programs').toBeLessThanOrEqual(2);
  expect(maxLive, 'the model on screen plus at most one warm one').toBeLessThanOrEqual(2);
  expect(end.fetchCount, 'each file fetched once (the byte budget holds all six at this size)').toBeLessThanOrEqual(8);
  expect(errors).toEqual([]);
});

/** Put the character in the air pose (as a jump would), enter OP fly mode with P, and read the air weight after two frames. */
async function airThenFly(page: Page) {
  return page.evaluate(() => new Promise<{ before: number | null; after: number | null; settleCalls: number }>((resolve) => {
    const k = (window as any).__k3d, vis = k.player.visual;
    let settleCalls = 0; const orig = vis.update.bind(vis);
    vis.update = (dt: number, st: any) => { if (dt === 0 && st.grounded) settleCalls++; return orig(dt, st); };
    for (let i = 0; i < 30; i++) orig(1 / 60, { speed: 5.2, grounded: false, vy: 1 });
    const before = k.character?.airWeight ?? vis.air ?? null;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP', key: 'p', bubbles: true }));
    requestAnimationFrame(() => requestAnimationFrame(() => { vis.update = orig; resolve({ before, after: k.character?.airWeight ?? vis.air ?? null, settleCalls }); }));
  }));
}

test('E4.1 N9 (?char): entering OP fly mode in mid-air settles the hidden body to the rest pose once, and again on a second entry', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await boot(page);
  const a = await airThenFly(page);
  expect(a.before, 'the air pose was set').toBeGreaterThan(0.9);
  expect(a.after, 'settled on entry, not frozen in the air pose').toBe(0);
  expect(a.settleCalls, 'one settle call on the rising edge').toBe(1);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP', key: 'p', bubbles: true }))); // leave OP mode
  await frames(page, 5);
  const b = await airThenFly(page);
  expect(b.after, 'second entry settles again').toBe(0);
  expect(b.settleCalls).toBe(1);
  expect(errors).toEqual([]);
});

test('E4.2 N9 without ?char: no settle call on entering OP mode (the no-flag game is unchanged)', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => { try { localStorage.setItem('k3d.quality', 'low'); } catch { /* ignore */ } });
  await page.goto('./');
  await start(page, { navigate: false });
  await waitChunks(page);
  expect(await page.evaluate(() => (window as any).__k3d.character), 'no character hook without the flag').toBeUndefined();
  const a = await airThenFly(page);
  expect(a.settleCalls, 'no settle call without the flag').toBe(0);
});

test('E5.1 G2: the picker warms the selected card, Confirm installs it and resumes; no warm stage runs after the game resumed', async ({ page }) => {
  // (G1c version: the pause menu warmed the next model of the cycle on every pause. G2 removed that cycle; the warm now follows the
  // card the player selected in the picker.)
  test.setTimeout(120_000);
  const errors = await boot(page);
  const stages = () => page.evaluate(() => (window as any).__k3d.character.timings.entries.filter((e: any) => e.stage.startsWith('warm.')).map((e: any) => [e.stage, e.at]));
  const cur = () => page.evaluate(() => (window as any).__k3d.character.id as string);
  await page.locator('#btn-pause').click();
  await page.locator('#pause-char').click();
  await expect(page.locator('#char-picker')).toBeVisible();
  await page.locator('#char-picker [role=radio][data-id=woman]').click();
  await page.waitForFunction(() => (window as any).__k3d.character.hasWarm('woman'), null, { timeout: 30_000 });
  await page.waitForFunction(() => (window as any).__k3d.character.timings.entries.some((e: any) => e.stage === 'warm.predraw'), null, { timeout: 30_000 });
  await page.locator('#pk-confirm').click();
  await page.waitForFunction(() => (window as any).__k3d.character.id === 'woman', null, { timeout: 30_000 });
  const tResume = await page.evaluate(() => performance.now());
  await page.waitForTimeout(1500);
  const late = (await stages()).filter(([, at]: [string, number]) => at > tResume + 80);
  test.info().annotations.push({ type: 'warm stages later than 80 ms after the install', description: late.map(([s]: [string]) => s).join(',') || 'none' });
  expect(late, 'no warm-up stage runs after the swap').toEqual([]);
  expect(await cur()).toBe('woman');
  await expect(page.locator('#pause')).toBeHidden();
  expect(errors).toEqual([]);
});

test('E6.1 G1c: the first draw of a model happens hidden before it is installed (cold hook swap), and the pause menu does not start the next warm in the frames after a swap', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await boot(page);
  const entries = () => page.evaluate(() => (window as any).__k3d.character.timings.entries.map((e: any) => [e.stage, e.swap, e.at, e.id]));
  // (a) an in-play swap with nothing warmed: predraw precedes install, in the same swap
  expect(await page.evaluate(() => (window as any).__k3d.character.swap('woman'))).toBe(true);
  const e = (await entries()) as [string, number, number, string][];
  const sw = Math.max(...e.filter(([s, , , id]) => s === 'install' && id === 'woman').map(([, n]) => n));
  const mine = e.filter(([, n]) => n === sw);
  const iPre = mine.findIndex(([s]) => s === 'predraw'), iInst = mine.findIndex(([s]) => s === 'install');
  expect(iPre, 'a cold swap draws the model hidden once').toBeGreaterThanOrEqual(0);
  expect(iPre, 'before the install').toBeLessThan(iInst);
  // (b) G2: the pause menu no longer warms anything by itself (the cycle is gone); a picker warm starts only after a selection and
  // 24 still frames.
  await page.locator('#btn-pause').click();
  await page.waitForTimeout(1500);
  const before = ((await entries()) as [string, number, number, string][]).filter(([s]) => s.startsWith('warm.')).length;
  expect(before, 'opening the pause menu starts no warm-up').toBe(0);
  await page.locator('#pause-char').click();
  await page.locator('#char-picker [role=radio][data-id=teen-girl]').click();
  const tSel = await page.evaluate(() => performance.now());
  await page.waitForFunction(() => (window as any).__k3d.character.timings.entries.some((x: any) => x.stage.startsWith('warm.')), null, { timeout: 30_000 });
  const first = ((await entries()) as [string, number, number, string][]).filter(([s]) => s.startsWith('warm.'))[0];
  test.info().annotations.push({ type: 'first warm stage after the selection (ms)', description: String(Math.round(first[2] - tSel)) });
  expect(first[2] - tSel, 'not in the frames right after the tap (settle window)').toBeGreaterThan(250);
  expect(errors).toEqual([]);
});
