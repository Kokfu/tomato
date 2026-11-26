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
| N2-M0 | Trust: credits, tests, baseline, start-up | Sonnet Medium, Fable High for start-up | TODO | | |
| N2-M1 | People where the player looks | Fable High | TODO | | |
| N2-M2 | The weakest places | Fable High | TODO | | |
| N2-M3 | Night and rain done properly | Fable High | TODO | | |
| N2-M4 | Feel: collisions, reactions, a second job | Fable High | TODO | | |
| N2-M5 | Docs and night-2 report | Sonnet Medium | TODO | | |

## Milestones

### N2-M0: Trust
- **Credits page** in the pause menu and on the start screen: every asset in `docs/ASSETS.md` with its author and licence, including
  the MIT notice for the Rocketbox animations and every CC-BY / CC-BY-SA attribution. Required before the site is shared.
- Fix the start-screen and settings text in `index.html` that says machine-detected buildings are "drawn plain grey".
- With traffic and walkers on, `casual-character.glb` must not load while the picker is open, nor when another character is chosen
  (walkers can wait for the chosen model or use a cheaper stand-in).
- Fix or re-define the two failing e2e tests:
  - `production` size: measure what the **first visit actually downloads**, not every file in `dist/`, and log the decision.
  - `character-p5` 4x-CPU swap frame: find the slow frame and fix it, or log why the limit changes.
- Make the GPS route e2e stable with traffic on.
- Build the baseline. Run three alternating phone bench pairs on a quiet machine (close the idle Vite servers on 5175 and 4199
  first), then profile start-up: 73 shader programs at ready against 65 at M5c. Pre-warm the two shadow programs that compile on the
  first walk to the waterfront.
- **Done when:** the credits page is on screen, the full e2e suite passes, the baseline numbers are in `docs/night2/m0/NOTES.md`,
  and start-up is within +20 % of the night-1 baseline.

### N2-M1: People where the player looks
- Walkers in India Street, the Main Bazaar arcades and the five-foot ways of the hand-built streets.
- More traffic on trunk roads: three or more vehicles in frame on the Jalan Tun Abang Haji Openg view, still lower on Low.
- A person waiting at every job pick-up and drop-off, who gets in or takes the parcel.
- The parked cars of the hand-built streets can be taken like the others.
- **Done when:** tour views 01–06 and 13 show people, the trunk-road view shows traffic, and a job starts and ends with a person.

### N2-M2: The weakest places (Jalan China method, `kuching-district`)
- Satok: the weekend market (stall rows, canopies, the suspension bridge if a licensed photograph exists).
- The Spring: a real frontage and entrance facing the tour camera (view 10 scores 3).
- Parking bays from `amenity=parking`, with parked vehicles.
- Bring India Street (+70 %) and the City Mosque chunk (+65 %) back under the +12 % guide with LOD.
- **Done when:** views 09 and 10 score at least 4 and the two heavy chunks are within the guide.

### N2-M3: Night and rain done properly
- Lamp, shop and headlight light falls on walls, people and vehicles, not just the ground (a cheap scheme: a few nearest lights as
  uniforms, or baked light cards; no per-light shadow).
- Traffic signals change colour, and traffic obeys them.
- Rain stops under roofs, arcades, the India Street canopy and five-foot ways; wet roads reflect lit signs.
- **Done when:** the night and rain tour sets score at least 4 and the phone budget holds.

### N2-M4: Feel
- Kerbs and drains block or bump the car; walkers step aside, run from a speeding car and react to the horn (no gore).
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
