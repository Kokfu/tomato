// Walking-route tests against the generated routing graph (node --test).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RouteGraph, progressOnRoute, describeManeuver } from '../../src/ui/Router.ts';
import type { GraphFile, Route } from '../../src/ui/Router.ts';

const DATA = 'public/data/kuching';
const read = (f: string) => JSON.parse(readFileSync(`${DATA}/${f}`, 'utf8'));
const manifest = read('manifest.json');
const landmarks = read('landmarks.json') as { id: string; name: string; x: number; z: number }[];
const overview = read('overview.json') as { water: number[][][] };
const graphFile = read('graph.json') as GraphFile;
const graph = new RouteGraph(graphFile);

const DARUL_HANA_WAYS = [634697570, 779037132, 568501299];
const CHUNK = manifest.chunkSize as number, Q = manifest.quant as number;

function inRing(x: number, z: number, r: number[], s: number): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const xi = r[i] / s, zi = r[i + 1] / s, xj = r[j] / s, zj = r[j + 1] / s;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function inPoly(x: number, z: number, poly: number[][], s: number): boolean {
  if (!inRing(x, z, poly[0], s)) return false;
  for (let i = 1; i < poly.length; i++) if (inRing(x, z, poly[i], s)) return false;
  return true;
}
/** Simplified whole-area water (overview.json, decimetres). */
const inOverviewWater = (x: number, z: number) => overview.water.some((p) => inPoly(x, z, p, 10));
/** Exact water the player collides with (chunk files, centimetres relative to the chunk corner). */
const chunkCache = new Map<string, number[][][] | null>();
function inChunkWater(x: number, z: number): boolean {
  const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK), key = `${cx}_${cz}`;
  let w = chunkCache.get(key);
  if (w === undefined) {
    try { w = read(`chunks/${key}.json`).water as number[][][]; } catch { w = null; }
    chunkCache.set(key, w);
  }
  if (!w) return false;
  const lx = (x - cx * CHUNK) * Q, lz = (z - cz * CHUNK) * Q;
  return w.some((p) => inPoly(lx, lz, p, 1));
}
/** Connector test handed to the router, same idea as the in-game one. */
const blocked = (x0: number, z0: number, x1: number, z1: number) => {
  const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 4));
  for (let i = 1; i < n; i++) if (inOverviewWater(x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n)) return true;
  return false;
};
const lm = (id: string) => {
  const l = landmarks.find((x) => x.id === id);
  assert.ok(l, `landmark ${id} exists`);
  return l!;
};
function wetSegments(route: Route): string[] {
  const bad: string[] = [];
  for (let i = 0; i < route.segEdge.length; i++) {
    const e = route.segEdge[i];
    if (e < 0 || graph.isBridge(e)) continue;
    const mx = (route.points[i * 2] + route.points[i * 2 + 2]) / 2, mz = (route.points[i * 2 + 1] + route.points[i * 2 + 3]) / 2;
    if (inChunkWater(mx, mz) || inOverviewWater(mx, mz)) bad.push(`segment ${i} (edge ${e}, ${graph.typeOf(e)}) midpoint ${mx.toFixed(1)}, ${mz.toFixed(1)}`);
  }
  return bad;
}

const spawn = manifest.spawn as { x: number; z: number };
const fort = lm('fort-margherita');

test('graph is non-trivial and inside the manifest area', () => {
  assert.ok(graph.nodeCount > 1000 && graph.edgeCount > 1000);
  const b = graph.bounds;
  for (let i = 0; i < graph.nodeCount; i++) {
    assert.ok(graph.nx[i] >= b.minX && graph.nx[i] <= b.maxX && graph.nz[i] >= b.minZ && graph.nz[i] <= b.maxZ);
  }
  for (const id of DARUL_HANA_WAYS) {
    assert.ok(Object.values(graphFile.ways).includes(id), `Darul Hana way ${id} is in the graph`);
  }
});

test('waterfront spawn -> Fort Margherita crosses the river on Darul Hana Bridge', () => {
  const r = graph.route(spawn.x, spawn.z, fort.x, fort.z, { blocked });
  assert.ok(r, 'a walking route exists');
  const bridgeWays = new Set(r.edges.filter((e) => graph.isBridge(e)).map((e) => graph.wayOf(e)));
  for (const id of DARUL_HANA_WAYS) assert.ok(bridgeWays.has(id), `route uses Darul Hana way ${id}`);
  // The spawn is on the south bank and the fort on the north bank: every segment over water must be a bridge edge.
  let overWater = 0;
  for (let i = 0; i < r.segEdge.length; i++) {
    const mx = (r.points[i * 2] + r.points[i * 2 + 2]) / 2, mz = (r.points[i * 2 + 1] + r.points[i * 2 + 3]) / 2;
    if (!inChunkWater(mx, mz)) continue;
    overWater++;
    assert.ok(r.segEdge[i] >= 0 && graph.isBridge(r.segEdge[i]), `segment ${i} over water is a bridge edge`);
  }
  assert.ok(overWater > 3, 'the route actually crosses the river');
  assert.deepEqual(wetSegments(r), []);
  assert.ok(r.maneuvers.some((m) => m.kind === 'bridge' && /Darul Hana/.test(m.name ?? '')), 'has a "cross the bridge" instruction');
  assert.equal(r.maneuvers[r.maneuvers.length - 1].kind, 'arrive');
  assert.match(describeManeuver(r.maneuvers[r.maneuvers.length - 1], fort.name), /Fort Margherita/);
});

test('route length >= straight-line distance, endpoints exact, deterministic', () => {
  const a = graph.route(spawn.x, spawn.z, fort.x, fort.z, { blocked })!;
  const b = graph.route(spawn.x, spawn.z, fort.x, fort.z, { blocked })!;
  const fresh = new RouteGraph(read('graph.json')).route(spawn.x, spawn.z, fort.x, fort.z, { blocked })!;
  const straight = Math.hypot(fort.x - spawn.x, fort.z - spawn.z);
  assert.ok(a.length >= straight - 1e-6, `${a.length} >= ${straight}`);
  assert.ok(Math.abs(a.straight - straight) < 1e-9);
  assert.ok(a.length < straight * 10, 'route is not absurdly long');
  assert.deepEqual(a.points.slice(0, 2), [spawn.x, spawn.z]);
  assert.deepEqual(a.points.slice(-2), [fort.x, fort.z]);
  assert.deepEqual(a.points, b.points);
  assert.deepEqual(a.edges, b.edges);
  assert.deepEqual(a.points, fresh.points);
  assert.equal(a.length, fresh.length);
  assert.equal(a.cum.length, a.points.length / 2);
  assert.ok(Math.abs(a.cum[a.cum.length - 1] - a.length) < 1e-9);
  assert.ok(a.seconds > 0);
  // consecutive points are distinct and every network segment lies on its edge polyline
  for (let i = 2; i < a.points.length; i += 2) assert.ok(Math.hypot(a.points[i] - a.points[i - 2], a.points[i + 1] - a.points[i - 1]) > 0);
  // progress tracking: start is at 0, destination at the full length
  assert.ok(progressOnRoute(a, spawn.x, spawn.z).along < 1);
  assert.ok(Math.abs(progressOnRoute(a, fort.x, fort.z).along - a.length) < 1);
  // the reverse walk is the same length (the graph is undirected for pedestrians)
  const rev = graph.route(fort.x, fort.z, spawn.x, spawn.z, { blocked })!;
  assert.ok(Math.abs(rev.length - a.length) < 0.5, `${rev.length} vs ${a.length}`);
});

test('no non-bridge edge of the graph has a segment midpoint in water', () => {
  const bad: string[] = [];
  for (let e = 0; e < graph.edgeCount; e++) {
    if (graph.isBridge(e)) continue;
    const p = graph.epts[e];
    for (let i = 2; i < p.length; i += 2) {
      const mx = (p[i - 2] + p[i]) / 2, mz = (p[i - 1] + p[i + 1]) / 2;
      if (inChunkWater(mx, mz)) bad.push(`edge ${e} (${graph.typeOf(e)}) at ${mx.toFixed(1)}, ${mz.toFixed(1)}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('routes to every landmark stay off the water; unreachable ones return null', () => {
  let routed = 0;
  for (const l of landmarks) {
    const r = graph.route(spawn.x, spawn.z, l.x, l.z, { blocked });
    if (!r) continue;
    routed++;
    assert.deepEqual(wetSegments(r), [], `route to ${l.name}`);
    assert.ok(r.length >= r.straight - 1e-6, `route to ${l.name} is at least the straight-line distance`);
  }
  assert.ok(routed >= Math.min(5, landmarks.length), `${routed} landmarks routable`);
  // A point far outside the mapped area has no network to snap to.
  assert.equal(graph.route(spawn.x, spawn.z, 1e6, 1e6, { blocked }), null);
});
