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

- Any value other than `0` (or no value) means on. `?char=<id>` is still a developer link for one character.
- Without a `location` (node unit tests, tools) every flag is off, so the data tables stay at their V8.6 values.
- `?lab=1` is kept as an alias and changes nothing now.
- Tests and tools that must not meet the picker seed `localStorage['k3d.character'] = 'man'`.
