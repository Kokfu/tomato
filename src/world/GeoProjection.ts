// Geographic <-> local metre frame conversion.
//
// Source data is WGS84 (EPSG:4326). The local frame is an ellipsoidal
// Transverse Mercator projection centred on the project origin with scale
// factor 1 (no false easting/northing). Within ~15 km of the central meridian
// the scale distortion is < 3e-6 (3 mm per km), so local metres are true
// ground metres for all practical purposes.
//
// World (three.js) axes:  +X = east,  +Y = up,  -Z = north.
// This file is shared by the browser runtime and the Node preprocessing tools.

export const WGS84_A = 6378137.0;
export const WGS84_F = 1 / 298.257223563;
const E2 = WGS84_F * (2 - WGS84_F);
const EP2 = E2 / (1 - E2);
const DEG = Math.PI / 180;

/** Project origin: Kuching Waterfront, near the Darul Hana Bridge south landing. */
export const ORIGIN_LAT = 1.5585;
export const ORIGIN_LON = 110.3445;

function meridianArc(phi: number): number {
  const e4 = E2 * E2;
  const e6 = e4 * E2;
  return (
    WGS84_A *
    ((1 - E2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * phi -
      ((3 * E2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * phi) +
      ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * phi) -
      ((35 * e6) / 3072) * Math.sin(6 * phi))
  );
}

const M0 = meridianArc(ORIGIN_LAT * DEG);

/** WGS84 degrees -> [east, north] metres relative to the origin. */
export function geoToEN(lat: number, lon: number): [number, number] {
  const phi = lat * DEG;
  const sin = Math.sin(phi);
  const cos = Math.cos(phi);
  const tan = sin / cos;
  const N = WGS84_A / Math.sqrt(1 - E2 * sin * sin);
  const T = tan * tan;
  const C = EP2 * cos * cos;
  const A = (lon - ORIGIN_LON) * DEG * cos;
  const A2 = A * A;
  const A3 = A2 * A;
  const A4 = A3 * A;
  const A5 = A4 * A;
  const A6 = A5 * A;
  const east = N * (A + ((1 - T + C) * A3) / 6 + ((5 - 18 * T + T * T + 72 * C - 58 * EP2) * A5) / 120);
  const north =
    meridianArc(phi) -
    M0 +
    N * tan * (A2 / 2 + ((5 - T + 9 * C + 4 * C * C) * A4) / 24 + ((61 - 58 * T + T * T + 600 * C - 330 * EP2) * A6) / 720);
  return [east, north];
}

/** [east, north] metres -> WGS84 [lat, lon] degrees. */
export function enToGeo(east: number, north: number): [number, number] {
  const e4 = E2 * E2;
  const e6 = e4 * E2;
  const mu = (M0 + north) / (WGS84_A * (1 - E2 / 4 - (3 * e4) / 64 - (5 * e6) / 256));
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 * e1) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const sin = Math.sin(phi1);
  const cos = Math.cos(phi1);
  const tan = sin / cos;
  const C1 = EP2 * cos * cos;
  const T1 = tan * tan;
  const N1 = WGS84_A / Math.sqrt(1 - E2 * sin * sin);
  const R1 = (WGS84_A * (1 - E2)) / Math.pow(1 - E2 * sin * sin, 1.5);
  const D = east / N1;
  const D2 = D * D;
  const phi =
    phi1 -
    ((N1 * tan) / R1) *
      (D2 / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * EP2) * D2 * D2) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * EP2 - 3 * C1 * C1) * D2 * D2 * D2) / 720);
  const lam =
    (D - ((1 + 2 * T1 + C1) * D2 * D) / 6 + ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * EP2 + 24 * T1 * T1) * D2 * D2 * D) / 120) /
    cos;
  return [phi / DEG, ORIGIN_LON + lam / DEG];
}

/** WGS84 degrees -> world [x, z] (x = east, z = -north). */
export function geoToWorld(lat: number, lon: number): [number, number] {
  const [e, n] = geoToEN(lat, lon);
  return [e, -n];
}

/** World [x, z] -> WGS84 [lat, lon] degrees. */
export function worldToGeo(x: number, z: number): [number, number] {
  return enToGeo(x, -z);
}

/** Compass bearing (degrees clockwise from north) of a world-space direction. */
export function worldDirToBearing(dx: number, dz: number): number {
  const b = (Math.atan2(dx, -dz) / DEG + 360) % 360;
  return b;
}
