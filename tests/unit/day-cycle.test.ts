import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAY_HOUR, EVENING_HOUR, NIGHT_HOUR, SECONDS_PER_HOUR, Showers, TIME_HOURS, advanceHour, lightAt, phaseAt, startModes, stepWeather, withWeather, wrapHour,
} from '../../src/world/dayCycle.ts';
import type { Phase } from '../../src/world/dayCycle.ts';

const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;
const flat = (p: Phase) => [...p.sunTint, p.sunI, ...p.skyTint, p.skyI, ...p.horizon, ...p.zenith, ...p.cloud, p.exposure, p.night, p.stars, p.env, p.cover, p.haze];

test('phaseAt: the frozen Day setting is the untouched daylight (every factor exactly 1, no night)', () => {
  const p = phaseAt(DAY_HOUR);
  for (const v of [...p.sunTint, p.sunI, ...p.skyTint, p.skyI, ...p.horizon, ...p.zenith, ...p.cloud, p.exposure, p.env, p.haze]) assert.equal(v, 1);
  assert.equal(p.night, 0);
  assert.equal(p.stars, 0);
  assert.equal(p.cover, 0);
  // and it stays so through the working day
  for (const h of [8.6, 11, 13.5, 15.9]) assert.deepEqual(flat(phaseAt(h)), flat(p));
});

test('phaseAt: night is dark with lamps and stars; dusk and dawn pass through it continuously', () => {
  for (const h of [0, 2.5, NIGHT_HOUR, 23.99]) {
    const p = phaseAt(h);
    assert.equal(p.night, 1);
    assert.equal(p.stars, 1);
    assert.ok(p.sunI < 0.1 && p.skyI < 0.4 && p.exposure > 1.3);
    assert.ok(p.zenith.every((v) => v < 0.1));
  }
  // no jump anywhere in the day, the midnight wrap included: a step of 36 game seconds moves no value by more than 0.08
  let prev = flat(phaseAt(0));
  for (let h = 0.01; h <= 24.0001; h += 0.01) {
    const cur = flat(phaseAt(h));
    cur.forEach((v, i) => assert.ok(Math.abs(v - prev[i]) < 0.08, `value ${i} jumps at ${h.toFixed(2)}`));
    prev = cur;
  }
  assert.deepEqual(flat(phaseAt(24)), flat(phaseAt(0)));
  assert.deepEqual(flat(phaseAt(-3)), flat(phaseAt(21)));
});

test('phaseAt: lamps come on through sunset and are fully lit before the sky is dark', () => {
  assert.equal(phaseAt(17).night, 0);
  const evening = phaseAt(EVENING_HOUR), dusk = phaseAt(18.2);
  assert.ok(evening.night > 0.1 && evening.night < 0.7, 'lamps coming on in the evening setting');
  assert.ok(evening.sunI > 0.4 && evening.horizon[0] > evening.horizon[2] * 2, 'a low warm sun');
  assert.ok(dusk.night > 0.9 && dusk.horizon[0] > 0.3, 'lit, with an afterglow');
  assert.ok(phaseAt(6.5).night === 0 && phaseAt(5.5).night === 1);
});

test('lightAt: the sun by day, a moon by night, and the light is dark whenever they change over', () => {
  const noon = lightAt(12);
  assert.equal(noon.moon, false);
  assert.ok(noon.light[1] > 0.98);
  assert.equal(lightAt(DAY_HOUR).moon, false);
  assert.equal(lightAt(NIGHT_HOUR).moon, true);
  assert.ok(lightAt(NIGHT_HOUR).sun[1] < -0.5, 'the true sun is far below the horizon');
  let changes = 0, was = lightAt(0).moon;
  for (let h = 0; h <= 24; h += 0.002) {
    const at = lightAt(h);
    assert.ok(near(Math.hypot(...at.light), 1, 1e-6), 'unit vector');
    assert.ok(at.light[1] >= 0.2099, `the light stays above the horizon at ${h.toFixed(2)}`);
    if (at.moon !== was) {
      changes++;
      assert.ok(phaseAt(h).sunI < 1e-9 && phaseAt(h - 0.002).sunI < 1e-9, `the light is dark at the change-over (${h.toFixed(3)})`);
      was = at.moon;
    }
  }
  assert.equal(changes, 2);
  // a low evening sun is in the west, and its light is lifted to 12 degrees but keeps its bearing
  const eve = lightAt(17.8);
  assert.ok(eve.sun[0] < -0.9 && eve.sun[1] < 0.1);
  assert.ok(eve.light[0] < -0.9 && near(eve.light[1], 0.21));
});

test('advanceHour: a day of play takes 13 min 25 s (daylight 9 min 45 s, night 3 min 40 s) and wraps', () => {
  assert.equal(SECONDS_PER_HOUR.day * 13 + SECONDS_PER_HOUR.night * 11, 805);
  let h = DAY_HOUR, t = 0;
  // from the starting hour to full night
  while (phaseAt(h).night < 1 && t < 2000) { h = advanceHour(h, 0.5); t += 0.5; }
  assert.ok(t > 380 && t < 420, `night falls ${t} s after starting`);
  // a whole day later it is the same hour again
  h = DAY_HOUR;
  for (let i = 0; i < 805 * 20; i++) h = advanceHour(h, 0.05);
  assert.ok(Math.abs(h - DAY_HOUR) < 0.05, `back at the start hour: ${h}`);
  assert.ok(near(advanceHour(23.99, 1), 0.04, 1e-9));
  assert.equal(wrapHour(-1), 23);
  assert.equal(wrapHour(24), 0);
});

test('withWeather: rain closes the sky, dims the sun, thickens the haze and brings the lamps on', () => {
  const dry = phaseAt(13), wet = withWeather(dry, 1);
  assert.equal(withWeather(dry, 0), dry);
  assert.equal(wet.cover, 1);
  assert.ok(wet.sunI < 0.25 && wet.skyI > 0.7 && wet.haze > 3);
  assert.equal(wet.night, 0.5);
  assert.equal(withWeather(phaseAt(22), 1).night, 1);
  assert.equal(withWeather(phaseAt(22), 1).stars, 0);
  const half = withWeather(dry, 0.5);
  assert.ok(half.sunI > wet.sunI && half.sunI < dry.sunI && half.cover === 0.5);
  assert.equal(withWeather(dry, 7).cover, 1);
});

test('stepWeather: a shower builds, soaks the ground, stops, and the ground dries more slowly', () => {
  const w = { rain: 0, wet: 0 };
  for (let i = 0; i < 100; i++) stepWeather(w, 1, 0.1);
  assert.ok(near(w.rain, 10 / 15, 1e-6) && near(w.wet, 0.5, 1e-6));
  for (let i = 0; i < 200; i++) stepWeather(w, 1, 0.1);
  assert.equal(w.rain, 1);
  assert.equal(w.wet, 1);
  for (let i = 0; i < 300; i++) stepWeather(w, 0, 0.1);
  assert.equal(w.rain, 0);
  assert.ok(w.wet > 0.75 && w.wet < 0.85, 'still wet half a minute after the rain');
  for (let i = 0; i < 1500; i++) stepWeather(w, 0, 0.1);
  assert.equal(w.wet, 0);
  // wetness never runs ahead of what has fallen
  const v = { rain: 0, wet: 0 };
  for (let i = 0; i < 50; i++) { stepWeather(v, 0.3, 0.1); assert.ok(v.wet <= v.rain + 1e-9); }
});

test('Showers: occasional, repeatable for a seed, never before three minutes', () => {
  const run = (seed: number) => {
    const s = new Showers(seed), out: number[] = [];
    let raining = 0, first = -1, spells = 0, was = 0;
    for (let t = 0; t < 3600; t++) {
      const r = s.step(1);
      out.push(r);
      if (r > 0) { raining++; if (first < 0) first = t; assert.ok(r >= 0.6 && r <= 1); }
      if (r > 0 && was === 0) spells++;
      was = r;
    }
    return { out, raining, first, spells };
  };
  for (const seed of [1, 2, 77, 4242]) {
    const a = run(seed), b = run(seed);
    assert.deepEqual(a.out, b.out);
    assert.ok(a.first >= 180 && a.first <= 300, `first shower at ${a.first} s`);
    assert.ok(a.spells >= 4 && a.spells <= 9, `${a.spells} showers in an hour`);
    assert.ok(a.raining / 3600 > 0.12 && a.raining / 3600 < 0.4, `raining ${Math.round(a.raining / 36)} % of the hour`);
  }
  assert.notDeepEqual(run(1).out, run(2).out);
});

test('startModes: address beats the saved choice beats the default; an automated browser gets a frozen dry day', () => {
  assert.deepEqual(startModes('', {}, false), { time: 'auto', rain: 'auto', hour: null });
  assert.deepEqual(startModes('', {}, true), { time: 'day', rain: 'off', hour: null });
  assert.deepEqual(startModes('', { time: 'night', rain: 'on' }, true), { time: 'night', rain: 'on', hour: null });
  assert.deepEqual(startModes('?time=evening&rain=off', { time: 'night', rain: 'on' }, false), { time: 'evening', rain: 'off', hour: null });
  assert.deepEqual(startModes('?time=auto&rain=auto', {}, true), { time: 'auto', rain: 'auto', hour: null });
  // an hour in the address stops the clock there
  assert.deepEqual(startModes('?time=21.5', { time: 'auto' }, false), { time: 'day', rain: 'auto', hour: 21.5 });
  assert.deepEqual(startModes('?time=30', {}, false).hour, 6);
  // rubbish is ignored
  assert.deepEqual(startModes('?time=noon&rain=cats', { time: 'dawn', rain: null }, false), { time: 'auto', rain: 'auto', hour: null });
  assert.deepEqual(TIME_HOURS, { day: DAY_HOUR, evening: EVENING_HOUR, night: NIGHT_HOUR });
});
