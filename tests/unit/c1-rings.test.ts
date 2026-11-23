// C1a experiment (?c1=1): the Upper China rows are hand-copied ring vertices (Auditor AUDIT.md N1). After an OSM or
// footprint refresh they would silently drift from the V2 footprints and their collision walls, so this test fails
// instead: row ends, the added block ring and the buildings' frontage edges (a.f) must still match chunk 0_0.
// The flag is read once per process at import, so it is set before the imports.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
(globalThis as any).location = { search: '?c1=1' };
const geo = await import('../../src/v5/geo.ts');
const { CHUNK_SIZE, QUANT } = await import('../../src/world/config.ts');

const chunk = JSON.parse(readFileSync(new URL('../../public/data/kuching/chunks/0_0.json', import.meta.url), 'utf8'));
/** World ring of a building (decoded as CollisionWorld.addChunk does). */
const ring = (id: number): number[][] => {
  const b = chunk.buildings.find((q: any) => q.id === id);
  assert.ok(b, `building ${id} missing from chunk 0_0`);
  const r: number[] = b.r[0], out: number[][] = [];
  for (let i = 0; i < r.length; i += 2) out.push([chunk.cx * CHUNK_SIZE + r[i] / QUANT, chunk.cz * CHUNK_SIZE + r[i + 1] / QUANT]);
  return out;
};
const frontEdges = (id: number): number[] => chunk.buildings.find((q: any) => q.id === id).a.f;
/** Same point within tol metres on each axis. */
const near = (p: number[], q: number[], tol: number) => Math.abs(p[0] - q[0]) <= tol + 1e-9 && Math.abs(p[1] - q[1]) <= tol + 1e-9;
/** Index of the edge (i -> i + 1) whose ends are p and q, in either direction; -1 if p-q is not a ring edge. */
const edgeOf = (r: number[][], p: number[], q: number[], tol: number): number => {
  for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; if ((near(a, p, tol) && near(b, q, tol)) || (near(a, q, tol) && near(b, p, tol))) return i; }
  return -1;
};

test('C1a rows: UW/UE/UX ends are mapped frontage edges of the current chunk rings, and the added block is the 236495235 ring', () => {
  const S2B = 8000000000000001, UB = 236495235;
  // UE and UX copy the 236495235 vertices to the centimetre (1 cm). UW's ends are both the S2 block vertices rounded to
  // 0.1 m: its corner end is the V8.6 S2 row's b (148.2, 24.6) for (148.23, 24.64), and its far end (135.4, 44.4) for
  // (135.40, 44.35) sits exactly at the 5 cm per-axis tolerance, so on UW only drift beyond 5 cm per axis is caught.
  const expect: [string, number, number, number][] = [['UW', S2B, 2, 0.05], ['UE', UB, 1, 0.01], ['UX', UB, 0, 0.01]];
  const s2 = geo.ROWS.find((r: any) => r.id === 'S2'), uw = geo.ROWS.find((r: any) => r.id === 'UW');
  assert.deepEqual(uw?.a, s2?.b, 'UW must start at the S2 row corner that the S2#0 wrap turns round');
  for (const [id, bid, edge, tol] of expect) {
    const row = geo.ROWS.find((r: any) => r.id === id);
    assert.ok(row, `row ${id} missing with the flag on`);
    assert.equal(row.building, bid);
    const e = edgeOf(ring(bid), row.a, row.b, tol);
    assert.equal(e, edge, `${id} (${row.a} -> ${row.b}) is no longer edge ${edge} of building ${bid} within ${tol} m`);
    assert.ok(frontEdges(bid).includes(e), `${id}: edge ${e} is not a frontage edge (a.f) of ${bid}`);
  }
  // frontage edges and vertex counts as of 1e16c25: a refresh that changes them must revisit the C1a rows
  assert.deepEqual(frontEdges(S2B), [1, 2]);
  assert.deepEqual(frontEdges(UB), [0, 1]);
  assert.equal(ring(S2B).length, 7);
  assert.equal(ring(UB).length, 4);
  // the block pushed for 236495235 is its ring, vertex for vertex (1 cm)
  const blk = geo.BLOCKS[geo.BLOCKS.length - 1], r = ring(UB);
  assert.equal(blk.length, r.length * 2);
  r.forEach((p, i) => assert.ok(near(p, [blk[2 * i], blk[2 * i + 1]], 0.01), `BLOCKS ring vertex ${i} (${blk[2 * i]}, ${blk[2 * i + 1]}) vs chunk (${p})`));
  assert.ok(geo.V5_BUILDING_IDS.includes(UB));
});
