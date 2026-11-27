# Kuching 3D: night 2 report (2026-11-26 to 2026-11-28): trust and roads

Branch `night/city-realism-2`. Everything is committed locally. **Nothing was pushed, deployed or merged into `main`.**
All milestones N2-M0a to N2-M4 are closed.

Antigravity (Fable High / Sonnet Medium) ran N2-M0a to N2-M2 and most of N2-M3. It hit its usage limit during N2-M3's
close-out, and Claude Opus 5.5 took over in the same working tree. Claude re-ran every check, fixed what its own review
of the N2-M3 code found, and closed N2-M3 and N2-M4. Numbers in the N2-M3 and N2-M4 sections come from commands run in
that session, with raw output next to each milestone's notes. Numbers for earlier milestones are quoted from their
committed `NOTES.md` and `perf.json`.

## Open this first

1. **Traffic lights and road rules** (N2-M3): [m3/sheet-signals.jpg](m3/sheet-signals.jpg).
   - Start with [m3/signals/s2-openg-badruddin-overhead-red.jpg](m3/signals/s2-openg-badruddin-overhead-red.jpg): both Jalan Tun Abang Haji Openg approaches wait at their stop lines on red while the crossing road drives through.
   - Then [m3/signals/s6-roundabout-ong-kee-hui-giveway-close.jpg](m3/signals/s6-roundabout-ong-kee-hui-giveway-close.jpg): a pickup gives way at a roundabout entry.
2. **Roads before and after** (N2-M2), from the same build with `?roads=0` and `?roads=1`, top-down and eye level:
   [m2/before-after-top-sheet.jpg](m2/before-after-top-sheet.jpg), [m2/before-after-eye-sheet.jpg](m2/before-after-eye-sheet.jpg).
3. **The game:**

   ```powershell
   npm run dev
   ```

   Open http://localhost:3000 and press **Start Exploring**.
   - Things to try: take a car down Jalan Tun Abang Haji Openg to the Badruddin / Taman Budaya lights (about 1.5485 N, 110.3415 E), watch a cycle, and drive round the Ong Kee Hui roundabout.
   - `?signals=0` and `?roads=0` put night 1 back for comparison; `?inferredSignals=0` keeps only mapped lights.
4. **The owner's to-do** below: only you can do it, and it improves the map for everyone.

## What changed, per milestone

| # | Commit | What a player sees |
|---|---|---|
| N2-M0a | `033bc08` | A credits page; honest start text; the first visit downloads only the chosen character; a `?v=` data hash; bench scenario E (central-city loop) |
| N2-M0b | `efc06d9` | Same city, lighter: the V5 old town hides at distance, hero chunks get a low-detail form, and no shader stalls on the waterfront |
| N2-M1 | `a149f60` | Nothing in game. A map-truth audit of 7,733 ways: 39 roundabouts, 46 signal junctions, 259 dual-carriageway pairs, 52 bridges, a top-20 fix list and the owner's to-do (`audit/`) |
| N2-M2 | `35d8640` | **True Kuching roads:** kerbed roundabout islands with grass and palms, splitter islands, give-way lines, grass medians with twin-arm lamps on dual carriageways, `lanes` × 3.3 m widths, filleted corners, tunnel portals at Bulatan Abang Kipali, the Satok suspension bridge, and no false bridge decks on Main Bazaar or Gambier |
| N2-M3 | `eb521e8` | **Traffic lights that work:** 220 poles at 44 mapped and 11 inferred junctions, heads that change on the clock the traffic obeys, a separate phase for the crossing road, roundabout give-way, keep-left on wide one-way roads |
| N2-M4 | this commit | README, LIMITATIONS, ASSETS, this report, full e2e run |

## Before and after
- **Roads:** [m2/before-after-top-sheet.jpg](m2/before-after-top-sheet.jpg) (top-down: 12 of the audit's top-20 sites,
  `?roads=0` then `?roads=1`) and [m2/before-after-eye-sheet.jpg](m2/before-after-eye-sheet.jpg) (eye level).
  The audit's roundabout sheets: [audit/roundabouts-topdown-sheet.jpg](audit/roundabouts-topdown-sheet.jpg).
- **Signals:** `m3/signals/` (after) and `m3/signals-before/` (`?signals=0&inferredSignals=0`).
  - Night 1 already stopped traffic at mapped signal nodes on a hidden timer, and lit all three lenses at once.
  - The difference is in the heads (now they show the phase), the crossing-road phase, the roundabouts, and the 11 inferred junctions.
- **The 14-view tour:** [m3/sheet-desktop.jpg](m3/sheet-desktop.jpg) and [m3/sheet-phone.jpg](m3/sheet-phone.jpg), the same frozen cameras as night 1.

## Realism score trend (14-view tour, 1 to 5)

| Night 1 M0 | Night 1 M7/M8 | N2-M2 | N2-M3 |
|---|---|---|---|
| 2.3 | 4.0 | 4.0 (4.04) | 4.0 (4.04) |

- The tour mean barely moves in night 2, because the frozen cameras look along shophouse streets: only view 12 (Openg)
  shows a dual carriageway (4 to 4.5). Night 2's gains are on the roads between the hero places, which the tour does not
  frame. The top-down before/after sheets and the signal scenes are the evidence.
- View 12 cannot show its signal junction: it faces south, and Openg × Badruddin is 181 m behind it. N2-M2's critique
  had it 180 m ahead (`m3/CRITIQUE.md`).

## Performance against the baseline (`n1-final`, `1139856`)
Phone bench: emulated 390×844 phone, Low preset, CPU throttled ×4, cold run, median of 3 alternating pairs. This is not a real phone.

| Milestone | Ready time | Phone cold p95 A / C / E | Worst chunk triangles | Source |
|---|---|---|---|---|
| N2-M0a | — | 38.7 / 40.7 / 35.4 ms vs 43.1 / 47.4 / 34.6 ms | — | `m0a/perf.json` (quoted) |
| N2-M0b | +8.4% | +5.6% / -6.7% / +2.1% | `-1_-1` +5.8%, `-2_-1` +9.2% (low LOD) | `m0b/NOTES.md` (quoted) |
| N2-M2 | +0.6% | +1.2% / -17.3% / -8.2% | +14.55% (`-6_-9`) | `m2/perf.json` (quoted) |
| N2-M3 | **-2.3%** (4400 vs 4502 ms) | **+5.6%** (re-run) / **+9.4%** / **-8.4%** | +14.55% (same chunk; poles add none) | `m3/perf.json` |
| Budget | ≤ +20% | ≤ +15% | ≤ +15% | `PLAN_N2.md` |

- **N2-M3's first bench set read +24.7% on scenario A, on a busy machine.** CPU was 18-29% from other apps, and n1's own A
  p95 spread from 31.2 to 68.8 ms. Code N2-M3 does not touch (camera, minimap, world update) slowed in step with render.
  A re-run of A alone (3 more pairs) gave +5.6%. Both sets are kept.
- 0 frames over 200 ms in N2-M3's cold phone runs, except one E frame in pair 2 (n1 had one in pair 1).
- Shader programs at ready are 79-81, against 72-73 on n1-final (N2-M2: 80); no compile during play in the `shader-prep` e2e.
- Scenario E (central-city drive) reaches its end on every N2-M3 run (false on every n1-final run, because of the false
  Gambier deck that N2-M2 removed).

## Full test run (N2-M4)
All 160 browser tests (Edge with GPU, 1 worker, `--project=desktop-1920`) on the final N2-M3 code: **158 passed, 2 failed,
42.4 min** (`m4/e2e-full.txt`). Unit tests: 332/332 (`m3/unit.txt`).

- The 2 failures are both in `gameplay.spec.ts`:
  - "W/A/S/D move relative to the camera": W moved the player 3.56 m *south* in 0.9 s, where the test expects north.
  - "chunks stream in ahead of the player": the 1686 m run did not reach its end; no chunk was missing.
- **Both passed 4 of 4 on a re-run** (`--repeat-each=2`, `m4/e2e-gameplay-retest.txt`), with no change. **Flaky, not fixed.**
- **Likely cause, not proven:** ambient traffic pushes a walking player aside, and both tests walk along open main roads (Main Bazaar, and the longest major road). N2-M3 sends more traffic to larger roads.
- **Suggested fix:** do what night 1's M8 did for the picker specs, and what `signals.spec.ts` does: run these two with `?life=0`, or clear the traffic in the test.

## Known issues
1. **89 main roads (89.2 km) are still on default widths:** OpenStreetMap has no `lanes=*` on them
   (`m4/roads-on-default-widths.txt`). The owner's to-do §3 lists the worst ones.
2. **11 signal junctions are inferred, not mapped** (`?inferredSignals=0` removes them). They may have no lights in
   reality; to-do §4.
3. **Signal timing is invented:** one 36 s cycle, two phases. There are no turning or pedestrian phases. Three mid-block
   crossings (junctions 5, 6, 36) run one phase for both directions.
4. **A car can wait up to 20 s at a roundabout entry** when a ring car stands within 10 m; then it edges out by rule.
5. **At night, wide roads such as Openg wash out to beige** under overlapping lamp pools. This predates night 2 (same frame
   with `?roads=0&signals=0`); it belongs to night 3's night-and-rain milestone.
6. **The phone bench numbers are emulated and the machine was noisy** during N2-M3. Play it on a real phone before trusting them.
7. **Small leftovers:**
   - per-frame garbage in the traffic code (`junctionSignalAt`, `edgesAt`);
   - the `?v=` hash does not cover `drive-graph.json`;
   - 8 chunks have +1 draw call from N2-M2's road meshes;
   - one 36-69 ms sign-board shader compile on Low (N2-M0b).
8. **Two flaky movement tests** (`gameplay.spec.ts`, see "Full test run"): probably traffic pushing the walking player.
9. **Scenario E's other deck:** in N2-M0a, Scenario E also met a deck on Sungai Padungan / Lebuh Temple. N2-M2's footway split removed the Gambier and Main Bazaar decks and E now reaches its end. It was not re-checked separately.

## The owner's to-do (from the audit, `audit/OWNER_TODO.md`)
Only you can do these; each makes the next build truer without code.
- **In OpenStreetMap (iD editor, licensed imagery only, per `docs/MAP_SOURCES.md`):**
  - Add `lanes=*` on the main roads in §3: Jalan Padungan, Green, Astana, Tun Salahuddin, Pending, Tabuan, Abell, Batu Lintang, Ban Hock, Ong Kee Hui, and the slip lanes.
  - Name and tag the major roundabouts (§1).
  - Tag `way 1104674947` as the Satok suspension bridge (§2).
- **Confirm the traffic lights (§4):** which of the audit's unsignalled main-road junctions really have lights.
  - Map them as `highway=traffic_signals` where they do.
  - Then the game can drop the "inferred" mark, or drop the junction.
- **Photos (§2 of the to-do, `docs/refs/owner/`):** eight spots, among them:
  - the Padungan roundabout from its footbridge;
  - the Openg median from an overhead bridge;
  - Jalan Gambier's shopfronts (no licensed photo exists);
  - the Plaza Merdeka junction;
  - the Satok bridge and flyover.
- **Map box (§3):** decide whether to extend the map north, east or south to complete the clipped roundabouts and the
  Tun Salahuddin bridge.
- **Play it on a real phone** from the Cloudflare preview.

## Next
1. **Night 3: `PLAN_N3.md`** (people, the weakest places, night and rain, feel). The road network is now ready for it: signal junctions exist for walkers to cross at (they do not cross yet), and parking and jobs sit on true roads. Start with the night washout (known issue 5).
2. **Then the buildings track: `PLAN_BUILDINGS.md`.**
3. **Alongside:** the economy plan (`PLAN_ECONOMY.md`, your answers recorded with its defaults) starts its own branch from night 2's last commit. Push `night/city-realism-2` yourself after a look first.
