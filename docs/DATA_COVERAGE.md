# Geographic data coverage report

Prepared area: **1.535-1.580 N, 110.315-110.380 E**, cut to whole 256 m chunks:
6.912 km (east-west) x 4.864 km (north-south) = **33.6 km2**, 513 chunks
(chunk indices x -12..14, z -9..9 around the origin 1.5585 N, 110.3445 E).

It contains the Kuching Waterfront, Main Bazaar, Carpenter Street, India Street, Jalan Gambier,
Jalan Padungan, the Darul Hana Bridge, the Sarawak River reach through the city, Fort Margherita,
the Astana, the State Legislative Assembly (DUN), Tua Pek Kong Temple, the museum district
(Borneo Cultures Museum, Sarawak Museum), plus Satok, Padungan and the southern edge of Petra
Jaya. The whole area is one continuous walkable world; there is no teleporting between streets.

Numbers below come from `public/data/kuching/build-report.json` (OSM base timestamp
2026-11-14T16:38:21Z).

## Roads and paths (OpenStreetMap)

| Item | Value | Status |
|---|---|---|
| Highway ways used | 7,310 | mapped |
| Total length | 723 km (all classes, both carriageways counted separately) | mapped |
| Classes present | trunk, primary, secondary, tertiary, residential/unclassified, service, pedestrian, footway, path, steps, cycleway, track | mapped |
| Ways with an explicit `width` | 6 | mapped; all others inferred from `lanes` or class defaults |
| Pedestrian network (footway, pedestrian, path, steps) | 25.1 km | mapped, sparse outside the centre |
| Ways tagged `footway=sidewalk` | 0 | **gap**: sidewalks are not mapped separately here |
| Pedestrian crossings (`highway=crossing` nodes) | 21 | mapped, not yet rendered |
| Bridge groups (connected `bridge=*` ways) | 57 | positions mapped; deck heights inferred |
| Paths over water without a bridge tag (jetties) | 12 | treated as low decks so they stay walkable |
| Passages through buildings (`tunnel=building_passage`, `covered=yes`) | 32 | mapped; walkable |
| Road vertex error after generation | max 7.0 mm, RMS 4.1 mm over 39,319 source vertices | verified (`npm run data:validate`) |

Lane counts, turn lanes, kerbs, medians, surface types and markings are essentially unmapped.

## Buildings

| Source | Footprints in the area | Height information |
|---|---|---|
| OpenStreetMap (used) | 3,667 mapped, 3,602 emitted (the rest straddle the area edge) | `height` on 3, `building:levels` on 51 |
| Overture Maps 2026-10-21.0, buildings theme (measured, not used) | 32,733 total: 3,654 from OSM, 19,291 Microsoft ML Buildings, 9,788 Google Open Buildings | `height` on 3, `num_floors` on 56 (no more than OSM) |

Findings:

- OSM building coverage is good in the historic centre and commercial core and thin in
  residential districts. Overture lists about **nine times** as many footprints because it adds
  machine-learned outlines derived from aerial/satellite imagery. Those are real detected
  buildings but with lower geometric quality (rounded or merged outlines, occasional false
  positives) and no attributes.
- Neither source has meaningful height data for Kuching. Heights in the app are therefore:
  3 from `height`, 51 from `building:levels` (levels x 3.3 m + 1.0 m), 3,548 **estimated**.
- OSM building types present: `yes` 2,265, `house` 837, `retail` 207, `school` 123, `detached` 50,
  `semidetached_house` 48, `commercial` 45, `apartments` 22, `roof` 16, `office` 11, `hotel` 8, others.

Estimated-height defaults (used only when neither `height` nor `building:levels` exists):

| Kind | Height | | Kind | Height |
|---|---|---|---|---|
| house, detached, terrace | 6.5 m | | civic, school, museum | 9 m |
| apartments | 15 m | | religious | 10 m |
| commercial, retail | 9 m | | industrial, warehouse | 8 m |
| hotel, office | 20 m | | hut, shed, garage, kiosk | 3 m |
| open roof / shelter | 4.5 m | | untyped (`building=yes`) | 3.5 / 6.5 / 8 / 10 / 12 m for footprints under 40 / 150 / 600 / 2,500 / over 2,500 m2 |

Each building in the chunk files carries its height provenance (`hs`: 0 tagged, 1 from levels,
2 estimated).

Footprint vertex error after generation: max 7.0 mm, RMS 4.1 mm over 19,763 vertices (verified).

## River and water

| Item | Value |
|---|---|
| Source water polygons (`natural=water`, river banks, basins) | 19, merged into 14 |
| Sarawak River | Mapped as area polygons through the whole prepared area; the land/water edge in the 3D terrain is cut exactly along the mapped bank |
| Minor waterways (`stream`, `drain`) | 5 lines, drawn as narrow ribbons with class-default widths |
| Piers / jetties (`man_made=pier`) | 56 (42 as areas, the rest as lines) |
| Water outline error after generation | max 6.5 mm over 1,903 source vertices (verified) |
| Not mapped | depth, tidal range, bank type, quay walls (a uniform quay is assumed) |

## Parks, vegetation, land use

| Item | Count | Note |
|---|---|---|
| `landuse=grass` | 54 | |
| `leisure=pitch` | 54 | |
| `landuse=residential` | 20 | coarse zones |
| `natural=wood` / `landuse=forest` | 20 | |
| `leisure=park` / `garden` | 17 | |
| `landuse=retail` / `commercial` | 14 | |
| `landuse=cemetery` | 8 | |
| Individually mapped trees (`natural=tree`) | 19 | mapped positions |
| Procedural trees | 13,015 | **inferred**: deterministic positions inside mapped wood (9 m grid) and park (17 m grid) polygons, excluded from roads, buildings and water |

Land-use mapping is sparse; unmapped ground is drawn in a neutral colour rather than guessed.

## Terrain

| Item | Value |
|---|---|
| Source | Copernicus DEM GLO-30, tile N01 E110, 30 m surface model |
| Grid in the app | 433 x 305 nodes at 16 m, Int16 centimetres (264 KB) |
| Elevation range after processing | 1.8 m (river bank) to 39.4 m |
| Status | Estimated ground (filtered DSM); see `GEOGRAPHIC_SOURCES.md` |

## Landmarks

29 of 30 curated landmarks were matched to a mapped OSM feature by name and take their position
from it (`public/data/kuching/landmarks.json` records the OSM reference for each). Not found in the
extract: **Satok Bridge** (no feature with that name inside the area).

| Landmark | OSM feature |
|---|---|
| Kuching Waterfront | way 233688501 |
| Darul Hana Bridge | ways 568501299, 634697570, 779037132, 779315127, 779315128 |
| State Legislative Assembly (DUN) | way 1357531465 ("Sarawak State Assembly", 9 levels) |
| Fort Margherita | relation 12489078 |
| The Astana | way 353344429 |
| Tua Pek Kong Temple | way 269781302 |
| Borneo Cultures Museum | way 835977956 |
| Main Bazaar / Carpenter Street / India Street / Jalan Gambier / Jalan Padungan | named highway ways |
| Sarawak Museum, Square Tower, Old Courthouse, mosques, cathedrals, Plaza Merdeka, Padang Merdeka, museums, parks | see `landmarks.json` |

## Coordinate conversion

| Check | Result |
|---|---|
| Round trip geo -> local -> geo over the area | max 3.8e-3 mm |
| Local distances vs WGS84 geodesic (Vincenty) | worst relative error 1.9e-7 (0.2 mm per km) |
| Quantisation in chunk files | 1 cm grid, so up to 7.1 mm planar error |

These are errors of this project's transformation and generation only. They say nothing about
how accurately OpenStreetMap contributors placed the features, which is typically a few metres.
