# M2 tour critique (citywide atmosphere, light and ground)

Shots: `desktop/*.jpg` (1366x768, Medium), `phone/*.jpg` (390x844 @2x, Low), sheets `sheet-desktop.jpg`, `sheet-phone.jpg`.
Same frozen cameras as M0 (`tools/dev/city-tour.json`). Desktop: 60 fps median in all 14 views, min 52.5 (`desktop/fps.json`).

## Scores (1 = toy, 5 = reads as Kuching)

| # | View | M0 | M1 | M2 | What changed in M2, and what still hurts |
|---|---|---|---|---|---|
| 01 | Waterfront | 2 | 2 | 3 | Palms along the kerb, grass verge with texture, hazy far bank. Road still has no kerb, drain or markings |
| 02 | Main Bazaar | 3 | 4 | 4 | Softer shade under the arcade; otherwise as M1. Bare tarmac, no people |
| 03 | Carpenter Street | 3 | 3.5 | 3.5 | Unchanged: the blank grey slab on the left is a building problem (M3) |
| 04 | India Street | 2 | 2 | 2 | Paving now has concrete grain; grey block and empty mall remain |
| 05 | Jalan Gambier | 3 | 3 | 3 | Asphalt photo texture; still no kerb, drain, signs |
| 06 | Plaza Merdeka | 2 | 2 | 2 | Unchanged in substance: one long grey box |
| 07 | Padungan + cat statue | 3 | 3 | 3.5 | A rain tree and its shadow fill the empty foreground. No cat statue |
| 08 | Kuching Mosque | 1 | 1 | 2 | Ground is grass, red earth and concrete aprons with soft edges, haze behind. The mosque is still missing |
| 09 | Satok | 1 | 1 | 1.5 | Haze and one palm. Still an empty apron and a grey block; no market |
| 10 | The Spring | 1 | 1 | 2 | Lawn with texture and a tree. The mall is still an office wall |
| 11 | Residential (Overture) | 2 | 2 | 3 | Lawns, concrete verges, a red-earth fringe, roadside trees, haze down the street. Houses are still white boxes |
| 12 | Trunk road (Openg) | 2 | 2 | 3.5 | An avenue of rain trees with shadows across the road, shoulders, trees to the horizon. No markings, drains, traffic |
| 13 | River to DUN | 3 | 3 | 3.5 | Textured lawn, trees on the far bank, DUN through haze. River is a thin strip; canopies still low-poly |
| 14 | Jalan China (control) | 4 | 4 | 4 | The DUN at the end of the street now sits in humid haze. No drains, people |
| | **Mean** | **2.3** | **2.4** | **2.9** | |

## M0 atmosphere and ground items: fixed or not

- **Fixed:** flat colour ground (08, 12, 13: photo-textured grass, red earth, concrete, blended edges); no haze, crisp flat horizon
  (01, 12, 13, 14: the far city dissolves into a sky of the same colour); no trees or verge (11, 12: roadside and lot trees, verges);
  streaky road texture (12: the Jalan China asphalt photograph on every road); one tree species and size (13: four forms).
- **Partly:** tree canopies are smoother-lit but still low-poly lobes up close (12, 13); the river is tea-brown with a bank band but
  no tour view looks along it, so it barely shows.
- **Not M2 (unchanged):** kerbs, drains, markings, furniture (M4); box buildings (M3); missing landmarks (M5); traffic and people (M6).

## Three worst problems now, citywide
1. Buildings outside the hero streets are still one grey or cream box (04, 06, 08, 09, 10, 11): now the most visible fault.
2. Streets have textured asphalt but no kerbs, drains, markings or furniture (01, 05, 11, 12).
3. The world is still empty of vehicles and people; named landmarks (mosque, market, cat statue, mall) are missing.
