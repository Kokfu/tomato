# Known limitations

This list is deliberately explicit. Nothing here is hidden by decoration in the app.

## Geography and data

- **Most buildings are machine-detected, not mapped.** OSM maps about 3,600 buildings in the
  prepared 33.6 km2, mainly in the city centre. The other 25,990 footprints (88 %) come from
  Overture Maps (Microsoft ML Buildings, Google Open Buildings): outlines detected automatically
  in aerial / satellite imagery. Expect regularised or rounded outlines, merged neighbours, offsets
  of a few metres, occasional false positives (canopies, containers, bright ground), buildings that
  no longer exist and missing new ones. They have no type, name or height. See `DATA_COVERAGE.md`.
  The map (M, and OP mode) still draws them in their own lighter tone so they can be told apart.
- **The type of almost every building is a guess (N1-M3).** Each footprint is drawn as one of
  eleven generic Kuching building types (kampung stilt house, house, terrace, concrete shophouse
  block, colonial civic, mid-rise, mall, warehouse, school, place of worship, shed). For the 88 %
  without tags, and for OSM `building=yes`, the type comes only from the footprint's size and
  shape, mapped land use, the distance to main roads and the river bank, and "Kampung" street
  names (`src/world/arch/buildingType.ts`). A detected house may be drawn as a shop block, a hall
  as a warehouse, a riverside house as a stilt house. Evidence is read per map chunk, so a
  building just across a chunk border from a main road can get a different type from its
  neighbour. Stilts, roof tanks, canopies, sign boards (no words) and air-conditioners are generic
  dressing, not observed. Registered landmarks are never typed this way.
- **Machine-detected buildings can touch roads and each other.** A footprint is removed only when
  a mapped way's centre line runs through it, when more than half of it lies on a carriageway or
  in water, or when it duplicates an OSM building or another detection. Smaller overlaps (a corner
  on a road edge whose width is itself inferred, up to 10 % of area shared with a neighbour)
  remain, and such a building also blocks movement there. Detections on mapped car parks, pitches
  or other open land use are not filtered.
- **Building coverage is still incomplete** where neither OSM nor the detection models have a
  footprint (for example under tree cover). Nothing is invented to fill such gaps.
- **Many shophouse rows are mapped as one large footprint** in OSM rather than individual lots, so
  a whole block is extruded as a single building.
- **Building heights are almost all estimated** (3 tagged heights, 51 derived from levels,
  the rest invented: a plausible storey count for the guessed type, varied per building, also
  used for collision). Skylines are therefore not accurate.
- **Roof shapes, facades, colours and window patterns are procedural**, not observed.
- **Road widths are inferred** from class or lane count except for 6 tagged ways. Kerbs,
  medians, lane counts and markings are not mapped; the centre dashes are decorative.
- **No sidewalks are mapped as such** in this area, so none are drawn. Pedestrian movement is not
  restricted to paths: the character may walk on any dry ground and on roads.
- **Terrain is an estimate.** It comes from a 30 m radar surface model that includes roofs and
  trees, filtered to approximate bare ground and flattened near the river. Small relief, steps,
  embankments and retaining walls are absent. The river bank is a uniform 1.8 m quay.
- **Bridge deck heights and ramp profiles are inferred**; OSM has no elevations. Spiral ramps,
  stairs and lifts at bridge ends are represented only as far as their centre lines are mapped.
- **Water level is fixed**; the tidal range of the Sarawak River is not modelled.
- **Data edge**: the prepared area ends at 1.535-1.580 N, 110.315-110.380 E. Pending, Tabuan Jaya,
  BDC, Third Mile and most of Petra Jaya are outside it (see the roadmap).
- OSM positional accuracy (typically a few metres for imagery-traced features) is inherited. The
  validation report measures only our own transformation error (max 7 mm; up to 0.3 m for the
  deliberately simplified machine-detected outlines), not the accuracy of OSM or of the detections.

## Streetscape and shop identity (V2)

- Shophouse rows are procedural approximations on real outlines: lot widths, colours, window
  styles, shopfront types, two-storey height and roof form are estimates (`STREETSCAPE.md`).
- Shop signs exist only where open data has a named business that can be tied to a wall; most
  lots are blank. Records can be years old (`SHOP_IDENTITY.md`).
- Lamp posts are procedurally spaced, not mapped. Zebra crossings, bus stops, vendors and parked
  vehicles are not drawn.
- The correction editor stores edits in the browser and exports a file; there is no hosted
  database or login.
- Driving is not implemented (`VEHICLES.md`).

## Ground, trees and atmosphere (N1-M2, all inferred)

- **Ground surfaces are inferred.** Only the mapped land-use polygons are data. The concrete band beside each carriageway, the
  red-earth fringe beside the larger roads, the concrete apron round every building and the rough grass on ground with no mapped
  land use are generic rules (`src/world/TerrainBuilder.ts`), not surveyed surfaces. Worn patches of red earth in grass are noise.
- **Most trees are inferred.** Mapped OSM trees and the trees inside mapped wood and park polygons are as before. Roadside trees
  (rain trees or palms every 24 to 34 m along trunk to residential roads) and the scattered trees on open green ground are
  generated by rule (`src/world/VegetationBuilder.ts`). Species, size and position are plausible, not real; no real avenue was
  checked. These inferred trees have no collision: a player or car passes through their trunks.
- **Distant trees are simplified**: outside the nearest ring of chunks each tree is an eight-triangle crown without a trunk.
- **The river bank band** (paler water and a lapping line 3 m wide along the mapped shoreline) is decorative; the river has no
  tide, current or depth data. Its tea-brown colour follows the style guide, not a measurement.
- **Sun and haze.** The sun stands where it does over Kuching on 15 April at 09:40 solar time (17:15 for the evening preset); the
  date is a choice. The haze has one fixed density and closes completely at the edge of the streamed area, which is nearer
  (about 550 m) on the Low preset than real visibility would be.

## Streets (N1-M4)

- **Kerbs, footpaths, drains and slab covers are inferred** from the road class and width alone: OpenStreetMap maps
  none of them here (`sidewalk` is tagged on one way). Main roads get a kerb, a 1.6 m paved footpath and an open drain
  behind it; residential and old-town streets get the drain at the road edge; service roads a low kerb. Real streets
  differ from block to block. Where a building stands closer than the footpath is wide, the narrow layout is used.
- **They have no collision.** The tallest part is 0.13 m: a walker's feet sink that far into a footpath, and a car
  drives over a kerb without a bump. Nobody can fall into a drain: it is drawn 0.1 m deep, shaded to read deeper.
- **Lane lines, edge lines and stop lines are inferred** (lanes from the width, not from `lanes=*`; the chunk files do
  not carry that tag). A stop line is drawn where a street ends at a junction node inside one chunk; a junction on a
  chunk border gets none. The black-and-white median kerb is drawn where two one-way main roads run side by side.
- **Mapped:** traffic signals (113 nodes, 109 placed), zebra crossings (21 nodes, 17 placed: a node further than 3 m from a street is not moved onto it) and bus stops (36 nodes
  fetched 2026-11-25, 32 placed). The crossing's paint, the bus shelter's form and the yellow box on the junction
  nearest a signal (42) are generic. **No street lamp is mapped** in this area: all 11,616 lamp posts are spaced by rule.
- **Road signs are generic and placed by rule**: a speed limit by road class (not the posted limit), a stop sign where
  a minor street meets a junction, a crossing sign at mapped crossings, "BAS" at bus stops. No sign names a place.
- On the Low preset: no sign plates, no slab joints, no edge lines, no kerbs on service roads.

## Hero places (N1-M5, places 1 and 2)

- **Kuching Waterfront promenade.** Real: the bank line the railing follows and the Square Tower outline. Seen in
  licensed photographs (form only): a paved riverside walk, a dark cast-iron railing whose panels carry rings, lamp posts
  with festoon lights between them, benches, palms and rain trees. **Inferred:** the 9 m width of the paved walk, its
  colours and bay spacing, the ring medallions that stand in for the real swirl mosaics, every railing dimension, and the
  position of every lamp, bench, palm, bin and festoon. The tensile canopies and food kiosks of the real walk are not
  built: small mapped and machine-detected footprints there are still generic kiosks. The Square Tower's paved apron,
  corner lamps and benches are generic; the tower's own form is unchanged (hero place 4).
- **Main Bazaar.** All 71 lots stay Approximate: no licensed photograph shows the frontage lot by lot. The kapcai
  motorbikes in empty kerb bays are typical of the street, not counted or surveyed.
- **Carpenter Street east of Jalan China.** All 41 lots are Approximate (typical Carpenter Street forms). Twelve boards
  carry a shop name from an OpenStreetMap node, placed on the lot the node falls in front of; thirteen carry a trade
  word only ("KEDAI EMAS", "KEDAI KOPI", ...); no name or number is invented. Lot lines are not mapped: each frontage is
  divided evenly. The mapped outlines leave only 5 m between the Jalan China corner block and the block opposite, where
  the real street is about as wide as elsewhere; the corner block's side elevation (doors, a barred window, a tiled pent
  roof) is a typical form, not that building's. Lots step by a few centimetres with the ground, which falls 0.9 m along
  the street and up to 0.7 m across it in the terrain model; the real street is closer to level.
- The mapped centre line of Carpenter Street runs 0.6 m from that corner block's wall, so the wall blocks a walker only
  from 0.3 m behind its face: a walker can press a shoulder into it, and a car on the mapped line is not stopped.

## Gameplay

- Collision uses building footprints as infinitely tall walls up to the roof line; interiors are
  not enterable. Trees, street furniture, fences and walls (`barrier=*`) do not collide.
- Mapped passages through buildings are walkable, but the building is still drawn solid, so the
  character visibly passes through a wall there.
- Roads that pass under bridges or flyovers are walkable underneath; underpass tunnels
  (`tunnel=yes`, 8 trunk segments) are drawn at ground level.
- Motor traffic, pedestrians, boats (tambang), day/night and weather are not simulated.
- Jumping is cosmetic (0.7 m); it cannot be used to climb onto buildings.

## Rendering and performance

- Chunk meshes are generated on the main thread (up to about 20 ms per chunk on the test
  machine), one per frame. A worker-based builder would remove these small hitches.
- Distant chunks omit trees and minor roads, so far silhouettes are simplified.
- Ground textures are low resolution (0.5-1 m per pixel) by design; land-use edges are soft.
- No texture compression is used because the app ships almost no textures (one 128 px facade
  tile plus per-chunk canvas ground textures generated at runtime).

## Testing

- Browser tests ran in Microsoft Edge (Chromium) on Windows with an integrated Intel GPU.
  **Firefox and Safari were not tested.**
- Mobile results come from Chromium device emulation (viewport, device pixel ratio, touch events,
  CPU throttling). **No physical phone was tested**, so real mobile frame rates, thermal behaviour
  and browser-specific touch quirks (iOS Safari in particular) are unverified.
- Pointer-lock mouse look cannot be driven by automation; tests use the drag-look fallback. Pointer
  lock itself was exercised manually only in the desktop app's preview pane.
- Visual resemblance of landmarks to the real buildings is judged by eye from screenshots, not
  measured.
