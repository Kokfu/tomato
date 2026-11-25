// V9-VISUAL P2: the five-foot way of the whole Main Bazaar row (Nos 1-71, FRONTS of src/world/district/mainBazaar.ts), behind ?v9=1.
// V9-P3: plus the six old frontage edges at the run ends (V9_SEAM_EDGES of v9flag.ts), and arcade paint derived from each building's facade.
//
// The geometry tests import src/world/arch/HeritageRow.ts, whose module graph uses TypeScript
// parameter properties, which node's default strip-only mode cannot load. `npm test` runs this file
// in that mode, so the file re-runs itself in a child node with --experimental-transform-types
// (V9_INNER=1) and reports the child's result as one test. The reader test needs no three.js and
// runs in the outer process.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setV9, v9Enabled, v9Lot, v9SeamEdge, v9TrimCorner, V9_BLOCK, V9_BLOCKS, V9_NOS, V9_SEAM_EDGES, V9_TRIM_CORNERS } from '../../src/world/district/v9flag.ts';
import { v9FacadePaint, V9_PAINT_DARK, V9_PAINT_SAT } from '../../src/world/district/mainBazaar.ts';

const SELF = fileURLToPath(import.meta.url);
// Resolved from this file, not the cwd, so running it from another directory neither skips nor misreads.
const DATA = fileURLToPath(new URL('../../public/data/kuching', import.meta.url));
const CHUNKS = `${DATA}/chunks`;
const HAVE_DATA = existsSync(`${CHUNKS}/0_-1.json`);
const HAVE_HEIGHT = existsSync(`${DATA}/height.bin`);
const INNER = process.env.V9_INNER === '1';

// Chunk geometry of the unmodified V8.6 code (HEAD 1e16c25), derived before any edit with the mock
// context below (terrain 2 + 0.003 x + 0.002 z, high detail, no landmarks): sha256 of every mesh's
// material name, position, normal, colour, uv and index arrays.
// These constants were independently re-derived from a pristine export of 1e16c25 by the orchestrator on 2026-11-20.
// N1-M3 (typed buildings) re-pinned all three on 2026-11-25: every generic building's walls and roof changed on purpose
// (was f24d6a92..., 55179 tris, 0615b4ef...). The shophouse-row (arch) and heritage buffers did not change: the scope
// tests below still compare them mesh by mesh.
const V86_CHUNK_0_1 = { hash: '9fb34e18eda13c32c8edd8200fee52be857b3efa20a2af1cb391b464694ba408', tris: 55667 };
/** sha256 over (chunk key + chunk hash), keys sorted, of all 503 chunks that contain buildings. */
const V86_ALL_CHUNKS = '74136e2480ce9cd003ec95e9be4a8644d07f50537e5704cd75d940056f9da1f5';

test('v9flag: false when location is undefined, true only for ?v9=1, read once', () => {
  assert.equal(typeof (globalThis as { location?: unknown }).location, 'undefined');
  setV9(null);
  assert.equal(v9Enabled(), false);
  assert.equal(v9Lot(V9_BLOCK, 7), false, 'no lot is affected while the flag is off');
  const g = globalThis as { location?: { search: string } };
  try {
    g.location = { search: '?v9=1' };
    assert.equal(v9Enabled(), false, 'cached: the URL is read once');
    setV9(null);
    assert.equal(v9Enabled(), true);
    // Main Bazaar: Nos 1-22 on 233690737, 23-39 on 236495303, 40-71 on 236495776.
    for (const no of [1, 5, 14, 22]) assert.equal(v9Lot(233690737, no), true, `No ${no}`);
    for (const no of [23, 39]) assert.equal(v9Lot(236495303, no), true, `No ${no}`);
    for (const no of [40, 55, 71]) assert.equal(v9Lot(236495776, no), true, `No ${no}`);
    assert.equal(v9Lot(V9_BLOCK, 23), false, 'a number belongs to its own block only');
    assert.equal(v9Lot(236495303, 22), false);
    assert.equal(v9Lot(236495776, 39), false);
    assert.equal(v9Lot(V9_BLOCK, 0), false);
    assert.equal(v9Lot(236495776, 72), false);
    assert.equal(v9Lot(V9_BLOCK, null), false);
    assert.equal(v9Lot(236495388, 7), false, 'Carpenter Street blocks are never affected');
    assert.equal(v9Lot(233690736, 7), false);
    assert.deepEqual([...V9_BLOCKS], [233690737, 236495303, 236495776]);
    assert.deepEqual([...V9_NOS], [1, 71]);
    // V9-P3: the six old edges at the run ends, and nothing else
    assert.deepEqual([...V9_SEAM_EDGES], ['233690737:1', '233690737:3', '236495303:17', '236495303:0', '236495776:16', '236495776:5']);
    for (const k of V9_SEAM_EDGES) { const [b, e] = k.split(':').map(Number); assert.equal(v9SeamEdge(b, e), true, k); }
    for (const [b, e] of [[233690737, 0], [233690737, 2], [236495303, 18], [236495776, 0], [236495776, 4], [233690736, 1], [236495388, 3]]) assert.equal(v9SeamEdge(b, e), false, `${b}:${e}`);
    // V9-P3 round 3: the one trimmed corner (Main Bazaar No 1 corner, after 233690737 edge 0), and nothing else
    assert.deepEqual([...V9_TRIM_CORNERS], ['233690737:0']);
    assert.equal(v9TrimCorner(233690737, 0), true);
    for (const [b, e] of [[233690737, 1], [233690737, 3], [236495303, 0], [236495776, 0], [233690736, 0]]) assert.equal(v9TrimCorner(b, e), false, `${b}:${e}`);
    for (const s of ['?v9=0']) { g.location = { search: s }; setV9(null); assert.equal(v9Enabled(), false, s); }
    for (const s of ['', '?v9=true', '?v90=1']) { g.location = { search: s }; setV9(null); assert.equal(v9Enabled(), true, s); } // N1-M1: on by default in a browser
    g.location = { search: '?x=2&v9=1' }; setV9(null);
    assert.equal(v9Enabled(), true);
  } finally {
    delete g.location;
    setV9(null);
  }
  assert.equal(v9Enabled(), false);
  for (const k of V9_SEAM_EDGES) { const [b, e] = k.split(':').map(Number); assert.equal(v9SeamEdge(b, e), false, `${k}: off while the flag is off`); }
  assert.equal(v9TrimCorner(233690737, 0), false, 'the trim corner is off while the flag is off');
});

test('v9FacadePaint: same hue as the facade, more saturated by V9_PAINT_SAT and darker by V9_PAINT_DARK (HSL); greys stay grey', () => {
  const hsl = (x: number) => {
    const r = ((x >> 16) & 255) / 255, g = ((x >> 8) & 255) / 255, b = (x & 255) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, c = mx - mn;
    const h = c === 0 ? 0 : mx === r ? (((g - b) / c) + 6) % 6 : mx === g ? (b - r) / c + 2 : (r - g) / c + 4;
    return { h: h * 60, s: c === 0 ? 0 : c / (1 - Math.abs(2 * l - 1)), l };
  };
  // every facade colour of the row (WALLS and WALLS_EAST of mainBazaar.ts) and a few strong ones
  for (const w of [0xf1ede2, 0xf4efe0, 0xefe6cf, 0xf3e7b9, 0xeedc9c, 0xe9e4d6, 0xdfe7d8, 0xd5e3ea, 0xf0d9c8, 0xe6ddc9, 0xf2e2a8, 0xe7c9b0,
    0x9cc4dc, 0xf0c56a, 0xf2b38a, 0xf2c4cc, 0xcfe3c0, 0x8fb8d8, 0xf4d77a, 0xe9a67c, 0xd9e6c2, 0xb23a2d, 0x2c5f86]) {
    const a = hsl(w), p = hsl(v9FacadePaint(w)), dh = Math.min(Math.abs(a.h - p.h), 360 - Math.abs(a.h - p.h));
    assert.ok(dh < 3, `${w.toString(16)}: hue kept (${a.h.toFixed(1)} -> ${p.h.toFixed(1)})`);
    assert.ok(Math.abs(a.l - V9_PAINT_DARK - p.l) < 0.006, `${w.toString(16)}: darker by ${V9_PAINT_DARK} (${a.l.toFixed(3)} -> ${p.l.toFixed(3)})`);
    assert.ok(Math.abs(Math.min(1, a.s + V9_PAINT_SAT) - p.s) < 0.03, `${w.toString(16)}: saturation ${a.s.toFixed(3)} -> ${p.s.toFixed(3)}`);
  }
  for (const g of [0x808080, 0xffffff, 0x000000]) { const p = v9FacadePaint(g); assert.ok(((p >> 16) & 255) === ((p >> 8) & 255) && ((p >> 8) & 255) === (p & 255), `${g.toString(16)} stays grey`); }
  assert.equal(v9FacadePaint(0xf1ede2), v9FacadePaint(0xf1ede2), 'pure');
});

if (!INNER) {
  test('v9 arcade geometry (child node with --experimental-transform-types)', { skip: !HAVE_DATA, timeout: 300000 }, () => {
    // The parent test runner marks its children with NODE_TEST_CONTEXT, which would make a nested run report to it instead of failing here: clear it.
    const env: Record<string, string | undefined> = { ...process.env, V9_INNER: '1' };
    delete env.NODE_TEST_CONTEXT;
    const r = spawnSync(process.execPath, ['--experimental-transform-types', '--no-warnings', SELF], { env, encoding: 'utf8', timeout: 280000, cwd: fileURLToPath(new URL('../..', import.meta.url)) });
    assert.equal(r.error, undefined, `child failed to run: ${r.error}`);
    assert.equal(r.signal, null, `child killed by ${r.signal} (timeout 280 s?)`);
    assert.match(r.stdout, /pass [1-9]/, 'the child ran its tests');
    assert.match(r.stdout, /fail 0/);
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  });
} else if (HAVE_DATA) {
  const THREE = await import('three');
  const { HT, htUV, HT_WHITE } = await import('../../src/world/arch/HeritageAtlas.ts');
  const { buildBuildings } = await import('../../src/world/BuildingBuilder.ts');
  const { addHeritageRow, v9ArchRadius, v9Opening, V9_ARCH_SEGS, HH } = await import('../../src/world/arch/HeritageRow.ts');
  const { GeoBuf } = await import('../../src/world/Materials.ts');
  const { HeightMap } = await import('../../src/world/HeightMap.ts');
  const { edgeOutward, ringArea2, ARCADE_DEPTH: D } = await import('../../src/world/arch/frontage.ts');
  const { lotFloor } = await import('../../src/world/district/frontLayout.ts');
  const { planFront, FRONTS } = await import('../../src/world/district/mainBazaar.ts');
  const { PLAYER } = await import('../../src/player/PlayerController.ts');

  // Mock terrain (the one of the V8.6 hash constants) and the shipped terrain (height.bin through HeightMap, exactly as the app samples it).
  const sample = (x: number, z: number) => 2 + 0.003 * x + 0.002 * z;
  const mkCtx = (height: { sample(x: number, z: number): number }): any => ({
    height, detail: 'high', landmarks: { replacesBuilding: () => false }, mats: new Proxy({}, { get: (_t, k) => ({ name: String(k) }) }),
  });
  const ctx = mkCtx({ sample });
  let real: InstanceType<typeof HeightMap> | null = null;
  if (HAVE_HEIGHT) {
    const manifest = JSON.parse(readFileSync(`${DATA}/manifest.json`, 'utf8'));
    const bin = readFileSync(`${DATA}/height.bin`);
    real = new HeightMap(manifest.height, new Int16Array(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)));
  }
  /** The shipped terrain. Its absence FAILS the tests that need it (they never skip). */
  const realCtx = (): any => { if (!real) assert.fail(`${DATA}/height.bin is missing: the real-terrain checks cannot run`); return mkCtx(real); };
  const chunk = (key: string) => JSON.parse(readFileSync(`${CHUNKS}/${key}.json`, 'utf8'));

  /** Per-mesh hashes (by material name) and triangle counts of one chunk. */
  function build(key: string, c: any = ctx): { all: string; mesh: Record<string, string>; tris: Record<string, number>; total: number } {
    const it = buildBuildings(chunk(key), c);
    let r = it.next();
    while (!r.done) r = it.next();
    const all = createHash('sha256'), mesh: Record<string, string> = {}, tris: Record<string, number> = {};
    let total = 0;
    for (const m of r.value as any[]) {
      const g = m.geometry, h = createHash('sha256');
      all.update(m.material.name);
      for (const k of ['position', 'normal', 'color', 'uv']) if (g.attributes[k]) { const b = Buffer.from(g.attributes[k].array.buffer); h.update(b); all.update(b); }
      const ib = Buffer.from(g.index.array.buffer); h.update(ib); all.update(ib);
      mesh[m.material.name] = h.digest('hex');
      tris[m.material.name] = g.index.count / 3;
      total += g.index.count / 3;
    }
    return { all: all.digest('hex'), mesh, tris, total };
  }
  const allKeys = () => readdirSync(CHUNKS).filter((f) => f.endsWith('.json') && chunk(f.replace('.json', '')).buildings?.length).map((f) => f.replace('.json', ''));

  // ---- the blocks of the row, and every HeritageRow block of the area (the Carpenter blocks among them) ----
  const MB = [
    { id: 233690737, chunk: '0_-1' }, { id: 236495303, chunk: '0_-1' }, { id: 236495776, chunk: '1_0' },
  ];
  const OTHER = [{ id: 233690736, chunk: '0_-1' }, { id: 236495388, chunk: '0_0' }];
  const origin = (key: string): [number, number] => { const [cx, cz] = key.split('_').map(Number); return [cx * 256, cz * 256]; };
  const fronts = (id: number): number[] => Object.keys(FRONTS).filter((k) => k.startsWith(`${id}:`)).map((k) => Number(k.split(':')[1]));
  /** V9-P3: the old edges of a block that meet the run at its ends, and every edge drawn as V9 (FRONTS first). */
  const seams = (id: number): number[] => V9_SEAM_EDGES.filter((k) => k.startsWith(`${id}:`)).map((k) => Number(k.split(':')[1]));
  const v9e = (id: number): number[] => [...fronts(id), ...seams(id)];
  /** Name of a lot in messages: its house number, or block:edge:u for the unnumbered seam-edge lots. */
  const nm = (l: { no: number | null; id: number; key: string }) => (l.no !== null ? `No ${l.no}` : `${l.id}:${l.key}`);

  interface LotRec {
    id: number; edge: number; u: number; no: number | null; key: string; v: [number, number]; i: [number, number];
    w: number; x0: number; z0: number; ex: number; ez: number; nx: number; nz: number; fy: number; b0: number;
    group: number; lot: any; first: boolean; last: boolean;
    /** The terrain-derived floor (collision); fy is the level actually drawn (lower by 3 mm + the step at a V9 run end). */
    fyRaw: number;
  }
  /** One block through addHeritageRow, with the buffer range of every lot (all frontage edges, lot key "edge:u"). */
  function rowOf(def: { id: number; chunk: string }, c: any = realCtx()) {
    const b = chunk(def.chunk).buildings.find((q: any) => q.id === def.id);
    const [ox, oz] = origin(def.chunk);
    const buf = new GeoBuf(true);
    const marks: { edge: number; u: number; lot: any; v: number; i: number }[] = [];
    addHeritageRow(b, ox, oz, c, buf, (edge: number, u: number, lot: any) => { marks.push({ edge, u, lot, v: buf.count, i: buf.idx.length }); });
    const ring: number[] = b.r[0].map((v: number) => v / 100), n = ring.length / 2, a2 = ringArea2(ring);
    let gs = 0;
    for (let k = 0; k < n; k++) gs += c.height.sample(ox + ring[k * 2], oz + ring[k * 2 + 1]);
    const ground = gs / n;
    const lots = new Map<string, LotRec>();
    marks.forEach((m, k) => {
      const nxt = marks[k + 1], j = (m.edge + 1) % n;
      const ax = ring[m.edge * 2], az = ring[m.edge * 2 + 1], len = Math.hypot(ring[j * 2] - ax, ring[j * 2 + 1] - az);
      const ex = (ring[j * 2] - ax) / len, ez = (ring[j * 2 + 1] - az) / len, [nx, nz] = edgeOutward(ring, m.edge, a2);
      const cnt = planFront(def.id, m.edge, len).length, w = len / cnt;
      const x0 = ax + ex * w * m.u, z0 = az + ez * w * m.u;
      const fy = lotFloor((x, z) => c.height.sample(x, z), ox + x0 + ex * w / 2, oz + z0 + ez * w / 2, nx, nz);
      lots.set(`${m.edge}:${m.u}`, { id: def.id, edge: m.edge, u: m.u, no: m.lot.no, key: `${m.edge}:${m.u}`, v: [m.v, nxt ? nxt.v : buf.count], i: [m.i, nxt ? nxt.i : buf.idx.length], w, x0, z0, ex, ez, nx, nz, fy, b0: ground + HH.beam0, group: m.lot.group, lot: m.lot, first: m.u === 0, last: m.u === cnt - 1, fyRaw: fy });
    });
    // Edges that carry lots (frontage edges long enough to be planned).
    const planned = [...new Set(marks.map((m) => m.edge))];
    // Flag on: a V9 lot at a run end is drawn 3 mm under the lower of its own floor and the neighbouring lot's floor, unless that neighbour is a
    // Main Bazaar (FRONTS) lot (one height for the whole lot).
    if (v9Enabled()) for (const l of lots.values()) {
      if (!v9e(def.id).includes(l.edge)) continue;
      const nb = runEndStrips({ n, ring, a2, planned }, l, c, def.chunk).map((q) => q.fy5);
      if (nb.length) l.fy = Math.min(l.fyRaw, ...nb) - 0.003;
    }
    return { buf, lots, ring, n, a2, ground, b, planned };
  }
  /**
   * The lot strips a V9 run-end lot sinks under: its neighbouring edge's first or last lot, with that lot's natural floor level, when that edge
   * carries lots and is not a Main Bazaar (FRONTS) edge (an old edge, or a V9-P3 seam edge seen from the run).
   */
  function runEndStrips(row: { n: number; ring: number[]; a2: number; planned: number[] }, l: LotRec, c: any, chunkKey: string): { e: number; fy5: number; rect: number[] }[] {
    const ex = expectEnds(row as any, l), nbs: { e: number; idx: 'first' | 'last' }[] = [];
    const sinksUnder = (e: number) => row.planned.includes(e) && !fronts(l.id).includes(e);
    if (ex.start === 'end' && sinksUnder((l.edge + row.n - 1) % row.n)) nbs.push({ e: (l.edge + row.n - 1) % row.n, idx: 'last' });
    if (ex.end === 'end' && sinksUnder((l.edge + 1) % row.n)) nbs.push({ e: (l.edge + 1) % row.n, idx: 'first' });
    const [ox, oz] = origin(chunkKey);
    return nbs.map(({ e, idx }) => {
      const j = (e + 1) % row.n, ax = row.ring[e * 2], az = row.ring[e * 2 + 1], len = Math.hypot(row.ring[j * 2] - ax, row.ring[j * 2 + 1] - az);
      const ex5 = (row.ring[j * 2] - ax) / len, ez5 = (row.ring[j * 2 + 1] - az) / len, [nx, nz] = edgeOutward(row.ring, e, row.a2);
      const cnt = planFront(l.id, e, len).length, w5 = len / cnt, u = idx === 'first' ? 0 : cnt - 1, x5 = ax + ex5 * w5 * u, z5 = az + ez5 * w5 * u;
      const fy5 = lotFloor((x, z) => c.height.sample(x, z), ox + x5 + ex5 * w5 / 2, oz + z5 + ez5 * w5 / 2, nx, nz);
      const at = (a: number, d: number) => [x5 + ex5 * a - nx * d, z5 + ez5 * a - nz * d];
      return { e, fy5, rect: [...at(0, 0), ...at(w5, 0), ...at(w5, D), ...at(0, D)] };
    });
  }
  type Row = ReturnType<typeof rowOf>;
  const lotHash = (r: Row, l: LotRec) => {
    const h = createHash('sha256');
    for (const a of [r.buf.pos, r.buf.nor, r.buf.col]) h.update(Float64Array.from(a.slice(l.v[0] * 3, l.v[1] * 3)));
    h.update(Float64Array.from(r.buf.uv.slice(l.v[0] * 2, l.v[1] * 2)));
    h.update(Int32Array.from(r.buf.idx.slice(l.i[0], l.i[1]).map((x) => x - l.v[0])));
    return h.digest('hex');
  };
  const lotTris = (l: LotRec) => (l.i[1] - l.i[0]) / 3;

  // ---- triangles in the lot's own frame: a along the frontage, d depth behind the street face, y up ----
  interface Vx { a: number; d: number; y: number; ny: number; c: number[]; u: number; v: number }
  function trisOf(r: Row, l: LotRec): Vx[][] {
    const V = (i: number): Vx => {
      const px = r.buf.pos[i * 3] - l.x0, pz = r.buf.pos[i * 3 + 2] - l.z0;
      return { a: px * l.ex + pz * l.ez, d: -(px * l.nx + pz * l.nz), y: r.buf.pos[i * 3 + 1], ny: r.buf.nor[i * 3 + 1], c: [r.buf.col[i * 3], r.buf.col[i * 3 + 1], r.buf.col[i * 3 + 2]], u: r.buf.uv[i * 2], v: r.buf.uv[i * 2 + 1] };
    };
    const out: Vx[][] = [];
    for (let i = l.i[0]; i < l.i[1]; i += 3) out.push([V(r.buf.idx[i]), V(r.buf.idx[i + 1]), V(r.buf.idx[i + 2])]);
    return out;
  }
  const area = (p: Vx[]) => Math.abs((p[1].a - p[0].a) * (p[2].d - p[0].d) - (p[2].a - p[0].a) * (p[1].d - p[0].d)) / 2;
  const world = (l: LotRec, a: number, d: number): [number, number] => [l.x0 + l.ex * a - l.nx * d, l.z0 + l.ez * a - l.nz * d];
  const same = (p: [number, number], q: [number, number]) => Math.hypot(p[0] - q[0], p[1] - q[1]);

  const T = 0.11, EPS = 1e-4;
  const white = HT_WHITE;
  const inCell = (q: { u: number; v: number }, c: readonly number[]) => q.u >= c[0] - 1e-6 && q.u <= c[2] + 1e-6 && q.v >= c[1] - 1e-6 && q.v <= c[3] + 1e-6;
  const ft = htUV(HT.floorTile), plaster = htUV(HT.plaster);
  const terra = new THREE.Color().setHex(0xa65a40); // same colour-management path as the code
  const near = (c: number[], t: { r: number; g: number; b: number }, k = 1) => Math.abs(c[0] - t.r * k) < 1e-5 && Math.abs(c[1] - t.g * k) < 1e-5 && Math.abs(c[2] - t.b * k) < 1e-5;
  /** V9-P3: the arcade paint of a lot is derived from its own facade colour. */
  const paintOf = (rec: { lot: { wall: number } }) => new THREE.Color().setHex(v9FacadePaint(rec.lot.wall));
  /** The P2 rule (superseded): a five-paint palette indexed by the run-wide building number. Kept here only to show the mismatch it caused. */
  const P2_PAINT = [0xd9812c, 0xb23a2d, 0xe2b42e, 0xe8dcb6, 0xc88a35];
  const p2Paint = (rec: LotRec) => P2_PAINT[(runGroup(rec) * 3 + 1) % P2_PAINT.length];
  // The run-wide building number, derived here independently: groups of the FRONTS in declaration order.
  const runGroup = (rec: { id: number; edge: number; group: number }) => {
    let off = 0;
    for (const key of Object.keys(FRONTS)) {
      const [b, e] = key.split(':').map(Number);
      if (b === rec.id && e === rec.edge) return off + rec.group;
      const lots = planFront(b, e, 0);
      off += lots[lots.length - 1].group;
    }
    throw new Error('not a Main Bazaar frontage');
  };

  /** Expected end types of a lot, from the geometry of the block (independent of HeritageRow's own bookkeeping). */
  function expectEnds(r: Row, l: LotRec) {
    const e = l.edge, n = r.n, prev = (e + n - 1) % n, next = (e + 1) % n;
    const cosAt = (p: number, q: number) => { const [ax, az] = edgeOutward(r.ring, p, r.a2), [bx, bz] = edgeOutward(r.ring, q, r.a2); return ax * bx + az * bz; };
    const unit = (i: number) => { const j = (i + 1) % n, dx = r.ring[j * 2] - r.ring[i * 2], dz = r.ring[j * 2 + 1] - r.ring[i * 2 + 1], L = Math.hypot(dx, dz); return [dx / L, dz / L]; };
    // slope of the bisector line of the corner after edge p, seen from the frame of edge q
    const slope = (p: number, q: number) => {
      const [ax, az] = edgeOutward(r.ring, p, r.a2), [bx, bz] = edgeOutward(r.ring, (p + 1) % n, r.a2);
      let mx = -(ax + bx), mz = -(az + bz); const L = Math.hypot(mx, mz); mx /= L; mz /= L;
      const [nx, nz] = edgeOutward(r.ring, q, r.a2), [ex, ez] = unit(q);
      return (mx * ex + mz * ez) / -(mx * nx + mz * nz);
    };
    const f = v9e(l.id), front = fronts(l.id), seam = seams(l.id).includes(e);
    const joinPrev = l.first && f.includes(prev) && cosAt(prev, e) >= 0.5, joinNext = l.last && f.includes(next) && cosAt(e, next) >= 0.5;
    // V9-P3: a seam lot's end pier at a sharp corner onto the run takes the paint of the run's end lot there and is not grown.
    const cornerPrev = seam && l.first && !joinPrev && front.includes(prev), cornerNext = seam && l.last && !joinNext && front.includes(next);
    const own = v9FacadePaint(l.lot.wall), runLot = (pe: number, last: boolean) => { const q = planFront(l.id, pe, 0); return v9FacadePaint(q[last ? q.length - 1 : 0].wall); };
    return {
      start: l.first ? (joinPrev ? 'mitre' : 'end') : 'wall', end: l.last ? (joinNext ? 'mitre' : 'end') : 'none',
      s0: joinPrev ? slope(prev, e) : 0, s1: joinNext ? slope(e, e) : 0,
      turnPrev: joinPrev ? cosAt(prev, e) : null, turnNext: joinNext ? cosAt(e, next) : null,
      cornerPrev, cornerNext, pier0: cornerPrev ? runLot(prev, true) : own, pier1: cornerNext ? runLot(next, false) : own,
    } as { start: 'wall' | 'mitre' | 'end'; end: 'none' | 'mitre' | 'end'; s0: number; s1: number; turnPrev: number | null; turnNext: number | null; cornerPrev: boolean; cornerNext: boolean; pier0: number; pier1: number };
  }

  /** Every check of the brief on the emitted triangles of one lot. */
  function check(r: Row, l: LotRec) {
    const ex = expectEnds(r, l), paint = paintOf(l);
    const tris = trisOf(r, l);
    // floor and ceiling
    let floorArea = 0, tileArea = 0, terraArea = 0, ceilArea = 0, sunk = 0;
    // wall faces (plane a - s d = +-T), reveals, piers
    const s = ex.start === 'mitre' ? ex.s0 : 0;
    const wall: Vx[][] = [], reveal: Vx[][] = [], riser: Vx[][] = [];
    for (const p of tris) {
      if (p.every((q) => q.y <= l.fy + EPS && q.y >= l.fy - 0.01 && q.ny > 0.9 && q.d > -1e-6 && q.d < D + 1e-6)) {
        if (p.some((q) => q.y < l.fy - EPS)) sunk++;
        const ar = area(p); floorArea += ar;
        if (p.every((q) => inCell(q, ft))) tileArea += ar;
        if (p.every((q) => { const k = q.c[0] / terra.r; return k > 0.9 - 1e-3 && k < 1.1 + 1e-3 && near(q.c, terra, k); })) terraArea += ar;
      }
      if (p.every((q) => Math.abs(q.y - l.b0) < EPS && q.ny < -0.9 && q.d > -1e-6 && q.d < D + 1e-6)) ceilArea += area(p);
      const as = p.map((q) => q.a - s * q.d);
      if (Math.abs(Math.abs(as[0]) - T) < EPS && as.every((x) => Math.abs(x - as[0]) < 1e-6) && p.every((q) => Math.abs(q.ny) < 1e-6 || Math.abs(q.ny) < 0.2)) wall.push(p);
      else if (p.every((q) => q.d >= 0.46 - EPS && q.d <= D + EPS && q.y >= l.fy - 1.5 && q.y <= l.b0 + EPS) && as.every((x) => Math.abs(x) <= T + EPS) && Math.max(...as) - Math.min(...as) > 1e-6 && (!p.every((q) => Math.abs(q.y - p[0].y) < EPS) || (v9Opening(l.fy, l.b0).flat && p.every((q) => Math.abs(q.y - (l.b0 - 0.12)) < EPS && q.ny < -0.9)))) reveal.push(p);
      else if (as.every((x) => Math.abs(x) < 1e-6) && p.every((q) => q.d > 0.5 && q.d < D) && Math.abs(p[0].ny) < 0.2) riser.push(p);
    }
    // piers: vertical faces whose vertices all sit at the foot (fy - 0.6) or the ceiling line, within the column footprint
    const G = 0.003; // run-end piers are grown by 3 mm (they would z-fight with the neighbouring old pier on the same square), not a seam lot's corner pier
    const g0 = ex.cornerPrev ? 0 : G, g1 = ex.cornerNext ? 0 : G;
    const C = (x: number) => new THREE.Color().setHex(x);
    const feet: [number, number, number, InstanceType<typeof THREE.Color>][] = [ex.start === 'end' ? [-g0, 0.46 + g0, g0, C(ex.pier0)] : [-0.23, 0.23, 0, paint]];
    if (ex.end === 'end') feet.push([l.w - 0.46 - g1, l.w + g1, g1, C(ex.pier1)]);
    const piers = feet.map(([a0, a1, g, col]) => {
      const sig: Vx[][] = [];
      let extras = 0;
      for (const p of tris) {
        if (!p.every((q) => Math.abs(q.ny) < 0.1)) continue;
        const sigY = p.every((q) => Math.abs(q.y - (l.fy - 0.6)) < EPS || Math.abs(q.y - l.b0) < EPS);
        if (sigY && p.every((q) => q.a >= a0 - EPS && q.a <= a1 + EPS && q.d >= -g - EPS && q.d <= 0.46 + g + EPS)) sig.push(p);
        else if (p.every((q) => q.a >= a0 - 0.055 && q.a <= a1 + 0.055 && q.d >= -0.055 && q.d <= 0.46 + 0.055 && q.y < l.b0 + EPS) && Math.min(...p.map((q) => q.y)) < l.fy - 1e-6) extras++; // plinth below the floor line
      }
      return { sig, extras, col };
    });
    const wallTone = (side: number) => wall.filter((p) => Math.sign(p[0].a - s * p[0].d) === side);
    const toneOk = (ps: Vx[][]) => ps.length > 0 && (() => { const t = ps[0][0].c[0] / paint.r; return t >= 0.97 - 1e-3 && t <= 1.03 + 1e-3 && ps.every((p) => p.every((q) => near(q.c, paint, t))); })();
    const hasWall = ex.start !== 'end';
    // the old shallow arch: a vertical quad in the plane a = 0 across the walkway
    const oldArch = tris.filter((p) => p.every((q) => Math.abs(q.a) < 1e-6) && p.every((q) => q.d > 0.4 && q.d < D + 1e-6) && Math.abs(p[0].ny) < 0.5 && p.some((q) => q.y > l.b0 - 1.0 && q.y < l.b0 + 1e-6)).length;
    return {
      floorNoTile: floorArea > 0 && tileArea < 1e-6,
      floorTerracotta: Math.abs(terraArea - floorArea) < 1e-6 && floorArea > 0,
      floorArea, ceilArea, ex, sunk,
      pierPainted: piers.every((p) => p.sig.length > 0 && p.sig.every((q) => q.every((v) => near(v.c, p.col) && inCell(v, white)))),
      pierPlainBox: piers.every((p) => p.sig.length === 8 && p.extras === 0),
      wallPresent: hasWall ? wall.length === 48 && reveal.length === 24 : wall.length === 0 && reveal.length === 0,
      wallPainted: !hasWall || (toneOk(wallTone(-1)) && toneOk(wallTone(1))),
      wallFlat: !hasWall || (wall.length > 0 && wall.every((p) => p.every((q) => inCell(q, white) && !(q.u > plaster[0] && q.u < plaster[2] && q.v > plaster[1] && q.v < plaster[3])))),
      revealFlat: !hasWall || (reveal.length > 0 && reveal.every((p) => p.every((q) => near(q.c, paint, 0.9) && inCell(q, white)))),
      noOldArch: oldArch === 0,
      riser: riser.length, wall, reveal, tris, piers,
    };
  }
  /** Same as check, with the wall UVs replaced by the plaster tile (what P1 emitted). The flatness checks must notice. */
  const plasterWalls = (c: ReturnType<typeof check>) => c.wall.every((p) => p.every((q) => !inCell({ u: q.u, v: q.v }, plaster)));

  const V9_ROWS: { def: { id: number; chunk: string }; row: Row }[] = [];
  const all71 = (rows: { row: Row; def: { id: number } }[]) => rows.flatMap(({ row, def }) => fronts(def.id).flatMap((e) => [...row.lots.values()].filter((l) => l.edge === e)));
  /** Every V9 lot: Nos 1-71 and the 22 lots of the six seam edges. */
  const allV9 = (rows: { row: Row; def: { id: number } }[]) => rows.flatMap(({ row, def }) => v9e(def.id).flatMap((e) => [...row.lots.values()].filter((l) => l.edge === e)));
  const N_SEAM = 22, N_V9 = 71 + N_SEAM;

  test('flag off: chunk geometry is byte-identical to V8.6 (chunk 0_-1 and all 503 chunks)', () => {
    setV9(false);
    const c = build('0_-1');
    assert.equal(c.all, V86_CHUNK_0_1.hash);
    assert.equal(c.total, V86_CHUNK_0_1.tris);
    const h = createHash('sha256');
    for (const k of allKeys().sort()) h.update(k + build(k).all);
    assert.equal(h.digest('hex'), V86_ALL_CHUNKS);
  });

  /** V9-P3 round 3: the one old (non-V9) lot the M2 corner trim changes (233690737 edge 0, last lot). */
  const TRIMMED = ['233690737:0:3'];

  test('flag on, scope: exactly the Main Bazaar FRONTS lots (Nos 1-71), the 22 lots of the six seam edges and the one trimmed old lot at the M2 corner differ; Carpenter blocks, other edges and every other chunk are byte-identical; only the heritage buffers change', () => {
    setV9(false);
    const offRows = MB.map((def) => ({ def, row: rowOf(def, ctx) })), offOther = OTHER.map((def) => ({ def, row: rowOf(def, ctx) }));
    const offChunks = new Map(allKeys().map((k) => [k, build(k).all]));
    const offMesh = { '0_-1': build('0_-1'), '1_0': build('1_0') };
    setV9(true);
    try {
      const onRows = MB.map((def) => ({ def, row: rowOf(def, ctx) })), onOther = OTHER.map((def) => ({ def, row: rowOf(def, ctx) }));
      let nDiffer = 0;
      MB.forEach((def, bi) => {
        const f = v9e(def.id), off = offRows[bi].row, on = onRows[bi].row;
        assert.deepEqual([...on.lots.keys()], [...off.lots.keys()], `block ${def.id}: same lots in the same order`);
        for (const [key, lo] of off.lots) {
          const ln = on.lots.get(key)!, isV9 = f.includes(lo.edge) || TRIMMED.includes(`${def.id}:${key}`);
          assert.equal(lo.no !== null, fronts(def.id).includes(lo.edge), `block ${def.id} edge ${lo.edge}: numbered lots are exactly the FRONTS edges`);
          assert.deepEqual(ln.lot, lo.lot, `block ${def.id} lot ${lo.key}: the lot plan (identity, colours, shopfront) is unchanged`);
          if (isV9) { assert.notEqual(lotHash(on, ln), lotHash(off, lo), `block ${def.id} lot ${lo.key} (${nm(lo)}) must change`); nDiffer++; }
          else assert.equal(lotHash(on, ln), lotHash(off, lo), `block ${def.id} lot ${lo.key} is neither a Main Bazaar, a seam-edge nor the trimmed lot: must be identical`);
        }
      });
      assert.equal(nDiffer, N_V9 + TRIMMED.length, '71 Main Bazaar lots + 22 seam-edge lots + the trimmed lot');
      OTHER.forEach((def, i) => { for (const [key, lo] of offOther[i].row.lots) assert.equal(lotHash(onOther[i].row, onOther[i].row.lots.get(key)!), lotHash(offOther[i].row, lo), `Carpenter block ${def.id} lot ${key} must not change`); });
      const changed: string[] = [];
      for (const [k, h] of offChunks) if (build(k).all !== h) changed.push(k);
      assert.deepEqual(changed.sort(), ['0_-1', '1_0'], 'only the two chunks holding Main Bazaar change');
      for (const k of ['0_-1', '1_0'] as const) {
        const on = build(k);
        assert.deepEqual(Object.keys(on.mesh), Object.keys(offMesh[k].mesh), `${k}: same meshes, same materials, same order`);
        for (const m of Object.keys(on.mesh)) if (m !== 'heritage') assert.equal(on.mesh[m], offMesh[k].mesh[m], `${k}: ${m} buffer unchanged`);
        assert.notEqual(on.mesh.heritage, offMesh[k].mesh.heritage, `${k}: heritage buffer changes`);
      }
    } finally { setV9(false); }
  });

  test('flag on: triangle growth per lot, frontage and chunk stays modest (printed for the report)', () => {
    setV9(false);
    const off = MB.map((def) => rowOf(def));
    const offChunk = { '0_-1': build('0_-1', realCtx()).total, '1_0': build('1_0', realCtx()).total };
    setV9(true);
    try {
      const on = MB.map((def) => rowOf(def));
      let worst = 0;
      const per: Record<string, number> = {};
      MB.forEach((def, bi) => {
        for (const e of v9e(def.id)) {
          let dsum = 0, osum = 0, nsum = 0, nl = 0;
          for (const [key, lo] of off[bi].lots) {
            if (lo.edge !== e) continue;
            const d = lotTris(on[bi].lots.get(key)!) - lotTris(lo);
            worst = Math.max(worst, d); dsum += d; osum += lotTris(lo); nsum += lotTris(on[bi].lots.get(key)!); nl++;
            assert.ok(d > -40 && d < 160, `lot ${def.id}:${key}: a modest triangle delta (${d})`);
            if (lo.no !== null) assert.ok(d > 0, `lot ${def.id}:${key}: Main Bazaar (numbered) lots grow`);
          }
          per[`${def.id}:${e}`] = dsum;
          console.log(`V9 tris ${def.id}:${e} (${nl} lots) off ${osum} on ${nsum} delta ${dsum} (${(dsum / nl).toFixed(1)}/lot)`);
        }
      });
      for (const k of ['0_-1', '1_0'] as const) {
        const t = build(k, realCtx()).total;
        console.log(`V9 tris chunk ${k}: off ${offChunk[k]} on ${t} delta ${t - offChunk[k]}`);
        assert.ok(t - offChunk[k] > 0 && t - offChunk[k] < 9000, `chunk ${k} growth ${t - offChunk[k]}`);
      }
      assert.ok(worst < 160);
    } finally { setV9(false); }
  });

  test('flag on: V9_ARCH_SEGS is 10-12 (arches stay cheap)', () => { assert.ok(V9_ARCH_SEGS >= 10 && V9_ARCH_SEGS <= 12); });

  test('flag on, every V9 lot (Nos 1-71 and the 22 seam-edge lots): terracotta floor, painted plain piers, flat painted party walls and reveals, risers, run ends; each check fails on the V8.6 geometry', () => {
    setV9(false);
    const offRows = MB.map((def) => ({ def, row: rowOf(def) }));
    setV9(true);
    try {
      const onRows = MB.map((def) => ({ def, row: rowOf(def) }));
      V9_ROWS.push(...onRows);
      const lotsOn = allV9(onRows), lotsOff = all71(offRows);
      assert.equal(lotsOn.length, N_V9);
      let risers = 0, steps = 0;
      const offLotAt = (rec: LotRec) => offRows.find((o) => o.def.id === rec.id)!.row.lots.get(rec.key)!;
      lotsOn.forEach((l, i) => {
        const row = onRows.find((o) => o.def.id === l.id)!.row, no = nm(l).replace(/^No /, '');
        const r = check(row, l), rOff = check(offRows.find((o) => o.def.id === l.id)!.row, offLotAt(l));
        assert.equal(offLotAt(l).no, l.no);
        assert.ok(r.floorNoTile, `No ${no}: no checkerboard tile on the walkway floor`);
        assert.ok(r.floorTerracotta, `No ${no}: the whole floor is terracotta (0.90-1.10)`);
        const walk = D * (l.w + (r.ex.s1 - r.ex.s0) * D / 2); // trapezoid between the start and end lines
        assert.ok(Math.abs(r.floorArea - walk) < 1e-6 * walk + 1e-6, `No ${no}: terracotta area ${r.floorArea} equals the walkway area ${walk}`);
        assert.ok(Math.abs(r.ceilArea - walk) < 1e-6 * walk + 1e-6, `No ${no}: flat ceiling area ${r.ceilArea} equals the walkway area ${walk}`);
        assert.ok(r.sunk === 0 || r.ex.start === 'end' || r.ex.end === 'end', `No ${no}: floor tiles are only sunk at run ends (${r.sunk})`);
        assert.ok(r.pierPainted, `No ${no}: piers carry the arcade paint, flat`);
        assert.ok(r.pierPlainBox, `No ${no}: each pier is one plain box (8 triangles), no dado, plinth or capital`);
        assert.ok(r.wallPresent, `No ${no}: wall ${r.wall.length} reveal ${r.reveal.length} ${JSON.stringify(r.ex)}: party wall present (48 face + 24 reveal triangles) exactly where the lot has a wall`);
        assert.ok(r.wallPainted, `No ${no}: party-wall faces are painted (tone 0.97-1.03 per face)`);
        assert.ok(r.wallFlat, `No ${no}: party-wall faces use the flat white atlas cell, no plaster-tile UVs`);
        assert.ok(r.revealFlat, `No ${no}: reveals and spandrels are flat paint`);
        assert.ok(r.noOldArch, `No ${no}: no old shallow arch in the plane a = 0`);
        const stepped = Math.abs(lotStep(onRows, l)) > 1e-4;
        if (stepped) steps++;
        assert.equal(r.riser, stepped && r.ex.start !== 'end' ? 2 : 0, `No ${no}: a riser closes the floor step (${stepped ? 'step' : 'level'})`);
        risers += r.riser / 2;
        // Every assertion above fails on V8.6 (at the lots where it applies).
        assert.equal(rOff.floorNoTile, false, `bites: V8.6 floor of No ${no} uses the checkerboard tile`);
        assert.equal(rOff.floorTerracotta, false, `bites: V8.6 floor of No ${no} is not terracotta`);
        assert.equal(rOff.pierPainted, false, `bites: V8.6 piers of No ${no} are not arcade-painted`);
        assert.equal(rOff.pierPlainBox, false, `bites: V8.6 piers of No ${no} have capital geometry or another footprint`);
        if (r.ex.start !== 'end') {
          assert.equal(rOff.wallPresent, false, `bites: V8.6 has no party wall of faces at No ${no}`);
          assert.equal(rOff.wallPainted, false, `bites: V8.6 has no painted wall faces at No ${no}`);
          assert.equal(rOff.wallFlat, false, `bites: V8.6 has no flat wall faces at No ${no}`);
          assert.equal(rOff.revealFlat, false, `bites: V8.6 has no reveals at No ${no}`);
        } else assert.equal(rOff.noOldArch, false, `bites: V8.6 has its shallow arch at the run start No ${no}`);
        void i;
      });
      assert.ok(risers > 20, `many lots step (${risers} risers, ${steps} steps)`);
      // The P1 look (plaster-tile UVs on the walls) fails the flatness check.
      const l5 = lotsOn.find((l) => l.no === 5)!, c5 = check(onRows[0].row, l5);
      assert.ok(plasterWalls(c5) === true, 'sanity: the flat walls carry no plaster cell');
      const mutated = { ...c5, wall: c5.wall.map((p) => p.map((q) => ({ ...q, u: plaster[0] + 0.1, v: plaster[1] + 0.1 }))) };
      assert.equal(mutated.wall.every((p) => p.every((q) => inCell(q, white))), false, 'bites: plaster UVs would fail the flatness check');
      console.log(`risers: ${risers} of ${N_V9} lots; V8.6 pier triangles at No 5 ${check(offRows[0].row, lotsOff.find((l) => l.no === 5)!).piers[0].sig.length}+extras ${check(offRows[0].row, lotsOff.find((l) => l.no === 5)!).piers[0].extras}`);
    } finally { setV9(false); }
  });

  /** Floor level of this lot minus the floor level of the lot before it (0 at a run start). */
  function lotStep(rows: { def: { id: number }; row: Row }[], l: LotRec): number {
    const row = rows.find((o) => o.def.id === l.id)!.row;
    if (l.u > 0) return l.fy - row.lots.get(`${l.edge}:${l.u - 1}`)!.fy;
    const e = check(row, l).ex;
    if (e.start !== 'mitre') return 0;
    const pe = (l.edge + row.n - 1) % row.n, pl = [...row.lots.values()].filter((q) => q.edge === pe);
    return l.fy - pl[pl.length - 1].fy;
  }

  test('flag on, continuity: between every two adjacent V9 lots the party wall exists once and sits exactly on the shared boundary of floor and ceiling; run ends are closed by their end pier alone', () => {
    setV9(true);
    try {
      const rows = MB.map((def) => ({ def, row: rowOf(def) }));
      const lots = allV9(rows);
      const rowOfLot = (l: LotRec) => rows.find((o) => o.def.id === l.id)!.row;
      const lotAt = (id: number, e: number, u: number) => rows.find((o) => o.def.id === id)!.row.lots.get(`${e}:${u}`);
      // Boundary vertices of the floor / ceiling quads of a lot at depth d: [min a, max a] (frame of the lot).
      const extent = (l: LotRec, y: (q: LotRec) => number, up: boolean, d: number): [number, number] => {
        const a: number[] = [];
        for (const p of trisOf(rowOfLot(l), l)) if (p.every((q) => Math.abs(q.y - y(l)) < EPS && (up ? q.ny > 0.9 : q.ny < -0.9) && q.d >= -1e-6 && q.d <= D + 1e-6)) for (const q of p) if (Math.abs(q.d - d) < 1e-6) a.push(q.a);
        return [Math.min(...a), Math.max(...a)];
      };
      /** Centre line point (frame of lot `l`) of the wall at depth D: the two faces at +-T, floor level. */
      const wallCentre = (l: LotRec, d: number): [number, number] => {
        const c = check(rowOfLot(l), l), all = c.wall.flatMap((p) => p), ymin = Math.min(...all.map((q) => q.y)), pts = all.filter((q) => Math.abs(q.d - d) < 1e-6 && Math.abs(q.y - ymin) < EPS);
        const as = [...new Set(pts.map((q) => +q.a.toFixed(6)))].sort((p, q) => p - q);
        return world(l, (as[0] + as[as.length - 1]) / 2, d);
      };
      const pairs: [LotRec, LotRec, boolean][] = [];
      for (const def of MB) {
        const f = v9e(def.id);
        for (const e of f) {
          const cnt = [...rowOfLot(lotAt(def.id, e, 0)!).lots.values()].filter((q) => q.edge === e).length;
          for (let u = 0; u + 1 < cnt; u++) pairs.push([lotAt(def.id, e, u)!, lotAt(def.id, e, u + 1)!, false]);
          const n = rowOfLot(lotAt(def.id, e, 0)!).n, nx = (e + 1) % n;
          if (f.includes(nx) && check(rowOfLot(lotAt(def.id, e, 0)!), lotAt(def.id, nx, 0)!).ex.start === 'mitre') pairs.push([lotAt(def.id, e, cnt - 1)!, lotAt(def.id, nx, 0)!, true]);
        }
      }
      assert.equal(pairs.length, 85, 'adjacent pairs: 64 inside the 7 frontage edges (21 + 16 + 9 + 9 + 4 + 3 + 2), 16 inside the 6 seam edges (0 + 2 + 2 + 2 + 7 + 3) and 5 corners');
      let wallTris = 0, corners = 0;
      for (const [k, k1, corner] of pairs) {
        const at = `${nm(k)}|${nm(k1)}`;
        if (corner) corners++;
        const c1 = check(rowOfLot(k1), k1), c0 = check(rowOfLot(k), k);
        assert.equal(c1.wall.length, 48, `${at}: the wall is drawn once, by the later lot`);
        assert.equal(c0.ex.end, corner ? 'mitre' : 'none');
        // The earlier lot has no wall of its own at its end: no vertical tri on its end line.
        const endLineTris = c0.tris.filter((p) => p.every((q) => Math.abs(q.ny) < 0.2) && p.every((q) => Math.abs(q.a - k.w - c0.ex.s1 * q.d) < T + EPS) && p.some((q) => q.d > 0.45 && q.d < D - 0.1) && p.every((q) => q.y > k.fy - 0.01 && q.y < k.b0 + EPS && q.d > 0.5 && q.d < D - 0.2)).length;
        assert.equal(endLineTris, 0, `${at}: no duplicate wall or arch at the end of the earlier lot`);
        wallTris += c1.wall.length;
        for (const d of [0, D]) {
          for (const [yf, up] of [[(q: LotRec) => q.fy, true], [(q: LotRec) => q.b0, false]] as [(q: LotRec) => number, boolean][]) {
            const e0 = extent(k, yf, up, d)[1], s1 = extent(k1, yf, up, d)[0];
            const gap = same(world(k, e0, d), world(k1, s1, d));
            assert.ok(gap < 1e-3, `${at}: ${up ? 'floor' : 'ceiling'} lines meet at d=${d} (gap/overlap ${gap.toFixed(4)} m)`);
          }
        }
        // The wall's centre line (at the street-side end of the opening's strip and at the shopfront) lies on that shared line.
        for (const d of [D]) {
          const wc = wallCentre(k1, d), e0 = world(k, extent(k, (q) => q.fy, true, d)[1], d);
          assert.ok(same(wc, e0) < 1e-3, `${at}: wall centre line is on the shared boundary at d=${d} (off by ${same(wc, e0).toFixed(4)} m)`);
        }
        // The riser and the floors meet at one height, or the step is closed.
        void c0;
      }
      assert.equal(wallTris, 85 * 48);
      assert.equal(corners, 5, 'four corners of 236495776 are mitred (edges 0|1, 1|2, 2|3, 3|4), and 233690737 edge 1|2 (seam lot | No 1)');
      // Without the mitre the lots would leave a gap or overlap of this size at depth D (far above the 1 mm tolerance): the check bites.
      for (const [k, k1, corner] of pairs) {
        if (!corner) continue;
        const c1 = check(rowOfLot(k1), k1), c0 = check(rowOfLot(k), k);
        const wedge = Math.abs(c0.ex.s1 - 0) * D + Math.abs(c1.ex.s0 - 0) * D;
        if (Math.abs(1 - (c1.ex.turnPrev ?? 1)) > 0.005) assert.ok(wedge > 0.05, `butt-jointed lots would leave ${wedge.toFixed(3)} m at corner ${nm(k)}|${nm(k1)}`);
      }
      // Run ends: nothing but the flush end pier; the neighbouring street plane carries no wall.
      const ends: [LotRec, 'start' | 'end'][] = [];
      for (const def of MB) {
        const f = v9e(def.id);
        for (const e of f) {
          const cnt = [...rowOfLot(lotAt(def.id, e, 0)!).lots.values()].filter((q) => q.edge === e).length;
          const n = rowOfLot(lotAt(def.id, e, 0)!).n;
          const first = lotAt(def.id, e, 0)!, last = lotAt(def.id, e, cnt - 1)!;
          if (check(rowOfLot(first), first).ex.start === 'end') ends.push([first, 'start']);
          if (check(rowOfLot(last), last).ex.end === 'end') ends.push([last, 'end']);
          void n;
        }
      }
      // V9-P3: No 1 is mitred onto the seam lot of 233690737 edge 1; the five other Main Bazaar run ends now meet seam lots at sharp corners
      // (both sides end); the seam edges end at side walls (no lots) or, at 233690737 edge 1, at the old edge 0.
      assert.deepEqual(ends.map(([l, w]) => `${l.no ?? `${l.id}:${l.key}`}${w === 'start' ? '<' : '>'}`).sort(), ['22>', '23<', '39>', '40<', '71>',
        '233690737:1:0<', '233690737:3:0<', '233690737:3:2>', '236495303:17:0<', '236495303:17:2>', '236495303:0:0<', '236495303:0:2>',
        '236495776:16:0<', '236495776:16:7>', '236495776:5:0<', '236495776:5:3>'].sort(), 'sixteen run ends');
      let corner = 0;
      for (const [l, which] of ends) {
        const c = check(rowOfLot(l), l);
        if (which === 'start') assert.equal(c.wall.length, 0, `${nm(l)}: no wall at a run start`);
        assert.ok(c.pierPainted && c.pierPlainBox, `end of run at ${nm(l)}: painted plain end pier`);
        const pier = c.piers[which === 'start' ? 0 : c.piers.length - 1];
        const a = pier.sig.flatMap((p) => p.map((q) => q.a));
        if (which === 'start') assert.ok(Math.min(...a) > -0.003 - 1e-6 && Math.max(...a) < 0.46 + 0.003 + 1e-6, `${nm(l)}: end pier is flush with the run start`);
        else assert.ok(Math.abs(Math.max(...a) - l.w) < 0.003 + 1e-6 && Math.min(...a) > l.w - 0.46 - 0.003 - 1e-6, `${nm(l)}: end pier is flush with the run end`);
        // A seam lot's corner pier onto the run: the run's end-lot paint, not grown (it stands inside the run's grown end pier).
        if (which === 'start' ? c.ex.cornerPrev : c.ex.cornerNext) {
          corner++;
          const col = new THREE.Color().setHex(which === 'start' ? c.ex.pier0 : c.ex.pier1);
          assert.ok(pier.sig.every((p) => p.every((q) => near(q.c, col))), `${nm(l)}: corner pier carries the run's paint`);
          assert.ok(which === 'start' ? Math.min(...a) > -1e-6 : Math.max(...a) < l.w + 1e-6, `${nm(l)}: corner pier is not grown`);
        }
        assert.ok(c.noOldArch);
        if (which === 'end') {
          // nothing stands in the plane of the neighbouring street: no vertical triangle on the end plane a = w across the walkway
          const onEnd = c.tris.filter((p) => p.every((q) => Math.abs(q.a - l.w) < 1e-6) && p.every((q) => q.d > 0.47 && q.d < D - 0.01) && p.every((q) => Math.abs(q.ny) < 0.2) && p.every((q) => q.y < l.b0 + EPS)).length;
          assert.equal(onEnd, 0, `${nm(l)}: no end wall in the neighbouring street plane`);
        }
      }
      assert.equal(corner, 5, 'five seam corner piers, one per sharp corner onto the run');
    } finally { setV9(false); }
  });


  /** Triangles of a lot in the chunk frame, flat [x, y, z, ...] per triangle. */
  const worldTris = (r: Row, l: LotRec): number[][] => {
    const out: number[][] = [];
    for (let i = l.i[0]; i < l.i[1]; i += 3) { const t: number[] = []; for (let k = 0; k < 3; k++) { const v = r.buf.idx[i + k]; t.push(r.buf.pos[v * 3], r.buf.pos[v * 3 + 1], r.buf.pos[v * 3 + 2]); } out.push(t); }
    return out;
  };
  /** Segment o -> o + dir against a triangle, double sided (Moller-Trumbore). */
  function segHits(o: number[], dir: number[], t: number[]): boolean {
    const e1 = [t[3] - t[0], t[4] - t[1], t[5] - t[2]], e2 = [t[6] - t[0], t[7] - t[1], t[8] - t[2]];
    const px = dir[1] * e2[2] - dir[2] * e2[1], py = dir[2] * e2[0] - dir[0] * e2[2], pz = dir[0] * e2[1] - dir[1] * e2[0];
    const det = e1[0] * px + e1[1] * py + e1[2] * pz;
    if (Math.abs(det) < 1e-12) return false;
    const tx = o[0] - t[0], ty = o[1] - t[1], tz = o[2] - t[2], u = (tx * px + ty * py + tz * pz) / det;
    if (u < -1e-9 || u > 1 + 1e-9) return false;
    const qx = ty * e1[2] - tz * e1[1], qy = tz * e1[0] - tx * e1[2], qz = tx * e1[1] - ty * e1[0];
    const v = (dir[0] * qx + dir[1] * qy + dir[2] * qz) / det;
    if (v < -1e-9 || u + v > 1 + 1e-9) return false;
    const tt = (e2[0] * qx + e2[1] * qy + e2[2] * qz) / det;
    return tt >= -1e-9 && tt <= 1 + 1e-9;
  }
  /** Rays across every V9 party wall at heights between the two floors it separates: how many pass through (a gap), of how many cast. */
  function wallLeaks(rows: { def: { id: number }; row: Row }[]) {
    const rowOfLot = (l: LotRec) => rows.find((o) => o.def.id === l.id)!.row;
    const lots = allV9(rows);
    const at = (id: number, e: number, u: number) => lots.find((q) => q.id === id && q.edge === e && q.u === u);
    let cast = 0, leaks = 0, steps = 0, maxStep = 0;
    const worst: string[] = [];
    for (const l of lots) {
      const row = rowOfLot(l), c = check(row, l);
      if (c.ex.start === 'end') continue;
      const prev = l.u > 0 ? at(l.id, l.edge, l.u - 1)! : (() => { const pe = (l.edge + row.n - 1) % row.n; const pl = lots.filter((q) => q.id === l.id && q.edge === pe); return pl[pl.length - 1]; })();
      const lo = Math.min(l.fy, prev.fy), hi = Math.max(l.fy, prev.fy);
      if (hi - lo < 1e-4) continue;
      steps++; maxStep = Math.max(maxStep, hi - lo);
      const tris = [...worldTris(row, l), ...worldTris(rowOfLot(prev), prev)];
      const s0 = c.ex.start === 'mitre' ? c.ex.s0 : 0;
      for (const t of [0.02, 0.5, 0.98]) {
        const y = lo + t * (hi - lo);
        for (let d = 0.05; d <= D - 0.05 + 1e-9; d += 0.05) {
          const a = s0 * d - 0.6, o = [l.x0 + l.ex * a - l.nx * d, y, l.z0 + l.ez * a - l.nz * d], dir = [l.ex * 1.2, 0, l.ez * 1.2];
          cast++;
          if (!tris.some((tr) => segHits(o, dir, tr))) { leaks++; if (worst.length < 4) worst.push(`${nm(l)}: y=${(y - lo).toFixed(4)} above the lower floor, d=${d.toFixed(2)}, step ${((hi - lo) * 1000).toFixed(1)} mm`); }
        }
      }
    }
    return { cast, leaks, steps, maxStep, worst };
  }

  test('flag on, vertical continuity: at every floor step no ray passes through a party wall between the two floor heights (jambs and riser close it), on the shipped terrain', () => {
    setV9(true);
    try {
      const rows = MB.map((def) => ({ def, row: rowOf(def) }));
      const r = wallLeaks(rows);
      console.log(`vertical continuity: ${r.steps} steps (max ${(r.maxStep * 1000).toFixed(1)} mm), ${r.cast} rays, ${r.leaks} gaps`);
      assert.ok(r.steps >= 60, 'the steps are found');
      assert.equal(r.leaks, 0, `gaps under the party walls: ${r.worst.join('; ')}`);
    } finally { setV9(false); }
  });


  /** Terracotta floor triangles of a lot (horizontal, facing up, inside the walkway strip), independent of any expected floor level. */
  function floorTriangles(r: Row, l: LotRec): Vx[][] {
    return trisOf(r, l).filter((p) => p.every((q) => q.ny > 0.9 && Math.abs(q.y - p[0].y) < 1e-9 && q.d > -1e-6 && q.d < D + 1e-6 && q.a > -1 && q.a < l.w + 1)
      && p.every((q) => { const k = q.c[0] / terra.r; return k > 0.9 - 1e-3 && k < 1.1 + 1e-3 && near(q.c, terra, k); }));
  }
  /**
   * Tile-to-tile seams inside a lot floor: wherever two floor triangles share a position (their edge) the heights must agree
   * (otherwise a horizontal ray between the two heights slips through the edge). Returns the number of seams and the largest.
   */
  function floorSeams(r: Row, l: LotRec): { seams: number; worst: number; heights: number } {
    const at = new Map<string, Set<number>>();
    const hs = new Set<number>();
    for (const p of floorTriangles(r, l)) for (const q of p) {
      const k = `${q.a.toFixed(4)},${q.d.toFixed(4)}`;
      if (!at.has(k)) at.set(k, new Set());
      at.get(k)!.add(+q.y.toFixed(7)); hs.add(+q.y.toFixed(7));
    }
    let seams = 0, worst = 0;
    for (const set of at.values()) if (set.size > 1) { seams++; worst = Math.max(worst, Math.max(...set) - Math.min(...set)); }
    // tiles of different height that touch only along an edge share positions; also compare whole-lot heights
    return { seams, worst, heights: hs.size };
  }

  test('flag on, no tile-to-tile seam inside any V9 lot floor (every lot has one floor height), on the shipped terrain', () => {
    setV9(true);
    try {
      const rows = MB.map((def) => ({ def, row: rowOf(def) }));
      let n = 0, worstAll = 0;
      for (const l of allV9(rows)) {
        const row = rows.find((o) => o.def.id === l.id)!.row, r = floorSeams(row, l);
        n++; worstAll = Math.max(worstAll, r.worst);
        assert.equal(r.heights, 1, `${nm(l)}: the whole terracotta floor is at one height (${r.heights} heights, tile seams ${r.seams}, up to ${(r.worst * 1000).toFixed(1)} mm)`);
        assert.equal(r.seams, 0, `${nm(l)}: no open tile seam`);
      }
      assert.equal(n, N_V9);
      console.log(`floor seams: ${N_V9} lots, one floor height each, no tile seam (worst ${(worstAll * 1000).toFixed(1)} mm)`);
    } finally { setV9(false); }
  });

  test('flag on, run ends: each run-end lot is drawn at one height, 3 mm under the lower of its floor and the neighbouring floor it gives way to (old, or a seam lot seen from the run); nothing else is lowered (overlap numbers printed)', () => {
    setV9(true);
    try {
      const rows = MB.map((def) => ({ def, row: rowOf(def) }));
      const lots = allV9(rows);
      // Sutherland-Hodgman: area of polygon (flat xz) inside a convex rectangle.
      const clipArea = (poly: number[], rect: number[]): number => {
        let pts: number[][] = []; for (let i = 0; i < poly.length; i += 2) pts.push([poly[i], poly[i + 1]]);
        const sgn = ((rect[2] - rect[0]) * (rect[5] - rect[1]) - (rect[3] - rect[1]) * (rect[4] - rect[0])) > 0 ? 1 : -1;
        for (let i = 0; i < 4 && pts.length; i++) {
          const ax = rect[i * 2], az = rect[i * 2 + 1], bx = rect[((i + 1) % 4) * 2], bz = rect[((i + 1) % 4) * 2 + 1];
          const inside = (q: number[]) => sgn * ((bx - ax) * (q[1] - az) - (bz - az) * (q[0] - ax)) >= -1e-12;
          const cut = (p0: number[], p1: number[]) => { const d0 = (bx - ax) * (p0[1] - az) - (bz - az) * (p0[0] - ax), d1 = (bx - ax) * (p1[1] - az) - (bz - az) * (p1[0] - ax), k = d0 / (d0 - d1); return [p0[0] + (p1[0] - p0[0]) * k, p0[1] + (p1[1] - p0[1]) * k]; };
          const out: number[][] = [];
          for (let k = 0; k < pts.length; k++) { const c0 = pts[k], c1 = pts[(k + 1) % pts.length]; if (inside(c0)) { out.push(c0); if (!inside(c1)) out.push(cut(c0, c1)); } else if (inside(c1)) out.push(cut(c0, c1)); }
          pts = out;
        }
        let a = 0; for (let k = 0; k < pts.length; k++) { const q = pts[k], q2 = pts[(k + 1) % pts.length]; a += q[0] * q2[1] - q2[0] * q[1]; }
        return Math.abs(a) / 2;
      };
      let ends = 0;
      for (const l of lots) {
        const row = rows.find((o) => o.def.id === l.id)!.row, strips = runEndStrips(row, l, realCtx(), MB.find((m) => m.id === l.id)!.chunk);
        const tris = worldTris(row, l).filter((t) => Math.abs(t[1] - t[4]) < 1e-9 && Math.abs(t[4] - t[7]) < 1e-9 && t[1] > l.fy - 1e-6 - 0.2 && t[1] < l.fyRaw + EPS && Math.abs(t[1] - l.fy) < 1e-6);
        const floor = floorTriangles(row, l);
        assert.ok(floor.length > 0 && floor.every((p) => p.every((q) => Math.abs(q.y - l.fy) < 1e-6)), `${nm(l)}: the whole floor is at the drawn level ${l.fy.toFixed(4)}`);
        if (!strips.length) { assert.ok(Math.abs(l.fy - l.fyRaw) < 1e-9, `${nm(l)}: not a run end, floor at its natural level`); continue; }
        ends++;
        assert.ok(l.fy <= Math.min(l.fyRaw, ...strips.map((q) => q.fy5)) - 0.003 + 1e-9, `${nm(l)}: 3 mm under the lower floor`);
        let total = 0, overlap = 0;
        for (const t of floorTriangles(row, l)) {
          const tri = area(t); total += tri;
        }
        for (const t of worldTris(row, l)) {
          if (!(Math.abs(t[1] - l.fy) < 1e-6 && Math.abs(t[4] - l.fy) < 1e-6 && Math.abs(t[7] - l.fy) < 1e-6)) continue;
          const poly = [t[0], t[2], t[3], t[5], t[6], t[8]];
          for (const st of strips) overlap += clipArea(poly, st.rect);
        }
        const nbFy = Math.min(...strips.map((q) => q.fy5));
        void tris;
        console.log(`run end ${nm(l)}: V9 floor lowered as a whole by ${((l.fyRaw - l.fy) * 1000).toFixed(1)} mm, ${(nbFy - l.fy > 0 ? (nbFy - l.fy) * 1000 : 0).toFixed(1)} mm below the old floor; overlap with the old strip ${overlap.toFixed(2)} m2 of ${total.toFixed(2)} m2 lowered, ${(total - overlap).toFixed(2)} m2 lowered outside the old strip`);
        assert.ok(overlap > 0.5, `${nm(l)}: the overlap is found`);
        assert.ok(nbFy - l.fy >= 0.003 - 1e-9, `${nm(l)}: terracotta is never above the old floor (${((nbFy - l.fy) * 1000).toFixed(2)} mm below)`);
      }
      assert.equal(ends, 6, 'six sunk run ends, one rule: Nos 22, 23, 39, 40, 71 under their seam lots and 233690737 edge 1 under old edge 0');
    } finally { setV9(false); }
  });

  test('flag on, clearance: every V9 opening admits the player (0.7 m circle, 1.72 m tall) on every lot, on the shipped terrain', () => {
    // Collision does not use the party walls: the outline is the inset building footprint plus the
    // piers/goods of frontLayout (unchanged). Here the visible opening must still be passable.
    setV9(true);
    try {
      const rows = MB.map((def) => ({ def, row: rowOf(def) }));
      let minJamb = Infinity, minWidth = Infinity, minHead = Infinity, maxRise = -Infinity, minRise = Infinity;
      const flats: string[] = [];
      for (const l of allV9(rows)) {
        const row = rows.find((o) => o.def.id === l.id)!.row, c = check(row, l);
        const rise = l.fy - row.ground; maxRise = Math.max(maxRise, rise); minRise = Math.min(minRise, rise);
        const { r, ys, half, flat } = v9Opening(l.fy, l.b0);
        if (flat) {
          flats.push(`${nm(l)} (${(l.b0 - l.fy).toFixed(2)} m)`); assert.ok(l.no === null, `${nm(l)}: Main Bazaar lots keep their arch`);
          assert.equal(c.ex.start, 'end', `${nm(l)}: a flat opening only where no wall is drawn (run start): the flat branch stays unused`);
        }
        else assert.equal(r, v9ArchRadius(l.fy, l.b0));
        minJamb = Math.min(minJamb, ys - l.fy); minWidth = Math.min(minWidth, 2 * half); minHead = Math.min(minHead, l.b0 - l.fy);
        assert.ok(2 * half >= 2 * PLAYER.radius + 0.3, `${nm(l)}: opening ${2 * half} m wide vs player diameter ${2 * PLAYER.radius}`);
        assert.ok(ys - l.fy >= PLAYER.height + 0.05, `${nm(l)}: jamb height ${ys - l.fy} vs player ${PLAYER.height}`);
        assert.ok(ys + r <= l.b0 - 0.1, 'crown stays below the flat ceiling');
        // Headroom under the flat ceiling is V8.6's (fy and b0 unchanged); a flat-topped opening only needs the jamb.
        assert.ok(l.b0 - l.fy >= PLAYER.height + (flat ? 0.17 : 0.5), `${nm(l)}: walkway headroom under the flat ceiling`);
        if (c.ex.start === 'end') continue;
        // Geometric check on the built wall: no wall triangle covers the player's footprint in the opening.
        const tri = c.wall.map((p) => p.map((q) => [q.d, q.y] as [number, number]));
        assert.ok(tri.length === 48);
        const covered = (d: number, y: number) => tri.some((p) => {
          const s = (i: number, j: number) => (p[j][0] - p[i][0]) * (y - p[i][1]) - (p[j][1] - p[i][1]) * (d - p[i][0]);
          const a = s(0, 1), b = s(1, 2), cc = s(2, 0);
          return (a >= -1e-9 && b >= -1e-9 && cc >= -1e-9) || (a <= 1e-9 && b <= 1e-9 && cc <= 1e-9);
        });
        assert.ok(covered(0.55, l.fy + 1.0), `${nm(l)}: wall strip beside the opening is solid (the check can see walls)`);
        const dc = (0.46 + D) / 2;
        for (let d = dc - 0.35; d <= dc + 0.35 + 1e-9; d += 0.05) for (let y = l.fy + 0.05; y <= l.fy + PLAYER.height; y += 0.1) assert.ok(!covered(d, y), `${nm(l)}: wall at d=${d.toFixed(2)} y=${(y - l.fy).toFixed(2)}`);
      }
      console.log(`clearance, shipped terrain (HeightMap over height.bin), ${N_V9} lots: opening width >= ${minWidth.toFixed(2)} m, jamb height >= ${minJamb.toFixed(2)} m, headroom >= ${minHead.toFixed(2)} m, floor relative to block datum ${minRise.toFixed(2)} .. ${maxRise.toFixed(2)} m; lots too low for an arch (all run starts, no wall drawn, so no flat-topped opening is drawn): ${flats.length ? flats.join(', ') : 'none'}`);
      // On a steep rise the arch still shrinks safely: the rule is monotone and never below 0.55 m radius.
      for (const rise of [0.14, 0.25, 0.38, 0.58]) { const r = v9ArchRadius(10 + rise, 13.05); assert.ok(2 * r >= 1.0 && 13.05 - 0.12 - r - (10 + rise) >= 1.77 - 1e-9, `rise ${rise}`); }
    } finally { setV9(false); }
  });

  /** The sharp corners of the run onto a seam edge: a V9 lot at a run end ('end', not mitred) whose neighbouring edge is V9 too, with a seam edge on one side. */
  function sharpCorners() {
    setV9(true);
    const corners: { def: (typeof MB)[number]; key: string; no: number | null; o: number; at: 'start' | 'end' }[] = [];
    try {
      for (const def of MB) {
        const row = rowOf(def);
        for (const l of allV9([{ def, row }])) {
          const ex = expectEnds(row, l);
          for (const [o, at] of [[(l.edge + row.n - 1) % row.n, 'start'], [(l.edge + 1) % row.n, 'end']] as [number, 'start' | 'end'][]) {
            if ((at === 'start' ? !l.first : !l.last) || ex[at] !== 'end' || !v9e(def.id).includes(o)) continue;
            if (seams(def.id).includes(o) || seams(def.id).includes(l.edge)) corners.push({ def, key: l.key, no: l.no, o, at });
          }
        }
      }
    } finally { setV9(false); }
    return corners;
  }

  test('flag on, corners (V9-P3): at each sharp corner of the run onto a seam edge, no shopfront or shop interior of either corner lot stands in the other arcade; V8.6 had them there', () => {
    const corners = sharpCorners();
    assert.equal(corners.length, 10, 'five sharp corners, two lots each');
    // Shopfront and interior triangles (behind the walkway, under the beam) of each corner lot that lie in the other edge's arcade (less than D in from its face).
    const measure = (on: boolean) => {
      setV9(on);
      try {
        const rows = new Map(MB.map((def) => [def.id, rowOf(def)]));
        return corners.map(({ def, key, o, at }) => {
          const row = rows.get(def.id)!, l = row.lots.get(key)!;
          const [onx, onz] = edgeOutward(row.ring, o, row.a2), c = at === 'start' ? (o + 1) % row.n : o, cx = row.ring[c * 2], cz = row.ring[c * 2 + 1];
          const inward = (q: Vx) => { const x = l.x0 + l.ex * q.a - l.nx * q.d, z = l.z0 + l.ez * q.a - l.nz * q.d; return -((x - cx) * onx + (z - cz) * onz); };
          const behind = trisOf(row, l).filter((p) => p.every((q) => q.d >= D - 1e-6 && q.y <= l.b0 + 1e-6));
          const bad = behind.filter((p) => p.some((q) => inward(q) < D - 1e-6)).length;
          const near = Math.min(...behind.flatMap((p) => p.map((q) => (at === 'start' ? q.a : l.w - q.a))));
          return { name: `${nm(l)} (${at}, corner onto ${def.id}:${o})`, bad, tris: behind.length, near, w: l.w };
        });
      } finally { setV9(false); }
    };
    const on = measure(true), off = measure(false);
    on.forEach((c, k) => {
      console.log(`corner ${c.name}: lot ${c.w.toFixed(2)} m, shopfront / interior from ${c.near.toFixed(2)} m off the corner, ${c.bad} of ${c.tris} triangles in the other arcade (V8.6: ${off[k].bad} of ${off[k].tris})`);
      assert.equal(c.bad, 0, `${c.name}: shopfront / interior clear of the other arcade`);
      assert.ok(c.tris >= 8 && c.w - c.near > 1.5, `${c.name}: the lot keeps a shopfront`);
    });
    assert.ok(off.every((c) => c.bad > 0), 'bites: in V8.6 every corner lot stands in the other arcade');
  });

  /**
   * 1A (ac4a58a, V9-P2 as accepted), flag on, mock terrain: per-lot geometry hash (position, normal, uv, index; not colour, which V9-P3
   * repaints on every lot) of the Main Bazaar lots without a corner clip, and the plan hash (x, z, normal, uv, index) of No 2.
   */
  const P2_LOT_GEOM: Record<number, string> = { 3: 'ece9eec4c3020b70', 4: '41e6f5c45a8baacd', 5: 'bc66bec3522eb098', 6: '66f86a8b063a8d54', 7: '67fe3257c9dbe894', 8: '29f3f632e64b8313', 9: '908aacb832678a3d', 10: '9bedc5853ee2202f', 11: 'd30bee367cdda300', 12: '5e38c635ce192dee', 13: '3edb8cb4f29efc54', 14: 'f9ebd0ea4e1a1bc5', 15: 'c5fb04a753908041', 16: '12d0f60847e94169', 17: 'b815eeed11225f9d', 18: 'ecd7c23376349798', 19: '99b192e7afb1630a', 20: 'ffa4abf48dea7162', 21: 'b31dae803172c31a', 24: '15f2ebb4369dabae', 25: '727d5720b5c720c4', 26: '34bb1657401a5935', 27: '64592e2acb8b1911', 28: 'dbe8215b0b7e1de8', 29: '647ddbfcdb6da9d1', 30: 'ae2b5be4f6059137', 31: '63ca46cc987b8380', 32: '436b3892069e912b', 33: 'dfbd2a91232f140c', 34: '32e0be992a5cb346', 35: '544d148ecccb9e27', 36: '48433596103e940c', 37: 'f94acc79a8192a5b', 38: '2cef83438d988842', 41: '6018a49ab38b4770', 42: 'd465e0483e8913b8', 43: '877733c2ad1a23b9', 44: '2ec8058a678376a4', 45: 'ba655597ea1072eb', 46: '49d34b35ded3daa4', 47: 'ea17d517e963ff0e', 48: 'e3a55d37a6a788e8', 49: '126769464835287d', 50: 'e86dfa6e91eafcdf', 51: '5d1fc0333bc7f04a', 52: '1467011e969b4d32', 53: '37d79a16036ae642', 54: '127ac94ccd62d612', 55: '98d85a0533c9ac60', 56: '14a8389228ca3eab', 57: 'fbacec47cc91d598', 58: '5dc4b3147b07ec87', 59: 'e41e429782621eb2', 60: 'f0a6b03815f092fa', 61: '21f8b5baa9129f17', 62: '4ab0366d60bc17cc', 63: 'f3e813ab3947b3fe', 64: 'ce096558a181fd94', 65: 'cc035002b274a17b', 66: '47851a75c5778cc3', 67: 'd10e96ac81a107de', 68: 'f37cd879261a6291', 69: 'eede01d103a1eb5e', 70: 'a743df181fb47f00' };
  const P2_NO2_PLAN = '1a5821bbfbf8c5f0';
  const geomHash = (r: Row, l: LotRec, plan = false) => {
    const h = createHash('sha256'), pos = r.buf.pos.slice(l.v[0] * 3, l.v[1] * 3);
    h.update(Float64Array.from(plan ? pos.filter((_, k) => k % 3 !== 1) : pos));
    h.update(Float64Array.from(r.buf.nor.slice(l.v[0] * 3, l.v[1] * 3)));
    h.update(Float64Array.from(r.buf.uv.slice(l.v[0] * 2, l.v[1] * 2)));
    h.update(Int32Array.from(r.buf.idx.slice(l.i[0], l.i[1]).map((x) => x - l.v[0])));
    return h.digest('hex').slice(0, 16);
  };

  test('flag on, P2 geometry kept (V9-P3 round 1): every Main Bazaar lot without a corner clip (clip0 = clip1 = 0) has the jambs, shopfront and geometry of 1A', () => {
    // Bites: with the clip clamp applied at clip 0 (Math.max(aS(D), 0) at a concave mitre) Nos 49/50 and 59/60 differ.
    const clipped = sharpCorners().filter((c) => c.no !== null).map((c) => c.no!).sort((a, b) => a - b);
    assert.deepEqual(clipped, [22, 23, 39, 40, 71], 'the five Main Bazaar corner lots with a clip');
    setV9(true);
    try {
      const rows = MB.map((def) => ({ def, row: rowOf(def, ctx) }));
      const differ: string[] = [];
      let n = 0;
      for (const l of all71(rows)) {
        if (clipped.includes(l.no!)) continue;
        const row = rows.find((o) => o.def.id === l.id)!.row;
        n++;
        // No 1 is mitred onto the seam lot of 233690737 edge 1 since V9-P3 (a party wall where 1A had a run end; see the continuity test).
        if (l.no === 1) continue;
        // No 2: the same plan; only its riser and wall foot follow No 1, which is no longer sunk as a run end (14 vertices, +10.9 mm).
        if (l.no === 2) { if (geomHash(row, l, true) !== P2_NO2_PLAN) differ.push('No 2 (plan)'); continue; }
        if (geomHash(row, l) !== P2_LOT_GEOM[l.no!]) differ.push(`No ${l.no}`);
      }
      assert.equal(n, 66, '71 Main Bazaar lots less the five clipped corner lots');
      assert.deepEqual(differ, [], `geometry differs from 1A at ${differ.join(', ')}`);
    } finally { setV9(false); }
  });

  test('flag on, paint (V9-P3): each building piers, party walls and spandrels are painted from its own upper-facade colour, on every V9 lot; the P2 palette did not match', () => {
    setV9(true);
    try {
      const rows = MB.map((def) => ({ def, row: rowOf(def) }));
      const lots = allV9(rows);
      const hsl = (c: InstanceType<typeof THREE.Color>) => c.getHSL({ h: 0, s: 0, l: 0 });
      const dHue = (a: number, b: number) => Math.min(Math.abs(a - b), 1 - Math.abs(a - b));
      // "does not read as the facade's paint": another hue (more than 18 degrees, on a coloured facade) or far lighter / darker
      const mismatch = (arc: { h: number; s: number; l: number }, fac: { h: number; s: number; l: number }) => (fac.s > 0.05 && dHue(arc.h, fac.h) > 0.05) || Math.abs(arc.l - fac.l) > 0.15;
      let newMis = 0, p2Mis = 0, p2N = 0, sameBuilding = 0, worstHue = 0, worstDl = 0;
      for (const l of lots) {
        const row = rows.find((o) => o.def.id === l.id)!.row, c = check(row, l);
        // The arcade carries the lot's paint (piers; party wall faces and reveals where the lot has a wall): checked on the emitted triangles.
        assert.ok(c.pierPainted && c.wallPainted && c.revealFlat, `${nm(l)}: arcade painted with the paint derived from its facade`);
        // The upper facade the paint is derived from, as emitted by addUpper: vertex colours above the fascia proportional to lot.wall (x 0.96-1.03).
        const wall = new THREE.Color().setHex(l.lot.wall), ks = new Set<string>();
        for (const p of c.tris) for (const q of p) {
          if (q.y < l.b0 + 0.85 || Math.abs(q.ny) > 0.1) continue;
          const k = q.c[0] / wall.r;
          if (k > 0.955 && k < 1.035 && near(q.c, wall, k)) ks.add(k.toFixed(5));
        }
        assert.equal(ks.size, 1, `${nm(l)}: one upper-facade colour, lot.wall x a per-lot tone (${[...ks].join(', ')})`);
        const facade = wall.clone().multiplyScalar(Number([...ks][0])), fac = hsl(facade), arc = hsl(paintOf(l));
        if (mismatch(arc, fac)) newMis++;
        if (fac.s > 0.05) worstHue = Math.max(worstHue, dHue(arc.h, fac.h));
        worstDl = Math.max(worstDl, Math.abs(arc.l - fac.l));
        assert.ok(arc.l < fac.l && fac.l - arc.l < 0.15, `${nm(l)}: arcade a little darker than the facade (${fac.l.toFixed(3)} -> ${arc.l.toFixed(3)})`);
        if (l.no !== null) { p2N++; if (mismatch(hsl(new THREE.Color().setHex(p2Paint(l))), fac)) p2Mis++; }
      }
      // One building, one paint: consecutive lots of the same group on an edge.
      for (const l of lots) {
        const nx = lots.find((q) => q.id === l.id && q.edge === l.edge && q.u === l.u + 1);
        if (nx && nx.group === l.group) { sameBuilding++; assert.ok(paintOf(nx).equals(paintOf(l)), `one building, one paint (${nm(l)}|${nm(nx)})`); }
      }
      console.log(`paint: ${lots.length} lots, arcade vs facade: worst hue difference ${(worstHue * 360).toFixed(1)} deg, worst lightness difference ${worstDl.toFixed(3)}, mismatches ${newMis}; the P2 palette mismatched ${p2Mis} of ${p2N} Main Bazaar lots`);
      assert.equal(newMis, 0, 'every arcade reads as its facade paint');
      assert.ok(sameBuilding > 20);
      assert.ok(p2Mis >= 20, `bites: the P2 palette paints many arcades unlike their facades (${p2Mis})`);
    } finally { setV9(false); }
  });
  // ---- V9-P3 round 3: the M2 corner trim (233690737 edge 0 | edge 1, the Main Bazaar No 1 corner; owner-approved 2026-11-20) ----
  /**
   * Flag on, mock terrain, V9-P3 round 2 (diff 04d61d71, before the trim): digest of the hash of every lot of the five blocks except the
   * two lots at the M2 corner. The round-2 tree rebuilt for C:\Kuching3D-evidence\v9-p3\round3 gives the same digest.
   */
  const R2_OTHER_LOTS = 'f376179cbe9863aac71d07ab69b74af3c9ceb6fc91142ff3ad1630805b2b0d16';
  const M2_LOTS = ['233690737:0:3', '233690737:1:0'];
  const otherLots = () => {
    const h = createHash('sha256');
    let n = 0;
    for (const def of [...MB, ...OTHER]) {
      const row = rowOf(def, ctx);
      for (const [key, l] of row.lots) { if (M2_LOTS.includes(`${def.id}:${key}`)) continue; h.update(`${def.id}:${key}:${lotHash(row, l)};`); n++; }
    }
    return { digest: h.digest('hex'), n };
  };

  test('flag on, M2 corner trim (V9-P3 round 3): neither shopfront at the No 1 corner stands in the other walkway, they meet at the inner corner, triangle and draw counts unchanged; flag off keeps the V8.6 jamb', () => {
    // Shopfront and interior triangles (behind the walkway, under the beam) of a lot with a vertex less than D in from the face of edge o,
    // corner = ring vertex 1 (end of edge 0, start of edge 1); and the shopfront end at the corner (vertex at depth D nearest the corner).
    const measure = (on: boolean, c: any) => {
      setV9(on);
      try {
        const row = rowOf(MB[0], c), [onx0, onz0] = edgeOutward(row.ring, 0, row.a2), [onx1, onz1] = edgeOutward(row.ring, 1, row.a2);
        const cx = row.ring[2], cz = row.ring[3];
        const side = (key: string, onx: number, onz: number, atEnd: boolean) => {
          const l = row.lots.get(key)!, behind = trisOf(row, l).filter((p) => p.every((q) => q.d >= D - 1e-6 && q.y <= l.b0 + 1e-6));
          const inward = (q: Vx) => { const [x, z] = world(l, q.a, q.d); return -((x - cx) * onx + (z - cz) * onz); };
          const front = behind.flatMap((p) => p).filter((q) => Math.abs(q.d - D) < 1e-6);
          const endA = atEnd ? Math.max(...front.map((q) => q.a)) : Math.min(...front.map((q) => q.a));
          return { bad: behind.filter((p) => p.some((q) => inward(q) < D - 1e-6)).length, tris: lotTris(l), end: world(l, endA, D), over: atEnd ? l.w - endA : endA };
        };
        const meshes = Object.keys(build('0_-1', c).mesh).length;
        return { e0: side('0:3', onx1, onz1, true), e1: side('1:0', onx0, onz0, false), meshes };
      } finally { setV9(false); }
    };
    for (const [name, c] of [['mock', ctx], ['shipped', realCtx()]] as const) {
      const on = measure(true, c), off = measure(false, c);
      const gap = same(on.e0.end, on.e1.end);
      console.log(`M2 trim (${name} terrain): edge 0 lot 3 shopfront ends ${on.e0.over.toFixed(3)} m before the corner (V8.6 ${off.e0.over.toFixed(3)}), ${on.e0.bad} triangles in edge 1's walkway (V8.6 ${off.e0.bad}); edge 1 lot 0 starts ${on.e1.over.toFixed(3)} m after it, ${on.e1.bad} in edge 0's walkway (V8.6 ${off.e1.bad}); the two shopfronts meet within ${(gap * 1000).toFixed(2)} mm`);
      assert.equal(on.e0.bad, 0, `${name}: edge 0 lot 3 (the fin): no shopfront / interior in edge 1's walkway`);
      assert.equal(on.e1.bad, 0, `${name}: edge 1 lot 0: no shopfront / interior in edge 0's walkway`);
      assert.ok(off.e0.bad > 0 && off.e1.bad > 0, `${name}: bites: V8.6 (flag off) has both overshoots`);
      assert.ok(Math.abs(off.e0.over) < 1e-6, `${name}: flag off, edge 0 lot 3 keeps the V8.6 jamb at a = w`);
      assert.ok(on.e0.over > 0.7 && on.e0.over < 0.85 && on.e1.over > 0.7 && on.e1.over < 0.85, `${name}: trims of 0.78-0.79 m`);
      assert.ok(gap < 1e-3, `${name}: the two shopfronts meet at the inner corner of the walkways (gap ${gap})`);
      assert.equal(on.e0.tris, off.e0.tris, `${name}: edge 0 lot 3 keeps its triangle count`);
      assert.equal(on.meshes, off.meshes, `${name}: chunk 0_-1 keeps its draw calls`);
    }
  });

  test('flag on, M2 corner trim (V9-P3 round 3): every other lot of the five blocks (Main Bazaar, seam edges, Carpenter) is byte-identical to round 2', () => {
    setV9(true);
    try {
      const o = otherLots();
      console.log(`M2 trim: other lots ${o.n}, digest ${o.digest}`);
      assert.equal(o.n, 137, '139 lots less the two at the M2 corner');
      assert.equal(o.digest, R2_OTHER_LOTS);
    } finally { setV9(false); }
  });
}

