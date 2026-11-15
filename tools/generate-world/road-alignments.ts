// Local road-alignment overrides.
//
// OpenStreetMap sometimes draws a street as one long straight segment between two junctions that
// does not agree with the buildings mapped along it. Where independent mapped structures fix the
// street's real axis, a segment may be re-aligned here. As with landmark sites, an override holds
// no coordinates: the new centre line is DERIVED from mapped features (the centre of a gate the
// street passes through, the mid-line between the facing walls of the blocks either side). The
// junction nodes at both ends of the segment are never moved, so the network stays connected.
//
// Applied inside loadOsm(), so every tool (world build, route graph, validation) sees the same
// geometry. The cached extract in data-src/ is not modified.
import { geoToWorld, worldToGeo } from '../../src/world/GeoProjection.ts';

export interface RoadAlignment {
  /** OSM way id of the street. */
  way: number;
  /** Indices of the two consecutive nodes of the way whose connecting segment is re-aligned. */
  segment: [number, number];
  /** OSM way refs of structures the street passes through the centre of (e.g. a ceremonial gate). */
  through: number[];
  /** OSM building ways facing each other across the street: the centre line runs midway between their walls. */
  between: [number, number];
  /** Why, and how far off the mapped line is. */
  basis: string;
}

export const ROAD_ALIGNMENTS: RoadAlignment[] = [
  {
    way: 196054157, // Jalan Carpenter, from Jalan Tun Abang Haji Openg to Jalan China
    segment: [0, 1],
    through: [1388134059], // Harmony Arch
    between: [233690735, 236495089],
    basis: 'The mapped segment is a single 108 m straight line that runs 1.5 to 2 m from the north block and 6.6 m from the south block, and passes 4 m north of the centre of the mapped Harmony Arch. Aerial imagery shows the carriageway midway between the blocks and through the arch.',
  },
];

type Pt = [number, number];
interface El { type: string; id: number; nodes?: number[]; geometry?: { lat: number; lon: number }[] }

/** First id for the vertices inserted by an alignment (not OSM nodes; never shared with another way). */
export const ALIGNMENT_NODE_BASE = 9_000_000_000_000_000;

export interface AlignmentResult { way: number; inserted: number; maxShiftM: number; lengthM: number }

export function applyRoadAlignments(elements: El[]): AlignmentResult[] {
  const out: AlignmentResult[] = [];
  const ring = (id: number): Pt[] => {
    const el = elements.find((e) => e.type === 'way' && e.id === id && e.geometry);
    if (!el) throw new Error(`road alignment: way/${id} is not in the OSM extract`);
    return el.geometry!.map((g) => geoToWorld(g.lat, g.lon));
  };
  let next = ALIGNMENT_NODE_BASE;
  for (const def of ROAD_ALIGNMENTS) {
    const el = elements.find((e) => e.type === 'way' && e.id === def.way && e.geometry && e.nodes);
    if (!el) throw new Error(`road alignment: way/${def.way} is not in the OSM extract`);
    const [i0, i1] = def.segment;
    if (i1 !== i0 + 1 || !el.geometry![i1]) throw new Error(`road alignment way/${def.way}: segment must be two consecutive nodes`);
    const a = geoToWorld(el.geometry![i0].lat, el.geometry![i0].lon), b = geoToWorld(el.geometry![i1].lat, el.geometry![i1].lon);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const d: Pt = [(b[0] - a[0]) / len, (b[1] - a[1]) / len], n: Pt = [-d[1], d[0]];
    /** Signed offset along n of the nearest crossing of the line {p + t n} with a ring, or null. */
    const cross = (p: Pt, r: Pt[]): number | null => {
      let best: number | null = null;
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const ex = r[i][0] - r[j][0], ez = r[i][1] - r[j][1];
        const den = n[0] * ez - n[1] * ex;
        if (Math.abs(den) < 1e-9) continue;
        const wx = r[j][0] - p[0], wz = r[j][1] - p[1];
        const t = (wx * ez - wz * ex) / den, u = (wx * n[1] - wz * n[0]) / den;
        if (u < 0 || u > 1) continue;
        if (best === null || Math.abs(t) < Math.abs(best)) best = t;
      }
      return best;
    };
    // station along the mapped segment -> offset of the derived centre line
    const pts: { s: number; off: number }[] = [];
    for (const id of def.through) {
      const r = ring(id);
      let cx = 0, cz = 0;
      const m = r.length - 1; // closed way: last vertex repeats the first
      for (let i = 0; i < m; i++) { cx += r[i][0] / m; cz += r[i][1] / m; }
      pts.push({ s: (cx - a[0]) * d[0] + (cz - a[1]) * d[1], off: (cx - a[0]) * n[0] + (cz - a[1]) * n[1] });
    }
    const ra = ring(def.between[0]), rb = ring(def.between[1]);
    for (let s = 4; s < len - 4; s += 4) {
      const p: Pt = [a[0] + d[0] * s, a[1] + d[1] * s];
      const ta = cross(p, ra), tb = cross(p, rb);
      // both walls must be present, on opposite sides of each other, a plausible street width apart
      if (ta === null || tb === null || Math.abs(ta - tb) < 5 || Math.abs(ta - tb) > 16) continue;
      pts.push({ s, off: (ta + tb) / 2 });
    }
    pts.sort((p, q) => p.s - q.s);
    const inner = pts.filter((p) => p.s > 3 && p.s < len - 3);
    if (inner.length < 2) throw new Error(`road alignment way/${def.way}: the named structures do not constrain the segment`);
    // Keep the gate centres, the first and last constrained point and any point more than 0.2 m off the chord between kept ones.
    const keep: typeof inner = [];
    const add = (lo: number, hi: number) => {
      let worst = -1, wd = 0.2;
      for (let i = lo + 1; i < hi; i++) {
        const t = (inner[i].s - inner[lo].s) / (inner[hi].s - inner[lo].s);
        const dv = Math.abs(inner[i].off - (inner[lo].off + (inner[hi].off - inner[lo].off) * t));
        if (dv > wd) { wd = dv; worst = i; }
      }
      if (worst > 0) { add(lo, worst); keep.push(inner[worst]); add(worst, hi); }
    };
    keep.push(inner[0]); add(0, inner.length - 1); keep.push(inner[inner.length - 1]);
    const geo = keep.map((p) => { const [lat, lon] = worldToGeo(a[0] + d[0] * p.s + n[0] * p.off, a[1] + d[1] * p.s + n[1] * p.off); return { lat, lon }; });
    el.geometry!.splice(i1, 0, ...geo);
    el.nodes!.splice(i1, 0, ...keep.map(() => next++));
    out.push({ way: def.way, inserted: keep.length, maxShiftM: +Math.max(...keep.map((p) => Math.abs(p.off))).toFixed(2), lengthM: +len.toFixed(1) });
  }
  return out;
}
