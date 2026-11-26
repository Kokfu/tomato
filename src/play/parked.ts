// N1-M7: where vehicles stand parked for the player to take. Pure (no three.js, no DOM): candidate places come from
// the chunk data alone, so the same vehicles stand in the same places every time; the game then keeps those that are
// clear of walls, water and other roads (Play.ts, with the collision world).
//
// Everything here is invented (docs/LIMITATIONS.md): no parked vehicle is mapped. The rule: beside service roads
// (parking aisles, back lanes, driveways: the roads the ambient traffic does not use), just off the carriageway and
// parallel to it; a kapcai also stands at the edge of some residential streets.
import { CHUNK_SIZE, QUANT } from '../world/config.ts';
import type { ChunkData } from '../world/types.ts';
import { FURN, ROAD_TYPES } from '../world/types.ts';
import { rnd } from '../v5/kit.ts';
import { KIND, SIZE } from '../life/traffic.ts';
import type { DriveKind } from '../vehicle/VehiclePhysics.ts';

/** Kinds that stand parked, as traffic kinds (src/life/traffic.ts). */
export const DRIVE_TO_KIND: Record<DriveKind, number> = { hatch: KIND.hatch, kapcai: KIND.kapcai, taxi: KIND.taxi, pickup: KIND.pickup };

export interface Spot {
  /** Stable name: chunk, road (its index in the chunk) and place along it. */
  key: string;
  /** The point on the carriageway edge, the unit normal pointing away from the road, and the unit direction the vehicle faces. */
  ex: number; ez: number; nx: number; nz: number; fx: number; fz: number;
  /** Beside a service road (wide enough for any kind), or at the edge of a residential street (a kapcai only). */
  service: boolean;
  kind: DriveKind;
  /** Index into the paint list (the taxi has its own paint). */
  tint: number;
}

export interface Pose { x: number; z: number; heading: number }

const SERVICE = ROAD_TYPES.indexOf('service'), RESIDENTIAL = ROAD_TYPES.indexOf('residential');
/**
 * Metres between two candidate places along a road, the least distance from either end, the gap to the carriageway
 * edge (beside a service road, and wider beside a residential street, which has traffic), and the share of places taken.
 */
export const PARK = { step: 11, ends: 8, gap: 0.25, kerbGap: 0.6, share: 0.42, kapcaiShare: 0.14 };

/** Where a vehicle of `kind` stands at a spot: its side just clear of the carriageway edge. */
export function spotPose(s: Spot, kind: DriveKind = s.kind): Pose {
  const off = SIZE[DRIVE_TO_KIND[kind]].hw + (s.service ? PARK.gap : PARK.kerbGap);
  return { x: s.ex + s.nx * off, z: s.ez + s.nz * off, heading: Math.atan2(s.fx, s.fz) };
}

/**
 * Candidate parking places of one chunk, in a fixed order: the taken places beside its service roads and at the edge
 * of its residential streets. Not yet checked against walls, water or other roads. `tints`: number of paints.
 */
export function parkingSpots(d: ChunkData, tints = 12): Spot[] {
  const out: Spot[] = [], ox = d.cx * CHUNK_SIZE, oz = d.cz * CHUNK_SIZE;
  // what a vehicle must not stand on: street furniture (posts, benches, shelters) and mapped trees
  const posts: number[] = [];
  const f = d.furn;
  if (f) for (let i = 0; i + 4 < f.length; i += 5) if (f[i] !== FURN.zebra && f[i] !== FURN.box) posts.push(ox + f[i + 1] / QUANT, oz + f[i + 2] / QUANT);
  for (let i = 0; i + 1 < d.trees.length; i += 2) posts.push(ox + d.trees[i] / QUANT, oz + d.trees[i + 1] / QUANT);
  const big = SIZE[KIND.pickup], bike = SIZE[KIND.kapcai];
  for (let ri = 0; ri < d.roads.length; ri++) {
    const r = d.roads[ri], seed = r.id + ri * 7919;
    const service = r.t === SERVICE;
    if ((!service && r.t !== RESIDENTIAL) || (r.f & 3) !== 0) continue;
    const p = r.p, hw = r.w / QUANT / 2;
    let total = 0;
    for (let i = 2; i < p.length; i += 2) total += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]) / QUANT;
    if (total < PARK.ends * 2 + 2) continue;
    let seg = 2, before = 0, n = 0;
    for (let s = PARK.ends; s <= total - PARK.ends; s += PARK.step, n++) {
      if (rnd(seed, n, 71) >= (service ? PARK.share : PARK.kapcaiShare)) continue;
      // the point s metres along the polyline
      let len = Math.hypot(p[seg] - p[seg - 2], p[seg + 1] - p[seg - 1]) / QUANT;
      while (seg < p.length - 2 && before + len < s) { before += len; seg += 2; len = Math.hypot(p[seg] - p[seg - 2], p[seg + 1] - p[seg - 1]) / QUANT; }
      if (len < 0.5) continue;
      const t = Math.min(1, Math.max(0, (s - before) / len));
      const ax = p[seg - 2] / QUANT, az = p[seg - 1] / QUANT, dx = (p[seg] / QUANT - ax) / len, dz = (p[seg + 1] / QUANT - az) / len;
      const kr = rnd(seed, n, 72);
      const kind: DriveKind = !service ? 'kapcai' : kr < 0.46 ? 'hatch' : kr < 0.66 ? 'kapcai' : kr < 0.84 ? 'pickup' : 'taxi';
      // left of the direction of travel is (dz, -dx): a vehicle on that side faces along the way, on the other side against it
      const side = rnd(seed, n, 73) < 0.5 || (r.f & 8) !== 0 ? 1 : -1;
      const nx = dz * side, nz = -dx * side;
      const ex = ox + ax + dx * len * t + nx * hw, ez = oz + az + dz * len * t + nz * hw;
      const size = service ? big : bike, mid = size.hw + (service ? PARK.gap : PARK.kerbGap);
      if (posts.length && tooNear(posts, ex + nx * mid, ez + nz * mid, dx, dz, size.half + 0.6, size.hw + 0.5)) continue;
      out.push({ key: `${d.cx}_${d.cz}:${ri}:${n}`, ex, ez, nx, nz, fx: dx * side, fz: dz * side, service, kind, tint: Math.floor(rnd(seed, n, 74) * tints) });
    }
  }
  return out;
}

/** True when a post [x, z, ...] stands inside the box (centre, unit direction, half length, half width). */
function tooNear(posts: number[], x: number, z: number, dx: number, dz: number, half: number, hw: number): boolean {
  for (let i = 0; i < posts.length; i += 2) {
    const ex = posts[i] - x, ez = posts[i + 1] - z;
    if (Math.abs(ex * dx + ez * dz) < half && Math.abs(ex * dz - ez * dx) < hw) return true;
  }
  return false;
}

/**
 * Near the start one vehicle of each kind is sure to stand, so a new player meets all four within a short walk: the
 * car that has waited in Jalan China since V8, and these three in a row on the riverside footpath of Jalan Main
 * Bazaar, 30 to 35 m from it, two thirds of a metre clear of the carriageway (the old town has hardly a service road).
 * Not on the median between the two carriageways: a vehicle there stops a driver who follows the lane, because the
 * parked row on the shop side pushes the lane toward it.
 * Places found in the running game (tools/dev/play-probe.ts lists what stands where); each is still tested when its
 * chunk loads, and left out if something has come to stand there.
 */
export const STARTERS: readonly (Pose & { kind: DriveKind })[] = [
  { x: 233.36, z: -72.67, heading: 0.961, kind: 'taxi' },
  { x: 228.3, z: -75.85, heading: 0.961, kind: 'kapcai' },
  { x: 238.26, z: -69.17, heading: 0.961, kind: 'pickup' },
];

/** A vehicle that stands parked: the place it came from (`key`) and where it stands. */
export interface Stand extends Pose { key: string; kind: DriveKind; tint: number }

/**
 * Turn the candidates of one chunk into the vehicles that stand there. `clear(pose, kind)` is the game's test against
 * walls, water and other roads. The starters of this chunk first, then every candidate, none overlapping another.
 */
export function settle(spots: Spot[], cx: number, cz: number, clear: (p: Pose, kind: DriveKind) => boolean, starters: readonly (Pose & { kind: DriveKind })[] = STARTERS): Stand[] {
  const out: Stand[] = [];
  starters.forEach((s, i) => {
    if (Math.floor(s.x / CHUNK_SIZE) !== cx || Math.floor(s.z / CHUNK_SIZE) !== cz) return;
    if (clear(s, s.kind)) out.push({ key: `start:${i}`, kind: s.kind, tint: i, x: s.x, z: s.z, heading: s.heading });
  });
  for (const p of spots) {
    const pose = spotPose(p);
    // (no two parked vehicles overlap: places on two roads can meet at a corner)
    if (out.some((o) => Math.hypot(o.x - pose.x, o.z - pose.z) < 5.6)) continue;
    if (clear(pose, p.kind)) out.push({ key: p.key, kind: p.kind, tint: p.tint, ...pose });
  }
  return out;
}
