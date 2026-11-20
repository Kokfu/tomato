// High-fidelity test district: Jalan Main Bazaar and the Kuching Waterfront promenade.
//
// Pure data and geometry (no three.js): shared by the facade builder, the collision world, the sign
// builder and the unit tests.
//
// WHAT IS REAL HERE
//  - block outlines, street centre lines and the river bank (OpenStreetMap, unchanged);
//  - the lot COUNT of each Main Bazaar frontage, which is fitted to house numbers found in open
//    data (see HOUSE-NUMBER MODEL below);
//  - the businesses pinned to a numbered lot (PINS), each with its evidence class.
// WHAT IS AN APPROXIMATION
//  - every lot's facade style, colour, storey count, awning and shopfront state unless the lot is
//    listed in LOT_NOTES as described from a photograph;
//  - parked vehicles, planters, lamp posts, kiosks, boats and tree positions (street dressing).
//
// HOUSE-NUMBER MODEL
// Main Bazaar has buildings on its south-west side only, numbered consecutively from the Old
// Courthouse end. Eleven open-data records carry a Main Bazaar house number; projected onto the
// frontage they fit number = 1 + distance / 4.8 m within one lot for eight of them, and the block
// breaks (Jalan China after No. 22, Bishopsgate lane after No. 39) fall on the mapped gaps.
// The table below is that fit. Numbers are therefore "interpolated", exact to about one lot.

export interface FrontDef {
  /** Number of shop lots along this wall edge (edge parameter t runs 0..1 in ring order). */
  n: number;
  /** House number of the lot at t = 0, or null where numbering is unknown. */
  first: number | null;
}

/** Frontages of Main Bazaar itself, keyed "buildingId:edgeIndex". */
export const FRONTS: Record<string, FrontDef> = {
  '233690737:2': { n: 22, first: 1 },
  '236495303:18': { n: 17, first: 23 },
  '236495776:0': { n: 10, first: 40 },
  '236495776:1': { n: 10, first: 50 },
  '236495776:2': { n: 5, first: 60 },
  '236495776:3': { n: 4, first: 65 },
  '236495776:4': { n: 3, first: 69 },
};

/** Evidence classes for a business pinned to a lot. */
export type PinEvidence =
  /** Source gives a Main Bazaar house number AND its mapped point falls within one lot of that number. */
  | 'address+position'
  /** Source gives a house number; its mapped point is 2+ lots away or off the frontage. Pinned by number. */
  | 'address-only'
  /** The OSM node has the name and position; its Overture duplicate supplies the house number. */
  | 'osm-name-match+address-duplicate';

export interface Pin {
  /** House numbers occupied (a business may span two lots). */
  nos: number[];
  evidence: PinEvidence;
  /** Display name for the signboard when the source name is long. */
  sign?: string;
}

/**
 * Place id -> lot. Pinned records state a Main Bazaar house number in their own source, except No. 42,
 * whose number comes from its Overture duplicate (see PIN_DUPLICATES).
 * `sign` is a display name used only when the place is allowed a sign (OSM or owner-verified);
 * unverified Overture pins stay inspectable on their lot but render no signboard.
 */
export const PINS: Record<string, Pin> = {
  'osm:node/12074799663': { nos: [6, 7], evidence: 'address+position', sign: 'The Ranee' },
  'osm:node/6169920185': { nos: [11], evidence: 'address-only' },
  'osm:node/2420355196': { nos: [12], evidence: 'address+position' },
  'overture:56c62a7a-f9bb-426a-841d-430ce94adeea': { nos: [18], evidence: 'address+position' },
  'overture:6e2c273f-9115-4ba6-a0e6-df688b9b7d90': { nos: [32], evidence: 'address+position' },
  'overture:89019c85-1dc6-4620-ba5f-876bb77ae018': { nos: [39], evidence: 'address+position' },
  'overture:f25d67a7-3f91-4cd1-a5b4-924415ee98e9': { nos: [41], evidence: 'address+position' },
  'osm:node/12778741079': { nos: [42], evidence: 'osm-name-match+address-duplicate' },
  'overture:3b7a59f5-8a7d-42f7-a3e2-e9668dbd0499': { nos: [55], evidence: 'address-only' },
  'overture:ac24f28a-4f95-4638-8377-77c09bc9ee82': { nos: [58], evidence: 'address+position', sign: 'Kek Lapis Mama Su' },
  'overture:c4bc392d-d810-4573-af4a-f159cde293f6': { nos: [66], evidence: 'address-only', sign: 'Little Borneo' },
};
/** Records that duplicate a pinned business (same shop in a second source): hidden from signage. */
export const PIN_DUPLICATES = new Set(['overture:faa64913-6eea-40f5-9cac-feb9416ee61a']);

/** Centre line of the shophouse-side carriageway (world metres), west to east. */
export const MB_LINE: [number, number][] = [
  [114.6, -132.9], [122.4, -134], [129.9, -131], [218.2, -68.7], [256, -41.5], [288.8, -17.8], [316.2, 0],
  [329.8, 8.9], [356.1, 20.7], [381.1, 31.3], [403, 42.2], [417, 52.7], [421.8, 58.6],
];
/** Centre line of the river-side carriageway (world metres), west to east. */
export const MB_NORTH: [number, number][] = [
  [107.9, -155.1], [125.2, -143], [216.6, -79.1], [223.5, -74.3], [256, -51.6], [292.8, -25.8], [333.6, -0.4],
  [360.4, 12.8], [385, 22.4], [404.4, 32.4], [423, 46.8], [431.1, 57],
];

/** Distance from (x, z) to the Main Bazaar centre line, the station along it and the side (+1 = shophouse side). */
export function stationOf(x: number, z: number, line: [number, number][] = MB_LINE): { d: number; s: number; side: number } {
  let d = 1e9, s = 0, side = 0, acc = 0;
  for (let i = 1; i < line.length; i++) {
    const [ax, az] = line[i - 1], [bx, bz] = line[i];
    const vx = bx - ax, vz = bz - az, l = Math.hypot(vx, vz);
    let t = ((x - ax) * vx + (z - az) * vz) / (l * l);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dd = Math.hypot(ax + vx * t - x, az + vz * t - z);
    if (dd < d) { d = dd; s = acc + t * l; side = Math.sign(vx * (z - az) - vz * (x - ax)); }
    acc += l;
  }
  return { d, s, side };
}

/** Point at station s along a polyline, plus the unit tangent. */
export function pointAt(line: [number, number][], s: number): { x: number; z: number; tx: number; tz: number } {
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    const [ax, az] = line[i - 1], [bx, bz] = line[i];
    const l = Math.hypot(bx - ax, bz - az);
    if (s <= acc + l || i === line.length - 1) {
      const t = (s - acc) / l;
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, tx: (bx - ax) / l, tz: (bz - az) / l };
    }
    acc += l;
  }
  return { x: line[0][0], z: line[0][1], tx: 1, tz: 0 };
}
export function lineLength(line: [number, number][]): number {
  let l = 0;
  for (let i = 1; i < line.length; i++) l += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
  return l;
}

/** True within the test district (within 85 m of Main Bazaar). */
export function inDistrict(x: number, z: number): boolean {
  if (x < 20 || x > 520 || z < -290 || z > 150) return false;
  return stationOf(x, z).d < 85;
}

function hash(a: number, b = 0, c = 0): number {
  let h = Math.imul((a | 0) ^ Math.floor(a / 4294967296), 2654435761) ^ Math.imul(b + 0x9e3779b9, 2246822519) ^ Math.imul(c + 0x85ebca6b, 3266489917);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Facade families seen on Main Bazaar (see docs/V3_REPORT.md for the photo references). */
export const STYLE = { vernacular: 0, straits: 1, deco: 2, modern: 3 } as const;
export const FRONT = { open: 0, half: 1, doors: 2, roller: 3 } as const;

export interface Lot {
  /** Interpolated house number, or null. */
  no: number | null;
  storeys: 2 | 3;
  style: number;
  /** Paint colours (hex): wall, trim, shutters / joinery. */
  wall: number; trim: number; joinery: number;
  front: number;
  /** Interior flavour 0..2 (craft, kopitiam, dry goods). */
  interior: number;
  /** 0 none, 1 canvas awning, 2 zinc lean-to. */
  awning: number;
  awningCol: number;
  /** Chick blind hanging between the columns. */
  blind: boolean;
  /** Per-lot random bits for small variation. */
  h: number;
  /** Lots sharing a "group" were built as one building and share height, style and colours. */
  group: number;
  /** True when style/storeys/colour were set from a photograph (LOT_NOTES); false = approximation. */
  described: boolean;
}

// Paint seen on the street: mostly white, cream and pale yellow with a few pastel units; joinery in
// green, blue, brown or off-white. Deliberately NOT a rainbow.
const WALLS = [0xf1ede2, 0xf4efe0, 0xefe6cf, 0xf3e7b9, 0xeedc9c, 0xf1ede2, 0xe9e4d6, 0xdfe7d8, 0xd5e3ea, 0xf0d9c8, 0xf4efe0, 0xe6ddc9, 0xf2e2a8, 0xe7c9b0];
// Brighter repainted units, seen mainly on the eastern third of the street (toward Lebuh Wayang).
const WALLS_EAST = [0xf3e7b9, 0x9cc4dc, 0xf0c56a, 0xf2b38a, 0xf2c4cc, 0xcfe3c0, 0xf1ede2, 0x8fb8d8, 0xf4d77a, 0xf1ede2, 0xe9a67c, 0xd9e6c2];
const JOINERY = [0x5a3a26, 0x2f6b52, 0x6a4630, 0x2c5f86, 0x4a3324, 0x3b7a6c, 0x5a3a26, 0x4d4a44, 0x6a4630, 0x2f7f76];
const AWNINGS = [0x2f6b52, 0xb8362b, 0x2c5f86, 0xd9a520, 0x6a6f73, 0xd8d2c2];

/**
 * Lots described from photographs rather than generated. Kept deliberately short: only what the
 * reference photographs listed in docs/V3_REPORT.md actually show.
 */
export const LOT_NOTES: Record<number, Partial<Lot> & { note: string }> = {
  // No individual facade has been confirmed lot-by-lot from a licensed photograph yet. The general
  // character (mixed 2/3 storeys, rectangular shuttered or casement windows, white/cream/pale
  // yellow at the west end, brighter paint toward Lebuh Wayang) is applied statistically instead.
};

/** Deterministic plan of the lots along one frontage. */
export function planFront(buildingId: number, edge: number, len: number): Lot[] {
  const def = FRONTS[`${buildingId}:${edge}`];
  const n = def ? def.n : Math.max(1, Math.round(len / 4.9));
  const lots: Lot[] = [];
  let group = 0, left = 0;
  let cur: Lot | null = null;
  for (let i = 0; i < n; i++) {
    const no = def?.first != null ? def.first + i : null;
    const key = no ?? i + 1000 * (edge + 1);
    const h = hash(buildingId, 977, key);
    if (left <= 0 || !cur) {
      // New building: one to three lots built together.
      const hb = hash(buildingId, 131, key);
      left = [1, 1, 2, 2, 2, 3, 1, 2][hb % 8];
      group++;
      const s = hb >>> 3;
      const style = [0, 0, 0, 1, 1, 1, 2, 3, 0, 1][s % 10];
      const storeys = style === STYLE.deco ? 3 : style === STYLE.straits && (s >>> 5) % 3 === 0 ? 3 : style === STYLE.modern && (s >>> 5) % 2 === 0 ? 3 : style === STYLE.vernacular && (s >>> 5) % 5 === 0 ? 3 : 2;
      cur = {
        no, storeys: storeys as 2 | 3, style,
        wall: (no ?? 0) >= 46 ? WALLS_EAST[(s >>> 8) % WALLS_EAST.length] : WALLS[(s >>> 8) % WALLS.length], trim: 0xf7f4ec, joinery: JOINERY[(s >>> 13) % JOINERY.length],
        front: 0, interior: 0, awning: 0, awningCol: 0, blind: false, h, group, described: false,
      };
    }
    left--;
    const f = (h >>> 4) % 100;
    const lot: Lot = {
      ...cur!, no, h, group,
      // Daytime trading street: most shopfronts are open.
      front: f < 62 ? FRONT.open : f < 78 ? FRONT.half : f < 88 ? FRONT.doors : FRONT.roller,
      interior: (h >>> 11) % 3,
      awning: [0, 1, 1, 2, 0, 1, 0, 2, 1, 0][(h >>> 14) % 10],
      awningCol: AWNINGS[(h >>> 18) % AWNINGS.length],
      blind: (h >>> 22) % 4 === 0,
    };
    const note = no != null ? LOT_NOTES[no] : undefined;
    if (note) { const { note: _n, ...rest } = note; void _n; Object.assign(lot, rest, { described: true }); }
    lots.push(lot);
  }
  return lots;
}

/** Lot index (0-based) and frontage of a house number. */
export function lotOfNumber(no: number): { key: string; buildingId: number; edge: number; index: number; n: number } | null {
  for (const [key, def] of Object.entries(FRONTS)) {
    if (def.first == null || no < def.first || no >= def.first + def.n) continue;
    const [b, e] = key.split(':').map(Number);
    return { key, buildingId: b, edge: e, index: no - def.first, n: def.n };
  }
  return null;
}

/** Where a pinned place sits: building, wall edge and position along it. Null when the place is not pinned. */
export function pinPosition(placeId: string): { b: number; e: number; t: number; no: number; span: number; pin: Pin } | null {
  const pin = PINS[placeId];
  if (!pin) return null;
  const a = lotOfNumber(pin.nos[0]);
  if (!a) return null;
  const span = pin.nos.length;
  return { b: a.buildingId, e: a.edge, t: (a.index + span / 2) / a.n, no: pin.nos[0], span, pin };
}

/** True for a shophouse block of the district. ring = outer ring in chunk file units, (ox, oz) = chunk origin in metres. */
export function isDistrictRow(b: { r: number[][]; a?: { f: number[] } }, ox: number, oz: number, quant = 100): boolean {
  if (!b.a?.f.length) return false;
  const r = b.r[0];
  let x = 0, z = 0;
  for (let i = 0; i < r.length; i += 2) { x += r[i]; z += r[i + 1]; }
  const k = (r.length / 2) * quant;
  return inDistrict(ox + x / k, oz + z / k);
}

/**
 * Carriageway width of the two Main Bazaar one-way ways (OSM way ids), metres. OpenStreetMap has no
 * width for them; the class default (7.2 m each) makes the two carriageways touch, but photographs
 * show two narrow lanes each side of a raised median about 1.5 to 2 m wide. Estimated value.
 */
export const MB_CARRIAGEWAY = 5.4;
export const ROAD_WIDTHS: Record<number, number> = { 68332963: MB_CARRIAGEWAY, 69725588: MB_CARRIAGEWAY };
