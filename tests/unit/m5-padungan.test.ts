// N1-M5 hero place 5 (node --test): Jalan Padungan, the Cat Column, the Great Cat and the paifang. The tables read the
// m5 flag when they are asked, so the tests switch it with setM5.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHUNK_SIZE, QUANT } from '../../src/world/config.ts';
import type { ChunkData } from '../../src/world/types.ts';
import { AREA_KINDS, ROAD_STYLE, ROAD_TYPES } from '../../src/world/types.ts';
import { setM5 } from '../../src/world/district/m5.ts';
import * as pd from '../../src/world/district/padungan.ts';

const chunk = (key: string): ChunkData => JSON.parse(readFileSync(new URL(`../../public/data/kuching/chunks/${key}.json`, import.meta.url), 'utf8'));
const world = (d: ChunkData, r: number[]) => r.map((v, i) => (i % 2 ? d.cz : d.cx) * CHUNK_SIZE + v / QUANT);
const inRing = (x: number, z: number, r: number[]) => { let c = false; for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) if (r[i + 1] > z !== r[j + 1] > z && x < ((r[j] - r[i]) * (z - r[i + 1])) / (r[j + 1] - r[i + 1]) + r[i]) c = !c; return c; };
const dist = (x: number, z: number, p: number[]) => { let m = Infinity; for (let i = 2; i < p.length; i += 2) { const vx = p[i] - p[i - 2], vz = p[i + 1] - p[i - 1], t = Math.max(0, Math.min(1, ((x - p[i - 2]) * vx + (z - p[i - 1]) * vz) / (vx * vx + vz * vz || 1))); m = Math.min(m, Math.hypot(p[i - 2] + vx * t - x, p[i - 1] + vz * t - z)); } return m; };
const lanes = (d: ChunkData) => d.roads.filter((r) => ROAD_STYLE[ROAD_TYPES[r.t]].group >= 2).map((r) => ({ hw: r.w / QUANT / 2, p: world(d, r.p) }));

test('flag off: no fronts, no gate, no obstacles, no keep-out, the mapped outline stays a wall', () => {
  setM5(false);
  const d = chunk('6_2');
  assert.equal(pd.paifang(d), null);
  assert.equal(pd.paifangSign(d), null);
  assert.deepEqual(pd.padunganObstacles(d), []);
  assert.deepEqual(pd.padunganFronts(chunk('4_1')), []);
  assert.equal(pd.padunganLotStyle(236514181, 3, 0), null);
  assert.equal(pd.isOpenGate(pd.PAIFANG_ID), false);
  assert.equal(pd.statueKeepOut(pd.CAT_COLUMN.x, pd.CAT_COLUMN.z), false);
  setM5(null);
});

test('the frontage table is what the map says: every listed edge is a mapped shophouse frontage within 12 m of Jalan Padungan', () => {
  setM5(true);
  const all = pd.PADUNGAN_KEYS.map(chunk), ways = ['3_0', '6_2', ...pd.PADUNGAN_KEYS].map(chunk).flatMap((d) => d.roads.filter((r) => r.n !== undefined && d.names[r.n] === 'Jalan Padungan').map((r) => world(d, r.p)));
  let rows = 0, lots = 0;
  const seen = new Set<number>();
  for (const d of all) for (const f of pd.padunganFronts(d)) {
    const n = f.ring.length / 2, j = (f.edge + 1) % n, mx = (f.ring[f.edge * 2] + f.ring[j * 2]) / 2, mz = (f.ring[f.edge * 2 + 1] + f.ring[j * 2 + 1]) / 2;
    assert.ok(f.b.a!.f.includes(f.edge));
    assert.ok(Math.min(...ways.map((p) => dist(mx, mz, p))) <= 12, `block ${f.b.id} edge ${f.edge} is not on Jalan Padungan`);
    assert.ok(pd.padunganFront(f.b.id, f.edge));
    if (!seen.has(f.b.id)) { seen.add(f.b.id); rows++; }
    lots += f.lots;
  }
  assert.equal(rows, Object.keys(pd.PADUNGAN_FRONTS).length);
  assert.equal(rows, 22);
  assert.equal(lots, 197);
  // paint: strong colours, the same answer every time, and about half the lots carry a fascia board
  const s = pd.padunganLotStyle(236514181, 3, 2)!;
  assert.deepEqual(s, pd.padunganLotStyle(236514181, 3, 2));
  assert.equal(s.blind, -1);
  let boards = 0;
  for (let u = 0; u < 200; u++) if (pd.padunganBoard(236525826, 3, u)) boards++;
  assert.ok(boards > 70 && boards < 135, `${boards} boards in 200 lots`);
  setM5(null);
});

test('the Cat Column stands on the mapped node, on the island between the three carriageways', () => {
  setM5(true);
  const marks = JSON.parse(readFileSync(new URL('../../public/data/kuching/landmarks.json', import.meta.url), 'utf8')) as { id: string; x: number; z: number; osm: string }[];
  const lm = marks.find((l) => l.id === 'cat-statue')!;
  assert.equal(lm.osm, 'node/2404396149');
  assert.ok(Math.hypot(lm.x - pd.CAT_COLUMN.x, lm.z - pd.CAT_COLUMN.z) < 0.05);
  const d = chunk(pd.CAT_COLUMN.key);
  // the plinth is clear of every carriageway's edge
  for (const l of lanes(d)) assert.ok(dist(pd.CAT_COLUMN.x, pd.CAT_COLUMN.z, l.p) > l.hw + pd.COLUMN.plinthR + 0.3, 'the plinth reaches a carriageway');
  const obs = pd.padunganObstacles(d);
  assert.ok(obs.some((o) => inRing(pd.CAT_COLUMN.x, pd.CAT_COLUMN.z, o.ring) && o.h === pd.COLUMN.height));
  assert.equal(pd.statueKeepOut(pd.CAT_COLUMN.x + 3, pd.CAT_COLUMN.z), true);
  assert.equal(pd.statueKeepOut(pd.CAT_COLUMN.x + 30, pd.CAT_COLUMN.z), false);
  assert.equal(pd.COLUMN.cats, 4);
  setM5(null);
});

test('the paifang is open: four piers beside the two carriageways that pass under it, and the Great Cat on the island in front', () => {
  setM5(true);
  const d = chunk(pd.PAIFANG_KEY), p = pd.paifang(d)!;
  assert.ok(p, 'the gate is in chunk 6_2');
  assert.equal(p.piers.length, 4);
  assert.ok(p.piers[0] < p.piers[1] && p.piers[1] < p.piers[2] && p.piers[2] < p.piers[3]);
  // bays: two wide ones over the carriageways, a narrower one on the island
  assert.ok(p.piers[1] - p.piers[0] > 7.5 && p.piers[3] - p.piers[2] > 7.5 && p.piers[2] - p.piers[1] > 3);
  // the gate stays on its mapped outline (the piers may stand up to 1.5 m outside its ends)
  assert.ok(p.piers[0] > -1.5 && p.piers[3] < p.len + 1.5, `piers ${p.piers.map((s) => s.toFixed(2))} on a ${p.len.toFixed(1)} m outline`);
  const ls = lanes(d), obs = pd.padunganObstacles(d);
  // no pier, and nothing of the statue, stands on a carriageway
  for (const o of obs) for (let i = 0; i < o.ring.length; i += 2) for (const l of ls) assert.ok(dist(o.ring[i], o.ring[i + 1], l.p) > l.hw + 0.25, 'an obstacle stands on a carriageway');
  assert.equal(obs.length, 5);
  assert.equal(pd.isOpenGate(pd.PAIFANG_ID), true);
  // both carriageways pass between piers
  let under = 0;
  for (const l of ls) for (let i = 2; i < l.p.length; i += 2) for (let t = 0; t <= 1; t += 0.02) {
    const x = l.p[i - 2] + (l.p[i] - l.p[i - 2]) * t, z = l.p[i - 1] + (l.p[i + 1] - l.p[i - 1]) * t;
    const s = (x - p.x) * p.ux + (z - p.z) * p.uz, o = Math.abs((x - p.x) * -p.uz + (z - p.z) * p.ux);
    if (o < 0.3 && ((s > p.piers[0] && s < p.piers[1]) || (s > p.piers[2] && s < p.piers[3]))) under++;
  }
  assert.ok(under >= 2);
  // the Great Cat: on the mapped grass island, in front of the photographed face, clear of the carriageways
  const grass = d.areas.filter((a) => AREA_KINDS[a.k] === 'grass').map((a) => world(d, a.r[0]));
  assert.ok(grass.some((r) => inRing(pd.GREAT_CAT.x, pd.GREAT_CAT.z, r)), 'the Great Cat is not on the grass island');
  for (const l of ls) assert.ok(dist(pd.GREAT_CAT.x, pd.GREAT_CAT.z, l.p) > l.hw + pd.CAT.bed - 0.6);
  const mx = p.x + p.ux * p.len / 2, mz = p.z + p.uz * p.len / 2;
  assert.ok((pd.GREAT_CAT.x - mx) * p.fx + (pd.GREAT_CAT.z - mz) * p.fz > 10, 'the photographed face looks at the cat');
  const s = pd.paifangSign(d)!;
  assert.equal(s.text, 'SELAMAT DATANG');
  assert.ok(s.maxW > 2 && s.up > pd.GATE.clear && s.up < pd.GATE.clear + 0.9);
  setM5(null);
});

test('kapcai stand off the carriageways and in front of a Padungan lot', () => {
  setM5(true);
  let n = 0;
  for (const key of pd.PADUNGAN_KEYS) {
    const d = chunk(key), ls = lanes(d);
    for (const k of pd.padunganBikes(d)) {
      n++;
      for (const l of ls) assert.ok(dist(k.x, k.z, l.p) > l.hw + 1.4);
      assert.ok(Math.abs(Math.hypot(k.tx, k.tz) - 1) < 1e-9);
    }
  }
  assert.ok(n >= 5 && n < 60, `${n} kapcai groups`);
  setM5(null);
});
