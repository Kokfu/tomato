// N1-M4: what lines a Kuching street. Beside every larger carriageway: a raised kerb, a paved footpath and the open
// monsoon drain behind it, bridged by concrete slab covers; beside a residential street: the drain right at the
// road edge with a cover at every driveway-like interval. On the carriageway: lane lines by road class and width,
// and stop lines where a street ends at a junction.
//
// All of it is INFERRED from the road class and width (docs/LIMITATIONS.md): OpenStreetMap maps no kerb, drain or
// lane marking here. Nothing is added to collision: the tallest part is 0.13 m, which a walker and a car pass over.
// Geometry goes into the chunk's existing road, paving and structure meshes: no draw call is added.
import * as THREE from 'three';
import { v5Exclusion } from '../v5/geo.ts';
import { inDistrict } from './district/mainBazaar.ts';
import type { RoadData, RoadType } from './types.ts';
import type { GeoBuf } from './Materials.ts';
import type { BuildContext } from './ChunkManager.ts';

export interface Sample { x: number; z: number; y: number }
export type Offsets = { lx: number; lz: number; rx: number; rz: number }[];

const KERB = new THREE.Color(0xb9b5a9);
const KERB_BLACK = new THREE.Color(0x2c2d2e);
const KERB_WHITE = new THREE.Color(0xdedbd0);
const PAVE = new THREE.Color(0xb4aea2);
const LIP = new THREE.Color(0xa29f96);
const COVER = new THREE.Color(0xaeaaa0);
const COVER_DARK = new THREE.Color(0x8f8c84);
const DRAIN_WALL = new THREE.Color(0x4f4f49);
const DRAIN_FLOOR = new THREE.Color(0x34372f);
export const PAINT_WHITE = new THREE.Color(0xf2f1ea);
export const PAINT_YELLOW = new THREE.Color(0xe9bf2f);

/** Height of the kerb and footpath above the ground, metres. */
export const KERB_H = 0.13;
/** How far the street edge reaches beyond the carriageway, metres (the ground beside a road is painted concrete this far). */
export const EDGE_REACH: Partial<Record<RoadType, number>> = { trunk: 2.55, primary: 2.55, secondary: 2.55, tertiary: 2.4, residential: 0.86, service: 0.16 };

/** Profile across one side of a street: lateral offsets beyond the carriageway edge, metres. */
interface Layout { kerb: number; path: number; drain: number; lip: number }
const LAYOUT_BIG: Layout = { kerb: 0.16, path: 1.75, drain: 2.43, lip: 2.55 };
const LAYOUT_TERTIARY: Layout = { kerb: 0.16, path: 1.6, drain: 2.28, lip: 2.4 };
/** Service roads (car parks, back lanes): a low kerb stone only, and none on the Low preset. */
const LAYOUT_KERB: Layout = { kerb: 0.16, path: 0.16, drain: 0.16, lip: 0.16 };
/** Residential and old-town streets: no raised footpath, the drain runs along the road edge. */
const LAYOUT_SMALL: Layout = { kerb: 0.14, path: 0.14, drain: 0.74, lip: 0.86 };

/**
 * True on any other carriageway. With `oneWayWithin` (and the direction of travel): true within that many metres of
 * another one-way main road running the opposite way beside this point.
 */
export type Blocked = (x: number, z: number, oneWayWithin?: number, dirX?: number, dirZ?: number) => boolean;

/** Two triangles a-b-c-d wound so that their face normal agrees with (nx, ny, nz): a double-sided material lights by it. */
function quadFacing(buf: GeoBuf, a: number, b: number, c: number, d: number, nx: number, ny: number, nz: number): void {
  const p = buf.pos, ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2];
  const vx = p[c * 3] - p[a * 3], vy = p[c * 3 + 1] - p[a * 3 + 1], vz = p[c * 3 + 2] - p[a * 3 + 2];
  if ((uy * vz - uz * vy) * nx + (uz * vx - ux * vz) * ny + (ux * vy - uy * vx) * nz >= 0) { buf.tri(a, b, c); buf.tri(a, c, d); } else { buf.tri(a, c, b); buf.tri(a, d, c); }
}

export interface EdgeBuffers {
  /** Drain floors (the chunk's lowest road layer). */
  floor: GeoBuf;
  /** Footpath tops (the paving layer). */
  paving: GeoBuf;
  /** Kerbs, drain walls, lips and slab covers (the concrete structure mesh). */
  solid: GeoBuf;
}

const hash = (a: number, b: number): number => {
  let h = Math.imul(a | 0, 2654435761) ^ Math.imul((b | 0) + 0x9e3779b9, 2246822519);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
};

/**
 * Kerb, footpath and drain along both sides of one road. `pts` is the sampled centre line (chunk-local metres),
 * `offsets(d)` its mitred offset lines at distance d, `blocked(x, z)` true on any other carriageway (with a third
 * argument: within that many metres of another one-way main road).
 */
export function streetEdges(
  r: RoadData, type: RoadType, pts: Sample[], hw: number, ox: number, oz: number, ctx: BuildContext, out: EdgeBuffers,
  offsets: (d: number) => Offsets, blocked: Blocked,
): void {
  const reach = EDGE_REACH[type];
  if (!reach || pts.length < 2) return;
  const low = ctx.quality.name === 'low';
  if (type === 'service' && low) return;
  const small = type === 'residential';
  const ground = (x: number, z: number) => ctx.height.sample(ox + x, oz + z);
  // A one-way main road with another one-way main road close on its right (traffic keeps left) is one half of a dual
  // carriageway: that side is the median, which gets the black-and-white kerb of Kuching's medians and no footpath.
  const oneWay = (r.f & 8) !== 0 && type !== 'residential';
  for (const sgn of [0, 1] as const) {
    // Per sample: which layout applies (old-town streets keep the narrow one), or none.
    const lay: (Layout | null)[] = [];
    const lines = new Map<number, Offsets>();
    const line = (d: number): Offsets => { let l = lines.get(d); if (!l) lines.set(d, (l = offsets(hw + d))); return l; };
    const at = (d: number, i: number): [number, number] => { const o = line(d)[i]; return sgn ? [o.rx, o.rz] : [o.lx, o.lz]; };
    for (let i = 0; i < pts.length; i++) {
      const wx = ox + pts[i].x, wz = oz + pts[i].z;
      const inside = (x: number, z: number) => ctx.collision.insideBuilding(ox + x, oz + z, ground(x, z) + 1, false);
      // Where a building stands too close to the road for the footpath, the street keeps the narrow layout.
      let pick: Layout | null = null;
      const [kx, kz] = at(0.08, i);
      if (!blocked(kx, kz) && !(v5Exclusion.active && v5Exclusion.inCorridor(ox + kx, oz + kz))) {
        // The widest layout that fits: clear of the next carriageway (a narrow median, a service road alongside), of
        // buildings and of water. A kerb stone alone is the last resort.
        for (const L of type === 'service' ? [LAYOUT_KERB] : small || inDistrict(wx, wz) ? [LAYOUT_SMALL, LAYOUT_KERB] : [type === 'tertiary' ? LAYOUT_TERTIARY : LAYOUT_BIG, LAYOUT_SMALL, LAYOUT_KERB]) {
          const [fx, fz] = at(L.lip, i), [mx, mz] = at((L.kerb + L.lip) / 2, i);
          if (blocked(fx, fz) || blocked(mx, mz) || inside(mx, mz) || inside(fx, fz) || ctx.collision.inWater(ox + fx, oz + fz)) continue;
          pick = L;
          break;
        }
      }
      lay.push(pick);
    }
    // Runs of consecutive samples that share a layout.
    for (let i0 = 0; i0 < pts.length; ) {
      const L = lay[i0];
      let i1 = i0;
      while (i1 + 1 < pts.length && lay[i1 + 1] === L) i1++;
      if (L && i1 > i0) {
        // the other half of a dual road: a one-way main road going the other way within about 14 m on this side
        const mid = (i0 + i1) >> 1, [qx, qz] = at(6, mid), a = pts[Math.max(0, mid - 1)], b = pts[Math.min(pts.length - 1, mid + 1)];
        const dl = Math.hypot(b.x - a.x, b.z - a.z) || 1;
        run(L, i0, i1, oneWay && sgn === 0 && blocked(qx, qz, 8, (b.x - a.x) / dl, (b.z - a.z) / dl));
      }
      i0 = i1 + 1;
    }

    function run(L: Layout, i0: number, i1: number, median: boolean): void {
      const n = i1 - i0 + 1;
      // One strip of quads between two profile points, sharing vertices along the run.
      const strip = (buf: GeoBuf, d0: number, h0: number, d1: number, h1: number, c: THREE.Color, up: boolean, face = 0): void => {
        let pa = -1, pb = -1;
        for (let k = 0; k < n; k++) {
          const i = i0 + k, [ax, az] = at(d0, i), [bx, bz] = at(d1, i);
          let nx = 0, ny = 1, nz = 0;
          if (!up) {
            // vertical face: its normal is the lateral direction, toward the road (face = -1) or away from it (+1)
            const [qx, qz] = at(d0 + 0.5, i), l = Math.hypot(qx - ax, qz - az) || 1;
            nx = ((qx - ax) / l) * face; ny = 0; nz = ((qz - az) / l) * face;
          }
          const a = buf.vert(ax, ground(ax, az) + h0, az, nx, ny, nz, c), b = buf.vert(bx, ground(bx, bz) + h1, bz, nx, ny, nz, c);
          if (k > 0) {
            if (up) { buf.triUp(pa, pb, b); buf.triUp(pa, b, a); } else quadFacing(buf, pa, pb, b, a, nx, ny, nz);
          }
          pa = a; pb = b;
        }
      };
      const top = L === LAYOUT_BIG || L === LAYOUT_TERTIARY ? KERB_H : 0.07;
      if (median) {
        // Median: a kerb and a strip of raised concrete, painted in alternating blocks unless on the Low preset.
        const mw = Math.min(0.55, L.lip);
        strip(out.solid, 0, 0, 0, KERB_H, KERB, false, -1);
        strip(out.solid, 0, KERB_H, mw, KERB_H, low ? KERB : KERB_WHITE, true);
        strip(out.solid, mw, KERB_H, mw, 0, KERB, false, 1);
        if (!low) blocks(i0, i1, mw);
        return;
      }
      strip(out.solid, 0, 0, 0, top, KERB, false, -1);
      strip(out.solid, 0, top, L.kerb, top, KERB, true);
      if (L === LAYOUT_KERB) { strip(out.solid, L.kerb, top, L.kerb, 0, KERB, false, 1); return; }
      if (L.path > L.kerb) strip(out.paving, L.kerb, top - 0.012, L.path, top - 0.012, PAVE, true);
      strip(out.solid, L.path, top - 0.012, L.path, 0.03, DRAIN_WALL, false, 1);
      // the channel: dark water line in the middle, the foot of each wall a little lighter, so it reads as a trough
      const w = (L.drain - L.path) * 0.22;
      strip(out.floor, L.path, 0.035, L.path + w, 0.035, DRAIN_WALL, true);
      strip(out.floor, L.path + w, 0.035, L.drain - w, 0.035, DRAIN_FLOOR, true);
      strip(out.floor, L.drain - w, 0.035, L.drain, 0.035, DRAIN_WALL, true);
      strip(out.solid, L.drain, 0.03, L.drain, top - 0.012, DRAIN_WALL, false, -1);
      strip(out.solid, L.drain, top - 0.012, L.lip, top - 0.012, LIP, true);
      if (!low) strip(out.solid, L.lip, top - 0.012, L.lip, 0, LIP, false, 1);
      covers(L, i0, i1, top);
    }

    /** Slab covers over the drain: a few slabs in a row, at an interval that differs from road to road. */
    function covers(L: Layout, i0: number, i1: number, top: number): void {
      const town = L === LAYOUT_SMALL && !small; // old-town street fronts: covered more often than not
      const period = town ? 7.5 : small ? 11 + Math.floor(hash(r.id, 5) * 6) : 15 + Math.floor(hash(r.id, 5) * 8);
      const slabs = town ? 5 : small ? 4 : 3, slab = 0.9;
      let acc = hash(r.id, 11 + sgn) * period;
      for (let i = i0; i < i1; i++) {
        const [ax, az] = at(L.path, i), [bx, bz] = at(L.path, i + 1), [cx, cz] = at(L.drain, i), [dx, dz] = at(L.drain, i + 1);
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 0.5) continue;
        // positions along this segment where a group of slabs starts
        for (let s = Math.ceil((acc - slabs * slab) / period) * period - acc; s < len; s += period) {
          for (let k = 0; k < (low ? 1 : slabs); k++) {
            const s0 = Math.max(0, s + (low ? 0 : k * slab)), s1 = Math.min(len, s + (low ? slabs * slab : (k + 1) * slab - 0.05));
            if (s1 - s0 < 0.03) continue; // the rest of a slab cut by a sample point lies in the next segment
            const t0 = s0 / len, t1 = s1 / len, c = (k + Math.floor(s / period)) % 3 === 1 ? COVER_DARK : COVER;
            const q = (x0: number, z0: number, x1: number, z1: number, t: number): [number, number] => [x0 + (x1 - x0) * t, z0 + (z1 - z0) * t];
            const p = [q(ax, az, bx, bz, t0), q(ax, az, bx, bz, t1), q(cx, cz, dx, dz, t1), q(cx, cz, dx, dz, t0)];
            const v = p.map(([x, z]) => out.solid.vert(x, ground(x, z) + top, z, 0, 1, 0, c));
            out.solid.triUp(v[0], v[1], v[2]); out.solid.triUp(v[0], v[2], v[3]);
          }
        }
        acc += len;
      }
    }

    /** Black blocks on the white median kerb, 1.2 m long, every 2.4 m. */
    function blocks(i0: number, i1: number, mw: number): void {
      let acc = 0;
      for (let i = i0; i < i1; i++) {
        const [ax, az] = at(0, i), [bx, bz] = at(0, i + 1), [cx, cz] = at(mw, i), [dx, dz] = at(mw, i + 1);
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 0.5) continue;
        for (let s = Math.ceil((acc - 1.2) / 2.4) * 2.4 - acc; s < len; s += 2.4) {
          const t0 = Math.max(0, s) / len, t1 = Math.min(len, s + 1.2) / len;
          if (t1 - t0 < 0.03 / len) continue;
          const p: [number, number][] = [[ax + (bx - ax) * t0, az + (bz - az) * t0], [ax + (bx - ax) * t1, az + (bz - az) * t1], [cx + (dx - cx) * t1, cz + (dz - cz) * t1], [cx + (dx - cx) * t0, cz + (dz - cz) * t0]];
          const v = p.map(([x, z]) => out.solid.vert(x, ground(x, z) + KERB_H + 0.004, z, 0, 1, 0, KERB_BLACK));
          out.solid.triUp(v[0], v[1], v[2]); out.solid.triUp(v[0], v[2], v[3]);
          // and the face toward the carriageway
          const lx = p[3][0] - p[0][0], lz = p[3][1] - p[0][1], ll = Math.hypot(lx, lz) || 1;
          const f0 = out.solid.vert(p[0][0] - (lx / ll) * 0.004, ground(p[0][0], p[0][1]), p[0][1] - (lz / ll) * 0.004, -lx / ll, 0, -lz / ll, KERB_BLACK);
          const f1 = out.solid.vert(p[1][0] - (lx / ll) * 0.004, ground(p[1][0], p[1][1]), p[1][1] - (lz / ll) * 0.004, -lx / ll, 0, -lz / ll, KERB_BLACK);
          const f2 = out.solid.vert(p[1][0] - (lx / ll) * 0.004, ground(p[1][0], p[1][1]) + KERB_H, p[1][1] - (lz / ll) * 0.004, -lx / ll, 0, -lz / ll, KERB_BLACK);
          const f3 = out.solid.vert(p[0][0] - (lx / ll) * 0.004, ground(p[0][0], p[0][1]) + KERB_H, p[0][1] - (lz / ll) * 0.004, -lx / ll, 0, -lz / ll, KERB_BLACK);
          quadFacing(out.solid, f0, f1, f2, f3, -lx / ll, 0, -lz / ll);
        }
        acc += len;
      }
    }
  }
}

/**
 * Lane lines of one road by class and width (inferred; Malaysian practice, traffic keeps left): a dashed centre line
 * on two-way roads, a double solid centre and lane dividers on wide ones, lane dividers on one-way roads, solid edge
 * lines on the main roads. `edgeY[i]` = [left, right] surface height of the carriageway at sample i.
 */
export function laneMarkings(r: RoadData, type: RoadType, pts: Sample[], hw: number, marks: GeoBuf, offsets: (d: number) => Offsets, edgeY: [number, number][], low: boolean, blocked: Blocked = () => false): void {
  const group3 = type === 'motorway' || type === 'trunk' || type === 'primary' || type === 'secondary' || type === 'tertiary';
  if (!group3 || hw < 2.6 || pts.length < 2) return;
  const oneWay = (r.f & 8) !== 0, w = hw * 2;
  /** The line at signed lateral offset `lat` (positive = the offsets' left side) as a polyline on the road surface. */
  const lineAt = (lat: number): Sample[] => {
    const o = lat === 0 ? null : offsets(Math.abs(lat)), t = (lat + hw) / w;
    return pts.map((p, i) => ({
      x: o ? (lat > 0 ? o[i].lx : o[i].rx) : p.x, z: o ? (lat > 0 ? o[i].lz : o[i].rz) : p.z,
      y: edgeY[i][1] + (edgeY[i][0] - edgeY[i][1]) * t + 0.02,
    }));
  };
  const paint = (lat: number, half: number, dash: number, period: number, c = PAINT_WHITE): void => {
    const l = lineAt(lat);
    let acc = 0;
    for (let i = 1; i < l.length; i++) {
      const a = l[i - 1], b = l[i], len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 1e-3) continue;
      const dx = (b.x - a.x) / len, dz = (b.z - a.z) / len;
      const piece = (s0: number, s1: number) => {
        const x0 = a.x + dx * s0, z0 = a.z + dz * s0, x1 = a.x + dx * s1, z1 = a.z + dz * s1;
        // no paint through a junction or across the mouth of a side street
        if (blocked((x0 + x1) / 2, (z0 + z1) / 2) || (!period && (blocked(x0, z0) || blocked(x1, z1)))) return;
        const y0 = a.y + ((b.y - a.y) * s0) / len, y1 = a.y + ((b.y - a.y) * s1) / len;
        const v0 = marks.vert(x0 - dz * half, y0, z0 + dx * half, 0, 1, 0, c), v1 = marks.vert(x0 + dz * half, y0, z0 - dx * half, 0, 1, 0, c);
        const v2 = marks.vert(x1 + dz * half, y1, z1 - dx * half, 0, 1, 0, c), v3 = marks.vert(x1 - dz * half, y1, z1 + dx * half, 0, 1, 0, c);
        marks.triUp(v0, v1, v2); marks.triUp(v0, v2, v3);
      };
      if (!period) piece(0, len);
      else for (let s = (period - (acc % period)) % period; s + dash <= len; s += period) piece(s, s + dash);
      acc += len;
    }
  };
  if (oneWay) {
    const lanes = Math.max(1, Math.round(w / 3.5));
    for (let k = 1; k < lanes; k++) paint(-hw + (k * w) / lanes, 0.06, 3, 9);
  } else if (w >= 12.5) {
    paint(0.14, 0.05, 0, 0); paint(-0.14, 0.05, 0, 0);
    paint(hw / 2, 0.06, 3, 9); paint(-hw / 2, 0.06, 3, 9);
  } else if (hw >= 3) paint(0, 0.07, 3, 9);
  if (!low && type !== 'tertiary' && type !== 'motorway') { paint(hw - 0.28, 0.05, 0, 0); paint(-(hw - 0.28), 0.05, 0, 0); }
}

/**
 * Stop line across the approach lane(s) of a road that ends at a junction. `end` = 0 (first sample) or 1 (last);
 * `crossHw` = half width of the widest road it meets there.
 */
export function stopLine(r: RoadData, pts: Sample[], hw: number, end: 0 | 1, crossHw: number, marks: GeoBuf): void {
  const oneWay = (r.f & 8) !== 0;
  if (oneWay && end === 0) return; // traffic leaves the junction on this arm
  const n = pts.length, node = end ? pts[n - 1] : pts[0], prev = end ? pts[n - 2] : pts[1];
  // unit direction of travel toward the node, and total length available
  let tx = node.x - prev.x, tz = node.z - prev.z;
  const l = Math.hypot(tx, tz);
  if (l < 0.5) return;
  tx /= l; tz /= l;
  let total = 0;
  for (let i = 1; i < n; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  const back = crossHw + 1.1;
  if (total < back + 4) return;
  const cx = node.x - tx * back, cz = node.z - tz * back;
  // road height where the line lies: walk back along the samples
  let y = node.y, left = back;
  for (let k = 1; k < n && left > 0; k++) {
    const p = end ? pts[n - k] : pts[k - 1], q = end ? pts[n - 1 - k] : pts[k], l2 = Math.hypot(q.x - p.x, q.z - p.z);
    y = l2 > left ? p.y + ((q.y - p.y) * left) / l2 : q.y;
    left -= l2;
  }
  y += 0.025;
  // left of travel = (tz, -tx); a two-way road's approach lanes are its left half
  const a = oneWay ? -(hw - 0.2) : 0.1, b = hw - 0.2;
  const p = (lat: number, along: number): number => marks.vert(cx + tz * lat + tx * along, y, cz - tx * lat + tz * along, 0, 1, 0, PAINT_WHITE);
  const v0 = p(a, -0.3), v1 = p(b, -0.3), v2 = p(b, 0), v3 = p(a, 0);
  marks.triUp(v0, v1, v2); marks.triUp(v0, v2, v3);
}
