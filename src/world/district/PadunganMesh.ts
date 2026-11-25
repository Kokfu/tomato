import { CHUNK_SIZE } from '../config.ts';
import type { ChunkData } from '../types.ts';
import type { GeoBuf } from '../Materials.ts';
import type { BuildContext } from '../ChunkManager.ts';
import { edgeOutward } from '../arch/frontage.ts';
import { kapcai, paint, quad } from './IndiaStreetMesh.ts';
import { padunganBikes, padunganBoard, padunganFronts } from './padungan.ts';

// N1-M5 dressing of the Jalan Padungan shophouse rows (see padungan.ts: which lot gets what is by rule, Approximate).
// Painted timber fascia boards with gold trim under the beam of the five-foot way, a few cloth awnings, and kapcai in
// front of the shops. All of it goes into the chunk's structure mesh: no new draw call, material or shader program.

const GOLD = 0xd9b23a;

export function buildPadungan(data: ChunkData, ctx: BuildContext, solid: GeoBuf): void {
  const fronts = padunganFronts(data);
  if (!fronts.length) return;
  const ox = data.cx * CHUNK_SIZE, oz = data.cz * CHUNK_SIZE, low = ctx.quality.name === 'low';
  for (const f of fronts) {
    const n = f.ring.length / 2, j = (f.edge + 1) % n;
    let ground = 0;
    for (let i = 0; i < n; i++) ground += ctx.height.sample(f.ring[i * 2], f.ring[i * 2 + 1]);
    ground /= n;
    const ax = f.ring[f.edge * 2] - ox, az = f.ring[f.edge * 2 + 1] - oz, bx = f.ring[j * 2] - ox, bz = f.ring[j * 2 + 1] - oz;
    const len = Math.hypot(bx - ax, bz - az), ex = (bx - ax) / len, ez = (bz - az) / len, w = len / f.lots;
    const [nx, nz] = edgeOutward(f.ring, f.edge);
    for (let u = 0; u < f.lots; u++) {
      const board = padunganBoard(f.b.id, f.edge, u);
      if (!board) continue;
      const mx = ax + ex * (u + 0.5) * w, mz = az + ez * (u + 0.5) * w, hw = w / 2 - 0.24;
      const p = (a: number, o: number, y: number) => [mx + ex * a + nx * o, ground + y, mz + ez * a + nz * o];
      const N = [nx, 0, nz];
      // the board hangs under the beam, with a gold strip along its lower edge and a gold lozenge in the middle
      paint(board.colour);
      quad(solid, p(-hw, 0.07, 2.62), p(hw, 0.07, 2.62), p(hw, 0.07, 3.0), p(-hw, 0.07, 3.0), N);
      paint(GOLD);
      quad(solid, p(-hw, 0.09, 2.62), p(hw, 0.09, 2.62), p(hw, 0.09, 2.68), p(-hw, 0.09, 2.68), N);
      if (!low) {
        quad(solid, p(-0.34, 0.09, 2.82), p(0, 0.09, 2.73), p(0.34, 0.09, 2.82), p(0, 0.09, 2.91), N);
        for (const s of [-1, 1]) quad(solid, p(s * (hw - 0.5), 0.09, 2.76), p(s * (hw - 0.12), 0.09, 2.76), p(s * (hw - 0.12), 0.09, 2.88), p(s * (hw - 0.5), 0.09, 2.88), N);
      }
      if (board.awning && !low) {
        // a short cloth awning over the kerb side of the five-foot way
        paint(board.colour, 0.9);
        quad(solid, p(-hw, 0.1, 3.02), p(hw, 0.1, 3.02), p(hw, 1.25, 2.6), p(-hw, 1.25, 2.6), [nx * 0.3, 0.95, nz * 0.3]);
        quad(solid, p(-hw, 1.25, 2.6), p(hw, 1.25, 2.6), p(hw, 1.25, 2.42), p(-hw, 1.25, 2.42), N);
      }
    }
  }
  for (const k of padunganBikes(data)) kapcai(solid, { x: k.x, z: k.z, tx: k.tx, tz: k.tz, kind: 'kapcai', h: k.h }, ox, oz, ctx);
}
