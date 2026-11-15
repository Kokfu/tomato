// Shop identity data model (see docs/SHOP_IDENTITY.md). Shared by the offline tools and the runtime.

/** 0 = unverified (machine / aggregated source), 1 = mapped by a named open source, 2 = manually verified by the project owner. */
export type Verification = 0 | 1 | 2;

export interface Place {
  /** Stable id: "osm:node/123", "overture:<gers id>" or "manual:<slug>". Never reused. */
  id: string;
  name: string;
  /** Category as given by the source (OSM shop/amenity/tourism value, Overture primary category). */
  cat: string;
  lat: number;
  lon: number;
  /** World metres (x east, z south), derived from lat/lon by the project projection. */
  x: number;
  z: number;
  addr?: string;
  /** Data source: "osm", "overture" or "manual". */
  src: 'osm' | 'overture' | 'manual';
  /** Date (YYYY-MM-DD) the source record was last updated. */
  upd?: string;
  v: Verification;
  /** Source confidence 0..1 when the source provides one (Overture). */
  conf?: number;
  /**
   * Building association, present only when the geometric evidence is sufficient:
   * b = building id, how = "inside" (point lies in the footprint) or "adjacent" (within 4 m of
   * exactly one footprint), e / t = wall edge and position along it (0..1) used for the sign.
   */
  b?: number;
  how?: 'inside' | 'adjacent';
  e?: number;
  t?: number;
  /** True when a facade sign is rendered for this place. */
  sign?: boolean;
}

/** File format of public/data/kuching/places/<cx>_<cz>.json. */
export interface PlaceChunk {
  v: 1;
  places: Place[];
}

/** File format of data/places-overrides.json (hand-edited or exported from the in-app editor). */
export interface PlaceOverrides {
  /** New or corrected places (matched by id; unknown ids are added). */
  upsert: (Partial<Place> & { id: string })[];
  /** Ids of places that no longer exist. */
  remove: string[];
}

/** Categories that get a storefront sign when the place is associated with a street-facing wall. */
const SIGN_KEYS = new Set(['shop', 'office', 'craft', 'healthcare']);
const SIGN_VALUES = new Set([
  'restaurant', 'cafe', 'fast_food', 'bar', 'pub', 'food_court', 'ice_cream', 'bank', 'pharmacy', 'clinic', 'dentist', 'doctors',
  'bureau_de_change', 'post_office', 'hotel', 'guest_house', 'hostel', 'museum', 'gallery', 'theatre', 'cinema', 'marketplace',
  'money_transfer', 'internet_cafe', 'nightclub', 'veterinary', 'language_school', 'driving_school', 'coworking_space', 'travel_agency',
]);
export function isSignCategory(key: string, value: string): boolean {
  return SIGN_KEYS.has(key) || SIGN_VALUES.has(value);
}

export function googleMapsUrl(p: Pick<Place, 'name' | 'lat' | 'lon'>): string {
  // Public Maps URL scheme (a link out; no Google content is fetched or stored).
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name} Kuching`)}&center=${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;
}
