# Kuching 3D: economy plan (more ways to earn, things worth buying)

**Goal.** Night 1's play loop (`docs/night/m7/NOTES.md`) pays for deliveries and taxi fares, and the money buys one thing: a
repair. This plan gives the player GTA-style reasons to earn (jobs that use what each vehicle is good at, and that only Kuching
has) and things worth spending on (fuel, workshops, paint, vehicles of their own, a home), with prices in one data file, a save
that carries today's progress forward, and every system behind a `?flag=0` switch.

**Rules.** The rules, budgets and close-out of `PLAN.md`, as amended by `PLAN_N2.md`, apply unchanged, plus:
- Branch `night/economy-1`, created from the last commit of night 2 (`night/city-realism-2`). Results in
  `docs/economy/<milestone>/`, the report in `docs/economy/REPORT.md`. Where a skill says `night/city-realism-1` or `docs/night/`,
  read these names. Commit locally only; never push, deploy, touch `main`, delete branches or rewrite history.
- **Places by category or by a name OpenStreetMap or Overture maps, never invented.** As in N1-M7, the default label is the
  category and the mapped street ("a petrol station, Jalan Tun Razak"); landmarks by their mapped names. No invented business
  names, brands, logos or house numbers. Prices, fares, customers and passengers are invented and say so in LIMITATIONS.
- **No real-money purchases, loot boxes, gambling or betting** (no paid entry with a random prize, no wagers on races), no loans
  or investments. **No weapons, theft or violence against people.** Fines come as a summons on the phone, never a chase.
- Pure logic in unit-tested modules beside `src/play/` (no three.js, no DOM), glue in `Play.ts`; DOM in `src/ui/`.
- Every system has its own flag in `src/flags.ts`, and `?econ=0` turns them all off at once (= night 2's game, N1-M7's loop).
- Everything works by touch at 360 to 390 px wide and at 375x812; nothing new overlaps the HUD (the `overlaps()` check of
  `m7-play-touch.spec.ts`).
- **All tuning numbers in one file**, `src/play/economy.json` (below). No price or rate is written anywhere else in code.

## 1. Where the loop stands (measured 2026-11-26 on `0155c77`)

Played through the real UI with the project's Playwright harness (Edge, GPU): one food delivery and one taxi fare on desktop
(1366x768, keyboard and mouse) and on a 375x812 touch window (taps only), the route driven by the e2e route driver (capped at
9 m/s, blind to traffic), then 73 offers sampled from six places (Waterfront, India Street, Cat Statue, City Mosque, Old
Courthouse, Fort Margherita), three seeds each.

| Run | Job | Offer | Driving (game s) | Paid |
|---|---|---|---|---|
| desktop | delivery, a restaurant on Jalan Ewe Hai to a hotel | 150 m away, 500 m trip, RM 4.30 + tip | 22 + 61 | RM 5.70 (tip RM 1.40) |
| desktop | taxi, St. Thomas' Cathedral to a hotel on Jalan Main Bazaar | 930 m away, 850 m trip, RM 6.70 + tip | 124 + 127 | RM 8.70 (tip RM 2.00) |
| 375x812 touch | delivery (same seed, same offer), all by taps | 150 m away, 500 m trip, RM 4.30 + tip | about 33 s of real time on the road | RM 5.30 (tip RM 1.00; the blind driver hit traffic, damage 28 %) |
| 375x812 touch | taxi | not measured | | |

The 375x812 fare was not measured: in the first run the probe hung after the delivery, at the step that leaves the car by
touch and walks to the taxi; a rerun hung at the first tap on the phone. Neither was traced to the game (the probe was new and
stopped by hand); the existing `m7-play-touch.spec.ts` covers a whole delivery by touch, and no e2e test plays a fare by touch.
E0's tests close that gap. In the desktop fare the walk to the taxi was skipped (the walker was stood beside it).

**What earns.** Two jobs from the phone. A delivery pays RM 3 + 2.60 a road km (any vehicle, or on foot); a taxi fare RM 4 +
3.20 a km (the taxi only). The tip is up to 40 % (30 % for a passenger) inside a par time of 25 s + 1 s per 7 m, gone at twice
it, and a fifth less for each collision. Sampled offers: deliveries RM 4.40 to 23.00 (median 7.10), fares RM 4.80 to 28.40
(median 9.10); median 1.0 km to the pick-up (unpaid) and 1.6 km of trip.

**How fast money comes in.** A careful human driving 8 m/s on average with 25 s for stops and menus earns about **RM 1.70 a real
minute on deliveries and RM 2.10 on fares** (best offers RM 2.50 and 3.50, worst 1.20): **RM 100 to 125 an hour**. The game
clock runs 45 s a game hour by day and 20 s at night (`SECONDS_PER_HOUR`, a day is 13 min 25 s), so that is **RM 0.02 to 0.03
per in-game minute by day** (RM 1.30 to 1.60 a game hour; at night RM 0.60 to 0.70 a game hour), or about **RM 25 a game day**.
Two consequences: any price tied to the clock (rent, road tax, surge hours) must be set per game day or per game hour, not per
minute; and night is only 27 % of play (3 min 40 s of each day), so a night surge is a short treat, not a schedule.

**What costs.** A repair: RM 8 + 52 x damage (RM 8 to 60), from the phone, anywhere. A hard hit at 10 m/s is about RM 23. That
is the only sink. In a session without crashes money only grows.

**What a player has nothing to spend on.** Everything else. Vehicles are free (walk up and take any of the rule-parked ones),
there is no fuel, no workshop, no upgrade, no paint, no vehicle or place of one's own, no clothes, no food. The wallet is a
score. And the vehicles' differences do not pay: the kapcai's pull and narrow body, the pickup's bed and the taxi's meter change
nothing about which jobs exist or what they pay, except that fares need the taxi.

**Seen while playing.** The phone and the three offers read well on both sizes. 40 % of a job's driving is the unpaid approach
(median 1.0 km against a 1.6 km trip). The money HUD and the toasts are clear. At 375x812 the phone's offer list already
fills the space between the minimap and the driving controls: a home screen of more job kinds and shops will not fit as one
list.

## 2. Ideas, Kuching first

Each: what the player does / why it is fun / real-map data (counts inside the map box, 1.535-1.580 N, 110.315-110.380 E, from
`data-src/osm` fetched 2026-11-14/15 and Overture 2026-10-21) / code it builds on / phone cost / effort.

### Earn

**E-hailing with surge** (keep). Any car (hatch, and the saloon and SUV once owned) takes ride requests on the phone; the taxi
keeps its own work and a better rate. Fares rise with **rain** (by its strength), **night**, the **morning and evening rush**
and **demand near hotels and malls**, capped at x2; the surge shows on the offer before it is taken. A star rating (on time, no
collision, no harsh braking at the drop-off) decides which offers come. Fun: the world's weather and clock start to matter,
and "it is raining, go out and drive" is a real Kuching feeling. Data: 66 mapped hotels, 17 malls, the 33 landmarks, the job
sites of `jobs.json`. Code: `missions.ts` (a third `JobKind`, fares from tuning), `ENV`/`dayCycle.ts` weather and hour, the
phone. Phone cost: none (numbers). **S.**

**Kapcai express in the old town** (keep; takes over N3-M4's second job). Short, hot food runs inside the old town (Main
Bazaar, Carpenter Street, Jalan China, India Street's edges, Jalan Gambier, Padungan) with a par time only a kapcai can beat,
using **back lanes and service roads** the car route avoids, for a bigger tip. Fun: weaving the hand-built streets, the best
part of the city. Data: 202 mapped `service=alley` ways, the old-town food sites of `jobs.json`. Code: `missions.ts` bands and
par, a kapcai profile in `src/ui/Router.ts` that may use service roads (cost factors per kind), `parked.ts` for the kapcai.
Phone cost: one more route profile, searched only when offers are made. **M.**

**Pickup cargo** (keep; the other half of N3-M4's second job). Loads from hardware stores, markets and freight yards to homes,
shops and restaurants; a loaded pickup pulls and brakes worse; every knock costs the load a share of its value. A dawn market
run (05:00 to 08:00 game time) from the mapped markets to food places pays more. Fun: a heavy, careful drive, the opposite of the
kapcai. Data: 12 `shop=hardware` + 2 `doityourself`, 3 `amenity=marketplace` (all named), 14 Overture `freight_and_cargo_service`,
the `jobs.json` destinations. Code: `missions.ts`, `VEHICLE_SPECS` (engine and brake scaled by load), `crash.ts`. Phone cost:
none; a load drawn in the bed is a few triangles in the pickup's own mesh. **M.**

**Courier round** (keep). Three to five parcels from a courier depot or post office, delivered in any order the player picks;
paid per drop, with a bonus for finishing the round inside its time. Fun: route planning, and a reason to learn the streets.
Data: 4 `amenity=post_office`, 8 Overture `shipping_center` + 14 `freight_and_cargo_service`, the `jobs.json` destinations.
Code: `missions.ts` (a job with several stops), the GPS, the beacon. Phone cost: the leg routes are searched one at a time as
each drop is made, never all at once. **M.**

**Tour guide** (keep). Collect tourists at a hotel, take them to three public landmarks, stop where they can see each one for
a photograph, and bring them back. Paid per stop, tipped for a smooth ride. Fun: it sends the player to the hand-built hero
places, the game's strongest asset. Data: the 33 landmarks (the public ones, `isPublicLandmark`), 66 hotels, 22
`tourism=attraction`, 6 viewpoints. Code: `missions.ts`, `sites.ts`, the photo check below. Phone cost: none. **M.**

**Photo hunt** (keep). The phone has a camera: frame a landmark or a mapped public artwork from close enough, in view and not
behind a wall, and it is collected, paid once, with sets (the old town, places of worship, the cat statues, a night shot, a
shot in rain). Fun: exploring on foot and at sunset; cheap. Data: the public landmarks, 16 named `tourism=artwork` (the cat
statues among them), 6 viewpoints. Code: the landmark list (`world.landmarks`), the camera, a line-of-sight test against the collision world. Phone
cost: a test when the shutter is pressed; no image is stored. **S.**

**Time trials on closed courses** (keep, reshaped; street races cut). Three or four courses on real streets (the Waterfront
roads, round Padang Merdeka, Padungan to the Cat Statue), each closed to the ambient traffic while it runs, with checkpoints, a
small entry fee and medals with a one-off prize per medal; the best run is replayed as a ghost. Fun: mastery of each vehicle.
Data: the drive graph's named roads. Code: `traffic.ts` (keep its vehicles off the course's edges), the beacon for checkpoints,
one parked-vehicle instance for the ghost (no draw call). Phone cost: none at rest; the ghost is one instance. **M.**
*Cut:* races against AI drivers (the traffic AI follows lanes and cannot race; it would be L) and anything styled as illegal
street racing; the owner can ask for it later.

**Tambang river ferry** (keep, last). Take the small wooden tambang across the Sarawak River between the mapped jetties, with
passengers who pay per crossing; at dusk the river is the city's best view. Fun: no other game has it; a calm job between
drives. Data: 9 mapped `amenity=ferry_terminal` jetties on both banks (Pangkalan Haji Omar, Pangkalan Panjang, Jetty Kampong
Tanjung, Pangkalan Sg Bedil, Batu Jetty, Pangkalan Sapi, Boyan-Gersik Jetty, Fort Margherita Jetty, Gersik Jetty); no
`route=ferry` is mapped, so crossings are drawn jetty to jetty. Code: a new `DriveKind` on water (the collision world's `inWater`,
the river surface height), a boat built in code with the V5 kit like `CarModel` (no download), the passengers of N3-M1. Phone
cost: one instanced mesh for boats (+1 draw call when in view), no new program if it uses the kit's materials. **L.**

**Pasar malam stall** (cut for now). A stall would need a place: OpenStreetMap maps no night market in the box (one gift shop has
it in its name) and only 3 marketplaces; it also needs crowds (N3-M1) and a new kind of play (stock and selling). Revisit when
the owner maps a night market, or as a later plan.

### Spend

**Fuel at mapped petrol stations** (keep). Each vehicle has a tank (a kapcai's lasts long and costs little); drive onto a
station's forecourt, stop, and fill up by touch or key. Low fuel warns and the GPS finds the nearest station; an empty tank
limps at walking pace (never stranded), and the phone can call for a can at a premium. Fun: light, it puts the real stations
on the map and gives the drive a rhythm. Data: 18 `amenity=fuel` forecourt outlines + 29 nodes in OSM (de-duplicated), 43
Overture `gas_station`. Code: `Driving`/`VehiclePhysics` (a fuel number, power at empty), a place grid lookup at 4 Hz. Phone
cost: none. **S.**

**Workshops: repairs and upgrades** (keep; takes over N3-M4's "damage costs money to repair"). The repair moves to mapped
workshops at the formula's price; the phone's garage becomes a mobile mechanic who comes to you at a premium. Three tiers each of
engine (pull, top speed), brakes and tyres (grip), per vehicle, saved. Motorcycle workshops for the kapcai. Fun: the vehicle gets
better because of the work done. Data: 32 `shop=car_repair`, 10 `motorcycle_repair`, 4 `tyres`, 17 `car_parts` in OSM; 111
Overture `automotive_repair`, 19 `motorcycle_repair`, 21 `tire_dealer_and_repair`. Code: `VEHICLE_SPECS` multiplied by the
upgrade factors, `crash.ts` `repairCost`. Phone cost: none. **M.**

**Paint** (keep). Solid colours at a spray or detailing shop, per vehicle, saved. The body is already painted by material
colour, so this is a number, not a program. Data: 43 Overture `auto_detailing`, mapped workshops. Code: `Driving.setVehicle`
paint, `LifeRender` paint for a vehicle left parked. Phone cost: none. **S.**

**Hire and own** (new; keep). Today any rule-parked vehicle can be taken for free, which reads as theft and leaves nothing to buy.
Instead: the hatch in Jalan China is the player's own; the rule-parked vehicles are **for hire by the hour**, unlocked from the
phone (the starter taxi becomes "a taxi for hire"). Owning a vehicle ends its hire
cost. Fun: the first purchase is a real goal and changes what the player can earn. Data: 10 Overture `car_rental_service` for
flavour only; no new data needed. Code: `Play.take()`, `parked.ts`. Phone cost: none. **S.** Owner decision (open question 2).

**Buying vehicles at a dealer** (keep). Car and motorcycle dealers sell the four kinds plus the **saloon and SUV, whose bodies
the traffic already draws** (`src/v5/vehicles.ts`); a used kapcai first, a taxi with its permit later. Owned vehicles are
listed on the phone, stand where they were left or at home, and can be fetched to the player's home for a fee. Data: 20
`shop=car`, 6 `shop=motorcycle` in OSM; 138 Overture `auto_dealer`, 5 `used_auto_dealer`, 18 `motorcycle_dealer`. Code:
`VEHICLE_SPECS` (two new kinds), `CarModel` (built from the same kit bodies), `save.ts`. Phone cost: two more kit bodies in the
driven model (built on first use, ~1,500 triangles each). **M.**

**A home: rent a room, then buy a house** (keep). Rent a room in a mapped block of flats, later a terrace house with a car porch,
and at last buy one. The home is where the game starts, where it saves, where owned vehicles are kept (one in a room's
car park, two at a terrace house) and where the player sleeps to the next morning. Rent is due per game day while playing.
Data: 22 `building=apartments`, 20 named `landuse=residential` areas (the tamans), the buildings classifier's terrace type. Code:
`save.ts`, `Driving.start`, the world clock. Phone cost: none. **M.**

**Fines, once traffic lights work** (keep, after night 2's N2-M3). Running a red light at a signal junction, or driving against
a one-way street, sends a summons to the phone; pay it within two game days or it doubles; an unpaid summons stops a purchase at
a dealer. No police, no chase. Data: night 2's signal junctions and one-way roads. Code: N2-M3's signal state, the drive graph.
Phone cost: a test at 4 Hz against the junction the car is in. **S.**

**Clothes** (keep, small, last). Recolour the chosen character's clothes at a mapped clothes shop. Data: 15 `shop=clothes`
in OSM, 75 Overture `clothing_store` + 28 `fashion_boutique`. Code: the character picker's materials (to check: whether the six
shipped characters have separate clothing materials; if not, this is cut). Phone cost: none. **S** if the materials allow it.

**Food at kopitiams** (cut). Hunger is a chore and the game has no interiors or people at tables yet. 201 Overture
`coffee_shop` places exist; a kopitiam stop can come back with N3-M1's people as a place to pick up regular customers.

**Parking fees** (cut). Paying to stand still is a chore, and only 75 car parks are mapped. A home car park covers keeping a
vehicle safe.

### Top five, and why

1. **E-hailing with surge**: the cheapest change with the biggest feel, because the weather and the clock already exist.
2. **Hire and own, with a dealer**: turns the wallet into a goal and fixes the "free car" problem.
3. **Workshops, upgrades and paint**: spending that the player can feel on the next drive.
4. **Kapcai express and pickup cargo**: the vehicles' differences start to pay (and N3-M4's second job is done once).
5. **Photo hunt and tour guide**: send the player to the hero places, the part of the game that is closest to real.

The tambang is the most Kuching idea of all, but it is the only L, so it comes last, after the rest is proven.

## 3. The economy model

### Sources and sinks (target shares in an hour of mid-game play)

| Sources | Share | Sinks | Share |
|---|---|---|---|
| deliveries, kapcai express, courier rounds | 35 % | fuel | 8-10 % |
| e-hail and taxi fares (surge on top) | 35 % | repairs (crash-dependent) | 5-15 % |
| pickup cargo, tours, tambang | 25 % | hire (until vehicles are owned) | 0-15 % |
| photo hunt and time-trial medals (one-off) | 5 % | rent | 10-15 % |
| | | fines (behaviour-dependent) | 0-5 % |
| | | the goals: upgrades, paint, vehicles, a house, clothes | the rest |

Upkeep (fuel, rent, a small road tax per owned vehicle per game week) keeps money meaningful after the big purchases.

### Prices (game ringgit; starting values, all in `economy.json`)

Small, everyday prices stay lifelike in size; big ones (vehicles, a house) are **compressed so a purchase takes hours, not
years** (open question 1). No real price is claimed; LIMITATIONS will say they are invented.

| Item | Price |
|---|---|
| Delivery / taxi fare | as today: RM 3 + 2.60 a km / RM 4 + 3.20 a km |
| E-hail ride | RM 3.50 + 2.80 a km, x1.0 to x2.0 surge (rain up to x1.6, night x1.2, rush x1.3, near hotels and malls x1.15) |
| Kapcai express | RM 4 + 3.00 a km, tip up to 60 % inside a par of 15 s + 1 s per 9 m |
| Pickup cargo | RM 6 + 3.50 a km + RM 2 per load unit, times the load's condition; dawn market run x1.3 |
| Courier round | RM 2.50 a drop + 1.50 a km, round bonus 25 % on time |
| Tour (3 stops) | RM 12 + 4 a stop, tip up to 30 % |
| Tambang crossing | RM 1.50 a passenger, 1 to 6 passengers |
| Photo | RM 5 a landmark, RM 3 an artwork, set bonus RM 20 |
| Time trial | entry RM 5; first bronze / silver / gold RM 10 / 20 / 40; a repeat gold RM 2 |
| Fuel | per km of range: a hatch tank (20 km at RM 0.40) about RM 8, a kapcai (14 km at RM 0.20) about RM 3, a pickup (16 km at RM 0.60) about RM 10 |
| Repair | RM 8 + 52 x damage at a workshop (kapcai x0.5, pickup x1.2); mobile mechanic x1.5 + RM 10 |
| Upgrades (engine / brakes / tyres, tiers 1-3) | RM 60-150-350 / 40-100-220 / 50-120-260 (kapcai x0.5) |
| Paint | RM 35 a solid colour |
| Hire | RM 2 to unlock + RM 0.30 a minute driven (taxi RM 0.45); the meter stops when the vehicle is left |
| Vehicles | used kapcai RM 180; pickup RM 1,100; taxi with permit RM 1,000; saloon RM 900; SUV RM 1,800 |
| Home | a room RM 6 a game day (one parking place); a terrace house RM 10 a game day (two); buy a terrace house RM 4,500 |
| Fines | red light RM 15, against a one-way RM 10; doubled after two game days |
| Clothes | RM 15 to 40 an outfit colour |
| Road tax | RM 2 per owned vehicle per game week (7 game days, about 94 minutes of play) |

### Progression curve (what a player can afford)

A simulated player in a unit test (`tests/unit/economy-sim.test.ts`: jobs from the tuning file at 8 m/s, a crash every fifth
job, fuel and rent paid) must land within ±25 % of these, so a tuning edit cannot break the curve without a failing test.

| Played | Earned (total) | Rate then | Can afford |
|---|---|---|---|
| 10 minutes | RM 20-30 (4-5 jobs) | RM 2 a minute | fuel, a repair, a paint job soon after; the first hire of a kapcai or the taxi |
| 1 hour | RM 150-200 | RM 2.5-3 a minute (e-hail, surge, express) | a used kapcai (RM 180) or tier-1 upgrades; a room |
| 5 hours | RM 1,000-1,300 | RM 3.5-4 a minute (better offers by rating, cargo, tours) | a saloon or a taxi, tier-2 upgrades, a terrace house to rent |
| 15-20 hours | RM 4,000+ | | buy the terrace house; an SUV; tier 3 |

### Unlocks

Never more than one gate per thing, and every gate is shown on the phone with what it needs.

| Unlock | Needs |
|---|---|
| Deliveries, e-hail (in the own hatch), photo hunt | from the start |
| Taxi fares | a taxi, hired or owned (as today) |
| Kapcai express | a kapcai, hired or owned, and 5 jobs done |
| Pickup cargo | a pickup, hired or owned, and 5 jobs done |
| Courier rounds | 15 jobs done |
| Tour guide | 4.5 stars after 10 rides, and 5 landmarks photographed |
| Longer and surge-boosted offers | the star rating (below 4.0: short offers only) |
| Tier-2 / tier-3 upgrades | tier 1 / 2 on that vehicle |
| Terrace house | 3 game weeks of rent paid on time |
| Time trials | from the start; each course once its streets have been driven |
| Tambang | visit a jetty |

### All tuning numbers in one data file

`src/play/economy.json`, imported at build time (no extra download; `node --test` reads it with an import attribute), with
sections `fares`, `tips`, `surge`, `rating`, `fuel`, `repair`, `upgrades`, `paint`, `hire`, `vehicles`, `home`, `fines`,
`photo`, `trials`, `ferry`, `upkeep`, `unlocks`. `src/play/economy.ts` validates it on load (every price a finite number in its
range; the unit test fails on a bad edit) and exposes typed getters. `missions.ts`'s `fareFor`, `parTime`, `payout` and
`crash.ts`'s `repairCost` read from it (today's numbers become the file's first values, so behaviour does not change in E0).
The map data for places to spend goes in a second, generated file, `public/data/kuching/services.json` (positions, category
group and street index only, no names, like `jobs.json`; ~20-30 kB, fetched with `jobs.json` when the phone is first opened).

### Save format v2, and migration

- A new key, **`k3d.save2`**, holding `{ v: 2, ... }`. The v1 key `k3d.save` is read once for migration and never written by
  the economy, so an older build (or `?econ=0`, which keeps using v1 exactly as today) can never overwrite v2 progress, and v2
  can never break an older build.
- v2 adds: `spent` and a ledger by category; jobs done by kind; the star rating; `owned` vehicles (`id`, `kind`, `paint`,
  `upgrades`, `fuel`, `damage`, where it stands, or `home`); the vehicle being driven and any hire in progress; the `home` (its
  site, tier, rented or owned, paid up to which game day); the game day count; photos taken; trial bests; fines; outfit colours;
  and **the walking player's position** (this takes over N3-M1's "save the walking position too" item).
- Migration v1 -> v2 (pure, unit-tested on real v1 values, damaged values and the empty case): money, earned and the two job
  counts carry over; v1's vehicle becomes an owned vehicle where it was left (the hatch, or, as a gift, whatever kind the
  player had taken), with its paint and damage; a full tank; no home yet. A damaged v1 value gives a fresh v2 (as today).
- `parseSave` stays strict: nothing in a saved value is trusted; unknown fields are dropped; every number has a range.

## 4. Milestones

| # | Milestone | Model | Status | Commit | Result |
|---|---|---|---|---|---|
| E0 | Core: tuning file, ledger, save v2 with migration, flags, baseline | Sonnet Medium | TODO | | |
| E1 | Places to spend on the map, and hire and own | Fable High | TODO | | |
| E2 | Fuel, workshops, upgrades and paint | Fable High | TODO | | |
| E3 | E-hailing with surge, and the star rating | Fable High | TODO | | |
| E4 | Kapcai express and pickup cargo | Fable High | TODO | | |
| E5 | The dealer and a home | Fable High | TODO | | |
| E6 | Courier rounds, photo hunt and tour guide | Fable High | TODO | | |
| E7 | Time trials on closed courses | Fable High | TODO | | |
| E8 | Fines, and the balance pass | Sonnet Medium | TODO | | |
| E9 | Tambang river ferry | Fable High | TODO | | |
| E10 | Docs and report | Sonnet Medium | TODO | | |

Every "Done when" is an e2e test that runs on `desktop-1920` and on `mobile-390` (by touch, with the HUD overlap check); a
drive to a far place is done once per milestone with the route driver, and the rest of a test stands the vehicle at the goal
with `placeCar`, as the taxi test does, to keep each test under three minutes. Each closes with `kuching-milestone` (with the
names above), phone budget against the economy baseline, and a check that no shader program is compiled by any new action.

**E0. Core.** `src/play/economy.json` + `economy.ts` (validated getters), a ledger in `src/play/ledger.ts` (earned and spent by
category), save v2 + migration, the `econ` master flag and one flag per later system, a Wallet screen on the phone (earned and
spent by category this session and in all). The phone's home becomes a grid of apps (Jobs, Vehicles, Map, Wallet, and later
Camera and Home), each a screen of its own, so it fits 360x800 with every later system in it. Measure the baseline: the production build of night 2's end, three phone pairs on
scenarios A, C and E, and the earning rate with the script used for section 1. The simulated-player test exists and checks
today's curve. **Done when:** a v1 save put in localStorage loads with the same money and vehicle and is written back under
`k3d.save2`; `?econ=0` plays as night 2 and leaves `k3d.save2` alone; the Wallet screen shows a paid job under its category.

**E1. Places to spend, and hire and own.** `tools/generate-world/build-services.ts` (`npm run data:services`) writes
`services.json` from OSM and Overture: petrol stations, car and motorcycle workshops, spray and detailing shops, car and
motorcycle dealers, clothes shops, blocks of flats and terrace streets for homes, cargo sources, courier depots, jetties;
de-duplicated between the two sources, each within 60 m of a public road, labelled by category and street. Minimap icons by
kind (shown near the player only), "Find the nearest..." on the phone with GPS. The rule-parked vehicles become hired: the
prompt shows the price, the phone shows the meter; the Jalan China hatch is owned. **Done when:** "Find the nearest petrol
station" routes to a mapped one; hiring the starter kapcai takes the unlock fee and the meter runs while it is driven and
stops when it is left; the owned hatch costs nothing.

**E2. Fuel, workshops, upgrades and paint.** A fuel number per vehicle and the empty-tank limp; filling at a forecourt; repairs
at workshops at the formula's price, the phone's mobile mechanic at a premium; upgrades (engine, brakes, tyres; three tiers)
as multipliers on `VEHICLE_SPECS`; paint. All saved per vehicle. **Takes over N3-M4's "vehicle damage builds up and costs
money to repair".** **Done when:** after a drive the tank is lower; at a station the tank fills and the money drops by the
price; a workshop repair costs less than the mobile mechanic; a tier-1 engine raises the measured 0-50 km/h time by the factor
in the file; a repainted vehicle keeps its colour after a reload.

**E3. E-hailing with surge, and the rating.** A third job kind (`ride`) for any car, fares and surge from the tuning file; surge
from `world.weather` and the hour, and from the pick-up's distance to mapped hotels and malls; the star rating and how it
shapes offers; the offer shows the surge. Also: the unpaid approach is shortened by preferring nearer pick-ups as the rating
grows. **Done when:** with `__k3d.setRain('on', 1)` and a night hour the offers show a surge above x1.5 and a ride pays fare x
surge; a collision on the way lowers the rating; a 3.9-star player gets only short offers.

**E4. Kapcai express and pickup cargo.** **Takes over N3-M4's "a second job type that uses the vehicle differences"**, and its
Done when. Express: old-town sites, a kapcai route profile that may use service roads and alleys, the short par. Cargo: load
units, handling by load, the load's condition, the dawn market run. **Done when:** an express run is finished by kapcai inside
its par on a route that uses at least one service road; a cargo run is finished by pickup and a knock on the way lowers the pay
by the condition lost; on the emulated phone both are taken and finished by touch.

**E5. The dealer and a home.** Dealer screens (on the phone, at a dealer's forecourt), the saloon and SUV as drivable kinds,
owned vehicles on the phone (where each stands; "bring it home" for a fee); renting a room or a terrace house at a mapped
place, rent per game day while playing, sleeping to the next morning, the game starting at home; buying the house. **Done
when:** a kapcai is bought, is in the owned list after a reload and costs no hire; with a room rented, a reload starts at the
home; a game day passing takes the rent; sleeping moves the clock to 07:00.

**E6. Courier rounds, photo hunt and tour guide.** A job with several stops (any order, legs routed one at a time); the phone
camera (aim, distance and line-of-sight test, sets); the tour (hotel, three public landmarks, a stop in view of each).
**Done when:** a three-drop round is paid per drop and its bonus; a landmark photographed from a valid place pays once and a
second shot pays nothing; one from behind a building is refused; a tour with three stops is paid.

**E7. Time trials.** Three courses from named roads, closed to ambient traffic while running (traffic keeps off the course's
edges and those waiting at its ends hold), checkpoints with the beacon, medals and prizes, the ghost of the best run as one
parked-vehicle instance. **Done when:** a course is finished through every checkpoint, a medal is paid once, the best time
survives a reload, and no ambient vehicle enters the course during the run.

**E8. Fines and the balance pass.** Red-light and one-way summons from night 2's signals and road rules, paid on the phone,
doubling when late, blocking a purchase when unpaid. Then the balance pass: replay section 1's measuring script with the new
jobs, compare with the curve, retune `economy.json` only, and log each change. **Done when:** driving through a red light at
a signal junction issues one summons and paying clears it; the simulated-player test passes with the final numbers; the measured
rate is within the curve's band at 10 minutes and 1 hour.

**E9. Tambang river ferry.** A boat `DriveKind` (water physics on the river surface, banks as walls), a boat built in code from
the kit, the nine jetties as stops, passengers who pay per crossing (people from N3-M1 if it has run, otherwise the stop marker).
**Done when:** the player boards a tambang at a jetty, crosses to the opposite bank's jetty and is paid; the boat cannot leave
the water; on the emulated phone it is steered by the touch pedals; the phone budget holds at the Waterfront (scenario E).

**E10. Docs and report.** README (how to earn and spend), LIMITATIONS (invented prices and fares, category labels, the
inferred items), `docs/FLAGS.md`, `docs/economy/REPORT.md` with the measured curve and the perf table; full e2e in the background.

**Owner, not agent:** play it on a real phone and say whether money comes too slow or too fast; answer the open questions.

## 5. Sequencing

Run after night 2, on `night/economy-1` from night 2's last commit. **Why not earlier:**
- **N2-M2 regenerates the chunk data and the drive graph** (roundabouts, dual carriageways, widths). Every fare is a road
  distance and every par time follows from it, so each price measured now would move; `jobs.json` and the new `services.json`
  snap places to roads within 60 m, so the place lists change; the trial courses are lists of road edges and would point at
  edges that no longer exist; the rule-parked places (hire) depend on road types and widths.
- **N2-M3 makes the lights work and the GPS keep the road rules.** Fines (E8) cannot exist without it; waiting at red lights
  changes trip times, so the tips' par times and the e-hail and express pars would be tuned to roads without lights and
  feel unfair afterwards; the route profiles of E4 must keep the same one-way and roundabout rules.
- **N2-M0 sets the baseline and the data hash.** The economy's phone budget is measured against night 2's end, and its new data
  file must carry night 2's `?v=` hash. Before N2-M0b's LOD and V5 hide, the old town (the express's home) is the heaviest place.
- **The same files**: `Play.ts`, `Phone.ts`, `flags.ts`, `Router.ts` and `traffic.ts` are touched by night 2; running both at
  once would mean merging them by hand.

**And night 3:** E2 and E4 take over N3-M4's repair and second-job items, and E0's save v2 takes over N3-M1's walking position.
When this plan's milestones are DONE, mark those items in `PLAN_N3.md` as "done in `PLAN_ECONOMY.md` E<k>" so nothing is built
twice. Everything else in night 3 is untouched; its "a person at every job pick-up and drop-off" works for every job kind here
because all of them stop at the same kind of `Site`. If night 3 runs first instead, E2 and E4 shrink to what N3-M4 left.

## 6. Risks

- **Phone performance.** Rules: no new shader program (markers use the beacon's material, the ghost and owned vehicles are
  parked-vehicle instances, the boat uses the kit's materials; e2e-checked); no per-frame work beyond a 4 Hz place lookup on a
  grid; route searches only on a phone action and never more than one a frame (offers today cost 5-29 ms unthrottled; express
  and courier add route profiles and legs, so they are spread over frames and measured at 4x CPU); `services.json` under 30 kB,
  fetched with `jobs.json`. The tambang is the one new draw call. Budget: `PLAN.md` as amended by `PLAN_N2.md` against night 2's
  end, measured with the on/off method of M7 (`?econ=0` in one page) because the bench pairs have not been conclusive.
- **Save compatibility.** New key, one-way migration, v1 left untouched; a damaged value gives a fresh save, never a crash;
  unit tests on real v1 values. Risk: a player who plays `?econ=0` after migrating sees their v1 progress, not v2: documented.
  localStorage is per device and lost with site data, as today.
- **Scope.** Eleven milestones are more than one night. The cut line: E0 to E5 is the economy (earn more ways, spend on fuel,
  workshops, vehicles and a home); E6 to E9 are extras that can move to a second night or be dropped one by one without
  breaking the rest. The tambang (L) is last on purpose.
- **Balance.** Inflation once everything is bought (upkeep and the house keep money meaningful); a dominant job (the
  simulated-player test reports the rate of each job kind, and no kind may pay more than 1.5x the median per minute); grind
  (no unlock needs more than about an hour of the job before it). All in one file, so the owner can tune it.
- **Honesty.** Prices, fares, customers and the surge are invented; places are real only by category or mapped name. Brands on
  petrol stations and dealers are mapped names, but the default label stays the category (open question 3).
- **Test time.** Job e2e tests take 2 to 7 minutes with the blind route driver; one full drive per milestone, `placeCar` for the
  rest, and the full suite in the background.

## Open questions for the owner

**Answered 2026-11-26: "go with defaults".** Each question below takes the plan's default: (1) lifelike small prices and
compressed big ones, as in the price table; (2) rule-parked vehicles become hired, the Jalan China hatch is owned; (3) category
labels, mapped names only for landmarks; (4) economy after night 2 and before night 3, so building starts on
`night/economy-1` from night 2's last commit once `PLAN_N2.md` is DONE; (5) closed-course time trials only; (6) fines for red
lights and one-way streets only. The questions are kept below for the record.

1. **Prices:** lifelike small prices and compressed big ones (a used kapcai about an hour of play), as above? Or all prices
   lifelike with higher pay, or all compressed?
2. **Hire instead of taking:** may the rule-parked vehicles become hired by the hour (the hatch stays the player's own)? It
   removes the "take any car" freedom of night 1 but gives the dealer its point.
3. **Names:** keep category labels ("a petrol station, Jalan Tun Razak"), or show the mapped name where OpenStreetMap or
   Overture has one (which includes fuel and car brands)?
4. **Order with night 3:** economy first (as this plan assumes, taking over N3-M4's job and repair items) or night 3 first?
5. **Time trials:** are closed-course time trials enough, or do you later want races against AI drivers?
6. **Fines:** red lights and one-way only, or also speeding (only 28 roads have a mapped limit)?

## Decision log
(one line each: date-time, milestone, decision, reason)
- 2026-11-26 plan: pasar malam stall, kopitiam food and parking fees cut; street races reshaped as closed-course time trials;
  reason: no mapped night market, hunger and paid parking are chores, and the traffic AI cannot race.
- 2026-11-26 plan: save v2 under a new key `k3d.save2`, v1 read once and never written; reason: an older build or `?econ=0`
  can never overwrite or misread the new progress.
- 2026-11-26 owner: "go with defaults" for all six open questions (see that section); building waits for night 2's end,
  as section 5 requires. Night 2 was at N2-M0a (uncommitted) when this was decided.
- 2026-11-26 plan: section 1's 375x812 fare probe: its rerun hung because the night-2 session started editing source in the
  same checkout at 23:43, so Vite reloaded the page; the first run's hang (23:28) came before those edits and was the
  probe's own touch step for leaving the car.
- 2026-11-26 plan: tuning in `src/play/economy.json` bundled at build time, map places in a generated `services.json`; reason:
  no extra download for numbers, and the place data follows the `jobs.json` pattern (positions and groups, no names).
