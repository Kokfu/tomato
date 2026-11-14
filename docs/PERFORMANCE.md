# Performance measurements

Measured on 2026-11-15 with `node tools/dev/perf.ts --url=http://localhost:4173/` against the
production build (`npm run build && npm run preview`). Raw numbers: `docs/perf-results.json`.

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

| Asset | Raw | Gzip |
|---|---|---|
| Entry JavaScript (Three.js + app) | 681 KB | 186 KB |
| CSS + HTML | 18 KB | 5 KB |
| Character model + loader (lazy, after start) | 466 KB | 157 KB |
| **Application total** | **1.16 MB** | **0.35 MB** (target: under 5 MB) |
| Core map files at start-up (manifest, height grid, landmarks) | 275 KB | 169 KB |
| Full-map overview (lazy, first map open) | 267 KB | 88 KB |
| Routing graph (lazy, first route request) | 506 KB | 171 KB |
| Map chunks, whole area (513 files) | 2.51 MB | 0.86 MB |
| One chunk | 4.9 KB average, 25 KB largest | 1.7 KB average, 8 KB largest |

Start-up transfer measured in the browser (uncompressed bytes, including the app):

| Preset | Requests | Bytes | Of which chunks |
|---|---|---|---|
| Medium (desktop default) | 46 | 1.75 MB | 37 chunks, 0.31 MB |
| Low (phone default) | 30 | 1.64 MB | 21 chunks, 0.20 MB |

The spawn-area geographic download is therefore about 0.2-0.3 MB uncompressed (target: under
10 MB). The whole city is never downloaded up front.

Time from navigation to "Start Exploring" enabled (local server, warm disk): 0.8-2.0 s.

## Frame rate

Two modes were measured for each view: normal 60 Hz presentation (what a player sees) and vsync
disabled (to show headroom). Each sample is a 6-second 360-degree camera pan; the third view also
runs along a street so chunks stream in.

### Normal presentation (vsync on)

| Viewport | Preset | View | Avg fps | 99th pct frame | Worst frame | Frames over 33 ms |
|---|---|---|---|---|---|---|
| 1920x1080 | Low | Waterfront | 60.1 | 19.1 ms | 20.3 ms | 0 / 361 |
| 1920x1080 | Low | Old town | 60.1 | 17.9 ms | 26.3 ms | 0 / 361 |
| 1920x1080 | Low | Running, streaming | 60.1 | 19.8 ms | 25.4 ms | 0 / 361 |
| 1920x1080 | Medium | Waterfront | 60.1 | 20.2 ms | 24.1 ms | 0 / 361 |
| 1920x1080 | Medium | Old town | 60.0 | 18.6 ms | 18.8 ms | 0 / 361 |
| 1920x1080 | Medium | Running, streaming | 60.2 | 22.2 ms | 28.3 ms | 0 / 361 |
| 1920x1080 | High | Waterfront | 60.0 | 21.6 ms | 23.4 ms | 0 / 361 |
| 1920x1080 | High | Old town | 60.1 | 23.0 ms | 25.2 ms | 0 / 361 |
| 1920x1080 | High | Running, streaming | 59.4 | 22.9 ms | 31.3 ms | 0 / 357 |
| 1366x768 | Medium | all three views | 60.0-60.1 | 18.8-21.0 ms | 23.0 ms | 0 / 361 |
| 390x844 emulated, CPU x4 | Low | all three views | 60.0-60.1 | 23.4-25.0 ms | 27.6 ms | 0 / 361 |
| 390x844 emulated, CPU x4 | Medium | all three views | 59.8-60.2 | 26.1-27.1 ms | 55.9 ms | 1 / 359 |
| 360x800 emulated, CPU x4 | Low | all three views | 60.0 | 23.4-24.2 ms | 25.4 ms | 0 / 360 |

Result: the 60 fps desktop target is met on integrated graphics at all three presets. The 30 fps
mobile target is met in emulation; it remains **unverified on real phones**.

### Headroom (vsync off)

| Viewport | Preset | Average fps (three views) | Draw calls | Triangles | Chunks loaded |
|---|---|---|---|---|---|
| 1920x1080 | Low | 247-254 | 61-93 | 19k-37k | 21-26 |
| 1920x1080 | Medium | 136-178 | 80-113 | 24k-44k | 37-45 |
| 1920x1080 | High | 112-134 | 156-189 | 48k-68k | 97-110 |
| 1366x768 | Medium | 229-248 | 80-109 | 24k-40k | 37-45 |
| 390x844 emulated, CPU x4 | Low | 163-252 | 46-59 | 15k-24k | 21-26 |
| 390x844 emulated, CPU x4 | Medium | 108-118 | 55-69 | 17k-27k | 37-45 |
| 360x800 emulated, CPU x4 | Low | 176-276 | 46-59 | 15k-24k | 21-26 |

In uncapped mode the 1920x1080 runs show isolated long frames (130-430 ms worst case). They do not
occur with normal presentation on the same machine and same scenes, so they are attributed to
uncapped presentation on the integrated GPU rather than to the app; they are reported here for
completeness.

JavaScript heap during the runs: 15-48 MB.

## Streaming and memory

From the Playwright streaming test (1.7 km run along the longest mapped major road at twice running
speed, Medium preset):

- No frame in which the player reached a chunk that was not yet loaded.
- Chunks fetched rose from 74 to 135 while 117 chunk meshes were disposed; 50 chunks loaded at the end.
- Longest single chunk build about 20 ms (before the landmark models were added; not re-measured).

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
| Texture compression | Not used: the app ships no image textures (see `LIMITATIONS.md`) |
| Worker-based chunk meshing | Not implemented (roadmap) |
