// One-time OpenStreetMap extraction for the Kuching data bbox via the Overpass API.
// The bbox is split into tiles and feature groups so each request stays small; results are
// de-duplicated and cached in data-src/osm/kuching.json. The browser never talks to Overpass.
// Usage: node tools/extract-map-data/fetch-osm.ts [--force]
import { mkdirSync, existsSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { DATA_BBOX } from '../../src/world/config.ts';

const OUT_DIR = 'data-src/osm';
const PART_DIR = `${OUT_DIR}/parts`;
const OUT = `${OUT_DIR}/kuching.json`;
const force = process.argv.includes('--force');

if (existsSync(OUT) && !force) {
  console.log(`OSM cache exists (${(statSync(OUT).size / 1e6).toFixed(1)} MB). Use --force to refresh.`);
  process.exit(0);
}

const GROUPS: Record<string, string[]> = {
  roads: ['way["highway"]', 'way["bridge"]', 'way["railway"]', 'node["highway"~"crossing|traffic_signals"]'],
  buildings: ['way["building"]', 'relation["building"]', 'way["building:part"]'],
  nature: [
    'way["natural"]', 'relation["natural"]', 'way["waterway"]', 'relation["waterway"]',
    'way["landuse"]', 'relation["landuse"]', 'way["leisure"]', 'relation["leisure"]', 'node["natural"="tree"]',
  ],
  poi: [
    'way["man_made"]', 'way["amenity"]', 'way["tourism"]', 'way["historic"]', 'relation["tourism"]', 'relation["historic"]',
    'node["tourism"]', 'node["historic"]', 'node["amenity"="place_of_worship"]', 'node["place"]',
  ],
};
const NX = 3, NY = 2;
const endpoints = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function run(query: string): Promise<any> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    const url = endpoints[attempt % endpoints.length];
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'osm-city-extract/0.1 (one-time cached fetch)' },
        body: 'data=' + encodeURIComponent(query),
        signal: AbortSignal.timeout(240000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
      const json = JSON.parse(await res.text());
      if (json.remark && /error|timed out/i.test(json.remark)) throw new Error(json.remark);
      return json;
    } catch (e) {
      lastErr = e as Error;
      console.warn(`    retry (${lastErr.message})`);
      await sleep(4000 + attempt * 4000);
    }
  }
  throw lastErr;
}

mkdirSync(PART_DIR, { recursive: true });
const seen = new Set<string>();
const elements: any[] = [];
let osmBase: string | null = null;
const dLat = (DATA_BBOX.north - DATA_BBOX.south) / NY;
const dLon = (DATA_BBOX.east - DATA_BBOX.west) / NX;
for (const [group, filters] of Object.entries(GROUPS)) {
  for (let iy = 0; iy < NY; iy++) {
    for (let ix = 0; ix < NX; ix++) {
      const part = `${PART_DIR}/${group}_${ix}_${iy}.json`;
      let json: any;
      if (existsSync(part) && !force) {
        json = JSON.parse(readFileSync(part, 'utf8'));
      } else {
        const s = DATA_BBOX.south + iy * dLat, w = DATA_BBOX.west + ix * dLon;
        const bb = `${s.toFixed(6)},${w.toFixed(6)},${(s + dLat).toFixed(6)},${(w + dLon).toFixed(6)}`;
        const q = `[out:json][timeout:180];\n(\n${filters.map((f) => `  ${f}(${bb});`).join('\n')}\n);\nout body geom;`;
        console.log(`Fetching ${group} tile ${ix},${iy} ...`);
        json = await run(q);
        writeFileSync(part, JSON.stringify(json));
        await sleep(1500);
      }
      osmBase = json.osm3s?.timestamp_osm_base ?? osmBase;
      for (const el of json.elements) {
        const k = el.type[0] + el.id;
        if (seen.has(k)) continue;
        seen.add(k);
        elements.push(el);
      }
      console.log(`  ${group} ${ix},${iy}: ${json.elements.length} elements (total unique ${elements.length})`);
    }
  }
}
const text = JSON.stringify({ osm3s: { timestamp_osm_base: osmBase }, elements });
writeFileSync(OUT, text);
writeFileSync(
  `${OUT_DIR}/kuching.meta.json`,
  JSON.stringify(
    {
      source: 'OpenStreetMap via Overpass API',
      endpoints,
      fetchedAt: new Date().toISOString(),
      osmBaseTimestamp: osmBase,
      bbox: DATA_BBOX,
      elements: elements.length,
      license: 'ODbL 1.0 - (c) OpenStreetMap contributors',
    },
    null,
    2,
  ),
);
console.log(`Saved ${elements.length} elements, ${(text.length / 1e6).toFixed(1)} MB. OSM base: ${osmBase}`);
