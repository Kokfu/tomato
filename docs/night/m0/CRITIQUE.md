# M0 city-tour critique (baseline `1e16c25`, Medium desktop 1366x768, first person, day)

Shots: `desktop/*.jpg`, `phone/*.jpg` (390x844 @2x, Low), contact sheets `sheet-desktop.jpg`, `sheet-phone.jpg`.
Camera: `tools/dev/city-tour.json` (frozen, generated once by `tools/dev/city-tour-gen.mts`, each camera snapped to a mapped road).
FPS: every view sits at the 60 fps vsync cap on desktop and on the phone emulation (median 60, min 56), so FPS cannot rank
views. Compare draw calls and triangles instead (`desktop.log`, `phone.log`): view 14 Jalan China 202 calls / 408k tris,
view 02 Main Bazaar 182 / 622k, views 09-12 only 57-106 calls / 30-63k tris (the world is empty there).

## Scores (1 = toy, 5 = reads as Kuching)

| # | View | Score | Verdict in one line |
|---|---|---|---|
| 01 | Waterfront | 2 | Wide empty asphalt; the mosque and DUN are the only Kuching cues |
| 02 | Main Bazaar | 3 | Best non-China street: arcade, colour, shop goods, but still bare road |
| 03 | Carpenter Street | 3 | Pastel shophouses on the right, a blank grey slab filling the left |
| 04 | India Street | 2 | Shophouse corner then a grey block; plain paved void |
| 05 | Jalan Gambier | 3 | Good shophouse row, ground is a flat grey sheet |
| 06 | Plaza Merdeka | 2 | Long uniform grey box, no plaza character |
| 07 | Padungan + cat statue | 3 | Colourful shophouses far off, foreground empty, no cat statue visible |
| 08 | Kuching Mosque | 1 | No mosque, generic boxes on a flat green field |
| 09 | Satok | 1 | Empty paving, grey box block, no market |
| 10 | The Spring | 1 | One tiled facade wall; a mall reads as an office block |
| 11 | Residential (Overture) | 2 | Tidy but sterile: white boxes with orange roofs, empty |
| 12 | Trunk road (Openg) | 2 | Road, one lamp, green field; no kerbs, drains, trees, traffic |
| 13 | River to DUN | 3 | DUN and rain trees fine; grass and path are flat colour |
| 14 | Jalan China (control) | 4 | The standard: cars, lanterns, signs; still no haze, drains, people |
| | **Mean** | **2.3** | |

## Three worst problems per view (worst first)

**01 Waterfront**
1. Ground: a huge flat asphalt/pavement plane with no kerb, markings or drain; reads as a car park, not a riverside.
2. Buildings (right): one long uniform shophouse wall under a roof frame; nothing breaks the rhythm.
3. Atmosphere: no haze, saturated blue sky, crisp far horizon cut off flat.

**02 Main Bazaar**
1. Street: the asphalt strip has no kerb, open drain or markings; shop stock spills onto bare tarmac.
2. Left arcade: dark, flat-lit, with a sharp diagonal shadow across a mid-grey road; no ambient fill.
3. Emptiness: no people, motorbikes or parked kapcai on a market street.

**03 Carpenter Street**
1. Buildings (left 40 % of frame): a blank grey slab wall with no windows or texture; the first thing the eye hits.
2. Ground: road and pavement merge into one grey field; no five-foot-way floor, no drain.
3. Roofs: only a sliver of tile; mid-distance roofs are flat grey.

**04 India Street**
1. Buildings (right): a plain grey block with a regular window grid, the same one seen in six other views.
2. Ground: a huge cream paved void with a faint tile pattern; no stalls, awnings or furniture for a textile street.
3. Left facade: the pastel shophouse is good but ends abruptly against the box; the transition breaks the street.

**05 Jalan Gambier**
1. Ground: the lower 45 % is a flat grey road with no kerb, drain or markings.
2. Frontage: shutters repeat identically; no signs, hanging goods or five-foot-way pillar shadows.
3. Top edge: roofline cut by the frame; no roof tiles, sky wires or tree to soften it.

**06 Plaza Merdeka**
1. Buildings: one very long uniform grey box fills the frame, same window grid, no colonial pastel detail.
2. Ground: an empty asphalt apron; the open plaza is not distinguishable from a road.
3. Landmarks: Old Courthouse and Square Tower are not readable from here.

**07 Padungan + cat statue**
1. The Cat Statue is not visible: no hero object at the place named.
2. Ground: a polygonal junction of flat grey with a hard wedge of pavement; no kerb radius.
3. Distance: a pretty shophouse row but nothing between camera and it; no trees, poles, cars or bikes.

**08 Kuching City Mosque**
1. The mosque does not exist: generic boxes stand where the area's largest landmark should be.
2. Ground: a flat green-beige colour field with blotchy noise, no grass blades or blended edge with the road.
3. Buildings: three-storey boxes with a window grid and orange roof; no pitched zinc, no balconies.

**09 Satok**
1. Satok Market is absent: an empty plaza of tiles with no stalls, roof sheds or people.
2. Buildings (right): a long grey box, identical to the plaza block; no facade variety.
3. Ground: paving meets an asphalt wedge with no kerb or drain; no vegetation anywhere.

**10 The Spring**
1. A mall reads as an office wall: one beige facade with a small window grid, no entrance, signage, glass or car park.
2. Ground: flat tiled apron and a grey asphalt wedge; nothing resembles a mall forecourt.
3. Lighting: window glass is near-black on a flat wall, no depth or AO at the joins.

**11 Residential (Overture-only)**
1. Houses are white boxes with orange hip roofs and an identical window grid; no stilt houses, terraces, gates or carports.
2. Street: a bare wide road with one painted line; no kerb, monsoon drain, verge, bikes or cars.
3. Vegetation: none; Kuching suburbs are green (rain trees, palms, frangipani, hedges).

**12 Trunk road (Jalan Tun Abang Haji Openg)**
1. Road: a wide asphalt ribbon with a streaky texture, no centre line, kerbs, drains, signs or junction furniture.
2. Verge: a flat green plane with blotchy noise; no trees or roadside shrubs.
3. Life: no traffic on a trunk road; clean blue sky with no haze, a sharp horizon.

**13 River to DUN**
1. Grass and brick path are flat colour planes with hard edges: no texture, wear, or shrubs.
2. The river is a thin strip; the DUN is crisp but sits in a clean void with no haze or boats.
3. Tree canopies are faceted green blobs; one species and size.

**14 Jalan China (control)**
1. Atmosphere: no humid haze; clinical light, the street feels dry and still.
2. Ground: kerbs read well, but there is no open monsoon drain and no wet or stained asphalt.
3. Life: parked cars only; no motorbikes, pedestrians or hawker clutter beyond the shopfronts.

## Citywide (these drive M2-M5)
1. **Ground is flat colour fields and bare asphalt**: no kerbs, drains, markings, textured asphalt or grass, no blending (M2, M4).
2. **Buildings outside the hero streets are one grey/cream box with a regular window grid**, no types, roofs worth the name or colour (M3).
3. **The world is empty**: almost no trees, street furniture, vehicles or people, and no haze, so every wide shot looks like a render (M2, M4, M6).
Also: places the UI names (Kuching Mosque, Satok Market, Cat Statue, The Spring) are missing or generic (M5).
