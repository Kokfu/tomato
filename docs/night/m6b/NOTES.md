# M6 part B notes: traffic and walkers citywide (M6 is DONE)

Flag `life` (on by default; `?life=0` is the M6a city). No asset, no data file and no download were added.

**What a player now sees and can do**
- **Traffic on every street that leads somewhere:** hatchbacks, saloons, SUVs and kapcai with a rider drive on the
  left, keep to one-way streets' direction, slow for bends and corners, queue, wait at mapped traffic signals and give
  way at junctions (the larger road goes first). They brake for the player, for the player's car and for walkers.
- **Walkers** on the footpaths beside the roads, on footways and in the five-foot ways of shophouse rows; some stand.
  They step aside for nobody but wait rather than walk into the player.
- **At night** vehicles show head and tail lamps (brake lamps by day too) and a patch of light on the road; there are
  about half as many vehicles and walkers, and fewer walkers in rain.
- Phone (Low): 8 vehicles (hatchback and kapcai only) and 9 walkers; Medium 18 and 22; High 26 and 34.

**How it works** (`src/life/`)
- `traffic.ts` (pure): vehicles on `drive-graph.json`, a quarter of the carriageway left of the centre line, a curve
  through each junction, signal phases, right of way with permissions per junction, a look at the road ten times a
  second per driver. Not used: service roads, covered ways, dead-end streets, Jalan China.
- `walkers.ts` (pure): routes from the loaded chunk data, tested against the collision world once per chunk and kept.
- `LifeRender.ts`: one InstancedMesh per vehicle kind (the parked-car kit; a kapcai built from boxes), one for all
  walkers (the shipped Casual Character, its walk cycle baked into a float texture and replayed in the vertex shader),
  one of soft shadows, one of headlight patches (night only). 4 draw calls by day on Low, 6 on Medium and High.
- `Life.ts`: budgets per preset, obstacles, the three nearest vehicles as walls for the walking player. Started after
  `ready`; its two programs are compiled in the background before anything is drawn.

**Verification.** Typecheck clean. Unit 295 / 295 (13 new: `traffic.test.ts`, `walkers.test.ts`). E2E after the last
code change: desktop-1920 m6-life (new), m6-daynight, shader-prep, gameplay, driving, gps, landmarks, district: 36
passed; mobile-390 touch, touch-drive, touch-lowprep: 3 passed. A subagent reviewed the diff; fixed from it: a queue at
a red light was taken for a deadlock (cars drove through each other), junction permissions leaked, "no signal here" was
remembered from half-loaded data, a preset change left undrawn vehicles in the simulation, the first walker fill ran in
one frame, a red-light test that could not fail. Its stricter test then found a real fault: no stopping for a signal at
the end of a very short street (fixed).

| Measure | Baseline (M0 build) | M6b | Limit |
|---|---|---|---|
| Phone, cost of traffic + walkers, on/off in one page: p95 frame time | off: 60.6 / 48.3 / 30.9 ms | on: 63.4 / 53.5 / 33.2 ms (**+5 / +11 / +7 %**) at Jalan China / Padungan / a suburb | +15 % |
| Same, mean frame time | 30.4 / 25.1 / 18.4 ms | 33.2 / 28.3 / 18.9 ms (+9 / +13 / +2 %) | |
| Phone drive-bench, four alternating runs (cold A / B / C p95) | 86 / 87 / 78 and 78 / 74 / 69 ms | 69 / 70 / 82 and 96 / 96 / 88 ms: **not conclusive** | +15 % |
| Frames over 200 ms in those runs; late compile (the old lambert one) | 0; 52-78 ms | 2 (one slow run, C); 37-73 ms | 0 compile stalls over 200 ms |
| Phone draw calls / triangles (max, A / B / C) | 113 / 129 / 150; 318-349 k | 119 / 135 / 160; 447-511 k (+46 %; M6a +37 %) | +60 % triangles |
| Start-up to ready; ready + first frames (3 alternating runs, median) | 4.17 s; 5.40 s | 3.77 s (-10 %); 4.02 s (-26 %) | +20 % |
| Desktop tour, Medium: fps; draw calls and triangles over 14 views (vs M6a) | 60 | 60 median, minimum 58; 2761 and 7.13 M (2704 and 6.16 M) | >= 50 |
| New downloads; chunk JSON | | 0; unchanged | 8 MB; +35 % |

**Known issues, honestly**
- **The phone number comes from an on/off test, not from the bench pair.** The machine's speed swung two-fold all
  session (the same build: p95 69 and 96 ms), so three bench pairs said nothing. The on/off test switches the traffic
  and walkers every 3 s in one page (`life-probe.ts --ab`); "off" is the M6a city (-12 to +1 % of the baseline in
  M6a). Its spread is wide too (pair medians: -5 to +34 %). **Padungan at +11 % p95 is close to the limit.**
- **The player's car drives through ambient vehicles.** They brake for it, but nothing collides (N1-M7).
- **Too few to fill a frame** (see `CRITIQUE.md`), and **India Street and Main Bazaar have no walkers** (the mall is
  mapped as an area; the arcades are cut up by piers and goods).
- **Signal heads do not change colour**; timing and right of way are invented. Walkers pass through each other and
  stand in the carriageway beside parked cars. Vehicles and walkers pop in at the edge of their ring.
- On Low the simulation runs every second frame (positions glide in between) and vehicles do not tilt on slopes. A
  vehicle held up for 12 s by something that will not move edges **through** it.
- `gameplay.spec.ts` "frame-rate independent" runs with `?life=0`. Not run: layout, ui, opmode, production, m5-*, character.

**Cut:** collisions (M7), parked ambient cars, buses, changing signal heads, walkers on crossings, in India Street and
Main Bazaar, overtaking, fading in and out, walker shadows, one merged draw call for all vehicle kinds on Low.
