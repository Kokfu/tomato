// One-time OpenStreetMap extraction of mapped street equipment that the first POI fetch did not ask for: bus stops
// (N1-M4). Cached in data-src/osm/street.json; the browser never talks to Overpass. tools/generate-world/
// build-streetscape.ts reads the cache when it exists and places no bus stop when it does not.
// Usage: node tools/extract-map-data/fetch-street.ts [--force]
import { mkdirSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { DATA_BBOX } from '../../src/world/config.ts';

const OUT_DIR = 'data-src/osm';
const OUT = `${OUT_DIR}/street.json`;
if (existsSync(OUT) && !process.argv.includes('--force')) {
  console.log(`Street cache exists (${(statSync(OUT).size / 1e3).toFixed(1)} kB). Use --force to refresh.`);
  process.exit(0);
}
const b = DATA_BBOX;
const bbox = `${b.south},${b.west},${b.north},${b.east}`;
const query = `[out:json][timeout:120];(node["highway"="bus_stop"](${bbox});node["public_transport"="platform"]["bus"="yes"](${bbox}););out meta;`;
const endpoints = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];

let json: any = null;
for (let attempt = 0; attempt < 4 && !json; attempt++) {
  const url = endpoints[attempt % endpoints.length];
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'osm-city-extract/0.1 (one-time cached fetch)' },
      body: 'data=' + encodeURIComponent(query),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    json = JSON.parse(await res.text());
    if (json.remark && /error|timed out/i.test(json.remark)) { const r = json.remark; json = null; throw new Error(r); }
  } catch (e) {
    console.warn(`  retry (${(e as Error).message})`);
    await new Promise((r) => setTimeout(r, 3000 + attempt * 3000));
  }
}
if (!json) throw new Error('Overpass request failed on every endpoint');
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, JSON.stringify(json));
writeFileSync(`${OUT_DIR}/street.meta.json`, JSON.stringify({ fetchedAt: new Date().toISOString(), query, timestamp: json.osm3s?.timestamp_osm_base ?? null, elements: json.elements.length }, null, 2));
console.log(`street: ${json.elements.length} elements, OSM data of ${json.osm3s?.timestamp_osm_base}`);
