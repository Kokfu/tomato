// N1-M5 hero place 3 (node --test): India Street and the Jalan Gambier frontage. The tables read the m5 flag when
// they are asked, so the test switches it with setM5.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHUNK_SIZE, QUANT } from '../../src/world/config.ts';
import { ROAD_STYLE, ROAD_TYPES } from '../../src/world/types.ts';
import type { ChunkData } from '../../src/world/types.ts';
import { setM5 } from '../../src/world/district/m5.ts';
import * as india from '../../src/world/district/indiaStreet.ts';
import { unitStyle } from '../../src/world/arch/Shophouse.ts';
import { ringArea2 } from '../../src/world/arch/frontage.ts';

const chunk = (key: string): ChunkData => JSON.parse(readFileSync(new URL(`../../public/data/kuching/chunks/${key}.json`, import.meta.url), 'utf8'));
const places = (key: string) => JSON.parse(readFileSync(new URL(`../../public/data/kuching/places/${key}.json`, import.meta.url), 'utf8')).places as { x: number; z: number; name: string; cat?: string; b?: number; e?: number; sign?: boolean }[];
const world = (d: ChunkData, r: number[]) => r.map((v, i) => (i % 2 ? d.cz : d.cx) * CHUNK_SIZE + v / QUANT);
const inRing = (x: number, z: number, r: number[]) => { let c = false; for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) if (r[i + 1] > z !== r[j + 1] > z && x < ((r[j] - r[i]) * (z - r[i + 1])) / (r[j + 1] - r[i + 1]) + r[i]) c = !c; return c; };

test('flag off: the chunk data, the lot styles and the lists are untouched', () => {
  setM5(false);
  const d = chunk(india.INDIA_KEY), before = JSON.stringify(d);
  india.patchHeroData(d);
  assert.equal(JSON.stringify(d), before);
  assert.equal(india.heroLotStyle(india.GAMBIER_BLOCK, 16, 3), null);
  assert.deepEqual(india.heroObstacles(d), []);
  assert.deepEqual(india.indiaFronts(d), []);
  setM5(null);
});

test('the frontage lines are the mapped block edges', () => {
  const d = chunk(india.INDIA_KEY);
  const verts = d.buildings.flatMap((b) => { const w = world(d, b.r[0]); return w.map((_, i) => (i % 2 ? null : [w[i], w[i + 1]])).filter(Boolean) as number[][]; });
  for (const p of [...india.INDIA_NORTH, ...india.INDIA_SOUTH]) assert.ok(verts.some((v) => Math.hypot(v[0] - p[0], v[1] - p[1]) < 0.06), `no mapped vertex at ${p}`);
});

test('patch: the north block becomes seven stepped two-storey pieces and every block fronts India Street', () => {
  setM5(true);
  const d = chunk(india.INDIA_KEY), n = d.buildings.length, block = d.buildings.find((b) => b.id === india.NORTH_BLOCK)!, area = Math.abs(ringArea2(block.r[0]));
  india.patchHeroData(d);
  india.patchHeroData(d); // idempotent
  assert.equal(d.buildings.length, n + 7);
  const ids = new Set(d.buildings.map((b) => b.id));
  assert.equal(ids.size, d.buildings.length, 'building ids stay unique');
  let sum = 0;
  for (let k = 1; k <= 7; k++) {
    const s = d.buildings.find((b) => b.id === india.sliceId(k))!;
    assert.deepEqual(s.a, { c: 1, f: [0], lv: 2 });
    assert.equal(s.h, 820);
    assert.equal(india.heroFront(s.id, 0), 'india');
    assert.ok(Math.sign(ringArea2(s.r[0])) === Math.sign(ringArea2(block.r[0])), 'same winding as the block');
    sum += Math.abs(ringArea2(s.r[0]));
  }
  const rest = d.buildings.find((b) => b.id === india.NORTH_BLOCK)!;
  assert.equal(rest.a, undefined);
  // pieces plus the remainder cover the mapped block (to 3 %: the pieces overlap a little at the bend)
  assert.ok(Math.abs(sum + Math.abs(ringArea2(rest.r[0])) - area) < area * 0.03);
  const fronts = india.indiaFronts(d);
  assert.equal(fronts.length, 11);
  const lots = fronts.reduce((a, f) => a + f.lots, 0);
  assert.ok(lots >= 70 && lots <= 80, `lots ${lots}`);
  // the frontage edges really face the paved strip: their middle lies within 0.1 m of one of the two frontage lines
  const near = (x: number, z: number, line: [number, number][]) => Math.min(...line.slice(1).map((q, i) => { const p = line[i], vx = q[0] - p[0], vz = q[1] - p[1], t = Math.max(0, Math.min(1, ((x - p[0]) * vx + (z - p[1]) * vz) / (vx * vx + vz * vz))); return Math.hypot(p[0] + vx * t - x, p[1] + vz * t - z); }));
  for (const f of fronts.filter((q) => q.b.id !== india.GAMBIER_BLOCK)) {
    const j = (f.edge + 1) % (f.ring.length / 2), mx = (f.ring[f.edge * 2] + f.ring[j * 2]) / 2, mz = (f.ring[f.edge * 2 + 1] + f.ring[j * 2 + 1]) / 2;
    assert.ok(Math.min(near(mx, mz, india.INDIA_NORTH), near(mx, mz, india.INDIA_SOUTH)) < 0.1, `edge ${f.b.id}:${f.edge}`);
  }
  setM5(null);
});

test('street frame: 10 to 15 m between the frontages, columns on the middle line, stalls clear of them', () => {
  const sp = india.indiaSpine();
  assert.ok(sp.length > 55);
  for (const n of sp) { assert.ok(n.w > 9.8 && n.w < 14.8, `width ${n.w} at ${n.s}`); assert.ok(Math.abs(Math.hypot(n.nx, n.nz) - 1) < 1e-9); }
  const posts = india.indiaPosts(), stalls = india.indiaStalls();
  assert.ok(posts.length >= 12 && stalls.length >= 28);
  for (const p of posts) {
    const n = sp.reduce((m, q) => (Math.abs(q.s - p.s) < Math.abs(m.s - p.s) ? q : m));
    const d = (p.x - n.x) * n.nx + (p.z - n.z) * n.nz;
    assert.ok(Math.abs(d - n.w / 2) < 0.2, 'column on the middle line');
    for (const s of stalls) assert.ok(Math.hypot(s.x - p.x, s.z - p.z) > 2.4, 'a walker passes between a column and a stall');
  }
  // every stall stands inside the paved strip, and none across the mouth of Lorong Kai Joo
  const strip = [...india.INDIA_NORTH, ...[...india.INDIA_SOUTH].reverse()].flat();
  for (const s of stalls) { assert.ok(inRing(s.x, s.z, strip)); assert.ok(Math.hypot(s.x + 130.6, s.z + 124.5) > 4.5); }
});

test('lot styles: bright paint on India Street; Jalan Gambier keeps its paint and gains blinds', () => {
  setM5(true);
  const paints = new Set<number>();
  for (let u = 0; u < 20; u++) { const st = unitStyle(235772967, 3, u); paints.add(st.wall); assert.equal(st.blind, -1); }
  assert.ok(paints.size >= 5, 'several colours along one row');
  let blinds = 0;
  for (let u = 0; u < 27; u++) if (unitStyle(india.GAMBIER_BLOCK, 16, u).blind >= 0) blinds++;
  assert.ok(blinds >= 8 && blinds <= 18, `blinds ${blinds}`);
  setM5(false);
  const off = unitStyle(india.GAMBIER_BLOCK, 16, 4);
  setM5(true);
  assert.equal(unitStyle(india.GAMBIER_BLOCK, 16, 4).wall, off.wall);
  setM5(null);
});

test('Jalan Gambier: parked cars stand at the kerb of their own street, clear of every other carriageway and building', () => {
  setM5(true);
  const d = chunk(india.INDIA_KEY);
  india.patchHeroData(d);
  const parked = india.gambierParked(d);
  assert.ok(parked.filter((p) => p.kind === 'car').length >= 25, `cars ${parked.length}`);
  const roads = d.roads.filter((r) => ROAD_STYLE[ROAD_TYPES[r.t]].group >= 2).map((r) => ({ id: r.id, hw: r.w / QUANT / 2, p: world(d, r.p) }));
  const dist = (x: number, z: number, p: number[]) => { let m = Infinity; for (let i = 2; i < p.length; i += 2) { const vx = p[i] - p[i - 2], vz = p[i + 1] - p[i - 1], t = Math.max(0, Math.min(1, ((x - p[i - 2]) * vx + (z - p[i - 1]) * vz) / (vx * vx + vz * vz || 1))); m = Math.min(m, Math.hypot(p[i - 2] + vx * t - x, p[i - 1] + vz * t - z)); } return m; };
  const gambier = roads.find((r) => r.id === india.GAMBIER_WAY)!, lane = roads.find((r) => r.id === india.CARPARK_LANE)!;
  for (const c of parked) {
    const dg = dist(c.x, c.z, gambier.p), dl = dist(c.x, c.z, lane.p);
    if (dg < gambier.hw) {
      // at the kerb: the middle 1.5 m either side of the mapped centre line (the drive line) stays free
      assert.ok(dg > 1.5 + 0.9, `car on the drive line of Jalan Gambier at ${c.x}, ${c.z}`);
    } else {
      assert.ok(dl > lane.hw + 0.4, `car on the car-park lane at ${c.x}, ${c.z}`);
      assert.ok(dg > gambier.hw + 2.6 + 0.8, `car-park car on the Gambier footpath at ${c.x}, ${c.z}`);
    }
    for (const b of d.buildings) assert.ok(!inRing(c.x, c.z, world(d, b.r[0])), 'car inside a building');
    for (const o of parked) if (o !== c) assert.ok(Math.hypot(o.x - c.x, o.z - c.z) > 2.2, 'two vehicles overlap');
  }
  assert.equal(india.heroObstacles(d).length, india.indiaPosts().length + india.indiaStalls().length + parked.length);
  setM5(null);
});

test('boards: only mapped businesses get one, on the nearest lot of the street frontage', () => {
  setM5(true);
  const d = chunk(india.INDIA_KEY);
  india.patchHeroData(d);
  const ids = new Set(india.indiaFronts(d).map((f) => f.b.id));
  let boards = 0;
  for (const p of places(india.INDIA_KEY)) {
    const s = india.indiaSign(d, p);
    if (!s) continue;
    boards++;
    assert.ok(ids.has(s.b) && s.t >= 0 && s.t <= 1);
    assert.ok(!['artwork', 'attraction', 'hotel'].includes(p.cat ?? ''));
  }
  assert.ok(boards >= 8 && boards <= 30, `boards ${boards}`);
  setM5(null);
});
