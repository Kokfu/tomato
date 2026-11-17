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
import { autoLot, buildLot, acUnit, eaveY, ARCADE, PIER, F1, UP, KERB } from './shophouse.ts';
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
  // --- V7.3: parts read off [A] for Nos. 29, 27 and 25 ---
  /** Column of raised-letter lightbox plaques standing clear of the eave on steel arms. */
  column?: { chars: string; fg: string; bg: string; size: number; rise: number; oct?: boolean; top: 'hk' | 'disc'; foot: string; footFg: string; footBg: string };
  /** Large fascia board leaning out over the five-foot way. */
  board?: 'hk' | 'ak';
  /** Condensers on wall brackets: [fraction of the lot width, metres above the first floor]. */
  acs?: [number, number][];
  /** Fit-out behind the shopfront: a goldsmith's ('lit' when the shop is open, 'dim' behind a closed gate), or 'plain': the same counters and cabinets left empty where the trade is not confirmed. */
  fit?: 'lit' | 'dim' | 'plain';
  /** Corrugated awning over the upper window. */
  hood?: boolean;
  antenna?: boolean;
  /** Grooved (rusticated) piers. */
  rustic?: boolean;
  /** Tall blank red sign with a logo panel, projecting beside the balconies. */
  vsign?: boolean;
  /** Rain streaks on the plaster: [fraction of the lot width, top in metres above the first floor, length, half-width, strength, z]. */
  stains?: [number, number, number, number, number, number?][];
}
export interface ChinaLot { no: number; spec: Partial<LotSpec>; extra?: Extra; basis: string }

const typical = 'typical: general form and colour range seen further down the street in [B]; this lot is not individually verified';
const C = { cream: 0xe6dcbd, white: 0xeceae2, yellow: 0xe3cc6c, pink: 0xe2b3a4, rose: 0xcf8d82, stone: 0xd8d2c2, grey: 0x9a968c, paleyellow: 0xe9dfae };
const J = { grey: 0xaeb6b8, green: 0x8fa79c, red: 0xa04a3c, brown: 0x6a4a37, white: 0xdcdcd4, teal: 0x5f8284 };

/** West row, from the corner building northwards (lot 0 = No. 29). */
export const WEST: ChinaLot[] = [
  { no: 29, basis: 'ref [A]: Heng Kee Goldsmith - weathered cream wall, strip of glazed casements, deep eave, pink octagonal plaque column on steel arms, large leaning pink fascia board, teal awning, closed grille, condensers, roof aerial. Interior (V7.4: glass counters and wall cabinets, seen dim behind the closed gate) is a typical goldsmith fit-out, not photographed',
    spec: { wall: hex(0xe0d8bc), joinery: hex(J.green), win: 'band', shop: 'grille', roof: 'zinc', eave: 0.9, hoods: false, blinds: false, ac: 0, awningPlain: true, awning: hex(0x1f8f86), bare: true },
    extra: { column: { chars: '興基金鋪', fg: '#f4ecdf', bg: '#bd7483', size: 0.8, rise: 1.9, oct: true, top: 'hk', foot: 'HENG KEE\nGOLDSMITH\n29', footFg: '#f4ecdf', footBg: '#b56a7a' }, board: 'hk', acs: [[0.8, 0.74], [0.24, 0.74]], fit: 'dim', antenna: true, downpipe: true,
      stains: [[0.976, 3.0, 2.7, 0.12, 0.5, 0.082], [0.3, 2.85, 0.42, 0.5, 0.3], [0.62, 2.85, 0.42, 0.6, 0.38], [0.86, 2.85, 0.42, 0.4, 0.42], [0.2, 0.73, 0.55, 0.3, 0.35], [0.56, 0.73, 0.5, 0.25, 0.3], [0.84, 0.73, 0.58, 0.3, 0.42], [0.978, -0.78, 1.7, 0.1, 0.42]] } },
  { no: 27, basis: 'ref [A] + OSM node 12779002964: Ann Kee Goldsmith - pale yellow wall, small-paned casements under a teal corrugated awning, flat roof terrace with green railing, olive plaque column under a round diamond emblem, leaning yellow fascia board, open front. First plaque character is cursive in [A]; shown as 安 (from the romanised name), the other three are legible. Interior (V7.4: glass counters, wall cabinets, stools) is a typical goldsmith fit-out, not photographed',
    spec: { wall: hex(0xe8d98f), joinery: hex(J.white), win: 'band', panes: 5, shop: 'open', roof: 'zinc', parapet: true, parapetH: 0.35, crest: false, flat: true, hoods: false, blinds: false, ac: 0, bare: true, interiorTone: 0.62 },
    extra: { column: { chars: '安基金鋪', fg: '#f3d6d1', bg: '#a99a2f', size: 0.76, rise: 2.15, top: 'disc', foot: 'ANN KEE\nGOLDSMITH\n27', footFg: '#3d5fb0', footBg: '#d6c43c' }, board: 'ak', fit: 'lit', hood: true, terrace: true, downpipe: true,
      stains: [[0.024, 3.0, 2.4, 0.11, 0.4, 0.082], [0.5, 2.9, 0.4, 0.9, 0.22], [0.3, 0.73, 0.55, 0.3, 0.3], [0.72, 0.73, 0.5, 0.28, 0.28], [0.022, -0.78, 1.5, 0.1, 0.35]] } },
  { no: 25, basis: 'ref [A]: three-storey rose-pink building with a gable pediment, balconies with dark balustrades, round terracotta columns, dentilled cornice, red fascia board and a tall blank red projecting sign under a logo panel (logo approximated), grooved piers. Use: OpenStreetMap node 12779002965 (Yong Hu Goldsmith, mapped 2025) falls mid-lot and is the only evidence of the trade; the 2015 photograph shows a closed gate and an illegible board. The board therefore carries no text and the interior is approximate: a single plain counter and cabinet with no stock',
    spec: { storeys: 3, wall: hex(C.rose), trim: hex(0xe9dccd), joinery: hex(0x4a3028), win: 'louvre', windows: 2, shop: 'grille', roof: 'zinc', parapet: true, hoods: false, blinds: false, ac: 0, dado: hex(0xd9a79b), bare: true },
    extra: { balconies: true, fit: 'plain', rustic: true, vsign: true } },
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
  k.box(0.3, w - 0.3, F1 - 0.98, F1 - 0.14, 0.62, 0.7, hex(0x8f2f26), '', 0.9);
  // plants along the top balcony ([A])
  k.use('foliage');
  for (let i = 0; i < 9; i++) k.sphere(0.9 + i * ((w - 1.8) / 8), F1 + UP + 1.02 + rnd(s.seed, i, 31) * 0.12, 0.5, 0.15 + rnd(s.seed, i, 32) * 0.08, 5, 3, shade(hex(0x8c9a3a), 0.7 + rnd(s.seed, i, 33) * 0.6), 0.8);
  // entablature and gable pediment
  k.use('plaster');
  const e0 = top - 0.02, e1 = top + 0.5, apex = top + 2.35, zf = 0.64, zb = -0.3;
  k.box(0, w, e0, e1, 0, zf, pink, 'y-z-');
  k.box(-0.03, w + 0.03, e1, e1 + 0.1, 0, zf + 0.06, s.trim);
  const A: V3 = [0.05, e1 + 0.1, zf], B: V3 = [w - 0.05, e1 + 0.1, zf], P: V3 = [w / 2, apex, zf];
  k.poly([A, B, P], hex(0xb5584c));
  for (let x = 0.08; x < w - 0.1; x += 0.17) k.box(x, x + 0.085, e1 - 0.09, e1, zf, zf + 0.05, s.trim, 'z-y+');
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
  const w = s.w, y = eaveY(s) + (s.parapetH ?? 0.95) + 0.08, g = hex(0x4fa79c);
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

// ---------------------------------------------------------------------------------------------
// V7.3: Nos. 29, 27 and 25 as photographed in [A]
// ---------------------------------------------------------------------------------------------

type G = CanvasRenderingContext2D;
type UV = [number, number, number, number];
/** Brush (regular script) faces for the raised sign characters; falls back to a serif face where none is installed. */
const KAI = '"KaiTi", "DFKai-SB", "BiauKai", "Kaiti TC", "STKaiti", "AR PL UKai TW", "Noto Serif CJK TC", "PMingLiU", serif';
const LATIN = '"Arial Narrow", "Segoe UI", Arial, sans-serif';
const SQ: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
const OCT: [number, number][] = [[0.2, 0], [0.8, 0], [1, 0.2], [1, 0.8], [0.8, 1], [0.2, 1], [0, 0.8], [0, 0.2]];
const DISC: [number, number][] = Array.from({ length: 24 }, (_, i) => [0.5 + 0.5 * Math.cos((i / 24) * 6.2832), 0.5 + 0.5 * Math.sin((i / 24) * 6.2832)] as [number, number]);
const LOZ = '◇';

/** Dirt washed down a sign face. */
function grime(g: G, w: number, h: number, seed: number, a = 0.2): void {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, `rgba(70,64,52,${a * 0.6})`); gr.addColorStop(0.3, 'rgba(70,64,52,0)'); gr.addColorStop(1, `rgba(70,64,52,${a})`);
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = `rgba(60,56,46,${a * 0.45})`;
  for (let i = 0; i < 6; i++) g.fillRect(rnd(seed, i, 1) * w, 0, (0.01 + rnd(seed, i, 2) * 0.025) * w, h * (0.3 + rnd(seed, i, 3) * 0.7));
}
/** One raised brush character with a drop shadow. */
function brush(g: G, ch: string, cx: number, cy: number, size: number, fg: string): void {
  g.font = `${size}px ${KAI}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillText(ch, cx + size * 0.035, cy + size * 0.045);
  g.fillStyle = g.strokeStyle = fg; g.lineWidth = size * 0.03; g.strokeText(ch, cx, cy); g.fillText(ch, cx, cy);
}
function latin(g: G, text: string, cx: number, cy: number, size: number, fg: string, maxW: number): void {
  g.font = `700 ${size}px ${LATIN}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = fg;
  g.fillText(text, cx, cy, maxW);
}
function lozenge(g: G, cx: number, cy: number, rw: number, rh: number, col: string, text: string): void {
  g.strokeStyle = col; g.lineWidth = rh * 0.07;
  for (const f of [1, 0.78]) { g.beginPath(); g.moveTo(cx - rw * f, cy); g.lineTo(cx, cy - rh * f); g.lineTo(cx + rw * f, cy); g.lineTo(cx, cy + rh * f); g.closePath(); g.stroke(); }
  g.font = `700 ${rh * 0.62}px Georgia, "Times New Roman", serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = col; g.fillText(text, cx, cy + rh * 0.03);
}
/** Cut diamond seen from the side (the Ann Kee emblem). */
function gem(g: G, cx: number, cy: number, r: number, col: string): void {
  g.fillStyle = col; g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = r * 0.05;
  g.beginPath(); g.moveTo(cx - r, cy - r * 0.25); g.lineTo(cx - r * 0.55, cy - r * 0.7); g.lineTo(cx + r * 0.55, cy - r * 0.7); g.lineTo(cx + r, cy - r * 0.25); g.lineTo(cx, cy + r); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(cx - r, cy - r * 0.25); g.lineTo(cx + r, cy - r * 0.25); g.moveTo(cx - r * 0.4, cy - r * 0.25); g.lineTo(cx, cy + r); g.lineTo(cx + r * 0.4, cy - r * 0.25); g.stroke();
}

function charFace(signs: SignSource, ch: string, fg: string, bg: string, oct: boolean): UV {
  return signs.paint(`ch|${ch}|${fg}|${bg}|${oct}`, 1, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = w * 0.02;
    g.beginPath(); (oct ? OCT : SQ).forEach(([u, v], i) => { const x = w * (0.05 + u * 0.9), y = h * (0.05 + v * 0.9); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.closePath(); g.stroke();
    if (ch === LOZ) lozenge(g, w / 2, h / 2, w * 0.36, h * 0.22, fg, 'HK');
    else brush(g, ch, w / 2, h * 0.52, h * 0.72, fg);
    grime(g, w, h, ch.codePointAt(0)!);
  }, 1.5);
}
function footFace(signs: SignSource, text: string, fg: string, bg: string, aspect: number): UV {
  return signs.paint(`foot|${text}|${fg}|${bg}`, aspect, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = h * 0.02; g.strokeRect(w * 0.04, h * 0.05, w * 0.92, h * 0.9);
    const lines = text.split('\n'), lh = (h * 0.8) / lines.length;
    lines.forEach((l, i) => latin(g, l, w / 2, h * 0.1 + (i + 0.5) * lh, lh * 0.82, fg, w * 0.84));
    grime(g, w, h, text.length);
  }, 1.5);
}
function discFace(signs: SignSource): UV {
  return signs.paint('disc|annkee', 1, (g, w, h) => {
    const cx = w / 2, cy = h / 2;
    g.fillStyle = '#e9e8e0'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#9fb4c4'; g.lineWidth = w * 0.012;
    for (let i = 0; i <= 14; i++) { const a = Math.PI * (1.08 + (0.84 * i) / 14); g.beginPath(); g.moveTo(cx + Math.cos(a) * w * 0.24, cy - h * 0.04 + Math.sin(a) * h * 0.24); g.lineTo(cx + Math.cos(a) * w * 0.4, cy - h * 0.04 + Math.sin(a) * h * 0.4); g.stroke(); }
    gem(g, cx, cy + h * 0.06, w * 0.25, '#a9c3d6');
    for (const [t, sgn] of [['KEDAI EMAS', -1], ['ANN KEE', 1]] as [string, number][]) { g.save(); g.translate(cx + sgn * w * 0.2, cy + h * 0.2); g.rotate(sgn * -0.98); latin(g, t, 0, h * 0.07, h * 0.062, '#3d5fb0', w * 0.4); g.restore(); }
    g.strokeStyle = '#c9c6ba'; g.lineWidth = w * 0.03; g.beginPath(); g.arc(cx, cy, w * 0.47, 0, 6.2832); g.stroke();
    grime(g, w, h, 27, 0.14);
  }, 1.5);
}
function boardFace(signs: SignSource, kind: 'hk' | 'ak', aspect: number): UV {
  return signs.paint(`board|${kind}`, aspect, (g, w, h) => {
    const hk = kind === 'hk', chars = [...(hk ? '興基金鋪' : '安基金鋪')];
    g.fillStyle = hk ? '#b4667a' : '#d3c03c'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = h * 0.015; g.strokeRect(h * 0.04, h * 0.04, w - h * 0.08, h - h * 0.08);
    const x0 = hk ? h * 1.75 : h * 0.6, x1 = hk ? w - h * 0.55 : w - h * 1.6;
    chars.forEach((c, i) => brush(g, c, x0 + ((x1 - x0) * i) / (chars.length - 1), h * 0.4, h * 0.56, hk ? '#f3eadc' : '#b5463c'));
    if (hk) { lozenge(g, h * 0.78, h * 0.36, h * 0.52, h * 0.26, '#f3eadc', 'HK'); latin(g, '29', h * 0.78, h * 0.78, h * 0.2, '#f3eadc', h); latin(g, 'KEDAI EMAS HENG KEE', (x0 + x1) / 2, h * 0.83, h * 0.19, '#f3eadc', x1 - x0 + h * 0.5); }
    else { gem(g, w - h * 0.7, h * 0.42, h * 0.3, '#4a6fc0'); latin(g, 'KEDAI EMAS ANN KEE   27', (x0 + x1) / 2 + h * 0.2, h * 0.83, h * 0.19, '#3558b0', x1 - x0 + h * 0.9); }
    grime(g, w, h, hk ? 29 : 27, 0.24);
  }, 1.5);
}

/** Lightbox slab standing perpendicular to the facade at x: a painted face on both sides and a rim. `shape` is counter-clockwise in the unit square. */
function slab(k: Kit, x: number, t: number, y0: number, y1: number, z0: number, z1: number, shape: [number, number][], uv: UV, rim: Col): void {
  const P = (xf: number, [u, v]: [number, number], flip: boolean): V3 => [xf, y0 + v * (y1 - y0), flip ? z1 - u * (z1 - z0) : z0 + u * (z1 - z0)];
  const T = shape.map(([u, v]) => [uv[0] + u * (uv[2] - uv[0]), uv[1] + v * (uv[3] - uv[1])] as [number, number]);
  k.use('sign');
  k.poly(shape.map((p) => P(x + t / 2, p, true)), [1, 1, 1], T);
  k.poly(shape.map((p) => P(x - t / 2, p, false)), [1, 1, 1], T);
  k.use('paint');
  shape.forEach((p, i) => { const q = shape[(i + 1) % shape.length]; k.quad(P(x - t / 2, p, false), P(x + t / 2, p, false), P(x + t / 2, q, false), P(x - t / 2, q, false), rim); });
}

function column(k: Kit, s: LotSpec, signs: SignSource, p: NonNullable<Extra['column']>): void {
  const x = 0.2, t = 0.26, z0 = 1.05, z1 = z0 + p.size, top = eaveY(s) + p.rise, rim = hex(0xdedad0), steel = hex(0x3a3d40);
  let y = top;
  const tile = (uv: UV, h: number, shape = p.oct ? OCT : SQ, grow = 0) => { slab(k, x, t, y - h + 0.015, y - 0.015, z0 - grow, z1 + grow, shape, uv, rim); y -= h; };
  if (p.top === 'disc') tile(discFace(signs), p.size * 1.2, DISC, p.size * 0.1);
  else tile(charFace(signs, LOZ, p.fg, p.bg, !!p.oct), p.size);
  for (const ch of [...p.chars]) tile(charFace(signs, ch, p.fg, p.bg, !!p.oct), p.size);
  tile(footFace(signs, p.foot, p.footFg, p.footBg, (p.size + 0.12) / (p.size * 0.9)), p.size * 0.9, p.oct ? OCT : SQ, 0.06);
  // steel arms back to the wall, braced ([A])
  k.use('paint');
  const e = Math.min(eaveY(s) - 0.25, top - p.size * 2), m = (e + y) / 2 + 0.4, lo = y + 0.35;
  for (const yy of [e, m, lo]) k.tube([[x, yy, 0], [x, yy, z0 + 0.04]], 0.024, 5, steel);
  k.tube([[x + 1.5, e - 0.2, 0.02], [x, e, z0 * 0.8]], 0.018, 4, steel);
  k.tube([[x, e, 0.03], [x, m, z0]], 0.016, 4, steel);
  k.tube([[x, m, 0.03], [x, lo, z0]], 0.016, 4, steel);
  k.tube([[x, top - 0.1, z0 - 0.03], [x, y + 0.1, z0 - 0.03]], 0.022, 5, steel);
}

function tiltBoard(k: Kit, s: LotSpec, signs: SignSource, kind: 'hk' | 'ak'): void {
  const bw = s.w - 0.7, bh = 1.08, tilt = 0.33, y0 = F1 - 0.3, steel = hex(0x4a4640);
  const uv = boardFace(signs, kind, bw / bh);
  k.at({ x: s.w / 2, y: y0, z: 0.12, rx: tilt }, () => {
    k.use('paint');
    k.box(-bw / 2 - 0.03, bw / 2 + 0.03, -0.03, bh + 0.03, -0.05, 0, steel);
    k.use('sign');
    k.quad([-bw / 2, 0, 0.004], [bw / 2, 0, 0.004], [bw / 2, bh, 0.004], [-bw / 2, bh, 0.004], [1, 1, 1], uv);
  });
  k.use('paint');
  for (const x of [0.9, s.w / 2, s.w - 0.9]) k.tube([[x, y0 + bh * Math.cos(tilt) + 0.25, 0.01], [x, y0 + bh * Math.cos(tilt) - 0.05, 0.1 + bh * Math.sin(tilt)]], 0.012, 4, steel);
}

function condensers(k: Kit, s: LotSpec, list: [number, number][]): void {
  const st = hex(0x4a4d50);
  list.forEach(([fx, dy], i) => {
    const x = s.w * fx, y = F1 + dy;
    k.use('paint');
    k.box(x - 0.5, x + 0.5, y - 0.035, y, 0.02, 0.42, st);
    for (const sx of [-0.46, 0.46]) k.tube([[x + sx, y - 0.03, 0.4], [x + sx, y - 0.42, 0.03]], 0.014, 4, st);
    k.at({ x, y: y + 0.05, z: 0.06, s: 1 + 0.1 * (i % 2) }, () => acUnit(k, 0, 0, 0));
  });
}

/** Rain streaks: darkest at the top centre, fading into the wall colour at the sides and the foot. */
function stains(k: Kit, s: LotSpec, list: NonNullable<Extra['stains']>): void {
  k.use('plaster');
  const c = s.wall;
  for (const [fx, yT, len, wd, a, zz] of list) {
    const x = s.w * fx, top = F1 + yT, z = zz ?? 0.012, d = mix(c, hex(0x4e4e42), Math.min(0.75, a * 1.5));
    k.quad([x - wd, top - len, z], [x, top - len, z], [x, top, z], [x - wd, top, z], [c, c, d, c]);
    k.quad([x, top - len, z], [x + wd, top - len, z], [x + wd, top, z], [x, top, z], [c, c, c, d]);
  }
}

type Fit = 'lit' | 'dim' | 'plain';

/**
 * Shop fit-out behind the shopfront (V7.4): a U of glass display counters round a centre aisle that lines up
 * with the entrance, glazed wall cabinets on both side walls and the back wall, a panelled door to the back
 * room, a safe, downlights. 'lit' and 'dim' carry a goldsmith's stock, stools, counter mirrors and an altar
 * shelf; 'plain' is one empty counter and one empty cabinet (trade not confirmed). Typical of the trade on this street:
 * none of these interiors is photographed.
 */
function fitout(k: Kit, s: LotSpec, kind: Fit): void {
  const lit = kind === 'lit', stock = kind !== 'plain', a = lit ? 0.8 : 0.42, on = lit ? 1 : 0.06;
  const xa = 0.37, xb = s.w - 0.37, zf = -ARCADE - 0.22, zb = zf - 4.15, y = KERB + 0.01, ceil = s.shop === 'open' ? 2.9 : 2.95;
  const wood = hex(0x5a3526, a), woodHi = hex(0x7a5236, a), alu = hex(0xc4c8ca, a), dark = hex(0x1b1c1e, a), velvet = hex(0x7d1620, a), tray = hex(0x15161a, a);
  const gold = hex(0xe0b548, Math.min(1, a * 1.45)), cream = hex(0xe9e2cf, a), glassC = hex(0xcfe2e6, lit ? 1 : 0.08), warm = hex(0xfff0d2, on);
  const sd = s.seed;

  /** Rows of small stock on a pad: rings, chains or bangles, one kind per tray. */
  const trays = (x0: number, x1: number, z0: number, z1: number, yy: number, salt: number) => {
    const along = x1 - x0 > z1 - z0, L = along ? x1 - x0 : z1 - z0, n = Math.floor((L - 0.08) / 0.3);
    for (let i = 0; i < n; i++) for (let r = 0; r < 2; r++) {
      const t = rnd(sd, i * 2 + r, salt), u0 = 0.06 + i * 0.3, v0 = 0.045 + r * 0.235;
      if (t < 0.14) continue;
      const P = (u: number, v: number, du: number, dv: number, h: number, c: Col) => { const bx = along ? x0 + u0 + u : x0 + v0 + v, bz = along ? z0 + v0 + v : z0 + u0 + u; k.box(bx, bx + (along ? du : dv), yy, yy + h, bz, bz + (along ? dv : du), c, 'y-'); };
      k.use('paint'); P(0, 0, 0.26, 0.2, 0.012, tray);
      k.use('gold');
      if (t < 0.45) for (let q = 0; q < 4; q++) for (let p = 0; p < 2; p++) P(0.03 + q * 0.055, 0.04 + p * 0.08, 0.022, 0.022, 0.03, gold);       // rings
      else if (t < 0.75) for (let q = 0; q < 4; q++) P(0.025 + q * 0.058, 0.02, 0.012, 0.16, 0.018, gold);                                             // chains
      else for (let q = 0; q < 3; q++) { const cx = (along ? x0 + u0 : x0 + v0) + (along ? 0.05 + q * 0.08 : 0.1), cz = (along ? z0 + v0 : z0 + u0) + (along ? 0.1 : 0.05 + q * 0.08); k.cyl(cx, cz, yy + 0.012, yy + 0.03, 0.034, 0.034, 8, gold, true); } // bangles
    }
  };
  /** Glass display counter: plinth with a recessed kick, padded deck, framed glass case, a light strip. */
  const showcase = (x0: number, x1: number, z0: number, z1: number, salt: number) => {
    k.use('paint'); k.box(x0 + 0.04, x1 - 0.04, y, y + 0.08, z0 + 0.04, z1 - 0.04, dark, 'y-y+');
    k.use('timber'); k.box(x0, x1, y + 0.08, y + 0.5, z0, z1, wood, 'y-', 0.72);
    k.use('paint'); k.box(x0 - 0.005, x1 + 0.005, y + 0.5, y + 0.54, z0 - 0.005, z1 + 0.005, alu, 'y-');
    k.use('fabric'); k.box(x0 + 0.03, x1 - 0.03, y + 0.54, y + 0.56, z0 + 0.03, z1 - 0.03, stock ? velvet : hex(0x3a3d42, a), 'y-');
    if (stock) trays(x0 + 0.03, x1 - 0.03, z0 + 0.03, z1 - 0.03, y + 0.56, salt);
    k.use('paint');
    const t = 0.018, y0 = y + 0.54, y1 = y + 0.95;
    for (const cx of [x0, x1 - t]) for (const cz of [z0, z1 - t]) k.box(cx, cx + t, y0, y1, cz, cz + t, alu, 'y-y+');
    for (const cz of [z0, z1 - t]) k.box(x0, x1, y1 - t, y1, cz, cz + t, alu, 'x+x-');
    for (const cx of [x0, x1 - t]) k.box(cx, cx + t, y1 - t, y1, z0, z1, alu, 'z+z-');
    k.use('glow');
    if (x1 - x0 > z1 - z0) k.box(x0 + 0.05, x1 - 0.05, y1 - 0.035, y1 - 0.02, z1 - 0.05, z1 - 0.03, warm, 'y+');
    else for (const cx of [x0 + 0.03, x1 - 0.05]) k.box(cx, cx + 0.02, y1 - 0.035, y1 - 0.02, z0 + 0.05, z1 - 0.05, warm, 'y+');
    k.use('pane'); k.box(x0 + 0.006, x1 - 0.006, y0, y1 - 0.004, z0 + 0.006, z1 - 0.006, glassC, 'y-');
  };
  /** Wall cabinet: cupboard below, glazed lit showcase above. `face` is the open side: 'x+' (left wall), 'x-' (right wall) or 'z+' (back wall). */
  const wallcase = (x0: number, x1: number, z0: number, z1: number, face: 'x+' | 'x-' | 'z+', salt: number) => {
    const y0 = y + 0.92, y1 = y + 2.12, e = 0.03;
    k.use('timber');
    k.box(x0, x1, y, y0, z0, z1, wood, 'y-', 0.72);
    k.box(x0, x1, y0, y1, z0, z1, woodHi, face);            // carcass, open toward the shop (timber is double-sided: the inside shows)
    k.box(x0, x1, y1, y1 + 0.1, z0, z1, wood, 'y-');
    const zAxis = face !== 'z+', L = zAxis ? z1 - z0 : x1 - x0;
    // lit back panel
    k.use(lit ? 'glow' : 'paint');
    const back = lit ? hex(0xf3ead6, 0.26) : hex(0xd8d2c2, a * 0.4);
    if (face === 'x+') k.quad([x0 + e, y0 + e, z1 - e], [x0 + e, y0 + e, z0 + e], [x0 + e, y1 - e, z0 + e], [x0 + e, y1 - e, z1 - e], back);
    else if (face === 'x-') k.quad([x1 - e, y0 + e, z0 + e], [x1 - e, y0 + e, z1 - e], [x1 - e, y1 - e, z1 - e], [x1 - e, y1 - e, z0 + e], back);
    else k.quad([x0 + e, y0 + e, z0 + e], [x1 - e, y0 + e, z0 + e], [x1 - e, y1 - e, z0 + e], [x0 + e, y1 - e, z0 + e], back);
    // glass shelves and what stands on them
    const fx0 = face === 'x+' ? x0 + 0.05 : face === 'x-' ? x0 + 0.03 : x0 + e, fx1 = face === 'x+' ? x1 - 0.03 : face === 'x-' ? x1 - 0.05 : x1 - e;
    const fz0 = face === 'z+' ? z0 + 0.05 : z0 + e, fz1 = face === 'z+' ? z1 - 0.03 : z1 - e;
    for (let r = 0; r < 3; r++) {
      const sy = y0 + 0.06 + r * 0.38;
      if (r) { k.use('paint'); k.box(fx0, fx1, sy - 0.012, sy, fz0, fz1, hex(0xdfe9ea, a), ''); }
      if (!stock) continue;
      const n = Math.floor((L - 0.16) / 0.36);
      for (let i = 0; i < n; i++) {
        const t = rnd(sd, r * 17 + i, salt), u = 0.12 + i * 0.36 + (zAxis ? z0 : x0);
        if (t < 0.12) continue;
        // a velvet stand (necklace bust or sloped pad) with gold on its face
        const hgt = t < 0.55 ? 0.26 : 0.14, wd = 0.2, mx = (fx0 + fx1) / 2, mz = (fz0 + fz1) / 2;
        k.use('fabric');
        if (zAxis) k.box(mx - 0.05, mx + 0.05, sy, sy + hgt, u, u + wd, t < 0.55 ? tray : velvet, 'y-'); else k.box(u, u + wd, sy, sy + hgt, mz - 0.05, mz + 0.05, t < 0.55 ? tray : velvet, 'y-');
        k.use('gold');
        const fxp = face === 'x+' ? mx + 0.05 : mx - 0.065, fzp = mz + 0.05;
        for (let q = 0; q < (t < 0.55 ? 3 : 2); q++) {
          const gy = sy + 0.04 + q * 0.07, ins = 0.03 + q * 0.025;
          if (zAxis) k.box(fxp, fxp + 0.015, gy, gy + 0.02, u + ins, u + wd - ins, gold, ''); else k.box(u + ins, u + wd - ins, gy, gy + 0.02, fzp, fzp + 0.015, gold, '');
        }
      }
    }
    // frame and glass on the open side
    k.use('paint');
    if (zAxis) { const fx = face === 'x+' ? x1 - 0.02 : x0; for (const zz of [z0, (z0 + z1) / 2 - 0.012, z1 - 0.025]) k.box(fx, fx + 0.02, y0, y1, zz, zz + 0.025, alu, 'y-y+'); k.box(fx, fx + 0.02, y1 - 0.025, y1, z0, z1, alu, 'z+z-'); k.box(fx, fx + 0.02, y0, y0 + 0.025, z0, z1, alu, 'z+z-'); }
    else { const fz = z1 - 0.02; for (const xx of [x0, (x0 + x1) / 2 - 0.012, x1 - 0.025]) k.box(xx, xx + 0.025, y0, y1, fz, fz + 0.02, alu, 'y-y+'); k.box(x0, x1, y1 - 0.025, y1, fz, fz + 0.02, alu, 'x+x-'); k.box(x0, x1, y0, y0 + 0.025, fz, fz + 0.02, alu, 'x+x-'); }
    k.use('pane');
    if (face === 'x+') k.quad([x1 - 0.008, y0, z1], [x1 - 0.008, y0, z0], [x1 - 0.008, y1, z0], [x1 - 0.008, y1, z1], glassC);
    else if (face === 'x-') k.quad([x0 + 0.008, y0, z0], [x0 + 0.008, y0, z1], [x0 + 0.008, y1, z1], [x0 + 0.008, y1, z0], glassC);
    else k.quad([x0, y0, z1 - 0.008], [x1, y0, z1 - 0.008], [x1, y1, z1 - 0.008], [x0, y1, z1 - 0.008], glassC);
  };

  // counters: two runs down the shop and one across the back, leaving the aisle on the entrance axis
  const lx0 = xa + 0.93, lx1 = lx0 + 0.55, rx1 = xb - 0.93, rx0 = rx1 - 0.55, zc0 = zf - 0.85, zc1 = zb + 1.2;
  // (the unconfirmed shop gets one counter and one cabinet only: it must not read as a copy of its neighbours)
  if (stock) showcase(lx0, lx1, zc1, zc0, 41);
  showcase(rx0, rx1, stock ? zc1 : zc1 + 0.9, zc0, 43);
  if (stock) showcase(lx1 + 0.02, rx0 - 0.02, zc1, zc1 + 0.55, 45);
  if (stock) wallcase(xa, xa + 0.3, zb + 1.0, zf - 0.6, 'x+', 51);
  wallcase(xb - 0.3, xb, zb + 1.0, zf - 0.6, 'x-', 53);
  if (stock) wallcase(xa + 1.75, xb - 1.05, zb, zb + 0.3, 'z+', 55);

  // back wall: framed panelled door, safe
  const dx0 = xa + 0.45, dx1 = xa + 1.35, dz = zb + 0.012;
  k.use('timber');
  k.box(dx0 - 0.07, dx0, y, y + 2.1, zb, zb + 0.05, wood, 'z-y-'); k.box(dx1, dx1 + 0.07, y, y + 2.1, zb, zb + 0.05, wood, 'z-y-'); k.box(dx0 - 0.07, dx1 + 0.07, y + 2.1, y + 2.17, zb, zb + 0.05, wood, 'z-');
  k.quad([dx0, y, dz], [dx1, y, dz], [dx1, y + 2.1, dz], [dx0, y + 2.1, dz], woodHi);
  for (const [p0, p1] of [[0.14, 0.92], [1.06, 1.96]]) k.box(dx0 + 0.12, dx1 - 0.12, y + p0, y + p1, dz, dz + 0.012, shade(woodHi, 0.82), 'z-');
  k.use('paint');
  k.box(dx1 - 0.13, dx1 - 0.09, y + 0.98, y + 1.02, dz, dz + 0.06, alu, 'z-');
  const sx0 = xb - 1.0, sx1 = xb - 0.38, sg = hex(0x6c7376, a);
  k.box(sx0, sx1, y, y + 1.05, zb + 0.32, zb + 0.9, sg, 'y-', 0.7);
  k.box(sx0 + 0.05, sx1 - 0.05, y + 0.08, y + 0.97, zb + 0.9, zb + 0.915, shade(sg, 1.15), 'z-');
  k.poly(DISC.filter((_, i) => i % 3 === 0).map(([u, v]) => [sx0 + 0.2 + (u - 0.5) * 0.11, y + 0.58 + (v - 0.5) * 0.11, zb + 0.92] as V3), alu);
  k.box(sx1 - 0.2, sx1 - 0.17, y + 0.42, y + 0.7, zb + 0.915, zb + 0.95, alu, 'z-');
  // clock above the door
  const cx = (dx0 + dx1) / 2, cy = y + 2.5;
  k.poly(DISC.filter((_, i) => i % 2 === 0).map(([u, v]) => [cx + (u - 0.5) * 0.4, cy + (v - 0.5) * 0.4, zb + 0.02] as V3), dark);
  k.poly(DISC.filter((_, i) => i % 2 === 0).map(([u, v]) => [cx + (u - 0.5) * 0.34, cy + (v - 0.5) * 0.34, zb + 0.03] as V3), cream);
  if (stock) {
    // altar shelf with a red lamp, high on the back wall (usual in the street's Chinese-run shops)
    k.box(xb - 1.5, xb - 0.75, y + 2.34, y + 2.39, zb, zb + 0.3, hex(0xa8241f, a));
    k.box(xb - 1.42, xb - 0.83, y + 2.39, y + 2.78, zb + 0.01, zb + 0.05, hex(0x8f1c1a, a), 'z-');
    k.use('glow'); k.box(xb - 1.16, xb - 1.09, y + 2.42, y + 2.51, zb + 0.1, zb + 0.17, hex(0xff5a3a, 0.8));
    // stools on the customer side, a mirror on each side counter
    k.use('paint');
    for (const [sx, sz] of [[lx1 + 0.3, zf - 1.5], [lx1 + 0.3, zf - 2.5], [rx0 - 0.3, zf - 1.9]] as [number, number][]) {
      k.cyl(sx, sz, y, y + 0.02, 0.16, 0.16, 10, alu, true); k.cyl(sx, sz, y + 0.02, y + 0.44, 0.022, 0.022, 6, alu, false);
      k.cyl(sx, sz, y + 0.44, y + 0.5, 0.17, 0.17, 12, hex(0x8f1c1a, a + 0.1), true, 0.8);
    }
    for (const [mx, mz, ry] of [[(lx0 + lx1) / 2, zf - 1.3, Math.PI / 2], [(rx0 + rx1) / 2, zf - 2.2, -Math.PI / 2]] as [number, number, number][]) k.at({ x: mx, y: y + 0.95, z: mz, ry }, () => {
      k.use('paint'); k.box(-0.06, 0.06, 0, 0.015, -0.05, 0.05, alu); k.box(-0.008, 0.008, 0.015, 0.1, -0.008, 0.008, alu, 'y-y+');
      k.at({ y: 0.1, rx: -0.2 }, () => { k.use('paint'); k.box(-0.1, 0.1, 0, 0.26, -0.008, 0, alu); k.use('glass'); k.quad([-0.09, 0.01, 0.002], [0.09, 0.01, 0.002], [0.09, 0.25, 0.002], [-0.09, 0.25, 0.002], hex(0xaec3c8, a)); });
    });
  }
  // recessed downlights in two rows and a ceiling panel light over the aisle
  k.use('glow');
  for (const lx of [(lx0 + lx1) / 2, (rx0 + rx1) / 2]) for (let i = 0; i < 4; i++) { const lz = zf - 0.7 - i * 0.85; k.quad([lx - 0.07, ceil - 0.012, lz - 0.07], [lx + 0.07, ceil - 0.012, lz - 0.07], [lx + 0.07, ceil - 0.012, lz + 0.07], [lx - 0.07, ceil - 0.012, lz + 0.07], hex(0xfff4dc, on)); }
  k.box((xa + xb) / 2 - 0.3, (xa + xb) / 2 + 0.3, ceil - 0.03, ceil - 0.012, zf - 2.6, zf - 1.4, hex(0xf4f6f0, on), 'y+');
}

/**
 * Shopfront joinery the generic lot leaves out (V7.4): a frame lining the opening, a floor track, and either the
 * guide channels of the rolled-up shutter (open shop) or the stacked leaves, lock plate and extra rails of the
 * collapsible gate.
 */
function frontDetail(k: Kit, s: LotSpec): void {
  const ox0 = 0.5, ox1 = s.w - 0.5, oy1 = 2.95, zi = -ARCADE - 0.2, zo = -ARCADE + 0.015, fr = hex(0x4b4f52, 0.7), st = hex(0x2f3336, 0.7);
  k.use('paint');
  for (const x of [ox0, ox1 - 0.06]) k.box(x, x + 0.06, KERB, oy1, zi, zo, fr, 'y-');
  k.box(ox0, ox1, oy1 - 0.05, oy1, zi, zo, fr, 'x+x-');
  k.box(ox0 + 0.06, ox1 - 0.06, KERB + 0.05, KERB + 0.065, zi + 0.04, zi + 0.11, st, 'x+x-y-');
  if (s.shop === 'open') {
    for (const x of [ox0 + 0.06, ox1 - 0.11]) k.box(x, x + 0.05, KERB + 0.05, oy1 - 0.3, zi - 0.03, zi + 0.05, hex(0x70757a, 0.7), 'y-y+');
  } else if (s.shop === 'grille') {
    for (const x of [ox0 + 0.06, ox1 - 0.2]) k.box(x, x + 0.14, KERB + 0.06, oy1 - 0.08, zi + 0.045, zi + 0.1, st, 'y-y+');
    const mx = s.w / 2;
    k.box(mx - 0.02, mx + 0.02, KERB + 0.06, oy1 - 0.08, zi + 0.05, zi + 0.105, st, 'y-y+');
    k.box(mx - 0.05, mx + 0.05, 1.08, 1.22, zi + 0.1, zi + 0.12, hex(0x4a4d50, 0.7));
    for (const y of [0.95, 1.85]) k.box(ox0 + 0.2, ox1 - 0.2, y, y + 0.03, zi + 0.085, zi + 0.1, st, 'x+x-');
  }
}

const TREAD = 0.3;
/** Risers between two lot floors that differ by `drop` metres. */
const risers = (drop: number): number => (drop > 0.2 ? Math.ceil(drop / 0.18) : 1);

/**
 * Five-foot-way works of one lot (V7.4). The street falls toward the river and every lot is level, so the floors
 * step: this builds the flight of steps in the party-wall opening on the uphill side, a block step at the kerb
 * where the drain ledge stands high above the road, and the soft shade where the floor meets the walls.
 * `drop`: how far this floor is below the uphill neighbour's; `ledge`: height of the drain ledge above the road
 * at the downhill end.
 */
function walkway(k: Kit, s: LotSpec, west: boolean, drop: number, ledge: number): void {
  const w = s.w, conc = hex(0x9c998f), ux = west ? 0 : w, dir = west ? 1 : -1, z0 = -(ARCADE - 0.25), z1 = -0.72;
  if (drop > 0.03) {
    const n = risers(drop);
    k.use('concrete');
    const span = (a: number, b: number, top: number, c: Col) => k.box(Math.min(a, b), Math.max(a, b), KERB - 0.02, top, z0, z1, c, 'y-', 0.82);
    span(ux - dir * 0.05, ux, KERB + drop - 0.004, shade(conc, 0.85));
    for (let j = 1; j < n; j++) span(ux + dir * (j - 1) * TREAD, ux + dir * j * TREAD, KERB + drop * (1 - j / n), shade(conc, 0.95 + 0.05 * (j % 2)));
  }
  if (ledge > 0.28) {
    const xa = west ? w * 0.42 : 0.3, xb = west ? w - 0.3 : w * 0.58;
    k.use('concrete');
    k.box(xa, xb, -0.75, 0.045 - ledge / 2, 0.78, 0.98, shade(conc, 0.92), 'y-z-', 0.8);
  }
  // soft shade at the foot of the shopfront and of both party walls (the baked floor gradient is linear)
  k.use('contact');
  const y = KERB + 0.006, v = 0.13, B: Col = [0, 0, 0];
  k.quad([0.12, y, -ARCADE + 0.6], [w - 0.12, y, -ARCADE + 0.6], [w - 0.12, y, -ARCADE], [0.12, y, -ARCADE], B, [0.5, 0, 0.5, v]);
  k.poly([[0.12, y, -PIER], [0.55, y, -PIER], [0.55, y, -ARCADE], [0.12, y, -ARCADE]], B, [[0.5, v], [0.5, 0], [0.5, 0], [0.5, v]]);
  k.poly([[w - 0.55, y, -PIER], [w - 0.12, y, -PIER], [w - 0.12, y, -ARCADE], [w - 0.55, y, -ARCADE]], B, [[0.5, 0], [0.5, v], [0.5, v], [0.5, 0]]);
}

/** Teal corrugated awning over the upper window ([A], No. 27). */
function hood(k: Kit, s: LotSpec): void {
  const x0 = s.w * 0.42, x1 = s.w - 0.45, yT = F1 + 2.62, c = hex(0x2f7f78);
  k.use('zinc');
  k.quad([x0, yT - 0.5, 1.0], [x1, yT - 0.5, 1.0], [x1, yT, 0.03], [x0, yT, 0.03], c);
  k.quad([x0, yT - 0.62, 1.0], [x1, yT - 0.62, 1.0], [x1, yT - 0.5, 1.0], [x0, yT - 0.5, 1.0], shade(c, 0.85));
  k.use('paint');
  for (const x of [x0 + 0.03, x1 - 0.03]) { k.tube([[x, yT - 0.5, 1.0], [x, yT - 0.75, 0.03]], 0.014, 4, hex(0x5a5e60)); k.tube([[x, yT - 0.5, 1.0], [x, yT, 0.03]], 0.014, 4, hex(0x5a5e60)); }
}

/** Television aerial on a mast ([A], above No. 29). */
function antenna(k: Kit, s: LotSpec): void {
  const x = 1.3, z = -1.7, y0 = eaveY(s) + 0.4, y1 = y0 + 3.3, c = hex(0x8a8d8f);
  k.use('paint');
  k.tube([[x, y0, z], [x, y1, z]], 0.02, 5, c);
  k.tube([[x - 0.9, y1 - 0.12, z], [x + 0.9, y1 - 0.12, z]], 0.012, 4, c);
  for (let i = 0; i < 7; i++) { const ex = x - 0.8 + i * 0.27, l = 0.42 - i * 0.03; k.tube([[ex, y1 - 0.12, z - l], [ex, y1 - 0.12, z + l]], 0.007, 3, c); }
}

function rustic(k: Kit, s: LotSpec): void {
  k.use('plaster');
  for (const [a, b] of [[0, PIER / 2], [s.w - PIER / 2, s.w]]) for (let y = 0.6; y < 2.8; y += 0.31) k.box(a - 0.004, b + 0.004, y, y + 0.024, -PIER - 0.004, 0.005, shade(y < 1.15 ? s.dado ?? s.wall : s.wall, 0.62), 'y+y-');
}

function vsign(k: Kit, s: LotSpec, signs: SignSource): void {
  const x = 0.34, t = 0.14, z0 = 0.72, z1 = 1.62, y0 = F1 - 0.14, y1 = F1 + UP + 0.1;
  k.use('paint');
  k.box(x - t / 2, x + t / 2, y0, y1, z0, z1, hex(0x9a3a30), '', 0.85);
  for (const yy of [y0 + 0.4, y1 - 0.3]) k.tube([[x, yy, 0.6], [x, yy, z0]], 0.02, 5, hex(0x3a3d40));
  // logo panel: a pale board with a blue device in [A], too small to read; drawn as a plain ring
  const uv = signs.paint('logo|25', 1, (g, w, h) => { g.fillStyle = '#dfe5e8'; g.fillRect(0, 0, w, h); g.strokeStyle = '#5a7fb5'; g.lineWidth = w * 0.09; g.beginPath(); g.arc(w / 2, h / 2, w * 0.26, 0, 6.2832); g.stroke(); g.fillStyle = '#5a7fb5'; g.beginPath(); g.arc(w / 2, h / 2, w * 0.09, 0, 6.2832); g.fill(); grime(g, w, h, 25, 0.16); }, 1);
  slab(k, x, t + 0.03, y1, y1 + 0.92, z0 - 0.02, z1 + 0.02, SQ, uv, hex(0xdedad0));
}

function extras(k: Kit, s: LotSpec, signs: SignSource, e: Extra): void {
  if (e.column) column(k, s, signs, e.column);
  if (e.board) tiltBoard(k, s, signs, e.board);
  if (e.acs) condensers(k, s, e.acs);
  if (e.fit) { fitout(k, s, e.fit); frontDetail(k, s); }
  if (e.hood) hood(k, s);
  if (e.antenna) antenna(k, s);
  if (e.rustic) rustic(k, s);
  if (e.vsign) vsign(k, s, signs);
  if (e.stains) stains(k, s, e.stains);
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
      const s: LotSpec = { ...autoLot(1000 + l.no * 37, w, row.depth(i)), plants: 0, bin: false, soffit: 0.58, ...(row.west ? { sideArch: false } : {}), ...l.spec, basis: l.basis };
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
    // Each lot is level, just proud of the road at mid-lot (V7.3), and (V7.4) never lower than the terrain under its
    // own five-foot way: on the steepest lots the uphill end used to sink below the ground, which showed through the floor.
    const bases = specs.map((_, i) => {
      let top = -Infinity;
      for (const fs of [0, 0.5, 1]) for (const d of [-0.24, ARCADE]) { const [tx, tz] = S.toWorld(row.t0 + (i + fs) * w, side * (S.half + d)); top = Math.max(top, h(tx, tz)); }
      return Math.max(ground(row.t0 + i * w + w / 2) + 0.13, top - 0.14 + 0.03);
    });
    specs.forEach((s, i) => {
      const s0 = row.t0 + i * w;                       // station of the lot's south edge
      const sx = row.west ? s0 : s0 + w;                // station of local x = 0
      const [x, z] = S.toWorld(sx, side * S.half);
      // The street falls about 5 m toward the river (terrain model): each lot is level and steps down from its
      // neighbour, standing just proud of the road at its uphill end.
      const base = bases[i];
      // V7.4: stairs up to the uphill neighbour's floor, and a block step where the drain ledge is high above the road
      const drop = i > 0 ? bases[i - 1] - base : 0, ledge = base + 0.045 - (ground(s0 + w) + 0.03);
      kit.at({ x, y: base, z, ry }, () => {
        buildLot(kit, s, signs);
        walkway(kit, s, row.west, drop, ledge);
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
      // drain ledge in front of the kerb, the kerb block step and the stair treads (all stood on)
      floors.push({ ring: [...c(s0, -0.78), ...c(s0 + w, -0.78), ...c(s0 + w, -0.24), ...c(s0, -0.24)], h: base + 0.045 });
      if (ledge > 0.28) floors.push({ ring: [...c(s0 + w * 0.42, -0.98), ...c(s0 + w - 0.3, -0.98), ...c(s0 + w - 0.3, -0.78), ...c(s0 + w * 0.42, -0.78)], h: base + 0.045 - ledge / 2 });
      if (drop > 0.2) { const n = risers(drop); for (let j = 1; j < n; j++) floors.push({ ring: [...c(s0 + (j - 1) * TREAD, 0.67), ...c(s0 + j * TREAD, 0.67), ...c(s0 + j * TREAD, ARCADE - 0.2), ...c(s0 + (j - 1) * TREAD, ARCADE - 0.2)], h: base + 0.14 + drop * (1 - j / n) }); }
      // shopfront line (the mapped block outline behind it is not exactly parallel on the east row)
      walls.push({ ring: [...c(s0, ARCADE), ...c(s0 + w, ARCADE), ...c(s0 + w, ARCADE + 0.5), ...c(s0, ARCADE + 0.5)], top: base + 3 });
      // piers stand on the lot boundaries; behind each the party wall runs back to the shopfront, pierced by the walk-through
      for (const st of i === 0 ? [s0, s0 + w] : [s0 + w]) {
        walls.push({ ring: [...c(st - PIER / 2, 0), ...c(st + PIER / 2, 0), ...c(st + PIER / 2, PIER), ...c(st - PIER / 2, PIER)], top: base + 3 });
        walls.push({ ring: [...c(st - 0.12, PIER), ...c(st + 0.12, PIER), ...c(st + 0.12, 0.72), ...c(st - 0.12, 0.72)], top: base + 3 });
        walls.push({ ring: [...c(st - 0.12, ARCADE - 0.25), ...c(st + 0.12, ARCADE - 0.25), ...c(st + 0.12, ARCADE), ...c(st - 0.12, ARCADE)], top: base + 3 });
      }
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
