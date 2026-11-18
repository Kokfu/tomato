# Map and navigation

The in-game map system: the round minimap, the full map, landmark selection and walking routes.
Everything is drawn on 2D canvases from the same generated data that builds the 3D world. There is
no map-tile service, no second mapping renderer and no runtime call to any map API.

| Piece | File |
| --- | --- |
| Minimap, full map, landmark card, HUD hint (DOM + interaction) | `src/ui/Minimap.ts` |
| Canvas painting (chunks, overview, route, markers) | `src/ui/MapDraw.ts` |
| Routing core: graph decoding, snapping, A*, turn hints (no DOM) | `src/ui/Router.ts` |
| Styles | `src/styles/map.css` (imported by `Minimap.ts`) |
| Offline graph builder | `tools/generate-world/build-graph.ts` |
| Unit tests | `tests/unit/router.test.ts` |
| In-app check + screenshots | `tools/dev/map-check.ts`, `docs/screenshots/map/` |

## Using it

- **Minimap** (top right, always visible): nearby roads, river, buildings, landmark markers, the
  player arrow (facing direction) and an `N` north indicator. `+` / `-` buttons or the mouse wheel
  over the minimap change the range (50 m to 700 m). The third button switches between north-up
  (`N`) and heading-up (triangle; the map turns with the camera and the `N` rides the rim). Range
  and mode are remembered in `localStorage`.
- **Full map**: `M`, the map button, or a tap on the minimap. Drag to pan; wheel, pinch, the
  `+` / `-` buttons or the `+` / `-` keys zoom. The top bar shows the player's coordinates (and
  the coordinates under the mouse cursor on desktop) and holds *Landmarks* (show / hide the list),
  *Centre on me*, *Return to Waterfront* and the close button. `M` or `Esc` also close it.
  Gameplay input is suspended while it is open (`onFullMapToggle`).
- **Landmarks**: tap a marker or a list entry (nearest first). The card shows the name, kind,
  geographic position, straight-line distance from the player and the compass bearing.
- **Routes**: *Route* on the card plans a walking route from the player's position. The route is
  drawn on both maps, the card shows its length and an approximate walking time (1.35 m/s), and the
  HUD keeps a hint while the route is active: an arrow that points where to walk relative to the
  camera, the next instruction ("120 m: Turn left onto Jalan Gambier", "Cross Jambatan Darul
  Hana") and the remaining distance and time. Leaving the route by more than 30 m re-plans it from
  the new position. Clear it with the `x` button on the hint, the `X` key, or *Clear route* on the
  card; it also clears itself a few seconds after arrival.
- **No connection**: when the start and the destination are not joined by mapped walkable ways the
  card says so and falls back to the straight-line distance and bearing; the HUD shows the same and
  the arrow points straight at the destination. No line is drawn in that case.

## Data

| File | Loaded | Content |
| --- | --- | --- |
| `chunks/<cx>_<cz>.json` | already streamed by the world | detailed roads, water, buildings, areas near the player |
| `landmarks.json` | at start-up (by `WorldManager`) | markers and the landmark list |
| `overview.json` (~267 kB, ~89 kB gzip) | first time the full map opens | whole-area simplified roads with names + water polygons |
| `graph.json` (~505 kB, ~172 kB gzip) | first route request | pedestrian routing graph |

Nothing in the last two rows is part of the initial download.

### `graph.json`

Written by `npm run data:graph` (`tools/generate-world/build-graph.ts`); `npm run data:build` runs
it after the main build because it reads the generated chunk files. All coordinates are integers in
decimetres (`scale` = 10 units per metre) in the world frame (+x east, +z south, i.e. -z north).

```jsonc
{
  "v": 1,
  "scale": 10,
  "bounds": { "minX": -3072, "maxX": 3840, "minZ": -2304, "maxZ": 2560 }, // metres
  "types": ["motorway", "trunk", ...],   // copy of ROAD_TYPES; an edge's type indexes this list
  "names": ["Jalan Gambier", ...],
  "nodes": [x0, z0, x1, z1, ...],        // junctions and way ends
  "edges": [a, b, type, flags, name, k,  // six integers per edge
            ...],                        //   a, b = node indices; name = index into names or -1;
                                         //   k = number of shape vertices between a and b
  "geom": [dx, dz, ...],                 // shape vertices of all edges in edge order, each one
                                         //   delta-coded from the previous point (starting at node a)
  "ways": { "<edge index>": 568501299 }  // OSM way id, bridge / pier edges only
}
```

Edge flags: `1` = bridge or pier (the only edges allowed over water), `2` = tunnel / covered.

Current build: 10 327 nodes, 12 754 edges, 15 256 shape vertices, 665 km of walkable ways, 64
bridge / pier edges, 58 connected components (the largest holds 97 % of the length).

### How the graph is built

1. Read the cached OSM extract (`data-src/osm/kuching.json`) with the helpers in `osm.ts`. A way is
   used when `roadTypeOf` knows its `highway` value and `isWalkable` accepts it (motorways,
   `foot=no`, `access=no|private` are out), or when it is an open `man_made=pier` way. `area=yes`
   polygons are skipped.
2. Each pair of consecutive way nodes is a candidate segment. It is dropped when
   - either end is outside the manifest area (the bounding box of `manifest.chunks`);
   - it is over water and the way is **not** bridge-tagged and not a pier (sampled every 2 m, always
     including the midpoint, against the water polygons in the chunk files, i.e. exactly the water
     the player collides with);
   - it passes through a solid building footprint (sampled every 1.5 m against the chunk building
     polygons; open roofs are ignored, as in `CollisionWorld`).
3. Topology comes from OSM node ids only: two ways meet where they share a node. Nothing is snapped
   geometrically, so no connection is invented (a footway that merely passes close to a road is not
   joined to it).
4. Chains of degree-2 nodes whose segments have identical attributes are contracted into one edge
   with shape vertices, then simplified with a 0.3 m tolerance. The simplified shape is re-checked
   against water and buildings and the unsimplified shape is kept if the check fails.

The build prints its statistics (`droppedWater`, `droppedBuilding`, ...). `--debug` lists every
dropped segment.

## Routing algorithm (`src/ui/Router.ts`)

`RouteGraph` decodes the file into typed arrays (CSR adjacency, per-edge polylines and lengths),
labels connected components with union-find and puts every edge segment into a 64 m grid.

- **Snapping**: `snap(x, z)` finds the nearest point on an edge (not just the nearest node) for
  each connected component within 220 m. A candidate is rejected when the straight hop between the
  point and the network crosses water (the caller passes the test; in the game it uses the overview
  water polygons). The start and destination candidates that share a component and have the
  smallest total hop distance are used, so a tiny isolated loop next to the player is not chosen
  when the destination is on the main network.
- **Search**: A* over the junction graph with a binary heap. Edge cost is length times a factor by
  way type (footway / pedestrian / path / pier 1.0, residential 1.05, service 1.1, steps 1.15,
  tertiary 1.15, secondary 1.25, primary 1.4, trunk 1.5), so walkers prefer paths to big roads.
  All factors are >= 1, which keeps straight-line distance to the destination an admissible
  heuristic. The two snapped positions are virtual nodes inside their edges (partial edge costs at
  both ends; a same-edge shortcut is considered). Ties break on node index, so results are
  deterministic.
- **Result** (`Route`): the polyline from the start point to the destination point, a per-segment
  edge index (`-1` for the two off-network hops), cumulative distances, total and on-network
  length, time at 1.35 m/s, the edge list, and maneuvers.
- **Maneuvers**: generated only at real junctions (graph degree >= 3) from the change of direction
  measured about 9 m before and after the junction (under 28 degrees: no instruction unless the
  street name changes; under 55: "bear"; over 130: "sharp"), plus a "Cross <bridge>" when the route
  enters a bridge edge and a final "Arrive".
- `progressOnRoute` projects the player onto the route for the HUD hint and off-route detection.

On the maps the route is a blue line. The off-network hops at either end are drawn (dotted) only
when every sample of the hop is in a loaded chunk and clear of water and building footprints;
otherwise they are left out, so nothing is ever drawn through a building or across open water.

## Rendering and cost

- Chunk and overview geometry is converted once into `Path2D` objects (per chunk, cached in a
  `WeakMap`; per road class for the overview) and painted with a canvas transform.
- **Minimap**: the static layer (land, overview once it is loaded, detailed chunks) is rendered
  north-up into an offscreen canvas 1.5 times the minimap's diameter and re-rendered only when the
  player has moved about 45 % of the visible radius, the zoom changes, or the set of loaded chunks
  changes. Each update (about 15 per second) blits that canvas, rotated in heading-up mode, and
  draws the route, markers and player arrow on top.
- **Full map**: the static layer is cached at screen size and re-rendered only when the view
  changes or chunks arrive (polled about three times a second); otherwise only the overlay is
  redrawn, about four times a second. Detailed chunks are painted over the overview above
  0.3 px/m; each chunk first clears its own square so the coarser overview does not show through.
  Below that scale the overview alone is shown.
- Canvases use at most a device pixel ratio of 2.

## Verification

- `npm test` runs `tests/unit/router.test.ts`: waterfront spawn to Fort Margherita exists and uses
  all three Darul Hana Bridge ways; every route segment over water is a bridge edge; no non-bridge
  edge anywhere in the graph has a segment midpoint in water; length >= straight line; identical
  results on repeated runs and on a freshly decoded graph; routes to every landmark stay dry.
- `node tools/dev/map-check.ts docs/screenshots/map <prefix> --url=... [--size=WxH] [--mobile]`
  drives the running app in headless Edge (minimap controls, opening the map, pan / pinch / wheel,
  marker and list selection, the cross-river route, HUD hint, re-routing, the no-connection
  fallback, Return to Waterfront) and saves the screenshots in `docs/screenshots/map/`.

## Limitations

- **Sparse footways.** Kuching has few mapped footways and almost no mapped sidewalks in OSM, so
  most routes follow road centre lines, and a route can be much longer than the walk a local would
  take. Example: waterfront to Fort Margherita is 373 m in a straight line and 1.28 km by route
  (across Darul Hana Bridge, then along the mapped riverside promenade).
- **Mapped foot paths over water count as decks.** Mappers drew some riverside boardwalks and
  jetties inside the river polygon without a bridge tag (57 segments). The main build turns every
  mapped foot path that touches the water polygon into a low walkable deck, and `npm run data:graph`
  runs `build-graph.ts --decks` so the router uses exactly those ways. Open water is still never
  crossed: an edge over water exists only where a mapped bridge, pier or foot path does. Without
  `--decks` only bridge-tagged ways and piers cross water, and the Fort Margherita route becomes a
  2.74 km detour past the Astana.
- **Connections exist only at shared OSM nodes.** Ways that touch visually but do not share a node
  are not connected; open plazas and car parks are not routable areas (the route follows their
  mapped edges or paths).
- **Buildings**: 113 segments that pass through solid building footprints are dropped (indoor
  corridors, passages under buildings), which can disconnect a few short paths. The check uses the
  generic footprints; hand-made landmark models are not consulted.
- **Destination hop.** A landmark's position is usually the centroid of its building, so the route
  ends at the nearest mapped way within 220 m and the last hop is only shown when it is clear.
  Landmarks further than 220 m from any walkable way report "no mapped walking connection".
- **Not modelled**: opening hours (Darul Hana Bridge is tagged 06:00-00:00), one-way rules
  (irrelevant on foot), surface, slope, crossings and traffic. Times are a flat 1.35 m/s.
- **Overview water is simplified** (2 m tolerance). It is used only for hop tests and the far map;
  the graph itself was built against the exact chunk water.
- The straight-line distance and bearing use the local Transverse Mercator frame (grid bearing);
  within this area the difference from the geodesic values is far below the displayed precision.
- North-up only on the full map.

## GPS driving navigation (V8.4)

At the wheel, `G` or the **GPS** button (above the speedometer; bottom centre on touch) opens a small destination
list: Kuching Waterfront, Main Bazaar, Lau Ya Keng Food Court, Fort Margherita and the Sarawak State Legislative
Assembly (`GPS_DESTINATIONS` in `src/ui/GpsPanel.ts`). Each entry shows its road distance from the car and the walk
left after parking, or why it is unavailable (disabled). Choosing one plans a driving route; the route is magenta
on both maps, with a magenta-and-white disc at the stopping point. The HUD hint shows the next instruction with a
turn glyph ("95 m: Turn left onto Jalan Carpenter"), the remaining road distance and the destination; `X`, its `✕`
or *Cancel navigation* in the panel cancel it. The full-map card offers *Drive here* for any landmark while driving.

| Piece | File |
| --- | --- |
| Destination panel, G key | `src/ui/GpsPanel.ts` |
| Drive mode of the route state, HUD hint, re-planning, arrival | `src/ui/Minimap.ts` (`planDrive`, `updateDriveNav`, `setDriving`) |
| One-way-aware A*, heading preference, stopping-point filter | `src/ui/Router.ts` |
| Car graph builder | `tools/generate-world/build-graph.ts --drive` (part of `npm run data:graph`) |
| Tests | `tests/unit/drive-router.test.ts`, `tests/e2e/gps.spec.ts`, screenshots in `docs/screenshots/gps/` |

### `drive-graph.json`

Same format as `graph.json` plus `"profile": "drive"` and edge flag `4` = one-way (travel from node a to node b
only). ~474 kB (loaded the first time the GPS opens, not at start-up). Current build: 9 813 nodes, 12 043 edges,
633 km, 4 073 one-way edges, 27 bridge edges, 43 components (the largest holds 97.5 % of the length).

Built from the cached OSM extract with the same topology, water and building rules as the walking graph, but:

- only `DRIVABLE_CLASSES` (motorway ... service, the classes the car's road query accepts) wide enough for the car
  (the `RoadQuery.isDrivable` width rule); pedestrian streets, footways, paths, steps, cycleways, tracks and piers
  are never in it;
- out: `access=no|private` (unless `motor_vehicle` / `motorcar` / `vehicle` says otherwise), those tags `=no|private`,
  `service=emergency_access` (99 ways);
- directed: `oneway=yes|true|1`, `oneway=-1` (reversed), `junction=roundabout|circular` and motorways; a one-way
  chain is contracted only while its direction continues and is stored in its direction of travel;
- no `--decks` rule: only bridge-tagged ways cross water.

### Planning a drive

- **Start**: the nearest drivable centre line within 40 m of the car. Further away (car park, open ground) the GPS
  says *Drive onto a mapped road to start the route* and retries once the car is back near one. The car's lateral
  position in its lane does not matter: snapping is to the nearest point of the centre line, and progress is measured
  against the route polyline with a 22 m off-route threshold (V7 Jalan China's mapped line runs 2.6 m east of the
  street middle, and inferred road widths put real lanes several metres off the line).
- **Direction**: the edge the car is on may be left in either allowed direction, but setting off against the car's
  direction of travel costs 120 m (40 m when stopped), so a moving car is not sent into a U-turn when the road ahead
  also leads there. One-way edges are never entered against their direction.
- **Stopping point**: the destination snaps to the nearest *public, uncovered* carriageway within 400 m whose straight
  hop to the landmark does not cross water: not `service` (driveways, parking aisles and lanes inside landmark grounds
  cannot be confirmed as public) and not a tunnel / covered way / building passage. The route ends there; the walk
  from there to the landmark is measured on the walking graph and shown ("+ 530 m walk").
- **Cost**: length times 1.0 (trunk, primary), 1.05 secondary, 1.1 tertiary, 1.25 residential, 1.8 service.
- **While driving** (every 0.25 s): progress on the route, remaining road distance, next maneuver. More than 22 m
  off the route for 3 checks re-plans it from the car's position and heading. Within 15 m of the stopping point:
  *Arrived* with the remaining walk; getting out turns the route into a walking route to the landmark, getting back
  in turns an unfinished walking route into a drive.
- Routes are planned on the whole-area graph, independent of which 3D chunks are loaded; streaming keeps following
  the car only.
