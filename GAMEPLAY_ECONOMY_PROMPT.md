You are working on Kuching 3D (this folder): a browser open world of the real city of Kuching, Malaysia (TypeScript, Three.js,
Vite, a static site that must run on a mid-range Android phone). The owner wants deeper GTA-style play: **more ways to earn money
and more ways to spend it**. **Plan first:** write the plan, then stop for the owner's review. Don't change game code in this
step.

## Read first
- `docs/night/m7/NOTES.md`: the play loop as it stands. You can take any rule-parked car, kapcai, taxi or pickup; do food
  deliveries and taxi fares from the phone (T), with GPS; earn fare plus tip; pay for repairs at the phone's garage; and progress
  is saved in localStorage.
- The code: `src/play/` (`missions.ts`, `sites.ts`, `parked.ts`, `crash.ts`, `save.ts`, `Play.ts`), `src/ui/Phone.ts`,
  `src/vehicle/`, `src/life/` (traffic and walkers), and `public/data/kuching/jobs.json`.
- `PLAN_N2.md` (roads and working traffic lights), `PLAN_N3.md` (its N3-M4 already plans a second job type and repair costs),
  `PLAN_BUILDINGS.md`, `docs/MAP_SOURCES.md`, `docs/LIMITATIONS.md`, `README.md`.
- Play it: `npm run dev`, open http://localhost:3000, and do one delivery and one taxi fare, on desktop and in a 375x812
  touch window.

## Write `PLAN_ECONOMY.md`
1. **Where the loop stands:** what earns, what costs, how fast money comes in (measure it: ringgit per in-game minute), and what a
   player has nothing to spend on.
2. **Ideas, Kuching-first.** For each one give: what the player does, why it's fun, which real-map data it uses, the code it
   builds on, cost on a phone, and effort (S/M/L).
   - Earn, some to consider:
     - more job types that use the vehicle differences (a kapcai express in the old town's lanes, pickup cargo, courier parcels)
     - e-hailing with surge pricing in rain and at night
     - a tambang river ferry across the Sarawak River
     - a tour-guide job to real landmarks
     - a pasar malam (night market) stall
     - time trials and street races on closed courses
     - a photo hunt of Kuching landmarks
   - Spend, some to consider:
     - fuel at mapped petrol stations
     - repairs and upgrades at workshops
     - paint and customisation
     - buying vehicles at a dealer
     - food at kopitiams (if it adds something)
     - clothes for the character
     - renting, then buying, a place to live as a save point and garage
     - parking fees, and fines once traffic lights work (night 2)
   - Add your own ideas, and cut weak ones.
3. **The economy model:**
   - sources and sinks, prices in ringgit, and a progression curve (what a player can afford after 10 minutes, 1 hour, 5 hours)
   - unlocks
   - all tuning numbers in one data file
   - a save-format version with migration from today's saves
4. **Milestones**, in order, each with a *Done when* that an e2e test can check on desktop and on the emulated phone. Name which
   ones take over `PLAN_N3.md` N3-M4's job and repair items, so nothing is built twice.
5. **Sequencing:** the plan runs after night 2, on its own branch (`night/economy-1` from night 2's end), because traffic lights
   and the corrected roads change routes and fines. Say what would break if it ran earlier.
6. **Risks:** phone performance, save compatibility, scope.

## Rules for the plan, and for the work that follows it
- Real places only by category, or by a name that OpenStreetMap or Overture maps. Never invent business names, brands or house
  numbers.
- No real-money purchases, loot boxes or gambling mechanics.
- No weapons, theft or violence against people unless the owner asks for it later.
- Pure logic in unit-tested modules, as `src/play/` does now. Keep the phone budgets of `PLAN.md` as amended by `PLAN_N2.md`.
  Every new system sits behind a `?flag=0` switch. Everything must work by touch.
- Commit only `PLAN_ECONOMY.md`, locally: `Economy: plan`. Never push, deploy or touch `main`.

## Stop
End with a short summary (top five ideas, the milestone list, open questions for the owner) and wait. Start building only when the
owner says go; then follow `PLAN_ECONOMY.md` in order, closing each milestone the way `.claude/skills/kuching-milestone/SKILL.md`
describes.
