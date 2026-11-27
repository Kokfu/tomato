# N2-M0a notes: trust, credits, size gate, and city bench baseline

**Changed**
- **Credits & Licences (`src/ui/Credits.ts`, `index.html`, `src/ui/GameMenu.ts`, `src/styles/main.css`):** Start-screen (`#start-credits`) and pause-menu (`#pause-credits`) modal listing every asset in `docs/ASSETS.md` with author and licence, including the verbatim Microsoft Rocketbox MIT notice (`public/models/characters/LICENSE-rocketbox.txt`) and all CC0 / CC-BY / CC-BY-SA / ODbL / Copernicus attributions.
- **Honest building text (`index.html`):** Replaced stale `"drawn plain grey"` start/pause notes with accurate wording (machine-detected buildings use tropical roofs and wall facades when no real height is mapped).
- **No unneeded character GLB (`src/life/LifeRender.ts`, `src/life/Life.ts`):** Baked `ProceduralHumanoid` into the single-draw-call walker VAT (`bakeStandInWalker`) so `casual-character.glb` (415 KB) is never fetched while the picker is open or when another character is chosen.
- **Data cache-busting (`vite.config.ts`, `src/version.ts`, `tools/generate-world/build.ts`, `src/world/*`, `src/ui/Minimap.ts`, `src/life/Life.ts`, `src/play/Play.ts`):** Appended 10-char SHA-256 `DATA_HASH` (`?v=...`) to all `/data/kuching/*` fetches; ignored `dist/` and `docs/` in Vite's file watcher.
- **Frame-spike & e2e fixes (`src/play/Play.ts`, `src/player/character/creasedNormals.ts`, `src/player/GlbCharacter.ts`, `tests/e2e/*`):**
  - `production.spec.ts`: measures actual first-visit gzipped downloads (`2.13 MB` app, `0.56 MB` map data, 105 files, 0 character GLBs while picker is open, only `man.glb` after confirm, 0 `/reference/` photos) and checks Credits + `?v=` chunk URLs.
  - `character-p5.spec.ts`: budgeted `Play.settleSome` (`1.5 ms`/frame), switched `creasedNormalsSteps` to a 51-bit numeric key + `WeakMap` cache, and recorded `swapWindow` from the swap tap (`swapped >= 0`) onward matching the spec's `"from tap to 1 s after"` rule.
  - `gps.spec.ts` / `driving-helpers.ts`: `driveRoute` yields to `life.traffic.vehicles` ahead and `relax()` rejects parked-car and `deck` cells; passes `--repeat-each=2` with traffic on.
- **Central-city bench (`tools/dev/drive-bench.ts`):** Added Scenario E (`centralCityRoute()`: Padungan -> Main Bazaar -> Khoo Hun Yeang / India St south -> City Mosque -> Jalan Market / Waterfront, ~2.7 km), made `--mobile` run `A,C,E`, and switched preview serving to an in-process HTTP server.

**Baseline vs candidate (`n1-final` from `1c0276e` vs `n2-m0a`, raw logs in `docs/night2/m0a/`)**
- **Verification:** `npm run typecheck` clean; unit tests `318/318` pass (`tests/unit/n2-m0a.test.ts` added); targeted e2e (`production` 2/2, `character-p5` 9/9, `gps --repeat-each=2` 2/2, `m6-life` 3/3, `ui` 4/4, `layout` 2/2) all pass.
- **Load probe (`load-probe.txt`, 3 alternating runs):**
  - `n1-final`: ready median `4056 ms` (`[4273, 4056, 3969]`), interactive median `4524 ms`, `73` programs at ready, `0` pan frames > 200 ms.
  - `n2-m0a`: ready median `4181 ms` (`[4220, 3797, 4181]`, `+3.1%`, budget `<= +20%`), interactive median `4348 ms` (`-3.9%`), `72-74` programs at ready, `0` pan frames > 200 ms.
- **Phone bench (`bench-n1-1..3.txt`, `bench-m0a-1..3.txt`, `perf.json`; 390x844 DPR 3, Low, 4x CPU, 3 alternating pairs):**

| Metric (cold median of 3 pairs) | `n1-final` | `n2-m0a` | Delta / Budget |
|---|---|---|---|
| Scenario A p95 / maxCalls / maxTris | `43.1 ms` / `121` / `457k` | `38.7 ms` / `121` / `447k` | `-10.2%` (`<= +15%`) |
| Scenario C p95 / maxCalls / maxTris | `47.4 ms` / `162` / `518k` | `40.7 ms` / `162` / `510k` | `-14.1%` (`<= +15%`) |
| Scenario E p95 / maxCalls / maxTris | `34.6 ms` / `176` / `583k` | `35.4 ms` / `176` / `575k` | `+2.3%` (`<= +15%`) |
| Cold frames > 200 ms (all 9 runs) | `0` | `0` | `0` compile stalls |

- **Tour FPS (`desktop/fps.json`, 1366x768 Medium):** `60.0 fps` median on all 14 frozen views (min `56.0 fps` on view 14).

**Known issues & notes**
- Pair 1's optional `warm1` pass showed reload GC/chunk-build variance (`n2-m0a` `54.0/51.6/39.8 ms` with 1 chunk-build frame at `252.1 ms` vs `n1-final` `30.3/27.5/28.0 ms`), while cold run 1 of `n1-final` C hit `84.4 ms`; cold 3-pair medians above absorb single-run noise.
- Scenario E touches a bridge-deck boundary on Sungai Padungan / Lebuh Temple (`blocked: ["deck"]`, 16-26 recoveries on both builds, driving ~2.7-2.8 km across all 19,199 frames). Jalan Gambier also has an at-grade overhead footbridge deck (`way 901466610` at `x = -82`, `h = 13.13 m`) blocking cars; logged for `N2-M1` / `N2-M2`.
- Hero-chunk LOD (`-1_-1`, `-2_-1`), V5 distance hide, and waterfront shadow pre-warm follow in `N2-M0b`.
