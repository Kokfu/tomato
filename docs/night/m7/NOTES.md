# M7 notes: the play loop (take a vehicle, do a job, get paid)

Flag `m7` (on by default; `?m7=0` is the N1-M6 game). No asset was added; one data file (`jobs.json`, 19 kB).

**What a player can do now**
- **Take any vehicle that stands parked by rule:** walk up, press E (tap the prompt). Car, kapcai, taxi, pickup: each
  handles differently. The vehicle left behind stays where it stood. One of each stands 30 m from the first car.
- **Do jobs from the phone** (T, or the phone button): deliveries with any vehicle, fares with the taxi, between real
  mapped places named by kind and street only; GPS to the pick-up, then the drop-off; fare plus tip into the wallet.
- **Hit things:** the driven vehicle is pushed out of ambient and parked vehicles; its paint dulls with damage and
  past half it loses power; a struck driver stops and hoots. H (HORN on touch) hurries waiting drivers and stops
  walkers ahead. The phone's garage repairs for money.
- **Keep progress:** money, jobs done and the vehicle with its place are saved in localStorage when a job is paid, on a
  repair and from the phone (every storage call wrapped, a damaged value ignored). **On a phone:** all of it by touch.

**How it works** (`src/play/`, `docs/ARCHITECTURE.md`)
- Pure, unit-tested: `missions.ts` (offers on the road graph, stages, fares), `sites.ts` (place groups, naming),
  `parked.ts` (parking places from chunk data), `crash.ts` (box overlap, damage), `save.ts`. Glue: `Play.ts`, `ui/Phone.ts`.
- One driven body: `Driving.setVehicle` / `adopt` swap its kind (`VEHICLE_SPECS`, one `CarModel` per kind, painted by
  material colour). Parked vehicles are more instances in the traffic's meshes: **no draw call of their own**
  (the taxi and pickup meshes add two on Low when one is in view). No program is compiled by taking or driving a
  vehicle (e2e-checked).

**Verification.** Typecheck clean. Unit 315 / 315 (20 new). E2E after the last code change: desktop-1920 m7-play (3:
the four kinds with horn, collision, traffic reaction and repair; a whole delivery with save, reload and a damaged
save; a taxi fare with the passenger rule), m6-life, driving, gps, shader-prep, gameplay; mobile-390 m7-play-touch (a
whole delivery by touch, HUD overlap at each step), touch-drive (7-size sweep with the wallet and HORN). A subagent
reviewed the diff; fixed from it: a save before the car's area had loaded erased the car, a driver edging past dented
the standing player, reset poses and bridge height carried to the wrong vehicle, a preset change deleted the vehicles
left behind, getting out into a parked vehicle, business-named landmarks in taxi jobs, two assertions that could not fail.

| Measure | Compared with | M7 | Limit |
|---|---|---|---|
| Phone, M7 on / off in one page: p95 frame time | off: 71.5 / 50.0 / 34.7 ms | on: 69.2 / 47.3 / 36.6 ms (**-3 / -5 / +6 %**) at Jalan China (at the wheel) / the starters / a suburb | +15 % |
| Same, mean frame time | 44.1 / 23.7 / 20.0 ms | 42.4 / 23.3 / 20.5 ms (-4 / -2 / +3 %) | |
| Phone drive-bench pair vs baseline (cold A / B / C p95, median of two) | 90.7 / 75.2 / 73.4 ms | 90.5 / 94.4 / 84.2 ms (0 / +26 / +15 %): **not conclusive** | +15 % |
| Same vs the M6b build | 73.1 / 82.7 / 80.4 ms | 92.2 / 88.8 / 91.2 ms (+26 / +7 / +13 %): **not conclusive** | |
| Compile stalls; frames over 200 ms (four M7 bench runs) | baseline 2 frames, M6b 1 (two runs each) | **no program compiled in any run**; 3 frames over 200 ms | 0 compile stalls over 200 ms |
| Phone draw calls / triangles (max, A / B / C) | baseline 113 / 129 / 150; 318-349 k | 121 / 137 / 162; 455-519 k (+49 %; M6b +46 %) | +60 % triangles |
| Start-up to `ready` (median) | baseline 6.0-6.4 s; M6b 7.6-8.0 s | 7.1-8.5 s: **+28 to +41 % vs baseline; -6 to +6 % vs M6b** | +20 % |
| Ready + first frames | baseline 12.2 s | 8.3-8.8 s (-30 %) | |
| Desktop tour, Medium: fps; draw calls and triangles over 14 views | M6b 60; 2761 and 7.13 M | 60 median (see CRITIQUE for view 05); 2845 and 7.66 M | >= 50 |
| New downloads; chunk JSON | | 19 kB (`jobs.json`, fetched when the phone first lists jobs); unchanged | 8 MB; +35 % |

**Known issues, honestly**
- **Start-up to `ready` is over budget against the baseline build in this session, and so is the M6b build** (M6b's
  notes measured -10 %). M7 adds nothing measurable to it; why both read slow today is not found. Re-measure in M8.
- **The bench pairs say nothing again**: the same build differs by up to 36 % between its two runs. The phone number
  is the on/off test, which does not cover two one-off costs: testing a chunk's parking places (now three a frame)
  and working out offers when the phone lists them (5 to 29 ms unthrottled).
- **The parked cars of the hand-built streets cannot be taken**; a new player in Jalan China is surrounded by them.
- **Nobody is at the pick-up or the drop-off**, nothing is carried, walkers are not hit, bodies do not deform.
- **The job e2e takes 2 to 7 minutes**: its driver follows the route blind through the traffic. Three older route
  tests in `driving.spec.ts` now run with `?life=0` for that reason.
- **Two shadow-pass programs still compile on first walking to the waterfront** (with `?m7=0` too): found, not fixed.
  With `?life=0` nothing stands parked, so no taxi fare can be driven. Not run: layout, ui, opmode, production,
  m5-*, character; the tracked screenshot sets of the gps and touch-drive specs were not regenerated.
**Cut:** a visible passenger or parcel, hitting walkers, deformation, a taxi meter, cargo jobs, buying vehicles,
police, taking a vehicle out of the traffic, mapped parking bays, a second save slot.
