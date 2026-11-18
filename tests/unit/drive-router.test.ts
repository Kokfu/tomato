// V8.4 GPS: driving-route tests against the generated car routing graph (drive-graph.json) and the chunk
// road data the world is built from (node --test). Includes the regression that routes never use
// pedestrian-only ways or join disconnected road pieces.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RouteGraph, isStoppingEdge, trimEndConnector, EDGE_ONEWAY } from '../../src/ui/Router.ts';
import type { GraphFile, Route } from '../../src/ui/Router.ts';
import { DRIVABLE_CLASSES } from '../../src/vehicle/RoadQuery.ts';
import { CAR_START } from '../../src/vehicle/VehiclePhysics.ts';
import { ROAD_TYPES } from '../../src/world/types.ts';
import type { ChunkData } from '../../src/world/types.ts';

const DATA = 'public/data/kuching';
const read = (f: string) => JSON.parse(readFileSync(`${DATA}/${f}`, 'utf8'));
const manifest = read('manifest.json');
const landmarks = read('landmarks.json') as { id: string; name: string; x: number; z: number }[];
const drive = new RouteGraph(read('drive-graph.json') as GraphFile);
const walk = new RouteGraph(read('graph.json') as GraphFile);
const CHUNK = manifest.chunkSize as number, Q = manifest.quant as number;
const lm = (id: string) => landmarks.find((l) => l.id === id)!;
const START_HEADING: [number, number] = [Math.sin(CAR_START.heading), Math.cos(CAR_START.heading)];
const driveTo = (x: number, z: number, id: string): Route | null =>
  drive.route(x, z, lm(id).x, lm(id).z, { maxSnapStart: 40, maxSnap: 400, endEdge: (e) => isStoppingEdge(drive, e), heading: START_HEADING });

/**
 * Pedestrian-only ways: the non-drivable pieces the world draws (chunk files) and the non-drivable edges of the
 * walking graph (built from every walkable OSM way, so it also holds Jalan India and the footbridges).
 */
const pedPieces: { id: number; type: string; name?: string; pts: number[] }[] = [];
for (const key of manifest.chunks as string[]) {
  const c = read(`chunks/${key}.json`) as ChunkData;
  const ox = c.cx * CHUNK, oz = c.cz * CHUNK;
  for (const r of c.roads) {
    const type = ROAD_TYPES[r.t];
    if (DRIVABLE_CLASSES.has(type) || type === 'stream' || type === 'rail') continue;
    pedPieces.push({ id: r.id, type, name: r.n !== undefined ? c.names[r.n] : undefined, pts: r.p.map((v, i) => (i % 2 ? oz : ox) + v / Q) });
  }
}
for (let e = 0; e < walk.edgeCount; e++) {
  const type = walk.typeOf(e);
  if (!DRIVABLE_CLASSES.has(type)) pedPieces.push({ id: -e, type, name: walk.nameOf(e), pts: walk.epts[e] });
}

/** True when a route polyline runs along (within `tol` m of) the middle of the given segment. */
function routeRunsAlong(route: Route, ax: number, az: number, bx: number, bz: number, tol = 0.6): boolean {
  const mx = (ax + bx) / 2, mz = (az + bz) / 2;
  const p = route.points;
  for (let i = 2; i < p.length; i += 2) {
    const x0 = p[i - 2], z0 = p[i - 1], vx = p[i] - x0, vz = p[i + 1] - z0, vv = vx * vx + vz * vz;
    const t = vv > 0 ? Math.max(0, Math.min(1, ((mx - x0) * vx + (mz - z0) * vz) / vv)) : 0;
    if (Math.hypot(mx - x0 - vx * t, mz - z0 - vz * t) < tol) return true;
  }
  return false;
}

test('drive graph holds only carriageway classes a car may use', () => {
  const types = new Set<string>();
  for (let e = 0; e < drive.edgeCount; e++) types.add(drive.typeOf(e));
  for (const t of types) assert.ok(DRIVABLE_CLASSES.has(t), `non-drivable class ${t} in the drive graph`);
  assert.equal(drive.profile, 'drive');
  // One-way data is present (Kuching's old town is largely one-way).
  let one = 0;
  for (let e = 0; e < drive.edgeCount; e++) if (drive.isOneWay(e)) one++;
  assert.ok(one > 1000, `only ${one} one-way edges`);
});

test('regression: no drive edge runs along a pedestrian-only way', () => {
  // Every segment midpoint of every pedestrian / footway / path / steps / cycleway / track / pier piece must be
  // off the drive network (a road may cross a footway at a shared node, but never run along it).
  const check = (graph: RouteGraph) => {
  let checked = 0;
  const along: string[] = [];
  for (const w of pedPieces) {
    for (let i = 2; i < w.pts.length; i += 2) {
      const ax = w.pts[i - 2], az = w.pts[i - 1], bx = w.pts[i], bz = w.pts[i + 1];
      if (Math.hypot(bx - ax, bz - az) < 2) continue;
      checked++;
      const s = graph.snap((ax + bx) / 2, (az + bz) / 2, 0.3);
      // Ignore a midpoint that merely sits on a road crossing it: the drive edge there must be parallel to count.
      for (const c of s) {
        const p = graph.epts[c.edge];
        let best = 0;
        for (let k = 2; k < p.length; k += 2) {
          const vx = p[k] - p[k - 2], vz = p[k + 1] - p[k - 1], l = Math.hypot(vx, vz) || 1;
          const ux = (bx - ax) / Math.hypot(bx - ax, bz - az), uz = (bz - az) / Math.hypot(bx - ax, bz - az);
          best = Math.max(best, Math.abs((vx * ux + vz * uz) / l));
        }
        if (best > 0.95) along.push(`${w.type} ${w.name ?? ''} way ${w.id}`);
      }
    }
  }
  return { checked, along: [...new Set(along)] };
  };
  const d = check(drive);
  assert.ok(d.checked > 4000, `checked ${d.checked}`);
  assert.deepEqual(d.along, []);
  // The same check finds the footways in the walking graph, so it is not vacuous.
  assert.ok(check(walk).along.length > 300);
});

test('routes avoid the Darul Hana footbridge and pedestrian lanes such as Indian Mosque Lane', () => {
  assert.ok(pedPieces.some((w) => w.name === 'Jambatan Darul Hana' && w.type === 'pedestrian'), 'Darul Hana is mapped as pedestrian');
  assert.ok(pedPieces.some((w) => w.name === 'Indian Mosque Lane' && w.type === 'footway'), 'Indian Mosque Lane is mapped as footway');
  for (let e = 0; e < drive.edgeCount; e++) {
    assert.notEqual(drive.nameOf(e), 'Indian Mosque Lane');
    assert.notEqual(drive.nameOf(e), 'Jambatan Darul Hana');
  }
  // Waterfront -> DUN: on foot the Darul Hana footbridge; by car the route must use a road bridge.
  const w = walk.route(lm('waterfront').x, lm('waterfront').z, lm('dun').x, lm('dun').z)!;
  const r = driveTo(lm('waterfront').x, lm('waterfront').z, 'dun')!;
  assert.ok(w && r, 'both routes exist');
  assert.ok(r.length > w.length * 3, `drive ${r.length.toFixed(0)} m vs walk ${w.length.toFixed(0)} m`);
  const bridges = r.edges.filter((e) => drive.isBridge(e)).map((e) => drive.nameOf(e));
  assert.ok(bridges.length > 0, 'crosses the river on a mapped road bridge');
  const india = pedPieces.filter((p) => p.name === 'Indian Mosque Lane' || p.name === 'Jambatan Darul Hana');
  for (const p of india) for (let i = 2; i < p.pts.length; i += 2) {
    assert.ok(!routeRunsAlong(r, p.pts[i - 2], p.pts[i - 1], p.pts[i], p.pts[i + 1]), `route runs along ${p.name}`);
  }
});

test('one-way edges are only travelled from node a to node b', () => {
  for (const id of ['waterfront', 'main-bazaar', 'lau-ya-keng-food-court', 'fort-margherita', 'dun']) {
    const r = driveTo(CAR_START.x, CAR_START.z, id);
    assert.ok(r, `route to ${id}`);
    // For every network segment on a one-way edge, the segment's direction must agree with the edge's a -> b direction.
    for (let i = 0; i < r!.segEdge.length; i++) {
      const e: number = r!.segEdge[i];
      if (e < 0 || !(drive.eflags[e] & EDGE_ONEWAY)) continue;
      const sx = r!.points[i * 2 + 2] - r!.points[i * 2], sz = r!.points[i * 2 + 3] - r!.points[i * 2 + 1];
      if (Math.hypot(sx, sz) < 0.5) continue;
      // Nearest edge segment direction.
      const p = drive.epts[e];
      const mx = r!.points[i * 2] + sx / 2, mz = r!.points[i * 2 + 1] + sz / 2;
      let best = Infinity, dot = 0;
      for (let k = 2; k < p.length; k += 2) {
        const vx = p[k] - p[k - 2], vz = p[k + 1] - p[k - 1], vv = vx * vx + vz * vz;
        const t = vv > 0 ? Math.max(0, Math.min(1, ((mx - p[k - 2]) * vx + (mz - p[k - 1]) * vz) / vv)) : 0;
        const d = Math.hypot(mx - p[k - 2] - vx * t, mz - p[k - 1] - vz * t);
        if (d < best) { best = d; dot = sx * vx + sz * vz; }
      }
      assert.ok(dot > 0, `${id}: one-way edge ${e} (${drive.nameOf(e)}) travelled against its direction`);
    }
  }
});

test('synthetic: one-way forces a detour, disconnected pieces never join, crossing ways without a node do not connect', () => {
  // Square a(0,0) b(100,0) c(100,100) d(0,100); a->b is one-way b->a only (stored a=1,b=0).
  // e(200,50)-f(300,50) is a separate piece crossing nothing; g(50,-50)-h(50,150) crosses a-b and c-d without shared nodes.
  const S = 10;
  const file: GraphFile = {
    v: 1, scale: S, bounds: { minX: -100, maxX: 400, minZ: -100, maxZ: 200 }, types: [...ROAD_TYPES], names: ['Oneway'],
    nodes: [0, 0, 100, 0, 100, 100, 0, 100, 200, 50, 300, 50, 50, -50, 50, 150].map((v) => v * S),
    edges: [
      1, 0, ROAD_TYPES.indexOf('residential'), EDGE_ONEWAY, 0, 0, // b -> a only
      1, 2, ROAD_TYPES.indexOf('residential'), 0, -1, 0,
      2, 3, ROAD_TYPES.indexOf('residential'), 0, -1, 0,
      3, 0, ROAD_TYPES.indexOf('residential'), 0, -1, 0,
      4, 5, ROAD_TYPES.indexOf('residential'), 0, -1, 0,
      6, 7, ROAD_TYPES.indexOf('residential'), 0, -1, 0,
    ],
    geom: [], ways: {}, profile: 'drive',
  };
  const g = new RouteGraph(file);
  // From near a to near b: must go a -> d -> c -> b (300 m), not along the one-way (100 m).
  const r = g.route(10, 0, 90, 0, { maxSnap: 1 })!;
  assert.ok(r, 'route exists');
  assert.ok(r.length > 250, `went against the one-way (${r.length.toFixed(0)} m)`);
  // From near b to near a: the one-way is allowed.
  assert.ok(g.route(90, 0, 10, 0, { maxSnap: 1 })!.length < 100);
  // Disconnected piece: no route.
  assert.equal(g.route(10, 0, 250, 50, { maxSnap: 1 }), null);
  // g-h crosses the square's edges geometrically but shares no node: no route from the square onto it.
  assert.equal(g.route(10, 0, 50, 140, { maxSnap: 1, endEdge: (e) => e === 5 }), null);
});

test('real data: a disconnected drive component is never routed to from the main network', () => {
  // Length per component; pick the largest component that is not the main one.
  const len = new Map<number, number>();
  for (let e = 0; e < drive.edgeCount; e++) len.set(drive.comp[drive.ea[e]], (len.get(drive.comp[drive.ea[e]]) ?? 0) + drive.elen[e]);
  const sorted = [...len.entries()].sort((a, b) => b[1] - a[1]);
  const [main] = sorted[0], [other] = sorted[1];
  let e2 = 0;
  while (drive.comp[drive.ea[e2]] !== other) e2++;
  const p = drive.epts[e2];
  const r = drive.route(CAR_START.x, CAR_START.z, p[0], p[1], { maxSnapStart: 40, maxSnap: 1, endEdge: (e) => drive.comp[drive.ea[e]] === other });
  assert.equal(r, null);
  assert.notEqual(main, other);
});

test('GPS destinations: all five reachable from the car spawn, ending on a public uncovered road', () => {
  for (const id of ['waterfront', 'main-bazaar', 'lau-ya-keng-food-court', 'fort-margherita', 'dun']) {
    const r = driveTo(CAR_START.x, CAR_START.z, id);
    assert.ok(r, `no route to ${id}`);
    assert.ok(isStoppingEdge(drive, r!.end.edge), `${id}: stops on ${drive.typeOf(r!.end.edge)}`);
    const { route, hop } = trimEndConnector(r!);
    assert.equal(route.segEdge[route.segEdge.length - 1] >= 0, true, 'trimmed route ends on the network');
    assert.ok(Math.abs(route.length + hop - r!.length) < 1e-6);
    assert.equal(route.maneuvers[route.maneuvers.length - 1].kind, 'arrive');
    assert.ok(route.maneuvers.every((m) => m.at <= route.length + 1e-6));
  }
});

test('heading preference: a moving car is not sent into a U-turn when the road ahead also leads there', () => {
  // On Jalan Main Bazaar (two directions of travel give different routes), compare the two headings.
  const x = 292.8, z = -25.8;
  const s = drive.snap(x, z, 5)[0];
  const t = drive.epts[s.edge];
  const dx = t[t.length - 2] - t[0], dz = t[t.length - 1] - t[1], l = Math.hypot(dx, dz);
  const a = drive.route(x, z, lm('waterfront').x, lm('waterfront').z, { maxSnapStart: 40, maxSnap: 400, heading: [dx / l, dz / l], uTurnCost: 1e6 });
  assert.ok(a, 'route along the direction of travel');
  // The first network segment leaves in the direction of travel.
  const i = a!.segEdge.findIndex((e) => e >= 0);
  const vx = a!.points[i * 2 + 2] - a!.points[i * 2], vz = a!.points[i * 2 + 3] - a!.points[i * 2 + 1];
  assert.ok(vx * dx + vz * dz >= 0);
});
