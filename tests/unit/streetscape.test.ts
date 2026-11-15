// Shophouse frontage geometry, deterministic styling and place association (node --test).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { insetEdges, ringArea2, edgeOutward, hash3, unitsAlong, pointInRingFlat, ARCADE_DEPTH } from '../../src/world/arch/frontage.ts';
import { associate, normName, ADJACENT_MAX } from '../../src/world/places/associate.ts';
import { googleMapsUrl, isSignCategory } from '../../src/world/places/types.ts';
import type { ChunkData } from '../../src/world/types.ts';
import type { PlaceChunk } from '../../src/world/places/types.ts';

// 20 x 10 m rectangle, both windings.
const CW = [0, 0, 20, 0, 20, 10, 0, 10];
const CCW = [0, 0, 0, 10, 20, 10, 20, 0];

test('insetEdges moves only the frontage edge, for either winding', () => {
  const a = insetEdges(CW, [0], 2); // edge 0: (0,0)-(20,0)
  assert.deepEqual(a.map((v) => +v.toFixed(6)), [0, 2, 20, 2, 20, 10, 0, 10]);
  const b = insetEdges(CCW, [3], 2); // edge 3: (20,0)-(0,0)
  assert.deepEqual(b.map((v) => +v.toFixed(6)), [0, 2, 0, 10, 20, 10, 20, 2]);
  assert.ok(Math.abs(ringArea2(a)) < Math.abs(ringArea2(CW)));
});

test('insetEdges mitres a corner between two frontage edges and keeps vertex count', () => {
  const r = insetEdges(CW, [0, 1], 2);
  assert.equal(r.length, CW.length);
  assert.deepEqual(r.map((v) => +v.toFixed(6)), [0, 2, 18, 2, 18, 10, 0, 10]);
});

test('edgeOutward points away from the polygon', () => {
  for (const ring of [CW, CCW]) {
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      const [nx, nz] = edgeOutward(ring, i);
      const mx = (ring[i * 2] + ring[j * 2]) / 2, mz = (ring[i * 2 + 1] + ring[j * 2 + 1]) / 2;
      assert.equal(pointInRingFlat(mx + nx * 0.5, mz + nz * 0.5, ring), false);
      assert.equal(pointInRingFlat(mx - nx * 0.5, mz - nz * 0.5, ring), true);
    }
  }
});

test('procedural styling is deterministic and lot widths stay in the shophouse range', () => {
  assert.equal(hash3(233690737, 2, 5), hash3(233690737, 2, 5));
  assert.notEqual(hash3(233690737, 2, 5), hash3(233690737, 2, 6));
  for (const len of [6, 17, 52.3, 105]) {
    const u = unitsAlong(len);
    assert.ok(Math.abs(u.n * u.w - len) < 1e-9);
    assert.ok(u.w > 3.4 && u.w < 7.9, `lot width ${u.w} for frontage ${len}`);
  }
});

test('associate: inside, unambiguous adjacent, ambiguous and far points', () => {
  const A = { id: 1, ring: [0, 0, 10, 0, 10, 10, 0, 10] };
  const B = { id: 2, ring: [13, 0, 23, 0, 23, 10, 13, 10] };
  assert.equal(associate(5, 5, [A, B])?.b, 1);
  assert.equal(associate(5, 5, [A, B])?.how, 'inside');
  // 1 m in front of A, 14+ m from B.
  const adj = associate(5, -1, [A, B]);
  assert.deepEqual([adj?.b, adj?.how, adj?.e], [1, 'adjacent', 0]);
  assert.ok(Math.abs((adj?.t ?? 0) - 0.5) < 1e-3);
  // In the 3 m gap between the two buildings: equally close to both, so no association.
  assert.equal(associate(11.5, 5, [A, B]), null);
  assert.equal(associate(5, -(ADJACENT_MAX + 1), [A, B]), null);
  // Frontage restriction and veto.
  assert.equal(associate(5, 5, [{ ...A, front: [2] }])?.e, 2);
  assert.equal(associate(5, 1, [A], () => false)?.e, undefined);
});

test('normName folds case, punctuation and filler words', () => {
  assert.equal(normName("Winnie's Cafe"), normName('WINNIES café'));
  assert.notEqual(normName('Little Borneo'), normName('Borneo Delight'));
});

test('sign categories and the Google Maps link', () => {
  assert.equal(isSignCategory('shop', 'jewelry'), true);
  assert.equal(isSignCategory('amenity', 'cafe'), true);
  assert.equal(isSignCategory('tourism', 'artwork'), false);
  assert.equal(isSignCategory('amenity', 'toilets'), false);
  const url = googleMapsUrl({ name: 'Little Borneo', lat: 1.5593, lon: 110.346 });
  assert.match(url, /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=Little%20Borneo%20Kuching/);
});

// ---- generated data ---------------------------------------------------------------------------------
const DIR = 'public/data/kuching';
const chunk = (k: string) => JSON.parse(readFileSync(`${DIR}/chunks/${k}.json`, 'utf8')) as ChunkData;

test('heritage rows: frontage edges are valid, arcade inset stays inside the outline', () => {
  let rows = 0;
  for (const f of readdirSync(`${DIR}/chunks`)) {
    const d = JSON.parse(readFileSync(`${DIR}/chunks/${f}`, 'utf8')) as ChunkData;
    for (const b of d.buildings) {
      if (!b.a) continue;
      rows++;
      assert.equal(b.s ?? 0, 0, 'only human-mapped outlines are classified');
      if (b.n !== undefined) assert.doesNotMatch(d.names[b.n], /court|tower|museum|temple|mosque|hotel|office/i, 'institutions are never reclassified');
      const ring = b.r[0].map((v) => v / 100), n = ring.length / 2;
      assert.ok(b.a.f.length > 0 && b.a.f.every((e) => Number.isInteger(e) && e >= 0 && e < n));
      const inner = insetEdges(ring, b.a.f, ARCADE_DEPTH);
      assert.equal(inner.length, ring.length);
      assert.ok(Math.abs(ringArea2(inner)) > Math.abs(ringArea2(ring)) * 0.3, `building ${b.id}: arcade inset collapsed the outline`);
      assert.ok(ringArea2(inner) > 0 === ringArea2(ring) > 0);
    }
  }
  assert.ok(rows >= 50, `expected the old town to contain shophouse rows, found ${rows}`);
});

test('places: ids are unique, signs only on verified places with a valid wall edge', { skip: !existsSync(`${DIR}/places/index.json`) }, () => {
  const idx = JSON.parse(readFileSync(`${DIR}/places/index.json`, 'utf8'));
  const ids = new Set<string>();
  let signs = 0;
  for (const key of idx.chunks as string[]) {
    const d = chunk(key);
    for (const p of (JSON.parse(readFileSync(`${DIR}/places/${key}.json`, 'utf8')) as PlaceChunk).places) {
      assert.ok(!ids.has(p.id), `duplicate place id ${p.id}`);
      ids.add(p.id);
      assert.ok(p.name && Number.isFinite(p.lat) && Number.isFinite(p.lon));
      assert.ok(['osm', 'overture', 'manual'].includes(p.src));
      if (p.src === 'overture') assert.ok(!p.sign, 'unverified Overture places never get a sign');
      if (!p.sign) continue;
      signs++;
      assert.ok(p.v >= 1 && p.b !== undefined && p.e !== undefined);
      const b = d.buildings.find((q) => q.id === p.b);
      assert.ok(b, `sign of ${p.id} refers to a building in its chunk`);
      assert.ok(p.e! < b!.r[0].length / 2);
      if (b!.a) assert.ok(b!.a.f.includes(p.e!), 'signs on shophouse rows sit on a street frontage');
    }
  }
  assert.equal(signs, idx.stats.signs);
});
