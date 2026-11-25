# M3b notes: start-up

**Finding.** `__k3d.ready` was set just *before* a frame that froze for about 6 s, on the baseline build too. The
freeze was the first frame of the default (Jalan China) rendering waiting for its shader programs. `load-probe` caught
the time before or after that frame by chance, which is why start-up readings jumped between 5 s and 12 s and why
M2's "+10 %" did not reproduce. The time the player really waits is `ready` plus that frame.

**What start-up waited for** (`tools/dev/load-profile.ts`, CPU profile of one cold start, M3 build, 13.3 s in total):
- 3.5 s: the world drawn behind the loading screen in the geographic rendering, each program linked on first use,
  one at a time, on the main thread. Those variants were thrown away when the default rendering took over.
- 1.4 s chunk building, 0.5 s the street section, 0.4 s its environment map, 1.5 s creating about 100 programs.
- 5.5-6.4 s: the first frame after `ready`, blocked until the GPU process had compiled the default rendering's programs.
Texture decode, ground canvases, the building atlas and tree instancing were all small (under 0.3 s together).

**Changes**
- `src/main.ts`: the default rendering is set up at once, alongside the chunk downloads, not after them; nothing is
  drawn behind the loading screen until it is ready; each finished chunk hands its programs to the GPU process
  (`ChunkManager.onBuilt`), which compiles in the background while the next chunks build; `ready` waits for the last
  program and for one drawn frame, so there is no freeze after it. `?render=v4` starts as before.
- `src/v5/controller.ts`: `primeMode` puts the mode's lighting in place before its section is built.
- `src/v5/V5Scene.ts`: the three landmark models carried RGBA vertex colours (alpha 1 everywhere) where the kit has
  RGB; three.js compiled a second program for each material they share: 15 of the section's 40 programs (75 kB
  fragment shaders). Opaque alpha is dropped on load. Programs at `ready`: 103 -> 65.
- `src/world/ChunkManager.ts`: `holdWarm` (chunks keep their upload frame while nothing is drawn), `onBuilt`.
- `tools/dev/load-probe.ts` also reports `interactiveMs` (ready + two drawn frames); `tools/dev/load-profile.ts` is new.

| Measure (desktop, cold, 4 alternating runs, median) | Baseline (M0) | M3 | M3b | Limit |
|---|---|---|---|---|
| Time to `__k3d.ready` | 5.74 s | 6.9 s (2 runs: 6.86, 13.76) | **4.83 s (-16 %)** | +20 % |
| Time to ready + first frames (what the player waits) | 11.73 s | 13.9 s | **5.29 s (-55 %)** | |
| Programs at ready | 100 | 103 | 65 | |
| Emulated phone (Low, 4x CPU, profiler on), ready, 2 runs | 15.6 / 17.5 s | | 11.6 / 12.6 s | |

Runs vary with machine load (M3b: 3.5 to 7.4 s; baseline: 4.0 to 10.5 s); the pairs alternate. Raw lines: `load-probe.log`.

**Verification.** Typecheck clean; unit 235 / 235; e2e desktop-1920 shader-prep, gameplay, landmarks, district: 20 passed.

**Known.** While loading, the canvas behind the start screen stays empty until `Ready` (before, the city built up
behind it). 27 section programs remain, one per surface; an uber-shader would cut more but risks the look.
