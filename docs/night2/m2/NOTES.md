# N2-M2 notes: true Kuching roundabouts, dual carriageways, widths and bridges

**Changed**
- **OSM check & overrides (`.gitignore`, `data-src/overrides/roads.json`, `tools/generate-world/osm.ts`):** Checked Overpass (`fetch-street.ts` confirmed `36` unchanged bus stops; highway delta query returned HTTP `502` / timeout, so preserved cached `2026-11-14` `kuching.json`). Added non-Google `data-src/overrides/roads.json` (`Jambatan Gantung Satok` `way/1104674947`, `lanes=3` on Padungan, Bulatan Abdillah & Bulatan Suleiman, `lanes=2` on Ong Kee Hui, Pending & 7 Darul Hana rings).
- **Flag & widths (`src/flags.ts`, `src/world/roadsFlag.ts`, `docs/FLAGS.md`):** Added `roads` flag (`?roads=0` = Night 1 `r.w` & road rendering; `?roads=1` default = `r.rw`: `lanes * 3.3 m` with `>= 3.6 m` 1-lane floor, `4.2 m` untagged `*_link` slip lanes, retuned Kuching class defaults `trunk 9.9 m`, `primary 6.8 m`, `secondary 6.6 m`, `tertiary`/`residential 6.0 m`; `89` main roads still on defaults logged in `public/data/kuching/roads-report.json`).
- **Bridges, false decks & tunnels (`tools/generate-world/build.ts`, `build-roads-true.ts`, `src/world/RoadBuilder.ts`):**
  - Subdivided sparse `bridge=yes` ways (`> 16 m -> <= 14 m` spans) before solving elevations and enforced `H >= 5.6 m` over crossed roads (`<= 15%` ramp grade), fixing `Jambatan Tun Abdul Rahman Ya'kub` (`way/113702301`), Satok Flyover W ramp, and `< 60 m` footbridges.
  - Split mixed wet/dry footways per segment so inland crossings (`Main Bazaar` `way/931182435`, `Gambier` `way/901466610`) no longer get `+0.3 m` bridge decks or railings (`Scenario E` now reaches `2,878 m` with `blocked: []` and `0` recoveries).
  - Built `Jambatan Gantung Satok` (`34/34` landmarks matched) with twin white H-pylons, parabolic main cables & hangers (`0` river piers), and recessed Bulatan Abang Kipali's `8` `tunnel=yes, layer=-1` trunk ways into `16` portal ramps instead of cutting across the roundabout island.
- **Roundabouts, medians & junctions (`tools/generate-world/build-roads-true.ts`, `src/world/{TerrainBuilder,StreetEdges,RoadBuilder,VegetationBuilder,StreetFurniture,ChunkManager}.ts`, `src/world/district/padungan.ts`):**
  - Precomputed & chunk-clipped `39` roundabout groups (`41` central islands -> `53` pieces, preserving Transit Inn inside Bulatan Engleham), `47` splitter/gore islands, `138` double-dashed give-way lines + yield triangles, `299` dual-carriageway medians (`495` pieces carved at cross-streets & U-turns, skipping Main Bazaar's hand-built median), and `936` twin-arm median lamps (`FURN.lamp` `extra=2`).
  - Unified surface asphalt (`bufs[3]`, `0x5f6163`, `yOff = 0.075`) removes junction z-fighting and saves `1` draw call/chunk (`19 -> 18`), paired with `3`-seg rounded junction kerb corners, striped island/median kerbs, and island/median palms & rain trees.

**Verification & budgets (`docs/night2/m2/load-probe.txt`, `bench-*.txt`, `chunk-tris.txt`, `e2e.txt`, `perf.json`)**
- **Checks:** `typecheck` clean; `data:validate` `11/11` pass (`0` unmatched vertices); unit tests `326/326` pass (`n2-m2-roads.test.ts`); targeted e2e `24/24` pass (`district`, `driving`, `gps`, `landmarks`, `shader-prep`; `driving` test 11 re-run in `e2e-retest.txt` after fixing `Jalan China` one-way residential width to `6.0 m`).
- **Data & geometry:** Chunk JSON `+6.3%` (`<= +35%`, avg `11.14 KiB`, max `31.43 KiB`); max chunk triangle growth **`+14.55%`** (`<= +15%`, worst `-6_-9` `32,076 -> 36,744`, calls `19 -> 18`).
- **Load probe (3 alternating runs):** `n2-m2` ready median **`4339 ms`** vs `4314 ms` (**`+0.6% <= +20%`**), interactive **`4520 ms`** vs `4726 ms` (`-4.4%`), **`0` pan frames > 200 ms**.

| Metric (cold median of 3 phone pairs) | `n1-final` | `n2-m2` | Delta / Budget |
|---|---|---|---|
| Scenario A p95 / maxCalls / maxTris | `41.5 ms` / `121` / `455k` | `42.0 ms` / `123` / `444k` | **`+1.2%`** (`<= +15%`), `-11k` tris |
| Scenario C p95 / maxCalls / maxTris | `47.3 ms` / `161` / `508k` | `39.1 ms` / `161` / `484k` | **`-17.3%`** (`<= +15%`), `-24k` tris |
| Scenario E p95 / maxCalls / maxTris | `36.6 ms` / `176` / `580k` | `33.6 ms` / `176` / `572k` | **`-8.2%`** (`<= +15%`), `-8k` tris, `reached: true` |
| Cold frames > 200 ms / compile stalls > 200 ms | `1` (`214.5 ms` build) / `0` | **`0`** / **`0`** | `0` across all 9 cold runs (`max compile 36.7 ms`) |

**Known issues**
- `89` main roads still lack `lanes=*` in OSM and use retuned Kuching class defaults (`roads-report.json`, queued for `LIMITATIONS.md` in `N2-M4`).
- Signal heads do not cycle R/A/G and ambient traffic does not give way specifically to roundabout rings yet (`N2-M3`).
