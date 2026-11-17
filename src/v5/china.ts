// V7 test section: Jalan China (China Street), the 88 m between Jalan Carpenter and Jalan Main Bazaar.
//
// WHY THIS STREET. The brief asked for a Main Bazaar section "with strong publicly accessible and
// appropriately licensed photographic references". Wikimedia Commons has no modern street-level
// photograph of the Main Bazaar facades (checked again for V7: category, text search and geosearch).
// Jalan China runs into Main Bazaar between No. 22 and No. 23 and IS documented: a walking sequence
// by Marufish (13 May 2015, CC BY-SA 2.0) looks down its whole length to the DUN building.
//
// REFERENCES (Wikimedia Commons, CC BY-SA 2.0, author Marufish):
//   [A] File:Kuching City (17155538163).jpg  wide view from the Carpenter Street end, both rows
//   [B] File:Kuching City (17776339811).jpg  telephoto of the same view, middle and far lots
//   [C] File:Kuching City (17588324240).jpg  the Carpenter / China Street corner (Lee Seng, street sign)
//
// WHAT IS REAL: both frontage lines (mapped block edges), hence the 8.1 m street width and the
// five-foot ways lying inside the building line; the lot a business stands in where an OpenStreetMap
// point and a photograph agree. WHAT IS FITTED: lot width. House numbers read off [A] and [B]
// (29, 27 and 21 on the west side) and address records (13 west, 14 and 34 east) fit
// number = 29 - 2 i (west, i from the corner building) and 34 - 2 i (east) with 5.5 m lots, good
// to about one lot. Each lot below says what its appearance rests on.
import { Kit, hex, shade, mix, rnd } from './kit.ts';
import type { Col, V3 } from './kit.ts';
import { autoLot, buildLot, acUnit, eaveY, ARCADE, PIER, F1, UP } from './shophouse.ts';
import type { LotSpec, SignSource } from './shophouse.ts';
import { CHINA, CHINA_WEST, CHINA_EAST } from './geo.ts';
import { buildApron, cables } from './street.ts';
import { vehicle, vehicleSize, plateFor } from './vehicles.ts';
import type { VehicleKind } from './vehicles.ts';
import { lanternString } from './landmarks/chinese.ts';

type HeightFn = (x: number, z: number) => number;
type Sign = { text: string; fg: string; bg: string };
/** Extra, reference-specific parts of a lot (all optional). */
interface Extra {
  /** Column of square plaques, one character each, projecting from the facade (goldsmith signs in [A], [B]). */
  plaques?: { chars: string; fg: string; bg: string; size: number; foot?: string; top?: 'disc' | 'plaque'; topText?: string; at?: number };
  /** Internally lit box sign projecting from the facade. `rot`: Latin text turned to read downwards. */
  lightbox?: { text: string; fg: string; bg: string; w: number; h: number; rot?: boolean; y?: number; at?: number };
  /** Characters painted on the pier face. */
  pier?: Sign;
  /** Row of air-conditioner condensers on a steel shelf above the shopfront. */
  acShelf?: number;
  /** Balconies, round columns and a gable pediment (the three-storey building in [A]). */
  balconies?: boolean;
  /** Railing round a flat roof terrace. */
  terrace?: boolean;
  /** Set-back rooftop room under a zinc roof. */
  penthouse?: boolean;
  /** Street lamp on an arm fixed to the facade. */
  lamp?: boolean;
  downpipe?: boolean;
  fern?: boolean;
}
export interface ChinaLot { no: number; spec: Partial<LotSpec>; extra?: Extra; basis: string }

const typical = 'typical: general form and colour range seen further down the street in [B]; this lot is not individually verified';
const C = { cream: 0xe6dcbd, white: 0xeceae2, yellow: 0xe3cc6c, pink: 0xe2b3a4, rose: 0xcf8d82, stone: 0xd8d2c2, grey: 0x9a968c, paleyellow: 0xe9dfae };
const J = { grey: 0xaeb6b8, green: 0x8fa79c, red: 0xa04a3c, brown: 0x6a4a37, white: 0xdcdcd4, teal: 0x5f8284 };

/** West row, from the corner building northwards (lot 0 = No. 29). */
export const WEST: ChinaLot[] = [
  { no: 29, basis: 'ref [A]: Heng Kee Goldsmith - cream wall, strip of glazed casements, deep eave, pink octagonal plaque column and pink fascia board, teal awning, grille',
    spec: { wall: hex(C.cream), joinery: hex(J.green), win: 'band', shop: 'grille', roof: 'zinc', hoods: false, blinds: false, ac: 0, awningPlain: true, awning: hex(0x1f8f86), sign: { text: '興基金鋪  KEDAI EMAS HENG KEE  29', fg: '#f6eee6', bg: '#b9697a' } },
    extra: { plaques: { chars: '興基金鋪', fg: '#f7efe8', bg: '#c2788a', size: 0.78, foot: 'HENG KEE\nGOLDSMITH\n29', top: 'plaque', topText: 'HK' }, acShelf: 1, downpipe: true } },
  { no: 27, basis: 'ref [A] + OSM node 12779002964: Ann Kee Goldsmith - yellow wall, glazed casements, flat roof terrace with green railing, yellow plaque column under a round emblem. First plaque character is cursive in [A]; shown as 安 (from the romanised name), the other three are legible',
    spec: { wall: hex(C.yellow), joinery: hex(J.white), win: 'band', shop: 'open', roof: 'zinc', parapet: true, hoods: false, blinds: false, ac: 0, sign: { text: 'KEDAI EMAS ANN KEE  27', fg: '#3f5f9a', bg: '#d9c04a' } },
    extra: { plaques: { chars: '安基金鋪', fg: '#f8e3e0', bg: '#c79a12', size: 0.74, foot: 'ANN KEE\nGOLDSMITH\n27', top: 'disc', topText: 'ANN KEE' }, terrace: true, downpipe: true } },
  { no: 25, basis: 'ref [A]: three-storey rose-pink building with a gable pediment, balconies with dark balustrades, round terracotta columns, large red signboard. OSM node 12779002965 (Yong Hu Goldsmith) falls in this lot; the 2015 board is not legible, so it carries no text',
    spec: { storeys: 3, wall: hex(C.rose), trim: hex(0xe9dccd), joinery: hex(0x4a3028), win: 'louvre', windows: 2, shop: 'grille', roof: 'zinc', parapet: true, hoods: false, blinds: false, ac: 0, dado: hex(0xd9a79b) },
    extra: { balconies: true } },
  { no: 23, basis: 'ref [A], [B]: two storeys, pale cream, three pale grey louvred shutters, white signboard over the shopfront (a barber; wording not legible, left blank)',
    spec: { wall: hex(0xe9dfcc), joinery: hex(J.grey), win: 'louvre', windows: 3, shop: 'roller', roof: 'tile', hoods: false, blinds: false, ac: 0, sign: { text: ' ', fg: '#a33', bg: '#f1eee6' } }, extra: { downpipe: true } },
  { no: 21, basis: 'ref [B] + OSM node 12779002967: pink wall, two louvred shutters, "21" board, blue vertical sign of Kedai Jam Chan Chong (watch dealer, 泉昌)',
    spec: { wall: hex(C.pink), joinery: hex(J.grey), win: 'louvre', windows: 2, shop: 'open', roof: 'tile', hoods: false, blinds: false, ac: 1, sign: { text: '21', fg: '#f2e6d0', bg: '#6b4a3a' } },
    extra: { lightbox: { text: '泉昌', fg: '#ffffff', bg: '#1f55a8', w: 0.5, h: 1.5, y: 1.5 }, downpipe: true } },
  { no: 19, basis: 'ref [B] + OSM node 12779002962: cream wall, casements, air-conditioners, yellow vertical sign 永春堂 (Buan Choon Tng, chemist)',
    spec: { wall: hex(C.cream), joinery: hex(J.white), win: 'casement', windows: 2, shop: 'open', roof: 'tile', hoods: false, blinds: false, ac: 1, sign: { text: 'Buan Choon Tng', fg: '#f6efe0', bg: '#2c6a9a' } },
    extra: { lightbox: { text: '永春堂', fg: '#b3261e', bg: '#e9b92c', w: 0.6, h: 1.7 } } },
  { no: 17, basis: 'OSM node 12779002963 (Yong Hong Tong, herbalist) by position; facade ' + typical,
    spec: { wall: hex(C.white), joinery: hex(J.brown), win: 'louvre', windows: 2, shop: 'open', roof: 'zinc', blinds: true, sign: { text: 'Yong Hong Tong', fg: '#f6e7b0', bg: '#3a2a1e' } } },
  { no: 15, basis: typical, spec: { wall: hex(C.stone), joinery: hex(J.teal), win: 'casement', windows: 2, shop: 'roller', roof: 'tile', ac: 1 } },
  { no: 13, basis: 'ref [B] + address record "No. 13, China St": white vertical box sign 麗興 Lee Heng Jewellers & Goldsmiths; facade ' + typical,
    spec: { wall: hex(C.cream), joinery: hex(J.grey), win: 'louvre', windows: 2, shop: 'grille', roof: 'tile', hoods: false, sign: { text: 'LEE HENG JEWELLERS & GOLDSMITHS', fg: '#8c1c15', bg: '#f1eee6' } },
    extra: { lightbox: { text: '麗興', fg: '#b3261e', bg: '#f4f1ea', w: 0.62, h: 1.5 } } },
  { no: 11, basis: typical, spec: { wall: hex(C.white), joinery: hex(J.green), win: 'louvre', windows: 2, shop: 'folding', roof: 'zinc' } },
  { no: 9, basis: typical, spec: { wall: hex(C.paleyellow), joinery: hex(J.brown), win: 'casement', windows: 2, shop: 'open', roof: 'tile', blinds: true } },
  { no: 7, basis: typical, spec: { wall: hex(C.cream), joinery: hex(J.grey), win: 'louvre', windows: 2, shop: 'roller', roof: 'zinc', ac: 1 } },
  { no: 5, basis: typical, spec: { wall: hex(C.white), joinery: hex(J.teal), win: 'louvre', windows: 2, shop: 'open', roof: 'tile' } },
  { no: 3, basis: typical, spec: { wall: hex(C.stone), joinery: hex(J.brown), win: 'casement', windows: 2, shop: 'grille', roof: 'tile' } },
  { no: 1, basis: typical, spec: { wall: hex(C.cream), joinery: hex(J.green), win: 'louvre', windows: 2, shop: 'open', roof: 'zinc' } },
];

/** East row, from the Carpenter Street corner northwards (lot 0 = No. 34). */
export const EAST: ChinaLot[] = [
  { no: 34, basis: 'address record "34 Jalan China" (Cheng Chan Goldsmith) places a goldsmith at the corner; facade ' + typical,
    spec: { wall: hex(C.white), joinery: hex(J.grey), win: 'casement', windows: 2, shop: 'roller', roof: 'tile', hoods: true } },
  { no: 32, basis: 'ref [A]: Lazo Diamond Jeweller - white wall with a yellow panel, dark brown eave board, cream vertical box sign, fascia board, three condensers on a shelf, lettered white roller shutter, fern on the canopy',
    spec: { wall: hex(C.white), trim: hex(0xe2c84a), joinery: hex(J.white), win: 'casement', windows: 2, shop: 'roller', roof: 'tile', hoods: false, blinds: false, ac: 0, sign: { text: 'KEDAI EMAS  LAZO DIAMOND  JEWELLER', fg: '#4a3a5a', bg: '#ece6cf' } },
    extra: { lightbox: { text: 'LAZO DIAMOND', fg: '#3a2a4a', bg: '#e9e4d2', w: 0.95, h: 2.9, rot: true, y: 0.9 }, acShelf: 3, downpipe: true, fern: true } },
  { no: 30, basis: 'ref [A]: Wai Hing (唯興號) - white wall, moulded pilaster capitals, plain casements, yellow box sign, red characters painted on the piers',
    spec: { wall: hex(0xf0eee8), joinery: hex(J.white), win: 'casement', windows: 2, shop: 'open', roof: 'tile', hoods: true, blinds: false, ac: 0 },
    extra: { lightbox: { text: '唯興號', fg: '#b3261e', bg: '#f0b31f', w: 0.62, h: 1.7, y: 1.0 }, pier: { text: '唯興號', fg: '#c2281c', bg: '#f0eee8' }, downpipe: true } },
  { no: 28, basis: 'ref [A]: cream wall, wide casement over a brick-red sill, grey pier with painted characters (not legible, omitted), set-back rooftop room under a dark zinc roof, street lamp arm on the facade',
    spec: { wall: hex(0xe4d9b8), joinery: hex(0x7a6a5c), win: 'casement', windows: 1, shop: 'open', roof: 'zinc', parapet: true, hoods: false, blinds: false, ac: 0, dado: hex(C.grey) },
    extra: { penthouse: true, lamp: true } },
  { no: 26, basis: 'ref [A]: white wall, tall openings with terracotta-red louvred shutters, pilasters with capitals, condenser',
    spec: { wall: hex(C.white), joinery: hex(J.red), win: 'louvre', windows: 2, shop: 'grille', roof: 'tile', hoods: true, blinds: false, ac: 1 } },
  { no: 24, basis: 'ref [A]: weathered grey upper wall, casement, teal awning, satellite dish (dish omitted)',
    spec: { wall: hex(0xa9a59b), joinery: hex(J.white), win: 'casement', windows: 2, shop: 'open', roof: 'tile', hoods: false, blinds: false, awningPlain: true, awning: hex(0x1f6f66) } },
  { no: 22, basis: 'ref [A], [B]: pink plaque column 利生金鋪 (Kedai Emas Lee Sang); facade ' + typical,
    spec: { wall: hex(C.white), joinery: hex(J.grey), win: 'louvre', windows: 2, shop: 'grille', roof: 'tile', sign: { text: 'KEDAI EMAS LEE SANG', fg: '#f7efe8', bg: '#c2607a' } },
    extra: { plaques: { chars: '利生金鋪', fg: '#f7efe8', bg: '#d0607a', size: 0.6, top: 'plaque', topText: 'LS' } } },
  { no: 20, basis: 'ref [B] + OSM node 12779002966: Sports Toto outlet with a red box sign; facade ' + typical,
    spec: { wall: hex(C.cream), joinery: hex(J.brown), win: 'casement', windows: 2, shop: 'glass', roof: 'tile', sign: { text: 'Sports Toto', fg: '#ffffff', bg: '#c41e1e' } },
    extra: { lightbox: { text: 'TOTO\n4D', fg: '#ffffff', bg: '#c41e1e', w: 0.9, h: 1.3 } } },
  { no: 18, basis: typical, spec: { wall: hex(C.paleyellow), joinery: hex(J.green), win: 'louvre', windows: 2, shop: 'open', roof: 'tile' } },
  { no: 16, basis: typical, spec: { wall: hex(C.white), joinery: hex(J.red), win: 'louvre', windows: 2, shop: 'roller', roof: 'zinc', ac: 1 } },
  { no: 14, basis: 'OSM node 5192821222 (Rasa Ramai, "14 Jalan china") by address; facade ' + typical,
    spec: { wall: hex(C.pink), joinery: hex(J.white), win: 'casement', windows: 2, shop: 'open', roof: 'tile', sign: { text: 'Rasa Ramai', fg: '#f6efe0', bg: '#8c1c15' } } },
  { no: 12, basis: typical, spec: { wall: hex(C.cream), joinery: hex(J.grey), win: 'louvre', windows: 2, shop: 'grille', roof: 'tile', blinds: true } },
  { no: 10, basis: typical, spec: { wall: hex(C.paleyellow), joinery: hex(J.brown), win: 'casement', windows: 2, shop: 'open', roof: 'zinc' } },
  { no: 8, basis: typical, spec: { wall: hex(C.white), joinery: hex(J.teal), win: 'louvre', windows: 2, shop: 'folding', roof: 'tile' } },
  { no: 6, basis: typical, spec: { wall: hex(C.pink), joinery: hex(J.grey), win: 'louvre', windows: 2, shop: 'roller', roof: 'tile', ac: 1 } },
  { no: 4, basis: typical, spec: { wall: hex(C.cream), joinery: hex(J.green), win: 'casement', windows: 2, shop: 'open', roof: 'tile' } },
];

/** Metres of the west frontage taken by the corner building, which faces Jalan Carpenter. */
export const WEST_SKIP = 5.5;

// ---------------------------------------------------------------------------------------------
// reference-specific parts (lot frame: x along the frontage, y up from the road, +z into the street)
// ---------------------------------------------------------------------------------------------

/** Sign faces on both sides of a board standing perpendicular to the facade at x, spanning z0..z1 and y0..y1. */
function boardFaces(k: Kit, x: number, t: number, y0: number, y1: number, z0: number, z1: number, uv: [number, number, number, number], rot = false): void {
  const [u0, v0, u1, v1] = uv;
  k.use('sign');
  const W: Col = [1, 1, 1];
  const face = (xf: number, zl: number, zr: number) => {
    const pts: V3[] = [[xf, y0, zl], [xf, y0, zr], [xf, y1, zr], [xf, y1, zl]];
    k.poly(pts, W, rot ? [[u1, v0], [u1, v1], [u0, v1], [u0, v0]] : [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
  };
  face(x + t / 2 + 0.004, z1, z0); // seen from +x: left is the far edge
  face(x - t / 2 - 0.004, z0, z1);
}

function plaques(k: Kit, s: LotSpec, signs: SignSource, p: NonNullable<Extra['plaques']>): void {
  const x = p.at ?? 0.16, t = 0.2, z0 = 0.55, z1 = z0 + p.size, top = eaveY(s) + 0.9;
  const frame = hex(0x3a3d40);
  let y = top;
  const tile = (text: string, h: number, disc = false) => {
    const y1 = y, y0 = y - h;
    k.use('paint');
    if (disc) {
      // round emblem: a short drum on its side
      k.at({ x, y: (y0 + y1) / 2, z: (z0 + z1) / 2, rz: Math.PI / 2 }, () => k.cyl(0, 0, -t / 2, t / 2, h / 2, h / 2, 20, hex(0xe9e6dc), true));
      k.at({ x, y: (y0 + y1) / 2, z: (z0 + z1) / 2, rz: -Math.PI / 2 }, () => k.cyl(0, 0, t / 2 - 0.001, t / 2, h / 2, h / 2, 20, hex(0xe9e6dc), true));
    } else {
      k.box(x - t / 2, x + t / 2, y0 + 0.015, y1 - 0.015, z0, z1, hex(0xd9d4ca));
      boardFaces(k, x, t, y0 + 0.04, y1 - 0.04, z0 + 0.03, z1 - 0.03, signs.rect(text, p.fg, p.bg, (p.size - 0.06) / (h - 0.08)));
    }
    y = y0;
  };
  if (p.top === 'disc') tile('', p.size * 1.05, true);
  else if (p.top === 'plaque') tile(p.topText ?? '', p.size * 0.9);
  for (const ch of [...p.chars]) tile(ch, p.size);
  if (p.foot) tile(p.foot, p.size * 0.95);
  // steel frame back to the wall
  k.use('paint');
  for (const yy of [top - 0.3, (top + y) / 2, y + 0.3]) k.tube([[x, yy, 0], [x, yy, z0 + 0.02]], 0.022, 5, frame);
  k.tube([[x, top - 0.3, 0.02], [x, y + 0.3, z0]], 0.016, 4, frame);
}

function lightbox(k: Kit, s: LotSpec, signs: SignSource, b: NonNullable<Extra['lightbox']>): void {
  const x = b.at ?? s.w - 0.2, t = 0.16, z0 = 0.4, z1 = z0 + b.w, y0 = F1 + (b.y ?? 0.7), y1 = y0 + b.h;
  k.use('paint');
  k.box(x - t / 2, x + t / 2, y0, y1, z0, z1, hex(0xd8d5cc));
  const uv = b.rot ? signs.rect(b.text, b.fg, b.bg, (b.h - 0.08) / (b.w - 0.08)) : signs.rect(b.text, b.fg, b.bg, (b.w - 0.08) / (b.h - 0.08), !b.text.includes('\n') && [...b.text].length <= 4 && b.h > b.w * 1.4);
  boardFaces(k, x, t, y0 + 0.04, y1 - 0.04, z0 + 0.04, z1 - 0.04, uv, b.rot);
  k.use('paint');
  for (const yy of [y0 + 0.15, y1 - 0.15]) k.tube([[x, yy, 0], [x, yy, z0]], 0.02, 5, hex(0x55595c));
}

function balconies(k: Kit, s: LotSpec): void {
  const w = s.w, top = eaveY(s), dark = hex(0x2a2523), terra = hex(0xb3523f), pink = s.wall;
  for (const fy of [F1, F1 + UP]) {
    k.use('plaster');
    k.box(0.12, w - 0.12, fy - 0.14, fy + 0.02, 0, 0.62, s.trim, 'z-', 0.8);
    k.use('paint');
    k.box(0.14, w - 0.14, fy + 0.95, fy + 1.0, 0.56, 0.61, dark);
    k.box(0.14, w - 0.14, fy + 0.1, fy + 0.14, 0.565, 0.605, dark);
    for (let x = 0.2; x < w - 0.16; x += 0.13) k.box(x - 0.011, x + 0.011, fy + 0.14, fy + 0.95, 0.575, 0.597, dark, 'y+y-');
    for (const x of [0.14, w - 0.19]) { k.box(x, x + 0.05, fy + 0.02, fy + 1.0, 0.02, 0.61, dark, 'z-'); }
    // gilt rosettes on the balustrade
    k.use('gold');
    for (let x = 0.5; x < w - 0.4; x += 0.52) k.box(x - 0.05, x + 0.05, fy + 0.5, fy + 0.6, 0.6, 0.615, hex(0xc9a23a));
  }
  // round columns on the top balcony carrying the pediment
  k.use('paint');
  for (const x of [0.42, w - 0.42]) {
    k.cyl(x, 0.36, F1 + UP + 0.02, top - 0.22, 0.17, 0.15, 14, terra, false, 0.8);
    k.cyl(x, 0.36, top - 0.22, top - 0.02, 0.2, 0.24, 14, shade(terra, 1.1), true);
  }
  // signboard on the first-floor balcony front ([A]; wording not legible)
  k.box(w * 0.3, w - 0.3, F1 - 1.05, F1 + 0.72, 0.62, 0.7, hex(0x8f2f26), '', 0.9);
  // entablature and gable pediment
  k.use('plaster');
  const e0 = top - 0.02, e1 = top + 0.5, apex = top + 2.35, zf = 0.64, zb = -0.3;
  k.box(0, w, e0, e1, 0, zf, pink, 'y-z-');
  k.box(-0.03, w + 0.03, e1, e1 + 0.1, 0, zf + 0.06, s.trim);
  const A: V3 = [0.05, e1 + 0.1, zf], B: V3 = [w - 0.05, e1 + 0.1, zf], P: V3 = [w / 2, apex, zf];
  k.poly([A, B, P], pink);
  k.poly([[B[0], B[1], zb], [A[0], A[1], zb], [P[0], P[1], zb]], shade(pink, 0.8));
  k.quad([A[0], A[1], zb], A, P, [P[0], P[1], zb], shade(pink, 0.9));
  k.quad(B, [B[0], B[1], zb], [P[0], P[1], zb], P, shade(pink, 0.9));
  // raking cornices
  const rake = (a: V3, b: V3) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy), ux = -dy / l, uy = dx / l, o = 0.12;
    k.quad(a, b, [b[0] + ux * o, b[1] + uy * o, zf + 0.07], [a[0] + ux * o, a[1] + uy * o, zf + 0.07], s.trim);
    k.quad([a[0], a[1], zf + 0.07], [b[0], b[1], zf + 0.07], [b[0] + ux * o, b[1] + uy * o, zf + 0.07], [a[0] + ux * o, a[1] + uy * o, zf + 0.07], s.trim);
  };
  rake([A[0] - 0.08, A[1], zf], P); rake(P, [B[0] + 0.08, B[1], zf]);
  // tympanum ornament
  k.box(w / 2 - 0.22, w / 2 + 0.22, e1 + 0.7, e1 + 1.15, zf, zf + 0.04, s.trim, 'z-');
}

function terraceRail(k: Kit, s: LotSpec): void {
  const w = s.w, y = eaveY(s) + 1.03, g = hex(0x4fa79c);
  k.use('paint');
  k.box(0.1, w - 0.1, y + 0.82, y + 0.87, -0.06, -0.01, g);
  k.box(0.1, w - 0.1, y + 0.08, y + 0.12, -0.055, -0.015, g);
  for (let x = 0.12; x < w; x += 0.92) k.box(x - 0.025, x + 0.025, y, y + 0.87, -0.06, -0.01, g, 'y-');
  // fret panels between the posts
  for (let x = 0.12; x < w - 0.6; x += 0.92) for (const [a, b] of [[0.2, 0.45], [0.5, 0.75]]) { k.box(x + a, x + b, y + 0.3, y + 0.33, -0.05, -0.02, g, 'x+x-'); k.box(x + a, x + b, y + 0.58, y + 0.61, -0.05, -0.02, g, 'x+x-'); k.box(x + a - 0.015, x + a + 0.015, y + 0.3, y + 0.61, -0.05, -0.02, g, 'y+y-'); k.box(x + b - 0.015, x + b + 0.015, y + 0.3, y + 0.61, -0.05, -0.02, g, 'y+y-'); }
}

function penthouse(k: Kit, s: LotSpec): void {
  const w = s.w, y0 = eaveY(s) + 0.9, y1 = y0 + 2.5, z0 = -1.6, z1 = -7.5;
  k.use('timber');
  const c = hex(0x55504a);
  k.box(0.15, w - 0.15, y0, y1, z1, z0, c, 'y-y+', 0.8);
  k.use('glass');
  k.quad([0.7, y0 + 0.9, z0 + 0.01], [w - 0.7, y0 + 0.9, z0 + 0.01], [w - 0.7, y0 + 2.0, z0 + 0.01], [0.7, y0 + 2.0, z0 + 0.01], hex(0x2a3338, 0.6));
  k.use('zinc');
  const zc = hex(0x4f4a45, 0.9);
  k.quad([-0.1, y1 + 0.02, 0.2], [w + 0.1, y1 + 0.02, 0.2], [w + 0.1, y1 + 0.75, z1 - 0.3], [-0.1, y1 + 0.75, z1 - 0.3], zc);
  k.quad([w + 0.1, y1 - 0.02, 0.2], [-0.1, y1 - 0.02, 0.2], [-0.1, y1 + 0.71, z1 - 0.3], [w + 0.1, y1 + 0.71, z1 - 0.3], shade(zc, 0.5));
  k.use('paint');
  const g = hex(0x6a6e70);
  for (const x of [0.12, w - 0.12]) k.tube([[x, y0, -0.1], [x, y1 + 0.05, -0.1]], 0.03, 5, g);
  k.box(0.1, w - 0.1, y0 + 0.95, y0 + 0.99, -0.14, -0.1, g);
  for (let x = 0.2; x < w - 0.1; x += 0.14) k.box(x - 0.008, x + 0.008, y0, y0 + 0.95, -0.13, -0.11, g, 'y+y-');
}

function acShelf(k: Kit, s: LotSpec, n: number): void {
  const y = F1 + 0.12, x0 = s.w * 0.5 - n * 0.52, st = hex(0x4a4d50);
  k.use('paint');
  k.box(x0 - 0.1, x0 + n * 1.04 + 0.1, y - 0.04, y, 0.05, 0.62, st);
  for (let i = 0; i <= n; i++) k.tube([[x0 + i * 1.04, y - 0.03, 0.6], [x0 + i * 1.04, y - 0.5, 0.06]], 0.015, 4, st);
  for (let i = 0; i < n; i++) k.at({ x: x0 + 0.52 + i * 1.04, y: y + 0.05, z: 0.1, s: 1.0 + 0.12 * ((i * 7) % 3) }, () => acUnit(k, 0, 0, 0));
}

function facadeLamp(k: Kit, s: LotSpec): void {
  const y = eaveY(s) - 0.25, c = hex(0x9a9d9f), x = s.w * 0.5;
  k.use('paint');
  k.tube([[x, y, 0.02], [x, y + 0.5, 1.2], [x, y + 0.72, 2.6], [x, y + 0.78, 3.4]], 0.035, 6, c);
  k.box(x - 0.16, x + 0.16, y + 0.7, y + 0.86, 3.3, 4.05, hex(0xd9d8d0), '', 0.9);
  k.use('glow');
  k.box(x - 0.12, x + 0.12, y + 0.68, y + 0.7, 3.4, 4.0, hex(0xd9dbd4, 0.45), 'y+');
}

function downpipe(k: Kit, s: LotSpec): void {
  const c = hex(0xdedcd4), x = s.w - 0.42, e = eaveY(s);
  k.use('paint');
  k.tube([[x, e - 0.15, s.parapet ? 0.1 : 0.5], [x, e - 0.5, 0.12], [x, F1 + 0.2, 0.12], [x + 0.14, F1 - 0.25, 0.1], [x + 0.14, 0.2, 0.08]], 0.048, 7, c);
  for (const y of [e - 1.2, F1 + 0.6, 1.4]) k.box(x - 0.07 + (y < F1 ? 0.14 : 0), x + 0.07 + (y < F1 ? 0.14 : 0), y, y + 0.03, 0.02, 0.18, shade(c, 0.8));
}

function fern(k: Kit, s: LotSpec): void {
  k.use('foliage');
  const x0 = 0.9, y0 = F1 + 0.5, g = hex(0x4a7a3a);
  for (let j = 0; j < 22; j++) {
    const a = rnd(s.seed, j, 21) * 6.283, l = 0.45 + rnd(s.seed, j, 22) * 0.6, dx = Math.cos(a) * l, dz = Math.abs(Math.sin(a)) * l * 0.8 + 0.1, c = shade(g, 0.6 + rnd(s.seed, j, 23) * 0.7);
    const p0: V3 = [x0, y0 + 0.2, 0.2], p1: V3 = [x0 + dx * 0.5, y0 + 0.5, 0.2 + dz * 0.5], p2: V3 = [x0 + dx, y0 + 0.05 - rnd(s.seed, j, 24) * 0.5, 0.2 + dz];
    const wv = 0.07;
    k.quad([p0[0] - wv, p0[1], p0[2]], [p0[0] + wv, p0[1], p0[2]], [p1[0] + wv, p1[1], p1[2]], [p1[0] - wv, p1[1], p1[2]], c);
    k.quad([p1[0] - wv, p1[1], p1[2]], [p1[0] + wv, p1[1], p1[2]], [p2[0] + wv * 0.3, p2[1], p2[2]], [p2[0] - wv * 0.3, p2[1], p2[2]], c);
  }
}

function pierText(k: Kit, s: LotSpec, signs: SignSource, t: Sign): void {
  const wd = 0.3, h = 1.25, y = 1.35;
  const uv = signs.rect(t.text, t.fg, t.bg, wd / h, true);
  k.use('sign');
  for (const x of [0.02, s.w - wd - 0.02]) k.quad([x, y, 0.012], [x + wd, y, 0.012], [x + wd, y + h, 0.012], [x, y + h, 0.012], [0.92, 0.92, 0.92], uv);
}

function extras(k: Kit, s: LotSpec, signs: SignSource, e: Extra): void {
  if (e.plaques) plaques(k, s, signs, e.plaques);
  if (e.lightbox) lightbox(k, s, signs, e.lightbox);
  if (e.balconies) balconies(k, s);
  if (e.terrace) terraceRail(k, s);
  if (e.penthouse) penthouse(k, s);
  if (e.acShelf) acShelf(k, s, e.acShelf);
  if (e.lamp) facadeLamp(k, s);
  if (e.downpipe) downpipe(k, s);
  if (e.fern) fern(k, s);
  if (e.pier) pierText(k, s, signs, e.pier);
}

// ---------------------------------------------------------------------------------------------
// assembly
// ---------------------------------------------------------------------------------------------

export interface ChinaResult { floors: { ring: number[]; h: number }[]; walls: { ring: number[]; top: number }[]; lots: number }

/** Parked cars seen nose to tail on both sides in [A] and [B]: [metres from the Carpenter end, side, body colour]. Positions are approximate. */
const CARS: [number, number, number][] = [
  [4.5, -1, 0x23262c], [9.6, -1, 0x8e9296], [14.6, -1, 0xa9acae], [19.9, -1, 0x26282c], [25.2, -1, 0x7d8388], [35.5, -1, 0x9a9da0], [40.8, -1, 0x8fa637], [51, -1, 0x5c6066], [62, -1, 0xb4b6b6], [73, -1, 0x2c3e55],
  [7.4, 1, 0xb9b8b2], [13.2, 1, 0x6f7a88], [18.5, 1, 0x1f2226], [29, 1, 0x3a3d42], [34.3, 1, 0x8e9296], [45, 1, 0x6e1c19], [56, 1, 0x9a9da0], [67.5, 1, 0x4a4e54], [78, 1, 0xa9acae],
];

/** Body style per parked car, in CARS order (generic compact hatchback, saloon, compact SUV). */
const CAR_KINDS: VehicleKind[] = ['saloon', 'hatch', 'suv', 'hatch', 'saloon', 'hatch', 'saloon', 'suv', 'hatch', 'saloon', 'saloon', 'hatch', 'hatch', 'suv', 'hatch', 'saloon', 'suv', 'hatch', 'saloon'];

/** Build the section into `kit`. Returns walkable five-foot-way floors and blocking outlines (piers, cars). */
export function buildChinaStreet(kit: Kit, h: HeightFn, signs: SignSource, photo = false): ChinaResult {
  const S = CHINA, floors: ChinaResult['floors'] = [], walls: ChinaResult['walls'] = [];
  const ryStreet = Math.atan2(-S.dz, S.dx);
  const ground = (s: number) => { const [x, z] = S.toWorld(s, 0); return h(x, z); };

  // carriageway: asphalt from pier line to pier line, slightly crowned, following the terrain
  const sa = -4.5, sb = S.len + 5, N = Math.ceil((sb - sa) / 2.2), offs = [-S.half, -S.half * 0.5, 0, S.half * 0.5, S.half];
  const yAt = (s: number, o: number) => ground(s) + 0.03 + 0.05 * (1 - (o / S.half) ** 2);
  const rows: V3[][] = offs.map(() => []);
  for (let i = 0; i <= N; i++) { const s = sa + ((sb - sa) * i) / N; offs.forEach((o, j) => { const [x, z] = S.toWorld(s, o); rows[j].push([x, yAt(s, o), z]); }); }
  kit.use(photo ? 'asphaltPhoto' : 'asphalt');
  const road = hex(0x4a4a4c);
  kit.grid(rows.slice().reverse(), (i, j) => shade(road, (j === 0 || j === 4 ? 0.86 : 1) * (0.96 + 0.08 * rnd(i, j, 7))));
  // worn white bay marks along the lane edge, and a centre patch seam
  kit.use('paint');
  const mark = (s0: number, s1: number, o0: number, o1: number, c: Col) => {
    const p = (s: number, o: number): V3 => { const [x, z] = S.toWorld(s, o); return [x, yAt(s, o) + 0.012, z]; };
    kit.quad(p(s0, o1), p(s1, o1), p(s1, o0), p(s0, o0), c);
  };
  const white = hex(0xd9d8d0, 0.8);
  for (let s = 2; s < S.len; s += 5.5) for (const side of [-1, 1]) { const o = side * (S.half - 2.95); mark(s, s + 1.1, o - 0.05, o + 0.05, white); mark(s - 0.05, s + 0.05, Math.min(o, o + side * 0.5), Math.max(o, o + side * 0.5), white); }

  const rowDefs: { lots: ChinaLot[]; west: boolean; t0: number; len: number; depth: (i: number) => number }[] = [
    { lots: WEST, west: true, t0: WEST_SKIP, len: S.len - WEST_SKIP, depth: (i) => (i >= 12 ? 8.2 : CHINA_WEST.depth) },
    { lots: EAST, west: false, t0: 0, len: Math.hypot(CHINA_EAST.b[0] - CHINA_EAST.a[0], CHINA_EAST.b[1] - CHINA_EAST.a[1]), depth: () => CHINA_EAST.depth },
  ];
  for (const row of rowDefs) {
    const n = row.lots.length, w = row.len / n, side = row.west ? -1 : 1;
    const ry = row.west ? ryStreet : ryStreet + Math.PI;
    const specs = row.lots.map((l, i) => {
      // square-headed walk-throughs on the west row ([A]); the east row is not visible enough to tell and keeps the mix
      const s: LotSpec = { ...autoLot(1000 + l.no * 37, w, row.depth(i)), plants: 0, bin: false, ...(row.west ? { sideArch: false } : {}), ...l.spec, basis: l.basis };
      if (l.spec.trim === undefined) s.trim = mix(s.wall, hex(0xf4f1ea), 0.6);
      return s;
    });
    // exposure: a taller lot shows its side walls; the row ends are open to the cross streets
    specs.forEach((s, i) => {
      const prev = specs[i - 1], next = specs[i + 1];
      const lo = !prev || prev.storeys < s.storeys, hi = !next || next.storeys < s.storeys;
      // west row: local x runs north (lot i+1 is on the right); east row: local x runs south
      s.exposedL = row.west ? lo : hi; s.exposedR = row.west ? hi : lo;
    });
    let minEave = Infinity; const l0 = row.west ? 0 : 100;
    specs.forEach((s, i) => {
      const s0 = row.t0 + i * w;                       // station of the lot's south edge
      const sx = row.west ? s0 : s0 + w;                // station of local x = 0
      const [x, z] = S.toWorld(sx, side * S.half);
      // The street falls about 5 m toward the river (terrain model): each lot is level and steps down from its
      // neighbour, standing just proud of the road at its uphill end.
      const base = ground(s0 + w / 2) + 0.13;
      kit.at({ x, y: base, z, ry }, () => {
        buildLot(kit, s, signs);
        buildApron(kit, s.w, s.seed);
        // footing down to the falling road
        kit.use('concrete');
        kit.box(0, s.w, -0.7, 0, -0.3, 0.78, hex(0x8a8880, 0.85), 'y+y-z-', 0.75);
        const e = row.lots[i].extra;
        if (e) extras(kit, s, signs, e);
      });
      minEave = Math.min(minEave, base + eaveY(s));
      // utility cables along the facade under the eave, lot by lot
      { const q = (st: number): V3 => { const [cx, cz] = S.toWorld(st, side * (S.half - 0.16)); return [cx, base + Math.min(eaveY(s), F1 + UP) - 0.8, cz]; }; cables(kit, q(s0), q(s0 + w), 3, l0 + i); }
      const c = (st: number, o: number) => S.toWorld(st, side * (S.half + o));
      floors.push({ ring: [...c(s0, -0.24), ...c(s0 + w, -0.24), ...c(s0 + w, ARCADE), ...c(s0, ARCADE)], h: base + 0.14 });
      // piers stand on the lot boundaries
      for (const st of i === 0 ? [s0, s0 + w] : [s0 + w]) walls.push({ ring: [...c(st - PIER / 2, 0), ...c(st + PIER / 2, 0), ...c(st + PIER / 2, PIER), ...c(st - PIER / 2, PIER)], top: base + 3 });
    });
    void minEave; void n;
  }

  // parked cars (blocking) and lantern strings across the street ([A], [B])
  CARS.forEach(([s, side, col], i) => {
    const kind = CAR_KINDS[i % CAR_KINDS.length], { half, hw } = vehicleSize(kind);
    const o = side * (S.half - 0.78 - 1.02), [x, z] = S.toWorld(s, o);
    // west-side cars mostly face the Carpenter Street end and east-side cars are mixed, as in [A]
    const back = side < 0 ? i !== 0 : rnd(i, 5) < 0.5;
    // the street falls toward the river: the car sits on the slope, not level
    const yf = yAt(s + 1.25, o), yr = yAt(s - 1.25, o), pitch = Math.atan2(yf - yr, 2.5);
    kit.at({ x, y: (yf + yr) / 2 - 0.01, z, ry: ryStreet + (back ? Math.PI : 0) + (rnd(s, 3) - 0.5) * 0.05, rz: back ? -pitch : pitch }, () => vehicle(kit, kind, hex(col), signs, plateFor(10 + (i % 5))));
    const c = (ds: number, dob: number) => S.toWorld(s + ds, o + dob);
    walls.push({ ring: [...c(-half - 0.03, -hw - 0.03), ...c(half + 0.03, -hw - 0.03), ...c(half + 0.03, hw + 0.03), ...c(-half - 0.03, hw + 0.03)], top: ground(s) + 1.5 });
  });
  for (const s of [13, 24, 35.5, 47, 59, 71, 83]) {
    const [ax, az] = S.toWorld(s, -S.half + 0.1), [bx, bz] = S.toWorld(s + 1.5, S.half - 0.1), y = ground(s) + 7.25;
    lanternString(kit, [ax, y, az], [bx, y, bz], 8, 0.15, 0.35);
  }
  return { floors, walls, lots: WEST.length + EAST.length };
}
