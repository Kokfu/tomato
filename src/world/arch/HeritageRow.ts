import { assertGeneric } from '../landmarks/protect.ts';
import * as THREE from 'three';
import type { BuildingData } from '../types.ts';
import type { GeoBuf } from '../Materials.ts';
import type { BuildContext } from '../ChunkManager.ts';
import { ARCADE_DEPTH, edgeOutward, insetEdges, pointInRingFlat, ringArea2 } from './frontage.ts';
import { quad, rowFrame } from './Shophouse.ts';
import type { RowFrame } from './Shophouse.ts';
import { HT, HT_WHITE, htSub, htUV } from './HeritageAtlas.ts';
import { FRONT, STYLE, planFront } from '../district/mainBazaar.ts';
import type { Lot } from '../district/mainBazaar.ts';
import { ITEM, lotFloor, lotItems } from '../district/frontLayout.ts';
import { blob } from '../district/Dressing.ts';

// High-fidelity shophouse rows for the Main Bazaar test district. Unlike arch/Shophouse.ts (flat
// painted facades), every lot here is modelled: masonry piers, a raised five-foot way, an open
// shopfront with a lit interior, recessed windows with hinged louvre shutters, awnings, cornices,
// parapets or tiled eaves, per-lot roof heights and the goods shops stack outside.
//
// Real: block outline, frontage edges, lot count (see district/mainBazaar.ts).
// Approximate: each lot's style, colours and storey count unless the lot is "described".

type P3 = [number, number, number];
/** Heights above the block's ground datum (metres). */
export const HH = { floor: 0.14, beam0: 3.05, beam1: 3.85, upper: 3.25, upper3: 3.05 };
const D = ARCADE_DEPTH;

export function lotTop(lot: Lot): number {
  return HH.beam1 + HH.upper + (lot.storeys === 3 ? HH.upper3 : 0);
}
/** Height of the parapet above the eaves line for a lot (0 = tiled eave, no parapet). */
function parapet(lot: Lot): number {
  return lot.style === STYLE.vernacular ? 0 : lot.style === STYLE.straits ? 0.95 : lot.style === STYLE.deco ? 1.15 : 0.6;
}

const c1 = new THREE.Color(), c2 = new THREE.Color(), c3 = new THREE.Color();
const hex = (c: THREE.Color, h: number, m = 1) => c.setHex(h).multiplyScalar(m);
const rgb = (c: THREE.Color, r: number, g: number, b: number) => c.setRGB(r, g, b);

/** Local frame of one lot: a = metres along the frontage, d = depth behind the street face, y = height. */
class Frame {
  constructor(readonly buf: GeoBuf, readonly x0: number, readonly z0: number, readonly ex: number, readonly ez: number, readonly nx: number, readonly nz: number) {}
  p(a: number, d: number, y: number): P3 {
    return [this.x0 + this.ex * a - this.nx * d, y, this.z0 + this.ez * a - this.nz * d];
  }
  /** Vertical quad facing the street at depth d. */
  face(a0: number, a1: number, y0: number, y1: number, d: number, col: THREE.Color, uv: readonly number[] = HT_WHITE): void {
    if (a1 - a0 < 1e-3 || y1 - y0 < 1e-3) return;
    quad(this.buf, this.p(a0, d, y0), this.p(a1, d, y0), this.p(a1, d, y1), this.p(a0, d, y1), this.nx, 0, this.nz, col, uv);
  }
  /** Vertical quad across the frontage at position a, facing along +e (dir 1) or -e (dir -1). */
  side(a: number, d0: number, d1: number, y0: number, y1: number, dir: number, col: THREE.Color, uv: readonly number[] = HT_WHITE): void {
    quad(this.buf, this.p(a, d0, y0), this.p(a, d1, y0), this.p(a, d1, y1), this.p(a, d0, y1), this.ex * dir, 0, this.ez * dir, col, uv);
  }
  /** Horizontal quad facing up (dir 1) or down (dir -1). */
  flat(a0: number, a1: number, d0: number, d1: number, y: number, dir: number, col: THREE.Color, uv: readonly number[] = HT_WHITE): void {
    quad(this.buf, this.p(a0, d0, y), this.p(a1, d0, y), this.p(a1, d1, y), this.p(a0, d1, y), 0, dir, 0, col, uv);
  }
  /** Box (no bottom). d0 is the street-side face. */
  box(a0: number, a1: number, d0: number, d1: number, y0: number, y1: number, col: THREE.Color, uv: readonly number[] = HT_WHITE, top = true): void {
    this.face(a0, a1, y0, y1, d0, col, uv);
    quad(this.buf, this.p(a1, d1, y0), this.p(a0, d1, y0), this.p(a0, d1, y1), this.p(a1, d1, y1), -this.nx, 0, -this.nz, col, uv);
    this.side(a0, d0, d1, y0, y1, -1, col, uv);
    this.side(a1, d0, d1, y0, y1, 1, col, uv);
    if (top) this.flat(a0, a1, d0, d1, y1, 1, col, uv);
  }
  /** Sloping quad from (d0, y0) to (d1, y1) across a0..a1 (awnings, eaves). */
  slope(a0: number, a1: number, d0: number, y0: number, d1: number, y1: number, col: THREE.Color, uv: readonly number[] = HT_WHITE): void {
    const run = d1 - d0, rise = y1 - y0, l = Math.hypot(run, rise) || 1;
    // Upward-facing normal of the slope.
    let ny = Math.abs(run) / l, k = (rise / l) * Math.sign(run || 1);
    quad(this.buf, this.p(a0, d0, y0), this.p(a1, d0, y0), this.p(a1, d1, y1), this.p(a0, d1, y1), this.nx * k, ny, this.nz * k, col, uv);
  }
}

interface Win { a0: number; a1: number; y0: number; y1: number }

/** Wall from y0 to y1 across the lot with recessed openings; plaster streaks hang from vTop. */
function wallWithOpenings(f: Frame, w: number, y0: number, y1: number, vBot: number, vTop: number, wins: Win[], col: THREE.Color, reveal: THREE.Color, recess: number): void {
  const uv = (a0: number, a1: number, ya: number, yb: number) => htSub(HT.plaster, Math.max(0, a0 / w), (ya - vBot) / (vTop - vBot), Math.min(1, a1 / w), (yb - vBot) / (vTop - vBot));
  let a = 0;
  for (const o of wins) {
    f.face(a, o.a0, y0, y1, 0, col, uv(a, o.a0, y0, y1));
    f.face(o.a0, o.a1, y0, o.y0, 0, col, uv(o.a0, o.a1, y0, o.y0));
    f.face(o.a0, o.a1, o.y1, y1, 0, col, uv(o.a0, o.a1, o.y1, y1));
    f.side(o.a0, 0, recess, o.y0, o.y1, 1, reveal);
    f.side(o.a1, 0, recess, o.y0, o.y1, -1, reveal);
    f.flat(o.a0, o.a1, 0, recess, o.y0, 1, reveal);
    f.flat(o.a0, o.a1, 0, recess, o.y1, -1, reveal);
    a = o.a1;
  }
  f.face(a, w, y0, y1, 0, col, uv(a, w, y0, y1));
}

/** One hinged louvre leaf. hinge = a of the jamb, dir = -1 for the left leaf, open = 0 closed .. 1 perpendicular. */
function leaf(f: Frame, hinge: number, dir: number, lw: number, y0: number, y1: number, recess: number, open: number, col: THREE.Color): void {
  const uv = htUV(HT.louvre);
  if (open <= 0) { f.face(dir < 0 ? hinge : hinge - lw, dir < 0 ? hinge + lw : hinge, y0, y1, recess - 0.04, col, uv); return; }
  const ang = open * 2.6; // radians swung out from the closed position (past 90 degrees it folds back toward the wall)
  const aEnd = hinge - dir * lw * Math.cos(ang), dEnd = -lw * Math.sin(ang) - 0.02;
  // Leaf plane from the hinge (at the wall face) to its free edge.
  const p0 = f.p(hinge, 0, y0), p1 = f.p(aEnd, dEnd, y0), p2 = f.p(aEnd, dEnd, y1), p3 = f.p(hinge, 0, y1);
  const vx = p1[0] - p0[0], vz = p1[2] - p0[2], l = Math.hypot(vx, vz) || 1;
  quad(f.buf, p0, p1, p2, p3, (vz / l) * dir, 0, (-vx / l) * dir, col, uv);
}

function addUpper(f: Frame, lot: Lot, w: number, g: number): void {
  const levels = lot.storeys - 1;
  const top = g + lotTop(lot), base = g + HH.beam1;
  const wallC = hex(c1, lot.wall, 0.96 + ((lot.h >>> 4) % 8) / 100).clone();
  const trim = hex(c2, lot.trim).clone();
  const join = hex(c3, lot.joinery).clone();
  const reveal = wallC.clone().multiplyScalar(0.78);
  const pil = lot.style === STYLE.vernacular ? 0.3 : 0.4; // clear margin at each party wall
  const h = lot.h;
  for (let l = 0; l < levels; l++) {
    const y0 = base + (l === 0 ? 0 : HH.upper + (l - 1) * HH.upper3), y1 = l === levels - 1 ? top : y0 + HH.upper;
    const wins: Win[] = [];
    const nW = lot.style === STYLE.deco || lot.style === STYLE.modern ? 2 : 3;
    const ww = lot.style === STYLE.deco ? Math.min(1.5, (w - 2 * pil) / 2 - 0.4) : lot.style === STYLE.modern ? Math.min(1.45, (w - 2 * pil) / 2 - 0.35) : Math.min(0.98, (w - 2 * pil) / 3 - 0.28);
    const s0 = y0 + (lot.style === STYLE.vernacular ? 0.62 : lot.style === STYLE.straits ? 0.7 : 0.95);
    const s1 = y0 + (lot.style === STYLE.vernacular ? 2.42 : lot.style === STYLE.straits ? 2.2 : 2.25);
    for (let k = 0; k < nW; k++) {
      const c = pil + ((w - 2 * pil) * (k + 0.5)) / nW;
      wins.push({ a0: c - ww / 2, a1: c + ww / 2, y0: s0, y1: s1 });
    }
    const recess = lot.style === STYLE.modern ? 0.1 : 0.2;
    wallWithOpenings(f, w, y0, y1, base, top, wins, wallC, reveal, recess);
    wins.forEach((o, k) => {
      const bits = (h >>> (5 + k * 3 + l * 9)) & 7;
      const casement = lot.style === STYLE.straits && (lot.group + (h >>> 28)) % 3 === 0; // multi-pane glazed casements in painted frames
      if (casement) { f.face(o.a0, o.a1, o.y0, o.y1, recess - 0.06, join.clone().lerp(rgb(c1, 1, 1, 1), 0.55), htUV(HT.glass)); f.box(o.a0 - 0.06, o.a1 + 0.06, -0.07, 0, o.y0 - 0.08, o.y0, trim); return; }
      if (lot.style === STYLE.deco || lot.style === STYLE.modern) {
        f.face(o.a0, o.a1, o.y0, o.y1, recess, rgb(c1, 0.95, 0.95, 0.95), htUV(HT.glass));
        if (lot.style === STYLE.deco) {
          // Concrete sunshade over the window and a projecting sill: the 1930s-50s look.
          f.box(o.a0 - 0.18, o.a1 + 0.18, -0.42, 0, o.y1 + 0.04, o.y1 + 0.14, trim);
          f.box(o.a0 - 0.08, o.a1 + 0.08, -0.1, 0, o.y0 - 0.1, o.y0, trim);
        }
        return;
      }
      // Dark room behind (the upper halls are unlit by day), then the two louvre leaves.
      f.face(o.a0, o.a1, o.y0, o.y1, recess, rgb(c1, 0.16, 0.15, 0.14));
      const lw = (o.a1 - o.a0) / 2;
      const openL = bits & 1 ? 0 : bits & 2 ? 0.9 : 0.45, openR = bits & 4 ? 0 : bits & 2 ? 0.9 : 0.3;
      leaf(f, o.a0, -1, lw, o.y0, o.y1, recess, openL, join);
      leaf(f, o.a1, 1, lw, o.y0, o.y1, recess, openR, join);
      f.box(o.a0 - 0.06, o.a1 + 0.06, -0.07, 0, o.y0 - 0.08, o.y0, trim); // sill
      if (lot.style === STYLE.straits) {
        // Moulded surround and a flat hood.
        f.box(o.a0 - 0.14, o.a1 + 0.14, -0.1, 0, o.y1 + 0.02, o.y1 + 0.14, trim);
        f.box(o.a0 - 0.1, o.a0, -0.05, 0, o.y0, o.y1 + 0.02, trim, HT_WHITE, false);
        f.box(o.a1, o.a1 + 0.1, -0.05, 0, o.y0, o.y1 + 0.02, trim, HT_WHITE, false);
      } else {
        f.box(o.a0 - 0.08, o.a1 + 0.08, -0.06, 0, o.y1, o.y1 + 0.1, trim); // timber head
      }
    });
    // String course at each floor line.
    f.box(0, w, -0.09, 0, y0 - 0.02, y0 + 0.13, trim);
    if (lot.style === STYLE.deco) { f.box(0, w, -0.05, 0, s0 - 0.28, s0 - 0.2, trim); f.box(0, w, -0.05, 0, s1 + 0.3, s1 + 0.38, trim); }
  }
  // Pilasters at the party walls (shared with the neighbour: drawn at this lot's start only).
  if (lot.style !== STYLE.vernacular) f.box(-0.2, 0.2, -0.08, 0, base, top + parapet(lot), trim);
  // Top: tiled eave, or cornice + parapet.
  const pp = parapet(lot);
  if (pp > 0) {
    f.box(0, w, -0.2, 0, top - 0.16, top + 0.04, trim);
    f.box(0, w, -0.1, 0, top - 0.3, top - 0.16, trim);
    const uv = htSub(HT.plaster, 0, 0.7, 1, 1);
    f.face(0, w, top + 0.04, top + pp, 0, wallC, uv);
    quad(f.buf, f.p(w, 0.22, top), f.p(0, 0.22, top), f.p(0, 0.22, top + pp), f.p(w, 0.22, top + pp), -f.nx, 0, -f.nz, wallC, uv);
    f.box(0, w, -0.06, 0.28, top + pp, top + pp + 0.09, trim);
    if (lot.style === STYLE.straits && (h >>> 9) % 2 === 0) {
      // Small pediment in the middle of the parapet.
      f.box(w / 2 - 1.1, w / 2 + 1.1, -0.04, 0.22, top + pp + 0.09, top + pp + 0.5, wallC, uv);
      f.box(w / 2 - 0.7, w / 2 + 0.7, -0.04, 0.22, top + pp + 0.5, top + pp + 0.82, wallC, uv);
      f.box(w / 2 - 1.2, w / 2 + 1.2, -0.08, 0.26, top + pp + 0.82 - 0.36, top + pp + 0.82 - 0.3, trim);
    } else if (lot.style === STYLE.deco) {
      f.box(w / 2 - 0.9, w / 2 + 0.9, -0.05, 0.22, top + pp + 0.09, top + pp + 0.55, wallC, uv);
      f.box(w / 2 - 0.22, w / 2 + 0.22, -0.12, 0.1, top - 1.2, top + pp + 1.1, trim);
      f.box(w / 2 - 0.03, w / 2 + 0.03, -0.05, 0.01, top + pp + 1.1, top + pp + 3.0, rgb(c1, 0.75, 0.75, 0.73));
    }
  }
  // Air-conditioner condenser and a rain-water downpipe: on almost every lot.
  if ((h >>> 26) % 3 !== 0 && lot.style !== STYLE.vernacular) {
    const a = w - 1.15, y = base + 0.5;
    f.box(a, a + 0.78, -0.34, -0.02, y, y + 0.55, rgb(c1, 0.82, 0.83, 0.82));
    f.face(a + 0.08, a + 0.5, y + 0.08, y + 0.47, -0.345, rgb(c1, 0.3, 0.31, 0.32));
  }
  f.box(w - 0.14, w - 0.04, -0.1, 0, g + HH.beam0, top - 0.3, rgb(c1, 0.78, 0.77, 0.73), HT_WHITE, false);
}

function addGround(f: Frame, lot: Lot, w: number, g: number, fy: number, first: boolean, last: boolean): void {
  const b0 = g + HH.beam0, b1 = g + HH.beam1;
  const wallC = hex(c1, lot.wall, 0.95).clone();
  const trim = hex(c2, lot.trim).clone();
  const join = hex(c3, lot.joinery).clone();
  const h = lot.h;
  // Raised five-foot way: tiled floor and its kerb face.
  const ft = htUV(HT.floorTile);
  const tint = rgb(c1, 0.92 + ((h >>> 2) % 8) / 100, 0.92, 0.9).clone();
  f.flat(0, w / 2, 0, D, fy, 1, tint, [ft[0], ft[1], ft[2], ft[1] + (ft[3] - ft[1]) * 0.96]);
  f.flat(w / 2, w, 0, D, fy, 1, tint, [ft[0], ft[1], ft[2], ft[1] + (ft[3] - ft[1]) * 0.96]);
  f.face(0, w, fy - 0.6, fy, 0, rgb(c1, 0.62, 0.6, 0.56));
  // Ceiling of the walkway with the floor beam at each party wall.
  f.flat(0, w, 0, D, b0, -1, rgb(c1, 0.9, 0.89, 0.85));
  f.box(-0.12, 0.12, 0, D, b0 - 0.22, b0, trim, HT_WHITE, false);
  f.flat(-0.12, 0.12, 0, D, b0 - 0.22, -1, trim);
  // Shallow arch across the walkway at the party wall (the openings between adjoining shops).
  const AS = 6, inner0 = 0.46, span = D - inner0;
  for (let k = 0; k < AS; k++) {
    const t0 = k / AS, t1 = (k + 1) / AS;
    const drop = (t: number) => 0.22 + 0.62 * Math.pow(Math.abs(2 * t - 1), 2.6);
    quad(f.buf, f.p(0, inner0 + span * t0, b0 - drop(t0)), f.p(0, inner0 + span * t1, b0 - drop(t1)), f.p(0, inner0 + span * t1, b0), f.p(0, inner0 + span * t0, b0), f.ex, 0, f.ez, wallC, HT_WHITE);
  }

  // Shopfront on the recessed line.
  const j = 0.24, yo = fy + 2.5;
  const jamb = wallC.clone().multiplyScalar(0.92);
  f.face(0, j, fy, b0, D, jamb, htSub(HT.plaster, 0, 0, 0.1, 0.6));
  f.face(w - j, w, fy, b0, D, jamb, htSub(HT.plaster, 0.9, 0, 1, 0.6));
  if (lot.front === FRONT.doors) {
    f.face(j, w - j, fy, yo + 0.2, D, hex(c1, [0xffffff, 0xd9c9b0, 0xb9d0c0, 0xc8d4e0][(h >>> 9) % 4]), htUV(HT.timberDoor));
    f.face(j, w - j, yo + 0.2, b0, D, jamb, htSub(HT.plaster, 0.1, 0.6, 0.9, 0.75));
  } else if (lot.front === FRONT.roller) {
    f.face(j, w - j, fy, b0, D, hex(c1, [0xb9c0c4, 0x9fb3a6, 0xc9c2b0, 0x8fa3b8, 0xb8b8b6][(h >>> 9) % 5]), htUV(HT.roller));
  } else {
    const ID = 3.4;
    const tile = [HT.shopCraft, HT.shopCafe, HT.shopDry][lot.interior];
    const lit = rgb(c1, 1.75, 1.62, 1.4).clone();
    f.face(j, w - j, fy, yo, D + ID, lit, htUV(tile));
    const sideC = rgb(c1, 1.1, 1.02, 0.9).clone();
    f.side(j, D, D + ID, fy, yo, 1, sideC, htSub(tile, 0.02, 0.12, 0.6, 0.86));
    f.side(w - j, D, D + ID, fy, yo, -1, sideC, htSub(tile, 0.4, 0.12, 0.98, 0.86));
    f.flat(j, w - j, D, D + ID, fy + 0.01, 1, rgb(c1, 0.62, 0.58, 0.52), htSub(HT.floorTile, 0, 0, 1, 0.5));
    f.flat(j, w - j, D, D + ID, yo, -1, rgb(c1, 0.75, 0.72, 0.66));
    // Transom over the opening: timber ventilation bars.
    f.face(j, w - j, yo, b0, D, jamb, htSub(HT.plaster, 0.1, 0.6, 0.9, 0.75));
    f.box(j, w - j, D - 0.12, D, yo - 0.16, yo + 0.04, rgb(c1, 0.5, 0.52, 0.53));
    if (lot.front === FRONT.half) f.face(j, w - j, yo - 1.15, yo, D - 0.03, hex(c1, 0xb9c0c4), htSub(HT.roller, 0, 0.5, 1, 1));
    // Red lanterns under the beam outside dry-goods and craft shops.
    if (lot.interior !== 1 && (h >>> 21) % 2 === 0) {
      for (const a of [w * 0.3, w * 0.7]) {
        f.box(a - 0.13, a + 0.13, 0.42, 0.68, b0 - 0.62, b0 - 0.3, rgb(c1, 0.86, 0.12, 0.1));
        f.box(a - 0.07, a + 0.07, 0.48, 0.62, b0 - 0.3, b0 - 0.24, rgb(c1, 0.85, 0.68, 0.25));
        f.box(a - 0.07, a + 0.07, 0.48, 0.62, b0 - 0.68, b0 - 0.62, rgb(c1, 0.85, 0.68, 0.25));
        f.box(a - 0.008, a + 0.008, 0.545, 0.555, b0 - 0.24, b0, rgb(c1, 0.2, 0.2, 0.2), HT_WHITE, false);
      }
    }
  }

  // Fascia beam (the signboard sits here) with a shadow line under it.
  f.face(0, w, b0, b1, 0, wallC.clone().multiplyScalar(0.93), htSub(HT.plaster, 0, 0.75, 1, 1));
  f.flat(0, w, -0.001, 0.02, b0, -1, trim);

  // Awning over the street edge.
  if (lot.awning === 1) {
    const col = hex(c1, lot.awningCol).clone();
    f.slope(0.12, w - 0.12, -0.02, b0 + 0.02, -1.5, b0 - 0.5, col, htUV(HT.stripes));
    f.face(0.12, w - 0.12, b0 - 0.7, b0 - 0.5, -1.5, col, htSub(HT.stripes, 0, 0, 1, 0.2));
  } else if (lot.awning === 2) {
    f.slope(0.05, w - 0.05, -0.02, b0 + 0.04, -1.6, b0 - 0.42, rgb(c1, 0.72, 0.73, 0.72), htUV(HT.zinc));
  }
  // Chick blind rolled part-way down between the piers.
  if (lot.blind && lot.awning === 0) f.face(0.4, w - 0.4, b0 - 0.9 - ((h >>> 14) % 4) * 0.15, b0, 0.08, hex(c1, [0x7a6a45, 0x3f6b4f, 0xb9a271, 0x2f5d85][(h >>> 23) % 4]), htSub(HT.roller, 0, 0, 1, 0.5));

  // Piers and merchandise.
  for (const it of lotItems(lot, w, first, last)) {
    const a0 = it.a - it.ha, a1 = it.a + it.ha, d0 = it.d - it.hd, d1 = it.d + it.hd;
    switch (it.kind) {
      case ITEM.column: {
        const dado = (lot.group + (h >>> 30)) % 2 === 0;
        f.box(a0, a1, d0, d1, fy - 0.6, b0, wallC, htSub(HT.plaster, 0.3, 0, 0.5, 1), false);
        if (dado) f.box(a0 - 0.005, a1 + 0.005, d0 - 0.005, d1 + 0.005, fy, fy + 1.05, join.clone().multiplyScalar(0.9), HT_WHITE);
        f.box(a0 - 0.05, a1 + 0.05, d0 - 0.05, d1 + 0.05, fy - 0.6, fy + 0.16, rgb(c1, 0.7, 0.69, 0.66));
        f.box(a0 - 0.06, a1 + 0.06, d0 - 0.06, d1 + 0.06, b0 - 0.2, b0, trim, HT_WHITE, false);
        f.flat(a0 - 0.06, a1 + 0.06, d0 - 0.06, d1 + 0.06, b0 - 0.2, -1, trim);
        break;
      }
      case ITEM.pots: {
        f.box(a0 + 0.04, a1 - 0.04, d0 + 0.04, d1 - 0.04, fy, fy + 0.36, hex(c1, it.v % 2 ? 0x9a5a3c : 0x7d7468));
        const gcol = c1.setHSL(0.27 + (it.v % 7) * 0.012, 0.55, 0.22 + (it.v % 5) * 0.02).clone();
        const pc = f.p(it.a, it.d, fy + 0.7);
        blob(f.buf, pc[0], pc[1], pc[2], 0.36, 0.42, 0.36, gcol, it.v, HT_WHITE[0], HT_WHITE[1]);
        break;
      }
      case ITEM.jars:
        for (let k = 0; k < 3; k++) {
          const ja = a0 + 0.02 + k * 0.22, hh = [0.9, 0.62, 0.74][(k + it.v) % 3];
          f.box(ja, ja + 0.2, d0 + 0.05 + (k % 2) * 0.1, d0 + 0.27 + (k % 2) * 0.1, fy, fy + hh, hex(c1, [0xc9a876, 0x6b4a2f, 0x3e3a36, 0xb5653a][(k + it.v) % 4]));
        }
        break;
      case ITEM.table:
        f.box(a0, a1, d0, d1, fy, fy + it.h - 0.06, hex(c1, 0x6f5136), htUV(HT.panel));
        f.flat(a0 - 0.03, a1 + 0.03, d0 - 0.03, d1 + 0.03, fy + it.h, 1, rgb(c1, 1.25, 1.2, 1.1), htSub(HT.goods, 0, 0.5, 1, 1));
        f.face(a0 - 0.03, a1 + 0.03, fy + it.h - 0.06, fy + it.h, d0 - 0.03, hex(c1, 0x8a6a4a));
        for (let k = 0; k < 3; k++) { const ba = a0 + 0.15 + k * 0.5; f.box(ba, ba + 0.26, d0 + 0.14, d0 + 0.4, fy + it.h, fy + it.h + 0.16 + ((it.v >>> k) % 3) * 0.08, hex(c1, [0xb5482f, 0xd7ad3d, 0x2f6f8f, 0xc9a56a, 0x5d8a4a][(it.v + k * 3) % 5]), htSub(HT.goods, 0, 0, 0.2, 0.25)); }
        break;
      case ITEM.rack:
        f.box(a0, a1, d0, d1, fy, fy + it.h, rgb(c1, 1.2, 1.15, 1.05), htSub(HT.shopCraft, 0.03, 0.2, 0.5, 0.82));
        break;
      case ITEM.crates:
        f.box(a0, a1, d0, d1, fy, fy + 0.5, rgb(c1, 1, 1, 1), htUV(HT.panel));
        f.box(a0 + 0.12, a1 - 0.2, d0 + 0.04, d1 - 0.04, fy + 0.5, fy + it.h, hex(c1, 0xc9a56a), htSub(HT.goods, 0.2, 0.25, 0.6, 0.75));
        break;
      case ITEM.cafe:
        f.box(it.a - 0.05, it.a + 0.05, it.d - 0.05, it.d + 0.05, fy, fy + 0.72, rgb(c1, 0.25, 0.25, 0.25), HT_WHITE, false);
        f.box(it.a - 0.38, it.a + 0.38, it.d - 0.38, it.d + 0.38, fy + 0.72, fy + 0.76, rgb(c1, 0.9, 0.89, 0.86));
        for (const [sa, sd] of [[-0.62, 0], [0.62, 0.05], [0, -0.3]]) f.box(it.a + sa - 0.15, it.a + sa + 0.15, it.d + sd - 0.15, it.d + sd + 0.15, fy, fy + 0.45, hex(c1, it.v % 2 ? 0xb6332b : 0x2c5f86));
        break;
    }
  }
}

export interface HeritageRow { fr: RowFrame; plans: Map<number, Lot[]> }

/** Lots of every frontage edge of a district block (edge index -> lots). */
export function planRow(b: BuildingData, fr: RowFrame): Map<number, Lot[]> {
  const plans = new Map<number, Lot[]>();
  const n = fr.ring.length / 2;
  for (const i of b.a!.f) {
    const j = (i + 1) % n;
    const len = Math.hypot(fr.ring[j * 2] - fr.ring[i * 2], fr.ring[j * 2 + 1] - fr.ring[i * 2 + 1]);
    if (len >= 0.02) plans.set(i, planFront(b.id, i, len));
  }
  return plans;
}

/** Position on the sign fascia of lot-position t (0..1) of a district frontage, spanning `span` lots. */
export function heritageFascia(fr: RowFrame, buildingId: number, edge: number, t: number, span = 1): { x: number; y: number; z: number; nx: number; nz: number; ex: number; ez: number; w: number; slot: number } {
  const n = fr.ring.length / 2, j = (edge + 1) % n;
  const ax = fr.ring[edge * 2], az = fr.ring[edge * 2 + 1], bx = fr.ring[j * 2], bz = fr.ring[j * 2 + 1];
  const len = Math.hypot(bx - ax, bz - az) || 1;
  const [nx, nz] = edgeOutward(fr.ring, edge, fr.area2);
  const lots = planFront(buildingId, edge, len).length;
  const first = Math.min(lots - span, Math.max(0, Math.round(t * lots - span / 2)));
  const ct = (first + span / 2) / lots;
  return { x: ax + (bx - ax) * ct, y: fr.ground + (HH.beam0 + HH.beam1) / 2, z: az + (bz - az) * ct, nx, nz, ex: (bx - ax) / len, ez: (bz - az) / len, w: (len / lots) * span, slot: first };
}

/** Full-detail district row. Returns the frame and the lot plans (needed by the roof). */
export function addHeritageRow(b: BuildingData, ox: number, oz: number, ctx: BuildContext, buf: GeoBuf): HeritageRow {
  assertGeneric(b, 'heritage shophouse row');
  const fr = rowFrame(b, ox, oz, ctx);
  const { ring, inner, ground } = fr;
  const n = ring.length / 2;
  const plans = planRow(b, fr);
  const yBase = fr.gMin - 0.4, yBeam0 = ground + HH.beam0;
  const baseTop = ground + HH.beam1 + HH.upper;
  const simple = ctx.detail !== 'high';
  const side = hex(c3, 0xdcd6c8, 0.9 + ((b.id % 12) / 100)).clone();

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = ring[i * 2], az = ring[i * 2 + 1], bx = ring[j * 2], bz = ring[j * 2 + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.02) continue;
    const [nx, nz] = edgeOutward(ring, i, fr.area2);
    const ex = (bx - ax) / len, ez = (bz - az) / len;
    const lots = plans.get(i);
    if (!lots) {
      // Side / rear wall: stained plaster in ~5 m panels. Below the beam it follows the recessed
      // outline so the ends of the five-foot way stay open, exactly like the collision outline.
      const qax = inner[i * 2], qaz = inner[i * 2 + 1], qbx = inner[j * 2], qbz = inner[j * 2 + 1];
      const f = new Frame(buf, ax, az, ex, ez, nx, nz);
      const panels = Math.max(1, Math.round(len / 5));
      for (let k = 0; k < panels; k++) f.face((len * k) / panels, (len * (k + 1)) / panels, simple ? yBase : yBeam0, baseTop, 0, side, htUV(HT.plaster));
      if (!simple && Math.hypot(qbx - qax, qbz - qaz) > 0.05) quad(buf, [qax, yBase, qaz], [qbx, yBase, qbz], [qbx, yBeam0, qbz], [qax, yBeam0, qaz], nx, 0, nz, side, htSub(HT.plaster, 0, 0, 1, 0.4));
      continue;
    }
    const w = len / lots.length;
    lots.forEach((lot, u) => {
      const f = new Frame(buf, ax + ex * w * u, az + ez * w * u, ex, ez, nx, nz);
      if (simple) {
        // Distant rows: lot colours, the dark band of the five-foot way, true lot heights.
        f.face(0, w, yBase, yBeam0, 0, hex(c1, lot.wall, 0.42));
        f.face(0, w, yBeam0, ground + lotTop(lot) + parapet(lot), 0, hex(c1, lot.wall, 0.95), htSub(HT.plaster, 0, 0, 1, 1));
        return;
      }
      const mx = ox + ax + ex * w * (u + 0.5), mz = oz + az + ez * w * (u + 0.5);
      const fy = lotFloor((x, z) => ctx.height.sample(x, z), mx, mz, nx, nz);
      addGround(f, lot, w, ground, fy, u === 0, u === lots.length - 1);
      addUpper(f, lot, w, ground);
    });
  }
  return { fr, plans };
}

const TERRACOTTA = [0xa5573f, 0x9a4f3a, 0xb0634a, 0x8f4a38, 0x86503f, 0x7d5546];
const cR = new THREE.Color(), cW = new THREE.Color();

/**
 * Roofs of a district row: one pitched clay-tile roof per lot at that lot's own height, ridge
 * parallel to the street, party walls showing where neighbours differ, zinc roofing over the deep
 * rear of the block. Roof forms are inferred (not mapped). Returns false when the outline is too
 * shallow or irregular; the caller then falls back to the generic roof.
 */
export function addHeritageRoof(b: BuildingData, row: HeritageRow, roofs: GeoBuf, walls: GeoBuf): boolean {
  const { fr, plans } = row;
  const { ring, ground } = fr;
  const n = ring.length / 2;
  const area = Math.abs(fr.area2) / 2;
  const depth = Math.min(11, Math.sqrt(area) * 0.42);
  if (depth < 5) return false;
  const front = b.a!.f;
  const mid = insetEdges(ring, front, depth / 2), back = insetEdges(ring, front, depth);
  const backArea2 = ringArea2(back);
  if (backArea2 > 0 !== fr.area2 > 0 || Math.abs(backArea2) < Math.abs(fr.area2) * 0.2) return false;
  for (let i = 0; i < back.length; i += 2) {
    const cx = back[i], cz = back[i + 1];
    let ok = pointInRingFlat(cx, cz, ring);
    if (!ok) for (let k = 0; k < n && !ok; k++) { const j = (k + 1) % n; const ax = ring[k * 2], az = ring[k * 2 + 1], vx = ring[j * 2] - ax, vz = ring[j * 2 + 1] - az; const l2 = vx * vx + vz * vz || 1; const t = Math.max(0, Math.min(1, ((cx - ax) * vx + (cz - az) * vz) / l2)); if (Math.hypot(ax + vx * t - cx, az + vz * t - cz) < 0.2) ok = true; }
    if (!ok) return false;
  }
  const rise = depth * 0.27;
  const baseY = ground + HH.beam1 + HH.upper - 0.15;
  const slope = (p0: P3, p1: P3, p2: P3, p3: P3) => {
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2], vx = p3[0] - p0[0], vy = p3[1] - p0[1], vz = p3[2] - p0[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
    quad(roofs, p0, p1, p2, p3, nx / l, ny / l, nz / l, cR);
  };
  const isFront = new Set(front);
  for (const i of front) {
    const lots = plans.get(i);
    if (!lots) continue;
    const j = (i + 1) % n;
    const [onx, onz] = edgeOutward(ring, i, fr.area2);
    const ux = -onz, uz = onx;
    const L = (a: number[], t: number, y: number): P3 => [a[i * 2] + (a[j * 2] - a[i * 2]) * t, y, a[i * 2 + 1] + (a[j * 2 + 1] - a[i * 2 + 1]) * t];
    lots.forEach((lot, u) => {
      const t0 = u / lots.length, t1 = (u + 1) / lots.length;
      const top = ground + lotTop(lot);
      const eave = parapet(lot) === 0 ? 0.75 : 0; // tiled eaves oversail the street face
      cR.setHex(TERRACOTTA[(lot.h >>> 6) % TERRACOTTA.length]).multiplyScalar(0.78 + ((lot.h >>> 11) % 20) / 100);
      const f0 = L(ring, t0, top), f1 = L(ring, t1, top), m0 = L(mid, t0, top + rise), m1 = L(mid, t1, top + rise), b0 = L(back, t0, top), b1 = L(back, t1, top);
      if (eave > 0) {
        const drop = (eave * rise) / (depth / 2);
        const e0: P3 = [f0[0] + onx * eave, top - drop, f0[2] + onz * eave], e1: P3 = [f1[0] + onx * eave, top - drop, f1[2] + onz * eave];
        slope(e0, e1, m1, m0);
        // Timber soffit and fascia board under the oversailing eave.
        cW.setRGB(0.36, 0.26, 0.19);
        quad(walls, [f0[0], top - drop - 0.02, f0[2]], [f1[0], top - drop - 0.02, f1[2]], [e1[0], e1[1] - 0.02, e1[2]], [e0[0], e0[1] - 0.02, e0[2]], 0, -1, 0, cW);
        quad(walls, [e0[0], e0[1] - 0.16, e0[2]], [e1[0], e1[1] - 0.16, e1[2]], [e1[0], e1[1] + 0.03, e1[2]], [e0[0], e0[1] + 0.03, e0[2]], onx, 0, onz, cW);
      } else slope(f0, f1, m1, m0);
      slope(m0, m1, b1, b0);
      // Rear wall of the lot down to the flat roof behind.
      cW.setHex(0xd9d3c5);
      quad(walls, [b0[0], baseY, b0[2]], [b1[0], baseY, b1[2]], [b1[0], top, b1[2]], [b0[0], top, b0[2]], -onx, 0, -onz, cW);
      // Party / gable walls at both sides of the lot: from the neighbour's roof (or the flat rear
      // roof at a row end) up to 0.3 m above this roof.
      const sideWall = (t: number, other: Lot | undefined, dir: number, closeEnd: boolean) => {
        const oTop = other ? ground + lotTop(other) : baseY;
        if (other && oTop >= top) return; // the taller neighbour draws it
        const lo = other ? oTop - 0.05 : closeEnd ? baseY : top - 0.05;
        const pf = L(ring, t, 0), pm = L(mid, t, 0), pb = L(back, t, 0);
        cW.setHex(lot.wall).multiplyScalar(0.86);
        const up = 0.18;
        // Two trapezia (front half, rear half): bottom at `lo`, top following the roof slope.
        const a = walls.vert(pf[0], lo, pf[2], ux * dir, 0, uz * dir, cW, HT_WHITE[0], HT_WHITE[1]);
        const c = walls.vert(pm[0], lo, pm[2], ux * dir, 0, uz * dir, cW, HT_WHITE[0], HT_WHITE[1]);
        const d = walls.vert(pb[0], lo, pb[2], ux * dir, 0, uz * dir, cW, HT_WHITE[0], HT_WHITE[1]);
        const a2 = walls.vert(pf[0], top + up, pf[2], ux * dir, 0, uz * dir, cW, HT_WHITE[0], HT_WHITE[1]);
        const c2 = walls.vert(pm[0], top + rise + up, pm[2], ux * dir, 0, uz * dir, cW, HT_WHITE[0], HT_WHITE[1]);
        const d2 = walls.vert(pb[0], top + up, pb[2], ux * dir, 0, uz * dir, cW, HT_WHITE[0], HT_WHITE[1]);
        walls.tri(a, c, c2); walls.tri(a, c2, a2); walls.tri(c, d, d2); walls.tri(c, d2, c2);
      };
      const prevEdgeFront = isFront.has((i + n - 1) % n), nextEdgeFront = isFront.has(j);
      sideWall(t0, u > 0 ? lots[u - 1] : undefined, -1, !prevEdgeFront);
      sideWall(t1, u < lots.length - 1 ? lots[u + 1] : undefined, 1, !nextEdgeFront);
    });
  }
  // Rear of the block: zinc roofing a little below the eaves line.
  cR.setHex(0x8f6a5a).multiplyScalar(0.85 + ((b.id >>> 3) % 12) / 100);
  const contour: THREE.Vector2[] = [];
  for (let i = 0; i < back.length; i += 2) contour.push(new THREE.Vector2(back[i], back[i + 1]));
  let tris: number[][];
  try { tris = THREE.ShapeUtils.triangulateShape(contour, []); } catch { return true; }
  const base = roofs.count;
  for (let i = 0; i < back.length; i += 2) roofs.vert(back[i], baseY, back[i + 1], 0, 1, 0, cR);
  for (const t of tris) roofs.triUp(base + t[0], base + t[1], base + t[2]);
  return true;
}
