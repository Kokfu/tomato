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

## 6. Open point for decision

In the default rendering, a player who gets in and holds W without steering stops against a V7 parked car after
about 8 m; the lane between the rows is drivable with steering. Turning the car's waiting place into the lane is a
one-line data change, but it changes where the car stands and was left out of this cleanup.
