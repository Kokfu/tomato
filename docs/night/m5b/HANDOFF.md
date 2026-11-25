# M5 handoff: hero places 5 and 6 (not started)
Places 1-4 are done: `a07fa37`, `2145982`, `909bc1d` (India Street + Jalan Gambier), `ede7761` (Plaza Merdeka + Old
Courthouse + Square Tower). Branch `night/city-realism-1`, tree clean after the M5b close-out. Mean realism 3.7/5 (3.68).
Read: PLAN.md (M5), `docs/night/m5b/NOTES.md`, `docs/night/refs/PLACES.md` sections 5-6, the `kuching-district` skill.
## Next steps
1. **Padungan shophouses + Cat Statue** (commit "N1-M5: Padungan + Cat Statue"). Tour view 07 at (1074.8, 239.2). Verified
   form (local `padungan_1928`, `padungan_gate_cat`, `padungan_catmonument`, `padungan_block`, `signals_zebra`): 2-3 storey
   shophouses in strong colours with timber fascia; a large white seated cat on a planted island; a triple-roof gate.
2. **Kuching City Mosque + Floating Mosque** (commit "N1-M5: the two mosques"). Tour view 08 at (-406.2, 26.2). Verified
   form (`citymosque_front` CC0, `citymosque_view`, `floatingmosque_night`): pink mosque with gold domes and corner
   minarets; `src/world/landmarks/floatingMosque.ts` exists (white, slender minaret: check it against the photograph).
3. Per place: table with Verified / Verified form / Approximate, references copied from `docs/night/refs/img/` into
   `public/reference/` and its manifest, before/after from fixed cameras (`tools/dev/street-shots.ts --views=... --jpeg
   --stats`, with and without `?m5=0`), perf check, `docs/night/m5-<place>.md`. Then one bench pair, tour, CRITIQUE, NOTES.
## What places 3-4 taught
- **Check how the street is mapped first.** A street mapped as an *area* gives its blocks no frontage (India Street had
  blank walls). `patchHeroData` in `src/world/district/indiaStreet.ts` adds frontages and steps a long block at run time.
- `heroLotStyle` (same file) is the hook for a street's own paint, blinds and air-conditioners on generic rows;
  `indiaSign` hangs mapped business names on the nearest lot.
- Unlit cloth or glowing parts can ride in the lane-marking mesh (`marks`), solid parts in `structure`: no draw call.
- A landmark with a photograph: keep the old builder for `?m5=0`, branch on `m5Enabled()` (`landmarks/squareTower.ts`).
- Models that were "approximate" can be plainly wrong (the Square Tower's central tower): compare with the photograph.
- Measure triangles per chunk (sum mesh index counts under `__k3d.world.chunks.chunks.get(key).group`); tour totals vary
  by tens of thousands between identical runs.
## Gotchas
- `tools/dev/shots.ts --mobile` needs `--size=390x844`, or the "phone" tour is captured at desktop size and preset.
- A walker slides round a small obstacle: test solidity with `collision.insideBuilding`, not with a walk that must fail.
- No source or `public/` saves while e2e runs; stop the dev server (the session's own, by id or PID) before the bench.
- The bench scenarios run round Jalan China only; Padungan and the mosques are far from them.
- No new downloads without the owner; no Google imagery. Heredocs with TypeScript break: write patch scripts with Write.
