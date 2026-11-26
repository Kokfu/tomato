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
- **Sun and haze.** The sun stands where it does over Kuching on 15 April (09:40 solar time for the Day setting, 17:36 for
  Evening); the date is a choice. The haze has one fixed density and closes completely at the edge of the streamed area, which is nearer
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

## Hero places (N1-M5, place 3: India Street and Jalan Gambier)
- **India Street's rows are rebuilt at run time from the mapped blocks.** The north block (one mapped outline) is cut
  into seven two-storey pieces, 14 m deep, each at its own floor level, because the street climbs 3 m; the rest of the
  block is drawn two storeys high behind them. Its mapped height (12 m) was a default; two storeys come from the
  photographs. Lot lines, lot widths, paint, shopfronts and five-foot ways are inferred. `?m5=0` shows the mapped data
  unchanged.
- **No lot is verified.** Two photographs show the street's form (canopy, paving, stalls, bright two-storey shops, flags,
  air-conditioners); neither can be tied to a lot.
- **Boards carry mapped business names only** (17). Which lot of its block a business occupies is decided by the nearest
  frontage point: it can be off by a lot or two. No house number is shown.
- **The canopy is a stand-in:** a plain fabric vault on fourteen columns, every dimension estimated. It is unlit cloth
  and throws no shadow (since N1-M6 it darkens with the daylight, like the lane paint it is drawn with). The real canopy's ornament and banners are not built.
- **Stalls, awnings, flags, parked cars, kapcai and the cars in the riverside car park are placed by rule.** Jalan
  Gambier has no licensed photograph at all.
- **Parked cars on Jalan Gambier stand on the outer 1.9 m of the carriageway** (no parking bay is mapped) and block a
  car or a walker; the mapped centre line stays clear by 1.5 m.
- Details and the lot table: `docs/night/m5-india-street-gambier.md`.

## Hero places (N1-M5, place 4: Plaza Merdeka, Old Courthouse, Square Tower)
- **Square Tower:** rebuilt to its photographed form (corner turret, three shuttered bays per face, door). The earlier
  model's central tower was wrong and is drawn only with `?m5=0`. Two of its four faces are in no licensed photograph
  and are built like the photographed side; which mapped face is the front is inferred; every dimension is estimated.
- **Old Courthouse:** the clock tower has its photographed form, but it is not mapped separately: it stands at the
  middle of the longest outer wall. Verandah columns stand against every wall of the outline at a 3.3 m spacing (a
  rule). Roofs are truncated hips with a flat top. Collision is still the mapped outline: the tower's porch is not
  walkable.
- **Plaza Merdeka's entrance is invented in form** (no licensed photograph): a generic portal, canopy and forecourt,
  placed on the face a mapped drop-off lane and footway lead to. The name over the door is the mapped name. The mall
  itself is still a generic block; the hotel tower above it is not built.
- The General Post Office, the Round Tower, The Pavilion and the Brooke Memorial are still generic buildings.
- Details: `docs/night/m5-plaza-merdeka-courthouse.md`.

## Hero places (N1-M5, place 5: Jalan Padungan, the cat statues, the Chinatown gate)
- **Which statue:** the landmark `cat-statue` (OSM node 2404396149, tour view 07) is the Cat Column, not the large
  white cat: the mapped Everrise store beside the node stands behind the column in its photograph. The white Great
  Cat (node 4332185093) stands at the east end with the gate. A third mapped cat statue has no photograph and is not built.
- **Cat Column, Great Cat, gate:** photographed forms, estimated sizes (column 8.2 m, cat 2.5 m, gate 11.9 m). The
  column's four cats all sit alike; the gate's west face is built like its photographed east face; its piers are
  placed from where the mapped carriageways cross the mapped outline. The gate's Chinese inscriptions and the
  column's lettering are not reproduced; "SELAMAT DATANG" is legible in the photograph and is shown.
- **The gate is open now.** Its mapped outline lies across both carriageways and used to be a solid building. Only
  the four piers block.
- **Every lot of the rows is Approximate** (197 lots): paint, fascia board, awning and air-conditioner by rule. The
  data gives every block two storeys; the real street has three-storey blocks too. The 1928 shophouse of the
  photograph is not located.
- No parked cars (the carriageways are mapped 6 m wide), no grass median, no median lamps. Kapcai stand only where
  the mapped frontage is far enough from the mapped carriageway.
- Details: `docs/night/m5-padungan-cat-statue.md`.

## Hero places (N1-M5, place 6: Kuching City Mosque, floating mosque)
- **City Mosque:** photographed forms (pink walls, gold onion domes, round minarets, windows under gold bonnets,
  entrance canopy), but its layout is a guess: where the domes, the four minarets and the turrets stand on the mapped
  outline, that the outline's round projection is the entrance, and every height. The glass annex, the fence and the
  car park are not built. Two machine-detected footprints still stand in front of the entrance as small houses.
- **The graves are placed by rule** (332 of them, in rows across the direction of Mecca): none is a real grave's
  position. They have no collision, and the Low preset draws only their stones.
- **Floating mosque:** its form follows one photograph taken at night, so the colours are a guess (white walls,
  slate domes, nothing gold). The earlier model's gold domes and two minarets were not photographed anywhere and are
  drawn only with `?m5=0`. The place of the minaret and the small dome along the water side is estimated.
- Chunk -2_-1 grew 65 % in triangles (mosque model and graves), far over the per-place guide.
- Details: `docs/night/m5-city-mosque-floating-mosque.md`.

## Gameplay

- Collision uses building footprints as infinitely tall walls up to the roof line; interiors are
  not enterable. Trees, street furniture, fences and walls (`barrier=*`) do not collide.
- Mapped passages through buildings are walkable, but the building is still drawn solid, so the
  character visibly passes through a wall there.
- Roads that pass under bridges or flyovers are walkable underneath; underpass tunnels
  (`tunnel=yes`, 8 trunk segments) are drawn at ground level.
- Boats (tambang) are not simulated. Traffic and pedestrians are ambient only (see "Traffic and walkers" below).
- Jumping is cosmetic (0.7 m); it cannot be used to climb onto buildings.

## Rendering and performance

- Chunk meshes are generated on the main thread (up to about 20 ms per chunk on the test
  machine), one per frame. A worker-based builder would remove these small hitches.
- Distant chunks omit trees and minor roads, so far silhouettes are simplified.
- Ground textures are low resolution (0.5-1 m per pixel) by design; land-use edges are soft.
- No texture compression is used because the app ships almost no textures (one 128 px facade
  tile plus per-chunk canvas ground textures generated at runtime).

## Day, night and rain (N1-M6 part A, all invented)

- **The clock is not a real clock.** A day of play lasts 13 min 25 s (daylight 9 min 45 s, night 3 min 40 s) and always
  starts at 09:40. The date is fixed (15 April), the moon is always full and stands opposite the sun, and the stars are
  a random pattern, not the sky over Kuching. The light of the sun and moon is never drawn from lower than 12 degrees,
  so shadows at sunrise and sunset are shorter than they should be.
- **Night light is a look, not a simulation.** No lamp, window or sign lights anything round it. Lamp light on the
  ground is a painted pool under each lamp; it does not fall on walls, cars or people, and nothing casts a shadow in it.
  The Jalan China section gets a warm wash near street level instead. Reflections in the section stay those of a
  daytime sky, only weaker.
- **Which windows are lit is random**, by bay and storey, and does not change through the night; about half are lit. On
  distant buildings a plain grid of windows stands in for the real facade. Shop rows are lit by a slow random drift
  along the street. Every sign board is lit, whatever the business is.
- **Every landmark is floodlit** the same way (a wash of its own colour), the DUN roof a little more. Which buildings
  in Kuching are really floodlit, and in what colour, was not looked up.
- **Lights on the river** are seven fixed points (the DUN, the Darul Hana bridge, the floating mosque, the waterfront,
  the Square Tower, Fort Margherita, the Astana) with made-up colours and strengths; the river does not mirror the
  bank itself.
- **Street lamps are placed by rule** (N1-M4: none is mapped), so every pool of light is inferred too.
- **Rain is one weather for the whole city**: showers of 1.5 to 3 minutes after dry spells of 5 to 11 minutes, by a
  random schedule, not Kuching's climate. Streaks fall through roofs, arcades and the car's roof. Puddles are a noise
  pattern, not low ground; drains do not fill; nothing gets slippery. Walls and roofs do not look wet.
- **Sound is synthesised** (filtered noise for rain, a low rumble for thunder); there is no lightning flash.
- **In an automated browser** (tests, screenshot and benchmark tools) the game starts on a frozen dry day unless the
  address or a saved setting says otherwise, so those runs do not show the cycle.

## Traffic and walkers (N1-M6 part B, all invented)

- **Only the roads are mapped.** Ambient vehicles follow the centre lines, one-way flags and signal positions of
  OpenStreetMap; everything else is made up: how many there are, which kinds (three generic cars, a kapcai with a
  rider), their paint, their speeds (27 to 45 km/h by road class) and where each one turns.
- **They exist only round the player** (130 to 230 m by preset; 8 vehicles and 9 walkers on Low, 18 and 22 on Medium,
  26 and 34 on High; about half at night, fewer walkers in rain) and appear and vanish at the edge of that ring.
- **Lanes are inferred**: a vehicle keeps a quarter of the mapped (mostly inferred) carriageway width left of the centre
  line. Lane counts are not in the data; nobody overtakes; a kapcai rides a little further left but does not filter.
- **Priority is a rule, not the real one**: the larger road class goes first, a driver who has waited 20 s edges out, and
  two vehicles that block each other for 8 s are let through one another. **Signal timing is invented** (15 s green,
  2 s amber, in two directions by bearing) and the drawn signal heads do not change colour.
- **Ambient traffic keeps out of** service roads, covered ways, streets that only lead to a dead end, and Jalan China
  (the hand-built street where the player's car waits in the one free lane).
- **Vehicles brake for the player, the player's car and walkers, but nothing collides with them.** The player's car
  drives through ambient vehicles (collisions are planned for the play loop, N1-M7); a walking player is pushed aside
  by the three nearest vehicles. A vehicle held up for 12 s by something that will not move edges through it.
- **Walkers follow fixed short routes**, to and fro: the footpath beside a carriageway, a mapped footway or pedestrian
  street, or the five-foot way behind a shophouse front. They do not cross a street on purpose (a footpath route may
  pass the mouth of a side street), do not enter buildings, avoid nobody but the player, and may walk through each
  other. Some just stand. Who is where is random, not a count of real footfall.
- **One body for everyone**: the CC0 "Casual Character" with its walk cycle, recoloured (clothes, skin, hair) and
  scaled 1.52 to 1.78 m; on Low and Medium a coarser copy of it. Walkers and the kapcai rider have no face detail at
  that size. They cast no shadow of their own (a soft patch under each); ambient vehicles cast shadows on Medium and High.
- **At night** vehicles show head and tail lamps and a patch of light on the road; like every lamp in the game it lights
  nothing else, so the bodies of cars and walkers are dark away from daylight.
- **The phone benchmark** still runs round Jalan China, where there is little ambient traffic (the old town is one-way
  and Jalan China itself is closed to it).

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
