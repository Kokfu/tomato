// Deterministic coordinate-conversion tests (node --test).
import test from 'node:test';
import assert from 'node:assert/strict';
import { geoToEN, enToGeo, geoToWorld, worldToGeo, ORIGIN_LAT, ORIGIN_LON, WGS84_A, WGS84_F } from '../../src/world/GeoProjection.ts';
import { DATA_BBOX } from '../../src/world/config.ts';

/** Independent reference: Vincenty inverse geodesic distance on WGS84 (metres). */
function vincenty(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const a = WGS84_A, f = WGS84_F, b = a * (1 - f), R = Math.PI / 180;
  const U1 = Math.atan((1 - f) * Math.tan(lat1 * R)), U2 = Math.atan((1 - f) * Math.tan(lat2 * R));
  const L = (lon2 - lon1) * R;
  let lam = L, sinS = 0, cosS = 0, sig = 0, cos2A = 0, cos2SM = 0;
  for (let i = 0; i < 200; i++) {
    const sl = Math.sin(lam), cl = Math.cos(lam);
    sinS = Math.hypot(Math.cos(U2) * sl, Math.cos(U1) * Math.sin(U2) - Math.sin(U1) * Math.cos(U2) * cl);
    if (sinS === 0) return 0;
    cosS = Math.sin(U1) * Math.sin(U2) + Math.cos(U1) * Math.cos(U2) * cl;
    sig = Math.atan2(sinS, cosS);
    const sinA = (Math.cos(U1) * Math.cos(U2) * sl) / sinS;
    cos2A = 1 - sinA * sinA;
    cos2SM = cos2A ? cosS - (2 * Math.sin(U1) * Math.sin(U2)) / cos2A : 0;
    const C = (f / 16) * cos2A * (4 + f * (4 - 3 * cos2A));
    const prev = lam;
    lam = L + (1 - C) * f * sinA * (sig + C * sinS * (cos2SM + C * cosS * (-1 + 2 * cos2SM * cos2SM)));
    if (Math.abs(lam - prev) < 1e-13) break;
  }
  const u2 = (cos2A * (a * a - b * b)) / (b * b);
  const A = 1 + (u2 / 16384) * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)));
  const B = (u2 / 1024) * (256 + u2 * (-128 + u2 * (74 - 47 * u2)));
  const dS = B * sinS * (cos2SM + (B / 4) * (cosS * (-1 + 2 * cos2SM * cos2SM) - (B / 6) * cos2SM * (-3 + 4 * sinS * sinS) * (-3 + 4 * cos2SM * cos2SM)));
  return b * A * (sig - dS);
}

const POINTS: [string, number, number][] = [
  ['origin', ORIGIN_LAT, ORIGIN_LON],
  ['Darul Hana Bridge', 1.5601, 110.3457],
  ['DUN', 1.5627, 110.3478],
  ['Fort Margherita', 1.5609, 110.3497],
  ['Borneo Cultures Museum', 1.5549, 110.3441],
  ['bbox SW', DATA_BBOX.south, DATA_BBOX.west],
  ['bbox NE', DATA_BBOX.north, DATA_BBOX.east],
  ['bbox NW', DATA_BBOX.north, DATA_BBOX.west],
  ['bbox SE', DATA_BBOX.south, DATA_BBOX.east],
];

test('origin maps to (0,0)', () => {
  const [e, n] = geoToEN(ORIGIN_LAT, ORIGIN_LON);
  assert.ok(Math.abs(e) < 1e-9 && Math.abs(n) < 1e-9);
});

test('round trip geo -> local -> geo is sub-millimetre', () => {
  for (const [name, lat, lon] of POINTS) {
    const [e, n] = geoToEN(lat, lon);
    const [lat2, lon2] = enToGeo(e, n);
    const errM = Math.hypot((lat2 - lat) * 110574, (lon2 - lon) * 111320);
    assert.ok(errM < 1e-4, `${name}: round-trip error ${errM} m`);
  }
});

test('local distances match WGS84 geodesic distances (< 5 mm per km)', () => {
  let worst = 0;
  for (let i = 0; i < POINTS.length; i++)
    for (let j = i + 1; j < POINTS.length; j++) {
      const [, la1, lo1] = POINTS[i], [, la2, lo2] = POINTS[j];
      const [e1, n1] = geoToEN(la1, lo1), [e2, n2] = geoToEN(la2, lo2);
      const d = Math.hypot(e2 - e1, n2 - n1), ref = vincenty(la1, lo1, la2, lo2);
      const rel = Math.abs(d - ref) / ref;
      worst = Math.max(worst, rel);
      assert.ok(rel < 5e-6, `${POINTS[i][0]} -> ${POINTS[j][0]}: ${d} vs ${ref}`);
    }
  console.log(`worst relative distance error: ${worst.toExponential(2)}`);
});

test('axes: north is -Z, east is +X', () => {
  const [x1, z1] = geoToWorld(ORIGIN_LAT + 0.001, ORIGIN_LON);
  assert.ok(z1 < -100 && Math.abs(x1) < 0.01);
  const [x2, z2] = geoToWorld(ORIGIN_LAT, ORIGIN_LON + 0.001);
  assert.ok(x2 > 100 && Math.abs(z2) < 0.01);
  const [lat, lon] = worldToGeo(x2, z2);
  assert.ok(Math.abs(lat - ORIGIN_LAT) < 1e-9 && Math.abs(lon - ORIGIN_LON - 0.001) < 1e-9);
});

test('1 degree-fraction scale sanity (0.001 deg lat ~ 110.57 m at the equator)', () => {
  const [, n] = geoToEN(ORIGIN_LAT + 0.001, ORIGIN_LON);
  assert.ok(Math.abs(n - 110.576) < 0.05, `north = ${n}`);
});
