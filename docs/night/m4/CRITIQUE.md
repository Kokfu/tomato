# M4 tour critique (streets everywhere)

Shots: `desktop/*.jpg` (1366x768, Medium), `phone/*.jpg` (390x844 @2x, Low), sheets `sheet-desktop.jpg`, `sheet-phone.jpg`.
Same frozen cameras as M0 (`tools/dev/city-tour.json`). Desktop: 60 fps median in all 14 views, min 59.8 (`desktop/fps.json`).
Not tour views: `extra-junction.jpg` (a signalled junction on Jalan Tun Ahmad Zaidi Adruce: zebra crossings, yellow box, stop
lines, median kerb, drain) and `extra-stop-sign.jpg` (a residential junction). Both were taken mid-milestone, before the review
fixes (lamp arms, sign text direction).

## Scores (1 = toy, 5 = reads as Kuching)

| # | View | M0 | M1 | M2 | M3 | M4 | What changed in M4, and what still hurts |
|---|---|---|---|---|---|---|---|
| 01 | Waterfront | 2 | 2 | 3 | 3 | 3.5 | Footpaths on both sides, a drain with slab covers along the shop fronts, edge lines, centre dashes, lamps. The right footpath kinks near the camera; no people, no cars |
| 02 | Main Bazaar | 3 | 4 | 4 | 4 | 4 | Hero street: only the low kerb and covered drain strip are new, half hidden by the arcade. Bare tarmac between them |
| 03 | Carpenter Street | 3 | 3.5 | 3.5 | 3.5 | 3.5 | Hand-built section: untouched on purpose. The blank flank wall is still M5's |
| 04 | India Street | 2 | 2 | 2 | 2.5 | 2.5 | A pedestrian mall: M4 lays nothing on pedestrian streets. Still empty paving, no stalls or awnings |
| 05 | Jalan Gambier | 3 | 3 | 3 | 3 | 3.5 | Kerb, covered drain and an edge line in front of the five-foot way. The strip is narrow and flat; no signs in frame |
| 06 | Plaza Merdeka | 2 | 2 | 2 | 3 | 3.5 | Kerb, paved footpath and drain round the corner, lane lines. Mall still has no entrance; the footpath ends abruptly at the side road |
| 07 | Padungan + cat statue | 3 | 3 | 3.5 | 3.5 | 4 | Lane lines, stop line, kerbed footpaths, tall lamps: reads as a real junction. Still no cat statue, no traffic |
| 08 | Kuching Mosque | 1 | 1 | 2 | 2.5 | 2.5 | The camera stands on a service road: low kerb stones only. No mosque (M5) |
| 09 | Satok | 1 | 1 | 1.5 | 3 | 3 | Car-park lanes get a kerb line; nothing else is mapped there to dress. Still an empty apron, no market |
| 10 | The Spring | 1 | 1 | 2 | 3 | 3 | The view looks across a lawn; one kerb in the corner. Unchanged in effect |
| 11 | Residential (Overture) | 2 | 2 | 3 | 3.5 | 4 | Open drains at the road edge with slab covers at intervals, lamp posts down the street. No fences, gates, cars; covers do not line up with the houses |
| 12 | Trunk road (Openg) | 2 | 2 | 3.5 | 3.5 | 4 | Kerb and paved footpath, edge and lane lines, black-and-white median kerb, tall lamps with arms over the road. Empty of traffic; the lamp column stands in the middle of the footpath |
| 13 | River to DUN | 3 | 3 | 3.5 | 3.5 | 3.5 | A painted kerb at the bottom edge only |
| 14 | Jalan China (control) | 4 | 4 | 4 | 4 | 4 | Unchanged |
| | **Mean** | **2.3** | **2.4** | **2.9** | **3.3** | **3.5** | |

## M3's street items: fixed or not

- **Fixed:** "streets have no kerbs, drains, markings or furniture" in 01, 05, 06, 07, 11, 12: every carriageway in frame now has an
  edge treatment by class, lane lines on the main roads, and lamps.
- **Partly:** 02 and 13 (hero or riverside views where the street is not the subject); 08 and 09 (service roads: a kerb only).
- **Not M4:** 03's wall, 04's empty mall, the missing mosque, market and cat statue (M5); traffic and people (M6).

## What is still wrong with the new streets (honest)

1. **Flat.** Kerbs are 0.13 m and drains 0.1 m deep with dark paint: from eye level they read, from above they are stripes. No
   collision, so feet sink into a footpath.
2. **Junction corners are not built.** Edges stop where another carriageway begins and restart after it; there is no corner
   radius, no dropped kerb, no tactile paving. Edge lines stop at junctions but do not curve into the side road.
3. **Rule, not survey.** Footpath width, drain side and cover spacing are the same on every street of a class. Slab covers do
   not line up with driveways or shop doors (no such data).
4. **Sparse furniture.** One lamp per 32 m and a sign every few hundred metres; no bins, pillar boxes, benches beyond the five
   mapped, no parked motorbikes. Bus shelters are one generic form.
5. **Markings are simple.** No turn arrows, no give-way triangles, no parking bays, no yellow no-parking kerb paint.

## Three worst problems now, citywide
1. Named landmarks are missing or generic (08 mosque, 09 market, 07 cat statue) and 03's blank section wall (M5).
2. The world is empty of vehicles and people (M6).
3. Buildings repeat and have flat fronts and no yards (M3's list), now more visible beside dressed streets.
