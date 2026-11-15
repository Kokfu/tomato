// Deterministic architectural classification. Pure (no three.js, no I/O): shared by the data
// pipeline, the tests and the runtime guards.
//
// Four concepts are kept apart on purpose:
//   building FORM      -> ArchClass (this file)
//   current USE        -> OSM amenity / shop tags of points of interest (places pipeline)
//   business TENANCY   -> places associated with a wall (places pipeline)
//   landmark IDENTITY  -> landmark registry (src/world/landmarks/registry.ts)
// Only evidence about the structure itself is accepted here: the tags on the mapped footprint (or
// on the mapped plot used as footprint) and the landmark registry. Tags that describe a tenant
// (shop=*, amenity=restaurant / cafe / fast_food / bank ...) are deliberately ignored, so a
// business inside a building can never turn the whole building into a shop.
import type { ArchClass, ArchBasis } from '../types.ts';

export interface ArchEvidence {
  /** Tags of the footprint feature itself (never of nearby points). */
  tags: Record<string, string>;
  /** Footprint source: 0 = OpenStreetMap, 1 / 2 = machine-detected (Overture). */
  source: 0 | 1 | 2;
  /** Class given by the landmark registry for this structure, when it is a registered landmark. */
  registry?: ArchClass;
}
export interface ArchResult { cls: ArchClass; basis: ArchBasis; rule: string }

const has = (v: string | undefined, list: string[]) => v !== undefined && list.includes(v);
const CHINESE_NAME = /temple|tokong|寺|庙|廟|宫|宮|亭|\bbio\b|\bteng\b/i;

export function classifyArchitecture(e: ArchEvidence): ArchResult {
  const t = e.tags, b = t.building;
  if (e.registry) return { cls: e.registry, basis: 'registry', rule: 'landmark registry' };
  // Machine-detected outlines carry no attributes: nothing is inferred on top of them.
  if (e.source !== 0) return { cls: 'unknown', basis: 'default', rule: 'machine-detected footprint: no form evidence' };
  if (t.man_made === 'bridge' || b === 'bridge') return { cls: 'bridge', basis: 'tag', rule: 'man_made/building=bridge' };
  if (t.man_made === 'ceremonial_gate' || has(t.historic, ['monument', 'memorial', 'city_gate']))
    return { cls: 'monument', basis: 'tag', rule: 'ceremonial gate / monument tag' };
  const worship = t.amenity === 'place_of_worship' || has(b, ['mosque', 'church', 'temple', 'cathedral', 'chapel', 'shrine', 'religious']);
  if (worship) {
    if (b === 'mosque' || t.religion === 'muslim') return { cls: 'mosque', basis: 'tag', rule: 'building=mosque / religion=muslim' };
    if (has(b, ['church', 'cathedral', 'chapel']) || t.religion === 'christian') return { cls: 'church', basis: 'tag', rule: 'church building / religion=christian' };
    if (has(t.religion, ['taoist', 'chinese_folk', 'confucian'])) return { cls: 'chinese_temple', basis: 'tag', rule: `religion=${t.religion}` };
    const names = [t.name, t['name:en'], t['name:zh'], t['name:ms']].filter(Boolean).join(' ');
    if (t.religion === 'buddhist' && CHINESE_NAME.test(names)) return { cls: 'chinese_temple', basis: 'inferred', rule: 'religion=buddhist + Chinese temple name' };
    return { cls: 'other_worship', basis: 'tag', rule: 'place of worship, form not established' };
  }
  if (b === 'fort' || t.historic === 'fort') return { cls: 'fort', basis: 'tag', rule: 'fort tag' };
  if (b === 'palace' || t.historic === 'palace' || t.castle_type === 'palace') return { cls: 'palace', basis: 'tag', rule: 'palace tag' };
  if (b === 'museum' || t.tourism === 'museum') return { cls: 'museum', basis: 'tag', rule: 'museum tag' };
  if (b === 'market' || t.amenity === 'marketplace') return { cls: 'market', basis: 'tag', rule: 'market tag' };
  if (t.amenity === 'food_court' || b === 'food_court') return { cls: 'food_court', basis: 'tag', rule: 'food court tag on the footprint' };
  if (has(b, ['government', 'public']) || t.office === 'government' || has(t.amenity, ['townhall', 'courthouse', 'police', 'fire_station', 'post_office']))
    return { cls: 'government', basis: 'tag', rule: 'government building tag' };
  if (has(b, ['civic', 'school', 'university', 'college', 'hospital', 'kindergarten']) || has(t.amenity, ['school', 'university', 'college', 'hospital', 'library', 'community_centre']))
    return { cls: 'civic', basis: 'tag', rule: 'civic / education / health building tag' };
  if (b === 'roof' || b === 'carport') return { cls: 'open_roof', basis: 'tag', rule: 'building=roof' };
  if (has(b, ['house', 'residential', 'detached', 'terrace', 'semidetached_house', 'bungalow', 'apartments', 'dormitory'])) return { cls: 'residential', basis: 'tag', rule: `building=${b}` };
  if (has(b, ['industrial', 'warehouse', 'manufacture', 'hangar'])) return { cls: 'industrial', basis: 'tag', rule: `building=${b}` };
  if (has(b, ['hut', 'shed', 'garage', 'garages', 'kiosk', 'cabin', 'toilets', 'service'])) return { cls: 'utility', basis: 'tag', rule: `building=${b}` };
  if (b === 'shophouse') return { cls: 'shophouse', basis: 'tag', rule: 'building=shophouse' };
  if (has(b, ['commercial', 'retail', 'supermarket', 'mall', 'office', 'hotel']) || t.tourism === 'hotel') return { cls: 'commercial', basis: 'tag', rule: `building=${b ?? 'hotel'}` };
  // building=yes (or anything else): conservative default. shop=* / amenity=restaurant etc. on the
  // outline describe a tenant, not the structure, and are ignored.
  return { cls: 'unknown', basis: 'default', rule: 'no form evidence (tenancy tags ignored)' };
}
