// Geography of the V5 test section: Carpenter Street between the Harmony Arch and Jalan China.
//
// Nothing here is drawn by hand: every coordinate is a vertex of a mapped outline or road in the
// generated chunk data (public/data/kuching/chunks/0_0.json and 0_-1.json, i.e. OpenStreetMap after
// the V4 landmark-site and road-alignment steps). World metres: +x east, +z south.

/** V4 building records that the V5 scene replaces (whole blocks facing the section, and the three landmark sites). */
export const V5_BUILDING_IDS = [236495089, 8000000000000001, 233690735, 8000000000000004, 233690739, 8000000000000002, 8000000000000003, 8000000000000005];
/** V4 landmark models hidden while V5 is shown (V5 draws its own). */
export const V5_LANDMARK_IDS = ['hiang-thian-siang-ti-temple', 'lau-ya-keng-food-court', 'yang-choon-tai-opera-stage'];

/** Aligned centre line of Jalan Carpenter through the section (way 196054157). */
export const STREET: [number, number][] = [[86.7, -16.2], [94.3, -13.3], [115.6, 0], [131.6, 10], [156.8, 22.9]];

export interface RowDef {
  id: string;
  /** Building record the frontage belongs to (place names are matched through it). */
  building: number;
  /** Frontage edge end points (mapped outline vertices). */
  a: [number, number];
  b: [number, number];
  lots: number;
  /** Lot depth, limited by the mapped block. */
  depth: number;
  lod: 0 | 1;
  /** Skip this many metres at the start of the edge (corner already occupied by another row). */
  skip?: number;
}

export const ROWS: RowDef[] = [
  { id: 'S1', building: 236495089, a: [90, -10.5], b: [120.1, 7.6], lots: 7, depth: 26, lod: 0 },
  { id: 'S2', building: 8000000000000001, a: [129, 13], b: [148.2, 24.6], lots: 4, depth: 21, lod: 0 },
  { id: 'N1', building: 233690735, a: [84.7, -25], b: [124.7, 0.8], lots: 9, depth: 26, lod: 0 },
  { id: 'N2', building: 8000000000000004, a: [132.8, 6], b: [136.6, 8.5], lots: 1, depth: 26, lod: 0 },
  { id: 'N3', building: 233690739, a: [136.6, 8.5], b: [152, 18.4], lots: 4, depth: 17, lod: 0 },
  // Jalan China frontage of the same mapped block: simplified geometry ("distant" level of detail).
  { id: 'JC', building: 233690739, a: [152, 18.4], b: [200.8, -54.7], lots: 13, depth: 13, lod: 1, skip: 17.5 },
];

/** Mapped outlines of the replaced blocks (for the plain yard walls on edges that carry no row). */
export const BLOCKS: number[][] = [
  [71.5, 19.4, 90, -10.5, 120.1, 7.6, 104.7, 33.1, 97.8, 29.5, 95.4, 31.6],
  [113.9, 38, 129, 13, 148.2, 24.6, 135.4, 44.4, 122.6, 37.5, 119.9, 40.8, 114, 38],
  [84.7, -25, 100.1, -48.6, 140.3, -23.4, 132, -10.6, 124.7, 0.8],
  [167.9, -44.6, 145.8, -20, 152.4, -15.8, 136.6, 8.5, 152, 18.4, 200.8, -54.7, 193.9, -58.8, 184.9, -46.7, 174.8, -52.3],
];

/** Distance from (x, z) to the street centre line. */
export function distToStreet(x: number, z: number): number {
  let best = Infinity;
  for (let i = 1; i < STREET.length; i++) {
    const [ax, az] = STREET[i - 1], [bx, bz] = STREET[i];
    const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2));
    best = Math.min(best, Math.hypot(ax + vx * t - x, az + vz * t - z));
  }
  return best;
}

/** OSM way of Jalan Carpenter; its V4 ribbon, kerbs and markings are cut out of the section while V5 is shown. */
export const V5_ROAD_ID = 196054157;
const CLIP_X0 = 84.3, CLIP_X1 = 158.4;

/** Part of a road polyline (flat world metres) that lies outside the section, or null if nothing is left. */
export function clipRoadOutsideSection(p: number[]): number[] | null {
  const inside = (x: number) => x > CLIP_X0 && x < CLIP_X1;
  const out: number[] = [];
  for (let i = 0; i < p.length; i += 2) {
    const x = p[i], z = p[i + 1];
    if (i > 0) {
      const px = p[i - 2], pz = p[i - 1];
      if (inside(px) !== inside(x)) { const X = Math.min(px, x) < CLIP_X0 ? CLIP_X0 : CLIP_X1, t = (X - px) / (x - px); out.push(X, pz + (z - pz) * t); }
    }
    if (!inside(x)) out.push(x, z);
  }
  return out.length >= 4 ? out : null;
}

/** Shared switch read by the V4 chunk builders: when active, they leave the V5 section to the V5 scene. */
export const v5Exclusion = {
  active: false,
  ids: new Set<number>(V5_BUILDING_IDS),
  /** True for street furniture / props that stand in the section's street corridor. */
  inCorridor(x: number, z: number): boolean { return distToStreet(x, z) < 9.5 && x > 84 && x < 158; },
};

export interface RowFrame { ox: number; oz: number; ry: number; len: number; nx: number; nz: number; dx: number; dz: number }

/** Frame of a frontage: origin at the left end as seen from the street, x along the frontage, +z toward the street. */
export function rowFrame(r: RowDef): RowFrame {
  const mx = (r.a[0] + r.b[0]) / 2, mz = (r.a[1] + r.b[1]) / 2;
  const ex = r.b[0] - r.a[0], ez = r.b[1] - r.a[1], len = Math.hypot(ex, ez);
  let nx = ez / len, nz = -ex / len;
  // The outward normal points toward the nearer street: Carpenter Street, or for the Jalan China row away from its block.
  const probe = (s: number) => (r.id === 'JC' ? -Math.hypot(mx + nx * s * 6 - 160, mz + nz * s * 6 + 20) : distToStreet(mx + nx * s * 3, mz + nz * s * 3));
  if (probe(1) > probe(-1)) { nx = -nx; nz = -nz; }
  const dx = nz, dz = -nx; // local +x in world
  const aIsLeft = (r.b[0] - r.a[0]) * dx + (r.b[1] - r.a[1]) * dz > 0;
  const o = aIsLeft ? r.a : r.b;
  return { ox: o[0], oz: o[1], ry: Math.atan2(nx, nz), len, nx, nz, dx, dz };
}
