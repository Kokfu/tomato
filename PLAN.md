# Kuching 3D: overnight plan (night 1, 2026-11-25)

**Goal.** Make the *whole city* look and feel like Kuching, not just Jalan China, and move toward GTA-style play.
The game stays in the **browser**: TypeScript, Three.js and Vite, a static site, and it must stay playable on a mid-range Android phone.

**Rules for the agent running this plan**
1. Work the milestones **in order**. A milestone is done only when its *Done when* list is true and it has been committed.
   If something truly blocks a milestone (it can't be done without the owner), write the blocker in the Decision log,
   do the parts you can, mark it `PARTIAL`, and go on. Never skip a milestone silently.
2. Decide yourself; don't wait for the owner. Choose what most improves what a player **sees and does in the first 10 minutes**
   within the budgets below, and record each real choice in the Decision log (one line: choice, reason).
3. Close every milestone with the `kuching-milestone` skill: verify, take tour screenshots, update the Status table, then commit.
   Commit locally on branch `night/city-realism-1`. **Never** push, deploy, touch `main`, delete branches or worktrees, or
   rewrite history.
4. Skills to use: `kuching-verify` (tests and perf), `kuching-city-tour` (before/after screenshots and critique),
   `kuching-district` (hand-built hero places, the way Jalan China was made), `kuching-milestone` (close-out).
5. Honesty rules for the data:
   - Plausible *generic* detail is fine: window patterns, roof types, colours, signs with category words only ("KEDAI RUNCIT", "RESTORAN").
   - Never invent a business name, a house number or a landmark's form.
   - Anything inferred stays listed in `docs/LIMITATIONS.md`.
6. Licences:
   - Only CC0, CC-BY or CC-BY-SA assets and reference photos, each recorded in `docs/ASSETS.md` or
     `public/reference/manifest.json` with source and licence.
   - No Google Street View, no Google 3D Tiles imagery, no ripped game assets.
7. One browser/GPU run at a time. Subagents may research references or review diffs, but must not run browsers at the same time as you.

## How the night runs (orchestrated)
An orchestrator session starts **one worker session per milestone** (M5 and M6 are split into parts), one after another, all in
`C:\New Project Kuching` on `night/city-realism-1`. Only one worker writes code or uses the GPU at a time.
- **Sonnet 5.5, Medium:** M0 baseline, M1 merges, M8 docs, and the reference research
  (`docs/night/refs/`, read-only, can run alongside).
- **Fable 5.2, High:** M2, M3, M4, M5, M6 and M7 (graphics, simulation and gameplay).
- A worker does **only its milestone**, closes it with `kuching-milestone`, and ends its turn with a one-line result.
- **Context rule:** if a worker is auto-compacted, or sees it can't finish in its remaining context, it commits finished
  work, writes `docs/night/<m>/HANDOFF.md` (done, next steps, files, gotchas; under 40 lines), and ends with `HANDOFF`.
  The orchestrator then starts a fresh worker from that file.

## Budgets (measured against the M0 baseline, with `kuching-verify`)

| Measure | Limit |
|---|---|
| Desktop 1366x768, Medium: median FPS over the city tour | at least 0.85x baseline and at least 50 |
| Emulated phone (Low, 4x CPU, `drive-bench --mobile --quality=low --cpu=4`) | 0 compile stalls over 200 ms; p95 frame time at most baseline +15 % |
| Start-up time to `__k3d.ready` (`load-probe`) | at most baseline +20 % |
| Average chunk JSON size / triangles per chunk | at most +35 % / +60 % of baseline (prefer instancing and shared materials) |
| New downloads (textures, models) | at most 8 MB total, KTX2/WebP where possible |
| Tests | `npm run typecheck` clean; `npm test` all pass; e2e specs touched by the milestone pass |

## Status

| # | Milestone | Status | Commit | Notes |
|---|---|---|---|---|
| M0 | Baseline and city tour gate | DONE | 2232f94 | 87 tests, load 5.0 s, phone p95 A/B/C 88/74/73 ms; mean realism 2.3/5 |
| M1 | Integrate finished experiments | DONE | 43dcee5 | v9, ux1, c1 and character picker merged and ON by default (`?name=0` turns one off); phone p95 A/B/C 78/54/51 ms, load 4.9 s, 222 unit tests |
| M2 | Citywide atmosphere, light and ground | DONE | 5e09d43 | haze to the chunk edge, sun for 1.56 N, photo-textured ground, shared asphalt, rain-tree avenues, silty river; mean realism 2.9/5; phone p95 A/B/C 75/82/72 ms vs 88/87/75 in the same (loaded) session, re-measure at M3; load +10 %; 227 unit tests |
| M3 | Buildings everywhere | DONE (with M3b) | 5c68ce3 + 7b1ec7d | every footprint is one of 11 typed Kuching buildings (atlas facades, roof forms, palettes, varied heights), no new draw calls or downloads; mean realism 3.3/5; phone p95 within +15 % in one quiet pair (cold A/B/C 79/87/85 vs 80/83/79 ms), 0 stalls; 235 unit tests. **Not met:** start-up +37 % vs baseline (limit +20 %; M3 itself +7 % over M2): profile start-up before M4 adds more. View 03's slab is the section's own wall (M5). **M3b** fixed start-up: ready 4.8 s vs baseline 5.7 s (-16 %), and the 6 s freeze right after `ready` (baseline too) is gone: `docs/night/m3b/NOTES.md` |
| M4 | Streets everywhere | DONE | 2f7e548 | kerbs, footpaths, open drains with slab covers, lane / edge / stop lines, median kerbs, 17 mapped zebra crossings, 42 box junctions, 32 mapped bus stops, lamps on every street, generic road signs; no collision added; mean realism 3.5/5; phone p95 within +15 % in one quiet pair (worst +10 %, warm block loop), 0 stalls; start-up -15 % vs baseline; 243 unit tests; driving and GPS e2e specs repaired (failing since M1) and passing. M3b commit: 7b1ec7d |
| M5 | Hero places (Jalan China method) | DONE | a07fa37 (place 1), 2145982 (place 2), 909bc1d (place 3), ede7761 (place 4), 46339d5 (place 5), f41c9db (place 6) | **All six places are built:** 1 Main Bazaar + Waterfront, 2 Carpenter Street, 3 India Street + Jalan Gambier, 4 Plaza Merdeka / Old Courthouse / Square Tower, 5 Padungan + cat statues, 6 City Mosque + floating mosque. Place 1: paved riverside walk, ring-panel railing, festoon lights, palms, kapcai at the Main Bazaar kerb, Square Tower forecourt; no new draw call, +10 % triangles in its three chunks. Place 2: the hand-built street runs on from Jalan China to Jalan Bishopgate (110 m, 41 lots, 12 mapped shop names), and tour view 03's blank wall is a dressed corner building; no new draw call, but +26 % triangles (over the +12 % per-place guide). Every lot of both places is Approximate (no licensed lot-by-lot photograph). Flag `m5` (`?m5=0` = M4). Mean realism 3.5/5 (3.46 -> 3.54; views 03 and 13 up to 4). Phone p95 within +15 % in one pair (worst +5 %), 0 stalls; start-up -16 % vs baseline in the pair; 254 unit tests. `docs/night/m5a/NOTES.md`. **Place 3:** India Street has shops on both sides (74 lots, bright paint, walkable five-foot ways), a fabric canopy on 14 columns, diamond paving, 35 stalls, flags and 17 mapped shop names; Jalan Gambier has parked cars and kapcai; no new draw call, but its small chunk grew 70 % (over the +12 % guide). **Place 4:** the Square Tower (corner turret) and the Old Courthouse clock tower have their photographed forms; Plaza Merdeka has an entrance (form Approximate: no photograph); chunk +3 %. Every India Street lot and all of Jalan Gambier are Approximate. Mean realism 3.7/5 (3.54 -> 3.68; views 04 and 06 up to 4). Phone p95 within +15 % in one pair (worst +8 %), 0 stalls; start-up -23 % vs baseline; 264 unit tests. `docs/night/m5b/NOTES.md`. **Place 5:** tour view 07's statue is the Cat Column (identified by the mapped Everrise store behind it in the photograph) and now stands on its island; the white Great Cat sits at the east end in front of the Chinatown gate, which is open now (it was a solid building across both carriageways); 197 Padungan lots in strong paint with fascia boards and kapcai; chunks +0.7 to +9.5 %, two draw calls. **Place 6:** the City Mosque in its photographed form (pink, gold onion domes, four minarets, entrance canopy; layout Approximate) with 332 rule-placed graves in the mapped cemetery, and the floating mosque rebuilt to its one (night) photograph with a single minaret (colours Approximate); chunk -2_-1 +65 % (over the +12 % guide). Every Padungan lot and every grave is Approximate. Mean realism 3.8/5 (3.68 -> 3.82; view 08 up to 4, view 07 to 4.5). Phone p95 within +15 % in one pair (worst +3 %; a quiet machine, both builds twice as fast as in M5b's pair), 0 frames over 100 ms; start-up -13 % vs baseline; 273 unit tests. The bench still runs round Jalan China only. `docs/night/m5c/NOTES.md` |
| M6 | Living city: day/night, rain, traffic, people | DONE | 6723299 (part A), ddc8a87 (part B) | **Part B (traffic and walkers), flag `life` (`?life=0` = part A):** cars and kapcai with riders drive on the left of every street that leads on (not service roads, dead ends or Jalan China), keep to one-way directions, wait at mapped signals, give way at junctions and brake for the player, the player's car and walkers; walkers use the footpaths, footways and five-foot ways. Head, tail and brake lamps and a patch of light on the road at night. Drawn instanced: one mesh per vehicle kind, ONE for all walkers (the shipped character's walk cycle baked into a texture), 4 draw calls on the phone, 6 on Medium; 8 vehicles and 9 walkers on Low, 18 and 22 on Medium, 26 and 34 on High. No asset, data file or download added; no program compiled during play (e2e-checked). Mean realism 4.0/5 (3.82 -> 3.96; views 01, 05, 09 and 13 up half a point). Phone: +5 to +11 % p95 frame time (+2 to +13 % mean) measured by switching them on and off in one page at three places; **the bench pair itself was not conclusive** (the machine's speed swung two-fold all session); triangles +46 % vs baseline (limit +60 %); start-up -10 %; 295 unit tests, 39 e2e. **Not done:** the player's car drives through ambient vehicles (M7), signal heads do not change colour, India Street and Main Bazaar have no walkers, and the streets are still thin (one car in a trunk-road frame). `docs/night/m6b/NOTES.md`. **Part A (day/night and rain):** The day passes (13 min 25 s a day, from 09:40; Settings: Passing / Day / Evening / Night, remembered), with sunrise, dusk, stars and a moon. At night: windows lit by bay, lit shops and name boards, lamp heads with a pool of light under each, lanterns and a warm street in Jalan China, every landmark floodlit (the DUN roof most), lights on the river, headlights for the driven car. Occasional rain (Settings: Sometimes / Off / Raining): closed sky, haze, wet shining roads, puddles with drop rings, streaks in one draw call, synthesised rain and thunder. All of it is uniforms on the existing materials: no draw call, program, download or data file by day, one draw call per near chunk at night, no program compiled when night or rain begins (e2e-checked). The day tour is unchanged: mean realism 3.8/5 (night set 3.5, rain set 3.5, scored separately). Phone p95 vs baseline -12 % to +1 % in the final pair, 0 frames over 200 ms; night with rain within -5 to +3 % of its own day run; start-up -14 %; 282 unit tests, 36 e2e. Measuring took several pairs (the machine's speed drifted, and one real fault, a rain-sound cost that grew with time, was found and fixed): `docs/night/m6a/NOTES.md`. Not built: light that falls on walls or casts shadows, wet walls, rain stopped by roofs, lightning. M5 close-out commit: 65fcecb |
| M7 | GTA-style play loop | DONE | 2721c9b (vehicle kinds, engine), 9265be1 (jobs, phone, money, collisions, save), close-out: this commit | **Flag `m7` (`?m7=0` = the N1-M6 game).** A player can walk up to a parked car, kapcai, taxi or pickup and take it (the one they had stays behind; each kind handles differently; one of each stands 30 m from the first car, the rest beside service roads citywide, placed by rule and drawn in the traffic's meshes with no draw call of their own). The phone (T, or its button) offers food deliveries (any vehicle) and taxi fares (the taxi) between real mapped places named by kind and street only, led by GPS to the pick-up and the drop-off; fare and tip go into the wallet. The driven vehicle collides with ambient and parked vehicles: pushed out, paint dulled by damage, power lost past half; a struck driver stops and hoots; H is the horn; the phone's garage repairs for money. Money, jobs done and the vehicle with its place are saved in localStorage (wrapped, validated). All of it works by touch. **Done when: met.** A new player finishes a food delivery in an e2e test on desktop (`m7-play.spec.ts`, with save, reload and a damaged save) and on the emulated phone by touch (`m7-play-touch.spec.ts`). 315 unit tests (20 new); e2e m7-play (3), m7-play-touch, m6-life, driving, gps, shader-prep, gameplay, touch-drive pass. Mean realism 4.0/5 (3.96 -> 4.00; view 09 up half a point for the parked vehicles). Phone: M7 on/off in one page -3 / -5 / +6 % p95 at three places (limit +15 %); **the two bench pairs were not conclusive** (0 to +26 % against the baseline and against the M6b build, the same build differing by up to 36 % between runs); no program compiled in any run; triangles +49 % vs baseline (limit +60 %). **Not met in this session: start-up to `ready` reads +28 to +41 % against the baseline build (limit +20 %), for the M6b build too (+33 %); M7 itself is -6 to +6 % against M6b. Unexplained: re-measure in M8.** Ready + first frames -30 %. **Not done:** the hand-built streets' parked cars cannot be taken, nobody is drawn at a pick-up or drop-off, walkers are not hit, nothing deforms. `docs/night/m7/NOTES.md` |
| M8 | Polish, docs, final report | TODO | | |

## Milestones

### M0: Baseline and city tour gate
- Create branch `night/city-realism-1` from `v5-rendering-experiment` (`1e16c25`), then commit this file and `FABLE_PROMPT.md`.
- Run the baseline with `kuching-verify`: typecheck, unit tests, a production build, perf baselines into `docs/night/baseline/`.
- Build the city tour (see `kuching-city-tour`): `tools/dev/city-tour.json` with **14 fixed eye-level views**:
  - Waterfront, Main Bazaar, Carpenter Street, India Street, Jalan Gambier, Plaza Merdeka, Padungan + cat statue,
    Kuching Mosque, Satok, The Spring area, a residential Overture-only area, a trunk road, a river view across to the DUN,
    and Jalan China as the control.
  - Capture desktop and phone shots into `docs/night/m0/`.
- Write `docs/night/m0/CRITIQUE.md`: for each view, the three worst problems in order of what a player notices first.
  This list drives M2–M5.
- **Done when:** baseline numbers and 28 tour shots are committed, and CRITIQUE.md exists.

### M1: Integrate finished experiments
- Merge into the night branch:
  - `integration/dev-preview-1` (V9 Main Bazaar arcade, sign fix, UX1 guide, flag registry)
  - `experiment/char-p5` (6-character picker, owner-accepted 2026-11-24)
  - `experiment/c1-upper-china` (Upper China Street)
- Do **not** merge `experiment/omb-gps`: its G1 data freeze blocks `data:*` regeneration, which M3/M4 need.
  Note it in the Decision log.
- Turn each merged feature **on by default** if it passes `kuching-verify` and the phone budget. Otherwise keep its flag and say why.
- Watch for CRLF files when resolving conflicts (`src/main.ts`, `src/styles/main.css`, `src/world/ChunkManager.ts`).
- **Done when:** merged, defaults decided, tests green, and tour shots show the merged features.

### M2: Citywide atmosphere, light and ground
- Make the default world (outside the V7 section too) share the section's look:
  - tone mapping and colour grading
  - a tropical sky and humid haze or fog that hides the chunk edge
  - sun angle for 1.5° N
  - shadows by quality tier
  - better water (river colour, reflections, wake at the bank)
- Ground:
  - textured asphalt, laterite and red earth, tropical grass, concrete aprons; no flat colour fields
  - land-use edges blended
  - more and varied tropical trees (rain trees, palms, frangipani), instanced
- There must be no visible seam between the section and the rest of the world.
- **Done when:** M0's atmosphere and ground critique items are fixed in the tour shots, and budgets hold.

### M3: Buildings everywhere
- Replace grey boxes and flat extrusions with a **typed building generator**. Classify each building by OSM tags,
  footprint size and shape, and the land use around it:
  - kampung stilt house
  - terrace or link house
  - 1960s–90s concrete shophouse block
  - modern mid-rise or office
  - mall
  - warehouse
  - school or civic
  - worship
- Each type gets:
  - its own facade atlas (windows, grilles, air-conditioner units, balconies)
  - a roof form (zinc pitched, hipped tile, flat with water tank)
  - a colour palette from Kuching
  - plausible height variation
- Use instancing and shared atlases; keep LOD for distant chunks.
- Overture buildings no longer look grey, but OP mode can still highlight "machine-detected" (the honesty rule).
- Regenerate data with `npm run data:build` if needed (`data-src/` is cached locally); run `npm run data:validate` afterwards.
- **Done when:** no tour view shows a plain box building near the camera, budgets hold, and the unit tests cover the classifier.

### M4: Streets everywhere
- Generate from road class and OSM data:
  - sidewalks and kerbs
  - Kuching's open monsoon drains with slab covers
  - lane markings, stop lines and junction boxes
  - zebra crossings where mapped
  - street lamps (mapped first, otherwise spaced)
  - traffic signals at mapped `highway=traffic_signals`
  - bus stops
  - roadside trees, bollards and signboards with generic text
- Collision for kerbs and drains must not break walking or driving; run the driving e2e and GPS specs.
- **Done when:** every tour street view has kerbs, drains, markings and furniture, and the driving and GPS tests pass.

### M5: Hero places (Jalan China method, `kuching-district` skill)
Do each as its own commit, in this order, as far as the night allows:
1. Main Bazaar frontage + Waterfront promenade (with the V9 arcade)
2. Carpenter Street (the rest of it)
3. India Street pedestrian mall + Jalan Gambier
4. Plaza Merdeka, Old Courthouse, Square Tower
5. Padungan shophouses + Cat Statue
6. Kuching City Mosque + Floating Mosque

Each place needs:
- licensed references
- verified / approximate labels per lot
- a before/after comparison
- its own perf check

**Done when:** at least places 1–3 are done to Jalan China standard; the rest are listed in the Status notes.

### M6: Living city
- Continuous day/night cycle (a setting to freeze it):
  - lit windows and street lamps at night
  - neon shop signs
  - the river and the DUN lit at night
- Tropical rain:
  - wet road reflections, puddles, rain particles, sound
  - occasional, and switchable in settings
- Ambient traffic on `drive-graph.json`:
  - cars and motorbikes keep to the left, follow one-way rules, stop at signals and junctions
  - they brake for the player and for pedestrians
  - spawn and despawn around the player, instanced
- Pedestrians citywide on sidewalks, cheap and instanced, reusing the existing characters.
- **Done when:** the tour shows traffic and people outside Jalan China, night and rain shots exist, and the phone budget holds
  (lower density on Low).

### M7: GTA-style play loop
- Enter any parked car, and add 3–4 vehicle types: hatchback, kapcai motorbike, taxi, pickup.
- A mission system with taxi fares and food deliveries to real Kuching places (by category only), guided by GPS.
- Money HUD and a phone-style menu.
- Save and load progress in localStorage, wrapped in try/catch.
- Simple collision consequences: damage tint, horn, traffic reacts.
- Works with touch.
- **Done when:** a new player can finish one mission on desktop and on the emulated phone (e2e test).

### M8: Polish, docs and final report
- Update `README.md` (it no longer is a "walking simulator"), `docs/LIMITATIONS.md` and `docs/ASSETS.md`.
- Run the full e2e suite in the background (about 30 min).
- Write `docs/night/REPORT.md`:
  - what changed, per milestone
  - a before/after contact sheet of the tour
  - a perf table against the baseline
  - known issues
  - the recommended next night's plan
- **Done when:** the report is committed and the Status table is complete.

## Decision log
(one line each: date-time, milestone, decision, reason)
- 2026-11-25 M0: tour cameras are first-person, snapped to the nearest mapped road (generator kept in `tools/dev/city-tour-gen.mts`), then frozen; reason: reproducible, never inside water or a wall.
- 2026-11-25 M0: desktop FPS is vsync-capped at 60 in all views, so desktop budget is checked as min fps >= 50 plus calls/triangles; reason: no uncapped baseline signal.
- 2026-11-25 M1: merged integration/dev-preview-1, experiment/char-p5, experiment/c1-upper-china (no conflicts); did NOT merge experiment/omb-gps, its G1 data freeze blocks `data:*` regeneration that M3/M4 need.
- 2026-11-25 M1: v9 arcade, sign fix (part of dev-preview), UX1 guide, character picker and C1 Upper China are ON by default in a browser; `?v9=0`, `?ux1=0`, `?c1=0`, `?char=0` restore the old behaviour; reason: all passed unit, e2e and the phone budget (p95 A +10 %, B and C better, start-up +6 %, no compile stall over 200 ms).
- 2026-11-25 M1: defaults live in `src/flags.ts` (one registry); with no `location` (node tests, tools) everything stays off so tables keep their V8.6 values; `?lab=1` is a harmless alias now.
- 2026-11-25 M1: e2e helper `start()` and tools (drive-bench, load-probe, shots) seed `k3d.character=man` so the first-launch picker does not block them; specs that test the "no flag" game now use `?char=0`.
- 2026-11-25 M2: haze = one fixed exp2 density (0.0012) plus a ramp that closes at the streamed edge, by radial distance, and the fog colour is tone-mapped like the surface it covers (patched three.js fog chunks); reason: the chunk edge showed and fog never matched the sky.
- 2026-11-25 M2: sun direction comes from solar geometry for 1.56 N on 15 April, 09:40 (evening 17:15); reason: correct for the latitude, and a sun just north of east still lights the river-facing Main Bazaar fronts.
- 2026-11-25 M2: ground = the chunk's land-use hue map plus three CC0 photographs laid in world space; aprons, road shoulders and rough grass are painted by rule; reason: no data regeneration, no chunk JSON growth, cheap on a phone.
- 2026-11-25 M2: every road uses the Jalan China asphalt photograph at the same lay; world materials stay Lambert; reason: no seam at the section, and PBR citywide would break the phone budget.
- 2026-11-25 M2: trees are mostly inferred (roadside avenues, lot trees), without collision; far chunks merge 8-triangle crowns into their wall mesh and Low bakes a chunk's trees into one mesh; reason: tree cover to the horizon at no draw-call cost on phones.
- 2026-11-25 M2: phone bench ran three times, not one pair: the first pair showed B/C over +15 %, the fix (Low tree bake) needed a second pair, and that pair ran on a loaded machine; reason: the only valid comparison is in-pair. Result kept as DONE with a re-measure owed at M3.
- 2026-11-25 M2: cut frangipani as its own form, true water reflections and a boat wake; reason: time, and no tour view looks along the river.
- 2026-11-25 M3: building type is decided at runtime from the chunk data (kind / arch class from OSM tags first, then footprint size and shape, land use, distance to main roads and the river bank, "Kampung" street names); reason: 88 % of footprints carry no tags, and it needs no data regeneration and no chunk JSON growth.
- 2026-11-25 M3: one painted atlas of full-width rows (two bays by one storey, repeating along U) with a tint mask in alpha, and all typed geometry merged into the chunk's existing wall and roof meshes instead of InstancedMesh props; reason: draw calls are the phone's limit, and this adds none.
- 2026-11-25 M3: default heights from the data are replaced by a varied storey count per type (mapped heights and civic / worship buildings keep theirs), and collision uses the drawn height; reason: every street was a level row of boxes.
- 2026-11-25 M3: machine-detected footprints are drawn like any other building; they stay distinguishable on the map (M / OP mode) and the inference is documented in LIMITATIONS.md; reason: the plan asks that Overture buildings no longer look grey.
- 2026-11-25 M3: unregistered places of worship are plain halls with round-headed windows; reason: a landmark's form is never invented.
- 2026-11-25 M3: marked PARTIAL, not DONE: the start-up budget is missed (+37 % vs the M0 baseline in an alternating 4-run pair). M3 adds about +7 % over the M2 build; M2's own +10 % reading did not reproduce. Visual goals and the phone budget are met.
- 2026-11-25 M3: cut car porches and fences, modelled air-conditioners, a recessed five-foot way on generic shop blocks and a second bench pair; reason: time, and the brief asked for one pair.
- 2026-11-25 M3b: start-up was shader programs, not chunk work: the default rendering is now set up first and nothing is drawn behind the loading screen, so each program compiles once, in the background; `ready` now waits for them (it used to precede a 6 s frozen frame, on the baseline too). Start-up is compared on `ready` and on ready + first frames (`load-probe` `interactiveMs`).
- 2026-11-25 M3b: opaque alpha is dropped from the section's landmark models' vertex colours; reason: RGBA colours made three.js compile a second copy of 15 large programs.
- 2026-11-25 M4: kerbs, footpaths, drains, slab covers, lane lines and stop lines are built at run time from road class and width (`src/world/StreetEdges.ts`) into the chunk's existing road and structure meshes; reason: no chunk JSON growth and no new draw call. Only point items (crossings, bus stops, box junctions, sign boards, lamps) are data, regenerated with `npm run data:streetscape` alone.
- 2026-11-25 M4: kerbs and drains have no collision (tallest part 0.13 m, drain drawn 0.1 m deep and shaded to read deeper); reason: the brief's first rule was not to break walking or driving, and the driving and GPS specs stay untouched. Feet sink 0.13 m into a footpath: logged in LIMITATIONS.md.
- 2026-11-25 M4: layout by class: main roads get kerb + 1.6 m footpath + drain behind it, residential and old-town streets the drain at the road edge, service roads a low kerb only; the black-and-white median kerb only where two one-way main roads run side by side in opposite directions.
- 2026-11-25 M4: bus stops were fetched from OpenStreetMap once (36 nodes, `tools/extract-map-data/fetch-street.ts`, cached in `data-src/`) instead of being invented; no street lamp is mapped here, so all lamps are spaced by rule (now on unnamed streets too).
- 2026-11-25 M4: sign boards carry generic Malaysian signs only (speed by road class, BERHENTI, AWAS, BAS, crossing); they cost one small texture, one program and one draw call per chunk, and the Low preset draws none of the plates.
- 2026-11-25 M4: fixed two older faults found by the review: lamp arms lay along the road, and signal lenses faced away from the lane beside them. Also fixed the driving and GPS e2e specs, which had failed since M1 because the first-launch character picker took their key presses (they were not run in M1-M3).
- 2026-11-25 M4: cut roadside trees (done in M2), mapped lamps (none exist), lane counts from `lanes=*` (not in the chunk files), footpath collision and real drain depth; reason: scope and the no-regression rule for driving.
- 2026-11-25 M5 (places 1-2): one flag `m5` covers the hero places of this milestone, on by default, `?m5=0` = the N1-M4 rendering; reason: before/after from one build, and the node unit tests keep their pinned tables.
- 2026-11-25 M5 place 1: the Waterfront kit (paved walk, ring-panel railing, festoon lights, palms, bins, kapcai, Square Tower forecourt) is merged into meshes the chunks already have; reason: no draw call, material or shader program added. Its forms follow the V3 review's written reading of three Commons photographs; no new photograph was downloaded this session (a download needs the owner's say-so), so dimensions, colours and positions are Approximate and the swirl mosaic is a ring-medallion stand-in.
- 2026-11-25 M5 place 1: tensile canopies, food kiosks and the Square Tower's own form were left alone; reason: no verified form (the tower is hero place 4).
- 2026-11-25 M5 place 2: Carpenter Street east of Jalan China is built as more rows of the existing hand-built section (same kit, materials, lighting), not as a new renderer; reason: Jalan China standard with no new material or shader. Cost: the section is one mesh per material and is always drawn whole, so it is +86 k triangles in every old-town view (+26 % for the place, over the +12 % guide); a separate mesh set was measured (+15 to +19 draw calls) and rejected because draw calls are the phone's limit.
- 2026-11-25 M5 place 2: the carriageway is laid on the middle line between the mapped frontages (8.9 to 7.7 m apart), not on the mapped centre line (3.6 m from the north frontage); lots step with the terrain (0.9 m along, up to 0.7 m across) and the 5 m neck at the Jalan China corner, a mapped-outline error, was kept as mapped.
- 2026-11-25 M5 place 2: tour view 03's slab was the corner lot's bare side wall; it is dressed as a side elevation (doors, barred window, dado, tiled pent roof) instead of being given a five-foot way, because only 5 m separate the mapped blocks there. Its collision starts 0.3 m behind the face so that a car on the mapped centre line (0.6 m from the wall) is not stopped; parked cars stand at the south kerb only for the same reason.
- 2026-11-25 M5 place 2: boards show a shop name only where an OpenStreetMap node gives one (12 lots); 13 others carry a trade word ("KEDAI EMAS", "KEDAI KOPI", ...); all 41 lots are labelled Approximate.
- 2026-11-25 M5 place 3: India Street is mapped as a pedestrian area, not a way, so the data pass had given its blocks no frontage on it (blank side walls and a 12 m default block). The chunk's building list is rewritten when it is loaded, under the `m5` flag, instead of regenerating the data; reason: `?m5=0` still shows the before, and no data file changes.
- 2026-11-25 M5 place 3: the north block is one mapped outline along a street that climbs 3 m, so its street side is cut into seven 14 m deep pieces, each with its own floor level, and the rest of the block is drawn two storeys high; reason: one level row would bury its east end by 1.5 m, and the photographs show two storeys (the 12 m in the data was a default).
- 2026-11-25 M5 place 3: the canopy cloth is drawn in the lane-marking mesh (unlit, no shadow), its steel in the structure mesh; reason: no new material or draw call, and an opaque lit roof would have put the whole mall in hard shadow. Cost: it will not darken at night until M6 handles it.
- 2026-11-25 M5 place 3: boards on India Street show mapped businesses only (17, from OpenStreetMap and Overture), hung on the nearest lot of the street frontage; twelve mapped house numbers were not fitted to lots. Jalan Gambier has no photograph: parked cars, kapcai and blinds by rule, all Approximate. Chunk -1_-1 grew 70 % (27 k to 47 k triangles), over the +12 % guide: accepted, because it was the lightest old-town chunk and no draw call was added.
- 2026-11-25 M5 place 4: the Square Tower's central tower (in the model since V2) was wrong: both photographs show a turret at one corner. The model was rebuilt to the photographs and the old one kept only for `?m5=0`. Which mapped face is the front is inferred from the front photograph's background.
- 2026-11-25 M5 place 4: Plaza Merdeka has no licensed photograph, so only an entrance was added (generic portal, canopy, forecourt, the mapped name), on the face that a mapped drop-off lane and footway lead to; the mall's own form was left alone. The General Post Office (a usable photograph exists), Round Tower and The Pavilion were not built; reason: time.
- 2026-11-25 M5 places 3-4: the phone bench pair runs round Jalan China only; no scenario passes the new places (India Street is pedestrian). Their cost is reported as chunk triangles and tour numbers instead.
- 2026-11-25 M5 place 5: the statue of tour view 07 (OSM node 2404396149, landmark `cat-statue`) is the Cat Column, not the white cat the brief expected: the Everrise store mapped 30 m from the node stands behind the column in its photograph. The white Great Cat is node 4332185093 at the east end beside the mapped paifang. Both were built; a third mapped cat statue has no photograph and was not.
- 2026-11-25 M5 place 5: the Chinatown paifang's mapped outline lies across both carriageways and was drawn and blocked as a solid building. It is an open gate now: its four piers stand 0.5 m outside where the two mapped carriageways cross the outline, and only they block. "SELAMAT DATANG" is shown because it is legible in the photograph; the Chinese inscriptions are not reproduced.
- 2026-11-25 M5 place 5: the Padungan rows are a table of mapped frontage edges within 12 m of the ways named Jalan Padungan (22 blocks, 197 lots; recomputed by a unit test), restyled through the same lot hook as India Street. No parked cars: the carriageways are mapped 6 m wide and a kerbside row would leave a driven car 0.2 m; kapcai stand only where the frontage is far enough back.
- 2026-11-25 M5 places 5-6: statues, gate and City Mosque are landmark models (one mesh each) registered only when the `m5` flag is on, so `?m5=0` still draws the generic buildings; a landmark can now be triggered by a chunk key (the Cat Column is mapped as a point, not a footprint).
- 2026-11-25 M5 place 6: the City Mosque's photographs give the number and order of its domes and minarets, not a plan: four minarets at the outline's diagonal extremes, four small domes round the large one, and the entrance at the outline's round projection are a rule, labelled Approximate.
- 2026-11-25 M5 place 6: the floating mosque is drawn white with slate domes and one minaret, nothing gold: the only licensed photograph in the local set is a night shot, and no new photograph was downloaded (a download needs the owner). The old model's gold domes and two minarets had no source and are kept for `?m5=0` only.
- 2026-11-25 M5 place 6: graves are placed by rule in the mapped cemetery (rows across the direction of Mecca, no collision), cut from 437 at 44 triangles to 332 at 22 after the chunk more than doubled; chunk -2_-1 still grew 65 %, accepted like India Street's chunk because it was light and no draw call was added for them.
- 2026-11-25 M5: marked DONE with all six places built. The phone pair again runs round Jalan China only (no scenario reaches Padungan or the mosques); it was run once, on a much quieter machine than the M5b pair, so its absolute numbers are not comparable with earlier milestones.
- 2026-11-26 M6 part A: each rendering keeps its own tuned daylight (a "look"), and the hour and the weather only scale and tint it (`src/world/dayCycle.ts`, applied by `WorldManager` every frame); the Jalan China pipeline now hands its look over instead of writing to the lights. Reason: at 09:40 every factor is exactly 1, so the day tour is unchanged, and night works in the default rendering (the old Evening preset had to switch the pipeline off and recompile everything).
- 2026-11-26 M6 part A: a day of play lasts 13 min 25 s (daylight 9 min 45 s, night 3 min 40 s) and starts at 09:40; reason: night falls about six and a half minutes after starting, inside the first ten minutes, and the night is the shorter part because it is the harder one to play in. Settings: Passing / Day / Evening / Night, and Rain: Sometimes / Off / Raining, both remembered.
- 2026-11-26 M6 part A: night and rain are shader uniforms on the existing materials (one shared set, `src/world/env.ts`); no program is compiled when they begin (checked by `tests/e2e/m6-daynight.spec.ts`). Lit windows: a second, two-channel layer of the city atlas plus the bay number carried in the wall's u; far walls draw a plain window grid from world position; the two older shophouse atlases light their glass and shop tiles.
- 2026-11-26 M6 part A: lamp light is a painted fan under each lamp, additive, in one mesh per near chunk whose material is invisible by day (no draw call by day, one per near chunk at night), not real lights or a lamp list in every shader; reason: draw calls and shader size are the phone's limits. Cost: lamp light falls on the ground only. The driven car gets the same kind of patch as headlights.
- 2026-11-26 M6 part A: an automated browser (`navigator.webdriver`) starts on a frozen dry day; `?time=` and `?rain=` override; reason: tests, the tour and the benchmark stay repeatable and comparable with the M0 baseline, which has no cycle. The night and rain shots and one night-and-rain phone bench set them explicitly.
- 2026-11-26 M6 part A: everything about the night is invented and listed in LIMITATIONS.md: which windows are lit, every landmark floodlit alike, seven fixed lights on the river, a full moon every night, random stars. Rain and thunder are synthesised sound; no asset was added.
- 2026-11-26 M6 part A: the phone bench was run in seven pairs. The machine's speed drifted two- to three-fold within minutes (a run of the heaviest mode, night with rain, measured faster than the day run before it), and two interleaved pairs showed the driving scenarios 13 to 28 % over the baseline while a pair against the M5c build showed nothing: the cause was a fault of this milestone's own (the rain sound scheduled audio changes every frame on a sleeping context), fixed before the final pair. All pairs are kept in `docs/night/m6a/perf.json`.
- 2026-11-26 M6 part A: cut: real light sources and lamp light on walls, wet walls and roofs, splashes, rain stopped by roofs, lightning, moon phases, a re-baked night reflection map for the Jalan China section; traffic and pedestrians are part B.
- 2026-11-26 M6 part B: traffic and walkers are two pure simulations (`src/life/traffic.ts` on the drive graph, `src/life/walkers.ts` on the chunk data) and one instanced renderer; reason: unit-testable without a browser (keeping left, one-way, red lights, no overlap are node tests), and draw calls are the phone's limit.
- 2026-11-26 M6 part B: a vehicle keeps a quarter of the mapped carriageway width left of the centre line (the middle on a narrow one-way street) and rounds each junction on a curve between the two lanes; lane counts are not in the data.
- 2026-11-26 M6 part B: ambient traffic keeps out of service roads, covered ways, every street that only leads to a dead end (also by one-way direction) and Jalan China; reason: no turning round in view, and the player's car waits in Jalan China's one free lane.
- 2026-11-26 M6 part B: junction rules are invented: two signal phases by bearing (15 s green, 2 s amber), the larger road class first elsewhere, a permission per junction, a driver who has waited 20 s edges out, and only a real ring of vehicles waiting for each other is broken by letting one through.
- 2026-11-26 M6 part B: walkers are the shipped CC0 Casual Character, its walk cycle baked at run time into a float texture and replayed in the vertex shader: one draw call for all of them, no skeleton each, a coarser copy on Low and Medium; reason: "cheap and instanced, reusing the existing characters". They get a soft patch, not a shadow.
- 2026-11-26 M6 part B: walker routes are the footpath line beside a road (by the N1-M4 street layout), a footway, or the middle of a five-foot way, kept only where the collision world is clear and remembered per chunk; no walk graph is loaded. India Street (an area, not a way) and the Main Bazaar arcades (piers and goods) get none: logged, not solved.
- 2026-11-26 M6 part B: the player's car does not collide with ambient vehicles (they brake for it); the walking player is blocked by the three nearest. Reason: the driving and GPS specs must not meet an obstacle that is not always there; collisions belong to M7.
- 2026-11-26 M6 part B: tests, tour and bench run WITH traffic (it is on in an automated browser too); only `gameplay.spec.ts` "frame-rate independent" uses `?life=0`. The e2e helper ignores the walker model and road graph being aborted by a page reload.
- 2026-11-26 M6 part B: the phone cost is reported from an on/off test in one page (`life-probe.ts --ab`), not from the bench pair: three pairs disagreed by more than the budget because the machine's speed swung two-fold within runs. To stay inside the budget the Low preset draws two vehicle kinds, simulates every second frame and looks up the ground every fourth.
- 2026-11-26 M6 part B: the review subagent's findings were all acted on (queue taken for a deadlock, leaked junction permissions, signals forgotten at chunk borders, stale state on a preset change, a test that could not fail); marked DONE with the thin streets, the missing collisions and the unlit bodies at night listed as known issues.
- 2026-11-26 M6 part B: cut: signal heads that change colour, parked ambient cars, buses and lorries, overtaking and filtering, walkers on zebra crossings, fading in and out, walker shadows.
- 2026-11-26 M7: "any parked car" means the vehicles a rule places for it (beside service roads, where the ambient traffic does not drive, and at some residential kerbs), drawn as more instances of the traffic's meshes; the parked cars of the hand-built streets are part of each street's one mesh and cannot be taken. Reason: no draw call is added, and cutting cars out of those meshes would cost the streets their budget. Logged in LIMITATIONS.md.
- 2026-11-26 M7: taking a vehicle swaps the player's one driven body to that kind where it stands (`Driving.setVehicle` / `adopt`), and the vehicle left behind becomes a parked one; at most three are left about. Reason: one physics body, one chase camera and every existing driving test stay as they were.
- 2026-11-26 M7: four kinds: hatchback (the V8 car, unchanged numbers), kapcai, taxi (the saloon in one plain red with a blank roof sign), pickup (a new generic body). Handling per kind is invented. The kapcai's rider is the traffic's generic figure, not the chosen character.
- 2026-11-26 M7: one of each kind stands on the riverside footpath of Jalan Main Bazaar, 30 m from the first car, at fixed poses found in the running game: the old town has almost no service road. Two earlier places were wrong (the kerb of the median between the two carriageways, then a canopy's floor) and stopped the route-following drivers of the GPS and block-loop tests.
- 2026-11-26 M7: jobs go between real mapped places described by kind and street only ("a restaurant, Jalan Padungan"); `jobs.json` (1,708 places, 19 kB, generated by `npm run data:jobs` from the place files) holds positions and group numbers and no names. Of the game's landmarks only the public ones are named (not the malls, the market or the food court among them). Fares, tips, customers and passengers are invented.
- 2026-11-26 M7: a job's place is reached at the roadside point where the GPS route ends (within 14 m, nearly at rest), also on foot; taxi fares need the taxi, deliveries any vehicle. Three offers at a time: short and near, middling, long. Reason: a new player's first job is under 1.5 km all told, which the e2e drives in two minutes.
- 2026-11-26 M7: the driven vehicle collides with ambient and parked vehicles by box tests in the play layer, not through the collision world; a struck driver stops, hoots and drives on; a driver who is "edging past" pushes the standing player aside without damage. Walkers are not hit. Damage is one number: paint toward soot, power lost past half, a repair for money on the phone.
- 2026-11-26 M7: the three route-following tests of `driving.spec.ts` (block loop twice, high-speed run) now run with `?life=0`: their driver follows a line blind and cannot give way to traffic it collides with. The job tests drive through the traffic.
- 2026-11-26 M7: progress is saved when a job is paid, on a repair and from the phone, not on every exit or page hide; reason: an older test that reloads the page must still find the car where the game puts it. Saved: money, jobs done, the vehicle and its place. Not saved: the job in hand, parked vehicles taken, the player's position.
- 2026-11-26 M7: the review subagent's findings were acted on: a save before the car's area had loaded erased the car; a driver edging past dented the standing player; reset poses and a deck height carried over to the wrong vehicle; a preset change deleted the vehicles left behind; getting out into a parked vehicle; business-named landmarks in taxi jobs; two assertions that could not fail.
- 2026-11-26 M7: cut: a passenger or parcel that is seen, walkers that are hit or jump aside, deforming bodies, smoke, a taxi meter, pickup cargo jobs, buying vehicles, police, taking a vehicle from the traffic, a second save slot.
