// UX1 prototype guide: wording per input type, flag parsing, car direction and the hint cooldown (node --test).
import test from 'node:test';
import assert from 'node:assert/strict';
import { HINT_COOLDOWN_MS, QuickGuide, carWhere, enterCarToast, guideFor, hintText, ux1Enabled } from '../../src/ui/QuickGuide.ts';
import type { GuideEnv, PlayState } from '../../src/ui/QuickGuide.ts';

test('flag is opt-in: only ?ux1=1 turns it on', () => {
  assert.equal(ux1Enabled(''), false);
  assert.equal(ux1Enabled('?ux1=0'), false);
  assert.equal(ux1Enabled('?ux=1'), false);
  assert.equal(ux1Enabled('?render=v4&ux1=1'), true);
});

test('touch guide has no keyboard wording; keyboard guide names the keys', () => {
  const touch = guideFor(true).join(' ');
  for (const bad of ['Press E', 'Shift', 'WASD', 'Esc', 'mouse']) assert.ok(!touch.includes(bad), bad);
  for (const ok of ['stick', 'RUN', 'Drive Car', 'Enter Car']) assert.ok(touch.includes(ok), ok);
  const kb = guideFor(false).join(' ');
  for (const ok of ['WASD', 'Shift', 'Space', 'M map', 'V camera', 'Esc', 'Drive Car', 'press E']) assert.ok(kb.includes(ok), ok);
  assert.equal(enterCarToast(false), 'Press E to enter car.');
  assert.equal(enterCarToast(true), 'Tap Enter Car to get in.');
  assert.ok(touch.includes('Drag the view') && !touch.includes('top right'));
  assert.ok(touch.includes('tap Pause > Drive Car to stand beside it, then tap Enter Car.'));
});

test('car direction and distance: +z is south, +x is east', () => {
  assert.equal(carWhere(21, 115), 'about 120 m to the south');
  assert.equal(carWhere(100, 0), 'about 100 m to the east');
  assert.equal(carWhere(0, -50), 'about 50 m to the north');
  assert.match(hintText('noCar', { dx: 21, dz: 115 }), /The car is about 120 m to the south: Esc/);
  assert.match(hintText('noCar', { dx: 3, dz: 10 }), /right up to the car/);
  assert.equal(hintText('noCar', null), 'Nothing to use here. Esc > Drive Car takes you to the car.');
});

test('no-car text: keyboard says Esc, touch says Pause, in both the car and no-car cases', () => {
  const far = { dx: 21, dz: 115 };
  for (const car of [far, null]) {
    assert.match(hintText('noCar', car, false), /Esc > Drive Car/);
    const t = hintText('noCar', car, true);
    assert.match(t, /Pause > Drive Car/);
    assert.ok(!/Esc|Press|key/.test(t), t);
  }
});

const guide = (state: PlayState, over: Partial<GuideEnv> = {}) => {
  (globalThis as any).window = { addEventListener() {} };
  const shown: string[] = [];
  return { shown, g: new QuickGuide({ touch: false, toast: (t) => shown.push(t), state: () => state, car: () => null, admin: () => false, ...over }) };
};

test('P hint only over the open map, never in OP (fly) mode or on foot', () => {
  assert.equal(guide('map').g.hint('op', 1000), true);
  for (const s of ['fly', 'foot', 'drive', 'off'] as const) assert.equal(guide(s).g.hint('op', 1000), false, s);
});

test('E hint is suppressed in admin mode, and only on foot; G and R only on foot', () => {
  assert.equal(guide('foot', { admin: () => true }).g.hint('noCar', 1000), false);
  assert.equal(guide('foot').g.hint('noCar', 1000), true);
  for (const s of ['fly', 'map', 'drive', 'off'] as const) assert.equal(guide(s).g.hint('noCar', 1000), false, s);
  for (const k of ['gps', 'reset'] as const) { assert.equal(guide('foot').g.hint(k, 1000), true); assert.equal(guide('drive').g.hint(k, 1000), false); }
});

test('hints repeat no more than once per cooldown', () => {
  (globalThis as any).window = { addEventListener() {} };
  const shown: string[] = [];
  const g = new QuickGuide({ touch: false, toast: (t) => shown.push(t), state: () => 'foot', car: () => null, admin: () => false });
  assert.equal(g.hint('gps', 1000), true);
  assert.equal(g.hint('gps', 1000 + HINT_COOLDOWN_MS - 1), false);
  assert.equal(g.hint('reset', 1500), true, 'kinds are independent');
  assert.equal(g.hint('gps', 1000 + HINT_COOLDOWN_MS), true);
  assert.equal(shown.length, 3);
});
