// V8 driving prototype: vehicle physics on a stub world, oriented-box collision against the real collision
// code, and validation of the playable road area against the shipped chunk data (node --test).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CAR, CAR_START, NEUTRAL, RESET, VehicleBody } from '../../src/vehicle/VehiclePhysics.ts';
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

test('V8.1: the same driving gives the same path at 30, 60 and 144 fps and through 100 ms stalls', () => {
  // Accelerate 3 s, turn right under part throttle 1.5 s, brake 2.5 s. Controls are sampled per frame, as in the game.
  const drive = (frameDt: (i: number) => number) => {
    const car = new VehicleBody(flat());
    car.place(0, 0, 0);
    let t = 0;
    for (let i = 0; t < 7 - 1e-9; i++) {
      const dt = Math.min(frameDt(i), 7 - t);
      car.update(dt, { ...NEUTRAL, ...(t < 3 - 1e-9 ? { throttle: 1 } : t < 4.5 - 1e-9 ? { throttle: 0.6, steer: 1 } : { throttle: -1 }) });
      t += dt;
    }
    return car;
  };
  const ref = drive(() => 1 / 144);
  // A stall every 30th frame: main.ts caps a frame at 0.1 s; the frame boundaries then fall 0.1 s apart at worst.
  for (const [label, dt, tol] of [['30 fps', () => 1 / 30, 0.15], ['60 fps', () => 1 / 60, 0.15], ['60 fps with 100 ms stalls', (i: number) => (i % 30 === 29 ? 0.1 : 1 / 60), 0.6]] as [string, (i: number) => number, number][]) {
    const car = drive(dt);
    const d = Math.hypot(car.x - ref.x, car.z - ref.z);
    assert.ok(d < tol, `${label}: ends ${d.toFixed(3)} m from the 144 fps path`);
    assert.ok(Math.abs(car.heading - ref.heading) < tol / 5, `${label}: heading ${car.heading} vs ${ref.heading}`);
    assert.ok(Math.abs(car.vf - ref.vf) < 0.2, `${label}: speed ${car.vf} vs ${ref.vf}`);
  }
  // Into a wall at full throttle with every frame a 100 ms stall: no tunnelling, same resting place.
  const w = worldWith([{ ring: [60, 100, 160, 100, 160, 120, 60, 120], h: 10 }]);
  const car = new VehicleBody(envOf(w));
  car.place(110, 20, 0);
  for (let i = 0; i < 80; i++) { car.update(0.1, { ...NEUTRAL, throttle: 1 }); assert.ok(!inside(w, car), `inside at z ${car.z}`); }
  assert.ok(Math.abs(car.z + CAR.halfLen - 100) < 0.05, `nose rests on the wall: ${car.z + CAR.halfLen}`);
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
  const res = car.resetToRoad();
  assert.ok(res.ok && res.source === 'recent', JSON.stringify(res));
  assert.deepEqual([car.x, car.z, car.heading], [last.x, last.z, last.heading]);
  assert.equal(car.vf, 0);
});

// --- V8.2 safe reset ------------------------------------------------------------------------------------------

/**
 * A street like Jalan China: the mapped centre line at x = 0 (6 m wide), but parked rows on both sides of a 2.7 m
 * lane whose middle is 2.25 m west of the line (the east row stands on the line). Rows from z = 0 to 120.
 */
const LANE_X = -2.25;
function narrowStreet(extra: { ring: number[]; h: number }[] = []): CollisionWorld {
  return worldWith([
    { ring: [LANE_X + 1.35, 0, 4, 0, 4, 120, LANE_X + 1.35, 120], h: 1.5 }, // east parked row (over the centre line) and frontage
    { ring: [-6, 0, LANE_X - 1.35, 0, LANE_X - 1.35, 120, -6, 120], h: 1.5 }, // west parked row
    ...extra,
  ]);
}
/** Environment of the game: the real collision world, the stub road along x = 0, and the reset-only hooks. */
function resetEnv(w: CollisionWorld, over: Partial<VehicleEnv> = {}): VehicleEnv {
  return flat({
    road: (x, z) => ({ ...STRAIGHT, x: 0, z, dist: Math.abs(x) }),
    ground: (x, z, y) => w.groundAt(x, z, y),
    boxContact: (x, z, fx, fz, a, b, y) => w.boxContact(x, z, fx, fz, a, b, y),
    solid: (x, z, y) => w.insideBuilding(x, z, y, false),
    ...over,
  });
}
/** Clearance of the car at its pose: no wall within the reset margin, no corner inside an outline. */
function clear(w: CollisionWorld, car: VehicleBody): boolean {
  const s = Math.sin(car.heading), c = Math.cos(car.heading);
  return !w.boxContact(car.x, car.z, s, c, CAR.halfLen + RESET.endPad - 0.01, CAR.halfWid + RESET.sidePad - 0.01, car.y) && !inside(w, car);
}

test('V8.2 R: in a narrow lane off the mapped centre line, the car is put in the lane, not on the line', () => {
  const w = narrowStreet();
  const car = new VehicleBody(resetEnv(w));
  // The centre line lies inside the east parked row. With the body wholly inside an outline no edge touches it, so
  // the edge test alone (canOccupy, all the V8.1 reset checked) calls it free; the reset check does not.
  assert.ok(car.canOccupy(0, 60, 0, 0));
  assert.equal(car.check(0, 60, 0), 'blocked');
  // Stuck nose-in against something with no remembered pose: the search finds the lane.
  car.place(LANE_X + 0.1, 60, 0.4);
  car.lastRoad = null;
  const res = car.resetToRoad();
  assert.ok(res.ok && res.source === 'road', JSON.stringify(res));
  assert.ok(Math.abs(car.x - LANE_X) < 0.3, `in the lane: x ${car.x}`);
  assert.ok(Math.abs(car.z - 60) <= RESET.alongStep, `near where it was: z ${car.z}`);
  assert.ok(Math.abs(car.heading) < 1e-9 || Math.abs(car.heading - Math.PI) < 1e-9, `along the street: ${car.heading}`);
  assert.ok(clear(w, car), 'clear of both parked rows with the reset margin');
  assert.equal(car.vf, 0);
});

test('V8.2 R: poses remembered while driving the lane are verified, and the newest is used', () => {
  const w = narrowStreet();
  const car = new VehicleBody(resetEnv(w));
  car.place(LANE_X, 5, 0);
  run(car, 5, { throttle: 0.4 });
  assert.ok(car.recent.length >= 3, `${car.recent.length} poses remembered`);
  for (const p of car.recent) assert.equal(car.check(p.x, p.z, p.heading), '', `remembered pose ${JSON.stringify(p)} is safe`);
  const newest = { ...car.recent[0] };
  car.place(LANE_X + 0.6, car.z, 0.3); // scraped into the east row
  const res = car.resetToRoad();
  assert.ok(res.ok && res.source === 'recent');
  assert.deepEqual([car.x, car.z, car.heading], [newest.x, newest.z, newest.heading]);
});

test('V8.2 R: a remembered pose that is now blocked, inside a building or off the drawn map is skipped', () => {
  // A remembered pose wholly inside a building outline: no edge touches the body, so only the inside test catches it.
  const w = narrowStreet([{ ring: [LANE_X - 1.3, 40, LANE_X + 1.3, 40, LANE_X + 1.3, 50, LANE_X - 1.3, 50], h: 8 }]);
  const car = new VehicleBody(resetEnv(w));
  assert.equal(w.boxContact(LANE_X, 45, 0, 1, CAR.halfLen, CAR.halfWid, 0), null, 'boxContact alone sees nothing');
  assert.equal(car.check(LANE_X, 45, 0), 'blocked');
  car.place(LANE_X, 70, 0);
  car.lastRoad = { x: LANE_X, z: 45, heading: 0 };
  const res = car.resetToRoad();
  assert.ok(res.ok && res.source === 'road', JSON.stringify(res));
  assert.ok(car.z < 40 - CAR.halfLen || car.z > 50 + CAR.halfLen, `outside the building: z ${car.z}`);
  assert.ok(clear(w, car));
  // A pose whose chunk mesh is not drawn yet is not used either.
  const car2 = new VehicleBody(resetEnv(w, { ready: (x, z) => z > 20 }));
  car2.place(LANE_X, 70, 0);
  car2.lastRoad = { x: LANE_X, z: 10, heading: 0 };
  assert.equal(car2.check(LANE_X, 10, 0), 'loading');
  const res2 = car2.resetToRoad();
  assert.ok(res2.ok && car2.z > 20, `on drawn ground: z ${car2.z}`);
});

test('V8.2 R: with no safe place the car is not moved, and the reason says whether the ground is still loading', () => {
  // The whole street is parked up.
  const w = narrowStreet([{ ring: [LANE_X - 1.4, -10, LANE_X + 1.4, -10, LANE_X + 1.4, 130, LANE_X - 1.4, 130], h: 1.5 }]);
  const car = new VehicleBody(resetEnv(w));
  car.place(LANE_X, 60, 0);
  const at = [car.x, car.z, car.heading];
  const res = car.resetToRoad();
  assert.ok(!res.ok && res.reason === 'none' && res.tried > 50, JSON.stringify(res));
  assert.deepEqual([car.x, car.z, car.heading], at, 'the car stays where it was');
  // Nothing loaded round the car.
  const car2 = new VehicleBody(resetEnv(narrowStreet(), { loaded: () => false }));
  car2.place(LANE_X, 60, 0);
  const res2 = car2.resetToRoad();
  assert.ok(!res2.ok && res2.reason === 'loading', JSON.stringify(res2));
  // Map data exists but nothing is loaded yet, so not even the road can be looked up: still 'loading'.
  const car4 = new VehicleBody(resetEnv(narrowStreet(), { loaded: () => false, road: () => null }));
  car4.place(LANE_X, 60, 0);
  const res4 = car4.resetToRoad();
  assert.ok(!res4.ok && res4.reason === 'loading' && res4.tried === 0, JSON.stringify(res4));
  // No drivable road anywhere near (a pedestrian street is not one) and nothing remembered.
  const car3 = new VehicleBody(resetEnv(narrowStreet(), { road: () => null }));
  car3.place(LANE_X, 60, 0);
  const res3 = car3.resetToRoad();
  assert.ok(!res3.ok && res3.reason === 'none' && res3.tried === 0, JSON.stringify(res3));
});

test('V8.2 R: the car is put on the carriageway with its whole body, on gentle ground, away from water', () => {
  // The stub road is 6 m wide along x = 0.
  const car = new VehicleBody(flat());
  assert.equal(car.check(3.5, 0, 0), 'blocked', 'centre off the mapped width');
  assert.equal(car.check(2.9, 0, Math.PI / 2), 'blocked', 'across the road, the nose sticks out past the verge');
  assert.equal(car.check(2.9, 0, 0), '', 'along the road at the kerb');
  // Slope: a 25 % ramp along the road is refused; the reset finds the level part.
  const ramp = (z: number) => (z > 20 && z < 40 ? (z - 20) * 0.25 : z >= 40 ? 5 : 0);
  const steep = new VehicleBody(flat({ ground: (x, z) => ({ h: ramp(z), deck: false }) }));
  assert.equal(steep.check(0, 30, 0), 'blocked');
  steep.place(0, 30, 0);
  const res = steep.resetToRoad();
  assert.ok(res.ok && (steep.z <= 20 - CAR.wheelBase / 2 || steep.z >= 40 + CAR.wheelBase / 2), `level ground: z ${steep.z}`);
  // A cross slope (a kerb under one side) is refused.
  assert.equal(new VehicleBody(flat({ ground: (x) => ({ h: x > 0 ? 0.3 : 0, deck: false }) })).check(0, 0, 0), 'blocked');
  // Water, and a footbridge deck over a road that is not a bridge.
  assert.equal(new VehicleBody(flat({ water: (x) => x < -1 })).check(0, 0, 0), 'blocked');
  assert.equal(new VehicleBody(flat({ ground: () => ({ h: 0, deck: true }) })).check(0, 0, 0), 'blocked');
});

test('V8.2 R: a one-way street keeps its direction; the search follows the nearest carriageway at a junction', () => {
  const car = new VehicleBody(flat({ road: (x, z) => ({ ...STRAIGHT, x: 0, z, dist: Math.abs(x), oneWay: true }) }));
  car.place(0, 0, Math.PI); // facing against the one-way traffic
  car.lastRoad = null;
  const res = car.resetToRoad();
  assert.ok(res.ok && Math.abs(car.heading) < 1e-9, `faces with the traffic: ${car.heading}`);
  // Two roads crossing at the origin, the east-west one free, the north-south one parked up near the junction.
  const w = worldWith([{ ring: [-3, -40, 3, -40, 3, -4, -3, -4], h: 1.5 }, { ring: [-3, 4, 3, 4, 3, 40, -3, 40], h: 1.5 }]);
  const cross = (x: number, z: number): RoadHit => (Math.abs(x) < Math.abs(z)
    ? { ...STRAIGHT, x: 0, z, dist: Math.abs(x) }
    : { ...STRAIGHT, id: 2, x, z: 0, dx: 1, dz: 0, dist: Math.abs(z) });
  const jc = new VehicleBody(resetEnv(w, { road: cross }));
  jc.place(0.5, 8, 0); // nose into the parked row north of the junction
  const r2 = jc.resetToRoad();
  assert.ok(r2.ok, JSON.stringify(r2));
  assert.ok(clear(w, jc), `clear: ${jc.x}, ${jc.z}, ${jc.heading}`);
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
