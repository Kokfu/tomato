// N1-M7: the driven vehicle against other vehicles. Pure (no three.js, no DOM).
//
// The collision world knows walls, piers and the hand-built parked rows; vehicles that move or can be taken (ambient
// traffic, the parked vehicles of src/play/parked.ts) are tested here, box against box.

/** A vehicle's footprint: centre, heading (it faces (sin, cos)), half length and half width. */
export interface Box { x: number; z: number; heading: number; half: number; hw: number }

export interface Overlap {
  /** The shortest move that takes box `a` clear of box `b`. */
  px: number; pz: number;
  depth: number;
}

/** Separating-axis test of two oriented boxes: null when they do not touch. */
export function boxOverlap(a: Box, b: Box): Overlap | null {
  const dx = a.x - b.x, dz = a.z - b.z;
  // quick reject on the bounding circles
  const reach = Math.hypot(a.half, a.hw) + Math.hypot(b.half, b.hw);
  if (dx * dx + dz * dz >= reach * reach) return null;
  const af: [number, number] = [Math.sin(a.heading), Math.cos(a.heading)], bf: [number, number] = [Math.sin(b.heading), Math.cos(b.heading)];
  const axes: [number, number][] = [af, [af[1], -af[0]], bf, [bf[1], -bf[0]]];
  let best = Infinity, px = 0, pz = 0;
  for (const [ux, uz] of axes) {
    const ra = a.half * Math.abs(af[0] * ux + af[1] * uz) + a.hw * Math.abs(af[1] * ux - af[0] * uz);
    const rb = b.half * Math.abs(bf[0] * ux + bf[1] * uz) + b.hw * Math.abs(bf[1] * ux - bf[0] * uz);
    const d = dx * ux + dz * uz, over = ra + rb - Math.abs(d);
    if (over <= 0) return null;
    if (over < best) { best = over; const s = d < 0 ? -1 : 1; px = ux * over * s; pz = uz * over * s; }
  }
  return { px, pz, depth: best };
}

/**
 * How hard the two meet along the push direction, m/s (0 when they are parting): the speed of `a` toward `b` less the
 * speed of `b` away from it.
 */
export function closingSpeed(o: Overlap, avx: number, avz: number, bvx: number, bvz: number): number {
  const l = Math.hypot(o.px, o.pz);
  if (l < 1e-9) return 0;
  const ux = o.px / l, uz = o.pz / l;
  return Math.max(0, -((avx - bvx) * ux + (avz - bvz) * uz));
}

/** Damage (0..1 of a whole vehicle) done by one blow at `speed` m/s. Touches below 2 m/s leave no mark. */
export function damageFrom(speed: number): number {
  return speed <= 2 ? 0 : Math.min(0.5, (speed - 2) * 0.035);
}

/** Engine power left at a damage level: full until half wrecked, then down to 40 % for a wreck. */
export function powerAt(damage: number): number {
  return damage <= 0.5 ? 1 : Math.max(0.4, 1 - (damage - 0.5) * 1.2);
}

/** What a repair costs, ringgit. */
export function repairCost(damage: number): number {
  return damage < 0.02 ? 0 : Math.round((8 + 52 * Math.min(1, damage)) * 10) / 10;
}
