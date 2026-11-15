# Streetscape and architectural system (V2)

How the old-town streets are generated, and exactly which parts are mapped facts and which are
estimates. Rule followed throughout: **geometry and names come from data; appearance may be
inferred, is deterministic, and is labelled as inferred here and in the code.**

## Pipeline

```
build.ts                 chunks (roads, outlines, water, terrain)            unchanged
build-streetscape.ts     annotates chunks in place: shophouse rows, furniture, railings
build-graph.ts           pedestrian routing graph                              unchanged
build-places.ts          places/<chunk>.json: businesses tied to building walls
```

`npm run data:build` runs all four. `build-streetscape.ts` is idempotent.

## Shophouse rows

OpenStreetMap maps the old-town blocks as plain outlines: no levels, no building type, no lot
lines. V1 extruded them as 10 to 12 m beige boxes with a repeated window, which read as four-storey
office blocks.

**Classification (estimate).** A human-mapped, low-rise outline becomes a shophouse row
when at least one wall fronts one of these streets: Jalan Main Bazaar, Jalan Gambier, Jalan
Carpenter, Jalan Ewe Hai, Upper China Street, Jalan China, Jalan Bishopgate, Lebuh Wayang, Lebuh
Temple, Jalan India, Lorong Kai Joo, Jalan Khoo Hun Yeang, Jalan Power, Jalan Market, Lebuh Jawa,
Jalan Padungan, Jalan Green Hill. Outlines named as institutions (court, museum, temple, hotel,
office, car park and similar, which covers every custom landmark) and machine-detected footprints
are never reclassified; a row that OSM names after a business inside it (for example "328 Gallery
Sdn. Bhd." on Main Bazaar) still counts. Result: 122 buildings, 186 frontage walls, 4.7 km of
frontage, about 910 estimated lots.

**Frontage walls (derived from mapped geometry).** A wall edge is a frontage when a street
centreline lies in front of it (within half the road width + 9 m), runs along it, and no other
building stands between. Stored as `a.f` on the building.

**Height (estimate).** Rows without a tagged height are set to 8.2 m eaves (two storeys:
3.75 m ground floor with fascia, upper floor, parapet). Height source stays `2 = estimated`.
Rows with `building:levels` keep their tagged height and get one window band per upper storey.

**Generated on the real outline** (`src/world/arch/Shophouse.ts`):

| Element | Basis |
|---|---|
| Lot rhythm, about 5.2 m per lot | inferred (lot lines are not mapped) |
| Five-foot way, 2.3 m deep, behind every frontage | inferred position, typical dimension; it is walkable because the collision outline uses the same recessed line (`insetEdges`) |
| Columns at lot boundaries, capitals, pilasters, cornice, string course | inferred |
| Per-lot wall colour (14 Kuching pastels), upper-storey style (louvred shutters with fanlights, arched openings with brown shutters, glazed casements with hoods, French shutters behind railings) | inferred, deterministic from `hash3(building id, edge, lot)` |
| Shopfront (roller shutter 55 %, timber folding doors 25 %, open shop 20 %) and its paint, floor tile colour, roll-down blinds, air-conditioner units, parapet step | inferred, deterministic |
| Sign text | **data only** (see `SHOP_IDENTITY.md`); lots without a known business keep a blank fascia |
| Roof: clay-tile pitch with the ridge parallel to each frontage, party walls rising through it at every lot boundary, flat roofing over the rear of the block | inferred form |

The same building always gets the same details: every choice is a pure function of the OSM
building id, the wall edge index and the lot index (`unitStyle`), covered by a unit test.

Distant rows (low-detail chunks) keep the lot colours and a dark arcade band but no relief.

## Materials and light

All surface detail is procedural, in world space, added to the existing Lambert materials with
`onBeforeCompile` (`src/world/Materials.ts`): asphalt grain and patching, paving joints, plaster
grime, clay-tile courses on pitched roofs, turf / paving on terrain, concrete. One 2048 px facade
atlas (1024 px on Low) is painted on a canvas at start-up; nothing is downloaded.

Lighting: one shadow-casting sun plus hemisphere light, Khronos Neutral tone mapping (ACES visibly
greyed the pastel fronts), exponential-squared haze matched to the sky horizon, analytic sky with a
drifting procedural cloud layer, texel-snapped shadow frustum, darker wall feet as a cheap
ambient-occlusion cue. Two presets: Day (mid-morning sun from the north-east, which lights the
river-facing Main Bazaar fronts) and Evening.

## Street furniture

| Item | Count | Basis |
|---|---|---|
| Traffic signals | 109 | mapped OSM nodes; pole moved to the kerb of the nearest street |
| Street-name plates | 1,600 | mapped names at mapped junction nodes; post position beside the road inferred; plate styling inferred |
| Benches, bollards | 5, 3 | mapped OSM nodes |
| Lamp posts (6.2 m) | 7,970 | **inferred**: every 32 m on alternating sides of named streets, never in buildings, water or junction areas (OSM has one mapped street lamp) |
| River-bank railing | 5.0 km | inferred where a mapped promenade / footway runs within 14 m of the mapped bank |
| Kerbs and roadside drains | along major carriageways | inferred from the carriageway edge |
| Trees | 19 mapped, rest in mapped parks / woods | positions as before; species not mapped, a 24 % palm mix is inferred |

Not placed because there is no data to place them correctly: zebra crossings (21 mapped nodes, not
yet drawn), bus shelters, street vendors, parked vehicles, overhead cables, awnings on specific shops.

## Accuracy limits

- A row is one colour-varied facade per estimated lot; real lots differ in width and many real
  fronts have been rebuilt. Individual buildings will not match photographs.
- Three- and four-storey shophouses exist in these streets; without `building:levels` they are
  drawn as two storeys.
- The five-foot way is drawn on every frontage, including the few real buildings that have none.
- Blocks mapped as one outline get one roof form; internal air wells and rear lanes are not mapped.
- Buildings outside the listed streets keep the V1 generic style (with the new materials and light).
