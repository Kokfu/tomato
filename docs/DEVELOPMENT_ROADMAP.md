# Development roadmap

## Expanding to wider Kuching

The loader, chunk format and pipeline are area-agnostic. To grow the map:

1. Widen `DATA_BBOX` in `src/world/config.ts` (for example 1.48-1.62 N, 110.28-110.44 E to take
   in Petra Jaya, Satok, Pending, Tabuan Jaya, BDC, Batu Lintang and Third Mile).
2. Refresh the caches for the new bbox (the Overpass extract is tiled; raise `NX`/`NY` in
   `fetch-osm.ts` for larger areas so each request stays small): run each of
   `tools/extract-map-data/fetch-osm.ts`, `fetch-overture.ts` and `fetch-dem.ts` with `--force`.
3. `npm run data:build && npm run data:validate`.

Chunk count grows with area (about 15 chunks per km2, ~5 KB each on average); the client only
ever downloads the chunks around the player, so start-up cost does not change. The DEM tile
`N01_E110` already covers 1-2 N, 110-111 E.

For very large areas, prefer a Geofabrik extract over Overpass:
download `malaysia-singapore-brunei-latest.osm.pbf` from https://download.geofabrik.de, clip it
to the bbox (`osmium extract`), convert to the same JSON shape (`osmium export` or a small
pbf reader) and feed it to `build.ts` through `loadOsm()` in `tools/generate-world/osm.ts`, which is
the only place that reads the source file.

Suggested order (connected road network first): Satok and Petra Jaya (already partly inside the
area) -> Padungan east and Pending -> Batu Lintang and Third Mile -> Tabuan Jaya and BDC.

## Data quality

- Machine-detected footprints (Overture Maps, done): filter detections that fall on mapped car
  parks, pitches and other open land use; split merged outlines; use Overture `height` /
  `num_floors` if a future release carries them for this area (the pipeline already reads them).
- Trace the machine-detected buildings into OpenStreetMap properly (with types and levels); the
  conflation then drops the detection automatically in favour of the mapped building.
- Split long shophouse-row footprints into lots along mapped `addr:*` nodes or party-wall
  heuristics (must be labelled as inferred).
- Contribute fixes upstream to OpenStreetMap (building levels, heights, sidewalks, bridge
  details) and refresh; the pipeline picks improvements up automatically.
- Higher-resolution terrain if a legally reusable DTM for Sarawak becomes available.

## World detail

- More landmark models through `LandmarkManager` (mosques, Kuching Cat statues, Plaza Merdeka,
  the Old Courthouse complex, Satok bridge).
- Street furniture from mapped nodes (street lamps, benches, bus stops, traffic signals).
- Building-passage openings and five-foot-way arcades for shophouses.
- Collision for mapped walls/fences (`barrier=*`) and tree trunks.
- Tambang river crossings (`route=ferry`) as a second way over the river.
- Time of day and weather presets.

## Engineering

- Move chunk meshing into a Web Worker (transfer typed arrays) to remove build hitches.
- Binary chunk format (quantised typed arrays) to cut parse time and size further.
- Service worker for offline play and chunk caching.
- Floating origin in `ChunkManager` once the area exceeds a few tens of kilometres.
- Automated tests on Firefox and WebKit; real-device mobile profiling.
- Optional KTX2 textures if photographic facade or ground materials are introduced.
