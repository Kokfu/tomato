# M3 tour critique (buildings everywhere)

Shots: `desktop/*.jpg` (1366x768, Medium), `phone/*.jpg` (390x844 @2x, Low), sheets `sheet-desktop.jpg`, `sheet-phone.jpg`.
Same frozen cameras as M0 (`tools/dev/city-tour.json`). Desktop: 60 fps median in all 14 views, min 56.1 (`desktop/fps.json`).
`extra-kampung.jpg` is not a tour view: a kampung street (chunk 12_-1), taken mid-milestone, to show the stilt houses.

## Scores (1 = toy, 5 = reads as Kuching)

| # | View | M0 | M1 | M2 | M3 | What changed in M3, and what still hurts |
|---|---|---|---|---|---|---|
| 01 | Waterfront | 2 | 2 | 3 | 3 | Nothing in frame is a generic building. Road still has no kerb, drain or markings |
| 02 | Main Bazaar | 3 | 4 | 4 | 4 | Unchanged (hero street). Bare tarmac, no people |
| 03 | Carpenter Street | 3 | 3.5 | 3.5 | 3.5 | **Not fixed.** The blank slab on the left is the flank wall of the hand-built Jalan China section (`v5-scene`), not a generic building: it belongs to M5 place 2 |
| 04 | India Street | 2 | 2 | 2 | 2.5 | The block at the end now has panelled cladding, glass strips and glazed shopfronts under a canopy. Still an empty mall with no stalls, awnings or people |
| 05 | Jalan Gambier | 3 | 3 | 3 | 3 | Unchanged (heritage row). No kerb, drain, signs |
| 06 | Plaza Merdeka | 2 | 2 | 2 | 3 | The long grey box is a mall: cladding with joints, glass strips, banner frames, a glazed ground floor under a canopy slab. Cladding repeats visibly; no entrance, no name sign |
| 07 | Padungan + cat statue | 3 | 3 | 3.5 | 3.5 | The grey block at the left edge is a red concrete shop block with shutters. No cat statue |
| 08 | Kuching Mosque | 1 | 1 | 2 | 2.5 | Houses with tile roofs and eaves; the large building is a generic hall with round-headed windows under a hip roof. It is still not the mosque (a landmark form is never invented: M5) |
| 09 | Satok | 1 | 1 | 1.5 | 3 | Three- and four-storey shop blocks with sign boards, shutters and air-conditioners line the square; a mid-rise with ribbon windows on the right. Still an empty apron, no market |
| 10 | The Spring | 1 | 1 | 2 | 3 | Reads as a mall podium: cladding, glass strips, shopfront glazing, deep canopy. No entrance or sign; tree is a blob |
| 11 | Residential (Overture) | 2 | 2 | 3 | 3.5 | Houses with hip and gable tile roofs, overhanging eaves, grilled windows and doors; a zinc shed; a ribbed-metal warehouse. No fences, gates, car porches or cars |
| 12 | Trunk road (Openg) | 2 | 2 | 3.5 | 3.5 | The blocks beyond the avenue are shop blocks with shopfronts. No markings, drains, traffic |
| 13 | River to DUN | 3 | 3 | 3.5 | 3.5 | Unchanged in frame |
| 14 | Jalan China (control) | 4 | 4 | 4 | 4 | Unchanged |
| | **Mean** | **2.3** | **2.4** | **2.9** | **3.3** | |

## M2's building items: fixed or not

- **Fixed:** one grey or cream box per footprint (04, 06, 09, 10, 11, 12): every generic building now has a type with its own
  facade rows, roof form, palette and height; machine-detected footprints are no longer grey.
- **Partly:** 08 (a plausible hall stands where the mosque should be); 04 (the street is still empty).
- **Not M3:** 03's slab (V5 section wall, M5); missing landmarks (mosque, market, cat statue: M5); kerbs, drains, markings (M4).

## What is still wrong with the new buildings (honest)

1. **Repetition.** One atlas row per storey: a long mall or shop row repeats the same two bays; sign boards alternate two colours.
2. **Flat fronts.** Windows, grilles, air-conditioners and shutters are painted, not modelled; only canopies, eaves, parapets,
   stilts and roof tanks have depth. No five-foot-way recess on the generic shop blocks.
3. **Guessed types.** A big suburban footprint becomes a "warehouse", a compact mid-size one a shop block; some are wrong (11's
   warehouse is probably a hall). Type can flip across a chunk border.
4. **No yards.** Houses have no fence, gate, car porch or parked car, so residential streets still look bare.

## Three worst problems now, citywide
1. Streets have no kerbs, drains, markings or furniture (01, 05, 11, 12): now the most visible fault (M4).
2. Named landmarks are missing or generic (08 mosque, 09 market, 07 cat statue) and 03's blank section wall (M5).
3. The world is empty of vehicles and people (M6).
