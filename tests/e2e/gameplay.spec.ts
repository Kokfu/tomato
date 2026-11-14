import { test, expect } from '@playwright/test';
import { watch, start, state, walk, teleport, waitChunks, chainOfWays, manifest, overview, landmarks } from './helpers.ts';

const SPAWN = manifest.spawn as { x: number; z: number };
// Mapped OSM ways of the Darul Hana pedestrian bridge: south approach, ramp, main span.
const DARUL_HANA = [634697570, 779037132, 568501299];

test.describe('gameplay', () => {
  test('spawns on valid walkable ground with collision loaded', async ({ page }) => {
    const issues = watch(page);
    await start(page);
    const s = await state(page);
    expect(Math.hypot(s.x - SPAWN.x, s.z - SPAWN.z)).toBeLessThan(0.5);
    expect(s.inWater).toBe(false);
    expect(s.inBuilding).toBe(false);
    expect(s.grounded).toBe(true);
    expect(Math.abs(s.y - s.ground)).toBeLessThan(0.05);
    expect(await page.evaluate(() => (window as any).__k3d.world.chunks.isReady((window as any).__k3d.player.position.x, (window as any).__k3d.player.position.z))).toBe(true);
    expect(issues.errors).toEqual([]);
  });

  test('W/A/S/D move relative to the camera, Shift runs, Space jumps', async ({ page }) => {
    await start(page);
    // Stand on Main Bazaar (open road) with the camera looking east along it.
    const mb = landmarks().find((l) => l.id === 'main-bazaar')!;
    await teleport(page, mb.x, mb.z);
    await waitChunks(page);
    const dir = async (code: string, ms: number, shift = false) => {
      await teleport(page, mb.x, mb.z);
      await page.evaluate(() => { const k = (window as any).__k3d; k.tpc.yaw = 0; k.player.velocity.set(0, 0, 0); });
      const a = await state(page);
      if (shift) await page.keyboard.down('ShiftLeft');
      await page.keyboard.down(code);
      await page.waitForTimeout(ms);
      const mid = await state(page);
      await page.keyboard.up(code);
      if (shift) await page.keyboard.up('ShiftLeft');
      return { dx: mid.x - a.x, dz: mid.z - a.z, speed: mid.speed };
    };
    // Camera yaw 0 looks north (-Z): W = north, S = south, A = west, D = east.
    const w = await dir('KeyW', 900);
    expect(w.dz).toBeLessThan(-0.8);
    expect(Math.abs(w.dx)).toBeLessThan(0.4);
    expect(w.speed).toBeGreaterThan(1.7);
    expect(w.speed).toBeLessThan(2.3);
    const s = await dir('KeyS', 900);
    expect(s.dz).toBeGreaterThan(0.8);
    const a = await dir('KeyA', 900);
    expect(a.dx).toBeLessThan(-0.8);
    const d = await dir('KeyD', 900);
    expect(d.dx).toBeGreaterThan(0.8);
    const run = await dir('KeyD', 1200, true);
    expect(run.speed).toBeGreaterThan(5.2);
    expect(run.dx).toBeGreaterThan(d.dx * 2);

    // Jump: leaves the ground, comes back down to it.
    await teleport(page, mb.x, mb.z);
    const g0 = await state(page);
    await page.keyboard.press('Space');
    await page.waitForTimeout(220);
    const up = await state(page);
    expect(up.y).toBeGreaterThan(g0.y + 0.3);
    expect(up.grounded).toBe(false);
    await page.waitForTimeout(900);
    const down = await state(page);
    expect(down.grounded).toBe(true);
    expect(Math.abs(down.y - down.ground)).toBeLessThan(0.05);
  });

  test('camera follows the character and rotates with the mouse', async ({ page }) => {
    await start(page);
    const cam = () => page.evaluate(() => {
      const k = (window as any).__k3d;
      return { d: k.camera.position.distanceTo(k.player.position), yaw: k.tpc.yaw, pitch: k.tpc.pitch, cy: k.camera.position.y, py: k.player.position.y, dist: k.tpc.distance };
    });
    const before = await cam();
    expect(before.d).toBeGreaterThan(1);
    expect(before.d).toBeLessThan(16);
    expect(before.cy).toBeGreaterThan(before.py + 0.5); // behind and above
    // Drag-look (pointer lock is not available to automation; drag is the documented fallback).
    await page.mouse.move(700, 500);
    await page.mouse.down();
    await page.mouse.move(900, 440, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    const after = await cam();
    expect(Math.abs(after.yaw - before.yaw)).toBeGreaterThan(0.2);
    expect(after.pitch).not.toBeCloseTo(before.pitch, 3);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(150);
    expect((await cam()).dist).toBeGreaterThan(after.dist);
    // After walking, the camera is still attached.
    await walk(page, [[SPAWN.x - 12, SPAWN.z + 6]], { maxSeconds: 12 });
    await page.waitForTimeout(400);
    const moved = await cam();
    expect(moved.d).toBeLessThan(16);
    // First-person toggle hides the body and moves the camera to eye height.
    await page.keyboard.press('KeyV');
    await page.waitForTimeout(150);
    const fp = await page.evaluate(() => { const k = (window as any).__k3d; return { vis: k.player.visual.root.visible, d: Math.hypot(k.camera.position.x - k.player.position.x, k.camera.position.z - k.player.position.z) }; });
    expect(fp.vis).toBe(false);
    expect(fp.d).toBeLessThan(0.05);
    await page.keyboard.press('KeyV');
  });

  test('cannot walk through buildings', async ({ page }) => {
    await start(page);
    await waitChunks(page);
    // Pick the five nearest solid buildings and try to walk straight through each.
    const targets = await page.evaluate(() => {
      const k = (window as any).__k3d, p = k.player.position, out: any[] = [];
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const d = k.world.chunks.dataAt(Math.floor(p.x / 256) + dx, Math.floor(p.z / 256) + dz);
        if (!d) continue;
        for (const b of d.buildings) {
          if (b.k === 7) continue; // open roofs do not collide
          let sx = 0, sz = 0;
          for (let i = 0; i < b.r[0].length; i += 2) { sx += b.r[0][i]; sz += b.r[0][i + 1]; }
          const n = b.r[0].length / 2;
          const x = d.cx * 256 + sx / n / 100, z = d.cz * 256 + sz / n / 100;
          if (k.world.collision.insideBuilding(x, z, 2)) out.push({ x, z, d: Math.hypot(x - p.x, z - p.z) });
        }
      }
      return out.sort((a, b) => a.d - b.d).slice(0, 5);
    });
    expect(targets.length).toBeGreaterThan(0);
    for (const t of targets) {
      await teleport(page, SPAWN.x, SPAWN.z);
      const r = await walk(page, [[t.x, t.z]], { run: true, speedup: 3, maxSeconds: Math.min(60, 10 + t.d / 3) });
      expect(r.everInBuilding, `entered building near ${t.x.toFixed(0)},${t.z.toFixed(0)}`).toBe(false);
      expect(r.reached).toBe(false);
    }
  });

  test('the river blocks walking; only the bridge crosses it', async ({ page }) => {
    await start(page);
    await waitChunks(page);
    // Straight north from the waterfront leads into the Sarawak River.
    const r = await walk(page, [[SPAWN.x, SPAWN.z - 150]], { run: true, maxSeconds: 25 });
    expect(r.reached).toBe(false);
    expect(r.sawWater).toBe(true);
    expect(r.everInWaterOffDeck).toBe(false);
    const s = await state(page);
    expect(s.inWater).toBe(false);
    expect(SPAWN.z - s.z).toBeLessThan(120);
  });

  test('Darul Hana Bridge is traversable end to end', async ({ page }) => {
    const issues = watch(page);
    await start(page);
    const chain = chainOfWays(DARUL_HANA, [SPAWN.x, SPAWN.z]);
    expect(chain.pts.length).toBeGreaterThan(20);
    const south = chain.pts[0], north = chain.pts[chain.pts.length - 1];
    expect(Math.max(...chain.elev)).toBeGreaterThan(8);
    await teleport(page, south[0], south[1]);
    await waitChunks(page);
    const a = await state(page);
    expect(a.inWater).toBe(false);
    const r = await walk(page, chain.pts, { run: true, speedup: 2, maxSeconds: 240, tolerance: 1.5 });
    expect(r.reached, `stopped at ${r.x.toFixed(1)}, ${r.z.toFixed(1)} (y ${r.y.toFixed(1)})`).toBe(true);
    expect(r.maxY).toBeGreaterThan(8); // actually climbed onto the elevated deck
    expect(r.overWaterOnDeck).toBeGreaterThan(100); // spent time above the river, supported by the deck
    expect(r.everInWaterOffDeck).toBe(false);
    const b = await state(page);
    expect(Math.hypot(b.x - north[0], b.z - north[1])).toBeLessThan(2);
    expect(b.inWater).toBe(false);
    expect(Math.abs(b.y - b.ground)).toBeLessThan(0.1);
    // The two landings are on opposite banks: the straight line between them crosses water.
    const crosses = await page.evaluate(([s, n]) => {
      const c = (window as any).__k3d.world.collision;
      let wet = 0;
      for (let i = 1; i < 40; i++) if (c.inWater(s[0] + ((n[0] - s[0]) * i) / 40, s[1] + ((n[1] - s[1]) * i) / 40)) wet++;
      return wet;
    }, [south, north]);
    expect(crosses).toBeGreaterThan(0);
    await page.screenshot({ path: 'docs/screenshots/bridge-north-landing.png' });
    expect(issues.errors).toEqual([]);
  });

  test('movement is frame-rate independent', async ({ page }) => {
    await start(page);
    const mb = landmarks().find((l) => l.id === 'main-bazaar')!;
    await teleport(page, mb.x, mb.z);
    await waitChunks(page);
    const run = (dt: number, seconds: number, yaw: number) =>
      page.evaluate(
        ({ dt, seconds, yaw, x, z }) =>
          new Promise<number>((resolve) => {
            const k = (window as any).__k3d;
            k.player.teleport(x, z);
            k.setSimulatedDt(dt);
            k.tpc.yaw = yaw;
            let frames = Math.round(seconds / dt);
            const tick = () => {
              k.input.touchY = 1;
              k.input.touchRun = true;
              if (frames-- <= 0) {
                k.input.touchY = 0;
                k.input.touchRun = false;
                k.setSimulatedDt(0);
                return resolve(Math.hypot(k.player.position.x - x, k.player.position.z - z));
              }
              requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          }),
        { dt, seconds, yaw, x: mb.x, z: mb.z },
      );
    // Find a clear heading first (longest unobstructed run), then compare frame rates along it.
    let best = 0, yaw = 0;
    for (let i = 0; i < 8; i++) {
      const d = await run(1 / 60, 2, (i * Math.PI) / 4);
      if (d > best) { best = d; yaw = (i * Math.PI) / 4; }
    }
    expect(best).toBeGreaterThan(8);
    const d15 = await run(1 / 15, 2.5, yaw), d30 = await run(1 / 30, 2.5, yaw), d60 = await run(1 / 60, 2.5, yaw), d144 = await run(1 / 144, 2.5, yaw);
    console.log(`distance in 2.5 s at 15/30/60/144 fps: ${d15.toFixed(3)} / ${d30.toFixed(3)} / ${d60.toFixed(3)} / ${d144.toFixed(3)} m`);
    for (const d of [d15, d30, d144]) expect(Math.abs(d - d60) / d60).toBeLessThan(0.03);
  });

  test('chunks stream in ahead of the player and old ones are released', async ({ page }) => {
    const issues = watch(page);
    await start(page);
    // Follow the longest mapped major road for well over a kilometre at running speed.
    const ov = overview();
    let bestRoad: number[] = [], bestLen = 0;
    for (const r of ov.roads) {
      if (r.t > 4) continue;
      let len = 0;
      for (let i = 2; i < r.p.length; i += 2) len += Math.hypot(r.p[i] - r.p[i - 2], r.p[i + 1] - r.p[i - 1]) / 10;
      const inside = r.p.every((v: number, i: number) => (i % 2 ? v / 10 > ov.bounds.minZ + 300 && v / 10 < ov.bounds.maxZ - 300 : v / 10 > ov.bounds.minX + 300 && v / 10 < ov.bounds.maxX - 300));
      if (inside && len > bestLen) { bestLen = len; bestRoad = r.p; }
    }
    const pts: [number, number][] = [];
    for (let i = 0; i < bestRoad.length; i += 2) pts.push([bestRoad[i] / 10, bestRoad[i + 1] / 10]);
    expect(bestLen).toBeGreaterThan(700);
    await teleport(page, pts[0][0], pts[0][1]);
    await waitChunks(page);
    const before = await page.evaluate(() => ({ ...(window as any).__k3d.world.chunks.stats, loaded: (window as any).__k3d.world.chunks.loadedCount }));
    const r = await walk(page, pts, { run: true, speedup: 2, maxSeconds: 300, tolerance: 2.5 });
    const after = await page.evaluate(() => ({ ...(window as any).__k3d.world.chunks.stats, loaded: (window as any).__k3d.world.chunks.loadedCount, geo: (window as any).__k3d.renderer.info.memory.geometries }));
    console.log(`road length ${bestLen.toFixed(0)} m, reached=${r.reached}, fetched ${before.fetched}->${after.fetched}, disposed ${after.disposed}, loaded ${after.loaded}, max build ${after.maxBuildMs.toFixed(1)} ms`);
    expect(r.sawLoading, 'player ran into an unloaded chunk').toBe(false);
    expect(r.sawEdge).toBe(false);
    expect(r.reached).toBe(true);
    expect(after.fetched).toBeGreaterThan(before.fetched);
    expect(after.disposed).toBeGreaterThan(0);
    expect(after.loaded).toBeLessThan(90);
    expect(issues.errors).toEqual([]);
  });
});
