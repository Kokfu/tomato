// Derives the geographic site (position, orientation, extent) of every registered landmark from the
// mapped features its definition names. Nothing here is a hand-typed coordinate: a site is always a
// function of OpenStreetMap geometry plus, where the definition says so, a measured dimension.
import polygonClipping from 'polygon-clipping';
import { LANDMARK_REGISTRY } from '../../src/world/landmarks/registry.ts';
import type { LandmarkDefinition } from '../../src/world/landmarks/registry.ts';
import { geoToWorld } from '../../src/world/GeoProjection.ts';
import { project, cleanRing, ringArea, pointInRing } from './osm.ts';
import type { OsmEl, Pt } from './osm.ts';

export interface DerivedSite {
  def: LandmarkDefinition;
  /** Model origin: centre of the front edge, world metres [x, z]. */
  front: Pt;
  /** Unit vector along the front, pointing to the right for someone facing the building. */
  right: Pt;
  /** Unit vector out of the building, toward the street it faces. */
  normal: Pt;
  width: number;
  depth: number;
  /** Site outline, world metres (closed implicitly). The generic building is carved to this. */
  ring: Pt[];
  /**
   * Outline used to cut the site out of its host footprint: the site rectangle pushed 0.5 m past
   * the host's walls and a few millimetres wider per site, so that no cutting edge ever lies
   * exactly on a host edge or on an earlier cut (coincident edges break polygon clipping).
   */
  cutter: Pt[];
  /** OSM way ids of the host footprints the outline is cut out of. */
  hostIds: number[];
  /** Cross-checks of the derivation against independent mapped points. */
  checks: { ref: string; name?: string; inside: boolean; distanceM: number }[];
  notes: string[];
}

type Poly = Pt[][];
const closeRing = (r: Pt[]): Pt[] => [...r, r[0]];
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const dot = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1];
const norm = (a: Pt): Pt => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };
const refId = (ref: string) => Number(ref.split('/')[1]);

function distToSeg(p: Pt, a: Pt, b: Pt): number {
  const v = sub(b, a), l2 = dot(v, v);
  const t = l2 > 0 ? Math.max(0, Math.min(1, dot(sub(p, a), v) / l2)) : 0;
  return Math.hypot(a[0] + v[0] * t - p[0], a[1] + v[1] * t - p[1]);
}
function distToRing(p: Pt, r: Pt[]): number {
  let d = Infinity;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) d = Math.min(d, distToSeg(p, r[j], r[i]));
  return d;
}
function rect(front: Pt, right: Pt, normal: Pt, w: number, d0: number, d1: number): Pt[] {
  const at = (lx: number, depth: number): Pt => [front[0] + right[0] * lx - normal[0] * depth, front[1] + right[1] * lx - normal[1] * depth];
  return [at(-w / 2, d0), at(w / 2, d0), at(w / 2, d1), at(-w / 2, d1)];
}
/** Largest polygon of rect AND host (outer ring only). */
function clipToHost(r: Pt[], host: Pt[] | null): Pt[] {
  if (!host) return r;
  const res = polygonClipping.intersection([closeRing(r)] as any, [closeRing(host)] as any) as unknown as Pt[][][];
  let best: Pt[] = [], bestA = 0;
  for (const poly of res) {
    const ring = cleanRing(poly[0] as Pt[]);
    const a = Math.abs(ringArea(ring));
    if (a > bestA) { bestA = a; best = ring; }
  }
  if (!best.length) throw new Error('landmark site does not overlap its host footprint');
  return best;
}

/**
 * @param elements main OSM extract (ways with geometry)
 * @param points   every OSM element that may be referenced as a point (main extract + POI extract)
 */
export function deriveSites(elements: OsmEl[], points: OsmEl[]): DerivedSite[] {
  const way = (ref: string): Pt[] => {
    const el = elements.find((e) => e.type === 'way' && e.id === refId(ref) && e.geometry);
    if (!el) throw new Error(`landmark registry: ${ref} is not in the OSM extract`);
    return cleanRing(project(el.geometry!));
  };
  const node = (ref: string): { p: Pt; name?: string } => {
    const el = points.find((e) => e.type === 'node' && e.id === refId(ref) && e.lat !== undefined);
    if (!el) throw new Error(`landmark registry: ${ref} is not in the OSM / POI extract`);
    return { p: geoToWorld(el.lat!, el.lon!), name: el.tags?.name };
  };
  const sites: DerivedSite[] = [];
  for (const def of LANDMARK_REGISTRY) {
    const s = def.site;
    const hostIds = def.sources.footprints.map(refId);
    const notes: string[] = [];
    let front: Pt, right: Pt, normal: Pt, width: number, ring: Pt[], cutter: Pt[];
    const grow = 0.004 * sites.filter((o) => o.hostIds.some((h) => hostIds.includes(h))).length;
    if (s.type === 'footprint') {
      const fp = way(s.footprint);
      const street = elements.filter((e) => e.type === 'way' && e.tags?.highway && e.tags.name === s.frontStreet && e.geometry).map((e) => project(e.geometry!));
      if (!street.length) throw new Error(`${def.id}: street "${s.frontStreet}" not found`);
      const len = (i: number) => Math.hypot(fp[(i + 1) % fp.length][0] - fp[i][0], fp[(i + 1) % fp.length][1] - fp[i][1]);
      let longest = 0;
      for (let i = 0; i < fp.length; i++) longest = Math.max(longest, len(i));
      // Front = the long side nearest the named street.
      let bi = -1, bd = Infinity;
      for (let i = 0; i < fp.length; i++) {
        if (len(i) < longest * 0.6) continue;
        const a = fp[i], b = fp[(i + 1) % fp.length];
        const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        let d = Infinity;
        for (const line of street) for (let k = 1; k < line.length; k++) d = Math.min(d, distToSeg(mid, line[k - 1], line[k]));
        if (d < bd) { bd = d; bi = i; }
      }
      const a = fp[bi], b = fp[(bi + 1) % fp.length];
      front = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const dir = norm(sub(b, a));
      let cx = 0, cz = 0;
      for (const p of fp) { cx += p[0] / fp.length; cz += p[1] / fp.length; }
      normal = [dir[1], -dir[0]];
      if (dot(sub(front, [cx, cz]), normal) < 0) normal = [-normal[0], -normal[1]];
      right = [normal[1], -normal[0]];
      width = len(bi);
      let depth = 0;
      for (const p of fp) depth = Math.max(depth, dot(sub(front, p), normal));
      ring = fp;
      cutter = rect(front, right, normal, width + 1, -0.5, depth + 0.5);
      notes.push(`mapped footprint ${s.footprint} used as is (${width.toFixed(2)} x ${depth.toFixed(2)} m); front = long side nearest ${s.frontStreet} (${bd.toFixed(1)} m from its centre line)`);
    } else if (s.type === 'plot') {
      const plot = way(s.plot);
      const street = elements.filter((e) => e.type === 'way' && e.tags?.highway && e.tags.name === s.frontStreet && e.geometry).map((e) => project(e.geometry!));
      if (!street.length) throw new Error(`${def.id}: street "${s.frontStreet}" not found`);
      // Front = the plot edge closest to the named street.
      let bi = 0, bd = Infinity;
      for (let i = 0; i < plot.length; i++) {
        const a = plot[i], b = plot[(i + 1) % plot.length];
        const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        let d = Infinity;
        for (const line of street) for (let k = 1; k < line.length; k++) d = Math.min(d, distToSeg(mid, line[k - 1], line[k]));
        if (d < bd) { bd = d; bi = i; }
      }
      const a = plot[bi], b = plot[(bi + 1) % plot.length];
      front = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const dir = norm(sub(b, a));
      let cx = 0, cz = 0;
      for (const p of plot) { cx += p[0] / plot.length; cz += p[1] / plot.length; }
      normal = [dir[1], -dir[0]];
      if (dot(sub(front, [cx, cz]), normal) < 0) normal = [-normal[0], -normal[1]];
      right = [normal[1], -normal[0]];
      const mapped = Math.hypot(b[0] - a[0], b[1] - a[1]);
      width = s.width?.m ?? mapped;
      let depth = 0;
      for (const p of plot) depth = Math.max(depth, dot(sub(front, p), normal));
      notes.push(`front edge of ${s.plot} facing ${s.frontStreet} (${bd.toFixed(1)} m from its centre line), mapped plot ${mapped.toFixed(2)} x ${depth.toFixed(2)} m`);
      if (s.width) notes.push(`LOCAL OVERRIDE width ${s.width.m} m (mapped ${mapped.toFixed(2)} m): ${s.width.basis}`);
      const host = hostIds.length ? way(def.sources.footprints[0]) : null;
      cutter = rect(front, right, normal, width + grow, -0.5, depth + 0.5);
      ring = clipToHost(rect(front, right, normal, width, -0.5, depth + 0.5), host);
    } else {
      const other = sites.find((o) => o.def.id === s.of);
      if (!other) throw new Error(`${def.id}: site "${s.of}" must be defined earlier in the registry`);
      const host = way(s.host);
      // Follow the other landmark's axis out of its front until it meets the host footprint.
      let bt = Infinity, hit: Pt | null = null, edge: Pt = [1, 0];
      for (let i = 0, j = host.length - 1; i < host.length; j = i++) {
        const a = host[j], e = sub(host[i], a);
        const den = other.normal[0] * e[1] - other.normal[1] * e[0];
        if (Math.abs(den) < 1e-9) continue;
        const w = sub(a, other.front);
        const t = (w[0] * e[1] - w[1] * e[0]) / den, u = (w[0] * other.normal[1] - w[1] * other.normal[0]) / den;
        if (t > 0.5 && t < bt && u >= 0 && u <= 1) { bt = t; hit = [other.front[0] + other.normal[0] * t, other.front[1] + other.normal[1] * t]; edge = norm(e); }
      }
      if (!hit) throw new Error(`${def.id}: the axis of "${s.of}" does not meet ${s.host}`);
      normal = [edge[1], -edge[0]];
      if (dot(sub(other.front, hit), normal) < 0) normal = [-normal[0], -normal[1]];
      right = [normal[1], -normal[0]];
      width = s.width.m;
      front = [hit[0] - normal[0] * s.depth.from, hit[1] - normal[1] * s.depth.from];
      const d0 = s.depth.from - 0.5, d1 = s.depth.to ?? 400;
      cutter = rect(hit, right, normal, width + grow, d0, d1);
      ring = clipToHost(rect(hit, right, normal, width, s.depth.from === 0 ? -0.5 : s.depth.from, d1), host);
      notes.push(`axis of ${s.of} meets ${s.host} ${bt.toFixed(2)} m from that landmark's front; site = ${width} m wide, ${s.depth.from} m to ${s.depth.to ?? 'the back of the footprint'} behind the street wall`);
      notes.push(`LOCAL OVERRIDE width: ${s.width.basis}`);
      notes.push(`LOCAL OVERRIDE depth: ${s.depth.basis}`);
    }
    let depth = 0;
    for (const p of ring) depth = Math.max(depth, dot(sub(front, p), normal));
    const checks = (s.type === 'opposite' ? s.mustContain : []).map((ref) => {
      const n = node(ref);
      const inside = pointInRing(n.p[0], n.p[1], ring);
      return { ref, name: n.name, inside, distanceM: +(inside ? 0 : distToRing(n.p, ring)).toFixed(2) };
    });
    sites.push({ def, front, right, normal, width, depth, ring, cutter, hostIds, checks, notes });
  }
  return sites;
}

/** Remove a site outline from a footprint. Returns the remaining outer rings (largest first). */
export function carve(poly: Poly, site: Pt[], minArea = 4): Poly[] {
  const res = polygonClipping.difference(poly.map(closeRing) as any, [closeRing(site)] as any) as unknown as Pt[][][];
  const out: Poly[] = [];
  for (const p of res) {
    const rings = p.map((r) => cleanRing(r as Pt[])).filter((r) => r.length >= 3);
    if (rings.length && Math.abs(ringArea(rings[0])) >= minArea) out.push(rings);
  }
  return out.sort((a, b) => Math.abs(ringArea(b[0])) - Math.abs(ringArea(a[0])));
}

/** Model-local [x, z] (x = right, z = toward the street) -> world [x, z]. */
export function siteToWorld(s: DerivedSite, lx: number, lz: number): Pt {
  return [s.front[0] + s.right[0] * lx + s.normal[0] * lz, s.front[1] + s.right[1] * lx + s.normal[1] * lz];
}
