import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FRONTS, PINS, lotOfNumber, pinPosition, planFront, stationOf, MB_LINE, lineLength } from '../../src/world/district/mainBazaar.ts';
import { lotItems, ITEM } from '../../src/world/district/frontLayout.ts';
import { ARCADE_DEPTH } from '../../src/world/arch/frontage.ts';
import { medianRuns } from '../../src/world/district/props.ts';

test('house numbers run consecutively across the Main Bazaar frontages', () => {
  const defs = Object.values(FRONTS).sort((a, b) => a.first! - b.first!);
  let next = 1;
  for (const d of defs) { assert.equal(d.first, next); next += d.n; }
  assert.equal(next - 1, 71);
});

test('every pinned business resolves to a lot on a known frontage', () => {
  for (const [id, pin] of Object.entries(PINS)) {
    const p = pinPosition(id);
    assert.ok(p, id);
    assert.ok(p!.t > 0 && p!.t < 1);
    assert.ok(lotOfNumber(pin.nos[0]));
  }
  assert.ok(Object.keys(PINS).length >= 10);
});

test('lot plans are deterministic and sized to the fitted lot count', () => {
  const a = planFront(233690737, 2, 104.6), b = planFront(233690737, 2, 104.6);
  assert.deepEqual(a, b);
  assert.equal(a.length, 22);
  assert.equal(a[11].no, 12);
  const w = 104.6 / a.length;
  assert.ok(w > 4.4 && w < 5.2, `lot width ${w}`);
  assert.ok(a.some((l) => l.storeys === 3) && a.some((l) => l.storeys === 2));
});

test('goods in a five-foot way always leave a walkable corridor', () => {
  for (const key of Object.keys(FRONTS)) {
    const [bid, edge] = key.split(':').map(Number);
    const lots = planFront(bid, edge, FRONTS[key].n * 4.8);
    lots.forEach((lot, u) => {
      const items = lotItems(lot, 4.8, u === 0, u === lots.length - 1);
      // At any position along the lot, the free depth between street-side and shop-side items is at least 0.9 m.
      for (let a = 0; a <= 4.8; a += 0.1) {
        let near = 0, far = ARCADE_DEPTH;
        for (const it of items) {
          if (a < it.a - it.ha || a > it.a + it.ha) continue;
          if (it.kind === ITEM.column || it.d < ARCADE_DEPTH / 2) near = Math.max(near, it.d + it.hd);
          else far = Math.min(far, it.d - it.hd);
        }
        assert.ok(far - near >= 0.9, `lot ${lot.no} at ${a.toFixed(1)}: ${(far - near).toFixed(2)} m`);
      }
    });
  }
});

test('the median exists along most of the street and stays between the carriageways', () => {
  const runs = medianRuns();
  const nodes = runs.flat();
  assert.ok(nodes.length * 2 > lineLength(MB_LINE) * 0.6);
  for (const m of nodes) {
    assert.ok(m.hw > 0.3 && m.hw <= 1.3);
    assert.ok(stationOf(m.x, m.z).d > 2.7);
  }
});
