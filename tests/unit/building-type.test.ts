// Typed building generator (N1-M3): the classifier, the massing and the footprint fit (node --test). Synthetic evidence only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyBuildingType, footprint, massing, typedBuildings, hashId, BUILDING_TYPES } from '../../src/world/arch/buildingType.ts';
import type { TypeEvidence } from '../../src/world/arch/buildingType.ts';
import { ROW, ROWS, rowV, PLAIN_UV } from '../../src/world/arch/CityAtlas.ts';
import type { ChunkData } from '../../src/world/types.ts';

/** A machine-detected footprint with nothing known about it, away from everything. */
const ev = (o: Partial<TypeEvidence>): TypeEvidence => ({
  kind: 'generic', arch: 'unknown', ml: true, area: 120, long: 12, short: 10, rect: 1, height: 6.5, heightKnown: false,
  kampung: false, waterDist: Infinity, majorDist: Infinity, roadDist: 12, ...o,
});
const type = (o: Partial<TypeEvidence>) => classifyBuildingType(ev(o)).type;

test('footprint: fitted rectangle of a rotated rectangle and of an L', () => {
  const c = Math.cos(0.5), s = Math.sin(0.5);
  const rot = (pts: number[][]) => pts.flatMap(([x, z]) => [x * c - z * s + 40, x * s + z * c - 7]);
  const r = footprint(rot([[0, 0], [20, 0], [20, 8], [0, 8]]));
  assert.ok(Math.abs(r.long - 20) < 1e-6 && Math.abs(r.short - 8) < 1e-6 && Math.abs(r.area - 160) < 1e-6);
  assert.ok(Math.abs(r.rect - 1) < 1e-6);
  assert.ok(Math.abs(Math.abs(r.ax * c + r.az * s) - 1) < 1e-6, 'long axis follows the long side');
  assert.ok(Math.abs(r.cx - (10 * c - 4 * s + 40)) < 1e-6 && Math.abs(r.cz - (10 * s + 4 * c - 7)) < 1e-6);
  const l = footprint([0, 0, 20, 0, 20, 8, 8, 8, 8, 20, 0, 20]);
  assert.ok(Math.abs(l.rect - 256 / 400) < 1e-6, 'an L fills less of its rectangle');
});

test('tags on the structure win over size and surroundings', () => {
  assert.equal(type({ kind: 'roof', ml: false }), 'open_roof');
  assert.equal(type({ kind: 'religious', arch: 'mosque', ml: false, area: 2000 }), 'worship');
  assert.equal(type({ kind: 'civic', arch: 'government', ml: false, area: 900, height: 9 }), 'colonial');
  assert.equal(type({ kind: 'civic', arch: 'civic', ml: false, area: 900, landuse: 'school' }), 'school');
  assert.equal(type({ kind: 'civic', arch: 'civic', ml: false, area: 900, height: 28, heightKnown: true }), 'midrise');
  assert.equal(type({ kind: 'generic', ml: false, area: 600, name: 'SMK Green Road' }), 'school');
  assert.equal(type({ kind: 'industrial', arch: 'industrial', ml: false, area: 90 }), 'warehouse');
  assert.equal(type({ kind: 'hut', arch: 'utility', ml: false, area: 300 }), 'shed');
  assert.equal(type({ kind: 'tower', arch: 'commercial', ml: false, area: 800, height: 20 }), 'midrise');
  assert.equal(type({ kind: 'commercial', arch: 'commercial', ml: false, area: 9000 }), 'mall');
  assert.equal(type({ kind: 'commercial', arch: 'commercial', ml: false, area: 2400, name: 'Plaza Example' }), 'mall');
  assert.equal(type({ kind: 'commercial', arch: 'commercial', ml: false, area: 2400 }), 'shophouse');
  assert.equal(type({ kind: 'commercial', arch: 'commercial', ml: false, area: 700, height: 30, heightKnown: true }), 'midrise');
  assert.equal(type({ kind: 'shophouse', arch: 'shophouse', ml: false, area: 150 }), 'shophouse');
});

test('houses: kampung only with village evidence, terrace only for long rows', () => {
  assert.equal(type({ kind: 'house', arch: 'residential', ml: false, area: 110 }), 'house');
  assert.equal(type({ kind: 'house', arch: 'residential', ml: false, area: 110, kampung: true }), 'kampung');
  assert.equal(type({ kind: 'house', arch: 'residential', ml: false, area: 110, kampung: true, majorDist: 15 }), 'house', 'a main-road frontage is not a kampung');
  assert.equal(type({ kind: 'house', arch: 'residential', ml: false, area: 480, long: 60, short: 8 }), 'terrace');
  assert.equal(type({ kind: 'house', arch: 'residential', ml: false, area: 700, height: 15 }), 'midrise', 'apartments');
});

test('untagged footprints: size, shape, land use and roads decide', () => {
  assert.equal(type({ area: 18 }), 'shed');
  assert.equal(type({ area: 120 }), 'house');
  assert.equal(type({ area: 120, waterDist: 40 }), 'kampung', 'small house on the river bank');
  assert.equal(type({ area: 120, kampung: true }), 'kampung');
  assert.equal(type({ area: 300, long: 20, short: 15 }), 'house');
  assert.equal(type({ area: 480, long: 60, short: 8 }), 'terrace');
  assert.equal(type({ area: 480, long: 60, short: 8, majorDist: 14 }), 'shophouse', 'a row on a main road is a shop row');
  assert.equal(type({ area: 300, long: 20, short: 15, landuse: 'commercial' }), 'shophouse');
  assert.equal(type({ area: 900, long: 32, short: 28, roadDist: 12 }), 'shophouse');
  assert.equal(type({ area: 900, long: 32, short: 28, roadDist: 80 }), 'warehouse');
  assert.equal(type({ area: 300, long: 20, short: 15, landuse: 'school' }), 'school');
  assert.equal(type({ area: 300, long: 20, short: 15, landuse: 'industrial' }), 'warehouse');
  assert.equal(type({ area: 2000, long: 50, short: 40, majorDist: 20 }), 'midrise');
  assert.equal(type({ area: 4000, long: 80, short: 50, majorDist: 20 }), 'mall');
  assert.equal(type({ area: 2000, long: 50, short: 40, majorDist: 200 }), 'warehouse');
  assert.equal(type({ area: 9000, long: 100, short: 90, majorDist: 60 }), 'mall');
  assert.equal(type({ area: 9000, long: 100, short: 90, majorDist: 400 }), 'warehouse');
  assert.equal(type({ area: 400, height: 40, heightKnown: true }), 'midrise', 'a mapped height is believed');
});

test('a tenant never changes the building: the classifier has no shop or amenity input', () => {
  // TypeEvidence carries the footprint's own name only; the same evidence always gives the same type.
  const a = classifyBuildingType(ev({ area: 300, long: 20, short: 15 })), b = classifyBuildingType(ev({ area: 300, long: 20, short: 15 }));
  assert.deepEqual(a, b);
  assert.ok(a.rule.length > 0);
});

test('massing: mapped heights are kept, defaults become plausible and varied', () => {
  assert.equal(massing('shophouse', 123, 300, 17.5, true).height, 17.5);
  assert.equal(massing('colonial', 5, 900, 9, false).height, 9, 'civic buildings keep the data height');
  const storeys = new Set<number>(), stilts = new Set<number>();
  for (let id = 1; id < 400; id++) {
    const h = hashId(id);
    const s = massing('shophouse', h, 300, 8, false);
    storeys.add(s.storeys);
    assert.ok(s.storeys >= 2 && s.storeys <= 4 && Math.abs(s.height - (3.9 + (s.storeys - 1) * 3.3)) < 1e-9);
    const k = massing('kampung', h, 80, 6.5, false);
    stilts.add(k.stilt);
    assert.ok(k.stilt >= 1.5 && k.stilt <= 2.5 && k.storeys === 1 && Math.abs(k.height - k.stilt - 2.7) < 1e-9);
    const m = massing('midrise', h, 900, 10, false);
    assert.ok(m.storeys >= 5 && m.storeys <= 10 && m.height > 16 && m.height < 40);
    assert.ok(massing('house', h, 60, 6.5, false).storeys === 1, 'a very small house is single-storey');
    assert.ok(massing('mall', h, 9000, 12, false).height >= 16);
  }
  assert.deepEqual([...storeys].sort(), [2, 3, 4]);
  assert.ok(stilts.size >= 4);
});

test('atlas rows: every row has its own band, the blank spot is inside the plain row', () => {
  const ids = Object.values(ROW);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(Math.max(...ids) < ROWS);
  for (const r of ids) {
    const [foot, head] = rowV(r);
    assert.ok(head > r / ROWS && foot < (r + 1) / ROWS && foot > head);
  }
  assert.ok(PLAIN_UV[1] > rowV(ROW.plain)[1] && PLAIN_UV[1] < rowV(ROW.plain)[0]);
});

test('real data: every building of the old-town and of a suburb chunk gets a type; machine footprints are no longer one class', () => {
  const seen = new Set<string>();
  for (const key of ['0_0', '-7_4', '12_-1']) {
    const data = JSON.parse(readFileSync(new URL(`../../public/data/kuching/chunks/${key}.json`, import.meta.url), 'utf8')) as ChunkData;
    const typed = typedBuildings(data);
    assert.equal(typedBuildings(data), typed, 'cached per chunk');
    for (const b of data.buildings) {
      const t = typed.get(b.id)!;
      assert.ok(t && BUILDING_TYPES.includes(t.type), `building ${b.id}`);
      assert.ok(t.height > 2 && t.height < 200 && t.storeys >= 1);
      if (b.hs !== 2) assert.equal(t.height, b.h / 100, 'mapped heights are kept');
      if (b.s) seen.add(t.type);
    }
  }
  assert.ok(seen.has('kampung') && seen.has('house') && seen.has('terrace') && seen.size >= 5, [...seen].join(','));
});
