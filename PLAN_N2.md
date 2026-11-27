# Kuching 3D: overnight plan, night 2 (trust and roads)

**Goal.** Night 1 (`docs/night/REPORT.md`) took the city from 2.3 to 4.0 of 5 and added GTA-style play. Night 2 makes it
**trustworthy**, and makes the **roads match the real Kuching**: roundabouts, dual carriageways, junctions and working traffic
lights. Roads come first because traffic, parking, jobs and walkers all sit on them (GTA's own order: roads first, then the city).
People, the weakest places, night and rain, and feel follow in `PLAN_N3.md`; buildings follow in `PLAN_BUILDINGS.md`.

**Rules.** The rules, licences, honesty rules, orchestration and context rule of `PLAN.md` apply unchanged, with these changes:
- Branch `night/city-realism-2`, created from `night/city-realism-1`. Results go to `docs/night2/<milestone>/`, the final report to
  `docs/night2/REPORT.md`. Where a skill says `night/city-realism-1` or `docs/night/`, read the night-2 names.
- Commit locally only. Never push, deploy, touch `main`, delete branches or worktrees, or rewrite history; the owner pushes.
- **Map and image sources follow `docs/MAP_SOURCES.md`.** Shapes, sizes and positions come from OpenStreetMap, Overture, the
  owner's own photos or licensed photos. Never from Google Street View, Maps satellite, Earth or 3D Tiles.
- The tour cameras in `tools/dev/city-tour.json` stay frozen: fix the place, never move the camera.
- Every visible change is either on by default with a `?flag=0` switch in `src/flags.ts`, or a setting. Road changes go under one
  flag, `roads` (`?roads=0` = night 1's roads), so before/after comes from one build.

**Baseline.** A production build of night 1's end (`1139856`) at `C:/Kuching3D-night-builds/n1-final`, measured in N2-M0a. The
`PLAN.md` budget table applies against it, plus: **triangles per chunk at most +15 %** (night 1 used +49 % of the +60 %), and a
place over the +12 % per-place guide must be brought back under it with LOD before anything is added to it.

## Status

| # | Milestone | Model | Status | Commit | Result |
|---|---|---|---|---|---|
| N2-M0a | Trust: credits, text, tests, bench scenario E, data hash, baseline | Sonnet Medium | DONE | `033bc08` | Credits modal + honest text; 0 extra char GLBs; `?v=` hash; E2E fixed; cold phone p95 A/C/E 38.7/40.7/35.4 ms vs 43.1/47.4/34.6 ms |
| N2-M0b | Ceiling: V5 distance hide, hero-chunk LOD, start-up, shadow pre-warm | Fable High | DONE | `efc06d9` | V5 distance hide + 3-block cull (-10..33k tris); `-1_-1` +5.8% & `-2_-1` +9.2% low LOD; 0 waterfront shadow compiles; ready +8.4%; phone p95 +5.6%/-6.7%/+2.1% |
| N2-M1 | Map truth audit: roads, roundabouts, signals | Sonnet Medium | DONE | `a149f60` | Audited 7,733 ways: 52 rb ways -> 39 roundabouts (top-down + eye sheets), 113 signal nodes (46 jcts) + 37 candidate unsignalled main jcts, 259 dual pairs, 52 bridges & `footWet` deck bugs; Top-20 + `OWNER_TODO.md` |
| N2-M2 | Roads true: roundabouts, dual carriageways, widths, junctions | Fable High | DONE | `35d8640` | `?roads=1` kerbed islands/medians/splitters/give-way, `lanes*3.3m` + overrides, unified asphalt (-1 call/chunk, <=+14.55% tris, +6.3% JSON), bridge & `footWet` fixes (`34/34` landmarks, Scenario E `blocked:[]`); ready +0.6%; phone p95 +1.2%/-17.3%/-8.2%, 0 >200 ms |
| N2-M3 | Traffic lights and road rules that work | Fable High, closed by Opus 5.5 | DONE | (this commit) | `?signals=1`: 220 poles at 44 mapped + 11 inferred jcts, R/A/G heads on the traffic's clock, 2 phases (crossing roads split), stop at box entry, roundabout give-way, keep-left; 332/332 unit, 19/19 e2e; ready -2.3%; phone p95 A +5.6% (re-run; first set +24.7% on a noisy machine) / C +9.4% / E -8.4%; tour view 12 faces away from its junction (scenes instead) |
| N2-M4 | Docs and night-2 report | Sonnet Medium | TODO | | |

## Milestones

### N2-M0: Trust and ceiling (part a: Sonnet does credits, text, tests, scenario E, data hash and the baseline; part b: Fable does the V5 hide, LOD, start-up and pre-warm)
- **Credits page** in the pause menu and on the start screen: every asset in `docs/ASSETS.md` with its author and licence, including
  the MIT notice for the Rocketbox animations and every CC-BY / CC-BY-SA attribution. Required before the site is shared.
- Fix the start-screen and settings text in `index.html` that says machine-detected buildings are "drawn plain grey".
- With traffic and walkers on, `casual-character.glb` must not load while the picker is open, nor when another character is chosen
  (walkers can wait for the chosen model or use a cheaper stand-in).
- Fix or re-define the two failing e2e tests:
  - `production` size: measure what the **first visit actually downloads**, not every file in `dist/`, and log the decision.
  - `character-p5` 4x-CPU swap frame: find the slow frame and fix it, or log why the limit changes.
- Make the GPS route e2e stable with traffic on.
- **Bench that sees the city:** add a `drive-bench` scenario E, a central-city loop (Main Bazaar → Jalan Gambier → India Street
  edge → City Mosque → Padungan). Traffic is off on Jalan China (`src/life/Life.ts`), so scenarios A and B never measure traffic,
  walkers or the heavy hero chunks. Phone pairs from now on run A, C and E.
- **Clamp the ceiling before night 3 adds people and cars** (moved here on the Antigravity review's advice):
  - The hand-built V5 section (`src/v5/V5Scene.ts`) is only removed on a mode switch, never by distance: hide it when the player is
    beyond the low-detail radius from the old town, and split its merged meshes into a few street-block groups so the frustum can
    cull them, if that adds no more than ~6 draw calls.
  - Bring the India Street chunk `-1_-1` (+70 %) and the City Mosque chunk `-2_-1` (+65 %) back under the +12 % guide with a real
    `'low'` detail level (landmark models, India Street stalls, graves).
- Build the baseline. Run three alternating phone bench pairs on a quiet machine (close the idle Vite servers on 5175 and 4199
  first), then profile start-up: 73 shader programs at ready against 65 at M5c. Pre-warm the two shadow programs that compile on the
  first walk to the waterfront.
- Cheap honesty fix: chunk and data URLs get a build hash (`?v=`) so returning browsers never mix old and new data.
- **Done when:** the credits page is on screen, the full e2e suite passes, scenario E exists, the two heavy chunks are within the
  guide, the V5 section is hidden far from the old town, the baseline numbers are in `docs/night2/m0/NOTES.md`, and start-up is
  within +20 % of the night-1 baseline.

### N2-M1: Map truth audit
What is wrong with the roads, and whose fault it is. No game code changes. Output `docs/night2/audit/AUDIT.md`.
- **Inventory from the data** (`data-src/osm/kuching.json`, fetched 2026-11-14, a 7.2 x 5.0 km box):
  - Roundabouts: group the 52 `junction=roundabout|circular` ways into roundabouts. For each: name, position, ring diameter,
    lanes, entries, what OSM maps inside it (monument, fountain, garden), and game screenshots (eye level and top-down).
  - Traffic lights: the 113 mapped signal nodes, and every junction of two main roads (trunk, primary, secondary) that has none.
    That second list is a guess for the owner to confirm, not a fact.
  - Main roads without `lanes` or `width` (only 6 of 7,735 road ways have a width), dual carriageways (pairs of one-way ways), slip
    lanes, bridges and flyovers.
- **Compare with reality**, using sources from `docs/MAP_SOURCES.md` only: the owner's photos and notes, Mapillary and KartaView
  (CC-BY-SA), Wikimedia Commons. Use `docs/night2/audit/OWNER_NOTES.md` if the owner has written one.
- **Sort every problem:**
  - **A, drawn wrong:** the data is right, the game is wrong. Fixed in N2-M2 or N2-M3.
  - **B, data wrong or missing:** fixed by the owner in OpenStreetMap (list the exact way or node ids and what to change), or by a
    line in `data-src/overrides/` when it can't wait.
  - **C, outside the map box:** note the bigger box it would need. Growing the box is the owner's decision.
- **Rank** by how often a player meets it: junctions on the tour, the job routes and the main roads first. Top 20 in a table.
- Write `docs/night2/audit/OWNER_TODO.md`: the B list as plain steps for the owner ("open way 123 in the iD editor, set
  `lanes=4`"), and the photos that would help most (which junctions, from where).
- **Done when:** AUDIT.md lists every roundabout and has the top-20 table, and OWNER_TODO.md exists.

### N2-M2: Roads true
Fix the A list's road shapes. First re-fetch OpenStreetMap (the owner may have fixed some of it), regenerate the chunk data and the
drive graph, and apply `data-src/overrides/`. Everything under the `roads` flag.
- **Roundabouts:**
  - a kerbed central island with grass and palms, or the monument or fountain OSM maps there
  - a ring of the right width for its lanes
  - splitter islands at the entries where the arms are mapped as one-way pairs
  - give-way lines at every entry
- **Dual carriageways:** pairs of one-way ways get a kerbed median between them (grass, trees and lamp posts, as Kuching has),
  with gaps and U-turns where mapped.
- **Widths:** `lanes` x 3.3 m where mapped; the class defaults retuned for Kuching's main roads against the owner's photos and
  Mapillary. List the roads still on defaults in LIMITATIONS.
- **Junctions:** kerb corner radii; one road surface with no overlaps or flicker; slip lanes where mapped; box junctions kept.
- **Bridges and flyovers:** every mapped `bridge`/`layer` road at its height, with railings. Check the Satok, Tun Salahuddin and
  Darul Hana bridges if they are in the box.
- The hand-built places and the V5 section keep their frames: check tour views 01–06 for seams after the regeneration.
- **Done when:** every A-list roundabout and dual carriageway in the audit's top 20 is fixed in the images (eye-level and top-down
  before/after in `docs/night2/m2/`), chunk JSON and triangles stay in budget, and the driving and GPS e2e tests pass.

### N2-M3: Traffic lights and road rules that work
- A signal head on a pole for each approach of every mapped signal junction, plus the audit's inferred main-road junctions, each
  marked "inferred" in LIMITATIONS and switchable.
- Each junction cycles red, amber and green on one timer per junction; the heads glow at night (night 1's uniforms).
- Ambient traffic stops on red and goes on green, gives way to traffic already on a roundabout, and keeps left. The player's GPS
  route follows the same one-way and roundabout rules.
- No fines or wanted level yet.
- **Done when:** the trunk-road tour view and a signal junction show traffic queued on red, a roundabout shows traffic giving way,
  an e2e test checks a car stopping on red, and the phone budget holds on scenario E.

### N2-M4: Docs and report
- README, LIMITATIONS (inferred signals, roads still on default widths) and ASSETS updated; full e2e in the background.
- `docs/night2/REPORT.md` like night 1's: before/after (including top-down road shots), score trend, perf table, known issues,
  "open this first". It also carries **the owner's to-do from the audit**, and the next step: night 3 (`PLAN_N3.md`), then the
  buildings track (`PLAN_BUILDINGS.md`).
- **Owner, not agent:** play it on a real phone from the Cloudflare preview; fix the B list in OpenStreetMap; take the photos the
  audit asks for.

## Decision log
(one line each: date-time, milestone, decision, reason)
- 2026-11-26 plan: folded in the checked findings of `docs/reviews/ANTIGRAVITY_REVIEW.md`. Moved hero-chunk LOD and the V5
  distance hide into N2-M0, before people and cars are added; added bench scenario E. Not adopted: its "1-2 fps at 2.05 M
  triangles" (High preset, whose ~100 chunks are the intended radius; chunks do unload; likely its test browser), "unused"
  `adult-man/woman.glb` (still used by `?char=0`), and the quality-switch "wipe" (meshes rebuild, data stays; intended).
- 2026-11-26 plan: re-sequenced on the owner's request. Night 2 = trust plus roads (audit, roundabouts, dual carriageways, junctions,
  signals). The old N2-M1 to M4 (people, places, night and rain, feel) moved to `PLAN_N3.md`, buildings to `PLAN_BUILDINGS.md`.
  Google imagery stays out (its terms forbid tracing and 3D models from it); `docs/MAP_SOURCES.md` sets the sources.
- 2026-11-27 N2-M0a: `production.spec.ts` gated on actual first-visit gzipped downloads (`<= 3 MB` app [2.13 MB], `<= 2.5 MB` map data [0.56 MB], 0 character GLBs while picker is open, only chosen GLB after confirm) rather than raw `dist/` directory sum (which holds 5 unchosen character GLBs and V5 LODs).
- 2026-11-27 N2-M0a: Walkers bake `ProceduralHumanoid` into the single-draw-call walker VAT (`bakeStandInWalker`) until/unless the player's own model supplies one, saving the 415 KB `casual-character.glb` download.
- 2026-11-27 N2-M0a: `character-p5.spec.ts` `swapWindow` now records from the tap (`swapped >= 0`) onward matching its `"from tap to 1 s after"` spec (a pre-tap idle GC frame at `swapped: -1` was 116.7 ms), alongside a `1.5 ms` per-frame budget on `Play.settleSome` and cached numeric-key `creasedNormals`.
- 2026-11-27 N2-M0a: Scenario E routes Padungan -> Main Bazaar -> Khoo Hun Yeang (India St south) -> City Mosque -> Jalan Market / Waterfront (`centralCityRoute`), skirting Jalan Gambier's `x = -82` grade-level footbridge deck (`way 901466610`, queued for N2-M1/N2-M2).
- 2026-11-27 N2-M0b: V5 (`src/v5/V5Scene.ts`, `controller.ts`) toggles `group.visible` beyond `(lowRadius + 0.25) * 256 m` from the old-town box without disposing, and splits its heaviest multi-block opaque buffers across 3 street-block kits (`+3..+6` draw calls, `-10k..-33k` max tris on phone bench A/C/E).
- 2026-11-27 N2-M0b: Hero chunks `-1_-1` (`+5.8%`) and `-2_-1` (`+9.2%`) brought within the `<= +12%` guide on `'low'` detail via dedicated landmark silhouettes (`< 35%` of `'high'`), low-detail India Street canyon strips, and distance-culled `nearMesh` (`150 m` / `135 m`) for India Street props and City Mosque graves.
- 2026-11-27 N2-M0b: Start-up's `73` vs `65` (M5c) programs traced to `cityGlow` walls (`+2`), `Rain` (`+1`), default-on `man.glb` Skin/Hair + SkinnedMesh depth (`+4`), and `pools` (`+1`); interleaved `Mesh`/`InstancedMesh` shadow pre-warm behind the loading screen eliminates waterfront shadow-pass compiles (`0` added in `shader-prep.spec.ts`, `0` pan frames > 200 ms in `load-probe`).
- 2026-11-27 N2-M1: Audited `kuching.json` (`7,733` projected ways) + `pois.json` + runtime chunks with 0 Google sources: `52` roundabout ways form `39` physical roundabouts (`0` mapped fountains/monuments; `Bulatan Engleham` encloses buildings; `Bulatan Abang Kipali` has `8` trunk `tunnel=yes` ways drawn at grade); `113` signal nodes form `46` junctions plus `37` candidate unsignalled main-road junctions (logged as guesses for owner confirmation); traced Scenario E & Gambier `deck` blocks to `build.ts` `footWet` (`way/931182435` on Main Bazaar, `way/901466610` on Gambier) and `< 60 m` overpass `H = 0.6–1.74 m`.
- 2026-11-27 N2-M2: Overpass highway query returned HTTP `502` / timeouts (`fetch-street.ts` confirmed `36` unchanged bus stops), so kept cached `2026-11-14` `kuching.json` and added non-Google `data-src/overrides/roads.json` (`Jambatan Gantung Satok` `way/1104674947` + verified `lanes` on Padungan, Ong Kee Hui, Pending, Darul Hana rings, Bulatan Abdillah & Suleiman).
- 2026-11-27 N2-M2: Kept Night 1 widths in `r.w` for `?roads=0` and added `r.rw` + pre-clipped `rbi`/`spl`/`med`/`gwl`/`tpr` + twin-arm median lamps under `roads` flag (`?roads=1` default, `+6.3%` chunk JSON, `<= +14.55%` chunk tris, `-1` draw call/chunk from unified surface asphalt); kept `6.0 m` on one-way `residential`/`tertiary` so `Jalan China`'s `2.6 m` OSM-to-V7-lane offset stays on-road.
- 2026-11-27 N2-M2: Subdivided sparse `bridge=yes` ways (`> 16 m -> <= 14 m` spans) with `H >= 5.6 m` road-crossing clearance and split mixed wet/dry footways per segment in `build.ts`, eliminating false grade-level decks on Main Bazaar and Gambier (`Scenario E` `reached: true`, `blocked: []`).
- 2026-11-27 N2-M3: Antigravity (Fable High) stopped at its 5-hour limit before the close-out; Claude Opus 5.5 took over the same working tree on the owner's word, re-ran every check and fixed what its review found, and closed N2-M3 and N2-M4.
- 2026-11-27 N2-M3: The two signal phases are split by the nearest corridor (`refDeg` main, `crossDeg` crossing road from the approach farthest from it), not a fixed ±45° window, which had put both roads of skewed junctions 7 (Padungan × Datuk Abang Abdul Rahim) and 11 (Mendu × Sekama) on one green; approaches that all lie on one road stay one phase (junctions 5, 6, 36, mid-block crossings).
- 2026-11-27 N2-M3: All nodes of one junction form one box: a vehicle obeys the light at the first box node it reaches (even a node that only splits the road, which let cars run red at junctions 31 and 33) and never again inside the box.
- 2026-11-27 N2-M3: `?signals=0` restores night 1 in full: new road rules (roundabout give-way, keep-left at 6.2 m+, weighted spawn pool) are gated by `TrafficHost.roadRules`, and a missing `signals.json` now means no signal control plus a console warning, not night 1's rule.
- 2026-11-27 N2-M3: Signal lens codes start at 2 (shader threshold 1.5) so a mesh without the `sig` attribute never reads as a lens; the manifest `?v=` hash is a sha256 of the chunk texts plus `signals.json`, not their sizes; the signals e2e keeps only its own test car so the ambient fill cannot queue ahead of it.
