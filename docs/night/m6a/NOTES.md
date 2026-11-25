# M6 part A notes: day/night cycle and tropical rain

M6 stays IN PROGRESS: traffic and pedestrians are part B. No flag: `?time=` and `?rain=` set the hour and the weather.
**What a player now sees and can do**
- **The day passes.** It starts at 09:40; the sun crosses, the sky turns rose and violet about six minutes in, and night
  falls (13 min 25 s for a whole day: daylight 9 min 45 s, night 3 min 40 s). Settings: Passing / Day / Evening / Night.
- **At night:** stars and a moon, windows lit by bay in warm and cool white, open shops and name boards lit, lamp heads
  glowing with a pool of light under each, lanterns and a warm street in Jalan China, every landmark floodlit (the DUN's
  gold roof most of all), lights lying on the river, and headlights on the road in front of the driven car.
- **It rains now and then** (Settings: Sometimes / Off / Raining): the sky closes, haze thickens, lamps and shops come
  on, the roads darken and shine toward the horizon, puddles carry drop rings, streaks fall, and rain and far thunder
  are heard. The ground stays wet for a couple of minutes after a shower.

**How it works**
- `src/world/dayCycle.ts` (new, pure): light factors by hour (all exactly 1 at 09:40), sun and moon, weather, start-up
  modes. `src/world/env.ts`: shared uniforms. `WorldManager` scales a rendering's daylight "look" by them each frame;
  the Jalan China pipeline hands its look over (`src/v5/pipeline.ts`) instead of writing to the lights.
- Night and rain are uniforms on the existing materials (`Materials.ts`, `v5/materials.ts`): a second layer of the city
  atlas marks windows and signs (`CityAtlas.ts`), the wall's u carries a bay number (`TypedBuilding.ts`), far walls draw
  a window grid, roads get wetness, puddles and rings, the water shader a short list of lights.
- Lamp pools: one fan per lamp, one mesh per near chunk (`StreetFurniture.ts`, `Dressing.ts`), additive, invisible by
  day. Rain: one mesh of 1,500 streaks (500 on Low) and synthesised sound (`src/world/Rain.ts`). `shots.ts` takes
  `--time` and `--rain`; `drive-bench.ts` takes `--query`.
- **By day: no new draw call, program, download or data file.** At night: one draw call per near chunk (pools); in
  rain: one. No program is compiled when either begins (e2e-checked). No asset was added.

**Verification.** Typecheck clean. Unit 282 / 282 (9 new; three geometry pins re-derived: pools add 144 triangles to
chunk 0_0, wall u offsets change two hashes). E2E desktop-1920 after the last code change: m6-daynight (new),
shader-prep, gameplay, landmarks, district, driving, ui: 36 passed. A subagent reviewed the diff; fixed from it: the DUN
roof unlit when starting at night, the sun's glow popping at the change to the moon, late compiles in the legacy
rendering, the rain sound's audio context, rain density on a preset change, pools and streaks in the High preset's
ambient-occlusion pass.

| Measure | Baseline (M0 build) | M6a | Limit |
|---|---|---|---|
| Phone p95, final pair, cold A / B / C | 35.0 / 36.7 / 33.1 ms | 30.9 / 36.6 / 33.2 ms (-12 / 0 / 0 %) | +15 % |
| Phone p95, warm A / B / C | 34.3 / 33.8 / 32.6 ms | 30.4 / 33.8 / 32.9 ms (-11 / 0 / +1 %) | +15 % |
| Frames over 200 ms; late compile (the old lambert one on Main Bazaar) | 0; in both builds | 0; 26 and 28 ms | 0 stalls over 200 ms |
| Phone: night with rain vs its own day run; M5c build vs M6a (two pairs) | | p95 -5 to +3 %, +5 to +8 draw calls; -8 to +5 % | |
| Phone draw calls / triangles (max, A / B / C) | 130 / 141 / 150; 323-353 k | 135 / 146 / 156; 433-485 k (as M5c) | +60 % triangles |
| Start-up to ready; ready + first frames (3 alternating runs, median) | 4.54 s; 5.77 s | 3.90 s (-14 %); 4.27 s (-26 %) | +20 % |
| Desktop fps, Medium: day / night / rain sets | 60 | 60 median; minimum 58 / 59.9 / 59.3 | >= 50 |
| New downloads; chunk JSON | | 0; unchanged | 8 MB; +35 % |

**Known issues, honestly**
- **Measuring was a mess, and one real bug hid in it.** The machine's speed drifted two- to three-fold within minutes,
  and four earlier pairs disagreed. Two of them showed the driving scenarios 13 to 28 % over the baseline: that was a
  real fault introduced by a review fix (the rain sound scheduled audio changes every frame on a sleeping context, a
  cost that grew with time). It is fixed; the table is the pair taken after the fix. All pairs are in `perf.json`.
- **Night light lights nothing:** pools lie on the ground only; walls, cars, trees and the player stay dark and nothing
  casts a shadow in lamp light. Lanes without a lamp are black. The Jalan China section gets an even warm wash instead.
  **Lit windows are flat** on the hand-painted shophouse rows; open shops glow as bright as by day.
- Rain falls through roofs, arcades and the car; walls and roofs stay dry; puddles are noise, not low ground. Jalan
  China's reflections at night are the daytime sky, dimmed. On Low the DUN's roof reads pale at night.
- Tests and tools run on a frozen dry day (`navigator.webdriver`): only the new spec and these shots cover the cycle.
  Not run: gps, touch, touch-drive, layout, opmode, production and the m5-* specs.

**Cut or not done:** real light sources, lamp light on walls, wet walls, splashes, rain stopped by roofs, lightning,
moon phases, a night reflection map, windows that change through the night; traffic and people (part B).
