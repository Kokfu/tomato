# Geographic sources

All source coordinates are WGS84 (EPSG:4326). Nothing in the world is positioned by hand.

## 1. OpenStreetMap (primary source for everything horizontal; the only source for roads, water and land use)

| | |
|---|---|
| Used for | Roads, paths, bridges, building footprints, river and water bodies, land use, parks, trees, piers, landmark positions and names |
| Official URL | https://www.openstreetmap.org |
| Access method | Overpass API (https://overpass-api.de), one-time tiled extract cached locally; the browser never contacts it |
| Dataset version | OSM base timestamp `2026-11-14T16:38:21Z` (recorded in `manifest.json` and `data-src/osm/kuching.meta.json`) |
| Coverage used | 1.535-1.580 N, 110.315-110.380 E (about 6.9 x 4.9 km of central Kuching) |
| CRS | EPSG:4326 |
| Attributes available | highway class, name, oneway, bridge, layer, tunnel/covered, lanes and width (rare), building type, building:levels and height (rare), natural/landuse/leisure classes |
| Nature of the data | Volunteer-mapped, largely traced from aerial imagery. Positions are mapped, not surveyed; typical positional accuracy of imagery-traced features is a few metres |
| Licence | Open Database License (ODbL) 1.0 |
| Attribution | "(c) OpenStreetMap contributors" shown permanently in the HUD, on the start screen and in the pause menu, linking to https://www.openstreetmap.org/copyright |

The generated chunk files are a "produced work / derivative database" of OSM data. If you
redistribute them, keep the attribution and the ODbL notice.

An alternative import path via a Geofabrik extract (https://download.geofabrik.de/asia/malaysia-singapore-brunei.html)
is described in `DEVELOPMENT_ROADMAP.md`; it yields the same OSM data in `.osm.pbf` form.

## 2. Copernicus DEM GLO-30 (elevation)

| | |
|---|---|
| Used for | Terrain height grid |
| Official URL | https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM (public mirror: https://registry.opendata.aws/copernicus-dem/) |
| Tile | `Copernicus_DSM_COG_10_N01_00_E110_00_DEM` |
| Version | GLO-30 public release (TanDEM-X acquisitions 2010-2015) |
| Resolution | 1 arc-second, about 30 m |
| CRS | EPSG:4326 horizontal, EGM2008 geoid heights |
| Nature of the data | Measured radar surface model (DSM): includes roofs and tree canopy. Stated absolute vertical accuracy < 4 m (90 % linear error) |
| Processing here | Resampled to a 16 m grid, minimum-filtered and blurred to approximate bare ground, shifted so the river surface is 0 m, blended to a constant 1.8 m bank level within about 150 m of water. The result is an **estimate** of the ground, not a survey |
| Licence | Free of charge for any use under the Copernicus DEM licence; attribution required |
| Attribution | "(c) DLR e.V. 2010-2014 and (c) Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved" (in `manifest.json`; short form in the HUD) |

## 3. Overture Maps buildings theme (machine-detected footprints where OSM has no building)

| | |
|---|---|
| Used for | Building footprints **only where OpenStreetMap has no building**: 25,990 of the 29,593 footprints in the world (17,657 Microsoft ML Buildings, 8,333 Google Open Buildings). Overture features whose source is OpenStreetMap are not used; OSM buildings come from the OSM extract directly |
| Official URL | https://docs.overturemaps.org (schema and attribution: https://docs.overturemaps.org/attribution/) |
| Access method | `overturemaps` Python CLI, one-time bbox download cached in `data-src/overture/buildings.geojsonl` (`tools/extract-map-data/fetch-overture.ts`); the browser never contacts Overture |
| Dataset version | Release `2026-10-21.0` (recorded in `manifest.json` as `overtureRelease` and in `data-src/overture/buildings.meta.json`) |
| Coverage used | Same bbox as OSM |
| CRS | EPSG:4326 |
| Attributes available | Source dataset per feature; `height` on 3 and `num_floors` on 56 features, all of them OSM-sourced, so **no machine-detected footprint has any height information**; no building type |
| Nature of the data | **Machine-detected** outlines derived from aerial / satellite imagery by Microsoft (Global ML Building Footprints) and Google (Open Buildings, confidence 0.65-0.90 in this extract). They are real detections, not surveyed or human-mapped: outlines are regularised or rounded, neighbouring buildings can be merged into one outline, positions can be offset by a few metres, and false positives or demolished buildings can occur |
| Processing here | Conflated with OSM in `tools/generate-world/overture.ts` (rules in `DATA_COVERAGE.md`); outlines simplified with a 0.3 m tolerance; every such building is labelled in the chunk data (`s`: 1 Microsoft, 2 Google) and drawn in a plain grey style |
| Licence | Buildings theme: ODbL 1.0. Per source, as stated by Overture: OpenStreetMap, ODbL; Microsoft Global ML Building Footprints, ODbL; Google Open Buildings, CC BY 4.0 |
| Attribution | "(c) OpenStreetMap contributors, Overture Maps Foundation" in the HUD and on the full map; Microsoft and Google are credited on the start screen, in the settings panel, in `manifest.json` and in `README.md` |

What the attribution documentation says (https://docs.overturemaps.org/attribution/, read on
2026-11-15):

- Buildings: "License for theme: ODbL".
- Sources listed for the theme include "(c) OpenStreetMap contributors. Available under the Open
  Database License", "Global ML Building Footprints. Licensed by Microsoft under the Open Database
  License" and "Google Open Buildings. Available under CC BY 4.0" (plus Esri Community Maps, USGS
  and others that do not occur in this extract).
- The only attribution string on the page is the one Overture uses in its own Explore tool for
  ODbL data: "(c) OpenStreetMap contributors, Overture Maps Foundation". The page gives no
  buildings-specific string and does not say where attribution must be shown.
- Crediting Overture itself is optional: for publications "you may choose to add the following
  citation ...: Overture Maps Foundation, overturemaps.org".

Two differences between Overture's page and the upstream publishers were found and are recorded
here rather than resolved: Microsoft's own repository
(https://github.com/microsoft/GlobalMLBuildingFootprints) says "This data is licensed by Microsoft
under the CDLA Permissive 2.0", while Overture lists it under ODbL; and Google's page
(https://sites.research.google/gr/open-buildings/) offers the data under CC BY-4.0 or ODbL v1.0
at the user's choice, while Overture lists CC BY 4.0 only. Neither upstream page gives a required
attribution wording. This project follows the terms as distributed by Overture (ODbL for the
theme) and credits all three parties; both readings permit this use with attribution. This is a
description of what the pages say, not legal advice.

The generated chunk files therefore contain data derived from two ODbL databases (OSM and the
Overture buildings theme). If you redistribute them, keep the attribution lines from
`manifest.json` and the ODbL notice.

## 4. Reference material for landmark models

Landmark models are original procedural geometry. Their positions and footprints come from OSM;
their appearance is an approximation informed by public descriptions. Sources per landmark are
listed in `LANDMARKS.md`. No Google Maps imagery, Street View textures or third-party 3D models
are used.

## 5. Character model

See `ASSETS.md` for the source, author and licence of the player character.

## What is measured, mapped, inferred or estimated

| Element | Status |
|---|---|
| Road centre lines, junctions, connectivity | Mapped (OSM) |
| Road widths | Mapped for 6 ways with a `width` tag; otherwise **inferred** from lane count or road class |
| Sidewalks | Only mapped footways are drawn; none are invented. OSM has no `footway=sidewalk` ways in this area |
| Lane centre dashes | **Decorative**, not mapped |
| Building footprints | Mapped (OSM) for 3,603 buildings; **machine-detected** (Microsoft / Google via Overture, lower quality, labelled per building) for 25,990 |
| Building heights | Mapped for 3 buildings (`height`), **derived** for 51 (`building:levels` x 3.3 m + 1 m), **estimated** by type and footprint area for the rest, including every machine-detected footprint (footprint area only) |
| Roof shapes, facades, colours | **Procedural**, not mapped |
| River and water outlines | Mapped (OSM) |
| Bridge positions and alignment | Mapped (OSM) |
| Bridge deck heights and ramps | **Inferred** (OSM has no deck elevations) |
| Terrain | **Estimated** from a measured 30 m surface model |
| River bank height (1.8 m), quay walls | **Assumed** constant |
| Individually mapped trees | Mapped (19 trees) |
| Other trees | **Procedural** positions inside mapped wood/park polygons |
| Landmark positions | Mapped (centre of the matching OSM feature) |
| Landmark architecture | **Approximate** original models |
