# Kuching 3D: overnight plan, night 2

**Goal.** Night 1 (`docs/night/REPORT.md`) took the city from 2.3 to 4.0 of 5 and added GTA-style play. Night 2 makes it
**trustworthy, busy where the player looks, and better at night**, and fixes the weakest places. It must still run in the browser
and on a mid-range Android phone.

**Rules.** The rules, licences, honesty rules, orchestration and context rule of `PLAN.md` apply unchanged, with these changes:
- Branch `night/city-realism-2`, created from `night/city-realism-1` (`1139856`). Results go to `docs/night2/<milestone>/`,
  the final report to `docs/night2/REPORT.md`. Where a skill says `night/city-realism-1` or `docs/night/`, read the night-2 names.
- Commit locally only. Never push, deploy, touch `main`, delete branches or worktrees, or rewrite history; the owner pushes.
- The tour cameras in `tools/dev/city-tour.json` stay frozen: fix the place, never move the camera.
- Every visible change is either on by default with a `?flag=0` switch in `src/flags.ts`, or a setting.

**Baseline.** A production build of `1139856` at `C:/Kuching3D-night-builds/n1-final`, measured in N2-M0. The `PLAN.md` budget table
applies against it, plus: **triangles per chunk at most +15 %** (night 1 used +49 % of the +60 %), and a place over the +12 %
per-place guide must be brought back under it with LOD before anything is added to it.

## Status

| # | Milestone | Model | Status | Commit | Result |
|---|---|---|---|---|---|
| N2-M0a | Trust: credits, text, tests, bench scenario E, data hash, baseline | Sonnet Medium | TODO | | |
| N2-M0b | Ceiling: V5 distance hide, hero-chunk LOD, start-up, shadow pre-warm | Fable High | TODO | | |
| N2-M1 | People where the player looks | Fable High | TODO | | |
| N2-M2 | The weakest places | Fable High | TODO | | |
| N2-M3 | Night and rain done properly | Fable High | TODO | | |
| N2-M4 | Feel: collisions, reactions, a second job | Fable High | TODO | | |
| N2-M5 | Docs and night-2 report | Sonnet Medium | TODO | | |

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
- **Clamp the ceiling before N2-M1 adds people and cars** (moved here from N2-M2 on the review's advice):
  - The hand-built V5 section (`src/v5/V5Scene.ts`) is only removed on a mode switch, never by distance: hide it when the player is
    beyond the low-detail radius from the old town, and split its merged meshes into a few street-block groups so the frustum can
    cull them, if that adds no more than ~6 draw calls.
  - Bring the India Street chunk `-1_-1` (+70 %) and the City Mosque chunk `-2_-1` (+65 %) back under the +12 % guide with a real
    `'low'` detail level (landmark models, India Street stalls, graves).
- Build the baseline. Run three alternating phone bench pairs on a quiet machine (close the idle Vite servers on 5175 and 4199
  first), then profile start-up: 73 shader programs at ready against 65 at M5c. Pre-warm the two shadow programs that compile on the
  first walk to the waterfront.
- Cheap honesty fixes: chunk and data URLs get a build hash (`?v=`) so returning browsers never mix old and new data.
- **Done when:** the credits page is on screen, the full e2e suite passes, scenario E exists, the two heavy chunks are within the
  guide, the V5 section is hidden far from the old town, the baseline numbers are in `docs/night2/m0/NOTES.md`, and start-up is
  within +20 % of the night-1 baseline.

### N2-M1: People where the player looks
- Walkers in India Street, the Main Bazaar arcades and the five-foot ways of the hand-built streets. Known cause: shop display boxes
  (`CollisionWorld.frontObstacles`) sit across the arcade walking line, so `clearRun` rejects nearly every run; and India Street is
  a mapped area, not a way, so it gets no route at all. Keep a clear lane and add routes along the India Street spine.
- More traffic on trunk roads: three or more vehicles in frame on the Jalan Tun Abang Haji Openg view, still lower on Low.
- A person waiting at every job pick-up and drop-off, who gets in or takes the parcel. Job labels use the mapped category
  ("a kopitiam", "a bakery", "a guesthouse") instead of one word for all food or all lodging, and a mapped shop name where
  OpenStreetMap or the existing `places/*.json` gives one. Never an invented name.
- The parked cars of the hand-built streets (Jalan China, Carpenter Street, Main Bazaar, Jalan Gambier, India Street) can be taken:
  move them out of the baked meshes into the `src/play/parked.ts` pool as one shared list of spots.
- Save the player's walking position too, not only the car (`src/play/save.ts`).
- Walkers step out of the player's car's way, or at least are not driven through.
- **Done when:** tour views 01–06 and 13 show people, the trunk-road view shows traffic, and a job starts and ends with a person.

### N2-M2: The weakest places (Jalan China method, `kuching-district`)
- Satok: the weekend market (stall rows, canopies, the suspension bridge if a licensed photograph exists).
- The Spring: a real frontage and entrance facing the tour camera (view 10 scores 3).
- Parking bays from `amenity=parking`, with parked vehicles; rule-parked cars must not stand on footpaths (seen at Satok).
- City Mosque: two machine-detected Overture footprints stand in front of the entrance as small houses; widen the landmark's
  protection area so its forecourt is clear.
- Building type must not flip at a chunk border: the `kampung`, main-road and river distances look only inside the chunk
  (`src/world/arch/buildingType.ts`); give them a margin from the neighbouring chunks.
- Open shopfronts of the hand-built streets can be walked into (hollow inside): close them with a collision line at the threshold.
- Brand or tenant names (for example at The Spring) only from a licensed photograph or mapped data; otherwise category words.
- **Done when:** views 08, 09 and 10 score at least 4, and no chunk-border flip shows in the tour.

### N2-M3: Night and rain done properly
- Lamp, shop and headlight light falls on walls, people and vehicles, not just the ground (a cheap scheme: a few nearest lights as
  uniforms, or baked light cards; no per-light shadow).
- Traffic signals change colour, and traffic obeys them.
- Rain stops under roofs, arcades, the India Street canopy and five-foot ways (a small top-down roof mask is enough).
- Wet roads pick up lit signs with a cheap warm tint scaled by wetness and night; no planar or screen-space reflection on phones.
- The wet-road look must match where the hand-built Jalan China road meets the city roads (a hard diagonal seam shows in rain);
  check the river shader in daytime rain (reported black) and headlight cones in daylight.
- **Done when:** the night and rain tour sets score at least 4 and the phone budget holds.

### N2-M4: Feel
- Kerbs and drains bump the car, computed from the distance to the road edge (`RoadQuery`), not thousands of collision boxes;
  walkers step aside, run from a speeding car and react to the horn (no gore).
- The third-person camera pulls in instead of clipping into pillars or the player's head.
- Phone HUD: nothing overlaps at 375x812 (speedometer, car prompt, wallet, phone menu, top bar).
- Vehicle damage builds up and costs money to repair.
- A second job type that uses the vehicle differences: for example, a kapcai food run through the old town's narrow lanes against
  the clock, or a pickup cargo run.
- **Done when:** an e2e test plays the new job on desktop and on the emulated phone.

### N2-M5: Docs and report
- README, LIMITATIONS and ASSETS updated; full e2e in the background; `docs/night2/REPORT.md` like night 1's (before/after against
  the night-1 tour, score trend, perf table, known issues, the next night's plan, "open this first").
- **Owner, not agent:** play it on a real phone from the Cloudflare preview and note what feels wrong; this can't be emulated.

## Decision log
(one line each: date-time, milestone, decision, reason)
- 2026-11-26 plan: folded in the checked findings of `docs/reviews/ANTIGRAVITY_REVIEW.md`. Moved hero-chunk LOD and the V5
  distance hide into N2-M0, before N2-M1 adds people and cars; added bench scenario E. Not adopted: its "1-2 fps at 2.05 M
  triangles" (High preset, whose ~100 chunks are the intended radius; chunks do unload; likely its test browser), "unused"
  `adult-man/woman.glb` (still used by `?char=0`), and the quality-switch "wipe" (meshes rebuild, data stays; intended).
