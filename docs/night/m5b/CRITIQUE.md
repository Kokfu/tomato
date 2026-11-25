# M5b tour critique (hero places 3 and 4: India Street + Jalan Gambier, Plaza Merdeka + Old Courthouse + Square Tower)

Shots: `desktop/*.jpg` (1366x768, Medium), `phone/*.jpg` (390x844 @2x, Low), sheets `sheet-desktop.jpg`, `sheet-phone.jpg`,
taken from the development server at the commit of place 4. Same frozen cameras as M0 (`tools/dev/city-tour.json`).
Desktop: 60 fps median in all 14 views; the lowest 5 s minimum is 58.0 (view 05) (`desktop/fps.json`).
The two places have their own fixed cameras with before and after: `india/` (nine) and `plaza/` (eight)
(tables in `../m5-india-street-gambier.md` and `../m5-plaza-merdeka-courthouse.md`).

## Scores (1 = toy, 5 = reads as Kuching)

| # | View | M0 | M1 | M2 | M3 | M4 | M5a | M5b | What changed in M5b, and what still hurts |
|---|---|---|---|---|---|---|---|---|---|
| 01 | Waterfront | 2 | 2 | 3 | 3 | 3.5 | 3.5 | 3.5 | Cars and kapcai now stand at the shophouse kerb of Jalan Gambier, but from this camera they line up behind one another and read as one car. The road is still empty of moving traffic |
| 02 | Main Bazaar | 3 | 4 | 4 | 4 | 4 | 4 | 4 | Unchanged |
| 03 | Carpenter Street | 3 | 3.5 | 3.5 | 3.5 | 3.5 | 4 | 4 | Unchanged |
| 04 | India Street | 2 | 2 | 2 | 2.5 | 2.5 | 2.5 | 4 | The grey four-storey block at the end of the lane is gone: a pink two-storey shophouse with two mapped shop names, an awning, a garment rail under a parasol, the canopy overhead, tile paving. The camera stands in Lorong Kai Joo, so only one bay of the mall shows; nobody is shopping |
| 05 | Jalan Gambier | 3 | 3 | 3 | 3 | 3.5 | 3.5 | 3.5 | Three parked cars and coloured blinds in front of the row. The cars are crude boxes with a window band; no goods on the five-foot way, no people. Not enough for a higher score |
| 06 | Plaza Merdeka | 2 | 2 | 2 | 3 | 3.5 | 3.5 | 4 | The mall has a way in: a white portal with glazing, a canopy, bollards, planters and its mapped name. Behind it the mall is still the same generic block, and the entrance is small in the frame |
| 07 | Padungan + cat statue | 3 | 3 | 3.5 | 3.5 | 4 | 4 | 4 | Unchanged (hero place 5) |
| 08 | Kuching Mosque | 1 | 1 | 2 | 2.5 | 2.5 | 2.5 | 2.5 | Unchanged (hero place 6) |
| 09 | Satok | 1 | 1 | 1.5 | 3 | 3 | 3 | 3 | Unchanged |
| 10 | The Spring | 1 | 1 | 2 | 3 | 3 | 3 | 3 | Unchanged |
| 11 | Residential (Overture) | 2 | 2 | 3 | 3.5 | 4 | 4 | 4 | Unchanged |
| 12 | Trunk road (Openg) | 2 | 2 | 3.5 | 3.5 | 4 | 4 | 4 | Unchanged |
| 13 | River to DUN | 3 | 3 | 3.5 | 3.5 | 3.5 | 4 | 4 | Unchanged |
| 14 | Jalan China (control) | 4 | 4 | 4 | 4 | 4 | 4 | 4 | Unchanged |
| | **Mean** | **2.3** | **2.4** | **2.9** | **3.3** | **3.5** | **3.5** | **3.7** | 3.54 -> 3.68 unrounded: views 04 and 06 up to 4 |

## The two places, judged from their own cameras (harshly)

**India Street (`india/after/in-01` to `in-05`).** From inside the mall this is the biggest single change of the night
so far: it reads at once as the covered street. What is still wrong, worst first:
1. **Nobody is there.** A textile bazaar without shoppers or stall keepers is a film set (M6).
2. **The canopy is a plain vault.** Clean white cloth, no ornament, no banners, no dirt. Unlit, so it will glow at night.
3. **Stalls are blocks of colour** and the same two kinds repeat 35 times; the parasols are flat cones.
4. **Every lot is a five-foot-way shophouse of the generic kit.** The real fronts (shutters, signboards over the full
   width, goods spilling out) are busier; upper windows are the same four tiles as everywhere else.
5. The paving's diamonds are large and tidy; the street has no drains, lamps, benches or bins of its own.

**Jalan Gambier (`gb-01` to `gb-04`).** Cars at the kerb and a filled car park help from far away. Close up the cars
are the weakest thing added tonight: boxes with a dark band. The riverside is unchanged, and the Gambier row has
nothing in its five-foot way.

**Square Tower (`plaza/after/sq-01` to `sq-03`).** Now recognisable: the corner turret and the red-brown shutters are
the building. Hoods and shields are flat patches; two faces are guesses; the neighbouring kiosks are still generic.

**Old Courthouse (`ch-01` to `ch-03`).** The clock tower reads from the forecourt, and the ranges have columns. But the
complex is still mostly a very large brown roof: truncated hips with a flat top, no ridges, bare courtyards, columns
flat against the wall instead of an open verandah. From the air it is the least convincing of the three.

**Plaza Merdeka (`pm-01`, `pm-02`).** An entrance where the map says people arrive. Its form is invented (no
photograph), and the block behind it has no hotel tower.

## Three worst problems now, citywide
1. The world is empty of vehicles in motion and of people (M6): every dressed street makes it more obvious.
2. Named landmarks still missing or generic: the cat statue (07), the City Mosque (08), Satok market (09), the GPO.
3. Generic buildings repeat, and the new hand-dressed places show up the plain blocks beside them (the mall, the rear
   of the India Street block, the Gambier car park's surroundings).
