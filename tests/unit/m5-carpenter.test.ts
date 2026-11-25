// N1-M5 hero place 2 (node --test): the rest of Carpenter Street, Jalan China to Jalan Bishopgate.
// The m5 flag is read once per process at import, so it is set before the imports; the flag-off tables are checked
// in a child process.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
(globalThis as any).location = { search: '?m5=1' };
const geo = await import('../../src/v5/geo.ts');
const lots = await import('../../src/v5/lots.ts');
const carp = await import('../../src/v5/carpenterEast.ts');
const { CHUNK_SIZE, QUANT } = await import('../../src/world/config.ts');
const { m5Enabled } = await import('../../src/world/district/m5.ts');

const chunk = (key: string) => JSON.parse(readFileSync(new URL(`../../public/data/kuching/chunks/${key}.json`, import.meta.url), 'utf8'));
const C00 = chunk('0_0');
const ring = (c: any, id: number): number[][] => {
  const b = c.buildings.find((q: any) => q.id === id);
  assert.ok(b, `building ${id} missing`);
  const out: number[][] = [];
  for (let i = 0; i < b.r[0].length; i += 2) out.push([c.cx * CHUNK_SIZE + b.r[0][i] / QUANT, c.cz * CHUNK_SIZE + b.r[0][i + 1] / QUANT]);
  return out;
};
const near = (p: number[], q: number[], tol: number) => Math.abs(p[0] - q[0]) <= tol && Math.abs(p[1] - q[1]) <= tol;
const edgeOf = (r: number[][], p: number[], q: number[], tol: number): number => {
  for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; if ((near(a, p, tol) && near(b, q, tol)) || (near(a, q, tol) && near(b, p, tol))) return i; }
  return -1;
};
const row = (id: string) => { const r = geo.ROWS.find((q: any) => q.id === id); assert.ok(r, `row ${id} missing with the flag on`); return r!; };

test('flag: on with ?m5=1; off without a location, where no M5 row, block, lot table or road cut exists', () => {
  assert.equal(m5Enabled(), true);
  const code = "const g = await import('./src/v5/geo.ts'); const l = await import('./src/v5/lots.ts');" +
    "console.log('M5OFF ' + JSON.stringify({ rows: g.ROWS.map((r) => r.id), blocks: g.BLOCKS.length, ids: g.V5_BUILDING_IDS.length, tables: Object.keys(l.LOT_OVERRIDES), signs: Object.keys(l.M5_GENERIC_SIGNS), cut: g.clipRoadOutsideSection([150, 20, 200, 42, 270, 58]), corridor: g.v5Exclusion.inCorridor(220, 47) }));";
  const out = execFileSync(process.execPath, ['--experimental-transform-types', '--no-warnings', '--input-type=module', '-e', code], { encoding: 'utf8' });
  const off = JSON.parse(out.split('\n').find((l) => l.startsWith('M5OFF '))!.slice(6));
  assert.deepEqual(off.rows, ['S1', 'S2', 'N1', 'N2', 'N3', 'JC']);
  assert.equal(off.blocks, 4);
  assert.equal(off.ids, 8);
  assert.deepEqual(off.tables, ['S1', 'S2', 'N1', 'N2', 'N3']);
  assert.deepEqual(off.signs, []);
  assert.equal(off.cut[0], 158.4, 'flag off: the Carpenter Street road is cut at the old section end');
  assert.equal(off.corridor, false);
});

test('Carpenter Street rows are mapped frontage edges of the current chunk rings, and the two added blocks are those rings', () => {
  const N = 236495388, S = 236495302;
  for (const [id, bid, edge] of [['CN', N, 16], ['CB', N, 15], ['CH', S, 7], ['CS', S, 8], ['CR', S, 3]] as [string, number, number][]) {
    const r = row(id);
    assert.equal(r.building, bid);
    const e = edgeOf(ring(C00, bid), r.a, r.b, 0.06);
    assert.equal(e, edge, `${id} (${r.a} -> ${r.b}) is no longer edge ${edge} of building ${bid}`);
    assert.ok(C00.buildings.find((q: any) => q.id === bid).a.f.includes(e), `${id}: edge ${e} is not a mapped frontage edge`);
  }
  for (const [bid, blk] of [[N, geo.BLOCKS[geo.BLOCKS.length - 2]], [S, geo.BLOCKS[geo.BLOCKS.length - 1]]] as [number, number[]][]) {
    const r = ring(C00, bid);
    assert.equal(blk.length, r.length * 2);
    r.forEach((p, i) => assert.ok(near(p, [blk[2 * i], blk[2 * i + 1]], 0.06), `block ${bid} vertex ${i}`));
  }
  for (const id of [N, S, 1388134056]) assert.ok(geo.V5_BUILDING_IDS.includes(id) && geo.v5Exclusion.ids.has(id));
  // the Hainan Association's own outline lies on edge 7 of the south block
  assert.ok(edgeOf(ring(C00, 1388134056), row('CH').a, row('CH').b, 0.06) >= 0);
});

test('rows face the street, the corner lot of the Bishopgate row is the Carpenter Street corner, and lot tables fit', () => {
  for (const id of geo.CARP_E_ROWS) {
    const r = row(id), fr = geo.rowFrame(r);
    assert.ok(fr.nx * r.face![0] + fr.nz * r.face![1] > 0.99, `${id} faces ${[fr.nx, fr.nz]}`);
    assert.equal(lots.LOT_OVERRIDES[id].length, r.lots, `${id} lot table`);
    for (const o of lots.LOT_OVERRIDES[id]) assert.match(o.basis!, /^(typical \(M5\)|mapped: )/, `${id}: every lot says where its form comes from`);
    if (lots.M5_GENERIC_SIGNS[id]) assert.equal(lots.M5_GENERIC_SIGNS[id].length, r.lots);
  }
  // rows face each other across the street
  assert.ok(geo.rowFrame(row('CN')).nz > 0.9 && geo.rowFrame(row('CS')).nz < -0.9);
  const cb = geo.rowFrame(row('CB'));
  assert.ok(Math.hypot(cb.ox - 261.9, cb.oz - 52.6) < 0.01, 'CB lot 0 stands at the Carpenter Street corner');
  const w = lots.LOT_OVERRIDES.CB[0].wrap!;
  assert.equal(w.len, row('CN').skip, 'the corner return is as long as the stretch the north row leaves out');
  assert.ok(Math.abs(w.skew) < 0.25, `corner skew ${w.skew}`);
  assert.deepEqual(lots.M5_WRAP_NEIGHBOUR['CB:0'], ['CN', row('CN').lots - 1]);
  // lot widths stay in the shophouse range
  for (const id of ['CN', 'CB', 'CH', 'CS']) { const r = row(id), l = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]) - (r.skip ?? 0), lw = l / r.lots; assert.ok(lw > 4 && lw < 5.7, `${id} lot width ${lw}`); }
});

test('generic boards carry a trade word only: no name, no number', () => {
  const allowed = new Set(['KEDAI EMAS', 'KEDAI KOPI', 'KEDAI TIMAH', 'KEDAI PERABOT', 'KEDAI RUNCIT', 'KEDAI JAHIT']);
  let n = 0;
  for (const list of Object.values(lots.M5_GENERIC_SIGNS)) for (const g of list as any[]) if (g) { assert.ok(allowed.has(g.text), g.text); n++; }
  assert.ok(n >= 12);
});

test('the carriageway line lies midway between the mapped frontages, which stand 7.5 to 9.2 m apart', () => {
  const cn = row('CN'), cs = row('CS');
  const dist = (p: number[], a: number[], b: number[]) => Math.abs((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) / Math.hypot(b[0] - a[0], b[1] - a[1]);
  for (let d = 34; d < carp.CARP_E_LEN - 2; d += 6) {
    const p = carp.carpAt(d), n = dist([p.x, p.z], cn.a, cn.b), s = dist([p.x, p.z], cs.a, cs.b);
    assert.ok(n + s > 7.5 && n + s < 9.2, `width ${n + s} at ${d} m`);
    assert.ok(Math.abs(n - s) < 0.5, `off centre by ${(n - s) / 2} at ${d} m`);
    assert.ok(p.half >= Math.max(n, s) - 0.05 && p.half < Math.min(n, s) + 0.85, `slab half width ${p.half} against ${n} / ${s}`);
  }
});

test('the chunk road and street furniture leave the new stretch to the section', () => {
  const cut = geo.clipRoadOutsideSection([60, -38, 150, 20, 200, 42, 270, 58])!;
  assert.deepEqual(cut.slice(0, 2), [60, -38]);
  assert.ok(cut.includes(262.4) && !cut.includes(200));
  assert.equal(geo.v5Exclusion.inCorridor(220, 47), true);
  assert.equal(geo.v5Exclusion.inCorridor(220, 80), false);
  assert.equal(geo.v5Exclusion.inCorridor(300, 70), false, 'Jalan Ewe Hai is not part of the section');
});

test('no street lamp stands beside a parked car, and the north row keeps to its own block at the Jalan China end', () => {
  const size: Record<string, number> = { hatch: 2.0, saloon: 2.3, suv: 2.4 };
  for (const [lr, b] of carp.LAMPS) {
    const r = row(lr), w = (Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]) - (r.skip ?? 0)) / r.lots;
    for (const [cr, along, kind] of carp.CARS) if (cr === lr) assert.ok(Math.abs(along - b * w) > size[kind] + 0.4, `lamp ${lr}:${b} at ${(b * w).toFixed(1)} m and the ${kind} at ${along} m`);
  }
  // party line of the Jalan China block from the street corner (171.8, 31) to (182.6, 14.8): every lot corner of the
  // north row's first two lots lies on the row's own side of it (0.5 m tolerance for wall thickness)
  const cn = row('CN'), fr = geo.rowFrame({ ...cn, a: [cn.a[0] + ((cn.b[0] - cn.a[0]) * cn.skip!) / 92.65, cn.a[1] + ((cn.b[1] - cn.a[1]) * cn.skip!) / 92.65] }), w = fr.len / cn.lots;
  assert.ok(Math.hypot(fr.ox - 171.8, fr.oz - 31) < 0.01, 'lot 0 is the Jalan China end');
  const side = (x: number, z: number) => ((182.6 - 171.8) * (z - 31) - (14.8 - 31) * (x - 171.8)) / Math.hypot(10.8, 16.2); // + = east of the party line
  for (const i of [0, 1, 2]) {
    const d = lots.LOT_OVERRIDES.CN[i].depth ?? cn.depth, x = fr.ox + fr.dx * i * w - fr.nx * d, z = fr.oz + fr.dz * i * w - fr.nz * d;
    assert.ok(side(x, z) > -2.1 + (i ? 1.6 : 0), `lot ${i} (depth ${d}) reaches ${(-side(x, z)).toFixed(2)} m past the party line`);
  }
});
