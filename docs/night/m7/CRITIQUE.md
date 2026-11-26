# M7 tour critique (the play loop)

Shots, all from the production build of this commit (served locally), same frozen cameras as M0 (`tools/dev/city-tour.json`):
- `desktop/*.jpg` (1366x768, Medium) and `phone/*.jpg` (390x844, Low): the tour on the frozen dry day at 09:40.
- `play/*.jpg` (desktop) and `play-phone/*.jpg` (emulated phone): what M7 adds, taken by `tools/dev/play-probe.ts`.
- Sheets: `sheet-desktop.jpg`, `sheet-phone.jpg`.
Desktop: 60 fps median in every view but one; view 05 read 53 (minimum 44) in the tour run and 60 (minimum 59.8) when
it was taken again straight after, so that was the machine. Phone: 60 in every view (lowest minimum 59.7).

## Day tour scores (1 = toy, 5 = reads as Kuching)

M7 is about play, not looks. The only things it puts in a tour frame are the vehicles that stand parked by rule, a
taxi or a pickup in the traffic, and two HUD pieces (the wallet, the phone button). A score moves only where they help.

| # | View | M0 | M5c | M6b | M7 | What M7 puts in the frame, and what still hurts |
|---|---|---|---|---|---|---|
| 01 | Waterfront | 2 | 3.5 | 4 | 4 | Unchanged: traffic on Jalan Gambier, no parked vehicle in view |
| 02 | Main Bazaar | 3 | 4 | 4 | 4 | Unchanged, and still nobody in the frame |
| 03 | Carpenter Street | 3 | 4 | 4 | 4 | Unchanged |
| 04 | India Street | 2 | 4 | 4 | 4 | Unchanged: still no walker in the mall |
| 05 | Jalan Gambier | 3 | 3.5 | 4 | 4 | Unchanged (a walker stands among the hand-built parked cars, which cannot be taken) |
| 06 | Plaza Merdeka | 2 | 4 | 4 | 4 | A white car far across the forecourt; too small to count |
| 07 | Padungan + cat statue | 3 | 4.5 | 4.5 | 4.5 | Unchanged |
| 08 | Kuching Mosque | 1 | 4 | 4 | 4 | Unchanged |
| 09 | Satok | 1 | 3 | 3.5 | 4 | **A white pickup and a cream car stand at the building, a red taxi across the forecourt**: the first time this view has anything a forecourt has. They stand on the footpath, not in bays; still no market |
| 10 | The Spring | 1 | 3 | 3 | 3 | Unchanged (the camera faces a wall) |
| 11 | Residential (Overture) | 2 | 4 | 4 | 4 | A kapcai passes the camera by chance; no parked vehicle on this street (it has no service road) |
| 12 | Trunk road (Openg) | 2 | 4 | 4 | 4 | Unchanged: still far too few vehicles for a trunk road |
| 13 | River to DUN | 3 | 4 | 4.5 | 4.5 | Unchanged |
| 14 | Jalan China (control) | 4 | 4 | 4 | 4 | Unchanged by design |
| | **Mean** | **2.3** | **3.8** | **4.0** | **4.0** | 4.00 unrounded (M6b 3.96) |

## The play shots, harshly

- **`play/starters.jpg`**: the kapcai, the taxi and the pickup in a row on the riverside footpath of Jalan Main Bazaar.
  They read at once as three different vehicles. They also read as placed: three in a neat row on a footpath where
  nobody parks.
- **`play/parked-taxi.jpg`, `taxi-wrecked.jpg`**: the taxi is a red saloon with a yellow box on the roof. No lettering,
  no meter, no livery: honest, and plain. The damage tint works as a signal (the paint goes dull brown, the glass
  greys) but it is a colour change on an undented body.
- **`play/ride-kapcai.jpg`**: the rider is the traffic's box figure in a helmet, not the chosen character; legs do not
  go down at a stop. The lean in a turn is the best part.
- **`play/drive-pickup.jpg`**: the load bed is a dark panel let into the deck with a rail round it; from the chase
  camera it reads as a pickup, close up as a saloon with a long boot.
- **`play/phone-offers.jpg`, `job.jpg`, `play-phone/*`**: the phone is clear and fits a 390 px screen above the
  driving controls. "a restaurant" with no street (no named road within 80 m) reads thin; every food place is "a
  restaurant", every office "an office". Nothing marks the pick-up but a floating marker: no customer, no parcel.

## Worst three for the next pass

1. Nobody at either end of a job: a standing figure at the pick-up and the drop-off would make the loop read.
2. Parked vehicles stand on footpaths and verges in rows of one; real bays (mapped `amenity=parking`) are not used.
3. The hand-built streets' parked cars still cannot be taken, and they are the ones a new player sees first.
