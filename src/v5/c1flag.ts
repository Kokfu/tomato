// C1a experiment switch (Upper China Street corner). Off unless the page URL carries ?c1=1, so the default build is unchanged.
let v: boolean | undefined;
export function c1Enabled(): boolean {
  if (v === undefined) v = /[?&]c1=1(&|$)/.test(String((globalThis as any).location?.search ?? ''));
  return v;
}

/** C1a, owner-approved Option 1 (C:\Kuching3D-evidence\c1\nyan-shin-provenance.md): mapped places, by id, whose full
 *  OSM `name` goes on the fascia although the V5 note filter (" - " or longer than 30 characters) would skip it. */
export const C1_FULL_NAME_SIGNS: ReadonlySet<string> = new Set(['osm:node/6168638588']);
/** Board text for such a place with ?c1=1: the record's own name, each " - " set as a line break. null otherwise
 *  (always null with the flag off, so V8.6 signs are unchanged). */
export function c1FullNameSign(p: { id?: string; name: string }): string | null {
  return c1Enabled() && p.id !== undefined && C1_FULL_NAME_SIGNS.has(p.id) ? p.name.split(' - ').join('\n') : null;
}
