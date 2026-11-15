// Geometric association of a place with a building wall. Pure (no three.js): used by
// tools/generate-world/build-places.ts and by the in-app editor for newly added places.
import { pointInRingFlat, projectOnSegment } from '../arch/frontage.ts';

export interface CandidateBuilding {
  id: number;
  /** Outer ring, world metres, flat. */
  ring: ArrayLike<number>;
  /** Street-facing edges when known (shophouse rows); otherwise every edge is considered. */
  front?: number[];
}

export interface Association { b: number; how: 'inside' | 'adjacent'; e?: number; t?: number }

/** A point this close to exactly one footprint counts as belonging to it. */
export const ADJACENT_MAX = 4;
/** A second footprint must be at least this much farther away, otherwise the match is ambiguous. */
export const AMBIGUITY_MARGIN = 2;
/** Places deeper inside a block than this get no facade sign (their frontage is unknown). */
export const SIGN_MAX_DEPTH = 16;

function distToRing(x: number, z: number, r: ArrayLike<number>): number {
  let best = Infinity;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) best = Math.min(best, projectOnSegment(x, z, r[j], r[j + 1], r[i], r[i + 1])[1]);
  return best;
}

/**
 * Decide whether (x, z) belongs to one of the candidate buildings.
 *  - inside a footprint -> that building;
 *  - otherwise the nearest footprint if it is within ADJACENT_MAX and no other footprint is nearly
 *    as close;
 *  - otherwise null: the place stays a free-standing point (no sign, still inspectable).
 * `edgeOk` can veto wall edges (the build tool uses it to require a street in front of the wall).
 */
export function associate(x: number, z: number, buildings: CandidateBuilding[], edgeOk?: (b: CandidateBuilding, edge: number) => boolean): Association | null {
  let hit: CandidateBuilding | null = null, how: 'inside' | 'adjacent' = 'inside';
  for (const b of buildings) if (pointInRingFlat(x, z, b.ring)) { hit = b; break; }
  if (!hit) {
    let d1 = Infinity, d2 = Infinity;
    for (const b of buildings) {
      const d = distToRing(x, z, b.ring);
      if (d < d1) { d2 = d1; d1 = d; hit = b; } else if (d < d2) d2 = d;
    }
    if (!hit || d1 > ADJACENT_MAX || d2 < d1 + AMBIGUITY_MARGIN) return null;
    how = 'adjacent';
  }
  const r = hit.ring, n = r.length / 2;
  let be = -1, bt = 0, bd = SIGN_MAX_DEPTH;
  const edges = hit.front?.length ? hit.front : Array.from({ length: n }, (_, i) => i);
  for (const e of edges) {
    const j = (e + 1) % n;
    if (Math.hypot(r[j * 2] - r[e * 2], r[j * 2 + 1] - r[e * 2 + 1]) < 3) continue;
    if (edgeOk && !edgeOk(hit, e)) continue;
    const [t, d] = projectOnSegment(x, z, r[e * 2], r[e * 2 + 1], r[j * 2], r[j * 2 + 1]);
    if (d < bd) { bd = d; be = e; bt = t; }
  }
  return be >= 0 ? { b: hit.id, how, e: be, t: +bt.toFixed(4) } : { b: hit.id, how };
}

/** Lower-case, punctuation-free form used to spot the same business in two sources. */
export function normName(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/['’`]/g, '').replace(/[^a-z0-9一-鿿]+/g, ' ').replace(/\b(sdn|bhd|co|company|the|kuching|cafe|restaurant|restoran|kedai|shop)\b/g, ' ').replace(/\s+/g, ' ').trim();
}
