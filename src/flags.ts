// Feature-flag registry. Pure (no three.js, no DOM), safe under node and in a worker.
//
// Reads `location.search` once and returns a frozen object. See docs/FLAGS.md for the precedence rules.
//   N1-M1: the merged features (v9, ux1, c1, char) are ON by default in a browser (a `location` exists).
//   N1-M5: `m5` (hero places: waterfront kit, the rest of Carpenter Street) is on by default in the same way.
//   - ?v9=0 / ?ux1=0 / ?c1=0 / ?char=0 / ?m5=0 -> that feature off (the previous accepted build); any other value (or none) = on
//   - no `location` (node unit tests, tools) -> everything off, so the tables stay at their V8.6 values
//   - ?lab=1 is kept as a harmless alias (it no longer changes anything)
// `?char=<id>` is still a developer link for one character (see CharacterProfile.ts).

export interface Flags {
  readonly v9: boolean;
  readonly ux1: boolean;
  readonly c1: boolean;
  readonly char: boolean;
  readonly m5: boolean;
  readonly lab: boolean;
}

/** Flags that ?lab=1 switches on. Add a name here only when the owner approves it for the preview. */
export const LAB_FLAGS = ['v9', 'ux1', 'c1', 'char', 'm5'] as const;

/** Pure: parse a query string such as "?v9=0". `defaultOn` is what a flag without a parameter means. */
export function parseFlags(search: string, defaultOn = true): Flags {
  const q = new URLSearchParams(search);
  const resolve = (name: (typeof LAB_FLAGS)[number]): boolean => (q.has(name) ? q.get(name) !== '0' : defaultOn);
  return Object.freeze({ v9: resolve('v9'), ux1: resolve('ux1'), c1: resolve('c1'), char: resolve('char'), m5: resolve('m5'), lab: q.get('lab') === '1' });
}

let cached: Flags | null = null;

/** The flags of the current page, read from `location.search` on first use and cached. */
export function getFlags(): Flags {
  if (cached) return cached;
  let search = '';
  let hasLocation = false;
  try {
    const loc = (globalThis as { location?: { search?: string } }).location;
    if (loc && typeof loc.search === 'string') { search = loc.search; hasLocation = true; }
  } catch { search = ''; }
  cached = parseFlags(search, hasLocation);
  return cached;
}

/** Forget the cached flags so the next getFlags() reads `location.search` again (tests). */
export function resetFlags(): void {
  cached = null;
}
