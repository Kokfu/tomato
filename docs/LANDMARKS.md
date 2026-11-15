# Landmark models

**Every landmark model in Kuching 3D is an approximation.** The models are original procedural
geometry written in code (`src/world/landmarks/*.ts`). No photographs, Street View imagery or
third-party 3D assets were used. What comes from mapped data is the *position, orientation and
plan outline* (OpenStreetMap, via the chunk files); everything listed under "Approximated" is an
estimate based on public written descriptions and general knowledge of the buildings, and should
not be read as a survey.

Rules the builders follow:

- No world coordinates are written in code. A builder looks up its OSM feature id in the chunk
  being built and fits the model to that footprint (minimum-area oriented bounding box, centroid,
  or the outline itself) or to the bridge way geometry.
- One merged vertex-colour mesh (one draw call) per landmark per chunk, using the shared
  `ctx.mats.landmark` material. Geometry is disposed with its chunk.
- Collision is unchanged: buildings collide by their mapped footprint, the bridge by the deck
  segments generated from the mapped ways. Model details (towers, posts, masts, platforms inside a
  footprint) have no collision of their own.
- Landmark builders run for low-detail (distant) chunks as well, so the DUN roof and the bridge
  masts stay on the skyline (small change in `ChunkManager.build`).

Research note: the reference facts below come from two fetched pages (the schlaich bergermann
partner project page and the Wikipedia article for the bridge) and from web-search result
summaries of the other pages named under "Sources". Anything not stated there (most proportions,
colours and details) is general knowledge of the buildings and is listed as approximated.

Triangle counts were read from the running app (`node tools/dev/shots.ts ... --landmarks`).

| Landmark | File | OSM feature | Triangles |
| --- | --- | --- | --- |
| Darul Hana Bridge | `darulHanaBridge.ts` | ways 568501299, 634697570, 779037132, 779315127, 779315128 | 4,382 (all chunks together) |
| DUN (State Legislative Assembly) | `dun.ts` | way 1357531465 | 1,101 |
| Fort Margherita | `fortMargherita.ts` | relation 12489078 | 1,216 |
| The Astana | `astana.ts` | way 353344429 | 660 |
| Tua Pek Kong Temple | `tuaPekKong.ts` | way 269781302 (plot, see below) | 642 |
| Borneo Cultures Museum | `borneoCulturesMuseum.ts` | way 835977956 | 1,171 |
| Square Tower | `squareTower.ts` | way 817868530 | 530 |
| Old Courthouse | `oldCourthouse.ts` | relation 10459393 | 508 |
| Masjid India (floating mosque) | `floatingMosque.ts` | way 568501301 | 2,376 |

Screenshots: `docs/screenshots/landmarks/`.

## Darul Hana Bridge

- **Mapped:** deck centre lines of the main S-curved span (way 568501299), the south approach
  (634697570, 779037132) and the two short dead-end spurs (779315127, 779315128), which are the
  viewing platforms. Deck width 3.25 m is the pipeline's width for these ways and matches the
  published width.
- **Inferred by the data pipeline:** deck elevations (OSM has none). The deck is about 12 m above
  bank level over the river, which agrees with the published "about 12 m above the water", but
  the ramp profile is generated, not surveyed. A small change in section 4 of
  `tools/generate-world/build.ts` keeps short dead-end spurs level with the deck they branch from
  (the north platform previously sloped by 1 m).
- **Approximated:**
  - Two steel masts. Published: 64 m long, inclined outwards; an inclination of 48 degrees is
    published without saying what it is measured from - the model takes it from the horizontal,
    which gives a top about 48 m above the foot. Mast feet are placed 3.2 m beyond the mapped spur
    ends and the masts lean along the mapped spur directions; the real foot positions are not
    mapped. The arc distance between the two mapped spurs is about 135 m, which matches the
    published 133 m main span, so the spurs are a reasonable proxy for the mast positions.
  - Hornbill-inspired mast heads (beak and casque) are stylised shapes of our own.
  - Stay cables: one-sided fans to the deck edge on the mast side, 6.5 m spacing; number and
    anchor positions are estimates. Cables are drawn 14 cm thick so they remain visible.
  - Triangular truss under the deck (published depth 1.62 m), railings, pile caps, columns under
    the land sections (14 m spacing).
- **Chunks:** every chunk builds the deck structure for the way pieces it contains (pieces are
  split at chunk borders and share their end points, so they join without gaps); masts, pile caps
  and cables are built only by the chunk that contains the dead end of a spur.
- **Sources:** schlaich bergermann partner project page (lengths, mast length, deck width, truss
  depth, one-sided support); Wikipedia "Darul Hana Bridge" (inclination, opening); Borneo Post /
  Dayak Daily / Sarawak Tourism articles (hornbill and Bidayuh bamboo bridge references, height
  above water).

## New Sarawak State Legislative Assembly Building (DUN)

- **Mapped:** position and the star-shaped podium outline (20 nodes). The rotation of the nine
  roof ridges is taken from the direction of the outline's farthest vertex.
- **Approximated:** two podium tiers (the outline, and the outline scaled to 74 %), a round glazed
  drum with 36 columns, the nine-ridged concave "payung" (royal umbrella) roof in gold, the spire.
  Overall height 114 m is the published figure; the tier heights, drum radius (40 % of the mean
  outline radius), roof radius and profile are estimates. The OSM `building:levels` value would
  give only about 31 m and is not used.
- **Sources:** Wikipedia "New Sarawak State Legislative Assembly Building" (nine floors, 114 m,
  nine-pointed star plan, payung roof); StarProperty "Malaysian-themed buildings of prominence".

## Fort Margherita

- **Mapped:** position, outer wall outline and the inner courtyard ring (multipolygon).
- **Approximated:** wall height (6.6 m), battlements, the three-storey crenellated tower block.
  The tower is not mapped separately: it is placed on the point of the mapped solid area that is
  farthest from every wall line, and its real position and size may differ. White colour, window
  slits and the flagstaff are estimates.
- **Sources:** Wikipedia "Fort Margherita"; Sarawak Museum Department page; Sarawak Tourism
  "Kuching heritage" (square plan, battlements, three-storey tower, courtyard). The white colour
  is general knowledge, not stated on these pages.

## The Astana

- **Mapped:** position, outline and orientation of the palace blocks.
- **Approximated:** the outline is decomposed into rectangular wings (white walls, hipped
  dark shingle roofs) by slicing it along its long axis; the plinth follows the exact outline.
  The crenellated entrance tower is not mapped: it is placed in the middle of the facade that
  faces the river according to the terrain data, which for the mapped outline is the short south
  end. In reality the tower stands in the middle of the main frontage, so its position here is
  the weakest part of this model. Heights and openings are estimates.
- **Sources:** Wikipedia "The Astana, Sarawak" (three bungalows joined by passages, crenellated
  tower, 1870); Dayak Daily "Astana Negeri". The shingle roofs and white walls are general
  knowledge, not confirmed by these pages.

## Tua Pek Kong Temple (Siew San Teng)

- **Mapped:** OSM has no building outline for the temple, only the plot (way 269781302, tagged
  `amenity=place_of_worship`, about 433 m2). A small addition to the data pipeline
  (`tools/generate-world/build.ts`, section 1) turns closed place-of-worship plots of at most
  700 m2 that contain no mapped building into a building of kind "religious" with an estimated
  height; in the current extract this affects only this temple. The plot is therefore an
  **approximate footprint**, and it is also what the player collides with.
- **Approximated:** everything else - a stone terrace with front steps, a red main hall at the
  rear, an open front pavilion with red columns and a two-tier roof, curved tiled roofs with
  upswept ridge ends and gold finials. The front is the short end facing the river.
- **Sources:** Wikipedia "Tua Pek Kong Temple, Kuching" (oldest temple in the city, near the
  waterfront); a visitor-guide description (curved tiled roofs, dragon motifs). Colours, the
  pavilion layout and the river-facing front are general knowledge.

## Borneo Cultures Museum

- **Mapped:** position, outline, orientation, `building:levels=5`.
- **Approximated:** storey height of 5.2 m (26 m to the roof edge; museum floors are taller than
  the generic 3.3 m), a glazed ground floor, faceted gold and bronze diamond cladding (publicly
  described as a black-and-gold woven-craft motif), and the shallow golden arched roof (6.5 m
  rise). The real facade pattern and roof shape are more intricate.
- **Sources:** Sarawak Museum Department pages; Going Places (Malaysia Airlines) and The Star
  articles on the museum's opening (gold cladding, arched roof, craft motifs, five levels).

## Square Tower

- **Mapped:** position, square outline, orientation, levels.
- **Approximated:** crenellated two-storey body, taller central tower, openings, white colour.
- **Sources:** no dedicated source was retrieved; modelled from general knowledge of the building
  (white, square, crenellated, built 1879 as a fort / prison).

## Old Courthouse

- **Mapped:** position, outline of the single-storey blocks, the courtyard (multipolygon).
- **Approximated:** verandah openings, belian-shingle roofs built as an inset "truncated hip"
  (slopes rise from every wall to an outline inset by 3.4 m, flat on top; real roofs have
  ridges), and the clock tower, which is not mapped and is placed at the middle of the longest
  outer wall.
- **Sources:** Wikipedia "Kuching Old Courthouse" (1874, four blocks, ironwood roof, clock tower
  added 1883); Sarawak Tourism "Kuching heritage".

## Masjid India Bandar Kuching (floating mosque)

- **Mapped:** position and outline (mosque with its platform at the river edge).
- **Approximated:** platform, arcaded prayer hall (outline inset by a terrace width), one large
  and four small golden onion domes, two minarets on the river side, heights and colours.
- **Sources:** general public descriptions of the mosque (opened 2019, golden domes, built over
  the river beside the waterfront); no dimensional source was found.

## General buildings (`src/world/BuildingBuilder.ts`)

These are generic rules, not landmark models, and all roof shapes are **inferred** (OSM has no
roof data for Kuching):

- Houses, huts and low-rise unclassified buildings with a simple rectangular footprint get a
  terracotta gable roof (some houses a hip roof) with eaves at the mapped / estimated height. The
  ridge follows the long axis.
- Other low-rise blocks of those kinds (up to 12 m, single outline) get a tiled roof edge: slopes
  from every wall to an inset outline, flat on top. This covers shophouse rows that OSM maps as
  one irregular block. Modern flat-roofed low-rise buildings of the same kinds are affected too.
- Open roofs (`building=roof`, for example the shelter at the waterfront spawn) now have an
  underside and thin support posts at inferred positions (outline corners, long edges every
  ~7 m, at most 16 per roof). Posts are visual only; open roofs still have no collision.
- Footprints, heights and collision are unchanged; walls and roofs are still one merged mesh each
  per chunk. The extract contains no `building=shophouse` tags, so the "narrow shophouse unit"
  ridge rule in the code is currently unused.

## Registered landmark models (V4)

Hiang Thian Siang Ti Temple, Lau Ya Keng Food Court and the Yang Choon Tai opera stage are drawn by dedicated glTF models through the landmark registry (`src/world/landmarks/registry.ts`), not by the builders described above. See [LANDMARK_RECONSTRUCTION.md](LANDMARK_RECONSTRUCTION.md) and [LANDMARK_AUDIT.md](LANDMARK_AUDIT.md).
