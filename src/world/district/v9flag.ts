// V9-VISUAL prototype switch. Pure (no three.js), safe under node (no `location`) and in a worker.
//
// New behaviour is on only when the page URL carries ?v9=1, or ?lab=1 without ?v9=0 (see src/flags.ts and
// docs/FLAGS.md). The URL is read once, on first use, and cached by the registry. In a worker, `location` is
// the worker script's URL, so a page that builds chunks in a worker must either append its own query string
// to the worker URL or call setV9(true) there.
import { getFlags, resetFlags } from '../../flags.ts';
import { FRONTS, lotOfNumber } from './mainBazaar.ts';

/** First block of the run the prototype redraws (Jalan Main Bazaar, frontage edge 2). */
export const V9_BLOCK = 233690737;
/** Every block with a Main Bazaar frontage (the keys of FRONTS). */
export const V9_BLOCKS: readonly number[] = [...new Set(Object.keys(FRONTS).map((k) => Number(k.split(':')[0])))];
/** House numbers of the lots that change (inclusive): all of Main Bazaar, 1-71. */
export const V9_NOS: readonly [number, number] = (() => {
  let lo = Infinity, hi = -Infinity;
  for (const d of Object.values(FRONTS)) if (d.first !== null) { lo = Math.min(lo, d.first); hi = Math.max(hi, d.first + d.n - 1); }
  return [lo, hi] as const;
})();

let override: boolean | null = null;

/** Explicit override (tests, workers). Pass null to forget it and read the URL again. */
export function setV9(v: boolean | null): void {
  override = v;
  if (v === null) resetFlags();
}

export function v9Enabled(): boolean {
  return override !== null ? override : getFlags().v9;
}

/** True for the lots the prototype changes: flag on and a numbered lot of a FRONTS frontage of that block (Main Bazaar Nos 1-71). */
export function v9Lot(buildingId: number, no: number | null): boolean {
  if (!v9Enabled() || no === null) return false;
  return lotOfNumber(no)?.buildingId === buildingId;
}

/**
 * V9-P3: the old (V8.6) frontage edges that meet the Main Bazaar run at its six run ends (block:edge). Behind the
 * flag their lots take the V9 arcade too, so the run meets them without a grey pier or a checker floor at the seam.
 */
export const V9_SEAM_EDGES: readonly string[] = ['233690737:1', '233690737:3', '236495303:17', '236495303:0', '236495776:16', '236495776:5'];

/** True for a frontage edge of V9_SEAM_EDGES while the flag is on. */
export function v9SeamEdge(buildingId: number, edge: number): boolean {
  return v9Enabled() && V9_SEAM_EDGES.includes(`${buildingId}:${edge}`);
}

/**
 * V9-P3 round 3 (owner-approved, 2026-11-20): corners (block:edge = the corner after that edge) where the shopfronts of both lots stop at
 * the inner corner of the two walkways. Only the Main Bazaar No 1 corner: 233690737 edge 0 (old V8.6 arcade, kept as the boundary) | edge 1
 * (seam edge). Without the trim edge 0's last shopfront jamb and transom stand 0.79 m into edge 1's walkway, and edge 1's first one 0.78 m
 * into edge 0's. The arcades themselves (floors, ceilings, piers, collision) are unchanged.
 */
export const V9_TRIM_CORNERS: readonly string[] = ['233690737:0'];

/** True for the corner after frontage edge `edge` of V9_TRIM_CORNERS while the flag is on. */
export function v9TrimCorner(buildingId: number, edge: number): boolean {
  return v9Enabled() && V9_TRIM_CORNERS.includes(`${buildingId}:${edge}`);
}
