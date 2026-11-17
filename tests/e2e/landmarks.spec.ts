import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { watch, start, state, walk, teleport, waitChunks, DATA } from './helpers.ts';

// Registered landmark models (Hiang Thian Siang Ti Temple, Lau Ya Keng Food Court, Yang Choon Tai
// opera stage, Harmony Arch): lazy loading, distance LOD, collision, navigation and independence from
// the graphics preset. Positions come from the generated landmark-sites.json, never from constants.
//
// Two renderers draw these sites. In the default V7 world (render mode 'c') the Carpenter Street section
// draws its own photo-reconstructed models of the temple, the food court and the stage (models/v5/*.glb,
// src/v5/V5Scene.ts) and the registry (src/world/landmarks/LandmarkModels.ts) stands down for exactly those
// three sites; it streams every other site (the Harmony Arch). In V4 mode the registry draws all four.
// The tests below run in the default V7 world and require every site to be drawn exactly once, by one of
// the two, on its derived anchor.

interface Site { id: string; anchor: { x: number; z: number; yaw: number }; centre: { x: number; z: number }; lods: { triangles: number }[] }
const sites = JSON.parse(readFileSync(`${DATA}/landmark-sites.json`, 'utf8')).sites as Site[];
const site = (id: string) => sites.find((s) => s.id === id)!;
const TEMPLE = site('hiang-thian-siang-ti-temple'), FOOD = site('lau-ya-keng-food-court'), STAGE = site('yang-choon-tai-opera-stage');
/** Sites the V7 Carpenter Street section draws itself (src/v5/geo.ts V5_LANDMARK_IDS). */
const SECTION_IDS = [TEMPLE.id, FOOD.id, STAGE.id];
/** Full-detail triangle count of the section's own model of each of those sites (the shipped GLB, models/v5/manifest.json). */
const v5Manifest = JSON.parse(readFileSync('public/models/v5/manifest.json', 'utf8'));
const SECTION_TRIANGLES: Record<string, number> = { [TEMPLE.id]: v5Manifest['temple.lod0.glb'].triangles, [FOOD.id]: v5Manifest['foodcourt.lod0.glb'].triangles, [STAGE.id]: v5Manifest['stage.lod0.glb'].triangles };
/** Model-local (x = right, z = toward the street) -> world. */
const at = (s: Site, lx: number, lz: number): [number, number] => {
  const nx = Math.sin(s.anchor.yaw), nz = Math.cos(s.anchor.yaw);
  return [s.anchor.x + nz * lx + nx * lz, s.anchor.z - nx * lx + nz * lz];
};
const ARCH = site('carpenter-street-harmony-arch');
const STREET = at(TEMPLE, 0, 4.5); // on Carpenter Street between the temple and the food court

const info = (page: Page) => page.evaluate(() => (window as any).__k3d.world.landmarkModels.info() as { id: string; lod: number; want: number; triangles: number }[]);
interface Drawn { id: string; by: 'registry' | 'section'; x: number; z: number; ry: number; s: number; triangles: number }
/** Every landmark object in the scene, from either renderer, with its position and triangle count. */
const drawn = (page: Page) => page.evaluate(() => {
  const k = (window as any).__k3d, out: any[] = [];
  const add = (o: any, by: string) => {
    let triangles = 0;
    o.traverse((m: any) => { if (m.isMesh) triangles += (m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3; });
    out.push({ id: o.userData.landmark, by, x: o.position.x, z: o.position.z, ry: o.rotation.y, s: o.scale.x, triangles });
  };
  for (const o of k.world.landmarkModels.group.children) add(o, 'registry');
  const sec = k.v5?.scene?.group;
  if (sec?.parent) for (const o of sec.children) if (o.userData.landmark) add(o, 'section');
  return out as Drawn[];
});
/**
 * Wait until the scene is settled: the section is built (not mid mode switch), the registry shows the given LOD
 * (-1 = unloaded) for every site it is responsible for, and the section shows each of its own sites. The LOD is
 * chosen in the frame loop, so this also waits for it to react to a teleport.
 */
const settled = (page: Page, lod: number) => page.waitForFunction(({ lod, own }) => {
  const k = (window as any).__k3d, m = k.world.landmarkModels;
  if (!k.v5 || k.v5.busy || k.v5.mode !== 'c' || !m.settled || m.stats.errors !== 0) return false;
  const sec = k.v5.scene.group, mine = new Set(sec.parent ? sec.children.map((o: any) => o.userData.landmark).filter(Boolean) : []);
  return m.info().every((i: any) => (own.includes(i.id) ? i.lod === -1 && mine.has(i.id) : i.lod === lod));
}, { lod, own: SECTION_IDS }, { timeout: 60_000 });
const guard = (page: Page) => page.evaluate(() => (window as any).__k3d.landmarkGuard.length as number);
/** Each site drawn exactly once in the scene, on its anchor, unscaled; `full` = at full detail (the shipped LOD 0 triangle count). */
async function expectOneEach(page: Page, full = false): Promise<Drawn[]> {
  const d = await drawn(page);
  expect(d.map((o) => o.id).sort()).toEqual(sites.map((s) => s.id).sort());
  for (const o of d) {
    const s = site(o.id);
    expect(o.by, o.id).toBe(SECTION_IDS.includes(o.id) ? 'section' : 'registry');
    expect(Math.hypot(o.x - s.anchor.x, o.z - s.anchor.z), `${o.id} anchor`).toBeLessThan(0.01);
    expect(o.ry, `${o.id} yaw`).toBeCloseTo(s.anchor.yaw, 4);
    expect(o.s).toBe(1);
    // (a registry object also carries its name plaques, a few triangles on top of the model)
    if (full && o.by === 'section') expect(o.triangles, `${o.id} triangles`).toBe(SECTION_TRIANGLES[o.id]);
    else if (full) expect(o.triangles, `${o.id} triangles`).toBeGreaterThanOrEqual(s.lods[0].triangles);
    else expect(o.triangles, `${o.id} triangles`).toBeGreaterThan(0);
  }
  return d;
}

test.describe('landmark models', () => {
  test('load only near the landmark, switch LOD with distance and are released far away', async ({ page }) => {
    const issues = watch(page);
    const glb: string[] = [];
    page.on('request', (r) => { if (r.url().includes('/models/landmarks/')) glb.push(r.url().split('/models/landmarks/')[1]); });
    await start(page);
    await waitChunks(page);
    await settled(page, 1);
    // Default V7 world: the registry stands down for exactly the three sites the section draws itself.
    expect((await page.evaluate(() => [...(window as any).__k3d.world.landmarkModels.hidden] as string[])).sort()).toEqual([...SECTION_IDS].sort());
    // At the waterfront spawn the registry's sites are beyond the full-detail range: distant models only.
    expect(glb.filter((u) => u.endsWith('lod0.glb'))).toEqual([]);
    for (const i of await info(page)) if (!SECTION_IDS.includes(i.id)) expect(i.lod, `${i.id} at spawn`).toBe(1);
    // Every landmark is in the scene once, on its derived site, from either renderer.
    await expectOneEach(page);

    await teleport(page, STREET[0], STREET[1]);
    await waitChunks(page);
    await settled(page, 0);
    const near = await info(page);
    for (const s of sites) {
      const i = near.find((n) => n.id === s.id)!;
      if (SECTION_IDS.includes(s.id)) { expect(i.lod, `${s.id} not duplicated by the registry`).toBe(-1); continue; }
      expect(i.lod, `${s.id} near`).toBe(0);
      expect(i.triangles).toBe(s.lods[0].triangles);
      expect(i.triangles).toBeGreaterThan(2000);
    }
    // Only the registry's own sites fetched a full model: no hidden duplicate was loaded.
    expect(glb.filter((u) => u.endsWith('lod0.glb')).sort()).toEqual(sites.filter((s) => !SECTION_IDS.includes(s.id)).map((s) => `${s.id}/lod0.glb`).sort());
    // One full-detail object per landmark in the scene, positioned on its derived site.
    await expectOneEach(page, true);
    expect(await guard(page)).toBe(0);

    // Far away: the registry drops everything and releases its GPU resources.
    const before = await page.evaluate(() => (window as any).__k3d.renderer.info.memory.geometries as number);
    await teleport(page, TEMPLE.anchor.x + 2400, TEMPLE.anchor.z + 300);
    await waitChunks(page);
    await settled(page, -1);
    for (const i of await info(page)) expect(i.lod, `${i.id} far`).toBe(-1);
    expect(await page.evaluate(() => (window as any).__k3d.world.landmarkModels.group.children.length)).toBe(0);
    expect(await page.evaluate(() => (window as any).__k3d.world.landmarkModels.stats.disposed)).toBeGreaterThanOrEqual(sites.filter((s) => !SECTION_IDS.includes(s.id)).length * 2);
    expect(before).toBeGreaterThan(0);
    expect(issues.errors).toEqual([]);
  });

  test('switching render modes hands the temple-area sites between the renderers, never two copies', async ({ page }) => {
    const issues = watch(page);
    await start(page);
    await teleport(page, STREET[0], STREET[1]);
    await waitChunks(page);
    await settled(page, 0);
    await expectOneEach(page, true);
    // V4 (key 1): the section is removed and the registry draws all four sites at full detail.
    await page.evaluate(() => (window as any).__k3d.v5.setMode('v4'));
    await page.waitForFunction(() => {
      const k = (window as any).__k3d, m = k.world.landmarkModels;
      return k.v5.mode === 'v4' && !k.v5.busy && m.settled && m.stats.errors === 0 && m.info().every((i: any) => i.lod === 0);
    }, null, { timeout: 60_000 });
    const v4 = await drawn(page);
    expect(v4.map((o) => o.id).sort()).toEqual(sites.map((s) => s.id).sort());
    for (const o of v4) expect(o.by, o.id).toBe('registry');
    for (const i of await info(page)) expect(i.triangles, i.id).toBe(site(i.id).lods[0].triangles);
    // Back to the default V7 world: the section takes the three sites over again, the registry drops its copies.
    await page.evaluate(() => (window as any).__k3d.v5.setMode('c'));
    await settled(page, 0);
    await expectOneEach(page, true);
    expect(await guard(page)).toBe(0);
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
      for (const i of await info(page)) if (!SECTION_IDS.includes(i.id)) { expect(i.lod, `${i.id} at ${q}`).toBe(0); expect(i.triangles).toBe(site(i.id).lods[0].triangles); }
      // The section's own models stay too, whatever the preset.
      await expectOneEach(page, true);
      // No generic building mesh was generated for a landmark site at this preset either.
      expect(await guard(page)).toBe(0);
    }
    expect(issues.errors).toEqual([]);
  });
});
