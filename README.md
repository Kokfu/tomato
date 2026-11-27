# Kuching 3D

A browser open world of the real city of **Kuching, Sarawak, Malaysia**. Roads, building footprints, the Sarawak
River, bridges, parks and landmark positions are generated from OpenStreetMap; where OpenStreetMap has no building,
machine-detected footprints from Overture Maps (Microsoft, Google) are added; terrain comes from the Copernicus 30 m DEM.

It is a static site (TypeScript + Three.js + Vite). There is no backend and no map API at runtime.

## What you can do

- **Walk** the real street network as one of six characters, starting on the Kuching Waterfront.
- **Drive:** take the car by Jalan China, or any parked car, kapcai motorbike, taxi or pickup placed round the city.
- **Work:** open the phone (T) for food deliveries and taxi fares between mapped places, follow the GPS, get paid,
  repair your vehicle. Progress is saved in this browser.
- **See the city live:** a passing day with lit streets at night, occasional tropical rain, traffic keeping left,
  stopping at traffic lights that change colour on the same clock, giving way on roundabouts, and walkers.
- **Drive real Kuching roads (night 2):** kerbed roundabout islands, splitter islands and give-way lines, grass medians
  with palms and twin-arm lamps on the dual carriageways, widths from mapped lane counts, the Satok suspension bridge,
  and signal poles with working heads at 44 mapped and 11 inferred junctions.
- **Visit hand-built places:** Jalan China, Carpenter Street, Main Bazaar and the Waterfront, India Street,
  Jalan Gambier, the Square Tower and Old Courthouse, Plaza Merdeka's entrance, Jalan Padungan with its cat statues
  and gate, the City Mosque and the floating mosque.
- **Everywhere else:** typed generic Kuching buildings, kerbs, drains, lane markings, lamps, trees and humid haze.
  Most of that detail is inferred, not mapped: see [Limitations](docs/LIMITATIONS.md).

Night 1 (what changed, measurements, known issues): [docs/night/REPORT.md](docs/night/REPORT.md).
Night 2 (trust and roads): [docs/night2/REPORT.md](docs/night2/REPORT.md). Every night-2 road change can be switched off
with `?roads=0`, `?signals=0` or `?inferredSignals=0` ([docs/FLAGS.md](docs/FLAGS.md)).

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000 (or http://kuching.duckdns.org:3000 via port forwarding) and press **Start Exploring**. The generated map data is committed
under `public/data/kuching/`, so the app runs without fetching anything.

## Controls

| Desktop | Action |
|---|---|
| W A S D / arrow keys | Move (relative to the camera) |
| Shift | Run |
| Space | Jump |
| E / Enter | Inspect the nearest known shop or place |
| Mouse (click the view to capture, or drag) | Look around |
| Mouse wheel | Camera distance |
| V | First / third person |
| M | Map (set a GPS destination) |
| T | Phone: jobs, wallet, garage, save (since N1-M7) |
| Esc | Pause / release the mouse |

### Driving

A yellow car waits at the mouth of Jalan China, just off Jalan Main Bazaar. Other vehicles stand parked beside service
roads (three kinds more 30 m from that car). Walk up to one and press **E**.

| Desktop | Action |
|---|---|
| E | Get in / get out (the vehicle must be stopped) |
| W | Accelerate |
| S | Brake, then reverse |
| A / D | Steer |
| Space | Handbrake |
| H | Horn |
| Mouse / wheel | Rotate the chase camera / camera distance |
| R | Put the vehicle back on the last valid road position |
| P | OP fly mode (the vehicle brakes to a stop while it is on) |

On touch devices: left joystick to move, drag anywhere else to look, pinch to zoom, **RUN** toggles running, **JUMP**
jumps; on-screen buttons drive, sound the horn and open the phone. Key bindings live in `KEY_BINDINGS` in
`src/player/Input.ts`.

## Address-bar switches

Everything below is **on by default**; add the parameter to turn it off or to fix the time and weather
(combine with `&`, for example `?life=0&time=night`). Details: [docs/FLAGS.md](docs/FLAGS.md).

| Parameter | Effect |
|---|---|
| `?m7=0` | No play loop (vehicles to take, jobs, money, phone, collisions, save) |
| `?life=0` | No traffic or walkers (also removes the parked vehicles) |
| `?m5=0` | No hero places from night 1 |
| `?c1=0` | Earlier Upper China Street corner |
| `?v9=0` | Earlier Main Bazaar arcade |
| `?ux1=0` | No controls quick guide |
| `?char=0` | Single earlier character, no picker |
| `?time=day` / `evening` / `night` / `auto` / `0`..`24` | Time of day |
| `?rain=off` / `on` / `auto` | Weather |
| `?render=v4` | The older rendering |

The night-1 atmosphere, ground, building and street work (M2 to M4) has no switch.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server on 0.0.0.0:3000 |
| `npm run build` | Static production build in `dist/` |
| `npm run preview` | Serve the production build on 0.0.0.0:3000 |
| `npm run typecheck` | TypeScript check |
| `npm test` | Unit tests (Node) |
| `npm run test:e2e` | Playwright browser tests (gameplay, layouts, touch, production build) |
| `npm run data:fetch` | Download the OSM extract, the Overture buildings extract and the DEM tile into `data-src/` (cached) |
| `npm run data:build` | Regenerate `public/data/kuching/` from the cache |
| `npm run data:validate` | Compare generated assets with the OSM and Overture source geometry |
| `npm run data:all` | Fetch, build and validate |

Requirements: Node.js 24+ (the tools run TypeScript directly). The Overture step of
`data:fetch` additionally needs the `overturemaps` Python CLI (`pip install overturemaps`, Python
3.10+, either on PATH or in a virtual environment at `data-src/venv`); without it that step is
skipped with a message and the world is built from OpenStreetMap buildings only. Browser tests use the installed
Microsoft Edge by default; set `K3D_CHANNEL=chromium` after `npx playwright install chromium` to
use Playwright's browser instead.

## Refreshing the map data

`npm run data:streetscape` (shophouse rows, street furniture) and `npm run data:places` (shop
identities; reads `data/places-overrides.json`) can be run on their own after editing their inputs.

```bash
node tools/extract-map-data/fetch-osm.ts --force
node tools/extract-map-data/fetch-overture.ts --force
npm run data:build
npm run data:validate
```

(`npm run data:fetch -- --force` passes `--force` only to the last step, the DEM download.)

To cover a different or larger area, edit `DATA_BBOX` in `src/world/config.ts` first.

## Deploying

`npm run build` produces `dist/` with `index.html` as the entry point and relative asset paths, so
it can be hosted from any static host or sub-path (GitHub Pages, Netlify, Cloudflare Pages, S3,
nginx). Serve with gzip or brotli enabled; the JSON chunk files compress about 4x.

## Documentation

V2 (visual realism, shop identity, gameplay feel):

- [docs/V2_REPORT.md](docs/V2_REPORT.md): audit, before / after screenshots, measured performance, limitations, files changed
- [docs/STREETSCAPE.md](docs/STREETSCAPE.md): shophouse rows, materials, street furniture; what is mapped and what is inferred
- [docs/SHOP_IDENTITY.md](docs/SHOP_IDENTITY.md): business data model, sources, association rules, the `?admin=1` correction editor
- [docs/VEHICLES.md](docs/VEHICLES.md): integration points for future driving

Earlier documents:

- [Architecture](docs/ARCHITECTURE.md)
- [Geographic sources and licences](docs/GEOGRAPHIC_SOURCES.md)
- [Data coverage report](docs/DATA_COVERAGE.md)
- [Landmarks](docs/LANDMARKS.md)
- [Navigation and routing](docs/NAVIGATION.md)
- [Assets](docs/ASSETS.md)
- [Performance measurements](docs/PERFORMANCE.md)
- [Test results](docs/TEST_RESULTS.md)
- [Limitations](docs/LIMITATIONS.md)
- [Roadmap](docs/DEVELOPMENT_ROADMAP.md)

## Attribution

- Map data (c) [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, ODbL 1.0.
- Additional machine-detected building footprints from the
  [Overture Maps Foundation](https://docs.overturemaps.org/attribution/) buildings theme
  (release 2026-10-21.0, ODbL 1.0): Microsoft
  [Global ML Building Footprints](https://github.com/microsoft/GlobalMLBuildingFootprints)
  (ODbL as distributed by Overture) and [Google Open Buildings](https://sites.research.google/gr/open-buildings/)
  (CC BY 4.0). Details and the exact licence statements found are in
  [Geographic sources](docs/GEOGRAPHIC_SOURCES.md).
- Elevation: Copernicus DEM GLO-30, (c) DLR e.V. 2010-2014 and (c) Airbus Defence and Space GmbH
  2014-2018, provided under COPERNICUS by the European Union and ESA; all rights reserved.
- Three.js (MIT).

Building heights are estimates unless tagged in the source, many buildings are
machine-detected outlines of lower accuracy, their types guessed, and landmark models are approximations. See the limitations document before relying on any dimension.

## V3: Main Bazaar test district

A single high-fidelity district (Jalan Main Bazaar and the Waterfront) is described in `docs/V3_REPORT.md`: diagnosis, Google 3D Tiles feasibility, before/after screenshots, shop identity coverage, tests and measured performance.
