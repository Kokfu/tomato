// V9-VISUAL prototype switch. Pure (no three.js), safe under node (no `location`) and in a worker.
//
// New behaviour is on only when the page URL carries ?v9=1. The URL is read once, on first use, and
// cached. In a worker, `location` is the worker script's URL, so a page that builds chunks in a
// worker must either append its own query string to the worker URL or call setV9(true) there.
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

let cached: boolean | null = null;

/** Explicit override (tests, workers). Pass null to forget it and read the URL again. */
export function setV9(v: boolean | null): void {
  cached = v;
}

export function v9Enabled(): boolean {
  if (cached !== null) return cached;
  let on = false;
  try {
    const loc = (globalThis as { location?: { search?: string } }).location;
    if (loc && typeof loc.search === 'string') on = new URLSearchParams(loc.search).get('v9') === '1';
  } catch { on = false; }
  cached = on;
  return on;
}

/** True for the lots the prototype changes: flag on and a numbered lot of a FRONTS frontage of that block (Main Bazaar Nos 1-71). */
export function v9Lot(buildingId: number, no: number | null): boolean {
  if (!v9Enabled() || no === null) return false;
  return lotOfNumber(no)?.buildingId === buildingId;
}
