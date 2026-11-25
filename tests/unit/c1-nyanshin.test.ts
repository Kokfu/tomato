// C1a experiment (?c1=1), owner-approved Option 1 (C:\Kuching3D-evidence\c1\nyan-shin-provenance.md): the OSM cafe
// osm:node/6168638588 gets its fascia board on UE lot 1 with its own `name`, set on two lines at its own " - ". The text
// must come from the loaded record (no name typed into code), and the V5 note filter must stay as it is for every other
// place ("Banana Fritter - pushcart in front of temple" keeps no board). Runs the real V5Scene.build('c') in Node with
// the real places files and a canvas stub that records what the sign atlas draws. Flag off is covered by
// golden-v5-static and the c1-flag test (measure off). The flag is read once per process, so it is set before the imports.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
(globalThis as any).location = { search: '?c1=1&m5=0' }; // N1-M5 rows are tested in m5-places.test.ts
const drawn: string[] = [];
const ctx2d: any = new Proxy({}, {
  get: (t: any, k) => (k in t ? t[k] : k === 'measureText' ? (s: string) => ({ width: 10 * String(s).length, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }) : k === 'fillText' ? (s: string) => { drawn.push(String(s)); } : () => ctx2d),
  set: (t: any, k, v) => ((t[k] = v), true),
});
(globalThis as any).document ??= { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx2d }) };
const D = new URL('../../public/data/kuching/', import.meta.url);
// Only the places files are served (as the game fetches them); everything else fails, so atlas and GLBs fall back.
(globalThis as any).fetch = async (u: string) => {
  const m = /data\/kuching\/places\/(-?\d+_-?\d+)\.json$/.exec(String(u));
  if (m) { const j = JSON.parse(readFileSync(new URL('places/' + m[1] + '.json', D), 'utf8')); return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => j }; }
  return { ok: false, status: 404, headers: { get: () => '' }, json: async () => { throw new Error('404'); } };
};
const { c1Enabled, c1FullNameSign, C1_FULL_NAME_SIGNS } = await import('../../src/v5/c1flag.ts');
const V5: Record<string, any> = await import('../../src/v5/V5Scene.ts');
const { HeightMap } = await import('../../src/world/HeightMap.ts');

const ID = 'osm:node/6168638588';
const places: any[] = ['0_0', '0_-1'].flatMap((k) => JSON.parse(readFileSync(new URL('places/' + k + '.json', D), 'utf8')).places);
const rec = places.find((p) => p.id === ID);

test('Nyan Shin (Option 1): full OSM name on two lines on UE lot 1, from the record; the note filter is unchanged for every other place', async () => {
  assert.equal(c1Enabled(), true);
  assert.ok(rec, `${ID} missing from the places data`);
  assert.deepEqual([...C1_FULL_NAME_SIGNS], [ID], 'one exception only');
  // the board text is the record's own name with its " - " as the line break (words verbatim, nothing shortened)
  const text = c1FullNameSign(rec)!;
  assert.equal(text, rec.name.split(' - ').join('\n'));
  assert.equal(text.split('\n').join(' - '), rec.name);
  assert.equal(text.split('\n').length, 2);
  // every other place keeps the global rule (no exception), including the pushcart note
  assert.deepEqual(places.filter((p) => c1FullNameSign(p) !== null).map((p) => p.id), [ID]);
  const note = places.find((p) => p.name.startsWith('Banana Fritter - '));
  assert.ok(note && c1FullNameSign(note) === null);

  // the real V5Scene.build('c') draws those two lines on the sign atlas, and never the one-line name or the pushcart note
  const man = JSON.parse(readFileSync(new URL('manifest.json', D), 'utf8')), hb = readFileSync(new URL(man.height.file, D));
  const height = new HeightMap(man.height, new Int16Array(hb.buffer, hb.byteOffset, hb.byteLength / 2));
  const sites = JSON.parse(readFileSync(new URL('landmark-sites.json', D), 'utf8')).sites;
  const scene = new V5.V5Scene({ height: (x: number, z: number) => height.sample(x, z), sites, baseUrl: '/', low: false, renderer: null, setFloors: () => {}, setWalls: () => {} });
  scene.realAssets = false;
  await scene.build('c');
  for (const line of text.split('\n')) assert.ok(drawn.includes(line), `sign atlas did not draw "${line}"`);
  assert.ok(!drawn.includes(rec.name), 'one-line name must not be drawn');
  assert.ok(!drawn.some((s) => s.startsWith('Banana Fritter')), 'the pushcart note must stay without a board');
  assert.ok(drawn.includes('Indah House Kuching'), 'Indah keeps its board');

  // lot placement through the measure helper (same rule, mirrored): UE#1, Indah still on UE#3, flag off unchanged
  const run = (flag: string) => JSON.parse(execFileSync(process.execPath, ['--experimental-transform-types', '--no-warnings', 'tests/unit/c1/measure.ts', flag], { encoding: 'utf8', maxBuffer: 64 << 20 }).split('\n').find((l) => l.startsWith('C1MEASURE '))!.slice(10));
  const ON = run('on'), OFF = run('off');
  assert.ok(ON.v5.signs.includes(`UE#1: ${rec.name}`), ON.v5.signs.join(', '));
  assert.ok(ON.v5.signs.includes('UE#3: Indah House Kuching'));
  assert.ok(!ON.v5.signs.some((s: string) => s.includes('Banana Fritter')) && !OFF.v5.signs.some((s: string) => s.includes('Banana Fritter')));
  assert.ok(!OFF.v5.signs.some((s: string) => s.includes('Nyan Shin')), 'flag off: no board (V8.6)');
});
