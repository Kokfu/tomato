# V6 — OP fly mode and DUN reconstruction

Two work packages only. Nothing else in the world, the data or the other landmarks was changed.

## A. OP / developer fly mode

`src/player/FlyMode.ts`, wired into the frame loop in `src/main.ts`.

| Control | Action |
|---|---|
| `P` or the small **OP** button (bottom left) | enter / leave |
| `W A S D` + mouse | fly, look (any angle, including straight up / down and from below ground) |
| `Space` / `Ctrl` or `C` | ascend / descend |
| `Shift` | boost (x2) |
| `1` `2` `3` or the buttons | 25 / 75 / 150 m/s |
| `Esc` or `T` | free the mouse to click the panel (in fly mode Esc does not pause; a second Esc does) |
| `K` or **Screenshot** | save the current frame as a PNG |
| **Walk here** | put the character on the ground under the camera (refused over water, buildings, unloaded areas) |
| **Exit** / `P` | back to walking at the position the character was left at |

- It is a free camera: the character is not moved, so leaving the mode returns to the last safe walking
  position with the normal collision and gravity. Nothing is stored; the mode is off on every load.
- The panel shows world X / Z, latitude / longitude, altitude (absolute and above ground), speed and the
  nearest landmark.
- The landmark list is built from `landmarks.json` (all 33 entries, the requested ones first). No
  coordinates were added. Travelling first moves the streaming focus to the landmark, waits until its
  chunk is built, then places the camera south of it looking north.
- Streaming follows the camera. `ChunkManager.update` downloads a second block of chunks about 1.5 s
  ahead above 40 m/s and builds up to three chunk meshes per frame above 60 m/s.
- Hidden on touch / small screens (it needs a keyboard).

## B. DUN building V2

`src/world/landmarks/dun.ts` only; the generic building engine is untouched. Same OSM anchor
(way 1357531465), same chunk streaming, same collision (the mapped outline).

What is modelled, from the two reference pages:

- regular nine-pointed plan, sized and rotated from the mapped outline;
- 27 tall white columns that branch into pointed arches under a ring beam;
- recessed glazed core with floor bands and dark mullions behind the columns;
- nine concave gold pavilion roofs on the terrace, one over each point; an entrance canopy;
- upper drum of dark glazing behind a diagrid of struts, ribs under each roof ridge;
- the main roof as one smooth lofted surface: 18 pleats, sharp ridges, scalloped eave, concave sweep to
  a narrow neck, stepped finial and mast to the published 114 m;
- gold as a PBR metal (metalness 0.82, roughness 0.36) reflecting a small analytic sky.

Low-detail chunks build a reduced version (fewer roof segments, no struts, bands or mullions).

Triangles: 1,101 before, 9,550 after (3,870 body + 5,680 roof), two draw calls instead of one.

### Screenshots (`docs/screenshots/v6/`)

Same five cameras before and after (`tools/dev/dun-shots.ts`): `river` (across the Sarawak River),
`facade` (close, ground level), `elevated`, `aerial`, `under-eaves`. Files `before-*.png` / `after-*.png`.
`op-mode-dun*.png` show the fly panel at the DUN (day, from below the eaves, evening).

## Verification

- `tests/e2e/opmode.spec.ts` (3 tests, pass): off by default; enter / leave by key and button; flying,
  ascend / descend, speed keys and buttons, boost, mouse look; below-ground camera; character does not
  move while flying; walking, gravity and collision after leaving; travel to nine landmarks with the
  chunk built on arrival; "Walk here" refused over the DUN and accepted beside it; 1.8 km at 150 m/s
  across seven chunks with the chunk under the camera built on 100 % of frames (max chunk build 20 ms).
- Existing `gameplay` and `landmarks` e2e specs (13 tests) and `tests/unit/landmarks.test.ts` (14): pass.
- Whole scene at the DUN, single-frame render time, 1280x720, same machine, before -> after:
  river 105 -> 80 ms, facade 42 -> 35 ms, elevated 53 -> 43 ms on High (these single frames are noisy; the
  point is that there is no measurable cost). Low and Medium render the same model without errors.

Run the e2e tests with `PUBLIC_PORT=5174` set: the dev server's HMR socket otherwise points at port 3000
and the tests count the failed connection as a console error (this predates V6).

## Limitations

- Dimensions are read off one frontal photograph and scaled to the published 114 m; no drawings were
  available. Tier heights and radii are estimates, the column count (27) is a judgement from the photo.
- The real columns form two interleaved tiers of arches; one tier is modelled.
- The mapped OSM outline is an irregular 20-vertex polygon, not a clean star. It is kept as the plinth
  and as the collision outline; the regular star above it overhangs it by a few metres in places.
- The entrance canopy is placed on the north (landward) side by inference from the photo. The other
  ground-level pavilions near the river and all landscaping are not modelled.
- The terrain under the building slopes; the building stands at the mean ground level, so the plinth
  shows as a tall skirt on the downhill side.
- The gold's sky reflection is a fixed daytime gradient; in the evening only the direct light changes.
- No interior. Collision is the mapped outline at every height (the colonnade cannot be walked into).
- Fly mode: the minimap, the location label and shop inspection keep following the character, not the
  camera. `Ctrl+W` closes the browser tab and cannot be intercepted, so use `C` to descend while
  flying forward. Desktop only.
