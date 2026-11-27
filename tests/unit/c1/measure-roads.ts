// Child helper for tests/unit/n2-m2-roads.test.ts (spawned with --experimental-transform-types).
import { readFileSync, readdirSync } from 'node:fs';
import * as THREE from 'three';
import { CHUNK_SIZE } from '../../../src/world/config.ts';
import type { ChunkData, Manifest } from '../../../src/world/types.ts';
import { setRoads } from '../../../src/world/roadsFlag.ts';
import { HeightMap } from '../../../src/world/HeightMap.ts';
import { CollisionWorld } from '../../../src/world/CollisionWorld.ts';
import { LandmarkManager } from '../../../src/world/LandmarkManager.ts';
import { GeoBuf } from '../../../src/world/Materials.ts';
import { buildRoads, buildShore } from '../../../src/world/RoadBuilder.ts';
import { buildBuildings } from '../../../src/world/BuildingBuilder.ts';
import { buildWater } from '../../../src/world/WaterBuilder.ts';
import { buildVegetation } from '../../../src/world/VegetationBuilder.ts';
import { buildFurniture } from '../../../src/world/StreetFurniture.ts';
import { registerLandmarks } from '../../../src/world/landmarks/index.ts';

const DATA = 'public/data/kuching';
const manifest = JSON.parse(readFileSync(`${DATA}/manifest.json`, 'utf8')) as Manifest;
const hb = readFileSync(`${DATA}/${manifest.height.file}`);
const height = new HeightMap(manifest.height, new Int16Array(hb.buffer, hb.byteOffset, hb.byteLength / 2));
const M = new THREE.MeshBasicMaterial();
const mats: any = new Proxy({}, { get: (_t, k) => (k === 'roads' ? [M, M, M, M] : M) });
const runGen = <T>(g: Generator<void, T>): T => { let r = g.next(); while (!r.done) r = g.next(); return r.value; };

function measureChunk(key: string, roadsOn: boolean) {
  setRoads(roadsOn);
  const data = JSON.parse(readFileSync(`${DATA}/chunks/${key}.json`, 'utf8')) as ChunkData;
  const collision = new CollisionWorld(height);
  collision.addChunk(data);
  const landmarks = new LandmarkManager();
  registerLandmarks(landmarks);
  const ctx: any = { height, collision, mats, landmarks, places: null, quality: { name: 'medium', treeDensity: 1 }, detail: 'high' };
  const structure = new GeoBuf();
  const rd = runGen(buildRoads(data, ctx, structure));
  buildShore(data, ctx, structure);
  const objs: THREE.Object3D[] = [];
  for (const g of rd.groups) if (g) objs.push(new THREE.Mesh(g, M));
  if (rd.marks) objs.push(new THREE.Mesh(rd.marks, M));
  const sg = structure.build();
  if (sg) objs.push(new THREE.Mesh(sg, M));
  const w = buildWater(data, ctx);
  if (w) objs.push(w);
  objs.push(...runGen(buildBuildings(data, ctx)));
  objs.push(...runGen(landmarks.buildForChunk(data, ctx)));
  objs.push(...buildVegetation(data, ctx));
  objs.push(...buildFurniture(data, ctx));
  let tris = data.terrain ? data.terrain.i.length / 3 : 2 * (CHUNK_SIZE / 16) ** 2;
  let calls = 1;
  for (const root of objs) root.traverse((o: any) => {
    if (!o.isMesh) return;
    const g = o.geometry, n = (g.index ? g.index.count : g.attributes.position.count) / 3;
    tris += n * (o.isInstancedMesh ? o.count : 1);
    calls++;
  });
  setRoads(null);
  return { tris: Math.round(tris), calls };
}

const keys = process.argv.slice(2);
const sampleKeys = keys.length ? keys : readdirSync(`${DATA}/chunks`).map((f) => f.replace(/\.json$/, ''));
const out: Record<string, { offTris: number; onTris: number; pct: number; offCalls: number; onCalls: number }> = {};
for (const k of sampleKeys) {
  const off = measureChunk(k, false);
  const on = measureChunk(k, true);
  out[k] = {
    offTris: off.tris,
    onTris: on.tris,
    pct: +(((on.tris - off.tris) / Math.max(1, off.tris)) * 100).toFixed(2),
    offCalls: off.calls,
    onCalls: on.calls,
  };
}
process.stdout.write('ROADS_BUDGET ' + JSON.stringify(out) + '\n');
