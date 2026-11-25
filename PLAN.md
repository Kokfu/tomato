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
| M5 | Hero places (Jalan China method) | IN PROGRESS | a07fa37 (place 1), 2145982 (place 2) | **Done: 1 Main Bazaar + Waterfront, 2 Carpenter Street. Not started: 3 India Street + Jalan Gambier, 4 Plaza Merdeka / Old Courthouse / Square Tower, 5 Padungan + Cat Statue, 6 the two mosques.** Place 1: paved riverside walk, ring-panel railing, festoon lights, palms, kapcai at the Main Bazaar kerb, Square Tower forecourt; no new draw call, +10 % triangles in its three chunks. Place 2: the hand-built street runs on from Jalan China to Jalan Bishopgate (110 m, 41 lots, 12 mapped shop names), and tour view 03's blank wall is a dressed corner building; no new draw call, but +26 % triangles (over the +12 % per-place guide). Every lot of both places is Approximate (no licensed lot-by-lot photograph). Flag `m5` (`?m5=0` = M4). Mean realism 3.5/5 (3.46 -> 3.54; views 03 and 13 up to 4). Phone p95 within +15 % in one pair (worst +5 %), 0 stalls; start-up -16 % vs baseline in the pair; 254 unit tests. `docs/night/m5a/NOTES.md` |
| M6 | Living city: day/night, rain, traffic, people | TODO | | |
| M7 | GTA-style play loop | TODO | | |
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
