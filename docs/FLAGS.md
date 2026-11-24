# Feature flags (N1-M1)

Flags are URL query parameters read once from `location.search` by `src/flags.ts`.
Since N1-M1 the four merged features are **on by default** in a browser; `?name=0` turns one off (the previous accepted build).

| Flag | Feature | Off with |
|---|---|---|
| `v9` | Main Bazaar arcade (V9) and the sign fix | `?v9=0` |
| `ux1` | Controls quick guide | `?ux1=0` |
| `c1` | Upper China Street corner | `?c1=0` |
| `char` | Six-character picker (first launch shows the picker; "Change character" in the pause menu) | `?char=0` |

- Any value other than `0` (or no value) means on. `?char=<id>` is still a developer link for one character.
- Without a `location` (node unit tests, tools) every flag is off, so the data tables stay at their V8.6 values.
- `?lab=1` is kept as an alias and changes nothing now.
- Tests and tools that must not meet the picker seed `localStorage['k3d.character'] = 'man'`.
