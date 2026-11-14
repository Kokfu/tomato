// Generates the static world assets (chunks, height grid, overview, landmarks, manifest)
// from the cached OSM extract and DEM tile.  Usage: node tools/generate-world/build.ts
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import polygonClipping from 'polygon-clipping';
import earcut from 'earcut';
import { fromArrayBuffer } from 'geotiff';
import { geoToWorld, worldToGeo, ORIGIN_LAT, ORIGIN_LON } from '../../src/world/GeoProjection.ts';
import { CHUNK_SIZE, CELL, QUANT, DATA_BBOX, SPAWN_GEO, BANK_LEVEL, chunkKey } from '../../src/world/config.ts';
import { ROAD_TYPES, ROAD_STYLE, BUILDING_KINDS, AREA_KINDS } from '../../src/world/types.ts';
import type { ChunkData, RoadData, BuildingData, AreaData, Manifest, RoadType, Landmark } from '../../src/world/types.ts';
import { loadOsm, project, polygonsOf, cleanRing, ringArea, pointInPoly, roadTypeOf, roadWidth, isBridge, isTunnel, isWalkable, isClosedWay } from './osm.ts';
import type { OsmEl, Pt } from './osm.ts';
import { LANDMARK_DEFS } from './landmark-defs.ts';

const OUT = 'public/data/kuching';
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
type Poly = Pt[][];
type MultiPoly = Poly[];

// ---------------------------------------------------------------------------------------------
// 1. Load + classify
// ---------------------------------------------------------------------------------------------
const { elements, timestamp } = loadOsm();
log(`OSM elements: ${elements.length}, base timestamp ${timestamp}`);

// World-space extent: the largest chunk-aligned rectangle inside the projected bbox.
const corners = [
  geoToWorld(DATA_BBOX.south, DATA_BBOX.west), geoToWorld(DATA_BBOX.south, DATA_BBOX.east),
  geoToWorld(DATA_BBOX.north, DATA_BBOX.west), geoToWorld(DATA_BBOX.north, DATA_BBOX.east),
];
const minX = Math.max(corners[0][0], corners[2][0]), maxX = Math.min(corners[1][0], corners[3][0]);
const minZ = Math.max(corners[2][1], corners[3][1]), maxZ = Math.min(corners[0][1], corners[1][1]);
const CX0 = Math.ceil(minX / CHUNK_SIZE), CX1 = Math.floor(maxX / CHUNK_SIZE) - 1;
const CZ0 = Math.ceil(minZ / CHUNK_SIZE), CZ1 = Math.floor(maxZ / CHUNK_SIZE) - 1;
const AREA = { minX: CX0 * CHUNK_SIZE, maxX: (CX1 + 1) * CHUNK_SIZE, minZ: CZ0 * CHUNK_SIZE, maxZ: (CZ1 + 1) * CHUNK_SIZE };
log(`Chunks x ${CX0}..${CX1}, z ${CZ0}..${CZ1} (${(CX1 - CX0 + 1) * (CZ1 - CZ0 + 1)} chunks), area ${(AREA.maxX - AREA.minX) / 1000} x ${(AREA.maxZ - AREA.minZ) / 1000} km`);

interface Road {
  id: number; type: RoadType; w: number; inferred: boolean; pts: Pt[]; nodes: number[]; tags: Record<string, string>;
  bridge: boolean; tunnel: boolean; elev?: number[]; walk: boolean;
}
interface Building { id: number; poly: Poly; h: number; hs: 0 | 1 | 2; k: number; name?: string; cx: number; cz: number; bb: number[] }
interface Area { k: number; poly: Poly }

const roads: Road[] = [];
const buildings: Building[] = [];
const areas: Area[] = [];
const waterPolys: MultiPoly = [];
const mappedTrees: Pt[] = [];
const pierPolys: Poly[] = [];
const stats: Record<string, number> = {
  roads: 0, roadKm: 0, roadWidthTagged: 0, buildings: 0, bHeightTag: 0, bLevelsTag: 0, bEstimated: 0,
  waterPolys: 0, mappedTrees: 0, proceduralTrees: 0, bridges: 0, footwayKm: 0, sidewalkKm: 0, areas: 0,
};

const KIND = (k: (typeof BUILDING_KINDS)[number]) => BUILDING_KINDS.indexOf(k);
function buildingKind(t: Record<string, string>): number {
  const b = t.building;
  if (b === 'roof' || b === 'carport' || t.amenity === 'shelter' && b !== 'yes') return KIND('roof');
  if (['house', 'residential', 'detached', 'terrace', 'semidetached_house', 'bungalow', 'apartments', 'dormitory'].includes(b)) return KIND('house');
  if (['hut', 'shed', 'garage', 'garages', 'kiosk', 'cabin', 'toilets', 'service'].includes(b)) return KIND('hut');
  if (['mosque', 'church', 'temple', 'cathedral', 'chapel', 'shrine', 'religious'].includes(b) || t.amenity === 'place_of_worship') return KIND('religious');
  if (['industrial', 'warehouse', 'manufacture', 'hangar'].includes(b)) return KIND('industrial');
  if (['government', 'public', 'civic', 'school', 'university', 'college', 'hospital', 'museum', 'fort', 'palace'].includes(b) || t.tourism === 'museum' || t.historic) return KIND('civic');
  if (['hotel', 'office'].includes(b) || t.tourism === 'hotel') return KIND('tower');
  if (['commercial', 'retail', 'supermarket', 'mall'].includes(b) || t.shop) return KIND('commercial');
  return KIND('generic');
}
/** Height in metres + provenance. Estimated defaults are documented in docs/DATA_COVERAGE.md. */
function buildingHeight(t: Record<string, string>, kind: number, area: number): { h: number; hs: 0 | 1 | 2 } {
  const h = parseFloat(t.height ?? '');
  if (h > 1 && h < 400) return { h, hs: 0 };
  const lv = parseFloat(t['building:levels'] ?? '');
  if (lv > 0 && lv < 100) return { h: lv * 3.3 + 1.0, hs: 1 };
  const k = BUILDING_KINDS[kind];
  let e = 7;
  if (k === 'roof') e = 4.5;
  else if (k === 'hut') e = 3;
  else if (k === 'house') e = t.building === 'apartments' ? 15 : 6.5;
  else if (k === 'religious') e = 10;
  else if (k === 'industrial') e = 8;
  else if (k === 'civic') e = 9;
  else if (k === 'tower') e = 20;
  else if (k === 'commercial') e = 9;
  else e = area < 40 ? 3.5 : area < 150 ? 6.5 : area < 600 ? 8 : area < 2500 ? 10 : 12;
  return { h: e, hs: 2 };
}
function areaKind(t: Record<string, string>): number {
  const A = (k: (typeof AREA_KINDS)[number]) => AREA_KINDS.indexOf(k);
  if (t.leisure === 'pitch' || t.leisure === 'track') return A('pitch');
  if (['park', 'garden', 'playground', 'common'].includes(t.leisure)) return A('park');
  if (['grass', 'meadow', 'village_green', 'recreation_ground', 'greenfield'].includes(t.landuse) || t.natural === 'grassland' || t.leisure === 'golf_course') return A('grass');
  if (t.natural === 'wood' || t.landuse === 'forest') return A('wood');
  if (t.natural === 'scrub' || t.natural === 'heath' || t.landuse === 'orchard' || t.landuse === 'farmland') return A('scrub');
  if (t.natural === 'sand' || t.natural === 'beach') return A('sand');
  if (t.amenity === 'parking') return A('parking');
  if (t.landuse === 'cemetery' || t.amenity === 'grave_yard') return A('cemetery');
  if (t.landuse === 'residential') return A('residential');
  if (t.landuse === 'commercial' || t.landuse === 'retail') return A('commercial');
  if (t.landuse === 'industrial') return A('industrial');
  if (t.landuse === 'construction' || t.landuse === 'brownfield') return A('construction');
  if (['school', 'university', 'college', 'kindergarten'].includes(t.amenity)) return A('school');
  if ((t.highway === 'pedestrian' || t.highway === 'footway') && (t.area === 'yes')) return A('plaza');
  if (t.place === 'square') return A('plaza');
  return -1;
}
const WATERWAY_LINES: Record<string, number> = { stream: 3, drain: 2.5, ditch: 2, canal: 6 };

for (const el of elements) {
  const t = el.tags;
  if (!t) continue;
  if (el.type === 'node') {
    if (t.natural === 'tree' && el.lat !== undefined) mappedTrees.push(geoToWorld(el.lat, el.lon!));
    continue;
  }
  // Water areas
  const isWaterArea = t.natural === 'water' || t.waterway === 'riverbank' || t.waterway === 'dock' || t.landuse === 'reservoir' || t.landuse === 'basin';
  if (isWaterArea) {
    for (const p of polygonsOf(el)) waterPolys.push(p);
    continue;
  }
  if (el.type === 'way' && el.geometry) {
    if (t.waterway && WATERWAY_LINES[t.waterway] && !isTunnel(t)) {
      const pts = project(el.geometry);
      const w = parseFloat(t.width ?? '') || WATERWAY_LINES[t.waterway];
      roads.push({ id: el.id, type: 'stream', w: Math.min(w, 12), inferred: !t.width, pts, nodes: el.nodes!, tags: t, bridge: false, tunnel: false, walk: false });
      continue;
    }
    if (t.man_made === 'pier') {
      if (isClosedWay(el)) { for (const p of polygonsOf(el)) pierPolys.push(p); }
      else roads.push({ id: el.id, type: 'pier', w: parseFloat(t.width ?? '') || 3, inferred: !t.width, pts: project(el.geometry), nodes: el.nodes!, tags: t, bridge: true, tunnel: false, walk: true });
      continue;
    }
    if (t.railway === 'rail' || t.railway === 'light_rail') continue;
    if (t.highway) {
      const isArea = t.area === 'yes' && isClosedWay(el);
      if (isArea) {
        const k = areaKind(t);
        if (k >= 0) for (const p of polygonsOf(el)) areas.push({ k, poly: p });
        continue;
      }
      const type = roadTypeOf(t);
      if (!type) continue;
      const { w, inferred } = roadWidth(t, type);
      roads.push({ id: el.id, type, w, inferred, pts: project(el.geometry), nodes: el.nodes!, tags: t, bridge: isBridge(t), tunnel: isTunnel(t), walk: isWalkable(t, type) });
      continue;
    }
  }
  if (t.building && t.building !== 'no') {
    for (const poly of polygonsOf(el)) {
      const area = Math.abs(ringArea(poly[0]));
      if (area < 2) continue;
      const k = buildingKind(t);
      const { h, hs } = buildingHeight(t, k, area);
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const [x, z] of poly[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      buildings.push({
        id: el.type === 'relation' ? -el.id : el.id, poly, h, hs, k, name: t.name,
        cx: Math.floor((x0 + x1) / 2 / CHUNK_SIZE), cz: Math.floor((z0 + z1) / 2 / CHUNK_SIZE), bb: [x0, z0, x1, z1],
      });
    }
    continue;
  }
  const k = areaKind(t);
  if (k >= 0) for (const p of polygonsOf(el)) areas.push({ k, poly: p });
}
log(`roads ${roads.length}, buildings ${buildings.length}, areas ${areas.length}, water polys ${waterPolys.length}, mapped trees ${mappedTrees.length}, pier polys ${pierPolys.length}`);

// ---------------------------------------------------------------------------------------------
// 2. Water union (clipped to the data area)
// ---------------------------------------------------------------------------------------------
const closeRing = (r: Pt[]): Pt[] => [...r, r[0]];
const toPC = (p: Poly) => p.map(closeRing);
const fromPC = (mp: Pt[][][]): MultiPoly => mp.map((poly) => poly.map((r) => cleanRing(r as Pt[])).filter((r) => r.length >= 3)).filter((p) => p.length > 0);
const rectPoly = (x0: number, z0: number, x1: number, z1: number): Pt[][] => [[[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]]];
const PAD = 64;
const areaRect = rectPoly(AREA.minX - PAD, AREA.minZ - PAD, AREA.maxX + PAD, AREA.maxZ + PAD);
let water: MultiPoly = [];
{
  const clipped: Pt[][][] = [];
  for (const p of waterPolys) {
    try {
      const c = polygonClipping.intersection(toPC(p) as any, areaRect as any) as unknown as Pt[][][];
      clipped.push(...c);
    } catch (e) { console.warn('water clip failed', (e as Error).message); }
  }
  try {
    water = fromPC(polygonClipping.union(clipped[0] as any, ...(clipped.slice(1) as any)) as unknown as Pt[][][]);
  } catch (e) {
    console.warn('water union failed, using un-merged polygons:', (e as Error).message);
    water = fromPC(clipped);
  }
  stats.waterPolys = water.length;
  log(`water: ${waterPolys.length} source polygons -> ${water.length} merged, ${water.reduce((s, p) => s + p.reduce((q, r) => q + r.length, 0), 0)} vertices`);
}
const waterBB = water.map((p) => {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of p[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  return [x0, z0, x1, z1];
});
function inWater(x: number, z: number): boolean {
  for (let i = 0; i < water.length; i++) {
    const b = waterBB[i];
    if (x < b[0] || x > b[2] || z < b[1] || z > b[3]) continue;
    if (pointInPoly(x, z, water[i])) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------
// 3. Height grid from the Copernicus DEM (smoothed DSM, flattened to bank level near water)
// ---------------------------------------------------------------------------------------------
const HX0 = AREA.minX, HZ0 = AREA.minZ;
const HNX = (AREA.maxX - AREA.minX) / CELL + 1, HNZ = (AREA.maxZ - AREA.minZ) / CELL + 1;
const heights = new Float32Array(HNX * HNZ);
{
  const demDir = 'data-src/dem';
  const tif = existsSync(demDir) ? readdirSync(demDir).find((f) => f.endsWith('.tif')) : undefined;
  const mask = new Uint8Array(HNX * HNZ);
  for (let iz = 0; iz < HNZ; iz++) for (let ix = 0; ix < HNX; ix++) mask[iz * HNX + ix] = inWater(HX0 + ix * CELL, HZ0 + iz * CELL) ? 1 : 0;
  if (!tif) {
    console.warn('No DEM found: terrain will be flat at bank level (run npm run data:fetch).');
    heights.fill(BANK_LEVEL);
  } else {
    const buf = readFileSync(`${demDir}/${tif}`);
    const tiff = await fromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const img = await tiff.getImage();
    const [ox, oy] = img.getOrigin();
    const [rx, ry] = img.getResolution();
    const W = img.getWidth(), H = img.getHeight();
    const c0 = Math.max(0, Math.floor((DATA_BBOX.west - 0.01 - ox) / rx)), c1 = Math.min(W, Math.ceil((DATA_BBOX.east + 0.01 - ox) / rx));
    const r0 = Math.max(0, Math.floor((DATA_BBOX.north + 0.01 - oy) / ry)), r1 = Math.min(H, Math.ceil((DATA_BBOX.south - 0.01 - oy) / ry));
    const ras = (await img.readRasters({ window: [c0, r0, c1, r1] })) as any;
    const dem = ras[0] as Float32Array, dw = c1 - c0, dh = r1 - r0;
    const demAt = (lat: number, lon: number): number => {
      const fx = (lon - ox) / rx - 0.5 - c0, fy = (lat - oy) / ry - 0.5 - r0;
      const x = Math.max(0, Math.min(dw - 2, Math.floor(fx))), y = Math.max(0, Math.min(dh - 2, Math.floor(fy)));
      const tx = Math.max(0, Math.min(1, fx - x)), ty = Math.max(0, Math.min(1, fy - y));
      const a = dem[y * dw + x], b = dem[y * dw + x + 1], c = dem[(y + 1) * dw + x], d = dem[(y + 1) * dw + x + 1];
      return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    };
    const raw = new Float32Array(HNX * HNZ);
    const waterSamples: number[] = [];
    for (let iz = 0; iz < HNZ; iz++) for (let ix = 0; ix < HNX; ix++) {
      const [lat, lon] = worldToGeo(HX0 + ix * CELL, HZ0 + iz * CELL);
      const v = demAt(lat, lon);
      raw[iz * HNX + ix] = v;
      if (mask[iz * HNX + ix]) waterSamples.push(v);
    }
    waterSamples.sort((a, b) => a - b);
    const riverLevel = waterSamples.length ? waterSamples[Math.floor(waterSamples.length / 2)] : 0;
    stats.demRiverLevelCm = Math.round(riverLevel * 100);
    // The DEM is a surface model (roofs, canopy). Approximate bare ground: min filter then blur.
    const R = 2;
    const mn = new Float32Array(HNX * HNZ);
    for (let iz = 0; iz < HNZ; iz++) for (let ix = 0; ix < HNX; ix++) {
      let m = Infinity;
      for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
        const x = Math.max(0, Math.min(HNX - 1, ix + dx)), z = Math.max(0, Math.min(HNZ - 1, iz + dz));
        m = Math.min(m, raw[z * HNX + x]);
      }
      mn[iz * HNX + ix] = m;
    }
    let cur = mn;
    for (let pass = 0; pass < 3; pass++) {
      const nxt = new Float32Array(HNX * HNZ);
      const B = 2;
      for (let iz = 0; iz < HNZ; iz++) for (let ix = 0; ix < HNX; ix++) {
        let s = 0, n = 0;
        for (let dz = -B; dz <= B; dz++) for (let dx = -B; dx <= B; dx++) {
          const x = ix + dx, z = iz + dz;
          if (x < 0 || z < 0 || x >= HNX || z >= HNZ) continue;
          s += cur[z * HNX + x]; n++;
        }
        nxt[iz * HNX + ix] = s / n;
      }
      cur = nxt;
    }
    // Distance to water in cells (two-pass chamfer).
    const dist = new Float32Array(HNX * HNZ).fill(1e9);
    for (let i = 0; i < dist.length; i++) if (mask[i]) dist[i] = 0;
    const relax = (i: number, j: number, d: number) => { if (dist[j] + d < dist[i]) dist[i] = dist[j] + d; };
    for (let iz = 0; iz < HNZ; iz++) for (let ix = 0; ix < HNX; ix++) {
      const i = iz * HNX + ix;
      if (ix > 0) relax(i, i - 1, 1);
      if (iz > 0) { relax(i, i - HNX, 1); if (ix > 0) relax(i, i - HNX - 1, 1.414); if (ix < HNX - 1) relax(i, i - HNX + 1, 1.414); }
    }
    for (let iz = HNZ - 1; iz >= 0; iz--) for (let ix = HNX - 1; ix >= 0; ix--) {
      const i = iz * HNX + ix;
      if (ix < HNX - 1) relax(i, i + 1, 1);
      if (iz < HNZ - 1) { relax(i, i + HNX, 1); if (ix < HNX - 1) relax(i, i + HNX + 1, 1.414); if (ix > 0) relax(i, i + HNX - 1, 1.414); }
    }
    let hmax = 0;
    for (let i = 0; i < heights.length; i++) {
      const rel = Math.max(BANK_LEVEL, cur[i] - riverLevel + BANK_LEVEL * 0.5);
      const t = Math.max(0, Math.min(1, (dist[i] - 2) / 8));
      const s = t * t * (3 - 2 * t);
      heights[i] = BANK_LEVEL + (rel - BANK_LEVEL) * s;
      hmax = Math.max(hmax, heights[i]);
    }
    stats.terrainMaxCm = Math.round(hmax * 100);
    log(`height grid ${HNX} x ${HNZ}, DEM river level ${riverLevel.toFixed(2)} m, max terrain ${hmax.toFixed(1)} m`);
  }
}
function hNode(ix: number, iz: number): number {
  ix = Math.max(0, Math.min(HNX - 1, ix)); iz = Math.max(0, Math.min(HNZ - 1, iz));
  return heights[iz * HNX + ix];
}
/** Must match src/world/HeightMap.ts exactly. */
function groundH(x: number, z: number): number {
  const gx = (x - HX0) / CELL, gz = (z - HZ0) / CELL;
  const ix = Math.floor(gx), iz = Math.floor(gz), fx = gx - ix, fz = gz - iz;
  const h00 = hNode(ix, iz), h11 = hNode(ix + 1, iz + 1);
  if (fx >= fz) { const h10 = hNode(ix + 1, iz); return h00 + (h10 - h00) * fx + (h11 - h10) * fz; }
  const h01 = hNode(ix, iz + 1);
  return h00 + (h11 - h01) * fx + (h01 - h00) * fz;
}
// Quantise the grid to what the runtime will read (Int16 cm) so both sides agree.
const heightI16 = new Int16Array(HNX * HNZ);
for (let i = 0; i < heights.length; i++) { heightI16[i] = Math.round(heights[i] * 100); heights[i] = heightI16[i] / 100; }

// ---------------------------------------------------------------------------------------------
// 4. Bridge deck elevations (inferred: OSM carries no deck heights)
// ---------------------------------------------------------------------------------------------
{
  const nonBridgeNodes = new Set<number>();
  for (const r of roads) if (!r.bridge && r.type !== 'stream') for (const n of r.nodes) nonBridgeNodes.add(n);
  const bridges = roads.filter((r) => r.bridge);
  const parent = new Map<Road, Road>();
  const find = (r: Road): Road => { let p = parent.get(r)!; while (p !== parent.get(p)) p = parent.get(p)!; parent.set(r, p); return p; };
  const byNode = new Map<number, Road>();
  for (const r of bridges) parent.set(r, r);
  for (const r of bridges) for (const n of r.nodes) {
    const o = byNode.get(n);
    if (o) parent.set(find(r), find(o)); else byNode.set(n, r);
  }
  const groups = new Map<Road, Road[]>();
  for (const r of bridges) { const g = find(r); if (!groups.has(g)) groups.set(g, []); groups.get(g)!.push(r); }
  for (const grp of groups.values()) {
    const adj = new Map<number, [number, number][]>();
    const pos = new Map<number, Pt>();
    for (const r of grp) for (let i = 0; i < r.nodes.length; i++) {
      pos.set(r.nodes[i], r.pts[i]);
      if (!adj.has(r.nodes[i])) adj.set(r.nodes[i], []);
      if (i > 0) {
        const d = Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]);
        adj.get(r.nodes[i])!.push([r.nodes[i - 1], d]);
        adj.get(r.nodes[i - 1])!.push([r.nodes[i], d]);
      }
    }
    let anchors = [...adj.keys()].filter((n) => nonBridgeNodes.has(n));
    if (!anchors.length) anchors = [...adj.keys()].filter((n) => adj.get(n)!.length === 1);
    if (!anchors.length) anchors = [adj.keys().next().value!];
    const dist = new Map<number, number>();
    const queue: [number, number][] = anchors.map((n) => [n, 0]);
    for (const n of anchors) dist.set(n, 0);
    while (queue.length) {
      queue.sort((a, b) => a[1] - b[1]);
      const [n, d] = queue.shift()!;
      if (d > (dist.get(n) ?? Infinity)) continue;
      for (const [m, w] of adj.get(n)!) {
        if (d + w < (dist.get(m) ?? Infinity)) { dist.set(m, d + w); queue.push([m, d + w]); }
      }
    }
    let dmax = 0;
    for (const d of dist.values()) dmax = Math.max(dmax, d);
    const span = dmax * 2;
    const layer = Math.max(...grp.map((r) => parseInt(r.tags.layer ?? '1', 10) || 1));
    const isPier = grp.every((r) => r.type === 'pier');
    let H = isPier ? 0.35 : Math.max(0.6, Math.min(10, (span - 20) * 0.06));
    if (!isPier && span > 60 && layer >= 1) H = Math.max(H, 5.5);
    if (!isPier && layer >= 2) H = Math.max(H, Math.min(12, span * 0.045));
    const ramp = Math.max(1, Math.min(110, dmax));
    for (const r of grp) {
      r.elev = r.nodes.map((n, i) => {
        const t = Math.min(1, (dist.get(n) ?? 0) / ramp);
        const s = isPier ? 1 : t * t * (3 - 2 * t);
        return groundH(r.pts[i][0], r.pts[i][1]) + H * s;
      });
    }
    stats.bridges++;
  }
  // Mapped paths that cross water without a bridge tag (jetties, pontoons): keep them traversable.
  for (const r of roads) {
    if (r.bridge || r.type === 'stream' || r.tunnel) continue;
    let wet = 0;
    for (const [x, z] of r.pts) if (inWater(x, z)) wet++;
    if (wet >= 2 && wet >= r.pts.length * 0.5) {
      r.bridge = true;
      r.elev = r.pts.map(([x, z]) => groundH(x, z) + 0.3);
      stats.untaggedWaterCrossings = (stats.untaggedWaterCrossings ?? 0) + 1;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// 5. Per-chunk output
// ---------------------------------------------------------------------------------------------
const q = (v: number) => Math.round(v * QUANT);
function clipSegment(a: Pt, b: Pt, x0: number, z0: number, x1: number, z1: number): [number, number] | null {
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const P = [-dx, dx, -dz, dz], Q = [a[0] - x0, x1 - a[0], a[1] - z0, z1 - a[1]];
  for (let i = 0; i < 4; i++) {
    if (P[i] === 0) { if (Q[i] < 0) return null; continue; }
    const r = Q[i] / P[i];
    if (P[i] < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
    else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return t0 < t1 ? [t0, t1] : null;
}
const chunkOf = (v: number) => Math.floor(v / CHUNK_SIZE);
const inArea = (cx: number, cz: number) => cx >= CX0 && cx <= CX1 && cz >= CZ0 && cz <= CZ1;

interface Bucket {
  roads: RoadData[]; buildings: Building[]; areas: Area[]; trees: Pt[]; decks: number[]; pdecks: { r: Pt[]; h: number }[];
  names: string[]; nameIdx: Map<string, number>; segs: number[][]; pass: number[];
}
const buckets = new Map<string, Bucket>();
const bucket = (cx: number, cz: number): Bucket => {
  const k = chunkKey(cx, cz);
  let b = buckets.get(k);
  if (!b) { b = { roads: [], buildings: [], areas: [], trees: [], decks: [], pdecks: [], names: [], nameIdx: new Map(), segs: [], pass: [] }; buckets.set(k, b); }
  return b;
};
const nameOf = (b: Bucket, name?: string): number | undefined => {
  if (!name) return undefined;
  let i = b.nameIdx.get(name);
  if (i === undefined) { i = b.names.length; b.names.push(name); b.nameIdx.set(name, i); }
  return i;
};

// Roads: split each polyline at chunk borders.
for (const r of roads) {
  if (r.pts.length < 2) continue;
  let len = 0;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < r.pts.length; i++) {
    const [x, z] = r.pts[i];
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    if (i) len += Math.hypot(x - r.pts[i - 1][0], z - r.pts[i - 1][1]);
  }
  const hw = r.w / 2;
  let used = false;
  for (let cz = chunkOf(z0); cz <= chunkOf(z1); cz++) for (let cx = chunkOf(x0); cx <= chunkOf(x1); cx++) {
    if (!inArea(cx, cz)) continue;
    const bx0 = cx * CHUNK_SIZE, bz0 = cz * CHUNK_SIZE, bx1 = bx0 + CHUNK_SIZE, bz1 = bz0 + CHUNK_SIZE;
    const b = bucket(cx, cz);
    let cur: number[] = [], curE: number[] = [];
    const flush = () => {
      if (cur.length >= 4) {
        const rd: RoadData = {
          t: ROAD_TYPES.indexOf(r.type), w: q(r.w), p: cur, id: r.id,
          f: (r.bridge ? 1 : 0) | (r.tunnel ? 2 : 0) | (r.inferred ? 4 : 0) | (r.tags.oneway === 'yes' ? 8 : 0),
        };
        if (r.elev) rd.e = curE;
        const n = nameOf(b, r.tags.name);
        if (n !== undefined) rd.n = n;
        b.roads.push(rd);
        used = true;
      }
      cur = []; curE = [];
    };
    for (let i = 1; i < r.pts.length; i++) {
      const a = r.pts[i - 1], c = r.pts[i];
      const tt = clipSegment(a, c, bx0, bz0, bx1, bz1);
      if (!tt) { flush(); continue; }
      const [ta, tb] = tt;
      const ax = a[0] + (c[0] - a[0]) * ta, az = a[1] + (c[1] - a[1]) * ta;
      const cxp = a[0] + (c[0] - a[0]) * tb, czp = a[1] + (c[1] - a[1]) * tb;
      if (ta > 0 || cur.length === 0) {
        flush();
        cur.push(q(ax - bx0), q(az - bz0));
        if (r.elev) curE.push(q(r.elev[i - 1] + (r.elev[i] - r.elev[i - 1]) * ta));
      }
      cur.push(q(cxp - bx0), q(czp - bz0));
      if (r.elev) curE.push(q(r.elev[i - 1] + (r.elev[i] - r.elev[i - 1]) * tb));
      if (tb < 1) flush();
      // spatial list for tree placement (segment + half width)
      if (r.type !== 'stream') b.segs.push([ax, az, cxp, czp, hw]);
    }
    flush();
  }
  // Collision decks for bridge/pier segments go to every chunk their capsule touches.
  if (r.elev && r.walk) {
    for (let i = 1; i < r.pts.length; i++) {
      const a = r.pts[i - 1], c = r.pts[i];
      const sx0 = Math.min(a[0], c[0]) - hw, sx1 = Math.max(a[0], c[0]) + hw, sz0 = Math.min(a[1], c[1]) - hw, sz1 = Math.max(a[1], c[1]) + hw;
      for (let cz = chunkOf(sz0); cz <= chunkOf(sz1); cz++) for (let cx = chunkOf(sx0); cx <= chunkOf(sx1); cx++) {
        if (!inArea(cx, cz)) continue;
        const ox = cx * CHUNK_SIZE, oz = cz * CHUNK_SIZE;
        bucket(cx, cz).decks.push(q(a[0] - ox), q(a[1] - oz), q(r.elev[i - 1]), q(c[0] - ox), q(c[1] - oz), q(r.elev[i]), q(Math.max(hw, 0.9)));
      }
    }
  }
  // Mapped passages through / under buildings: collision with walls is waived inside their corridor.
  if (r.walk && (r.tags.tunnel === 'building_passage' || r.tags.covered === 'yes' || r.tags.highway === 'corridor')) {
    const pw = Math.max(hw, 1.2);
    for (let i = 1; i < r.pts.length; i++) {
      const a = r.pts[i - 1], c = r.pts[i];
      const sx0 = Math.min(a[0], c[0]) - pw, sx1 = Math.max(a[0], c[0]) + pw, sz0 = Math.min(a[1], c[1]) - pw, sz1 = Math.max(a[1], c[1]) + pw;
      for (let cz = chunkOf(sz0); cz <= chunkOf(sz1); cz++) for (let cx = chunkOf(sx0); cx <= chunkOf(sx1); cx++) {
        if (!inArea(cx, cz)) continue;
        const ox = cx * CHUNK_SIZE, oz = cz * CHUNK_SIZE;
        bucket(cx, cz).pass.push(q(a[0] - ox), q(a[1] - oz), q(c[0] - ox), q(c[1] - oz), q(pw));
      }
    }
    stats.buildingPassages = (stats.buildingPassages ?? 0) + 1;
  }
  if (used) {
    stats.roads++;
    if (r.type !== 'stream') stats.roadKm += len / 1000;
    if (!r.inferred) stats.roadWidthTagged++;
    if (r.type === 'footway' || r.type === 'pedestrian' || r.type === 'path' || r.type === 'steps') stats.footwayKm += len / 1000;
    if (r.tags.footway === 'sidewalk') stats.sidewalkKm += len / 1000;
  }
}
// Buildings (whole, by centre)
for (const b of buildings) {
  if (!inArea(b.cx, b.cz)) continue;
  bucket(b.cx, b.cz).buildings.push(b);
  stats.buildings++;
  if (b.hs === 0) stats.bHeightTag++; else if (b.hs === 1) stats.bLevelsTag++; else stats.bEstimated++;
}
// Pier polygons -> polygon decks in every chunk they overlap
for (const p of pierPolys) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of p[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const h = groundH(p[0][0][0], p[0][0][1]) + 0.35;
  for (let cz = chunkOf(z0); cz <= chunkOf(z1); cz++) for (let cx = chunkOf(x0); cx <= chunkOf(x1); cx++)
    if (inArea(cx, cz)) bucket(cx, cz).pdecks.push({ r: p[0], h });
}
// Mapped trees
for (const t of mappedTrees) {
  const cx = chunkOf(t[0]), cz = chunkOf(t[1]);
  if (inArea(cx, cz)) { bucket(cx, cz).trees.push(t); stats.mappedTrees++; }
}

function ringQ(r: Pt[], ox: number, oz: number): number[] {
  const out: number[] = [];
  for (const [x, z] of r) {
    const X = q(x - ox), Z = q(z - oz);
    if (out.length >= 2 && out[out.length - 2] === X && out[out.length - 1] === Z) continue;
    out.push(X, Z);
  }
  if (out.length >= 4 && out[0] === out[out.length - 2] && out[1] === out[out.length - 1]) out.length -= 2;
  return out;
}
function hash2(x: number, z: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function distSeg(x: number, z: number, s: number[]): number {
  const vx = s[2] - s[0], vz = s[3] - s[1];
  const l2 = vx * vx + vz * vz;
  let t = l2 > 0 ? ((x - s[0]) * vx + (z - s[1]) * vz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(s[0] + vx * t - x, s[1] + vz * t - z);
}

if (existsSync(`${OUT}/chunks`)) rmSync(`${OUT}/chunks`, { recursive: true });
mkdirSync(`${OUT}/chunks`, { recursive: true });
const chunkKeys: string[] = [];
let totalBytes = 0, maxBytes = 0;
const N = CHUNK_SIZE / CELL;
const woodK = AREA_KINDS.indexOf('wood'), parkK = AREA_KINDS.indexOf('park');

// Pre-clip areas per chunk lazily: index areas by bbox.
const areaBB = areas.map((a) => {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of a.poly[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  return [x0, z0, x1, z1];
});
const areaIdx = new Map<string, number[]>();
areas.forEach((a, i) => {
  const b = areaBB[i];
  for (let cz = chunkOf(b[1]); cz <= chunkOf(b[3]); cz++) for (let cx = chunkOf(b[0]); cx <= chunkOf(b[2]); cx++) {
    if (!inArea(cx, cz)) continue;
    const k = chunkKey(cx, cz);
    if (!areaIdx.has(k)) areaIdx.set(k, []);
    areaIdx.get(k)!.push(i);
  }
});
// Larger landuse first so parks/pitches paint over residential zones at runtime.
const AREA_ORDER = ['residential', 'commercial', 'industrial', 'school', 'construction', 'cemetery', 'scrub', 'grass', 'wood', 'park', 'sand', 'parking', 'plaza', 'pitch'];

for (let cz = CZ0; cz <= CZ1; cz++) for (let cx = CX0; cx <= CX1; cx++) {
  const ox = cx * CHUNK_SIZE, oz = cz * CHUNK_SIZE;
  const b = bucket(cx, cz);
  const rect = rectPoly(ox, oz, ox + CHUNK_SIZE, oz + CHUNK_SIZE);

  // Water clipped to this chunk
  let cw: MultiPoly = [];
  const near = water.filter((_, i) => { const w = waterBB[i]; return !(w[2] < ox || w[0] > ox + CHUNK_SIZE || w[3] < oz || w[1] > oz + CHUNK_SIZE); });
  if (near.length) {
    try {
      cw = fromPC(polygonClipping.intersection(near.map(toPC) as any, rect as any) as unknown as Pt[][][]);
    } catch (e) { console.warn(`water clip failed in chunk ${cx},${cz}:`, (e as Error).message); }
  }
  // Shoreline = water ring edges that do not lie on the chunk border.
  const shore: number[][] = [];
  const onBorder = (a: Pt, c: Pt) => {
    const e = 0.02;
    return (Math.abs(a[0] - ox) < e && Math.abs(c[0] - ox) < e) || (Math.abs(a[0] - ox - CHUNK_SIZE) < e && Math.abs(c[0] - ox - CHUNK_SIZE) < e) ||
      (Math.abs(a[1] - oz) < e && Math.abs(c[1] - oz) < e) || (Math.abs(a[1] - oz - CHUNK_SIZE) < e && Math.abs(c[1] - oz - CHUNK_SIZE) < e);
  };
  for (const poly of cw) for (const ring of poly) {
    const n = ring.length;
    let start = 0;
    for (let i = 0; i < n; i++) if (onBorder(ring[i], ring[(i + 1) % n])) { start = (i + 1) % n; break; }
    let cur: number[] = [];
    for (let k = 0; k < n; k++) {
      const a = ring[(start + k) % n], c = ring[(start + k + 1) % n];
      if (onBorder(a, c)) { if (cur.length >= 4) shore.push(cur); cur = []; continue; }
      if (!cur.length) cur.push(q(a[0] - ox), q(a[1] - oz));
      cur.push(q(c[0] - ox), q(c[1] - oz));
    }
    if (cur.length >= 4) shore.push(cur);
  }

  // Terrain with water cut out
  let terrain: ChunkData['terrain'] = null;
  if (cw.length) {
    const P: number[] = [], I: number[] = [];
    const vmap = new Map<number, number>();
    const vert = (x: number, z: number): number => {
      const X = q(x - ox), Z = q(z - oz), key = (X + 1000) * 100000 + (Z + 1000);
      let i = vmap.get(key);
      if (i === undefined) { i = P.length / 2; P.push(X, Z); vmap.set(key, i); }
      return i;
    };
    const tri = (a: number, c: number, d: number) => {
      // enforce upward-facing winding
      const ax = P[a * 2], az = P[a * 2 + 1];
      const cr = (P[c * 2 + 1] - az) * (P[d * 2] - ax) - (P[c * 2] - ax) * (P[d * 2 + 1] - az);
      if (cr === 0) return;
      if (cr > 0) I.push(a, c, d); else I.push(a, d, c);
    };
    const edges: number[][] = [];
    for (const poly of cw) for (const ring of poly) for (let i = 0; i < ring.length; i++) {
      const a = ring[i], c = ring[(i + 1) % ring.length];
      edges.push([Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.max(a[0], c[0]), Math.max(a[1], c[1])]);
    }
    const cwPC = cw.map(toPC);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x0 = ox + i * CELL, z0 = oz + j * CELL, x1 = x0 + CELL, z1 = z0 + CELL;
      let touches = false;
      for (const e of edges) if (!(e[2] < x0 || e[0] > x1 || e[3] < z0 || e[1] > z1)) { touches = true; break; }
      if (!touches) {
        if (cw.some((p) => pointInPoly(x0 + CELL / 2, z0 + CELL / 2, p))) continue;
        const a = vert(x0, z0), bb = vert(x1, z0), c = vert(x1, z1), d = vert(x0, z1);
        tri(a, d, c); tri(a, c, bb);
        continue;
      }
      let land: Pt[][][] = [];
      try { land = polygonClipping.difference(rectPoly(x0, z0, x1, z1) as any, cwPC as any) as unknown as Pt[][][]; }
      catch { land = []; }
      for (const poly of fromPC(land)) {
        const flat: number[] = [], holes: number[] = [];
        poly.forEach((ring, ri) => { if (ri) holes.push(flat.length / 2); for (const p of ring) flat.push(p[0], p[1]); });
        const ids = earcut(flat, holes);
        const vi = [];
        for (let k = 0; k < flat.length; k += 2) vi.push(vert(flat[k], flat[k + 1]));
        for (let k = 0; k < ids.length; k += 3) tri(vi[ids[k]], vi[ids[k + 1]], vi[ids[k + 2]]);
      }
    }
    terrain = { p: P, i: I };
  }

  // Areas clipped to chunk
  const outAreas: AreaData[] = [];
  const localAreas: Area[] = [];
  for (const ai of areaIdx.get(chunkKey(cx, cz)) ?? []) {
    const a = areas[ai];
    try {
      const c = fromPC(polygonClipping.intersection(toPC(a.poly) as any, rect as any) as unknown as Pt[][][]);
      for (const poly of c) {
        const rings = poly.map((r) => ringQ(r, ox, oz)).filter((r) => r.length >= 6);
        if (rings.length) { outAreas.push({ k: a.k, r: rings }); localAreas.push({ k: a.k, poly }); }
      }
    } catch { /* skip degenerate polygon */ }
  }
  outAreas.sort((p, r) => AREA_ORDER.indexOf(AREA_KINDS[p.k]) - AREA_ORDER.indexOf(AREA_KINDS[r.k]));
  stats.areas += outAreas.length;

  // Procedural trees inside mapped wood / park polygons (flagged as inferred in the docs).
  const ptrees: number[] = [];
  const nearB: Building[] = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const nb = buckets.get(chunkKey(cx + dx, cz + dz));
    if (nb) nearB.push(...nb.buildings);
  }
  for (const a of localAreas) {
    if (a.k !== woodK && a.k !== parkK) continue;
    const step = a.k === woodK ? 9 : 17;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of a.poly[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    for (let gz = Math.floor(z0 / step); gz <= Math.floor(z1 / step); gz++) for (let gx = Math.floor(x0 / step); gx <= Math.floor(x1 / step); gx++) {
      if (ptrees.length >= 900) break;
      const x = (gx + 0.15 + 0.7 * hash2(gx * 3 + step, gz * 7)) * step, z = (gz + 0.15 + 0.7 * hash2(gx * 5 + 11, gz * 3 + step)) * step;
      if (x < ox || x >= ox + CHUNK_SIZE || z < oz || z >= oz + CHUNK_SIZE) continue;
      if (!pointInPoly(x, z, a.poly) || inWater(x, z)) continue;
      if (b.segs.some((s) => distSeg(x, z, s) < s[4] + 2)) continue;
      if (nearB.some((bd) => x > bd.bb[0] - 2 && x < bd.bb[2] + 2 && z > bd.bb[1] - 2 && z < bd.bb[3] + 2 && pointInPoly(x, z, bd.poly))) continue;
      ptrees.push(q(x - ox), q(z - oz));
    }
  }
  stats.proceduralTrees += ptrees.length / 2;

  const data: ChunkData = {
    v: 1, cx, cz, terrain,
    water: cw.map((poly) => poly.map((r) => ringQ(r, ox, oz)).filter((r) => r.length >= 6)).filter((p) => p.length),
    shore,
    roads: b.roads,
    buildings: b.buildings.map((bd) => {
      const o: BuildingData = { id: bd.id, r: bd.poly.map((r) => ringQ(r, ox, oz)).filter((r) => r.length >= 6), h: q(bd.h), hs: bd.hs, k: bd.k };
      const n = nameOf(b, bd.name);
      if (n !== undefined) o.n = n;
      return o;
    }).filter((o) => o.r.length),
    areas: outAreas,
    trees: b.trees.flatMap(([x, z]) => [q(x - ox), q(z - oz)]),
    ptrees,
    decks: b.decks,
    pdecks: b.pdecks.map((d) => ({ r: ringQ(d.r, ox, oz), h: q(d.h) })),
    names: b.names,
  };
  if (b.pass.length) data.pass = b.pass;
  const text = JSON.stringify(data);
  writeFileSync(`${OUT}/chunks/${chunkKey(cx, cz)}.json`, text);
  chunkKeys.push(chunkKey(cx, cz));
  totalBytes += text.length;
  maxBytes = Math.max(maxBytes, text.length);
}
log(`chunks written: ${chunkKeys.length}, total ${(totalBytes / 1e6).toFixed(1)} MB, avg ${(totalBytes / chunkKeys.length / 1024).toFixed(0)} KB, max ${(maxBytes / 1024).toFixed(0)} KB`);

// ---------------------------------------------------------------------------------------------
// 6. Height grid, landmarks, overview, manifest
// ---------------------------------------------------------------------------------------------
writeFileSync(`${OUT}/height.bin`, Buffer.from(heightI16.buffer));

// Landmarks: positions come from mapped OSM features matched by name (never from guessed coordinates).
const landmarks: Landmark[] = [];
const missing: string[] = [];
const named = elements.filter((e) => e.tags?.name || e.tags?.['name:en']);
function centreOf(el: OsmEl): Pt | null {
  if (el.type === 'node') return geoToWorld(el.lat!, el.lon!);
  const pts: Pt[] = el.type === 'way' ? project(el.geometry ?? []) : (el.members ?? []).flatMap((m) => project(m.geometry ?? []));
  if (!pts.length) return null;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  return [(x0 + x1) / 2, (z0 + z1) / 2];
}
for (const def of LANDMARK_DEFS) {
  const cands = named.filter((e) => {
    const ns = [e.tags!.name, e.tags!['name:en'], e.tags!.alt_name, e.tags!.official_name].filter(Boolean) as string[];
    if (!def.match.some((m) => ns.some((n) => m.test(n)))) return false;
    return def.road ? !!e.tags!.highway && e.type === 'way' : !e.tags!.highway || e.tags!.highway === 'pedestrian';
  });
  if (!cands.length) { missing.push(def.name); continue; }
  let pos: Pt | null = null, ref = '';
  if (def.road) {
    // Use the mapped vertex closest to the centroid of all vertices of the named street.
    const pts = cands.flatMap((e) => project(e.geometry ?? []));
    const cxm = pts.reduce((s, p) => s + p[0], 0) / pts.length, czm = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    pos = pts.reduce((best, p) => (Math.hypot(p[0] - cxm, p[1] - czm) < Math.hypot(best[0] - cxm, best[1] - czm) ? p : best), pts[0]);
    ref = `way/${cands[0].id}`;
  } else {
    const score = (e: OsmEl) => (e.tags!.building ? 4 : 0) + (e.type !== 'node' ? 2 : 0) + (e.tags!.tourism || e.tags!.historic ? 1 : 0);
    const best = cands.sort((a, c) => score(c) - score(a))[0];
    pos = centreOf(best);
    ref = `${best.type}/${best.id}`;
  }
  if (!pos || pos[0] < AREA.minX || pos[0] > AREA.maxX || pos[1] < AREA.minZ || pos[1] > AREA.maxZ) { missing.push(def.name); continue; }
  const [lat, lon] = worldToGeo(pos[0], pos[1]);
  landmarks.push({ id: def.id, name: def.name, kind: def.kind, lat: +lat.toFixed(7), lon: +lon.toFixed(7), x: +pos[0].toFixed(2), z: +pos[1].toFixed(2), osm: ref, priority: def.priority, approx: true });
}
log(`landmarks matched: ${landmarks.length}/${LANDMARK_DEFS.length}` + (missing.length ? `; not found in OSM extract: ${missing.join(', ')}` : ''));
writeFileSync(`${OUT}/landmarks.json`, JSON.stringify(landmarks, null, 1));

// Overview for the full-map view: simplified major roads + water (decimetre integers, world frame).
function simplify(pts: Pt[], tol: number): Pt[] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, c] = stack.pop()!;
    let md = 0, mi = -1;
    for (let i = a + 1; i < c; i++) {
      const d = distSeg(pts[i][0], pts[i][1], [pts[a][0], pts[a][1], pts[c][0], pts[c][1]]);
      if (d > md) { md = d; mi = i; }
    }
    if (md > tol && mi > 0) { keep[mi] = 1; stack.push([a, mi], [mi, c]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const d10 = (v: number) => Math.round(v * 10);
const overview = {
  bounds: AREA,
  roads: roads
    .filter((r) => r.type !== 'stream' && r.type !== 'service' && r.type !== 'track' && r.pts.some(([x, z]) => x > AREA.minX && x < AREA.maxX && z > AREA.minZ && z < AREA.maxZ))
    .map((r) => ({ t: ROAD_TYPES.indexOf(r.type), n: r.tags.name, p: simplify(r.pts, 1.5).flatMap(([x, z]) => [d10(x), d10(z)]) })),
  water: water.map((poly) => poly.map((ring) => simplify(ring, 2).flatMap(([x, z]) => [d10(x), d10(z)]))),
};
writeFileSync(`${OUT}/overview.json`, JSON.stringify(overview));

// Spawn: nearest mapped pedestrian vertex to the configured waterfront position that is on dry, open ground.
const [sx, sz] = geoToWorld(SPAWN_GEO.lat, SPAWN_GEO.lon);
let spawn: Pt = [sx, sz], bestD = Infinity;
for (const r of roads) {
  if (!r.walk || r.bridge || !['footway', 'pedestrian', 'path'].includes(r.type)) continue;
  for (const p of r.pts) {
    const d = Math.hypot(p[0] - sx, p[1] - sz);
    if (d < bestD && !inWater(p[0], p[1]) && !buildings.some((bd) => p[0] > bd.bb[0] && p[0] < bd.bb[2] && p[1] > bd.bb[1] && p[1] < bd.bb[3] && pointInPoly(p[0], p[1], bd.poly))) { bestD = d; spawn = p; }
  }
}
const [slat, slon] = worldToGeo(spawn[0], spawn[1]);
log(`spawn: ${slat.toFixed(6)}, ${slon.toFixed(6)} (${bestD.toFixed(1)} m from configured point)`);

for (const k of Object.keys(stats)) stats[k] = Math.round(stats[k] * 10) / 10;
const manifest: Manifest = {
  version: 1,
  generatedAt: new Date().toISOString(),
  osmTimestamp: timestamp,
  origin: { lat: ORIGIN_LAT, lon: ORIGIN_LON },
  chunkSize: CHUNK_SIZE, cell: CELL, quant: QUANT,
  bbox: DATA_BBOX,
  height: { file: 'height.bin', x0: HX0, z0: HZ0, nx: HNX, nz: HNZ, cell: CELL },
  chunks: chunkKeys,
  spawn: { x: +spawn[0].toFixed(2), z: +spawn[1].toFixed(2), lat: +slat.toFixed(7), lon: +slon.toFixed(7) },
  attribution: [
    'Map data (c) OpenStreetMap contributors, ODbL 1.0',
    'Elevation: Copernicus DEM GLO-30 (c) DLR e.V. 2010-2014 and (c) Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the European Union and ESA',
  ],
  stats,
};
writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest));
writeFileSync(`${OUT}/build-report.json`, JSON.stringify({ stats, missingLandmarks: missing, chunkBytes: { total: totalBytes, max: maxBytes } }, null, 1));
log('stats', JSON.stringify(stats));
log('done');
