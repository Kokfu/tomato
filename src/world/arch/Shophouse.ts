import * as THREE from 'three';
import { QUANT } from '../config.ts';
import type { BuildingData } from '../types.ts';
import type { GeoBuf } from '../Materials.ts';
import type { BuildContext } from '../ChunkManager.ts';
import { ARCADE_DEPTH, edgeOutward, hash3, insetEdges, pointInRingFlat, ringArea2, unitsAlong } from './frontage.ts';
import { TILE, tileUV, WHITE_UV } from './FacadeAtlas.ts';

// Kuching old-town shophouse rows, generated on the mapped building outline.
//
// What is real: the outline, which walls face a street, the street geometry.
// What is estimated (and deterministic per building id): two storeys, the lot rhythm (~5 m), the
// colours, window / shutter style and shopfront type of each lot. Nothing here invents a business:
// shop names come only from the places data set (see places/).

/** Heights above the building's ground datum (metres). */
export const SHOP = { beamBottom: 3.0, beamTop: 3.75, column: 0.36, floor: 0.05 };

const WALL_COLOURS = [
  0xf2efe6, 0xf3e3b0, 0xe9d28c, 0xcfe0d6, 0xbcd6e0, 0xf0c9b8, 0xe6b89c, 0xd8dde0, 0xf5d7dc, 0xa8c7c2, 0xe8e0d0, 0xd7b98f, 0xf7f3ea, 0xc9d9b8,
];
const TRIM = 0xf6f3ec;
const FLOOR_COLOURS = [0x9c5a48, 0x8f8a80, 0xb9ac94, 0x7d8a84, 0xa3836a, 0x6f6a66];
const BLIND_COLOURS = [0x3f6b4f, 0x2f5d85, 0xb9a271, 0x8a3b32];
/** Paint of roller shutters / timber doors (multiplies the grey / brown tile). */
const SHOPFRONT_TINTS = [0xc9c9c6, 0xb9c4cc, 0xbfd0c0, 0xd9d2bf, 0xa9b6c4, 0xd6c2b4, 0xc2c2c2];
const UPPER_TILES = [TILE.upperLouvre, TILE.upperArched, TILE.upperCasement, TILE.upperFrench];

const cWall = new THREE.Color(), cTrim = new THREE.Color(), cTmp = new THREE.Color(), cSide = new THREE.Color();
type P3 = [number, number, number];

/** Quad a-b-c-d (a, b bottom; c above b; d above a) facing along n. uv = [u0, v0, u1, v1]. */
export function quad(buf: GeoBuf, a: P3, b: P3, c: P3, d: P3, nx: number, ny: number, nz: number, col: THREE.Color, uv: readonly number[] = WHITE_UV): void {
  const i0 = buf.vert(a[0], a[1], a[2], nx, ny, nz, col, uv[0], uv[1]);
  const i1 = buf.vert(b[0], b[1], b[2], nx, ny, nz, col, uv[2], uv[1]);
  const i2 = buf.vert(c[0], c[1], c[2], nx, ny, nz, col, uv[2], uv[3]);
  const i3 = buf.vert(d[0], d[1], d[2], nx, ny, nz, col, uv[0], uv[3]);
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
  const f = (uy * vz - uz * vy) * nx + (uz * vx - ux * vz) * ny + (ux * vy - uy * vx) * nz;
  if (f >= 0) { buf.tri(i0, i1, i2); buf.tri(i0, i2, i3); } else { buf.tri(i0, i2, i1); buf.tri(i0, i3, i2); }
}
/** Vertical wall strip from (ax, az) to (bx, bz) between y0 and y1, facing (nx, nz). */
export function wall(buf: GeoBuf, ax: number, az: number, bx: number, bz: number, y0: number, y1: number, nx: number, nz: number, col: THREE.Color, uv: readonly number[] = WHITE_UV): void {
  quad(buf, [ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], nx, 0, nz, col, uv);
}
/** Axis-free box: centre line start (x, z), extents along (ex, ez) and outward (nx, nz). Draws the 3 visible sides + optional top/bottom. */
export function box(buf: GeoBuf, x: number, z: number, ex: number, ez: number, nx: number, nz: number, half: number, back: number, front: number, y0: number, y1: number, col: THREE.Color, caps = false): void {
  const ax = x - ex * half, az = z - ez * half, bx = x + ex * half, bz = z + ez * half;
  wall(buf, ax + nx * front, az + nz * front, bx + nx * front, bz + nz * front, y0, y1, nx, nz, col);
  wall(buf, ax + nx * back, az + nz * back, ax + nx * front, az + nz * front, y0, y1, -ex, -ez, col);
  wall(buf, bx + nx * front, bz + nz * front, bx + nx * back, bz + nz * back, y0, y1, ex, ez, col);
  wall(buf, bx + nx * back, bz + nz * back, ax + nx * back, az + nz * back, y0, y1, -nx, -nz, col);
  if (!caps) return;
  quad(buf, [ax + nx * back, y1, az + nz * back], [bx + nx * back, y1, bz + nz * back], [bx + nx * front, y1, bz + nz * front], [ax + nx * front, y1, az + nz * front], 0, 1, 0, col);
  quad(buf, [ax + nx * back, y0, az + nz * back], [bx + nx * back, y0, bz + nz * back], [bx + nx * front, y0, bz + nz * front], [ax + nx * front, y0, az + nz * front], 0, -1, 0, col);
}

export interface RowFrame {
  /** Outer ring, chunk-local metres. */
  ring: number[];
  /** Ring with the frontage edges moved back behind the five-foot way. */
  inner: number[];
  area2: number;
  /** Ground datum (mean terrain under the outline). */
  ground: number;
  gMin: number;
  top: number;
}

export function rowFrame(b: BuildingData, ox: number, oz: number, ctx: BuildContext): RowFrame {
  const ring = b.r[0].map((v) => v / QUANT);
  let gMin = Infinity, gSum = 0;
  for (let i = 0; i < ring.length; i += 2) {
    const g = ctx.height.sample(ox + ring[i], oz + ring[i + 1]);
    gMin = Math.min(gMin, g);
    gSum += g;
  }
  const ground = gSum / (ring.length / 2);
  return { ring, inner: insetEdges(ring, b.a!.f, ARCADE_DEPTH), area2: ringArea2(ring), ground, gMin, top: ground + b.h / QUANT };
}

/** Per-lot style, a pure function of (building id, edge, unit index). */
export function unitStyle(id: number, edge: number, unit: number): { wall: number; upper: number; ground: number; floor: number; parapet: number; blind: number; ac: boolean; h: number } {
  let u = unit;
  // Neighbouring lots are often one building painted alike: 35 % chance to continue the previous colour.
  while (u > 0 && hash3(id, edge * 131 + 7, u) % 100 < 35) u--;
  const h = hash3(id, edge, unit), hc = hash3(id, edge, u);
  const g = (h >>> 8) % 100;
  return {
    wall: WALL_COLOURS[hc % WALL_COLOURS.length],
    upper: UPPER_TILES[(hc >>> 6) % UPPER_TILES.length],
    ground: g < 55 ? TILE.groundShutter : g < 80 ? TILE.groundTimber : TILE.groundOpen,
    floor: FLOOR_COLOURS[(h >>> 12) % FLOOR_COLOURS.length],
    parapet: ((hc >>> 16) % 4) * 0.18,
    blind: (h >>> 20) % 5 === 0 ? BLIND_COLOURS[(h >>> 23) % BLIND_COLOURS.length] : -1,
    ac: (h >>> 26) % 3 === 0,
    h,
  };
}

/**
 * Position on the sign fascia of a frontage edge, for the places/sign system. t is 0..1 along the
 * edge. Returns chunk-local position, the outward normal and the width of the lot at t.
 */
export function fasciaAt(fr: RowFrame, edge: number, t: number): { x: number; y: number; z: number; nx: number; nz: number; ex: number; ez: number; unitW: number; unitCentreT: number } {
  const n = fr.ring.length / 2, j = (edge + 1) % n;
  const ax = fr.ring[edge * 2], az = fr.ring[edge * 2 + 1], bx = fr.ring[j * 2], bz = fr.ring[j * 2 + 1];
  const len = Math.hypot(bx - ax, bz - az) || 1;
  const [nx, nz] = edgeOutward(fr.ring, edge, fr.area2);
  const u = unitsAlong(len);
  const unit = Math.min(u.n - 1, Math.max(0, Math.floor(t * u.n)));
  const ct = (unit + 0.5) / u.n;
  return { x: ax + (bx - ax) * ct, y: fr.ground + (SHOP.beamBottom + SHOP.beamTop) / 2, z: az + (bz - az) * ct, nx, nz, ex: (bx - ax) / len, ez: (bz - az) / len, unitW: u.w, unitCentreT: ct };
}

/** Full-detail shophouse row: five-foot way, columns, shopfronts, fascia, upper facades, plain side walls. */
export function addShophouseRow(b: BuildingData, ox: number, oz: number, ctx: BuildContext, buf: GeoBuf): RowFrame {
  const fr = rowFrame(b, ox, oz, ctx);
  const { ring, inner, ground, top } = fr;
  const n = ring.length / 2;
  const front = new Set(b.a!.f);
  const yBase = fr.gMin - 0.4, yBeam0 = ground + SHOP.beamBottom, yBeam1 = ground + SHOP.beamTop;
  const simple = ctx.detail !== 'high';
  // One window tile per upper storey (levels come from building:levels, else the 2-storey estimate).
  const upperLevels = Math.max(1, Math.min(4, (b.a!.lv || 2) - 1));
  cTrim.setHex(TRIM);
  cSide.setHex(0xddd6c6).multiplyScalar(0.9 + (hash3(b.id) % 12) / 100);

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = ring[i * 2], az = ring[i * 2 + 1], bx = ring[j * 2], bz = ring[j * 2 + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.02) continue;
    const [nx, nz] = edgeOutward(ring, i, fr.area2);
    const ex = (bx - ax) / len, ez = (bz - az) / len;
    const qax = inner[i * 2], qaz = inner[i * 2 + 1], qbx = inner[j * 2], qbz = inner[j * 2 + 1];

    if (!front.has(i)) {
      // Side / rear wall: plain weathered plaster. Below the beam it follows the recessed outline so
      // the ends of the five-foot way stay open, exactly like the collision outline.
      if (simple) { wall(buf, ax, az, bx, bz, yBase, top, nx, nz, cSide); continue; }
      if (Math.hypot(qbx - qax, qbz - qaz) > 0.05) wall(buf, qax, qaz, qbx, qbz, yBase, yBeam0, nx, nz, cSide);
      wall(buf, ax, az, bx, bz, yBeam0, top, nx, nz, cSide);
      continue;
    }

    const { n: units, w } = unitsAlong(len);
    for (let u = 0; u < units; u++) {
      const st = unitStyle(b.id, i, u);
      const t0 = u / units, t1 = (u + 1) / units;
      const p0x = ax + (bx - ax) * t0, p0z = az + (bz - az) * t0, p1x = ax + (bx - ax) * t1, p1z = az + (bz - az) * t1;
      cWall.setHex(st.wall).multiplyScalar(0.94 + ((st.h >>> 4) % 10) / 100);
      const yTop = top + st.parapet;
      if (simple) {
        // Distant rows keep the lot colours and the dark band of the five-foot way.
        cTmp.copy(cWall).multiplyScalar(0.5);
        wall(buf, p0x, p0z, p1x, p1z, yBase, yBeam0, nx, nz, cTmp);
        for (let l = 0; l < upperLevels; l++) wall(buf, p0x, p0z, p1x, p1z, yBeam0 + ((top - yBeam0) * l) / upperLevels, l === upperLevels - 1 ? yTop : yBeam0 + ((top - yBeam0) * (l + 1)) / upperLevels, nx, nz, cWall, tileUV(st.upper));
        continue;
      }
      const q0x = qax + (qbx - qax) * t0, q0z = qaz + (qbz - qaz) * t0, q1x = qax + (qbx - qax) * t1, q1z = qaz + (qbz - qaz) * t1;
      const fy = Math.max(ctx.height.sample(ox + (p0x + p1x) / 2, oz + (p0z + p1z) / 2), ctx.height.sample(ox + (q0x + q1x) / 2, oz + (q0z + q1z) / 2)) + SHOP.floor;

      // Five-foot way: tiled floor, shaded ceiling, recessed shopfront.
      cTmp.setHex(st.floor);
      const ft = tileUV(TILE.floorTile);
      quad(buf, [p0x, fy, p0z], [p1x, fy, p1z], [q1x, fy, q1z], [q0x, fy, q0z], 0, 1, 0, cTmp, [ft[0], ft[1], ft[2], ft[1] + (ft[3] - ft[1]) * 0.46]);
      wall(buf, p0x, p0z, p1x, p1z, fy - 0.5, fy, nx, nz, cTmp.multiplyScalar(0.8));
      cTmp.setRGB(0.8, 0.79, 0.75); // whitewashed ceiling, lit only by bounce light
      quad(buf, [p0x, yBeam0, p0z], [p1x, yBeam0, p1z], [q1x, yBeam0, q1z], [q0x, yBeam0, q0z], 0, -1, 0, cTmp);
      if (st.ground === TILE.groundOpen) cTmp.setRGB(0.8, 0.79, 0.77);
      else cTmp.setHex(SHOPFRONT_TINTS[(st.h >>> 9) % SHOPFRONT_TINTS.length]).multiplyScalar(0.92);
      wall(buf, q0x, q0z, q1x, q1z, fy, yBeam0, nx, nz, cTmp, tileUV(st.ground));
      // Party walls between lots inside the arcade are open; only the row ends close (side walls).

      // Sign fascia / beam, then the upper facade with its windows.
      cTmp.copy(cWall).multiplyScalar(0.86);
      wall(buf, p0x, p0z, p1x, p1z, yBeam0, yBeam1, nx, nz, cTmp);
      for (let l = 0; l < upperLevels; l++) wall(buf, p0x, p0z, p1x, p1z, yBeam1 + ((top - yBeam1) * l) / upperLevels, l === upperLevels - 1 ? yTop : yBeam1 + ((top - yBeam1) * (l + 1)) / upperLevels, nx, nz, cWall, tileUV(st.upper));
      // Cornice under the parapet and a string course above the fascia.
      const mx = (p0x + p1x) / 2, mz = (p0z + p1z) / 2;
      box(buf, mx, mz, ex, ez, nx, nz, w / 2, 0, 0.14, yTop - 0.24, yTop, cTrim, true);
      box(buf, mx, mz, ex, ez, nx, nz, w / 2, 0, 0.09, yBeam1 - 0.02, yBeam1 + 0.12, cTrim, true);

      // Column at the start of each lot (and at the end of the row), pilaster above it.
      const colAt = (x: number, z: number) => {
        cTmp.copy(cWall).multiplyScalar(0.97);
        box(buf, x, z, ex, ez, nx, nz, SHOP.column / 2, -SHOP.column, 0.02, fy - 0.5, yBeam0, cTmp);
        box(buf, x, z, ex, ez, nx, nz, SHOP.column / 2 + 0.06, -SHOP.column - 0.04, 0.06, yBeam0 - 0.16, yBeam0, cTrim, true);
        box(buf, x, z, ex, ez, nx, nz, 0.17, 0, 0.07, yBeam1, yTop, cTrim);
      };
      colAt(p0x + ex * (u === 0 ? SHOP.column / 2 : 0), p0z + ez * (u === 0 ? SHOP.column / 2 : 0));
      if (u === units - 1) colAt(p1x - ex * (SHOP.column / 2), p1z - ez * (SHOP.column / 2));

      // Roll-down bamboo / canvas blind hanging between the columns of some lots.
      if (st.blind >= 0) {
        cTmp.setHex(st.blind);
        const drop = 0.7 + ((st.h >>> 14) % 5) * 0.12;
        const s0x = p0x + ex * 0.3 - nx * 0.06, s0z = p0z + ez * 0.3 - nz * 0.06, s1x = p1x - ex * 0.3 - nx * 0.06, s1z = p1z - ez * 0.3 - nz * 0.06;
        wall(buf, s0x, s0z, s1x, s1z, yBeam0 - drop, yBeam0, nx, nz, cTmp, tileUV(TILE.blind));
      }
      // Air-conditioner condenser on the upper wall (very common on these rows).
      if (st.ac && yTop - yBeam1 > 2.4) {
        cTmp.setRGB(0.8, 0.81, 0.8);
        const ct = 0.16 + ((st.h >>> 17) % 3) * 0.02;
        const cx = p0x + (p1x - p0x) * ct, cz = p0z + (p1z - p0z) * ct;
        // Bracket-mounted beside the pilaster, clear of the cornice and string course.
        box(buf, cx, cz, ex, ez, nx, nz, 0.36, 0.02, 0.3, yBeam1 + 0.55, yBeam1 + 1.05, cTmp, true);
        cTmp.setRGB(0.45, 0.46, 0.46);
        box(buf, cx, cz, ex, ez, nx, nz, 0.3, 0, 0.26, yBeam1 + 0.5, yBeam1 + 0.55, cTmp, true);
      }
    }
  }
  return fr;
}

const TERRACOTTA = [0xa5573f, 0x9a4f3a, 0xb0634a, 0x8f4a38, 0x86503f];
const ZINC = [0x8d8a84, 0x9a968e, 0x7f8283];
const cRoof = new THREE.Color();

/**
 * Roof of a shophouse row: a pitched clay-tile roof whose ridge runs parallel to each street
 * frontage (the traditional form), with the deep rear of the block under flat / zinc roofing.
 * Roof shapes are not mapped; this is an inferred form. Returns false when the outline is too
 * shallow or irregular for it, in which case the caller falls back to the generic roof.
 */
export function addRowRoof(b: BuildingData, fr: RowFrame, roofs: GeoBuf, walls: GeoBuf): boolean {
  const { ring, top } = fr;
  const n = ring.length / 2;
  const area = Math.abs(fr.area2) / 2;
  const depth = Math.min(11, Math.sqrt(area) * 0.42);
  if (depth < 5) return false;
  const front = b.a!.f;
  const mid = insetEdges(ring, front, depth / 2), back = insetEdges(ring, front, depth);
  const backArea2 = ringArea2(back);
  if (backArea2 > 0 !== fr.area2 > 0 || Math.abs(backArea2) < Math.abs(fr.area2) * 0.2) return false;
  for (let i = 0; i < back.length; i += 2) {
    // The rear line must stay inside the outline (tolerating vertices that slid along an edge).
    const cx = back[i], cz = back[i + 1];
    let ok = pointInRingFlat(cx, cz, ring);
    if (!ok) for (let k = 0; k < n && !ok; k++) { const j = (k + 1) % n; const ax = ring[k * 2], az = ring[k * 2 + 1], vx = ring[j * 2] - ax, vz = ring[j * 2 + 1] - az; const l2 = vx * vx + vz * vz || 1; const t = Math.max(0, Math.min(1, ((cx - ax) * vx + (cz - az) * vz) / l2)); if (Math.hypot(ax + vx * t - cx, az + vz * t - cz) < 0.2) ok = true; }
    if (!ok) return false;
  }
  const h = hash3(b.id, 77);
  const rise = depth * 0.26;
  const isFront = new Set(front);
  const slope = (p0: P3, p1: P3, p2: P3, p3: P3) => {
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2], vx = p3[0] - p0[0], vy = p3[1] - p0[1], vz = p3[2] - p0[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
    quad(roofs, p0, p1, p2, p3, nx / l, ny / l, nz / l, cRoof);
  };
  for (const i of front) {
    const j = (i + 1) % n;
    // Slight per-lot colour drift so a long roof does not read as one flat sheet.
    cRoof.setHex(TERRACOTTA[(h + i) % TERRACOTTA.length]).multiplyScalar(0.8 + ((h >>> (i % 12)) % 16) / 100);
    const f0: P3 = [ring[i * 2], top, ring[i * 2 + 1]], f1: P3 = [ring[j * 2], top, ring[j * 2 + 1]];
    const m0: P3 = [mid[i * 2], top + rise, mid[i * 2 + 1]], m1: P3 = [mid[j * 2], top + rise, mid[j * 2 + 1]];
    const b0: P3 = [back[i * 2], top, back[i * 2 + 1]], b1: P3 = [back[j * 2], top, back[j * 2 + 1]];
    slope(f0, f1, m1, m0);
    slope(m0, m1, b1, b0);
    // Party walls rising through the roof at every lot boundary: the signature silhouette of a
    // shophouse row from above. Lot boundaries are the same estimated ones the facade uses.
    const len = Math.hypot(f1[0] - f0[0], f1[2] - f0[2]);
    const lots = unitsAlong(len).n;
    cTmp.setHex(0xe6e1d6);
    const [onx, onz] = edgeOutward(ring, i, fr.area2);
    const ux = -onz, uz = onx;
    for (let k = 1; k < lots; k++) {
      const t = k / lots, L = (a: P3, c: P3): P3 => [a[0] + (c[0] - a[0]) * t, a[1], a[2] + (c[2] - a[2]) * t];
      const pf = L(f0, f1), pm = L(m0, m1), pb = L(b0, b1), up = 0.3;
      for (const [a, c] of [[pf, pm], [pm, pb]] as [P3, P3][]) {
        quad(walls, [a[0], a[1] - 0.05, a[2]], [c[0], c[1] - 0.05, c[2]], [c[0], c[1] + up, c[2]], [a[0], a[1] + up, a[2]], ux, 0, uz, cTmp);
      }
    }
    // Gable ends where the frontage stops at a side wall.
    cSide.setHex(0xddd6c6).multiplyScalar(0.88);
    const gable = (f: P3, m: P3, bk: P3, edge: number) => {
      const [gx, gz] = edgeOutward(ring, edge, fr.area2);
      const a = walls.vert(f[0], f[1], f[2], gx, 0, gz, cSide, WHITE_UV[0], WHITE_UV[1]);
      const c = walls.vert(m[0], m[1], m[2], gx, 0, gz, cSide, WHITE_UV[0], WHITE_UV[1]);
      const d = walls.vert(bk[0], bk[1], bk[2], gx, 0, gz, cSide, WHITE_UV[0], WHITE_UV[1]);
      walls.tri(a, c, d);
    };
    if (!isFront.has((i + n - 1) % n)) gable(f0, m0, b0, (i + n - 1) % n);
    if (!isFront.has(j)) gable(f1, m1, b1, j);
  }
  // Rear of the block: flat roofing a little below the eaves line.
  cRoof.setHex(ZINC[h % ZINC.length]).multiplyScalar(0.9 + ((h >>> 5) % 12) / 100);
  const contour: THREE.Vector2[] = [];
  for (let i = 0; i < back.length; i += 2) contour.push(new THREE.Vector2(back[i], back[i + 1]));
  let tris: number[][];
  try { tris = THREE.ShapeUtils.triangulateShape(contour, []); } catch { return true; }
  const base = roofs.count;
  for (let i = 0; i < back.length; i += 2) roofs.vert(back[i], top - 0.15, back[i + 1], 0, 1, 0, cRoof);
  for (const t of tris) roofs.triUp(base + t[0], base + t[1], base + t[2]);
  // Low wall closing the gap between the rear eaves and the flat roof.
  for (const i of front) {
    const j = (i + 1) % n;
    const [nx, nz] = edgeOutward(ring, i, fr.area2);
    const a = roofs.vert(back[i * 2], top - 0.15, back[i * 2 + 1], -nx, 0, -nz, cRoof), c = roofs.vert(back[j * 2], top - 0.15, back[j * 2 + 1], -nx, 0, -nz, cRoof);
    const d = roofs.vert(back[j * 2], top, back[j * 2 + 1], -nx, 0, -nz, cRoof), e = roofs.vert(back[i * 2], top, back[i * 2 + 1], -nx, 0, -nz, cRoof);
    roofs.tri(a, c, d); roofs.tri(a, d, e); roofs.tri(a, d, c); roofs.tri(a, e, d);
  }
  return true;
}
