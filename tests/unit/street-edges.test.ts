// N1-M4: kerbs, footpaths, drains, lane lines and stop lines (src/world/StreetEdges.ts), and the street items the
// streetscape pass writes into the chunk files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { GeoBuf } from '../../src/world/Materials.ts';
import { streetEdges, laneMarkings, stopLine, KERB_H, EDGE_REACH } from '../../src/world/StreetEdges.ts';
import type { Sample, Offsets } from '../../src/world/StreetEdges.ts';
import { FURN, BOARDS, ROAD_TYPES } from '../../src/world/types.ts';
import type { RoadData, RoadType, ChunkData } from '../../src/world/types.ts';

// A straight road running east, far from the hand-built streets (chunk origin 5000, 5000).
const pts: Sample[] = [0, 6, 12, 18, 24, 30, 36, 42, 48].map((x) => ({ x, z: 100, y: 0.06 }));
// Same convention as RoadBuilder.offsets: "l" is the +Z side for a road running +X.
const offsets = (d: number): Offsets => pts.map((p) => ({ lx: p.x, lz: p.z + d, rx: p.x, rz: p.z - d }));
const road = (type: RoadType, w: number, f = 0): RoadData => ({ t: ROAD_TYPES.indexOf(type), w: w * 100, p: [0, 10000, 4800, 10000], f, id: 77 });
const ctx = (quality: 'low' | 'medium', inside = false) => ({
  quality: { name: quality }, height: { sample: () => 0 },
  collision: { inWater: () => false, insideBuilding: () => inside },
}) as never;
const edges = (type: RoadType, w: number, opt: { f?: number; quality?: 'low' | 'medium'; blocked?: (x: number, z: number, oneWay?: number) => boolean; inside?: boolean } = {}) => {
  const out = { floor: new GeoBuf(), paving: new GeoBuf(), solid: new GeoBuf() };
  streetEdges(road(type, w, opt.f), type, pts, w / 2, 5000, 5000, ctx(opt.quality ?? 'medium', opt.inside), out, offsets, opt.blocked ?? (() => false));
  return out;
};
const lateral = (b: GeoBuf) => { let m = 0; for (let i = 0; i < b.pos.length; i += 3) m = Math.max(m, Math.abs(b.pos[i + 2] - 100)); return m; };
const top = (b: GeoBuf) => { let m = 0; for (let i = 1; i < b.pos.length; i += 3) m = Math.max(m, b.pos[i]); return m; };
const tris = (b: GeoBuf) => b.idx.length / 3;

test('a main road gets a kerb, a paved footpath and a drain on both sides, inside the painted concrete strip', () => {
  const e = edges('primary', 9);
  assert.ok(tris(e.paving) > 0 && tris(e.floor) > 0 && tris(e.solid) > 0);
  for (const b of [e.paving, e.floor, e.solid]) {
    assert.ok(lateral(b) <= 4.5 + EDGE_REACH.primary! + 1e-6, `reach ${lateral(b)}`);
    assert.ok(top(b) <= KERB_H + 0.011, `height ${top(b)}`); // low enough to walk and drive over: nothing joins collision
  }
  // both sides
  assert.ok(e.paving.pos.some((v, i) => i % 3 === 2 && v > 100) && e.paving.pos.some((v, i) => i % 3 === 2 && v < 100));
});

test('a residential street has the drain at the road edge and no raised footpath', () => {
  const e = edges('residential', 6);
  assert.equal(tris(e.paving), 0);
  assert.ok(tris(e.floor) > 0);
  assert.ok(lateral(e.solid) <= 3 + EDGE_REACH.residential! + 1e-6);
  assert.ok(top(e.solid) <= 0.08);
});

test('nothing is laid across another carriageway, and a building at the road edge narrows the layout away', () => {
  const blocked = edges('primary', 9, { blocked: () => true });
  assert.equal(tris(blocked.paving) + tris(blocked.floor) + tris(blocked.solid), 0);
  const built = edges('primary', 9, { inside: true });
  assert.equal(tris(built.paving) + tris(built.floor) + tris(built.solid), 0);
});

test('one half of a dual road gets a median kerb on its right and the footpath on its left only', () => {
  const e = edges('trunk', 8, { f: 8, blocked: (_x, _z, oneWay) => !!oneWay });
  // "l" (+Z) is the right of travel for a road running +X: median there, so no paving on that side
  assert.ok(!e.paving.pos.some((v, i) => i % 3 === 2 && v > 100));
  assert.ok(e.paving.pos.some((v, i) => i % 3 === 2 && v < 100));
  const single = edges('trunk', 8, { f: 8 });
  assert.ok(single.paving.pos.some((v, i) => i % 3 === 2 && v > 100), 'a lone one-way street keeps both footpaths');
});

test('the Low preset keeps kerb, footpath and drain but drops service-road kerbs and uses fewer triangles', () => {
  const med = edges('primary', 9), low = edges('primary', 9, { quality: 'low' });
  assert.ok(tris(low.paving) > 0 && tris(low.floor) > 0);
  assert.ok(tris(low.solid) < tris(med.solid));
  assert.ok(tris(edges('service', 4).solid) > 0);
  assert.equal(tris(edges('service', 4, { quality: 'low' }).solid), 0);
});

test('lane lines follow road class and width', () => {
  const edgeY = pts.map((): [number, number] => [0.06, 0.06]);
  const marks = (type: RoadType, w: number, f = 0, low = false) => { const m = new GeoBuf(); laneMarkings(road(type, w, f), type, pts, w / 2, m, offsets, edgeY, low); return m; };
  assert.equal(tris(marks('residential', 6)), 0);
  const centre = marks('tertiary', 7); // dashed centre line only
  assert.ok(tris(centre) > 0 && lateral(centre) < 0.1);
  const primary = marks('primary', 9); // + two solid edge lines
  assert.ok(lateral(primary) > 4 && lateral(primary) < 4.5);
  assert.ok(tris(marks('primary', 9, 0, true)) < tris(primary), 'no edge lines on Low');
  const oneWay = marks('primary', 7, 8, true); // two lanes: one divider on the centre line
  assert.ok(tris(oneWay) > 0 && lateral(oneWay) < 0.1);
  const wide = marks('trunk', 14, 0, true); // double solid centre and a divider each way
  assert.ok(lateral(wide) > 3.4 && lateral(wide) < 3.6);
});

test('a stop line covers the approach half only (traffic keeps left) and none faces traffic leaving a one-way', () => {
  const m = new GeoBuf();
  stopLine(road('residential', 6), pts, 3, 1, 4, m); // arriving at the last sample, travelling +X: left is -Z
  assert.equal(tris(m), 2);
  for (let i = 0; i < m.pos.length; i += 3) {
    assert.ok(m.pos[i + 2] <= 100 - 0.09 && m.pos[i + 2] >= 100 - 3, `z ${m.pos[i + 2]}`);
    assert.ok(m.pos[i] <= 48 - 5 && m.pos[i] >= 48 - 5.5, `x ${m.pos[i]}`);
  }
  const leaving = new GeoBuf();
  stopLine(road('residential', 6, 8), pts, 3, 0, 4, leaving);
  assert.equal(tris(leaving), 0);
  const full = new GeoBuf();
  stopLine(road('residential', 6, 8), pts, 3, 1, 4, full);
  assert.ok(full.pos.some((v, i) => i % 3 === 2 && v > 100) && full.pos.some((v, i) => i % 3 === 2 && v < 100));
});

test('chunk files carry the mapped crossings and bus stops, box junctions and only known sign boards', () => {
  const dir = 'public/data/kuching/chunks';
  const count: Record<number, number> = {};
  for (const f of readdirSync(dir)) {
    const d = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as ChunkData;
    const furn = d.furn ?? [];
    assert.equal(furn.length % 5, 0);
    for (let i = 0; i < furn.length; i += 5) {
      count[furn[i]] = (count[furn[i]] ?? 0) + 1;
      assert.ok(furn[i + 1] >= 0 && furn[i + 1] <= 25600 && furn[i + 2] >= 0 && furn[i + 2] <= 25600, `${f}: item outside its chunk`);
      if (furn[i] === FURN.board) assert.ok(furn[i + 4] >= 0 && furn[i + 4] < BOARDS.length);
      if (furn[i] === FURN.zebra) assert.ok(furn[i + 4] >= 300 && furn[i + 4] <= 2500, 'zebra width in cm');
    }
  }
  assert.ok(count[FURN.zebra] >= 15 && count[FURN.zebra] <= 21, `zebras ${count[FURN.zebra]}`); // 21 mapped nodes
  assert.ok(count[FURN.busStop] >= 25 && count[FURN.busStop] <= 36, `bus stops ${count[FURN.busStop]}`); // 36 mapped nodes
  assert.ok(count[FURN.box] >= 30 && count[FURN.box] <= 113, `boxes ${count[FURN.box]}`); // at most one per mapped signal
  assert.ok(count[FURN.lamp] > 8000 && count[FURN.board] > 1000);
});
