# M1 notes: integrate finished experiments

**Merged** (no conflicts, CRLF files still CRLF): `integration/dev-preview-1` (V9 arcade, sign fix, UX1 guide, flag registry),
`experiment/char-p5` (6-character picker), `experiment/c1-upper-china`. `experiment/omb-gps` not merged (G1 data freeze blocks `data:*` that M3/M4 need).

**Changed**: `src/flags.ts` (registry: v9, ux1, c1, char default on; `=0` off; no `location` = off), `src/v5/c1flag.ts`,
`src/player/character/CharacterProfile.ts` (`charEnabled`), `src/main.ts`, `docs/FLAGS.md`, unit tests (flags, quickguide, character, v9, c1 measure),
e2e `helpers.ts` + layout/character specs (no-flag tests use `?char=0`), tools seed a saved character so the picker does not block them.

**A player now sees**: Main Bazaar with the V9 arcade (terracotta floor, painted piers), Upper China Street corner, the controls guide,
and a character picker on first launch (a saved choice skips it). Tour: `desktop/`, `phone/`, `sheet-*.jpg` (14 views each).

**Verification**: typecheck clean; 222 unit tests pass; e2e desktop-1920 pass: ui 4, gameplay 8 (one flaky run of "chunks stream", passed on rerun),
district 4, landmarks 6, layout 1, character 58, picker (P9 rerun), char-p5 9 (E1.1 4x-CPU worst frame flaked once at 133 ms, passed on rerun),
char-regression 2; mobile-390 touch and touch-drive pass.

| Phone (Low, 4x CPU), median of 4 runs | baseline p95 | M1 p95 | limit |
|---|---|---|---|
| A | 70.8 ms | 78.2 ms (+10 %) | +15 % |
| B | 56.4 | 54.2 | |
| C | 57.3 | 51.2 | |

Start-up (load-probe, 3 runs): baseline 4662 ms median, M1 4926 ms (+6 %, limit +20 %); programs at ready 100 vs 101.
Calls the same (A 121, B 104, C 103); triangles +3 % (340k vs 330k A). No compile stall over 200 ms; one 285 ms frame in a C run (baseline M0 had one too).
Raw: `perf.json`. Desktop tour fps 60 in all 14 views (`desktop.log`).

**Known issues**: first-launch picker adds a step for new players and loads one GLB; the picker GLBs for some ids 404 in dev (existing tests expect it).
Not re-run this milestone: driving, gps, opmode, shader-prep, production e2e (not touched by the merges; run in M8's full suite).
