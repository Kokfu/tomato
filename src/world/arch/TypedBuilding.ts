import * as THREE from 'three';
import type { GeoBuf } from '../Materials.ts';
import type { BuildContext } from '../ChunkManager.ts';
import { insetRing, pointInRing } from '../landmarks/kit.ts';
import { toVec2 } from '../RoadBuilder.ts';
import { ROW, rowV, PLAIN_UV, ROW_TONE } from './CityAtlas.ts';
import type { BuildingType, TypedBuilding } from './buildingType.ts';
import { ringArea } from './buildingType.ts';

// Typed building generator, part 2: the geometry (N1-M3). Everything goes into the chunk's two merged meshes (walls,
// roofs), which share one atlas and one material each across the whole city: a typed building costs triangles, never
// a draw call. Colours, roof forms and dimensions follow docs/night/refs/STYLE_GUIDE.md, section 1.

/** Roof surface, carried in the roof mesh's uv.x (uv.y = how rusty): see the `roof` detail shader in Materials.ts. */
export const ROOF_TILE = 0, ROOF_ZINC = 1;

interface Style {
  walls: number[];
  roofs: number[];
  roof: 'gable' | 'hip' | 'mixed' | 'flat';
  zinc?: boolean;
  /** Eaves overhang (m) and rise per metre of half span; `maxRise` caps wide roofs. */
  overhang: number;
  pitch: number;
  maxRise: number;
  /** Metres per bay; the atlas rows of the ground storey and of the storeys above (one picked per building). */
  bay: number;
  ground: number;
  upper: number[];
  parapet: number;
}

const TILE_ROOFS = [0xa0522d, 0x8d4a35, 0x96563c, 0x7d4a3a, 0xa3604a, 0x8a5a48, 0x6e5a50, 0x5f6973];
const ZINC_ROOFS = [0x8a8f8c, 0x9aa0a0, 0x7f8684, 0xa3a8a6, 0x8f958f, 0x7a8f9c, 0xa64b3e];
const FLAT_ROOFS = [0x8e8f91, 0x9b968f, 0x7f8387, 0x8a8a85, 0xa09c94];
const STYLE: Record<Exclude<BuildingType, 'open_roof'>, Style> = {
  kampung: {
    walls: [0x8b6a4a, 0x7d7469, 0x9bb5b8, 0xb9c9a8, 0xd8cdb2, 0xc8b89a, 0xa9bfc9, 0x96806a, 0xc9c2a6, 0xb5a48c],
    roofs: ZINC_ROOFS, roof: 'gable', zinc: true, overhang: 0.65, pitch: 0.55, maxRise: 2.6, bay: 3, ground: ROW.kampung, upper: [ROW.kampung], parapet: 0,
  },
  house: {
    walls: [0xd8d0bf, 0xc9bfa8, 0xb9c7b5, 0xe2d9c6, 0xd9c7ae, 0xcfd6d2, 0xe6d2b8, 0xc7d0c0, 0xdfc9b9, 0xd6cdb4, 0xbfcbd0],
    roofs: TILE_ROOFS, roof: 'mixed', overhang: 0.6, pitch: 0.5, maxRise: 3, bay: 3.4, ground: ROW.houseGround, upper: [ROW.houseUp], parapet: 0,
  },
  terrace: {
    walls: [0xd8d0bf, 0xc9bfa8, 0xb9c7b5, 0xe2d9c6, 0xd9c7ae, 0xe6d2b8, 0xd3cbb8, 0xc4ccc0],
    roofs: TILE_ROOFS, roof: 'gable', overhang: 0.55, pitch: 0.45, maxRise: 3.2, bay: 3.2, ground: ROW.houseGround, upper: [ROW.houseUp], parapet: 0,
  },
  shophouse: {
    walls: [0xd8cdb2, 0xd9b84a, 0x4e9a93, 0xcfc4a6, 0xc9d2cf, 0xe0c9a0, 0xb9c4b0, 0xd6b8a0, 0xa8b8c4, 0xe3dccb, 0xb5574c, 0xc8bfa6, 0xd2c2a0, 0xbfc9c2],
    roofs: FLAT_ROOFS, roof: 'flat', overhang: 0, pitch: 0, maxRise: 0, bay: 3.2, ground: ROW.shopGround, upper: [ROW.shopUpA, ROW.shopUpB], parapet: 0.9,
  },
  midrise: {
    walls: [0xc9c4b8, 0xd8d4c8, 0xbcc4c8, 0xc4b8a8, 0xb4c0cb, 0xd9d0c0, 0xcfc8ba, 0xc2cbc6],
    roofs: FLAT_ROOFS, roof: 'flat', overhang: 0, pitch: 0, maxRise: 0, bay: 3.4, ground: ROW.podium, upper: [ROW.ribbon, ROW.balcony, ROW.curtain, ROW.balcony, ROW.ribbon], parapet: 1.1,
  },
  mall: {
    walls: [0xd2a99b, 0xd9c8b0, 0xc8ccc8, 0xcdb8a0, 0xb8c4cc, 0xd8cfc0],
    roofs: FLAT_ROOFS, roof: 'flat', overhang: 0, pitch: 0, maxRise: 0, bay: 7, ground: ROW.mallGround, upper: [ROW.mallClad], parapet: 1.5,
  },
  warehouse: {
    walls: [0x9aa3a0, 0xa8adb0, 0x8f9aa0, 0xb0a898, 0x7a8f9c, 0xa9a59a, 0x9c8f86],
    roofs: [0x7a8f9c, 0xa64b3e, 0x8a8f8c, 0x9aa3a0, 0x8f958f, 0x6f8288], roof: 'gable', zinc: true, overhang: 0.3, pitch: 0.2, maxRise: 2.4, bay: 5, ground: ROW.wareGround, upper: [ROW.wareUp], parapet: 0,
  },
  school: {
    walls: [0xe6dfc8, 0xece6d6, 0xdcd8c4, 0xe3dcc2],
    roofs: [0x8a4a35, 0x7d4a3a, 0x96563c, 0x7a8f9c, 0x5d7a68], roof: 'hip', overhang: 0.9, pitch: 0.4, maxRise: 3, bay: 3.4, ground: ROW.school, upper: [ROW.school], parapet: 0,
  },
  colonial: {
    walls: [0xe8e6df, 0xcfd0c8, 0xe3dccb, 0xdfe0d6, 0xe6dfd0],
    roofs: [0x4a3a2e, 0x5a4638, 0x6a4a3a, 0x8a4a35], roof: 'hip', overhang: 0.7, pitch: 0.5, maxRise: 3.4, bay: 3.6, ground: ROW.colonialGround, upper: [ROW.colonialUp], parapet: 0,
  },
  worship: {
    walls: [0xf0ece2, 0xe9e1cf, 0xf2e6d0, 0xe6e4da],
    roofs: [0x8c4a36, 0x5d7a68, 0x7d4a3a, 0x9a8a5a], roof: 'mixed', overhang: 0.5, pitch: 0.5, maxRise: 3.4, bay: 3.6, ground: ROW.worship, upper: [ROW.worship], parapet: 0,
  },
  shed: {
    walls: [0x9a958c, 0x8b6a4a, 0xa8a49a, 0x8f958f, 0xb0a590],
    roofs: ZINC_ROOFS, roof: 'gable', zinc: true, overhang: 0.25, pitch: 0.22, maxRise: 0.9, bay: 3, ground: ROW.shed, upper: [ROW.shed], parapet: 0,
  },
};

const WHITE = new THREE.Color(1, 1, 1);
const wallC = new THREE.Color(), footC = new THREE.Color(), roofC = new THREE.Color(), darkC = new THREE.Color(), propC = new THREE.Color();

/** Flat-shaded polygon (fan), wound to face up (`up`) or down, or away from (ix, iz) when `up` is null. */
function face(buf: GeoBuf, pts: number[][], c: THREE.Color, up: boolean | null, u: number, v: number, ix = 0, iz = 0): void {
  const a = pts[0], b = pts[1], d = pts[2];
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz);
  if (l < 1e-9) return;
  nx /= l; ny /= l; nz /= l;
  const out = up === null ? nx * (a[0] - ix) + nz * (a[2] - iz) : up ? ny : -ny;
  const flip = out < 0;
  if (flip) { nx = -nx; ny = -ny; nz = -nz; }
  const base = buf.count;
  for (const p of pts) buf.vert(p[0], p[1], p[2], nx, ny, nz, c, u, v);
  for (let i = 1; i < pts.length - 1; i++) {
    if (flip) buf.tri(base, base + i + 1, base + i);
    else buf.tri(base, base + i, base + i + 1);
  }
}

/** Upright box on axes (ax, az) / (-az, ax): four sides and a lid, in the wall mesh, in one colour. */
function box(walls: GeoBuf, cx: number, cz: number, hl: number, hs: number, ax: number, az: number, y0: number, y1: number, c: THREE.Color, lid = true): void {
  const P = [[-hl, -hs], [hl, -hs], [hl, hs], [-hl, hs]].map(([l, s]) => [cx + ax * l - az * s, cz + az * l + ax * s]);
  const [u, v] = PLAIN_UV;
  for (let i = 0; i < 4; i++) {
    const p = P[i], q = P[(i + 1) % 4];
    face(walls, [[p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]]], c, null, u, v, cx, cz);
  }
  if (lid) face(walls, P.map((p) => [p[0], y1, p[1]]), c, true, u, v);
}

/** Drop vertices on (nearly) straight runs. Flat [x, z, ...] in, same out. */
function simplify(r: number[]): number[] {
  const n = r.length / 2, out: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = (i + n - 1) % n, q = (i + 1) % n;
    const ax = r[i * 2] - r[p * 2], az = r[i * 2 + 1] - r[p * 2 + 1], bx = r[q * 2] - r[i * 2], bz = r[q * 2 + 1] - r[i * 2 + 1];
    const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
    if (la < 0.05) continue;
    if (lb > 0.05 && Math.abs(ax * bz - az * bx) / (la * lb) < 0.14 && ax * bx + az * bz > 0) continue;
    out.push(r[i * 2], r[i * 2 + 1]);
  }
  return out;
}

function flatCap(roofs: GeoBuf, outer: number[], holes: number[][], y: number, c: THREE.Color, kind: number, rust: number): void {
  let tris: number[][];
  try {
    tris = THREE.ShapeUtils.triangulateShape(toVec2(outer), holes.map(toVec2));
  } catch {
    return;
  }
  const base = roofs.count;
  for (const r of [outer, ...holes]) for (let i = 0; i < r.length; i += 2) roofs.vert(r[i], y, r[i + 1], 0, 1, 0, c, kind, rust);
  for (const t of tris) roofs.triUp(base + t[0], base + t[1], base + t[2]);
}

/**
 * Draw one typed building into the chunk's wall and roof buffers. `rings` are chunk-local metres ([outer, holes...]),
 * (ox, oz) the chunk origin. Far chunks (`ctx.detail` low) get the same silhouette and colours with one quad per
 * wall, no atlas and no small parts.
 */
export function addTypedBuilding(t: TypedBuilding, rings: number[][], ox: number, oz: number, ctx: BuildContext, walls: GeoBuf, roofs: GeoBuf): void {
  if (t.type === 'open_roof') return;
  const st = STYLE[t.type], h = t.hash, near = ctx.detail === 'high', fine = near && ctx.quality?.name !== 'low';
  const outer = rings[0], fp = t.fp;
  let gMin = Infinity, gSum = 0;
  for (let i = 0; i < outer.length; i += 2) {
    const g = ctx.height.sample(ox + outer[i], oz + outer[i + 1]);
    gMin = Math.min(gMin, g);
    gSum += g;
  }
  const ground = gSum / (outer.length / 2);
  const top = ground + t.height, floor = ground + t.stilt;
  const base = t.stilt && near ? floor : gMin - 0.3;

  wallC.setHex(st.walls[h % st.walls.length]);
  // Painted plaster reads a little lighter in the equatorial sun than the weathered swatches of the style guide.
  if (!st.zinc) wallC.lerp(WHITE, 0.22);
  wallC.multiplyScalar(0.94 + (((h >>> 16) % 100) / 100) * 0.12);
  if (!near) wallC.multiplyScalar(ROW_TONE);
  footC.copy(wallC).multiplyScalar(t.stilt && !near ? 0.5 : 0.8);
  const zinc = !!st.zinc || (t.type === 'school' && (h >>> 9) % 3 === 0);
  const roofList = zinc && !st.zinc ? ZINC_ROOFS : st.roofs;
  roofC.setHex(roofList[(h >>> 8) % roofList.length]).multiplyScalar((zinc ? 0.84 : 0.68) + ((h >>> 12) % 16) / 100);
  const kind = zinc ? ROOF_ZINC : ROOF_TILE;
  const rust = zinc ? (t.type === 'warehouse' ? 0.25 : 1) * (((h >>> 22) % 10) / 10) : 0;

  // ---- walls: one quad per storey (near), each with its own atlas row ----
  const upperRow = st.upper[(h >>> 10) % st.upper.length];
  const upperH = t.storeys > 1 ? (t.height - t.stilt - t.ground) / (t.storeys - 1) : 0;
  const [pu, pv] = PLAIN_UV;
  const quad = (ax: number, az: number, bx: number, bz: number, y0: number, y1: number, nx: number, nz: number, ccw: boolean, c0: THREE.Color, c1: THREE.Color, u0: number, u1: number, v0: number, v1: number) => {
    const A = walls.vert(ax, y0, az, nx, 0, nz, c0, u0, v0), B = walls.vert(bx, y0, bz, nx, 0, nz, c0, u1, v0);
    const A2 = walls.vert(ax, y1, az, nx, 0, nz, c1, u0, v1), B2 = walls.vert(bx, y1, bz, nx, 0, nz, c1, u1, v1);
    if (ccw) { walls.tri(B, A, A2); walls.tri(B, A2, B2); } else { walls.tri(A, B, B2); walls.tri(A, B2, A2); }
  };
  let run = h % 2;
  rings.forEach((r, ri) => {
    const ccw = ringArea(r) > 0 !== ri > 0; // holes face the other way
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      const ax = r[j], az = r[j + 1], bx = r[i], bz = r[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.01) continue;
      const s = ccw ? 1 : -1, nx = ((bz - az) / len) * s, nz = (-(bx - ax) / len) * s;
      if (!near) {
        quad(ax, az, bx, bz, base, top + st.parapet, nx, nz, ccw, footC, wallC, 0, 0, 0, 0);
        continue;
      }
      const blank = len < 1.7;
      const bays = Math.max(1, Math.round(len / st.bay));
      const u0 = blank ? pu : run / 2, u1 = blank ? pu : (run + bays) / 2;
      if (!blank) run += bays;
      // On a slope the ground storey keeps its proportions: a blank plinth takes up the fall.
      const plinth = !t.stilt && ground - gMin > 0.25;
      if (plinth) quad(ax, az, bx, bz, base, ground, nx, nz, ccw, footC, footC, pu, pu, pv, pv);
      for (let k = 0; k < t.storeys; k++) {
        const y0 = k === 0 ? (plinth ? ground : base) : floor + t.ground + (k - 1) * upperH, y1 = floor + t.ground + k * upperH;
        const v = blank ? [pv, pv] : rowV(k === 0 ? st.ground : upperRow);
        // N1-M6: a whole number of atlas repeats is added to u, different for every building and storey. The picture
        // does not move, but the bay number the shader reads from u (which windows are lit at night) differs.
        const uo = blank ? 0 : ((h >>> 3) % 53) + k * 7;
        quad(ax, az, bx, bz, y0, y1, nx, nz, ccw, k === 0 && !t.stilt ? footC : wallC, wallC, u0 + uo, u1 + uo, v[0], v[1]);
      }
      if (st.parapet) {
        quad(ax, az, bx, bz, top, top + st.parapet, nx, nz, ccw, wallC, wallC, pu, pu, pv, pv);
        if (fine) quad(ax, az, bx, bz, top, top + st.parapet, -nx, -nz, !ccw, footC, footC, pu, pu, pv, pv); // its inner face
        // Canopy slab over the shopfronts / podium: gives the street wall a shadow line.
        const depth = t.type === 'mall' ? 2.2 : t.type === 'midrise' ? 1.5 : 1.1;
        if (fine && len >= (t.type === 'mall' ? 18 : 6)) {
          const y = floor + t.ground, ex = nx * depth, ez = nz * depth;
          darkC.copy(wallC).multiplyScalar(0.86);
          face(walls, [[ax, y + 0.22, az], [bx, y + 0.22, bz], [bx + ex, y + 0.22, bz + ez], [ax + ex, y + 0.22, az + ez]], darkC, true, pu, pv);
          face(walls, [[ax + ex, y - 0.16, az + ez], [bx + ex, y - 0.16, bz + ez], [bx + ex, y + 0.22, bz + ez], [ax + ex, y + 0.22, az + ez]], darkC, null, pu, pv, ax, az);
          darkC.multiplyScalar(0.6);
          face(walls, [[ax, y - 0.16, az], [bx, y - 0.16, bz], [bx + ex, y - 0.16, bz + ez], [ax + ex, y - 0.16, az + ez]], darkC, false, pu, pv);
        }
      }
    }
  });

  // ---- kampung house: timber posts, the dark underside of the floor, a stair ----
  if (t.stilt && near) {
    const L = fp.long / 2 - 0.25, S = fp.short / 2 - 0.25;
    propC.setHex(0x9a958c).multiplyScalar(0.75 + ((h >>> 5) % 20) / 100);
    const spots = fine ? [[-L, -S], [L, -S], [L, S], [-L, S], [0, -S], [0, S]] : [[-L, -S], [L, -S], [L, S], [-L, S]];
    for (const [l, s] of spots) {
      const x = fp.cx + fp.ax * l - fp.az * s, z = fp.cz + fp.az * l + fp.ax * s;
      if (!pointInRing(x, z, outer)) continue;
      box(walls, x, z, 0.11, 0.11, fp.ax, fp.az, ctx.height.sample(ox + x, oz + z) - 0.2, floor, propC, false);
    }
    darkC.copy(wallC).multiplyScalar(0.34);
    try {
      const tris = THREE.ShapeUtils.triangulateShape(toVec2(outer), []);
      const b0 = walls.count;
      for (let i = 0; i < outer.length; i += 2) walls.vert(outer[i], floor, outer[i + 1], 0, -1, 0, darkC, pu, pv);
      for (const tr of tris) {
        const p = (k: number) => [outer[tr[k] * 2], outer[tr[k] * 2 + 1]];
        const [a, b, c] = [p(0), p(1), p(2)];
        // viewed from below: clockwise in (x, z)
        if ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 0) walls.tri(b0 + tr[0], b0 + tr[1], b0 + tr[2]);
        else walls.tri(b0 + tr[0], b0 + tr[2], b0 + tr[1]);
      }
    } catch { /* degenerate outline: no floor underside */ }
    if (fine) {
      const side = (h >>> 3) % 2 ? 1 : -1, along = (((h >>> 6) % 5) / 5 - 0.4) * fp.long * 0.5, S2 = fp.short / 2;
      const at = (l: number, s: number, y: number) => [fp.cx + fp.ax * l - fp.az * s * side, y, fp.cz + fp.az * l + fp.ax * s * side];
      const foot = at(along, S2 + t.stilt * 1.25, 0);
      const gy = ctx.height.sample(ox + foot[0], oz + foot[2]);
      propC.setHex(0x7d6a55);
      face(walls, [at(along - 0.55, S2, floor), at(along + 0.55, S2, floor), at(along + 0.55, S2 + t.stilt * 1.25, gy), at(along - 0.55, S2 + t.stilt * 1.25, gy)], propC, true, pu, pv);
    }
  }

  // ---- roof ----
  const holes = rings.slice(1);
  if (st.roof === 'flat') {
    flatCap(roofs, outer, holes, top, roofC, ROOF_TILE, 0);
    if (fine) roofPlant(t, outer, holes, top, walls);
    return;
  }
  const rise = Math.max(0.5, Math.min(st.maxRise, (fp.short / 2) * st.pitch));
  if (holes.length === 0 && fp.rect >= 0.78 && fp.short >= 2) {
    const hipped = st.roof === 'hip' || (st.roof === 'mixed' && (h >>> 20) % 3 !== 0);
    pitched(t, hipped && fp.long > fp.short * 1.15 ? 'hip' : hipped ? 'pyramid' : 'gable', top, rise, st.overhang, kind, rust, near, fine, roofs, walls);
    return;
  }
  // Irregular outline: slopes rising from every wall to an inset outline, flat on top.
  const ring = simplify(outer), area = Math.abs(ringArea(ring));
  const d = Math.min(3.4, Math.sqrt(area) * 0.17);
  const inner = holes.length === 0 && ring.length >= 6 && area > 30 ? insetRing(ring, d) : null;
  let ok = !!inner && Math.abs(ringArea(inner!)) > area * 0.25 && ringArea(inner!) > 0 === ringArea(ring) > 0;
  if (ok) for (let i = 0; i < inner!.length; i += 2) if (!pointInRing(inner![i], inner![i + 1], ring)) { ok = false; break; }
  if (!ok) {
    flatCap(roofs, outer, holes, top, roofC, kind, rust);
    return;
  }
  const r2 = Math.min(rise, d * 0.62), m = ring.length / 2;
  for (let i = 0, j = m - 1; i < m; j = i, i++) {
    face(roofs, [[ring[j * 2], top, ring[j * 2 + 1]], [ring[i * 2], top, ring[i * 2 + 1]], [inner![i * 2], top + r2, inner![i * 2 + 1]], [inner![j * 2], top + r2, inner![j * 2 + 1]]], roofC, true, kind, rust);
  }
  flatCap(roofs, inner!, [], top + r2, roofC, kind, rust);
}

/** Gable, hip or pyramid roof over the footprint's fitted rectangle, with overhanging eaves. */
function pitched(t: TypedBuilding, form: 'gable' | 'hip' | 'pyramid', top: number, rise: number, over: number, kind: number, rust: number, near: boolean, fine: boolean, roofs: GeoBuf, walls: GeoBuf): void {
  const fp = t.fp, L = fp.long / 2, S = fp.short / 2;
  const slope = rise / S;
  const o = near ? over : 0, og = form === 'gable' ? o * 0.6 : o; // far roofs sit flush: no eaves to see at that distance
  const ye = top - o * slope, yr = top + rise;
  const at = (l: number, s: number, y: number) => [fp.cx + fp.ax * l - fp.az * s, y, fp.cz + fp.az * l + fp.ax * s];
  const hipLen = form === 'gable' ? 0 : form === 'pyramid' ? L : Math.min(S, L * 0.75);
  const R0 = at(-(L - hipLen) - (form === 'gable' ? og : 0), 0, yr), R1 = at(L - hipLen + (form === 'gable' ? og : 0), 0, yr);
  const A = at(-L - og, -S - o, ye), B = at(L + og, -S - o, ye), C = at(L + og, S + o, ye), D = at(-L - og, S + o, ye);
  const slopes = form === 'pyramid' ? [[A, B, R0], [C, D, R0]] : [[A, B, R1, R0], [C, D, R0, R1]];
  for (const s of slopes) face(roofs, s, roofC, true, kind, rust);
  if (form === 'gable') {
    // Gable walls stand on the wall line, under the verge.
    const [pu, pv] = PLAIN_UV;
    for (const e of [-1, 1]) face(walls, [at(e * L, -S, top), at(e * L, S, top), at(e * L, 0, yr)], wallC, null, pu, pv, fp.cx, fp.cz);
  } else {
    face(roofs, [D, A, R0], roofC, true, kind, rust);
    face(roofs, [B, C, R1], roofC, true, kind, rust);
  }
  // The roof covers the fitted rectangle but the walls follow the real outline: a ceiling at the wall head closes the
  // gap over any notch, so no sky shows under the roof.
  if (near && fp.rect < 0.985) {
    darkC.copy(wallC).multiplyScalar(0.5);
    face(walls, [at(-L, -S, top), at(L, -S, top), at(L, S, top), at(-L, S, top)], darkC, false, PLAIN_UV[0], PLAIN_UV[1]);
  }
  if (!fine || o < 0.4) return;
  // Underside of the eaves, seen from the street.
  darkC.copy(wallC).multiplyScalar(0.55);
  const [pu, pv] = PLAIN_UV;
  for (const s of [-1, 1]) {
    face(walls, [at(-L - og, s * (S + o), ye), at(L + og, s * (S + o), ye), at(L + og, s * S, top), at(-L - og, s * S, top)], darkC, false, pu, pv);
  }
  if (form !== 'gable') for (const e of [-1, 1]) {
    face(walls, [at(e * (L + o), -S - o, ye), at(e * (L + o), S + o, ye), at(e * L, S, top), at(e * L, -S, top)], darkC, false, pu, pv);
  }
}

/** What stands on a flat roof: water tanks, a lift overrun, plant boxes. Positions are inferred. */
function roofPlant(t: TypedBuilding, outer: number[], holes: number[][], top: number, walls: GeoBuf): void {
  const fp = t.fp, h = t.hash;
  const put = (fl: number, fs: number, hl: number, hs: number, y0: number, y1: number, c: THREE.Color) => {
    const l = fl * fp.long * 0.5, s = fs * fp.short * 0.5;
    const x = fp.cx + fp.ax * l - fp.az * s, z = fp.cz + fp.az * l + fp.ax * s;
    // all four corners must stand on the roof
    for (const [a, b] of [[-hl, -hs], [hl, -hs], [hl, hs], [-hl, hs]]) {
      const px = x + fp.ax * a - fp.az * b, pz = z + fp.az * a + fp.ax * b;
      if (!pointInRing(px, pz, outer) || holes.some((hole) => pointInRing(px, pz, hole))) return;
    }
    box(walls, x, z, hl, hs, fp.ax, fp.az, y0, y1, c);
  };
  const f = (n: number) => (((h >>> n) % 16) / 16 - 0.5) * 1.2; // -0.6 .. 0.6 of the half extent
  const tank = () => propC.setHex((h >>> 7) % 3 ? 0x2b3644 : 0xa9b0b3);
  if (t.type === 'shophouse') {
    put(f(2), f(6), 0.8, 0.8, top, top + 1.7, tank());
    if (fp.area > 260) put(f(11), f(15), 0.8, 0.8, top, top + 1.7, tank());
    if (fp.area > 500) put(f(19), f(23), 1.8, 1.4, top, top + 2.3, propC.copy(wallC).multiplyScalar(0.9)); // stair head
  } else if (t.type === 'midrise') {
    put(f(2) * 0.5, f(6) * 0.5, Math.min(3, fp.long * 0.14), Math.min(2.4, fp.short * 0.18), top, top + 3.2, propC.copy(wallC).multiplyScalar(0.92)); // lift overrun
    put(f(11), f(15), 1.1, 1.1, top, top + 2.0, tank());
  } else if (t.type === 'mall') {
    propC.setHex(0x9a9c9a);
    for (let k = 0; k < 4; k++) put(-0.6 + k * 0.4, f(3 + k * 5) * 0.8, 3.2, 2.2, top, top + 2.6, propC);
  }
}
