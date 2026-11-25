# M5b notes: hero places 3 and 4

Commits: `909bc1d` (India Street + Jalan Gambier), `ede7761` (Plaza Merdeka + Old Courthouse). Both behind the flag
`m5` (on by default; `?m5=0` is the N1-M4 rendering). M5 stays IN PROGRESS: places 5 and 6 are not started.

**What a player now sees**
- **India Street:** shops on both sides (74 lots, walkable five-foot ways, bright paint), a fabric canopy on fourteen
  white columns, diamond tile paving, 35 textile stalls, awnings, Malaysian flags, 17 shop names from the map.
- **Jalan Gambier:** parked cars and kapcai at the shophouse kerb, blinds, cars in the mapped riverside car park.
- **Square Tower:** its photographed form: a turret at one corner (no central tower), shuttered bays, a door.
- **Old Courthouse:** verandah columns, darker shingle roofs, the clock tower on six columns with a clock and cupola.
- **Plaza Merdeka:** an entrance with a canopy, a forecourt and the mapped name, where the mapped footway arrives.
- Details, tables, references and before/after: `../m5-india-street-gambier.md`, `../m5-plaza-merdeka-courthouse.md`.

**Files.** New: `src/world/district/{indiaStreet,IndiaStreetMesh,plazaMerdeka,PlazaMesh}.ts`, four test files, two
camera sets in `tools/dev/`, six reference photographs in `public/reference/`. Changed: `src/world/ChunkManager.ts`
(chunk data is patched on load), `RoadBuilder.ts`, `CollisionWorld.ts`, `arch/Shophouse.ts` (lot paint hook),
`places/PlaceIndex.ts` (boards), `landmarks/{squareTower,oldCourthouse}.ts`, `docs/FLAGS.md`, `docs/LIMITATIONS.md`.

**Verification.** Typecheck clean. Unit 264 / 264 (10 new). E2E desktop-1920: m5-plaza, m5-india, m5-waterfront,
landmarks, district, gameplay, shader-prep: 24 passed at the commit of place 4. No subagent review this time (the
skill asks for one at M3, M4, M6 and M7); self-review only.

| Measure | Baseline (M0 build) | M5b | Limit |
|---|---|---|---|
| Phone p95, one pair, cold A / B / C | 69.8 / 71.6 / 59.6 ms | 60.7 / 68.4 / 64.1 ms (-13 / -4 / +8 %) | +15 % |
| Phone p95, warm A / B / C | 71.2 / 62.6 / 59.7 ms | 58.5 / 66.5 / 62.4 ms (-18 / +6 / +5 %) | +15 % |
| Frames over 200 ms | 1 (B cold) | 0 | 0 stalls over 200 ms |
| Late shader compile (one lambert program on Main Bazaar, both builds) | 63 / 51 ms | 57 / 58 ms | under 200 ms |
| Phone draw calls (max, A / B / C) | 130 / 141 / 150 | 135 / 146 / 156 | |
| Phone triangles (max) | 323-353 k | 433-485 k (+34 to +37 %; M5a was 433-481 k) | +60 % |
| Start-up to ready, 3 alternating runs (median) | 5.92 s | 4.53 s (-23 %) | +20 % |
| Ready + first frames | 7.16 s | 5.16 s (-28 %) | |
| Desktop tour fps, Medium | 60 | 60 median, min 58 | >= 50 |
| Tour triangles / draw calls, 14 views (vs M5a) | 6.35 M / 2738; phone 2.58 M / 965 | 6.27 M / 2754; phone 2.64 M / 965 | |
| Chunk -1_-1 (India Street, Gambier, mall entrance) | 27,480 triangles, 21 meshes | 46,646, 21 meshes (+70 %) | guide: +12 % per place |
| Chunk 0_-1 (courthouse, tower; after M5a) | 91,579, 27 meshes | 94,366, 27 meshes (+3 %) | guide: +12 % per place |
| New downloads; chunk JSON | | 0 (six reference photographs, 1.0 MB, loaded only by the OP panel); unchanged | 8 MB; +35 % |

**Known issues, honestly**
- **Place 3 is over the per-place triangle guide:** chunk -1_-1 grew by 70 %. It was a light chunk (27 k; its
  neighbour 0_-1 has 94 k), and it gained about 19,000 triangles, as much as the Waterfront kit added over three
  chunks. No draw call was added and the desktop frame rate did not move; it was not trimmed further.
- **The phone bench does not pass through the new places.** Its three scenarios run round Jalan China. The pair shows
  the rest of the game is no slower; the cost of the place itself is the chunk and tour numbers above. No scenario was
  added (India Street is pedestrian).
- Tour triangle totals vary by tens of thousands between identical runs; the per-chunk counts are the stable measure.
  The tour was captured from the development server (the bench and start-up used the production build).
- Every India Street lot and all of Jalan Gambier are Approximate; Plaza Merdeka's entrance is invented in form.
  The parked cars are crude boxes with a window band; stalls are blocks of colour.
- The canopy cloth is unlit: M6 (night) has to dim it with the sky. Landmark collision is still the mapped outline
  (no walking under the clock tower's porch).
- `driving`, `gps` and `touch-drive` were not run (not in this part's brief). Parked cars on Jalan Gambier stand 1.5 m
  or more clear of the mapped centre line (unit-tested), but no car has been driven past them in a test.

**Cut or not done:** the General Post Office, Round Tower, The Pavilion and Brooke Memorial; the canopy's ornament
and banners; goods on Jalan Gambier's five-foot way; painted parking bays; house numbers on India Street (twelve are
mapped, not fitted to lots); a second bench pair (the brief asked for one).

Notes for the next M5 worker (places 5 and 6): `HANDOFF.md`.
