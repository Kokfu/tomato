// One-time OpenStreetMap extraction of named businesses / points of interest for the shop identity
// system (see docs/SHOP_IDENTITY.md). Cached in data-src/osm/pois.json; the browser never talks to
// Overpass. Element metadata (`out meta`) is kept so every place carries its source update date.
// Usage: node tools/extract-map-data/fetch-pois.ts [--force]
import { mkdirSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { DATA_BBOX } from '../../src/world/config.ts';

const OUT_DIR = 'data-src/osm';
const OUT = `${OUT_DIR}/pois.json`;
if (existsSync(OUT) && !process.argv.includes('--force')) {
  console.log(`POI cache exists (${(statSync(OUT).size / 1e6).toFixed(2)} MB). Use --force to refresh.`);
  process.exit(0);
}
const KEYS = ['shop', 'amenity', 'tourism', 'office', 'craft', 'leisure', 'healthcare'];
const b = DATA_BBOX;
const bbox = `${b.south},${b.west},${b.north},${b.east}`;
const query = `[out:json][timeout:180];(${KEYS.map((k) => `nwr["${k}"]["name"](${bbox});`).join('')}node["highway"="traffic_signals"](${bbox});node["highway"="street_lamp"](${bbox});node["amenity"="bench"](${bbox});node["barrier"="bollard"](${bbox});node["highway"="crossing"](${bbox}););out center meta;`;
const endpoints = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];

let json: any = null;
for (let attempt = 0; attempt < 6 && !json; attempt++) {
  const url = endpoints[attempt % endpoints.length];
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'osm-city-extract/0.1 (one-time cached fetch)' },
      body: 'data=' + encodeURIComponent(query),
      signal: AbortSignal.timeout(240000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    json = JSON.parse(await res.text());
    if (json.remark && /error|timed out/i.test(json.remark)) { const r = json.remark; json = null; throw new Error(r); }
  } catch (e) {
    console.warn(`  retry (${(e as Error).message})`);
    await new Promise((r) => setTimeout(r, 4000 + attempt * 4000));
  }
}
if (!json) throw new Error('Overpass request failed on every endpoint');
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, JSON.stringify(json));
writeFileSync(`${OUT_DIR}/pois.meta.json`, JSON.stringify({
  source: 'OpenStreetMap via Overpass API', fetchedAt: new Date().toISOString(), osmBaseTimestamp: json.osm3s?.timestamp_osm_base ?? null,
  bbox: DATA_BBOX, elements: json.elements.length, license: 'ODbL 1.0 - (c) OpenStreetMap contributors',
}, null, 2));
console.log(`Saved ${json.elements.length} elements to ${OUT}`);
