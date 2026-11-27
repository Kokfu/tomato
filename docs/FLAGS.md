# Feature flags (N1-M1)

Flags are URL query parameters read once from `location.search` by `src/flags.ts`.
Since N1-M1 the merged features (and since N1-M5 the hero places) are **on by default** in a browser; `?name=0` turns one off (the previous accepted build).

| Flag | Feature | Off with |
|---|---|---|
| `v9` | Main Bazaar arcade (V9) and the sign fix | `?v9=0` |
| `ux1` | Controls quick guide | `?ux1=0` |
| `c1` | Upper China Street corner | `?c1=0` |
| `char` | Six-character picker (first launch shows the picker; "Change character" in the pause menu) | `?char=0` |
| `m5` | N1-M5 hero places: Kuching Waterfront promenade kit (paved walk, ring railing, festoon lights, palms, kapcai, Square Tower forecourt) the rest of Carpenter Street (Jalan China to Jalan Bishopgate), India Street (rows on both sides, canopy, diamond paving, stalls, mapped shop names) Jalan Gambier's parked cars, the Square Tower and Old Courthouse clock tower in their photographed forms, the Plaza Merdeka entrance, and Jalan Padungan (the Cat Column, the Great Cat, the open Chinatown gate, strong paint and fascia boards on the rows), the Kuching City Mosque with its cemetery, and the floating mosque in its photographed form | `?m5=0` |
| `life` | N1-M6 ambient traffic (cars and kapcai on the mapped carriageways) and walkers on footpaths and five-foot ways | `?life=0` |
| `m7` | N1-M7 play loop: parked vehicles to take (car, kapcai, taxi, pickup), delivery and taxi jobs from the phone, the wallet, collisions with the traffic, the horn, saved progress. Needs `life` for the parked vehicles (they are drawn with the traffic) | `?m7=0` |
| `roads` | N2-M2 true Kuching roads: kerbed roundabout central islands with grass and palms, splitter islands, give-way lines, kerbed grass/tree/lamp dual-carriageway medians with crossover gaps, `lanes` x 3.3 m and retuned Kuching widths, filleted junction corners, slip-lane gores, underground tunnel portals, and Satok suspension cables | `?roads=0` |
| `signals` | N2-M3 working traffic lights and road rules: per-approach signal poles (plus mast arms on wide roads), R/A/G heads on the clock the traffic obeys (one cycle per junction, main corridor and crossing road as two phases) with night glow, roundabout give-way, keep-left on 6.2 m+ one-way roads, and more ambient traffic on the larger roads. `?signals=0` is night 1's static poles and traffic rules | `?signals=0` |
| `inferredSignals` | N2-M3 inferred traffic lights at major unsignalled main-road crossroads from the audit (`docs/LIMITATIONS.md`); when `0`, only OpenStreetMap-mapped `highway=traffic_signals` junctions get signal poles and signal control | `?inferredSignals=0` |

- N1-M6 (not flags, but address parameters): `?time=auto|day|evening|night` or `?time=<hour 0..24>` and
  `?rain=auto|off|on` set the time of day and the rain at start-up; they win over the saved settings
  (`localStorage['k3d.time']`, `['k3d.rain']`). Without either, the day passes and it rains now and then, except in
  an automated browser (`navigator.webdriver`), which starts on a frozen dry day at 09:40 so that tests, screenshots
  and benchmarks are repeatable.
- Any value other than `0` (or no value) means on. `?char=<id>` is still a developer link for one character.
- Without a `location` (node unit tests, tools) every flag is off, so the data tables stay at their V8.6 values.
- `?lab=1` is kept as an alias and changes nothing now.
- Tests and tools that must not meet the picker seed `localStorage['k3d.character'] = 'man'`.
