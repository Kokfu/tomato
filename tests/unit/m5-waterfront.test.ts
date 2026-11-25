// N1-M5 hero place 1 (node --test): the Kuching Waterfront promenade kit. The props read the m5 flag when they are
// asked, so the test switches it with setM5.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHUNK_SIZE, QUANT } from '../../src/world/config.ts';
import { setM5 } from '../../src/world/district/m5.ts';
import * as prom from '../../src/world/district/promenade.ts';
import * as props from '../../src/world/district/props.ts';

const chunk = (key: string) => JSON.parse(readFileSync(new URL(`../../public/data/kuching/chunks/${key}.json`, import.meta.url), 'utf8'));
const C0m1 = chunk('0_-1');

test('promenade walk: paved runs follow the railing, stay on land and off the carriageways', () => {
  const runs = prom.promenadeWalk(C0m1);
  assert.ok(runs.length >= 1);
  const ox = C0m1.cx * CHUNK_SIZE, oz = C0m1.cz * CHUNK_SIZE;
  const water: number[][] = C0m1.water.map((poly: number[][]) => poly[0].map((v: number, i: number) => (i % 2 ? oz : ox) + v / QUANT));
  const inRing = (x: number, z: number, r: number[]) => { let c = false; for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) if (r[i + 1] > z !== r[j + 1] > z && x < ((r[j] - r[i]) * (z - r[i + 1])) / (r[j + 1] - r[i + 1]) + r[i]) c = !c; return c; };
  let len = 0;
  for (const run of runs) for (let i = 0; i < run.length; i++) {
    const n = run[i];
    assert.ok(Math.abs(Math.hypot(n.nx, n.nz) - 1) < 1e-6);
    assert.ok(n.w >= prom.PROM_MIN && n.w <= prom.PROM_WIDTH + 1e-6, `width ${n.w}`);
    for (const d of [1, n.w]) assert.ok(!water.some((r) => inRing(n.x + n.nx * d, n.z + n.nz * d, r)), `walk in water at ${n.x}, ${n.z}`);
    if (i) { const step = Math.hypot(n.x - run[i - 1].x, n.z - run[i - 1].z); assert.ok(step <= 2.21, `step ${step}`); assert.ok(Math.abs(n.w - run[i - 1].w) <= 1 + 1e-6); len += step; }
  }
  assert.ok(len > 200, `paved length in chunk 0_-1: ${len} m`);
});

test('offsetRing grows a ring by its distance whichever way it is wound', () => {
  const sq = [0, 0, 10, 0, 10, 10, 0, 10];
  assert.deepEqual(prom.offsetRing(sq, 2).map((v) => Math.round(v * 1e6) / 1e6), [-2, -2, 12, -2, 12, 12, -2, 12]);
  assert.deepEqual(prom.offsetRing([0, 10, 10, 10, 10, 0, 0, 0], 2).map((v) => Math.round(v * 1e6) / 1e6), [-2, 12, 12, 12, 12, -2, -2, -2]);
  const t = prom.squareTowerRing(C0m1);
  assert.ok(t && t.length === 8, 'the Square Tower outline is in chunk 0_-1');
});

test('waterfront props: festoons, palms, bins and kapcai exist only with the flag, block as they should, and festoons span lamp to lamp', () => {
  const P = props.PROP, count = (list: any[], k: number) => list.filter((p) => p.kind === k).length;
  setM5(false);
  const off = props.chunkProps(C0m1);
  for (const k of [P.festoon, P.palm, P.bin, P.kapcai]) assert.equal(count(off, k), 0);
  setM5(true);
  const on = props.chunkProps(C0m1);
  assert.ok(count(on, P.globeLamp) >= count(off, P.globeLamp), 'the tower forecourt adds lamps, none is removed');
  assert.ok(count(on, P.festoon) >= 10 && count(on, P.palm) >= 6 && count(on, P.bin) >= 3 && count(on, P.kapcai) >= 6, JSON.stringify([P.festoon, P.palm, P.bin, P.kapcai].map((k) => count(on, k))));
  assert.ok(count(on, P.rainTree) < count(off, P.rainTree), 'palms take the place of some rain trees');
  const lamps = on.filter((p: any) => p.kind === P.globeLamp);
  for (const f of on.filter((p: any) => p.kind === P.festoon)) {
    const span = Math.hypot(f.tx, f.tz);
    assert.ok(span > 6 && span < 13, `festoon span ${span}`);
    assert.ok(lamps.some((l: any) => Math.hypot(l.x - f.x, l.z - f.z) < 0.01) && lamps.some((l: any) => Math.hypot(l.x - f.x - f.tx, l.z - f.z - f.tz) < 0.01), 'both ends hang from a lamp');
    assert.equal(props.propSize(f), null, 'a festoon does not block');
  }
  for (const k of [P.palm, P.bin, P.kapcai]) assert.ok(props.propSize(on.find((p: any) => p.kind === k)!));
  setM5(null);
});

test('promenade walk: the landward edge runs forward everywhere, also at the jetty jog near the Square Tower', () => {
  for (const key of ['0_-1', '1_-1', '1_0']) for (const run of prom.promenadeWalk(chunk(key))) for (let i = 1; i < run.length; i++) {
    const a = run[i - 1], b = run[i], tx = b.x - a.x, tz = b.z - a.z;
    for (const f of [0.5, 1]) {
      const adv = (b.x + b.nx * b.w * f - a.x - a.nx * a.w * f) * tx + (b.z + b.nz * b.w * f - a.z - a.nz * a.w * f) * tz;
      assert.ok(adv > 0, `chunk ${key}: the walk doubles back at (${b.x.toFixed(1)}, ${b.z.toFixed(1)}), ${f} of its width`);
    }
  }
});
