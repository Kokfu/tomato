# N2-M4 notes: docs and night-2 report

Claude Opus 5.5 took this over after Antigravity's usage limit.

**Changed**
- `docs/night2/REPORT.md` (new): open-this-first, per-milestone table, before/after (top-down road sheets from N2-M2, signal scenes from N2-M3), score trend, performance table, full test run, known issues, the owner's to-do from the audit, next steps.
- `README.md`: night-2 roads and traffic lights in "What you can do", a link to the night-2 report and the `?roads=0` / `?signals=0` / `?inferredSignals=0` switches.
- `docs/LIMITATIONS.md`:
  - roads still on default widths: 89 main roads, 89.2 km, 479 ways (`roads-on-default-widths.txt`, from `roads-report.json`);
  - mapped signals now grouped into junctions;
  - the keep-left rule.
  - The 11 inferred junctions were already listed in N2-M3.
- `docs/ASSETS.md`: a night-2 section. No third-party asset file was added; `signals.json`, the road overrides and the derived road data are listed with their sources.
- `PLAN_N2.md`: N2-M3 and N2-M4 rows.

**Checks** (raw output in this folder)
- Full e2e: 158 passed, 2 failed, 42.4 min (`e2e-full.txt`).
- The 2 failures were in `gameplay.spec.ts`. They passed 4/4 on a re-run with `--repeat-each=2` (`e2e-gameplay-retest.txt`), so they are flaky, probably from ambient traffic pushing the walking player. On the owner's go, both now run with `?life=0`, and the whole file passed 16/16 with `--repeat-each=2` (`e2e-gameplay-life0.txt`).
- `docs/screenshots` was restored after each run (`git checkout -- docs/screenshots`).

**Not done:** no new shots in N2-M4; the report reuses N2-M2's and N2-M3's. The owner items are in REPORT.md: real-phone play, OSM edits, photos.
