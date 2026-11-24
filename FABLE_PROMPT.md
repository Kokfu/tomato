You are working alone overnight on Kuching 3D (C:\New Project Kuching): a browser open world of the real city of Kuching,
built with TypeScript, Three.js and Vite. Jalan China already looks good; the rest of the city doesn't. The owner wants to
wake up to clearly visible progress toward a realistic, GTA-style Kuching that still runs in the browser and on a phone.

Do this:
1. Read PLAN.md fully, then README.md, docs/ARCHITECTURE.md, docs/LIMITATIONS.md and docs/V7_REPORT.md.
   Load the project skills `kuching-verify`, `kuching-city-tour`, `kuching-district` and `kuching-milestone` when the plan calls for them.
2. Execute PLAN.md milestones M0 to M8 **in order**. Every milestone ends with the `kuching-milestone` skill:
   verify, tour screenshots, notes, PLAN.md Status update, then a local commit on branch `night/city-realism-1`.
3. You make the design decisions. Use your own judgement about what best serves this project: biggest visible realism
   gain for a player, within the PLAN.md budgets. Log each real decision in PLAN.md's Decision log.
   Don't ask the owner questions; they are asleep. If something truly needs them, log it as a blocker, mark the
   milestone PARTIAL, and continue with the next one.
4. Judge progress by the images, not the code: after each visual milestone, compare the tour shots with the previous ones
   and be harsh. If a view still looks wrong, fix it before moving on (within reason), or log why not.
5. Keep going until every milestone is DONE or PARTIAL. Do not stop early to summarise. Use subagents for reference-photo
   research and diff reviews, but only one browser/GPU run at a time.

Hard limits:
- Never push, deploy, merge into `main`, delete branches or worktrees, or rewrite history.
- Only CC0, CC-BY or CC-BY-SA assets and references, recorded with their licences. No Google Street View or Google 3D Tiles imagery.
- Never invent real business names or house numbers.
- Keep CRLF files CRLF.

Finish with docs/night/REPORT.md (before/after contact sheet, perf against baseline, known issues, next night's plan) and a
short final message: what the owner should open first to see the progress.
