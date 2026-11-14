# Architecture

Kuching 3D is a static web application. All geography is prepared offline into small files; the
browser never calls a map API.

```
OpenStreetMap (Overpass, one-time)   Copernicus GLO-30 DEM tile
            |                                   |
   tools/extract-map-data/fetch-osm.ts   fetch-dem.ts          -> data-src/ (cache, not in git)
            \_________________  ________________/
                              \/
               tools/generate-world/build.ts                   -> public/data/kuching/
                 manifest.json   height.bin   landmarks.json
                 overview.json   chunks/<cx>_<cz>.json  (+ graph for routing)
                              |
               tools/validate-geography/validate.ts            -> docs/validation-report.json
                              |
                     browser runtime (src/)
```

## Coordinate system

- Source data: WGS84 latitude/longitude (EPSG:4326).
- Local frame: ellipsoidal Transverse Mercator centred on the project origin
  (1.5585 N, 110.3445 E), scale factor 1, no false origin (`src/world/GeoProjection.ts`).
  Within the prepared area the scale distortion is below 3 mm per km, so one world unit is one
  ground metre.
- World axes: **+X = east, +Y = up, -Z = north**.
- The same module is imported by the offline tools and by the browser, so both sides use one
  implementation. `tests/unit/projection.test.ts` checks round trips and compares distances with an
  independent Vincenty geodesic implementation (worst relative error 1.9e-7).
- Precision far from the origin: chunk meshes store vertices relative to their chunk corner and
  are positioned by a per-chunk transform, so vertex data never loses precision. The prepared area
  extends at most 4 km from the origin, where 32-bit float camera-relative precision is about
  0.5 mm. A floating origin becomes necessary only beyond roughly 50 km; the chunk-local layout
  means it can be added in `ChunkManager` (shift `group.position`) without regenerating data.

## Offline pipeline (`tools/`)

| Step | Script | Output |
|---|---|---|
| Fetch OSM | `extract-map-data/fetch-osm.ts` | `data-src/osm/kuching.json` (tiled Overpass queries, cached) |
| Fetch Overture buildings (optional) | `extract-map-data/fetch-overture.ts` | `data-src/overture/buildings.geojsonl` + `buildings.meta.json` (via the `overturemaps` Python CLI, cached) |
| Fetch DEM | `extract-map-data/fetch-dem.ts` | `data-src/dem/*.tif` |
| Generate | `generate-world/build.ts` | chunks, height grid, landmarks, overview, manifest |
| Routing graph | `generate-world/build-graph.ts` | pedestrian graph (see `NAVIGATION.md`) |
| Validate | `validate-geography/validate.ts` | `docs/validation-report.json` |

`build.ts` in order:

1. **Classify** OSM elements into roads, buildings, water, land-use areas, trees, piers.
2. **Water**: union all water polygons and clip to the prepared area.
   Then (**2b**, only when the Overture extract is present) **building conflation**
   (`generate-world/overture.ts`): machine-detected Microsoft / Google footprints are added where
   OSM has no building; OSM buildings are never changed. Each added building is labelled with its
   source (`s`) and gets an id of `2^52 +` 48 bits of its Overture UUID.
3. **Height grid**: sample the DEM on a 16 m grid, estimate bare ground from the surface model
   (minimum filter + blur), and blend to a constant bank level near water.
4. **Bridges**: group connected bridge ways, compute an inferred deck elevation profile.
5. **Chunking** (256 m): roads are split at chunk borders, water and land-use polygons are clipped,
   buildings are assigned whole to the chunk of their centre, terrain triangles are cut along the
   mapped shoreline so land and water meet exactly at the mapped river bank.
6. **Global files**: quantised height grid, landmark list (coordinates taken from the matching OSM
   feature), simplified overview for the full map, manifest with spawn point and statistics.

The chunk format is documented in `src/world/types.ts`. Coordinates are integer centimetres
relative to the chunk corner, which bounds the generation error at 7 mm (verified).

## Runtime (`src/`)

| Module | Responsibility |
|---|---|
| `world/WorldManager` | Scene, sky, fog, sun, shared materials, owns the chunk streamer |
| `world/ChunkManager` | Decides wanted chunks, downloads, builds one mesh set per frame, LOD, disposal, prefetch in travel direction |
| `world/HeightMap` | Terrain height sampling, identical to the terrain triangulation |
| `world/CollisionWorld` | Simplified collision: building outlines, water polygons, bridge/pier decks, passages |
| `world/TerrainBuilder` | Terrain mesh + small land-use ground texture per chunk |
| `world/RoadBuilder` | Road ribbons draped on terrain, bridge decks, railings, piers, quay walls |
| `world/BuildingBuilder` | Extruded footprints, merged per chunk; machine-detected footprints (`s` > 0) get a neutral palette and flat roofs only |
| `world/WaterBuilder` | River surface from mapped polygons, animated shader |
| `world/VegetationBuilder` | Instanced trees |
| `world/LandmarkManager` + `world/landmarks/*` | Hand-made landmark models overriding generic buildings |
| `player/PlayerController` | Kinematic character controller (substepped, frame-rate independent) |
| `player/CharacterAnimator`, `CharacterLoader` | Character visuals: GLB model with procedural fallback |
| `player/ThirdPersonCamera` | Orbit follow camera, wall and ground avoidance, first-person option |
| `player/Input` | Keyboard, mouse, pointer lock; fed by `ui/MobileControls` on touch devices |
| `ui/Minimap`, routing | Minimap, full map, landmark selection, walking routes |
| `ui/GameMenu`, `GraphicsSettings` | Start screen, pause, settings, quality presets, adaptive resolution |

### Streaming

- Chunks within `lowRadius` of the player are wanted; those within `highRadius` at full detail.
- Up to six downloads run in parallel, nearest first; chunks ahead of the direction of travel are
  prefetched.
- One chunk is meshed per frame to bound frame time. New meshes are drawn once even when
  off-screen so GPU uploads do not burst when the camera turns.
- Chunks more than one ring outside the wanted radius are unloaded: geometry, per-chunk textures,
  instanced meshes and collision data are disposed.
- The player cannot enter a chunk whose collision data is not loaded yet (a temporary boundary
  with an on-screen message), and is never spawned before the spawn chunk is built.
- Outside the prepared area there are no chunks: the boundary is solid and announced on screen.

### Level of detail

| | High detail (near) | Low detail (far) |
|---|---|---|
| Roads | all mapped ways, lane dashes | major roads and bridges only, coarser draping |
| Buildings | textured facades | flat-shaded, same footprints |
| Ground texture | 256-512 px per chunk | 128 px |
| Trees | yes | no |
| Landmark models | yes | yes (so the DUN and bridge masts stay on the skyline) |

Per chunk the scene uses: 1 terrain mesh, 0-1 water, up to 4 road layers, 0-1 markings,
0-1 structure mesh, 2 building meshes, 2 instanced tree meshes. All layers share global materials.

### Collision and walkability

Collision is independent of visual detail and of the graphics preset:

- Character = circle of radius 0.35 m, pushed out of building outline segments.
- Ground = terrain height, or the highest bridge/pier deck not more than 0.6 m above the feet.
- Water polygons are not enterable unless a deck supports the character.
- A character standing on a deck will not step off a drop larger than 1.2 m (railing rule).
- Mapped passages through buildings (`tunnel=building_passage`, `covered=yes`) waive wall
  collision inside their corridor.

### Adding a landmark model

Register an override in `src/world/landmarks/index.ts`:

```ts
manager.register({
  buildingIds: [1357531465],        // OSM ids whose generic extrusion is replaced
  roadIds: [],                      // bridge ways whose generic structure is replaced
  landmarkId: 'dun',
  build: ({ data, ctx }) => myModel // THREE.Object3D in chunk-local coordinates
});
```

Models are built lazily with their chunk and disposed with it. Positions must be derived from the
mapped footprint in `data`. See `LANDMARKS.md`.

## Testing

- `npm test`: unit tests (projection, routing) on Node's built-in test runner.
- `npm run data:validate`: generated assets against OSM source geometry, and machine-detected
  footprints against the Overture extract (within the 0.3 m simplification tolerance, none centred
  inside an OSM building).
- `npm run test:e2e`: Playwright in a real GPU-backed browser: gameplay, layout at four viewport
  sizes, touch input, production build.
