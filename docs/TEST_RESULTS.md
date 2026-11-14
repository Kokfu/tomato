# Test results

Run on 2026-11-15, Windows 11, Microsoft Edge 157 (Chromium) with GPU (Intel UHD), Node 24.

## Unit tests (`npm test`): 14 passed, 0 failed

- Projection: origin, sub-millimetre round trip, distances within 5 mm/km of an independent
  Vincenty geodesic (worst relative error 1.9e-7), axis orientation, scale sanity.
- Routing: waterfront to Fort Margherita exists and crosses on the Darul Hana Bridge ways; every
  over-water route segment is a bridge/deck edge; no other graph edge lies over water; route length
  is at least the straight line; deterministic; routes to all landmarks stay dry.
- Character model: normalises to a 1.72 m figure standing on the origin, facing +Z.

## Geographic validation (`npm run data:validate`): 9 of 9 checks passed

| Check | Result |
|---|---|
| Projection round trip over the area | max 3.8e-3 mm |
| Road vertices preserved | 7,219 ways, 39,319 vertices, 0 unmatched, max 7.0 mm, RMS 4.1 mm |
| Road ways present | 0 missing |
| Building footprints preserved | 3,602 buildings, max 7.0 mm |
| Water outline preserved | 1,903 vertices, max 6.5 mm |
| Landmark positions | 29 of 29 inside their mapped OSM feature |
| Darul Hana Bridge spans the river | 5 mapped ways, 26 of 34 vertices over water, both landings on land |
| Bridge collision decks emitted | yes |
| Spawn on dry open ground | yes |

These measure this project's transformation and generation error, not the accuracy of the OSM
source data.

## Browser tests (`npm run test:e2e`)

Full run after merging all branches: **15 passed, 1 failed**. The failure was the 1920x1080 layout
test, caused by one aborted chunk download while switching quality presets. Chunk downloads now
retry automatically; after that fix the failing test was re-run three times and passed each time.
The full suite was not re-run after the fix.

| Test | Project | Result |
|---|---|---|
| Spawns on valid walkable ground with collision loaded | desktop 1920x1080 | pass |
| W/A/S/D relative to camera, Shift runs, Space jumps | desktop | pass |
| Camera follows, mouse rotates, wheel zooms, first-person toggle | desktop | pass |
| Cannot walk through buildings (5 nearest buildings, running) | desktop | pass |
| River blocks walking | desktop | pass |
| Darul Hana Bridge traversable end to end (deck above 8 m, over water) | desktop | pass |
| Movement is frame-rate independent (15 / 30 / 60 / 144 fps within 3 %) | desktop | pass |
| Chunks stream ahead of the player and old ones are released (1.7 km) | desktop | pass |
| Layout: start screen, HUD, settings, map, pause | desktop 1920x1080 | failed once (transient), pass x3 after fix |
| Layout | laptop 1366x768 | pass |
| Layout | mobile 390x844 (emulated) | pass |
| Layout | mobile 360x800 (emulated) | pass |
| Touch: joystick, drag-look, run toggle, no page scroll or zoom | mobile 390x844 | pass |
| Touch | mobile 360x800 | pass |
| Production build served from a sub-path by a plain file server | laptop | pass |
| Initial download within size targets | laptop | pass |

The map and navigation branch additionally ran `tools/dev/map-check.ts` (minimap zoom, full map
pan/zoom, landmark selection, cross-river route, re-routing, no-connection fallback) at 1366x768,
390x844 and 360x800 before merging; it was not re-run after the merge.

## Not tested

- Firefox, Safari / iOS Safari, Android Chrome on a device.
- Any physical phone or tablet (touch tests use Chromium touch emulation).
- Pointer-lock mouse look under automation (drag-look is tested; pointer lock was only used by
  hand in the app's preview pane).
- A dedicated-GPU desktop.
- Visual likeness of landmarks to the real buildings (inspected by eye in screenshots only).

## Screenshots

- `docs/screenshots/final/`: merged world (waterfront and bridge, DUN, Fort Margherita, Astana,
  Main Bazaar, Carpenter Street, museum).
- `docs/screenshots/*-start.png`, `*-hud.png`, `*-settings.png`, `*-map.png`, `*-touch.png`:
  each tested viewport.
- `docs/screenshots/landmarks/`, `map/`, `character/`: per-feature captures.
