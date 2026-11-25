# M5a notes: hero places 1 and 2

Commits: `a07fa37` (Main Bazaar + Waterfront), `2145982` (Carpenter Street). Both behind the new flag `m5`
(on by default; `?m5=0` is the N1-M4 rendering). M5 stays IN PROGRESS: places 3 to 6 are not started.

**What a player now sees**
- **Kuching Waterfront:** a paved riverside walk behind a ring-panel railing, festoon lights between the lamps, palms,
  bins, a paved Square Tower forecourt; kapcai rows at the Main Bazaar kerb.
- **Carpenter Street:** the hand-built street runs on from Jalan China to Jalan Bishopgate (110 m, 41 lots, mapped
  shop names, lanterns, lamps, parked cars), and tour view 03's blank wall is the dressed side of a corner building.
- Details, lot tables, references and before/after: `../m5-main-bazaar-waterfront.md`, `../m5-carpenter-street.md`.

**Files.** New: `src/world/district/{m5,promenade,PromenadeMesh}.ts`, `src/v5/carpenterEast.ts`, four test files,
two camera sets in `tools/dev/`, four reference photographs in `public/reference/`. Changed: `src/flags.ts`,
`src/world/RoadBuilder.ts`, `src/world/district/{props,Dressing}.ts`, `src/v5/{geo,lots,V5Scene,controller}.ts`,
`tools/dev/street-shots.ts` (skips the character picker, `--jpeg`), `docs/FLAGS.md`, `docs/LIMITATIONS.md`.

**Verification.** Typecheck clean. Unit 254 / 254 (11 new). E2E desktop-1920: district, landmarks, gameplay,
shader-prep, driving: 30 passed; after the review fixes the two new specs, shader-prep, district and landmarks again:
passed. One subagent reviewed the diff; fixed from its list: chunk 1_0 not rebuilt on a render-mode switch, the north
row's end lots standing inside the Jalan China block, a lamp post through a parked car, the paved walk folding over
itself at the jetty jog, the paving tone changing 2 m past its band, cables drifting on the stepped rows. Not fixed:
no festoon across a chunk joint.

| Measure | Baseline (M0 build) | M5a | Limit |
|---|---|---|---|
| Phone p95, one pair, cold A / B / C | 70.1 / 74.8 / 73.8 ms | 70.5 / 65.5 / 71.7 ms (+1 / -12 / -3 %) | +15 % |
| Phone p95, warm A / B / C | 90.9 / 81.2 / 69.1 ms | 76.2 / 69.8 / 72.6 ms (-16 / -14 / +5 %) | +15 % |
| Frames over 200 ms | 0 | 0 | 0 stalls over 200 ms |
| Late shader compile (one lambert program on Main Bazaar, in both builds) | 69 / 24 ms | 119 / 123 ms | under 200 ms |
| Phone draw calls (max, A / B / C) | 130 / 141 / 150 | 135 / 146 / 156 | |
| Phone triangles (max) | 323-353 k | 433-481 k (+34 to +36 %; M4 was 372-421 k) | +60 % |
| Start-up to ready, 3 alternating runs (median), quiet set | 7.04 s | 5.89 s (-16 %) | +20 % |
| Ready + first frames, same set | 8.22 s | 5.92 s | |
| Desktop tour fps, Medium | 60 | 60 median, min 54 | >= 50 |
| Tour triangles / draw calls, 14 views (vs M4) | 4.47 M / 2565; phone 1.93 M / 944 | 6.35 M / 2738; phone 2.58 M / 965 | |
| New downloads; chunk JSON | | 0 (four reference photographs, 0.8 MB, loaded only by the OP panel); unchanged | 8 MB; +35 % |

The machine also ran the owner's other applications during the pair: absolute phone numbers are about twice the M4
pair's. A first start-up set, taken with this session's preview server still running, was too noisy to use
(4.6 to 11.4 s on the baseline alone): both sets are in `load-probe.txt` and `load-probe-2.txt`.

**Known issues, honestly**
- **Carpenter Street is over the per-place triangle guide:** section plus chunk 0_0 +26 % (guide: about +12 %). The whole
  section is one mesh per material, so its 315 k triangles are drawn whenever any of it is in view: the 14 tour views
  draw 42 % more triangles than at M4 (33 % on the phone). Frame rate and the phone budget hold. Splitting the new rows
  into their own meshes was measured (+15 to +19 draw calls where both are in view) and not kept.
- The late lambert compile on Main Bazaar is older than this milestone (it is in the baseline) but took longer here.
- Every lot of both places is Approximate; see the two documents for what is verified as form only.
- The benchmarked build predates the last small change to the corner side wall (a dado strip and a moved window).
- `driving` and `gameplay` were not rerun after the review fixes (none touches driving; `gps` was not run at all:
  parked cars stand clear of the mapped line and the corner wall does not block a car on it, by design, untested).

**Cut or not done:** tensile canopies, kiosks and the real swirl mosaic; verified facades for Main Bazaar; the
Bishopgate frontage north of the corner; Jalan Ewe Hai and Hong San Si; a second bench pair (the brief asked for one).

**For the next M5 worker (places 3 to 6)**
- Put new work behind `m5Enabled()` (`src/world/district/m5.ts`); node tests have it off, so set
  `location = { search: '?m5=1' }` before importing, or call `setM5(true)` for modules that read it late.
- A long hand-kit row needs `CARP_E_ROWS`-style stepping (`V5Scene.frame`), or its end lots sink or float: the old-town
  terrain falls up to 8 % across a street.
- Do not add more lots to the hand-built section without a plan for its size: it is always drawn whole. India Street
  is 300 m away, so it should be its own scene object (own bounds) or use the chunk's district meshes, as the
  Waterfront kit does.
- `tools/dev/street-shots.ts --views=<json> --jpeg --stats` with `?m5=0` and without gives before/after from one build.
- A probe placed in the middle of a thin collision wall is barely pushed (walls push from their edges): test where a
  walker's 0.28 m radius reaches the wall's street edge.
