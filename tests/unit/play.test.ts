// N1-M7: the play loop's pure parts (node --test): jobs and money, saved progress, box tests between vehicles, the
// parking rule on the real chunk data, the job places file, the four vehicle kinds and the traffic's reactions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RouteGraph, isStoppingEdge } from '../../src/ui/Router.ts';
import type { GraphFile } from '../../src/ui/Router.ts';
import { arrive, arrived, fareFor, formatRM, goalOf, makeOffers, parTime, payout, startJob, FROM, TO } from '../../src/play/missions.ts';
import type { Offer } from '../../src/play/missions.ts';
import { GROUPS, GROUP_LABEL, describeSite, groupOf, sitesOf } from '../../src/play/sites.ts';
import type { JobsFile, Site } from '../../src/play/sites.ts';
import { SAVE_KEY, clearSave, freshSave, loadSave, parseSave, writeSave } from '../../src/play/save.ts';
import type { Store } from '../../src/play/save.ts';
import { boxOverlap, closingSpeed, damageFrom, powerAt, repairCost } from '../../src/play/crash.ts';
import { PARK, STARTERS, parkingSpots, settle, spotPose, DRIVE_TO_KIND } from '../../src/play/parked.ts';
import { CAR, CAR_START, DRIVE_KINDS, NEUTRAL, VEHICLE_SPECS, VehicleBody } from '../../src/vehicle/VehiclePhysics.ts';
import type { VehicleEnv } from '../../src/vehicle/VehiclePhysics.ts';
import { KIND, KINDS, SIZE, Traffic, rng } from '../../src/life/traffic.ts';
import type { FillOptions, TrafficHost } from '../../src/life/traffic.ts';
import { Walkers } from '../../src/life/walkers.ts';
import { Kit, hex } from '../../src/v5/kit.ts';
import { kapcai, vehicle, vehicleSize, vehicleWheels } from '../../src/v5/vehicles.ts';
import { ROAD_TYPES } from '../../src/world/types.ts';
import type { ChunkData } from '../../src/world/types.ts';

const DATA = 'public/data/kuching';
const chunk = (key: string): ChunkData => JSON.parse(readFileSync(`${DATA}/chunks/${key}.json`, 'utf8'));
const graph = new RouteGraph(JSON.parse(readFileSync(`${DATA}/drive-graph.json`, 'utf8')) as GraphFile);
const jobs = JSON.parse(readFileSync(`${DATA}/jobs.json`, 'utf8')) as JobsFile;

// ---- jobs and money ------------------------------------------------------------------------------------------------

const offer = (kind: 'delivery' | 'taxi', trip: number): Offer => ({ id: 1, kind, from: { x: 0, z: 0, group: 'food' }, to: { x: trip, z: 0, group: 'stay' }, approach: 100, trip, fare: fareFor(kind, trip) });

test('fares grow with the road distance; a taxi fare is more than a delivery; money is in ten sen', () => {
  assert.equal(fareFor('delivery', 0), 3);
  assert.equal(fareFor('taxi', 0), 4);
  assert.ok(fareFor('delivery', 2000) > fareFor('delivery', 1000));
  assert.ok(fareFor('taxi', 1500) > fareFor('delivery', 1500));
  for (const m of [137, 999, 2468]) assert.equal(Math.round(fareFor('taxi', m) * 10), fareFor('taxi', m) * 10 | 0 || Math.round(fareFor('taxi', m) * 10), 'whole ten-sen steps');
  assert.equal(formatRM(4.9), 'RM 4.90');
});

test('a job has two stages; the clock starts at the pick-up; the payout is fare plus tip', () => {
  const job = startJob(offer('delivery', 1000));
  assert.equal(job.stage, 'pickup');
  assert.deepEqual(goalOf(job), job.offer.from);
  job.time = 99; job.crashes = 3; // nothing before the pick-up counts
  assert.equal(arrive(job), null);
  assert.equal(job.stage, 'dropoff');
  assert.equal(job.time, 0);
  assert.equal(job.crashes, 0);
  assert.deepEqual(goalOf(job), job.offer.to);
  job.time = parTime(1000) - 1;
  const pay = arrive(job)!;
  assert.equal(pay.fare, job.offer.fare);
  assert.ok(pay.onTime);
  assert.ok(Math.abs(pay.tip - job.offer.fare * 0.4) < 0.06, `full tip: ${pay.tip}`);
  assert.ok(Math.abs(pay.total - (pay.fare + pay.tip)) < 1e-9);
});

test('the tip falls with lateness and with collisions, and never goes below nothing', () => {
  const at = (time: number, crashes: number, kind: 'delivery' | 'taxi' = 'delivery') => payout({ offer: offer(kind, 1400), stage: 'dropoff', time, crashes });
  const par = parTime(1400);
  assert.ok(at(par * 1.5, 0).tip < at(par, 0).tip && at(par * 1.5, 0).tip > 0);
  assert.equal(at(par * 2, 0).tip, 0);
  assert.equal(at(par * 9, 0).tip, 0);
  assert.ok(at(10, 2).tip < at(10, 0).tip);
  assert.equal(at(10, 5).tip, 0);
  assert.equal(at(10, 50).total, at(10, 50).fare, 'the fare itself is never docked');
  assert.ok(at(10, 0, 'taxi').tip < at(10, 0, 'taxi').fare * 0.31);
});

test('arrival: near the stopping point or the place, and nearly at rest', () => {
  const goal = { x: 100, z: 0 }, stop = { x: 80, z: 5 };
  assert.equal(arrived(80, 0, 0, goal, stop), true, 'at the stopping point');
  assert.equal(arrived(95, 0, 0, goal, null), true, 'at the place');
  assert.equal(arrived(80, 0, 6, goal, stop), false, 'driving past is not arriving');
  assert.equal(arrived(40, 0, 0, goal, stop), false);
});

test('job places: the file holds only job groups, in whole metres, every one near a public road; no names', () => {
  assert.equal(jobs.v, 1);
  assert.deepEqual(jobs.groups, [...GROUPS]);
  assert.equal(jobs.sites.length % 3, 0);
  const sites = sitesOf(jobs);
  assert.ok(sites.length > 1000, `${sites.length} places`);
  assert.ok(sites.filter((s) => s.group === 'food').length > 300);
  assert.ok(!/"name"|[A-Za-z]{4,}\s[A-Za-z]{4,}/.test(JSON.stringify(jobs.sites)), 'numbers only');
  let checked = 0;
  for (let i = 0; i < sites.length; i += 23) {
    const s = sites[i];
    assert.ok(Number.isInteger(s.x) && Number.isInteger(s.z));
    assert.ok(graph.snap(s.x, s.z, 62, undefined, (e) => isStoppingEdge(graph, e)).length > 0, `place ${i} is within 60 m of a public carriageway`);
    checked++;
  }
  assert.ok(checked > 40);
});

test('a place is described by its kind and street, never by a business name', () => {
  assert.equal(groupOf('restaurant'), 'food');
  assert.equal(groupOf('hotel'), 'stay');
  assert.equal(groupOf('muslim_place_of_worship'), 'worship');
  assert.equal(groupOf('automotive_service'), null);
  assert.equal(groupOf(undefined), null);
  assert.equal(describeSite({ x: 0, z: 0, group: 'food', street: 'Jalan Padungan' }), 'a restaurant, Jalan Padungan');
  assert.equal(describeSite({ x: 0, z: 0, group: 'stay' }), 'a hotel');
  assert.equal(describeSite({ x: 0, z: 0, group: 'landmark', name: 'Kuching Waterfront' }), 'Kuching Waterfront');
  for (const g of GROUPS) assert.ok(/^an? /.test(GROUP_LABEL[g]), `${g}: a generic label`);
});

test('offers from the car in Jalan China: up to three, each drivable on the real road graph, nearest first', () => {
  const sites: Site[] = sitesOf(jobs);
  const stopping = (e: number) => isStoppingEdge(graph, e);
  const road = (ax: number, az: number, bx: number, bz: number) => graph.route(ax, az, bx, bz, { maxSnapStart: 250, maxSnap: 160, endEdge: stopping })?.length ?? null;
  for (const kind of ['delivery', 'taxi'] as const) {
    const list = makeOffers(kind, sites, 205.9, -55, { road, rand: rng(7), nextId: 10 });
    assert.ok(list.length >= 2 && list.length <= 3, `${kind}: ${list.length} offers`);
    assert.deepEqual(list.map((o) => o.id), list.map((_, i) => 10 + i));
    for (const o of list) {
      assert.ok(FROM[kind].includes(o.from.group) && TO[kind].includes(o.to.group), `${kind}: ${o.from.group} -> ${o.to.group}`);
      assert.ok(o.trip >= 80 && o.approach >= 0 && o.fare === fareFor(kind, o.trip));
      assert.notEqual(o.from, o.to);
    }
    assert.ok(Math.hypot(list[0].from.x - 205.9, list[0].from.z + 55) <= 420, 'the first offer starts close by');
    assert.ok(list[0].trip < list[list.length - 1].trip, 'short job first, long job last');
  }
  // the same seed gives the same offers; no road, no offer
  const a = makeOffers('delivery', sites, 205.9, -55, { road, rand: rng(3) }), b = makeOffers('delivery', sites, 205.9, -55, { road, rand: rng(3) });
  assert.deepEqual(a, b);
  assert.deepEqual(makeOffers('delivery', sites, 205.9, -55, { road: () => null, rand: rng(3) }), []);
});

// ---- saved progress ------------------------------------------------------------------------------------------------

function memory(): Store & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, String(v)); }, removeItem: (k) => { data.delete(k); } };
}

test('save and load round trip; nothing saved reads as null', () => {
  const store = memory();
  assert.equal(loadSave(store), null);
  const s = freshSave();
  s.money = 12.3; s.earned = 40; s.delivery = 3; s.taxi = 1;
  s.vehicle = { kind: 'taxi', x: 10.5, z: -20.25, heading: 1.2, damage: 0.35, paint: 0xa8241c };
  assert.equal(writeSave(s, store), true);
  assert.ok(store.data.has(SAVE_KEY));
  assert.deepEqual(loadSave(store), s);
  assert.equal(clearSave(store), true);
  assert.equal(loadSave(store), null);
});

test('a damaged, foreign or hostile saved value is refused, never trusted and never thrown on', () => {
  for (const bad of ['', 'not json', '[]', 'null', '42', '{}', '{"v":2,"money":5,"earned":5,"delivery":0,"taxi":0}', '{"v":1,"money":-5,"earned":0,"delivery":0,"taxi":0}',
    '{"v":1,"money":"99","earned":0,"delivery":0,"taxi":0}', '{"v":1,"money":1e99,"earned":0,"delivery":0,"taxi":0}', '{"v":1,"money":null,"earned":0,"delivery":0,"taxi":0}']) {
    assert.equal(parseSave(bad), null, bad);
  }
  // a bad vehicle is dropped, the rest is kept
  const partly = parseSave('{"v":1,"money":7.26,"earned":9,"delivery":2.9,"taxi":0,"vehicle":{"kind":"tank","x":0,"z":0,"heading":0,"damage":0,"paint":1}}')!;
  assert.equal(partly.vehicle, null);
  assert.equal(partly.money, 7.3);
  assert.equal(partly.delivery, 2);
  assert.equal(parseSave('{"v":1,"money":1,"earned":1,"delivery":0,"taxi":0,"vehicle":{"kind":"kapcai","x":"NaN","z":0,"heading":0,"damage":0,"paint":1}}')!.vehicle, null);
  assert.equal(parseSave('{"v":1,"money":1,"earned":1,"delivery":0,"taxi":0,"vehicle":{"kind":"kapcai","x":1,"z":2,"heading":0,"damage":7,"paint":1}}')!.vehicle, null);
});

test('storage that throws or is missing: load gives null, save gives false, nothing escapes', () => {
  const broken: Store = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); }, removeItem: () => { throw new Error('denied'); } };
  assert.equal(loadSave(broken), null);
  assert.equal(writeSave(freshSave(), broken), false);
  assert.equal(clearSave(broken), false);
  assert.equal(loadSave(null), null);
  assert.equal(writeSave(freshSave(), null), false);
  // (node has no localStorage: the default store is absent, and that is not an error either)
  assert.equal(loadSave(), null);
  assert.equal(writeSave(freshSave()), false);
});

// ---- vehicle against vehicle ---------------------------------------------------------------------------------------

test('boxOverlap: apart, touching end on, side by side and at an angle; the push takes the first box clear', () => {
  const a = { x: 0, z: 0, heading: 0, half: 2, hw: 0.9 }, at = (x: number, z: number, heading = 0) => ({ x, z, heading, half: 2, hw: 0.9 });
  assert.equal(boxOverlap(a, at(0, 4.01)), null);
  assert.equal(boxOverlap(a, at(1.81, 0)), null);
  const end = boxOverlap(a, at(0, 3.7))!;
  assert.ok(Math.abs(end.depth - 0.3) < 1e-9 && Math.abs(end.px) < 1e-9 && Math.abs(end.pz + 0.3) < 1e-9, 'pushed back along z');
  const side = boxOverlap(a, at(1.5, 0.5))!;
  assert.ok(Math.abs(side.px + 0.3) < 1e-9 && Math.abs(side.pz) < 1e-9, 'pushed sideways, the shorter way');
  // a crossing vehicle: after the push the boxes no longer overlap
  for (const [x, z, h] of [[1.5, 2.2, 1.1], [-0.8, 2.5, Math.PI / 2], [1.2, -1.9, 0.6]]) {
    const b = at(x, z, h), o = boxOverlap(a, b);
    assert.ok(o, `overlap at ${x}, ${z}`);
    assert.equal(boxOverlap({ ...a, x: a.x + o!.px * 1.001, z: a.z + o!.pz * 1.001 }, b), null);
  }
});

test('closing speed counts both vehicles; damage starts above a touch; a wreck keeps 40 % power; repair has a price', () => {
  const o = { px: 0, pz: -0.3, depth: 0.3 }; // the other vehicle is ahead (+z)
  assert.equal(closingSpeed(o, 0, 8, 0, 0), 8, 'driving into a standing vehicle');
  assert.equal(closingSpeed(o, 0, 8, 0, 6), 2, 'catching up a slower one');
  assert.equal(closingSpeed(o, 0, 0, 0, -5), 5, 'being driven into');
  assert.equal(closingSpeed(o, 0, -3, 0, 0), 0, 'parting');
  assert.equal(damageFrom(1.9), 0);
  assert.ok(damageFrom(6) > 0 && damageFrom(12) > damageFrom(6));
  assert.equal(damageFrom(100), 0.5, 'one blow never wrecks a whole vehicle');
  assert.equal(powerAt(0), 1);
  assert.equal(powerAt(0.5), 1);
  assert.ok(powerAt(0.8) < 1 && powerAt(1) >= 0.4 && powerAt(1) < 0.45);
  assert.equal(repairCost(0), 0);
  assert.ok(repairCost(1) > repairCost(0.3) && repairCost(0.3) > 0);
});

function flat(over: Partial<VehicleEnv> = {}): VehicleEnv {
  return { ground: () => ({ h: 0, deck: false }), loaded: () => true, hasData: () => true, water: () => false, boxContact: () => null,
    road: (x, z) => ({ id: 1, name: 'Test Road', type: 'residential', width: 6, dist: Math.abs(x), x: 0, z, dx: 0, dz: 1, oneWay: false, bridge: false }), ...over };
}

test('shove: the body moves clear and loses its speed toward the other vehicle; not into a wall', () => {
  const car = new VehicleBody(flat());
  car.place(0, 0, 0);
  car.vf = 9;
  car.shove(0, -0.4);
  assert.ok(Math.abs(car.z + 0.4) < 1e-9);
  assert.ok(car.vf < 0 && car.vf > -2, `a small bounce: ${car.vf}`);
  const walled = new VehicleBody(flat({ boxContact: () => ({ px: 0, pz: 1, cx: 0, cz: 0 }) }));
  walled.place(0, 0, 0);
  walled.vf = 9;
  walled.shove(0, -0.4);
  assert.equal(walled.z, 0, 'no room: it stays');
  assert.ok(walled.vf < 0, 'but the speed is lost all the same');
});

// ---- four kinds of vehicle -----------------------------------------------------------------------------------------

test('four kinds: sizes agree between physics, traffic and model; each drives, and they feel different', () => {
  assert.deepEqual([...DRIVE_KINDS], ['hatch', 'kapcai', 'taxi', 'pickup']);
  assert.equal(VEHICLE_SPECS.hatch, CAR);
  assert.equal(SIZE.length, KINDS);
  for (const kind of DRIVE_KINDS) {
    const spec = VEHICLE_SPECS[kind], size = SIZE[DRIVE_TO_KIND[kind]];
    assert.ok(Math.abs(spec.halfLen - size.half) < 0.02 && Math.abs(spec.halfWid - size.hw) < 0.02, `${kind}: physics and traffic sizes`);
  }
  assert.deepEqual(vehicleSize('pickup'), { half: 2.65, hw: 0.93 });
  assert.ok(Math.abs(vehicleWheels('pickup').axles[1] - vehicleWheels('pickup').axles[0] - VEHICLE_SPECS.pickup.wheelBase) < 0.01);
  const run = (kind: (typeof DRIVE_KINDS)[number], seconds: number) => {
    const car = new VehicleBody(flat(), VEHICLE_SPECS[kind]);
    car.place(0, 0, 0);
    for (let i = 0; i < seconds * 60; i++) car.update(1 / 60, { ...NEUTRAL, throttle: 1 });
    return car;
  };
  const after2 = Object.fromEntries(DRIVE_KINDS.map((k) => [k, run(k, 2).vf]));
  assert.ok(after2.kapcai > after2.hatch && after2.hatch > after2.taxi && after2.taxi > after2.pickup, `off the mark: ${JSON.stringify(after2)}`);
  const top = Object.fromEntries(DRIVE_KINDS.map((k) => [k, run(k, 60).kmh]));
  assert.ok(top.kapcai < top.hatch && top.kapcai > 60, `flat out: ${JSON.stringify(top)}`);
  // a damaged engine is slower
  const limp = new VehicleBody(flat());
  limp.place(0, 0, 0); limp.power = 0.4;
  for (let i = 0; i < 60 * 60; i++) limp.update(1 / 60, { ...NEUTRAL, throttle: 1 });
  assert.ok(limp.kmh < top.hatch * 0.75 && limp.kmh > 20, `wreck: ${limp.kmh} km/h`);
  // changing kind keeps the pose and forgets reset poses taken with other clearances
  const car = run('hatch', 3);
  const z = car.z;
  assert.ok(car.recent.length > 0);
  car.setSpec(VEHICLE_SPECS.pickup);
  assert.equal(car.z, z);
  assert.equal(car.recent.length, 0);
});

test('models: the pickup has a load bed and no rear glasshouse; the taxi a roof sign; the parked kapcai no rider', () => {
  const tris = (k: Kit) => [...k.bufs.values()].reduce((n, b) => n + b.idx.length / 3, 0);
  const maxY = (k: Kit, x0: number, x1: number) => { let y = 0; for (const b of k.bufs.values()) for (let i = 0; i < b.pos.length; i += 3) if (b.pos[i] >= x0 && b.pos[i] <= x1) y = Math.max(y, b.pos[i + 1]); return y; };
  const pick = new Kit(1), saloon = new Kit(1), taxi = new Kit(1);
  vehicle(pick, 'pickup', hex(0xffffff));
  vehicle(saloon, 'saloon', hex(0xffffff));
  vehicle(taxi, 'saloon', hex(0xffffff), null, '', false, true);
  assert.ok(tris(pick) > 800 && tris(pick) < 2200, `pickup ${tris(pick)} triangles`);
  assert.ok(maxY(pick, -2.5, -1.0) < 1.4 && maxY(pick, 0, 0.7) > 1.75, 'low bed behind a tall cab');
  assert.ok(tris(taxi) > tris(saloon) && maxY(taxi, -0.5, 0.3) > maxY(saloon, -0.5, 0.3) + 0.1, 'the sign stands on the roof');
  const ridden = new Kit(1), empty = new Kit(1), bare = new Kit(1);
  const start = kapcai(ridden, hex(0x808080), true);
  kapcai(empty, hex(0x808080), false);
  kapcai(bare, hex(0x808080), false, true);
  assert.ok(maxY(ridden, -1, 1) > 1.6 && maxY(empty, -1, 1) < 1.1, 'rider or no rider');
  assert.ok(tris(bare) < tris(empty), 'the ridden model adds its own wheels');
  // the rider's vertices are exactly those after the counts returned
  let riders = 0;
  for (const [name, b] of ridden.bufs) riders += b.count - (start.get(name) ?? 0);
  assert.ok(riders > 100);
  for (const [name, b] of ridden.bufs) for (let i = start.get(name) ?? 0; i < b.count; i++) assert.ok(b.pos[i * 3 + 1] > 0.25, 'no rider vertex is part of the bike below the foot rests');
});

// ---- the parking rule ----------------------------------------------------------------------------------------------

test('parking places: beside service roads and residential edges only, clear of the carriageway, fixed for a chunk', () => {
  const SERVICE = ROAD_TYPES.indexOf('service'), RESIDENTIAL = ROAD_TYPES.indexOf('residential');
  let all = 0;
  const kinds: Record<string, number> = {}, keys = new Set<string>();
  for (const key of ['0_0', '0_-1', '1_0', '-1_0', '4_1', '6_2', '-6_3']) {
    const d = chunk(key), spots = parkingSpots(d);
    assert.deepEqual(parkingSpots(d), spots, 'the same places every time');
    all += spots.length;
    for (const s of spots) {
      assert.ok(!keys.has(s.key), 'each place has its own key, across chunks too');
      keys.add(s.key);
      const [ck, ri] = s.key.split(':'), road = d.roads[Number(ri)];
      assert.equal(ck, key);
      assert.ok(road && (road.t === SERVICE || road.t === RESIDENTIAL) && (road.f & 3) === 0, 'never on a bridge, in a tunnel or beside a main road');
      assert.equal(s.service, road.t === SERVICE);
      if (!s.service) assert.equal(s.kind, 'kapcai');
      assert.ok(Math.abs(Math.hypot(s.nx, s.nz) - 1) < 1e-6 && Math.abs(Math.hypot(s.fx, s.fz) - 1) < 1e-6 && Math.abs(s.nx * s.fx + s.nz * s.fz) < 1e-6, 'unit normal across, unit direction along');
      // the body's near side is PARK.gap (kerbGap beside a street with traffic) outside the edge of its own carriageway, and it faces along the road
      const p = spotPose(s), hw = SIZE[DRIVE_TO_KIND[s.kind]].hw;
      assert.ok(Math.abs((p.x - s.ex) * s.nx + (p.z - s.ez) * s.nz - hw - (s.service ? PARK.gap : PARK.kerbGap)) < 1e-6);
      assert.ok(Math.abs(Math.sin(p.heading) - s.fx) < 1e-9 && Math.abs(Math.cos(p.heading) - s.fz) < 1e-9);
      // the road is on the vehicle's right: it stands at the left kerb, as traffic that keeps left parks
      assert.ok(Math.abs(Math.cos(p.heading) - s.nx) < 1e-6 && Math.abs(-Math.sin(p.heading) - s.nz) < 1e-6);
      kinds[s.kind] = (kinds[s.kind] ?? 0) + 1;
    }
  }
  assert.ok(all > 60, `${all} places in seven chunks`);
  for (const k of DRIVE_KINDS) assert.ok(kinds[k] >= 4, `${k}: ${kinds[k]} parked`);
});

test('settle: only clear places are kept, none overlap, and the three starters stand a short walk from the car', () => {
  const d = chunk('0_0'), spots = parkingSpots(d);
  const everything = settle(spots, 0, 0, () => true);
  assert.ok(everything.length > 5);
  for (let i = 0; i < everything.length; i++) for (let j = 0; j < i; j++) assert.ok(Math.hypot(everything[i].x - everything[j].x, everything[i].z - everything[j].z) >= 5.6, 'no two vehicles overlap');
  assert.deepEqual(settle(spots, 0, 0, () => false), [], 'nothing is clear: nothing stands');
  // the starters: one of each kind besides the hatchback, in the car's own chunk, under 60 m from it, apart
  assert.deepEqual(STARTERS.map((s) => s.kind).sort(), ['kapcai', 'pickup', 'taxi']);
  const start = settle(parkingSpots(chunk('0_-1')), 0, -1, () => true).filter((s) => s.key.startsWith('start:'));
  assert.equal(start.length, STARTERS.length);
  for (const s of start) {
    const dCar = Math.hypot(s.x - CAR_START.x, s.z - CAR_START.z);
    assert.ok(dCar > 15 && dCar < 60, `${s.kind} ${dCar.toFixed(0)} m from the car`);
    // side by side with room to walk between: the body boxes do not overlap
    for (const o of start) if (o !== s) assert.equal(boxOverlap({ x: s.x, z: s.z, heading: s.heading, half: SIZE[DRIVE_TO_KIND[s.kind]].half, hw: SIZE[DRIVE_TO_KIND[s.kind]].hw + 0.3 }, { x: o.x, z: o.z, heading: o.heading, half: SIZE[DRIVE_TO_KIND[o.kind]].half, hw: SIZE[DRIVE_TO_KIND[o.kind]].hw + 0.3 }), null);
  }
  assert.equal(settle([], 0, -1, (_p, kind) => kind !== 'taxi').some((s) => s.kind === 'taxi'), false, 'a starter whose place is taken is left out');
  assert.equal(settle([], 0, -1, () => true).length, 3);
  assert.equal(settle([], 5, 5, () => true).length, 0, 'and they stand in their own chunk only');
});

// ---- the traffic reacts --------------------------------------------------------------------------------------------

const host = (): TrafficHost => ({ ground: () => 0, loaded: () => true, width: () => null, signal: () => false });
const FILL: FillOptions = { want: 20, rMin: 60, rMax: 220, far: 300, kinds: [3, 3, 2, 4, 1, 2], tints: 8 };

test('all six kinds drive in the traffic; a bumped vehicle stands, hoots once, then drives on', () => {
  const t = new Traffic(graph, host());
  for (let i = 0; i < 400; i++) t.update(1 / 30, -1600, 900, FILL, [], i < 40);
  assert.ok(t.vehicles.length >= 12);
  const seen = new Set(t.vehicles.map((v) => v.kind));
  assert.ok(seen.has(KIND.taxi) || seen.has(KIND.pickup), 'the new kinds are on the road');
  const v = t.vehicles.find((q) => q.v > 3)!;
  assert.ok(v, 'a moving vehicle');
  const horns: number[] = [];
  t.onHorn = (w) => horns.push(w.id);
  const s0 = v.s, e0 = v.cur.e;
  t.bump(v, 6);
  assert.equal(v.v, 0);
  assert.ok(v.halt >= 2 && v.halt <= 5);
  const halt = v.halt;
  t.bump(v, 20);
  assert.equal(v.halt, halt, 'a second blow does not restart the wait');
  for (let i = 0; i < 30; i++) t.update(1 / 30, -1600, 900, FILL);
  assert.ok(v.cur.e === e0 && Math.abs(v.s - s0) < 0.01 && v.braking, 'standing with its brake lamps on');
  assert.deepEqual(horns, [v.id], 'one hoot');
  for (let i = 0; i < 30 * 8; i++) t.update(1 / 30, -1600, 900, FILL);
  assert.ok(v.dead || v.cur.e !== e0 || v.s > s0 + 2, 'it drove on');
});

test('the horn: a driver held up by the player within 30 m ahead edges past; one behind or far away does not', () => {
  const t = new Traffic(graph, host());
  for (let i = 0; i < 300; i++) t.update(1 / 30, -1600, 900, FILL, [], i < 40);
  const v = t.vehicles.find((q) => q.v > 3)!;
  // stand in its way until it has stopped and waited
  const at = { x: 0, z: 0 };
  t.pathPoint(v, 9, Object.assign(at, { tx: 0, tz: 0 }) as never);
  const block = [{ x: at.x, z: at.z, r: 1, vx: 0, vz: 0 }];
  for (let i = 0; i < 30 * 6 && !(v.v < 0.1 && v.held > 1); i++) t.update(1 / 30, -1600, 900, FILL, block);
  assert.ok(v.v < 0.1 && v.held > 1, 'held up');
  const hx = Math.sin(v.heading), hz = Math.cos(v.heading);
  // a horn sounded from beyond the vehicle, facing away from it: nobody reacts
  assert.equal(t.honk(v.x - hx * 60, v.z - hz * 60, -hx, -hz), 0);
  assert.equal(v.past <= 0, true);
  // from the obstacle, facing the vehicle
  assert.ok(t.honk(block[0].x, block[0].z, -hx, -hz) >= 1);
  assert.ok(v.past > 0, 'it will edge past now');
});

test('walkers ahead of a horn stop for a moment', () => {
  const w = new Walkers({ chunk: () => undefined, ground: () => 0, clear: () => true }, rng(1));
  const mk = (x: number, z: number, stand = false) => ({ id: w.list.length + 1, pts: new Float32Array([x, z, x + 5, z]), cum: new Float32Array([0, 5]), len: 5, s: 0, dir: 1 as const, pace: 1.2, v: 1, wait: 0, stand, arcade: false, x, y: 0, z, gy: 0, heading: 0, phase: 0, look: 1, height: 1.7, dead: false });
  w.list.push(mk(0, 6) as never, mk(0, -6) as never, mk(0, 30) as never, mk(1, 4, true) as never);
  assert.equal(w.startle(0, 0, 0, 1), 1, 'only the walker within 10 m ahead (not the one behind, the far one or the standing figure)');
  assert.ok(w.list[0].wait >= 1.4);
  assert.equal(w.list[1].wait, 0);
});
