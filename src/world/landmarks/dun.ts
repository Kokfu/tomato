// New Sarawak State Legislative Assembly Building (DUN) - V2 procedural reconstruction.
// Mapped (OSM way 1357531465): position, plinth outline, orientation of the plan.
// Published: nine-pointed plan, "payung" (royal umbrella) roof, overall height about 114 m.
// From photographs (see docs/V6_REPORT.md): the proportions of the tiers, the pleated concave roof,
// the ring of nine pavilion roofs, the branching arch columns, the diagrid under the eaves.
// Approximated: exact dimensions of every tier, column count, colours, the entrance canopy position.
import * as THREE from 'three';
import type { LandmarkBuilder } from '../LandmarkManager.ts';
import { CHUNK_SIZE } from '../config.ts';
import { ENV, envListeners } from '../env.ts';
import { Model, col, findBuilding, fitFootprint, centroid, type V3 } from './kit.ts';

export const DUN_BUILDING = 1357531465;

const WHITE = col(0xf4f1e9);
const STONE = col(0xe2dac8);
const GLASS = col(0x7f919e);
const SPANDREL = col(0xe2c8b4);
const FRAME = col(0x49535b);
const STRUT = col(0xd6cdb4);
const GOLD_DARK = col(0x8f7226);

/** Published overall height (mast tip), metres. */
const TOTAL_HEIGHT = 114;
const POINTS = 9;
/** Roof pleats: two per point of the plan. */
const PLEATS = POINTS * 2;
const COLUMNS = POINTS * 3;

/**
 * Heights above the plinth base and radii as a fraction of the plan's tip radius, measured off a
 * frontal photograph and scaled so that the mast tip is at the published 114 m.
 */
const Y_PLINTH = 1.2, Y_SPLIT = 17, Y_BODY = 30, Y_BEAM = 31.6, Y_PAV = 41.5, Y_NECK = 94;
/** Roof profile, eave to neck: [radius fraction, height]. */
const ROOF: [number, number][] = [[0.81, 47.5], [0.645, 53.5], [0.5, 59], [0.385, 65], [0.29, 72], [0.2, 79], [0.135, 85], [0.088, 90], [0.058, Y_NECK]];
const DRUM_R = 0.44;

/** Gold roof metal: one shared PBR material lit by a small analytic sky reflection. */
let goldMat: THREE.MeshStandardMaterial | null = null;
function gold(): THREE.MeshStandardMaterial {
  if (goldMat) return goldMat;
  const w = 16, h = 8, px = new Uint8Array(w * h * 4);
  const ground = [112, 104, 86], horizon = [214, 226, 232], zenith = [86, 140, 204];
  for (let y = 0; y < h; y++) {
    const t = (y + 0.5) / h; // 0 = straight down, 1 = straight up
    const c = t < 0.5 ? ground.map((g, i) => g + (horizon[i] - g) * Math.pow(t * 2, 4)) : horizon.map((g, i) => g + (zenith[i] - g) * Math.min(1, (t - 0.5) * 2.6));
    for (let x = 0; x < w; x++) px.set([c[0], c[1], c[2], 255], (y * w + x) * 4);
  }
  const env = new THREE.DataTexture(px, w, h, THREE.RGBAFormat);
  env.colorSpace = THREE.SRGBColorSpace;
  env.mapping = THREE.EquirectangularReflectionMapping;
  env.magFilter = env.minFilter = THREE.LinearFilter;
  env.needsUpdate = true;
  goldMat = new THREE.MeshStandardMaterial({ color: 0xdcae3e, metalness: 0.82, roughness: 0.36, envMap: env, envMapIntensity: 1.0, side: THREE.DoubleSide });
  goldMat.name = 'dun-gold';
  // N1-M6: the roof is floodlit at night (and no longer mirrors a daytime sky then).
  goldMat.emissive.setHex(0x9a6414);
  goldMat.emissiveIntensity = 0;
  const mat = goldMat, light = (night: number) => { mat.emissiveIntensity = night * 0.75; mat.envMapIntensity = 1 - 0.88 * night; };
  envListeners.push(light);
  light(ENV.uNight.value); // the roof may be built after night has fallen (a saved Night setting, a later chunk)
  return goldMat;
}

/** Indexed triangle soup for the metal roofs (smooth where vertices are shared, crisp where not). */
class Metal {
  pos: number[] = [];
  idx: number[] = [];
  v(p: V3): number { this.pos.push(p[0], p[1], p[2]); return this.pos.length / 3 - 1; }
  /** Flat polygon with its own vertices, wound to face away from `ref`. */
  face(pts: V3[], ref: V3): void {
    const [a, b, c] = pts;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const flip = nx * (a[0] - ref[0]) + ny * (a[1] - ref[1]) + nz * (a[2] - ref[2]) < 0;
    const base = this.pos.length / 3;
    for (const p of pts) this.v(p);
    for (let i = 1; i < pts.length - 1; i++) flip ? this.idx.push(base, base + i + 1, base + i) : this.idx.push(base, base + i, base + i + 1);
  }
  /** Concave four-sided pavilion roof: square base (half-width hw, axis rotated by `rot`), swept up to a point. */
  pavilion(x: number, z: number, y: number, hw: number, rise: number, rot: number): void {
    const ref: V3 = [x, y - 2, z];
    const ringAt = (s: number, h: number): V3[] => [0, 1, 2, 3].map((i) => {
      const a = rot + Math.PI / 4 + (i * Math.PI) / 2, r = hw * Math.SQRT2 * s;
      return [x + Math.cos(a) * r, y + rise * h, z + Math.sin(a) * r] as V3;
    });
    const levels: [number, number][] = [[1.08, -0.04], [0.62, 0.2], [0.3, 0.52], [0.1, 0.86]];
    let prev = ringAt(...levels[0]);
    for (let k = 1; k < levels.length; k++) {
      const cur = ringAt(...levels[k]);
      for (let i = 0; i < 4; i++) this.face([prev[i], prev[(i + 1) % 4], cur[(i + 1) % 4], cur[i]], ref);
      prev = cur;
    }
    for (let i = 0; i < 4; i++) this.face([prev[i], prev[(i + 1) % 4], [x, y + rise, z]], ref);
  }
  mesh(name: string, shadows: boolean): THREE.Mesh {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, gold());
    m.name = name;
    m.castShadow = shadows;
    m.receiveShadow = true;
    m.userData.landmark = 'dun';
    m.userData.triangles = this.idx.length / 3;
    return m;
  }
}

/** Centripetal-free Catmull-Rom through the control points, `sub` samples per span. */
function smoothProfile(pts: [number, number][], sub: number): [number, number][] {
  const out: [number, number][] = [];
  const at = (i: number) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    for (let s = 0; s < sub; s++) {
      const t = s / sub, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export const buildDun: LandmarkBuilder = ({ data, ctx }) => {
  const b = findBuilding(data, [DUN_BUILDING]);
  if (!b) return null;
  const fp = fitFootprint(b, data, ctx);
  const [cx, cz] = centroid(fp.ring);
  const hi = ctx.detail === 'high';
  const m = new Model().world();
  const metal = new Metal();
  // Heights are measured from the mean ground under the outline; the plinth and the columns reach
  // down to the lowest ground so that nothing floats on the downhill side.
  const g = fp.gMean, drop = fp.gMin - fp.gMean - 0.6;

  // Size and rotation of the plan from the mapped outline: mean vertex radius, direction of the farthest vertex.
  let rMean = 0, rMax = 0, phase = 0;
  const n = fp.ring.length / 2;
  for (let i = 0; i < n; i++) {
    const r = Math.hypot(fp.ring[i * 2] - cx, fp.ring[i * 2 + 1] - cz);
    rMean += r / n;
    if (r > rMax) { rMax = r; phase = Math.atan2(fp.ring[i * 2 + 1] - cz, fp.ring[i * 2] - cx); }
  }
  const Rt = rMean * 1.04, Rv = Rt * 0.9;
  const half = Math.PI / POINTS;
  /** Radius of the regular nine-pointed star outline in direction t. */
  const starR = (t: number): number => {
    let a = (t - phase) % (2 * half);
    if (a < 0) a += 2 * half;
    if (a > half) a = 2 * half - a;
    return (Rt * Rv * Math.sin(half)) / (Rt * Math.sin(a) + Rv * Math.sin(half - a));
  };
  const P = (t: number, r: number, y: number): V3 => [cx + Math.cos(t) * r, g + y, cz + Math.sin(t) * r];
  const star = (s: number): number[] => {
    const out: number[] = [];
    for (let i = 0; i < POINTS * 2; i++) {
      const t = phase + i * half;
      out.push(cx + Math.cos(t) * (i % 2 ? Rv : Rt) * s, cz + Math.sin(t) * (i % 2 ? Rv : Rt) * s);
    }
    return out;
  };

  // Plinth on the mapped outline (this is also the collision outline).
  m.walls(fp.ring, g + drop, g + Y_PLINTH, STONE);
  m.cap(fp.ring, [], g + Y_PLINTH, STONE);

  // Lower body: recessed glazed core with floor bands, behind the colonnade.
  const core = star(0.84);
  m.walls(core, g + Y_PLINTH, g + Y_BODY, GLASS);
  if (hi) {
    const band = star(0.852);
    for (let y = Y_PLINTH + 3.4; y < Y_BODY - 1; y += 3.5) m.walls(band, g + y, g + y + 1.3, SPANDREL);
    for (let i = 0; i < POINTS * 4; i++) {
      const t = phase + (i * half) / 2, r = starR(t) * 0.862;
      m.tube(P(t, r, Y_PLINTH), P(t, r, Y_BODY), 0.32, 0.32, 4, FRAME);
    }
  }
  // Ring beam and terrace over the colonnade.
  const outer = star(1.0);
  m.walls(outer, g + Y_BODY, g + Y_BEAM, WHITE);
  m.cap(outer, [], g + Y_BEAM, STONE);
  m.cap(outer, [], g + Y_BODY, STONE, true);

  // Tall white columns that branch into pointed arches under the ring beam.
  const dT = (Math.PI * 2) / COLUMNS;
  for (let i = 0; i < COLUMNS; i++) {
    const t = phase + i * dT, r = starR(t);
    m.tube(P(t, r, drop), P(t, r, Y_SPLIT), 0.95, 0.7, hi ? 6 : 4, WHITE);
    m.tube(P(t, r, Y_SPLIT), P(t, r, Y_BODY), 0.42, 0.34, 4, WHITE);
    const SEG = hi ? 4 : 2, A = 1.08;
    for (const side of [-1, 1]) {
      let prev = P(t, r, Y_SPLIT);
      for (let s = 1; s <= SEG; s++) {
        const u = s / SEG;
        const tt = t + side * (dT / 2) * ((1 - Math.cos(u * A)) / (1 - Math.cos(A)));
        const cur = P(tt, starR(tt), Y_SPLIT + (Y_BODY - Y_SPLIT) * (Math.sin(u * A) / Math.sin(A)));
        m.tube(prev, cur, 0.56 - 0.05 * s, 0.56 - 0.05 * (s + 1), 4, WHITE);
        prev = cur;
      }
    }
  }

  // Nine pavilion roofs on the terrace, one over each point of the plan.
  for (let i = 0; i < POINTS; i++) {
    const t = phase + i * 2 * half;
    metal.pavilion(cx + Math.cos(t) * Rt * 0.78, cz + Math.sin(t) * Rt * 0.77, g + Y_BEAM, Rt * 0.21, Y_PAV - Y_BEAM, t);
  }

  // Upper drum: dark glazing behind a diagrid of struts that carries the eaves.
  const rd = Rt * DRUM_R;
  m.lathe(cx, cz, [[rd, g + Y_BEAM], [rd, g + ROOF[2][1] - 1.5]], 36, GLASS);
  const eaveR = Rt * ROOF[0][0], eaveY = ROOF[0][1];
  const dP = (Math.PI * 2) / PLEATS;
  for (let j = 0; j < PLEATS; j++) {
    const t = phase + j * dP;
    if (hi) {
      const foot = P(t + dP / 2, rd + 1.2, Y_BEAM);
      m.tube(foot, P(t, eaveR * 0.9, eaveY + 1.2), 0.5, 0.36, 4, STRUT);
      m.tube(foot, P(t + dP, eaveR * 0.9, eaveY + 1.2), 0.5, 0.36, 4, STRUT);
    }
    // Structural rib under each roof ridge, from the eave tip to the drum.
    m.tube(P(t, eaveR * 0.985, eaveY - 0.1), P(t, Rt * ROOF[2][0], ROOF[2][1] - 0.7), 0.42, 0.42, 4, GOLD_DARK);
  }
  if (hi) for (const y of [Y_BEAM + 6, Y_BEAM + 12]) m.lathe(cx, cz, [[rd + 0.25, g + y], [rd + 0.25, g + y + 0.6]], 36, FRAME);

  // Main roof: a pleated umbrella. Sharp ridges, rounded valleys; the pleats flatten out toward the neck
  // and the eave rises between the ridge tips (scalloped edge).
  const prof = smoothProfile(ROOF, hi ? 3 : 1);
  const SEG = hi ? 6 : 2, N = PLEATS * SEG;
  const rows: number[][] = [];
  const addRow = (rf: number, y: number, k: number, lip = 0) => {
    const row: number[] = [];
    const fade = Math.pow(1 - k, 1.4), lift = Math.max(0, 1 - k * 5);
    for (let i = 0; i < N; i++) {
      const u = (i % SEG) / SEG, d = 1 - Math.abs(2 * u - 1); // 0 on a ridge, 1 in a valley
      const dip = Math.sin((d * Math.PI) / 2);
      row.push(metal.v(P(phase + (i / N) * Math.PI * 2, Rt * rf * (1 - 0.115 * fade * dip), y + 3.1 * lift * lift * dip - lip)));
    }
    rows.push(row);
  };
  addRow(prof[0][0] * 0.992, prof[0][1], 0, 0.75); // eave fascia
  prof.forEach(([rf, y], k) => addRow(rf, y, k / (prof.length - 1)));
  for (let k = 0; k < rows.length - 1; k++)
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N, a = rows[k][i], bq = rows[k][j], c = rows[k + 1][j], d = rows[k + 1][i];
      metal.idx.push(a, d, c, a, c, bq);
    }

  // Finial: stepped tiers and the mast.
  const rn = Rt * ROOF[ROOF.length - 1][0];
  m.lathe(cx, cz, [
    [rn * 1.05, g + Y_NECK - 0.4], [rn * 1.3, g + Y_NECK + 0.5], [rn * 0.82, g + Y_NECK + 2.2], [rn * 1.0, g + Y_NECK + 2.7],
    [rn * 0.58, g + Y_NECK + 4.6], [rn * 0.72, g + Y_NECK + 5.1], [rn * 0.3, g + Y_NECK + 7.6], [0.28, g + Y_NECK + 9.5], [0.1, g + TOTAL_HEIGHT], [0, g + TOTAL_HEIGHT + 0.01],
  ], hi ? 12 : 6, GOLD_DARK, phase);

  // Entrance canopy on the landward (north) side, at the point of the plan nearest to north.
  // The side is inferred from the reference photograph (driveway in front, the river behind).
  {
    const k = Math.round((-Math.PI / 2 - phase) / (2 * half));
    const t = phase + k * 2 * half, r = Rt + 13, hw = 6.5;
    const px = cx + Math.cos(t) * r, pz = cz + Math.sin(t) * r;
    const gy = ctx.height.sample(data.cx * CHUNK_SIZE + px, data.cz * CHUNK_SIZE + pz);
    for (const [sa, sb] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const ox = Math.cos(t) * sa * hw * 0.8 - Math.sin(t) * sb * hw * 0.8, oz = Math.sin(t) * sa * hw * 0.8 + Math.cos(t) * sb * hw * 0.8;
      m.tube([px + ox, gy - 0.3, pz + oz], [px + ox, gy + 5.6, pz + oz], 0.38, 0.3, 6, WHITE);
    }
    metal.pavilion(px, pz, gy + 5.6, hw, 6.5, t);
  }

  const group = new THREE.Group();
  group.name = 'dun';
  const body = m.mesh(ctx, 'dun-body');
  if (body) { body.userData.landmark = 'dun'; group.add(body); }
  group.add(metal.mesh('dun-roof', hi));
  return group;
};
