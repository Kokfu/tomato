# N2-M3 critique: traffic lights and road rules

All shots come from the production build `C:/Kuching3D-night-builds/n2-m3-final`, served locally on a frozen dry day at 09:40 unless a shot says otherwise:
- `desktop/*.jpg` is the 14-view tour on Medium at `1366x768` (`desktop.txt`, `desktop/fps.json`: median 59.5 to 60 fps on all 14 views; the lowest minimum is 57.8 fps on view 14).
- `phone/*.jpg` is the same tour on Low at `390x844` (`phone.txt`).
- `signals/*.jpg` holds the signal and roundabout scenes (`signal-views.json`, `signals.txt`, High preset).
- `signals-before/*.jpg` holds three of those scenes with `?signals=0&inferredSignals=0` (`signals-before.txt`).
- Contact sheets are `sheet-desktop.jpg`, `sheet-phone.jpg` and `sheet-signals.jpg`.

## What the scenes show (probe lines from `signals.txt`)
- **s2, overhead view of Openg × Badruddin / Taman Budaya (junction 1, mapped), red for Openg.** Both Openg approaches wait at their stop lines (`signal@-331,1090` southbound, `signal@-346,1127` northbound), with cars queued behind (`follow` ×3). The crossing road's cars drive through the yellow box on their green.
- **s1 and s3, eye level 40 m north of junction 1, red then green.**
  - Red (s1): the mast-arm heads show red.
  - Green (s3): they show green, and a car drives through the junction towards the camera. Two cars on Badruddin / Taman Budaya are held at red (`signal@-354,1101`, `signal@-322,1117`).
  - The southbound queue on the camera's own carriageway was empty in this run, so the queue is clearer in s2.
- **s4, the s1 scene at night.** The red lens glows, but it is small at 70 m. At night the whole carriageway is washed out to beige by overlapping lamp pools. **This predates night 2:** the same frame with `?roads=0&signals=0` looks the same. The fix is queued for night 3.
- **s5 and s6, the Ong Kee Hui roundabout.** `shots.ts` waits (`until: 'yield'`) for a vehicle that has stopped to give way, then shoots.
  - In s6, the pickup at the north entry waits while a car circulates on the ring (`yield@101,1124`).
  - In s5 the give-way had ended before the probe ran (`turn@81,1056`). It is kept for the overview.
- **The same scenes under `?signals=0` (night 1) also show queues.** Night 1's traffic already stopped at mapped signal nodes on its own hidden 36 s timer, and its poles showed all three lenses lit at once. What N2-M3 changes:
  - the heads now show the phase the traffic obeys;
  - the road crossing the main corridor has its own phase, including at skewed junctions 7 and 11;
  - a car obeys the light once, at the first node of a junction box;
  - roundabout entries give way to the ring;
  - one-way roads 6.2 m and wider keep left;
  - 11 inferred junctions get lights.

## The plan's "done when", checked honestly
- **The trunk-road tour view shows traffic queued on red: not met, and it cannot be met with the frozen camera.** View 12 looks south (yaw 3.05 looks to +z, `ThirdPersonCamera.ts:113`). Junction 1, the only signal junction on that stretch, is 181 m behind the camera. N2-M2's critique said it was "180 m ahead"; that was wrong. Scenes s1 to s3 show the red queue on the same road from a camera facing the junction.
- **A signal junction shows traffic queued on red: met** (s2, and s1/s3 by probe).
- **A roundabout shows traffic giving way: met** (s6). The give-way is brief and random, so the shot waits for one.
- **An e2e test checks a car stopping on red: met** (`tests/e2e/signals.spec.ts`, `e2e.txt` 19/19, `e2e-signals.txt` 4/4 with `--repeat-each=2`).
- **The phone budget holds on scenario E: met** (cold p95 median -8.4%; `perf.json`).

## Day tour scores (1 = toy, 5 = reads as Kuching)
The frozen tour cameras catch almost none of N2-M3: lights change over time and traffic is sparse in these frames. Each score is the N2-M2 score unless the frame changed.

| # | View | M0 | N2-M2 | N2-M3 | What N2-M3 changes in this frame; the worst remaining problem |
|---|---|---|---|---|---|
| 01 | Waterfront | 2 | 4 | 4 | Nothing visible. Food kiosks and canopies are plain boxes. |
| 02 | Main Bazaar | 3 | 4 | 4 | Nothing visible. No walkers under the five-foot way. |
| 03 | Carpenter Street | 3 | 4 | 4 | Nothing visible. Blank unmapped fascia boards. |
| 04 | India Street | 2 | 4 | 4 | Nothing visible. No walkers in the pedestrian mall. |
| 05 | Jalan Gambier | 3 | 4 | 4 | Nothing visible. Hand-built parked cars cannot be driven. |
| 06 | Plaza Merdeka | 2 | 4 | 4 | Barrack × Khoo Hun Yeang is not a mapped or inferred signal junction, so no heads appear. Mall massing is a generic box. |
| 07 | Padungan + cat statue | 3 | 4.5 | 4.5 | Nothing visible. All rows are mapped as two storeys. |
| 08 | Kuching Mosque | 1 | 4 | 4 | Market / P. Ramlee / Haji Taha is an **inferred** signal junction, out of frame. Two Overture houses stand in front of the entrance. |
| 09 | Satok | 1 | 4 | 4 | Nothing visible. No weekend market stalls. |
| 10 | The Spring | 1 | 3 | 3 | Nothing visible. The camera faces a blank podium wall. |
| 11 | Residential (Overture) | 2 | 4 | 4 | Nothing visible. No gates or driveways. |
| 12 | Trunk road (Openg) | 2 | 4.5 | 4.5 | The signal junction is behind the camera (see above). Few cars for a trunk road, even with the larger spawn weight. |
| 13 | River to DUN | 3 | 4.5 | 4.5 | Nothing visible. Tambang boats are static. |
| 14 | Jalan China (control) | 4 | 4 | 4 | Unchanged by design (ambient traffic stays off Jalan China). |
| | **Mean** | **2.3** | **4.0** | **4.0** | 4.04 unrounded, unchanged; N2-M3's gain is in behaviour, shown by the signal scenes |

## Phone tour totals
`phone.txt` draws more on Low than N2-M2's `phone.txt` did (view 06: 208 calls against 89). The same view shot first in a fresh page draws 183 calls on this build and 177 on the `n2-m2` build, and 183 with `?signals=0&inferredSignals=0` (`phone-calls-check.txt`). So a one-moment renderer count depends on what has streamed in, and N2-M3 does not cause the difference. The phone bench (`perf.json`) is the budget measure.
