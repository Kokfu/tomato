// N2-M3 unit tests: per-approach signal poles, shared junction clock across split dual-carriageway nodes,
// `?inferredSignals=0` / `?signals=0` switches, roundabout `EDGE_ROUNDABOUT` priority (give-way),
// keep-left on 2+ lane one-way roads, and GPS routing clockwise round Kuching roundabouts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RouteGraph, EDGE_ONEWAY, EDGE_ROUNDABOUT, isStoppingEdge } from '../../src/ui/Router.ts';
import type { GraphFile } from '../../src/ui/Router.ts';
import { KIND, Traffic } from '../../src/life/traffic.ts';
import type { SignalSpec, TrafficHost, Vehicle } from '../../src/life/traffic.ts';
import { ROAD_TYPES, FURN } from '../../src/world/types.ts';
import type { ChunkData } from '../../src/world/types.ts';
import {
  ONE_CORRIDOR_SPREAD,
  SIGNAL_TIMING,
  axialDelta,
  crossCorridor,
  decodeSignalExtra,
  encodeSignalExtra,
  inferredSignalsEnabled,
  junctionSignalAt,
  setInferredSignals,
  setSignals,
  signalPhaseGroup,
  signalsEnabled,
} from '../../src/world/signalsFlag.ts';
import type { SignalsFile } from '../../src/world/signalsFlag.ts';

const DATA = 'public/data/kuching';
const drive = new RouteGraph(JSON.parse(readFileSync(`${DATA}/drive-graph.json`, 'utf8')) as GraphFile);
const signalsFile = JSON.parse(readFileSync(`${DATA}/signals.json`, 'utf8')) as SignalsFile;
const manifest = JSON.parse(readFileSync(`${DATA}/manifest.json`, 'utf8'));

test('signals.json covers mapped & inferred junctions with multi-approach poles encoded in chunks', () => {
  const mapped = signalsFile.junctions.filter((j) => !j.inferred);
  const inferred = signalsFile.junctions.filter((j) => j.inferred);
  assert.ok(mapped.length >= 44, `expected >= 44 mapped signal junctions, got ${mapped.length}`);
  assert.ok(inferred.length >= 10, `expected >= 10 inferred main-road junctions, got ${inferred.length}`);

  // Openg x Badruddin x Taman Budaya (4 mapped OSM signal nodes) shares ONE junction id and 4 approaches.
  const openg = mapped.find((j) => j.osmSignalNodes.includes(822594941));
  assert.ok(openg, 'Openg x Badruddin signal junction exists');
  assert.equal(openg!.osmSignalNodes.length, 4);
  assert.ok(openg!.approaches >= 4, `expected >= 4 approach poles at Openg x Badruddin, got ${openg!.approaches}`);

  // Verify chunk `furn` holds both legacy (`extra === 0` for ?signals=0) and N2-M3 (`extra >= 1`) signal poles.
  let legacyPoles = 0, m3MappedPoles = 0, m3InferredPoles = 0, mastPoles = 0;
  for (const key of manifest.chunks as string[]) {
    const c = JSON.parse(readFileSync(`${DATA}/chunks/${key}.json`, 'utf8')) as ChunkData;
    const f = c.furn ?? [];
    for (let i = 0; i < f.length; i += 5) {
      if (f[i] !== FURN.signal) continue;
      const dec = decodeSignalExtra(f[i + 4]);
      if (!dec) legacyPoles++;
      else {
        const roundTrip = decodeSignalExtra(encodeSignalExtra(dec))!;
        assert.deepEqual(roundTrip, dec);
        if (dec.inferred) m3InferredPoles++; else m3MappedPoles++;
        if (dec.wide) mastPoles++;
      }
    }
  }
  assert.ok(legacyPoles >= 100, `legacy poles preserved for ?signals=0 (${legacyPoles})`);
  assert.ok(m3MappedPoles >= 165, `per-approach mapped poles (${m3MappedPoles})`);
  assert.ok(m3InferredPoles >= 35, `per-approach inferred poles (${m3InferredPoles})`);
  assert.ok(mastPoles >= 10, `wide multi-lane approaches get overhead mast-arm repeaters (${mastPoles})`);
});

test('crossing roads never share a green: skewed crossroads get two phases, one-corridor crossings one', () => {
  // Phase split by nearest corridor: a road crossing at 41 degrees is still the other phase.
  const deg = (d: number) => (d * Math.PI) / 180;
  assert.equal(signalPhaseGroup(deg(113), deg(72), deg(113)), 1);
  assert.equal(signalPhaseGroup(deg(65), deg(72), deg(113)), 0);
  assert.equal(signalPhaseGroup(deg(252), deg(72), deg(113)), 0);
  assert.ok(Math.abs(crossCorridor([deg(10), deg(190)], deg(10)) - deg(100)) < 1e-9, 'one corridor: cross is the perpendicular');
  // Every pole's group must match what traffic on that approach is told (pole bearing vs refDeg / crossDeg).
  const groups = new Map<number, Set<number>>();
  for (const key of manifest.chunks as string[]) {
    const f = (JSON.parse(readFileSync(`${DATA}/chunks/${key}.json`, 'utf8')) as ChunkData).furn ?? [];
    for (let i = 0; i < f.length; i += 5) {
      const dec = f[i] === FURN.signal ? decodeSignalExtra(f[i + 4]) : null;
      if (!dec) continue;
      if (!groups.has(dec.jctId)) groups.set(dec.jctId, new Set());
      groups.get(dec.jctId)!.add(dec.group);
      const j = signalsFile.junctions.find((jj) => jj.id === dec.jctId)!;
      const bearing = (f[i + 3] * Math.PI) / 180;
      assert.equal(signalPhaseGroup(bearing, deg(j.refDeg), deg(j.crossDeg!)), dec.group, `pole group at junction ${j.id} (${j.roads.join(' / ')})`);
    }
  }
  // Padungan x Datuk Abang Abdul Rahim and Mendu x Sekama cross at about 40-50 degrees.
  for (const names of [['Jalan Padungan', 'Jalan Datuk Abang Abdul Rahim'], ['Jalan Mendu', 'Jalan Sekama']]) {
    const j = signalsFile.junctions.find((jj) => names.every((n) => jj.roads.includes(n)) && jj.approaches >= 4)!;
    assert.ok(j, `junction ${names.join(' x ')}`);
    assert.deepEqual([...groups.get(j.id)!].sort(), [0, 1], `${names.join(' x ')} has two phases`);
  }
  for (const j of signalsFile.junctions) {
    assert.equal(typeof j.crossDeg, 'number', `junction ${j.id} has crossDeg`);
    if (axialDelta(deg(j.refDeg), deg(j.crossDeg!)) >= ONE_CORRIDOR_SPREAD && j.approaches >= 3) {
      assert.deepEqual([...groups.get(j.id)!].sort(), [0, 1], `junction ${j.id} (${j.roads.join(' / ')}) crosses two corridors but has one phase`);
    }
  }
});

test('all nodes of a split dual-carriageway signal junction cycle synchronously on one timer; ?inferredSignals=0 disables inferred ones', () => {
  const makeHost = (): TrafficHost => ({
    ground: () => 0,
    loaded: () => true,
    width: () => 9.9,
    signal: () => false,
    signalSpec: (x, z): SignalSpec | false => {
      if (!signalsEnabled()) return false;
      const allowInf = inferredSignalsEnabled();
      for (const j of signalsFile.junctions) {
        if (j.inferred && !allowInf) continue;
        for (const [nx, nz] of j.nodes) {
          if (Math.hypot(nx - x, nz - z) < 2.8) return { jctId: j.id, refAngle: (j.refDeg * Math.PI) / 180, crossAngle: (j.crossDeg! * Math.PI) / 180 };
        }
      }
      return false;
    },
  });

  setSignals(true);
  setInferredSignals(true);
  const tAll = new Traffic(drive, makeHost());

  // Openg x Badruddin: northbound and southbound approaches arrive at DIFFERENT graph nodes, yet turn green/amber/red together,
  // while Badruddin/Taman Budaya cross-approaches are red while Openg is green.
  const openg = signalsFile.junctions.find((j) => j.osmSignalNodes.includes(822594941))!;
  const jctGraphNodes: number[] = [];
  for (let n = 0; n < drive.nodeCount; n++) {
    if (openg.nodes.some(([nx, nz]) => Math.hypot(nx - drive.nx[n], nz - drive.nz[n]) < 2.8)) jctGraphNodes.push(n);
  }
  assert.equal(jctGraphNodes.length, 4, 'all 4 split dual-carriageway nodes matched in drive-graph');

  for (let sec = 0; sec < SIGNAL_TIMING.cycle; sec += 1) {
    tAll.time = sec + 0.25;
    const g0 = junctionSignalAt(tAll.time, openg.id, 0).state;
    const g1 = junctionSignalAt(tAll.time, openg.id, 1).state;
    if (g0 === 'green') assert.equal(g1, 'red');
    if (g1 === 'green') assert.equal(g0, 'red');
    for (const n of jctGraphNodes) {
      for (const e of drive.edgesAt(n)) {
        if (!tAll.ok[e]) continue;
        const p = drive.epts[e];
        const atStart = drive.ea[e] === n;
        const dx = atStart ? p[2] - p[0] : p[p.length - 4] - p[p.length - 2];
        const dz = atStart ? p[3] - p[1] : p[p.length - 3] - p[p.length - 1];
        const grp = signalPhaseGroup(Math.atan2(dx, dz), (openg.refDeg * Math.PI) / 180, (openg.crossDeg! * Math.PI) / 180);
        assert.equal(tAll.signalState(n, e), grp === 0 ? g0 : g1);
      }
    }
  }

  // Switching `?inferredSignals=0` turns inferred crossroads back into unsignalized priority junctions while keeping mapped ones.
  const inf = signalsFile.junctions.find((j) => j.inferred)!;
  let infNode = -1;
  for (let n = 0; n < drive.nodeCount; n++) {
    if (inf.nodes.some(([nx, nz]) => Math.hypot(nx - drive.nx[n], nz - drive.nz[n]) < 2.8)) { infNode = n; break; }
  }
  assert.ok(infNode >= 0, 'inferred junction node found in drive-graph');
  const infEdge = drive.edgesAt(infNode)[0];

  let sawRedInfAll = false;
  for (let sec = 0; sec < SIGNAL_TIMING.cycle; sec++) {
    tAll.time = sec + 0.5;
    if (tAll.signalState(infNode, infEdge) === 'red') sawRedInfAll = true;
  }

  setInferredSignals(false);
  const tMappedOnly = new Traffic(drive, makeHost());
  let sawRedInfOff = false, sawRedMappedOff = false;
  const opengEdge = drive.edgesAt(jctGraphNodes[0])[0];
  for (let sec = 0; sec < SIGNAL_TIMING.cycle; sec++) {
    tMappedOnly.time = sec + 0.5;
    if (tMappedOnly.signalState(infNode, infEdge) === 'red') sawRedInfOff = true;
    if (tMappedOnly.signalState(jctGraphNodes[0], opengEdge) === 'red') sawRedMappedOff = true;
  }
  assert.equal(sawRedInfAll, true, 'inferred junction cycles to red when inferredSignals=1');
  assert.equal(sawRedInfOff, false, 'inferred junction stays unsignalized when inferredSignals=0');
  assert.equal(sawRedMappedOff, true, 'mapped junction still cycles to red when inferredSignals=0');

  setSignals(null);
  setInferredSignals(null);
});

test('roundabout priority: entry vehicle gives way to circulating vehicle regardless of road class, and multi-lane one-ways keep left', () => {
  // Synthetic clockwise roundabout (primary ring) entered by a trunk road (higher road class than the ring!):
  // Under Night 1 class-rank rules the ring yielded to the trunk entry; under N2-M3 the trunk entry yields to the ring!
  const S = 10;
  // Clockwise ring in (+x east, +z south): N(0,-25) -> E(25,0) -> S(0,25) -> W(-25,0) -> N(0,-25).
  // Trunk entry from North-West (-5, -85) -> N(0, -25); Trunk exit from S(0, 25) -> (5, 85); W exit (-25,0) -> (-85,0).
  const file: GraphFile = {
    v: 1,
    scale: S,
    bounds: { minX: -120, maxX: 120, minZ: -120, maxZ: 120 },
    types: [...ROAD_TYPES],
    names: ['Ring', 'TrunkArm'],
    nodes: [
      0, -25,   // 0: N (entry)
      25, 0,    // 1: E
      0, 25,    // 2: S (exit)
      -25, 0,   // 3: W
      -5, -85,  // 4: N approach start
      5, 85,    // 5: S exit end
      -85, 0,   // 6: W approach start
    ].map((v) => v * S),
    edges: [
      0, 1, ROAD_TYPES.indexOf('primary'), EDGE_ONEWAY | EDGE_ROUNDABOUT, 0, 0,
      1, 2, ROAD_TYPES.indexOf('primary'), EDGE_ONEWAY | EDGE_ROUNDABOUT, 0, 0,
      2, 3, ROAD_TYPES.indexOf('primary'), EDGE_ONEWAY | EDGE_ROUNDABOUT, 0, 0,
      3, 0, ROAD_TYPES.indexOf('primary'), EDGE_ONEWAY | EDGE_ROUNDABOUT, 0, 0,
      4, 0, ROAD_TYPES.indexOf('trunk'), EDGE_ONEWAY, 1, 0,
      2, 5, ROAD_TYPES.indexOf('trunk'), EDGE_ONEWAY, 1, 0,
      6, 3, ROAD_TYPES.indexOf('trunk'), EDGE_ONEWAY, 1, 0,
      1, 4, ROAD_TYPES.indexOf('primary'), EDGE_ONEWAY, 1, 0,
      5, 6, ROAD_TYPES.indexOf('trunk'), EDGE_ONEWAY, 1, 0,
    ],
    geom: [],
    ways: {},
    profile: 'drive',
  };
  const g = new RouteGraph(file);
  const t = new Traffic(g, { ground: () => 0, loaded: () => true, width: () => 6.8, signal: () => false }, 42);
  assert.equal(t.nRoundabout[0], 1);

  // Keep-left on a 6.8 m 2-lane one-way edge: offset > 1.5 m left of centreline.
  assert.ok(t.laneOffset(0, KIND.hatch) > 1.5, `expected keep-left offset > 1.5 m on 6.8 m one-way, got ${t.laneOffset(0, KIND.hatch)}`);

  // Place circulating vehicle `ringCar` on edge 3 (W -> N, 18 m from node 0) and approaching trunk vehicle `entryCar` on edge 4 (12 m from node 0).
  const mkVeh = (id: number, e: number, nextE: number, s: number, v: number): Vehicle => ({
    id, kind: KIND.hatch, tint: 0, prev: null,
    cur: { e, fwd: true, off: t.laneOffset(e, KIND.hatch), len: g.elen[e] },
    next: { e: nextE, fwd: true, off: t.laneOffset(nextE, KIND.hatch), len: g.elen[nextE] },
    s, v, pace: 1, x: 0, y: 0, z: 0, heading: 0, pitch: 0, gy: 0, gp: 0, braking: false, cap: v, since: 0.1,
    why: '', stuck: 0, ghost: 0, blocker: 0, waited: 0, held: 0, past: 0, holds: -1, dead: false, halt: 0, horn: -1,
  });
  const ringCar = mkVeh(1, 3, 0, g.elen[3] - 18, 8);
  const entryCar = mkVeh(2, 4, 0, g.elen[4] - 12, 8);
  t.vehicles.push(ringCar, entryCar);

  t.update(0.05, 0, 0, { want: 2, rMin: 200, rMax: 250, far: 500, kinds: [1, 0, 0, 0], tints: 1 });
  assert.equal(entryCar.why, 'yield', 'trunk road entry gives way to primary roundabout ring');
  assert.notEqual(ringCar.why, 'yield', 'circulating roundabout vehicle keeps right-of-way');
  assert.ok(entryCar.cap < ringCar.cap, 'entry car brakes while ring car proceeds');
});

test('a junction box stops traffic at its first node on red, even where that node only splits the road, and never inside it', () => {
  // W(0,-100) -> X(0,-12): X only splits the road (two edges) but belongs to the junction; X -> A(0,0) is inside the
  // box; A is the crossing with E(100,0); A -> S(0,100) leaves it. All one-way, north to south.
  const S = 10;
  const file: GraphFile = {
    v: 1, scale: S, bounds: { minX: -200, maxX: 200, minZ: -200, maxZ: 200 }, types: [...ROAD_TYPES], names: ['Main', 'Cross'],
    nodes: [0, -100, 0, -12, 0, 0, 100, 0, 0, 100].map((v) => v * S),
    edges: [
      0, 1, ROAD_TYPES.indexOf('primary'), EDGE_ONEWAY, 0, 0,
      1, 2, ROAD_TYPES.indexOf('primary'), EDGE_ONEWAY, 0, 0,
      2, 4, ROAD_TYPES.indexOf('primary'), EDGE_ONEWAY, 0, 0,
      3, 2, ROAD_TYPES.indexOf('secondary'), EDGE_ONEWAY, 1, 0,
    ],
    geom: [], ways: {}, profile: 'drive',
  };
  const g = new RouteGraph(file);
  const box = (x: number, z: number): SignalSpec | false =>
    Math.hypot(x, z) < 13 ? { jctId: 0, refAngle: 0, crossAngle: Math.PI / 2 } : false;
  const t = new Traffic(g, { ground: () => 0, loaded: () => true, width: () => 6.8, signal: () => false, signalSpec: box }, 7);
  // Main road (north-south, group 0) red: at 20 s it has been red for 3 s.
  t.time = 20;
  assert.equal(junctionSignalAt(t.time, 0, 0).state, 'red');
  const mk = (id: number, e: number, nextE: number, s: number): Vehicle => ({
    id, kind: KIND.hatch, tint: 0, prev: null,
    cur: { e, fwd: true, off: t.laneOffset(e, KIND.hatch), len: g.elen[e] },
    next: { e: nextE, fwd: true, off: t.laneOffset(nextE, KIND.hatch), len: g.elen[nextE] },
    s, v: 8, pace: 1, x: 0, y: 0, z: 0, heading: 0, pitch: 0, gy: 0, gp: 0, braking: false, cap: 8, since: 0.1,
    why: '', stuck: 0, ghost: 0, blocker: 0, waited: 0, held: 0, past: 0, holds: -1, dead: false, halt: 0, horn: -1,
  });
  const arriving = mk(1, 0, 1, g.elen[0] - 20), inside = mk(2, 1, 2, 2);
  t.vehicles.push(arriving, inside);
  t.update(0.05, 0, 0, { want: 2, rMin: 900, rMax: 950, far: 2000, kinds: [1, 0, 0, 0], tints: 1 });
  assert.equal(arriving.why, 'signal', 'the car reaching the split node X on red stops there');
  assert.notEqual(inside.why, 'signal', 'a car already inside the box clears the junction');
});

test('drive-graph marks real Kuching roundabouts with EDGE_ROUNDABOUT | EDGE_ONEWAY and GPS routes traverse them clockwise', () => {
  let rbEdges = 0;
  for (let e = 0; e < drive.edgeCount; e++) {
    if (drive.isRoundabout(e)) {
      rbEdges++;
      assert.equal(drive.isOneWay(e), true, `roundabout edge ${e} must also be one-way`);
    }
  }
  assert.ok(rbEdges >= 120, `expected >= 120 roundabout edges in drive-graph, got ${rbEdges}`);

  // Pick a real roundabout edge in drive-graph (e.g. Bulatan Datuk Patinggi Abang Haji Abdillah / Ong Kee Hui / Padungan)
  // and route from an incoming non-roundabout edge across 2+ roundabout segments to an outgoing non-roundabout edge.
  let rbSample = -1;
  for (let e = 0; e < drive.edgeCount; e++) {
    if (drive.isRoundabout(e) && drive.elen[e] > 15 && drive.elen[e] < 120) { rbSample = e; break; }
  }
  assert.ok(rbSample >= 0, 'found sample roundabout edge');
  // Compute centroid of all connected roundabout nodes in this roundabout ring.
  const ringNodes = new Set<number>([drive.ea[rbSample], drive.eb[rbSample]]);
  const q = [drive.ea[rbSample], drive.eb[rbSample]];
  while (q.length) {
    const u = q.pop()!;
    for (const oe of drive.edgesAt(u)) {
      if (!drive.isRoundabout(oe)) continue;
      for (const v of [drive.ea[oe], drive.eb[oe]]) if (!ringNodes.has(v)) { ringNodes.add(v); q.push(v); }
    }
  }
  let cx = 0, cz = 0;
  for (const n of ringNodes) { cx += drive.nx[n]; cz += drive.nz[n]; }
  cx /= ringNodes.size; cz /= ringNodes.size;

  // Route from the start of rbSample clockwise to the end of the next roundabout segment along the ring.
  let nextRb = -1;
  for (const oe of drive.edgesAt(drive.eb[rbSample])) {
    if (drive.isRoundabout(oe) && drive.ea[oe] === drive.eb[rbSample]) { nextRb = oe; break; }
  }
  assert.ok(nextRb >= 0, 'connected next clockwise roundabout segment exists');
  const sx = drive.nx[drive.ea[rbSample]], sz = drive.nz[drive.ea[rbSample]];
  const dx = drive.nx[drive.eb[nextRb]], dz = drive.nz[drive.eb[nextRb]];
  const route = drive.route(sx, sz, dx, dz, { maxSnap: 5 });
  assert.ok(route !== null, 'GPS route on roundabout exists');
  const usedRb = route.edges.filter((e) => drive.isRoundabout(e));
  assert.ok(usedRb.length >= 2, `GPS route uses >= 2 clockwise roundabout edges, got ${usedRb.length}`);

  // Verify every roundabout segment on the route moves clockwise around `(cx, cz)` in (+x east, +z south):
  // `(px - cx) * vz - (pz - cz) * vx > 0` for clockwise motion!
  const pts: number[] = route.points;
  let cwSegs = 0;
  for (let i = 0; i < route.segEdge.length; i++) {
    const e = route.segEdge[i];
    if (e < 0 || !drive.isRoundabout(e)) continue;
    const x0 = pts[i * 2], z0 = pts[i * 2 + 1], x1 = pts[i * 2 + 2], z1 = pts[i * 2 + 3];
    const vx = x1 - x0, vz = z1 - z0;
    if (Math.hypot(vx, vz) < 0.5) continue;
    const cross = (x0 - cx) * vz - (z0 - cz) * vx;
    assert.ok(cross > 0, `roundabout segment moved anti-clockwise (cross=${cross.toFixed(2)})`);
    cwSegs++;
  }
  assert.ok(cwSegs >= 2, `verified ${cwSegs} clockwise roundabout segments on GPS route`);
});
