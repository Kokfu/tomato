// N2-M2 unit & budget verification: ?roads=0 vs ?roads=1 widths, roundabout islands/splitters/give-ways,
// dual-carriageway medians & twin-arm lamps, bridge/overpass clearances, false footbridge deck removal,
// Bulatan Engleham interior building preservation, and chunk JSON / triangle budgets.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { QUANT } from '../../src/world/config.ts';
import type { ChunkData, Landmark, Manifest } from '../../src/world/types.ts';
import { FURN } from '../../src/world/types.ts';
import {
  roadsEnabled, setRoads, roadWidthCm,
  ROAD_DEEP_TUNNEL, ROAD_ROUNDABOUT, ROAD_SUSPENSION,
} from '../../src/world/roadsFlag.ts';
import { HeightMap } from '../../src/world/HeightMap.ts';
import { pointInRing } from '../../src/world/CollisionWorld.ts';

const DATA = 'public/data/kuching';
const readChunk = (k: string): ChunkData => JSON.parse(readFileSync(`${DATA}/chunks/${k}.json`, 'utf8'));

test('overrides & widths: ?roads=0 keeps Night 1 widths; ?roads=1 applies lanes * 3.3 m, overrides and Satok Bridge', () => {
  const landmarks = JSON.parse(readFileSync(`${DATA}/landmarks.json`, 'utf8')) as Landmark[];
  const satok = landmarks.find((l) => l.id === 'satok-bridge');
  assert.ok(satok, 'Satok Suspension Bridge matched in landmarks.json via data-src/overrides/roads.json');
  assert.equal(satok!.osm, 'way/1104674947');

  // Padungan Roundabout way/69063568 sits in chunk 6_2: Night 1 width = 675 cm (9 * 0.75), ?roads=1 = 990 cm (3 * 3.3).
  const c62 = readChunk('6_2');
  const padRb = c62.roads.find((r) => r.id === 69063568);
  assert.ok(padRb, 'Padungan roundabout way/69063568 in chunk 6_2');
  assert.ok((padRb!.f & ROAD_ROUNDABOUT) !== 0);
  setRoads(false);
  assert.equal(roadsEnabled(), false);
  assert.equal(roadWidthCm(padRb!), 675);
  setRoads(true);
  assert.equal(roadsEnabled(), true);
  assert.equal(roadWidthCm(padRb!), 990);
  setRoads(null);

  // Satok Suspension Bridge way/1104674947 carries ROAD_SUSPENSION.
  const cSatok = readChunk('-9_2');
  const susp = cSatok.roads.find((r) => r.id === 1104674947);
  assert.ok(susp && (susp.f & ROAD_SUSPENSION) !== 0, 'Satok bridge flagged as suspension');
});

test('false footWet bridge decks removed across Jalan Main Bazaar and Jalan Gambier', () => {
  const c0m1 = readChunk('0_-1');
  const mbPieces = c0m1.roads.filter((r) => r.id === 931182435);
  assert.ok(mbPieces.length >= 1, 'way/931182435 preserved in chunk 0_-1');
  for (const r of mbPieces) {
    const inland = r.p.some((v, i) => i % 2 === 1 && v > 10500);
    if (inland) assert.equal(r.f & 1, 0, 'inland Main Bazaar crossing is no longer a bridge deck');
  }

  const cm1m1 = readChunk('-1_-1');
  const gamPieces = cm1m1.roads.filter((r) => r.id === 901466610);
  assert.ok(gamPieces.length >= 1, 'way/901466610 preserved in chunk -1_-1');
  for (const r of gamPieces) {
    const atGambier = r.p.some((v, i) => i % 2 === 1 && v > 3400);
    if (atGambier) assert.equal(r.f & 1, 0, 'inland Jalan Gambier crossing is no longer a bridge deck');
  }
});

test('bridge & overpass clearances >= 5.3 m above crossed carriageways', () => {
  const manifest = JSON.parse(readFileSync(`${DATA}/manifest.json`, 'utf8')) as Manifest;
  const hb = readFileSync(`${DATA}/${manifest.height.file}`);
  const hm = new HeightMap(manifest.height, new Int16Array(hb.buffer, hb.byteOffset, hb.byteLength / 2));

  // City Mosque footbridge way/423061314 in chunk -2_0 (previously 0.6 m above Jalan Market!):
  const cm20 = readChunk('-2_0');
  const mosqueBridge = cm20.roads.find((r) => r.id === 423061314);
  assert.ok(mosqueBridge?.e, 'City Mosque footbridge has elevations');
  const maxClearMosque = Math.max(...mosqueBridge!.e!.map((e, i) => e / QUANT - hm.sample(-2 * 256 + mosqueBridge!.p[i * 2] / QUANT, mosqueBridge!.p[i * 2 + 1] / QUANT)));
  assert.ok(maxClearMosque >= 5.4, `City Mosque footbridge clearance ${maxClearMosque.toFixed(2)} m`);

  // Satok trunk bridge southbound way/113702301 in chunk -9_1 (previously 0.68 m over Jalan Matang!):
  const cm91 = readChunk('-9_1');
  const satokTrunk = cm91.roads.filter((r) => r.id === 113702301 && r.e);
  assert.ok(satokTrunk.length > 0, 'Satok trunk bridge way/113702301 in chunk -9_1');
  let clearAtMatang = 0;
  for (const r of satokTrunk) {
    for (let i = 0; i < r.e!.length; i++) {
      const wx = -9 * 256 + r.p[i * 2] / QUANT, wz = 256 + r.p[i * 2 + 1] / QUANT;
      if (Math.hypot(wx - -2230.5, wz - 340.8) < 40) {
        clearAtMatang = Math.max(clearAtMatang, r.e![i] / QUANT - hm.sample(wx, wz));
      }
    }
  }
  assert.ok(clearAtMatang >= 5.3, `Satok trunk bridge clearance over Jalan Matang: ${clearAtMatang.toFixed(2)} m`);
});

test('roundabouts, splitters, give-way lines, medians, twin-arm lamps and Bulatan Engleham / Kipali rules', () => {
  let rbi = 0, spl = 0, med = 0, gwl = 0, tpr = 0, twinLamps = 0;
  for (const f of readdirSync(`${DATA}/chunks`)) {
    const d = JSON.parse(readFileSync(`${DATA}/chunks/${f}`, 'utf8')) as ChunkData;
    rbi += d.rbi?.length ?? 0;
    spl += d.spl?.length ?? 0;
    med += d.med?.length ?? 0;
    gwl += (d.gwl?.length ?? 0) / 4;
    tpr += (d.tpr?.length ?? 0) / 6;
    const furn = d.furn ?? [];
    for (let i = 0; i < furn.length; i += 5) if (furn[i] === FURN.lamp && furn[i + 4] === 2) twinLamps++;
  }
  assert.ok(rbi >= 35, `roundabout island pieces: ${rbi}`);
  assert.ok(spl >= 20, `splitter island pieces: ${spl}`);
  assert.ok(med >= 150, `dual-carriageway median pieces: ${med}`);
  assert.ok(gwl >= 100, `roundabout give-way lines: ${gwl}`);
  assert.ok(tpr >= 4, `underground tunnel portals: ${tpr}`);
  assert.ok(twinLamps >= 100, `median twin-arm lamps: ${twinLamps}`);

  // Bulatan Engleham (chunk 2_2): Transit Inn (way/236945089) centroid must NOT lie inside an uncarved rbi island.
  const c22 = readChunk('2_2');
  const transitInn = c22.buildings.find((b) => b.id === 236945089);
  assert.ok(transitInn, 'Transit Inn building in chunk 2_2');
  let tx = 0, tz = 0;
  const ring = transitInn!.r[0], nv = ring.length / 2;
  for (let i = 0; i < ring.length; i += 2) { tx += ring[i] / nv; tz += ring[i + 1] / nv; }
  for (const poly of c22.rbi ?? []) {
    const insideOuter = pointInRing(tx, tz, poly[0]);
    const insideHole = poly.slice(1).some((h) => pointInRing(tx, tz, h));
    assert.ok(!insideOuter || insideHole, 'Transit Inn inside Bulatan Engleham is carved out of the grass island');
  }

  // Bulatan Abang Kipali (chunk -11_-5): trunk tunnel ways carry ROAD_DEEP_TUNNEL so island stays unbroken.
  const kipali = readChunk('-11_-5');
  const deep = kipali.roads.filter((r) => (r.f & ROAD_DEEP_TUNNEL) !== 0);
  assert.ok(deep.length >= 2, `Bulatan Abang Kipali deep tunnel pieces: ${deep.length}`);
  assert.ok((kipali.rbi?.length ?? 0) >= 1, 'Bulatan Abang Kipali has central island');
});

test('budgets: chunk JSON stays within +35 % and per-chunk triangles stay within +15 % (?roads=1 vs ?roads=0)', () => {
  const report = JSON.parse(readFileSync(`${DATA}/roads-report.json`, 'utf8')) as {
    chunkBytes: { avgKiB: number; maxKiB: number };
    mainRoadsUsingClassDefaults: unknown[];
  };
  assert.ok(report.chunkBytes.avgKiB <= 27.0, `avg chunk KiB ${report.chunkBytes.avgKiB} > 27.0`);
  assert.ok(report.chunkBytes.maxKiB <= 159.3, `max chunk KiB ${report.chunkBytes.maxKiB} > 159.3`);
  assert.ok(report.mainRoadsUsingClassDefaults.length > 10, 'main roads using class defaults recorded');

  const keys = ['0_0', '0_-1', '-1_-1', '4_1', '6_2', '-1_4', '-9_0', '5_-4', '2_2', '-11_-5'];
  const out = execFileSync(
    process.execPath,
    ['--experimental-transform-types', '--no-warnings', 'tests/unit/c1/measure-roads.ts', ...keys],
    { encoding: 'utf8', maxBuffer: 32 << 20 },
  );
  const line = out.split('\n').find((l) => l.startsWith('ROADS_BUDGET '));
  assert.ok(line, 'measure-roads printed ROADS_BUDGET');
  const perChunk = JSON.parse(line!.slice('ROADS_BUDGET '.length)) as Record<
    string,
    { offTris: number; onTris: number; pct: number; offCalls: number; onCalls: number }
  >;
  for (const [k, m] of Object.entries(perChunk)) {
    assert.ok(m.pct <= 15.0, `chunk ${k} grew +${m.pct}% (${m.offTris} -> ${m.onTris} tris), limit +15%`);
    assert.ok(m.onCalls <= m.offCalls + 1, `chunk ${k} draw calls ${m.offCalls} -> ${m.onCalls}`);
  }
});
