// One-time download of the Overture Maps buildings theme for the Kuching data bbox, used to add
// machine-detected footprints (Microsoft ML Buildings, Google Open Buildings) where OpenStreetMap
// has no building. Cached in data-src/overture/. The browser never contacts Overture.
// Usage: node tools/extract-map-data/fetch-overture.ts [--force] [--release=2026-10-21.0]
//
// Prerequisite (optional step): the `overturemaps` Python command-line tool
// (https://github.com/OvertureMaps/overturemaps-py), Python 3.10+. Either
//   python -m venv data-src/venv
//   data-src/venv/Scripts/pip install overturemaps      (Windows)
//   data-src/venv/bin/pip install overturemaps          (Linux / macOS)
// or `pip install overturemaps` so that `overturemaps` is on PATH.
// Without the tool this step prints a message and exits successfully; `npm run data:build` then
// builds the world from OpenStreetMap buildings only.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { DATA_BBOX } from '../../src/world/config.ts';

const OUT_DIR = 'data-src/overture';
const OUT = `${OUT_DIR}/buildings.geojsonl`;
const META = `${OUT_DIR}/buildings.meta.json`;
const force = process.argv.includes('--force');
const release = process.argv.find((a) => a.startsWith('--release='))?.split('=')[1];

function writeMeta(fetchedAt: string | null): void {
  const bySource: Record<string, number> = {};
  let features = 0, withHeight = 0, withFloors = 0;
  for (const line of readFileSync(OUT, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const p = JSON.parse(line).properties ?? {};
    const ds = p.sources?.[0]?.dataset ?? 'unknown';
    bySource[ds] = (bySource[ds] ?? 0) + 1;
    features++;
    if (typeof p.height === 'number') withHeight++;
    if (typeof p.num_floors === 'number') withFloors++;
  }
  // The CLI records the release it used next to the output file.
  let rel: string | null = release ?? null, cliRun: string | null = null;
  const state = `${OUT}.state`;
  if (existsSync(state)) {
    try { const s = JSON.parse(readFileSync(state, 'utf8')); rel = s.last_release ?? rel; cliRun = s.last_run ?? null; } catch { /* keep null */ }
  }
  const meta = {
    source: 'Overture Maps Foundation, buildings theme (type=building), via the overturemaps CLI',
    url: 'https://docs.overturemaps.org',
    release: rel,
    fetchedAt: fetchedAt ?? cliRun ?? statSync(OUT).mtime.toISOString(),
    bbox: DATA_BBOX,
    features,
    bySourceDataset: bySource,
    withHeight,
    withNumFloors: withFloors,
    license: 'Buildings theme: ODbL 1.0. Sources: OpenStreetMap (ODbL), Microsoft Global ML Building Footprints (ODbL per Overture), Google Open Buildings (CC BY 4.0). See docs/GEOGRAPHIC_SOURCES.md',
  };
  writeFileSync(META, JSON.stringify(meta, null, 2));
  console.log(`Overture extract: ${features} features, release ${rel ?? 'unknown'}, by source ${JSON.stringify(bySource)}. Meta: ${META}`);
}

if (existsSync(OUT) && !force) {
  console.log(`Overture cache exists (${(statSync(OUT).size / 1e6).toFixed(1)} MB). Use --force to refresh.`);
  if (!existsSync(META)) writeMeta(null);
  process.exit(0);
}

const candidates = ['data-src/venv/Scripts/overturemaps.exe', 'data-src/venv/bin/overturemaps', 'overturemaps'];
const cli = candidates.find((c) => (c.includes('/') ? existsSync(c) : spawnSync(c, ['--version'], { stdio: 'ignore', shell: process.platform === 'win32' }).status === 0));
if (!cli) {
  console.log(
    'Overture step skipped: the `overturemaps` command-line tool was not found (looked in data-src/venv and on PATH).\n' +
    'Install it with `pip install overturemaps` (see the header of tools/extract-map-data/fetch-overture.ts).\n' +
    'The world still builds without it, using OpenStreetMap building footprints only.',
  );
  process.exit(0);
}
mkdirSync(OUT_DIR, { recursive: true });
const b = DATA_BBOX;
const args = ['download', `--bbox=${b.west},${b.south},${b.east},${b.north}`, '-f', 'geojsonseq', '--type=building', '-o', OUT];
if (release) args.push('-r', release);
console.log(`Running ${cli} ${args.join(' ')} ...`);
const run = spawnSync(cli, args, { stdio: 'inherit', shell: !cli.includes('/') && process.platform === 'win32' });
if (run.status !== 0 || !existsSync(OUT)) {
  console.error(`Overture download failed (exit ${run.status ?? run.error?.message}).`);
  process.exit(1);
}
writeMeta(new Date().toISOString());
