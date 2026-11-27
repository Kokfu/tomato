// Chunk file format (public/data/kuching/chunks/<cx>_<cz>.json), written by tools/generate-world.
// All planar coordinates are integers in centimetres relative to the chunk's min (west, north... i.e.
// min-x, min-z) corner. Flat arrays are [x0, z0, x1, z1, ...].

export interface RoadData {
  /** Index into ROAD_TYPES. */
  t: number;
  /** Width in centimetres. */
  w: number;
  /** Polyline, clipped to the chunk. */
  p: number[];
  /** Flags: 1 = bridge, 2 = tunnel/covered, 4 = width inferred (not tagged), 8 = one-way. */
  f: number;
  /** Absolute deck elevation per vertex in cm (bridges only). */
  e?: number[];
  /** Index into ChunkData.names. */
  n?: number;
  /** OSM way id. */
  id: number;
}

export interface BuildingData {
  /**
   * OSM id (way id, or relation id negated) for OSM buildings. Machine-detected footprints from
   * Overture Maps use 2^52 + the first 48 bits of their Overture (GERS) UUID, which cannot collide
   * with an OSM id (see tools/generate-world/overture.ts).
   */
  id: number;
  /**
   * Footprint source. Absent or 0 = OpenStreetMap (mapped by people); 1 = Microsoft ML Buildings,
   * 2 = Google Open Buildings (both machine-detected from imagery, taken from Overture Maps, outline
   * simplified with a 0.3 m tolerance, lower geometric quality than OSM).
   */
  s?: 0 | 1 | 2;
  /** Rings: [outer, hole, hole, ...]. Not clipped; a building lives in the chunk of its centroid. */
  r: number[][];
  /** Height in centimetres. */
  h: number;
  /** Height source: 0 = height tag (OSM height / Overture height), 1 = derived from building:levels / Overture num_floors, 2 = estimated default. */
  hs: 0 | 1 | 2;
  /** Kind: index into BUILDING_KINDS. */
  k: number;
  /** Index into ChunkData.names. */
  n?: number;
  /**
   * Architectural annotation written by tools/generate-world/build-streetscape.ts. Present only on
   * old-town shophouse rows. Everything in it is an ESTIMATE derived from the mapped outline and
   * the mapped streets: c = style class (1 = shophouse row), f = indices of the wall edges that
   * front a street (edge i runs from ring vertex i to i + 1), lv = storey count.
   */
  a?: { c: number; f: number[]; lv: number };
  /**
   * Architectural class: index into ARCH_CLASSES (absent = 'unknown'). Describes the BUILDING FORM
   * only. It is derived from the footprint's own tags, the landmark registry and the streetscape
   * pass; business points of interest (tenancy) never influence it. See src/world/arch/classify.ts.
   */
  ac?: number;
  /** Basis of `ac`: index into ARCH_BASIS (absent = 'default'). */
  ab?: number;
  /**
   * Landmark registry id (src/world/landmarks/registry.ts). A building carrying it is a PROTECTED
   * landmark site: it is drawn by its dedicated model only and must never reach a generic renderer.
   */
  lm?: string;
}

export interface AreaData {
  /** Index into AREA_KINDS. */
  k: number;
  /** Rings (clipped to chunk): [outer, hole, ...]. */
  r: number[][];
}

export interface PolyDeck {
  /** Outer ring. */
  r: number[];
  /** Absolute elevation, cm. */
  h: number;
}

export interface ChunkData {
  v: number;
  cx: number;
  cz: number;
  /** Terrain: null = full 16 m grid (no water); otherwise baked triangles with water cut out. */
  terrain: { p: number[]; i: number[] } | null;
  /** Water polygons clipped to the chunk; each polygon is [outer, hole, ...]. */
  water: number[][][];
  /** Water boundary polylines that are real shoreline (not chunk-edge cuts). */
  shore: number[][];
  roads: RoadData[];
  buildings: BuildingData[];
  areas: AreaData[];
  /** Individually mapped trees (OSM natural=tree). */
  trees: number[];
  /** Procedurally placed trees inside mapped wood/park polygons (inferred, not mapped). */
  ptrees: number[];
  /** Traversable deck segments, 7 ints each: ax, az, aElev, bx, bz, bElev, halfWidth (cm). */
  decks: number[];
  /** Traversable deck polygons (piers, bridge areas). */
  pdecks: PolyDeck[];
  /** Mapped passages through buildings, 5 ints each: ax, az, bx, bz, halfWidth (cm). */
  pass?: number[];
  /**
   * Street furniture, 5 ints each: type (see FURN), x, z (cm, chunk-local), rotation (degrees about
   * +Y), extra (street-name signs: index into names). Signals, benches and bollards are mapped OSM
   * nodes; lamp posts are procedurally spaced (inferred). N1-M4: lamps carry extra = 1 on the larger roads (a tall
   * column); zebra crossings (mapped nodes; extra = carriageway width, cm) and bus stops (mapped nodes) are placed
   * on the nearest street; yellow box junctions lie on the junction nearest a mapped signal (extra = half length in
   * decimetres * 1000 + half width in decimetres); bollards also close the mouths of pedestrian streets and sign
   * boards (extra = index into BOARDS) stand by rule: both are inferred.
   */
  furn?: number[];
  /** River-bank polylines (cm, chunk-local) that get a promenade railing. */
  rail?: number[][];
  names: string[];
}

export interface Landmark {
  id: string;
  name: string;
  kind: string;
  lat: number;
  lon: number;
  /** World x (east, metres). */
  x: number;
  /** World z (-north, metres). */
  z: number;
  /** OSM reference such as "way/123", when the position comes from a mapped feature. */
  osm?: string;
  /** True when the 3D model is an approximation of the real architecture. */
  approx?: boolean;
  priority?: number;
}

export interface Manifest {
  version: number;
  hash?: string;
  generatedAt: string;
  osmTimestamp: string | null;
  /** Overture Maps release of the machine-detected footprints; absent when none were used. */
  overtureRelease?: string | null;
  origin: { lat: number; lon: number };
  chunkSize: number;
  cell: number;
  quant: number;
  bbox: { south: number; west: number; north: number; east: number };
  /** Height grid: Int16 centimetres, row-major (z rows), nx * nz nodes. */
  height: { file: string; x0: number; z0: number; nx: number; nz: number; cell: number };
  /** Chunk keys that exist ("cx_cz"). */
  chunks: string[];
  spawn: { x: number; z: number; lat: number; lon: number };
  attribution: string[];
  stats: Record<string, number>;
}

export const ROAD_TYPES = [
  'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'service',
  'pedestrian', 'footway', 'path', 'steps', 'cycleway', 'track', 'stream', 'rail', 'pier',
] as const;
export type RoadType = (typeof ROAD_TYPES)[number];

/** Draw group: 0 = waterways, 1 = foot paths, 2 = minor roads, 3 = major roads. */
export const ROAD_STYLE: Record<RoadType, { color: number; group: number; width: number; walk: boolean; major: boolean }> = {
  motorway: { color: 0x5b5d60, group: 3, width: 11, walk: false, major: true },
  trunk: { color: 0x5b5d60, group: 3, width: 10, walk: true, major: true },
  primary: { color: 0x5e6062, group: 3, width: 9, walk: true, major: true },
  secondary: { color: 0x606264, group: 3, width: 8, walk: true, major: true },
  tertiary: { color: 0x636567, group: 3, width: 7, walk: true, major: true },
  residential: { color: 0x696a6b, group: 2, width: 6, walk: true, major: true },
  service: { color: 0x737372, group: 2, width: 4, walk: true, major: false },
  pedestrian: { color: 0xb9ab95, group: 1, width: 6, walk: true, major: false },
  footway: { color: 0xc4b8a4, group: 1, width: 2.2, walk: true, major: false },
  path: { color: 0xb5a58a, group: 1, width: 1.6, walk: true, major: false },
  steps: { color: 0xa9a297, group: 1, width: 2, walk: true, major: false },
  cycleway: { color: 0x8f9a8c, group: 1, width: 2, walk: true, major: false },
  track: { color: 0x9a8b70, group: 1, width: 3, walk: true, major: false },
  stream: { color: 0x4f7f86, group: 0, width: 3, walk: false, major: false },
  rail: { color: 0x6b655f, group: 1, width: 2.5, walk: false, major: false },
  pier: { color: 0x9c8468, group: 1, width: 3, walk: true, major: false },
};

export const BUILDING_KINDS = ['generic', 'house', 'commercial', 'shophouse', 'religious', 'civic', 'industrial', 'roof', 'tower', 'hut'] as const;
/**
 * Explicit architectural classes (building form). Separate from BUILDING_KINDS (legacy render
 * palette), from current use and from business tenancy.
 */
export const ARCH_CLASSES = [
  'unknown', 'shophouse', 'heritage_shophouse', 'chinese_temple', 'mosque', 'church', 'other_worship', 'food_court',
  'opera_stage', 'market', 'government', 'museum', 'fort', 'palace', 'bridge', 'monument', 'commercial', 'residential',
  'industrial', 'civic', 'open_roof', 'utility',
] as const;
export type ArchClass = (typeof ARCH_CLASSES)[number];
/** How an architectural class was established, weakest first. */
export const ARCH_BASIS = ['default', 'inferred', 'tag', 'registry'] as const;
export type ArchBasis = (typeof ARCH_BASIS)[number];
/** Classes the shophouse-row generator may be applied to. Everything else is never given shopfronts. */
export const SHOPFRONT_CLASSES: ReadonlySet<ArchClass> = new Set<ArchClass>(['unknown', 'shophouse', 'heritage_shophouse', 'commercial']);

export const AREA_KINDS = ['park', 'grass', 'wood', 'sand', 'pitch', 'parking', 'plaza', 'cemetery', 'residential', 'commercial', 'industrial', 'scrub', 'school', 'construction'] as const;
export const AREA_COLORS: Record<(typeof AREA_KINDS)[number], string> = {
  park: '#86a868', grass: '#8fae6c', wood: '#5f8a52', sand: '#d8c9a0', pitch: '#7fb06a', parking: '#8f8f8c',
  plaza: '#c2b6a2', cemetery: '#9aaa86', residential: '#a9a595', commercial: '#aaa49a', industrial: '#a09c98',
  scrub: '#7f9a62', school: '#b0aa94', construction: '#b5a487',
};

/** Street furniture type codes used in ChunkData.furn. */
export const FURN = { lamp: 0, signal: 1, sign: 2, bench: 3, bollard: 4, zebra: 5, box: 6, busStop: 7, board: 8 } as const;
/**
 * Roadside sign boards (FURN.board, `extra` = index): generic Malaysian road signs only, never a place or business
 * name. Drawn from src/world/arch/SignAtlas.ts in this order.
 */
export const BOARDS = ['speed50', 'speed60', 'speed30', 'crossing', 'stop', 'caution', 'bus', 'noParking'] as const;
