# Independent Review of Kuching 3D (`ANTIGRAVITY_REVIEW`)

**Reviewer**: Antigravity (Google DeepMind)  
**Branch / Commit**: `night/city-realism-1` (`7a57df2`)  
**Scope**: Full source audit (`src/`, `tools/`, `tests/`, `docs/`, `PLAN_N2.md`) and live browser playtest (`http://localhost:3000/`, `?time=night&rain=on`, and `375×812` mobile touch layout).

---

## What Is Genuinely Good (Don't Break These)

Before listing what is wrong, five engineering decisions in this codebase are legitimately strong and worth preserving:

1. **Single-Draw-Call Vertex Animation Texture (VAT) Pedestrians (`src/life/LifeRender.ts#L319-L410`)**: Baking 13 animation poses from `casual-character.glb` into a `512 × rows × 13` floating-point texture (`RGBA32F`) and rendering up to 140 walkers in **one** unindexed `InstancedMesh` draw call—without `SkinnedMesh` skeleton matrix uploads per walker—is the right architecture for mid-range mobile WebGL.
2. **Pure, Deterministic Simulation Separation (`src/life/traffic.ts`, `src/life/walkers.ts`, `src/vehicle/VehiclePhysics.ts`, `src/play/missions.ts`)**: All four core simulation modules have zero Three.js scene dependencies, accept seeded RNGs (`mulberry32`), and run directly under Node in Vitest (`530/530` unit tests passing in ~4.6 s).
3. **Vincenty-Validated Transverse Mercator Projection (`src/geo/GeoProjection.ts`, `tools/validate-geography/validate.ts`)**: Centring a Transverse Mercator projection on Kuching (`1.5559° N, 110.3442° E`) with `< 0.5%` scale error and `< 0.2°` azimuth drift against WGS84 Vincenty across 15 surveyed landmark pairs gives the map genuine geometric authority.
4. **Generator-Budgeted Chunk Streaming (`src/world/ChunkManager.ts#L172-L202`)**: Slicing chunk geometry assembly across a 6 ms per-frame generator budget (`buildBudgetMs = 6`) with distance-prioritized queues keeps chunk streaming from freezing the main thread during normal walking.
5. **Radical Documentation Honesty (`docs/LIMITATIONS.md`, `docs/ASSETS.md`, `docs/night/REPORT.md`)**: Very few projects document their own shortcuts, triangle budget overruns, and failed tests this transparently.

---

## Executive Priority Ranking (Most Valuable First)

Every finding below is detailed under its required heading (`§1`–`§7`) with exact file/line evidence, player/project impact, suggested fix, and effort (`S` ≤ 0.5 day, `M` 1–2 days, `L` 3–5 days). Here is the master priority order across the entire project:

| Rank | ID | Category | Finding Summary | Effort |
| :--- | :--- | :--- | :--- | :--- |
| **#1** | **P1** | Phone performance | `V5Scene` (`mode === 'c'`, 86k–150k tris) is merged into full-corridor meshes and **never unloaded** regardless of distance, while extended exploration balloons to **97 chunks / 2.05M tris / 714 draw calls** and stalls to 1–2 FPS. | **M** |
| **#2** | **G1** | Gameplay feel | **First-60-seconds UX trap**: 30+ hand-placed parked cars on Jalan China, Carpenter St, Main Bazaar, Gambier, and India St are baked into static district meshes and cannot be entered. | **M** |
| **#3** | **R1** | Realism | **Zero walkers in India Street Pedestrian Mall and sparse/rejected runs in Main Bazaar** because arcade obstacles block `clearRun` (`9 m`) and India Street (`area=yes`) has no central mall walkway route. | **S** |
| **#4** | **D1** | Data & licence honesty | **Legal & trust gap**: MIT-licensed Rocketbox animations (default-on character picker) and CC-BY/CC-BY-SA assets lack an in-game Credits UI, while `index.html` falsely tells players 88% of buildings are "drawn plain grey". | **S** |
| **#5** | **R2** | Realism | **Night & rain break 3D spatial illusion**: streetlamp pools (`y + 0.17 m`) leave walls, cars, and walkers pitch-black; rain falls straight through five-foot-way arcades and India Street's canopy; V5 wet roads conflict with procedural chunk roads in daylight rain. | **M** |
| **#6** | **G2** | Gameplay feel | **Ghostly taxi/delivery endpoints & generic POI names**: jobs spawn only a floating cone up to 160 m from the building with no waiting passenger/customer, and collapse 27 food tags into `"a restaurant, Jalan Ewe Hai"`. | **S** |
| **#7** | **P2** | Phone performance | **Redundant 415 KB download & CPU bake of `casual-character.glb`** on boot even while the Character Picker is open and the player loads a 750 KB MakeHuman GLB (~1.2 MB total character payload). | **S** |
| **#8** | **R3** | Realism | **Major Kuching landmarks & destinations break recognition**: The Spring is a blank 3-storey box; Satok has sidewalk-parked cars and no market canopy; City Mosque entrance is blocked by two false Overture houses; Waterfront lacks its signature white conical tensile canopies; Plaza Merdeka lacks the Waterfront Hotel tower, GPO, Round Tower, Pavilion, and Brooke Memorial. | **L** |
| **#9** | **P3** | Phone performance | **Hero chunks exceed triangle budget by +65–70% with no LOD** (`-1_-1` India Street at 85k tris, `-2_-1` City Mosque at 82k tris) because `LandmarkManager` and `IndiaStreetMesh`/`GravesMesh` build full detail unconditionally. | **M** |
| **#10** | **A1** | Code & architecture | **Dual competing district/rendering architectures** (`src/v5/*` PBR + AgX vs `src/world/district/*` Lambert + string-replaced shaders) cause visual seams (such as the sharp wet/dry asphalt rectangle on Jalan China) and double maintenance. | **L** |
| **#11** | **G3** | Gameplay feel | **Collision & camera holes**: players can walk inside hollow V5 open shopfronts (`Lee Heng Jewellers`, `Winnie's Cafe`), cars drive through walkers like ghosts, shoes sink into steps/drains, and the 3rd-person camera clips inside the player's own head. | **M** |
| **#12** | **T1** | Tests & tooling | **Two failing E2E tests (`production.spec.ts`, `character-p5.spec.ts`)** and a phone benchmark (`drive-bench.ts`) that only drives around Jalan China where ambient traffic is explicitly disabled (`closed: name === 'Jalan China'`). | **S** |
| **#13** | **G4** | Gameplay feel | **Mobile `375×812` & Desktop HUD overlaps + broken Quality toggle + incomplete save state**: overlapping HUD pills on phone/desktop; switching quality wipes all loaded chunks; saving forgets player walking coordinates. | **S** |
| **#14** | **E1** | Deployment | **Un-versioned static chunk/data fetches & 1.24 MB of unused character GLBs deployed to Cloudflare Workers**: returning browsers risk stale chunk JSONs after data rebuilds, and superseded `adult-man.glb`/`adult-woman.glb` ship in `dist/`. | **S** |
| **#15** | **A2** | Code & architecture | **Fragile `THREE.ShaderChunk` global mutations, in-place chunk data mutation, module singleton leaks, and dead legacy code**. | **M** |

---

## 1. Realism: What Still Doesn't Look Like Kuching?

### [R1] Rank #3 — India Street Pedestrian Mall and Main Bazaar Have Empty / Blocked Walkways
- **What's wrong**: Kuching's two most famous pedestrian corridors—**India Street Pedestrian Mall** (`04-india-street`) and the **Main Bazaar five-foot way** (`02-main-bazaar`)—are nearly or completely devoid of walkers.
- **The evidence**:
  - `src/life/walkers.ts#L114` & `#L130-L155`: `arcadeRoute()` places paths at `ARCADE_DEPTH * 0.5` (`1.2 m` inside the building footprint) and requires a `MIN_RUN = 9 m` obstacle-free segment (`clearRun()`).
  - `src/world/CollisionWorld.ts#L132-L141`: `frontObstacles()` places arcade corner piers and 1–2 merchandise table/rack boxes (`depth: 0.75 m`) at `inset = 1.1 m` inside almost every shophouse frontage (`shophouse_historical`, `shophouse_modern`, `market`). Because the merchandise box sits at `1.1 m` and the walker route sits at `1.2 m` with `CLEAR_PAD = 0.55 m`, `clearRun()` rejects almost every Main Bazaar shophouse run.
  - `src/world/district/indiaStreet.ts#L83-L110` & `src/life/walkers.ts#L136`: In OpenStreetMap, India Street is mapped as a closed pedestrian area polygon (`highway=pedestrian, area=yes`, way `69928034`) rather than a linear road spine, and `IndiaStreetMesh.ts#L114-L162` populates 35 central textile/spice stalls plus 14 canopy posts into `heroObstacles`. Because `walkers.ts` only generates routes from `building.frontEdges` (`arcadeRoute`) or road edges (`roadsideRoutes`), and never generates a central pedestrian corridor along `indiaStreetSpine()`, India Street has **zero** walkers down its covered mall.
  - Confirmed in `docs/night/before-after.jpg` (views `02-main-bazaar` and `04-india-street`) and during the live playtest at `http://localhost:3000/`.
- **Why it matters**: India Street and Main Bazaar are the heartbeat of Old Kuching. Having 140 walkers roaming residential roads while India Street's covered bazaar is a ghost town immediately breaks immersion.
- **Suggested fix & effort**: **Effort: S**.
  1. In `src/world/CollisionWorld.ts#L138`, push shophouse front merchandise boxes either against the inner shop wall (`inset = 2.05 m`) or between piers (`inset = 0.35 m`) so a clear `1.2 m` walking lane exists down the five-foot way, and lower `MIN_RUN` in `src/life/walkers.ts#L16` from `9` to `5.5`.
  2. In `src/life/walkers.ts`, add two explicit pedestrian walkways along `indiaStreetSpine()` at lateral offsets `±2.1 m` (between the central stalls at `±0.95 m` and the shophouse steps at `±3.8 m`).

### [R2] Rank #5 — Night & Rain Visuals Break 3D Space, and Wet Road Shaders Clash Across V5/Chunk Borders
- **What's wrong**:
  1. **Flat streetlamp pools (`?time=night`)**: Streetlamps only draw an additive disc at `y = ground + 0.17 m` (`src/world/StreetFurniture.ts#L35-L58`). They cast zero light onto vertical shophouse columns, parked cars, or walkers—leaving pedestrians and vehicles pitch-black silhouettes even when standing directly beneath a streetlamp.
  2. **Rain passes through roofs (`?rain=on`)**: `src/world/Rain.ts#L14-L28` wraps 2,200 streaks inside a `26×18×26 m` box around `uCam` in the vertex shader with no roof or canopy occlusion. During our playtest at `http://localhost:3000/?time=night&rain=on`, rain poured right through the Main Bazaar / Jalan China five-foot-way arcade ceilings, the India Street canopy, and the player's car cabin.
  3. **Sharp wet/dry asphalt rectangle on Jalan China (`?rain=on`)**: As captured in our live playtest screenshot on Jalan China (`1.55899° N, 110.34634° E`), the procedural chunk road (`Materials.ts#L340-L386`, with animated `rainRipple` rings and dark wet darkening `wet = uWet * (0.55 + 0.35 * puddle)`) collides with the V5 Jalan China road ribbon (`src/v5/materials.ts#L353-L383`), creating a harsh diagonal dark/grey seam right under the player's car.
  4. **Sarawak River renders pitch-black in daytime rain & traffic signals never cycle**: In daytime rain (`?rain=on`), the water shader (`Materials.ts#L196-L246`) intermittently renders pitch-black at the Waterfront. Meanwhile, traffic signal heads (`src/world/StreetFurniture.ts#L150-L151`) bake red (`0xd23a2e`), amber (`0xe0a52e`), and green (`0x3fae5a`) lenses into a single static `glow` geometry at `0.75` brightness (and are sparse/absent at key heritage intersections like Main Bazaar / Jalan China and Plaza Merdeka).
  5. **Vehicles in daytime rain project floating white headlight cones**: In our live playtest screenshot (`?rain=on`), the yellow car and ambient traffic cars project hard-edged translucent white triangle planes (`beamGeo`) in broad daylight rain, while the red taxi's rear taillights remain unlit when braking at night.
- **The evidence**:
  - `src/world/StreetFurniture.ts#L35-L58` (`addLightPool` at `y + 0.17`), `src/world/StreetFurniture.ts#L150-L151` (`LENS` loop baking all 3 signal colours).
  - `src/world/Rain.ts#L18-L27` (unoccluded camera-box modulo wrap).
  - `src/world/Materials.ts#L340-L386` vs `src/v5/materials.ts#L353-L383` (mismatched wet asphalt darkening and puddle ripple overlays on Jalan China).
  - `src/v5/pipeline.ts#L169-L184` (PMREM environment cubemap is baked once `inDaylight()` and never re-baked for night warm street reflections).
  - Live playtest at `http://localhost:3000/?time=night&rain=on`.
- **Why it matters**: Kuching is famous for tropical downpours and warm evening heritage walks. Taking shelter under a five-foot way (`kaki lima`) during a rainstorm is a quintessential Malaysian experience; having rain slice through the ceiling—and seeing a sharp dark/light shader cut down the middle of Jalan China—undermines the atmospheric payoff of N1-M6.
- **Suggested fix & effort**: **Effort: M**.
  1. **Roof occlusion for rain**: Pass a tiny top-down `256×256` roof-mask `DataTexture` (or analytic distance to the current chunk's covered arcade/canopy AABBs) to `Rain.ts` so drops inside covered arcades/canopies discard when `worldPos.y < roofHeight`.
  2. **3D streetlamp illumination**: Pass a uniform array of the 16 nearest streetlamp positions (`vec3 uLamps[16]`) to building, vehicle, and walker shaders (or bake warm vertex lighting into chunk `solid` buffers within `14 m` of each lamp pole during `StreetFurniture.buildForChunk`) so vertical walls, cars, and walkers light up under lamps at zero extra draw calls.
  3. **Harmonize V5 and chunk wet road shaders**: Either hide the underlying chunk road mesh under V5 Jalan China (`V5Scene.ts`) or unify the `uWet` ripple/darkening math between `src/world/Materials.ts` and `src/v5/materials.ts`.
  4. **Traffic signals**: Phase-shift signal lens brightness in the fragment shader using `floor(mod(uTime + worldPos.x * 0.1, 9.0))` and vertex colour tags so only one lens (R, A, or G) glows at a time.

### [R3] Rank #8 — Seven Named Kuching Places Still Break Local Recognition
- **What's wrong & the evidence (place by place)**:
  1. **The Spring Shopping Mall (`10-the-spring`, chunk `6_9`, `x=1622.9, z=2536.8`)**:
     - *Evidence*: `tools/dev/city-tour.json#L84-L91`, `docs/night/before-after.jpg` (view `10-the-spring`), `src/world/arch/buildingType.ts#L102`, `src/world/arch/TypedBuilding.ts#L58-L60`.
     - *What's wrong*: One of Kuching's flagship malls renders as a flat, featureless 3-storey grey/beige slab (`ROW.mallGround` + `ROW.mallClad`) behind an empty green lawn. In reality, The Spring's Persiaran Spring / Jalan Simpang Tiga frontage has a grand curved drop-off porte-cochère canopy, bright anchor-tenant lightboxes (Parkson, Ta Kiong, Uniqlo/H&M signage), al-fresco restaurant terraces, and multi-lane median islands.
  2. **Satok Commercial Area & Medan Niaga Satok (`09-satok`, `x=-2533.1, z=492.1`)**:
     - *Evidence*: `tools/dev/city-tour.json#L75-L82`, `docs/night/before-after.jpg` (view `09-satok`), `src/play/parked.ts#L32-L85`.
     - *What's wrong*: Satok looks like a sterile concrete strip with uniform 3-storey shophouses and rule-placed cars parked directly **on top of the pedestrian sidewalk** (`parked.ts` offsets from road centreline without checking sidewalk polygons). There are no market canopies, hawker awnings, colourful bank/retail signboards, or the nearby Satok Suspension Bridge (`Jambatan Gantung Satok`).
  3. **Kuching City Mosque / Masjid Bandaraya (`08-kuching-mosque`, chunk `-2_-1`, `x=-573.3, z=-252.8`)**:
     - *Evidence*: `docs/night/before-after.jpg` (view `08-kuching-mosque`), `src/world/landmarks/cityMosque.ts`, `src/world/landmarks/protect.ts`, `docs/LIMITATIONS.md#L174`.
     - *What's wrong*: The custom `buildCityMosque` landmark is well-proportioned, but **two machine-detected Overture footprints right in front of the entrance canopy** fall just outside the landmark's protection polygon and are extruded as small suburban pitched-roof houses—blocking the mosque's ceremonial entrance and forecourt.
  4. **Kuching Waterfront Promenade (`01-waterfront`, `13-river-to-dun`, `src/world/district/PromenadeMesh.ts`, `src/world/district/Dressing.ts`)**:
     - *Evidence*: `src/world/district/PromenadeMesh.ts#L49-L59`, `src/world/BuildingBuilder.ts#L345-L353`, `src/world/district/Dressing.ts#L168-L185`.
     - *What's wrong*: Three things are wrong on the Waterfront: (a) small pavilion/kiosk OSM footprints are classified as generic cream cottage houses (`BuildingBuilder.ts#L351`); (b) the promenade's signature **white conical tensile membrane canopies** and Sarawak ethnic swirl mosaic medallions (simplified to plain concentric rings in `PromenadeMesh.ts#L51`) are missing; and (c) the 3 *penambang* (tambang) river taxis (`Dressing.ts#L168-L185`) are frozen into static chunk buffers at `WATER_LEVEL + 0.05` instead of gently bobbing or ferrying across the Sarawak River between the Waterfront jetties and Kampung Boyan.
  5. **Plaza Merdeka & Heritage Civic Core (`06-plaza-merdeka`, `src/world/district/plazaMerdeka.ts`)**:
     - *Evidence*: `src/world/district/plazaMerdeka.ts`, `docs/night/before-after.jpg` (view `06-plaza-merdeka`), `docs/LIMITATIONS.md#L148-L150`.
     - *What's wrong*: While `PlazaMesh.ts` adds the arched entrance portal, the **Waterfront Hotel** tower rising directly above Plaza Merdeka is absent, and four national-heritage colonial landmarks within 120 m—the **General Post Office** (1931 neoclassical Corinthian colonnade on Jalan Tun Abang Haji Openg), **The Pavilion** (1909), **Round Tower** (1886 fort dispensary), and **Brooke Memorial** obelisk in front of the Old Courthouse—are still flat-extruded generic boxes.
  6. **Carpenter Street East / Upper China Street Neck (`03-carpenter-street`, `src/v5/carpenterEast.ts#L110-L158`)**:
     - *Evidence*: `src/v5/carpenterEast.ts#L31`, `docs/night/before-after.jpg` (view `03-carpenter-street`), `docs/LIMITATIONS.md#L111-L119`.
     - *What's wrong*: Because an adjacent OSM polygon juts into the Jalan China / Carpenter Street intersection, the street pinches to 5 m and the `03-carpenter-street` camera view is 60% occluded by a blank grey flank wall (`carpenterEast.ts#L114`). Furthermore, the east-end **Harmony Arch** (`carpenter-street-harmony-arch`) and the lively kopitiam tables along the five-foot way are not visible from the main corridor view.
  7. **Chunk-Border Discontinuity in Kampung & Roadside Building Types**:
     - *Evidence*: `src/world/arch/buildingType.ts#L226-L257`.
     - *What's wrong*: `typedBuildings(data)` determines `kampung` (whether any street in the chunk is named `"Kampung ..."`) and `majorDist`/`waterDist` using **only the current chunk's road and water arrays**. A Malay timber stilt house in Kampung Boyan / Kampung Gersik or a roadside shophouse whose chunk doesn't contain the `"Kampung"` road segment or trunk road center flips abruptly across a 256 m chunk line into a generic suburban house or warehouse.
- **Why it matters**: A local Kuching player will immediately test the places they know: the Waterfront, Main Bazaar, Carpenter Street, Plaza Merdeka/GPO, Satok, City Mosque, and The Spring. Fixing these specific visual falsehoods delivers far more perceived authenticity than generic shader tweaks.
- **Suggested fix & effort**: **Effort: L** (can be split per landmark/district: **S** to widen `cityMosque` protection bbox and fix `buildingType.ts` border context in `tools/generate-world/build.ts`; **M** for The Spring canopy/signage + Satok market canopy + Waterfront tensile cones + animated tambang boats; **M** for GPO/Pavilion/Round Tower procedural landmarks).

---

## 2. Gameplay Feel

### [G1] Rank #2 — The "First 60 Seconds" UX Trap: 30+ Hand-Placed Parked Cars in Old Kuching Cannot Be Driven
- **What's wrong**: When a player spawns at the Waterfront and walks onto Main Bazaar, Jalan China, Carpenter Street, Jalan Gambier, or India Street, they see dozens of detailed parked cars with Sarawak plates (`QAH 6874`, `QAT 5316`, sedans, SUVs, vans, pickups). Walking up to them shows **no `[E] Enter Car` prompt**, and pressing `E` either does nothing or pops up `"No known shop within 7 m"`. Only the rule-placed `InstancedMesh` vehicles (`src/play/parked.ts`) and the yellow starter car on Jalan China are actually driveable.
- **The evidence**:
  - `src/v5/V5Scene.ts#L463-L466`, `src/v5/china.ts`, `src/v5/carpenterEast.ts#L92-L100`: Bakes 20+ parked cars directly into V5 static `GeoBuf` meshes.
  - `src/world/district/Dressing.ts#L277` (`dressPark` / `addVehicle`): Bakes static parked cars along Main Bazaar and Gambier into the chunk's `solid` buffer.
  - `src/world/district/IndiaStreetMesh.ts#L279`: Bakes static vehicles at the India Street / Gambier end into `kit`.
  - Confirmed during the live playtest on Jalan China and Main Bazaar: static cars (`QAH 6874`, `QAT 5316`, grey SUV, blue sedan) have pedestrian collision boxes (`CollisionWorld.ts`), look identical in scale to driveable cars, yet are completely inert.
- **Why it matters**: In a game promising "GTA-style play", walking up to the first ten cars you see and being unable to enter them makes the player think vehicle entry is broken.
- **Suggested fix & effort**: **Effort: M**. Stop baking static vehicle geometry into `V5Scene.ts`, `carpenterEast.ts`, `Dressing.ts`, and `IndiaStreetMesh.ts`. Instead, export their `{ x, z, yaw, kind, color }` transforms into a shared `HeroParkedSpot[]` registry consumed by `src/play/parked.ts` so every visible parked car in the city is rendered via `Play`'s interactive vehicle pool and can be entered with `E`.

### [G2] Rank #6 — Ghostly Job Pick-Ups/Drop-Offs & Generic `"a restaurant"` Labels
- **What's wrong**:
  1. **No passenger or customer at job endpoints**: Accepting a taxi fare or food delivery (`T` → Phone) places only a rotating translucent cone (`this.beacon`, `src/play/Play.ts#L145`) at a roadside snap point up to **160 m away** from the actual building (`Play.ts#L485`). When you arrive within `14 m` at `< 2.5 m/s` (`src/play/missions.ts#L124`), a toast fires instantaneously—there is no waiting passenger, no food vendor/customer figure, and no visual boarding feedback.
  2. **Generic POI labels**: `src/play/sites.ts#L13-L15` maps 27 distinct OSM food categories (`restaurant`, `cafe`, `fast_food`, `food_court`, `kopitiam`, `bakery`, `bubble_tea`, `seafood`, etc.) to the single string `"a restaurant"`, and maps every hotel/hostel/guesthouse to `"a hotel"`. During our playtest (`http://localhost:3000/`), the phone job board offered:
     - `"a hotel, Jalan McDougall"` → `"a hotel, Jalan Ban Hock"`
     - `"a restaurant, Jalan Ewe Hai"` → `"a hotel, Jalan Green Hill"`
     Worse, if an unnamed building has no named street within 80 m (`Play.ts#L431`), its label is literally just `"a restaurant"`.
- **The evidence**:
  - `src/play/sites.ts#L13-L39` (`KIND_LABEL` mapping and `extractJobSites`).
  - `src/play/Play.ts#L422-L441` (`nameSites` road-name fallback) & `#L484-L497` (`snapSites` 160 m roadside snap).
  - `src/play/Play.ts#L504-L547` (instant state transition on `checkArrival`).
  - Live playtest screenshot (`final_step_319.png`): HUD banner shows `"260 m to pick-up: a restaurant, Jalan Ewe Hai"`.
- **Why it matters**: Kuching's food and hospitality scene has real character (*kopitiams*, *Pasar Malam* stalls, waterfront cafes, heritage hostels). Delivering from `"Chong Choon Cafe"` or `"a kopitiam on Jalan Abell"` to a visible waving customer makes the mission loop feel anchored in Kuching rather than an abstract graph test.
- **Suggested fix & effort**: **Effort: S**.
  1. Preserve granular OSM sub-tags in `sites.ts` (`"a kopitiam"`, `"a bakery"`, `"a seafood restaurant"`, `"a clinic"`, `"a boutique hostel"`) and cross-reference `public/data/kuching/places/*.json` (where 2,084 named shop signs already exist!) so unnamed OSM polygons inherit the nearest shop sign within 18 m.
  2. Spawn a visible waving NPC mesh (reusing a single pose from the walker VAT or character GLB with a floating parcel/briefcase icon) at the curb pick-up/drop-off point, and hide them when picked up.

### [G3] Rank #11 — Collision & Camera Holes: Hollow Open Shopfronts, Ghost Pedestrians vs. Cars, Sinking Shoes, and Head-Clipping Camera
- **What's wrong**:
  1. **Players can walk straight inside hollow V5 open shopfronts**: On Jalan China and Carpenter Street, open-bay shops (`Lee Heng Jewellers and Goldsmiths`, `Winnie's Cafe`, etc.) omit their front wall in the visual mesh to show an interior recess, and `CollisionWorld` has no collision barrier across the open bay or recess back wall. Walking through the doorway drops the player and camera inside the hollow building shell looking at backface-culled geometry.
  2. **Cars drive straight through walkers with zero collision or reaction**: While `Life.ts#L232-L243` registers the 3 nearest ambient cars as dynamic collision boxes (`life0..2`) against the walking player, **pedestrians have zero collision or avoidance against the player's driven vehicle** (`src/vehicle/Driving.ts`, `src/life/walkers.ts`). Driving down a crowded street passes through walkers as if they were holograms.
  3. **Player's shoes/ankles sink into road crowns, steps, and drain grates**: `PlayerController.ts` grounds the character at `TerrainBuilder.getHeightAt(x, z)`, whereas road ribbons (`RoadBuilder.ts`), five-foot-way arcade floors (`+0.18 m`), and street edges (`StreetEdges.ts` `+0.13 m` kerbs) sit above the base terrain heightmap.
  4. **Third-person camera clips inside arcade pillars and the player's own head**: When backing up against a five-foot-way pillar or wall, the follow camera (`PlayerController.ts`) lacks a camera-to-pivot ray/sphere pullback against `CollisionWorld`, pushing the near plane right inside the player's skull (exposing floating eyeballs, teeth, and hair backfaces).
  5. **Wheel-arch z-fighting & Map modal click inertness**: In our live playtest, black z-fighting/clipping artifacts appeared inside the wheel hubs/arches of the yellow car and parked SUV; and clicking district labels (e.g., `"Main Bazaar"`) in the `M` Map modal did not teleport or focus the map as players expect after using `Pause → Go to District`.
- **The evidence**:
  - Live browser playtest across Waterfront, Main Bazaar, Jalan China, and Carpenter Street (`http://localhost:3000/`).
  - `src/world/CollisionWorld.ts#L86-L148` (building footprint polygons vs V5 custom recesses in `src/v5/china.ts`).
  - `src/life/Life.ts#L218-L253` (`syncCollision` only exports `traffic.cars`, never `walkers`, and `walkers.ts` has no player-car dodge/scatter check).
  - `src/player/PlayerController.ts#L120-L205` (terrain height sampling and camera positioning).
- **Why it matters**: Physical solidity is what makes a 3D city feel like a place rather than a WebGL viewer.
- **Suggested fix & effort**: **Effort: M**.
  1. Ensure every V5 building lot in `V5Scene.ts` keeps a solid closed collision footprint at the shop threshold (`inset = 2.4 m`) even when the visual storefront bay is recessed.
  2. Add a simple lateral evade/step-back impulse in `walkers.ts` when the player's vehicle approaches within `5 m` (or stop/bump the vehicle at low speed).
  3. Add a `0.12 m` surface height offset when `RoadQuery` or `CollisionWorld.inArcade` detects the player is standing on a road crown, kerb, or raised five-foot way, and clamp camera distance against `CollisionWorld.boxContact`.

### [G4] Rank #13 — Mobile (`375×812`) & Desktop HUD Overlaps, Quality Toggle Chunk Wipe, and Incomplete Save State
- **What's wrong**:
  1. **Measured HUD overlaps at `375×812` (mobile layout)**:
     - `#speedo` (`132×76` at `x=231, y=702`) overlaps the right edge of `#car-prompt` (`[E] Exit Car`, `115.5×41` at `x=129.8, y=695`) by `14.2×34 px`.
     - `#gps-btn` (`58×34` at `x=305, y=656`) overlaps bottom toast notifications (`"Press T for the phone: delivery and taxi jobs."`).
     - Opening the **Phone modal** (`330×489.6` at `x=22.5, y=161.2`) overlaps both `#minimap-ctl` (`-`, `N` buttons at `x=287..323, y=126..244`) and `#topbar` (`Map`, `View`, `Settings`, `Pause` buttons at `x=329..367, y=126..340`).
     - Opening `#gps-panel` (`320×351` at `x=43, y=297`) overlaps the `Pause` button at the bottom of `#topbar`.
     - `#wallet` (`top: 134px` on mobile in `src/styles/main.css`) leaves a permanent **77 px blank gap** below `#location` (`bottom: 57px`) even when `#nav-hint` is hidden.
     - Touch controls (`#drive-touch`, `#joystick`, `#btn-run`, `#btn-jump`) rely strictly on CSS `@media (pointer: coarse)` (`src/styles/main.css#L305`) and JS `matchMedia('(pointer: coarse)')` (`src/ui/MobileControls.ts#L16`), so resizing a browser window to `375×812` without CDP touch-pointer emulation hides all on-screen driving/walking buttons while still showing desktop keyboard text (`Walk with WASD...`) on the start screen.
  2. **Measured HUD overlaps on desktop (`1015×914`)**:
     - `#wallet` (`RM 0.00` + active job pill) sits at `top: 72px, left: 16px` directly on top of the `Show performance stats` panel (`src/ui/PerfOverlay.ts`), obscuring lines 2–4 (`calls`, `tris`, `chunks`, `geo`, `tex`).
     - `#speedo` overlaps the right end of the `#help` keyboard bar at the bottom of the screen (visible in `final_step_319.png` where `E` is clipped by the speedometer box).
     - In the Character Picker at `1015×914`, `"Young boy"` truncates with an ellipsis to `"Young b..."`, and in the Phone modal, the light-grey subtitle on the bright yellow `Food delivery` button fails WCAG contrast.
  3. **Changing Graphics Quality (`Low` ↔ `Medium` ↔ `High`) wipes all loaded chunks**:
     - `src/main.ts#L387-L398`: The quality change listener calls `world.chunks.clearAll()`, destroying all 44+ loaded chunks in front of the player's eyes and dropping the scene into empty fog with floating traffic cars and headlight cones while `"Loading area…"` rebuilds from scratch.
  4. **Save state (`localStorage`) drops player walking coordinates and active jobs**:
     - `src/play/save.ts#L4-L16` & `src/play/Play.ts#L562-L570`: Saves `money`, job counts, and the player's **car** pose (`vehicle`), but never saves the player's **walking position**. If you drive to Satok (`2.5 km` west), exit your car, and refresh the page, you respawn on the Waterfront while your saved car remains stranded 2.5 km away in Satok!
- **The evidence**:
  - Live browser playtest DOM bounding-box measurements at `375×812` and `1015×914`, and screenshot `final_step_319.png`.
  - `src/styles/main.css#L110-L455`, `src/ui/MobileControls.ts#L16`, `src/main.ts#L387-L398`, `src/play/save.ts#L4-L16`.
- **Why it matters**: UI overlaps and a full-world blackout on quality change make the app feel unpolished on the exact 375×812 screen size it targets.
- **Suggested fix & effort**: **Effort: S**.
  1. Fix CSS layout positioning in `src/styles/main.css`: flow `#location`, `#nav-hint`, `#wallet`, and `#perf-overlay` inside a single top-left flex column (`gap: 6px`) so they never collide or leave dead gaps; raise `z-index` on modal overlays (`#phone-modal`, `#gps-panel`) or auto-hide `#topbar`/`#minimap-ctl` while a modal is open; and nudge `#car-prompt` left of `#speedo` at `max-width: 640px`.
  2. In `src/play/save.ts`, add `player?: { x: number; z: number; yaw: number; driving: boolean }` so reloading restores the player beside (or inside) their saved car.

---

## 3. Phone Performance

### [P1] Rank #1 — `V5Scene` (86k–150k Tris) Is Never Unloaded or Frustum-Culled by Block, and Extended Roaming Balloons to 97 Chunks / 2.05M Triangles / 714 Draw Calls
- **What's wrong**:
  1. **`V5Scene` is monolithic and permanent**: In default V7 mode (`?v5=c`), `src/v5/V5Scene.ts#L470-L485` merges the entire Jalan China + Carpenter Street West + Carpenter Street East section (`260+ m` across chunks `0_0`, `0_-1`, `1_0`) into **one `THREE.Mesh` per material** (`~25` meshes totalling ~86k–150k triangles) and attaches `this.scene.group` directly to `world.scene` (`src/v5/controller.ts#L171`). Because each mesh's bounding sphere spans the entire multi-block corridor:
     - Three.js frustum culling **cannot** cull lots behind the camera when the player is anywhere in Old Kuching.
     - `V5Scene` is **never unloaded** regardless of distance—even when the player drives 3 km away to Satok or The Spring, all 150k V5 triangles and PBR textures remain in GPU memory and scene traversal!
  2. **Extended exploration hits 2.05M triangles & 1–2 FPS stalls**: During our live browser playtest, spawning at the Waterfront started cleanly at `60 fps` (`calls 116`, `tris 430k`, `chunks 37`). Walking into Jalan China / Main Bazaar rose to `578k–1.28M tris` (`calls 138–352`, `36–59 fps`). After exploring across districts and loading `97 chunks` (High preset `lowRadius = 5`), scene complexity reached **`tris 1,142k–2,050k`, `calls 494–714`, `geo 841`, `tex 146`**, causing frame build times to spike (`max 2780.0 ms`) and rendering to degrade to `1–2 fps` even with dynamic resolution scaling (`res x0.72`).
- **The evidence**:
  - `src/v5/V5Scene.ts#L470-L485` (corridor-wide `GeoBuf` merge per material key).
  - `src/v5/controller.ts#L168-L185` (`this.world.scene.add(this.scene.group)` with no distance-based unload or chunk lifecycle hook).
  - Live browser playtest Performance HUD telemetry (`chunks 37 → 55 → 97`, `tris 430k → 1288k → 2050k`, `calls 116 → 352 → 714`).
- **Why it matters**: A mid-range Android phone GPU (Adreno 619 / Mali-G57) has a hard triangle budget of ~350k–500k visible triangles and ~150 draw calls at 30–60 FPS. Keeping 150k PBR triangles permanently resident and allowing total scene triangles to cross 1.2M–2.0M guarantees thermal throttling or tab crashes on mobile.
- **Suggested fix & effort**: **Effort: M**.
  1. **Spatial bucketing + distance unload for `V5Scene`**: Bucket `V5Scene` geometry buffers into `64×64 m` sub-blocks (4 blocks along Carpenter/China) so behind-camera lots frustum-cull cleanly, and toggle `this.scene.group.visible = false` (or dispose/re-stream) in `V5Controller.update()` whenever the camera is `> (lowRadius + 1) * 256 m` from `(140, 20)`.
  2. **Aggressive low-detail chunk budget**: On `'low'` detail chunks (`dist > highRadius`), skip `StreetEdges`, `StreetFurniture`, `Dressing`, and non-landmark small footprints (`area < 60 m²`), capping total resident triangles across 97 chunks under `600k` on High and `300k` on Low/Phone.

### [P2] Rank #7 — Unconditional Download and CPU Texture Bake of `casual-character.glb` (415 KB) Even When Another Character Is Picked
- **What's wrong**: On startup, `applyInitialMode()` immediately calls `life.start()` (`src/main.ts#L436`)—even while the first-launch Character Picker modal is still covering the screen! `Life.start()` (`src/life/Life.ts#L152-L159`) unconditionally fetches `/models/characters/casual-character.glb` (`414,716 B`) and runs `bakeWalker()` (`src/life/LifeRender.ts#L225-L315`), sampling 5,776 triangles across 13 skeletal poses on the CPU main thread to build the `RGBA32F` walker VAT. Meanwhile, the Character Picker defaults to the 6 MakeHuman characters (`man.glb` 744 KB .. `young-girl.glb` 708 KB). Thus every normal visit downloads **two** full character GLBs (~1.16 MB compressed) before the player takes a single step.
- **The evidence**:
  - `src/main.ts#L433-L436`, `src/life/Life.ts#L152-L159`, `src/life/LifeRender.ts#L225-L315`.
  - Confirmed in the live playtest network log (`page.networkRequests()`): selecting `Man` downloaded **both** `/models/characters/man.glb` and `/models/characters/casual-character.glb`.
  - Also noted in `docs/night/REPORT.md#L107-L108`.
- **Why it matters**: Over a 4G mobile connection, downloading and parsing an extra 415 KB GLB plus baking 75,088 posed triangle vertices on the main thread during startup directly delays time-to-interactive and contributes to the startup frame spike (`character-p5.spec.ts` failure).
- **Suggested fix & effort**: **Effort: S**. Pre-bake the walker VAT offline in `tools/generate-world/` (or a dedicated `tools/bake-walker-vat.ts` script) into a compact binary/WebP + geometry buffer (~90 KB gzipped), or bake the walker VAT from the already-loaded player character GLB so `casual-character.glb` is never fetched at runtime.

### [P3] Rank #9 — Hero Chunks Exceed Triangle Budget by +65–70% Because Landmarks and District Meshes Lack `'low'` Detail LOD
- **What's wrong**: The project sets a per-chunk budget of 50,000 triangles (`docs/LIMITATIONS.md#L194`), yet chunk `-1_-1` (India Street + Bukit Mata Muslim Cemetery) hits **85,093 triangles (+70%)** and chunk `-2_-1` (Kuching City Mosque) hits **82,253 triangles (+65%)**. Two code defects cause this:
  1. `src/world/ChunkManager.ts#L417-L418` calls `this.landmarks.buildForChunk(chunk.data, detail)` at **both `'high'` and `'low'` detail**, and `src/world/landmarks/cityMosque.ts` ignores `ctx.detail` completely—building every dome rib, arched colonnade, minaret balcony, and finial even when the chunk is 1 km away in the `'low'` ring!
  2. `src/world/district/IndiaStreetMesh.ts` (35 textile stalls with Table cloth folds + 74 multi-bay shophouses + 14 multi-strut canopy trusses) and `src/world/district/GravesMesh.ts` (332 individual headstones + plinths) dump all geometry into a single `'high'` chunk build with no sub-chunk distance culling for interior props (stalls, merchandise, individual headstones) beyond `80 m`.
- **The evidence**:
  - `src/world/ChunkManager.ts#L417-L418`, `src/world/landmarks/cityMosque.ts#L16-L155` (no `ctx.detail === 'low'` branch, unlike `src/world/landmarks/dun.ts#L70` which checks `const hi = ctx.detail === 'high'`).
  - `src/world/district/IndiaStreetMesh.ts#L114-L162`, `src/world/district/GravesMesh.ts#L11-L31`.
- **Why it matters**: Chunks `-1_-1` and `-2_-1` are immediately west of the Old Kuching spawn area. Whenever the player walks Main Bazaar or Carpenter Street, both 80k+ triangle chunks sit inside `highRadius = 2`, adding 167k triangles simultaneously.
- **Suggested fix & effort**: **Effort: M**.
  1. Add a `const hi = ctx.detail === 'high'` branch to `cityMosque.ts`, `floatingMosque.ts`, `oldCourthouse.ts`, `squareTower.ts`, and `padungan.ts` that reduces cylinder/dome segments (`24 → 10`) and omits small colonnade moldings and finials on `'low'` chunks.
  2. Separate `IndiaStreetMesh` stalls/merchandise and `GravesMesh` individual headstones into a near-detail group (`visible` only within `110 m` of the camera) while keeping the canopy roof and shophouse shells visible at full chunk range.

### [P4] Rank #13b — Per-Chunk Synchronous Canvas 2D Ground Texture Allocation & Un-Warmed Shadow Depth Shaders
- **What's wrong**:
  1. **21 to 97 unique `CanvasTexture` and `MeshLambertMaterial` allocations for terrain**: `src/world/TerrainBuilder.ts#L24-L90` creates a new HTML `<canvas>` (`256×256` on Low, `512×512` on Medium/High) for **every streamed chunk**, strokes all landuse polygons, roads, and building aprons on the CPU 2D context, uploads a unique `THREE.CanvasTexture`, and allocates a dedicated `THREE.MeshLambertMaterial` (`ownMaterial = true`). Because every chunk has its own material and texture, terrain cannot share material state across chunks and holds 97 canvas textures in RAM on High.
  2. **Un-warmed shadow-map depth shader programs**: `src/world/prepareDraw.ts#L25` calls `renderer.compile(object, camera, scene)`, which compiles color-pass materials but **not** directional-light shadow-map depth variants (`customDepthMaterial` / `MeshDepthMaterial` for `castShadow = true` meshes). The first time the camera turns toward the Waterfront or a kapcai rider enters the shadow frustum, WebGL compiles 2 new depth programs mid-frame (`docs/night/REPORT.md#L86`, `#L148`).
- **The evidence**:
  - `src/world/TerrainBuilder.ts#L24-L90`, `src/world/Materials.ts#L430-L432`.
  - `src/world/prepareDraw.ts#L16-L39`, `src/life/LifeRender.ts#L194-L214` (`kapcaiDepthMaterial`), `docs/night/REPORT.md#L86`.
- **Why it matters**: Canvas 2D rasterization and texture uploads on chunk boundaries cause micro-stutters while driving fast across chunks, and un-warmed depth shaders cause a 30–80 ms hitch on mobile drivers.
- **Suggested fix & effort**: **Effort: S**.
  1. For `'low'` detail chunks (`dist > highRadius`), skip `paintGroundTexture()` and use a single shared vertex-coloured `MeshLambertMaterial` (sampling landuse colour per vertex), cutting terrain textures from 97 down to 9–21.
  2. In ` warmupAllShaders()` (`src/main.ts#L440-L451`), run one `renderer.shadowMap.render(lights, scene, camera)` pass during the loading screen so all depth shader programs compile before `"Start Exploring"` unlocks.

---

## 4. Code and Architecture: Structure, Dead Code, Risky Patterns, Things That Will Not Scale

### [A1] Rank #10 — Two Competing World-Building & Rendering Architectures (`src/v5/*` vs `src/world/district/*`)
- **What's wrong**: The codebase contains two parallel engines living side-by-side in the same Three.js scene:
  - **Engine A (`src/world/*` + `src/world/district/*` + `src/world/landmarks/*`)**: Chunk-streamed (`ChunkManager.ts`), uses `MeshLambertMaterial` patched via string replacement (`src/world/Materials.ts`), procedural `GeoBuf` builders (`IndiaStreetMesh.ts`, `PromenadeMesh.ts`, `Dressing.ts`), sign atlas in `src/world/arch/SignAtlas.ts`, and procedural landmarks in `LandmarkManager.ts` + GLB streamer in `LandmarkModels.ts`.
  - **Engine B (`src/v5/*`)**: Monolithic corridor loader (`V5Scene.ts`), uses `MeshStandardMaterial` PBR with normal/roughness maps (`src/v5/materials.ts`), custom AgX tone-mapping shader injection (`src/v5/pipeline.ts`), its own geometry kit (`src/v5/kit.ts`), its own sign atlas (`V5Scene.ts#L50`), its own vehicle builder (`src/v5/vehicles.ts`), and its own GLB landmark loader (`V5Scene.ts#L495-L535`).
- **The evidence**:
  - Compare `src/v5/kit.ts` vs `src/world/district/Dressing.ts`; `src/v5/vehicles.ts` vs `src/world/district/IndiaStreetMesh.ts#L227`; `src/v5/materials.ts` vs `src/world/Materials.ts`.
  - Visual consequence captured in `final_step_319.png`: where Engine A's chunk road meets Engine B's Jalan China road, the wet asphalt shaders clash in a sharp diagonal line.
- **Why it matters**: Every cross-cutting feature—night lighting, wet road puddles, takeable parked cars, roof rain occlusion, collision boxes, LOD culling—Currently has to be implemented **twice** (once for `src/world/` and once for `src/v5/`), and frequently diverges.
- **Suggested fix & effort**: **Effort: L**. Make `ChunkManager` the single lifecycle owner of all spatial geometry: register `V5Scene` blocks as chunk-bound district builders (just like `IndiaStreetMesh` in chunk `-1_-1`), unify the road/car/sign primitives into one shared `src/world/kit/` module, and remove the separate `V5Controller` mode `'a'`/`'b'` switching scaffold.

### [A2] Rank #15 — Global `THREE.ShaderChunk` Monkey-Patching, In-Place Chunk Data Mutation, Module Singleton Leaks, and Dead Code
- **What's wrong & the evidence**:
  1. **Global `THREE.ShaderChunk` mutation & `@types/three` version skew**:
     - `src/v5/pipeline.ts#L29-L38` overwrites `THREE.ShaderChunk.tonemapping_pars_fragment` globally, and `src/world/atmosphere.ts` overwrites `THREE.ShaderChunk.fog_pars_fragment` and `fog_fragment`. Meanwhile, `src/world/Materials.ts#L250-L266` and `#L340-L386` chain `.replace('#include <...>', ...)` across nested closures (`detail()`, `patch()`, `make()`).
     - Worse, `package.json#L25` & `#L32` has a version mismatch between runtime `"three": "^0.170.0"` and dev types `"@types/three": "^0.187.0"`. Any Three.js minor upgrade that renames an internal shader chunk include will silently skip the `.replace()` and break lighting or fog without a TypeScript error.
  2. **In-place mutation of fetched chunk JSON data at runtime**:
     - `src/world/ChunkManager.ts#L349-L351` mutates `c.data.roads` widths (`ROAD_WIDTHS[r.id]`) and mutates `c.data.buildings` (`patchHeroData(c.data)` in `src/world/district/indiaStreet.ts#L83-L110`) at runtime inside `fetchChunk()`. Because `patchHeroData` only runs when `ChunkManager.fetchChunk` loads a chunk, offline tools or tests that read raw `public/data/kuching/chunks/*.json` see *different* building footprints and road widths than the live game. These hardcoded OSM way ID overrides (`233689138`, `233689135`, `68332963`) belong in `tools/generate-world/build.ts`.
  3. **Module-level mutable singletons that never clean up**:
     - `src/world/landmarks/dun.ts#L40-L64`: `envListeners.push(light)` pushes closures into a module-global array every time `goldMat()` initializes, with no removal hook.
     - `src/world/district/padungan.ts#L145` (`let gate: Paifang | null = null`), `src/world/district/indiaStreet.ts#L131` (`let spine: SpineNode[] | null = null`), and `src/flags.ts#L35` (`let cached: Flags | null = null`) cache mutable state at module scope across tests and world reloads.
  4. **Confirmed dead / superseded code still shipping in `src/`**:
     - `src/player/CharacterLoader.ts#L28`: `loadCharacter()` is completely unused by the game runtime (`PlayerController.ts` uses `loadRiggedCharacter()`), kept only because old unit tests import it.
     - `src/v5/pedestrians.ts`: 200+ lines of V7.4 procedural box pedestrians superseded by `src/life/walkers.ts` (disabled by default behind `?peds=on`).
     - `src/world/landmarks/floatingMosque.ts#L19-L63` & `src/world/landmarks/squareTower.ts#L26-L50`: Legacy pre-M5 procedural builders kept only for `?m5=0` comparison, rendering geometry acknowledged in comments as inaccurate.
     - `src/world/BuildingBuilder.ts#L45-L48`: `ML_WALLS` and `ML_ROOFS` arrays and comments claiming ML footprints render plain grey (now only hit by fallback `open_roof` sheds).
- **Why it matters**: Dead paths and runtime data patching confuse contributors (and AI coding agents), inflate bundle size, and cause subtle discrepancies between build-time data validation and runtime geometry.
- **Suggested fix & effort**: **Effort: M**. Move `ROAD_WIDTHS` and `patchHeroData` into `tools/generate-world/build.ts`; delete `src/v5/pedestrians.ts`, `loadCharacter()`, and the `?m5=0` legacy landmark branches; pin `@types/three` to `~0.170.0` to match `three`; and add unit tests that assert every `.replace('#include <...>')` target string actually exists in `THREE.ShaderChunk`.

---

## 5. Tests and Tooling

### [T1] Rank #12 — Two Failing E2E Tests on Current `HEAD`, and a Phone Benchmark (`drive-bench.ts`) That Never Tests Ambient Traffic or Heavy Hero Chunks
- **What's wrong**:
  1. **`tests/e2e/production.spec.ts#L66-L81` fails (`10.35 MB` vs `< 5 MB` limit)**:
     - The test recursively sums the gzipped size of *every* file in `dist/` outside `dist/data/` and asserts `app < 5 * 1024 * 1024`. Because 9 character GLBs (`5.7 MB`) and 17 OP-mode reference JPEGs (`3.3 MB`) sit in `public/models/characters/` and `public/reference/`, the static folder sum is `10.35 MB`—even though a player's browser only downloads **one** selected character GLB (~740 KB) and **zero** reference photos on a normal visit (~1.5 MB actual app download).
  2. **`tests/e2e/character-p5.spec.ts#L78-L85` fails (`~133 ms` vs `<= 100 ms` worst frame under 4× CPU throttle)**:
     - Under 4× CPU slowdown, swapping characters while `Life` (ambient traffic + walker VAT baking + chunk streaming) runs on the main thread pushes the worst frame to ~133 ms. Notably, M8 added `?life=0` to the request-count specs (`docs/night/REPORT.md#L118`) to mask `Life`'s network requests, but left `character-p5.spec.ts` unfixed.
  3. **`tools/dev/drive-bench.ts` Scenarios A, B, and C all run in/around Jalan China—where ambient traffic is explicitly banned**:
     - `src/life/Life.ts#L117` passes `closed: (name) => name === 'Jalan China'` when building the traffic road graph! Yet `tools/dev/drive-bench.ts#L37-L45` runs Scenarios A (Idle), B (First Turn), and C (Short Walk) right on Jalan China (`x=140, z=20`), and Scenario D (`highSpeedRoute`) is excluded from the default A/B/C phone gate. Consequently, the phone benchmark barely exercises ambient traffic intersections or the heavy M5 chunks (`-1_-1` India Street, `-2_-1` City Mosque, `4_0`–`6_2` Padungan).
  4. **`npm run data:fetch -- --force` flag bug & non-existent semver ranges in `package.json`**:
     - `package.json#L13` chains four scripts with `&&` (`tsx ...fetch-osm.ts && tsx ...fetch-overture.ts && tsx ...fetch-water.ts && tsx ...fetch-dem.ts`), so `-- --force` (documented in `README.md#L125`) is only passed to the last command (`fetch-dem.ts`).
     - `package.json#L30-L36` lists bizarre future/synthetic semver ranges (`"@types/node": "^26.6.6"`, `"typescript": "^7.0.2"`, `"vite": "^8.3.8"`).
- **The evidence**:
  - `tests/e2e/production.spec.ts#L66-L81`, `tests/e2e/character-p5.spec.ts#L78-L85`, `docs/night/REPORT.md#L115-L119`.
  - `tools/dev/drive-bench.ts#L37-L45` vs `src/life/Life.ts#L117`.
  - `package.json#L13` & `#L30-L36`.
- **Why it matters**: A red test suite erodes engineering discipline, and a benchmark situated on the one street where traffic is disabled gives false confidence about phone frame pacing.
- **Suggested fix & effort**: **Effort: S**.
  1. Rewrite `production.spec.ts#L66-L81` to assert two honest budgets: (a) initial-boot critical bundle (`dist/assets/*` + 1 character GLB + V5 core assets) `< 3.5 MB` gzipped, and (b) actual bytes transferred over the network during a headless Playwright cold boot `< 5 MB`.
  2. Removing the redundant `casual-character.glb` download/bake (`[P2]`) and warming shadow shaders during loading (`[P4]`) will organically bring `character-p5.spec.ts` back under the `100 ms` budget without cheating with `?life=0`.
  3. Add Scenario E (`heritageLoop`: Main Bazaar → Gambier → India Street `-1_-1` → Mosque `-2_-1` → Padungan) to `tools/dev/drive-bench.ts` default runs.

---

## 6. Data and Licence Honesty

### [D1] Rank #4 — Missing In-Game Credits / Licences UI (MIT Rocketbox & CC-BY/CC-BY-SA Compliance) and False "Plain Grey Buildings" Claim in `index.html`
- **What's wrong**:
  1. **MIT License and CC-BY/CC-BY-SA attribution missing from the live UI**:
     - The Character Picker is **enabled by default** (`src/flags.ts#L28`). Every one of the 6 selectable characters (`man.glb`, `woman.glb`, `auntie.glb`, `uncle.glb`, `young-boy.glb`, `young-girl.glb`) embeds Microsoft Rocketbox skeletal animation clips under the **MIT License**, which legally requires the copyright notice and permission text (`public/models/characters/LICENSE-rocketbox.txt`) to be included in distributions of the software.
     - `docs/ASSETS.md#L88` and `#L117` explicitly admit: *"the credits/licences page must carry it too (not built yet)"*.
     - Additionally, 15 of the 17 reference photos distributed in `public/reference/*.jpg` are licensed under **CC BY 2.0**, **CC BY-SA 3.0**, or **CC BY-SA 4.0** (`docs/ASSETS.md#L215-L240`), and `casual-character.glb` uses Quaternius animations. Yet the bottom-right HUD (`#attribution` in `index.html#L45`) only credits OpenStreetMap, Overture Maps, and Copernicus DEM. There is no `Credits & Licences` button on the Title screen, Settings modal, or Pause menu.
  2. **False statement about machine-detected footprints on both the Start Screen and Pause Menu**:
     - `index.html#L137` (Start Screen) tells the player: *"Where OpenStreetMap lacks buildings, machine-detected footprints from Overture Maps fill in the gaps; **they are drawn plain grey and are less accurate.**"*
     - `index.html#L148` (Pause Menu) repeats: *"OpenStreetMap provides the roads, rivers, named landmarks and detailed central buildings; **plain grey buildings are machine-detected footprints** from Overture Maps."*
     - Since milestone N1-M3 (`src/world/BuildingBuilder.ts#L356-L358`), this is **false**: all 25,990 Overture ML footprints (88% of the buildings in the city!) are routed through `addTypedBuilding()` and rendered with colorful Kuching facades, pitched tile/zinc roofs, stilts, and water tanks. Only tiny `open_roof` sheds fall through to `ML_WALLS`.
- **The evidence**:
  - `index.html#L45`, `index.html#L137`, `index.html#L148`.
  - `src/world/BuildingBuilder.ts#L354-L364`.
  - `docs/ASSETS.md#L88`, `#L117`, `#L215-L240`, `docs/LIMITATIONS.md#L297-L298`.
- **Why it matters**: Fulfilling open-source license obligations (MIT and CC-BY/CC-BY-SA) is non-negotiable for a public web deployment, and telling players that "plain grey buildings are machine-detected" misleads them into thinking the 25,990 colorful algorithmically-styled ML footprints were hand-mapped in OpenStreetMap.
- **Suggested fix & effort**: **Effort: S**.
  1. Update `index.html#L137` and `#L148` to state honestly: *"Where OpenStreetMap lacks buildings, machine-detected footprints from Overture Maps fill in the gaps (88% of footprints); their roof shapes, storeys, and colours are inferred from footprint size and district context rather than surveyed."*
  2. Add a `Credits & Licences` link/button to `#attribution`, the Start Screen, and the Pause Menu that opens a lightweight modal listing the full MIT notice for Microsoft Rocketbox, CC0 notices for MakeHuman/MPFB2, Quaternius, Poly Haven, AmbientCG, and CC-BY/CC-BY-SA attributions for Wikimedia/Flickr reference photos.

---

## 7. Deployment

### [E1] Rank #14 — Un-Versioned Static Data Fetches Risk Stale Browser Caches on Cloudflare Workers, and 1.24 MB of Unused Prototype GLBs Ship in `dist/`
- **What's wrong**:
  1. **No cache-busting version query or `public/_headers` policy for `data/kuching/*` and `models/*`**:
     - While Vite content-hashes bundled JS and CSS in `dist/assets/`, runtime fetches for `data/kuching/manifest.json`, `data/kuching/height.bin`, `data/kuching/drive-graph.json`, `data/kuching/jobs.json`, `data/kuching/places/*.json`, and all 135+ `data/kuching/chunks/${key}.json` (`src/world/ChunkManager.ts#L337`, `src/world/WorldManager.ts#L146-L152`) use bare un-versioned URLs with no `?v=` query parameter and no `public/_headers` file configuring Cloudflare Workers Asset `Cache-Control`.
     - When `npm run data:build` updates chunk geometry, road widths, or `drive-graph.json` on a new deployment, returning players can receive a fresh JS bundle paired with stale browser-cached chunk JSONs, causing cars/walkers to desync from road geometry.
  2. **1.24 MB of unused CHAR-P2a prototype GLBs and 3.3 MB of OP-only reference photos are deployed to production `dist/`**:
     - `public/models/characters/adult-man.glb` (`600,400 B`) and `public/models/characters/adult-woman.glb` (`643,808 B`) are superseded prototypes (`docs/ASSETS.md#L82`) that are not selectable in the Character Picker (`src/player/characters.ts`), yet `vite build` copies them into `dist/models/characters/` on every deploy.
  3. **Minor config leaks (`wrangler.jsonc` & `vite.config.ts`)**:
     - `wrangler.jsonc#L3` still names the Cloudflare Worker `"tomato"`.
     - `vite.config.ts#L26` hardcodes `'kuching.duckdns.org'` as the fallback `PUBLIC_HOST` for HMR/allowedHosts.
- **The evidence**:
  - `wrangler.jsonc#L1-L10`, `vite.config.ts#L26`, `src/world/ChunkManager.ts#L337`, `src/world/WorldManager.ts#L146-L152`.
  - `public/models/characters/adult-man.glb`, `public/models/characters/adult-woman.glb`, `docs/ASSETS.md#L82`.
- **Why it matters**: Cache coherency between code and spatial data is critical for an actively iterated open-world map; removing 1.24 MB of dead GLBs immediately trims deployment size and helps `production.spec.ts`.
- **Suggested fix & effort**: **Effort: S**.
  1. Move `adult-man.glb` and `adult-woman.glb` out of `public/` into an ignored `assets-src/archive/` folder (or delete them).
  2. Stamp a short content hash into `manifest.json` during `npm run data:build` and append `?v=${manifest.hash}` to all chunk, place, heightmap, and graph fetches, paired with a `public/_headers` file setting `Cache-Control: public, max-age=31536000, immutable` on `/assets/*` and `Cache-Control: public, max-age=3600, must-revalidate` on `/data/kuching/manifest.json`.

---

## Where I Agree or Disagree with `PLAN_N2.md`

`PLAN_N2.md` is well-structured and correctly identifies the most visible symptoms from N1 (missing credits page, failing `production.spec.ts` and `character-p5.spec.ts`, redundant `casual-character.glb`, empty India Street/Main Bazaar walkways, un-takeable hand-placed cars, blank Satok/The Spring, flat night light pools, and rain falling through roofs).

However, **some milestones are in the wrong order**, a few proposed mechanisms carry **hidden performance traps**, and several high-impact realism/stability gaps are **missing**.

### 1. What I Agree With
- **N2-M0 (Trust)**: Shipping the Credits & Licences modal, fixing the stale `"plain grey buildings"` copy in `index.html`, fixing `production.spec.ts` and `character-p5.spec.ts` without disabling gameplay features, and eliminating the duplicate `casual-character.glb` download are the right first moves.
- **N2-M1 (First Two Minutes)**: Fixing walker routing in India Street and Main Bazaar, making hand-placed street cars takeable, and spawning visible passenger/customer figures at job endpoints directly solve our `#2`, `#3`, and `#6` findings.
- **N2-M2 (Beyond the Postcard)**: Upgrading Satok, The Spring, `amenity=parking` bays, and adding LOD to India Street (`-1_-1`) and City Mosque (`-2_-1`).
- **N2-M3 (Night & Rain)**: Making streetlamps illuminate vertical walls/vehicles/walkers, cycling traffic signal colours, and occluding rain under covered arcades and canopies.

### 2. What I Would Reorder (and Why)
1. **Move Hero-Chunk LOD (from N2-M2) and `V5Scene` Spatial Culling/Unloading INTO N2-M0 (Before N2-M1)**:
   - *Why*: In `PLAN_N2.md`, N2-M1 adds *more* walkers in Main Bazaar/India Street, *more* interactive parked cars, and *more* trunk-road traffic before N2-M2 addresses triangle counts. As our live playtest showed, roaming across chunks already pushes the scene to `1.1M–2.05M` triangles and stalls frame build times because `V5Scene` (150k tris) never unloads and chunks `-1_-1`/`-2_-1` (167k tris combined) have no LOD. Fix the triangle ceiling **first** so N2-M1's new life features don't immediately blow the phone frame budget.
2. **Expand `drive-bench.ts` Scenarios in N2-M0 (Instead of Running 3 Alternating Bench Pairs on Jalan China)**:
   - *Why*: `PLAN_N2.md` proposes fixing bench jitter in N2-M0 by running 3 alternating A/B/C pairs on the existing bench route. But Scenarios A, B, and C all run on **Jalan China**, where ambient traffic is hardcoded off (`closed: (name) => name === 'Jalan China'` in `Life.ts#L117`) and where chunk `-1_-1` / `-2_-1` aren't in the primary view! Add a central-city loop scenario (Main Bazaar → Gambier → India Street → Mosque → Padungan) in N2-M0 so the benchmark actually measures traffic, walkers, and hero chunks.

### 3. What I Would Add to `PLAN_N2.md`
1. **Spatial Chunking & Distance Unload for `V5Scene` (`src/v5/V5Scene.ts`, `src/v5/controller.ts`)**: Split `V5Scene`'s corridor-wide merged meshes into `64×64 m` block buckets for frustum culling and hide/unload `V5Scene` when the player is `> 750 m` from Old Kuching (`[P1]`).
2. **Harmonize V5 Jalan China and Procedural Chunk Wet Road Shaders (`src/v5/materials.ts` vs `src/world/Materials.ts`)**: Eliminate the harsh diagonal dark/light wet asphalt seam on Jalan China during `?rain=on` (`[R2]`, seen in `final_step_319.png`) and fix the Sarawak River water shader turning pitch-black in daytime rain.
3. **Remove the Two False Overture Houses Blocking Kuching City Mosque (`chunk -2_-1`) & Add Heritage Overrides for GPO, Round Tower, The Pavilion, Waterfront Conical Canopies, and Bobbing Tambang Boats (`[R3]`)**:
   - Widening the City Mosque landmark protection polygon in `src/world/landmarks/cityMosque.ts` takes 10 lines of code and immediately fixes view `08-kuching-mosque`.
   - Adding low-poly conical tensile canopies on the Waterfront, gentle sine-wave bobbing/crossing on the 3 tambang boats, and procedural facades for the General Post Office / Round Tower / Pavilion around Plaza Merdeka closes the most glaring visual gaps in the heritage core.
4. **Close Open-Shopfront Collision & Camera Head-Clipping (`[G3]`)**: Add interior threshold collision walls on recessed V5 shopfronts (`Lee Heng Jewellers`, `Winnie's Cafe`) so players cannot walk inside hollow buildings, and add camera collision pullback so backing into a five-foot-way pillar doesn't clip inside the player's skull.
5. **Fix `375×812` & Desktop HUD Overlaps, Quality-Toggle Chunk Wipe, and Save-State Player Coordinates (`[G4]`)**: Fix the CSS overlaps (`#speedo` vs `#car-prompt`, `#wallet` vs `#perf-overlay`, Phone modal vs `#topbar`), persist player walking `(x, z, yaw)` in `save.ts`, and update quality presets in-place without `chunks.clearAll()` where detail radii haven't changed.
6. **Build-Time Chunk Context & Cache-Busting Data Hash (`[R3]`, `[E1]`)**: Compute `kampung`, `majorDist`, and `waterDist` with a 100 m margin across chunk borders in `tools/generate-world/build.ts` (so building types don't flip at 256 m chunk lines), move `patchHeroData` / `ROAD_WIDTHS` out of runtime `ChunkManager.fetchChunk` into `build.ts`, and append `?v=${manifest.hash}` to chunk/data URLs.

### 4. What I Would Drop or Simplify in `PLAN_N2.md`
1. **In N2-M3, Simplify "Wet Roads Reflect Lit Signs"**: Do **not** add planar reflection passes, screen-space raymarched reflections (SSR), or multi-sign per-fragment loops on Low/Medium presets—mid-range Android GPUs are fill-rate bound. A pre-baked per-street warm vertex colour tint on the road ribbon scaled by `uWet * uNight` achieves 90% of the visual warmth at zero fragment cost.
2. **In N2-M4, Keep Kerb/Drain Physics Analytic Rather Than Geometry-Driven**: Do **not** add thousands of 13 cm kerb segments to `CollisionWorld.walls` (which would bloat `boxContact` and `resolve` queries on mobile). Instead, compute kerb bump impulses analytically inside `VehiclePhysics.ts` using the lateral offset from the current road edge already provided by `RoadQuery.ts`.

---

## Top Three Changes If I Could Make Only Three

If you could ship only three changes next, these three will transform Kuching 3D the most for both a first-time player and a mid-range Android phone:

1. **Unify the First 2 Minutes of Street Life (Takeable Street Cars + Walkers in Main Bazaar & India Street + Visible Job NPCs & Real Shop Names)** (`[G1] + [R1] + [G2]`):
   Convert the 30+ static baked cars on Jalan China, Carpenter Street, Main Bazaar, Gambier, and India Street into driveable `Play` vehicles; unblock five-foot-way walker runs and add central walkway routes down India Street Pedestrian Mall; and spawn a waving passenger/customer figure at job markers named after real nearby `places/*.json` shop signs (`"Chong Choon Cafe"` instead of `"a restaurant"`).
2. **Clamp the Mobile Triangle & Memory Ceiling (Spatially Bucket & Distance-Unload `V5Scene`, Add `'low'` LOD to Hero Landmarks/Districts, and Cut the Duplicate `casual-character.glb` Download/Bake)** (`[P1] + [P2] + [P3]`):
   Split `V5Scene` into frustum-cullable `64×64 m` blocks that unload beyond view distance, add `'low'` detail branches to `cityMosque.ts` and distance-cull `IndiaStreetMesh` stalls / `GravesMesh` headstones so no chunk exceeds 50k triangles, and pre-bake the walker VAT offline so phones don't download and CPU-bake a second 415 KB character GLB at boot.
3. **Make Night, Rain, and Data/Licence Claims Respect Reality (3D Lamp Falloff on Walls/Cars/Walkers + Roof-Occluded Rain + Seamless V5/Chunk Wet Asphalt + Honest Credits Modal)** (`[R2] + [D1]`):
   Illuminate vertical shophouse walls, cars, and walkers within 14 m of streetlamps; mask rain streaks under five-foot-way arcades and the India Street canopy; unify the wet road shader across Jalan China and procedural chunks; and ship the in-game Credits & Licences modal alongside accurate Overture building copy in `index.html`.
