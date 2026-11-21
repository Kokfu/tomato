// CHAR-P2a: the character seam in the real game (profiles, ?char flag, swap, body visibility, physics independence).
// The Rocketbox adults ship in public/models/characters/ (delivered by Studio); nothing here is skipped.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { frames, start, waitChunks, watch } from './helpers.ts';

const DEFAULT_GLB = 'casual-character.glb';
// CHAR-P4: the six MakeHuman/MPFB characters: id, file, body height without hair (m, the brief's spec), height with hair (profile).
const MPFB: [string, string, number, number][] = [
  ['man', 'man.glb', 1.70, 1.707], ['woman', 'woman.glb', 1.58, 1.589], ['teen-boy', 'teen-boy.glb', 1.66, 1.666],
  ['teen-girl', 'teen-girl.glb', 1.56, 1.572], ['young-boy', 'young-boy.glb', 1.28, 1.294], ['young-girl', 'young-girl.glb', 1.27, 1.277],
];
const MPFB_IDS = MPFB.map(([id]) => id);
// The two Rocketbox prototypes stay beside them as a reference for the owner's decision.
const ADULTS: [string, string][] = [['adult-man', 'adult-man.glb'], ['adult-woman', 'adult-woman.glb'], ...MPFB.map(([id, f]) => [id, f] as [string, string])];
const TOTAL_HEIGHT: Record<string, number> = { 'adult-man': 1.70, 'adult-woman': 1.58, ...Object.fromEntries(MPFB.map(([id, , , h]) => [id, h])) };
const AVAILABLE: [string, string][] = [['default', DEFAULT_GLB], ['test-short', DEFAULT_GLB], ...ADULTS];

interface Run { glbs: string[]; warns: string[]; errors: string[] }

/** Open the game (quality pinned low, like the other specs) and press Start. */
async function boot(page: Page, query = '', opts: { init?: () => void; delayGlb?: number; gate?: Promise<void> } = {}): Promise<Run> {
  const run: Run = { glbs: [], warns: [], errors: [] };
  page.on('request', (r) => { const m = /\/models\/characters\/([^/?]+\.glb)/.exec(r.url()); if (m) run.glbs.push(m[1]); });
  page.on('console', (m) => { if (m.type() === 'warning') run.warns.push(m.text()); });
  page.on('console', (m) => { if (m.type() === 'error') run.errors.push(m.text()); });
  page.on('pageerror', (e) => run.errors.push(`pageerror: ${e.message}`));
  await page.addInitScript(() => { try { localStorage.setItem('k3d.quality', 'low'); } catch { /* ignore */ } });
  if (opts.init) await page.addInitScript(opts.init);
  if (opts.delayGlb) {
    await page.route(`**/${DEFAULT_GLB}`, async (route) => { await new Promise((r) => setTimeout(r, opts.delayGlb)); await route.continue(); });
  }
  if (opts.gate) {
    await page.route(`**/${DEFAULT_GLB}`, async (route) => { await opts.gate; await route.continue(); });
  }
  await page.goto(`./${query}`);
  await start(page, { navigate: false });
  await waitChunks(page);
  return run;
}

const k3d = <T>(page: Page, fn: (k: any) => T): Promise<T> => page.evaluate(`(${fn.toString()})(window.__k3d)`) as Promise<T>;
const settled = (page: Page, id: string) => page.waitForFunction((id) => { const c = (window as any).__k3d.character; return c.id === id && !c.loading && !c.fallback; }, id, { timeout: 60_000 });
/** True once a GLB (skinned) model has replaced the procedural stand-in. Works without the __k3d.character hook (no flag). */
const hasGlb = (page: Page) => page.evaluate(() => { let skinned = false; (window as any).__k3d.player.visual.root.traverse((o: any) => { if (o.isSkinnedMesh) skinned = true; }); return skinned; });
const glbShown = (page: Page) => page.waitForFunction(() => { let skinned = false; (window as any).__k3d.player.visual.root.traverse((o: any) => { if (o.isSkinnedMesh) skinned = true; }); return skinned; }, null, { timeout: 60_000 });
/** The facing of the player's ROOT group (the controller-owned outer group): where its local +Z axis points in the world (matrixWorld), plus its up axis. It does not look inside the model, so it cannot see a model that is rotated within the root. */
const rendered = (page: Page) => page.evaluate(() => {
  const root = (window as any).__k3d.player.visual.root; root.updateMatrixWorld(true);
  const e = root.matrixWorld.elements;
  return { fx: e[8], fy: e[9], fz: e[10], upY: e[5], heading: (window as any).__k3d.player.heading };
});
/** Rendered facing equals the controller's heading: forward = (sin h, 0, cos h), upright. */
function expectFacing(r: { fx: number; fy: number; fz: number; upY: number; heading: number }, label: string): void {
  expect(r.fx, `${label}: forward x`).toBeCloseTo(Math.sin(r.heading), 3);
  expect(r.fz, `${label}: forward z`).toBeCloseTo(Math.cos(r.heading), 3);
  expect(r.fy, `${label}: not pitched`).toBeCloseTo(0, 3);
  expect(r.upY, `${label}: upright`).toBeCloseTo(1, 3);
}
const ids2 = (page: Page) => k3d(page, (k) => ({ visible: k.player.visual.root.visible }));
const ids = (page: Page) => k3d(page, (k) => ({ id: k.character.id, visible: k.player.visual.root.visible, fp: k.tpc.firstPerson, h: k.tpc.heights }));

// The pause-menu route into the car (same as ui.spec): the car is placed beside the player.
async function enterCar(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await page.locator('#pause-drive').click();
  await expect(page.locator('#pause')).toBeHidden({ timeout: 60_000 });
  await page.waitForFunction(() => (window as any).__k3d.driving.canEnter((window as any).__k3d.player), null, { timeout: 30_000 });
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => (window as any).__k3d.driving.active === true, null, { timeout: 10_000 });
}

test.describe('character seam (CHAR-P2a)', () => {
  test('no flag: the default model only, same single GLB request, nothing read or stored, no hook, no dev button', async ({ page }) => {
    const reads: string[] = [];
    await page.addInitScript(() => {
      const orig = Storage.prototype.getItem;
      (window as any).__reads = [];
      Storage.prototype.getItem = function (k: string) { (window as any).__reads.push(k); return orig.call(this, k); };
    });
    const run = await boot(page);
    await glbShown(page);
    expect(run.glbs).toEqual([DEFAULT_GLB]);
    expect(await page.evaluate(() => (window as any).__k3d.character), 'the debug hook exists only with ?char').toBeUndefined();
    expect(await page.evaluate(() => localStorage.getItem('k3d.character'))).toBeNull();
    reads.push(...(await page.evaluate(() => (window as any).__reads as string[])));
    // (the evaluate above reads the key itself once; every earlier read of it would come from the game)
    expect(reads.filter((k) => k === 'k3d.character').length, 'the game does not read k3d.character without the flag').toBe(1);
    expect(await k3d(page, (k) => k.tpc.heights)).toEqual({ pivot: 1.52, eye: 1.62 });
    expect(await ids2(page)).toMatchObject({ visible: true });
    await page.keyboard.press('Escape');
    await expect(page.locator('#pause-char')).toBeHidden();
    expect(run.errors).toEqual([]);
    expect(run.warns.filter((w) => /haracter/.test(w))).toEqual([]);
  });

  for (const [id, file] of AVAILABLE) {
    test(`?char=${id}: loads, fetches only its own GLB, persists the choice`, async ({ page }) => {
      const run = await boot(page, `?char=${id}`);
      await settled(page, id);
      expect(new Set(run.glbs)).toEqual(new Set([file]));
      expect(run.glbs.length).toBe(1);
      const s = await ids(page);
      expect(s.id).toBe(id);
      expect(s.visible).toBe(true);
      expect(await page.evaluate(() => localStorage.getItem('k3d.character'))).toBe(id);
      expect(await k3d(page, (k) => k.character.live)).toBe(1);
      expect(run.errors).toEqual([]);
      expect(run.warns.filter((w) => /haracter/.test(w))).toEqual([]);
    });
  }

  for (const [id, file] of ADULTS) {
    test(`?char=${id} with its GLB missing falls back to the default with one warning`, async ({ page }) => {
      await page.route(`**/${file}`, (route) => route.fulfill({ status: 404, body: 'nope' }));
      const run = await boot(page, `?char=${id}`);
      await settled(page, 'default');
      expect(run.warns.filter((w) => /unavailable/.test(w)).length).toBe(1);
      expect(await page.evaluate(() => localStorage.getItem('k3d.character'))).toBeNull();
    });

    test(`?char=${id}: normalised height, soles on the ground, hair is an alpha cut-out, feet found`, async ({ page }) => {
      const prof = TOTAL_HEIGHT[id];
      const bodySpec = MPFB.find(([i]) => i === id)?.[2];
      await boot(page, `?char=${id}`);
      await settled(page, id);
      await frames(page, 5);
      const m = await k3d(page, (k) => {
        const root = k.player.visual.root;
        root.updateMatrixWorld(true);
        let minY = 1e9, maxY = -1e9; const mats: { name: string; alphaTest: number; side: number; transparent: boolean }[] = [];
        root.traverse((o: any) => {
          if (o.isSkinnedMesh) { o.computeBoundingBox(); const b = o.boundingBox.clone().applyMatrix4(o.matrixWorld); minY = Math.min(minY, b.min.y); maxY = Math.max(maxY, b.max.y); }
          if (o.isMesh) for (const mm of ([] as any[]).concat(o.material)) mats.push({ name: mm.name, alphaTest: mm.alphaTest, side: mm.side, transparent: mm.transparent });
        });
        // The body without hair: the skinned meshes whose material is not the hair cut-out (skin, clothes and shoes share one atlas).
        let bMin = 1e9, bMax = -1e9;
        root.traverse((o: any) => {
          if (!o.isSkinnedMesh || /Hair/.test(([] as any[]).concat(o.material)[0]?.name ?? '')) return;
          o.computeBoundingBox(); const b = o.boundingBox.clone().applyMatrix4(o.matrixWorld); bMin = Math.min(bMin, b.min.y); bMax = Math.max(bMax, b.max.y);
        });
        return { height: maxY - minY, body: bMax - bMin, soles: minY - root.position.y, mats };
      });
      expect(Math.abs(m.height - prof)).toBeLessThan(0.02);
      if (bodySpec) {
        test.info().annotations.push({ type: 'body-height', description: `${id}: with hair ${m.height.toFixed(3)} m, body without hair ${m.body.toFixed(3)} m (spec ${bodySpec})` });
        expect(Math.abs(m.body - bodySpec), `${id} body height without hair`).toBeLessThan(0.025);
      }
      expect(Math.abs(m.soles)).toBeLessThan(0.02);
      const hair = m.mats.find((x) => /Hair/.test(x.name));
      expect(hair, 'a hair material').toBeTruthy();
      expect(hair!.alphaTest).toBeCloseTo(0.5, 5);
      expect(hair!.side).toBe(2); // THREE.DoubleSide
      expect(hair!.transparent).toBe(false);
      const skin = m.mats.find((x) => /Skin/.test(x.name));
      expect(skin).toMatchObject({ alphaTest: 0, side: 0, transparent: false });
    });
  }

  test('invalid ?char id and a bad saved id fall back to the default; storage is not touched', async ({ page }) => {
    const run = await boot(page, '?char=no-such-character', { init: () => { try { localStorage.setItem('k3d.character', 'removed-profile'); } catch { /* ignore */ } } });
    await settled(page, 'default');
    expect(run.warns.filter((w) => /Unknown character/.test(w)).length).toBe(1);
    expect(await page.evaluate(() => localStorage.getItem('k3d.character'))).toBe('removed-profile');
    await page.reload();
    await start(page, { navigate: false });
    await settled(page, 'default');
  });

  test('a broken model url falls back to the default with exactly one warning', async ({ page }) => {
    await page.route('**/adult-man.glb', (route) => route.fulfill({ status: 404, body: 'nope' }));
    const run = await boot(page, '?char=adult-man');
    await settled(page, 'default');
    expect(run.warns.filter((w) => /unavailable/.test(w)).length).toBe(1);
    expect(await page.evaluate(() => localStorage.getItem('k3d.character'))).toBeNull();
    expect(await k3d(page, (k) => k.character.live)).toBe(1);
    expect(await ids(page)).toMatchObject({ id: 'default', visible: true });
  });

  test('swap keeps position, heading and camera mode; camera heights follow the profile', async ({ page }) => {
    await boot(page, '?char=default');
    await settled(page, 'default');
    await k3d(page, (k) => { k.player.teleport(k.player.position.x + 3, k.player.position.z + 2); k.player.heading = 1.234; });
    await waitChunks(page);
    for (const [target, hgt] of [['test-short', 1.3], ['adult-man', 1.7], ['adult-woman', 1.58]] as const) for (const fp of [false, true]) {
      if ((await ids(page)).fp !== fp) await page.keyboard.press('KeyV');
      await frames(page, 3);
      const before = await k3d(page, (k) => ({ x: k.player.position.x, y: k.player.position.y, z: k.player.position.z, h: k.player.heading, fp: k.tpc.firstPerson }));
      expect(await page.evaluate((id) => (window as any).__k3d.character.swap(id), target)).toBe(true);
      await frames(page, 3);
      const after = await k3d(page, (k) => ({ x: k.player.position.x, y: k.player.position.y, z: k.player.position.z, h: k.player.heading, fp: k.tpc.firstPerson, vis: k.player.visual.root.visible, heights: k.tpc.heights, id: k.character.id }));
      expect(after.id).toBe(target);
      expect(after.fp).toBe(before.fp);
      expect(after.vis).toBe(!fp);
      expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(0.02);
      expect(Math.abs(after.y - before.y)).toBeLessThan(0.02);
      expect(Math.abs(after.h - before.h)).toBeLessThan(0.01);
      expect(after.heights.eye).toBeCloseTo(0.942 * hgt, 3);
      expect(await k3d(page, (k) => k.character.swap('default'))).toBe(true);
      expect(await k3d(page, (k) => k.tpc.heights)).toEqual({ pivot: 1.52, eye: 1.62 });
    }
  });

  test('swap in OP fly mode and in the car keeps the body visibility rule', async ({ page }) => {
    const run = await boot(page, '?char=default');
    await settled(page, 'default');
    // OP fly mode: the avatar stays visible where it stands (as before CHAR), also in first person.
    await page.keyboard.press('KeyP');
    await page.waitForFunction(() => (window as any).__k3d.fly.active === true);
    await k3d(page, (k) => k.character.swap('test-short'));
    expect(await k3d(page, (k) => ({ v: k.player.visual.root.visible, rule: k.character.bodyVisible() }))).toEqual({ v: true, rule: true });
    await page.keyboard.press('KeyP');
    await page.waitForFunction(() => (window as any).__k3d.fly.active === false);
    expect((await ids(page)).visible).toBe(true);
    // In the car the body is hidden, a swap there stays hidden, and getting out shows the new model.
    await enterCar(page);
    expect((await ids(page)).visible).toBe(false);
    await k3d(page, (k) => k.character.swap('default'));
    expect(await k3d(page, (k) => ({ id: k.character.id, v: k.player.visual.root.visible, drv: k.driving.active }))).toEqual({ id: 'default', v: false, drv: true });
    await k3d(page, (k) => k.character.swap('test-short'));
    expect((await ids(page)).visible).toBe(false);
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => (window as any).__k3d.driving.active === false, null, { timeout: 15_000 });
    expect(await ids(page)).toMatchObject({ id: 'test-short', visible: true });
    expect(run.errors).toEqual([]);
  });

  test('regression: the model finishing its load while driving stays hidden (default path, no flag)', async ({ page }) => {
    const run = await boot(page, '', { delayGlb: 20_000 });
    expect(await hasGlb(page), 'still the procedural stand-in').toBe(false);
    await enterCar(page);
    expect((await ids2(page)).visible).toBe(false);
    await glbShown(page);
    // Before the fix the loaded model was made visible (`!firstPerson`) inside the car.
    expect(await k3d(page, (k) => ({ v: k.player.visual.root.visible, drv: k.driving.active }))).toEqual({ v: false, drv: true });
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => (window as any).__k3d.driving.active === false, null, { timeout: 15_000 });
    expect((await ids2(page)).visible).toBe(true);
    expect(run.errors).toEqual([]);
  });

  // F1 (review): installing a model by quaternion copy rendered it mirrored (yaw pi - h) for |h| > 90 degrees.
  test("the player root's world +Z follows the heading after a late default load (no flag, GLB held back until released)", async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const run = await boot(page, '', { gate });
    expect(await hasGlb(page)).toBe(false);
    for (const h of [Math.PI, 2.5]) {
      await page.evaluate((h) => { (window as any).__k3d.player.heading = h; }, h);
      await frames(page, 2);
      expectFacing(await rendered(page), `stand-in, heading ${h}`);
    }
    await page.evaluate(() => { (window as any).__k3d.player.heading = Math.PI; });
    release();
    await glbShown(page);
    await frames(page, 4);
    expectFacing(await rendered(page), 'late GLB at the spawn heading (pi)');
    for (const h of [2.5, -2.0, 0.4]) {
      await page.evaluate((h) => { (window as any).__k3d.player.heading = h; }, h);
      await frames(page, 3);
      expectFacing(await rendered(page), `late GLB, heading ${h}`);
    }
    expect(run.errors).toEqual([]);
  });

  test("the player root's world +Z follows the heading after every swap, into each character and back (headings pi and 2.5)", async ({ page }) => {
    await boot(page, '?char=default');
    await settled(page, 'default');
    for (const h of [Math.PI, 2.5]) {
      await page.evaluate((h) => { (window as any).__k3d.player.heading = h; }, h);
      for (const target of [...MPFB_IDS, 'adult-man', 'adult-woman', 'test-short', 'default']) {
        expect(await page.evaluate((id) => (window as any).__k3d.character.swap(id), target)).toBe(true);
        await frames(page, 3);
        const r = await rendered(page);
        expect(r.heading).toBeCloseTo(h, 6);
        expectFacing(r, `heading ${h} after swap to ${target}`);
      }
    }
  });

  test('10 swaps leave renderer.info resources where they started (±2)', async ({ page }) => {
    await boot(page, '?char=default');
    await settled(page, 'default');
    await frames(page, 30);
    const info = () => k3d(page, (k) => ({ g: k.renderer.info.memory.geometries, t: k.renderer.info.memory.textures, p: k.renderer.info.programs.length, live: k.character.live }));
    const before = await info();
    for (let i = 0; i < 10; i++) {
      expect(await k3d(page, (k) => k.character.swap('test-short'))).toBe(true);
      await frames(page, 4);
      expect(await k3d(page, (k) => k.character.swap('default'))).toBe(true);
      await frames(page, 4);
    }
    await frames(page, 30);
    const after = await info();
    expect(Math.abs(after.g - before.g)).toBeLessThanOrEqual(2);
    expect(Math.abs(after.t - before.t)).toBeLessThanOrEqual(2);
    expect(Math.abs(after.p - before.p)).toBeLessThanOrEqual(2);
    expect(after.live).toBe(1);
  });

  test('10 swaps through both Rocketbox adults leave renderer.info resources where they started (±2)', async ({ page }) => {
    test.setTimeout(300_000);
    await boot(page, '?char=default');
    await settled(page, 'default');
    await frames(page, 30);
    const info = () => k3d(page, (k) => ({ g: k.renderer.info.memory.geometries, t: k.renderer.info.memory.textures, p: k.renderer.info.programs.length, live: k.character.live }));
    // One lap first: the adults' programs and textures exist after it; the ten laps after must not grow.
    for (const id of ['adult-man', 'adult-woman', 'default']) { expect(await page.evaluate((id) => (window as any).__k3d.character.swap(id), id)).toBe(true); await frames(page, 4); }
    await frames(page, 30);
    const before = await info();
    for (let i = 0; i < 10; i++) {
      for (const id of ['adult-man', 'adult-woman', 'default']) {
        expect(await page.evaluate((id) => (window as any).__k3d.character.swap(id), id)).toBe(true);
        await frames(page, 4);
      }
    }
    await frames(page, 30);
    const after = await info();
    expect(Math.abs(after.g - before.g)).toBeLessThanOrEqual(2);
    expect(Math.abs(after.t - before.t)).toBeLessThanOrEqual(2);
    expect(Math.abs(after.p - before.p)).toBeLessThanOrEqual(2);
    expect(after.live).toBe(1);
  });

  test('10 laps through all six MPFB characters leave renderer.info resources where they started (±2)', async ({ page }) => {
    test.setTimeout(900_000);
    await boot(page, '?char=default');
    await settled(page, 'default');
    await frames(page, 30);
    const info = () => k3d(page, (k) => ({ g: k.renderer.info.memory.geometries, t: k.renderer.info.memory.textures, p: k.renderer.info.programs.length, live: k.character.live }));
    // One lap first: the programs and textures of all six exist after it; the ten laps after must not grow.
    const lap = async () => { for (const id of [...MPFB_IDS, 'default']) { expect(await page.evaluate((id) => (window as any).__k3d.character.swap(id), id), `swap to ${id}`).toBe(true); await frames(page, 3); } };
    await lap();
    await frames(page, 30);
    const before = await info();
    for (let i = 0; i < 10; i++) await lap();
    await frames(page, 30);
    const after = await info();
    test.info().annotations.push({ type: 'renderer-info', description: `before ${JSON.stringify(before)} after ${JSON.stringify(after)}` });
    expect(Math.abs(after.g - before.g)).toBeLessThanOrEqual(2);
    expect(Math.abs(after.t - before.t)).toBeLessThanOrEqual(2);
    expect(Math.abs(after.p - before.p)).toBeLessThanOrEqual(2);
    expect(after.live).toBe(1);
  });

  // The gait is scrubbed by distance travelled, so a planted foot should stay where it is on the ground. Measured on the real
  // visual of each profile with the simulation frozen. Two measures: the ratio of the stance foot's backward speed to the ground
  // speed (1 = planted; informative, the median is what the distance scrubbing controls) and, per footfall, how far the foot
  // travels over the ground while it is in contact (what the eye sees as sliding; the review's metric).
  //   contact = the foot bone within 2 cm of its lowest point; slide = max - min of its world position along the travel direction.
  // CHAR-P4 review F1/F3: the v1 MakeHuman female run retarget (woman, teen-girl) slid 7-8 cm per footfall; assets-v2 (Studio) re-plants it.
  // The v1 failure is recorded in char-p4ixes\e2e-v1-slide-fail.txt. No known-failure markers remain.
  const SLIDE_CM = { runMean: 3.5, runMax: 6.0, walkMean: 3.5, walkMax: 5.0 }; // the gate for the six MPFB profiles (Atlas, CHAR-P4)
  // The slide gate (SLIDE_CM) applies to the six MPFB profiles. default, adult-man and adult-woman are unchanged code paths and assets: their
  // slide is recorded as an annotation only (default keeps its median check).
  for (const [id] of [['default'], ['adult-man'], ['adult-woman'], ...MPFB]) {
    test(`${id}: stance feet stay planted at walking (1.6 m/s) and running (5.2 m/s) speed (slide per footfall)`, async ({ page }) => {
      await boot(page, `?char=${id}`);
      await settled(page, id);
      await frames(page, 5);
      const r = await page.evaluate(() => {
        const k = (window as any).__k3d;
        // Everything below runs synchronously, so the game loop cannot interleave its own updates (the player stands still).
        const root = k.player.visual.root; const feet: any[] = [];
        root.traverse((o: any) => { if (o.isBone && /^foot[_.]?[lr]$|foot/i.test(o.name) && !/toe|ball/i.test(o.name)) feet.push(o); });
        type Stat = { median: number; mean: number; p10: number; p90: number; samples: number; feet: string[]; slideCm: { n: number; mean: number; median: number; max: number } };
        const out: Record<string, Stat> = {};
        for (const [label, v] of [['walk', 1.6], ['run', 5.2]] as [string, number][]) {
          const vis = k.player.visual; const dt = 1 / 60;
          for (let i = 0; i < 90; i++) vis.update(dt, { speed: v, grounded: true, vy: 0 }); // settle the blends
          const pos: number[][] = [[], []]; const ys: number[][] = [[], []]; const body: number[] = [];
          const N = 480;
          for (let i = 0; i < N; i++) {
            vis.update(dt, { speed: v, grounded: true, vy: 0 });
            root.updateMatrixWorld(true);
            body.push(v * dt * (i + 1));
            for (let f = 0; f < 2; f++) { const p = root.worldToLocal(feet[f].getWorldPosition(new (feet[f].position.constructor)())); pos[f].push(p.z); ys[f].push(p.y); }
          }
          const ratios: number[] = []; // stance foot speed (backwards, in the body's frame) / ground speed: 1 = planted
          const slides: number[] = [];
          for (let f = 0; f < 2; f++) {
            const lo = Math.min(...ys[f]), hi = Math.max(...ys[f]);
            for (let i = 1; i < N - 1; i++) {
              if (ys[f][i] > lo + (hi - lo) * 0.15) continue; // stance only: the foot is near its lowest point
              ratios.push(-(pos[f][i + 1] - pos[f][i - 1]) / (2 * dt) / v);
            }
            // per footfall: world-space travel of the foot over one contact (the first, partial contact is skipped)
            let cur: { min: number; max: number; start: number } | null = null;
            for (let i = 0; i < N; i++) {
              if (ys[f][i] <= lo + 0.02) {
                const wz = body[i] + pos[f][i];
                if (!cur) cur = { min: wz, max: wz, start: i };
                cur.min = Math.min(cur.min, wz); cur.max = Math.max(cur.max, wz);
              } else if (cur) { if (cur.start > 0) slides.push((cur.max - cur.min) * 100); cur = null; }
            }
          }
          ratios.sort((a, b) => a - b); slides.sort((a, b) => a - b);
          const at = (q: number) => ratios[Math.min(ratios.length - 1, Math.floor(ratios.length * q))] ?? 0;
          const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
          out[label] = {
            median: at(0.5), mean: sum(ratios.map((r) => Math.abs(r - 1))) / Math.max(1, ratios.length), p10: at(0.1), p90: at(0.9), samples: ratios.length, feet: feet.map((f) => f.name),
            slideCm: { n: slides.length, mean: sum(slides) / Math.max(1, slides.length), median: slides[slides.length >> 1] ?? NaN, max: slides[slides.length - 1] ?? NaN },
          };
        }
        return out;
      });
      const f = (g: { median: number; mean: number; p10: number; p90: number; slideCm: { n: number; mean: number; max: number } }) =>
        `ratio median ${g.median.toFixed(2)} (p10 ${g.p10.toFixed(2)}, p90 ${g.p90.toFixed(2)}, mean |err| ${(g.mean * 100).toFixed(0)}%); slide per footfall mean ${g.slideCm.mean.toFixed(1)} cm, max ${g.slideCm.max.toFixed(1)} cm (n ${g.slideCm.n})`;
      test.info().annotations.push({ type: 'slide', description: `${id}: walk ${f(r.walk)} | run ${f(r.run)}` });
      expect(r.walk.samples).toBeGreaterThan(10);
      expect(r.walk.feet.length).toBe(2);
      if (id === 'adult-man' || id === 'adult-woman') return; // reference profiles: recorded only
      const gated = MPFB_IDS.includes(id);
      if (!gated) { // default: the original median checks only
        expect(Math.abs(r.walk.median - 1), 'default walking: median').toBeLessThan(0.1);
        expect(Math.abs(r.run.median - 1), 'default running: median').toBeLessThan(0.2);
        return;
      }
      expect(r.run.slideCm.n, 'enough footfalls were measured').toBeGreaterThanOrEqual(10);
      // Walking.
      expect(Math.abs(r.walk.median - 1), `${id} walking: median stance-foot speed vs ground speed`).toBeLessThan(0.1);
      expect(r.walk.slideCm.mean, `${id} walking: mean slide per footfall (cm)`).toBeLessThanOrEqual(SLIDE_CM.walkMean);
      expect(r.walk.slideCm.max, `${id} walking: worst footfall (cm)`).toBeLessThanOrEqual(SLIDE_CM.walkMax);
      // Running: the median alone hid a 7-8 cm slide on the female clip, so the footfalls themselves are asserted.
      expect(Math.abs(r.run.median - 1), `${id} running: median stance-foot speed vs ground speed`).toBeLessThan(0.2);
      expect(r.run.slideCm.mean, `${id} running: mean slide per footfall (cm)`).toBeLessThanOrEqual(SLIDE_CM.runMean);
      expect(r.run.slideCm.max, `${id} running: worst footfall (cm)`).toBeLessThanOrEqual(SLIDE_CM.runMax);
    });
  }

  // CHAR-P4 review F2/F3: a real jump, and the soles on landing. The lowest vertex of the skinned meshes against the root's ground.
  for (const [id] of [['default'], ['adult-man'], ['adult-woman'], ...MPFB]) {
    test(`${id}: a real jump leaves the ground and the soles never sink below it on take-off, in the air or landing`, async ({ page }) => {
      await boot(page, `?char=${id}`);
      await settled(page, id);
      await frames(page, 10);
      const r = await page.evaluate(() => new Promise<{ apex: number; airFrames: number; landed: boolean; minSoleCm: number; minAfterLandCm: number; atRestCm: number; airClip: string; trace: number[] }>((resolve) => {
        const k = (window as any).__k3d; const vis = k.player.visual; const root = vis.root;
        const meshes: any[] = []; root.traverse((o: any) => { if (o.isSkinnedMesh) meshes.push(o); });
        const v = new (root.position.constructor)();
        const soleCm = () => {
          root.updateMatrixWorld(true);
          const ry = root.matrixWorld.elements[13]; let low = Infinity;
          for (const m of meshes) { const n = m.geometry.attributes.position.count; for (let i = 0; i < n; i++) { m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld); if (v.y < low) low = v.y; } }
          return (low - ry) * 100;
        };
        const y0 = k.player.position.y; const atRestCm = soleCm();
        k.setSimulatedDt(1 / 60); k.setStepsPerFrame(1);
        let f = 0, apex = 0, air = 0, minSole = Infinity, minAfter = Infinity, left = false, landedAt = -1; const trace: number[] = [];
        const tick = () => {
          if (f === 3) k.input.jump = true;
          if (f === 4) k.input.jump = false;
          if (f >= 4) {
            const g = k.player.grounded;
            if (!g) { left = true; air++; apex = Math.max(apex, k.player.position.y - y0); }
            if (left && g && landedAt < 0) landedAt = f;
            const c = soleCm(); minSole = Math.min(minSole, c);
            if (landedAt >= 0 && f <= landedAt + 40) { minAfter = Math.min(minAfter, c); trace.push(+c.toFixed(1)); }
          }
          if (f++ >= 160) { k.setSimulatedDt(0); return resolve({ apex, airFrames: air, landed: landedAt >= 0, minSoleCm: minSole, minAfterLandCm: minAfter, atRestCm, airClip: vis.airAction.getClip().name, trace }); }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }));
      test.info().annotations.push({ type: 'landing', description: `${id}: apex ${r.apex.toFixed(2)} m, ${r.airFrames} air frames, air clip ${r.airClip}, sole at rest ${r.atRestCm.toFixed(1)} cm, min sole ${r.minSoleCm.toFixed(1)} cm, min after landing ${r.minAfterLandCm.toFixed(1)} cm, first landing frames ${r.trace.slice(0, 12).join(' ')}` });
      expect(r.apex, 'the player really jumped (apex above the start, m)').toBeGreaterThan(0.5);
      expect(r.airFrames, 'frames spent in the air (the physics gives about 29 at 60 Hz, a third of a second is 20)').toBeGreaterThan(20);
      expect(r.landed, 'the player landed again').toBe(true);
      if (MPFB_IDS.includes(id)) expect(r.airClip, 'the airborne pose is the Jump clip').toBe('Jump');
      // The default stays above ground; the two Rocketbox adults (reference only, unchanged) are not asserted: they dip 3 cm on landing.
      if (id === 'default' || MPFB_IDS.includes(id)) {
        expect(r.atRestCm, `${id}: soles at rest (cm)`).toBeGreaterThanOrEqual(-1);
        expect(r.minSoleCm, `${id}: lowest sole over the whole jump (cm)`).toBeGreaterThanOrEqual(-1);
        expect(r.minAfterLandCm, `${id}: lowest sole in the 40 frames after touch-down (cm)`).toBeGreaterThanOrEqual(-1);
      }
    });
  }

  test('a fixed 10 s scripted walk / run / jump ends on the same spot for every profile (0.01 m)', async ({ page }) => {
    test.setTimeout(900_000);
    await boot(page, '?char=default');
    await settled(page, 'default');
    const script = (yaw: number) => page.evaluate((yaw) => new Promise<{ x: number; y: number; z: number; grounded: boolean }>((resolve) => {
      const k = (window as any).__k3d, sp = k.world.manifest.spawn;
      k.player.teleport(sp.x, sp.z);
      k.player.heading = yaw;
      k.setSimulatedDt(1 / 60);
      k.setStepsPerFrame(1);
      let f = 0;
      const tick = () => {
        // 0-3 s walk, 3-6 s run, jump at 6 s, 6-8 s run, 8-10 s walk at an angle
        const t = f / 60;
        k.tpc.yaw = yaw + (t >= 8 ? 0.6 : 0);
        k.input.touchX = 0;
        k.input.touchY = 1;
        k.input.touchRun = t >= 3 && t < 8;
        if (f === 360) k.input.jump = true;
        if (f++ >= 600) {
          k.input.touchY = 0; k.input.touchRun = false; k.setSimulatedDt(0);
          const p = k.player.position;
          return resolve({ x: p.x, y: p.y, z: p.z, grounded: k.player.grounded });
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }), yaw);
    // Pick the direction with the longest free walk from the spawn, using the default model.
    let best = { yaw: 0, d: -1 };
    const sp = await k3d(page, (k) => k.world.manifest.spawn);
    for (let i = 0; i < 8; i++) {
      const yaw = (i * Math.PI) / 4;
      const r = await script(yaw);
      const d = Math.hypot(r.x - sp.x, r.z - sp.z);
      if (d > best.d) best = { yaw, d };
    }
    expect(best.d).toBeGreaterThan(20);
    const ref = await script(best.yaw);
    const again = await script(best.yaw);
    expect(Math.hypot(again.x - ref.x, again.z - ref.z), 'the script itself is deterministic').toBeLessThan(0.001);
    for (const [id] of AVAILABLE) {
      await page.evaluate((id) => (window as any).__k3d.character.swap(id), id);
      await settled(page, id);
      await frames(page, 5);
      const r = await script(best.yaw);
      expect(Math.hypot(r.x - ref.x, r.z - ref.z), `${id} horizontal`).toBeLessThan(0.01);
      expect(Math.abs(r.y - ref.y), `${id} vertical`).toBeLessThan(0.01);
    }
  });

  test('persistence: only with the flag; a bare ?char reuses the saved id', async ({ page }) => {
    await boot(page, '?char=test-short');
    await settled(page, 'test-short');
    expect(await page.evaluate(() => localStorage.getItem('k3d.character'))).toBe('test-short');
    await page.goto('./?char');
    await start(page, { navigate: false });
    await settled(page, 'test-short');
    // without the flag the saved choice is ignored and the default is used
    await page.goto('./');
    await start(page, { navigate: false });
    await glbShown(page);
    expect(await page.evaluate(() => localStorage.getItem('k3d.character'))).toBe('test-short');
    // there is no debug hook (and so no debug swap) without the flag
    expect(await page.evaluate(() => (window as any).__k3d.character)).toBeUndefined();
    // with the flag the choice is stored again
    await page.goto('./?char=default');
    await start(page, { navigate: false });
    await settled(page, 'default');
    expect(await page.evaluate(() => localStorage.getItem('k3d.character'))).toBe('default');
  });

  test('the developer cycle button exists only with the flag and switches the character', async ({ page }) => {
    const run = await boot(page, '?char=default');
    await settled(page, 'default');
    await page.keyboard.press('Escape');
    const btn = page.locator('#pause-char');
    await expect(btn).toBeVisible();
    await expect(btn).toContainText('Character');
    await btn.click();
    // next in the cycle is adult-man
    await settled(page, 'adult-man');
    await page.waitForFunction(() => !(window as any).__k3d.character.loading, null, { timeout: 30_000 });
    expect((await ids(page)).id).toBe('adult-man');
    await expect(btn).toContainText('Adult man');
  });
});
