// Flag registry truth table (node --test). N1-M1: v9, ux1, c1 and char are on by default in a browser; ?name=0 turns one off.
import test from 'node:test';
import assert from 'node:assert/strict';
import { getFlags, parseFlags, resetFlags } from '../../src/flags.ts';
import { setV9, v9Enabled } from '../../src/world/district/v9flag.ts';
import { ux1Enabled } from '../../src/ui/QuickGuide.ts';
import { charEnabled } from '../../src/player/character/CharacterProfile.ts';

const TABLE: [string, boolean, boolean, boolean, boolean][] = [
  // search,               v9,    ux1,   c1,    char
  ['',                     true,  true,  true,  true],
  ['?',                    true,  true,  true,  true],
  ['?v9=0',                false, true,  true,  true],
  ['?ux1=0',               true,  false, true,  true],
  ['?c1=0',                true,  true,  false, true],
  ['?char=0',              true,  true,  true,  false],
  ['?v9=0&ux1=0&c1=0&char=0', false, false, false, false],
  ['?v9=1&ux1=1',          true,  true,  true,  true],
  ['?v9=true',             true,  true,  true,  true],
  ['?v9=',                 true,  true,  true,  true],
  ['?char',                true,  true,  true,  true],
  ['?char=man',            true,  true,  true,  true],
  ['?lab=1&v9=0',          false, true,  true,  true],
  ['?v90=0',               true,  true,  true,  true],
  ['?render=v4&c1=0',      true,  true,  false, true],
];

test('truth table: parseFlags (default on)', () => {
  for (const [search, v9, ux1, c1, char] of TABLE) {
    const f = parseFlags(search);
    assert.deepEqual({ v9: f.v9, ux1: f.ux1, c1: f.c1, char: f.char }, { v9, ux1, c1, char }, search || '(empty)');
  }
});

test('parseFlags with defaultOn=false (no location): everything off unless a value is given', () => {
  const f = parseFlags('', false);
  assert.deepEqual({ v9: f.v9, ux1: f.ux1, c1: f.c1, char: f.char }, { v9: false, ux1: false, c1: false, char: false });
  assert.equal(parseFlags('?v9=1', false).v9, true);
});

test('the result is frozen; getFlags reads location once; no location means all off', () => {
  assert.ok(Object.isFrozen(parseFlags('')));
  const g = globalThis as { location?: { search: string } };
  const had = g.location;
  delete g.location;
  resetFlags();
  assert.deepEqual({ ...getFlags() }, { v9: false, ux1: false, c1: false, char: false, m5: false, life: false, lab: false });
  g.location = { search: '' };
  assert.equal(getFlags().v9, false, 'cached until reset');
  resetFlags();
  assert.equal(getFlags().v9, true);
  g.location = { search: '?v9=0' };
  assert.equal(getFlags().v9, true, 'cached');
  resetFlags();
  assert.equal(getFlags().v9, false);
  resetFlags();
  if (had === undefined) delete g.location; else g.location = had;
});

test('v9Enabled, ux1Enabled and charEnabled follow the registry', () => {
  const g = globalThis as { location?: { search: string } };
  const had = g.location;
  for (const [search, v9, ux1, , char] of TABLE) {
    g.location = { search };
    setV9(null);
    assert.equal(v9Enabled(), v9, `v9Enabled ${search || '(empty)'}`);
    assert.equal(ux1Enabled(search), ux1, `ux1Enabled ${search || '(empty)'}`);
    assert.equal(charEnabled(search), char, `charEnabled ${search || '(empty)'}`);
  }
  setV9(null);
  if (had === undefined) delete g.location; else g.location = had;
});
