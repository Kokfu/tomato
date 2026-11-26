// N1-M6 part B: ambient traffic on the mapped drive graph (node --test). The real drive-graph.json is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RouteGraph } from '../../src/ui/Router.ts';
import type { GraphFile } from '../../src/ui/Router.ts';
import { KIND, SIGNAL, SIZE, Traffic } from '../../src/life/traffic.ts';
import type { FillOptions, Obstacle, TrafficHost, Vehicle } from '../../src/life/traffic.ts';

const graph = new RouteGraph(JSON.parse(readFileSync('public/data/kuching/drive-graph.json', 'utf8')) as GraphFile);
const flat = (signal = false): TrafficHost => ({ ground: () => 0, loaded: () => true, width: () => null, signal: () => signal });
const FILL: FillOptions = { want: 24, rMin: 60, rMax: 220, far: 300, kinds: [3, 3, 2, 4], tints: 8 };
/** A suburb of two-way streets (Jalan Nanas Barat, tour view 11); the old town is nearly all one-way. */
const FX = -1600, FZ = 900;

/** Signed distance of a vehicle to the left of the centre line of its edge, in its direction of travel. */
function leftOf(v: Vehicle): number {
  const p = graph.epts[v.cur.e];
  let best = Infinity, side = 0;
  for (let i = 2; i < p.length; i += 2) {
    const ax = p[i - 2], az = p[i - 1], vx = p[i] - ax, vz = p[i + 1] - az, l2 = vx * vx + vz * vz;
    if (l2 < 1e-6) continue;
    const t = Math.max(0, Math.min(1, ((v.x - ax) * vx + (v.z - az) * vz) / l2));
    const dx = v.x - (ax + vx * t), dz = v.z - (az + vz * t), d = Math.hypot(dx, dz);
    if (d >= best) continue;
    best = d;
    // left of a -> b is (vz, -vx); flip for b -> a
    side = ((dx * vz - dz * vx) / Math.sqrt(l2)) * (v.cur.fwd ? 1 : -1);
  }
  return side;
}

test('traffic keeps to streets that lead on: no service road, no covered way, no dead end', () => {
  const t = new Traffic(graph, flat());
  let n = 0;
  const deg = new Int32Array(graph.nodeCount);
  for (let e = 0; e < graph.edgeCount; e++) {
    if (!t.ok[e]) continue;
    n++;
    assert.notEqual(graph.typeOf(e), 'service');
    deg[graph.ea[e]]++; deg[graph.eb[e]]++;
  }
  assert.ok(n > 2000, `${n} edges carry traffic`);
  // every direction of travel in use leads on to another street
  for (let arc = 0; arc < graph.edgeCount * 2; arc++) {
    if (!t.good[arc]) continue;
    const e = arc >> 1, node = arc & 1 ? graph.ea[e] : graph.eb[e];
    if (arc & 1) assert.equal(graph.isOneWay(e), false, `edge ${e} is one-way`);
    assert.ok([...graph.edgesAt(node)].some((o) => o !== e && t.good[o * 2 + (graph.ea[o] === node ? 0 : 1)]), `edge ${e} ends in a dead end`);
  }
});

test('vehicles appear in the ring round the player, on the left of two-way streets, and never against a one-way', () => {
  const t = new Traffic(graph, flat());
  t.update(0.05, FX, FZ, FILL, [], true);
  assert.ok(t.vehicles.length >= 18, `first fill gave ${t.vehicles.length} vehicles`);
  for (const v of t.vehicles) assert.ok(Math.hypot(v.x - FX, v.z - FZ) <= FILL.rMax + 1);
  let left = 0, twoWay = 0, moved = 0, kinds = new Set<number>();
  const start = new Map(t.vehicles.map((v) => [v.id, [v.x, v.z]]));
  for (let i = 0; i < 20 * 90; i++) {
    t.update(0.05, FX, FZ, FILL);
    if (i === 200) for (const v of t.vehicles) { const s = start.get(v.id); if (s && Math.hypot(v.x - s[0], v.z - s[1]) > 30) moved++; }
    for (const v of t.vehicles) {
      kinds.add(v.kind);
      assert.ok(t.ok[v.cur.e], 'on a street open to traffic');
      if (graph.isOneWay(v.cur.e)) assert.equal(v.cur.fwd, true, `vehicle ${v.id} drives against one-way edge ${v.cur.e}`);
      else if (v.s > 8 && v.cur.len - v.s > 8) { twoWay++; if (leftOf(v) > 0.4) left++; }
      assert.ok(Number.isFinite(v.x + v.z + v.heading + v.v) && v.v >= 0 && v.v < 15);
    }
  }
  assert.ok(twoWay > 2000 && left / twoWay > 0.97, `${left} of ${twoWay} samples on two-way streets are left of the centre line`);

  assert.ok(kinds.size === 4, 'all four kinds drive');
  assert.ok(t.vehicles.length >= 16 && moved >= 12, `${t.vehicles.length} vehicles after 90 s; ${moved} of the first ones had driven 30 m after 10 s`);
});

// (with a signal at every junction there are queues at red lights: a queue must never be mistaken for a deadlock)
for (const signals of [false, true]) test(`vehicles do not drive into each other (${signals ? 'a signal at every junction' : 'no signals'})`, () => {
  const t = new Traffic(graph, flat(signals));
  let overlaps = 0, samples = 0;
  // suburb, the one-way old town, Jalan Padungan, the trunk road
  for (const [fx, fz] of [[FX, FZ], [100, 0], [1000, 250], [-380, 1400]]) for (let i = 0; i < 20 * 90; i++) {
    t.update(0.05, fx, fz, FILL, [], i === 0);
    const l = t.vehicles;
    for (let a = 0; a < l.length; a++) for (let b = a + 1; b < l.length; b++) {
      const d = Math.hypot(l[a].x - l[b].x, l[a].z - l[b].z);
      if (d > 6) continue;
      samples++;
      // bodies as three circles each
      const pts = (v: Vehicle) => [-0.6, 0, 0.6].map((k) => [v.x + Math.sin(v.heading) * SIZE[v.kind].half * k, v.z + Math.cos(v.heading) * SIZE[v.kind].half * k]);
      const ra = SIZE[l[a].kind].hw, rb = SIZE[l[b].kind].hw;
      if (pts(l[a]).some((p) => pts(l[b]).some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < (ra + rb) * 0.8))) overlaps++;
    }
  }
  assert.ok(samples > 1000 && overlaps / samples < 0.01, `${overlaps} overlapping samples of ${samples} close pairs`);
});

test('a queue behind a stopped vehicle stays a queue: nobody drives through the one in front', () => {
  const t = new Traffic(graph, flat());
  t.update(0.05, FX, FZ, FILL, [], true);
  // a wall of walkers across the path of the first vehicle that has others behind it on a long stretch
  const P = { x: 0, z: 0, tx: 0, tz: 1 };
  let lead: Vehicle | undefined, block: Obstacle | undefined, min = Infinity, queued = 0;
  for (let i = 0; i < 20 * 120; i++) {
    t.update(0.05, FX, FZ, FILL, block ? [block] : []);
    if (!lead) {
      lead = t.vehicles.find((v) => v.v > 5 && v.cur.len - v.s > 40 && t.vehicles.some((w) => w !== v && w.cur.e === v.cur.e && w.cur.fwd === v.cur.fwd && w.s < v.s && v.s - w.s < 60));
      if (lead) { t.pathPoint(lead, 18, P); block = { x: P.x, z: P.z, r: 0.45, vx: 0, vz: 0 }; }
      continue;
    }
    if (!t.vehicles.includes(lead) || lead.past > 0) break; // (after 12 s the leader edges past: the end of this test)
    for (const w of t.vehicles) {
      if (w === lead || w.cur.e !== lead.cur.e || w.cur.fwd !== lead.cur.fwd || w.s > lead.s) continue;
      const d = Math.hypot(w.x - lead.x, w.z - lead.z);
      min = Math.min(min, d);
      if (w.v < 0.1 && d < 12) queued++;
    }
  }
  assert.ok(lead && block, 'found a vehicle with another behind it');
  assert.ok(queued > 20, `a vehicle waited behind the stopped one (${queued} samples)`);
  assert.ok(min > 2.6, `the one behind never came closer than ${min.toFixed(2)} m (centre to centre)`);
});

test('a vehicle stops for a walker in its path and drives on when the way is clear', () => {
  const t = new Traffic(graph, flat());
  t.update(0.05, FX, FZ, { ...FILL, want: 1 }, [], true);
  let v = t.vehicles[0];
  for (let i = 0; i < 4000 && (!v || v.v < 5 || v.cur.len - v.s < 60 || v.why !== '' || Math.hypot(v.x - FX, v.z - FZ) > 150); i++) { t.update(0.05, FX, FZ, { ...FILL, want: 1 }); v = t.vehicles[0]; }
  assert.ok(v && v.v >= 5, 'a vehicle at speed on a long clear stretch');
  const P = { x: 0, z: 0, tx: 0, tz: 1 };
  t.pathPoint(v, 22, P);
  const walker: Obstacle = { x: P.x, z: P.z, r: 0.45, vx: 0, vz: 0 };
  let min = Infinity;
  for (let i = 0; i < 20 * 12; i++) { t.update(0.05, FX, FZ, { ...FILL, want: 1 }, [walker]); min = Math.min(min, Math.hypot(v.x - walker.x, v.z - walker.z)); }
  assert.ok(v.v < 0.05, `stands still (speed ${v.v.toFixed(2)})`);
  assert.ok(v.braking, 'brake lamps on');
  assert.ok(min > SIZE[v.kind].half + 0.8 && min < 9, `stopped ${min.toFixed(1)} m from the walker`);
  assert.equal(t.vehicles[0], v);
  for (let i = 0; i < 20 * 6; i++) t.update(0.05, FX, FZ, { ...FILL, want: 1 });
  assert.ok(v.v > 3, 'drives on');
});

test('vehicles wait at a red signal and cross on green', () => {
  const t = new Traffic(graph, flat(true));
  t.update(0.05, FX, FZ, FILL, [], true);
  let waited = 0, ranRed = 0, crossed = 0;
  const inside = new Map<number, [number, number]>();
  for (let i = 0; i < 20 * 150; i++) {
    t.update(0.05, FX, FZ, FILL);
    for (const v of t.vehicles) {
      if (v.why === 'signal' && v.v < 0.1) waited++;
      // crossing the stop line (7 m before the node) while the signal is red
      const n = v.cur.fwd ? graph.eb[v.cur.e] : graph.ea[v.cur.e];
      let deg = 0;
      for (const e of graph.edgesAt(n)) if (t.ok[e]) deg++;
      const d = v.cur.len - v.s, line = Math.min(7, v.cur.len * 0.4);
      // (one step ago it was before the line, on this same edge; now it is on or past it)
      const was = inside.get(v.id);
      // (a driver who could not stop at amber may cross in the first seconds of red; later than that is running the light)
      if (deg >= 3 && was !== undefined && was[0] === v.cur.e && was[1] > line && d <= line) { crossed++; if (t.signalState(n, v.cur.e) === 'red' && t.redFor > 3) ranRed++; }
      inside.set(v.id, [v.cur.e, d]);
    }
  }
  assert.ok(waited > 200, `vehicles stood at red for ${waited} samples`);
  assert.ok(crossed > 100, `${crossed} stop lines crossed`);
  assert.equal(ranRed, 0, 'no vehicle crossed a stop line at red');
  assert.equal(SIGNAL.cycle, 2 * (SIGNAL.green + SIGNAL.amber + 1));
});

test('the same seed gives the same traffic', () => {
  const run = () => { const t = new Traffic(graph, flat(), 7); t.update(0.05, FX, FZ, FILL, [], true); for (let i = 0; i < 400; i++) t.update(0.05, FX, FZ, FILL); return t.vehicles.map((v) => [v.id, v.kind, +v.x.toFixed(3), +v.z.toFixed(3)]); };
  assert.deepEqual(run(), run());
  assert.equal(KIND.kapcai, 3);
});
