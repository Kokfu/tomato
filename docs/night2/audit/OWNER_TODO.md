# Owner To-Do from N2-M1 Map Truth Audit (`OWNER_TODO.md`)

Everything in **Class A** (game rendering, widths, kerbed roundabout islands, dual-carriageway grass/tree/lamp medians, bridge clearances, `footWet` deck fixes, and cycling signals) is fixed by the agent in **N2-M2** and **N2-M3**.
Everything below is **Class B** (missing or wrong data in OpenStreetMap that helps both Kuching 3D and everyone using OSM) plus the **field photo wish-list** and **Class C** boundary options.

> **Source rule (`docs/MAP_SOURCES.md`):** When editing at `openstreetmap.org` in the iD editor, trace only from the licensed imagery iD offers (**Esri World Imagery**, **Bing Aerial**, **Mapbox Satellite**), Mapillary/KartaView (CC-BY-SA), or your own dashcam/phone survey — **never** from Google Maps, Google Earth, or Google Street View.

---

## Part 1: High-Impact OpenStreetMap Edits (iD Editor Steps)

Open any item directly via `https://www.openstreetmap.org/edit?editor=id&way=<ID>` (or `&node=<ID>`).

### 1. Name & tag the major roundabouts
1. **Padungan / Abell / Central Timur Roundabout** (`ways 69063568, 1198221689, 1198221690, 1198221691, 1198221694, 1368595980, 1368616469, 1368616470`):
   - Open `way 69063568` (and the 7 adjacent ring segments) in iD, set `lanes=3` (or confirmed ring lane count) and `name=*` if posted on street signs, and map any central fountain/planter/monument inside `way 232328869` / `232328872`.
2. **Bulatan Datuk Patinggi Abang Haji Abdillah** (`way 129145455`):
   - Open `way 129145455`, set `lanes=3` (currently untagged, so it falls back to class default).
3. **Bulatan Datuk Amar Abang Haji Suleiman** (`way 54254288`):
   - Open `way 54254288`, set `lanes=3`.
4. **Demak / Tun Salahuddin Roundabout** (`way 102631452`):
   - Open `way 102631452`, add official `name=Bulatan ...` if signed on the ground; set `lanes=2` or `3` on untagged arm `way 1324942072` (`Jalan Demak`) and `ways 234058852, 1206770855` (`Jalan Tun Salahuddin`).
5. **Jalan Matang Roundabout** (`way 129145587`) & **Ong Kee Hui / Taman Budaya Roundabout** (`way 68323813`):
   - Open `way 129145587`, add `name=*` if signed, and set `lanes=2` on arm `way 682028296`.
   - Open `way 68323813`, set `lanes=2` on the ring and on `Jalan Tan Sri Datuk Ong Kee Hui` arms `ways 68323817, 1194231412`.
6. **Jalan Pending Roundabout** (`way 187775282`) & **7 Darul Hana residential rings** (`ways 1270318171, 1186659753, 1270362185, 1270362184, 1270358626, 1270358625, 1270358624`):
   - `way 187775282` is a `primary` roundabout tagged `lanes=1`: verify and update to `lanes=2`.
   - The 7 Darul Hana Utara rings are tagged `lanes=1` while all connecting streets are `lanes=2`: check whether `lanes=1` is intentional or should be `lanes=2` / `width=6`.

### 2. Name the Satok Suspension Bridge
- Open **`way 1104674947`** (`205 m` pedestrian suspension bridge across Sarawak River at `1.5536 N, 110.3254 E`), set `name=Jambatan Gantung Satok`, `name:en=Satok Suspension Bridge`, `bridge:structure=suspension`.

### 3. Add `lanes=*` on Kuching's main dual carriageways & arteries (top missing corridors)
- **Jalan Padungan** (`ways 68023796, 69063574, 69063575, 1535315127, 69060295`, etc. — `3.96 km` untagged): set `lanes=2` or `lanes=3` per one-way carriageway as appropriate.
- **Jalan Green** (`ways 71381593, 1196941071, 1196941072, 1198896478, 1222182401`, etc. — `4.79 km` untagged): set `lanes=2` per one-way carriageway.
- **Jalan Astana** (`ways 129145501, 626904439, 626904440, 644997631, 644997632`, etc. — `4.88 km` untagged): set `lanes=*`.
- **Jalan Tun Salahuddin** (`ways 129145456, 129145479, 234018689, 234058852, 1074144442` — `3.14 km` untagged): set `lanes=2` or `lanes=3`.
- **Jalan Pending** (`ways 187774992, 187775283, 187775284, 187775764` — `2.82 km` untagged): set `lanes=2` or `lanes=3`.
- **Jalan Tabuan** (`ways 129257607, 233810243, 1175534597, 1175534598, 1194215710` — `2.62 km` untagged): set `lanes=2`.
- **Jalan Abell** (`ways 68023794, 69063571, 69063573, 232143136, 1198222190` — `1.53 km` untagged): set `lanes=2` or `lanes=3`.
- **Jalan Batu Lintang** (`ways 68900899, 836620957, 836620958, 853547416, 1195522846` — `2.09 km` untagged): set `lanes=2` or `lanes=3`.
- **Jalan Ban Hock** (`ways 69065591, 69065595, 1194664645..48`) & **Jalan Tan Sri Datuk Ong Kee Hui** (`ways 68323817, 232514893, 1194231412..13`): set `lanes=2`.
- **Slip lanes (`*_link`, 147 ways missing `lanes`):** when editing a junction, tag single-lane slip roads `lanes=1`.

### 4. Confirm & map missing `highway=traffic_signals` nodes (from `AUDIT.md` §3.2)
Please confirm which of these unsignalled main-road junctions actually have traffic lights on the ground, and add `highway=traffic_signals` on the approach stop-line nodes in iD:
1. **Jalan Barrack × Jalan Khoo Hun Yeang** (`nodes 2272249813, 833915199`, beside Plaza Merdeka)
2. **Jalan Market × Jalan Datuk Ajibah Abol** (`node 2272259332`, in front of Kuching City Mosque) & **Jalan Haji Taha × Jalan Datuk Ajibah Abol × Jalan Market** (`nodes 2272257281, 6134765387, 2272258156`)
3. **Jalan Tun Abang Haji Openg × Jalan McDougall** (`nodes 1386151600, 1386151313`) & **× Jalan Barrack** (`nodes 833915242, 833915187`)
4. **Jalan Gartak × Jalan Khoo Hun Yeang × Jalan Power** (`nodes 835785675, 1289015332`, Electra House / India St west mouth)
5. **Jalan Haji Taha × Jalan P. Ramlee** (`nodes 2272257282, 2272257283`) & **Jalan Masjid × Jalan P. Ramlee × Jalan Gartak** (`node 2272256755`)
6. **Jalan Main Bazaar × Lebuh Wayang / Jalan Tunku Abdul Rahman** (`nodes 2272381266, 9763215296`, Tua Pek Kong)
7. **Jalan Satok × Jalan Green × Jalan Muhibbah** (`nodes 849415908, 11380831847`), **Jalan Kulas × Jalan Muhibbah** (`nodes 6048775435, 11292610402`), **Jalan Satok × Jalan P. Ramlee** (`nodes 9128692979, 11335337657`), and **Jalan Rubber × Jalan Tun Ahmad Zaidi Adruce** (`nodes 855113482, 855113459`).

---

## Part 2: Priority Field Photos Needed (`docs/refs/owner/`)

Dashcam frames or phone photos from a footpath/passenger seat (saved in `docs/refs/owner/` with place, date, and `"owner's own"`) would help most at these 8 spots:
1. **Padungan Roundabout (`1.55356 N, 110.35927 E`):** from the pedestrian footbridge (`way 232143130`) on Jalan Padungan looking NW over the roundabout ring, splitter islands, and central landscaping.
2. **Jalan Gambier (`1.56045 N, 110.34409 E`):** standing on the riverside promenade looking east and west along the shophouse fronts, parking bays, and market stalls (currently 0 licensed photos exist for Jalan Gambier).
3. **Plaza Merdeka & Jalan Barrack / Khoo Hun Yeang junction (`1.55803 N, 110.34362 E`):** from Padang Merdeka corner looking toward Plaza Merdeka's main portal, drop-off lane, and signal poles.
4. **Jalan Tun Abang Haji Openg dual carriageway (`1.5476 N, 110.3415 E`):** from the overhead footbridge (`way 196047759` or `way 423061308`) looking straight down the median (kerb paint, tree species, double-arm lamp column spacing).
5. **Jalan Padungan dual carriageway (`1.5550 N, 110.3568 E`):** looking east from the Cat Column toward the Chinatown gate showing median width, planting, and on-street parking bays.
6. **Satok Suspension Bridge & Satok Flyover (`1.5536 N, 110.3254 E` & `1.5532 N, 110.3390 E`):** showing the suspension pylons/deck from the south bank and the flyover pier/railing profile at Jalan Satok.
7. **Square Tower / Main Bazaar / Gambier junction (`1.55980 N, 110.34550 E`):** showing how the Waterfront promenade meets the carriageway (confirming at-grade crossing vs steps, and whether signal poles stand there).
8. **Bulatan Abang Kipali underpass (`1.56889 N, 110.32092 E`):** from the approach embankment showing the sunken trunk underpass walls and roundabout bridge deck above.

---

## Part 3: Map Box Decisions (Class C — Owner Choice)

If you want these inside the playable map on a future build, expand `bbox` in `tools/extract-map-data/`:
- **North (`1.580 N -> 1.583 N`, +330 m):** unclips the northern half of `Bulatan Datuk Amar Abang Haji Suleiman` (`way 54254288`) and `way 129613881`.
- **East (`110.380 E -> 110.390 E`, +1.1 km):** completes the eastern span, toll plaza, and Pending roundabout/interchange of **Jambatan Tun Salahuddin** (`ways 110703933, 110703935`).
- **South (`1.535 N -> 1.525 N`, +1.1 km):** brings in the **3rd Mile Roundabout / Underpass (`Bulatan Datuk Patinggi Haji Ahmad Zaidi Adruce`)** and BDC / Stampin junctions.
