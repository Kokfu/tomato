# Night 1 baseline (commit `1e16c25`, build in `C:/Kuching3D-night-builds/baseline`)

`npm run typecheck`: clean. `npm test`: 87 / 87 pass. Numbers in `perf.json`; raw output in `drive-bench-{1,2}.json/.log`, `load-probe.log`.

| Measure | Baseline |
|---|---|
| Load to `__k3d.ready` (load-probe, 3 runs) | 4963 / 5020 / 5033 ms, median 5020 ms, 100 programs at ready |
| Pan after Start (load-probe) | worst frame 451-502 ms, 1 frame over 200 ms, 3 over 50 ms |
| Phone (390x844, Low, 4x CPU) A, median of 4 runs | p95 88.4 ms, median 53.4 ms, avg 26.9 fps |
| Phone B (Jalan China lane) | p95 73.8 ms, median 35.2 ms, avg 30.4 fps |
| Phone C (block loop) | p95 73.0 ms, median 36.5 ms, avg 29.1 fps, ~104 calls, ~350k tris |
| Late shader compiles (after ready) | 1 per C run (lambert/highp/srgb near 236,-58), 39-102 ms: none over 200 ms |
| Frames over 200 ms in all 12 scenario runs | 1 (cold C, run 2, 208.7 ms) |
| Desktop 1366x768 Medium, tour | 60 fps in all 14 views (vsync cap; min 56-60): use calls/tris for budgets |

Budget reading: phone p95 limit = baseline +15 % (A 101.7, B 84.9, C 84.0 ms); start-up limit 6024 ms.
Desktop FPS is pinned at the vsync cap, so the "0.85x baseline and at least 50" rule is checked as min fps >= 50 in every view.
Run-to-run phone noise is large (A p95 67.8 to 96.3 ms): compare medians of alternating pairs.
