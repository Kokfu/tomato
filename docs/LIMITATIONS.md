# Known limitations

This list is deliberately explicit. Nothing here is hidden by decoration in the app.

## Geography and data

- **Building coverage is incomplete.** OSM maps about 3,600 buildings in the prepared 33.6 km2.
  The city centre (Waterfront, Main Bazaar, Carpenter Street, Padungan) is well covered; many
  suburban streets have roads but no mapped buildings, so they appear as open ground. Nothing is
  invented to fill the gaps. See `DATA_COVERAGE.md`.
- **Many shophouse rows are mapped as one large footprint** in OSM rather than individual lots, so
  a whole block is extruded as a single building.
- **Building heights are almost all estimated** (3 tagged heights, 51 derived from levels,
  the rest by type/area defaults). Skylines are therefore not accurate.
- **Roof shapes, facades, colours and window patterns are procedural**, not observed.
- **Road widths are inferred** from class or lane count except for 6 tagged ways. Kerbs,
  medians, lane counts and markings are not mapped; the centre dashes are decorative.
- **No sidewalks are mapped as such** in this area, so none are drawn. Pedestrian movement is not
  restricted to paths: the character may walk on any dry ground and on roads.
- **Terrain is an estimate.** It comes from a 30 m radar surface model that includes roofs and
  trees, filtered to approximate bare ground and flattened near the river. Small relief, steps,
  embankments and retaining walls are absent. The river bank is a uniform 1.8 m quay.
- **Bridge deck heights and ramp profiles are inferred**; OSM has no elevations. Spiral ramps,
  stairs and lifts at bridge ends are represented only as far as their centre lines are mapped.
- **Water level is fixed**; the tidal range of the Sarawak River is not modelled.
- **Data edge**: the prepared area ends at 1.535-1.580 N, 110.315-110.380 E. Pending, Tabuan Jaya,
  BDC, Third Mile and most of Petra Jaya are outside it (see the roadmap).
- OSM positional accuracy (typically a few metres for imagery-traced features) is inherited. The
  validation report measures only our own transformation error (max 7 mm), not OSM's accuracy.

## Gameplay

- Collision uses building footprints as infinitely tall walls up to the roof line; interiors are
  not enterable. Trees, street furniture, fences and walls (`barrier=*`) do not collide.
- Mapped passages through buildings are walkable, but the building is still drawn solid, so the
  character visibly passes through a wall there.
- Roads that pass under bridges or flyovers are walkable underneath; underpass tunnels
  (`tunnel=yes`, 8 trunk segments) are drawn at ground level.
- Motor traffic, pedestrians, boats (tambang), day/night and weather are not simulated.
- Jumping is cosmetic (0.7 m); it cannot be used to climb onto buildings.

## Rendering and performance

- Chunk meshes are generated on the main thread (up to about 20 ms per chunk on the test
  machine), one per frame. A worker-based builder would remove these small hitches.
- Distant chunks omit trees and minor roads, so far silhouettes are simplified.
- Ground textures are low resolution (0.5-1 m per pixel) by design; land-use edges are soft.
- No texture compression is used because the app ships almost no textures (one 128 px facade
  tile plus per-chunk canvas ground textures generated at runtime).

## Testing

- Browser tests ran in Microsoft Edge (Chromium) on Windows with an integrated Intel GPU.
  **Firefox and Safari were not tested.**
- Mobile results come from Chromium device emulation (viewport, device pixel ratio, touch events,
  CPU throttling). **No physical phone was tested**, so real mobile frame rates, thermal behaviour
  and browser-specific touch quirks (iOS Safari in particular) are unverified.
- Pointer-lock mouse look cannot be driven by automation; tests use the drag-look fallback. Pointer
  lock itself was exercised manually only in the desktop app's preview pane.
- Visual resemblance of landmarks to the real buildings is judged by eye from screenshots, not
  measured.
