// Preview-flag registry. Pure (no three.js, no DOM), safe under node and in a worker.
//
// Reads `location.search` once and returns a frozen object. See docs/FLAGS.md for the precedence rules.
//   - no params                -> everything off (the page is exactly the accepted build)
//   - ?v9=1 / ?ux1=1           -> that flag on, as before
//   - ?lab=1                   -> the two integrated previews (v9, ux1) on; nothing else
//   - ?lab=1&v9=0 (or ux1=0)   -> an explicit value always beats ?lab=1
// A flag is on only for the exact value "1". Any other value ("0", "true", "") is off, and counts as explicit.

export interface Flags {
  readonly v9: boolean;
  readonly ux1: boolean;
  readonly lab: boolean;
}

/** Flags that ?lab=1 switches on. Add a name here only when the owner approves it for the preview. */
export const LAB_FLAGS = ['v9', 'ux1'] as const;

/** Pure: parse a query string such as "?lab=1&v9=0". */
export function parseFlags(search: string): Flags {
  const q = new URLSearchParams(search);
  const lab = q.get('lab') === '1';
  const resolve = (name: (typeof LAB_FLAGS)[number]): boolean => (q.has(name) ? q.get(name) === '1' : lab);
  return Object.freeze({ v9: resolve('v9'), ux1: resolve('ux1'), lab });
}

let cached: Flags | null = null;

/** The flags of the current page, read from `location.search` on first use and cached. */
export function getFlags(): Flags {
  if (cached) return cached;
  let search = '';
  try {
    const loc = (globalThis as { location?: { search?: string } }).location;
    if (loc && typeof loc.search === 'string') search = loc.search;
  } catch { search = ''; }
  cached = parseFlags(search);
  return cached;
}

/** Forget the cached flags so the next getFlags() reads `location.search` again (tests). */
export function resetFlags(): void {
  cached = null;
}
