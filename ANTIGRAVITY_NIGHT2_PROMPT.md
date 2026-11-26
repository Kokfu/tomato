You are working on Kuching 3D (this folder): a browser open world of the real city of Kuching, Malaysia, built with
TypeScript, Three.js and Vite as a static site. Its owner wants a realistic Kuching with GTA-style play that still runs on a
mid-range Android phone. Your job is **night 2 of the plan: trust and roads**. Work through it on your own, carefully.

## Read first
1. `PLAN_N2.md`: your plan. Do its milestones **in order**: N2-M0a, N2-M0b, N2-M1, N2-M2, N2-M3, N2-M4.
2. `PLAN.md`: the rules, budgets and milestone close-out that `PLAN_N2.md` builds on.
3. `docs/MAP_SOURCES.md`: which map and image sources are allowed.
4. `docs/night/REPORT.md`: where night 1 ended, its numbers and known issues.
5. `docs/reviews/ANTIGRAVITY_REVIEW.md`: your earlier review. `PLAN_N2.md`'s decision log says which points were adopted.
6. The how-to guides in `.claude/skills/*/SKILL.md`. They were written for another agent, but they are plain instructions;
   follow them:
   - `kuching-verify`: tests, builds and performance
   - `kuching-city-tour`: the 14 frozen tour views, contact sheet and critique
   - `kuching-district`: hand-built places
   - `kuching-milestone`: closing each milestone
   Read them; don't edit anything in `.claude/`.

## How to work
- Create branch `night/city-realism-2` from `night/city-realism-1`, and commit there **locally**. Never push, deploy, merge into
  `main`, delete branches or worktrees, or rewrite history; the owner pushes.
- Close each milestone the way `kuching-milestone` says:
  - self-review the diff
  - verify: typecheck, unit tests, the e2e specs you touched, budgets against the baseline
  - tour screenshots into `docs/night2/<milestone>/`
  - `NOTES.md` (under 60 lines)
  - the `PLAN_N2.md` Status row and Decision log
  - one commit per milestone, `N2-M<k>: <what a player sees>`
- **Every number you write must come from a command you ran this session**, with its raw output file next to the notes.
  Quote commit hashes from `git log`. Never estimate or round a measurement into a claim. If a measurement is noisy or a test is
  flaky, say so.
- One browser/GPU run at a time. Close dev servers you started before benchmarking. Production builds go outside the repo
  (`C:/Kuching3D-night-builds/<label>`). Keep CRLF files CRLF.
- Decide yourself; don't stop to ask. If something truly needs the owner, log it as a blocker in the Decision log, mark the
  milestone `PARTIAL`, and go on.
- If your context gets long, commit what is finished and write `docs/night2/<milestone>/HANDOFF.md` (under 40 lines: done,
  next steps, files, pitfalls), so a fresh conversation can continue from it.

## Hard limits
- Only CC0, CC-BY or CC-BY-SA assets and references, each recorded in `docs/ASSETS.md`.
- No Google Street View, Google Maps satellite, Google Earth or 3D Tiles imagery in any form: no screenshots, downloads,
  tracing or measuring. Shapes and sizes come from OpenStreetMap, Overture, the owner's photos or licensed photos.
- Never invent business names or house numbers.
- Don't run while another agent (for example a Claude session) is working in this folder.

## Finish
End with `docs/night2/REPORT.md`, as `PLAN_N2.md`'s N2-M4 describes, and a short final message: each milestone's status and
commit, what changed for a player, what failed or was cut, and what the owner should open first.
