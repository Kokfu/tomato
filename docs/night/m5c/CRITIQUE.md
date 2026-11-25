# M5c tour critique (hero places 5 and 6: Padungan + cat statues, City Mosque + floating mosque)

Shots: `desktop/*.jpg` (1366x768, Medium), `phone/*.jpg` (390x844 @2x, Low), sheets `sheet-desktop.jpg`, `sheet-phone.jpg`,
taken from the development server at the commit of place 6 (`f41c9db`). Same frozen cameras as M0 (`tools/dev/city-tour.json`).
Desktop: 60 fps median in all 14 views; the lowest 5 s minimum is 59.9 (`desktop/fps.json`).
The two places have their own fixed cameras with before and after: `padungan/` (seven) and `mosques/` (eight)
(tables in `../m5-padungan-cat-statue.md` and `../m5-city-mosque-floating-mosque.md`).

## Scores (1 = toy, 5 = reads as Kuching)

| # | View | M0 | M1 | M2 | M3 | M4 | M5a | M5b | M5c | What changed in M5c, and what still hurts |
|---|---|---|---|---|---|---|---|---|---|---|
| 01 | Waterfront | 2 | 2 | 3 | 3 | 3.5 | 3.5 | 3.5 | 3.5 | The floating mosque on the far left now has its photographed form (white arcade, slate dome, one slender minaret) instead of gold domes and two towers. It is small in the frame and the road is still empty: no change in score |
| 02 | Main Bazaar | 3 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | Unchanged |
| 03 | Carpenter Street | 3 | 3.5 | 3.5 | 3.5 | 3.5 | 4 | 4 | 4 | Unchanged |
| 04 | India Street | 2 | 2 | 2 | 2.5 | 2.5 | 2.5 | 4 | 4 | Unchanged |
| 05 | Jalan Gambier | 3 | 3 | 3 | 3 | 3.5 | 3.5 | 3.5 | 3.5 | Unchanged |
| 06 | Plaza Merdeka | 2 | 2 | 2 | 3 | 3.5 | 3.5 | 4 | 4 | Unchanged |
| 07 | Padungan + cat statue | 3 | 3 | 3.5 | 3.5 | 4 | 4 | 4 | 4.5 | The view's subject exists at last: the Cat Column stands on its island where a rain tree stood, and the rows behind it are crimson, yellow, teal and cream with fascia boards. Still wrong: the column is 30 m away and small; its island is bare concrete; the junction is empty of cars and people; the pink block on the left is a generic building |
| 08 | Kuching Mosque | 1 | 1 | 2 | 2.5 | 2.5 | 2.5 | 2.5 | 4 | The biggest change of this part: a plain hall under a red roof became the pink mosque with a large gold dome, smaller domes, minarets, gold window bonnets, and a cemetery of white graves either side of the lane. Still wrong: two generic little houses stand in front of the entrance; the shallow gold dome over the entrance reads as a lid; the graves are a tidy grid; no fence, no palms, nobody about |
| 09 | Satok | 1 | 1 | 1.5 | 3 | 3 | 3 | 3 | 3 | Unchanged |
| 10 | The Spring | 1 | 1 | 2 | 3 | 3 | 3 | 3 | 3 | Unchanged |
| 11 | Residential (Overture) | 2 | 2 | 3 | 3.5 | 4 | 4 | 4 | 4 | Unchanged |
| 12 | Trunk road (Openg) | 2 | 2 | 3.5 | 3.5 | 4 | 4 | 4 | 4 | Unchanged |
| 13 | River to DUN | 3 | 3 | 3.5 | 3.5 | 3.5 | 4 | 4 | 4 | Unchanged |
| 14 | Jalan China (control) | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | Unchanged |
| | **Mean** | **2.3** | **2.4** | **2.9** | **3.3** | **3.5** | **3.5** | **3.7** | **3.8** | 3.68 -> 3.82 unrounded: view 08 up 1.5, view 07 up 0.5 |

## The two places, judged from their own cameras (harshly)

**Cat Column (`padungan/after/pd-01`, `pd-02`).** Recognisable from across the junction: the blue crenellated top, the
red and green bands and the white cats are the monument. What is still wrong, worst first:
1. **The shaft is a plain grey tube.** The real one carries a key-pattern relief from top to bottom; here it is six
   bands of two greys. Close up it reads as a model.
2. **The four cats are one cat four times**, and blocky: faceted bodies, cone ears, no faces to speak of.
3. The island is bare concrete with a kerb: no planting, no railing, no plaque.

**Great Cat and gate (`pd-05` to `pd-07`).** The gate is the better half: piers, painted beam, the cream panel with
its words, five tiled roofs, and traffic can now pass under it. Worst first:
1. **The roofs are thin and flat-looking.** The real gate is heavy with tiers of brackets and curved eaves; here each
   roof is ten triangles with lifted corners. From the west the dark frieze dominates.
2. **The name panels are blank** (the inscriptions are not reproduced), which leaves the gate oddly mute.
3. The Great Cat is small beside the gate and the trees, and as faceted as the column's cats. The shrubs are domes.

**Padungan rows (`pd-03`, `pd-04`).** The colour is right and it changes the street at once. But every block is two
storeys of the same four window tiles; the real street mixes 1920s fronts with three and four storey 1970s blocks.
The fascia boards are flat bands with a lozenge; no car is parked anywhere; the kapcai are crude.

**City Mosque (`mosques/after/cm-01` to `cm-05`).** From the cemetery it is unmistakable. Worst first:
1. **The layout is a guess.** Four minarets at the corners of the outline and four small domes round the big one is
   a tidy arrangement the photographs do not confirm; the real building is less symmetrical.
2. **Two generic houses block the entrance** (machine-detected footprints, probably the real canopy seen from above).
3. The gold bonnets are three flat triangles each, the walls a single flat pink, the dome plainly faceted.
4. The graves are identical and evenly spaced; real ones are crowded, uneven and shaded by trees.

**Floating mosque (`fm-01` to `fm-03`).** The silhouette now matches its photograph, and it improves the far end of
view 01. But its colours come from a night photograph (they may be wrong), the arcade openings are black holes, the
deck is an empty slab, and the minaret is so slender that it nearly vanishes at Medium from across the lagoon.

## Three worst problems now, citywide
1. The world is empty of vehicles in motion and of people (M6): the hero places make it more obvious each time.
2. Views 09 (Satok) and 10 (The Spring) are the weakest left, at 3: a generic market block and a blank mall wall.
3. Generic buildings repeat, and every hero place is bordered by plain blocks (the pink block in view 07, the houses
   in front of the mosque, the mall behind Plaza Merdeka's entrance).
