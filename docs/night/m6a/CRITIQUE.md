# M6 part A tour critique (day/night cycle and rain)

Shots, all from the production build of this commit (served locally), same frozen cameras as M0 (`tools/dev/city-tour.json`):
- `desktop/*.jpg` (1366x768, Medium) and `phone/*.jpg` (390x844 @2x, Low): the normal tour on the frozen dry day at 09:40.
- `night/*.jpg`: ten tour views at 21:00, a view over the river (`river-lights`), dusk (18:00, 18:09) and dawn (06:12).
- `rain/*.jpg`: five tour views in full rain at 13:00 and three at 20:30.
- `phone-night/`, `phone-rain/`: four views each on the emulated phone (Low).
- Sheets: `sheet-desktop.jpg`, `sheet-phone.jpg`, `sheet-night.jpg`, `sheet-rain.jpg`, `sheet-phone-night-rain.jpg`.
Desktop: 60 fps median in every view of every set; the lowest 5 s minimum is 58 by day, 59.9 at night, 59.3 in rain.

## Day tour scores (1 = toy, 5 = reads as Kuching)

Part A changes nothing by day: at 09:40 every light factor is exactly 1, and the sheets match M5c view for view.
The first two views carry the "Playing as ..." toast of a fresh start; it is not part of the scene.

| # | View | M0 | M1 | M2 | M3 | M4 | M5a | M5b | M5c | M6a | What still hurts |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 01 | Waterfront | 2 | 2 | 3 | 3 | 3.5 | 3.5 | 3.5 | 3.5 | 3.5 | Unchanged by day. The road is still empty (traffic and people are part B) |
| 02 | Main Bazaar | 3 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | Unchanged |
| 03 | Carpenter Street | 3 | 3.5 | 3.5 | 3.5 | 3.5 | 4 | 4 | 4 | 4 | Unchanged |
| 04 | India Street | 2 | 2 | 2 | 2.5 | 2.5 | 2.5 | 4 | 4 | 4 | Unchanged |
| 05 | Jalan Gambier | 3 | 3 | 3 | 3 | 3.5 | 3.5 | 3.5 | 3.5 | 3.5 | Unchanged |
| 06 | Plaza Merdeka | 2 | 2 | 2 | 3 | 3.5 | 3.5 | 4 | 4 | 4 | Unchanged |
| 07 | Padungan + cat statue | 3 | 3 | 3.5 | 3.5 | 4 | 4 | 4 | 4.5 | 4.5 | Unchanged |
| 08 | Kuching Mosque | 1 | 1 | 2 | 2.5 | 2.5 | 2.5 | 2.5 | 4 | 4 | Unchanged |
| 09 | Satok | 1 | 1 | 1.5 | 3 | 3 | 3 | 3 | 3 | 3 | Unchanged: no market, an empty forecourt |
| 10 | The Spring | 1 | 1 | 2 | 3 | 3 | 3 | 3 | 3 | 3 | Unchanged |
| 11 | Residential (Overture) | 2 | 2 | 3 | 3.5 | 4 | 4 | 4 | 4 | 4 | Unchanged |
| 12 | Trunk road (Openg) | 2 | 2 | 3.5 | 3.5 | 4 | 4 | 4 | 4 | 4 | Unchanged |
| 13 | River to DUN | 3 | 3 | 3.5 | 3.5 | 3.5 | 4 | 4 | 4 | 4 | Unchanged |
| 14 | Jalan China (control) | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | Unchanged |
| | **Mean** | **2.3** | **2.4** | **2.9** | **3.3** | **3.5** | **3.5** | **3.7** | **3.8** | **3.8** | 3.82 unrounded, as M5c |

## Night (21:00), scored the same way and harshly

| View | Score | What works | Worst problems, worst first |
|---|---|---|---|
| 01 Waterfront | 3.5 | A lamp's pool lies across Jalan Gambier, the floating mosque and the DUN stand lit against a starry sky | The shophouse row on the right is a dark blue slab: shutters down, no light under the five-foot way. Nothing lights the promenade side |
| 02 Main Bazaar | 3 | Open shops glow down both arcades | The shop interiors are as bright as by day and evenly so: light boxes, not lit rooms. The lane itself is black (no lamp stands in it) |
| 03 Carpenter Street | 3 | Warm street, lit awning | The corner wall glows evenly from top to bottom (the street wash has no source); no shadow anywhere |
| 04 India Street | 3.5 | Lit shop names, two lit shops, the canopy goes dark with the sky | Upper windows are flat cream rectangles, each whole window one colour. The paving is unlit |
| 07 Padungan | 3.5 | The Cat Column is lit; rows carry lit windows and boards | One pool of light far down the road; the junction in front is dark and empty |
| 08 Kuching Mosque | 4 | Pink walls and gold domes floodlit over a dark cemetery: reads at once | The two little houses in front are lit like the mosque is not their neighbour; graves are black blobs |
| 09 Satok | 3.5 | Random lit bays in warm and cool white are convincing at this distance; shop strips glow | The glass block on the right is a wall of huge bright panels. The forecourt is a black lake |
| 11 Residential | 3.5 | A lamp pool, a few lit windows, dark roofs | Too few lit houses for 21:00; the warehouse-like shed is lit like a home |
| 13 River to DUN | 4 | Gold roof lit, festoon lights along the walk | The river is almost out of frame; trees are flat black |
| 14 Jalan China | 4 | Lanterns, lit boards and a warm street: the best night view | Parked cars are evenly pale, nothing casts a shadow, the reflections are still a daytime sky, only weaker |
| River lights | 3 | The bridge and DUN stand lit; one streak of light lies on the water | Only one of seven lights shows from here; the bank itself is not mirrored |
| **Mean** | **3.5** | | |

Dusk (`dusk-02`, `dusk-13`) is the best of the set: a rose and violet sky, lights already on, long soft light. Dawn works too.

## Rain, scored the same way

| View | Score | What works | Worst problems |
|---|---|---|---|
| 02 Main Bazaar (day) | 3.5 | Dark wet lane with drop rings, shops lit under a grey sky | Streaks are thin and sparse at this size; walls and awnings are dry |
| 05 Jalan Gambier (day) | 3.5 | Rings on the carriageway in front of the parked cars | The cars and the five-foot way do not look wet |
| 09 Satok (day) | 3 | Closed sky, haze swallowing the far blocks | A large, even, grey road; puddles are noise, not low ground |
| 12 Trunk road (day) | 4 | The road shines toward the horizon, lamps are on, trees darken | The sheen is strong on the phone (`phone-rain/12`): nearly white |
| 14 Jalan China (day) | 3.5 | Darker, glossier road; lanterns against grey | The wet look is weak here; rain falls through the lantern strings and the awnings |
| Night 07, 12, 14 | 3.5 | Lamp pools on wet asphalt (12) | In 12 the pool is too wide and beige; in 07 the rain is hard to see against the dark |
| **Mean** | **3.5** | | |

## Three worst problems now

1. **Light at night lights nothing.** Pools lie on the ground only: the wall beside a lamp, a car under it, the player
   and the trees stay dark, and nothing casts a shadow. Lanes without a lamp (Main Bazaar, India Street) are black.
2. **Lit windows and shops are flat.** On the hand-painted shophouse rows a whole window glows one cream colour, and
   open shops are as bright as by day. On the generic buildings the bay pattern is good from afar but repeats up close.
3. **The city is empty at every hour** (no traffic, no people): part B.

Also noted: on the Low preset the DUN's roof reads pale rather than gold at night (`phone-night/01`); rain is not stopped
by roofs; the first shot of a capture run carries the start-up toast.
