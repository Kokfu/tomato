// Square Tower (1879) - procedural model.
// Mapped (OSM way 817868530): position, square outline, orientation, building:levels.
// N1-M5 (hero place 4), VERIFIED FORM from two Commons photographs (Horatio Wong, "Square Tower, Kuching.jpg", and
// Yeo Jiun Tzen, "Square Tower 03.jpg", both CC BY-SA 4.0; docs/night/m5-plaza-merdeka-courthouse.md): a white
// two-storey block with a string course and a crenellated parapet, a taller crenellated turret at ONE CORNER (there
// is no central tower), three louvred shutters in red-brown per face under white hoods that carry a small shield,
// three small round-headed windows below, a door in the middle of the front.
// APPROXIMATE: every dimension, which mapped face is the front (taken as the face turned furthest from the river,
// as the photograph's background suggests), and the two faces no photograph shows (built like the photographed side).
// With ?m5=0 the earlier model (a central tower, since found to be wrong) is drawn.
import type { LandmarkBuilder } from '../LandmarkManager.ts';
import { m5Enabled } from '../district/m5.ts';
import { Model, col, findBuilding, fitFootprint, insetRing, ringLocal, windowRing, type V3 } from './kit.ts';

export const SQUARE_TOWER_BUILDING = 817868530;

const WHITE = col(0xf0ede3);
const WHITE_2 = col(0xe0dccf);
const WALK = col(0xb7b1a3);
const DARK = col(0x3a3835);
const SHUTTER = col(0x8a4a3c);
const DOOR = col(0x7a4a32);
const SHIELD = col(0xe2bd3c);
const CROSS = col(0xb3262b);

const legacy: LandmarkBuilder = ({ data, ctx }) => {
  const b = findBuilding(data, [SQUARE_TOWER_BUILDING]);
  if (!b) return null;
  const fp = fitFootprint(b, data, ctx);
  const m = new Model().frame(fp);
  const loc = ringLocal(fp);
  const g = fp.gMin, gTop = Math.max(g, fp.gMean);
  const bodyTop = gTop + Math.max(6.5, fp.h);

  m.walls(loc, g - 0.6, bodyTop, WHITE);
  m.cap(loc, [], bodyTop, WALK);
  m.crenels(loc, bodyTop, 0.85, WHITE, 1.5, 0.45);
  windowRing(m, loc, gTop + 0.4, gTop + 2.6, 12, 1.5, DARK); // doorway arch per side
  windowRing(m, loc, gTop + 4.1, gTop + 5.6, 3.6, 0.7, DARK);

  // Central tower rising above the parapet.
  const s = Math.min(fp.L, fp.W) * 0.24;
  const towerTop = bodyTop + 5.6;
  m.box(-s, s, -s, s, bodyTop - 0.1, towerTop, WHITE, WALK);
  m.box(-s - 0.2, s + 0.2, -s - 0.2, s + 0.2, towerTop - 0.75, towerTop - 0.4, WHITE_2);
  const top = [-s, -s, s, -s, s, s, -s, s];
  m.crenels(top, towerTop, 0.8, WHITE, 1.3, 0.4);
  windowRing(m, top, bodyTop + 1.8, bodyTop + 3.4, 2 * s, 0.7, DARK);
  return m.mesh(ctx, 'square-tower');
};

/** Storey heights and the turret of the verified form (metres above the upper ground level). */
export const TOWER_FORM = { string: 3.25, body: 7.0, turret: 3.3, turretSide: 3.0, baysPerFace: 3 };

export const buildSquareTower: LandmarkBuilder = (args) => {
  if (!m5Enabled()) return legacy(args);
  const { data, ctx } = args;
  const b = findBuilding(data, [SQUARE_TOWER_BUILDING]);
  if (!b) return null;
  const fp = fitFootprint(b, data, ctx);
  const m = new Model().frame(fp);
  const loc = ringLocal(fp), n = loc.length / 2;
  const g = fp.gMin, gTop = Math.max(g, fp.gMean);
  const bodyTop = gTop + Math.max(TOWER_FORM.body, fp.h);
  let area = 0;
  for (let i = 0, j = n - 1; i < n; j = i, i++) area += loc[j * 2] * loc[i * 2 + 1] - loc[i * 2] * loc[j * 2 + 1];
  const sg = area > 0 ? 1 : -1;

  m.walls(loc, g - 0.6, bodyTop, WHITE);
  m.cap(loc, [], bodyTop, WALK);

  // The front: the face turned furthest from the river (world south-east here). Local axes in world: a = (ux, uz),
  // b = (-uz, ux).
  const faces: { a: number; b: number }[] = [{ a: 1, b: 0 }, { a: -1, b: 0 }, { a: 0, b: 1 }, { a: 0, b: -1 }];
  const world = (f: { a: number; b: number }) => [f.a * fp.ux - f.b * fp.uz, f.a * fp.uz + f.b * fp.ux];
  const front = faces.reduce((p, q) => (world(q)[1] + 0.5 * world(q)[0] > world(p)[1] + 0.5 * world(p)[0] ? q : p));
  // viewer's left when facing the front, in the local frame
  const [fx, fz] = world(front), lx = -fz, lz = fx, left = { a: lx * fp.ux + lz * fp.uz, b: -lx * fp.uz + lz * fp.ux };

  // The corner turret: at the front's left end (as the front photograph shows), a little proud of both faces.
  const T = TOWER_FORM.turretSide, out = 0.22;
  const ca = (front.a + left.a) * (fp.L / 2) , cb = (front.b + left.b) * (fp.W / 2);
  // the corner of the outline nearest that OBB corner
  let ci = 0, cd = Infinity;
  for (let i = 0; i < n; i++) { const d = Math.hypot(loc[i * 2] - ca, loc[i * 2 + 1] - cb); if (d < cd) { cd = d; ci = i; } }
  const ka = loc[ci * 2], kb = loc[ci * 2 + 1], sa = Math.sign(front.a + left.a) || 1, sb = Math.sign(front.b + left.b) || 1;
  const a0 = Math.min(ka + sa * out, ka + sa * out - sa * T), a1 = Math.max(ka + sa * out, ka + sa * out - sa * T);
  const b0 = Math.min(kb + sb * out, kb + sb * out - sb * T), b1 = Math.max(kb + sb * out, kb + sb * out - sb * T);
  const tTop = bodyTop + TOWER_FORM.turret;
  m.box(a0, a1, b0, b1, g - 0.6, tTop, WHITE, WALK);
  if (ctx.detail !== 'high') return m.mesh(ctx, 'square-tower');

  // string course between the storeys, cornice under the parapet
  m.walls(insetRing(loc, -0.07), gTop + TOWER_FORM.string, gTop + TOWER_FORM.string + 0.16, WHITE_2);
  m.walls(insetRing(loc, -0.12), bodyTop - 0.3, bodyTop - 0.05, WHITE_2);
  m.crenels(loc, bodyTop, 0.85, WHITE, 1.5, 0.45);
  // openings, edge by edge of the mapped outline
  for (let i = 0, j = n - 1; i < n; j = i, i++) {
    const a0 = loc[j * 2], b0 = loc[j * 2 + 1], a1 = loc[i * 2], b1 = loc[i * 2 + 1], l = Math.hypot(a1 - a0, b1 - b0);
    if (l < 6) continue;
    const da = (a1 - a0) / l, db = (b1 - b0) / l, na = db * sg, nb = -da * sg; // outward
    const isFront = na * front.a + nb * front.b > 0.8;
    const pane = (s: number, w: number, y0: number, y1: number, c: typeof WHITE, off: number) => {
      const p = (t: number, y: number): V3 => [a0 + da * (s + t) + na * off, y, b0 + db * (s + t) + nb * off];
      m.poly([p(-w / 2, y0), p(w / 2, y0), p(w / 2, y1), p(-w / 2, y1)], c, [a0 + da * s - na, (y0 + y1) / 2, b0 + db * s - nb]);
    };
    // three bays on the part of the face the turret leaves free
    const N = TOWER_FORM.baysPerFace, s0 = j === ci ? T - out : 0, s1 = l - (i === ci ? T - out : 0);
    for (let k = 0; k < N; k++) {
      const s = s0 + ((k + 0.5) * (s1 - s0)) / N;
      // upper floor: louvred shutters under a white hood with a shield (yellow, red cross)
      pane(s, 1.3, gTop + 4.05, gTop + 5.6, SHUTTER, 0.05);
      pane(s, 0.04, gTop + 4.05, gTop + 5.6, DARK, 0.07);
      pane(s, 1.7, gTop + 5.62, gTop + 5.74, WHITE_2, 0.14);
      pane(s, 1.2, gTop + 5.74, gTop + 6.12, WHITE_2, 0.09);
      pane(s, 0.26, gTop + 5.78, gTop + 6.06, SHIELD, 0.12);
      pane(s, 0.06, gTop + 5.78, gTop + 6.06, CROSS, 0.14);
      pane(s, 0.26, gTop + 5.89, gTop + 5.95, CROSS, 0.14);
      if (isFront && k === (N - 1) / 2) {
        // the door, under a white arch with the shield
        pane(s, 1.5, gTop + 0.05, gTop + 2.4, DOOR, 0.05);
        pane(s, 0.04, gTop + 0.05, gTop + 2.4, DARK, 0.07);
        pane(s, 2.0, gTop + 2.42, gTop + 3.0, WHITE_2, 0.1);
        pane(s, 0.3, gTop + 2.55, gTop + 2.88, SHIELD, 0.13);
        pane(s, 0.07, gTop + 2.55, gTop + 2.88, CROSS, 0.15);
        pane(s, 0.3, gTop + 2.68, gTop + 2.75, CROSS, 0.15);
      } else {
        // ground floor: a small round-headed window
        pane(s, 0.6, gTop + 1.75, gTop + 2.6, DARK, 0.05);
        pane(s, 0.38, gTop + 2.6, gTop + 2.76, DARK, 0.05);
        pane(s, 0.9, gTop + 2.8, gTop + 2.92, WHITE_2, 0.1);
      }
    }
  }

  m.box(a0 - 0.12, a1 + 0.12, b0 - 0.12, b1 + 0.12, tTop - 0.32, tTop - 0.06, WHITE_2);
  const ring = [a0, b0, a1, b0, a1, b1, a0, b1];
  m.crenels(ring, tTop, 0.75, WHITE, 1.0, 0.38);
  // cross-shaped slits on the turret's faces
  windowRing(m, ring, bodyTop + 0.5, bodyTop + 1.5, T, 0.09, DARK);
  windowRing(m, ring, bodyTop + 0.95, bodyTop + 1.05, T, 0.5, DARK);
  windowRing(m, ring, gTop + 4.3, gTop + 5.3, T, 0.09, DARK);
  windowRing(m, ring, gTop + 4.75, gTop + 4.85, T, 0.5, DARK);
  return m.mesh(ctx, 'square-tower');
};
