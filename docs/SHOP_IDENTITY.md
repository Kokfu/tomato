# Shop identity system

Business names shown in Kuching 3D come from open, licensed data that is prepared offline. The
browser never calls a places API, and **no Google data is fetched, copied or stored**: the only
Google touch-point is an outbound "Open in Google Maps" link built from the place name and
coordinates (the public Maps URL scheme).

## Sources

| Priority | Source | Licence | Trust (`v`) | Gets a facade sign |
|---|---|---|---|---|
| 1 | `data/places-overrides.json`, corrections by the project owner | owner's own data | 2 = manually verified | yes |
| 2 | OpenStreetMap named `shop` / `amenity` / `tourism` / `office` / `craft` / `leisure` / `healthcare` features, fetched once by `tools/extract-map-data/fetch-pois.ts` | ODbL 1.0 | 1 = mapped in an open source | yes, when the category is a storefront business |
| 3 | Overture Maps Places (`overturemaps download --type=place`), optional | CDLA-Permissive-2.0 and others, see Overture attribution | 0 = unverified | **never** (inspect-only) |

Overture Places are mostly derived from social-media business pages; positions are often tens of
metres off and businesses may have closed. They are therefore kept only when their confidence is
at least 0.75, dropped when OpenStreetMap already has the same business nearby (normalised name
match within 80 m), and never produce signage. An owner can promote one by saving it in the editor.

Current build (see `public/data/kuching/places/index.json` for the live numbers): 1,400 OSM places,
2,529 Overture places kept (4,624 dropped for low confidence, 548 as duplicates of OSM),
752 facade signs city-wide.

## Record

`src/world/places/types.ts` (`Place`):

| Field | Meaning |
|---|---|
| `id` | Stable identifier: `osm:node/2420355196`, `overture:<GERS id>`, `manual:<slug>` |
| `name`, `cat`, `addr` | Business name, source category, address when the source has one |
| `lat`, `lon`, `x`, `z` | WGS84 position and its projection in world metres |
| `src`, `upd` | Source and the date the source record was last updated |
| `v`, `conf` | Verification state (0 / 1 / 2) and source confidence when provided |
| `b`, `how`, `e`, `t` | Optional building association: building id, `inside` or `adjacent`, wall edge and position along it |
| `sign` | Whether a facade sign is rendered |

Files: `public/data/kuching/places/<cx>_<cz>.json` (one per chunk that has places, streamed with
the chunk) and `places/index.json` (chunk list, sources, rules, statistics).

## Building association rules

Implemented once in `src/world/places/associate.ts` and used by both the build tool and the in-app
editor. A place is tied to a building only on geometric evidence:

1. **Inside**: the point lies inside a human-mapped (OSM) building outline.
2. **Adjacent**: otherwise, the nearest outline is at most 4 m away **and** no other outline is
   within 2 m of that distance. A point in a gap between two buildings stays unassociated.
3. Machine-detected footprints (Microsoft / Google via Overture) never receive a business.
4. Otherwise the place is a free-standing point: inspectable, no sign.

A sign additionally needs a wall: on shophouse rows only street-frontage edges qualify; elsewhere
the wall must have a street within 18 m in front of it. Places deeper than 16 m inside a block get
no sign (their frontage is unknown). One building can hold many businesses; at most two signs share
one ~5 m lot (fascia board plus one above it), ordered by trust then recency.

Unit tests: `tests/unit/streetscape.test.ts` (inside / adjacent / ambiguous / far cases, sign
invariants over the generated files).

## In the world

- Signs are quads on the fascia beam over the five-foot way (or on the wall at 3.1 m for other
  buildings), oriented with the wall, text drawn into one canvas atlas per chunk (one draw call).
- Within 7 m of a known place a prompt appears; **E** / Enter / tapping it opens a panel with name,
  category, address, position, source, source date, verification state and the Google Maps link.

## Correcting data (admin)

Open the app with `?admin=1` (remembered on that device; `?admin=0` turns it off).

1. Walk to the shopfront, press **E**.
2. Edit name / category / address and **Save correction**, **Mark as closed / wrong**, or
   **Add as new place here** (uses the player position; the association rules above run in the
   browser against the loaded building outlines).
3. Corrections are stored in `localStorage` and applied immediately, including the facade sign.
4. **Export corrections** downloads `places-overrides.json`. Put it at `data/places-overrides.json`
   and run `npm run data:places`; the corrections become part of the published data with `v = 2`.

This is deliberately a file-based workflow: the site is static (Cloudflare Workers assets), so
there is no server-side database or login. A hosted editor would need an authenticated endpoint
(for example a Worker with a KV / D1 store); the override file format is the integration point.

## Limitations

- Coverage is what OSM mappers have recorded. Many shop units have no known business and keep a
  blank fascia; the app never invents names.
- Positions are single points. Where several businesses map to the same lot, only two get signs.
- Unit (lot) boundaries are not mapped; a sign is centred on the estimated lot containing the point.
- Source dates can be old (some OSM records here date from 2013 to 2019). The panel shows the date.
