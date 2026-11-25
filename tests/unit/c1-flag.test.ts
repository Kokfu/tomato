// C1a experiment (Upper China Street corner, ?c1=1): budget, draw calls, flag-off identity of the tables, sign rule output,
// row facing and the lot-design conditions (node --test). The flag is read once per process, so the real flag-on and
// flag-off builds are measured in two child processes (tests/unit/c1/measure.ts, the C1a gate 2 Node method).
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { c1Enabled } from '../../src/v5/c1flag.ts';
import { ROWS, BLOCKS, V5_BUILDING_IDS } from '../../src/v5/geo.ts';
import { LOT_OVERRIDES } from '../../src/v5/lots.ts';
import { ARCADE, PIER } from '../../src/v5/shophouse.ts';

const measure = (flag: 'on' | 'off') => {
  const out = execFileSync(process.execPath, ['--experimental-transform-types', '--no-warnings', 'tests/unit/c1/measure.ts', flag], { encoding: 'utf8', maxBuffer: 64 << 20 });
  const line = out.split('\n').find((l) => l.startsWith('C1MEASURE '));
  assert.ok(line, 'measure helper printed no result');
  return JSON.parse(line.slice('C1MEASURE '.length));
};
const OFF = measure('off'), ON = measure('on');
const C1_IDS = ['UW#0', 'UW#1', 'UE#0', 'UE#1', 'UE#2', 'UE#3', 'UX#0', 'UX#1', 'UX#2'];
const lot = (r: any, id: string) => r.lots.find((l: any) => l.id === id);

// ---- flag off: nothing of C1a exists ----
test('flag off: c1 switch is off and the V8.6 tables are untouched', () => {
  assert.equal(c1Enabled(), false);
  assert.deepEqual(ROWS.map((r) => r.id).filter((id) => /^U[WEX]$/.test(id)), []);
  assert.equal(ROWS.find((r) => r.id === 'S2')!.depth, 21);
  assert.ok(!V5_BUILDING_IDS.includes(236495235));
  assert.ok(!BLOCKS.some((b) => b[0] === 178.98 && b[1] === 41.09), 'block 236495235 must not be a V5 block');
  assert.ok(!('UW' in LOT_OVERRIDES) && !('UE' in LOT_OVERRIDES) && !('UX' in LOT_OVERRIDES));
  assert.ok(LOT_OVERRIDES.S2.every((o) => !('wrap' in o) && !('sideArch' in o)));
  assert.equal(OFF.c1Enabled, false);
  assert.equal(ON.c1Enabled, true);
});

// ---- budget (owner gate 1, C11) ----
test('budget: chunk 0_0 grows by at most +16,487 tris (< 12 % of the 137,397 V8.6 baseline)', () => {
  const off = OFF.perChunk['0_0'].total, on = ON.perChunk['0_0'].total;
  // N1-M2 added inferred trees and the river-bank ribbon to every chunk: 137,397 (V8.6) + 10,636 here. The C1a budget
  // below is still measured against the V8.6 figure.
  // N1-M3 typed buildings (storey quads, roof forms, canopies, roof tanks) add 545 more.
  // N1-M4 street edges (kerbs, drains with slab covers, lane and stop lines, more furniture) add 2,922.
  assert.equal(off, 137397 + 10636 + 545 + 2922, 'flag-off chunk 0_0 baseline moved');
  assert.ok(on - off <= 16487, `delta ${on - off}`);
  assert.ok(on - off < 0.12 * 137397);
  assert.deepEqual(ON.perChunk['0_-1'], OFF.perChunk['0_-1'], 'chunk 0_-1 must not change');
});
test('budget: each corner wrap is at most 1,300 tris (gross and net)', () => {
  assert.deepEqual(ON.wraps.map((w: any) => w.lot).sort(), ['S2#0', 'UE#0']);
  for (const w of ON.wraps) { assert.ok(w.gross <= 1300, `${w.lot} gross ${w.gross}`); assert.ok(w.net <= 1300, `${w.lot} net ${w.net}`); }
});

// ---- draw calls and materials (owner gate 2, C8) ----
test('draw calls: the V5 group and chunk 0_0 make the same calls flag on and off; no new material', () => {
  assert.equal(ON.v5.calls, OFF.v5.calls);
  assert.deepEqual(ON.v5.mats, OFF.v5.mats);
  for (const k of ['0_0', '0_-1']) { assert.equal(ON.perChunk[k].callsHigh, OFF.perChunk[k].callsHigh); assert.equal(ON.perChunk[k].callsLow, OFF.perChunk[k].callsLow); }
});

// ---- Pinggai: RULE OUTPUT, not a verified lot (C9) ----
test('Pinggai Cafe sign, rule output (rowFrame + lotSpecs, no special case): UW row (Upper China face), lot 0; NOT a verified lot', () => {
  // The mapped point (osm:node/5803666354, about +-3 m) put through the existing rule. Pinned as a regression of the rule's
  // output only: which UW lot No. 37 really is was not verified, and the 4.4 m gap is unresolved.
  assert.ok(ON.v5.signs.includes('UW#0: Pinggai Cafe'), ON.v5.signs.join(', '));
  assert.ok(!ON.v5.signs.some((s: string) => s.startsWith('S2#') && s.endsWith('Pinggai Cafe')), 'old board must leave the Carpenter face');
  assert.ok(OFF.v5.signs.includes('S2#0: Pinggai Cafe'), 'flag off keeps V8.6 placement');
  assert.ok(ON.v5.signs.includes('UE#3: Indah House Kuching'));
  const fresh = ON.v5.signs.filter((s: string) => /^U[WEX]#/.test(s));
  assert.ok(fresh.length <= 3, fresh.join(', '));
  // every board is a mapped name, and every board of the other rows is unchanged
  assert.deepEqual(ON.v5.signs.filter((s: string) => !/^U[WEX]#/.test(s) && !s.endsWith('Pinggai Cafe')), OFF.v5.signs.filter((s: string) => !s.endsWith('Pinggai Cafe')));
});

// ---- row facing against RowDef.face ----
test('row facing: UW, UE and UX frames face RowDef.face, out of their block (guards the distToStreet probe flip)', () => {
  const cen = (ring: number[]) => { let x = 0, z = 0; const n = ring.length / 2; for (let i = 0; i < n; i++) { x += ring[2 * i] / n; z += ring[2 * i + 1] / n; } return [x, z]; };
  const owner: Record<string, number[]> = { UW: BLOCKS[1], UE: [178.98, 41.09, 156.89, 27.74, 145.81, 43.6, 170.02, 58.73], UX: [178.98, 41.09, 156.89, 27.74, 145.81, 43.6, 170.02, 58.73] };
  for (const id of ['UW', 'UE', 'UX']) {
    const r = ON.rows.find((q: any) => q.id === id), f = r.frame;
    assert.ok(r.face, `${id} has no RowDef.face`);
    assert.ok(f.nx * r.face[0] + f.nz * r.face[1] > 0.9, `${id} normal against face`);
    const [cx, cz] = cen(owner[id]), mx = f.ox + f.nz * f.len / 2, mz = f.oz - f.nx * f.len / 2; // mid-frontage (d = (nz, -nx))
    assert.ok((mx - cx) * f.nx + (mz - cz) * f.nz > 0, `${id} normal points into its block`);
  }
});

// ---- corner wraps meet their neighbours ----
test('corner wraps: rise matches the neighbour floor (5 mm), piers at most 4.2 m apart', () => {
  for (const w of ON.wraps) {
    assert.ok(Math.abs(w.neighbourBaseMinusLotBase - w.wrap.rise) <= 0.005, `${w.lot} rise ${w.wrap.rise} vs ${w.neighbourBaseMinusLotBase}`);
    const L = w.wrap.len, bays = Math.ceil((L - PIER / 2) / 4.0);
    assert.ok((L - PIER / 2) / bays <= 4.2 && (L - PIER / 2) / bays > ARCADE);
  }
});

// ---- lot design (C4, C5, C6, C10) ----
test('lot design: plants only removed on the nine lots; varied neighbours, windows, shopfronts and roofs', () => {
  for (const id of C1_IDS) assert.equal(lot(ON, id).plants, 0, id);
  for (const id of ['S2#0', 'S2#1', 'S2#2', 'S2#3']) assert.equal(lot(ON, id).plants, lot(OFF, id).plants, id);
  const faces = [['UW#0', 'UW#1', 'S2#0'], ['UX#0', 'UX#1', 'UX#2', 'UE#0', 'UE#1', 'UE#2', 'UE#3']]; // neighbours in order, round the corners
  for (const f of faces) for (let i = 1; i < f.length; i++) {
    const a = lot(ON, f[i - 1]), b = lot(ON, f[i]);
    assert.ok(a.wall.join() !== b.wall.join() || a.shop !== b.shop, `${a.id}/${b.id} share wall colour and shopfront`);
  }
  for (const row of ['UW', 'UE', 'UX']) {
    const ls = ON.lots.filter((l: any) => l.id.startsWith(row + '#'));
    assert.ok(new Set(ls.map((l: any) => l.shop)).size >= 2, row + ' shopfronts');
    assert.ok(new Set(ls.map((l: any) => l.win)).size >= 2, row + ' windows');
  }
  const nine = C1_IDS.map((id) => lot(ON, id));
  assert.ok(nine.filter((l) => l.win === 'louvre' || l.win === 'arched').length >= 5);
  assert.deepEqual([...new Set(nine.map((l) => l.roof))].sort(), ['tile', 'zinc']);
});
