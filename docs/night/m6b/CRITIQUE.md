# M6 part B tour critique (traffic and walkers)

Shots, all from the production build of this commit (served locally), same frozen cameras as M0 (`tools/dev/city-tour.json`):
- `desktop/*.jpg` (1366x768, Medium) and `phone/*.jpg` (390x844 @2x, Low): the tour on the frozen dry day at 09:40.
- `night/*.jpg`: six tour views at 21:00 (01, 05, 07, 09, 11, 12), Medium.
- Sheets: `sheet-desktop.jpg`, `sheet-phone.jpg`, `sheet-night.jpg`.
Desktop and phone: 60 fps median in every view; the lowest 5 s minimum is 58 (desktop) and 59.8 (phone).
Each shot is taken about 3 s after the camera is put in place, so it shows the streets as they are first filled.

## Day tour scores (1 = toy, 5 = reads as Kuching)

Nothing but the traffic and the walkers changed since M6a. A score moves only where they are in the frame and help.

| # | View | M0 | M2 | M3 | M4 | M5c | M6a | M6b | What the traffic and walkers do, and what still hurts |
|---|---|---|---|---|---|---|---|---|---|
| 01 | Waterfront | 2 | 3 | 3 | 3.5 | 3.5 | 3.5 | 4 | A red car and a kapcai come up Jalan Gambier, one walker crosses the grass. The road no longer looks abandoned; the long row on the right is still shut |
| 02 | Main Bazaar | 3 | 4 | 4 | 4 | 4 | 4 | 4 | Nobody in the frame: no walker route was found in the arcades here (piers and shop goods cut every route short) and the lane had no vehicle |
| 03 | Carpenter Street | 3 | 3.5 | 3.5 | 3.5 | 4 | 4 | 4 | Two walkers down the lane; small, and they walk in the roadway |
| 04 | India Street | 2 | 2 | 2.5 | 2.5 | 4 | 4 | 4 | **Still empty**: the mall is mapped as an area, not a way, so no walker route exists in it. The busiest pedestrian street in town has nobody |
| 05 | Jalan Gambier | 3 | 3 | 3 | 3.5 | 3.5 | 3.5 | 4 | A kapcai with its rider passes and a walker stands at the parked cars: the first frame of the tour that reads as a street in use. The rider is boxes; the walker stands in the carriageway |
| 06 | Plaza Merdeka | 2 | 2 | 3 | 3.5 | 4 | 4 | 4 | Three walkers before the entrance, too small to change the picture |
| 07 | Padungan + cat statue | 3 | 3.5 | 3.5 | 4 | 4.5 | 4.5 | 4.5 | A few distant figures and one far car; the wide junction in front is still bare |
| 08 | Kuching Mosque | 1 | 2 | 2.5 | 2.5 | 4 | 4 | 4 | Two walkers on the road to the mosque |
| 09 | Satok | 1 | 1.5 | 3 | 3 | 3 | 3 | 3.5 | A walker and a car on the forecourt give it a scale. Still no market |
| 10 | The Spring | 1 | 2 | 3 | 3 | 3 | 3 | 3 | Unchanged (the camera faces a wall) |
| 11 | Residential (Overture) | 2 | 3 | 3.5 | 4 | 4 | 4 | 4 | Walkers on the verge far down the street, a car in the distance: right, but tiny in this frame |
| 12 | Trunk road (Openg) | 2 | 3.5 | 3.5 | 4 | 4 | 4 | 4 | One white car on the other carriageway and two further on: a trunk road at 09:40 should carry twenty |
| 13 | River to DUN | 3 | 3.5 | 3.5 | 3.5 | 4 | 4 | 4.5 | Two walkers stride along the promenade in the foreground, one more by the railing: the best use of them in the tour |
| 14 | Jalan China (control) | 4 | 4 | 4 | 4 | 4 | 4 | 4 | Unchanged by design: ambient traffic keeps out of the street, and its own three pedestrians are out of frame |
| | **Mean** | **2.3** | **2.9** | **3.3** | **3.5** | **3.8** | **3.8** | **4.0** | 3.96 unrounded (M6a 3.82) |

## Night (21:00), six views

| View | What works | Worst problems |
|---|---|---|
| 01 Waterfront | A car's headlamps and its patch of light on Jalan Gambier, red tail lamps beyond | The car body is a black shape: lamp light does not fall on it |
| 05 Jalan Gambier | A walker under the lamp | He is lit by nothing; a dark figure on a lit road |
| 07 Padungan, 09 Satok | Figures against lit shopfronts | Too few vehicles (the night count is about half the day's) to read as traffic |
| 11 Residential, 12 Trunk road | A headlight patch on the road | In 12 the patch belongs to a vehicle under the camera; no other is in view |

Night scores are not changed from M6a (3.5): headlamps help in one view of six.

## Three worst problems now

1. **Too thin to read as a city.** 18 vehicles and 22 walkers on Medium, spread over a ring of 190 m and 75 m, leave
   most frames with one or two of each. A trunk road shows one car. The phone has 8 and 9.
2. **India Street and Main Bazaar have nobody.** Walker routes come from mapped ways and street-front edges; the
   pedestrian mall is an area and the Main Bazaar arcades are cut up by piers and goods, so both stay empty.
3. **They are props, not road users.** The player's car drives through ambient vehicles, signal heads do not change
   colour, walkers pass through each other and stand in the carriageway at parked cars (05), riders are boxes, and
   at night bodies are unlit shapes behind bright lamps.

Also noted: vehicles and walkers appear at the edge of their ring without fading in; a kapcai keeps to its lane and
never filters; ambient vehicles cast shadows on Medium and High but walkers only have a soft patch.
