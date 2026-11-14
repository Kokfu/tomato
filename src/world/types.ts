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
  /** OSM id (way id, or relation id negated). */
  id: number;
  /** Rings: [outer, hole, hole, ...]. Not clipped; a building lives in the chunk of its centroid. */
  r: number[][];
  /** Height in centimetres. */
  h: number;
  /** Height source: 0 = OSM height tag, 1 = derived from building:levels, 2 = estimated default. */
  hs: 0 | 1 | 2;
  /** Kind: index into BUILDING_KINDS. */
  k: number;
  /** Index into ChunkData.names. */
  n?: number;
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
  generatedAt: string;
  osmTimestamp: string | null;
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
  motorway: { color: 0x3a3c40, group: 3, width: 11, walk: false, major: true },
  trunk: { color: 0x3a3c40, group: 3, width: 10, walk: true, major: true },
  primary: { color: 0x3d3f43, group: 3, width: 9, walk: true, major: true },
  secondary: { color: 0x404246, group: 3, width: 8, walk: true, major: true },
  tertiary: { color: 0x434549, group: 3, width: 7, walk: true, major: true },
  residential: { color: 0x4a4c50, group: 2, width: 6, walk: true, major: true },
  service: { color: 0x55575a, group: 2, width: 4, walk: true, major: false },
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
export const AREA_KINDS = ['park', 'grass', 'wood', 'sand', 'pitch', 'parking', 'plaza', 'cemetery', 'residential', 'commercial', 'industrial', 'scrub', 'school', 'construction'] as const;
export const AREA_COLORS: Record<(typeof AREA_KINDS)[number], string> = {
  park: '#86a868', grass: '#8fae6c', wood: '#5f8a52', sand: '#d8c9a0', pitch: '#7fb06a', parking: '#8f8f8c',
  plaza: '#c2b6a2', cemetery: '#9aaa86', residential: '#a9a595', commercial: '#aaa49a', industrial: '#a09c98',
  scrub: '#7f9a62', school: '#b0aa94', construction: '#b5a487',
};
