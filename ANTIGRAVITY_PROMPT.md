You are reviewing Kuching 3D, a browser open world of the real city of Kuching, Malaysia (TypeScript, Three.js/WebGL, Vite, a
static site on Cloudflare Workers). Its owner wants a realistic Kuching with GTA-style play that still runs on a mid-range
Android phone. Other AI models built most of it; the owner wants **your independent opinion** of what can be enhanced.

**This is a review, not a change.** Don't edit source files, commit, push or deploy. Write only one file:
`docs/reviews/ANTIGRAVITY_REVIEW.md`.

1. Read `README.md`, `docs/ARCHITECTURE.md`, `docs/LIMITATIONS.md`, `docs/ASSETS.md`, `docs/night/REPORT.md` and `PLAN_N2.md`
   (the plan for the next round of work). Browse `src/` (start at `src/main.ts`, `src/world/`, `src/v5/`), `tools/` and `tests/`.
2. Run it: `npm install`, then `npm run dev`, then open http://localhost:3000. Or open the branch's Cloudflare preview.
   Pick a character. Walk the Waterfront, Main Bazaar, Carpenter Street and India Street; drive a car; take a taxi job (key **T**);
   try `?time=night` and `?rain=on`; and try the phone layout (a 375x812 window, touch emulation).
3. Judge it as a player and as a senior engineer, under these headings:
   - **Realism:** what still doesn't look like Kuching? Name the place and what's wrong in it.
   - **Gameplay feel**
   - **Phone performance**
   - **Code and architecture:** structure, dead code, risky patterns, things that will not scale
   - **Tests and tooling**
   - **Data and licence honesty**
   - **Deployment**
4. Rank your findings, the most valuable first. Give each one:
   - what's wrong
   - the evidence (a file and line, a URL with flags, or what you saw where)
   - why it matters to a player or to the project
   - a suggested fix and a rough effort (S / M / L)
   Keep only real issues; say so when something is good.
5. End with:
   - where you **agree or disagree with `PLAN_N2.md`**: what you would add, drop or reorder, and why
   - your top three changes if you could make only three

Be specific and honest. Don't flatter, and don't pad. The owner will compare your review with the other models' reviews.
