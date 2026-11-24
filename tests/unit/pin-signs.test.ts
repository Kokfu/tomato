// Main Bazaar district pins and storefront signs (owner rule, docs/SHOP_IDENTITY.md):
// verified places (OSM v = 1, owner v = 2) may carry a sign, unverified Overture places (v = 0)
// never do. A pin relocates a place to its numbered lot; it must not grant a sign.
//
// src/world/places/PlaceIndex.ts imports the render stack (HeritageRow.ts uses TypeScript parameter
// properties), which node's default strip-only mode cannot load. `npm test` runs this file in that
// mode, so the file re-runs itself in a child node with --experimental-transform-types
// (PIN_SIGNS_INNER=1) and reports the child's result as one test. The pure data tests run in the outer process.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PINS, PIN_DUPLICATES, pinPosition } from '../../src/world/district/mainBazaar.ts';

const SELF = fileURLToPath(import.meta.url);
// Resolved from this file, not the cwd.
const PLACES = fileURLToPath(new URL('../../public/data/kuching/places/', import.meta.url));
const INNER = process.env.PIN_SIGNS_INNER === '1';

const ids = Object.keys(PINS);
const overtureIds = ids.filter((i) => i.startsWith('overture:'));
const osmIds = ids.filter((i) => i.startsWith('osm:'));
const NO42 = 'osm:node/12778741079';
const NO42_OVERTURE = 'overture:faa64913-6eea-40f5-9cac-feb9416ee61a';

test('pins hold four OSM and seven Overture businesses; every pin resolves to a lot', () => {
  assert.equal(osmIds.length, 4);
  assert.equal(overtureIds.length, 7);
  for (const id of ids) assert.ok(pinPosition(id), id);
});

test('No. 42 is pinned to the verified OSM record; its Overture duplicate is hidden, not pinned', () => {
  assert.deepEqual(PINS[NO42].nos, [42]);
  assert.equal(PINS[NO42].sign, undefined, 'the OSM record supplies its own name');
  assert.ok(PIN_DUPLICATES.has(NO42_OVERTURE));
  assert.equal(PINS[NO42_OVERTURE], undefined);
  for (const id of PIN_DUPLICATES) assert.equal(PINS[id], undefined, id);
});

if (!INNER) {
  test('pin signs behaviour (child node with --experimental-transform-types)', { timeout: 120000 }, () => {
    // The parent test runner marks its children with NODE_TEST_CONTEXT, which would make a nested run report to it instead of failing here: clear it.
    const env: Record<string, string | undefined> = { ...process.env, PIN_SIGNS_INNER: '1' };
    delete env.NODE_TEST_CONTEXT;
    const r = spawnSync(process.execPath, ['--experimental-transform-types', '--no-warnings', SELF], { env, encoding: 'utf8', timeout: 110000, cwd: fileURLToPath(new URL('../..', import.meta.url)) });
    assert.equal(r.error, undefined, `child failed to run: ${r.error}`);
    assert.equal(r.signal, null, `child killed by ${r.signal} (timeout 110 s?)`);
    assert.match(r.stdout, /pass [1-9]/, 'the child ran its tests');
    assert.match(r.stdout, /fail 0/);
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  });
} else {
  const { applyPin, PlaceIndex } = await import('../../src/world/places/PlaceIndex.ts');
  type P = Record<string, any>;

  const real = new Map<string, P>();
  for (const f of ['0_-1', '1_0']) for (const p of JSON.parse(readFileSync(`${PLACES}${f}.json`, 'utf8')).places as P[]) real.set(p.id, p);
  const rec = (id: string): P => { const p = real.get(id); assert.ok(p, `${id} exists in the place data`); return p; };

  /** The original applyPin (V8.6): forced sign for every pin, duplicates hidden regardless of trust. */
  const oldApplyPin = (p: P): P => {
    if (PIN_DUPLICATES.has(p.id)) return { ...p, sign: false };
    const a = pinPosition(p.id);
    if (!a) return p;
    return { ...p, b: a.b, e: a.e, t: a.t, how: p.how ?? 'adjacent', sign: true, pin: { no: a.no, span: a.span, evidence: a.pin.evidence, sign: a.pin.sign } };
  };

  const located = (p: P, id: string) => {
    const a = pinPosition(id)!;
    assert.equal(p.b, a.b, id); assert.equal(p.e, a.e, id); assert.equal(p.t, a.t, id);
    assert.equal(p.pin?.no, a.no, id);
  };

  /** Checks on a function mapping a stored place to what the world sees. */
  const checkRule = (apply: (p: P) => P) => {
    for (const id of overtureIds) {
      const q = apply(rec(id));
      assert.equal(q.v, 0, id);
      assert.equal(q.sign, false, `${id}: unverified Overture pin must not sign`);
      located(q, id); // relocated, pinned and so still inspectable
    }
    for (const id of osmIds) {
      const q = apply(rec(id));
      assert.equal(q.sign, true, id);
      located(q, id);
    }
    assert.equal(apply(rec('osm:node/12074799663')).pin?.sign, 'The Ranee');
    assert.equal(apply(rec(NO42)).name, 'JD Massage Centre');
    assert.equal(apply(rec(NO42)).pin?.no, 42);
    // The duplicate stays hidden, and unpinned.
    const d = apply(rec(NO42_OVERTURE));
    assert.equal(d.sign, false);
    assert.equal(d.pin, undefined);
  };

  /** A PlaceIndex over the real chunk files without the browser-only constructor. */
  const index = (edits: { upsert: P[]; remove: string[] } = { upsert: [], remove: [] }, patch: (p: P) => P = (p) => p) => {
    const ix: any = Object.create(PlaceIndex.prototype);
    ix.edits = edits;
    ix.byChunk = new Map(['0_-1', '1_0'].map((k) => [k, (JSON.parse(readFileSync(`${PLACES}${k}.json`, 'utf8')).places as P[]).map(patch)]));
    return ix;
  };
  const world = (ix: any) => new Map<string, P>([...ix.inChunk('0_-1'), ...ix.inChunk('1_0')].map((p: P) => [p.id, p]));

  test('applyPin: Overture pins relocate with sign false; OSM pins keep signs and display names', () => {
    checkRule(applyPin as any);
  });

  test('PlaceIndex.inChunk gives the same result through the public API', () => {
    const w = world(index());
    checkRule((p) => w.get(p.id)!);
  });

  test('the assertions bite: they fail against the original applyPin', () => {
    assert.throws(() => checkRule(oldApplyPin), /unverified Overture pin must not sign/);
    // ...and the original hid an owner-promoted duplicate.
    assert.equal(oldApplyPin({ ...rec(NO42_OVERTURE), v: 2 }).sign, false);
    assert.notEqual((applyPin as any)({ ...rec(NO42_OVERTURE), v: 2 }).sign, false);
  });

  test('owner-promoted (v = 2) pinned Overture record gets a sign and keeps its lot', () => {
    for (const id of overtureIds) {
      const q = (applyPin as any)({ ...rec(id), v: 2, src: 'manual' });
      assert.equal(q.sign, true, id);
      located(q, id);
    }
    // The display alias is for source names: an owner-verified record shows its own name.
    assert.equal((applyPin as any)({ ...rec('overture:c4bc392d-d810-4573-af4a-f159cde293f6'), v: 2 }).pin.sign, undefined);
  });

  // ---- displayed text through the real buildChunkLabels --------------------------------------------
  const shown: string[] = [];
  const g2d = { measureText: (t: string) => ({ width: t.length * 20 }), fillRect() {}, strokeRect() {}, fillText: (t: string) => { shown.push(t); } };
  (globalThis as any).document = { createElement: () => ({ width: 0, height: 0, getContext: () => g2d }) };
  const { buildChunkLabels } = await import('../../src/world/places/PlaceIndex.ts');
  const labelTexts = (ix: any, key: string): string[] => {
    const data = JSON.parse(readFileSync(fileURLToPath(new URL(`../../public/data/kuching/chunks/${key}.json`, import.meta.url)), 'utf8'));
    const ctx: any = { places: ix, height: { sample: () => 2 }, landmarks: { replacesBuilding: () => false }, detail: 'high', mats: new Proxy({}, { get: (_t, k) => ({ name: String(k) }) }) };
    shown.length = 0;
    buildChunkLabels(data, ctx);
    return [...shown];
  };

  test('buildChunkLabels: unedited OSM alias "The Ranee" is drawn; unverified Overture pins draw nothing', () => {
    const t = labelTexts(index(), '0_-1');
    assert.ok(t.includes('The Ranee'), t.join('|'));
    assert.ok(!t.includes('The Ranee Boutique Suites'));
    for (const n of ['Johns Gallery', 'Kelvin Gallery', '328 Gallery']) assert.ok(!t.includes(n), n);
    const t1 = labelTexts(index(), '1_0');
    assert.ok(t1.includes('JD Massage Centre'), t1.join('|'));
    for (const n of ['Guan Ho Leong Optical', 'Borneo Adventure', 'Little Borneo', 'J.D Massage Centre']) assert.ok(!t1.includes(n), n);
  });

  test('buildChunkLabels: a published v = 2 pinned record draws its own name, not the old pin alias', () => {
    const id = 'overture:c4bc392d-d810-4573-af4a-f159cde293f6'; // No. 66, alias "Little Borneo"
    const t = labelTexts(index({ upsert: [], remove: [] }, (p) => (p.id === id ? { ...p, name: 'Owner Name', src: 'manual', v: 2 } : p)), '1_0');
    assert.ok(t.includes('Owner Name'), t.join('|'));
    assert.ok(!t.includes('Little Borneo'), 'old alias must not be drawn');
  });

  test('local editor edits behave exactly as in V8.6: inChunk returns { ...raw, ...edit, v: 2 }', () => {
    for (const id of overtureIds) {
      const raw = rec(id);
      for (const edit of [{ id, name: 'Owner Name', cat: 'shop' }, { id, name: 'Owner Name', cat: 'shop', lat: raw.lat + 0.0001, lon: raw.lon }]) {
        const q: any = world(index({ upsert: [edit], remove: [] })).get(id)!;
        assert.equal(q.pin, undefined, 'no pin relocation');
        assert.equal(q.sign, undefined, 'no sign appears: the shipped Overture record has none');
        assert.deepEqual(q, { ...raw, ...edit, v: 2 }, id);
      }
    }
  });
}
