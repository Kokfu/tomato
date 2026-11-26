# M8 notes: polish, docs and final report

**Changed**: `README.md`, `docs/LIMITATIONS.md`, `docs/ASSETS.md`, `docs/night/REPORT.md`, `docs/night/before-after.jpg`,
`PLAN.md`, four e2e specs (stale expectations only). No game code, so no new tour: the after images are M7's.

**Verification**: typecheck clean; unit 315 / 315; full e2e 168 of 170 (first pass 124 passed, 17 failed, 29 blocked;
affected files re-run after the test fixes). Still failing: `character-p5` 4x-CPU worst frame, `production` size target.

**Start-up** (`load-probe.txt`, `load-probe-2.txt`, medians of 3): ready +30 % and +11 % vs baseline; ready + first
frames -34 % and -39 %. Not re-benched on the phone.

Details and known issues: `../REPORT.md`.
