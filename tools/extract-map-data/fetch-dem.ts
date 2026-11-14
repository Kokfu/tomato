// One-time download of the Copernicus GLO-30 DEM tile covering Kuching (public AWS Open Data bucket).
// Cached in data-src/dem/. Usage: node tools/extract-map-data/fetch-dem.ts [--force]
import { mkdirSync, existsSync, writeFileSync, statSync } from 'node:fs';

const TILE = 'Copernicus_DSM_COG_10_N01_00_E110_00_DEM';
const URL = `https://copernicus-dem-30m.s3.amazonaws.com/${TILE}/${TILE}.tif`;
const OUT_DIR = 'data-src/dem';
const OUT = `${OUT_DIR}/${TILE}.tif`;

if (existsSync(OUT) && !process.argv.includes('--force')) {
  console.log(`DEM cache exists (${(statSync(OUT).size / 1e6).toFixed(1)} MB). Use --force to refresh.`);
  process.exit(0);
}
mkdirSync(OUT_DIR, { recursive: true });
console.log(`Downloading ${URL} ...`);
const res = await fetch(URL);
if (!res.ok) {
  console.error(`DEM download failed: HTTP ${res.status}`);
  process.exit(1);
}
const buf = Buffer.from(await res.arrayBuffer());
writeFileSync(OUT, buf);
writeFileSync(
  `${OUT_DIR}/dem.meta.json`,
  JSON.stringify(
    {
      source: 'Copernicus DEM GLO-30 (DSM), ESA / Airbus',
      url: URL,
      tile: TILE,
      fetchedAt: new Date().toISOString(),
      resolution: '1 arc-second (~30 m)',
      crs: 'EPSG:4326 horizontal, EGM2008 vertical',
      license: 'Copernicus DEM licence - free of charge, attribution required',
    },
    null,
    2,
  ),
);
console.log(`Saved ${(buf.length / 1e6).toFixed(1)} MB`);
