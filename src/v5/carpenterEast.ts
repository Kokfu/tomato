// N1-M5: the rest of Carpenter Street, from the Jalan China junction east to Jalan Bishopgate.
//
// The shophouse rows themselves are ordinary rows of the section (geo.ts ROWS 'CN', 'CB', 'CH', 'CS', 'CR', lots.ts).
// This file adds what a row does not bring: the carriageway on the middle line between the mapped frontages, the side
// elevation of the Jalan China corner block (until now a blank wall the height of the building, standing at the edge
// of the road), street lamps, the lantern strings across the street and parked cars.
//
// VERIFIED FORM (Commons "Chinese-style Gate.jpg", Travelust, CC BY 2.0, and reference [C] of public/reference):
// two-storey shophouses on both sides, red lanterns strung across the street, cars parked at the kerb, and on a corner
// building a tiled pent roof along the side wall. APPROXIMATE: every dimension and position below.
import { Kit, hex, shade, rnd } from './kit.ts';
import type { V3 } from './kit.ts';
import { CARP_E, CARP_E_HALF, CHINA, CHINA_EAST, ROWS, rowFrame } from './geo.ts';
import { ARCADE, F1, UP, acUnit } from './shophouse.ts';
import { lampPost } from './street.ts';
import type { HeightFn } from './street.ts';
import { lanternString } from './landmarks/chinese.ts';
import { vehicle, vehicleSize, plateFor } from './vehicles.ts';
import type { PlateSource, VehicleKind } from './vehicles.ts';

export interface CarpResult { floors: { ring: number[]; h: number }[]; walls: { ring: number[]; top: number }[] }

/** Point at distance d along CARP_E (carried straight on beyond either end), the unit tangent there and the half width of the carriageway slab. */
export function carpAt(d: number): { x: number; z: number; tx: number; tz: number; half: number } {
  for (let i = 1; i < CARP_E.length; i++) {
    const [ax, az] = CARP_E[i - 1], [bx, bz] = CARP_E[i], l = Math.hypot(bx - ax, bz - az);
    if (d <= l || i === CARP_E.length - 1) {
      const t = d / l, u = Math.max(0, Math.min(1, t));
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, tx: (bx - ax) / l, tz: (bz - az) / l, half: CARP_E_HALF[i - 1] + (CARP_E_HALF[i] - CARP_E_HALF[i - 1]) * u };
    }
    d -= l;
  }
  throw new Error('unreachable');
}
export const CARP_E_LEN = CARP_E.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - CARP_E[i][0], p[1] - CARP_E[i][1]), 0);

/**
 * Parked cars: [row, metres along the row from its left end, kind, paint, facing flipped]. Typical, none surveyed.
 * All stand at the south kerb: the mapped centre line, which the drive graph follows, runs 3.6 m from the north
 * frontage, so a car parked on that side would leave a driven car 0.1 m.
 */
export const CARS: [string, number, VehicleKind, number, boolean][] = [
  ['CS', 8, 'hatch', 0xe9e9e6, false], ['CS', 23.9, 'saloon', 0x7a1f1c, true], ['CS', 29.9, 'hatch', 0xc9cdd0, false],
  ['CS', 44, 'suv', 0x2c3e55, false], ['CS', 58.5, 'hatch', 0x3a3d42, true], ['CS', 66, 'saloon', 0xdcdddf, false],
];
/** Street lamps: [row, lot boundary], 1 m out from the frontage. None stands beside a parked car (tests/unit/m5-places.test.ts). */
export const LAMPS: [string, number][] = [['CN', 3], ['CN', 9], ['CN', 14], ['CS', 4], ['CS', 11]];

function frameOf(id: string): { fr: ReturnType<typeof rowFrame>; w: number } | null {
  const def = ROWS.find((r) => r.id === id);
  if (!def) return null;
  let row = def;
  if (def.skip) { const l = Math.hypot(def.b[0] - def.a[0], def.b[1] - def.a[1]); row = { ...def, a: [def.a[0] + ((def.b[0] - def.a[0]) * def.skip) / l, def.a[1] + ((def.b[1] - def.a[1]) * def.skip) / l] }; }
  const fr = rowFrame(row);
  return { fr, w: fr.len / row.lots };
}

/** `china`: the Jalan China rows are shown (mode 'c'), so the corner block's side elevation is dressed. */
export function buildCarpenterEast(k: Kit, h: HeightFn, signs: PlateSource, china: boolean): CarpResult {
  const floors: CarpResult['floors'] = [], walls: CarpResult['walls'] = [];

  // Carriageway: asphalt on the middle line between the frontages, a slight crown, following the terrain. It starts
  // under the end of the existing section's road and stops where the chunk's own road takes over (geo.ts CLIP_X1).
  // The ground here falls across the street as well as along it (up to 0.7 m between the frontages), so the slab takes
  // the terrain height at each of its five lines instead of the centre line's.
  const rows: V3[][] = [[], [], [], [], []], c = hex(0x6b6a67);
  const n = Math.ceil((CARP_E_LEN + 1.4 - 3.4) / 2);
  for (let i = 0; i <= n; i++) {
    const p = carpAt(3.4 + ((CARP_E_LEN + 1.4 - 3.4) * i) / n);
    for (let s = 0; s < 5; s++) { const o = ((s - 2) / 2) * p.half, x = p.x - p.tz * o, z = p.z + p.tx * o; rows[s].push([x, h(x, z) + 0.05, z]); }
  }
  k.use('asphalt');
  k.grid([rows[4], rows[3], rows[2], rows[1], rows[0]], (_i, j) => shade(c, j === 0 || j === 4 ? 0.92 : 1.0));

  if (china) flank(k, h, floors, walls);

  for (const [id, b] of LAMPS) {
    const f = frameOf(id);
    if (!f) continue;
    const x = f.fr.ox + f.fr.dx * b * f.w + f.fr.nx * 1.0, z = f.fr.oz + f.fr.dz * b * f.w + f.fr.nz * 1.0;
    k.at({ x, y: h(x, z) + 0.03, z, ry: f.fr.ry }, () => lampPost(k));
    const q = (u: number, v: number) => [x + f.fr.dx * u + f.fr.nx * v, z + f.fr.dz * u + f.fr.nz * v];
    walls.push({ ring: [...q(-0.1, -0.1), ...q(0.1, -0.1), ...q(0.1, 0.1), ...q(-0.1, 0.1)], top: h(x, z) + 3 });
  }

  // Lantern strings from eave to eave, as across the rest of the street.
  for (let d = 32; d < CARP_E_LEN - 6; d += 13.5) {
    const p = carpAt(d), y = h(p.x, p.z) + 6.4, o = p.half - 0.35;
    lanternString(k, [p.x + p.tz * o, y, p.z - p.tx * o], [p.x - p.tz * o + p.tx * 1.2, y, p.z + p.tx * o + p.tz * 1.2], 8, 0.16, 0.35);
  }

  CARS.forEach(([id, along, kind, paint, flip], i) => {
    const f = frameOf(id);
    if (!f) return;
    const { half, hw } = vehicleSize(kind), out = 0.78 + hw + 0.14;
    const x = f.fr.ox + f.fr.dx * along + f.fr.nx * out, z = f.fr.oz + f.fr.dz * along + f.fr.nz * out, y = h(x, z) + 0.035;
    k.at({ x, y, z, ry: f.fr.ry + (flip ? Math.PI : 0) + (rnd(i, 41) - 0.5) * 0.04 }, () => vehicle(k, kind, hex(paint), signs, plateFor(40 + i)));
    const q = (u: number, v: number) => [x + f.fr.dx * u + f.fr.nx * v, z + f.fr.dz * u + f.fr.nz * v];
    walls.push({ ring: [...q(-half - 0.03, -hw - 0.03), ...q(half + 0.03, -hw - 0.03), ...q(half + 0.03, hw + 0.03), ...q(-half - 0.03, hw + 0.03)], top: y + 1.5 });
  });
  return { floors, walls };
}

/**
 * Side elevation of the Jalan China corner lot toward Carpenter Street. The lot's own side wall (shophouse.ts) stays;
 * this dresses it as corner buildings on this street are: a plinth, side doors and a barred window, a clay-tile pent
 * roof on timber brackets over a narrow footway, a string course, air-conditioners and a downpipe.
 * Frame: origin at the lot's street corner on Jalan China, x east along the wall, +z out toward Carpenter Street.
 */
function flank(k: Kit, h: HeightFn, floors: CarpResult['floors'], walls: CarpResult['walls']): void {
  const [ox, oz] = CHINA.toWorld(0, CHINA.half), L = CHINA_EAST.depth, nx = -CHINA.dx, nz = -CHINA.dz, dx = nz, dz = -nx;
  const base = h(ox + dx * L * 0.5 + nx * 0.6, oz + dz * L * 0.5 + nz * 0.6) + 0.03;
  const wall = hex(0xe4dccb), trim = hex(0xf1eee6), timber = hex(0x5a3d2b), x0 = ARCADE + 0.2, x1 = L - 0.1, FOOT = 0.85;
  k.at({ x: ox, y: base, z: oz, ry: Math.atan2(nx, nz) }, () => {
    k.use('plaster');
    k.box(x0, x1, 0, 0.5, 0, 0.045, shade(wall, 0.72), 'z-y-', 0.7);
    k.box(0, L, F1 - 0.07, F1 + 0.1, 0, 0.075, trim, 'z-');
    // doors and a barred window, set on the wall face
    // painted dado between the openings, as on the piers of the rows
    for (const [a, b] of [[x0, 4.2], [5.8, 7.5], [9.1, x1]]) k.box(a, b, 0.5, 1.2, 0, 0.012, hex(0x7f8c96), 'z-y-y+');
    for (const [a, b] of [[4.3, 5.7], [7.6, 9.0]]) {
      k.use('timber');
      k.box(a, b, 0.02, 2.3, 0, 0.05, timber, 'z-y-', 0.8);
      k.box((a + b) / 2 - 0.02, (a + b) / 2 + 0.02, 0.02, 2.3, 0.05, 0.065, shade(timber, 0.6), 'z-');
      k.use('plaster');
      k.box(a - 0.1, a, 0, 2.42, 0, 0.09, trim, 'z-y-'); k.box(b, b + 0.1, 0, 2.42, 0, 0.09, trim, 'z-y-'); k.box(a - 0.1, b + 0.1, 2.3, 2.42, 0, 0.09, trim, 'z-');
    }
    k.use('glass');
    k.quad([11.05, 1.25, 0.03], [12.45, 1.25, 0.03], [12.45, 2.3, 0.03], [11.05, 2.3, 0.03], hex(0x33424a, 0.6));
    k.use('paint');
    for (let q = 11.05; q <= 12.46; q += 0.175) k.box(q - 0.012, q + 0.012, 1.25, 2.3, 0.05, 0.075, hex(0x2f3134), 'z-');
    k.use('plaster');
    k.box(10.95, 12.55, 1.15, 1.25, 0, 0.12, trim, 'z-'); k.box(10.95, 12.55, 2.3, 2.4, 0, 0.09, trim, 'z-');
    // pent roof over the footway: clay tiles on timber brackets
    k.use('tile');
    k.prism([[0, 3.12], [1.25, 2.68], [1.25, 2.74], [0, 3.26]], x0 + 0.1, x1 - 0.1, hex(0x96482f, 0.9));
    k.use('timber');
    for (let q = x0 + 0.5; q < x1 - 0.3; q += 2.35) {
      k.box(q - 0.04, q + 0.04, 2.6, 2.69, 0, 1.2, timber, 'z-');
      k.prism([[0, 1.9], [0.07, 1.9], [1.05, 2.6], [0.95, 2.6]], q - 0.03, q + 0.03, shade(timber, 0.85));
    }
    // services
    acUnit(k, 6.6, F1 + 0.35, 0.02); acUnit(k, 10.0, F1 + 0.35, 0.02);
    k.use('paint');
    k.cyl(x1 - 0.25, 0.09, 0.1, F1 + UP - 0.2, 0.05, 0.05, 6, hex(0x8a8f8c), false);
    // footway: a concrete strip with a kerb stone edge
    k.use('concrete');
    k.box(x0, x1, -0.3, 0.12, 0, FOOT - 0.14, hex(0x8f8d86), 'z-y-', 0.85);
    k.use('stone');
    k.box(x0, x1, -0.3, 0.13, FOOT - 0.14, FOOT, hex(0x9a988e), 'y-', 0.8);
  });
  const q = (u: number, v: number) => [ox + dx * u + nx * v, oz + dz * u + nz * v];
  floors.push({ ring: [...q(x0, 0), ...q(x1, 0), ...q(x1, FOOT), ...q(x0, FOOT)], h: base + 0.125 });
  // Until now a walker passed 3 m into this wall (the chunk's collision keeps an arcade strip open on every mapped
  // frontage edge). The blocking strip starts 0.3 m behind the face: the mapped centre line of the street, which the
  // drive graph follows, runs 0.6 m from this wall, and a car on it must not be stopped by it.
  walls.push({ ring: [...q(x0, -0.62), ...q(x1, -0.62), ...q(x1, -0.3), ...q(x0, -0.3)], top: base + 3 });
}
