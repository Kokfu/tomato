# Performance measurements

Measured on 2026-11-15 with `node tools/dev/perf.ts --url=http://localhost:4173/` against the
production build (`npm run build && npm run preview`), after the machine-detected Overture
building footprints were added (29,593 buildings in the world instead of 3,603). Raw numbers:
`docs/perf-results.json`. "Before" figures are the previous measurement of the OSM-only world on
the same machine and day (git history of this file).

## Test machine

| | |
|---|---|
| CPU | 13th Gen Intel Core i5-13420H (12 threads), 16 GB RAM |
| GPU | Intel UHD Graphics (integrated), ANGLE Direct3D 11 |
| Browser | Microsoft Edge 157 (Chromium), headless with GPU enabled |
| OS | Windows 11 |

This is an integrated-graphics laptop, so it is a reasonable stand-in for a modest desktop.
**No dedicated-GPU desktop and no physical phone were measured.** The "mobile" rows are Chromium
emulation on the same machine (phone viewport, device pixel ratio 3, touch, CPU throttled 4x). They
show layout and CPU sensitivity, not real mobile GPU performance.

## Download size

| Asset | Raw | Gzip | Before (raw / gzip) |
|---|---|---|---|
| Entry JavaScript (Three.js + app) | 681 KB | 186 KB | 681 KB / 186 KB |
| CSS + HTML | 18 KB | 5 KB | 18 KB / 5 KB |
| Character model + loader (lazy, after start) | 466 KB | 157 KB | unchanged |
| **Application total** | **1.16 MB** | **0.35 MB** (target: under 5 MB) | 1.16 MB / 0.35 MB |
| Core map files at start-up (manifest, height grid, landmarks) | 276 KB | 169 KB | 275 KB / 169 KB |
| Full-map overview (lazy, first map open) | 267 KB | 88 KB | unchanged |
| Routing graph (lazy, first route request) | 506 KB | 171 KB | unchanged |
| Map chunks, whole area (513 files) | **5.42 MB** | **1.84 MB** | 2.51 MB / 0.86 MB |
| One chunk | 10.6 KB average, 29.8 KB largest | 3.6 KB average, 9.6 KB largest | 4.9 KB average, 25 KB largest / 1.7 KB, 8 KB |

The chunk data roughly doubled because of the 25,990 added footprints. The largest chunk grew
little (the largest chunks are in the city centre, where almost nothing was added).

Start-up transfer measured in the browser (uncompressed bytes, including the app):

| Preset | Requests | Bytes | Of which chunks | Before |
|---|---|---|---|---|
| Medium (desktop default) | 46 | 1.89 MB | 37 chunks, 0.45 MB | 1.75 MB, chunks 0.31 MB |
| Low (phone default) | 30 | 1.69 MB | 21 chunks, 0.25 MB | 1.64 MB, chunks 0.20 MB |

The spawn-area geographic download is therefore about 0.25-0.45 MB uncompressed (target: under
10 MB). The whole city is never downloaded up front.

Time from navigation to "Start Exploring" enabled (local server, warm disk): 0.9-2.2 s
(before: 0.8-2.0 s).

## Frame rate

Two modes were measured for each view: normal 60 Hz presentation (what a player sees) and vsync
disabled (to show headroom). Each sample is a 6-second 360-degree camera pan. There are five
views: three in the city centre (Waterfront, old town at Carpenter Street, running along Jalan
Padungan so chunks stream in) and, new in this measurement, two in the densest machine-detected
residential area (around chunk 12,-1, about 1.5597 N 110.3733 E: standing, and running through it).

### Normal presentation (vsync on)

| Viewport | Preset | Views | Avg fps | 99th pct frame | Worst frame | Frames over 33 ms |
|---|---|---|---|---|---|---|
| 1920x1080 | Low | 3 centre | 60.0-60.1 | 19.1-23.5 ms | 27.1 ms | 0 / 361 each |
| 1920x1080 | Low | 2 suburb | 60.0-60.1 | 19.4-21.8 ms | 28.1 ms | 0 / 361 each |
| 1920x1080 | Medium | 3 centre | 60.0-60.1 | 19.0-24.9 ms | 35.6 ms | 1, 0, 0 / 361 |
| 1920x1080 | Medium | 2 suburb | 60.0-60.1 | 24.7-25.2 ms | 34.8 ms | 1, 0 / 361 |
| 1920x1080 | High | 3 centre | 58.3-60.1 | 20.8-26.8 ms | 42.8 ms | 1, 0, 1 / 350-361 |
| 1920x1080 | High | 2 suburb | 60.1 | 19.6-24.9 ms | 40.9 ms | 2, 0 / 361 |
| 1366x768 | Medium | all five | 60.0-60.1 | 19.0-24.4 ms | 28.9 ms | 0 / 361 each |
| 390x844 emulated, CPU x4 | Low | all five | 59.8-60.2 | 26.8-35.4 ms | 46.6 ms | 0-5 / 360 |
| 390x844 emulated, CPU x4 | Medium | all five | 59.3-60.1 | 29.3-33.2 ms | 57.7 ms | 0-3 / 360 |
| 360x800 emulated, CPU x4 | Low | all five | 59.8-60.1 | 25.3-32.1 ms | 53.2 ms | 0-3 / 360 |

Result: the 60 fps desktop target is still met on integrated graphics at Low and Medium in every
view, including the dense machine-detected suburb. High dipped to 58.3 fps in the Jalan Padungan
streaming run (59.4 fps before). Compared with the previous measurement there are a few isolated
frames over 33 ms where there were none (at most 2 in 361 on the desktop).

The emulated-phone rows are **worse than before**: 99th-percentile frame times rose from
23-27 ms to 25-35 ms and up to 5 frames in 360 exceed 33 ms (before: at most 1). The increase also
appears in the Waterfront view, which contains almost no added buildings, so part of it may be
run-to-run variation of the throttled emulation; it was not investigated further. Average frame
rate stays at 59-60 fps, so the 30 fps mobile target is met in emulation; it remains **unverified
on real phones**.

### Headroom (vsync off)

| Viewport | Preset | Views | Average fps | Draw calls | Triangles | Chunks loaded |
|---|---|---|---|---|---|---|
| 1920x1080 | Low | centre | 168-239 (before 247-254) | 63-99 (61-93) | 21k-41k (19k-37k) | 21-26 |
| 1920x1080 | Low | suburb | 247-267 | 52-58 | 24k-25k | 21 |
| 1920x1080 | Medium | centre | 132-160 (before 136-178) | 91-121 (80-113) | 28k-48k (24k-44k) | 37-45 |
| 1920x1080 | Medium | suburb | 161-167 | 83-112 | 32k-38k | 41 |
| 1920x1080 | High | centre | 102-121 (before 112-134) | 187-226 (156-189) | 62k-86k (48k-68k) | 97-110 |
| 1920x1080 | High | suburb | 119-136 | 160-198 | 52k-63k | 85 |
| 1366x768 | Medium | centre | 205-219 (before 229-248) | 92-121 (80-109) | 28k-48k (24k-40k) | 37-45 |
| 1366x768 | Medium | suburb | 216-239 | 83-115 | 32k-39k | 41 |
| 390x844 emulated, CPU x4 | Low | all five | 237-297 (before 163-252) | 39-63 (46-59) | 16k-28k (15k-24k) | 21-26 |
| 390x844 emulated, CPU x4 | Medium | all five | 135-166 (before 108-118) | 52-76 (55-69) | 18k-31k (17k-27k) | 37-45 |
| 360x800 emulated, CPU x4 | Low | all five | 200-240 (before 176-276) | 38-63 (46-59) | 16k-28k (15k-24k) | 21-26 |

Headroom on the desktop presets dropped by roughly 5-15 % in the centre views (more triangles in
the surrounding chunks; the number of draw calls rises because chunks that used to have no
buildings now have a wall and a roof mesh). The suburb views are not heavier than the old town:
machine-detected buildings are plain boxes with flat roofs (no pitched-roof geometry).

In uncapped mode the 1920x1080 runs show isolated long frames (130-435 ms worst case), as before
(130-430 ms). They do not occur with normal presentation on the same machine and same scenes, so
they are attributed to uncapped presentation on the integrated GPU rather than to the app; they are
reported here for completeness.

JavaScript heap during the runs: 13-57 MB (before: 15-48 MB).

## Streaming and memory

Chunk mesh build time (main thread), longest single chunk during the whole perf session:
29 ms at 1920x1080 and 1366x768 with normal presentation (before: 27-32 ms), 41-69 ms under 4x
CPU throttling (before: 56-66 ms).

From the Playwright streaming test (1.7 km run along the longest mapped major road at twice running
speed, Medium preset):

- No frame in which the player reached a chunk that was not yet loaded.
- Chunks fetched rose from 74 to 135 while 118 chunk meshes were disposed; 50 chunks loaded at the end.
- Longest single chunk build 31.4 ms.

## What is implemented

| Technique | Status |
|---|---|
| Geographic chunk loading / unloading (256 m) | Yes |
| Prefetch in the direction of travel | Yes |
| Frustum culling | Yes, per chunk layer (Three.js bounding spheres) |
| Distance-based level of detail | Yes, two levels per chunk |
| Geometry merging | Yes: one mesh per layer per chunk, shared global materials |
| Instanced rendering | Yes: trees |
| Geometry and texture disposal | Yes, verified by the streaming test |
| Lazy-loaded landmarks, character, overview, routing graph | Yes |
| Adaptive render resolution | Yes (probe-based; reverts if lowering resolution does not help) |
| Graphics presets Low / Medium / High | Yes; they never change geography or collision |
| Simplified machine-detected outlines | Yes: 0.3 m tolerance at build time, Overture footprints only (never OSM); flat roofs only |
| Texture compression | Not used: the app ships no image textures (see `LIMITATIONS.md`) |
| Worker-based chunk meshing | Not implemented (roadmap) |
