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
| M0 | Baseline and city tour gate | DONE | (this commit; hash goes in M1's commit) | 87 tests, load 5.0 s, phone p95 A/B/C 88/74/73 ms; mean realism 2.3/5 |
| M1 | Integrate finished experiments | TODO | | |
| M2 | Citywide atmosphere, light and ground | TODO | | |
| M3 | Buildings everywhere | TODO | | |
| M4 | Streets everywhere | TODO | | |
| M5 | Hero places (Jalan China method) | TODO | | |
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
