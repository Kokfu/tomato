// N1-M6 part B: walkers on footpaths and five-foot ways (node --test), on the real chunk data and collision.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HeightMap } from '../../src/world/HeightMap.ts';
import { CollisionWorld } from '../../src/world/CollisionWorld.ts';
import { CHUNK_SIZE } from '../../src/world/config.ts';
import type { ChunkData } from '../../src/world/types.ts';
import { nearestDrivable, onRoad } from '../../src/vehicle/RoadQuery.ts';
import { Walkers } from '../../src/life/walkers.ts';
import type { WalkerHost, WalkOptions } from '../../src/life/walkers.ts';
import { rng } from '../../src/life/traffic.ts';
import { getFlags, parseFlags } from '../../src/flags.ts';

const D = 'public/data/kuching/';
const man = JSON.parse(readFileSync(D + 'manifest.json', 'utf8'));
const hb = readFileSync(D + man.height.file);
const height = new HeightMap(man.height, new Int16Array(hb.buffer, hb.byteOffset, hb.byteLength / 2));
const cw = new CollisionWorld(height);
const chunks = new Map<string, ChunkData>();
// Jalan Padungan (shophouse rows with five-foot ways) and the suburb of tour view 11
for (const k of ['3_0', '4_0', '3_1', '4_1', '5_1', '-7_3', '-6_3', '-7_4', '-6_4']) {
  const d = JSON.parse(readFileSync(`${D}chunks/${k}.json`, 'utf8')) as ChunkData;
  chunks.set(k, d); cw.addChunk(d);
}
const dataAt = (cx: number, cz: number) => chunks.get(`${cx}_${cz}`);
const host: WalkerHost = {
  chunk: dataAt,
  ground: (x, z, y) => cw.groundAt(x, z, y).h,
  clear: (x, z, y) => {
    if (!cw.isLoaded(x, z) || cw.inWater(x, z) || cw.insideBuilding(x, z, y)) return false;
    const [rx, rz] = cw.resolve(x, z, 0.32, y);
    return Math.abs(rx - x) + Math.abs(rz - z) < 0.02;
  },
};
const OPT: WalkOptions = { want: 30, rMin: 14, rMax: 90, far: 115 };

for (const [name, fx, fz, arcades] of [['Jalan Padungan', 1075, 239, true], ['a suburb', -1610, 1003, false]] as const) {
  test(`walkers at ${name}: near the player, never inside a wall or the water, off the carriageway`, () => {
    const w = new Walkers(host, rng(5));
    // (a fill takes a few frames: the routes of a chunk are worked out a few at a time)
    for (let i = 0; i < 120; i++) w.update(0.05, fx, fz, OPT, fx, fz, true);
    assert.ok(w.list.length >= 20, `first fill gave ${w.list.length} walkers`);
    let samples = 0, onCarriageway = 0, walked = 0;
    const from = new Map(w.list.map((p) => [p.id, [p.x, p.z]]));
    for (let i = 0; i < 20 * 60; i++) {
      w.update(0.05, fx, fz, OPT, 1e9, 1e9);
      for (const p of w.list) {
        assert.ok(Math.hypot(p.x - fx, p.z - fz) <= OPT.far + 1);
        assert.ok(!cw.insideBuilding(p.x, p.z, p.y + 0.5), `walker ${p.id} is inside a building at ${p.x.toFixed(1)}, ${p.z.toFixed(1)}`);
        assert.ok(!cw.inWater(p.x, p.z), `walker ${p.id} is in the water`);
        assert.ok(Number.isFinite(p.x + p.z + p.y + p.heading) && p.phase >= 0 && p.phase < 1);
        if (i % 20 === 0) { samples++; const hit = nearestDrivable(dataAt, p.x, p.z, 0, 20); if (hit && hit.type !== 'service' && onRoad(hit) && hit.dist < hit.width / 2 - 0.3) onCarriageway++; }
      }
    }
    for (const p of w.list) { const a = from.get(p.id); if (a && !p.stand && Math.hypot(p.x - a[0], p.z - a[1]) > 3) walked++; }
    assert.ok(walked >= 10, `${walked} walkers have moved on`);
    // (a footpath crosses the mouths of side streets: that is where the traffic gives way to walkers)
    assert.ok(onCarriageway / samples < 0.12, `${onCarriageway} of ${samples} samples on a carriageway`);
    const arcade = w.list.filter((p) => p.arcade).length, standing = w.list.filter((p) => p.stand).length;
    if (arcades) assert.ok(arcade >= 4, `${arcade} walkers on five-foot ways`);
    assert.ok(standing >= 1 && standing < w.list.length / 2, `${standing} standing`);
  });
}

test('a walker waits rather than walk into the player, and walks on afterwards', () => {
  const w = new Walkers(host, rng(9));
  for (let i = 0; i < 120; i++) w.update(0.05, -1610, 1003, { ...OPT, want: 12 }, 1e9, 1e9, true);
  const p = w.list.find((q) => !q.stand && q.len - q.s > 8 && q.s > 8)!;
  assert.ok(p);
  for (let i = 0; i < 120; i++) w.update(0.05, -1610, 1003, { ...OPT, want: 12 }, 1e9, 1e9);
  const px = p.x + Math.sin(p.heading) * 0.9, pz = p.z + Math.cos(p.heading) * 0.9, x0 = p.x, z0 = p.z;
  for (let i = 0; i < 60; i++) w.update(0.05, -1610, 1003, { ...OPT, want: 12 }, px, pz);
  assert.ok(p.v < 0.05 && Math.hypot(p.x - x0, p.z - z0) < 0.6, 'stands in front of the player');
  for (let i = 0; i < 60; i++) w.update(0.05, -1610, 1003, { ...OPT, want: 12 }, 1e9, 1e9);
  assert.ok(p.v > 0.8, 'walks on');
});

test('walkers leave with the chunk they stand on', () => {
  let unloaded = false;
  const cx0 = Math.floor(-1610 / CHUNK_SIZE);
  const w = new Walkers({ ...host, chunk: (cx, cz) => (cx === cx0 || !unloaded ? dataAt(cx, cz) : undefined) }, rng(3));
  for (let i = 0; i < 120; i++) w.update(0.05, -1610, 1003, OPT, 1e9, 1e9, true);
  const all = w.list.length, stay = w.list.filter((p) => Math.floor(p.x / CHUNK_SIZE) === cx0).length;
  assert.ok(all > 10 && stay > 3 && stay < all, `${stay} of ${all} walkers stand in the chunk column that stays`);
  // every chunk but one column is unloaded: within eight frames only the walkers of that column are left
  unloaded = true;
  for (let i = 0; i < 9; i++) w.update(0.05, -1610, 1003, { ...OPT, want: 0 }, 1e9, 1e9);
  assert.equal(w.list.length, stay);
  for (const p of w.list) assert.equal(Math.floor(p.x / CHUNK_SIZE), cx0);
});

test('flag `life`: on by default in a browser, ?life=0 turns the traffic and the walkers off, off under node', () => {
  assert.equal(parseFlags('').life, true);
  assert.equal(parseFlags('?life=0').life, false);
  assert.equal(parseFlags('?life=0').m5, true);
  assert.equal(parseFlags('', false).life, false);
  assert.equal(getFlags().life, false);
});
