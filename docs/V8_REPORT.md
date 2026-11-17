# V8: first driving prototype

Scope: one drivable car on the existing real Kuching map, a chase camera, enter / exit, collision, road-aware
behaviour and streaming at car speeds. The world, the landmarks, the walking controller, the walking camera and
OP fly mode are not rebuilt. No traffic, missions, damage, fuel, vehicle choice or graphics work.

Status: implemented and tested, **not committed** (awaiting review).

## 1. What you can do

1. Start the game. A yellow hatchback with a marker above it waits at the mouth of Jalan China, just off Jalan
   Main Bazaar, about 120 m from the waterfront spawn (or open `?at=china` and walk up the street).
2. Walk to it. Within 2.6 m the prompt **E Drive** appears. The parked car is a solid obstacle for the character.
3. **E**: the character gets in, the chase camera takes over, a speedometer (km/h, gear D / N / R) appears.
4. Drive: **W** accelerate, **S** brake then reverse, **A / D** steer, **Space** handbrake, mouse to look round,
   wheel for camera distance, **R** back to the last valid road position.
5. Stop and press **E**: the character gets out at the driver's door (right-hand drive; the other side, then the
   ends, if that door is blocked) and walks on. E is refused above 5 km/h ("Stop the car before getting out") and
   where there is no room to stand.
6. **P** still toggles OP fly mode at any time. While it is on the car brakes to a stop by itself and is not
   steered; switching it off returns to the driver's seat.

## 2. How it is built

Everything new is in `src/vehicle/` (924 lines) and is wired into the game loop in `src/main.ts`.

| File | Role |
|---|---|
| `VehiclePhysics.ts` | The car: kinematic bicycle model with lateral slip, engine / brake / drag / rolling / slope forces, oriented-box collision response, four ground probes, the road / water / deck / unloaded-ground rules, reset. Pure TypeScript, no three.js, unit-tested under Node. |
| `RoadQuery.ts` | Nearest drivable carriageway from the streamed chunk data (class, width, one-way, bridge). Pure. |
| `CarModel.ts` | The visual: the compact hatchback of the existing parked-car kit (`src/v5/vehicles.ts`), with separate wheels that spin and steer, body lean, contact shadow, "find me" marker. About 1,500 triangles, no download. |
| `ChaseCamera.ts` | The driving camera. |
| `Driving.ts` | Glue: enter / exit rules, HUD, parked-car obstacle, reset. |

Changes to existing code are small and additive:

- `CollisionWorld`: `boxContact()` (separating-axis test of an oriented box against the building / obstacle outlines) and a slot for movable obstacles (the parked drivable car). `insideBuilding()` gained an optional flag to ignore movable obstacles.
- `Input`: held state of Space (`handbrake`) and an `R` action. Walking input is unchanged.
- `v5/vehicles.ts`: `vehicle()` can omit the baked wheels and shadow; `wheel()` and wheel positions are exported. Parked cars are generated exactly as before.
- `ChunkManager`: two streaming adjustments (section 5).
- `main.ts`: the loop updates either the character or the car; the car is created once and stands in the scene.
- `index.html` / `main.css`: prompt and speedometer.

No physics engine was added. The start bundle grows from 807 to 842 kB (235 to 248 kB gzipped): `src/vehicle/`
plus the geometry kit and car generator, which move out of the lazily loaded V5 chunk (194 to 180 kB) because the
car needs them at start.

### Vehicle model

- Footprint 3.90 x 1.73 m, wheelbase 2.44 m. Engine 5.2 m/s² from rest falling to zero at 108 km/h; with drag and
  rolling resistance the car settles at 95 km/h on the flat. 0 to 50 km/h in 3.2 s. Reverse to 25 km/h.
- Brakes 10.5 m/s², handbrake 7 m/s² plus reduced rear grip (the tail slides in a turn).
- Steering is eased in (2.4 rad/s) and self-centres. The lock available falls with speed so that lateral
  acceleration stays within 8.5 m/s²: full lock (turning radius 3.6 m) at walking pace, gentle at speed.
- Slopes act on the car while it rolls; a parked car does not creep.
- Ride height, pitch and roll come from the ground under the four wheels (terrain, bridge decks, raised paving),
  smoothed like a stiff suspension. The body additionally squats, dives and rolls on its springs (visual only).
- On a mapped carriageway the wheels ride 7 cm above the terrain height field, which is where the road ribbons are
  drawn; bridge decks use their own per-vertex elevation.
- Collision: the body is an oriented box tested against every blocking outline the walking character already
  respects (buildings, five-foot-way piers and goods, parked cars, trees, lamp posts, benches, landmark collision).
  A hit removes the closing speed, costs speed in proportion to how hard it was, and turns the nose away, so a
  glancing touch slides along a wall and a head-on hit stops the car. Simulation runs in 1/120 s sub-steps.
- Off the carriageway (verges, paving, grass) the car is slowed to about 30 km/h and the speedometer shows
  **OFF ROAD**.

### Chase camera

Follows behind on a short spring, 6.6 m back by default (wheel: 3.6 to 14 m), field of view opening from 60° to 74°
with speed. The mouse orbits freely; after 1.1 s without mouse input the camera eases back behind the car, leads
slightly into a turn (up to 0.3 rad, proportional to yaw rate) and looks over the tail after 0.9 s of reversing.
The boom is swept against walls with three rays and against the ground, shortens quickly and re-extends slowly;
when squeezed it rises over the roof instead of entering the car. Low obstacles (parked cars, benches) do not
squeeze it. The walking camera and the OP camera are untouched; on getting out the walking camera takes over the
same bearing.

## 3. Real road integration

The car uses the same chunk road data that draws the map: OSM carriageways with class, width, one-way flag and
bridge elevations. Nothing was added, moved or widened.

- **Drivable classes:** motorway, trunk, primary, secondary, tertiary, residential, service. Pedestrian streets,
  footways, paths, steps and piers are not carriageways.
- **Width validation** (unit test on the shipped data): all 60 carriageways within 300 m of the car are at
  least 3.9 m wide for a 1.73 m car (the rule requires body width + 2 x 0.4 m); Jalan China connects to Jalan
  Carpenter, Jalan Bishopgate, Jalan Main Bazaar, Jalan Tun Abang Haji Openg and Jalan Wawasan.
- **Verified playable loop:** Jalan China, Jalan Carpenter, Jalan Bishopgate, Jalan Main Bazaar and back into
  Jalan China: 386 m, four real junctions, driven by an automated driver through the normal input path with no
  wall contact, never off the carriageway, never inside a building (section 6).
- **Buildings, river, unloaded ground:** the body cannot enter a building outline; it is stopped at water (decks
  excepted), at chunks whose collision is not in memory, and at the edge of the prepared area, each with a toast.
- **Bridges:** a car may drive onto a deck only where a mapped carriageway bridge crosses it. Footbridges
  (Darul Hana), jetties and piers refuse the car. A car on a bridge cannot leave it over the side.
- **Reset (R):** the last pose at which the whole body stood on a carriageway, aligned with it; failing that, the
  centre line of the nearest drivable road.

### Things in the data that driving exposed (not changed, for your decision)

1. **Mapped centre lines hug one frontage in the old town.** Jalan Carpenter's centre line passes 0.5 m from the
   corner of the Jalan China east block at its junction with Jalan China, and Jalan China's own centre line runs
   about 2.5 m east of the middle of the V7 street section, i.e. through the east row of parked cars. The open
   gap between the buildings is there and is driven normally, but "on the road" is measured from the OSM line with
   its inferred width (plus 1 m), so the west kerb of the V7 Jalan China counts as off-road. Road widths are
   inferred for all but six ways (already noted in `docs/VEHICLES.md`).
2. **V7 Jalan China is a 2.5 to 2.7 m lane** between the two rows of parked cars. It is drivable end to end (tested)
   but needs care at more than walking pace. That matches the street; widening it would be fabrication.
3. **Three footway "bridges" cross Jalan Tun Abang Haji Openg at road level** (2.2 m wide deck segments whose
   elevation equals the ground). They are treated as ordinary ground for the car; only raised decks and decks over
   water count as bridges.
4. **Junctions are overlapping ribbons** (no junction polygons, kerbs are visual only), as before.

## 4. Controls and conflicts

| Key | Walking | Driving | OP fly mode |
|---|---|---|---|
| W A S D | move | throttle / brake / steer | fly |
| Space | jump | handbrake | up |
| E | inspect place, or get in when at the car | get out | inspect place |
| R | - | back to road | reference panel |
| V | first / third person | ignored | - |
| P | OP mode on | OP mode on (car brakes to a stop) | OP mode off |
| Esc | pause | pause (car frozen) | free the mouse |

"Return to Waterfront" and OP "Walk here" act on the character: it leaves the car where it stands.
Touch: the joystick steers and drives, the prompt and an EXIT button on the speedometer are tappable. There is no
touch handbrake yet.

## 5. World streaming

The existing streamer already takes the focus velocity. While driving it receives the car's position and velocity.
Two adjustments:

- **Look-ahead chunks are kept.** The block of chunks downloaded ahead of a moving player used to be unloaded again
  at the next chunk border, because it lies outside the unload radius, and then downloaded a second time. It is now
  kept while it is still ahead, so the road and collision data in front of the car stay in memory. It is dropped
  at the next border crossing after the car turns away.
- **Builds are time-sliced at driving speed.** Above 9 m/s the streamer was allowed two chunk meshes per frame. At
  car speeds (9 to 60 m/s) the second one is now only started if the first took under 6 ms. OP fly speeds keep the
  old budget.

The car itself never drives onto ground whose collision is not loaded (it stops with "Loading the next area…"),
so it cannot fall through. In the high-speed test this never triggered.

## 6. Tests

Run: `npm test` (unit) and `npx playwright test driving` (browser, Edge with GPU, 1920 x 1080, medium quality).

**Unit, `tests/unit/vehicle.test.ts`: 19 tests, all pass** (64 of 64 in the whole unit suite). Acceleration and top
speed, braking and reverse, coasting and handbrake, steering direction, symmetry and self-centring, lateral grip,
handbrake slide, off-road drag, water / unloaded / map-edge stops, deck rules, slope following, `boxContact`
geometry, head-on and glancing wall hits against the real collision code, a passable and an impassable gap, the
parked car as an obstacle for the walker, reset, the car's waiting place, road widths and connectivity of the
playable area on the shipped chunk data.

**Browser, `tests/e2e/driving.spec.ts`: 7 tests.**

| # | Requested test | Result |
|---|---|---|
| 1 | Entering and exiting | Pass. Prompt appears only at the car; E gets in (character hidden, speedometer shown); E is refused while moving; E gets out beside the body on free ground; the car can be entered again. The walker cannot walk through the parked car. |
| 2 | Forward and reverse | Pass. 2 s of W: more than 6 m/s and 7 m along Jalan China; S brakes to rest, then reverses (gear shows R); W brakes a reversing car. |
| 3 | Steering and braking | Pass. A turns left, D right, by equal amounts; the handbrake stops the car in under 75 % of the coasting distance; steering is eased and self-centres (unit). |
| 4 | Collisions with buildings and obstacles | Pass. Full throttle into a shophouse row: stops at the wall, never inside the outline, reverses out. Into the flank of a parked car on Jalan Main Bazaar: stops against it. Toward the river from the promenade: never in the water. |
| 5 | Road and terrain alignment | Pass. Over the block loop the car stays within 0.13 m of the surface under its centre (0.07 m of that is the road-surface offset), pitch up to 0.11 rad, roll up to 0.08 rad, following the fall of Jalan China toward the river. |
| 6 | Driving through an intersection | Pass. Four junctions on the block loop (386 m): 0 wall contacts, 0 frames off the carriageway, 0 blocked moves, cruising at 32 km/h, 13 km/h through the turns. |
| 7 | High-speed chunk loading | Pass. Jalan Tun Abang Haji Openg, 2,120 m at full throttle: 92.7 km/h top, 79.9 km/h average, 95.5 s. 125 chunks fetched, 103 built, 73 disposed. The chunk under the car had a mesh on 100 % of frames and the car was never stopped for loading. |
| 8 | Switching between driving, walking and OP mode | Pass. P while driving (car brakes to a stop, cannot be steered, R stays the reference-panel key), P back to the seat, V ignored, Esc freezes the car, E out, OP mode on foot as in V6, "Return to Waterfront" from the seat. |
| 9 | FPS and memory | 58.7 fps average over the high-speed run and 60 fps on the block loop (1920 x 1080, medium, display capped at 60). Slowest frame 121 and 133 ms in two separate runs (one chunk mesh build; 263 ms before the time-slicing change), 304 ms in the run inside the full suite. At most 55 chunk meshes held (bound 81), 96 chunk data sets at the end; geometries 162 to 418, textures 40 to 74; JS heap 62 MB before, 67 MB after (other runs ended lower than they started: it is garbage-collection noise, not growth). Numbers in `docs/perf-v8.json`. |
| 10 | V7.4 regressions | Pass. All 28 existing browser tests pass (district, gameplay, landmarks, layout on four viewports, OP mode, touch, production build); see the note below. Unit suite 64 / 64, `tsc --noEmit` clean, `vite build` succeeds. |

Notes on the regression run (35 browser tests, 26.5 min, single worker): 31 passed first time. The 4 that did
not were rerun and pass: two existing tests failed for reasons outside the code (one on `net::ERR_NETWORK_CHANGED`
request failures, one because I saved a source file while it ran and the dev server reloaded the page), and two of
the new driving tests were corrected (a symmetry check that depended on key timing to within a few frames, and the
automated driver's path after the car's waiting place was moved). Source code has not changed since that run except
for line endings. The layout tests rewrite the tracked screenshots in `docs/screenshots/`; those were restored, so
the only image changes are the new `docs/screenshots/v8/` files.

Run the browser tests with `PUBLIC_PORT=5174` if another dev server is running on port 3000, otherwise the test
page's hot-reload socket reports console errors that the tests count as failures.

## 7. Gameplay capture

`node tools/dev/drive-shots.ts <outDir> [--url=...]` plays one fixed sequence through the real input path and writes 13
screenshots, a WebM video and a JSON log: walk to the car, E, round the block through four junctions, stop, E,
walk away. Captured for this report in `docs/screenshots/v8/` (default rendering, 1280 x 720, medium quality):

| File | Moment |
|---|---|
| `01-walking-to-the-car.png` | On foot at the mouth of Jalan China, the car marked ahead |
| `02-at-the-car-prompt.png` | At the driver's door: the **E Drive** prompt |
| `03-in-the-car.png` | In the car: chase camera, speedometer, driving help line |
| `04` to `10` | Jalan China, the turn into Jalan Carpenter, Jalan Carpenter, the turns into Jalan Bishopgate and Jalan Main Bazaar, the waterfront stretch, back into Jalan China |
| `11-stopped.png` | Stopped where the loop began |
| `12-out-of-the-car.png` | On foot again beside the car |
| `13-walking-away.png` | Walking on; the car stays parked |
| `14-v7-jalan-china-lane.png` | V7 Jalan China rendering: in the lane between the parked rows (from the lane test, 1920 x 1080) |
| `drive-sequence.webm` | The whole sequence as video (12 MB, about 2 minutes) |
| `drive-sequence.json` | Per-shot road, speed and frame rate, and the drive statistics |

## 8. Limitations

- One car, one body style, no sound, no lights, no damage, no traffic, no pedestrians reacting to it.
- No lane model, no kerb collision, no junction geometry; one-way streets are not enforced.
- "On the road" depends on OSM centre lines with inferred widths (section 3).
- Wheels have no individual suspension travel; the car cannot leave the ground.
- The car's position is not saved between sessions; it always starts at Jalan China.
- Touch has no handbrake.
- The automated driver used in tests steers between walls and parked cars with a clearance check; it is a test
  tool, not game code, and it is not a traffic AI.
- If the character is teleported far away, the car stays where it was left.
