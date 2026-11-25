// N1-M5 hero place 4: the entrance of Plaza Merdeka (pure geometry: mesh builder, collision and sign pass read it).
//
// WHAT IS REAL (OpenStreetMap): the mall's outline (way 232212851) and its name; the drop-off lane off Jalan Pearl
// (way 1243941336) and the footway from it (way 1415532719) that ends at one end of the face used here.
// APPROXIMATE, ALL THE REST: no licensed photograph of Plaza Merdeka was found (docs/night/refs/PLACES.md, section 4).
// The mall was a block with shop windows and no way in. It gets a generic mall entrance on the 15.7 m face of its
// stepped south-west corner, the face the mapped drop-off lane and footway lead to: a two-storey glazed portal in a
// white frame, a canopy on two columns, a paved forecourt with bollards and planters, and the mapped name over the
// door. Its form and every dimension are a guess and are labelled so.
import { CHUNK_SIZE, QUANT } from '../config.ts';
import type { ChunkData } from '../types.ts';
import { edgeOutward } from '../arch/frontage.ts';
import { m5Enabled } from './m5.ts';

export const PLAZA_ID = 232212851;
export const PLAZA_EDGE = 3;
export const PORTAL = { half: 5.2, depth: 0.5, top: 7.6, lintel: 5.9, canopyOut: 3.6, canopyY: 3.3, forecourt: 6, forecourtHalf: 7.8 };

export interface Entrance {
  /** Middle of the entrance face (world metres), unit vector along it, unit outward normal, its length. */
  x: number; z: number; ex: number; ez: number; nx: number; nz: number; len: number;
}

export function plazaEntrance(data: ChunkData): Entrance | null {
  if (!m5Enabled()) return null;
  const b = data.buildings.find((q) => q.id === PLAZA_ID);
  if (!b) return null;
  const ox = data.cx * CHUNK_SIZE, oz = data.cz * CHUNK_SIZE, r = b.r[0], j = (PLAZA_EDGE + 1) % (r.length / 2);
  const ax = ox + r[PLAZA_EDGE * 2] / QUANT, az = oz + r[PLAZA_EDGE * 2 + 1] / QUANT, bx = ox + r[j * 2] / QUANT, bz = oz + r[j * 2 + 1] / QUANT;
  const len = Math.hypot(bx - ax, bz - az), [nx, nz] = edgeOutward(r, PLAZA_EDGE);
  return { x: (ax + bx) / 2, z: (az + bz) / 2, ex: (bx - ax) / len, ez: (bz - az) / len, nx, nz, len };
}

/** Canopy columns, planters and bollards: [along, out, half along, half out, height] in the entrance frame. */
export function plazaProps(): { kind: 'column' | 'planter' | 'bollard'; a: number; o: number; ha: number; ho: number; h: number }[] {
  const out: { kind: 'column' | 'planter' | 'bollard'; a: number; o: number; ha: number; ho: number; h: number }[] = [];
  for (const a of [-4, 4]) out.push({ kind: 'column', a, o: PORTAL.canopyOut - 0.3, ha: 0.2, ho: 0.2, h: PORTAL.canopyY });
  for (const a of [-6.7, 6.7]) out.push({ kind: 'planter', a, o: 1.2, ha: 0.9, ho: 0.45, h: 0.55 });
  for (let k = 0; k < 6; k++) out.push({ kind: 'bollard', a: -6 + k * 2.4, o: PORTAL.forecourt + 0.25, ha: 0.1, ho: 0.1, h: 0.9 });
  return out;
}

export function plazaObstacles(data: ChunkData): { ring: number[]; h: number }[] {
  const e = plazaEntrance(data);
  if (!e) return [];
  return plazaProps().map((p) => {
    const cx = e.x + e.ex * p.a + e.nx * p.o, cz = e.z + e.ez * p.a + e.nz * p.o, ring: number[] = [];
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) ring.push(cx + e.ex * p.ha * a + e.nx * p.ho * b, cz + e.ez * p.ha * a + e.nz * p.ho * b);
    return { ring, h: p.h };
  });
}

/** The mapped name over the door: centre (world metres, height above the forecourt), reading direction, normal. */
export function plazaSign(data: ChunkData): { text: string; x: number; z: number; up: number; ex: number; ez: number; nx: number; nz: number; maxW: number; h: number } | null {
  const e = plazaEntrance(data);
  const b = data.buildings.find((q) => q.id === PLAZA_ID);
  if (!e || !b || b.n === undefined) return null;
  const o = PORTAL.depth + 0.04;
  return { text: data.names[b.n], x: e.x + e.nx * o, z: e.z + e.nz * o, up: (PORTAL.lintel + PORTAL.top) / 2, ex: e.ex, ez: e.ez, nx: e.nx, nz: e.nz, maxW: PORTAL.half * 2 - 1.6, h: 1.05 };
}
