import { CHUNK_SIZE } from '../config.ts';
import type { ChunkData } from '../types.ts';
import type { GeoBuf } from '../Materials.ts';
import type { BuildContext } from '../ChunkManager.ts';
import { box, paint, quad } from './IndiaStreetMesh.ts';
import { GRAVE_AXIS, mosqueGraves } from './mosqueGraves.ts';

// N1-M5 place 6: the graves of the cemetery beside the Kuching City Mosque (see mosqueGraves.ts: every grave is
// Approximate). Each is a low kerb round a strip of grass with a headstone at either end, merged into the chunk's
// structure mesh: no new draw call (22 triangles a grave). The Low preset draws the two stones only.

export function buildGraves(data: ChunkData, ctx: BuildContext, solid: GeoBuf): void {
  const graves = mosqueGraves(data);
  if (!graves.length) return;
  const ox = data.cx * CHUNK_SIZE, oz = data.cz * CHUNK_SIZE, low = ctx.quality.name === 'low', [ax, az] = GRAVE_AXIS;
  for (const g of graves) {
    const x = g.x - ox, z = g.z - oz, y = ctx.height.sample(g.x, g.z), dark = (g.h >>> 20) % 7 === 0, tone = 0.9 + ((g.h >>> 23) % 10) / 100;
    if (!low) {
      paint(dark ? 0x8d8f92 : 0xdcd8cc, tone);
      box(solid, x, z, ax, az, 1.0, 0.42, y - 0.15, y + 0.17);
      paint(0x5f7f45, tone);
      const p = (a: number, b: number) => [x + ax * a - az * b, y + 0.185, z + az * a + ax * b];
      quad(solid, p(-0.86, -0.29), p(0.86, -0.29), p(0.86, 0.29), p(-0.86, 0.29), [0, 1, 0]);
    }
    // the head stone is a small slab, the foot stone a single pane (the structure mesh is double sided)
    paint(dark ? 0x4a4d52 : 0xf2f0e8, tone);
    box(solid, x + ax * 0.82, z + az * 0.82, ax, az, 0.05, 0.1, y - 0.1, y + 0.62, false);
    const q = (b: number, yy: number) => [x - ax * 0.82 - az * b, yy, z - az * 0.82 + ax * b];
    quad(solid, q(-0.09, y - 0.1), q(0.09, y - 0.1), q(0.09, y + 0.48), q(-0.09, y + 0.48), [ax, 0, az]);
  }
}
