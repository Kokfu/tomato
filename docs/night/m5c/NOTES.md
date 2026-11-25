# M5c notes: hero places 5 and 6, and the close of M5

Commits: `46339d5` (Padungan + Cat Statue), `f41c9db` (City Mosque + Floating Mosque), `001ff0f` (handoff note: the
work was interrupted once by a usage limit and resumed in the same session). Both places are behind the flag `m5`
(on by default; `?m5=0` is the N1-M4 rendering). All six hero places are built: **M5 is DONE.**

**What a player now sees**
- **Cat Column** (tour view 07): the tiled column with four white cats, on its island at the Jalan Abell junction.
- **Great Cat of Kuching and the Chinatown gate** (east end): the white cat in a planted bed, and an open gate with
  five tiled roofs (it used to be a solid building across both carriageways); 197 lots in strong paint between them.
- **Kuching City Mosque** (tour view 08): pink walls, gold onion domes, four minarets, an entrance canopy, and 332
  grave markers in the mapped cemetery.
- **Floating mosque:** rebuilt to its photograph: arcade, slate dome on a drum, one slender minaret.
- Details, tables, references and before/after: `../m5-padungan-cat-statue.md`, `../m5-city-mosque-floating-mosque.md`.

**Files.** New: `src/world/district/{padungan,PadunganMesh,mosqueGraves,GravesMesh}.ts`,
`src/world/landmarks/{padungan,cityMosque}.ts`, four test files, `tools/dev/chunk-tris.mts`, two camera sets, seven
reference photographs. Changed: `landmarks/{index,floatingMosque}.ts`, `LandmarkManager.ts`, `CollisionWorld.ts`,
`RoadBuilder.ts`, `VegetationBuilder.ts`, `arch/Shophouse.ts`, `places/PlaceIndex.ts`, `district/IndiaStreetMesh.ts`.

**Verification.** Typecheck clean. Unit 273 / 273 (9 new). E2E desktop-1920 at `f41c9db`: gameplay, landmarks,
district, shader-prep, m5-mosques, m5-padungan: 24 passed (m5-india and m5-plaza also passed at `46339d5`).
Self-review only (the skill asks for a subagent review at M3, M4, M6 and M7).

| Measure | Baseline (M0 build) | M5c | Limit |
|---|---|---|---|
| Phone p95, one pair, cold A / B / C | 31.0 / 27.7 / 26.7 ms | 27.9 / 28.6 / 27.0 ms (-10 / +3 / +1 %) | +15 % |
| Phone p95, warm A / B / C | 28.5 / 28.6 / 28.2 ms | 26.4 / 27.9 / 29.1 ms (-7 / -2 / +3 %) | +15 % |
| Frames over 100 ms / over 200 ms | 0 / 0 | 0 / 0 | 0 stalls over 200 ms |
| Late shader compile (one lambert program on Main Bazaar, both builds) | 23 / 40 ms | 37 / 22 ms | under 200 ms |
| Phone draw calls (max, A / B / C) | 130 / 141 / 150 | 135 / 146 / 156 | |
| Phone triangles (max) | 323-353 k | 433-485 k (+34 to +37 %, as in M5b) | +60 % |
| Start-up to ready, 3 alternating runs (median) | 4.06 s | 3.52 s (-13 %) | +20 % |
| Ready + first frames | 5.27 s | 3.69 s (-30 %) | |
| Desktop tour fps, Medium | 60 | 60 median, min 59.9 | >= 50 |
| Tour triangles / draw calls, 14 views (vs M5b) | 6.27 M / 2754; phone 2.64 M / 965 | 5.64 M / 2647; phone 2.65 M / 967 | |
| Padungan chunks 4_0, 4_1, 5_1, 5_2, 6_2 | 22.3 / 19.8 / 32.5 / 21.1 / 39.1 k triangles | +9.5 / +5.4 / +5.9 / +0.7 / +2.2 %, two meshes added | guide: +12 % per place |
| Chunk -2_-1 (City Mosque, 287 graves) | 18,014 triangles, 22 meshes | 29,768, 23 meshes (**+65 %**) | guide: +12 % per place |
| Chunks -2_0 (45 graves); -1_-2 (floating mosque) | 35,663; 3,613 | 36,653 (+2.8 %); 2,313 (-36 %) | |
| New downloads; chunk JSON | | 0 (seven reference photographs, 1.5 MB, loaded only by the OP panel); unchanged | 8 MB; +35 % |

**Known issues, honestly**
- **The bench numbers are not comparable with earlier milestones.** Both builds ran about twice as fast as in the
  M5b pair (a quiet machine); only the in-pair comparison counts. Phone emulation and the 4x throttle were on.
- **The phone bench does not pass through the new places.** Its scenarios run round Jalan China. The cost of the
  places themselves is the chunk and tour numbers above.
- **Place 6 is far over the per-place triangle guide** (+65 % in chunk -2_-1: the mosque's model and the graves). It
  was a light chunk and no desktop camera drops below 59.8 fps; the graves were already cut from 437 at 44 triangles.
- **The City Mosque's layout is a guess** (four corner minarets, four small domes, the entrance at the outline's
  round projection). The floating mosque's colours come from a night photograph.
- **Every Padungan lot and every grave is Approximate.** Statues are blocky; the gate's roofs are thin and its name
  panels blank. Graves, canopy columns and steps have no collision.
- `driving`, `gps`, `touch-drive`, `m5-waterfront` and `m5-carpenter` were not run in this part. No car has been
  driven under the gate in a test (a walker goes under it; the unit test keeps every pier off the carriageways).

**Cut or not done:** parked cars on Padungan (the carriageways are mapped 6 m wide); the 1928 shophouse's own front;
the third mapped cat statue (no photograph); three-storey blocks and the grass median; the mosque's annex, fence and
car park; a daylight reference for the floating mosque (needs a download); a second bench pair (the brief asked for one).
