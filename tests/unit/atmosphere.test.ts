import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Haze, KUCHING_LAT, solarDeclination, sunDirection } from '../../src/world/atmosphere.ts';

const deg = (r: number) => (r * 180) / Math.PI;

test('sunDirection: unit vector, overhead at noon when the declination equals the latitude', () => {
  const [x, y, z] = sunDirection(KUCHING_LAT, KUCHING_LAT, 12);
  assert.ok(Math.abs(Math.hypot(x, y, z) - 1) < 1e-9);
  assert.ok(y > 0.999999);
});

test('sunDirection: noon altitude is 90 degrees minus the gap between latitude and declination', () => {
  for (const dec of [-23.44, -10, 0, 9.4, 23.44]) {
    const [x, y, z] = sunDirection(KUCHING_LAT, dec, 12);
    assert.ok(Math.abs(deg(Math.asin(y)) - (90 - Math.abs(KUCHING_LAT - dec))) < 1e-6);
    assert.ok(Math.abs(x) < 1e-9, 'on the meridian at noon');
    // -Z is north: the sun stands north of the zenith when the declination is north of the latitude
    assert.equal(Math.sign(-z), Math.sign(dec - KUCHING_LAT));
  }
});

test('sunDirection: east in the morning, west in the evening, on the horizon about 06:00 and 18:00', () => {
  const dec = solarDeclination(105);
  assert.ok(sunDirection(KUCHING_LAT, dec, 9)[0] > 0.6);
  assert.ok(sunDirection(KUCHING_LAT, dec, 15)[0] < -0.6);
  assert.ok(Math.abs(sunDirection(KUCHING_LAT, dec, 6)[1]) < 0.01);
  assert.ok(Math.abs(sunDirection(KUCHING_LAT, dec, 18)[1]) < 0.01);
  // the day preset of WorldManager (09:40): a high sun, a little north of east
  const [x, y, z] = sunDirection(KUCHING_LAT, dec, 9 + 40 / 60);
  assert.ok(deg(Math.asin(y)) > 50 && deg(Math.asin(y)) < 58);
  assert.ok(x > 0 && z < 0);
});

test('solarDeclination: solstices and equinoxes', () => {
  assert.ok(Math.abs(solarDeclination(172) - 23.44) < 0.1);
  assert.ok(Math.abs(solarDeclination(355) + 23.44) < 0.1);
  assert.ok(Math.abs(solarDeclination(81)) < 0.5);
  assert.ok(solarDeclination(105) > 8 && solarDeclination(105) < 11);
});

test('Haze: density and reach are carried by the fog near / far that three.js hands to the shaders', () => {
  const h = new Haze(0xc9d8df, 0.0012, 800);
  assert.equal(h.near, 0.0012);
  assert.equal(h.far, 800);
  h.density = 0.002; h.reach = 600;
  assert.equal(h.near, 0.002);
  assert.equal(h.far, 600);
  assert.ok(h.isFog && !(h as unknown as { isFogExp2?: boolean }).isFogExp2);
});
