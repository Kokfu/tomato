# Kuching 3D: overnight plan, night 3 (life, places, night, feel)

**Run this after night 2** (`PLAN_N2.md`): these features sit on the road network, which night 2 corrects. The rules, budgets,
orchestration and context rule of `PLAN.md` apply, as amended by `PLAN_N2.md` (local commits only, frozen tour cameras, `?flag=0`
switches, +15 % triangles per chunk, a place over the +12 % guide gets LOD first). Image sources: `docs/MAP_SOURCES.md`.
Branch `night/city-realism-3` from the end of night 2; results in `docs/night3/<milestone>/`, report `docs/night3/REPORT.md`.
Baseline: the production build of night 2's last commit, measured in N3-M0 with bench scenarios A, C and E.

## Status

| # | Milestone | Model | Status | Commit | Result |
|---|---|---|---|---|---|
| N3-M0 | Baseline of night 2's end | Sonnet Medium | TODO | | |
| N3-M1 | People where the player looks | Fable High | TODO | | |
| N3-M2 | The weakest places | Fable High | TODO | | |
| N3-M3 | Night and rain done properly | Fable High | TODO | | |
| N3-M4 | Feel: collisions, reactions, a second job | Fable High | TODO | | |
| N3-M5 | Docs and night-3 report | Sonnet Medium | TODO | | |

## Milestones

### N3-M0: Baseline
- Production build of night 2's end at `C:/Kuching3D-night-builds/n2-final`; three alternating phone pairs (A, C, E); the tour.

### N3-M1: People where the player looks
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

### N3-M2: The weakest places (Jalan China method, `kuching-district`)
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

### N3-M3: Night and rain done properly
- Lamp, shop and headlight light falls on walls, people and vehicles, not just the ground (a cheap scheme: a few nearest lights as
  uniforms, or baked light cards; no per-light shadow).
- Rain stops under roofs, arcades, the India Street canopy and five-foot ways (a small top-down roof mask is enough).
- Wet roads pick up lit signs with a cheap warm tint scaled by wetness and night; no planar or screen-space reflection on phones.
- The wet-road look must match where the hand-built Jalan China road meets the city roads (a hard diagonal seam shows in rain);
  check the river shader in daytime rain (reported black) and headlight cones in daylight.
- **Done when:** the night and rain tour sets score at least 4 and the phone budget holds.

### N3-M4: Feel
- Kerbs and drains bump the car, computed from the distance to the road edge (`RoadQuery`), not thousands of collision boxes;
  walkers step aside, run from a speeding car and react to the horn (no gore).
- The third-person camera pulls in instead of clipping into pillars or the player's head.
- Phone HUD: nothing overlaps at 375x812 (speedometer, car prompt, wallet, phone menu, top bar).
- Vehicle damage builds up and costs money to repair.
- A second job type that uses the vehicle differences: for example, a kapcai food run through the old town's narrow lanes against
  the clock, or a pickup cargo run.
- **Done when:** an e2e test plays the new job on desktop and on the emulated phone.

### N3-M5: Docs and report
- README, LIMITATIONS and ASSETS updated; full e2e in the background; `docs/night3/REPORT.md` like night 1's (before/after against
  night 2's tour, score trend, perf table, known issues, the next night's plan, "open this first").

## Decision log
(one line each: date-time, milestone, decision, reason)
- 2026-11-26 plan: these milestones were night 2's M1-M4; moved to night 3 so they are built on corrected roads. Traffic signals
  moved to night 2 (roads).
