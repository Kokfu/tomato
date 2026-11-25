# M3 notes: buildings everywhere

**What a player now sees.** No grey boxes. Each of the 29,598 footprints is one of eleven generic Kuching building types:
kampung houses on stilts with rusting zinc gables, tile-roofed houses and terraces with eaves and grilled windows, three- and
four-storey concrete shop blocks with shutters, sign boards (no words), air-conditioners, a canopy and roof tanks, mid-rises
with ribbon windows or balconies, malls with cladding and glazed podiums, ribbed-metal warehouses, schools, colonial civic
blocks with arcades and louvred shutters, plain halls for unregistered places of worship, zinc sheds. Heights vary by type.

**How it works**
- `src/world/arch/buildingType.ts` (new, pure): fitted rectangle of a footprint, `classifyBuildingType` (tags first; then size,
  shape, land use, distance to main roads and river bank, "Kampung" street names), `massing` (storeys, stilts), per-chunk cache.
  City-wide: house 16.4k, shed 4.7k, kampung 2.9k, shop block 2.8k, terrace 2.0k, school 273, warehouse 251, mid-rise 121.
- `src/world/arch/CityAtlas.ts` (new): one painted atlas (256 x 2560, half size on Low), 20 rows, each two bays by one storey,
  repeating along U; alpha is a tint mask (1 = takes the building colour, 0 = glass, shutters, signs keep theirs).
- `src/world/arch/TypedBuilding.ts` (new): walls (one quad per storey), gable / hip / pyramid roofs with eaves and soffits, inset
  hip for irregular outlines, flat roofs with parapet, stilts and stair, canopies, roof tanks and plant. Far chunks: one quad
  per wall, same silhouette and colour, no atlas.
- `BuildingBuilder.ts` routes every non-row, non-landmark building to it; `Materials.ts`: `wallsTextured` uses the atlas with
  the tint mask, `roofs` reads tile or zinc (+ rust) from uv; `CollisionWorld.ts` blocks at the drawn height.
- Everything is merged into the chunk's existing wall and roof meshes: **no new draw call, texture download or data file**.
  `npm run data:build` was not needed; chunk JSON is unchanged.
- `tests/unit/building-type.test.ts` (8 tests); `c1-flag` and `v9-arcade` geometry pins re-derived (generic buildings changed
  on purpose; shophouse-row and heritage buffers are still compared mesh by mesh). `docs/LIMITATIONS.md` updated.

**Verification.** Typecheck clean. Unit tests 235 / 235. E2E desktop-1920: gameplay 8, district 4, landmarks 6, shader-prep 2:
20 passed (run before the last small review fixes; unit tests and the tour were re-run after). Not run: driving, gps, touch,
ui, layout, opmode, production. `data:validate` not run (no data regenerated). One subagent reviewed the diff; its real
findings are fixed (sky under pitched roofs on notched outlines, bay phase in the legacy wall path, tanks over courtyards,
kampung evidence from street names only, atlas row padding).

| Measure | Baseline | M3 | Limit |
|---|---|---|---|
| Phone p95, one quiet pair, cold A / B / C | 80.4 / 83.2 / 79.2 ms | 79.0 / 86.7 / 85.1 ms (-2 / +4 / +7 %) | +15 % |
| Phone p95, warm A / B / C | 71.2 / 84.9 / 77.6 ms | 82.2 / 84.2 / 71.1 ms (+15 / -1 / -8 %) | +15 % |
| Frames over 200 ms; largest shader compile | 0; 66 ms | 0; 95 ms | 0 stalls over 200 ms |
| Phone draw calls (max, A / B / C) | 130 / 141 / 150 | 130 / 140 / 149 | |
| Phone triangles (max) | 318-353 k | 352-403 k (+11 to +14 %) | +60 % |
| **Start-up to ready, 4 alternating runs (median)** | **4.9 s** | **6.75 s (+37 %)** | **+20 %: MISSED** |
| Start-up, M2 build vs M3 build, 3 alternating runs | M2 6.81 s | 7.29 s (+7 %) | |
| Desktop tour fps, Medium | 60 | 60 median, min 56.1 | >= 50 |
| Tour triangles, 14 views (vs M2) | 4.06 M / phone 1.75 M | 4.52 M (+12 %) / 1.78 M (+2 %) | +60 % |
| Tour draw calls (vs M2) | 2421 / phone 868 | 2569 (+6 %, shadow pass) / 868 | |
| New downloads; chunk JSON | | 0; unchanged | 8 MB; +35 % |

**Known issues, honestly**
- **Start-up is over budget against the M0 baseline (+37 %).** M3 itself adds about 0.5 s (+7 % over the M2 build, inside the
  run-to-run spread); the rest was already there after M2, whose own session measured only +10 %. Needs a proper start-up
  profile (what `ready` waits for since M2) before M4 adds more. An earlier pair with a dev server still running was worse and
  is kept in `perf.json` for the record.
- Phone: stationary-warm p95 is at the limit (+15 %) while stationary-cold is -2 %: noise of one pair, not a trend.
- **View 03's grey slab is not fixed**: it is the hand-built section's flank wall, not a generic building (M5).
- OP mode: machine-detected footprints are still told apart on the map only; in 3D they now look like any other building.
- Types are guesses (see CRITIQUE.md). Evidence is per chunk, so a type can change across a chunk border.
- Collision heights changed with the drawn heights (camera rays, standing on roofs); 2D blocking outlines did not.
- Unregistered mosques, churches and temples (22) are drawn as plain halls, not as their real form.

**Cut or not done:** car porches, fences and gates; modelled (3D) air-conditioners and window reveals; a recessed five-foot way
on generic shop blocks; party-wall splits and per-unit colours on terraces; a second drive-bench pair; an in-3D highlight of
machine-detected buildings.
