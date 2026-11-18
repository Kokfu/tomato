# Vehicle integration

**Status (V8):** a first driving prototype is implemented: one drivable car, a chase camera, enter / exit,
oriented-box collision and road-aware streaming, in `src/vehicle/`. See `docs/V8_REPORT.md` for what
exists and how it was tested. Of the list below, steps 2, 3 and 4 are done; step 1 is half done since V8.4
(`drive-graph.json`, a vehicle routing graph with one-way directions and access rules, used by the GPS; see
`docs/NAVIGATION.md`), without lane metadata; step 5 (traffic) is not.

The rest of this document is the original V2 design note. It records what the architecture provides
for vehicles and where further vehicle features plug in.

## What the data already carries

Chunk files (`src/world/types.ts`, `RoadData`) keep, per road piece:

| Need | Field |
|---|---|
| Classification | `t` (motorway ... residential, service, pedestrian, footway ...) |
| Width | `w` in cm; flag `4` marks widths inferred from the class (only 6 ways are width-tagged in OSM) |
| Direction | flag `8` = one-way, in the direction of the vertex order |
| Topology | `id` (OSM way id) plus shared end points at chunk borders; pieces of one way keep the id |
| Elevation | terrain height grid for at-grade roads; `e` = per-vertex deck elevation on bridges (flag `1`) |
| Tunnels / covered | flag `2` |
| Names | `n` |

Missing for driving, and how to add it:

- **Lane count and turn restrictions** are not in the chunk format. `fetch-osm.ts` already downloads
  every `highway` way with all tags, so `lanes`, `turn:lanes` and `maxspeed` can be copied into
  `RoadData` in `build.ts` (most Kuching ways lack them; default by class).
- **A drivable routing graph.** `public/data/kuching/graph.json` is pedestrian (`build-graph.ts`
  walks footways and ignores one-way). Add a second profile in the same tool that keeps only
  vehicle classes, honours flag `8`, and stores per-edge class and width. `src/ui/Router.ts`
  (`RouteGraph`) is profile-agnostic: A*, snapping and maneuver generation can be reused.
- **Left-hand traffic.** Malaysia drives on the left: the lane centre for travel along a way's
  vertex order is offset `+w/4` to the left of the centreline. The offset helper already exists
  (`offsets()` in `RoadBuilder.ts`, used for kerbs).

## Runtime seams

| Concern | Today | Vehicle plug-in |
|---|---|---|
| Controller | `PlayerController` (pedestrian only: capsule vs building outlines, walk / run, jump) | New `src/vehicle/VehicleController.ts`. Do **not** extend the pedestrian controller. |
| Camera | `ThirdPersonCamera.update(dt, target, input)` takes a `CameraTarget` (`position`, `heading`, `speed`, `velocity`) | A vehicle exposes the same four fields; add a chase preset (longer boom, wider FOV range) by swapping the `CAMERA` constants |
| Input | `Input` exposes `moveX` / `moveY` / `run` / `jump`, fed by keyboard and the touch joystick | Map `moveY` to throttle / brake, `moveX` to steering, `interact` (E) to enter / exit |
| Main loop | `main.ts` calls `player.update` then `tpc.update(dt, player, input)` | Keep an `active` controllable; entering a car switches which object is updated and followed |
| Collision | `CollisionWorld`: `resolve` (circle vs outlines), `groundAt` (terrain + decks), `inWater`, `rayWalls` | A car needs an oriented-box test: reuse `forNearWalls` with 4 corner circles, and `groundAt` at the wheel positions for pitch / roll on bridges |
| Road surface | none needed for walking | "On-road" test = distance to the nearest road segment < `w/2`; the per-chunk segments are already in memory (`ChunkManager.nearestRoadName` shows the loop) |
| Streaming | `ChunkManager.update(x, z, vx, vz)` prefetches a 3 x 3 block ahead; V2 scales the look-ahead with speed and builds two chunk meshes per frame above 9 m/s | At 20 m/s a 256 m chunk passes in 13 s; measured chunk build time is the budget to watch (see `docs/perf-v2.json`, `chunkBuildMsMax`) |
| Traffic | none | Spawn along the vehicle graph inside the high-detail radius; instanced bodies (the tree / furniture path shows the pattern) |

## Suggested order

1. Vehicle graph profile + lane metadata in the data build.
2. `VehicleController` with kinematic bicycle model on the terrain / deck height field.
3. Enter / exit using the existing `interact` action; chase-camera preset.
4. Oriented-box collision against building outlines; kerb and water limits.
5. Traffic agents following the vehicle graph on the left side; signals at the 109 mapped
   traffic-signal positions already placed by the streetscape pass.

## Known obstacles

- Road widths are almost entirely inferred, so carriageways may be narrower or wider than reality.
- Junctions are overlapping ribbons, not modelled intersections: there is no junction polygon, stop
  line or lane connectivity yet.
- Bridge deck profiles are inferred (no surveyed elevations).
