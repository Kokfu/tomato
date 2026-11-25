# M5c handoff: places 5 and 6 are built and committed; the M5 close-out is not done
Stopped by the session's usage limit, not by a blocker. Branch night/city-realism-1, nothing pushed.
- 46339d5 "N1-M5: Padungan + Cat Statue": complete (code, tests, note docs/night/m5-padungan-cat-statue.md,
  LIMITATIONS, FLAGS, references, before/after in m5c/padungan/).
- f41c9db "N1-M5: City Mosque + Floating Mosque": code, unit tests, e2e, references and cameras are in; documents are not.
## Left to do, in order
1. Place 6 documents: docs/night/m5-city-mosque-floating-mosque.md (same layout as the Padungan note), a
   "place 6" section in docs/LIMITATIONS.md, the m5 row of docs/FLAGS.md. Facts are in the header comments of
   src/world/landmarks/cityMosque.ts, floatingMosque.ts (verified) and src/world/district/mosqueGraves.ts.
2. Re-capture m5c/mosques/after (the committed shots predate the grave trim and the wider crenels):
   node tools/dev/street-shots.ts docs/night/m5c/mosques/after --url=http://localhost:5175/ --views=tools/dev/m5-mosque-views.json --quality=medium --size=1280x720 --jpeg --stats
   (before = same with ?m5=0, already captured and still valid).
3. Targeted e2e not yet run after place 6: landmarks, gameplay, district, shader-prep (they passed after place 5;
   m5-mosques and m5-padungan pass). Restore docs/screenshots afterwards (git checkout -- docs/screenshots).
4. Close M5 with kuching-milestone: build to C:/Kuching3D-night-builds/m5c, ONE phone bench pair against baseline,
   load-probe, tour (desktop 1366x768; phone --size=390x844 --mobile) into docs/night/m5c/, contact sheets,
   CRITIQUE.md (scores table from m5b/CRITIQUE.md; views 07 and 08 change), NOTES.md (<60 lines), perf.json.
5. PLAN.md: M5 -> DONE with all six hashes; Decision log lines (below). Commit "N1-M5c: ...".
## Numbers already measured (Medium, tools/dev/chunk-tris.mts, triangles / meshes, before -> after)
- 4_0 22,310/20 -> 24,432/21; 4_1 19,773 -> 20,839; 5_1 32,450 -> 34,374; 5_2 21,079 -> 21,235; 6_2 39,075/21 -> 39,933/22.
- -2_-1 18,014/22 -> 30,378/23 (+69 %, over the +12 % guide); -2_0 35,663 -> 36,653; -1_-2 3,613 -> 2,313 (measured
  before the crenel pitch change; re-measure -2_-1).
## Decisions to log in PLAN.md
- Tour view 07's statue is the Cat Column (Everrise mapped beside node 2404396149), the white Great Cat is node
  4332185093 at the east end with the mapped paifang; both built. The paifang was a solid building across the road:
  now open, piers placed from where the mapped carriageways cross its outline.
- No parked cars on Padungan (carriageways mapped 6 m wide); kapcai only where the frontage is far enough back.
- New landmark models are registered only with m5 on, so ?m5=0 keeps the generic buildings.
- Floating mosque: domes slate, nothing gold, because the only licensed photograph is at night; no new download.
- Graves by rule (rows across the direction of Mecca), no collision; trimmed to about 300 at 22 triangles each.
## Gotchas
- box / quad / kapcai of IndiaStreetMesh.ts draw with that module's colour: set it with paint(), not a local Color.
- A dev server (vite, port 5175) started by this session may still be running: stop it before the bench.
