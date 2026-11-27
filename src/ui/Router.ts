// Routing core (pedestrian graph.json and, since V8.4, the car's drive-graph.json): graph decoding,
// nearest-edge snapping, A* (one-way aware) and turn hints.
// Pure TypeScript with no DOM or three.js dependency, so the browser, the offline graph builder
// (tools/generate-world/build-graph.ts) and the Node unit tests all import this same module.
// The graph itself is generated offline from OpenStreetMap ways; nothing here invents geometry.

export const GRAPH_VERSION = 1;
/** Graph coordinates are integers in 1/GRAPH_SCALE metres (decimetres), world frame (+x east, +z south). */
export const GRAPH_SCALE = 10;

/** On-disk format of public/data/kuching/graph.json. */
export interface GraphFile {
  v: number;
  scale: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Road type names; edge `t` indexes this list (same order as ROAD_TYPES). */
  types: string[];
  names: string[];
  /** Junction / end nodes: [x0, z0, x1, z1, ...]. */
  nodes: number[];
  /** Six integers per edge: node a, node b, type index, flags, name index (-1 = unnamed), shape-vertex count. */
  edges: number[];
  /** Shape vertices of all edges in edge order, each delta-coded from the previous point (starting at node a). */
  geom: number[];
  /** OSM way id of bridge / pier edges, keyed by edge index. */
  ways: Record<string, number>;
  /** 'drive' for the car graph (drive-graph.json, V8.4); absent for the pedestrian graph. */
  profile?: string;
}

/** Edge flag: bridge or pier - the only edges allowed over water. */
export const EDGE_BRIDGE = 1;
/** Edge flag: tunnel or covered way. */
export const EDGE_TUNNEL = 2;
/** Edge flag (drive graph): one-way, travel only from node a to node b. */
export const EDGE_ONEWAY = 4;
/** Edge flag (drive graph, N2-M3): roundabout / circular junction ring (circulating traffic has priority). */
export const EDGE_ROUNDABOUT = 8;

/** Real-world walking pace used for time estimates (m/s). */
export const WALK_SPEED = 1.35;

/** Cost multiplier per road type (>= 1 so straight-line distance stays an admissible heuristic). */
const WALK_COST: Record<string, number> = {
  motorway: 4, trunk: 1.5, primary: 1.4, secondary: 1.25, tertiary: 1.15, residential: 1.05, service: 1.1,
  pedestrian: 1, footway: 1, path: 1, steps: 1.15, cycleway: 1.05, track: 1.1, pier: 1,
};
/** Drive profile: prefer through roads to lanes and driveways (all >= 1, as above). */
const DRIVE_COST: Record<string, number> = {
  motorway: 1, trunk: 1, primary: 1, secondary: 1.05, tertiary: 1.1, residential: 1.25, service: 1.8,
};

export interface Snap {
  edge: number;
  /** Distance along the edge from node a (metres). */
  offset: number;
  x: number;
  z: number;
  /** Straight-line distance from the query point (metres). */
  dist: number;
  component: number;
}

export type ManeuverKind = 'depart' | 'left' | 'right' | 'slight-left' | 'slight-right' | 'sharp-left' | 'sharp-right' | 'straight' | 'bridge' | 'arrive';
export interface Maneuver {
  kind: ManeuverKind;
  /** Distance from the start of the route (metres). */
  at: number;
  /** Street / bridge name when mapped. */
  name?: string;
}

export interface Route {
  /** Polyline [x0, z0, x1, z1, ...] in world metres, from the start point to the destination point. */
  points: number[];
  /** Per polyline segment: graph edge index, or -1 for the off-network connector at either end. */
  segEdge: number[];
  /** Cumulative distance at each polyline point (metres). */
  cum: number[];
  /** Total length including the connectors (metres). */
  length: number;
  /** Length walked on mapped ways (metres). */
  networkLength: number;
  /** Estimated walking time (seconds) at WALK_SPEED. */
  seconds: number;
  /** Straight-line distance start -> destination (metres). */
  straight: number;
  start: Snap;
  end: Snap;
  /** Graph edges in travel order. */
  edges: number[];
  maneuvers: Maneuver[];
}

export interface RouteOptions {
  /** Maximum straight-line distance from a point to the network (metres). Default 220. */
  maxSnap?: number;
  /** Return true when the straight connector between an off-network point and the network is not walkable (e.g. crosses water). */
  blocked?: (x0: number, z0: number, x1: number, z1: number) => boolean;
  /** Maximum distance from the start point to the network (default maxSnap). */
  maxSnapStart?: number;
  /** Direction of travel at the start (unit x, z). Setting off the other way costs `uTurnCost` metres. */
  heading?: [number, number];
  uTurnCost?: number;
  /** Edges the destination may snap to (default: any). */
  endEdge?: (edge: number) => boolean;
}

/**
 * Drive profile: where a trip may end. Only an open public carriageway: not a service road (driveways,
 * parking aisles and lanes inside landmark grounds cannot be confirmed as public) and not a covered way or
 * building passage.
 */
export function isStoppingEdge(g: RouteGraph, edge: number): boolean {
  return g.typeOf(edge) !== 'service' && (g.eflags[edge] & EDGE_TUNNEL) === 0;
}

const CELL = 64;

class MinHeap {
  private ids: number[] = [];
  private keys: number[] = [];
  get size(): number { return this.ids.length; }
  push(id: number, key: number): void {
    const ids = this.ids, keys = this.keys;
    let i = ids.length;
    ids.push(id); keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] < key || (keys[p] === key && ids[p] <= id)) break;
      ids[i] = ids[p]; keys[i] = keys[p];
      i = p;
    }
    ids[i] = id; keys[i] = key;
  }
  pop(): [number, number] {
    const ids = this.ids, keys = this.keys;
    const top: [number, number] = [ids[0], keys[0]];
    const id = ids.pop()!, key = keys.pop()!;
    const n = ids.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && (keys[c + 1] < keys[c] || (keys[c + 1] === keys[c] && ids[c + 1] < ids[c]))) c++;
        if (key < keys[c] || (key === keys[c] && id <= ids[c])) break;
        ids[i] = ids[c]; keys[i] = keys[c];
        i = c;
      }
      ids[i] = id; keys[i] = key;
    }
    return top;
  }
}

export class RouteGraph {
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly bounds: GraphFile['bounds'];
  readonly names: string[];
  readonly types: string[];
  /** Node coordinates in metres. */
  readonly nx: Float64Array;
  readonly nz: Float64Array;
  readonly ea: Int32Array;
  readonly eb: Int32Array;
  readonly etype: Uint8Array;
  readonly eflags: Uint8Array;
  readonly ename: Int32Array;
  readonly elen: Float64Array;
  readonly ecost: Float64Array;
  /** Full polyline of each edge [x, z, ...] in metres, from node a to node b. */
  readonly epts: number[][];
  /** Connected-component id per node. */
  readonly comp: Int32Array;
  readonly degree: Uint16Array;
  readonly profile: string;
  private ways: Record<string, number>;
  private adjStart: Int32Array;
  private adjEdge: Int32Array;
  private grid = new Map<number, number[]>();

  constructor(file: GraphFile) {
    if (file.v !== GRAPH_VERSION) throw new Error(`Unsupported routing graph version ${file.v}`);
    const s = file.scale;
    const N = (this.nodeCount = file.nodes.length / 2);
    const E = (this.edgeCount = file.edges.length / 6);
    this.bounds = file.bounds;
    this.names = file.names;
    this.types = file.types;
    this.ways = file.ways;
    this.profile = file.profile ?? 'walk';
    const cost = this.profile === 'drive' ? DRIVE_COST : WALK_COST;
    this.nx = new Float64Array(N);
    this.nz = new Float64Array(N);
    for (let i = 0; i < N; i++) { this.nx[i] = file.nodes[i * 2] / s; this.nz[i] = file.nodes[i * 2 + 1] / s; }
    this.ea = new Int32Array(E); this.eb = new Int32Array(E);
    this.etype = new Uint8Array(E); this.eflags = new Uint8Array(E); this.ename = new Int32Array(E);
    this.elen = new Float64Array(E); this.ecost = new Float64Array(E);
    this.epts = new Array(E);
    this.degree = new Uint16Array(N);
    let g = 0;
    for (let e = 0; e < E; e++) {
      const a = file.edges[e * 6], b = file.edges[e * 6 + 1], k = file.edges[e * 6 + 5];
      this.ea[e] = a; this.eb[e] = b;
      this.etype[e] = file.edges[e * 6 + 2]; this.eflags[e] = file.edges[e * 6 + 3]; this.ename[e] = file.edges[e * 6 + 4];
      const pts: number[] = [this.nx[a], this.nz[a]];
      let px = file.nodes[a * 2], pz = file.nodes[a * 2 + 1];
      for (let i = 0; i < k; i++) {
        px += file.geom[g++]; pz += file.geom[g++];
        pts.push(px / s, pz / s);
      }
      pts.push(this.nx[b], this.nz[b]);
      let len = 0;
      for (let i = 2; i < pts.length; i += 2) len += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
      this.epts[e] = pts;
      this.elen[e] = len;
      this.ecost[e] = len * (cost[file.types[this.etype[e]]] ?? 1.2);
      this.degree[a]++; this.degree[b]++;
    }
    // CSR adjacency
    this.adjStart = new Int32Array(N + 1);
    for (let e = 0; e < E; e++) { this.adjStart[this.ea[e] + 1]++; this.adjStart[this.eb[e] + 1]++; }
    for (let i = 0; i < N; i++) this.adjStart[i + 1] += this.adjStart[i];
    this.adjEdge = new Int32Array(E * 2);
    const fill = this.adjStart.slice(0, N);
    for (let e = 0; e < E; e++) { this.adjEdge[fill[this.ea[e]]++] = e; this.adjEdge[fill[this.eb[e]]++] = e; }
    // Connected components (union-find)
    const parent = new Int32Array(N);
    for (let i = 0; i < N; i++) parent[i] = i;
    const find = (i: number): number => {
      while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
      return i;
    };
    for (let e = 0; e < E; e++) {
      const a = find(this.ea[e]), b = find(this.eb[e]);
      if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
    }
    this.comp = new Int32Array(N);
    for (let i = 0; i < N; i++) this.comp[i] = find(i);
    // Spatial grid of edge segments for snapping
    for (let e = 0; e < E; e++) {
      const p = this.epts[e];
      for (let i = 2; i < p.length; i += 2) {
        const x0 = Math.floor(Math.min(p[i - 2], p[i]) / CELL), x1 = Math.floor(Math.max(p[i - 2], p[i]) / CELL);
        const z0 = Math.floor(Math.min(p[i - 1], p[i + 1]) / CELL), z1 = Math.floor(Math.max(p[i - 1], p[i + 1]) / CELL);
        for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
          const key = (cx + 32768) * 65536 + (cz + 32768);
          let cell = this.grid.get(key);
          if (!cell) this.grid.set(key, (cell = []));
          cell.push(e, i / 2 - 1);
        }
      }
    }
  }

  isBridge(edge: number): boolean { return (this.eflags[edge] & EDGE_BRIDGE) !== 0; }
  isOneWay(edge: number): boolean { return (this.eflags[edge] & EDGE_ONEWAY) !== 0; }
  isRoundabout(edge: number): boolean { return (this.eflags[edge] & EDGE_ROUNDABOUT) !== 0; }
  nameOf(edge: number): string | undefined { return this.ename[edge] >= 0 ? this.names[this.ename[edge]] : undefined; }
  typeOf(edge: number): string { return this.types[this.etype[edge]]; }
  /** Edges that meet at a node (N1-M6 traffic). */
  edgesAt(node: number): Int32Array { return this.adjEdge.subarray(this.adjStart[node], this.adjStart[node + 1]); }
  /** OSM way id (bridge / pier edges only, 0 otherwise). */
  wayOf(edge: number): number { return this.ways[edge] ?? 0; }

  /**
   * Nearest point on the network for each connected component within `maxDist`, closest first.
   * Candidates whose straight connector is `blocked` are skipped.
   */
  snap(x: number, z: number, maxDist = 220, blocked?: RouteOptions['blocked'], accept?: (edge: number) => boolean): Snap[] {
    const best = new Map<number, Snap>();
    const r = Math.ceil(maxDist / CELL);
    const cx0 = Math.floor(x / CELL), cz0 = Math.floor(z / CELL);
    const seen = new Set<number>();
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const cell = this.grid.get((cx0 + dx + 32768) * 65536 + (cz0 + dz + 32768));
      if (!cell) continue;
      for (let k = 0; k < cell.length; k += 2) {
        const e = cell[k], si = cell[k + 1];
        if (accept && !accept(e)) continue;
        const id = e * 65536 + si;
        if (seen.has(id)) continue;
        seen.add(id);
        const p = this.epts[e];
        const ax = p[si * 2], az = p[si * 2 + 1], vx = p[si * 2 + 2] - ax, vz = p[si * 2 + 3] - az;
        const vv = vx * vx + vz * vz;
        const t = vv > 0 ? Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / vv)) : 0;
        const qx = ax + vx * t, qz = az + vz * t;
        const d = Math.hypot(x - qx, z - qz);
        if (d > maxDist) continue;
        const c = this.comp[this.ea[e]];
        const cur = best.get(c);
        if (cur && (cur.dist < d || (cur.dist === d && cur.edge <= e))) continue;
        if (blocked && d > 0.5 && blocked(x, z, qx, qz)) continue;
        let off = 0;
        for (let i = 0; i < si; i++) off += Math.hypot(p[i * 2 + 2] - p[i * 2], p[i * 2 + 3] - p[i * 2 + 1]);
        off += Math.sqrt(vv) * t;
        best.set(c, { edge: e, offset: off, x: qx, z: qz, dist: d, component: c });
      }
    }
    return [...best.values()].sort((a, b) => a.dist - b.dist || a.edge - b.edge);
  }

  /**
   * Shortest walking route between two world positions, or null when they are not connected by
   * mapped walkable ways (or are too far from any).
   */
  route(sx: number, sz: number, dx: number, dz: number, opts: RouteOptions = {}): Route | null {
    const maxSnap = opts.maxSnap ?? 220;
    const starts = this.snap(sx, sz, opts.maxSnapStart ?? maxSnap, opts.blocked);
    const ends = this.snap(dx, dz, maxSnap, opts.blocked, opts.endEdge);
    // Candidate pairs on the same (undirected) component, nearest first. On a directed (one-way) graph a
    // shared component does not guarantee a path, so the next pairs are tried when A* finds none.
    const pairs: [Snap, Snap, number][] = [];
    for (const s of starts) for (const e of ends) if (s.component === e.component) pairs.push([s, e, s.dist + e.dist]);
    pairs.sort((a, b) => a[2] - b[2]);
    for (const [start, end] of pairs.slice(0, 4)) {
      const path = this.astar(start, end, opts);
      if (path) return this.assemble(sx, sz, dx, dz, start, end, path);
    }
    return null;
  }

  /** Unit direction of an edge's polyline at an offset (metres from node a), in a -> b order. */
  private tangent(edge: number, offset: number): [number, number] {
    const p = this.epts[edge];
    let acc = 0;
    for (let i = 2; i < p.length; i += 2) {
      const l = Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
      if (acc + l >= offset || i === p.length - 2) return l > 0 ? [(p[i] - p[i - 2]) / l, (p[i + 1] - p[i - 1]) / l] : [1, 0];
      acc += l;
    }
    return [1, 0];
  }

  /** A* between two snapped positions. Returns the node sequence and the edges between them. */
  private astar(start: Snap, end: Snap, opts: RouteOptions = {}): { nodes: number[]; edges: number[]; direct: boolean } | null {
    const N = this.nodeCount;
    const es = start.edge, eg = end.edge;
    const fs = this.ecost[es] / this.elen[es], fg = this.ecost[eg] / this.elen[eg];
    const oneS = this.isOneWay(es), oneG = this.isOneWay(eg);
    // Setting off against the current direction of travel (towards node a when heading a -> b) costs a U-turn.
    let penA = 0, penB = 0;
    if (opts.heading) {
      const [tx, tz] = this.tangent(es, start.offset);
      const dot = tx * opts.heading[0] + tz * opts.heading[1], pen = opts.uTurnCost ?? 80;
      if (dot > 0.3) penA = pen; else if (dot < -0.3) penB = pen;
    }
    let bestGoal = Infinity, goalNode = -1, direct = false;
    if (es === eg && (!oneS || end.offset >= start.offset)) {
      bestGoal = Math.abs(start.offset - end.offset) * fs + (end.offset >= start.offset ? penB : penA);
      direct = true;
    }
    const dist = new Float64Array(N).fill(Infinity);
    const prevNode = new Int32Array(N).fill(-1);
    const prevEdge = new Int32Array(N).fill(-1);
    const done = new Uint8Array(N);
    const h = (n: number) => Math.hypot(this.nx[n] - end.x, this.nz[n] - end.z);
    const heap = new MinHeap();
    const seed = (n: number, d: number) => {
      if (d < dist[n]) { dist[n] = d; heap.push(n, d + h(n)); }
    };
    if (!oneS) seed(this.ea[es], start.offset * fs + penA);
    seed(this.eb[es], (this.elen[es] - start.offset) * fs + penB);
    const ga = this.ea[eg], gb = this.eb[eg];
    while (heap.size) {
      const [u, f] = heap.pop();
      if (f >= bestGoal) break;
      if (done[u]) continue;
      done[u] = 1;
      const d = dist[u];
      if (u === ga && d + end.offset * fg < bestGoal) { bestGoal = d + end.offset * fg; goalNode = u; direct = false; }
      if (u === gb && !oneG && d + (this.elen[eg] - end.offset) * fg < bestGoal) { bestGoal = d + (this.elen[eg] - end.offset) * fg; goalNode = u; direct = false; }
      for (let k = this.adjStart[u]; k < this.adjStart[u + 1]; k++) {
        const e = this.adjEdge[k];
        if (this.eflags[e] & EDGE_ONEWAY && this.ea[e] !== u) continue;
        const v =this.ea[e] === u ? this.eb[e] : this.ea[e];
        if (done[v]) continue;
        const nd = d + this.ecost[e];
        if (nd < dist[v]) { dist[v] = nd; prevNode[v] = u; prevEdge[v] = e; heap.push(v, nd + h(v)); }
      }
    }
    if (bestGoal === Infinity) return null;
    if (direct) return { nodes: [], edges: [], direct: true };
    const nodes: number[] = [], edges: number[] = [];
    for (let n = goalNode; n >= 0; n = prevNode[n]) {
      nodes.push(n);
      if (prevEdge[n] >= 0) edges.push(prevEdge[n]);
    }
    nodes.reverse(); edges.reverse();
    return { nodes, edges, direct: false };
  }

  /** Part of an edge polyline between two offsets (metres from node a); reversed when from > to. */
  private slice(edge: number, from: number, to: number): number[] {
    const p = this.epts[edge];
    const lo = Math.min(from, to), hi = Math.max(from, to);
    const out: number[] = [];
    let acc = 0;
    const at = (i: number, d: number, l: number) => {
      const t = l > 0 ? d / l : 0;
      out.push(p[i - 2] + (p[i] - p[i - 2]) * t, p[i - 1] + (p[i + 1] - p[i - 1]) * t);
    };
    for (let i = 2; i < p.length; i += 2) {
      const l = Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
      const a0 = acc, a1 = acc + l;
      if (a1 >= lo && a0 <= hi) {
        if (out.length === 0) at(i, Math.max(0, lo - a0), l);
        if (a1 <= hi) out.push(p[i], p[i + 1]);
        else { at(i, hi - a0, l); break; }
      }
      acc = a1;
    }
    if (out.length === 0) out.push(p[0], p[1]);
    if (from > to) {
      const rev: number[] = [];
      for (let i = out.length - 2; i >= 0; i -= 2) rev.push(out[i], out[i + 1]);
      return rev;
    }
    return out;
  }

  private assemble(sx: number, sz: number, dx: number, dz: number, start: Snap, end: Snap, path: { nodes: number[]; edges: number[]; direct: boolean }): Route {
    const points: number[] = [], segEdge: number[] = [], edges: number[] = [];
    const add = (pts: number[], edge: number) => {
      let any = false;
      for (let i = 0; i < pts.length; i += 2) {
        const n = points.length;
        if (n && Math.abs(points[n - 2] - pts[i]) < 1e-6 && Math.abs(points[n - 1] - pts[i + 1]) < 1e-6) continue;
        if (n) { segEdge.push(edge); any = true; }
        points.push(pts[i], pts[i + 1]);
      }
      if (any && edge >= 0 && edges[edges.length - 1] !== edge) edges.push(edge);
    };
    add([sx, sz], -1);
    add([start.x, start.z], -1);
    if (path.direct) {
      add(this.slice(start.edge, start.offset, end.offset), start.edge);
    } else {
      const first = path.nodes[0], last = path.nodes[path.nodes.length - 1];
      // Leave the start edge towards the first node (for a loop edge pick the shorter side).
      const es = start.edge;
      const toA = !this.isOneWay(es) && this.ea[es] === first && (this.eb[es] !== first || start.offset <= this.elen[es] - start.offset);
      add(this.slice(es, start.offset, toA ? 0 : this.elen[es]), es);
      for (let i = 0; i < path.edges.length; i++) {
        const e = path.edges[i], from = path.nodes[i];
        const fwd = this.ea[e] === from;
        add(fwd ? this.epts[e] : this.slice(e, this.elen[e], 0), e);
      }
      const eg = end.edge;
      const fromA = this.ea[eg] === last && (this.isOneWay(eg) || this.eb[eg] !== last || end.offset <= this.elen[eg] - end.offset);
      add(this.slice(eg, fromA ? 0 : this.elen[eg], end.offset), eg);
    }
    add([end.x, end.z], end.edge);
    add([dx, dz], -1);
    const cum: number[] = [0];
    let network = 0;
    for (let i = 2; i < points.length; i += 2) {
      const l = Math.hypot(points[i] - points[i - 2], points[i + 1] - points[i - 1]);
      cum.push(cum[cum.length - 1] + l);
      if (segEdge[i / 2 - 1] >= 0) network += l;
    }
    const length = cum[cum.length - 1];
    const route: Route = {
      points, segEdge, cum, length, networkLength: network, seconds: length / WALK_SPEED,
      straight: Math.hypot(dx - sx, dz - sz), start, end, edges, maneuvers: [],
    };
    route.maneuvers = this.maneuvers(route);
    return route;
  }

  /** Turn-by-turn hints: turns at real junctions (degree >= 3) and bridge entries. */
  private maneuvers(route: Route): Maneuver[] {
    const { points, segEdge, cum } = route;
    const out: Maneuver[] = [];
    const nSeg = segEdge.length;
    const first = segEdge.findIndex((e) => e >= 0);
    if (first >= 0) out.push({ kind: 'depart', at: cum[first], name: this.nameOf(segEdge[first]) });
    /** Direction of travel measured over ~`span` metres before (dir -1) or after (dir +1) point i. */
    const heading = (i: number, dir: 1 | -1, span: number): [number, number] => {
      let j = i;
      while (j + dir >= 0 && j + dir <= nSeg && Math.abs(cum[j] - cum[i]) < span) j += dir;
      const ax = points[Math.min(i, j) * 2], az = points[Math.min(i, j) * 2 + 1];
      const bx = points[Math.max(i, j) * 2], bz = points[Math.max(i, j) * 2 + 1];
      const l = Math.hypot(bx - ax, bz - az) || 1;
      return [(bx - ax) / l, (bz - az) / l];
    };
    for (let i = 1; i < nSeg; i++) {
      const e0 = segEdge[i - 1], e1 = segEdge[i];
      if (e0 === e1 || e0 < 0 || e1 < 0) continue;
      const name = this.nameOf(e1);
      if (this.isBridge(e1) && !this.isBridge(e0)) {
        out.push({ kind: 'bridge', at: cum[i], name });
        continue;
      }
      // Junction node between the two edges
      const node = this.ea[e1] === this.ea[e0] || this.ea[e1] === this.eb[e0] ? this.ea[e1] : this.eb[e1];
      if (this.degree[node] < 3) continue;
      const [ix, iz] = heading(i, -1, 9), [ox, oz] = heading(i, 1, 9);
      // Screen-style frame (+x east, +z south): positive cross product = clockwise = right turn.
      const ang = (Math.atan2(ix * oz - iz * ox, ix * ox + iz * oz) * 180) / Math.PI;
      const mag = Math.abs(ang);
      const nameChanged = name !== undefined && name !== this.nameOf(e0);
      if (mag < 28) {
        if (nameChanged) out.push({ kind: 'straight', at: cum[i], name });
        continue;
      }
      const side = ang > 0 ? 'right' : 'left';
      const kind = (mag < 55 ? `slight-${side}` : mag > 130 ? `sharp-${side}` : side) as ManeuverKind;
      const prev = out[out.length - 1];
      // A turn immediately after another (split junctions) keeps only the later instruction when both go the same way.
      if (prev && prev.kind === kind && cum[i] - prev.at < 12) { prev.name = name ?? prev.name; continue; }
      out.push({ kind, at: cum[i], name });
    }
    out.push({ kind: 'arrive', at: route.length });
    return out;
  }
}

/** Position of a point relative to a route: distance along it and lateral distance from it. */
export function progressOnRoute(route: Route, x: number, z: number): { along: number; off: number; seg: number } {
  const p = route.points;
  let best = Infinity, along = 0, seg = 0;
  for (let i = 2; i < p.length; i += 2) {
    const ax = p[i - 2], az = p[i - 1], vx = p[i] - ax, vz = p[i + 1] - az;
    const vv = vx * vx + vz * vz;
    const t = vv > 0 ? Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / vv)) : 0;
    const d = Math.hypot(x - ax - vx * t, z - az - vz * t);
    if (d < best) { best = d; seg = i / 2 - 1; along = route.cum[seg] + Math.sqrt(vv) * t; }
  }
  return { along, off: best, seg };
}

const TURN_TEXT: Record<ManeuverKind, string> = {
  depart: 'Head', left: 'Turn left', right: 'Turn right', 'slight-left': 'Bear left', 'slight-right': 'Bear right',
  'sharp-left': 'Sharp left', 'sharp-right': 'Sharp right', straight: 'Continue', bridge: 'Cross', arrive: 'Arrive',
};
/** Arrow glyph for a maneuver (HUD). */
export const TURN_GLYPH: Record<ManeuverKind, string> = {
  depart: '↑', left: '←', right: '→', 'slight-left': '↖', 'slight-right': '↗',
  'sharp-left': '↶', 'sharp-right': '↷', straight: '↑', bridge: '↑', arrive: '◎',
};

export function describeManeuver(m: Maneuver, destName?: string): string {
  switch (m.kind) {
    case 'arrive': return destName ? `Arrive at ${destName}` : 'Arrive';
    case 'bridge': return m.name ? `Cross ${m.name}` : 'Cross the bridge';
    case 'depart': return m.name ? `Follow ${m.name}` : 'Follow the path';
    case 'straight': return m.name ? `Continue onto ${m.name}` : 'Continue straight';
    default: return m.name ? `${TURN_TEXT[m.kind]} onto ${m.name}` : TURN_TEXT[m.kind];
  }
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${m < 100 ? Math.round(m) : Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`;
}
export function formatDuration(seconds: number): string {
  const min = Math.max(1, Math.round(seconds / 60));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
}
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export function compassPoint(bearing: number): string {
  return COMPASS[Math.round((((bearing % 360) + 360) % 360) / 45) % 8];
}

/**
 * The route without its final off-network hop (a driving route ends at the stopping point on the road;
 * the rest is on foot). Returns the trimmed route and the straight length of the removed hop.
 */
export function trimEndConnector(r: Route): { route: Route; hop: number } {
  const n = r.segEdge.length;
  if (n < 2 || r.segEdge[n - 1] >= 0) return { route: r, hop: 0 };
  const hop = r.cum[n] - r.cum[n - 1];
  const length = r.cum[n - 1];
  const maneuvers = r.maneuvers.map((m) => (m.kind === 'arrive' ? { ...m, at: length } : m)).filter((m) => m.at <= length);
  return {
    route: { ...r, points: r.points.slice(0, n * 2), segEdge: r.segEdge.slice(0, n - 1), cum: r.cum.slice(0, n), length, maneuvers },
    hop,
  };
}

const graphPromises = new Map<string, Promise<RouteGraph>>();
/** Lazy-load and decode a routing graph (first route request only; one cache entry per URL). */
export function loadRouteGraph(url: string): Promise<RouteGraph> {
  let graphPromise = graphPromises.get(url);
  if (!graphPromise) {
    graphPromise = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`routing graph: HTTP ${r.status}`);
        return r.json() as Promise<GraphFile>;
      })
      .then((f) => new RouteGraph(f))
      .catch((e) => {
        graphPromises.delete(url);
        throw e;
      });
    graphPromises.set(url, graphPromise);
  }
  return graphPromise;
}
