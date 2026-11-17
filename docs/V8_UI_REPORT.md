# V8 UI cleanup and driving access

Scope: three small changes on top of the V8 driving prototype. No rebuild, no vehicle physics changes, no new
key bindings, no road or visual work. Legacy rendering code is kept.

Status: implemented and tested.

## 1. Rendering selection

- The game now starts in **V7 Jalan China**: the detailed street section where it exists and the normal geographic
  rendering everywhere else. The start screen waits for it ("Preparing the Jalan China street section…") so the
  street does not change after Start. If the section cannot be built, the game falls back to the geographic
  rendering with a console warning.
- The comparison bar (V4 Existing / V5 Procedural / V5 Hybrid / V7 Jalan China) is no longer on the HUD. It lives
  in **Settings > Developer settings** (collapsed by default), with its frame-time read-out. Keys 1-4 and
  `?render=v4|a|b|c` work as before; `?render=v4` starts in the old rendering.
- **Version** line in Settings, separate from the graphics presets and the comparison: release (from the last
  commit's `Vn:` prefix), commit, "+ local changes" when the tree was dirty at build time, build date, and
  "dev server" under `vite`. Stamped by `vite.config.ts` (`__K3D_BUILD__`), read by `src/version.ts`.
- Saved views: a view's "Copy link" now always names its rendering (`render=v4` included), because V4 is no longer
  the default. Saved views and the Jalan China presets switch the mode as before.
- The street ambience of the section is not started before the first click (Start).

## 2. Pause menu: Drive Car

**Drive Car** (between Resume and Return to Waterfront):

1. the V8 car (where it was last left, or its waiting place if it has not been placed yet);
2. world streaming is centred on the car while the menu shows "Finding the car…", until its chunk has
   collision and a mesh;
3. a free place beside it is found with the same search used for getting out (driver's door, other door, then the
   ends; loaded, dry, outside buildings, not pushed by any obstacle);
4. the walking character is put there, turned to face the car, with the camera behind;
5. the menu closes with the toast "Press E to enter car." and the **E Enter Car** prompt.

The player is not put in the car. Nothing is placed on unloaded ground: if there is no room, or the area does not
load within 45 s, a toast says so and the character stays where it was. Resume, Esc or Return to Waterfront
cancel a search that is still loading. In OP mode it returns to the character first. While driving, the button is
disabled. Walking to the car works as before.

## 3. Contextual controls

| Situation | Prompt | Controls line |
|---|---|---|
| Walking | - | WASD move, Shift run, Space jump, Mouse look, Wheel zoom, M map, V view, P OP mode, Esc pause |
| Walking, car in reach | **E Enter Car** | **E enter car** + walking |
| Walking, shop in reach | **E Inspect Shop** *name* | **E inspect shop** + walking |
| Car and shop in reach | **E Enter Car** only | **E enter car** (the car takes E, as before) |
| Driving | - | W accelerate, S brake / reverse, A D steer, Space handbrake, Mouse look, Wheel zoom, R back to road, P OP mode, Esc pause; speedometer and gear |
| Driving, nearly stopped (≤ 5.4 km/h, the existing exit limit) | **E Exit Car** | **E exit car** + driving |
| OP mode (on foot or from the car) | - | WASD fly, Mouse look, Space up, Ctrl / C down, Shift boost, 1-3 speed, E inspect, R reference, K screenshot, P exit OP mode, Esc free the mouse |

The controls line stays hidden on touch and small screens, as before; on touch the speedometer's EXIT button
stands in for the Exit Car prompt.

## 4. Changed files

| File | Change |
|---|---|
| `src/main.ts` | Default render mode and start gating; Drive Car (streaming focus, stand-beside, face, prompt); contextual controls; Exit Car prompt each frame |
| `src/vehicle/Driving.ts` | Enter / Exit Car prompt states; `standSpot()`, `whereabouts`, `near`, `canExit`; help text moved out |
| `src/ui/ControlsHelp.ts` (new) | The contextual controls line |
| `src/ui/GameMenu.ts` | Drive Car button and state, version line |
| `src/version.ts` (new) | Build version label |
| `src/v5/controller.ts` | Comparison bar can be placed in a host element (Developer settings) |
| `src/ui/PlacePanel.ts` | "Inspect Shop" prompt text, `nearShop` |
| `src/player/FlyMode.ts` | Copy link always names the render mode |
| `index.html`, `src/styles/main.css` | Pause button, Developer settings, version line, prompt and help styles |
| `vite.config.ts` | `__K3D_BUILD__` stamp |
| `tests/e2e/ui.spec.ts` (new) | 4 browser tests for this change |
| `tests/e2e/driving.spec.ts` | New prompt wording and Exit Car assertions; physics tests pinned to `?render=v4` (below) |

## 5. Tests

- Unit: 64 / 64. `tsc --noEmit` clean. `vite build` succeeds (start bundle 845 kB, 249 kB gzipped; was 842 kB).
- `tests/e2e/ui.spec.ts`, 4 / 4: default rendering and the developer comparison (all four modes, keys 1-4,
  version line); `?render=v4` start and saved views keeping their mode; Drive Car from 2 km away (car chunk
  unloaded first, streamed back, stood beside on loaded ground, facing it, toast and prompt, E in, Exit Car, E out,
  Return to Waterfront, Drive Car again, walking to the car by hand); Inspect Shop, the car taking E next to a shop,
  driving to OP mode and back, walking to OP mode and back.
- Existing: driving 7 / 7, OP mode 3 / 3, gameplay (incl. chunk streaming and unloading), layout on four viewports,
  touch on two, production build 2 / 2: all pass.

**Driving tests pinned to V4.** With V7 Jalan China as the default, four V8 driving tests failed: they drive straight
along Jalan China's mapped centre line, and the car's starting heading meets the V7 east row of parked cars after
about 8 m (measured: 0 km/h at frame 120 in V7, 31 km/h in V4). This is data finding 1 of `docs/V8_REPORT.md` (the
OSM centre line runs through the east parked row). The driving tests that start at the car now load `?render=v4`,
the geometry they were written for (the V7 lane test then switches to V7 itself, as before); the high-speed run and
the new UI tests use the default rendering. Nothing in the game was moved to make them pass.

Screenshots (1920 x 1080, medium): `docs/screenshots/v8-ui/`: `01-hud-walking-default`, `02-settings-developer`,
`03-pause-menu`, `04-drive-car-arrived`, `05-hud-driving`, `06-hud-shop`, `07-hud-op-mode`.

## 6. Open point for decision (resolved in V8.0.1)

In the default rendering, a player who gets in and holds W without steering stops against a V7 parked car after
about 8 m; the lane between the rows is drivable with steering. Turning the car's waiting place into the lane is a
one-line data change, but it changes where the car stands and was left out of this cleanup.

## 7. V8.0.1: driving spawn and lane alignment

**Measured.** In the Jalan China street frame (`src/v5/geo.ts`: s = metres from the Jalan Carpenter end, o = metres
east of the middle between the two mapped frontages, half width 4.04 m):

- Mapped centre line (OSM way 124545031, inferred width 6 m): parallel to the street at o = +2.58 m along the whole
  section.
- V7 parked-car collision boxes: west row centred at o = -2.24 m, east row at +2.24 m. The inner edges are at
  o = -1.35 and +1.35 m, so the free lane between them is 2.7 m wide. The last east car is at s = 75.8-80.2 m.
- Old waiting place: s = 91.0, o = +2.17 (on the centre line). Holding W met the east car at s = 78 after 8.8 m
  (closing speed 8.5 m/s, then 0 km/h).

**Changed.** Only the car's waiting place (`CAR_START`, `src/vehicle/VehiclePhysics.ts`). It is now s = 91, o = 0:
the middle of the street at its Jalan Main Bazaar mouth, facing exactly along the street toward Jalan Carpenter
(the one-way direction). That leaves 0.48 m clear on each side of the body past both parked rows. It is still on
Jalan China by the runtime rule: 2.59 m from the centre line, within the mapped half width plus the 1 m tolerance.
No road, building or parked-car coordinates changed. The same pose is clear in V4. Holding W with no steering now
drives the full 88 m to Jalan Carpenter with no contact and no sideways drift in both V7 and V4. Drive Car stands
the character at the driver's door (west side), as before.

**Tests.**

- Unit test of the waiting place: the old assertion "whole body within the mapped width" assumed the centre line is
  the middle of the street. It now checks the place against the mapped frontages and the parked rows: in the middle
  (|o| < 0.05), more than 0.4 m clear of both rows, and pointing down the lane. It also checks that the place is on
  the carriageway by the runtime rule and faces with the traffic.
- `tests/e2e/driving.spec.ts` runs in the default V7 rendering, except for the tests that place the car on the
  mapped centre line, which stay in V4.
  - Default V7: walk up, enter, drive, brake, reverse, stop, exit; the new acceptance test (Esc > Drive Car > E >
    4 s of W with no steering: 34 m, 54 km/h, zero contact, then brake, stop, exit); lane keeping; the block loop
    through four junctions (Jalan China leg in the lane, left turn into Jalan Carpenter made in the junction);
    switching to OP mode and back.
  - V4 regressions: steering and handbrake, R back to the road, collisions, the block loop.
- `tests/e2e/ui.spec.ts`: the Drive Car test now picks a clear spot out of reach for its walk back to the car.
  Sideways from the car is now the shophouse row, and the spot ahead depends on how far the car rolled.
- Results: unit 64/64; tsc clean; vite build OK; driving 9/9; UI 4/4 (twice).

**Performance** (1920 x 1080, medium, high-speed streaming run on Jalan Tun Abang Haji Openg, same machine, same
session):

| Run | New start | Old start |
|---|---|---|
| Run 1 | 55.3 fps | 51.3 fps |
| Run 2 | 56.0 fps | 50.6 fps |

The route is unaffected by the start. Single stalls of 1-2.5 s occurred in both variants. There were no impacts and
no frames on unbuilt chunks in any run. Real time at the new start: 56 fps standing in the car, and 52 fps while
holding W down the lane (p95 26 ms).

Screenshot: `docs/screenshots/v8-0-1/01-driving-start-v7.png`, the chase view at the new start, from the
acceptance test.
