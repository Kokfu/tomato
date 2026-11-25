# M2 notes: citywide atmosphere, light and ground

**What a player now sees.** The whole city sits in humid haze under a pale equatorial sky; the far chunks dissolve instead of ending
in a line. Ground is photo-textured grass over red earth, laterite fringes and concrete aprons with ragged, blended edges instead of
flat colour. Every road carries the Jalan China asphalt. Rain-tree avenues line the larger roads, palms and small trees stand on
verges and lots, and distant chunks keep their tree cover. The river is silty tea-brown with a paler lapping band at the bank.

**Changed files**
- `src/world/atmosphere.ts` (new): `sunDirection` / `solarDeclination`, `Haze` fog, patched three.js fog chunks (radial distance;
  fog colour tone-mapped like the surface, so fog and sky horizon match in both render paths). Unit test `tests/unit/atmosphere.test.ts`.
- `src/world/WorldManager.ts`: sun from solar geometry (1.56 N, 15 April, 09:40; evening 17:15), haze 0.0012 + ramp closing at the
  streamed edge, wider horizon haze band in the sky, ground textures loaded with the manifest.
- `src/v5/pipeline.ts`, `src/v5/controller.ts`: one haze for all modes (the section's 0.35 fog factor is gone), sky and fog share
  `#c9d8df`, sky fill 1.15 -> 1.3, shadow range 46 m -> 60 m (Medium) / 96 m (High); Low stays shadowless.
- `src/world/GroundTextures.ts` (new), `public/textures/ground/*.webp` (4 files, 233 KB, CC0 Poly Haven, `docs/ASSETS.md`).
- `src/world/Materials.ts`: terrain shader picks grass / earth / concrete from the land-use hue and lays the photos in world space
  (two scales; one on Low); roads use the asphalt photo at the section's 2.05 m lay; tree crowns get leaf noise; silty water shader.
- `src/world/TerrainBuilder.ts`: land-use map repainted: rough grass base, greener land uses, laterite fringe and concrete beside
  roads, concrete aprons round buildings, far minor roads painted in.
- `src/world/VegetationBuilder.ts`: four tree forms, inferred roadside and lot trees, eight-triangle far crowns merged into the far
  wall mesh (no draw call), Low preset bakes a chunk's trees into one mesh. `BuildingBuilder.ts` calls the far crowns.
- `src/world/WaterBuilder.ts`: bank ribbon along mapped shorelines (same mesh and draw call as the water).
- `docs/LIMITATIONS.md` (inferred ground, trees, haze), `tests/unit/c1-flag.test.ts` (chunk 0_0 pinned count +10,636 tris).

**Verification.** Typecheck clean. Unit tests 227 / 227 (5 new). E2E desktop-1920: gameplay 8, district 4, landmarks 6, shader-prep 2: 20 passed.
Not run: driving, gps, touch, ui, layout, opmode, production (not touched; full suite is M8's).

| Measure | Baseline / M1 | M2 | Limit |
|---|---|---|---|
| Phone p95, final build, same-session pair (A / B / C) | 87.6 / 87.2 / 75.3 ms | 74.5 / 81.5 / 72.2 ms | baseline +15 % |
| Phone p95, earlier pair, build before the Low tree bake | 54.8 / 46.0 / 44.5 | 47.3 / 58.7 / 60.6 (B +28 %, C +36 %) | |
| Shader compile stalls over 200 ms | 0 | 0 (largest 80 ms) | 0 |
| Start-up to ready (load-probe, median of 3) | 5391 ms | 5918 ms (+10 %) | +20 % |
| Desktop tour fps, Medium | 60 | 60 median, min 52.5 | >= 50 |
| Tour triangles, all 14 views (vs M1) | 3.51 M / phone 1.54 M | 4.06 M (+15 %) / 1.75 M (+13 %) | +60 % |
| Tour draw calls (vs M1) | 2126 / phone 845 | 2421 (+14 %, wider shadow pass) / 868 (+3 %) | |
| New downloads | | 233 KB | 8 MB for the night |
| Chunk JSON | unchanged (no data regenerated) | | +35 % |

**Known issues, honestly**
- **Phone numbers are noisy and not a clean pass.** The first pair showed B and C over +15 % in-pair; that led to the Low tree bake
  (draw calls now at baseline: 112 / 97 / 100). The pair on the final build passes, but the machine was under other load (its
  baseline was 40-60 % slower than an hour before). One unpaired run of the final build under that load had C at 93.5 ms p95 and
  12 frames over 200 ms, all render time, no compile. Re-measure with two quiet pairs at the start of M3. Raw: `perf.json`.
- Frames over 200 ms that are not compiles: final pair M2 4, baseline 5 (one of 4.7 s); none has more than 35 ms of script.
- Inferred trees have no collision. A few may stand in a neighbour chunk's building when that chunk loads later.
- Tree crowns are still low-poly lobes up close; rain-tree shadows make long dark bands on roads.
- The desktop tour's view 11 once rendered black at 4 fps in a dev run with a second game tab open; not reproduced in 5 later runs.
- World buildings and roads are still Lambert (the section is PBR): the look is shared through light, tone mapping, haze and asphalt.

**Cut or not done:** frangipani as its own form (small round tree stands in); true water reflections (fresnel sky tint only);
a boat wake; colour-grading pass beyond AgX; shadows on Low.
