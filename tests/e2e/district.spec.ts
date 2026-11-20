import { test, expect } from '@playwright/test';
import { watch, start, state, walk, teleport, waitChunks } from './helpers.ts';

// Main Bazaar test district: continuous walkability and collisions against the street dressing.
// Coordinates are world metres taken from the mapped block outlines (see district/mainBazaar.ts).

/** Points along a frontage edge, `depth` metres behind the street face, skipping `pad` at both ends. */
function arcade(a: [number, number], b: [number, number], depth: number, pad = 3, step = 6): [number, number][] {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ex = (b[0] - a[0]) / len, ez = (b[1] - a[1]) / len;
  // The blocks lie south-west of the street: inward is (-ez, ex) for these west-to-east edges.
  const out: [number, number][] = [];
  for (let s = pad; s <= len - pad; s += step) out.push([a[0] + ex * s - ez * depth, a[1] + ez * s + ex * depth]);
  return out;
}

const MB_NORTH: [number, number][] = [[125.2, -143], [216.6, -79.1], [223.5, -74.3], [256, -51.6], [292.8, -25.8], [333.6, -0.4], [360.4, 12.8], [385, 22.4], [404.4, 32.4]];

test.describe('Main Bazaar district', () => {
  test('the character walks the whole street without leaving the ground or entering a building', async ({ page }) => {
    const issues = watch(page);
    await start(page);
    await teleport(page, MB_NORTH[0][0], MB_NORTH[0][1]);
    await waitChunks(page);
    const r = await walk(page, MB_NORTH.slice(1), { run: true, speedup: 4, maxSeconds: 200 });
    expect(r.reached).toBe(true);
    expect(r.everInBuilding).toBe(false);
    expect(r.everInWaterOffDeck).toBe(false);
    const s = await state(page);
    expect(s.grounded).toBe(true);
    expect(Math.abs(s.y - s.ground)).toBeLessThan(0.05);
    expect(issues.errors).toEqual([]);
  });

  test('the covered five-foot ways of two blocks are walkable end to end between piers and goods', async ({ page }) => {
    await start(page);
    for (const [a, b] of [[[123.5, -127.3], [210.3, -68.9]], [[215.4, -62.7], [284.6, -15.2]]] as [[number, number], [number, number]][]) {
      const pts = arcade(a, b, 1.0);
      await teleport(page, pts[0][0], pts[0][1]);
      await waitChunks(page);
      const r = await walk(page, pts.slice(1), { speedup: 4, tolerance: 1.6, maxSeconds: 240 });
      expect(r.reached, `arcade from ${a} to ${b}`).toBe(true);
      expect(r.everInBuilding).toBe(false);
      const s = await state(page);
      expect(Math.abs(s.y - s.ground)).toBeLessThan(0.05);
    }
  });

  test('parked cars, piers and shopfronts block the character', async ({ page }) => {
    await start(page);
    await teleport(page, 180, -105);
    await waitChunks(page);
    const blocked = await page.evaluate(() => {
      const k = (window as any).__k3d, c = k.world.collision;
      // Sample the strip between the carriageway and the shopfront line of block A for solid cells.
      const a = [123.5, -127.3], b = [210.3, -68.9];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ex = (b[0] - a[0]) / len, ez = (b[1] - a[1]) / len;
      let pier = 0, car = 0, shop = 0;
      for (let s = 2; s < len - 2; s += 0.25) {
        const at = (d: number) => c.insideBuilding(a[0] + ex * s - ez * d, a[1] + ez * s + ex * d, k.world.height.sample(a[0], a[1]) + 0.5);
        if (at(0.23)) pier++;
        if (at(-2.6)) car++;
        if (at(2.6)) shop++;
      }
      return { pier, car, shop, samples: Math.floor((len - 4) / 0.25) };
    });
    expect(blocked.pier).toBeGreaterThan(20); // 23 piers, 0.46 m wide, sampled every 0.25 m
    expect(blocked.car).toBeGreaterThan(20);
    expect(blocked.shop).toBeGreaterThan(blocked.samples * 0.95); // behind the shopfront line is solid
    // Walking straight at a pier does not pass through it.
    const start0: [number, number] = [123.5 + 0.83 * 9.5 + 0.558 * 3, -127.3 + 0.558 * 9.5 - 0.83 * 3];
    await teleport(page, start0[0], start0[1]);
    const r = await walk(page, [[start0[0] - 0.558 * 8, start0[1] + 0.83 * 8]], { speedup: 2, maxSeconds: 12, tolerance: 0.5 });
    expect(r.everInBuilding).toBe(false);
  });

  test('pinned verified businesses carry a sign; unverified pinned businesses stay on their lot without one', async ({ page }) => {
    await start(page);
    await teleport(page, 166.6, -109.8);
    await waitChunks(page);
    const pins = await page.evaluate(() => {
      const k = (window as any).__k3d;
      const out: { name: string; no: number; evidence: string; sign: unknown; src: string; v: number; onLot: boolean }[] = [];
      for (const key of ['0_-1', '1_0']) for (const p of k.world.places.inChunk(key)) if (p.pin) out.push({ name: p.name, no: p.pin.no, evidence: p.pin.evidence, sign: p.sign, src: p.src, v: p.v, onLot: p.b !== undefined && p.e !== undefined && p.t !== undefined });
      return out;
    });
    expect(pins.length).toBeGreaterThanOrEqual(10);
    // Owner rule, by trust value: verified (v >= 1: OSM or owner) pins carry a sign, unverified (v === 0) pins do not.
    expect(pins.filter((p) => p.v >= 1).every((p) => p.sign === true)).toBe(true);
    const unverified = pins.filter((p) => p.v === 0);
    expect(unverified.length).toBeGreaterThanOrEqual(7);
    expect(unverified.every((p) => p.sign === false)).toBe(true);
    // Unverified pins are still listed (inspectable) and anchored to their numbered lot.
    expect(unverified.every((p) => p.onLot)).toBe(true);
    expect(pins.filter((p) => p.src === 'osm').length).toBeGreaterThanOrEqual(4);
    // No. 42 is signed from the verified OSM record, not from its Overture duplicate.
    const no42 = pins.filter((p) => p.no === 42);
    expect(no42.length).toBe(1);
    expect(no42[0]).toMatchObject({ src: 'osm', v: 1, sign: true, name: 'JD Massage Centre' });
    expect(pins.find((p) => p.name === 'Little Borneo')?.no).toBe(12);
  });
});
