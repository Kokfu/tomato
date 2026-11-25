# M5b handoff: hero places 3 and 4 (not started)
From the worker that did places 1-2; its context was heavy and had been compacted. **No code for places 3-4 exists.**
Branch `night/city-realism-1`, tree clean. Done: `a07fa37` Main Bazaar + Waterfront, `2145982` Carpenter Street,
`d2365c8` close-out; mean realism 3.5/5 (3.54). Templates: `docs/night/m5a/NOTES.md` (last section is for you), `docs/night/m5-*.md`.
## Next steps
1. Read PLAN.md (rules, M5), `docs/night/refs/PLACES.md` sections 3-4, load the `kuching-district` skill.
2. **India Street + Jalan Gambier** (commit "N1-M5: India Street + Jalan Gambier"). India Street = OSM way 69928034, landmark at
   (-130.8, -124.8); tour view 04 at (-134.1, -110.1); view 05 on Jalan Gambier (way 217916874) at (-45.8, -222.4); view 01 at
   (-188.9, -202) looks along Gambier to the Floating Mosque. Verified form (`docs/night/refs/img/india_street_1.jpg`, `_2.jpg`,
   CC BY 2.0): pedestrian, continuous steel-and-fabric canopy, diamond tile paving, two storeys, bright paint, AC units.
   **Jalan Gambier has no reference: all Approximate.**
3. **Plaza Merdeka + Old Courthouse + Square Tower** (commit "N1-M5: Plaza Merdeka + Old Courthouse"). Tour view 06 at
   (-91.4, 40.5), yaw -0.824. Models exist: `src/world/landmarks/oldCourthouse.ts` (relation 10459393, building id -10459393,
   chunk 0_-1 near (30, -104)), `squareTower.ts` (way 817868530 at (113, -192)); Round Tower 269781844, The Pavilion
   1296618737, GPO 233621860 (chunk 0_0). Verified form (local `courthouse_clocktower` CC0, `courthouse_courtyard`,
   `squaretower_front`, `squaretower_side`, `gpo_colonnade`): white courthouse, dark hip roofs, clock tower with six columns;
   Square Tower white, two storeys, crenellated, three shuttered windows on the long face, red crosses; GPO white round-arched
   arcade. **No photo of Plaza Merdeka itself: Approximate.**
4. Per place: table with Verified / Verified form / Approximate, references in `public/reference/manifest.json` (copy from
   `docs/night/refs/img/`; its LICENSES.md has author and URL), before/after from fixed cameras, perf check, `docs/night/m5-<place>.md`.
5. Close: one phone bench pair, tour into `docs/night/m5b/`, CRITIQUE + NOTES + perf.json, PLAN.md (M5 stays IN PROGRESS).

## Files and tools to reuse
- Flag `m5Enabled()` in `src/world/district/m5.ts` (`?m5=0` = before); off in node unless `location` is set before import.
- Chunk-mesh pattern, no new draw call: `src/world/district/promenade.ts` + `PromenadeMesh.ts` (hooked in `RoadBuilder`), props
  in `district/props.ts` + `Dressing.ts`.
- Before/after: `node tools/dev/street-shots.ts <dir> --url=http://localhost:5175/[?m5=0] --views=<json> --jpeg --stats`.
- Triangles per chunk: sum mesh index counts under `__k3d.world.chunks.chunks.get('<key>').group` in the page. Bench and
  baseline build: see the `kuching-verify` skill (`C:/Kuching3D-night-builds/baseline`, candidate into `.../m5b`).

## Gotchas
- **Do not add these places to the hand-built V5 section** (`src/v5`): one mesh per material, always drawn whole (315 k
  triangles). Use chunk meshes or a separate object with its own bounds.
- Trimming Carpenter Street (+26 %): cheapest lever is `kit.lod = 1` for `CARP_E_ROWS` on every preset (about -14 k).
- `inDistrict()` covers x 20..520 and `stationOfChunk` cx 0..1: India Street is outside both. M4 dresses no pedestrian street.
- The Square Tower already has an M5 apron, lamps and benches (`promenade.ts`, `props.ts`): keep
  `tests/unit/m5-waterfront.test.ts` passing; `tests/e2e/landmarks.spec.ts` checks one copy per landmark site.
- Terrain falls up to 8 % across old-town streets: level geometry from one height sample sinks or floats.
- No new downloads without the owner; no Google imagery. Heredocs with TypeScript break: write patch scripts with Write.
- e2e: `PUBLIC_PORT=5174`, no saves to `src/` or `public/` while it runs. Stop your dev/preview servers (by PID) before the
  bench and `load-probe`; port 4174 is someone else's.
