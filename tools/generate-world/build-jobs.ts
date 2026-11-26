// N1-M7: the places that jobs (food deliveries, taxi fares) go to, as one small file for the game.
//
// Reads the per-chunk place files (public/data/kuching/places/*.json, written by build-places.ts from OpenStreetMap
// and Overture Maps) and keeps every place whose category belongs to a job group (src/play/sites.ts) and that a car
// can reach: within 60 m of a public carriageway of the largest connected part of the drive graph. No name is
// written: a job describes a place by its group and its street only.
// Usage: node tools/generate-world/build-jobs.ts   (after data:places and data:graph)
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { DATA_ROOT } from '../../src/world/config.ts';
import { RouteGraph, isStoppingEdge } from '../../src/ui/Router.ts';
import { GROUPS, groupOf } from '../../src/play/sites.ts';
import type { JobsFile } from '../../src/play/sites.ts';

const ROOT = `public/${DATA_ROOT}`;
const g = new RouteGraph(JSON.parse(readFileSync(`${ROOT}/drive-graph.json`, 'utf8')));

// the largest connected component of the drive graph (by edge length)
const size = new Map<number, number>();
for (let e = 0; e < g.edgeCount; e++) size.set(g.comp[g.ea[e]], (size.get(g.comp[g.ea[e]]) ?? 0) + g.elen[e]);
const main = [...size].sort((a, b) => b[1] - a[1])[0][0];

interface P { x: number; z: number; cat?: string; v?: number; conf?: number }
const seen = new Map<string, number>();
const sites: number[] = [];
const count: Record<string, number> = {};
let total = 0, far = 0;
for (const f of readdirSync(`${ROOT}/places`).filter((n) => /^-?\d+_-?\d+\.json$/.test(n)).sort()) {
  const file = JSON.parse(readFileSync(`${ROOT}/places/${f}`, 'utf8')) as { places: P[] };
  for (const p of file.places) {
    const group = groupOf(p.cat);
    if (!group) continue;
    total++;
    const snap = g.snap(p.x, p.z, 60, undefined, (e) => isStoppingEdge(g, e)).find((s) => s.component === main);
    if (!snap) { far++; continue; }
    // one place per group and 12 m cell (the same business is often listed by both sources)
    const key = `${group}|${Math.round(p.x / 12)}|${Math.round(p.z / 12)}`;
    if (seen.has(key)) continue;
    seen.set(key, 1);
    sites.push(Math.round(p.x), Math.round(p.z), GROUPS.indexOf(group));
    count[group] = (count[group] ?? 0) + 1;
  }
}
const out: JobsFile = { v: 1, groups: GROUPS, sites };
writeFileSync(`${ROOT}/jobs.json`, JSON.stringify(out));
console.log(`jobs.json: ${sites.length / 3} places of ${total} in the job groups (${far} not within 60 m of a public road)`, count);
