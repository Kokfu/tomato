import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import * as THREE from 'three';
import { HeightMap } from '../../src/world/HeightMap.ts';
import { CollisionWorld } from '../../src/world/CollisionWorld.ts';
import { LandmarkManager } from '../../src/world/LandmarkManager.ts';
import { setM5 } from '../../src/world/district/m5.ts';
import { registerLandmarks } from '../../src/world/landmarks/index.ts';

const D = new URL('../../public/data/kuching/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', D), 'utf8'));
const hb = readFileSync(new URL(manifest.height.file, D));
const height = new HeightMap(manifest.height, new Int16Array(hb.buffer, hb.byteOffset, hb.byteLength / 2));
const M = new THREE.MeshBasicMaterial();
const mats: any = new Proxy({}, { get: (_t, k) => (k === 'roads' ? new Proxy([], { get: () => M }) : M) });
const run = (g: any) => { let r; while (!(r = g.next()).done); return r.value; };

test('M5 procedural landmarks build real low-detail meshes (< 35 % of high tris) and City Mosque high stays > 3000 tris', () => {
  setM5(true);
  const landmarksJson = JSON.parse(readFileSync(new URL('landmarks.json', D), 'utf8'));
  const check = (chunkKey: string, meshName: string) => {
    const data = JSON.parse(readFileSync(new URL(`chunks/${chunkKey}.json`, D), 'utf8'));
    const collision = new CollisionWorld(height);
    collision.addChunk(data);
    const buildAt = (detail: 'high' | 'low') => {
      const lm = new LandmarkManager();
      lm.setLandmarks(landmarksJson);
      registerLandmarks(lm);
      const ctx: any = { height, collision, mats, landmarks: lm, places: { inChunk: () => [] }, quality: { name: 'medium', treeDensity: 0.8 }, detail };
      const objs = run(lm.buildForChunk(data, ctx));
      let mesh: any = null;
      for (const o of objs) o.traverse((m: any) => { if (m.name === meshName) mesh = m; });
      assert.ok(mesh, `missing ${meshName} at ${detail}`);
      return mesh.userData.triangles as number;
    };
    const hi = buildAt('high'), lo = buildAt('low');
    assert.ok(lo < hi * 0.35, `${meshName}: low ${lo} vs high ${hi}`);
    return { hi, lo };
  };
  const mosque = check('-2_-1', 'city-mosque');
  assert.ok(mosque.hi > 3000, `city-mosque high ${mosque.hi} must stay > 3000`);
  assert.ok(mosque.lo <= 350, `city-mosque low ${mosque.lo} must fit distant chunk budget`);
  check('-1_-2', 'floating-mosque');
  const ch = check('0_-1', 'old-courthouse');
  assert.ok(ch.hi > 2500, `old-courthouse high ${ch.hi} must stay > 2500`);
  check('0_-1', 'square-tower');
  check('4_0', 'cat-column');
  const pf = check('6_2', 'padungan-paifang');
  assert.ok(pf.hi > 900, `padungan-paifang high ${pf.hi} must stay > 900`);
  setM5(null);
});

test('chunks -1_-1 and -2_-1 stay within +12 % of ?m5=0 at low detail', () => {
  const code = `
    import { readFileSync } from 'node:fs';
    import * as THREE from 'three';
    (globalThis).location = { search: process.argv[1] === 'on' ? '?m5=1' : '?m5=0' };
    const { HeightMap } = await import('./src/world/HeightMap.ts');
    const { CollisionWorld } = await import('./src/world/CollisionWorld.ts');
    const { LandmarkManager } = await import('./src/world/LandmarkManager.ts');
    const { GeoBuf } = await import('./src/world/Materials.ts');
    const { buildRoads, buildShore } = await import('./src/world/RoadBuilder.ts');
    const { buildBuildings } = await import('./src/world/BuildingBuilder.ts');
    const { buildWater } = await import('./src/world/WaterBuilder.ts');
    const { registerLandmarks } = await import('./src/world/landmarks/index.ts');
    const { patchHeroData } = await import('./src/world/district/indiaStreet.ts');
    const { ROAD_WIDTHS } = await import('./src/world/district/mainBazaar.ts');
    const { QUANT } = await import('./src/world/config.ts');
    const D = './public/data/kuching/';
    const man = JSON.parse(readFileSync(D + 'manifest.json', 'utf8'));
    const hb = readFileSync(D + man.height.file);
    const height = new HeightMap(man.height, new Int16Array(hb.buffer, hb.byteOffset, hb.byteLength / 2));
    const M = new THREE.MeshBasicMaterial();
    const mats = new Proxy({}, { get: (_t, k) => (k === 'roads' ? new Proxy([], { get: () => M }) : M) });
    const run = (g) => { let r; while (!(r = g.next()).done); return r.value; };
    const trisOf = (objs) => { let t = 0; for (const o of objs) if (o) o.traverse((m) => { if (m.isMesh && m.geometry) t += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; }); return Math.round(t); };
    const res = {};
    for (const key of ['-1_-1', '-2_-1']) {
      const data = JSON.parse(readFileSync(D + 'chunks/' + key + '.json', 'utf8'));
      for (const r of data.roads) if (ROAD_WIDTHS[r.id]) r.w = Math.round(ROAD_WIDTHS[r.id] * QUANT);
      patchHeroData(data);
      const col = new CollisionWorld(height); col.addChunk(data);
      const lm = new LandmarkManager(); lm.setLandmarks(JSON.parse(readFileSync(D + 'landmarks.json', 'utf8'))); registerLandmarks(lm);
      const ctx = { height, collision: col, mats, landmarks: lm, places: { inChunk: () => [] }, quality: { name: 'medium', treeDensity: 0.8 }, detail: 'low' };
      const st = new GeoBuf(); const r = run(buildRoads(data, ctx, st)); buildShore(data, ctx, st);
      const sg = st.build();
      res[key] = (data.terrain ? data.terrain.i.length / 3 : 512)
        + trisOf([buildWater(data, ctx), ...r.groups.filter(Boolean).map((g) => new THREE.Mesh(g, M)), sg ? new THREE.Mesh(sg, M) : null, ...run(buildBuildings(data, ctx)), ...run(lm.buildForChunk(data, ctx))]);
    }
    console.log('LOWTRIS ' + JSON.stringify(res));
  `;
  const get = (f: string) => {
    const out = execFileSync(process.execPath, ['--experimental-transform-types', '--no-warnings', '--input-type=module', '-e', code, f], { encoding: 'utf8' });
    return JSON.parse(out.split('\n').find((l) => l.startsWith('LOWTRIS '))!.slice(8));
  };
  const off = get('off'), on = get('on');
  for (const key of ['-1_-1', '-2_-1']) {
    const pct = ((on[key] - off[key]) / off[key]) * 100;
    assert.ok(pct <= 12, `chunk ${key} low detail grew by ${pct.toFixed(1)}% (${off[key]} -> ${on[key]}), limit +12%`);
  }
});

test('V5Scene street-block split adds at most 6 draw calls and produces sub-corridor bounding boxes', () => {
  const code = `
    import { readFileSync } from 'node:fs';
    (globalThis).location = { search: '?m5=1' };
    const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : k === 'measureText' ? (s) => ({ width: 8 * String(s).length }) : () => ctx2d), set: (t, k, v) => ((t[k] = v), true) });
    (globalThis).document = { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx2d }) };
    (globalThis).fetch = async () => ({ ok: false, status: 404, headers: { get: () => '' } });
    const { V5Scene } = await import('./src/v5/V5Scene.ts');
    const { HeightMap } = await import('./src/world/HeightMap.ts');
    const D = './public/data/kuching/';
    const man = JSON.parse(readFileSync(D + 'manifest.json', 'utf8')), hb = readFileSync(D + man.height.file);
    const height = new HeightMap(man.height, new Int16Array(hb.buffer, hb.byteOffset, hb.byteLength / 2));
    const sites = JSON.parse(readFileSync(D + 'landmark-sites.json', 'utf8')).sites;
    const s = new V5Scene({ height: (x, z) => height.sample(x, z), sites, baseUrl: '/', low: false, renderer: null, setFloors: () => {}, setWalls: () => {} });
    s.realAssets = false;
    await s.build('c');
    const byMat = new Map();
    const plasterSpans = [];
    for (const c of s.group.children) {
      if (!c.isMesh) continue;
      byMat.set(c.material, (byMat.get(c.material) ?? 0) + 1);
      if (c.geometry?.boundingBox) {
        const b = c.geometry.boundingBox;
        plasterSpans.push(Math.hypot(b.max.x - b.min.x, b.max.z - b.min.z));
      }
    }
    let extra = 0;
    for (const n of byMat.values()) if (n > 1) extra += n - 1;
    console.log('V5SPLIT ' + JSON.stringify({ calls: s.stats.drawCalls, extra, minSpan: Math.min(...plasterSpans) }));
  `;
  const out = execFileSync(process.execPath, ['--experimental-transform-types', '--no-warnings', '--input-type=module', '-e', code], { encoding: 'utf8' });
  const v = JSON.parse(out.split('\n').find((l) => l.startsWith('V5SPLIT '))!.slice(8));
  assert.ok(v.extra > 0 && v.extra <= 6, `extra draw calls ${v.extra} must be in 1..6`);
  assert.ok(v.minSpan < 140, `street-block mesh span ${v.minSpan} should be smaller than full corridor`);
});
