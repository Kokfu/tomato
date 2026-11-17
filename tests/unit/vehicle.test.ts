// V8 driving prototype: vehicle physics on a stub world, oriented-box collision against the real collision
// code, and validation of the playable road area against the shipped chunk data (node --test).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CAR, CAR_START, NEUTRAL, VehicleBody } from '../../src/vehicle/VehiclePhysics.ts';
import type { Controls, VehicleEnv } from '../../src/vehicle/VehiclePhysics.ts';
import { nearestDrivable, isDrivable, onRoad, SIDE_CLEARANCE, DRIVABLE_CLASSES } from '../../src/vehicle/RoadQuery.ts';
import type { RoadHit } from '../../src/vehicle/RoadQuery.ts';
import { CollisionWorld } from '../../src/world/CollisionWorld.ts';
import { HeightMap } from '../../src/world/HeightMap.ts';
import { ROAD_TYPES } from '../../src/world/types.ts';
import { CHINA } from '../../src/v5/geo.ts';
import type { ChunkData } from '../../src/world/types.ts';

const DATA = 'public/data/kuching';
const CHUNK = 256, Q = 100;
const chunkCache = new Map<string, ChunkData | undefined>();
const dataAt = (cx: number, cz: number): ChunkData | undefined => {
  const k = `${cx}_${cz}`;
  if (!chunkCache.has(k)) { try { chunkCache.set(k, JSON.parse(readFileSync(`${DATA}/chunks/${k}.json`, 'utf8'))); } catch { chunkCache.set(k, undefined); } }
  return chunkCache.get(k);
};

/** An endless straight road along +Z on flat ground, with optional extras. */
const STRAIGHT: RoadHit = { id: 1, name: 'Test Road', type: 'residential', width: 6, dist: 0, x: 0, z: 0, dx: 0, dz: 1, oneWay: false, bridge: false };
function flat(over: Partial<VehicleEnv> = {}): VehicleEnv {
  return {
    ground: () => ({ h: 0, deck: false }),
    loaded: () => true,
    hasData: () => true,
    water: () => false,
    boxContact: () => null,
    road: (x, z) => ({ ...STRAIGHT, x: 0, z, dist: Math.abs(x) }),
    ...over,
  };
}
function run(car: VehicleBody, seconds: number, c: Partial<Controls>, each?: () => void): void {
  for (let i = 0; i < Math.round(seconds * 60); i++) { car.update(1 / 60, { ...NEUTRAL, ...c }); each?.(); }
}

test('accelerates smoothly from rest and tops out at the limit', () => {
  const car = new VehicleBody(flat());
  car.place(0, 0, 0);
  run(car, 1, { throttle: 1 });
  assert.ok(car.vf > 3.5 && car.vf < 6, `after 1 s: ${car.vf}`);
  run(car, 5, { throttle: 1 });
  assert.ok(car.kmh > 50, `after 6 s: ${car.kmh} km/h`);
  run(car, 60, { throttle: 1 });
  assert.ok(car.vf <= CAR.maxSpeed && car.vf > CAR.maxSpeed * 0.8, `top speed ${car.vf}`);
  assert.ok(Math.abs(car.x) < 1e-6 && car.z > 500, 'drove straight along +Z');
});

test('S brakes to a stop, then reverses up to the reverse limit; W brakes a reversing car', () => {
  const car = new VehicleBody(flat());
  car.place(0, 0, 0);
  run(car, 4, { throttle: 1 });
  const v = car.vf, z0 = car.z;
  let stopped = -1, t = 0;
  run(car, 3, { throttle: -1 }, () => { t += 1 / 60; if (stopped < 0 && car.vf <= 0.3) stopped = t; });
  assert.ok(stopped > 0 && stopped < v / CAR.brake + 0.4, `braked from ${v} m/s in ${stopped} s`);
  assert.ok(car.z - z0 < (v * v) / (2 * CAR.brake) + 2, 'stopping distance');
  run(car, 6, { throttle: -1 });
  assert.ok(car.vf < -4 && car.vf >= -CAR.maxReverse, `reverse speed ${car.vf}`);
  const zr = car.z;
  run(car, 0.5, { throttle: -1 });
  assert.ok(car.z < zr, 'moves backward');
  run(car, 1.2, { throttle: 1 });
  assert.ok(car.vf > -0.5, 'W brakes the reversing car');
});

test('coasting slows gently, the handbrake stops the car much sooner', () => {
  const a = new VehicleBody(flat()), b = new VehicleBody(flat());
  for (const c of [a, b]) { c.place(0, 0, 0); run(c, 4, { throttle: 1 }); }
  run(a, 3, {});
  run(b, 3, { handbrake: true });
  assert.ok(a.vf > 8, `coasting keeps rolling: ${a.vf}`);
  assert.ok(b.vf < 1, `handbrake: ${b.vf}`);
  run(a, 60, {});
  assert.equal(a.vf, 0, 'friction brings the car to rest');
});

test('A steers left, D steers right, and steering is eased in and returns to centre', () => {
  const left = new VehicleBody(flat()), right = new VehicleBody(flat());
  for (const c of [left, right]) { c.place(0, 0, 0); run(c, 2, { throttle: 1 }); }
  const probe = new VehicleBody(flat());
  probe.place(0, 0, 0);
  probe.update(1 / 60, { throttle: 0.5, steer: -1, handbrake: false });
  assert.ok(Math.abs(probe.steer) > 0 && Math.abs(probe.steer) < 0.06, 'no instant full lock');
  run(left, 1.5, { throttle: 0.5, steer: -1 });
  run(right, 1.5, { throttle: 0.5, steer: 1 });
  // Facing +Z, the left side is +X.
  assert.ok(left.x > 1 && left.heading > 0.3, `left: x ${left.x}, heading ${left.heading}`);
  assert.ok(right.x < -1 && right.heading < -0.3, `right: x ${right.x}, heading ${right.heading}`);
  assert.ok(Math.abs(left.x + right.x) < 1e-6, 'symmetric');
  run(left, 1, { throttle: 0.5 });
  assert.ok(Math.abs(left.steer) < 1e-9, 'wheels return to centre');
});

test('lateral acceleration stays within tyre grip at speed (no instant spin), and a tight turn is possible when slow', () => {
  const car = new VehicleBody(flat());
  car.place(0, 0, 0);
  run(car, 10, { throttle: 1 });
  let maxLat = 0;
  run(car, 2, { throttle: 1, steer: 1 }, () => { maxLat = Math.max(maxLat, Math.abs(car.vf * car.yawRate)); });
  assert.ok(maxLat <= CAR.lateralGrip * 1.05, `lateral acceleration ${maxLat}`);
  const slow = new VehicleBody(flat({ road: (x, z) => ({ ...STRAIGHT, x, z, dist: 0 }) }));
  slow.place(0, 0, 0);
  run(slow, 12, { throttle: 0.25, steer: -1 });
  // Turning circle of a small car: radius about wheelbase / tan(lock) = 3.6 m.
  assert.ok(Math.abs(slow.heading) > Math.PI, 'completes more than a half turn at low speed');
});

test('the handbrake lets the tail slide in a turn', () => {
  const grip = new VehicleBody(flat()), slide = new VehicleBody(flat());
  for (const c of [grip, slide]) { c.place(0, 0, 0); run(c, 5, { throttle: 1 }); }
  let g = 0, s = 0;
  run(grip, 1, { steer: 1 }, () => (g = Math.max(g, Math.abs(grip.vl))));
  run(slide, 1, { steer: 1, handbrake: true }, () => (s = Math.max(s, Math.abs(slide.vl))));
  assert.ok(s > g * 2 && s > 1, `slip with handbrake ${s} vs ${g}`);
});

test('off the carriageway the car is slowed, back on it full speed returns', () => {
  const car = new VehicleBody(flat({ road: (x, z) => ({ ...STRAIGHT, x: 0, z, dist: Math.abs(x) }) }));
  car.place(40, 0, 0); // 40 m beside the road
  assert.equal(car.onRoad, false);
  run(car, 20, { throttle: 1 });
  assert.ok(car.kmh > 15 && car.kmh < 40, `off-road speed ${car.kmh} km/h`);
  const on = new VehicleBody(flat());
  on.place(0, 0, 0);
  run(on, 20, { throttle: 1 });
  assert.ok(on.kmh > 80, `on-road speed ${on.kmh} km/h`);
});

test('water, unloaded chunks and the map edge stop the car where it is', () => {
  const cases: [Partial<VehicleEnv>, string][] = [
    [{ water: (_x, z) => z > 30 }, 'water'],
    [{ loaded: (_x, z) => z < 30 }, 'loading'],
    [{ loaded: (_x, z) => z < 30, hasData: (_x, z) => z < 30 }, 'edge'],
  ];
  for (const [over, why] of cases) {
    const car = new VehicleBody(flat(over));
    car.place(0, 0, 0);
    let seen = '';
    run(car, 8, { throttle: 1 }, () => { if (car.blocked) seen = car.blocked; assert.ok(car.z + CAR.halfLen <= 30 + 1e-6, `${why}: nose at ${car.z + CAR.halfLen}`); });
    assert.equal(seen, why);
    assert.ok(car.z > 25, `${why}: reached the limit`);
    // Reversing away still works.
    run(car, 2, { throttle: -1 });
    assert.ok(car.z < 26, `${why}: can back away`);
  }
});

test('a deck without a mapped carriageway (footbridge, pier) is refused', () => {
  const car = new VehicleBody(flat({ ground: (_x, z) => (z > 20 ? { h: 0, deck: true } : { h: 0, deck: false }), road: () => null }));
  car.place(0, 0, 0);
  run(car, 6, { throttle: 1 });
  assert.ok(car.z < 21, `stopped before the deck: ${car.z}`);
  const bridge = new VehicleBody(flat({ ground: (_x, z) => (z > 20 ? { h: 0, deck: true } : { h: 0, deck: false }), road: (x, z) => ({ ...STRAIGHT, x: 0, z, dist: Math.abs(x), bridge: z > 15 }) }));
  bridge.place(0, 0, 0);
  run(bridge, 6, { throttle: 1 });
  assert.ok(bridge.z > 40 && bridge.onDeck, 'a road bridge is driven normally');
});

test('ride height, pitch and roll follow the ground under the wheels', () => {
  // 10 % climb along +Z and a 5 % cross fall toward -X.
  const car = new VehicleBody(flat({ ground: (x, z) => ({ h: 0.1 * z + 0.05 * x, deck: false }) }));
  car.place(0, 0, 0);
  assert.ok(Math.abs(car.pitch - Math.atan(0.1)) < 1e-3, `pitch ${car.pitch}`);
  assert.ok(Math.abs(car.roll - Math.atan(0.05)) < 1e-3, `roll ${car.roll}`);
  run(car, 4, { throttle: 1 });
  assert.ok(Math.abs(car.y - (0.1 * car.z + CAR.roadSurface)) < 0.12, `height ${car.y} at z ${car.z}`);
  const level = new VehicleBody(flat());
  level.place(0, 0, 0);
  run(level, 4, { throttle: 1 });
  assert.ok(car.vf < level.vf - 1, 'the climb costs speed');
});

// --- oriented-box collision against the real collision world -------------------------------------------------

function worldWith(buildings: { ring: number[]; h: number }[]): CollisionWorld {
  const meta = { file: '', x0: -512, z0: -512, nx: 65, nz: 65, cell: 16 };
  const w = new CollisionWorld(new HeightMap(meta, new Int16Array(65 * 65)));
  w.addChunk({
    v: 1, cx: 0, cz: 0, terrain: null, water: [], shore: [], roads: [], areas: [], trees: [], ptrees: [], decks: [], pdecks: [], names: [],
    buildings: buildings.map((b, i) => ({ id: 9000 + i, r: [b.ring.map((v) => Math.round(v * Q))], h: b.h * Q, hs: 2 as const, k: 0 })),
  });
  return w;
}
function envOf(w: CollisionWorld): VehicleEnv {
  return flat({ road: (x, z) => ({ ...STRAIGHT, x, z, dist: 0 }), ground: (x, z, y) => w.groundAt(x, z, y), boxContact: (x, z, fx, fz, a, b, y) => w.boxContact(x, z, fx, fz, a, b, y) });
}
/** Corners of the car box inside a building? */
function inside(w: CollisionWorld, car: VehicleBody): boolean {
  const f = car.footprint(-0.02);
  for (let i = 0; i < 8; i += 2) if (w.insideBuilding(f[i], f[i + 1], car.y)) return true;
  return false;
}

test('boxContact: clear, touching and overlapping boxes', () => {
  const w = worldWith([{ ring: [100, 100, 120, 100, 120, 120, 100, 120], h: 10 }]);
  assert.equal(w.boxContact(110, 90, 0, 1, CAR.halfLen, CAR.halfWid, 0), null, 'well clear');
  assert.equal(w.boxContact(110, 100 - CAR.halfLen - 0.01, 0, 1, CAR.halfLen, CAR.halfWid, 0), null, 'just clear');
  const hit = w.boxContact(110, 100 - CAR.halfLen + 0.3, 0, 1, CAR.halfLen, CAR.halfWid, 0);
  assert.ok(hit, 'nose 0.3 m into the wall');
  assert.ok(Math.abs(hit!.px) < 1e-6 && Math.abs(hit!.pz + 0.3) < 1e-6, `push-out ${hit!.px}, ${hit!.pz}`);
  // Rotated 45 degrees: the corner leads.
  const s = Math.SQRT1_2, reach = (CAR.halfLen + CAR.halfWid) * s;
  assert.equal(w.boxContact(110, 100 - reach - 0.01, s, s, CAR.halfLen, CAR.halfWid, 0), null);
  assert.ok(w.boxContact(110, 100 - reach + 0.1, s, s, CAR.halfLen, CAR.halfWid, 0));
  // Above the roof nothing blocks.
  assert.equal(w.boxContact(110, 100, 0, 1, CAR.halfLen, CAR.halfWid, 11), null);
});

test('a head-on hit stops the car at the wall; it never ends up inside the building', () => {
  const w = worldWith([{ ring: [60, 100, 160, 100, 160, 120, 60, 120], h: 10 }]);
  const car = new VehicleBody(envOf(w));
  car.place(110, 20, 0);
  let impact = 0;
  run(car, 8, { throttle: 1 }, () => { impact = Math.max(impact, car.impact); assert.ok(!inside(w, car), `inside at z ${car.z}`); });
  assert.ok(impact > 10, `hit at ${impact} m/s`);
  assert.ok(Math.abs(car.z + CAR.halfLen - 100) < 0.05, `nose rests on the wall: ${car.z + CAR.halfLen}`);
  assert.ok(Math.abs(car.vf) < 0.5, 'stopped');
  run(car, 2, { throttle: -1 });
  assert.ok(car.z < 95, 'reverses away from the wall');
});

test('a glancing hit slides along the wall and turns the nose away', () => {
  const w = worldWith([{ ring: [100, 0, 120, 0, 120, 250, 100, 250], h: 10 }]);
  const car = new VehicleBody(envOf(w));
  // Wall face at x = 100; the car approaches from the west at 20 degrees.
  car.place(90, 20, 0.35);
  run(car, 6, { throttle: 0.7 }, () => assert.ok(!inside(w, car)));
  assert.ok(car.z > 52 && car.vf > 5, `kept moving along the wall: z ${car.z}, ${car.vf} m/s`);
  assert.ok(Math.abs(car.heading) < 0.2, `aligned with the wall: heading ${car.heading}`);
  assert.ok(car.x + CAR.halfWid <= 100.3, 'stayed outside');
});

test('a 2.7 m gap between two obstacles is passable, a 1.6 m gap is not', () => {
  for (const [gap, passes] of [[2.7, true], [1.6, false]] as [number, boolean][]) {
    const w = worldWith([
      { ring: [100 - gap / 2 - 2, 60, 100 - gap / 2, 60, 100 - gap / 2, 64, 100 - gap / 2 - 2, 64], h: 1.5 },
      { ring: [100 + gap / 2, 60, 100 + gap / 2 + 2, 60, 100 + gap / 2 + 2, 64, 100 + gap / 2, 64], h: 1.5 },
    ]);
    const car = new VehicleBody(envOf(w));
    car.place(100, 20, 0);
    run(car, 8, { throttle: 0.5 }, () => assert.ok(!inside(w, car)));
    assert.equal(car.z > 70, passes, `gap ${gap} m: z ${car.z}`);
  }
});

test('the parked car blocks walking but not itself', () => {
  const w = worldWith([]);
  const car = new VehicleBody(envOf(w));
  car.place(100, 100, 0.4);
  w.setDynamicWall('car', car.footprint(), CAR.height);
  // A walker 0.1 m off the car's left flank (left = (cos h, -sin h)) is pushed back to arm's length.
  const d = CAR.halfWid + 0.1, wx = 100 + Math.cos(0.4) * d, wz = 100 - Math.sin(0.4) * d;
  const [x, z] = w.resolve(wx, wz, 0.35, 0);
  assert.ok(Math.abs(Math.hypot(x - wx, z - wz) - 0.25) < 0.01, 'a walker is pushed out of the car');
  const wall = [wx, wz];
  assert.equal(w.boxContact(car.x, car.z, Math.sin(0.4), Math.cos(0.4), CAR.halfLen, CAR.halfWid, 0), null, 'the car ignores its own outline');
  w.setDynamicWall('car', null);
  assert.deepEqual(w.resolve(wall[0], wall[1], 0.35, 0), wall);
});

test('R returns the car to the last pose it held on the carriageway', () => {
  const car = new VehicleBody(flat());
  car.place(0, 0, 0);
  run(car, 3, { throttle: 0.6 });
  const on = { ...car.lastRoad! };
  assert.ok(on && on.z > 1, 'a road pose was recorded');
  run(car, 0.7, { throttle: 0.6, steer: -1 }); // leaves the road to the left
  run(car, 4, { throttle: 0.6 });
  assert.ok(Math.abs(car.x) > 10, `left the road: x ${car.x}`);
  const last = { ...car.lastRoad! };
  assert.ok(Math.abs(last.x) <= 3, 'the remembered pose is still on the road');
  assert.ok(car.resetToRoad());
  assert.deepEqual([car.x, car.z, car.heading], [last.x, last.z, last.heading]);
  assert.equal(car.vf, 0);
});

// --- real map data ------------------------------------------------------------------------------------------

const carWidth = CAR.halfWid * 2;

test('the car waits on Jalan China, in the free lane between the frontages, facing the direction of the one-way street', () => {
  const r = nearestDrivable(dataAt, CAR_START.x, CAR_START.z, carWidth);
  assert.ok(r, 'a drivable road is found');
  assert.equal(r!.name, 'Jalan China');
  assert.equal(r!.id, 124545031);
  assert.ok(onRoad(r), `on the carriageway by the runtime rule: ${r!.dist} m from the centre line`);
  assert.ok(r!.oneWay);
  const along = Math.sin(CAR_START.heading) * r!.dx + Math.cos(CAR_START.heading) * r!.dz;
  assert.ok(along > 0.99, `faces with the traffic: ${along}`);
  // The mapped centre line runs about 2.6 m east of the middle of the street (it passes through the V7 east
  // parked row; docs/V8_REPORT.md data finding 1), so the car's place is checked against the two mapped
  // frontages instead (src/v5/geo.ts street frame: o = 0 halfway between them).
  const [s, o] = CHINA.toStreet(CAR_START.x, CAR_START.z);
  assert.ok(s > CHINA.len && s < CHINA.len + 4.5, `at the Jalan Main Bazaar mouth of the street: s = ${s}`);
  assert.ok(Math.abs(o) < 0.05, `in the middle between the frontages: o = ${o}`);
  // V7 parked rows (src/v5/china.ts): centred 1.8 m inside each pier line, at most 0.905 m half wide plus the
  // 0.03 m collision margin. The body must clear both with room to spare, and point straight down the lane.
  const rowInner = CHINA.half - 1.8 - 0.905 - 0.03;
  assert.ok(rowInner - (Math.abs(o) + CAR.halfWid) > 0.4, `clear of both parked rows: ${rowInner - Math.abs(o) - CAR.halfWid} m`);
  const lane = Math.sin(CAR_START.heading) * -CHINA.dx + Math.cos(CAR_START.heading) * -CHINA.dz;
  assert.ok(lane > 0.99999, `straight down the street: ${lane}`);
});

/** Every drivable-class way with a vertex within `radius` of Jalan China, merged across chunks. */
function waysAround(radius: number): Map<number, { name: string; type: string; width: number; pts: [number, number][] }> {
  const out = new Map<number, { name: string; type: string; width: number; pts: [number, number][] }>();
  for (let cx = -2; cx <= 3; cx++) for (let cz = -3; cz <= 2; cz++) {
    const c = dataAt(cx, cz);
    if (!c) continue;
    for (const r of c.roads) {
      if (!DRIVABLE_CLASSES.has(ROAD_TYPES[r.t])) continue;
      const pts: [number, number][] = [];
      for (let i = 0; i < r.p.length; i += 2) pts.push([cx * CHUNK + r.p[i] / Q, cz * CHUNK + r.p[i + 1] / Q]);
      if (!pts.some((p) => Math.hypot(p[0] - CAR_START.x, p[1] - CAR_START.z) < radius)) continue;
      const e = out.get(r.id) ?? { name: r.n !== undefined ? c.names[r.n] : '', type: ROAD_TYPES[r.t], width: r.w / Q, pts: [] };
      e.pts.push(...pts);
      out.set(r.id, e);
    }
  }
  return out;
}

test('playable area: every mapped carriageway within 300 m of Jalan China is wide enough for the car', () => {
  const ways = waysAround(300);
  assert.ok(ways.size > 30, `${ways.size} ways`);
  const narrow = [...ways.entries()].filter(([, w]) => w.width < carWidth + 2 * SIDE_CLEARANCE);
  assert.deepEqual(narrow.map(([id, w]) => `${id} ${w.name} ${w.width}`), []);
  const min = Math.min(...[...ways.values()].map((w) => w.width));
  assert.ok(min >= 3.5, `narrowest carriageway ${min} m for a ${carWidth.toFixed(2)} m car`);
  // The runtime rule agrees with this check.
  const c = dataAt(0, -1)!;
  assert.ok(c.roads.filter((r) => DRIVABLE_CLASSES.has(ROAD_TYPES[r.t])).every((r) => isDrivable(r, carWidth)));
  assert.ok(c.roads.some((r) => ROAD_TYPES[r.t] === 'footway' && !isDrivable(r, carWidth)), 'footways are not drivable');
});

test('playable area: Jalan China connects to the surrounding streets (a real block can be driven round)', () => {
  const ways = waysAround(300);
  const touch = (a: [number, number][], b: [number, number][]) => a.some((p) => b.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.3));
  const reached = new Set<number>([124545031]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const [id, w] of ways) {
      if (reached.has(id)) continue;
      if ([...reached].some((r) => touch(ways.get(r)!.pts, w.pts))) { reached.add(id); grew = true; }
    }
  }
  const names = new Set([...reached].map((id) => ways.get(id)!.name));
  for (const n of ['Jalan China', 'Jalan Carpenter', 'Jalan Bishopgate', 'Jalan Main Bazaar', 'Jalan Tun Abang Haji Openg', 'Jalan Wawasan']) assert.ok(names.has(n), `${n} is reachable`);
  assert.ok(reached.size >= ways.size * 0.7, `${reached.size} of ${ways.size} ways are connected to Jalan China`);
});
