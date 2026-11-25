// N1-M5 hero place 6 (node --test): the Kuching City Mosque, its cemetery and the floating mosque.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHUNK_SIZE, QUANT } from '../../src/world/config.ts';
import type { ChunkData } from '../../src/world/types.ts';
import { AREA_KINDS } from '../../src/world/types.ts';
import { setM5 } from '../../src/world/district/m5.ts';
import { GRAVE_AXIS, GRAVE_KEYS, mosqueGraves } from '../../src/world/district/mosqueGraves.ts';
import { CITY_MOSQUE, CITY_MOSQUE_BUILDING, apseOf } from '../../src/world/landmarks/cityMosque.ts';
import { FLOATING_FORM, FLOATING_MOSQUE_BUILDING } from '../../src/world/landmarks/floatingMosque.ts';

const chunk = (key: string): ChunkData => JSON.parse(readFileSync(new URL(`../../public/data/kuching/chunks/${key}.json`, import.meta.url), 'utf8'));
const world = (d: ChunkData, r: number[]) => r.map((v, i) => (i % 2 ? d.cz : d.cx) * CHUNK_SIZE + v / QUANT);
const inRing = (x: number, z: number, r: number[]) => { let c = false; for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) if (r[i + 1] > z !== r[j + 1] > z && x < ((r[j] - r[i]) * (z - r[i + 1])) / (r[j + 1] - r[i + 1]) + r[i]) c = !c; return c; };
const dist = (x: number, z: number, p: number[]) => { let m = Infinity; for (let i = 2; i < p.length; i += 2) { const vx = p[i] - p[i - 2], vz = p[i + 1] - p[i - 1], t = Math.max(0, Math.min(1, ((x - p[i - 2]) * vx + (z - p[i - 1]) * vz) / (vx * vx + vz * vz || 1))); m = Math.min(m, Math.hypot(p[i - 2] + vx * t - x, p[i - 1] + vz * t - z)); } return m; };

test('flag off: no graves', () => {
  setM5(false);
  for (const k of GRAVE_KEYS) assert.deepEqual(mosqueGraves(chunk(k)), []);
  setM5(null);
});

test('graves: inside a mapped cemetery, off every road and path, clear of buildings, lying across the direction of Mecca', () => {
  setM5(true);
  // Mecca lies 292.5 degrees from Kuching: a grave's long axis is square to it
  const q = (292.5 * Math.PI) / 180, qx = Math.sin(q), qz = -Math.cos(q);
  assert.ok(Math.abs(Math.hypot(...GRAVE_AXIS) - 1) < 1e-3);
  assert.ok(Math.abs(GRAVE_AXIS[0] * qx + GRAVE_AXIS[1] * qz) < 0.02);
  let n = 0;
  for (const k of GRAVE_KEYS) {
    const d = chunk(k), cem = d.areas.filter((a) => AREA_KINDS[a.k] === 'cemetery').map((a) => world(d, a.r[0]));
    const roads = d.roads.map((r) => ({ hw: r.w / QUANT / 2, p: world(d, r.p) })), rings = d.buildings.map((b) => world(d, b.r[0]));
    const seen = new Set<string>();
    for (const g of mosqueGraves(d)) {
      n++;
      assert.ok(cem.some((r) => inRing(g.x, g.z, r)), 'a grave lies outside the cemetery');
      for (const r of roads) assert.ok(dist(g.x, g.z, r.p) >= r.hw + 1.6 - 1e-6, 'a grave lies on a road or path');
      for (const r of rings) assert.equal(inRing(g.x, g.z, r), false);
      const cell = `${Math.round(g.x)}:${Math.round(g.z)}`;
      assert.ok(!seen.has(cell), 'two graves on one spot');
      seen.add(cell);
    }
  }
  assert.ok(n > 200 && n < 420, `${n} graves`);
  setM5(null);
});

test('City Mosque: the mapped outline has the round projection the entrance is built on; verified counts are pinned', () => {
  const d = chunk('-2_-1'), b = d.buildings.find((q) => q.id === CITY_MOSQUE_BUILDING)!;
  assert.equal(d.names[b.n!], 'Masjid Bandaraya Kuching');
  const a = apseOf(world(d, b.r[0]))!;
  assert.ok(a && a.idx.length >= 6, 'no round projection found');
  assert.ok(a.r > 5.5 && a.r < 9, `radius ${a.r}`);
  // it is the south end of the outline (towards the car park of the front photograph)
  let zMax = -Infinity;
  for (let i = 1; i < b.r[0].length; i += 2) zMax = Math.max(zMax, d.cz * CHUNK_SIZE + b.r[0][i] / QUANT);
  assert.ok(a.b + a.r > zMax - 1.5);
  assert.equal(apseOf([0, 0, 30, 0, 30, 20, 0, 20]), null);
  assert.equal(CITY_MOSQUE.minarets, 4);
  assert.equal(CITY_MOSQUE.smallDomes, 4);
  assert.ok(CITY_MOSQUE.minaretTop > CITY_MOSQUE.wall + 10 && CITY_MOSQUE.domeR > 5);
});

test('floating mosque: one minaret, taller than the dome; the building is mapped in chunk -1_-2', () => {
  assert.equal(FLOATING_FORM.minarets, 1);
  assert.ok(FLOATING_FORM.minaretTop > FLOATING_FORM.drum + 12 && FLOATING_FORM.arcade < FLOATING_FORM.upper && FLOATING_FORM.upper < FLOATING_FORM.drum);
  const d = chunk('-1_-2'), b = d.buildings.find((q) => q.id === FLOATING_MOSQUE_BUILDING)!;
  assert.equal(d.names[b.n!], 'Masjid India Bandar Kuching');
});
