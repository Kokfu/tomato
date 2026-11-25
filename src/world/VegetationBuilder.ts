import * as THREE from 'three';
import { CHUNK_SIZE, QUANT } from './config.ts';
import type { ChunkData } from './types.ts';
import { AREA_KINDS, ROAD_STYLE, ROAD_TYPES } from './types.ts';
import type { RoadType } from './types.ts';
import type { BuildContext } from './ChunkManager.ts';
import type { GeoBuf } from './Materials.ts';
import { pointInRing } from './CollisionWorld.ts';
import { inDistrict } from './district/mainBazaar.ts';
import { v5Exclusion } from '../v5/geo.ts';

/** Tree forms (N1-M2). Species are not mapped anywhere: the mix stands in for Kuching's planting (inferred appearance). */
export const TREE = { rain: 0, palm: 1, small: 2, forest: 3 } as const;
/** One tree: chunk-local metres, form, and two random numbers in [0, 1) for its size and colour. */
export interface TreeSite { x: number; z: number; kind: number; a: number; b: number }

interface Kit {
  trunk: THREE.BufferGeometry; crown: THREE.BufferGeometry; palmTrunk: THREE.BufferGeometry; fronds: THREE.BufferGeometry;
  rainWood: THREE.BufferGeometry; rainCrown: THREE.BufferGeometry;
}
let kit: Kit | null = null;

/** Bake a vertical shading gradient into vertex colours (cheap ambient occlusion inside the canopy). */
function shade(g: THREE.BufferGeometry, lo: number, hi: number, dark: number): THREE.BufferGeometry {
  const p = g.getAttribute('position');
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const t = THREE.MathUtils.clamp((p.getY(i) - lo) / (hi - lo), 0, 1);
    const v = dark + (1 - dark) * t;
    c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], idx: number[] = [];
  for (const g of parts) {
    const base = pos.length / 3;
    const n = g;
    pos.push(...(n.getAttribute('position').array as Float32Array));
    nor.push(...(n.getAttribute('normal').array as Float32Array));
    if (n.index) for (const i of n.index.array as Uint16Array) idx.push(base + i);
    else for (let i = 0; i < n.getAttribute('position').count; i++) idx.push(base + i);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setIndex(idx);
  return out;
}
/**
 * Canopy normals point away from one centre below the crown instead of away from each facet, so a crown of a few
 * low-poly lobes is lit as one soft dome (no faceting, no dark seams where lobes cross).
 */
function dome(g: THREE.BufferGeometry, cy: number, flat: number): THREE.BufferGeometry {
  const p = g.getAttribute('position'), n = g.getAttribute('normal'), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.set(p.getX(i), (p.getY(i) - cy) / flat, p.getZ(i)).normalize(); n.setXYZ(i, v.x, v.y, v.z); }
  return g;
}
/** A limb: an open tapered tube from a to b. */
function limb(a: [number, number, number], b: [number, number, number], ra: number, rb: number, sides: number): THREE.BufferGeometry {
  const va = new THREE.Vector3(...a), d = new THREE.Vector3(...b).sub(va), len = d.length();
  const g = new THREE.CylinderGeometry(rb, ra, len, sides, 1, true).translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(THREE.Object3D.DEFAULT_UP, d.normalize()));
  return g.translate(va.x, va.y, va.z);
}
function shared(): Kit {
  if (kit) return kit;
  const trunk = new THREE.CylinderGeometry(0.14, 0.24, 1, 6, 1, true).translate(0, 0.5, 0);
  // Round-headed tree: a few overlapping low-poly lobes (100 triangles in total; trees are the most numerous objects
  // in view, so the budget per tree is small).
  const lobes: [number, number, number, number][] = [[0, 0, 0, 1], [0.62, -0.12, 0.2, 0.68], [-0.5, -0.08, 0.42, 0.72], [-0.15, -0.1, -0.66, 0.66], [0.1, 0.42, 0.05, 0.6]];
  const crown = shade(dome(merge(lobes.map(([x, y, z, r]) => new THREE.IcosahedronGeometry(r, 0).scale(1, 0.72, 1).rotateY(x * 2.1 + z).translate(x, y, z))), -0.5, 0.8), -0.7, 0.8, 0.5);
  const palmTrunk = new THREE.CylinderGeometry(0.09, 0.16, 1, 5, 1, true).translate(0, 0.5, 0);
  // Coconut-palm crown: arching fronds, each a bent strip that droops toward the tip.
  const fr: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 13; i++) {
    // two tiers: eight long fronds that arch and droop, five shorter ones that stand up in the middle of the crown
    const upper = i >= 8, a = upper ? ((i - 8) / 5) * Math.PI * 2 + 0.4 : (i / 8) * Math.PI * 2 + (i % 2) * 0.2;
    const g = new THREE.PlaneGeometry(0.36, 1, 1, 4).translate(0, 0.5, 0);
    const p = g.getAttribute('position');
    for (let k = 0; k < p.count; k++) {
      const t = p.getY(k); // 0 at the stem, 1 at the tip
      const w = p.getX(k) * (1 - t * 0.75);
      if (upper) p.setXYZ(k, w, 0.62 * Math.sin(t * 1.9) - 0.12 * t * t, t * 0.62);
      else p.setXYZ(k, w, 0.28 * Math.sin(t * 2.4) - 0.5 * t * t, t);
    }
    g.computeVertexNormals();
    fr.push(g.rotateY(a));
  }
  const fronds = shade(merge(fr), -0.5, 0.25, 0.62);
  // Rain tree (Samanea saman), Kuching's roadside tree. Unit frame: x and z are scaled by the canopy radius, y by the
  // tree's height. A short thick trunk forks low into spreading limbs that carry a wide, flat umbrella of foliage.
  const forks: [number, number][] = [[0.5, 0.2], [2.5, 0.9], [4.4, 0.35]];
  const rainWood = merge([
    limb([0, 0, 0], [0, 0.4, 0], 0.062, 0.042, 6),
    ...forks.map(([a, t]) => limb([0, 0.34, 0], [Math.cos(a) * 0.5, 0.74 + t * 0.06, Math.sin(a) * 0.5], 0.03, 0.012, 4)),
  ]);
  const umbrella: [number, number, number, number][] = [[0, 0.86, 0, 0.6], [0.6, 0.8, 0.12, 0.52], [0.2, 0.8, 0.62, 0.5], [-0.52, 0.81, 0.36, 0.52], [-0.45, 0.8, -0.45, 0.5], [0.3, 0.8, -0.58, 0.5]];
  const rainCrown = shade(dome(merge(umbrella.map(([x, y, z, r], i) => new THREE.IcosahedronGeometry(r, 1).scale(1, 0.26, 1).rotateY(i * 1.3).translate(x, y, z))), 0.55, 0.3), 0.66, 0.98, 0.42);
  kit = { trunk, crown, palmTrunk, fronds, rainWood, rainCrown };
  return kit;
}
function hash(x: number, z: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Spacing in metres of roadside trees by road type (inferred planting; no tree register is mapped). */
const ROADSIDE: Partial<Record<RoadType, number>> = { trunk: 24, primary: 24, secondary: 26, tertiary: 28, residential: 34 };
/** Land uses where no tree is scattered (paved, played on, or already planted by `ptrees`). */
const NO_LOT_TREES = new Set(['parking', 'plaza', 'pitch', 'sand', 'commercial', 'industrial', 'construction', 'wood', 'park']);

/**
 * Where trees stand in a chunk, in chunk-local metres. Deterministic per chunk and preset.
 *  - `trees`: individually mapped OSM trees.
 *  - `ptrees`: positions generated offline inside mapped wood and park polygons.
 *  - N1-M2, inferred: trees along the kerb of the larger roads (rain trees, or palms on some roads) and scattered
 *    trees on open green ground, never on a carriageway, in a building, in water or inside a hand-built street.
 */
export function treeSites(data: ChunkData, ctx: BuildContext): TreeSite[] {
  const density = ctx.quality.treeDensity, out: TreeSite[] = [];
  const ox = data.cx * CHUNK_SIZE, oz = data.cz * CHUNK_SIZE;
  for (let i = 0; i < data.trees.length; i += 2) {
    const x = data.trees[i] / QUANT, z = data.trees[i + 1] / QUANT;
    // Mapped trees inside the test district are drawn as rain trees by district/Dressing.ts.
    if (inDistrict(ox + x, oz + z)) continue;
    const h = hash(data.trees[i] + 91, data.trees[i + 1] + 13);
    out.push({ x, z, kind: h < 0.24 ? TREE.palm : h < 0.6 ? TREE.rain : TREE.small, a: hash(data.trees[i], data.trees[i + 1]), b: hash(data.trees[i + 1] + 17, data.trees[i] - 5) });
  }
  for (let i = 0; i < data.ptrees.length; i += 2) {
    if (density < 1 && hash(data.ptrees[i], data.ptrees[i + 1]) > density) continue;
    const h = hash(data.ptrees[i] + 91, data.ptrees[i + 1] + 13);
    out.push({ x: data.ptrees[i] / QUANT, z: data.ptrees[i + 1] / QUANT, kind: h < 0.2 ? TREE.palm : TREE.forest, a: hash(data.ptrees[i], data.ptrees[i + 1]), b: hash(data.ptrees[i + 1] + 17, data.ptrees[i] - 5) });
  }

  // --- inferred planting ---
  const roads = data.roads.filter((r) => ROAD_STYLE[ROAD_TYPES[r.t]].group >= 1 && ROAD_TYPES[r.t] !== 'rail' && r.p.length >= 4)
    .map((r) => {
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (let i = 0; i < r.p.length; i += 2) { x0 = Math.min(x0, r.p[i]); x1 = Math.max(x1, r.p[i]); z0 = Math.min(z0, r.p[i + 1]); z1 = Math.max(z1, r.p[i + 1]); }
      return { p: r.p, hw: r.w / QUANT / 2, x0: x0 / QUANT, z0: z0 / QUANT, x1: x1 / QUANT, z1: z1 / QUANT };
    });
  const builds = data.buildings.map((b) => {
    const r = b.r[0];
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < r.length; i += 2) { x0 = Math.min(x0, r[i]); x1 = Math.max(x1, r[i]); z0 = Math.min(z0, r[i + 1]); z1 = Math.max(z1, r[i + 1]); }
    return { r, closed: [...r, r[0], r[1]], x0: x0 / QUANT, z0: z0 / QUANT, x1: x1 / QUANT, z1: z1 / QUANT };
  });
  const segDist = (p: number[], x: number, z: number): number => {
    let best = Infinity;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i] / QUANT, az = p[i + 1] / QUANT, dx = p[i + 2] / QUANT - ax, dz = p[i + 3] / QUANT - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
    }
    return best;
  };
  /** True where a trunk may stand: `clear` metres from every carriageway and building, on dry land, outside the hand-built streets. */
  const free = (x: number, z: number, clear: number): boolean => {
    if (x < 1 || z < 1 || x > CHUNK_SIZE - 1 || z > CHUNK_SIZE - 1) return false;
    const wx = ox + x, wz = oz + z;
    if (inDistrict(wx, wz) || (v5Exclusion.active && v5Exclusion.inCorridor(wx, wz))) return false;
    for (const r of roads) {
      const m = r.hw + clear;
      if (x < r.x0 - m || x > r.x1 + m || z < r.z0 - m || z > r.z1 + m) continue;
      if (segDist(r.p, x, z) < m) return false;
    }
    for (const b of builds) {
      const m = clear + 1;
      if (x < b.x0 - m || x > b.x1 + m || z < b.z0 - m || z > b.z1 + m) continue;
      if (pointInRing(x * QUANT, z * QUANT, b.r) || segDist(b.closed, x, z) < m) return false;
    }
    // buildings of neighbouring chunks that reach across the border, and the river
    return !ctx.collision.insideBuilding(wx, wz, ctx.height.sample(wx, wz) + 1, false) && !ctx.collision.inWater(wx, wz);
  };
  // Along the kerb: every `step` metres on both sides, staggered. One road keeps one species, as a planted avenue does.
  for (const r of data.roads) {
    const type = ROAD_TYPES[r.t], step = ROADSIDE[type];
    if (!step || r.f & 3) continue;
    const minor = type === 'residential', off = r.w / QUANT / 2 + (minor ? 2.6 : 3.4), palms = hash(r.id, 7) < 0.28;
    let run = hash(r.id, 3) * step, n = 0;
    for (let i = 0; i + 3 < r.p.length; i += 2) {
      const ax = r.p[i] / QUANT, az = r.p[i + 1] / QUANT, dx = r.p[i + 2] / QUANT - ax, dz = r.p[i + 3] / QUANT - az, len = Math.hypot(dx, dz);
      if (len < 0.01) continue;
      for (; run < len; run += step / 2, n++) {
        const side = n % 2 ? 1 : -1, t = run / len, x = ax + dx * t + (-dz / len) * off * side, z = az + dz * t + (dx / len) * off * side;
        const k = hash(Math.round((ox + x) * 4), Math.round((oz + z) * 4));
        if (k > (minor ? 0.5 : 0.92) * Math.min(1, density + 0.25)) continue;
        if (free(x, z, minor ? 1.4 : 1.9)) out.push({ x, z, kind: minor ? (k < 0.2 ? TREE.palm : TREE.small) : palms ? TREE.palm : TREE.rain, a: hash(Math.round(x * 9) + 5, Math.round(z * 9)), b: hash(Math.round(z * 7), Math.round(x * 7) + 3) });
      }
      run -= len;
    }
  }
  // Scattered on open green ground: one candidate per 30 m cell.
  const paved = data.areas.filter((a) => NO_LOT_TREES.has(AREA_KINDS[a.k]));
  const CELL = 30, cells = Math.ceil(CHUNK_SIZE / CELL);
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) {
    const gx = data.cx * cells + i, gz = data.cz * cells + j, k = hash(gx * 3 + 1, gz * 5 + 2);
    if (k > 0.5 * density) continue;
    const x = (i + 0.1 + 0.8 * hash(gx, gz + 77)) * CELL, z = (j + 0.1 + 0.8 * hash(gx + 31, gz)) * CELL;
    if (paved.some((a) => pointInRing(x * QUANT, z * QUANT, a.r[0])) || !free(x, z, 2.6)) continue;
    const s = hash(gx + 9, gz + 4);
    out.push({ x, z, kind: s < 0.22 ? TREE.rain : s < 0.5 ? TREE.palm : TREE.small, a: hash(gx + 2, gz), b: hash(gx, gz + 2) });
  }
  return out;
}

/** Size of a tree: trunk (or clear stem) height and crown radius in metres. */
function measure(t: TreeSite): { h: number; r: number } {
  switch (t.kind) {
    case TREE.rain: return { h: 10 + t.a * 5, r: 6 + t.b * 3.5 };
    case TREE.palm: return { h: 6 + t.a * 5.5, r: 2.6 + t.b * 1.1 };
    case TREE.small: return { h: 2.2 + t.a * 1.4, r: 1.7 + t.b * 1.1 };
    default: return { h: 3.2 + t.a * 3.2, r: 2.8 + t.b * 2.4 };
  }
}
function crownColour(t: TreeSite, c: THREE.Color): THREE.Color {
  if (t.kind === TREE.rain) return c.setHSL(0.27 + t.b * 0.04, 0.4 + t.a * 0.12, 0.2 + t.b * 0.07);
  if (t.kind === TREE.palm) return c.setHSL(0.25 + t.b * 0.05, 0.5, 0.27 + t.a * 0.08);
  if (t.kind === TREE.small) return c.setHSL(0.24 + t.b * 0.09, 0.48 + t.a * 0.16, 0.26 + t.b * 0.1);
  return c.setHSL(0.28 + t.b * 0.06, 0.45 + t.a * 0.15, 0.2 + t.b * 0.09);
}

/** Bark colour of the shared trunk material (src/world/Materials.ts), for trees baked into one mesh. */
const BARK = new THREE.Color(0x9a8468);

/**
 * Low preset: every tree of the chunk baked into ONE mesh (the plain vertex-colour furniture material), so trees cost
 * a phone one draw call per chunk instead of up to six. Same shapes and colours, without the leaf-noise shading.
 */
function bakeTrees(parts: { geo: THREE.BufferGeometry; matrix: THREE.Matrix4; colour: THREE.Color }[], ctx: BuildContext): THREE.Mesh {
  let nv = 0, ni = 0;
  for (const p of parts) { nv += p.geo.getAttribute('position').count; ni += p.geo.index!.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), idx = new Uint32Array(ni);
  const v = new THREE.Vector3(), nm = new THREE.Matrix3();
  let o = 0, io = 0;
  for (const { geo, matrix, colour } of parts) {
    const gp = geo.getAttribute('position'), gn = geo.getAttribute('normal'), gc = geo.getAttribute('color'), gi = geo.index!.array;
    nm.getNormalMatrix(matrix);
    for (let i = 0; i < gp.count; i++) {
      v.fromBufferAttribute(gp, i).applyMatrix4(matrix).toArray(pos, (o + i) * 3);
      v.fromBufferAttribute(gn, i).applyMatrix3(nm).normalize().toArray(nor, (o + i) * 3);
      const k = gc ? gc.getX(i) : 1;
      col[(o + i) * 3] = colour.r * k; col[(o + i) * 3 + 1] = colour.g * k; col[(o + i) * 3 + 2] = colour.b * k;
    }
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + o;
    o += gp.count; io += gi.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(nv > 65535 ? idx : new Uint16Array(idx), 1));
  g.computeBoundingSphere();
  return new THREE.Mesh(g, ctx.mats.furniture);
}

/** Trees of a nearby (high-detail) chunk: at most six instanced meshes whatever the number of trees (one baked mesh on Low). */
export function buildVegetation(data: ChunkData, ctx: BuildContext): THREE.Object3D[] {
  const sites = treeSites(data, ctx);
  if (!sites.length) return [];
  if (ctx.quality.name === 'low') {
    const k = shared(), parts: { geo: THREE.BufferGeometry; matrix: THREE.Matrix4; colour: THREE.Color }[] = [];
    const q = new THREE.Quaternion(), ox = data.cx * CHUNK_SIZE, oz = data.cz * CHUNK_SIZE;
    const add = (geo: THREE.BufferGeometry, x: number, y: number, z: number, sx: number, sy: number, sz: number, colour: THREE.Color) =>
      parts.push({ geo, matrix: new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz)), colour });
    for (const t of sites) {
      const { h, r } = measure(t), y = ctx.height.sample(ox + t.x, oz + t.z), leaf = crownColour(t, new THREE.Color());
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, t.a * 6.283);
      if (t.kind === TREE.rain) {
        add(k.rainWood, t.x, y, t.z, r, h, r, BARK.clone().multiplyScalar(0.55));
        add(k.rainCrown, t.x, y, t.z, r, h, r, leaf);
      } else if (t.kind === TREE.palm) {
        add(k.palmTrunk, t.x, y, t.z, 1, h, 1, BARK);
        add(k.fronds, t.x, y + h, t.z, r, r, r, leaf);
      } else {
        add(k.trunk, t.x, y, t.z, 1 + t.b * 0.8, h, 1 + t.b * 0.8, BARK.clone().multiplyScalar(0.8));
        add(k.crown, t.x, y + h + r * 0.5, t.z, r, r * (0.8 + t.a * 0.3), r, leaf);
      }
    }
    return [bakeTrees(parts, ctx)];
  }
  const k = shared(), count = [0, 0, 0, 0];
  for (const t of sites) count[t.kind]++;
  const mk = (g: THREE.BufferGeometry, mat: THREE.Material, n: number) => {
    const m = new THREE.InstancedMesh(g, mat, n);
    m.userData.sharedGeometry = true;
    return m;
  };
  const round = count[TREE.small] + count[TREE.forest];
  const trunks = mk(k.trunk, ctx.mats.trunk, round), crowns = mk(k.crown, ctx.mats.crown, round);
  const ptrunks = mk(k.palmTrunk, ctx.mats.trunk, count[TREE.palm]), fronds = mk(k.fronds, ctx.mats.frond, count[TREE.palm]);
  const rwood = mk(k.rainWood, ctx.mats.trunk, count[TREE.rain]), rcrowns = mk(k.rainCrown, ctx.mats.crown, count[TREE.rain]);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  const ox = data.cx * CHUNK_SIZE, oz = data.cz * CHUNK_SIZE;
  let it = 0, ip = 0, ir = 0;
  for (const t of sites) {
    const { h, r } = measure(t), y = ctx.height.sample(ox + t.x, oz + t.z);
    q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, t.a * 6.283);
    if (t.kind === TREE.rain) {
      m.compose(p.set(t.x, y, t.z), q, s.set(r, h, r));
      rwood.setMatrixAt(ir, m);
      rwood.setColorAt(ir, c.setRGB(0.5 + t.b * 0.14, 0.47 + t.b * 0.14, 0.46 + t.b * 0.14)); // dark, furrowed bark
      rcrowns.setMatrixAt(ir, m);
      rcrowns.setColorAt(ir, crownColour(t, c));
      ir++;
    } else if (t.kind === TREE.palm) {
      m.compose(p.set(t.x, y, t.z), q, s.set(1, h, 1));
      ptrunks.setMatrixAt(ip, m);
      ptrunks.setColorAt(ip, c.setRGB(0.95 + t.b * 0.1, 0.93 + t.b * 0.1, 0.9 + t.b * 0.1)); // pale grey stem
      m.compose(p.set(t.x, y + h, t.z), q, s.set(r, r, r));
      fronds.setMatrixAt(ip, m);
      fronds.setColorAt(ip, crownColour(t, c));
      ip++;
    } else {
      m.compose(p.set(t.x, y, t.z), q, s.set(1 + t.b * 0.8, h, 1 + t.b * 0.8));
      trunks.setMatrixAt(it, m);
      trunks.setColorAt(it, c.setRGB(0.72 + t.a * 0.16, 0.64 + t.a * 0.16, 0.56 + t.a * 0.16));
      m.compose(p.set(t.x, y + h + r * 0.5, t.z), q, s.set(r, r * (0.8 + t.a * 0.3), r));
      crowns.setMatrixAt(it, m);
      crowns.setColorAt(it, crownColour(t, c));
      it++;
    }
  }
  const out: THREE.Object3D[] = [];
  for (const mesh of [trunks, crowns, ptrunks, fronds, rwood, rcrowns]) {
    if (!mesh.count) { mesh.dispose(); continue; }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = mesh === crowns || mesh === fronds || mesh === rcrowns;
    mesh.receiveShadow = mesh === rwood;
    mesh.computeBoundingSphere();
    out.push(mesh);
  }
  return out;
}

/**
 * Trees of a distant (low-detail) chunk: one eight-triangle crown each, added to the chunk's plain wall geometry so
 * the far city keeps its tree cover without a single extra draw call.
 */
export function addFarTrees(data: ChunkData, ctx: BuildContext, buf: GeoBuf): void {
  const ox = data.cx * CHUNK_SIZE, oz = data.cz * CHUNK_SIZE, top = new THREE.Color(), low = new THREE.Color();
  for (const t of treeSites(data, ctx)) {
    const { h, r } = measure(t), y = ctx.height.sample(ox + t.x, oz + t.z);
    const palm = t.kind === TREE.palm, rain = t.kind === TREE.rain;
    const w = palm ? r * 0.75 : rain ? r * 1.05 : r, cy = palm ? y + h : rain ? y + h * 0.82 : y + h + r * 0.4, up = palm ? r * 0.3 : rain ? h * 0.14 : r * 0.75, down = rain ? h * 0.1 : up * 0.8;
    crownColour(t, top); low.copy(top).multiplyScalar(0.55);
    const a0 = t.a * 6.283, n = buf.count;
    buf.vert(t.x, cy + up, t.z, 0, 1, 0, top);
    buf.vert(t.x, cy - down, t.z, 0, -1, 0, low);
    for (let i = 0; i < 4; i++) { const a = a0 + i * 1.5708, cx = Math.cos(a), cz = Math.sin(a); buf.vert(t.x + cx * w, cy, t.z + cz * w, cx * 0.6, 0.8, cz * 0.6, low.clone().lerp(top, 0.6)); }
    for (let i = 0; i < 4; i++) { const a = n + 2 + i, b = n + 2 + ((i + 1) % 4); buf.tri(n, b, a); buf.tri(n + 1, a, b); }
  }
}
