import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { watch, start, state, walk, teleport, waitChunks, DATA } from './helpers.ts';

// Registered landmark models (Hiang Thian Siang Ti Temple, Lau Ya Keng Food Court, Yang Choon Tai
// opera stage): lazy loading, distance LOD, collision, navigation and independence from the
// graphics preset. Positions come from the generated landmark-sites.json, never from constants.

interface Site { id: string; anchor: { x: number; z: number; yaw: number }; centre: { x: number; z: number }; lods: { triangles: number }[] }
const sites = JSON.parse(readFileSync(`${DATA}/landmark-sites.json`, 'utf8')).sites as Site[];
const site = (id: string) => sites.find((s) => s.id === id)!;
const TEMPLE = site('hiang-thian-siang-ti-temple'), FOOD = site('lau-ya-keng-food-court'), STAGE = site('yang-choon-tai-opera-stage');
/** Model-local (x = right, z = toward the street) -> world. */
const at = (s: Site, lx: number, lz: number): [number, number] => {
  const nx = Math.sin(s.anchor.yaw), nz = Math.cos(s.anchor.yaw);
  return [s.anchor.x + nz * lx + nx * lz, s.anchor.z - nx * lx + nz * lz];
};
const ARCH = site('carpenter-street-harmony-arch');
const STREET = at(TEMPLE, 0, 4.5); // on Carpenter Street between the temple and the food court

const info = (page: Page) => page.evaluate(() => (window as any).__k3d.world.landmarkModels.info() as { id: string; lod: number; want: number; triangles: number }[]);
/** Wait until every site shows the given LOD (-1 = unloaded). The LOD is chosen in the frame loop, so this also waits for it to react to a teleport. */
const settled = (page: Page, lod: number) => page.waitForFunction((lod) => { const m = (window as any).__k3d.world.landmarkModels; return m.settled && m.stats.errors === 0 && m.info().every((i: any) => i.lod === lod); }, lod, { timeout: 60_000 });
const guard = (page: Page) => page.evaluate(() => (window as any).__k3d.landmarkGuard.length as number);

test.describe('landmark models', () => {
  test('load only near the landmark, switch LOD with distance and are released far away', async ({ page }) => {
    const issues = watch(page);
    const glb: string[] = [];
    page.on('request', (r) => { if (r.url().includes('/models/landmarks/')) glb.push(r.url().split('/models/landmarks/')[1]); });
    await start(page);
    await waitChunks(page);
    await settled(page, 1);
    // At the waterfront spawn the sites are beyond the full-detail range: distant models only.
    expect(glb.filter((u) => u.endsWith('lod0.glb'))).toEqual([]);
    for (const i of await info(page)) expect(i.lod, `${i.id} at spawn`).toBe(1);

    await teleport(page, STREET[0], STREET[1]);
    await waitChunks(page);
    await settled(page, 0);
    const near = await info(page);
    for (const s of sites) {
      const i = near.find((n) => n.id === s.id)!;
      expect(i.lod, `${s.id} near`).toBe(0);
      expect(i.triangles).toBe(s.lods[0].triangles);
      expect(i.triangles).toBeGreaterThan(2000);
    }
    expect(glb.filter((u) => u.endsWith('lod0.glb')).length).toBe(sites.length);
    // One object per landmark in the scene, positioned on its derived site.
    const placed = await page.evaluate(() => (window as any).__k3d.world.landmarkModels.group.children.map((o: any) => ({ id: o.userData.landmark, x: o.position.x, z: o.position.z, ry: o.rotation.y, s: o.scale.x })));
    expect(placed.length).toBe(sites.length);
    for (const p of placed) { const s = site(p.id); expect(Math.hypot(p.x - s.anchor.x, p.z - s.anchor.z)).toBeLessThan(0.01); expect(p.ry).toBeCloseTo(s.anchor.yaw, 4); expect(p.s).toBe(1); }
    expect(await guard(page)).toBe(0);

    // Far away: everything is dropped and its GPU resources are released.
    const before = await page.evaluate(() => (window as any).__k3d.renderer.info.memory.geometries as number);
    await teleport(page, TEMPLE.anchor.x + 2400, TEMPLE.anchor.z + 300);
    await waitChunks(page);
    await settled(page, -1);
    for (const i of await info(page)) expect(i.lod, `${i.id} far`).toBe(-1);
    expect(await page.evaluate(() => (window as any).__k3d.world.landmarkModels.group.children.length)).toBe(0);
    expect(await page.evaluate(() => (window as any).__k3d.world.landmarkModels.stats.disposed)).toBeGreaterThanOrEqual(sites.length * 2);
    expect(before).toBeGreaterThan(0);
    expect(issues.errors).toEqual([]);
  });

  test('the player walks into the forecourt and the food court; halls, stalls and the stage block', async ({ page }) => {
    const issues = watch(page);
    await start(page);
    await teleport(page, STREET[0], STREET[1]);
    await waitChunks(page);
    await settled(page, 0);
    // Temple: up to the doors across the open forecourt, but not through the hall.
    let r = await walk(page, [at(TEMPLE, 1.5, -1.5), at(TEMPLE, 1.6, -5.6)], { maxSeconds: 20 });
    expect(r.reached).toBe(true);
    expect(r.everInBuilding).toBe(false);
    r = await walk(page, [at(TEMPLE, 1.6, -12)], { maxSeconds: 6 });
    expect(r.reached).toBe(false);
    let s = await state(page);
    expect(s.inBuilding).toBe(false);
    // Back across the street and through the open front of the food court, down an aisle to the stage.
    r = await walk(page, [at(TEMPLE, 1.5, -1.5), STREET, at(FOOD, 1.0, 1.5), at(FOOD, 1.0, -3.5), at(FOOD, 1.0, -12.6), at(STAGE, 0, -0.45)], { maxSeconds: 60, tolerance: 0.6 });
    expect(r.reached).toBe(true);
    expect(r.everInBuilding).toBe(false);
    s = await state(page);
    expect(s.grounded).toBe(true);
    // The stage and a stall are solid.
    r = await walk(page, [at(STAGE, 0, -4)], { maxSeconds: 5 });
    expect(r.reached).toBe(false);
    await teleport(page, ...at(FOOD, 1.0, -5.7));
    r = await walk(page, [at(FOOD, -4.3, -5.2)], { maxSeconds: 6, tolerance: 0.5 });
    expect(r.reached).toBe(false);
    expect(await guard(page)).toBe(0);
    expect(issues.errors).toEqual([]);
  });

  test('the street past the landmarks stays walkable and chunks keep streaming', async ({ page }) => {
    const issues = watch(page);
    await start(page);
    const a = at(TEMPLE, 38, 5.2), b = at(TEMPLE, -38, 5.2);
    await teleport(page, a[0], a[1]);
    await waitChunks(page);
    await settled(page, 0);
    const r = await walk(page, [STREET, b], { run: true, speedup: 3, maxSeconds: 90 });
    expect(r.reached).toBe(true);
    expect(r.everInBuilding).toBe(false);
    await waitChunks(page);
    expect(await page.evaluate(() => (window as any).__k3d.world.chunks.loadedCount)).toBeGreaterThan(8);
    expect(issues.errors).toEqual([]);
  });

  test('the Harmony Arch is an open gate: the player walks through it, its columns block', async ({ page }) => {
    const issues = watch(page);
    await start(page);
    await teleport(page, ...at(ARCH, 0, 7));
    await waitChunks(page);
    await page.waitForFunction(() => (window as any).__k3d.world.landmarkModels.info().find((i: any) => i.id === 'carpenter-street-harmony-arch').lod === 0, null, { timeout: 60_000 });
    // In from Jalan Tun Abang Haji Openg, under the centre span, on into Carpenter Street.
    let r = await walk(page, [at(ARCH, 0, 1), at(ARCH, 0, -6), at(ARCH, 0, -14)], { maxSeconds: 30 });
    expect(r.reached).toBe(true);
    expect(r.everInBuilding).toBe(false);
    // A centre column is solid.
    await teleport(page, ...at(ARCH, 3.1, 2.5));
    r = await walk(page, [at(ARCH, 3.1, -2.44)], { maxSeconds: 5, tolerance: 0.4 });
    expect(r.reached).toBe(false);
    expect(await guard(page)).toBe(0);
    expect(issues.errors).toEqual([]);
  });

  test('graphics presets never remove landmark geometry', async ({ page }) => {
    const issues = watch(page);
    await start(page);
    await teleport(page, STREET[0], STREET[1]);
    for (const q of ['low', 'medium', 'high']) {
      await page.evaluate((q) => (document.querySelector(`#quality-seg [data-q="${q}"]`) as HTMLElement).click(), q);
      await waitChunks(page);
      await settled(page, 0);
      for (const i of await info(page)) { expect(i.lod, `${i.id} at ${q}`).toBe(0); expect(i.triangles).toBe(site(i.id).lods[0].triangles); }
      // No generic building mesh was generated for a landmark site at this preset either.
      expect(await guard(page)).toBe(0);
    }
    expect(issues.errors).toEqual([]);
  });
});
