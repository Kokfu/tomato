// Shared constants for the runtime and the preprocessing tools.

/** Chunk edge length in metres. */
export const CHUNK_SIZE = 256;
/** Terrain height-grid spacing in metres (CHUNK_SIZE / CELL must be an integer). */
export const CELL = 16;
/** Chunk coordinates are quantised to this many units per metre in chunk files. */
export const QUANT = 100;
/** River / sea surface elevation in the local vertical frame (metres). */
export const WATER_LEVEL = 0;
/** Ground elevation at the river bank (metres above WATER_LEVEL). */
export const BANK_LEVEL = 1.8;

/** Geographic extent of the prepared data set (WGS84 degrees). */
export const DATA_BBOX = { south: 1.535, west: 110.315, north: 1.58, east: 110.38 };

/** Default spawn: Kuching Waterfront promenade (validated against walkable data at build time). */
export const SPAWN_GEO = { lat: 1.5602, lon: 110.3462 };

export const DATA_ROOT = 'data/kuching';

export function chunkKey(cx: number, cz: number): string {
  return `${cx}_${cz}`;
}
