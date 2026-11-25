import { test, expect } from '@playwright/test';
import { watch, start, state, walk, teleport, waitChunks } from './helpers.ts';

// N1-M5 hero place 2 in the default game: the rest of Carpenter Street. Coordinates are world metres from the mapped
// outlines (src/v5/geo.ts).

test.describe('N1-M5 Carpenter Street', () => {
  test('Carpenter Street east of Jalan China: the street, both five-foot ways and the corner block wall', async ({ page }) => {
    const issues = watch(page);
    await start(page);
    await teleport(page, 163, 28.6);
    await waitChunks(page);
    expect(await page.evaluate(() => (window as any).__k3d.v5.mode)).toBe('c');
    // down the middle of the street to Jalan Bishopgate
    const r = await walk(page, [[170.5, 33.1], [181.3, 37.9], [258, 55.6]], { run: true, speedup: 4, maxSeconds: 120 });
    expect(r.reached).toBe(true);
    expect(r.everInBuilding).toBe(false);
    expect((await state(page)).grounded).toBe(true);

    const probe = await page.evaluate(() => {
      const k = (window as any).__k3d, c = k.world.collision, h = (x: number, z: number) => k.world.height.sample(x, z);
      const push = (x: number, z: number) => { const y = h(x, z), q = c.resolve(x, z, 0.28, y + 0.2); return Math.hypot(q[0] - x, q[1] - z); };
      const rise = (x: number, z: number) => c.groundAt(x, z, h(x, z) + 1.2).h - h(x, z);
      // (walls push a walker off their edges: the probes stand where a walker's 0.28 m radius reaches the wall's street edge)
      // north row: frontage (171.8, 31) -> (261.9, 52.6), inward = north; south row: (188.3, 44.1) -> (260.2, 60.1), inward = south
      const N = (s: number, d: number): [number, number] => [171.8 + 0.972 * s + 0.233 * d, 31 + 0.233 * s - 0.972 * d];
      const S = (s: number, d: number): [number, number] => [188.3 + 0.976 * s - 0.217 * d, 44.1 + 0.217 * s + 0.976 * d];
      const out = { floorN: [] as number[], floorS: [] as number[], shopN: [] as number[], shopS: [] as number[], road: [] as number[], flankIn: 0, flankOut: 0, lots: k.v5.scene.stats.lots as number };
      for (const s of [7.5, 22.7, 37.8, 52.9, 68]) { out.floorN.push(rise(...N(s, 1.2))); out.shopN.push(push(...N(s, 2.2))); }
      for (const s of [7.4, 22.1, 36.8, 51.6, 66.3]) { out.floorS.push(rise(...S(s, 1.2))); out.shopS.push(push(...S(s, 2.2))); }
      for (const x of [190, 215, 240]) out.road.push(push(x, 37.9 + (x - 181.3) * 0.2314));
      // side wall of the Jalan China corner lot: origin (158.7, 22.9), east along (0.832, 0.555), out toward the street (-0.555, 0.832)
      out.flankIn = push(158.7 + 0.832 * 8 + 0.555 * 0.15, 22.9 + 0.555 * 8 - 0.832 * 0.15);
      out.flankOut = push(158.7 + 0.832 * 8 - 0.555 * 1.6, 22.9 + 0.555 * 8 + 0.832 * 1.6);
      return out;
    });
    for (const v of [...probe.floorN, ...probe.floorS]) expect(v, 'a five-foot way floor lies above the ground under it').toBeGreaterThan(0.02);
    for (const v of [...probe.floorN, ...probe.floorS]) expect(v).toBeLessThan(0.6);
    for (const v of [...probe.shopN, ...probe.shopS]) expect(v, 'the shopfront line blocks').toBeGreaterThan(0.05);
    for (const v of probe.road) expect(v, 'the carriageway is clear').toBe(0);
    expect(probe.flankIn, 'the corner block side wall blocks a walker').toBeGreaterThan(0.05);
    expect(probe.flankOut, 'the street beside it is clear').toBe(0);
    expect(probe.lots).toBeGreaterThanOrEqual(100);
    expect(issues.errors).toEqual([]);
  });
});
