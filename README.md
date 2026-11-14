# Kuching 3D

A lightweight, browser-based third-person walking simulator of the real city of
**Kuching, Sarawak, Malaysia**. Roads, building footprints, the Sarawak River, bridges, parks and
landmark positions are generated from OpenStreetMap; terrain comes from the Copernicus 30 m DEM.
You walk a human character through the actual street network, starting on the Kuching Waterfront.

It is a static site (HTML5 + TypeScript + Three.js). There is no backend and no map API at runtime.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:5173 and press **Start Exploring**. The generated map data is committed
under `public/data/kuching/`, so the app runs without fetching anything.

## Controls

| Desktop | Action |
|---|---|
| W A S D / arrow keys | Move (relative to the camera) |
| Shift | Run |
| Space | Jump |
| Mouse (click the view to capture, or drag) | Look around |
| Mouse wheel | Camera distance |
| V | First / third person |
| M | Map |
| Esc | Pause / release the mouse |

On touch devices: left joystick to move, drag anywhere else to look, pinch to zoom, **RUN** toggles
running, **JUMP** jumps. Key bindings live in `KEY_BINDINGS` in `src/player/Input.ts`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server on port 5173 |
| `npm run build` | Static production build in `dist/` |
| `npm run preview` | Serve the production build on port 4173 |
| `npm run typecheck` | TypeScript check |
| `npm test` | Unit tests (projection, routing) |
| `npm run test:e2e` | Playwright browser tests (gameplay, layouts, touch, production build) |
| `npm run data:fetch` | Download the OSM extract and DEM tile into `data-src/` (cached; `-- --force` to refresh) |
| `npm run data:build` | Regenerate `public/data/kuching/` from the cache |
| `npm run data:validate` | Compare generated assets with the OSM source geometry |
| `npm run data:all` | Fetch, build and validate |

Requirements: Node.js 24+ (the tools run TypeScript directly). Browser tests use the installed
Microsoft Edge by default; set `K3D_CHANNEL=chromium` after `npx playwright install chromium` to
use Playwright's browser instead.

## Refreshing the map data

```bash
npm run data:fetch -- --force
npm run data:build
npm run data:validate
```

To cover a different or larger area, edit `DATA_BBOX` in `src/world/config.ts` first.

## Deploying

`npm run build` produces `dist/` with `index.html` as the entry point and relative asset paths, so
it can be hosted from any static host or sub-path (GitHub Pages, Netlify, Cloudflare Pages, S3,
nginx). Serve with gzip or brotli enabled; the JSON chunk files compress about 4x.

## Documentation

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
- Elevation: Copernicus DEM GLO-30, (c) DLR e.V. 2010-2014 and (c) Airbus Defence and Space GmbH
  2014-2018, provided under COPERNICUS by the European Union and ESA; all rights reserved.
- Three.js (MIT).

Building heights are estimates unless tagged in the source, and landmark models are
approximations. See the limitations document before relying on any dimension.
