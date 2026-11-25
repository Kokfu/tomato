// N1-M5 hero place 4 (node --test): the entrance of Plaza Merdeka. The tables read the m5 flag when they are asked,
// so the test switches it with setM5.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHUNK_SIZE, QUANT } from '../../src/world/config.ts';
import type { ChunkData } from '../../src/world/types.ts';
import { ROAD_STYLE, ROAD_TYPES } from '../../src/world/types.ts';
import { setM5 } from '../../src/world/district/m5.ts';
import * as plaza from '../../src/world/district/plazaMerdeka.ts';
import { TOWER_FORM } from '../../src/world/landmarks/squareTower.ts';
import { CLOCK_TOWER } from '../../src/world/landmarks/oldCourthouse.ts';

const chunk = (key: string): ChunkData => JSON.parse(readFileSync(new URL(`../../public/data/kuching/chunks/${key}.json`, import.meta.url), 'utf8'));
const world = (d: ChunkData, r: number[]) => r.map((v, i) => (i % 2 ? d.cz : d.cx) * CHUNK_SIZE + v / QUANT);
const inRing = (x: number, z: number, r: number[]) => { let c = false; for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) if (r[i + 1] > z !== r[j + 1] > z && x < ((r[j] - r[i]) * (z - r[i + 1])) / (r[j + 1] - r[i + 1]) + r[i]) c = !c; return c; };

test('flag off: no entrance, no obstacles, no sign', () => {
  setM5(false);
  const d = chunk('-1_-1');
  assert.equal(plaza.plazaEntrance(d), null);
  assert.deepEqual(plaza.plazaObstacles(d), []);
  assert.equal(plaza.plazaSign(d), null);
  setM5(null);
});

test('Plaza Merdeka: the entrance stands on a mapped face of the mall, is where the mapped footway arrives, and carries the mapped name', () => {
  setM5(true);
  const d = chunk('-1_-1'), e = plaza.plazaEntrance(d)!;
  assert.ok(e, 'the mall is in chunk -1_-1');
  assert.ok(e.len > plaza.PORTAL.half * 2 + 1, `face ${e.len} m is wider than the portal`);
  assert.ok(Math.abs(Math.hypot(e.nx, e.nz) - 1) < 1e-9 && Math.abs(e.ex * e.nx + e.ez * e.nz) < 1e-9);
  const mall = world(d, d.buildings.find((b) => b.id === plaza.PLAZA_ID)!.r[0]);
  // outward: a step out of the face leaves the footprint, a step in enters it
  assert.equal(inRing(e.x + e.nx * 1, e.z + e.nz * 1, mall), false);
  assert.equal(inRing(e.x - e.nx * 1, e.z - e.nz * 1, mall), true);
  // the mapped footway from the drop-off lane (way 1415532719) ends at this face: the reason this face was chosen
  const south = chunk('-1_0'), foot = world(south, south.roads.find((r) => r.id === 1415532719)!.p);
  const end = [foot[foot.length - 2], foot[foot.length - 1]], along = (end[0] - e.x) * e.ex + (end[1] - e.z) * e.ez, off = (end[0] - e.x) * e.nx + (end[1] - e.z) * e.nz;
  assert.ok(Math.abs(off) < 0.5 && Math.abs(along) <= e.len / 2 + 0.5, `footway ends ${off} m off the face`);
  // no column, planter or bollard stands on a carriageway (the drop-off lane and the service road beside the mall)
  const lanes = [south, d].flatMap((q) => q.roads.filter((r) => ROAD_STYLE[ROAD_TYPES[r.t]].group >= 2).map((r) => ({ hw: r.w / QUANT / 2, p: world(q, r.p) })));
  const dist = (x: number, z: number, p: number[]) => { let m = Infinity; for (let i = 2; i < p.length; i += 2) { const vx = p[i] - p[i - 2], vz = p[i + 1] - p[i - 1], t = Math.max(0, Math.min(1, ((x - p[i - 2]) * vx + (z - p[i - 1]) * vz) / (vx * vx + vz * vz || 1))); m = Math.min(m, Math.hypot(p[i - 2] + vx * t - x, p[i - 1] + vz * t - z)); } return m; };
  for (const o of plaza.plazaObstacles(d)) for (let i = 0; i < o.ring.length; i += 2) for (const l of lanes) assert.ok(dist(o.ring[i], o.ring[i + 1], l.p) > l.hw + 0.3, 'a prop stands on a carriageway');
  // props: outside the mall, and the canopy columns are among the obstacles
  const obs = plaza.plazaObstacles(d);
  assert.equal(obs.length, plaza.plazaProps().length);
  for (const o of obs) for (let i = 0; i < o.ring.length; i += 2) assert.equal(inRing(o.ring[i], o.ring[i + 1], mall), false);
  assert.equal(plaza.plazaProps().filter((p) => p.kind === 'column').length, 2);
  // the doorway between the two columns stays clear
  assert.ok(plaza.plazaProps().every((p) => p.kind === 'bollard' || Math.abs(p.a) > 2.5));
  const s = plaza.plazaSign(d)!;
  assert.equal(s.text, 'Plaza Merdeka');
  assert.ok(s.maxW < plaza.PORTAL.half * 2 && s.up > plaza.PORTAL.lintel && s.up < plaza.PORTAL.top);
  setM5(null);
});

test('verified forms are pinned: a corner turret and three bays on the Square Tower, six columns under the clock tower', () => {
  assert.equal(TOWER_FORM.baysPerFace, 3);
  assert.ok(TOWER_FORM.turret >= 3 && TOWER_FORM.turretSide <= 3.5 && TOWER_FORM.body >= 6.5);
  assert.equal(CLOCK_TOWER.columns, 6);
  assert.ok(CLOCK_TOWER.porch > 3 && CLOCK_TOWER.upper > 3.5);
});
