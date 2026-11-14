// Conflation rules for machine-detected Overture footprints (node --test). Synthetic geometry only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { conflate, overtureId, simplifyClosedRing, ringCentroid, OVERTURE_ID_BASE, ML_SIMPLIFY_TOL } from '../../tools/generate-world/overture.ts';
import type { OvertureFeature } from '../../tools/generate-world/overture.ts';
import type { Pt } from '../../tools/generate-world/osm.ts';

const rect = (x: number, z: number, w: number, d: number): Pt[] => [[x, z], [x + w, z], [x + w, z + d], [x, z + d]];
let n = 0;
const feat = (ring: Pt[], src: 1 | 2 = 1): OvertureFeature => {
  const uuid = `${(++n).toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`;
  return { uuid, id: overtureId(uuid), src, poly: [ring] };
};
const bb = (r: Pt[]) => [Math.min(...r.map((p) => p[0])), Math.min(...r.map((p) => p[1])), Math.max(...r.map((p) => p[0])), Math.max(...r.map((p) => p[1]))];
const dry = () => false;

test('overture ids are safe integers above every OSM id and never negative', () => {
  for (const u of ['00000000-0000-4000-8000-000000000000', 'ffffffff-ffff-4fff-bfff-ffffffffffff', 'c5fa7fc9-23fc-495d-9061-a0ad11cbceb8']) {
    const id = overtureId(u);
    assert.ok(Number.isSafeInteger(id));
    assert.ok(id >= OVERTURE_ID_BASE && id < OVERTURE_ID_BASE + 2 ** 48);
  }
  assert.equal(overtureId('c5fa7fc9-23fc-495d-9061-a0ad11cbceb8'), OVERTURE_ID_BASE + 0xc5fa7fc923fc);
});

test('simplification keeps a subset of vertices within the tolerance', () => {
  const ring: Pt[] = [[0, 0], [5, 0.1], [10, 0], [10, 5], [10.2, 8], [10, 10], [0, 10], [-2, 5]];
  const out = simplifyClosedRing(ring, ML_SIMPLIFY_TOL);
  for (const p of out) assert.ok(ring.includes(p));
  assert.deepEqual(out, [[0, 0], [10, 0], [10, 10], [0, 10], [-2, 5]]);
  assert.deepEqual(simplifyClosedRing(rect(0, 0, 4, 4), ML_SIMPLIFY_TOL), rect(0, 0, 4, 4));
  assert.deepEqual(ringCentroid(rect(2, 4, 6, 2)), [5, 5]);
});

test('conflation keeps free footprints and drops duplicates, road, water and tiny ones', () => {
  const osm = [rect(100, 100, 10, 10)].map((r) => ({ poly: [r], bb: bb(r) }));
  const roads = [
    { pts: [[0, 50], [200, 50]] as Pt[], half: 4 }, // carriageway along z = 50, 8 m wide
    { pts: [[0, 150], [200, 150]] as Pt[], half: 0 }, // foot path along z = 150
  ];
  const cases: [string, OvertureFeature, string | null][] = [
    ['free', feat(rect(0, 0, 10, 8)), null],
    ['centroid inside OSM', feat(rect(102, 102, 12, 12)), 'duplicateOfOsm'],
    ['OSM centroid inside ML', feat(rect(90, 90, 30, 30)), 'duplicateOfOsm'],
    ['20 % shared with OSM', feat(rect(108, 100, 10, 10)), 'duplicateOfOsm'],
    ['5 % shared with OSM is kept', feat(rect(109.5, 111 - 10, 10, 10).map(([x, z]) => [x, z + 9] as Pt)), null],
    ['road centre line through it', feat(rect(20, 45, 10, 10)), 'crossedByMappedWay'],
    ['foot path through it', feat(rect(20, 146, 10, 10)), 'crossedByMappedWay'],
    ['mostly on carriageway, beside the centre line', feat(rect(60, 50.5, 4, 4)), 'onRoad'],
    ['corner on the road edge is kept', feat(rect(80, 53, 10, 10)), null],
    ['in water', feat(rect(300, 300, 10, 10)), 'inWater'],
    ['tiny', feat(rect(0, 200, 3, 3)), 'tooSmall'],
    ['ML duplicate (Google over kept Microsoft)', feat(rect(1, 1, 10, 8), 2), 'duplicateOfMl'],
  ];
  const wet = (x: number, z: number) => x > 290 && z > 290;
  for (const [name, f, reason] of cases) {
    // The Microsoft "free" footprint is always present so the ML-duplicate case has a partner.
    const res = conflate([cases[0][1], f], osm, roads, wet);
    const kept = res.kept.some((k) => k.id === f.id);
    assert.equal(kept, reason === null, name);
    if (reason) assert.equal((res.dropped as Record<string, number>)[reason], 1, name);
  }
  assert.equal(conflate([cases[0][1]], osm, roads, dry).kept[0].area, 80);
});
