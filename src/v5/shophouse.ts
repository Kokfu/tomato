// V5 shophouse generator: one lot of a Kuching old-town row, built with real depth.
//
// Lot frame: x runs left to right along the frontage as seen from the street (0..w), y is up from
// the five-foot-way kerb line, +z points out into the street. The upper facade and the pier line
// are at z = 0, the shopfront stands ARCADE metres back, the lot ends at z = -depth.
//
// What is geometry here (and was a painted rectangle in V4): window and door reveals, shutter
// leaves (hung open at different angles), frames, sills, hood mouldings, pilasters, cornices,
// piers with plinth and capital, bressummer beam, joisted arcade ceiling, arched party-wall
// openings, shop interiors, roller-shutter housings, folding doors, eaves with rafter tails,
// gutters and downpipes, ridge caps, party-wall parapets, air-conditioner units, blinds.
//
// Lot width, depth and position come from the mapped block outline. Everything else is a typical
// Carpenter Street form chosen per lot (see LotSpec.basis): it is not surveyed architecture.
import { Kit, hex, shade, mix, rnd } from './kit.ts';
import type { Col, Opening, V3 } from './kit.ts';

export const ARCADE = 2.3;
export const PIER = 0.5;           // pier width and depth
export const KERB = 0.14;          // five-foot-way floor above the road
export const SOFFIT = 3.25;        // underside of the arcade ceiling
export const F1 = 3.6;             // first-floor level
export const UP = 3.15;            // upper storey height

export type ShopType = 'folding' | 'roller' | 'open' | 'grille' | 'glass';
/** 'band': one wide strip of glazed casements across the bay (1950s-60s rebuilds). */
export type WinType = 'louvre' | 'casement' | 'arched' | 'slider' | 'band';

export interface LotSpec {
  w: number;
  depth: number;
  storeys: 1 | 2 | 3;
  /** Fabric awning over the kerb. */
  awning?: Col;
  /** Party-wall openings of the five-foot way: true = arched, false = square-headed, unset = varies by lot. */
  sideArch?: boolean;
  /** One colour instead of the default two-colour stripes. */
  awningPlain?: boolean;
  wall: Col;
  trim: Col;
  joinery: Col;
  floor: Col;
  dado: Col | null;
  windows: number;
  win: WinType;
  shop: ShopType;
  roof: 'tile' | 'zinc';
  parapet: boolean;
  hoods: boolean;
  blinds: boolean;
  ac: number;
  bin: boolean;
  plants: number;
  /** Fascia sign text (a mapped place name) and colours; drawn through the sign atlas. */
  sign?: { text: string; fg: string; bg: string };
  /** Vertical projecting sign at the pier. */
  hang?: { text: string; fg: string; bg: string };
  exposedL: boolean;
  exposedR: boolean;
  seed: number;
  /** Where this lot's appearance comes from: 'typical' (rule) or a reference note. */
  basis: string;
}

/** Supplies UV rectangles for text drawn at run time (browser fonts, one shared canvas). */
export interface SignSource { rect(text: string, fg: string, bg: string, aspect: number, vertical?: boolean): [number, number, number, number] }

const WALLS = [0xe8e4d8, 0xe2dccb, 0xd6d7d1, 0xcbd6da, 0xe6dab6, 0xdfe3d2, 0xe9e2d6, 0xd9d2c2];
const JOINERY = [0x5f8284, 0x6f7f95, 0x6a4a37, 0x3f5c4a, 0x8a8f8c, 0x7d5a44, 0x4d6f8a];
const FLOORS = [0xa9563f, 0xc9b99a, 0x9a9c98, 0x7f9a8a, 0xb7a58c, 0x8f4f3c];

/** Rule-based lot (Approach A): every choice is a hash of the lot seed. */
export function autoLot(seed: number, w: number, depth: number): LotSpec {
  const r = (k: number) => rnd(seed, k);
  const pick = <T,>(a: T[], k: number): T => a[Math.floor(r(k) * a.length) % a.length];
  const wall = hex(pick(WALLS, 1), 0.92 + r(2) * 0.1);
  const shopR = r(5);
  return {
    w, depth, storeys: 2, wall, trim: mix(wall, hex(0xf4f1ea), 0.6), joinery: hex(pick(JOINERY, 3)), floor: hex(pick(FLOORS, 4)),
    dado: r(11) < 0.45 ? hex(pick([0x7f8c96, 0x8a9a8c, 0x9a8a78], 12)) : null,
    windows: w > 5.6 ? 3 : 2, win: r(6) < 0.55 ? 'louvre' : r(6) < 0.75 ? 'casement' : r(6) < 0.88 ? 'arched' : 'slider',
    shop: shopR < 0.3 ? 'folding' : shopR < 0.55 ? 'roller' : shopR < 0.8 ? 'open' : shopR < 0.92 ? 'grille' : 'glass',
    roof: r(7) < 0.7 ? 'tile' : 'zinc', parapet: r(8) < 0.18, hoods: r(9) < 0.4, blinds: r(10) < 0.4, ac: r(13) < 0.5 ? 1 : 0,
    bin: r(14) < 0.3, plants: r(15) < 0.4 ? 1 + Math.floor(r(16) * 2) : 0,
    exposedL: false, exposedR: false, seed, basis: 'typical',
  };
}

const DARK = hex(0x14181a);

/** Height of the top of the wall / eave line. */
export const eaveY = (s: LotSpec) => F1 + UP * (s.storeys - 1);

function pier(k: Kit, s: LotSpec, x0: number, x1: number, skipL: boolean, skipR: boolean): void {
  const sk = (skipL ? 'x-' : '') + (skipR ? 'x+' : '') + 'y-';
  const body = s.wall;
  k.use('plaster');
  // plinth, dado band, shaft, capital
  k.box(x0 - (skipL ? 0 : 0.04), x1 + (skipR ? 0 : 0.04), 0, 0.32, -PIER - 0.04, 0.04, shade(s.dado ?? body, 0.9), sk, 0.6);
  k.box(x0, x1, 0.32, 1.15, -PIER, 0, s.dado ?? body, sk + 'y+');
  k.box(x0, x1, 1.15, 2.85, -PIER, 0, body, sk + 'y+');
  k.box(x0 - (skipL ? 0 : 0.035), x1 + (skipR ? 0 : 0.035), 2.85, 2.97, -PIER - 0.035, 0.035, s.trim, sk);
  k.box(x0, x1, 2.97, F1 - 0.5, -PIER, 0, body, sk + 'y+');
}

function shopfront(k: Kit, s: LotSpec, signs: SignSource | null): void {
  const z = -ARCADE, x0 = 0.12, x1 = s.w - 0.12, ao = 0.62;
  const ox0 = 0.5, ox1 = s.w - 0.5, oy1 = s.shop === 'glass' ? 2.75 : 2.95;
  const wallC = shade(s.wall, ao);
  k.use('plaster');
  k.wall(x0, x1, KERB, SOFFIT, z, 0.22, [{ x0: ox0, x1: ox1, y0: KERB, y1: oy1 }], wallC, shade(wallC, 0.7), 0.75);
  const zi = z - 0.2, W = ox1 - ox0;
  const jc = shade(s.joinery, ao);
  if (s.shop === 'folding') {
    // Timber concertina doors below a barred ventilation panel.
    const n = Math.max(4, Math.round(W / 0.62)), lw = W / n, top = 2.3;
    k.use('timber');
    const openN = rnd(s.seed, 31) < 0.5 ? Math.floor(rnd(s.seed, 32) * 3) : 0;
    for (let i = 0; i < n; i++) {
      if (i < openN) continue;
      const xa = ox0 + i * lw, xb = xa + lw;
      const za = zi + (i % 2 ? 0.05 : 0), zb = zi + (i % 2 ? 0 : 0.05);
      k.quad([xa, KERB, za], [xb, KERB, zb], [xb, top, zb], [xa, top, za], [shade(jc, 0.75), shade(jc, 0.75), jc, jc]);
    }
    if (openN) interior(k, s, ox0, ox0 + openN * lw, top, zi);
    k.use('paint');
    k.box(ox0, ox1, top, top + 0.09, zi - 0.03, zi + 0.07, shade(jc, 0.8));
    for (let x = ox0 + 0.08; x < ox1; x += 0.11) k.box(x - 0.012, x + 0.012, top + 0.09, oy1, zi + 0.0, zi + 0.024, shade(jc, 0.9), 'y+y-');
    k.use('glass');
    k.quad([ox0, top, zi - 0.05], [ox1, top, zi - 0.05], [ox1, oy1, zi - 0.05], [ox0, oy1, zi - 0.05], DARK);
  } else if (s.shop === 'roller') {
    k.use('shutter');
    const c = hex(0x9a9d9f, ao);
    k.quad([ox0, KERB, zi], [ox1, KERB, zi], [ox1, oy1 - 0.3, zi], [ox0, oy1 - 0.3, zi], [shade(c, 0.7), shade(c, 0.7), c, c]);
    k.use('paint');
    k.box(ox0, ox1, oy1 - 0.32, oy1, zi - 0.1, zi + 0.16, hex(0x8a8d8f, ao), '', 0.8);
    for (const x of [ox0, ox1 - 0.06]) k.box(x, x + 0.06, KERB, oy1 - 0.3, zi - 0.02, zi + 0.05, hex(0x70757a, ao));
  } else if (s.shop === 'grille') {
    // Collapsible steel gate in front of a dark shop.
    k.use('paint');
    const g = hex(0x3c4246, ao);
    for (let x = ox0 + 0.05; x < ox1; x += 0.095) k.box(x - 0.011, x + 0.011, KERB, oy1 - 0.05, zi + 0.06, zi + 0.085, g, 'y+y-');
    for (const y of [0.5, 1.4, 2.3]) k.box(ox0, ox1, y, y + 0.03, zi + 0.085, zi + 0.1, g, 'x+x-');
    k.box(ox0, ox1, oy1 - 0.08, oy1, zi, zi + 0.12, shade(g, 1.2));
    interior(k, s, ox0, ox1, oy1, zi);
  } else if (s.shop === 'glass') {
    // Aluminium-framed glazing with a door: a modern convenience-store front.
    const al = hex(0xb9bdc0, ao);
    k.use('paint');
    const mull = [ox0, ox0 + W * 0.36, ox0 + W * 0.64, ox1];
    for (const x of mull) k.box(x - 0.03, x + 0.03, KERB, oy1, zi - 0.02, zi + 0.04, al);
    k.box(ox0, ox1, oy1 - 0.06, oy1, zi - 0.02, zi + 0.04, al);
    k.box(ox0, ox1, 2.15, 2.21, zi - 0.02, zi + 0.04, al);
    k.box(ox0, mull[1], KERB, KERB + 0.35, zi - 0.02, zi + 0.03, al);
    k.box(mull[2], ox1, KERB, KERB + 0.35, zi - 0.02, zi + 0.03, al);
    interior(k, s, ox0, ox1, oy1, zi - 0.02, true);
    k.use('glass');
    k.quad([ox0, KERB, zi], [ox1, KERB, zi], [ox1, oy1, zi], [ox0, oy1, zi], hex(0x9fb4b8, 0.5));
  } else {
    // Open shop: shutter rolled up into its housing, the interior visible.
    k.use('paint');
    k.box(ox0, ox1, oy1 - 0.32, oy1, zi - 0.1, zi + 0.16, hex(0x8a8d8f, ao), '', 0.8);
    k.use('shutter');
    const c = hex(0x9a9d9f, ao);
    k.quad([ox0, oy1 - 0.62, zi], [ox1, oy1 - 0.62, zi], [ox1, oy1 - 0.3, zi], [ox0, oy1 - 0.3, zi], c);
    interior(k, s, ox0, ox1, oy1 - 0.62, zi);
  }
  // threshold step
  k.use('concrete');
  k.box(ox0 - 0.05, ox1 + 0.05, KERB, KERB + 0.05, z - 0.25, z + 0.06, hex(0x8f8c84, 0.8), 'y-');
  // fascia sign on the bressummer, facing the street
  if (signs && s.sign) {
    const h = 0.42, wS = Math.min(s.w - PIER - 0.5, Math.max(1.8, s.sign.text.length * 0.26));
    const uv = signs.rect(s.sign.text, s.sign.fg, s.sign.bg, wS / h);
    const cx = s.w / 2, y = F1 - 0.5 + 0.04;
    k.use('paint');
    k.box(cx - wS / 2 - 0.04, cx + wS / 2 + 0.04, y - 0.03, y + h + 0.03, 0.02, 0.07, hex(0x2a2a2a));
    k.use('sign');
    k.quad([cx - wS / 2, y, 0.075], [cx + wS / 2, y, 0.075], [cx + wS / 2, y + h, 0.075], [cx - wS / 2, y + h, 0.075], [1, 1, 1], uv);
  }
}

/** Dim shop interior behind an opening x0..x1 at z = zf: floor, walls, ceiling, shelves, a lit tube. */
function interior(k: Kit, s: LotSpec, x0: number, x1: number, top: number, zf: number, bright = false): void {
  const zb = zf - 4.2, a = bright ? 0.75 : 0.34;
  const wall = shade(mix(s.wall, hex(0xd8d2c4), 0.6), a), fl = shade(s.floor, a * 0.9);
  const xa = x0 - 0.15, xb = x1 + 0.15, ceil = Math.max(top, 2.9);
  k.use('plaster');
  k.quad([xa, KERB, zb], [xb, KERB, zb], [xb, ceil, zb], [xa, ceil, zb], shade(wall, 0.8));
  k.quad([xa, KERB, zf], [xa, KERB, zb], [xa, ceil, zb], [xa, ceil, zf], wall);
  k.quad([xb, KERB, zb], [xb, KERB, zf], [xb, ceil, zf], [xb, ceil, zb], wall);
  k.quad([xa, ceil, zb], [xb, ceil, zb], [xb, ceil, zf], [xa, ceil, zf], shade(wall, 0.7));
  k.use('paving');
  k.quad([xa, KERB + 0.01, zf], [xb, KERB + 0.01, zf], [xb, KERB + 0.01, zb], [xa, KERB + 0.01, zb], fl);
  // shelving along both walls with rows of goods, a counter, a ceiling tube
  k.use('timber');
  const sh = hex(0x6b5340, a);
  for (const sx of [xa + 0.02, xb - 0.42]) {
    k.box(sx, sx + 0.4, KERB, 2.2, zb + 0.3, zf - 0.7, sh, 'y-');
  }
  k.box((xa + xb) / 2 - 0.9, (xa + xb) / 2 + 0.5, KERB, 0.95, zb + 1.2, zb + 1.75, shade(sh, 1.2), 'y-');
  k.use('paint');
  const goods = [0xc8452f, 0xd9b23c, 0x3f7fae, 0x4f9a5c, 0xe7e2d2, 0x9a5fae];
  for (let side = 0; side < 2; side++) for (let row = 0; row < 4; row++) for (let i = 0; i < 6; i++) {
    if (rnd(s.seed, 60 + side * 30 + row * 7 + i) < 0.25) continue;
    const zc = zb + 0.5 + i * ((zf - zb - 1.6) / 6), y = KERB + 0.35 + row * 0.47, hgt = 0.18 + rnd(s.seed, i, row) * 0.2;
    const c = hex(goods[Math.floor(rnd(s.seed, row * 6 + i, side) * goods.length)], a * 1.3);
    const sx = side ? xb - 0.47 : xa + 0.42;
    k.box(sx, sx + 0.05, y, y + hgt, zc, zc + 0.3, c, 'y-');
  }
  k.use('glow');
  k.box((xa + xb) / 2 - 0.6, (xa + xb) / 2 + 0.6, ceil - 0.08, ceil - 0.04, zf - 1.6, zf - 1.52, hex(0xf2f4ee, bright ? 1 : 0.8));
  if (bright) k.box((xa + xb) / 2 - 0.6, (xa + xb) / 2 + 0.6, ceil - 0.08, ceil - 0.04, zf - 3.2, zf - 3.12, hex(0xf2f4ee));
}

function arcade(k: Kit, s: LotSpec): void {
  const w = s.w;
  // floor: brighter at the open edge, darker toward the shopfront (baked sky occlusion)
  k.use('paving');
  const f0 = shade(s.floor, 0.95), f1 = shade(s.floor, 0.55);
  k.quad([0, KERB, 0], [w, KERB, 0], [w, KERB, -ARCADE], [0, KERB, -ARCADE], [f0, f0, f1, f1]);
  // ceiling boards on joists
  k.use('timber');
  const cb = hex(0x8d8474, 0.42);
  k.quad([0, SOFFIT + 0.16, -ARCADE], [w, SOFFIT + 0.16, -ARCADE], [w, SOFFIT + 0.16, -PIER], [0, SOFFIT + 0.16, -PIER], [shade(cb, 0.8), shade(cb, 0.8), cb, cb]);
  if (k.detail) for (let x = 0.3; x < w - 0.1; x += 0.52) k.box(x - 0.04, x + 0.04, SOFFIT, SOFFIT + 0.16, -ARCADE, -PIER, hex(0x6f6557, 0.5), 'y+z+z-');
  // bressummer over the piers
  k.use('plaster');
  k.box(0, w, F1 - 0.5, F1, -PIER, 0, s.wall, 'x+x-y+');
  // party walls with an arched walk-through on each side
  const side = (left: boolean) => {
    const col = shade(s.wall, 0.6);
    const sq = s.sideArch === undefined ? rnd(s.seed, 17) < 0.45 : !s.sideArch;
    const ops: Opening[] = [{ x0: left ? 0.72 : -ARCADE + 0.25, x1: left ? ARCADE - 0.25 : -0.72, y0: KERB, y1: sq ? 2.6 : 2.72, arch: sq ? 0 : 0.55 }];
    k.at({ x: left ? 0.12 : w - 0.12, ry: left ? Math.PI / 2 : -Math.PI / 2 }, () => {
      k.wall(left ? PIER : -ARCADE, left ? ARCADE : -PIER, KERB, SOFFIT + 0.16, 0, 0.12, ops, col, shade(col, 0.85), 0.8);
    });
  };
  side(true); side(false);
  // piers (half a pier at each lot boundary; neighbours complete it)
  pier(k, s, 0, PIER / 2, !s.exposedL, false);
  pier(k, s, w - PIER / 2, w, false, !s.exposedR);
}

function shutterLeaf(k: Kit, s: LotSpec, hingeX: number, y0: number, y1: number, lw: number, dir: 1 | -1, open: number, z: number): void {
  // A leaf hinged at hingeX, swinging outward by `open` radians. dir = +1: leaf extends toward +x when closed.
  k.at({ x: hingeX, z, ry: dir * open }, () => {
    const a = dir > 0 ? 0 : -lw, b = dir > 0 ? lw : 0;
    k.use('paint');
    const fr = s.joinery;
    k.box(a, b, y0, y0 + 0.07, -0.02, 0.02, fr); k.box(a, b, y1 - 0.07, y1, -0.02, 0.02, fr);
    k.box(a, a + 0.06, y0, y1, -0.02, 0.02, fr); k.box(b - 0.06, b, y0, y1, -0.02, 0.02, fr);
    k.box(a, b, (y0 + y1) / 2 - 0.03, (y0 + y1) / 2 + 0.03, -0.02, 0.02, fr);
    k.use('louvre');
    k.quad([a + 0.06, y0 + 0.07, 0.008], [b - 0.06, y0 + 0.07, 0.008], [b - 0.06, y1 - 0.07, 0.008], [a + 0.06, y1 - 0.07, 0.008], shade(fr, 0.95));
    k.quad([b - 0.06, y0 + 0.07, -0.008], [a + 0.06, y0 + 0.07, -0.008], [a + 0.06, y1 - 0.07, -0.008], [b - 0.06, y1 - 0.07, -0.008], shade(fr, 0.8));
  });
}

export function acUnit(k: Kit, x: number, y: number, z: number): void {
  k.use('paint');
  const c = hex(0xd9dad6);
  k.box(x - 0.42, x + 0.42, y, y + 0.56, z, z + 0.3, c, '', 0.85);
  k.box(x - 0.46, x + 0.46, y - 0.05, y, z, z + 0.34, hex(0x555a5e));
  const pts: V3[] = [];
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; pts.push([x - 0.1 + Math.cos(a) * 0.2, y + 0.28 + Math.sin(a) * 0.2, z + 0.305]); }
  k.poly(pts, hex(0x2c3033));
  k.tube([[x + 0.3, y + 0.3, z], [x + 0.3, y + 0.3, z - 0.02], [x + 0.36, y - 0.6, z + 0.02]], 0.02, 5, hex(0xcfcfc8));
}

function upper(k: Kit, s: LotSpec): void {
  const w = s.w, top = eaveY(s);
  const pil = 0.26, m = pil + 0.32;
  for (let st = 1; st < s.storeys; st++) {
    const fy = F1 + UP * (st - 1), band = s.win === 'band', n = band ? 1 : s.windows;
    const ww = band ? w - 2 * m - 0.24 : Math.min(1.15, (w - 2 * m) / n - 0.5), gap = (w - 2 * m - n * ww) / n;
    const french = s.win === 'louvre' && rnd(s.seed, 20) < 0.5;
    const sill = fy + (french ? 0.18 : 0.85), head = fy + (s.win === 'arched' ? 2.62 : 2.42);
    const ops: Opening[] = [];
    for (let i = 0; i < n; i++) { const x0 = m + gap / 2 + i * (ww + gap); ops.push({ x0, x1: x0 + ww, y0: sill, y1: head, arch: s.win === 'arched' ? ww * 0.42 : 0 }); }
    k.use('plaster');
    k.wall(0, w, fy, fy + UP, 0, 0.26, ops, s.wall, shade(s.wall, 0.68));
    for (let i = 0; i < n; i++) {
      const o = ops[i], zi = -0.2, hs = o.arch ? o.y1 - o.arch : o.y1;
      // glazing / dark room behind
      k.use('glass');
      k.quad([o.x0, o.y0, zi], [o.x1, o.y0, zi], [o.x1, o.y1, zi], [o.x0, o.y1, zi], hex(0x33424a, 0.6));
      k.use('paint');
      const fr = s.win === 'slider' ? hex(0xaeb3b6) : shade(s.joinery, 0.9);
      // casement frame and glazing bars inside the reveal
      k.box(o.x0, o.x1, o.y0, o.y0 + 0.06, zi, zi + 0.05, fr); k.box(o.x0, o.x1, hs - 0.06, hs, zi, zi + 0.05, fr);
      k.box(o.x0, o.x0 + 0.05, o.y0, hs, zi, zi + 0.05, fr); k.box(o.x1 - 0.05, o.x1, o.y0, hs, zi, zi + 0.05, fr);
      k.box((o.x0 + o.x1) / 2 - 0.025, (o.x0 + o.x1) / 2 + 0.025, o.y0, hs, zi, zi + 0.05, fr);
      if (s.win !== 'slider') k.box(o.x0, o.x1, (o.y0 + hs) / 2 + 0.2, (o.y0 + hs) / 2 + 0.24, zi, zi + 0.04, fr);
      if (band) { const nb = Math.max(4, Math.round(ww / 0.62)); for (let q = 1; q < nb; q++) { const x = o.x0 + (ww * q) / nb; if (Math.abs(x - (o.x0 + o.x1) / 2) > 0.05) k.box(x - 0.022, x + 0.022, o.y0, hs, zi, zi + 0.05, fr); } k.box(o.x0, o.x1, hs - 0.5, hs - 0.46, zi, zi + 0.045, fr); }
      if (o.arch) for (let q = 1; q < 4; q++) { const a = (q / 4) * Math.PI, cx = (o.x0 + o.x1) / 2; k.tube([[cx, hs, zi + 0.02], [cx + Math.cos(a) * ww * 0.5, hs + Math.sin(a) * o.arch, zi + 0.02]], 0.015, 4, fr); }
      // sill with a drip, architrave, hood
      k.use('plaster');
      if (!french) k.prism([[0, o.y0 - 0.1], [0.13, o.y0 - 0.1], [0.13, o.y0 - 0.03], [0.1, o.y0], [0, o.y0]], o.x0 - 0.1, o.x1 + 0.1, s.trim);
      if (s.hoods && !o.arch) k.prism([[0, o.y1 + 0.1], [0.1, o.y1 + 0.1], [0.16, o.y1 + 0.2], [0.16, o.y1 + 0.24], [0, o.y1 + 0.24]], o.x0 - 0.14, o.x1 + 0.14, s.trim);
      if (s.hoods || o.arch) for (const sx of [o.x0 - 0.1, o.x1 + 0.02]) k.box(sx, sx + 0.08, o.y0, hs, 0, 0.035, s.trim, 'z-');
      if (o.arch) k.box((o.x0 + o.x1) / 2 - 0.09, (o.x0 + o.x1) / 2 + 0.09, o.y1 - 0.02, o.y1 + 0.2, 0, 0.06, s.trim, 'z-');
      // shutters or balustrade
      if (s.win === 'louvre' || s.win === 'arched') {
        const r = rnd(s.seed, 40 + st * 9 + i);
        const open = r < 0.3 ? 0.04 : r < 0.6 ? 1.35 + rnd(s.seed, i, 3) * 0.5 : 2.9;
        const openR = rnd(s.seed, 50 + st * 9 + i) < 0.75 ? open : 0.04;
        shutterLeaf(k, s, o.x0 + 0.01, o.y0 + 0.02, hs - 0.02, ww / 2 - 0.01, 1, -open, -0.03);
        shutterLeaf(k, s, o.x1 - 0.01, o.y0 + 0.02, hs - 0.02, ww / 2 - 0.01, -1, -openR, -0.03);
      }
      if (french) {
        k.use('paint');
        const bc = shade(s.joinery, 0.8);
        k.box(o.x0, o.x1, o.y0 + 0.78, o.y0 + 0.83, -0.1, -0.06, bc);
        for (let x = o.x0 + 0.08; x < o.x1 - 0.02; x += 0.115) k.box(x - 0.012, x + 0.012, o.y0, o.y0 + 0.78, -0.095, -0.07, bc, 'y+y-');
      }
      if (s.ac > 0 && st === 1 && i === (s.seed % n) && !french) acUnit(k, (o.x0 + o.x1) / 2, o.y0 - 0.78, 0.02);
    }
    // string course at the floor line
    k.use('plaster');
    k.prism([[0, fy - 0.06], [0.06, fy - 0.06], [0.12, fy + 0.02], [0.12, fy + 0.08], [0.05, fy + 0.12], [0, fy + 0.12]], 0, w, s.trim, false);
  }
  // pilasters with capitals up the lot edges
  k.use('plaster');
  if (s.storeys > 1) for (const [a, b] of [[0, pil], [w - pil, w]]) {
    k.box(a, b, F1 + 0.12, top - 0.3, 0, 0.07, s.wall, 'z-y-y+' + (a === 0 && !s.exposedL ? 'x-' : '') + (a !== 0 && !s.exposedR ? 'x+' : ''));
    k.box(a - (a === 0 ? 0 : 0.03), b + (a === 0 ? 0.03 : 0), top - 0.42, top - 0.3, 0, 0.1, s.trim, 'z-');
  }
  // eave cornice
  k.prism([[0, top - 0.3], [0.08, top - 0.3], [0.1, top - 0.2], [0.2, top - 0.1], [0.2, top], [0, top]], 0, w, s.trim, false);
}

function roof(k: Kit, s: LotSpec): void {
  const w = s.w, top = eaveY(s);
  const pitch = s.roof === 'tile' ? 0.5 : 0.3;
  const mods = Math.max(1, Math.round(s.depth / 9.5)), half = s.depth / mods / 2, rise = half * pitch;
  const over = s.parapet ? 0 : 0.5;
  const tc = s.roof === 'tile' ? hex([0xa5523a, 0x96482f, 0xb05f43, 0x8c4a37][s.seed % 4], 0.9) : hex(0xa9aeb0, 0.8);
  const y = (z: number): number => { // roof surface height at depth z (z <= over)
    const d = Math.max(0, -z), i = Math.min(mods - 1, Math.floor(d / (2 * half))), t = d - i * 2 * half;
    return top + (z > 0 ? -z * pitch : (t < half ? t : 2 * half - t) * pitch) + 0.06;
  };
  k.use(s.roof);
  for (let i = 0; i < mods; i++) {
    const za = -i * 2 * half, zr = za - half, zb = za - 2 * half, zf = i === 0 ? over : za;
    k.quad([0, y(zf), zf], [w, y(zf), zf], [w, top + rise + 0.06, zr], [0, top + rise + 0.06, zr], tc);
    k.quad([w, top + 0.06, zb], [0, top + 0.06, zb], [0, top + rise + 0.06, zr], [w, top + rise + 0.06, zr], shade(tc, 0.92));
    // ridge cap
    k.use('plaster');
    k.prism([[zr - 0.13, top + rise + 0.02], [zr + 0.13, top + rise + 0.02], [zr + 0.07, top + rise + 0.17], [zr - 0.07, top + rise + 0.17]], 0, w, hex(0xb9b2a4, 0.9), false);
    k.use(s.roof);
  }
  if (!s.parapet) {
    // eave: fascia board, rafter tails, underside, gutter and downpipe
    k.use('timber');
    const ey = y(over);
    k.box(0, w, ey - 0.2, ey - 0.02, over - 0.03, over, hex(0x4f4338), 'x+x-');
    k.quad([w, ey - 0.06, over], [0, ey - 0.06, over], [0, top + 0.02, 0.2], [w, top + 0.02, 0.2], hex(0x5d5245, 0.6));
    if (k.detail) for (let x = 0.25; x < w; x += 0.48) k.box(x - 0.03, x + 0.03, ey - 0.2, ey - 0.07, 0.2, over - 0.03, hex(0x4a3f35, 0.8), 'z+z-y+');
    k.use('paint');
    const gc = hex(0x8b9093);
    k.prism([[over, ey - 0.16], [over + 0.1, ey - 0.16], [over + 0.13, ey - 0.06], [over + 0.11, ey - 0.06], [over + 0.09, ey - 0.13], [over + 0.01, ey - 0.13]], 0, w, gc, false);
    if (rnd(s.seed, 70) < 0.6) k.tube([[0.2, ey - 0.14, over + 0.06], [0.2, ey - 0.4, 0.14], [0.2, F1 + 0.3, 0.12], [0.2, F1 - 0.2, 0.06], [0.2, 0.3, 0.06]], 0.04, 6, gc);
  } else {
    // parapet wall with coping, hiding the roof from the street
    k.use('plaster');
    k.box(0, w, top, top + 0.95, -0.26, 0, s.wall, 'y-x+x-');
    k.prism([[-0.3, top + 0.95], [0.06, top + 0.95], [0.06, top + 1.03], [-0.3, top + 1.03]], 0, w, s.trim, false);
    k.box(w / 2 - 0.9, w / 2 + 0.9, top + 1.03, top + 1.45, -0.24, 0.02, s.wall, 'y-');
    k.prism([[-0.28, top + 1.45], [0.07, top + 1.45], [0.07, top + 1.53], [-0.28, top + 1.53]], w / 2 - 0.98, w / 2 + 0.98, s.trim);
  }
  // party-wall parapets following the roof, and exposed gable ends
  k.use('plaster');
  const pc = hex(0xc9c4b6, 0.9);
  const N = mods * 2;
  for (const [xa, xb, exposed] of [[0, 0.11, s.exposedL], [w - 0.11, w, s.exposedR]] as [number, number, boolean][]) {
    for (let i = 0; i < N; i++) {
      const z0 = -i * half, z1 = z0 - half, y0 = y(z0) + 0.3, y1 = y(z1) + 0.3;
      k.quad([xa, y0, z0], [xb, y0, z0], [xb, y1, z1], [xa, y1, z1], pc);
      const xi = xa === 0 ? xb : xa, dir = xa === 0 ? 1 : -1;
      const a: V3 = [xi, y(z0) - 0.05, z0], b: V3 = [xi, y(z1) - 0.05, z1], c: V3 = [xi, y1, z1], d: V3 = [xi, y0, z0];
      if (dir > 0) k.quad(a, b, c, d, shade(pc, 0.85)); else k.quad(b, a, d, c, shade(pc, 0.85));
      if (exposed) {
        const xo = xa === 0 ? 0 : w;
        const A: V3 = [xo, top, z0], B: V3 = [xo, top, z1], C: V3 = [xo, y1, z1], D: V3 = [xo, y0, z0];
        if (xa === 0) k.quad(B, A, D, C, s.wall); else k.quad(A, B, C, D, s.wall);
      }
    }
  }
}

function shell(k: Kit, s: LotSpec): void {
  // Back wall and exposed side walls below the eave: plain plaster with a few real window openings.
  const w = s.w, top = eaveY(s), d = s.depth;
  k.use('plaster');
  k.at({ x: w, z: -d, ry: Math.PI }, () => k.wall(0, w, 0, top, 0, 0.2, [], shade(s.wall, 0.9), undefined, 0.7));
  const side = (left: boolean) => {
    k.at({ x: left ? 0 : w, z: left ? -d : 0, ry: left ? -Math.PI / 2 : Math.PI / 2 }, () => {
      const ops: Opening[] = [];
      for (let st = 1; st < s.storeys; st++) for (let i = 0; i < Math.floor(d / 4.2); i++) {
        if (rnd(s.seed, 80 + st * 11 + i) < 0.3) continue;
        const x0 = 3.2 + i * 4.2; if (x0 + 1 > d - 0.6) break;
        ops.push({ x0, x1: x0 + 1.0, y0: F1 + UP * (st - 1) + 0.95, y1: F1 + UP * (st - 1) + 2.25 });
      }
      // side wall runs from the frontage to the back; the arcade end is open below the bressummer
      k.wall(left ? 0 : ARCADE, left ? d - ARCADE : d, 0, F1, 0, 0.2, [], s.wall, undefined, 0.7);
      k.wall(0, d, F1, top, 0, 0.24, ops, s.wall, shade(s.wall, 0.66));
      for (const o of ops) {
        k.use('glass');
        k.quad([o.x0, o.y0, -0.18], [o.x1, o.y0, -0.18], [o.x1, o.y1, -0.18], [o.x0, o.y1, -0.18], hex(0x33424a, 0.6));
        k.use('paint');
        const fr = hex(0x8a8f8c);
        k.box(o.x0, o.x1, o.y0, o.y0 + 0.05, -0.18, -0.13, fr); k.box((o.x0 + o.x1) / 2 - 0.02, (o.x0 + o.x1) / 2 + 0.02, o.y0, o.y1, -0.18, -0.13, fr);
        k.use('plaster');
        k.prism([[0, o.y0 - 0.09], [0.11, o.y0 - 0.09], [0.11, o.y0], [0, o.y0]], o.x0 - 0.08, o.x1 + 0.08, s.trim);
        k.prism([[0, o.y1 + 0.02], [0.14, o.y1 + 0.06], [0.14, o.y1 + 0.11], [0, o.y1 + 0.11]], o.x0 - 0.1, o.x1 + 0.1, s.trim);
      }
    });
  };
  if (s.exposedL) side(true);
  if (s.exposedR) side(false);
}

function dressing(k: Kit, s: LotSpec, signs: SignSource | null): void {
  const w = s.w;
  if (s.blinds) {
    // Roll-up sun blind hung from the bressummer between the piers.
    const drop = 0.35 + rnd(s.seed, 90) * 0.75, y1 = F1 - 0.52, y0 = y1 - drop;
    const c = hex([0xd9cfae, 0x7f9a86, 0xc8b78f, 0x8fa0a8][s.seed % 4]);
    k.use('fabric');
    k.quad([PIER / 2 + 0.05, y0, -0.08], [w - PIER / 2 - 0.05, y0, -0.08], [w - PIER / 2 - 0.05, y1, -0.08], [PIER / 2 + 0.05, y1, -0.08], [shade(c, 0.85), shade(c, 0.85), c, c]);
    k.use('paint');
    k.tube([[PIER / 2 + 0.02, y0, -0.08], [w - PIER / 2 - 0.02, y0, -0.08]], 0.035, 6, shade(c, 0.7));
  }
  if (signs && s.hang) {
    const hgt = Math.min(1.7, 0.34 * s.hang.text.length + 0.2), wd = 0.42, x = w - 0.02, y = F1 + 0.5;
    const uv = signs.rect(s.hang.text, s.hang.fg, s.hang.bg, wd / hgt, true);
    k.use('paint');
    k.box(x - 0.03, x + 0.03, y, y + hgt, 0.12, 0.12 + wd, hex(0x2c2c2c));
    k.box(x - 0.015, x + 0.015, y + hgt - 0.1, y + hgt - 0.06, 0, 0.14, hex(0x333333));
    k.use('sign');
    k.quad([x + 0.032, y, 0.12 + wd], [x + 0.032, y, 0.12], [x + 0.032, y + hgt, 0.12], [x + 0.032, y + hgt, 0.12 + wd], [1, 1, 1], uv);
    k.quad([x - 0.032, y, 0.12], [x - 0.032, y, 0.12 + wd], [x - 0.032, y + hgt, 0.12 + wd], [x - 0.032, y + hgt, 0.12], [1, 1, 1], uv);
  }
  if (s.awning) {
    // Sloping canvas awning on steel stays, projecting over the kerb.
    const y1 = F1 - 0.35, y0 = y1 - 0.75, z1 = 1.45;
    k.use('fabric');
    const n = 6;
    for (let i = 0; i < n; i++) { const xa = 0.3 + ((w - 0.6) * i) / n, xb = 0.3 + ((w - 0.6) * (i + 1)) / n, c = i % 2 || s.awningPlain ? shade(s.awning, s.awningPlain ? 0.94 + 0.06 * (i % 2) : 1) : mix(s.awning, hex(0xf1ede0), 0.8); k.quad([xa, y0, z1], [xb, y0, z1], [xb, y1, 0.04], [xa, y1, 0.04], c); k.quad([xa, y0 - 0.16, z1], [xb, y0 - 0.16, z1], [xb, y0, z1], [xa, y0, z1], shade(c, 0.9)); }
    k.use('paint');
    for (const x of [0.3, w - 0.3]) k.tube([[x, y0, z1], [x, y1 - 0.5, 0.05]], 0.015, 4, hex(0x666a6e));
  }
  if (!k.detail) return;
  // potted plants at the pier foot
  for (let i = 0; i < s.plants; i++) {
    const x = (i ? w - 0.75 - rnd(s.seed, 95) * 0.4 : 0.7 + rnd(s.seed, 96) * 0.4), z = -0.25 - rnd(s.seed, 97 + i) * 0.2, sc = 0.7 + rnd(s.seed, 98 + i) * 0.5;
    k.use('paint');
    k.lathe(x, z, [[0.13 * sc, KERB], [0.2 * sc, KERB + 0.34 * sc], [0.22 * sc, KERB + 0.36 * sc]], 8, hex([0x8a4a34, 0x3f5f8a, 0x6f6f6a][i % 3]));
    k.use('foliage');
    const g = hex(0x3f7a3c);
    for (let j = 0; j < 16; j++) { const a = rnd(s.seed, j, 5) * 6.283, rr = (0.08 + 0.26 * Math.sqrt(rnd(s.seed, j, 6))) * sc, v = rnd(s.seed, j, 7); k.sphere(x + Math.cos(a) * rr * (1 - v * 0.4), KERB + (0.45 + v * 0.75) * sc, z + Math.sin(a) * rr * (1 - v * 0.4), (0.07 + rnd(s.seed, j, 8) * 0.09) * sc, 5, 3, shade(g, 0.55 + rnd(s.seed, j, 9) * 0.8), 0.7); }
  }
  if (s.bin) {
    // Green wheelie bin at the kerb (seen along the whole street in the reference photographs).
    const x = w * 0.5 + 0.9, z = 0.45;
    k.use('paint');
    const g = hex(0x2f7a45);
    k.box(x - 0.28, x + 0.28, 0.1, 0.98, z - 0.3, z + 0.3, g, 'y-', 0.7);
    k.box(x - 0.31, x + 0.31, 0.98, 1.05, z - 0.34, z + 0.34, shade(g, 0.85));
    for (const sx of [-0.24, 0.24]) k.at({ x: x + sx, y: 0.1, z: z - 0.26, rz: Math.PI / 2 }, () => k.cyl(0, 0, -0.03, 0.03, 0.1, 0.1, 8, hex(0x1c1c1c)));
  }
  // fluorescent tube under the arcade ceiling
  k.use('glow');
  k.box(w / 2 - 0.6, w / 2 + 0.6, SOFFIT - 0.06, SOFFIT - 0.02, -1.3, -1.24, hex(0xe9ece4, 0.55));
}

/** Build one lot in the current kit frame. */
export function buildLot(k: Kit, s: LotSpec, signs: SignSource | null): void {
  arcade(k, s);
  shopfront(k, s, signs);
  upper(k, s);
  roof(k, s);
  shell(k, s);
  dressing(k, s, signs);
}
