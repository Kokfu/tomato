# Kuching 3D: buildings track (after night 3, one district per night)

**Goal.** Every district reads as its real self, and the buildings people know are recognisable. Matching all ~36,000 buildings
one by one is not possible from licensed data: about 3,700 OSM and 33,000 Overture outlines are real, but only ~60 have a known
number of floors, 3 a height and 4 a roof shape. So the method is GTA's: **photo research, then rules per district, then
hand-built landmarks**.

**Rules.** `PLAN.md` rules and budgets, as amended by `PLAN_N2.md`; sources only as `docs/MAP_SOURCES.md` allows. One branch per
night (`night/buildings-<n>`), results in `docs/buildings/<district>/`. The skills `kuching-district`, `kuching-city-tour`,
`kuching-verify` and `kuching-milestone` apply.

## Owner's part (this decides how good it gets)
1. **Photos, district by district:** 20–40 phone photos per district, of each street's typical row, corners, roofs from a high
   point, gates and porches, signboards and colours, plus every building people would recognise. Put them in
   `docs/refs/owner/<district>/`, with the street name in the file name. Dashcam video of a drive through works too.
2. **Floors and roofs into OpenStreetMap:** the StreetComplete app (Android) asks "how many floors" and "what roof" while you walk.
   Each answer goes into OSM under its licence and reaches the game at the next data re-fetch.
3. **Pick the order** of districts below by where players (and you) spend time.

## B-M0: Malaysian building kit (one night, before any district)
Things that make *any* Kuching street read as Malaysian, applied citywide by the existing type rules:
- Terrace (link) houses: two storeys, a car porch, a front gate and fence, and window grilles. Semi-detached houses and bungalows
  with walls and gates.
- Roofs: terracotta tile or zinc by type and age; water tanks, aircon compressors and satellite dishes.
- Flats and apartment blocks: four or five storeys, open stairwells, laundry poles at windows.
- Shophouse rows: the right storey counts per era (pre-war 2, 1960s–80s 3–4), five-foot ways, roller shutters.
- Heights: use OSM `building:levels` wherever it exists; otherwise the type's range.
- **Done when:** the residential tour view and three new residential views score at least 3.5, within the triangle budget.

## District nights (one each; the order is the owner's)
For each district:
1. Survey: from the owner's photos, Mapillary and Commons, write `docs/buildings/<district>/SURVEY.md`. It holds a type table:
   era, storeys, roof, facade, colours, ground-floor use, setback, fence or gate.
2. Rules: tune `src/world/arch/buildingType.ts` and the atlas for that district (a new atlas row only if no existing one fits).
3. Landmarks: hand-build the 3–5 buildings people know (the `kuching-district` method, Verified / Approximate labels).
4. Tour: add two or three frozen views for the district (new views only; the 14 existing ones stay frozen).

| District | Why it matters | Notes |
|---|---|---|
| Padungan and Jalan Song | 1930s shophouse rows, the cat statues, nightlife | M5 did the Cat Statue only |
| Civic centre (Jalan Tun Abang Haji Openg, Jalan Barrack) | GPO, Round Tower, Pavilion, museums | the Antigravity review names these |
| Satok and Jalan Kulas | the weekend market, the suspension bridge | |
| Kampungs across the river (Boyan, Gersik, Sinjan) | Malay timber houses on stilts | seen from the whole Waterfront |
| Jalan Rock and Kenyalang | 1970s–80s shophouses, schools, the hospital | |
| Residential (Tabuan, Stutong, BDC) | where most people live | partly outside today's map box |
| Newer commercial (The Spring, Vivacity, Boulevard) | malls people drive to | brand names only from licensed sources |

**Outside the map box** (today 7.2 x 5.0 km, 1.535–1.580 N, 110.315–110.380 E): growing it is the owner's decision. Pending and
parts of Tabuan need a bigger box. More area costs download size and start-up time, and those must stay in budget.
