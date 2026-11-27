# N2-M3 notes: traffic lights and road rules that work

Antigravity (Fable High) built most of this. It stopped at its 5-hour limit, and Claude Opus 5.5 finished it in the same working tree: review fixes, every check re-run, shots, notes and commit. The decision log in `PLAN_N2.md` has the details.

**What a player sees** (`?signals=1`, the default; `?signals=0` = night 1; `?inferredSignals=0` = mapped junctions only)
- A signal pole on the left kerb of each approach at 55 junctions (44 mapped, 11 inferred; 220 poles), with a mast arm where the approach is at least 7.8 m wide.
- The R/A/G heads change on the clock the traffic obeys: one 36 s cycle per junction, two phases (main corridor, crossing road). Lenses glow at night.
- Cars stop on red at the first node of the junction box and queue behind it; on green they drive through without stopping again inside the box.
- Entries give way to cars already on a roundabout. One-way roads 6.2 m and wider keep left. Larger roads get more ambient traffic.

**Changed**
- `tools/generate-world/build-signals.ts` (new) writes `public/data/kuching/signals.json` and the pole furniture.
  - It clusters the 113 OSM signal nodes into 44 junctions. Two clusters lie outside the map area and are logged as `dropped`.
  - It adds the audit's 11 inferred junctions.
  - It sets `refDeg` and `crossDeg` and each pole's phase group. The manifest `?v=` hash is now a sha256 of the content (two runs: `61a328ad3a` both times).
- `src/world/signalsFlag.ts` (new): flags, `SIGNAL_TIMING`, `junctionSignalAt`, `signalPhaseGroup(approach, ref, cross)`, `crossCorridor`.
- `src/life/traffic.ts`: signal specs per junction box, roundabout give-way (`EDGE_ROUNDABOUT`), keep-left, the weighted spawn pool. The new rules sit behind `roadRules`.
- `src/life/Life.ts`: loads signals.json; drives `ENV.uSignalTime`, wrapped at 36 s. If signals.json fails to load there is no signal control and a console warning.
- `StreetFurniture.ts`, `Materials.ts`, `env.ts` and `WorldManager.ts` draw the poles, arms and heads; the lens shader reads the `sig` attribute (codes ≥ 2).
- `build-graph.ts` and `Router.ts`: `EDGE_ROUNDABOUT`. The drive graph uses the wider of the night-1 and N2-M2 widths, plus the road overrides. GPS was already one-way-aware, and roundabout rings are one-way.
- `src/flags.ts` and `docs/FLAGS.md`: the `signals` and `inferredSignals` flags. `docs/LIMITATIONS.md`: timing, placement, the 11 inferred junctions.
- `tools/dev/shots.ts`: scene options `signal`, `probe` (with stopped-vehicle positions) and `until`.
- Tests: `tests/unit/n2-m3-signals.test.ts` (new) and `tests/e2e/signals.spec.ts` (new, hermetic); `flags.test.ts`; `measure*.ts`.

**Checks** (raw output in this folder)
- Unit tests 332/332 (`unit.txt`).
- e2e 19/19 (`e2e.txt`: driving, gps, m6-life, shader-prep, signals).
- `signals.spec` passed 4/4 with `--repeat-each=2` (`e2e-signals.txt`).
- Production build OK (`build.txt`; `build-final.txt` is the rebuild after a one-line alias change, used for all shots).
- Benches ran on `n2-m3`, the build from before that alias change.

| Budget (vs `n1-final`) | n1-final | n2-m3 | Delta / limit |
|---|---|---|---|
| Worst chunk triangles (`chunk-tris.txt`) | `-6_-9` 32076 | 36744 | +14.55% (N2-M2's road meshes; poles add none in the worst chunk) / +15% |
| Ready, median of 3 (`load-probe.txt`) | 4502 ms | 4400 ms | -2.3% / +20% |
| Shader programs at ready / after pan | 72-73 / 76 | 79-81 / 82 | same as N2-M2 (80 / 82); 0 new during play in `shader-prep` e2e |
| Pan frames > 200 ms (3 runs) | 0, 1, 1 | 1, 0, 1 | noise |
| Phone cold p95 A, first 3 pairs (`bench-*.txt`) | 51.9 ms | 64.7 ms | +24.7%: **noisy, see below** |
| Phone cold p95 A, 3 re-run pairs (`benchA-*.txt`) | 48.5 ms | 51.2 ms | +5.6% / +15% |
| Phone cold p95 C | 50.9 ms | 55.7 ms | +9.4% / +15% |
| Phone cold p95 E | 44.3 ms | 40.6 ms | -8.4% / +15% (E `reached`: true ×3 vs false ×3 on n1) |
| Max draw calls A / C / E | 121 / 162 / 187 | 123 / 161 / 177 | — |

**Known issues**
- **The machine was noisy.** Other apps were busy and CPU sat at 18-29% during the first bench set.
  - In that set, n1's A p95 spread from 31.2 to 68.8 ms, and camera, minimap and world.update (code N2-M3 does not touch) grew in step with render.
  - A was re-run alone in 3 more alternating pairs. Both sets are in `perf.json`; the re-run gives +5.6%.
- **The trunk-road tour view (12) cannot show the red queue.** It faces south, and the only signal junction on that stretch is 181 m behind it (CRITIQUE.md). The camera is frozen, so the queue is shown in separate scenes (s1 to s3).
- **A car can wait up to 20 s at a roundabout entry** when a ring car stands within 10 m (then it edges out by rule).
- **Three junctions run one phase for both directions** (5, 6 and 36, mid-block crossings).
- **Turning and pedestrian phases, detectors and real Kuching timings are not modelled.**
- **Per-frame garbage:** `junctionSignalAt` returns a new object and `edgesAt` makes subarrays every frame. This is small, but not fixed.
- **8 chunks have +1 draw call.** None of them has a signal pole; the extra call comes from N2-M2's road meshes.
- **The manifest hash does not cover `drive-graph.json`.**
- **At night, Openg's carriageway washes out to beige.** This predates night 2; the `?roads=0&signals=0` frame is the same.
- **The phone tour's draw counts aren't comparable with N2-M2's run**, because counts depend on what has streamed in (`phone-calls-check.txt`).

**Cut:** no fines or wanted level (the plan defers them); no turning arrows; no pedestrian crossings phased with the lights.
