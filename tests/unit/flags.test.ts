// Flag registry truth table (node --test): precedence of ?lab=1 versus explicit ?v9= / ?ux1=, and that the
// existing v9Enabled / ux1Enabled entry points follow it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { getFlags, parseFlags, resetFlags } from '../../src/flags.ts';
import { setV9, v9Enabled } from '../../src/world/district/v9flag.ts';
import { ux1Enabled } from '../../src/ui/QuickGuide.ts';

const TABLE: [string, boolean, boolean, boolean][] = [
  // search,               v9,    ux1,   lab
  ['',                     false, false, false],
  ['?',                    false, false, false],
  ['?v9=1',                true,  false, false],
  ['?ux1=1',               false, true,  false],
  ['?v9=1&ux1=1',          true,  true,  false],
  ['?lab=1',               true,  true,  true],
  ['?lab=1&v9=0',          false, true,  true],
  ['?lab=1&ux1=0',         true,  false, true],
  ['?lab=1&v9=0&ux1=0',    false, false, true],
  ['?v9=0&lab=1',          false, true,  true],
  ['?lab=0',               false, false, false],
  ['?lab=0&v9=1',          true,  false, false],
  ['?lab=true',            false, false, false],
  ['?lab=1&v9=true',       false, true,  true],
  ['?lab=1&v9=',           false, true,  true],
  ['?v9=0',                false, false, false],
  ['?v9=true',             false, false, false],
  ['?v90=1',               false, false, false],
  ['?render=v4&lab=1',     true,  true,  true],
  ['?x=2&v9=1',            true,  false, false],
];

test('truth table: parseFlags', () => {
  for (const [search, v9, ux1, lab] of TABLE) {
    assert.deepEqual({ ...parseFlags(search) }, { v9, ux1, lab }, search || '(empty)');
  }
});

test('?lab=1 turns on v9 and ux1 only: no other key appears', () => {
  assert.deepEqual(Object.keys(parseFlags('?lab=1')).sort(), ['lab', 'ux1', 'v9']);
  assert.deepEqual(Object.keys(parseFlags('?lab=1&c1=1&char=1')).sort(), ['lab', 'ux1', 'v9']);
});

test('the result is frozen', () => {
  assert.ok(Object.isFrozen(parseFlags('?lab=1')));
  const g = globalThis as { location?: unknown };
  const had = g.location;
  g.location = { search: '?lab=1' };
  resetFlags();
  assert.ok(Object.isFrozen(getFlags()));
  resetFlags();
  if (had === undefined) delete g.location; else g.location = had;
});

test('getFlags reads location.search once and caches; no location means all off', () => {
  const g = globalThis as { location?: { search: string } };
  const had = g.location;
  delete g.location;
  resetFlags();
  assert.deepEqual({ ...getFlags() }, { v9: false, ux1: false, lab: false });
  g.location = { search: '?lab=1' };
  assert.equal(getFlags().v9, false, 'cached until reset');
  resetFlags();
  assert.equal(getFlags().v9, true);
  g.location = { search: '?lab=1&v9=0' };
  assert.equal(getFlags().v9, true, 'cached');
  resetFlags();
  assert.deepEqual({ ...getFlags() }, { v9: false, ux1: true, lab: true });
  resetFlags();
  if (had === undefined) delete g.location; else g.location = had;
});

test('v9Enabled and ux1Enabled follow the registry', () => {
  const g = globalThis as { location?: { search: string } };
  const had = g.location;
  for (const [search, v9, ux1] of TABLE) {
    g.location = { search };
    setV9(null);
    assert.equal(v9Enabled(), v9, `v9Enabled ${search || '(empty)'}`);
    assert.equal(ux1Enabled(search), ux1, `ux1Enabled ${search || '(empty)'}`);
  }
  setV9(null);
  if (had === undefined) delete g.location; else g.location = had;
});
