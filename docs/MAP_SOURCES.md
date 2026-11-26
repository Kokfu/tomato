# Map and image sources: what may be used, and how

This sets the rules for making Kuching 3D match the real city. It is a project rule, not legal advice; when in doubt, leave it out.

## How other games do it (2026-11-26)
- **GTA V (Los Santos):** a research team made trips with guides and architectural historians, took about 250,000 photographs plus
  video, and also used online maps and street-view tools. The city is then **built by artists and compressed**, not copied: main
  roads and landmarks sit roughly where they are in Los Angeles, but most streets are invented. Their order of work: "roads first,
  then the city, then the terrain".
- **Malaysia Lepak City** (mylepakcity.com): a Three.js browser game in a cartoon-style Kuala Lumpur, built by hand in code
  (`buildings.js`, `traffic.js`, ...) with no map data or 3D-model files seen in the page; landmarks such as KLCC are hand-made
  icons. It wins on breadth and fun (multiplayer, jobs, pets, interiors), not on accuracy.
- **Kuching 3D's position:** 1:1 real Kuching from open data, with hand-built hero places. That accuracy is what sets it apart.
  So follow GTA's order (roads first), its photo research (our own photos), and its hand-built landmarks; never Lepak City's
  "inspired by" map.

## The sources ladder (best first)

| Source | Licence | Agents may | Owner may |
|---|---|---|---|
| **Owner's own photos and video** (phone, dashcam) | the owner's own | use as references; store in `docs/refs/owner/` with place, date and "owner's own" | take them; this is the single best source |
| **OpenStreetMap** (roads, roundabouts, signals, lanes, buildings) | ODbL | use as the map data; re-fetch with the extract tools | **fix the map itself** in the iD editor at openstreetmap.org, tracing from the imagery the editor offers (Esri World Imagery, Bing, Mapbox Satellite are licensed for OSM tracing). The fix comes into the game at the next re-fetch, and helps everyone |
| **Mapillary / KartaView street photos** | CC-BY-SA 4.0 | view and use as references with attribution, record each one in `docs/ASSETS.md` | add their own (Mapillary app) |
| **Wikimedia Commons** | CC0 / CC-BY / CC-BY-SA per file | as night 1 did | |
| **Overture Maps** (building outlines, places) | ODbL / CDLA | as now | |
| **Local corrections file** `data-src/overrides/` | ours | add a correction where OSM is wrong and the owner can't fix it upstream; each line says why and how it was known | write a note; an agent turns it into an override |
| **Google Street View, Google Maps satellite, Google Earth, 3D Tiles** | Google's terms forbid tracing or digitising features from the imagery, building 3D models from it, and bulk downloading it | **never**: no screenshot, download, tracing or measuring, and no Google image in the repo or in an agent's context | look with their own eyes to remember a place and write a plain note of facts ("Bulatan X has a fountain and three lanes"); no screenshots, no tracing. For anything the game draws from, use the rows above |

**Rule for every agent:** a shape, a size or a position in the game comes from OpenStreetMap, Overture, the owner's photos or a
licensed photo, never from Google. An owner's note can say *what* is there; the *where* and *how big* come from OSM (fixed upstream
if needed) or from the owner's own photos.
