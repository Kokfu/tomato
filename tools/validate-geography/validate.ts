// Compares the generated world assets against the original OSM source geometry (and, for the
// machine-detected footprints, against the cached Overture Maps extract).
// Reports transformation / generation error only - NOT the accuracy of OSM itself.
// Usage: node tools/validate-geography/validate.ts
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { geoToWorld, worldToGeo, geoToEN, enToGeo } from '../../src/world/GeoProjection.ts';
import { CHUNK_SIZE, QUANT, chunkKey } from '../../src/world/config.ts';
import type { ChunkData, Manifest, Landmark } from '../../src/world/types.ts';
import { ROAD_TYPES } from '../../src/world/types.ts';
import { loadOsm, polygonsOf, roadTypeOf, isBridge } from '../generate-world/osm.ts';
import type { OsmEl } from '../generate-world/osm.ts';
import { readOverture, ringCentroid, OVERTURE_FILE, OVERTURE_ID_BASE, ML_SIMPLIFY_TOL } from '../generate-world/overture.ts';

const OUT = 'public/data/kuching';
if (!existsSync('data-src/osm/kuching.json')) {
  console.error('Source OSM cache missing (data-src/osm/kuching.json). Run: npm run data:fetch');
  process.exit(2);
}
const manifest = JSON.parse(readFileSync(`${OUT}/manifest.json`, 'utf8')) as Manifest;
const landmarks = JSON.parse(readFileSync(`${OUT}/landmarks.json`, 'utf8')) as Landmark[];
const { elements } = loadOsm();
const chunks = new Map<string, ChunkData>();
for (const k of manifest.chunks) chunks.set(k, JSON.parse(readFileSync(`${OUT}/chunks/${k}.json`, 'utf8')));
const has = (x: number, z: number) => chunks.get(chunkKey(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)));

interface Check { name: string; pass: boolean; detail: string; value?: number; limit?: number }
const checks: Check[] = [];
const add = (name: string, pass: boolean, detail: string, value?: number, limit?: number) => {
  checks.push({ name, pass, detail, value, limit });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}: ${detail}`);
};
const stat = (errs: number[]) => {
  const max = errs.reduce((m, v) => Math.max(m, v), 0);
  const rms = Math.sqrt(errs.reduce((s, v) => s + v * v, 0) / Math.max(1, errs.length));
  return { max, rms, n: errs.length };
};

// 1. Projection round trip and scale over the whole data area ------------------------------------
{
  const errs: number[] = [];
  const b = manifest.bbox;
  for (let i = 0; i <= 20; i++) for (let j = 0; j <= 20; j++) {
    const lat = b.south + ((b.north - b.south) * i) / 20, lon = b.west + ((b.east - b.west) * j) / 20;
    const [e, n] = geoToEN(lat, lon);
    const [la, lo] = enToGeo(e, n);
    errs.push(Math.hypot((la - lat) * 110574, (lo - lon) * 111320));
  }
  const s = stat(errs);
  add('projection round-trip', s.max < 1e-4, `max ${(s.max * 1000).toExponential(2)} mm over ${s.n} grid points`, s.max, 1e-4);
}

// 2. Road vertices: every source vertex inside the area must be present in the chunk output -------
const QTOL = 0.0075; // 0.5 cm quantisation per axis -> 0.71 cm worst case
{
  const pieces = new Map<number, number[][]>(); // way id -> world vertices
  for (const c of chunks.values()) {
    const ox = c.cx * CHUNK_SIZE, oz = c.cz * CHUNK_SIZE;
    for (const r of c.roads) {
      if (!pieces.has(r.id)) pieces.set(r.id, []);
      const list = pieces.get(r.id)!;
      for (let i = 0; i < r.p.length; i += 2) list.push([ox + r.p[i] / QUANT, oz + r.p[i + 1] / QUANT]);
    }
  }
  const errs: number[] = [];
  let missingWays = 0, ways = 0, verts = 0, missingVerts = 0;
  for (const el of elements) {
    if (el.type !== 'way' || !el.tags?.highway || !el.geometry || !roadTypeOf(el.tags)) continue;
    if (el.tags.area === 'yes') continue;
    let inside = 0;
    const list = pieces.get(el.id);
    for (const g of el.geometry) {
      const [x, z] = geoToWorld(g.lat, g.lon);
      // Skip vertices on the outer rim of a chunk-edge (they may be assigned to a missing neighbour).
      if (!has(x, z)) continue;
      inside++;
      verts++;
      if (!list) { missingVerts++; continue; }
      let best = Infinity;
      for (const p of list) { const d = Math.hypot(p[0] - x, p[1] - z); if (d < best) best = d; }
      if (best > 0.05) missingVerts++; else errs.push(best);
    }
    if (inside >= 2) { ways++; if (!list) missingWays++; }
  }
  const s = stat(errs);
  add('road vertices preserved', missingVerts / Math.max(1, verts) < 0.002 && s.max <= QTOL,
    `${ways} ways, ${verts} source vertices; ${missingVerts} unmatched (>5 cm), max error ${(s.max * 1000).toFixed(2)} mm, rms ${(s.rms * 1000).toFixed(2)} mm`, s.max, QTOL);
  add('road ways present', missingWays === 0, `${missingWays} of ${ways} source highway ways (>=2 vertices in area) missing from output`);
}

// 3. Building footprints ------------------------------------------------------------------------
{
  const out = new Map<number, number[][]>();
  for (const c of chunks.values()) {
    const ox = c.cx * CHUNK_SIZE, oz = c.cz * CHUNK_SIZE;
    for (const b of c.buildings) {
      const list: number[][] = [];
      for (const r of b.r) for (let i = 0; i < r.length; i += 2) list.push([ox + r[i] / QUANT, oz + r[i + 1] / QUANT]);
      out.set(b.id, (out.get(b.id) ?? []).concat(list));
    }
  }
  const errs: number[] = [];
  let n = 0, missing = 0;
  for (const el of elements) {
    if (!el.tags?.building || el.tags.building === 'no' || el.type === 'node') continue;
    const polys = polygonsOf(el);
    if (!polys.length) continue;
    const id = el.type === 'relation' ? -el.id : el.id;
    const list = out.get(id);
    const c0 = polys[0][0][0];
    if (!list) { if (has(c0[0], c0[1])) missing++; continue; }
    n++;
    for (const poly of polys) {
      // A multi-part building can straddle the edge of the prepared area: judge only parts inside it.
      let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
      for (const [x, z] of poly[0]) { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); bz0 = Math.min(bz0, z); bz1 = Math.max(bz1, z); }
      if (!has((bx0 + bx1) / 2, (bz0 + bz1) / 2)) continue;
      for (const ring of poly) for (const [x, z] of ring) {
      let best = Infinity;
      for (const p of list) { const d = Math.hypot(p[0] - x, p[1] - z); if (d < best) best = d; }
      errs.push(best);
      }
    }
  }
  const s = stat(errs);
  add('building footprints preserved', s.max <= QTOL + 0.011, `${n} buildings, ${s.n} vertices, max error ${(s.max * 1000).toFixed(2)} mm, rms ${(s.rms * 1000).toFixed(2)} mm; ${missing} source buildings near the area edge not emitted`, s.max, QTOL + 0.011);
}

// 3b. Machine-detected footprints (Overture Maps: Microsoft ML Buildings, Google Open Buildings) ----
{
  // Chunk buildings by source; world-space rings.
  interface Out { id: number; s: number; rings: number[][][] }
  const ml: Out[] = [];
  const osmGrid = new Map<string, number[][][][]>();
  const G = 64;
  for (const c of chunks.values()) {
    const ox = c.cx * CHUNK_SIZE, oz = c.cz * CHUNK_SIZE;
    for (const b of c.buildings) {
      const rings = b.r.map((r) => { const o: number[][] = []; for (let i = 0; i < r.length; i += 2) o.push([ox + r[i] / QUANT, oz + r[i + 1] / QUANT]); return o; });
      if (b.s) { ml.push({ id: b.id, s: b.s, rings }); continue; }
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const [x, z] of rings[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      for (let gz = Math.floor(z0 / G); gz <= Math.floor(z1 / G); gz++) for (let gx = Math.floor(x0 / G); gx <= Math.floor(x1 / G); gx++) {
        const k = `${gx}_${gz}`;
        if (!osmGrid.has(k)) osmGrid.set(k, []);
        osmGrid.get(k)!.push(rings);
      }
    }
  }
  const src = readOverture();
  if (!ml.length) {
    add('overture footprints match source', true, 'not applicable: the chunks contain no machine-detected footprints');
    add('overture footprints clear of OSM buildings', true, 'not applicable');
  } else if (!src) {
    add('overture footprints match source', false, `${ml.length} machine-detected footprints in the chunks but ${OVERTURE_FILE} is missing (run: npm run data:fetch)`);
    add('overture footprints clear of OSM buildings', false, 'source file missing');
  } else {
    const byId = new Map(src.features.map((f) => [f.id, f]));
    const distRing = (x: number, z: number, ring: number[][]): number => {
      let best = Infinity;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const ax = ring[j][0], az = ring[j][1], vx = ring[i][0] - ax, vz = ring[i][1] - az;
        const l2 = vx * vx + vz * vz;
        let t = l2 > 0 ? ((x - ax) * vx + (z - az) * vz) / l2 : 0;
        t = Math.max(0, Math.min(1, t));
        best = Math.min(best, Math.hypot(ax + vx * t - x, az + vz * t - z));
      }
      return best;
    };
    // (a) Every emitted vertex is a source vertex (quantisation only); every source vertex of the
    // outer ring lies within the simplification tolerance of the emitted outline.
    const vErr: number[] = [], sErr: number[] = [];
    let unknown = 0, wrongSource = 0, idClash = 0;
    const osmIds = new Set<number>();
    for (const c of chunks.values()) for (const b of c.buildings) if (!b.s) osmIds.add(b.id);
    const bySrc = [0, 0, 0];
    for (const o of ml) {
      bySrc[o.s]++;
      if (o.id < OVERTURE_ID_BASE || osmIds.has(o.id)) idClash++;
      const f = byId.get(o.id);
      if (!f) { unknown++; continue; }
      if (f.src !== o.s) wrongSource++;
      const all = f.poly.flat();
      for (const ring of o.rings) for (const [x, z] of ring) {
        let best = Infinity;
        for (const p of all) { const d = Math.hypot(p[0] - x, p[1] - z); if (d < best) best = d; }
        vErr.push(best);
      }
      for (const [x, z] of f.poly[0]) sErr.push(distRing(x, z, o.rings[0]));
    }
    const a = stat(vErr), b2 = stat(sErr);
    const SLIM = ML_SIMPLIFY_TOL + 2 * QTOL;
    add('overture footprints match source', unknown === 0 && wrongSource === 0 && idClash === 0 && a.max <= QTOL && b2.max <= SLIM,
      `${ml.length} machine-detected footprints (Microsoft ${bySrc[1]}, Google ${bySrc[2]}) vs Overture ${src.release ?? 'release unknown'}; ${unknown} not found in source, ${wrongSource} with wrong source label, ${idClash} id clashes with OSM; ` +
      `emitted vertices: ${a.n}, max ${(a.max * 1000).toFixed(2)} mm from a source vertex (limit ${(QTOL * 1000).toFixed(1)} mm); ` +
      `source outline vertices: ${b2.n}, max ${(b2.max * 100).toFixed(1)} cm, rms ${(b2.rms * 100).toFixed(1)} cm from the emitted outline (limit ${(SLIM * 100).toFixed(1)} cm = ${ML_SIMPLIFY_TOL} m simplification + quantisation)`,
      b2.max, SLIM);
    // (b) No machine-detected footprint has its centroid inside an OSM building.
    const pin = (x: number, z: number, ring: number[][]) => {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], zi = ring[i][1], xj = ring[j][0], zj = ring[j][1];
        if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
      }
      return inside;
    };
    let inOsm = 0;
    const examples: string[] = [];
    for (const o of ml) {
      const [x, z] = ringCentroid(o.rings[0] as [number, number][]);
      for (const rings of osmGrid.get(`${Math.floor(x / G)}_${Math.floor(z / G)}`) ?? []) {
        if (!pin(x, z, rings[0]) || rings.slice(1).some((h) => pin(x, z, h))) continue;
        inOsm++;
        if (examples.length < 5) examples.push(String(o.id));
        break;
      }
    }
    add('overture footprints clear of OSM buildings', inOsm === 0, `${inOsm} of ${ml.length} machine-detected footprints have their centroid inside an OSM building footprint` + (examples.length ? ` (ids ${examples.join(', ')})` : ''), inOsm, 0);
  }
}

// 4. River: source water-polygon vertices lie on / inside the generated water ---------------------
function pir(x: number, z: number, r: number[], ox: number, oz: number): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const xi = ox + r[i] / QUANT, zi = oz + r[i + 1] / QUANT, xj = ox + r[j] / QUANT, zj = oz + r[j + 1] / QUANT;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function inWater(x: number, z: number): boolean {
  const c = has(x, z);
  if (!c) return false;
  const ox = c.cx * CHUNK_SIZE, oz = c.cz * CHUNK_SIZE;
  for (const poly of c.water) {
    if (!pir(x, z, poly[0], ox, oz)) continue;
    let hole = false;
    for (let i = 1; i < poly.length; i++) if (pir(x, z, poly[i], ox, oz)) hole = true;
    if (!hole) return true;
  }
  return false;
}
function distToWaterEdge(x: number, z: number): number {
  let best = Infinity;
  const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const c = chunks.get(chunkKey(cx + dx, cz + dz));
    if (!c) continue;
    const ox = c.cx * CHUNK_SIZE, oz = c.cz * CHUNK_SIZE;
    for (const poly of c.water) for (const r of poly) for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      const ax = ox + r[j] / QUANT, az = oz + r[j + 1] / QUANT, vx = ox + r[i] / QUANT - ax, vz = oz + r[i + 1] / QUANT - az;
      const l2 = vx * vx + vz * vz;
      let t = l2 > 0 ? ((x - ax) * vx + (z - az) * vz) / l2 : 0;
      t = Math.max(0, Math.min(1, t));
      best = Math.min(best, Math.hypot(ax + vx * t - x, az + vz * t - z));
    }
  }
  return best;
}
{
  const errs: number[] = [];
  let riverVerts = 0;
  for (const el of elements) {
    const t = el.tags;
    if (!t || !(t.natural === 'water' || t.waterway === 'riverbank' || t.waterway === 'dock' || t.landuse === 'reservoir' || t.landuse === 'basin')) continue;
    for (const poly of polygonsOf(el)) for (const ring of poly) for (const [x, z] of ring) {
      // Stay one metre inside the area so rim vertices are not judged against missing chunks.
      if (!has(x - 1, z - 1) || !has(x + 1, z + 1)) continue;
      riverVerts++;
      const d = distToWaterEdge(x, z);
      // A vertex shared by two merged water polygons becomes interior to the union.
      errs.push(d < 0.05 || inWater(x, z) ? Math.min(d, 0.0) + (d < 0.05 ? d : 0) : d);
    }
  }
  const s = stat(errs);
  add('water outline preserved', s.max <= 0.02, `${riverVerts} source water vertices, max boundary error ${(s.max * 1000).toFixed(2)} mm`, s.max, 0.02);
}

// 5. Landmarks sit on their mapped features -----------------------------------------------------
{
  const byRef = new Map<string, OsmEl>();
  for (const el of elements) byRef.set(`${el.type}/${el.id}`, el);
  let bad = 0;
  const rows: string[] = [];
  for (const l of landmarks) {
    const el = l.osm ? byRef.get(l.osm) : undefined;
    if (!el) { bad++; rows.push(`${l.name}: source feature ${l.osm} not found`); continue; }
    const geo = el.type === 'node' ? [{ lat: el.lat!, lon: el.lon! }] : el.type === 'way' ? el.geometry ?? [] : (el.members ?? []).flatMap((m) => m.geometry ?? []);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const g of geo) { const [x, z] = geoToWorld(g.lat, g.lon); x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    // Street landmarks use a vertex of any way carrying the street name, so allow a generous margin.
    const m = l.kind === 'street' ? 1500 : 0.5;
    const ok = l.x >= x0 - m && l.x <= x1 + m && l.z >= z0 - m && l.z <= z1 + m;
    const [lat, lon] = worldToGeo(l.x, l.z);
    const rt = Math.hypot((lat - l.lat) * 110574, (lon - l.lon) * 111320);
    if (!ok || rt > 0.02) { bad++; rows.push(`${l.name}: outside mapped feature extent or lat/lon mismatch (${rt.toFixed(3)} m)`); }
  }
  add('landmark positions', bad === 0, `${landmarks.length - bad}/${landmarks.length} landmarks lie within their mapped OSM feature` + (rows.length ? `; ${rows.join('; ')}` : ''));
}

// 6. Darul Hana Bridge connects the two river banks ----------------------------------------------
{
  const ways = elements.filter((e) => e.type === 'way' && e.tags?.highway && isBridge(e.tags) && /Darul Hana/i.test(e.tags.name ?? ''));
  const pts = ways.flatMap((w) => w.geometry!.map((g) => geoToWorld(g.lat, g.lon)));
  let wet = 0;
  for (const [x, z] of pts) if (inWater(x, z)) wet++;
  // Landings: bridge vertices shared with a non-bridge highway way.
  const plain = new Set<number>();
  for (const e of elements) if (e.type === 'way' && e.tags?.highway && !isBridge(e.tags)) for (const n of e.nodes ?? []) plain.add(n);
  const ends = ways.flatMap((w) => w.nodes!.map((n, i) => (plain.has(n) ? geoToWorld(w.geometry![i].lat, w.geometry![i].lon) : null)).filter((p) => p !== null)) as [number, number][];
  const a = ends[0] ?? pts[0], b = ends[ends.length - 1] ?? pts[0];
  const far = Math.hypot(a[0] - b[0], a[1] - b[1]);
  // Deck segments exist in the output for the over-water part.
  let decks = 0;
  for (const c of chunks.values()) decks += c.decks.length / 7;
  const pedType = ROAD_TYPES.indexOf('pedestrian');
  let outPieces = 0;
  for (const c of chunks.values()) for (const r of c.roads) if (ways.some((w) => w.id === r.id) && r.t === pedType && r.f & 1 && r.e) outPieces++;
  const ok = ways.length > 0 && ends.length >= 2 && far > 100 && wet > 0 && !inWater(a[0], a[1]) && !inWater(b[0], b[1]) && outPieces > 0;
  add('Darul Hana Bridge spans the river', ok, `${ways.length} mapped bridge ways, ${pts.length} vertices (${wet} over water), ${ends.length} landings ${far.toFixed(1)} m apart, both landings on land: ${!inWater(a[0], a[1]) && !inWater(b[0], b[1])}, ${outPieces} elevated walkable pieces in output`);
  add('bridge collision decks emitted', decks > 0, `${decks} traversable deck segments across all chunks`);
}

// 7. Spawn point ---------------------------------------------------------------------------------
{
  const s = manifest.spawn;
  const c = has(s.x, s.z);
  let inB = false;
  if (c) {
    const ox = c.cx * CHUNK_SIZE, oz = c.cz * CHUNK_SIZE;
    for (const b of c.buildings) if (pir(s.x, s.z, b.r[0], ox, oz)) inB = true;
  }
  add('spawn on dry open ground', !!c && !inWater(s.x, s.z) && !inB, `spawn ${s.lat}, ${s.lon} -> chunk ${c ? `${c.cx},${c.cz}` : 'none'}, in water: ${inWater(s.x, s.z)}, in building: ${inB}`);
}

const failed = checks.filter((c) => !c.pass).length;
writeFileSync('docs/validation-report.json', JSON.stringify({ generatedAt: new Date().toISOString(), osmTimestamp: manifest.osmTimestamp, overtureRelease: manifest.overtureRelease ?? null, checks }, null, 1));
console.log(`\n${checks.length - failed}/${checks.length} checks passed. Report: docs/validation-report.json`);
process.exit(failed ? 1 : 0);
