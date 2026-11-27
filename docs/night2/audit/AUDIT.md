# N2-M1 Map Truth Audit: Kuching Roads, Roundabouts, Signals, Dual Carriageways & Bridges

**Extract audited:** `data-src/osm/kuching.json` (OSM base `2026-11-14T16:38:21Z`, bbox `1.535–1.580 N, 110.315–110.380 E`, `6.912 x 4.864 km` = `33.6 km²`, `513` chunks), `data-src/osm/pois.json`, `data-src/osm/street.json`, and generated runtime chunks in `public/data/kuching/` against `C:/Kuching3D-night-builds/n2-m0b` (`efc06d9`).
**Sources used (`docs/MAP_SOURCES.md`):** OpenStreetMap extract, Overture Maps 2026-10-21.0 footprints, shipped Wikimedia Commons CC0 / CC-BY / CC-BY-SA reference photos (`public/reference/`, `docs/night/refs/img/`). Zero Google imagery or Street View was accessed (`docs/night2/audit/OWNER_NOTES.md` is not yet present).

## Classification key
- **A — Drawn wrong (game bug):** OpenStreetMap maps the feature, or implies its standard Malaysian road geometry, and our generator/renderer draws or simulates it wrong. Fixed in **N2-M2** (geometry) or **N2-M3** (signals & traffic rules).
- **B — Data wrong or missing (OSM gap):** OpenStreetMap omits `lanes`, `width`, `name`, `highway=traffic_signals`, or island features. Actionable steps with exact OSM `way`/`node` IDs are in [`OWNER_TODO.md`](./OWNER_TODO.md) (urgent items bridged via `data-src/overrides/` in N2-M2).
- **C — Outside the map box (`1.535–1.580 N, 110.315–110.380 E`):** Clipped at the boundary or just beyond it; expanding the box is an owner decision.

---

## 1. Top-20 Road & Junction Problems (Ranked by Player Encounter Frequency)

Ranked by proximity to the 14 frozen tour views, start/spawn (`Jalan China` / `Main Bazaar`), job routes, and primary/trunk corridors:

| Rank | Place / Feature | Pos `(x, z)` m | Class | What is wrong today | Fix target |
|---:|---|---|:-:|---|---|
| **1** | **Jalan Main Bazaar false footbridge deck** (`way/931182435` x `way/68332963`) | `(125.2, -143.0)` | **A** | Waterfront promenade `footway` touches river polygon once, so `build.ts:557` (`footWet`) elevates the entire way to `+0.3 m` with bridge railings right across Jalan Main Bazaar by Square Tower (`shots/bug-main-bazaar-footwet-eye.jpg`), blocking Scenario E cars (`blocked: ["deck"]`). | **N2-M2** (`build.ts`) |
| **2** | **Jalan Gambier false footbridge deck** (`way/901466610` x `way/217916874`) | `(-82.0, -218.0)` | **A** | Same `footWet` rule turns an untagged riverside footway into a `+0.3 m` non-drivable deck across Jalan Gambier (`chunk -1_-1`, 36 m from View 05), blocking westbound vehicles. | **N2-M2** (`build.ts`) |
| **3** | **Padungan / Abell / Central Timur Roundabout** (`ways 69063568` + 7 ring ways, 105.3 m) | `(1643.4, 546.2)` | **A + B** | **A:** Ring has inner footpath + monsoon drain (`StreetEdges.ts`), rain trees on ring, 0 kerbed central island, 0 splitter islands on 16 one-way arms, 0 give-way lines, `6.8 m` width (`9 m * 0.75` in `osm.ts:150`). **B:** All 8 ring ways lack `name` and `lanes` (`shots/rb-09-way69063568-top.jpg`). | **N2-M2** (A) + `overrides` / OSM (B) |
| **4** | **Dual-carriageway medians citywide** (`Jalan Tun Abang Haji Openg`, `Jalan Padungan`, `Jalan Tun Salahuddin`, `Jalan Matang`, 259 pairs) | View 07, 12, citywide | **A** | `StreetEdges.ts` draws only a `0.55 m` black/white strip per carriageway while `TerrainBuilder` paints the `4.3–15.7 m` median between them grey concrete (`shots/dual-openg-top.jpg`, `shots/dual-padungan-top.jpg`), with no kerbed grass island, median trees, or central lamps. | **N2-M2** |
| **5** | **Static & single-pole traffic signals** (113 OSM nodes across 46 junctions) | View 01, 02, 06, 07, 12 | **A** | `build-streetscape.ts:255` places 1 static non-glowing pole per OSM node: single-node 4-way junctions (e.g. `node/1386151302` Openg/Wawasan, `node/2272247695` Market/Khoo Hun Yeang) get only 1 pole for 3–4 approaches, lenses never cycle R/A/G, and ambient cars ignore roundabout give-way. | **N2-M3** |
| **6** | **Jalan Barrack × Jalan Khoo Hun Yeang** (`nodes 2272249813, 833915199`) & **Openg × McDougall / Barrack** (`nodes 1386151600, 1386151313, 833915242, 833915187`) | `(-98.4, 51.9)` (13 m @ View 06) | **B + A** | Major primary/secondary downtown intersections right beside Plaza Merdeka & Padang Merdeka have **0** `highway=traffic_signals` nodes in OSM (`shots/unsig-barrack-khoo-top.jpg`). Candidate inferred signals in N2-M3; owner to confirm in OSM. | **N2-M3** (inferred) + OSM (B) |
| **7** | **Jalan Market × Jalan Datuk Ajibah Abol / Haji Taha** (`nodes 2272259332, 2272257281`) + **0.6 m footbridge `way/423061314`** | `(-398.5, 44.4)` (20 m @ View 08) | **A + B** | **A:** `way/423061314` (`footway, bridge=yes`, 28 m span across Jalan Market at City Mosque) gets `H = 0.6 m` (`build.ts:517`, `span <= 60 m`!) instead of `5.5 m` overpass clearance. **B:** Main primary/secondary junctions at `2272259332` & `2272257281` lack signal tags in OSM. | **N2-M2** (bridge) + **N2-M3** (signals) |
| **8** | **Pedestrian overpasses < 60 m span across dual carriageways** (`ways 232143130` Padungan, `196047759, 423061308, 423061309` Openg, `232328847` Simpang Tiga) | Padungan, Openg, Simpang Tiga | **A** | `build.ts:518` only enforces `H >= 5.5 m` when `span > 60 m`, leaving 28–49 m highway footbridges at `0.60–1.74 m` above the carriageway! | **N2-M2** (`build.ts`) |
| **9** | **Untagged one-way `primary`/`trunk`/`secondary` width shrinkage** (`osm.ts:150`) | `Jalan Padungan`, `Jalan Abell`, `Jalan Green`, `Jalan Astana` | **A + B** | **A:** `osm.ts` multiplies untagged `oneway=yes` group-3 widths by `0.75` (`primary` `9 m -> 6.75 m`, `secondary` `8 m -> 6.0 m`), making 2–3 lane dual carriageways narrower than 2-lane residential streets (`7.2 m`). **B:** `92.5%` of `secondary` and `62.8%` of `primary` ways lack `lanes=*`. | **N2-M2** (A) + OSM (B) |
| **10** | **Jambatan Tun Abdul Rahman Ya'kub (Satok trunk bridge)** (`ways 113702300, 113702301`) | `(-2230.5, 340.8)` (View 09) | **A** | Southbound 3-lane trunk bridge `way/113702301` drops to `elev = 2.48 m` (`~0.68 m` above ground) right where it crosses over `Jalan Matang` (`ways 233980761, 682028296`) and `Jalan Satok-Kulas Interchange` (`way/682028852`) (`shots/bridge-satok-top.jpg`). | **N2-M2** (`build.ts`) |
| **11** | **Satok Suspension Bridge (`Jambatan Gantung Satok`)** (`way/1104674947`, 205 m) | `(-2121.7, 530.0)` (415 m @ View 09) | **B + A** | **B:** Mapped as an unnamed `highway=footway, bridge=yes` (`way/1104674947`), so `landmarks.json` failed to match `"Satok Bridge"`. **A:** Drawn as a flat concrete girder deck with 28 m piers in the river instead of a high-span suspension footbridge. | **N2-M2** + OSM (B) |
| **12** | **Jalan Matang Primary Roundabout** (`way/129145587`, 67.4 m, `lanes=2`) | `(-2248.0, 236.0)` (383 m @ View 09) | **A + B** | **A:** No kerbed central island, inner monsoon drain on ring, rain trees in asphalt, no splitter islands or give-way teeth (`shots/rb-05-way129145587-top.jpg`). **B:** Missing `name`, and 5 of 6 entry arms (`682028296`, etc.) lack `lanes=*`. | **N2-M2** (A) + OSM (B) |
| **13** | **Ong Kee Hui / Taman Budaya Roundabout** (`way/68323813`, 50.8 m, `secondary`) | `(87.1, 1096.8)` (451 m @ View 12) | **A + B** | **A:** Inner footpath/drain around central grass (`way/243927120`), no kerb/palms, no give-way lines or splitter islands (`shots/rb-06-way68323813-top.jpg`). **B:** Ring `way/68323813` and 4 of 6 arms lack `name` and `lanes=2`. | **N2-M2** (A) + OSM (B) |
| **14** | **Bulatan Engleham** (`ways 233689881, 1368595533..35`, 148.3 m, `primary`, `lanes=3`) | `(529.1, 664.1)` (692 m @ View 07) | **A + B** | **A:** Inhabited block-roundabout (`Transit Inn` `way/236945089` & `way/233689546` stand inside!) — roundabout island generator must respect interior buildings/service roads while adding entry give-way lines & splitter islands (`shots/rb-12-way233689881-top.jpg`). **B:** `Jalan Ban Hock` & `Jalan Tabuan` north arms lack `lanes`. | **N2-M2** (A) + OSM (B) |
| **15** | **Residential & Tertiary Roundabouts** (e.g. `way/263172781` Nanas Barat 146 m @ View 11; `way/71043076` 321 m @ View 07; `way/233940806` Jalan Hospital 333 m @ View 12; 13 Darul Hana rings) | Citywide (`11.9–47.4 m`) | **A + B** | **A:** Centres painted flat grey concrete with 0 kerbed island (`roundabouts-topdown-sheet.jpg`); tertiary rings shrunk to `5.3 m`. **B:** 7 Darul Hana rings (`1270318171`, `1186659753`, etc.) & Pending `way/187775282` tagged `lanes=1` (`3.9 m`) despite `lanes=2` (`7.2 m`) arms. | **N2-M2** (A) + OSM (B) |
| **16** | **Junction kerb corners, overlapping ribbons & `*_link` slip lanes** (158 link ways, 10.32 km) | All major junctions | **A + B** | **A:** Road ribbons stack with `0.002 m` `yOff` steps and round end-caps (`RoadBuilder.ts:84`), producing visible seams/flicker at multi-class intersections and square kerb corners instead of filleted corner radii & splitter islands. **B:** `147/158` `*_link` ways lack `lanes=1`. | **N2-M2** (A) + OSM (B) |
| **17** | **Bulatan Datuk Temenggong Abang Kipali & trunk underpass** (`way/54244417`, 174.3 m + `ways 782023507..520`) | `(-2623.9, -1149.3)` | **A** | Eight `highway=trunk, tunnel=yes, layer=-1` ways (`782023507..782023520`) are drawn on the surface straight across the grass roundabout island (`shots/bug-kipali-underpass-eye.jpg`), and ring lacks kerbed island & splitter islands. | **N2-M2** |
| **18** | **Demak / Tun Salahuddin Roundabout** (`way/102631452`, 137.8 m, `trunk`, `lanes=3`) & **Bulatan Abang Haji Abdillah** (`way/129145455`, 163.4 m, `primary`) | `(1318.4, -832.4)` & `(754.1, -1452.8)` | **A + B** | **A:** Giant Petra Jaya / Demak roundabouts lack kerbed central islands, give-way teeth, and splitter islands; `129145455` is shrunk to `6.8 m` (`shots/rb-16-way102631452-top.jpg`, `shots/rb-19-way129145455-top.jpg`). **B:** `102631452` lacks `name`; `129145455` lacks `lanes=3`. | **N2-M2** (A) + OSM (B) |
| **19** | **Tun Salahuddin Bridge (`Jambatan Tun Salahuddin`)** (`ways 110703933, 110703935`, 856 m) | `(3700.1, -15.5)` | **A + C** | **A:** Western approach crosses `way/641576481` at `3.54–3.81 m` (`~1.7 m` clearance). **C:** Bridge and Pending interchange are sliced off at the `110.380 E` eastern bbox border (`shots/bridge-tun-salahuddin-top.jpg`). | **N2-M2** (A); Owner bbox decision (C) |
| **20** | **Boundary-clipped northern roundabouts & southern Kuching arterial hubs** (`Bulatan Suleiman` `way/54254288`, `way/129613881`; 3rd Mile & BDC roundabouts) | `z = -2377` (`1.580 N`) & `< 1.535 N` | **C** | `Bulatan Datuk Amar Abang Haji Suleiman` (`way/54254288`, 171.9 m) and `way/129613881` are cut in half at `1.580 N` (`roundabouts-topdown-sheet.jpg` #31, #36); 3rd Mile (`~1.529 N`) and BDC/Airport roundabouts lie south of `1.535 N`. | Owner bbox decision (C) |

---

## 2. Complete Roundabout Inventory (52 OSM Ways → 39 Physical Roundabouts)

All 39 roundabouts are shown top-down in [`roundabouts-topdown-sheet.jpg`](./roundabouts-topdown-sheet.jpg) and at eye level in [`roundabouts-eye-sheet.jpg`](./roundabouts-eye-sheet.jpg) (cell labels match `#-firstWayId` below). Individual `800x450` shots for all 16 major/collector roundabouts are in [`shots/`](./shots/).
- **Key OSM finding:** **Zero** of the 39 roundabouts in `kuching.json` / `pois.json` contain a mapped `historic=monument`, `amenity=fountain`, or `tourism=artwork` inside their island (`17` map `landuse=grass`, `1` maps buildings inside [`Bulatan Engleham`], `1` maps `place=suburb` node, and `20` map nothing inside).

| # | Name (or connecting streets if unnamed) | OSM Way ID(s) | `(x, z)` m / `lat, lon` | Diam | Class / `lanes` (game `w`) | Arms (`1w`/`2w`) | Mapped inside | Tour dist | Cat |
|---:|---|---|---|---|---|:-:|---|---:|:-:|
| 1 | *(unnamed: Jln Ong Guan Poh / Jln Nanas Barat)* | `263172781` | `(-1756, 997)` `1.54948, 110.32872` | 23.3 m | `residential` / — (`6.0 m`) | 8 (`8`/`0`) | none | 146 m @ 11 | A, B |
| 2 | *(unnamed off Jln Padungan)* | `71163272` | `(1284, 410)` `1.55480, 110.35603` | 14.9 m | `residential` / — (`6.0 m`) | 5 (`4`/`1`) | none | 269 m @ 07 | A |
| 3 | *(unnamed tertiary S of Jln Bukit Mata)* | `71043076` | `(784, 375)` `1.55511, 110.35154` | 28.4 m | `tertiary` / — (`5.3 m`) | 5 (`5`/`0`) | none | 321 m @ 07 | A, B |
| 4 | **Jalan Hospital** (× Jln Hokkien, Sarawak Gen. Hospital) | `233940806` | `(-577, 1504)` `1.54490, 110.33932` | 23.7 m | `tertiary` / — (`5.3 m`) | 6 (`5`/`1`) | none | 333 m @ 12 | A, B |
| 5 | *(unnamed: Jalan Matang)* | `129145587` | `(-2248, 236)` `1.55637, 110.32430` | 67.4 m | `primary` / `2` (`7.2 m`) | 6 (`6`/`0`) | `way/1287448945` (`grass`) | 383 m @ 09 | A, B |
| 6 | *(unnamed: Jln Tan Sri Datuk Ong Kee Hui / Jln Taman Budaya)* | `68323813` | `(87, 1097)` `1.54858, 110.34528` | 50.8 m | `secondary` / — (`8.0 m`) | 6 (`6`/`0`) | `way/243927120` (`grass`) | 451 m @ 12 | A, B |
| 7 | *(unnamed service/res E of The Spring)* | `654986526` | `(1978, 2182)` `1.53877, 110.36227` | 11.9 m | `residential` / — (`6.0 m`) | 2 (`0`/`2`) | none | 502 m @ 10 | A |
| 8 | *(unnamed Petra Jaya riverside)* | `637464804` | `(775, -166)` `1.56000, 110.35146` | 16.9 m | `residential` / — (`6.0 m`) | 5 (`3`/`2`) | none | 504 m @ 07 | A |
| 9 | *(unnamed: Jln Abell / Jln Padungan / Jln Central Timur)* | `69063568, 1198221689, 1198221690, 1198221691, 1198221694, 1368595980, 1368616469, 1368616470` | `(1643, 546)` `1.55356, 110.35927` | 105.3 m | `primary` / — (`6.8 m`) | 16 (`16`/`0`) | `ways 232328869, 232328872` (`grass`) | 646 m @ 07 | A, B |
| 10 | *(unnamed: Lrg Satok 7 / Lrg Rubber 10)* | `234205228` | `(-1038, 701)` `1.55216, 110.33517` | 14.7 m | `residential` / — (`6.0 m`) | 5 (`2`/`3`) | none | 647 m @ 11 | A |
| 11 | *(unnamed: Lrg Nanas No. 4 / Jln Rambutan / Lrg Rubber 3)* | `69353531` | `(-930, 932)` `1.55008, 110.33614` | 23.6 m | `residential` / — (`6.0 m`) | 8 (`8`/`0`) | none | 684 m @ 11 | A |
| 12 | **Bulatan Engleham** (Jln Tabuan / Jln Ban Hock) | `233689881, 1368595533, 1368595534, 1368595535` | `(529, 664)` `1.55249, 110.34926` | 148.3 m | `primary` / `3` (`10.5 m`) | 14 (`12`/`2`) | `ways 233689546, 236945089` (`building`, Transit Inn) | 692 m @ 07 | A, B |
| 13 | *(unnamed tertiary N of Satok)* | `234855089, 1287446898, 1287446899` | `(-2098, -85)` `1.55926, 110.32565` | 32.1 m | `tertiary` / — (`5.3 m`) | 6 (`6`/`0`) | `way/1287448943` (`grass`) | 722 m @ 09 | A, B |
| 14 | *(unnamed: Jln Petanak / Jln Blacksmith)* | `235320887` | `(1921, 320)` `1.55561, 110.36176` | 47.4 m | `tertiary` / — (`7.0 m`) | 6 (`6`/`0`) | `way/243956337` (`grass`) | 850 m @ 07 | A, B |
| 15 | *(unnamed: Jln Ang Cheng Ho W)* | `243958214` | `(2076, 591)` `1.55316, 110.36316` | 13.6 m | `unclassified` / — (`6.0 m`) | 6 (`6`/`0`) | none | 1061 m @ 07 | A |
| 16 | *(unnamed: Jln Demak / Jln Tun Salahuddin)* | `102631452` | `(1318, -832)` `1.56603, 110.35635` | 137.8 m | `trunk` / `3` (`10.5 m`) | 8 (`8`/`0`) | `way/264095697` (`grass`) | 1099 m @ 07 | A, B |
| 17 | *(unnamed: Jln Ang Cheng Ho / Lrg Ang Cheng Ho 7)* | `243958287` | `(2255, 600)` `1.55307, 110.36476` | 14.2 m | `unclassified` / — (`6.0 m`) | 8 (`8`/`0`) | none | 1234 m @ 07 | A |
| 18 | *(unnamed private/service loop)* | `640004980` | `(1328, -1024)` `1.56776, 110.35643` | 20.2 m | `service` / — (`4.0 m`) | 3 (`0`/`3`) | none | 1288 m @ 07 | A |
| 19 | **Bulatan Datuk Patinggi Abang Haji Abdillah...** | `129145455` | `(754, -1453)` `1.57164, 110.35128` | 163.4 m | `primary` / — (`6.8 m`) | 12 (`12`/`0`) | `way/263477508` (`grass`) | 1468 m @ 05 | A, B |
| 20 | **Bulatan Datuk Temenggong Abang Kipali bin Abang Akip** | `54244417` | `(-2624, -1149)` `1.56889, 110.32092` | 174.3 m | `trunk` / `3` (`10.5 m`) | 12 (`11`/`1`) | `ways 263447220, 344, 345` (`grass`) + 8 trunk tunnel ways | 1644 m @ 09 | A |
| 21 | *(unnamed: Lrg Darul Hana Utara 2 / 2A / 2B)* | `1270315300` | `(2436, -956)` `1.56715, 110.36639` | 16.6 m | `residential` / `2` (`7.2 m`) | 4 (`2`/`2`) | `way/1270315299` (`grass`) | 1812 m @ 07 | A |
| 22 | *(unnamed: Lrg Darul Hana Utara 2A / 2A 4 / 2A 1)* | `1270318171` | `(2452, -1087)` `1.56833, 110.36653` | 14.8 m | `residential` / `1` (`3.9 m`) | 4 (`0`/`4`) | `way/1270320590` (`grass`) | 1912 m @ 07 | A, B |
| 23 | *(unnamed: Lrg Darul Hana Utara 2A / 2A 6 / 2A 3)* | `1270320592` | `(2457, -1147)` `1.56888, 110.36658` | 17.9 m | `residential` / `2` (`7.2 m`) | 4 (`0`/`4`) | `way/1270320591` (`grass`) | 1958 m @ 07 | A |
| 24 | *(unnamed: Lrg Darul Hana Utara 2B 6 / 2A 2B)* | `1186659753` | `(2805, -706)` `1.56488, 110.36971` | 15.1 m | `residential` / `1` (`3.9 m`) | 3 (`0`/`3`) | `way/1270324296` (`grass`) | 1972 m @ 07 | A, B |
| 25 | *(unnamed: Lrg Darul Hana Utara 2A / 2A 8 / 2A 10)* | `1270358627` | `(2464, -1223)` `1.56956, 110.36664` | 24.6 m | `residential` / `2` (`7.2 m`) | 8 (`4`/`4`) | `way/1270323200` (`grass`) | 2016 m @ 07 | A |
| 26 | *(unnamed: Lrg Darul Hana Utara 2A 2B / 2B 1)* | `1270362185` | `(2773, -864)` `1.56632, 110.36942` | 14.8 m | `residential` / `1` (`3.9 m`) | 3 (`0`/`3`) | `way/1270324295` (`grass`) | 2025 m @ 07 | A, B |
| 27 | *(unnamed: Lrg Darul Hana Utara 2A / 2A 12 / 2A 9)* | `1270356141` | `(2469, -1300)` `1.57026, 110.36669` | 17.8 m | `residential` / `2` (`7.2 m`) | 4 (`0`/`4`) | `way/1270323201` (`grass`) | 2077 m @ 07 | A |
| 28 | *(unnamed: Lrg Darul Hana Utara 2A 2B / 2A 2)* | `1270362184` | `(2785, -1003)` `1.56757, 110.36953` | 15.0 m | `residential` / `1` (`3.9 m`) | 3 (`0`/`3`) | `way/1270324294` (`grass`) | 2114 m @ 07 | A, B |
| 29 | *(unnamed: Lrg Darul Hana Utara 2A / 2A 14 / 2A 11)* | `1270356148` | `(2474, -1363)` `1.57083, 110.36674` | 17.2 m | `residential` / `2` (`7.2 m`) | 4 (`0`/`4`) | `way/1270323202` (`grass`) | 2127 m @ 07 | A |
| 30 | *(unnamed: Jalan Pending)* | `187775282` | `(3138, 899)` `1.55037, 110.37270` | 29.1 m | `primary` / `1` (`3.9 m`) | 6 (`6`/`0`) | none | 2166 m @ 07 | A, B |
| 31 | *(unnamed at N boundary `1.58000 N`)* | `129613881` | `(233, -2378)` `1.58000, 110.34659` | 46.3 m | `unclassified` / — (`6.0 m`) | 3 (`3`/`0`) | none (clipped by bbox) | 2173 m @ 05 | C |
| 32 | *(unnamed: Lrg Darul Hana Utara 2A / 2A 16 / 2A 13)* | `1270356150` | `(2480, -1426)` `1.57140, 110.36678` | 17.2 m | `residential` / `2` (`7.2 m`) | 4 (`0`/`4`) | `way/1270323203` (`grass`) | 2179 m @ 07 | A |
| 33 | *(unnamed: Lrg Darul Hana Utara 2A 12 / 2A 10B)* | `1270358626` | `(2640, -1288)` `1.57014, 110.36823` | 14.7 m | `residential` / `1` (`3.9 m`) | 4 (`0`/`4`) | `way/1270324299` (`grass`) | 2187 m @ 07 | A, B |
| 34 | *(unnamed: Lrg Darul Hana Utara 2A 14 / 2A 10B)* | `1270358625` | `(2645, -1351)` `1.57072, 110.36827` | 14.5 m | `residential` / `1` (`3.9 m`) | 4 (`0`/`4`) | `way/1270324298` (`grass`) | 2235 m @ 07 | A, B |
| 35 | **Bulatan Datuk Menteri Abang Haji Mohammad Zin...** | `129613869` | `(-1324, -2174)` `1.57816, 110.33260` | 170.4 m | `trunk` / `3` (`10.5 m`) | 8 (`8`/`0`) | `ways 263446885, 264106131` (`grass`) | 2276 m @ 01 | A |
| 36 | **Bulatan Datuk Amar Abang Haji Suleiman bin Haji Taha** | `54254288` | `(757, -2361)` `1.57985, 110.35130` | 171.9 m | `trunk` / — (`7.5 m`) | 5 (`5`/`0`) | `way/263446845` (`grass`; N half outside bbox) | 2284 m @ 05 | A, B, C |
| 37 | *(unnamed: Lrg Darul Hana Utara 2A 2A / 2A 16)* | `1270358624` | `(2751, -1410)` `1.57125, 110.36922` | 15.0 m | `residential` / `1` (`3.9 m`) | 3 (`0`/`3`) | `way/1270324297` (`grass`) | 2352 m @ 07 | A, B |
| 38 | *(unnamed: Jln Datuk Abang Abdul Rahim)* | `833615114, 1420647637` | `(3400, 669)` `1.55245, 110.37505` | 27.8 m | `tertiary` / — (`7.0 m`) | 8 (`6`/`2`) | none | 2364 m @ 07 | A, B |
| 39 | *(unnamed Darul Hana NE)* | `828966941` | `(3385, -1440)` `1.57152, 110.37492` | 16.9 m | `residential` / — (`6.0 m`) | 4 (`2`/`2`) | none | 2856 m @ 07 | A |

---

## 3. Traffic Signals Inventory (113 Mapped Nodes + 37 Unsignalled Main-Road Candidate Junctions)

### 3.1 Mapped `highway=traffic_signals` (`data-src/osm/pois.json`: 113 nodes → 46 physical junctions)
- **What OSM maps:** `113` signal nodes clustering (within `45 m`) into **`46` distinct junctions**: `15` single-node junctions, `13` two-node junctions, `3` three-node junctions, `14` four-node junctions, and `1` five-node junction (`Jln Green / Jln Stapok / Jln Tun Ahmad Zaidi Adruce`: `nodes 849415875, 849415877, 849415912, 849415913, 4002344476`).
- **Closest mapped signal junctions to the tour:**
  1. `node/1386151302` (`(10.8, 74.3)`, `Jln Wawasan / Jln Tun Abang Haji Openg / Jln Pearl`, 108 m @ View 06) — single node on a 3-approach junction.
  2. `node/2272247695` (`(-281.1, -114.6)`, `Jln Market / Lrg Market / Jln Khoo Hun Yeang`, 127 m @ View 01) — single node.
  3. `nodes 828720783, 2408625959` (`(972.4, 371.6)`, `Jln Song Thian Cheok`, 167 m @ View 07).
  4. `nodes 13382576961, 65, 69, 76` (`(-1442.1, 1013.9)`, `Jln Green / Jln Nanas`, 168 m @ View 11).
  5. `nodes 822594916, 41, 822763936, 39` (`(-338.6, 1108.8)`, `Jln Tun Abang Haji Openg / Jln Badruddin / Jln Taman Budaya`, 182 m @ View 12, `shots/sig-openg-badruddin-eye.jpg`).
  6. `node/11133240862` (`(382.6, 155.4)`, `Jln Wawasan / Lebuh Wayang`, 191 m @ View 02) & `node/2272378873` (`(475.4, 139.1)`, `Jln Tunku Abdul Rahman / Lebuh Temple`, 241 m @ View 02).
- **Class A problems (to fix in N2-M3):** (1) Single-node junctions only receive 1 pole instead of 1 signal head per entry approach; (2) signal lenses are static vertex colours rather than cycling R/A/G on one junction clock with night glow; (3) two signal pairs (`nodes 828708261, 828708460` and `828708256, 1429723127`) sit at pedestrian/entry approaches immediately outside the Padungan Roundabout (`(1621, 497)` and `(1682, 586)`).

### 3.2 Unsignalled Junctions of Two or More Main Roads (`trunk`, `primary`, `secondary`) — **GUESS FOR OWNER CONFIRMATION, NOT FACT**
> **Honesty notice:** None of the 37 junctions below has `highway=traffic_signals` in `kuching.json`/`pois.json`. Whether each is signalized in real Kuching, priority/give-way controlled, or a free-flow merge/split is **a guess for the owner to confirm**, not an established fact. In **N2-M3**, any inferred signals placed on high-conflict multi-approach main crossroads from this list will be marked `"inferred"` in `LIMITATIONS.md` and switchable via flag/setting.

| # | Node ID(s) | `(x, z)` m (`lat, lon`) | Classes | Intersecting main roads | Tour dist | Audit note (for owner confirmation) |
|---:|---|---|---|---|---:|---|
| 1 | `2272249813, 833915199` | `(-98.4, 51.9)` (`1.55803, 110.34362`) | `primary/secondary` | Jalan Barrack × Jalan Khoo Hun Yeang | 13 m @ 06 | Likely signalized 4-leg urban junction beside Plaza Merdeka |
| 2 | `2272259332` | `(-402.7, 48.5)` (`1.55806, 110.34088`) | `primary/secondary` | Jalan Market × Jalan Datuk Ajibah Abol | 23 m @ 08 | Likely signalized junction right in front of City Mosque |
| 3 | `828720788, 828708504` | `(1040.9, 221.8)` (`1.55649, 110.35385`) | `primary/secondary` | Jalan Song Thian Cheok × Jalan Padungan | 38 m @ 07 | West of Cat Column; confirm signal vs left-in/one-way priority |
| 4 | `6041435697, 828708325` | `(1112.7, 216.9)` (`1.55654, 110.35450`) | `primary/secondary` | Jalan Abell × Jalan Padungan | 44 m @ 07 | Cat Column triangle junction; confirm signal vs priority |
| 5 | `835785769` | `(-214.0, -155.9)` (`1.55991, 110.34258`) | `primary` | Jalan Gambier × Jalan Power × Jalan Market | 52 m @ 01 | Old-town one-way split/merge; confirm signal vs give-way |
| 6 | `2272257281, 6134765387, 2272258156` | `(-400.4, 99.3)` (`1.55760, 110.34090`) | `primary/secondary` | Jalan Haji Taha × Jalan Datuk Ajibah Abol × Jalan Market | 73 m @ 08 | Major 4-way junction S of City Mosque; likely signalized |
| 7 | `833915197` | `(-145.0, 126.9)` (`1.55735, 110.34320`) | `primary/secondary` | Jalan Masjid × Jalan Barrack | 102 m @ 06 | Downtown one-way T-junction; confirm signal |
| 8 | `2272257282, 2272257283` | `(-328.9, 114.1)` (`1.55747, 110.34154`) | `primary/secondary` | Jalan Haji Taha × Jalan P. Ramlee | 117 m @ 08 | Likely signalized crossroads |
| 9 | `2272256755` | `(-281.6, 52.6)` (`1.55802, 110.34197`) | `primary/secondary` | Jalan Masjid × Jalan P. Ramlee × Jalan Gartak | 127 m @ 08 | Likely signalized crossroads |
| 10 | `835785675, 1289015332` | `(-220.9, -13.4)` (`1.55862, 110.34252`) | `primary/secondary` | Jalan Gartak × Jalan Khoo Hun Yeang × Jalan Power | 130 m @ 04 | India St W mouth / Electra House; likely signalized |
| 11 | `835818137, 676351601` | `(959.9, 175.8)` (`1.55691, 110.35313`) | `primary/secondary` | Jalan Padungan × unnamed connector | 131 m @ 07 | Likely unsignalled median/connector turn |
| 12–13 | `1386151600` & `1386151313` | `(-38.1, 160.5)` & `(-62.1, 198.9)` | `primary` | Jalan McDougall × Jalan Tun Abang Haji Openg | 131–161 m @ 06 | Twin nodes of major Padang Merdeka crossroads — likely signalized |
| 14 | `2272381266, 9763215296, 822707139, 2433871989` | `(432.6, 70.1)` (`1.55787, 110.34839`) | `primary` | Jalan Main Bazaar × Lebuh Wayang / Tunku Abdul Rahman | 167 m @ 02 | Tua Pek Kong junction; likely signalized |
| 15 | `835827042, 833916338` | `(111.3, -144.0)` (`1.55980, 110.34550`) | `primary` | Jalan Main Bazaar × Jalan Gambier × Jln Tun Abang Haji Openg | 167 m @ 14 | Square Tower / Courthouse junction; confirm signal vs priority |
| 16–17 | `833915242` & `833915187` | `(-111.2, 277.2)` & `(-164.5, 273.1)` | `primary` | Jalan Barrack × Jalan Tun Abang Haji Openg | 238–244 m @ 06 | Twin nodes at Borneo Cultures Museum / Padang; likely signalized |
| 18, 25 | `1289000275` & `1289000217` | `(-755.8, 112.7)` & `(-943.9, 39.0)` | `secondary` | Jambatan Datuk Amar Juma'ani × Jalan Datuk Ajibah Abol | 360–538 m @ 08 | Bridge approach junctions |
| 19 | `676476537, 2408625970, 2504066419` | `(686.4, 248.8)` (`1.55625, 110.35067`) | `secondary` | Jalan Bukit Mata × connector | 389 m @ 07 | Confirm signal vs priority |
| 20, 24 | `2422629116` & `2422628107` | `(-2223.8, 751.0)` & `(-2078.9, 536.2)` | `secondary` | Lorong Jambatan Gantung 1 × Jln Rubber Barat / Satok Interchange | 403–456 m @ 09 | Satok interchange junctions |
| 21–22 | `2445402602` & `2445402600` | `(1217.1, 631.1)` & `(1171.4, 654.0)` | `secondary` | Jalan Ban Hock × Jalan Deshon | 417–426 m @ 07 | Twin nodes of dual/staggered junction; confirm signal |
| 23 | `849415908, 11380831847` | `(-1585.6, 559.8)` (`1.55344, 110.33025`) | `trunk/secondary` | Jalan Satok × Jalan Green × Jalan Muhibbah | 444 m @ 11 | Major trunk/secondary crossroads — high-confidence missing signal |
| 26 | `6048775435, 11292610402, 2272355583` | `(-1601.2, 452.3)` (`1.55441, 110.33011`) | `trunk/secondary` | Jalan Kulas × Jalan Muhibbah | 551 m @ 11 | Major trunk/secondary crossroads — likely signalized |
| 27 | `9128692979, 11335337657` | `(-427.0, 591.1)` (`1.55315, 110.34066`) | `primary/secondary` | Jalan Satok × Jalan P. Ramlee | 565 m @ 08 | Major crossroads E of Satok Flyover — likely signalized |
| 28 | `1425513620` | `(-1940.9, 432.0)` (`1.55459, 110.32706`) | `secondary` | Jalan Kulas × Satok-Kulas Interchange × Jalan Patinggan | 595 m @ 09 | Confirm priority vs signal |
| 29 | `855113482, 855113459` | `(-753.9, 828.1)` (`1.55101, 110.33773`) | `trunk/secondary` | Jalan Rubber × Jalan Tun Ahmad Zaidi Adruce | 633 m @ 12 | Major trunk crossroads — likely signalized |
| 30–31 | `2408625941` & `1425514288..` | `(1118.2, 919.8)` & `(1166.1, 924.0)` | `secondary` | Jalan Central Timur × Jalan Ellis / Jalan Deshon | 682–691 m @ 07 | Major secondary crossroads — likely signalized |
| 32 | `2421405028` | `(1859.6, 1460.7)` (`1.54529, 110.36121`) | `secondary` | Jalan Ellis × secondary connector | 1102 m @ 10 | Confirm signal vs priority |
| 33–37 | `11541998532..`, `1289000115`, `2423068097`, `1289000098`, `5918199233..` | Petra Jaya (`z = -916..-2026`) | `secondary` | Jalan Astana / Jalan Muhibbah / Jalan Semarak / Jalan Tanjung | 1162–2152 m | North-bank junctions; confirm in field |

---

## 4. Road Widths, Lanes, Dual Carriageways, Slip Lanes & Bridges

### 4.1 Road Widths & `lanes=*` Coverage (`7,733` projected ways)
- **Explicit `width=*`:** Only **6 ways** (`way/328098835` Fairview service driveway `3 m`, and `ways 568501299, 634697570, 779037132, 779315127, 779315128` Jambatan Darul Hana `3.25 m`). **Zero** drivable streets have `width=*`.
- **Missing `lanes=*` by class:**
  - `trunk`: `36 / 112` ways missing (`7.60 / 46.84 km`, e.g. `Jalan Tun Salahuddin` `3.14 km`, `Jalan Demak` `way/1324942072` `2.28 km`, `Jalan Bako` `way/129613863` `2.07 km`).
  - `primary`: `147 / 234` ways missing (`22.56 / 45.64 km`, e.g. `Jalan Pending` `2.82 km`, `Jalan Tabuan` `2.62 km`, `Jalan Stapok` `1.53 km`, `Jalan Abell` `1.53 km`).
  - `secondary`: `247 / 267` ways missing (`37.32 / 41.22 km` — **90.5% of secondary road length!**, e.g. `Jalan Astana` `4.88 km`, `Jalan Green` `4.79 km`, `Jalan Padungan` `3.96 km`, `Jalan Batu Lintang` `2.09 km`, `Jalan Sekama` `1.78 km`, `Jalan Mendu` `1.65 km`, `Jalan Ban Hock` `1.56 km`, `Jalan Ong Kee Hui` `1.47 km`).
  - `tertiary`: `231 / 271` ways missing (`36.82 / 48.70 km`); `residential`: `2,453 / 2,632` ways missing (`284.31 / 307.51 km`).
- **Class A width formula defect (`osm.ts:148–150`):** Currently `lanes * 3.3 + 0.6` adds `0.6 m` instead of `lanes * 3.3 m` (and ignores `lanes=1` min-drivable margins on residential rings), while untagged `oneway=yes` major roads get `d *= 0.75`, squeezing untagged 2-lane one-way `primary` (`6.75 m`) and `secondary` (`6.0 m`) carriageways below `2 * 3.3 = 6.6 m`.

### 4.2 Dual Carriageways (`259` paired one-way corridors)
- Longest paired corridors: `Jln Tun Datuk Patinggi Hj. Abdul Rahman Ya'akub` (`5.28 km`, clear median gap `14.5 m`), `Jalan Tun Salahuddin` (`4.59 km`, gap `10.6 m`), `Jalan Matang` (`3.07 km`, gap `4.3 m`), `Jalan Tun Razak` (`2.90 km`, gap `14.2 m`), `Jalan Batu Lintang` (`2.86 km`, gap `11.8 m`), `Jalan Green` (`2.58 km`, gap `5.6 m`), `Jalan Tun Ahmad Zaidi Adruce` (`2.48 km`, gap `10.1 m`), `Jalan Tun Abang Haji Openg` (`2.33 km`, gap `5.9 m`), `Jalan Demak` (`2.28 km`, gap `12.6 m`), `Jalan Padungan` (`2.22 km`, gap `11.7 m`), `Jalan Tabuan` (`1.66 km`, gap `8.5 m`), `Jalan Satok` (`1.12 km`, gap `15.7 m`).
- **Class A:** Medians between paired one-way carriageways currently render as flat grey concrete (`TerrainBuilder`) flanked by two thin `0.55 m` kerb strips (`StreetEdges.ts`), with no raised grass median fill, median trees/palms, or central double-arm lamp posts, and without clean median nose caps at mapped U-turn / cross-street gaps.

### 4.3 Slip Lanes (`158` `*_link` ways, `10.32 km`)
- `33 trunk_link` (`3.57 km`, `6` with `lanes`), `56 primary_link` (`3.65 km`, `3` with `lanes`), `48 secondary_link` (`2.22 km`, `1` with `lanes`), `21 tertiary_link` (`0.88 km`, `1` with `lanes`); `157 / 158` are one-way.
- **Class A + B:** Untagged `*_link` ways inherit full parent class widths (`7.5–5.3 m`) instead of a 1-lane `~4.0 m` slip-lane default, and acute merge wedges lack kerbed gore/splitter islands.

### 4.4 Bridges, Flyovers & Tunnels (`52` bridge ways, `44` tunnel/covered ways)
- **Darul Hana Bridge** (`ways 568501299, 634697570, 779037132, 779315127, 779315128`): In box (`(121.8, -266.7)`), `375 m`, custom S-curve suspension landmark model; `width=3.25` mapped. Status: **OK**.
- **Satok Bridges** (all in box near `(-2080, 490)`, `shots/bridge-satok-top.jpg`):
  1. **Jambatan Tun Abdul Rahman Ya'kub** (`ways 113702300, 113702301`, `593 m` `trunk` dual bridge): **Class A** — southbound `way/113702301` ramp drops to `2.48 m` (`0.68 m` clearance) over `Jalan Matang` and `Satok-Kulas Interchange`.
  2. **Satok Flyover** (`ways 113702088, 113702092`, `367 m` + `344 m` `primary`): clears central crossroads at `12.1–15.4 m`, but western ramp `way/113702092` meets/crosses `Jalan Kulas` (`way/1376003911`) at `2.51 m` (**Class A**).
  3. **Satok Suspension Bridge (`Jambatan Gantung Satok`)** (`way/1104674947`, `205 m` `footway`): **Class B** (unnamed in OSM) + **Class A** (generic flat concrete footbridge).
- **Tun Salahuddin Bridge** (`ways 110703933, 110703935`, `856 m` `trunk`, `shots/bridge-tun-salahuddin-top.jpg`): **Class A** (`3.54–3.81 m` western ramp over `way/641576481`) + **Class C** (eastern half & Pending interchange clipped by `110.380 E`).
- **Overhead footbridges < 60 m (`ways 423061314, 232143130, 196047759, 423061308, 423061309, 232328847`):** **Class A** — `0.60–1.74 m` deck height (`build.ts:518`).
- **Untagged `footWet` false bridges (`ways 931182435, 901466610, 1577211429, 901471811, 850304294, 901466613, 851677249, 1332090995, 1124072641`):** **Class A** — inland segments crossing drivable streets elevated to `+0.3 m` with railings (`build.ts:557`).
- **Bulatan Abang Kipali underpass (`ways 782023507, 08, 11, 12, 14, 17, 19, 20`):** **Class A** — `tunnel=yes, layer=-1` trunk ways drawn on the surface across the roundabout island.
