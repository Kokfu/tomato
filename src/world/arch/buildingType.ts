// Typed building generator, part 1: what KIND of Kuching building stands on a footprint (N1-M3).
//
// Pure (no three.js, no DOM): shared by the renderer, the collision world and the unit tests.
//
// Nine in ten footprints in the data are machine-detected outlines with no tags at all, so the type is mostly INFERRED
// from the footprint's size and shape, the land use and the roads around it. That is an estimate of a plausible
// generic building, never a statement about the real one (docs/LIMITATIONS.md). Evidence about the structure itself
// (OSM building tags, folded into `kind` / `arch` by tools/generate-world) always wins over inference, and registered
// landmarks never come here at all (landmarks/protect.ts).
import type { ArchClass, BuildingData, ChunkData } from '../types.ts';
import { AREA_KINDS, ARCH_CLASSES, BUILDING_KINDS, ROAD_TYPES } from '../types.ts';
import { QUANT } from '../config.ts';

export const BUILDING_TYPES = [
  'kampung', 'house', 'terrace', 'shophouse', 'colonial', 'midrise', 'mall', 'warehouse', 'school', 'worship', 'shed', 'open_roof',
] as const;
export type BuildingType = (typeof BUILDING_TYPES)[number];
type Kind = (typeof BUILDING_KINDS)[number];
type AreaKind = (typeof AREA_KINDS)[number];

/** Shape of a footprint: its best-fitting (minimum-area) oriented rectangle. Metres. */
export interface Footprint {
  area: number;
  long: number;
  short: number;
  /** Footprint area / rectangle area: 1 for a rectangle, about 0.75 for an L, lower for a U or a courtyard. */
  rect: number;
  /** Unit vector along the long side, and the rectangle's centre. */
  ax: number;
  az: number;
  cx: number;
  cz: number;
}

export function ringArea(r: ArrayLike<number>): number {
  let a = 0;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) a += r[j] * r[i + 1] - r[i] * r[j + 1];
  return a / 2;
}

/** Minimum-area enclosing rectangle over the ring's own edge directions (flat [x, z, ...] in metres). */
export function footprint(ring: ArrayLike<number>): Footprint {
  const n = ring.length / 2, area = Math.abs(ringArea(ring));
  let best: Footprint | null = null;
  const step = Math.max(1, Math.floor(n / 48));
  for (let i = 0; i < n; i += step) {
    const j = (i + 1) % n;
    let dx = ring[j * 2] - ring[i * 2], dz = ring[j * 2 + 1] - ring[i * 2 + 1];
    const l = Math.hypot(dx, dz);
    if (l < 0.3) continue;
    dx /= l; dz /= l;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let k = 0; k < n; k++) {
      const u = ring[k * 2] * dx + ring[k * 2 + 1] * dz, v = -ring[k * 2] * dz + ring[k * 2 + 1] * dx;
      if (u < u0) u0 = u;
      if (u > u1) u1 = u;
      if (v < v0) v0 = v;
      if (v > v1) v1 = v;
    }
    const w = u1 - u0, d = v1 - v0;
    if (best && w * d >= best.long * best.short) continue;
    const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
    const alongU = w >= d;
    best = {
      area, long: Math.max(w, d), short: Math.min(w, d), rect: 0,
      ax: alongU ? dx : -dz, az: alongU ? dz : dx,
      cx: cu * dx - cv * dz, cz: cu * dz + cv * dx,
    };
  }
  if (!best) return { area, long: Math.sqrt(area), short: Math.sqrt(area), rect: 1, ax: 1, az: 0, cx: ring[0] ?? 0, cz: ring[1] ?? 0 };
  best.rect = best.long * best.short > 0 ? Math.min(1, area / (best.long * best.short)) : 1;
  return best;
}

/** Everything the type rules may look at. Distances in metres; `Infinity` = none in the chunk. */
export interface TypeEvidence {
  kind: Kind;
  arch: ArchClass;
  /** Machine-detected footprint (Overture): carries no tags. */
  ml: boolean;
  area: number;
  long: number;
  short: number;
  rect: number;
  /** Height in metres and whether it is mapped (height or levels tag) rather than a default. */
  height: number;
  heightKnown: boolean;
  /** Mapped land use under the footprint, when one of residential / commercial / industrial / school. */
  landuse?: AreaKind;
  /** Name of the footprint feature itself. */
  name?: string;
  /** A street in this chunk is named "Kampung ..." (mapped evidence of a village). */
  kampung: boolean;
  /** Distance to the mapped river bank. */
  waterDist: number;
  /** Distance to the nearest tertiary-or-larger road, and to the nearest road a car can use. */
  majorDist: number;
  roadDist: number;
}
export interface TypeResult { type: BuildingType; rule: string }

const SCHOOL_NAME = /\b(sekolah|smk|sjk|sk|sm|school|kolej|college|tadika|kindergarten|universit[iy]|institut)\b/i;
const MALL_NAME = /\b(mall|plaza|kompleks|complex|shopping|emporium|hypermarket|supermarket|pasaraya|the spring|sentral|centre point)\b/i;
const WORSHIP: ReadonlySet<ArchClass> = new Set<ArchClass>(['chinese_temple', 'mosque', 'church', 'other_worship']);
const CIVIC: ReadonlySet<ArchClass> = new Set<ArchClass>(['government', 'museum', 'fort', 'palace', 'civic']);
const is = (type: BuildingType, rule: string): TypeResult => ({ type, rule });

export function classifyBuildingType(e: TypeEvidence): TypeResult {
  const { kind, area } = e;
  const aspect = e.short > 0 ? e.long / e.short : 1;
  const tall = e.heightKnown && e.height > 15.5;
  // 1. Evidence about the structure itself.
  if (kind === 'roof' || e.arch === 'open_roof') return is('open_roof', 'building=roof');
  if (kind === 'religious' || WORSHIP.has(e.arch)) return is('worship', 'place of worship tag');
  if (e.name && SCHOOL_NAME.test(e.name) && kind !== 'house') return is('school', 'school name on the footprint');
  if (kind === 'civic' || CIVIC.has(e.arch)) {
    if (e.landuse === 'school') return is('school', 'civic building on school grounds');
    return tall ? is('midrise', 'tall civic building') : is('colonial', 'low civic / government building');
  }
  if (kind === 'industrial' || e.arch === 'industrial') return is('warehouse', 'industrial building tag');
  if (kind === 'hut' || e.arch === 'utility') return is('shed', 'hut / shed / garage tag');
  if (kind === 'tower') return area >= 5000 && !tall ? is('mall', 'very large hotel / office footprint') : is('midrise', 'hotel / office tag');
  if (kind === 'commercial') {
    if (area >= 5000 || (area >= 2000 && !!e.name && MALL_NAME.test(e.name))) return is('mall', 'large retail footprint');
    return tall ? is('midrise', 'tall commercial building') : is('shophouse', 'commercial building tag');
  }
  if (kind === 'shophouse' || e.arch === 'shophouse' || e.arch === 'heritage_shophouse') return is('shophouse', 'shophouse row');
  const village = (e.kampung || e.waterDist < 90) && e.majorDist > 40;
  if (kind === 'house') {
    if (e.height > 13) return is('midrise', 'apartment block');
    if (village && area < 170) return is('kampung', 'house in a kampung');
    return aspect >= 1.8 && e.long >= 18 ? is('terrace', 'long residential row') : is('house', 'residential building tag');
  }
  // 2. No tags (building=yes, or machine-detected): size, shape and surroundings.
  if (area < 28) return is('shed', 'tiny footprint');
  if (tall) return is('midrise', 'mapped height over 15 m');
  if (e.landuse === 'school' && area >= 150) return is('school', 'on school grounds');
  if (e.landuse === 'industrial' && area >= 200) return is('warehouse', 'on industrial land');
  if (area >= 6000) return e.majorDist <= 90 ? is('mall', 'very large footprint by a main road') : is('warehouse', 'very large footprint');
  if (area >= 1500) {
    if (e.majorDist > 55 && e.landuse !== 'commercial') return is('warehouse', 'large footprint off the main roads');
    return area >= 3200 ? is('mall', 'large footprint by a main road') : is('midrise', 'large footprint by a main road');
  }
  if (village && area < 170) return is('kampung', 'small footprint in a kampung or on the river bank');
  if (area < 170) return is('house', 'small footprint');
  if (e.landuse === 'commercial' || e.majorDist <= 32) return is('shophouse', 'mid-size footprint on a main road');
  if (aspect >= 1.8 && e.long >= 18 && e.short <= 24) return is('terrace', 'long narrow footprint');
  if (area <= 420) return is('house', 'mid-size footprint');
  return e.roadDist <= 30 ? is('shophouse', 'large block on a street') : is('warehouse', 'large block away from streets');
}

export function hashId(id: number): number {
  let h = Math.imul(id | 0, 2654435761) ^ (id / 4294967296) | 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  return (h ^ (h >>> 13)) >>> 0;
}

/** Vertical layout of a typed building, in metres above the ground it stands on. */
export interface Massing {
  /** Wall top (eaves or roof slab). */
  height: number;
  storeys: number;
  /** Ground-storey height; the storeys above share the rest. */
  ground: number;
  /** Open undercroft under the floor (kampung stilt houses), else 0. */
  stilt: number;
}

/**
 * Height and storeys. A mapped height is kept; a default from the data pipeline (one value per size class, which
 * made every street a level box) is replaced by a plausible, varied one for the type (STYLE_GUIDE.md, section 1).
 */
export function massing(type: BuildingType, hash: number, area: number, height: number, heightKnown: boolean): Massing {
  const r = (hash >>> 4) % 10;
  if (heightKnown || type === 'worship' || type === 'colonial' || type === 'open_roof') {
    const storeys = Math.max(1, Math.round((height - 0.4) / 3.4));
    return { height, storeys, ground: Math.min(height, storeys > 1 ? Math.max(3.3, height / storeys) : height), stilt: 0 };
  }
  const of = (storeys: number, ground: number, upper: number, stilt = 0): Massing => ({ height: stilt + ground + (storeys - 1) * upper, storeys, ground, stilt });
  switch (type) {
    case 'kampung': return of(1, 2.7, 0, 1.5 + (r % 5) * 0.2);
    case 'house': return area < 70 || r >= 7 ? of(1, 3.1, 0) : of(2, 3.1, 3.0);
    case 'terrace': return r === 0 ? of(1, 3.2, 0) : of(2, 3.2, 3.0);
    case 'shophouse': return of(r < 5 ? 3 : r < 8 ? 2 : 4, 3.9, 3.3);
    case 'midrise': return of(area > 2500 ? 4 + (r % 4) : 5 + (r % 6), 4.4, 3.2);
    case 'mall': return of(3 + (r % 3), 5.6, 5.2);
    case 'warehouse': return of(2, 3.6, 3.4 + (r % 4));
    case 'school': return of(2 + (r % 2), 3.5, 3.4);
    case 'shed': return of(1, 2.6, 0);
    default: return of(1, Math.max(3, height), 0);
  }
}

// ---- chunk context ---------------------------------------------------------------------------------------------

const KAMPUNG_NAME = /\b(kampung|kampong|kpg)\b/i;
const LANDUSE: ReadonlySet<AreaKind> = new Set<AreaKind>(['residential', 'commercial', 'industrial', 'school']);
const MAJOR = new Set<number>(['motorway', 'trunk', 'primary', 'secondary', 'tertiary'].map((t) => ROAD_TYPES.indexOf(t as never)));
const DRIVE = new Set<number>([...MAJOR, ROAD_TYPES.indexOf('residential'), ROAD_TYPES.indexOf('service')]);

export interface TypedBuilding extends TypeResult, Massing { fp: Footprint; hash: number }

function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}
function lineDist(px: number, pz: number, lines: number[][], best = Infinity): number {
  for (const p of lines) for (let i = 2; i < p.length; i += 2) {
    const d = segDist(px, pz, p[i - 2], p[i - 1], p[i], p[i + 1]);
    if (d < best) best = d;
  }
  return best;
}
function inRing(x: number, z: number, r: number[]): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    if (r[i + 1] > z !== r[j + 1] > z && x < ((r[j] - r[i]) * (z - r[i + 1])) / (r[j + 1] - r[i + 1]) + r[i]) inside = !inside;
  }
  return inside;
}

const cache = new WeakMap<ChunkData, Map<number, TypedBuilding>>();

/** Type and massing of every building of a chunk (cached per chunk; chunk-local evidence only). */
export function typedBuildings(data: ChunkData): Map<number, TypedBuilding> {
  let out = cache.get(data);
  if (out) return out;
  out = new Map();
  cache.set(data, out);
  // All in chunk-file units (cm): distances are divided once at the end.
  const major: number[][] = [], drive: number[][] = [];
  for (const r of data.roads) {
    if (r.f & 2) continue; // tunnels and covered ways are not a street front
    if (MAJOR.has(r.t)) major.push(r.p);
    if (DRIVE.has(r.t)) drive.push(r.p);
  }
  const kampung = data.roads.some((r) => r.n !== undefined && KAMPUNG_NAME.test(data.names[r.n] ?? ''));
  const landuse = data.areas.filter((a) => LANDUSE.has(AREA_KINDS[a.k]));
  for (const b of data.buildings) {
    const ring = b.r[0];
    if (!ring || ring.length < 6) continue;
    const m = new Array<number>(ring.length);
    for (let i = 0; i < ring.length; i++) m[i] = ring[i] / QUANT;
    const fp = footprint(m);
    const cx = fp.cx * QUANT, cz = fp.cz * QUANT;
    const use = landuse.find((a) => inRing(cx, cz, a.r[0]) && !a.r.slice(1).some((h) => inRing(cx, cz, h)));
    const height = b.h / QUANT, heightKnown = b.hs !== 2;
    const hash = hashId(b.id);
    const res = classifyBuildingType({
      kind: BUILDING_KINDS[b.k], arch: ARCH_CLASSES[b.ac ?? 0], ml: !!b.s, area: fp.area, long: fp.long, short: fp.short, rect: fp.rect,
      height, heightKnown, landuse: use ? AREA_KINDS[use.k] : undefined, name: b.n !== undefined ? data.names[b.n] : undefined,
      kampung, waterDist: lineDist(cx, cz, data.shore) / QUANT, majorDist: lineDist(cx, cz, major) / QUANT, roadDist: lineDist(cx, cz, drive) / QUANT,
    });
    out.set(b.id, { ...res, ...massing(res.type, hash, fp.area, height, heightKnown), fp, hash });
  }
  return out;
}
