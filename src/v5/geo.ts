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

// ---------------------------------------------------------------------------------------------
// Jalan China (China Street) section, V7: the 88 m between Jalan Carpenter and Jalan Main Bazaar.
// Both frontages are mapped block edges (OSM ways 233690739 and 236495396). The street frame runs
// along the middle between them: s = metres from the Carpenter Street end, o = metres to the east.
// ---------------------------------------------------------------------------------------------
export const CHINA_WEST: RowDef = { id: 'CW', building: 233690739, a: [152, 18.4], b: [200.8, -54.7], lots: 16, depth: 13, lod: 0 };
export const CHINA_EAST: RowDef = { id: 'CE', building: 236495396, a: [158.7, 22.9], b: [207.3, -49.6], lots: 16, depth: 15, lod: 0 };
/** Block east of the street (the west block is shared with the Carpenter Street section). */
export const CHINA_BUILDING_IDS = [236495396];
export const CHINA_BLOCK = [207.3, -49.6, 158.7, 22.9, 171.8, 31, 182.6, 14.9, 187.6, 16.5, 190.6, 12.2, 194.2, 8.9, 212.8, -23.1, 218.7, -34.7, 213, -41, 214.8, -43.3];
/** OSM way of Jalan China. */
export const CHINA_ROAD_ID = 124545031;
export const CHINA = (() => {
  const ex = CHINA_WEST.b[0] - CHINA_WEST.a[0], ez = CHINA_WEST.b[1] - CHINA_WEST.a[1], len = Math.hypot(ex, ez);
  const dx = ex / len, dz = ez / len, nx = -dz, nz = dx; // n points east
  const half = ((CHINA_EAST.a[0] - CHINA_WEST.a[0]) * nx + (CHINA_EAST.a[1] - CHINA_WEST.a[1]) * nz) / 2;
  const ox = CHINA_WEST.a[0] + nx * half, oz = CHINA_WEST.a[1] + nz * half;
  return {
    ox, oz, dx, dz, nx, nz, len, half,
    /** Heading (rotation about +Y) of the street frame: local +x along the street northward, local +z to the... see china.ts. */
    toStreet(x: number, z: number): [number, number] { return [(x - ox) * dx + (z - oz) * dz, (x - ox) * nx + (z - oz) * nz]; },
    toWorld(s: number, o: number): [number, number] { return [ox + dx * s + nx * o, oz + dz * s + nz * o]; },
  };
})();
const inChina = (x: number, z: number, pad = 0): boolean => { const [s, o] = CHINA.toStreet(x, z); return s > -3 - pad && s < CHINA.len + 4 + pad && Math.abs(o) < CHINA.half + 3; };

/** Part of a polyline outside a region (crossings found by bisection), or null if nothing is left. */
function clipOutside(p: number[], inside: (x: number, z: number) => boolean): number[] | null {
  const out: number[] = [];
  for (let i = 0; i < p.length; i += 2) {
    const x = p[i], z = p[i + 1];
    if (i > 0) {
      const px = p[i - 2], pz = p[i - 1];
      if (inside(px, pz) !== inside(x, z)) {
        let lo = 0, hi = 1; const a = inside(px, pz);
        for (let k = 0; k < 18; k++) { const m = (lo + hi) / 2; if (inside(px + (x - px) * m, pz + (z - pz) * m) === a) lo = m; else hi = m; }
        out.push(px + (x - px) * lo, pz + (z - pz) * lo);
      }
    }
    if (!inside(x, z)) out.push(x, z);
  }
  return out.length >= 4 ? out : null;
}

/** Shared switch read by the V4 chunk builders: when active, they leave the V5 sections to the V5 scene. */
export const v5Exclusion = {
  active: false,
  /** True while the Jalan China section is shown as well. */
  china: false,
  ids: new Set<number>(V5_BUILDING_IDS),
  setChina(on: boolean): void { this.china = on; for (const id of CHINA_BUILDING_IDS) { if (on) this.ids.add(id); else this.ids.delete(id); } },
  /** True for street furniture / props that stand in a section's street corridor. */
  inCorridor(x: number, z: number): boolean { return (distToStreet(x, z) < 9.5 && x > 84 && x < 158) || (this.china && inChina(x, z, 2)); },
  /** A road polyline (world metres) with the parts drawn by a V5 section removed: undefined = untouched, null = nothing left. */
  clipRoad(id: number, world: number[]): number[] | null | undefined {
    if (id === V5_ROAD_ID) return clipRoadOutsideSection(world);
    if (this.china && id === CHINA_ROAD_ID) return clipOutside(world, (x, z) => inChina(x, z));
    return undefined;
  },
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
