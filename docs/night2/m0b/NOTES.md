# N2-M0b notes: V5 distance hide, hero-chunk LOD, and shadow pre-warm

**Changed**
- **V5 distance hide & block culling (`src/v5/controller.ts`, `src/v5/V5Scene.ts`):**
  - Toggled `scene.group.visible` off when the focus is beyond `(lowRadius + 0.25) * 256 m` (`~576 m` Low, `~832 m` Medium, `~1344 m` High) from the old-town box `[71.5..269.7, -58.8..83.0]` without removing/disposing V5, skipping `scene.update` and `peds.update` while hidden.
  - Partitioned V5's merged buffers into 3 street-block kits (`kitWest`, `kitChina`, `kitEast`) and split the heaviest multi-block opaque materials (`<= +6` draw calls total; measured `+3` to `+6` on phone bench A/C/E) with per-block `boundingBox`/`boundingSphere` so frustum and shadow passes cull unseen blocks (`maxTrisK` dropped `-11k` on A, `-33k` on C, `-10k` on E).
- **Hero-chunk `'low'` detail & near-prop culling (`src/world/landmarks/{cityMosque,floatingMosque,oldCourthouse,squareTower,padungan}.ts`, `src/world/arch/Shophouse.ts`, `src/world/BuildingBuilder.ts`, `src/world/district/{IndiaStreetMesh,GravesMesh}.ts`, `src/world/RoadBuilder.ts`, `src/world/ChunkManager.ts`):**
  - Built true `'low'` detail silhouettes (`< 35%` of `'high'` tris; e.g. City Mosque `321` tris vs `5,711` before, `4,084` on `'high'`).
  - Simplified `'low'` detail `NORTH_BLOCK` roof, India Street canyon strips, and shophouse roof party-walls (`c1-flag.test.ts` chunk `0_0` high baseline `151,644` tris unchanged).
  - Moved India Street street-level stalls/awnings/flags + Gambier parked vehicles (`maxDist = 150 m`) and City Mosque cemetery graves (`maxDist = 135 m`, `4` tris/grave on Low, `14` on Med/High) into a distance-culled `nearMesh` (`ChunkManager.update`).
  - Raw counts (`chunk-tris.txt`): chunk `-1_-1` `lowMed` `2,636 -> 2,788` tris (**`+5.8% <= +12%`**), `highMed` `42,564` (`37,716` > 150 m vs `47,246` before); chunk `-2_-1` `lowMed` `2,170 -> 2,370` tris (**`+9.2% <= +12%`**), `highMed` `26,603` (`22,585` > 135 m vs `30,526` before); chunk `0_-1` `lowMed` `5,200 -> 4,336` (**`-16.6%`**).
- **Start-up shader profile & shadow pre-warm (`src/main.ts`, `tests/e2e/shader-prep.spec.ts`):**
  - Profiled `73` ready programs (`n1-final`) vs `65` (`m5c`): `+2` `wallsTextured` `cityGlow` variants (N1-M6), `+1` `Rain` shader (N1-M6), `+4` default-on `man.glb` Skin/Hair + 2 `SkinnedMesh` depth programs, `+1` `pools` additive pass (`RIVER_LIGHTS` water replaced M5c water `+1/-1`).
  - Pre-warmed all `Mesh` / `InstancedMesh` (`BackSide` & `DoubleSide`, `uv` & no-`uv`, `instanceColor` & plain) shadow depth variants behind the loading screen (`interleaved` so Three.js's shared `_depthMaterial` re-keys on `instancing` transitions). Walking from spawn to the Waterfront on Medium now compiles **`0`** shadow programs (`shader-prep.spec.ts` 3/3 pass).

**Performance vs `n1-final` (`docs/night2/m0b/load-probe.txt`, `bench-*.txt`, `perf.json`)**
- **Verification:** `typecheck` clean; unit tests `321/321` pass (`n2-m0b.test.ts` added); targeted e2e (`shader-prep` 3/3, `landmarks` 6/6, `m5-india` 1/1, `m5-mosques` 2/2, `m5-padungan` 2/2, `m5-plaza` 2/2, `district` 4/4, `m5-carpenter` 1/1) all pass.
- **Load probe (3 alternating runs):** `n2-m0b` ready median `4652 ms` vs `4292 ms` (`+8.4% <= +20%`), interactive `4806 ms` vs `4486 ms` (`+7.1%`), **`0` pan frames > 200 ms** across all 3 runs (`[0,0,0]` vs `[1,0,0]`), pan `slowMs` median `486 ms` vs `777 ms` (`-37.5%`).

| Metric (cold median of 3 phone pairs) | `n1-final` | `n2-m0b` | Delta / Budget |
|---|---|---|---|
| Scenario A p95 / maxCalls / maxTris | `45.0 ms` / `121` / `454k` | `47.5 ms` / `126` / `443k` | `+5.6%` (`<= +15%`), `-11k` tris |
| Scenario C p95 / maxCalls / maxTris | `48.1 ms` / `162` / `516k` | `44.9 ms` / `165` / `483k` | `-6.7%` (`<= +15%`), `-33k` tris |
| Scenario E p95 / maxCalls / maxTris | `37.4 ms` / `176` / `583k` | `38.2 ms` / `182` / `573k` | `+2.1%` (`<= +15%`), `-10k` tris |
| Compile stalls > 200 ms | `0` | `0` | `0` (`1` chunk `decor` frame > 200 ms on each build) |

- **Tour (`desktop/fps.json`):** `60.0 fps` median on views 01–13, `59.0 fps` on view 14; 0 visual regressions across all 28 shots.

**Known issues**
- On Low (`shadowWarm` skipped), first sighting of a UV-mapped heritage sign board at `[237, -58]` still logs one `36–69 ms` Lambert compile (`< 200 ms`).
- Scenario E's Sungai Padungan / Jalan Gambier untagged `footWet` bridge-deck obstacle (`blocked: ["deck"]`) is queued for `N2-M1` / `N2-M2`.
