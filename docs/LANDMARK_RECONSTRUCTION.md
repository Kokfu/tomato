# Landmark accuracy and architectural reconstruction (V4)

Date: 2026-11-15. Scope of this milestone: Hiang Thian Siang Ti Temple, Lau Ya Keng Food Court and
the Yang Choon Tai opera stage on Carpenter Street, plus the systems needed to rebuild further
landmarks. The audit of the other landmarks is in [LANDMARK_AUDIT.md](LANDMARK_AUDIT.md).

Nothing here was committed or deployed.

## 1. Root-cause investigation

Traced from the cached extracts (`data-src/`) through `tools/generate-world/*` to the runtime builders.

| Question | Finding |
| --- | --- |
| Why was the temple drawn as a shophouse? | OSM maps the temple only as a plot (`way/1388134054`, `amenity=place_of_worship`, no `building` tag) lying inside the block outline `way/236495089` (`building=yes`). `build.ts` turned such plots into buildings only when no building contained them, so the plot was dropped without a message. The block then went through the streetscape pass, which marks every `generic` outline fronting a listed heritage street as a shophouse row. |
| How are footprints turned into 3D? | One outline = one extrusion. `BuildingBuilder.addBuilding` extrudes the ring; outlines carrying a streetscape annotation (`a.f`) go to `addShophouseRow` / `addHeritageRow`, which subdivide the street edges into lots with five-foot ways and facades. |
| Are building functions inferred from business points? | Not the building *kind*: POIs never changed `k`. But `buildingKind()` did read `shop=*` on the outline itself, and the places pass hung POI signs on whatever wall was nearest, so the temple frontage carried shop signs. Lau Ya Keng exists in OSM only as POI nodes (restaurant, three stalls, and `node/12779002958` `amenity=theatre` "Wayang stage") inside block `way/233690735`; nothing gave it a structure of its own. |
| Is landmark identity preserved? | No. `landmarks.json` kept a name and a point; the chunk data had no link between a building record and a landmark, and no architectural class at all. |
| Do all buildings go through the same facade generator? | Yes, except nine landmarks hard-wired by OSM id in `src/world/landmarks/index.ts`. |
| Do footprint limits produce wrong shapes? | Yes, for both sites: the mapped blocks are whole street blocks, so neither the temple nor the food court had an outline to give a different form to. |
| Could custom models already replace procedural buildings? | Only whole OSM buildings, by id, with code-generated geometry built per chunk. No glTF, no LOD, no partial footprint, no collision of its own. |

Also found: the Carpenter Street Harmony Arch (`way/1388134059`, `man_made=ceremonial_gate`,
`building=yes`) is extruded as a solid 6.5 m box across the street. It is now classified `monument`
but **not yet rebuilt** (backlog item 1).

## 2. Architectural classification

`src/world/arch/classify.ts` (pure, shared by pipeline, tests and runtime). Four concepts are separate:

- **form**: `BuildingData.ac` (index into `ARCH_CLASSES`) with its basis `ab` (`default` < `inferred` < `tag` < `registry`)
- **current use** and **tenancy**: the places pipeline only
- **landmark identity**: `BuildingData.lm` (registry id)

Classes: unknown, shophouse, heritage_shophouse, chinese_temple, mosque, church, other_worship,
food_court, opera_stage, market, government, museum, fort, palace, bridge, monument, commercial,
residential, industrial, civic, open_roof, utility.

Rules, in order: registry entry; machine-detected footprint gives `unknown`; bridge; ceremonial
gate / monument; place of worship by `building` and `religion` (Buddhist is `chinese_temple` only
with a Chinese temple name, and then marked `inferred`; otherwise `other_worship`); fort, palace,
museum, market, food court, government, civic, roof, residential, industrial, utility, shophouse,
commercial. `shop=*` and `amenity=restaurant|cafe|...` on an outline are ignored. Anything else is
`unknown`. The streetscape pass may promote only `unknown` / `commercial` outlines to
`heritage_shophouse` (`inferred`), and skips every protected site and non-shop class.

Result for the current extract (29,598 buildings): 28,210 unknown, 961 residential, 290 commercial,
129 civic, 123 heritage shophouse rows, 14 mosques, 10 government, 7 museum, 4 Chinese temples
(3 inferred, 1 registry), and the rest in single figures. 1,153 buildings are now barred from
shopfront geometry by class.

Not changed: the legacy render palette `k`, including its use of `shop=*` on an outline. That only
selects wall colours; changing it would alter unrelated buildings.

## 3. Landmark model registry

`src/world/landmarks/registry.ts`. Each entry: stable id, version, name, real-world location (text),
category, source refs (identity, footprints, places), a **site rule**, model directory with LODs,
orientation offset and scale, dimensions with their basis, references, verification status with
lists of what matches and what is approximated.

A definition holds no coordinates (a unit test enforces it). `tools/generate-world/landmark-sites.ts`
derives each site at build time:

- `plot`: front = the plot edge nearest the named street; origin = its midpoint; optional measured width.
- `opposite`: the other landmark's axis is followed until it meets the host footprint; that wall is the front.

The build then cuts the site out of the host footprint (remaining pieces stay ordinary buildings),
adds one protected record (`lm`), cross-checks the site against independent mapped points and fails
if they disagree, and writes `public/data/kuching/landmark-sites.json` (anchor, yaw, outline,
world-space collision, LOD list, plaque texts).

Derived sites:

| Site | Rule | Result | Cross-check |
| --- | --- | --- | --- |
| Temple | plot `way/1388134054`, front on Jalan Carpenter, width overridden to 10.4 m | 10.4 x 29.7 m | centre inside the mapped plot |
| Food court | opposite the temple, host `way/233690735`, 9.6 m wide, 0 to 14 m deep | 9.6 x 14.0 m, 8.1 m from the temple front | OSM node "Lau Ya Keng Foodcourt" inside |
| Opera stage | same axis, 14 m to the back of the host | 9.6 x 14.9 m | OSM "Wayang stage" node inside |

Local overrides (explicit, with evidence in the registry): the three widths and the 14 m hall
depth, all measured on aerial imagery at about 0.3 m per pixel, uncertainty about 1 m.

Runtime (`src/world/landmarks/LandmarkModels.ts`): only the 3 KB site list loads at start-up. A
model is fetched when the player is within its LOD range; the new LOD replaces the old one only
after it has loaded; geometry and plaque textures are disposed on unload. Collision is registered
with the chunk from the site list, so it does not depend on the model having loaded, and the site's
building record is skipped by the footprint collision (never both).

Guard (`src/world/landmarks/protect.ts`): `assertGeneric()` is the first statement of the three
generic generators and throws if a record with `lm` reaches them.

## 4. Models

Authored as scripts in `tools/landmarks/models/` with the kit in `tools/landmarks/kit/` (Blender is
not installed on this machine). Roofs are real curved surfaces with tile ribs, ridges and
swallow-tail ends, not textured boxes. No photographs or third-party assets are used; text on
signboards is drawn at run time with the browser's fonts.

| Model | LOD0 | LOD1 |
| --- | --- | --- |
| Temple | 14,789 triangles, 348 KB (119 KB gzip) | 1,726 triangles, 50 KB (18 KB gzip) |
| Food court | 6,801 triangles, 199 KB (56 KB gzip) | 437 triangles, 16 KB (4 KB gzip) |
| Opera stage | 3,921 triangles, 106 KB (37 KB gzip) | 142 triangles, 6 KB (2 KB gzip) |

Vertex data is quantised (`KHR_mesh_quantization`, 16 bytes per vertex), no textures, three shared
materials. LOD0 within 130 to 150 m, LOD1 to 900 m or the preset's view distance.

## 5. Reference comparison

In-game screenshots: `docs/screenshots/landmarks-v4/before/` and `.../after/`, same camera for both.
References are linked, not copied.

| View | Before / after | Reference |
| --- | --- | --- |
| Temple from Carpenter Street | `01-temple-from-carpenter-street.png` | [Commons photo, CC BY-SA 4.0](https://commons.wikimedia.org/wiki/File:%E5%8F%A4%E6%99%8B%E4%BA%9A%E8%BE%BE%E8%A1%97%E7%8E%84%E5%A4%A9%E4%B8%8A%E5%B8%9D%E5%BA%99.jpg), [iPackTravel collage](https://www.ipacktravel.com/post/kuching-eats-lau-ya-keng-foodcourt-%E9%98%B3%E6%98%A5%E5%8F%B0%E8%8C%B6%E5%AE%A4-kuching-old-street) |
| Temple roof, elevated | `02-temple-roof-elevated.png` | Esri World Imagery at 1.55832 N, 110.34556 E (`tools/landmarks/survey.html`) |
| Food court exterior | `03-lau-ya-keng-exterior.png` | iPackTravel, first photograph |
| Dining area | `04-lau-ya-keng-dining-area.png` | iPackTravel collage, top right and bottom |
| Opera stage | `05-opera-stage.png` | iPackTravel collage, top right |
| Temple and food court together | `06-...relationship.png`, `07-relationship-street-level.png` | Esri World Imagery; iPackTravel bottom-left photo (temple seen from inside the hall) |

| Aspect | Temple | Food court | Opera stage |
| --- | --- | --- | --- |
| Silhouette | Matches: low front hall, raised centre roof, upswept ridge ends | Matches: wide open bay under a flat front roof with an arched roof behind | Matches in kind: raised stage under two tiled roof tiers |
| Roof shape | Three green tiled sections; pavilion and rear hall as in the aerial view | Flat bay then arched roof on ribs | Apron roof plus hip roof with upturned corners; enclosing roof inferred |
| Facade proportions | Three doors, panels between, pillars; bay widths estimated | Sign beam, four blinds, red posts as photographed | Three bays with lattice; widths estimated |
| Height | Estimated (eave 3.5 m, rear ridge 7.5 m), about 0.7 m uncertain | Estimated (6 m, crown 8.4 m), about 1 m uncertain | Estimated, about 1.5 m uncertain |
| Materials and colours | Green tiles, pink walls, red timber, gold: as photographed | Red steel, cream and yellow walls, cream floor tiles: as photographed | Dark timber, grey-green tiles: one photograph only |
| Entrance | Centre and two side doors | Whole front open | Not enterable |
| Neighbours | Set back behind its forecourt between taller rows: matches | Fills one bay between rows: matches. East strip of the block is still generic | Behind the hall, faces the temple: matches |
| Relation to street | Front on the mapped plot edge | On the temple's axis across the street (aerial: 0.5 m agreement) | 14 m behind the street wall |

Known deviations: the neighbouring walls beside the forecourt are grey, in reality pink; the wall
panels are flat colour compositions and the tiger is crude; the temple plaque wording is a guess;
ridge figures, lions and censer are simplified; the stage interior is dim; stall and table layout
is representative. Status in the registry: temple and food court `reference-matched`, opera stage
`approximation`.

## 6. Reconstruction workflow

1. References: licensed or linked photographs, recorded in the registry entry.
2. `node tools/landmarks/survey.ts <lat> <lon> [radius]` then open `/tools/landmarks/survey.html` on the dev server: mapped outlines and POIs over aerial imagery with a scale bar. Used for viewing and measuring only.
3. Write the registry entry: sources, site rule, measured overrides with their basis.
4. Write `tools/landmarks/models/<id>.ts` (geometry, collision, plaques); `npm run models:build`.
5. Check in `/tools/landmarks/preview.html?m=<id>` (same materials as the game, 1.7 m figure for scale).
6. `npm run data:build` places it; `npm test`, `npm run data:validate`.
7. Add views to `tools/dev/landmark-views.json`, capture with `tools/dev/shots.ts`, compare with the references, correct, record what still deviates.

## 7. Performance

Measured on this machine, 1280 x 720, quality high, at the seven views (before to after):

| | Before | After |
| --- | --- | --- |
| Frame rate | 60 | 60 |
| Draw calls | 218 to 301 | 226 to 306 |
| Triangles in view | 244k to 347k | 272k to 372k |
| Start-up download added | - | 3.2 KB gzip (site list) |
| Downloaded on approach | - | 212 KB gzip for all three LOD0 models; 24 KB gzip for the LOD1 set |
| Chunk data | 5.62 MB | 5.64 MB |

Mobile profile (390 x 844, low preset): 48 to 60 fps at the two sites, 86 draw calls. Models are
released when the player leaves (checked by the browser test).

## 8. Tests

- `tests/unit/landmarks.test.ts` (13 tests): classification rules, registry integrity and budgets, one protected record per landmark, no generic footprint under a site, position / orientation / scale against OSM, collision layout, the guard, neighbours keep their rows and signs.
- `tests/e2e/landmarks.spec.ts` (4 tests): lazy loading and release, LOD by distance, walking into the forecourt and food court, solid halls / stalls / stage, street stays walkable, all three presets keep the full models.
- `npm test`: 44 of 44 pass. `npm run data:validate`: 11 of 11 pass. `tsc --noEmit` clean. Production build succeeds.
- The browser tests need `PUBLIC_PORT=5174` in the environment on this machine, because another server holds port 3000 and the HMR socket otherwise reports a console error.

## 9. Backlog

See [LANDMARK_AUDIT.md](LANDMARK_AUDIT.md) for the full audit. Proposed order: Harmony Arch (blocks
Carpenter Street today), DUN, neighbour-block and white-wall fixes, waterfront structures and Square
Tower, Darul Hana Bridge, Old Courthouse, Fort Margherita, Astana, Tua Pek Kong, Borneo Cultures
Museum. The audit could not view reference photographs (text-only tools), so every one of those
sites stays "not reference-matched" until someone compares them with photos.

Open items on this milestone: pink neighbour walls beside the temple forecourt, the east strip of
the food court block, better wall-panel artwork, a second reference for the opera stage.

## 10. Addendum: Carpenter Street Harmony Arch (same day)

Rebuilt as the fourth registry landmark (`carpenter-street-harmony-arch`).

- **Before:** `way/1388134059` (`man_made=ceremonial_gate`, `building=yes`) was extruded as a closed 6.5 m box across the west end of Carpenter Street, and the route graph dropped the street segment under it. Before screenshots: `screenshots/landmarks-v4/audit/harmony-arch-*.png`.
- **Site rule:** new `footprint` type. The mapped footprint is used as is (11.2 x 4.9 m); the front is its long side nearest Jalan Tun Abang Haji Openg. Marked `open`, so the record behaves like an open-sided roof: roads and paths pass through, and only the four columns collide.
- **Model:** 5,656 triangles, 152 KB (52 KB gzip); distant model 1,172 triangles, 37 KB (12 KB gzip).
- **Reference:** [Commons, Chinese-style Gate.jpg, CC BY 2.0](https://commons.wikimedia.org/wiki/File:Chinese-style_Gate.jpg) (east face). After screenshots: `after/08-harmony-arch-from-west.png`, `09-harmony-arch-from-carpenter-street.png`, `10-harmony-arch-elevated.png`.
- **Matches:** open gateway, red granite columns on plinths, painted beams with a stone tablet, red name board 亞答街, orange tiled centre roof with upturned corners, lower side roofs on grey outer columns.
- **Approximations:** heights and column spacing estimated from one photograph; the west face was not seen and is a mirror, with the board wording 親善門 taken from the OSM official name.
- **Road offset:** found here, fixed in section 11.
- **Tests:** the unit tests cover the arch generically; a fifth browser test walks through the centre span and checks that a column blocks. 44 of 44 unit tests, 5 of 5 landmark browser tests and 11 of 11 validation checks pass. The route graph gained the segment under the arch.

## 11. Addendum: Jalan Carpenter alignment

- **Problem:** OSM draws Carpenter Street between Jalan Tun Abang Haji Openg and Jalan China as one 108 m straight segment. It ran 1.5 to 2 m from the north block, 6.6 m from the south block, and 4 m north of the centre of the mapped arch, so the carriageway passed under the arch's north side bay.
- **Fix:** `tools/generate-world/road-alignments.ts`, applied inside `loadOsm()` so the world build, route graph and validation share it. An alignment holds no coordinates. The new centre line is derived: through the centroid of the mapped gate (`way/1388134059`), then midway between the facing walls of the two blocks (`way/233690735`, `way/236495089`). Three derived vertices were inserted; the centre line moved by up to 4.3 m. The junction nodes at both ends are untouched, so connectivity is unchanged (same node and edge counts in the route graph). The cached extract in `data-src/` is not modified.
- **Result:** the street passes through the centre span of the arch and is equidistant (about 4.1 m) from the temple and food court fronts, leaving a footway each side. Screenshots `after/07`, `08`, `09`.
- **Limits:** only this one segment was re-aligned; the rest of Carpenter Street east of Jalan China was not examined. The 6 m carriageway is slightly wider than the clear span between the arch's plinths (about 5.2 m), so the road edge runs under the plinths by about 0.4 m each side. Street-name sign posts are still placed from the unmodified line. The geography validation compares against the aligned geometry, so it no longer flags this segment as differing from OSM.
- **Tests:** a unit test checks that every original node is unchanged, that the street passes within 0.3 m of the arch centre and is midway between the two landmark fronts. Totals now: 45 of 45 unit tests, 11 of 11 validation checks, 5 landmark and 4 district browser tests pass.
