# M0 notes: baseline and city tour gate

**Changed**
- `tools/dev/shots.ts`: `fp` views (first person), `--fps[=ms]` (median/min/max of `__k3d.fps` per view into `fps.json`), `--jpeg`, `--quality=`.
- `tools/dev/city-tour.json` (14 frozen views) and `tools/dev/city-tour-gen.mts` (how they were made), `tools/dev/contact-sheet.ts`.
- `docs/night/baseline/` (numbers, README), `docs/night/m0/` (28 JPEGs, two sheets, logs, `CRITIQUE.md`).

**Use**
- Capture: `node tools/dev/shots.ts <out> "$(cat tools/dev/city-tour.json)" --url=<preview> --size=1366x768 --quality=medium --jpeg --fps`
  and phone: `--size=390x844 --mobile --quality=low`. Sheet: `node tools/dev/contact-sheet.ts <dir> <out.jpg> [--cell=480]`.
- Tour shots were taken against `vite preview` of the baseline build on port 4174 (stop it with the port, not a script).

**Baseline** (details in `docs/night/baseline/README.md`): typecheck clean, 87 tests pass, load 5.0 s, phone p95 A/B/C 88/74/73 ms.
Desktop FPS is pinned at 60 (vsync) in all views; budgets use calls and triangles plus min fps.

**Known issues**
- Views 03, 08, 09 and 10 stand in a street next to a big block, so they mostly show a wall; that is itself a finding, but later
  tour comparisons keep the same cameras (do not move them).
- HUD (minimap, hints, "Inspect Shop" prompts) appears in shots; unchanged on purpose.
- Phone views differ slightly from desktop framing (narrow FOV, same camera).
