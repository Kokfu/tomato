import * as THREE from 'three';
import { CHUNK_SIZE, QUANT } from './config.ts';
import type { ChunkData, BuildingData } from './types.ts';
import { BUILDING_KINDS } from './types.ts';
import { GeoBuf } from './Materials.ts';
import { toVec2 } from './RoadBuilder.ts';
import { insetRing, pointInRing } from './landmarks/kit.ts';
import type { BuildContext } from './ChunkManager.ts';
import { addShophouseRow, addRowRoof } from './arch/Shophouse.ts';
import { addHeritageRow, addHeritageRoof } from './arch/HeritageRow.ts';
import { inDistrict, isDistrictRow } from './district/mainBazaar.ts';
import { assertGeneric, isProtectedLandmark, mayHaveShopfront } from './landmarks/protect.ts';
import { v5Exclusion } from '../v5/geo.ts';
import { addFarTrees } from './VegetationBuilder.ts';
import { typedBuildings } from './arch/buildingType.ts';
import { addTypedBuilding } from './arch/TypedBuilding.ts';
import { ROW, rowV, PLAIN_UV } from './arch/CityAtlas.ts';

type Kind = (typeof BUILDING_KINDS)[number];
const WALLS: Record<Kind, number[]> = {
  generic: [0xdcd5c8, 0xd2c9b7, 0xe6e0d3, 0xcbc1b0, 0xd9d0c2, 0xc4cacd, 0xe2d6bf],
  house: [0xe9e2d3, 0xdcd2c0, 0xedddc6, 0xdfd9cf, 0xd8c9b0],
  commercial: [0xd6d0c4, 0xc9d0d4, 0xe0d8c8, 0xcfc8ba, 0xd9c7ae],
  shophouse: [0xe8d9b8, 0xd9c4a0, 0xe3cfc0, 0xcfd8cf, 0xe6dcc8],
  religious: [0xf0ece2, 0xe9e1cf, 0xf2e6d0],
  civic: [0xf0ede6, 0xe6e2d8, 0xe9e4d6],
  industrial: [0xb9bec2, 0xc5c3bb, 0xaeb6bb],
  roof: [0xb8b4aa, 0xa9aeb0],
  tower: [0xbfcad3, 0xc9d1d6, 0xd5d3cc, 0xb4c0cb],
  hut: [0xcbbfa8, 0xbfb5a2, 0xd4cbb9],
};
const ROOFS: Record<Kind, number[]> = {
  generic: [0x8e8f91, 0x9b968f, 0x7f8387, 0xa08a7c, 0x8a7468],
  house: [0x9c4f3a, 0x8b4c3c, 0x74584a, 0x5f6973, 0xa3604a],
  commercial: [0x8c8e90, 0x9a9792, 0x7d8185],
  shophouse: [0x9a5440, 0x8a4d3b, 0xa0644e],
  religious: [0x8c4a36, 0x5d7a68, 0x9a8a5a],
  civic: [0x8a5a48, 0x7f8589, 0x9c9a94],
  industrial: [0x8d989f, 0x9ea3a5, 0x7c8890],
  roof: [0x9aa0a4, 0xb0a99c, 0x8f6f5c],
  tower: [0x7c8388, 0x8a8f93],
  hut: [0x8d7663, 0x7c7f82],
};

// Machine-detected footprints (Overture: Microsoft / Google) get one neutral palette and a plain
// flat roof: no inferred roof shape or building type is drawn on top of lower-certainty outlines.
const ML_WALLS = [0xd2cfc7, 0xcdcac3, 0xd7d4cd];
const ML_ROOFS = [0x9b9b98, 0x939492, 0xa3a29e];

function hashId(id: number): number {
  let h = Math.imul(id | 0, 2654435761) ^ (id / 4294967296) | 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  return (h ^ (h >>> 13)) >>> 0;
}
function area2(r: number[]): number {
  let a = 0;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) a += r[j] * r[i + 1] - r[i] * r[j + 1];
  return a;
}

const wallColor = new THREE.Color();
const roofColor = new THREE.Color();
const footColor = new THREE.Color();
const BAY = 3.4;

function addBuilding(b: BuildingData, ox: number, oz: number, ctx: BuildContext, walls: GeoBuf, roofs: GeoBuf, skipWalls = false): void {
  assertGeneric(b, 'extruded building');
  const kind = BUILDING_KINDS[b.k];
  const h = hashId(b.id);
  const ml = !!b.s;
  wallColor.setHex(ml ? ML_WALLS[h % ML_WALLS.length] : WALLS[kind][h % WALLS[kind].length]);
  roofColor.setHex(ml ? ML_ROOFS[(h >>> 8) % ML_ROOFS.length] : ROOFS[kind][(h >>> 8) % ROOFS[kind].length]);
  const shade = 0.93 + ((h >>> 16) % 100) / 100 * 0.1;
  wallColor.multiplyScalar(shade);

  const rings = b.r.map((r) => r.map((v) => v / QUANT));
  // Base follows the lowest ground under the footprint; the roof sits at mean ground + height.
  let gMin = Infinity, gSum = 0, n = 0;
  const outer = rings[0];
  for (let i = 0; i < outer.length; i += 2) {
    const g = ctx.height.sample(ox + outer[i], oz + outer[i + 1]);
    gMin = Math.min(gMin, g);
    gSum += g;
    n++;
  }
  const height = b.h / QUANT;
  const top = gSum / n + height;
  const isRoof = kind === 'roof';
  const y0 = isRoof ? top - 0.35 : gMin - 0.3;

  if (!skipWalls) rings.forEach((r, ri) => {
    const ccw = area2(r) > 0 !== ri > 0; // holes face the other way
    let u = 0;
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      const ax = r[j], az = r[j + 1], bx = r[i], bz = r[i + 1];
      const dx = bx - ax, dz = bz - az;
      const len = Math.hypot(dx, dz);
      if (len < 0.01) continue;
      const s = ccw ? 1 : -1;
      const nx = (dz / len) * s, nz = (-dx / len) * s;
      // Whole number of bays per wall so windows are not cut at corners.
      const bays = Math.max(1, Math.round(len / BAY));
      // One storey of the city atlas (arch/CityAtlas.ts) stretched over the wall; open roofs get blank wall.
      const u0 = isRoof ? PLAIN_UV[0] : u / 2, u1 = isRoof ? PLAIN_UV[0] : (u + bays) / 2;
      const [v0, v1] = isRoof ? [PLAIN_UV[1], PLAIN_UV[1]] : rowV(ROW.houseGround);
      // Darker wall foot: a cheap ambient-occlusion gradient where the wall meets the ground.
      footColor.copy(wallColor).multiplyScalar(isRoof ? 1 : 0.72);
      const A = walls.vert(ax, y0, az, nx, 0, nz, footColor, u0, v0);
      const B = walls.vert(bx, y0, bz, nx, 0, nz, footColor, u1, v0);
      const A2 = walls.vert(ax, top, az, nx, 0, nz, wallColor, u0, v1);
      const B2 = walls.vert(bx, top, bz, nx, 0, nz, wallColor, u1, v1);
      if (ccw) { walls.tri(B, A, A2); walls.tri(B, A2, B2); } else { walls.tri(A, B, B2); walls.tri(A, B2, A2); }
      u += bays;
    }
  });

  // Small, simple rectangular footprints get an inferred pitched roof instead of a flat cap.
  if (!ml && !isRoof && rings.length === 1 && addPitchedRoof(kind, h, rings[0], top, height, roofs)) return;

  // Other low-rise blocks (e.g. shophouse rows mapped as one irregular outline) get an inferred
  // tiled roof edge: slopes rising from every wall to an inset outline, flat on top.
  let capRing = rings[0], capY = top;
  if (!ml && !isRoof && rings.length === 1 && PITCHED[kind] && height <= 12) {
    const ring = simplifyRing(rings[0]);
    const area = Math.abs(area2(ring)) / 2;
    const d = Math.min(3.2, Math.sqrt(area) * 0.16);
    const inner = ring.length >= 6 && area > 40 ? insetRing(ring, d) : null;
    let ok = !!inner && Math.abs(area2(inner!)) / 2 > area * 0.3 && area2(inner!) > 0 === area2(ring) > 0;
    if (ok) for (let i = 0; i < inner!.length; i += 2) if (!pointInRing(inner![i], inner![i + 1], ring)) { ok = false; break; }
    if (ok) {
      const rise = d * 0.62;
      roofColor.setHex(TERRACOTTA[(h >>> 8) % TERRACOTTA.length]).multiplyScalar(0.8 + ((h >>> 12) % 16) / 100);
      const m = ring.length / 2;
      for (let i = 0, j = m - 1; i < m; j = i, i++) {
        const ux = ring[i * 2] - ring[j * 2], uz = ring[i * 2 + 1] - ring[j * 2 + 1];
        const vx = inner![j * 2] - ring[j * 2], vz = inner![j * 2 + 1] - ring[j * 2 + 1];
        // flat normal of the slope (up-facing)
        let nx = -uz * rise, ny = uz * vx - ux * vz, nz = ux * rise;
        if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
        const l = Math.hypot(nx, ny, nz) || 1;
        const b0 = roofs.count;
        roofs.vert(ring[j * 2], top, ring[j * 2 + 1], nx / l, ny / l, nz / l, roofColor);
        roofs.vert(ring[i * 2], top, ring[i * 2 + 1], nx / l, ny / l, nz / l, roofColor);
        roofs.vert(inner![i * 2], top + rise, inner![i * 2 + 1], nx / l, ny / l, nz / l, roofColor);
        roofs.vert(inner![j * 2], top + rise, inner![j * 2 + 1], nx / l, ny / l, nz / l, roofColor);
        roofs.triUp(b0, b0 + 1, b0 + 2);
        roofs.triUp(b0, b0 + 2, b0 + 3);
      }
      capRing = inner!;
      capY = top + rise;
    }
  }

  // Roof (flat cap following the mapped footprint, holes preserved).
  const contour = toVec2(capRing);
  const holes = rings.slice(1).map(toVec2);
  let tris: number[][];
  try {
    tris = THREE.ShapeUtils.triangulateShape(contour, holes);
  } catch {
    return;
  }
  const base = roofs.count;
  for (const r of [capRing, ...rings.slice(1)]) for (let i = 0; i < r.length; i += 2) roofs.vert(r[i], capY, r[i + 1], 0, 1, 0, roofColor);
  for (const t of tris) roofs.triUp(base + t[0], base + t[1], base + t[2]);
  if (!isRoof) return;

  // Open-sided roof (OSM building=roof): add the underside, so it does not vanish when seen from
  // below, and simple support posts. Post positions are inferred (corners and long edges), posts
  // are visual only (open roofs have no collision).
  soffitColor.copy(wallColor).multiplyScalar(1.1);
  const ub = roofs.count;
  for (const r of rings) for (let i = 0; i < r.length; i += 2) roofs.vert(r[i], y0, r[i + 1], 0, -1, 0, soffitColor);
  for (const t of tris) {
    // opposite winding of the top face
    const a = ub + t[0], bI = ub + t[1], c = ub + t[2];
    const before = roofs.idx.length;
    roofs.triUp(a, bI, c);
    const i1 = roofs.idx[before + 1];
    roofs.idx[before + 1] = roofs.idx[before + 2];
    roofs.idx[before + 2] = i1;
  }
  if (ctx.detail !== 'high') return;
  const ring = simplifyRing(rings[0]);
  const m = ring.length / 2;
  let cxm = 0, czm = 0;
  for (let i = 0; i < m; i++) { cxm += ring[i * 2] / m; czm += ring[i * 2 + 1] / m; }
  const posts: number[] = [];
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m;
    const ax = ring[i * 2], az = ring[i * 2 + 1], bx = ring[j * 2], bz = ring[j * 2 + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const parts = Math.max(1, Math.round(len / 7));
    for (let k = 0; k < parts; k++) posts.push(ax + ((bx - ax) * k) / parts, az + ((bz - az) * k) / parts);
  }
  const stride = Math.max(1, Math.ceil(posts.length / 2 / 16)); // at most 16 posts per roof
  for (let i = 0; i < posts.length / 2; i += stride) {
    // pull the post slightly under the roof
    let px = posts[i * 2], pz = posts[i * 2 + 1];
    const dl = Math.hypot(cxm - px, czm - pz) || 1;
    const pull = Math.min(0.35, dl * 0.3);
    px += ((cxm - px) / dl) * pull; pz += ((czm - pz) / dl) * pull;
    const ground = ctx.height.sample(ox + px, oz + pz) - 0.2;
    if (y0 - ground < 0.5) continue;
    const hw = 0.11;
    const c: [number, number][] = [[px - hw, pz - hw], [px + hw, pz - hw], [px + hw, pz + hw], [px - hw, pz + hw]];
    const nrm: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    for (let k = 0; k < 4; k++) {
      const p = c[k], q = c[(k + 1) % 4];
      const [pu, pv] = PLAIN_UV;
      const A = walls.vert(p[0], ground, p[1], nrm[k][0], 0, nrm[k][1], soffitColor, pu, pv);
      const B = walls.vert(q[0], ground, q[1], nrm[k][0], 0, nrm[k][1], soffitColor, pu, pv);
      const A2 = walls.vert(p[0], y0, p[1], nrm[k][0], 0, nrm[k][1], soffitColor, pu, pv);
      const B2 = walls.vert(q[0], y0, q[1], nrm[k][0], 0, nrm[k][1], soffitColor, pu, pv);
      triFacing(walls, B, A, A2, nrm[k][0], 0, nrm[k][1]);
      triFacing(walls, B, A2, B2, nrm[k][0], 0, nrm[k][1]);
    }
  }
}

const soffitColor = new THREE.Color();
const gableColor = new THREE.Color();

/** Add a triangle wound so that its front face looks along (nx, ny, nz). */
function triFacing(buf: GeoBuf, a: number, b: number, c: number, nx: number, ny: number, nz: number): void {
  const p = buf.pos;
  const ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2];
  const vx = p[c * 3] - p[a * 3], vy = p[c * 3 + 1] - p[a * 3 + 1], vz = p[c * 3 + 2] - p[a * 3 + 2];
  const d = (uy * vz - uz * vy) * nx + (uz * vx - ux * vz) * ny + (ux * vy - uy * vx) * nz;
  if (d >= 0) buf.tri(a, b, c);
  else buf.tri(a, c, b);
}

/** Drop vertices on (nearly) straight runs. Flat [x, z, ...] in, same out. */
function simplifyRing(r: number[]): number[] {
  const n = r.length / 2;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = (i + n - 1) % n, q = (i + 1) % n;
    const ax = r[i * 2] - r[p * 2], az = r[i * 2 + 1] - r[p * 2 + 1], bx = r[q * 2] - r[i * 2], bz = r[q * 2 + 1] - r[i * 2 + 1];
    const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
    if (la < 0.05) continue;
    if (lb > 0.05 && Math.abs(ax * bz - az * bx) / (la * lb) < 0.14 && ax * bx + az * bz > 0) continue; // < ~8 degrees
    out.push(r[i * 2], r[i * 2 + 1]);
  }
  return out;
}

const PITCHED: Partial<Record<Kind, boolean>> = { house: true, shophouse: true, hut: true, generic: true };
const TERRACOTTA = [0xa5573f, 0x9a4f3a, 0xb0634a, 0x8f4a38];

/**
 * Inferred pitched roof (OSM carries no roof shapes here): terracotta gable or hip roof for small
 * rectangular footprints of houses, shophouses, huts and small unclassified buildings. The eaves
 * sit at the mapped / estimated building height. Returns false when the footprint does not qualify.
 */
function addPitchedRoof(kind: Kind, hash: number, ringIn: number[], top: number, height: number, roofs: GeoBuf): boolean {
  if (!PITCHED[kind] || height > 14) return false;
  const r = simplifyRing(ringIn);
  if (r.length !== 8) return false;
  const P = [0, 1, 2, 3].map((i) => [r[i * 2], r[i * 2 + 1]]);
  const len = [0, 1, 2, 3].map((i) => Math.hypot(P[(i + 1) % 4][0] - P[i][0], P[(i + 1) % 4][1] - P[i][1]));
  for (let i = 0; i < 4; i++) {
    const a = P[i], b = P[(i + 1) % 4], c = P[(i + 2) % 4];
    const cos = ((b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1])) / (len[i] * len[(i + 1) % 4]);
    if (Math.abs(cos) > 0.21) return false; // corner not within ~12 degrees of a right angle
  }
  const l0 = (len[0] + len[2]) / 2, l1 = (len[1] + len[3]) / 2;
  const long = Math.max(l0, l1), short = Math.min(l0, l1);
  if (short < 3 || short > (kind === 'generic' ? 24 : 16) || long > 90) return false;
  if (kind === 'generic' && height > 10.5) return false; // low-rise only (shophouse rows, small buildings)
  // Ridge along the long axis, except narrow deep shophouse units (ridge parallel to the street
  // front, i.e. along the short side).
  const narrowUnit = kind === 'shophouse' && short < 9 && long / short > 1.8;
  const ridgeAlong0 = l0 >= l1 !== narrowUnit; // ridge parallel to edges 0 and 2?
  // E0/E1: the two eave edges (parallel to the ridge); ridge joins the midpoints of the other two.
  const k = ridgeAlong0 ? 0 : 1;
  const A = P[k], B = P[(k + 1) % 4], C = P[(k + 2) % 4], D = P[(k + 3) % 4]; // eaves: A-B and C-D
  const span = ridgeAlong0 ? l1 : l0, ridgeLen = ridgeAlong0 ? l0 : l1;
  const rise = Math.max(0.8, Math.min(2.8, span * 0.24));
  const hipped = kind === 'house' && (hash >>> 20) % 3 === 0 && ridgeLen > span * 1.2;
  const hip = hipped ? Math.min(span / 2, ridgeLen * 0.35) / ridgeLen : 0;
  const m0 = [(D[0] + A[0]) / 2, (D[1] + A[1]) / 2], m1 = [(B[0] + C[0]) / 2, (B[1] + C[1]) / 2];
  const R0 = [m0[0] + (m1[0] - m0[0]) * hip, m0[1] + (m1[1] - m0[1]) * hip], R1 = [m1[0] + (m0[0] - m1[0]) * hip, m1[1] + (m0[1] - m1[1]) * hip];
  roofColor.setHex(kind === 'hut' ? ROOFS.hut[hash % ROOFS.hut.length] : TERRACOTTA[(hash >>> 8) % TERRACOTTA.length]);
  roofColor.multiplyScalar(0.8 + ((hash >>> 12) % 16) / 100);
  gableColor.copy(wallColor);
  const cx = (A[0] + B[0] + C[0] + D[0]) / 4, cz = (A[1] + B[1] + C[1] + D[1]) / 4;
  const face = (pts: number[][], ys: number[], color: THREE.Color) => {
    // flat normal, oriented away from the roof interior
    const ux = pts[1][0] - pts[0][0], uy = ys[1] - ys[0], uz = pts[1][1] - pts[0][1];
    const vx = pts[2][0] - pts[0][0], vy = ys[2] - ys[0], vz = pts[2][1] - pts[0][1];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    let mx = 0, mz = 0;
    for (const p of pts) { mx += p[0] / pts.length; mz += p[1] / pts.length; }
    if (nx * (mx - cx) + ny * 1 + nz * (mz - cz) < 0) { nx = -nx; ny = -ny; nz = -nz; }
    const base = roofs.count;
    pts.forEach((p, i) => roofs.vert(p[0], ys[i], p[1], nx, ny, nz, color));
    for (let i = 1; i < pts.length - 1; i++) triFacing(roofs, base, base + i, base + i + 1, nx, ny, nz);
  };
  const yr = top + rise;
  face([A, B, R1, R0], [top, top, yr, yr], roofColor);
  face([C, D, R0, R1], [top, top, yr, yr], roofColor);
  face([D, A, R0], [top, top, yr], hipped ? roofColor : gableColor);
  face([B, C, R1], [top, top, yr], hipped ? roofColor : gableColor);
  return true;
}

/**
 * One merged wall mesh and one merged roof mesh per chunk, generated from the mapped footprints. A generator: it
 * yields between buildings so that ChunkManager can spread a heavy chunk over several frames (V8.2).
 */
export function* buildBuildings(data: ChunkData, ctx: BuildContext): Generator<void, THREE.Object3D[]> {
  const ox = data.cx * CHUNK_SIZE, oz = data.cz * CHUNK_SIZE;
  const walls = new GeoBuf(true);
  const roofs = new GeoBuf(true); // uv = roof surface (arch/TypedBuilding.ts ROOF_*), not a texture coordinate
  const typed = typedBuildings(data);
  const arch = new GeoBuf(true);
  const herit = new GeoBuf(true);
  for (const b of data.buildings) {
    yield;
    if (ctx.landmarks.replacesBuilding(b.id)) continue;
    // V5 rendering experiment: these blocks are drawn by the V5 scene while it is shown.
    if (v5Exclusion.active && v5Exclusion.ids.has(b.id)) continue;
    // Registered landmark sites are drawn by their dedicated model (landmarks/LandmarkModels.ts) at
    // every detail level: no generic geometry is ever generated beneath it.
    if (isProtectedLandmark(b)) continue;
    // Shopfronts only where the building's architectural class allows them (never on a temple,
    // mosque, museum ... even if the streetscape data were to mark frontage edges on it).
    const row = !!b.a?.f.length && mayHaveShopfront(b);
    if (row && isDistrictRow(b, ox, oz)) {
      const hr = addHeritageRow(b, ox, oz, ctx, herit);
      if (addHeritageRoof(b, hr, roofs, herit)) continue;
      addBuilding(b, ox, oz, ctx, walls, roofs, true);
      continue;
    }
    if (row) {
      const fr = addShophouseRow(b, ox, oz, ctx, arch);
      if (addRowRoof(b, fr, roofs, arch)) continue;
    }
    // Small unclassified / machine-detected footprints on the district waterfront are the promenade's
    // kiosks and pavilions: drawn with cream walls and a pitched tile roof (appearance approximate).
    if (!row && (b.s || BUILDING_KINDS[b.k] === 'generic') && b.r.length === 1 && b.r[0].length <= 12 && b.n === undefined) {
      const r = b.r[0];
      let cx = 0, cz = 0;
      for (let i = 0; i < r.length; i += 2) { cx += r[i]; cz += r[i + 1]; }
      cx = ox + cx / (r.length / 2) / QUANT; cz = oz + cz / (r.length / 2) / QUANT;
      if (inDistrict(cx, cz) && Math.abs(area2(r)) / 2 / QUANT / QUANT < 320) {
        addBuilding({ ...b, s: 0, k: BUILDING_KINDS.indexOf('house'), h: Math.min(b.h, 420) }, ox, oz, ctx, walls, roofs, false);
        continue;
      }
    }
    // Everything else is a typed generic building (N1-M3): kampung house, terrace, shophouse block, mall ...
    const t = typed.get(b.id);
    if (row || !t || t.type === 'open_roof') addBuilding(b, ox, oz, ctx, walls, roofs, row);
    else addTypedBuilding(t, b.r.map((r) => r.map((v) => v / QUANT)), ox, oz, ctx, walls, roofs);
  }
  const out: THREE.Object3D[] = [];
  yield;
  const ag = arch.build();
  if (ag) {
    const m = new THREE.Mesh(ag, ctx.mats.arch);
    m.castShadow = m.receiveShadow = true;
    out.push(m);
  }
  yield;
  const hg = herit.build();
  if (hg) {
    const m = new THREE.Mesh(hg, ctx.mats.heritage);
    m.castShadow = m.receiveShadow = true;
    out.push(m);
  }
  yield;
  // Far chunks carry no instanced trees: their crowns ride along in the plain wall mesh (N1-M2).
  if (ctx.detail !== 'high') addFarTrees(data, ctx, walls);
  const wg = walls.build();
  if (wg) {
    const m = new THREE.Mesh(wg, ctx.detail === 'high' ? ctx.mats.wallsTextured : ctx.mats.wallsPlain);
    m.castShadow = m.receiveShadow = true;
    out.push(m);
  }
  yield;
  const rg = roofs.build();
  if (rg) {
    const m = new THREE.Mesh(rg, ctx.mats.roofs);
    m.castShadow = true;
    m.receiveShadow = true;
    out.push(m);
  }
  return out;
}
