# Test results

Run on 2026-11-15, Windows 11, Microsoft Edge 157 (Chromium) with GPU (Intel UHD), Node 24, on the
world that includes the machine-detected Overture Maps footprints (29,593 buildings).

## Unit tests (`npm test`): 17 passed, 0 failed

- Projection: origin, sub-millimetre round trip, distances within 5 mm/km of an independent
  Vincenty geodesic (worst relative error 1.9e-7), axis orientation, scale sanity.
- Routing: waterfront to Fort Margherita exists and crosses on the Darul Hana Bridge ways; every
  over-water route segment is a bridge/deck edge; no other graph edge lies over water; route length
  is at least the straight line; deterministic; routes to all landmarks stay dry.
- Character model: normalises to a 1.72 m figure standing on the origin, facing +Z.
- Overture conflation (synthetic geometry): id scheme stays above OSM ids and inside the safe
  integer range; outline simplification keeps a subset of vertices; a free footprint is kept;
  duplicates of OSM buildings and of other detections, footprints crossed by a mapped way, mostly
  on a carriageway, in water or under 12 m2 are dropped; small overlaps are kept.

## Geographic validation (`npm run data:validate`): 11 of 11 checks passed

| Check | Result |
|---|---|
| Projection round trip over the area | max 3.8e-3 mm |
| Road vertices preserved | 7,219 ways, 39,319 vertices, 0 unmatched, max 7.0 mm, RMS 4.1 mm |
| Road ways present | 0 missing |
| Building footprints preserved (OSM) | 3,602 buildings, max 7.0 mm |
| Overture footprints match source | 25,990 machine-detected footprints (Microsoft 17,657, Google 8,333) all found in the Overture 2026-10-21.0 extract with the right source label and no id clash with OSM; 123,761 emitted vertices max 7.1 mm from a source vertex; 124,109 source outline vertices max 30.2 cm (RMS 0.9 cm) from the emitted outline (limit 31.5 cm = 0.3 m simplification + quantisation) |
| Overture footprints clear of OSM buildings | 0 of 25,990 have their centroid inside an OSM building footprint |
| Water outline preserved | 1,903 vertices, max 6.5 mm |
| Landmark positions | 29 of 29 inside their mapped OSM feature |
| Darul Hana Bridge spans the river | 5 mapped ways, 26 of 34 vertices over water, both landings on land |
| Bridge collision decks emitted | yes |
| Spawn on dry open ground | yes |

These measure this project's transformation and generation error, not the accuracy of the OSM
source data or of the machine-detected footprints.

Routing graph after the rebuild (`npm run data:graph`): same 10,352 nodes and 12,782 edges as
before the footprints were added; 113 segments dropped for passing through a building (unchanged),
so no machine-detected building removed a mapped road or path from the graph.

## Browser tests (`npm run test:e2e`)

Full run on the `feat-overture-buildings` branch with the Overture footprints in the world:
**16 passed, 0 failed** (5.9 minutes). One chunk download was aborted and retried automatically
during the 1366x768 layout test (logged as a warning; the test passed).

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
| Layout: start screen, HUD, settings, map, pause | desktop 1920x1080 | pass |
| Layout | laptop 1366x768 | pass |
| Layout | mobile 390x844 (emulated) | pass |
| Layout | mobile 360x800 (emulated) | pass |
| Touch: joystick, drag-look, run toggle, no page scroll or zoom | mobile 390x844 | pass |
| Touch | mobile 360x800 | pass |
| Production build served from a sub-path by a plain file server | laptop | pass |
| Initial download within size targets | laptop | pass |

The map and navigation branch additionally ran `tools/dev/map-check.ts` (minimap zoom, full map
pan/zoom, landmark selection, cross-river route, re-routing, no-connection fallback) at 1366x768,
390x844 and 360x800 before merging; it was not re-run after the merge or after the Overture
footprints were added.

The "cannot walk through buildings" test uses the five buildings nearest the spawn point, which are
OSM buildings; collision against a machine-detected building is the same code path but was not
tested separately.

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
- `docs/screenshots/overture/before/` and `after/`: the same eight views without and with the
  machine-detected footprints (three residential areas that had roads but no buildings, and Main
  Bazaar, Jalan Padungan and Carpenter Street in the centre). Inspected by eye: no building
  straddles a road centre line or duplicates an OSM building in these views; some machine-detected
  buildings touch road edges; none floats or is sunk.
