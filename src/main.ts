import { guardViolations } from './world/landmarks/protect.ts';
import * as THREE from 'three';
import { WorldManager } from './world/WorldManager.ts';
import { prepareForDraw, whenCompiled } from './world/prepareDraw.ts';
import { worldToGeo, geoToWorld } from './world/GeoProjection.ts';
import { registerLandmarks } from './world/landmarks/index.ts';
import { Input } from './player/Input.ts';
import { PlayerController } from './player/PlayerController.ts';
import { ProceduralHumanoid } from './player/CharacterAnimator.ts';
import { CharacterRegistry, LOAD_STALL_MS } from './player/character/CharacterRegistry.ts';
import { CharacterSwapper } from './player/character/swap.ts';
import { bodyVisible } from './player/character/visibility.ts';
import { CharacterTimings, yieldToMain } from './player/character/timings.ts';
import { uploadTexturesStaged } from './player/character/stagedPrepare.ts';
import { DEFAULT_CHARACTER_ID, charEnabled, getProfile, loadSavedCharacter, resolveStartCharacter, saveCharacter } from './player/character/CharacterProfile.ts';
import type { CharacterPicker, PickerMode } from './ui/CharacterPicker.ts';
import { ThirdPersonCamera } from './player/ThirdPersonCamera.ts';
import { GameMenu } from './ui/GameMenu.ts';
import { Minimap } from './ui/Minimap.ts';
import { GpsPanel } from './ui/GpsPanel.ts';
import { MobileControls } from './ui/MobileControls.ts';
import { QUALITY, defaultQuality, isTouchDevice, AdaptiveResolution } from './ui/GraphicsSettings.ts';
import type { QualityName } from './ui/GraphicsSettings.ts';
import { PlacePanel } from './ui/PlacePanel.ts';
import { Footsteps } from './player/Footsteps.ts';
import { FlyMode } from './player/FlyMode.ts';
import type { SavedView } from './player/FlyMode.ts';
import { ReferencePanel } from './ui/ReferencePanel.ts';
import STREET_VIEWS from '../tools/dev/street-views.json';
import type { V5Controller, RenderMode } from './v5/controller.ts';
import { Driving } from './vehicle/Driving.ts';
import { ControlsHelp } from './ui/ControlsHelp.ts';
import { QuickGuide, enterCarToast, ux1Enabled } from './ui/QuickGuide.ts';
import type { ControlsContext } from './ui/ControlsHelp.ts';
import { startModes } from './world/dayCycle.ts';
import type { RainMode, TimeMode } from './world/dayCycle.ts';
import { RainSound } from './world/Rain.ts';
import { headlightGeometry } from './world/StreetFurniture.ts';

/** Rendering at start: V7 Jalan China (its detailed section, the normal geographic rendering elsewhere). The legacy
 *  comparison modes stay available in Settings > Developer settings, by keys 1-4 and by ?render=v4|a|b|c. */
const DEFAULT_RENDER_MODE: RenderMode = 'c';

async function boot(): Promise<void> {
  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  let qualityName: QualityName = defaultQuality();
  let quality = QUALITY[qualityName];

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouchDevice(), powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Khronos PBR Neutral keeps the pastel facade colours true; ACES visibly desaturated them.
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Counted per frame (not per render call) so multi-pass rendering reports true totals.
  renderer.info.autoReset = false;
  const adaptive = new AdaptiveResolution();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.3, 2000);
  // The reference comparison panel (OP mode) can take the right half of the window.
  let splitView = false;
  const applyResolution = () => {
    const w = Math.max(1, Math.round(window.innerWidth * (splitView ? 0.5 : 1))), h = Math.max(1, window.innerHeight);
    canvas.style.width = splitView ? '50%' : '';
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.maxPixelRatio) * adaptive.scale);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // While the V5 pipeline draws, it owns the shadow state (V5_TIERS); changing it here would change every shader
    // program variant behind the back of the shader preparation (src/world/prepareDraw.ts).
    if (!v5?.usesPipeline) renderer.shadowMap.enabled = quality.shadowMap > 0;
    v5?.setSize(w, h, renderer.getPixelRatio());
  };

  const input = new Input(canvas);
  let paused = false;
  let started = false;
  let mapOpen = false;
  let placeOpen = false;
  let pickerOpen = false; // CHAR-P5 G2 (only with ?char): the character picker is open
  const steps = new Footsteps();
  // N1-M6: the day passes and it rains now and then, unless the settings (or ?time= / ?rain=) say otherwise. An
  // automated browser gets a frozen dry day, so tests, screenshots and benchmarks are repeatable (dayCycle.ts).
  const saved = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
  const modes = startModes(location.search, { time: saved('k3d.time'), rain: saved('k3d.rain') }, navigator.webdriver === true);
  const rainSound = new RainSound();
  const syncInput = () => {
    input.enabled = started && !paused && !mapOpen && !placeOpen && !pickerOpen;
    if (!input.enabled) input.releasePointer();
  };

  let world: WorldManager;
  // V5 rendering experiment (A/B comparison of the Carpenter Street section); created once the world is loaded.
  let v5: V5Controller | null = null;
  /** Upload textures and start compiling programs of `o` for the render path in use (src/world/prepareDraw.ts). */
  const prepareObject = (o: THREE.Object3D) => (v5?.usesPipeline ? v5.pipeline.prepare(o) : prepareForDraw(renderer, o, camera, world.scene));
  /** True while a preset change's programs compile (the last frame stays on screen); see onQuality. */
  let holdDraw = false;
  let prepareToken = 0;
  const menu = new GameMenu(
    {
      onStart: () => {
        started = true;
        steps.unlock();
        rainSound.unlock();
        if (charStart.needsPick) void openPicker('first'); // CHAR-P5 G2: first launch: choose before entering the world
        else if (charStart.flag && !charStart.persist) menu.toast(`Playing as ${getProfile(charStart.id)?.picker?.name ?? 'your character'}. Change character is in the pause menu.`, 3.5);
        syncInput();
        // The default rendering is built behind the start screen; its street ambience waits for this first click.
        if (v5) {
          v5.ambience.enabled = steps.enabled;
          if (steps.enabled && v5.mode !== 'v4') v5.ambience.start();
        }
      },
      // N1-M6: every rendering follows the hour (the world scales each one's own daylight): nothing is switched or recompiled.
      onTimeOfDay: (t) => world.setTime(t),
      onRain: (r) => world.setRain(r),
      onSound: (on) => { steps.enabled = on; rainSound.enabled = on; v5?.ambience.setEnabled(on); if (on && v5 && v5.mode !== 'v4') v5.ambience.start(); },
      onResume: () => {
        endCarTrip(); // leaving the pause menu cancels a "Drive Car" that is still loading
        if (charStart.flag) { cancelPickerWarm(); swapper.cancelPendingWarm(); } // CHAR-P5: no model building while the game runs
        paused = false;
        syncInput();
      },
      onPause: () => {
        paused = true;
        syncInput();
        syncDriveButton();
        syncCharacterButton(); // CHAR-P5 G2 (only with ?char): "Change character" is blocked in the car and in OP fly mode
      },
      onReset: () => { endCarTrip(); resetLocation(); },
      onDriveCar: () => driveCar(),
      onChangeCharacter: () => { void openPicker('change'); },
      onQuality: (q) => {
        qualityName = q;
        quality = QUALITY[q];
        adaptive.scale = 1;
        const v5on = !!v5?.usesPipeline;
        if (v5on) v5!.pipeline.disable();
        world.applyQuality(quality);
        v5?.setTier(q);
        if (v5on) v5!.pipeline.enable();
        camera.far = world.viewDistance;
        camera.updateProjectionMatrix();
        applyResolution();
        // V8.6: the preset decides program variants (shadows; tone mapping in the materials or in the HDR output
        // pass). Compile the new variants of everything in the scene together, in the background, instead of one
        // stall per material as each is drawn; chunks rebuilt for the new preset prepare their own (ChunkManager).
        const token = ++prepareToken;
        holdDraw = true;
        void Promise.race([whenCompiled(renderer, prepareObject(world.scene)), new Promise((r) => window.setTimeout(r, 3000))])
          .then(() => { if (token === prepareToken) holdDraw = false; });
      },
      onAdaptive: (on) => {
        adaptive.enabled = on;
        if (!on) {
          adaptive.scale = 1;
          applyResolution();
        }
      },
      onSensitivity: (v) => (input.mouseSensitivity = 0.0024 * v),
      onToggleView: () => toggleView(),
      onToggleMap: () => minimap.toggleFullMap(),
    },
    qualityName,
    modes,
  );

  try {
    world = await WorldManager.load(quality);
  } catch (e) {
    console.error(e);
    menu.showError('Could not load map data. Run "npm run data:build" and reload.');
    return;
  }
  world.setTime(modes.time, modes.hour ?? undefined);
  world.setRain(modes.rain, modes.rain === 'on' ? 1 : undefined);
  registerLandmarks(world.landmarks);
  world.chunks.renderer = renderer;
  // A streamed landmark model joins the scene only once its programs are compiled (for whichever render path is in
  // use) and its textures are uploaded, so it never stalls the frame it first appears in.
  world.landmarkModels.prepare = (o) => whenCompiled(renderer, prepareObject(o));
  // The V5 code (generators, materials, post-processing) is a separate chunk: it does not add to the first download.
  const v5Ready = import('./v5/controller.ts').then((m) => {
    v5 = new m.V5Controller(world, renderer, camera, qualityName, document.getElementById('dev-render')!);
    if (!started) v5.ambience.enabled = false; // no audio before the first click (onStart)
    (window as any).__k3d.v5 = v5;
    v5.keysEnabled = () => !fly.active; // 1-3 are the fly speeds in OP mode
    applyResolution();
    return v5;
  });
  camera.far = world.viewDistance;
  camera.updateProjectionMatrix();
  applyResolution();
  renderer.toneMappingExposure = world.exposure;

  const player = new PlayerController(world.collision, new ProceduralHumanoid());
  player.hasData = (x, z) => world.chunks.hasData(x, z);
  player.onFootstep = (speed, deck, impact) => steps.step(speed, deck ? 'deck' : 'paving', impact);
  world.scene.add(player.visual.root);
  const tpc = new ThirdPersonCamera(camera, world.collision);
  // CHAR-P2a: character profiles. Without ?char nothing changes: the default model is loaded as before.
  const charStart = resolveStartCharacter(location.search, charEnabled(location.search) ? loadSavedCharacter() : null);
  // CHAR-P5 G2 (D3): shader error checking is a named configuration. DIAGNOSTIC (checks on) is the default in the dev server and in
  // `vite build --mode diagnostic`; BENCHMARK/RUNTIME (checks off, see below) is the default of a normal build. `?charcfg=diagnostic|benchmark`
  // picks either in any build, so one build can measure both. `?charcache=<MB>` forces the parsed-model cache budget (the 32 MB phone
  // budget on a desktop). Both only matter with ?char.
  const charQ = new URLSearchParams(location.search);
  const charCfg = charQ.get('charcfg') === 'diagnostic' ? 'diagnostic' : charQ.get('charcfg') === 'benchmark' ? 'benchmark' : (import.meta.env.DEV || import.meta.env.MODE === 'diagnostic') ? 'diagnostic' : 'benchmark';
  const cacheMB = Number(charQ.get('charcache'));
  // CHAR-P5 G2 (N1): with ?char a GLB load that makes no progress for LOAD_STALL_MS ends in the picker's error state (Try again).
  // `?charstall=<ms>` (tests) shortens it. Without ?char nothing changes: no timeout.
  const stallQ = Number(charQ.get('charstall'));
  const charRegistry = charStart.flag
    ? new CharacterRegistry({}, { ...(cacheMB > 0 ? { budgetBytes: cacheMB * 1024 * 1024 } : {}), stallMs: stallQ >= 200 ? stallQ : LOAD_STALL_MS })
    : new CharacterRegistry();
  /** The single rule for showing the player's body (src/player/character/visibility.ts). */
  const syncBody = () => { player.visual.root.visible = bodyVisible({ firstPerson: tpc.firstPerson, driving: driving.active, flying: fly.active }); };
  /** CHAR-P5 (only with ?char): stage timings of the swaps, `__k3d.character.timings`. */
  const charTimings = charStart.flag ? new CharacterTimings() : null;
  // CHAR-P5 (profiling, G1c): with the check on, a program's first draw calls getProgramInfoLog/getShaderInfoLog, which wait for the GPU process
  // to drain its queue (the first draws of the model just uploaded): 44-52 ms in ONE frame on the desktop, for the second material of every
  // hair/eyelash mesh (alphaTest). Off, that stall is gone (g1c/runs/probe5 vs probe4); a link error still shows as the browser's GL error.
  if (charStart.flag) renderer.debug.checkShaderErrors = charCfg === 'diagnostic';
  /** CHAR-P5: draw a prepared model once, hidden far below the world, so its geometry, bone texture and shadow program are
   *  uploaded before it is installed. ONE MESH PER FRAME (the others are invisible until their turn): the first draw of a whole
   *  character is one long frame on a phone (about 95% of the worst switching frames), of a single mesh a short one. */
  const predrawHidden = (root: THREE.Object3D) => new Promise<void>((resolve) => {
    const meshes: THREE.Mesh[] = [];
    root.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
    const was = meshes.map((m) => m.visible);
    for (const m of meshes) m.visible = false;
    root.position.set(player.position.x, -2000, player.position.z);
    root.visible = true;
    world.scene.add(root);
    let next = 0, tail = 0, done = false;
    const finish = () => {
      if (done) return;
      done = true;
      world.scene.remove(root);
      meshes.forEach((m, k) => { m.visible = was[k]; });
      resolve();
    };
    const step = () => {
      if (done) return;
      if (next < meshes.length) meshes[next++].visible = true; // drawn by the next render, together with the earlier ones (cheap now)
      else if (++tail >= 2) return finish();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    window.setTimeout(finish, 1500); // a hidden tab draws no frames
  });
  const swapper = new CharacterSwapper({
    registry: charRegistry,
    install: (next) => player.setVisual(next, { disposeOld: false }),
    prepare: async (root, mark) => {
      if (!charStart.flag) return whenCompiled(renderer, prepareObject(root));
      let t = performance.now();
      await uploadTexturesStaged(renderer, root, yieldToMain);
      mark?.('prepare.textures', performance.now() - t);
      t = performance.now();
      const programs = prepareObject(root);
      mark?.('prepare.compile', performance.now() - t);
      t = performance.now();
      await whenCompiled(renderer, programs);
      mark?.('prepare.wait', performance.now() - t);
    },
    yieldToMain: charStart.flag ? yieldToMain : undefined,
    begin: charTimings ? (id) => charTimings.begin(id) : undefined,
    mark: charTimings ? charTimings.mark : undefined,
    predraw: charStart.flag ? predrawHidden : undefined,
    applyCamera: (p) => tpc.setProfile(p),
    syncBody,
    warn: (m, e) => (e === undefined ? console.warn(m) : console.warn(m, e)),
    persist: (id) => saveCharacter(id),
  });
  /**
   * Why "Change character" is not possible right now, or null. Flying and driving: the OP camera and the car own the body. "Finding the
   * car" (Drive Car, still loading): the player is about to be moved to the car, so a swap or an open picker must not be in the middle of it.
   * "(P)" is a keyboard hint: it is left out on touch (PAUSE_SPEC).
   */
  const changeCharacterBlock = (): string | null => {
    if (fly.active) return isTouchDevice() ? 'Turn off fly mode to change character.' : 'Turn off fly mode (P) to change character.';
    if (driving.active) return 'Get out of the car to change character.';
    if (carTrip) return 'Wait until the car is found.';
    return null;
  };
  /** "Change character" row of the pause menu: blocked with the reason above (aria-disabled, stays focusable). */
  const syncCharacterButton = () => menu.setCharacterButton(!charStart.flag ? null : { blocked: changeCharacterBlock() });
  // ---- CHAR-P5 G2: the character picker (only with ?char; the module is a separate chunk, requested only then) ----
  const pickerModule = charStart.flag ? import('./ui/CharacterPicker.ts') : null;
  let picker: CharacterPicker | null = null;
  /**
   * Selecting a card prepares that model (hidden, in steps) once the screen has been still for PICKER_WARM_SETTLE_FRAMES frames and no
   * swap is loading, so the confirm that follows is just the install. A newer selection, Confirm, Cancel and resuming cancel it; a
   * Confirm that comes first loads the model itself, or waits for a warm-up already under way.
   */
  const PICKER_WARM_SETTLE_FRAMES = 24;
  let pickerWarmToken = 0;
  const cancelPickerWarm = () => { ++pickerWarmToken; };
  const warmFor = (id: string) => {
    const token = ++pickerWarmToken;
    let still = 0;
    const tick = () => {
      if (token !== pickerWarmToken || !pickerOpen) return;
      if (swapper.loading) still = 0; else still++;
      if (still < PICKER_WARM_SETTLE_FRAMES) { requestAnimationFrame(tick); return; }
      void swapper.warm(id);
    };
    requestAnimationFrame(tick);
  };
  let pickerMode: PickerMode = 'first';
  const openPicker = async (mode: PickerMode) => {
    if (!charStart.flag || pickerOpen) return;
    if (mode === 'change' && changeCharacterBlock()) return; // blocked (driving, flying, finding the car): the pause menu says why
    pickerOpen = true;
    pickerMode = mode;
    document.body.classList.add('picker-open'); // no flash of the HUD while the module is fetched
    syncInput();
    menu.setPickerOpen(true, false);
    try {
      const mod = await pickerModule!;
      picker ??= new mod.CharacterPicker({
        baseUrl: import.meta.env.BASE_URL,
        onSelect: (id) => warmFor(id),
        onConfirm: async (id) => {
          cancelPickerWarm(); // a warm-up not yet started is not needed: this swap loads it (or takes the one under way)
          const ok = await swapper.swap(id, { persist: true, strict: true });
          if (ok) {
            pickerOpen = false;
            menu.setPickerOpen(false, false);
            if (pickerMode === 'change') menu.resume(); // back into the game, same place, same camera
            else syncInput();
            menu.toast(`Playing as ${getProfile(id)?.picker?.name ?? id}`, 2.5);
            syncCharacterButton();
            return 'ok';
          }
          return swapper.lastError ? 'error' : 'superseded';
        },
        onCancel: () => {
          cancelPickerWarm();
          swapper.abort(); // a choice still loading is dropped
          swapper.dropWarm();
          pickerOpen = false;
          syncInput();
          menu.setPickerOpen(false, true); // the pause menu comes back
        },
      });
      picker.open(mode, swapper.usingFallback ? null : swapper.currentId);
    } catch (e) {
      console.warn('Character picker unavailable:', e);
      pickerOpen = false;
      document.body.classList.remove('picker-open');
      menu.setPickerOpen(false, true);
      syncInput();
      if (mode === 'first') void swapper.swap(DEFAULT_CHARACTER_ID, { persist: false });
    }
  };
  const spawn = world.manifest.spawn;
  player.position.set(spawn.x, world.height.sample(spawn.x, spawn.z), spawn.z);
  // Face the river (north) at spawn; the camera sits behind, to the south.
  player.heading = Math.PI;
  tpc.yaw = 0;

  // V8: one drivable car on the real road network (see src/vehicle). While it is driven the character rides
  // along (hidden), so the map, the location read-out and the streaming keep following `player.position`.
  const driving = new Driving(world, camera, { toast: (t) => menu.toast(t, 2) });
  world.scene.add(driving.model.root);
  // N1-M6: while it is driven at night the car lights the road ahead (the lamp-pool material: additive, not drawn by day).
  const headlights = new THREE.Mesh(headlightGeometry(), world.materials.pools);
  headlights.renderOrder = 7;
  headlights.visible = false;
  headlights.userData.noAO = true;
  driving.model.root.add(headlights);
  driving.prepare = (o) => { prepareObject(o); };
  /** Teleports and resets act on the walking character: the car is left where it stands. */
  const leaveCar = () => {
    if (!driving.active) return;
    driving.exit(player, true);
    syncBody();
    minimap.setDriving(false);
  };
  const toggleCar = () => {
    if (driving.active) {
      if (driving.exit(player)) {
        syncBody();
        tpc.yaw = driving.camera.yaw;
        tpc.snap();
        minimap.setDriving(false);
      }
    } else if (driving.enter(player)) {
      if (tpc.firstPerson) tpc.firstPerson = false;
      syncBody();
      minimap.setDriving(true);
    }
  };

  const resetLocation = () => {
    leaveCar();
    player.teleport(spawn.x, spawn.z);
    player.heading = Math.PI;
    tpc.yaw = 0;
    tpc.snap();
  };
  // The start screen waits for the default rendering, so the street does not change under the player's eyes.
  const qMode = new URLSearchParams(location.search).get('render');
  const initialMode: RenderMode = qMode === 'v4' || qMode === 'a' || qMode === 'b' || qMode === 'c' ? qMode : DEFAULT_RENDER_MODE;
  let renderReady = false;
  // N1-M3b start-up. Shader programs are the slowest part of loading (about 100 of them, compiled by the GPU process),
  // and the default rendering needs other variants of them than the geographic one. So the default rendering is set
  // up at once, alongside the chunk downloads, and nothing is drawn behind the loading screen until it is ready:
  // drawing would compile every world program twice (the first time for a rendering that is never shown) and would
  // wait on the main thread for each. Instead each finished chunk hands its programs to the GPU process, which
  // compiles them in the background while the next chunks are built; `ready` then waits for the last of them, so
  // the first frame the player sees does not freeze.
  let startHold = initialMode !== 'v4';
  const modeSet = startHold
    ? v5Ready.then((c) => { c.primeMode(initialMode); return c.setMode(initialMode); }).catch((e) => console.warn('Default rendering unavailable, using the geographic rendering:', e))
    : Promise.resolve();
  world.chunks.holdWarm = startHold;
  world.chunks.onBuilt = (o) => { if (startHold && v5?.usesPipeline) prepareObject(o); };
  const applyInitialMode = () => {
    const done = () => { startHold = false; world.chunks.holdWarm = false; world.chunks.onBuilt = null; renderReady = true; menu.setLoading(1, 'Ready', true); };
    // (N1-M6: this rendering draws from the first frame, so only what is not drawn by day, the rain and the pools of
    // lamp light, is still to compile: now, not on the frame night falls or rain starts)
    if (initialMode === 'v4') { prepareObject(world.scene); return done(); }
    menu.setLoading(0.97, 'Preparing the Jalan China street section…', false);
    void modeSet.then(async () => {
      const programs = prepareObject(world.scene);
      // N1-M4: the road-sign material is first used wherever the first sign board stands, which may be a few chunks
      // away: its program is compiled now, not on the frame that board comes into view. (Low draws no sign plates.)
      if (quality.name !== 'low') for (const m of prepareObject(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), world.materials.signs))) programs.add(m);
      await Promise.race([whenCompiled(renderer, programs), new Promise((r) => window.setTimeout(r, 15000))]);
      // The first frames upload every chunk's buffers and compile the few shadow-pass programs: still behind the screen.
      startHold = false;
      world.chunks.holdWarm = false;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }).finally(done);
  };

  // Pause menu "Drive Car": stream the car's surroundings, then stand the character beside it, facing it. The
  // player is not put in the car, and is never moved onto ground whose collision is not loaded.
  let carTrip: { t: number } | null = null;
  const tripFocus = new THREE.Vector3();
  const noVelocity = new THREE.Vector3();
  const syncDriveButton = () => {
    menu.setDriveCar(carTrip ? 'Finding the car…' : 'Drive Car', !carTrip && !driving.active, driving.active ? 'You are already driving' : '');
    syncCharacterButton(); // CHAR-P5 G2 (only with ?char): "Change character" waits while the car is being found
  };
  const endCarTrip = (message?: string) => {
    if (!carTrip) return;
    carTrip = null;
    syncDriveButton();
    if (message) menu.toast(message, 3);
  };
  const driveCar = () => {
    if (!spawnReady || carTrip || driving.active) return;
    if (fly.active) fly.toggle(); // back to the walking character first
    carTrip = { t: 0 };
    syncDriveButton();
    stepCarTrip(0);
  };
  const stepCarTrip = (dt: number) => {
    if (!carTrip) return;
    carTrip.t += dt;
    driving.tryPlace();
    const spot = driving.standSpot();
    if (spot) {
      const car = driving.car;
      player.teleport(spot[0], spot[1]);
      player.heading = Math.atan2(car.x - spot[0], car.z - spot[1]);
      tpc.yaw = player.heading - Math.PI; // camera behind the character, looking at the car
      tpc.snap();
      carTrip = null;
      syncDriveButton();
      if (!pickerOpen) menu.resume(); // CHAR-P5 G2: never resume the game behind an open character picker
      menu.toast(guide ? enterCarToast(isTouchDevice()) : 'Press E to enter car.', 4);
      return;
    }
    const w = driving.whereabouts;
    if (driving.placed && world.collision.isLoaded(w.x, w.z) && world.chunks.isReady(w.x, w.z)) endCarTrip('No free place to stand beside the car');
    else if (carTrip.t > 45) endCarTrip('The area around the car could not be loaded');
  };
  const controls = new ControlsHelp();
  // UX1 prototype: only with ?ux1=1 (default off = V8.6 exactly). See ui/QuickGuide.ts.
  const guide = ux1Enabled(location.search) ? new QuickGuide({
    touch: isTouchDevice(),
    toast: (t, s) => menu.toast(t, s),
    state: () => (!started || paused || placeOpen ? 'off' : fly.active ? 'fly' : mapOpen ? 'map' : driving.active ? 'drive' : 'foot'),
    car: () => { const w = driving.whereabouts; return driving.placed ? { dx: w.x - player.position.x, dz: w.z - player.position.z } : null; },
    admin: () => placePanel.admin,
  }) : null;
  guide?.mount();

  const toggleView = () => {
    // The driving camera is third-person only: at the wheel V steps the chase distance (near, standard, far).
    if (driving.active) { driving.camera.cycleDistance(); return; }
    tpc.firstPerson = !tpc.firstPerson;
    syncBody();
  };

  const minimap = new Minimap({
    world,
    player,
    camera: tpc,
    onFullMapToggle: (open) => {
      mapOpen = open;
      syncInput();
    },
    onResetLocation: resetLocation,
    isDriving: () => driving.active,
  });
  // V8.4 GPS: destination list for the driver (G / the GPS button while driving).
  const gps = new GpsPanel({
    minimap,
    landmarks: () => world.landmarks.landmarks,
    available: () => started && !paused && !mapOpen && driving.active && !fly.active,
  });

  const placePanel = new PlacePanel({
    places: world.places,
    nearby: () => world.places.near(player.position.x, player.position.z, 7, (cx, cz) => world.chunks.dataAt(cx, cz)),
    playerGeo: () => worldToGeo(player.position.x, player.position.z),
    onOpenChange: (open) => {
      placeOpen = open;
      syncInput();
    },
  });
  // OP / developer fly mode (P): a free inspection camera. Never on by default, nothing is stored.
  let wantShot = false;
  const fly = new FlyMode(world, camera, {
    canToggle: () => started && spawnReady && !paused && !mapOpen && !placeOpen,
    onChange: (active) => {
      if (active) {
        fly.yaw = tpc.yaw;
        fly.pitch = -tpc.pitch;
        player.velocity.set(0, 0, 0);
        syncBody();
        driving.hidePrompt();
      } else {
        // The character never moved: walking resumes from its last safe position, with collision and gravity.
        syncBody();
        tpc.snap();
        driving.camera.snap();
        // The comparison panel belongs to the inspection mode only.
        if (refPanel.open) refPanel.toggle(false);
      }
    },
    screenshot: () => (wantShot = true),
    walkHere: (x, z) => {
      const c = world.collision;
      if (!c.isLoaded(x, z) || c.inWater(x, z)) return false;
      const h = c.groundAt(x, z, 1e6).h;
      if (c.insideBuilding(x, z, h)) return false;
      leaveCar();
      player.teleport(x, z);
      return true;
    },
    toast: (t) => menu.toast(t, 2.5),
    setRenderMode: (m) => v5Ready.then((c) => c.setMode(m as RenderMode)),
    renderMode: () => v5?.mode ?? 'v4',
    toggleReference: () => refPanel.toggle(),
    // Fixed cameras of the Jalan China quality gate (the same file drives tools/dev/street-shots.ts).
    sections: [{ label: 'Jalan China', mode: 'c', views: STREET_VIEWS }],
  });
  const refPanel = new ReferencePanel({
    baseUrl: import.meta.env.BASE_URL,
    onSplit: (split) => { splitView = split; applyResolution(); },
    currentView: (name) => fly.currentView(name),
    goView: (v) => fly.applyView(v),
    toast: (t) => menu.toast(t, 2.5),
  });

  input.on('interact', () => {
    if (!started || paused || mapOpen) return;
    // E gets in and out of the car; everywhere else (and in OP mode) it inspects the nearest place as before.
    if (!placeOpen && !fly.active && spawnReady && (driving.active || driving.canEnter(player))) toggleCar();
    else if (!driving.active) {
      if (!placePanel.nearShop) guide?.hint('noCar');
      placePanel.toggle();
    }
  });
  input.on('reset', () => {
    if (input.enabled && !fly.active) driving.resetToRoad();
  });
  for (const id of ['car-prompt', 'speedo-exit']) {
    document.getElementById(id)!.addEventListener('click', (e) => {
      (e.currentTarget as HTMLElement).blur();
      if (started && !paused && !mapOpen && !placeOpen && !fly.active) toggleCar();
    });
  }

  input.on('pause', () => {
    if (pickerOpen) return;
    if (placeOpen) placePanel.close();
    else if (mapOpen) minimap.toggleFullMap();
    else if (started) menu.togglePause();
  });
  input.on('map', () => {
    if (started && !paused) minimap.toggleFullMap();
  });
  input.on('view', () => {
    if (input.enabled) toggleView();
  });
  document.addEventListener('pointerlockchange', () => {
    // Esc releases pointer lock without a key event reaching the page: treat it as pause.
    // (In OP fly mode Esc only frees the mouse, so that the fly panel can be clicked.)
    if (!document.pointerLockElement && input.enabled && !isTouchDevice() && pointerWasLocked && !fly.active) menu.pause();
    pointerWasLocked = !!document.pointerLockElement;
  });
  let pointerWasLocked = false;
  const mobile = isTouchDevice() ? new MobileControls(input, canvas) : null;

  window.addEventListener('resize', applyResolution);
  new ResizeObserver(applyResolution).observe(document.documentElement);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && started && !paused && !pickerOpen) menu.pause();
  });

  // Swap in the GLB character when one is available; the procedural humanoid is the fallback. Without ?char this is
  // the default model exactly as before (no compile step, no clone, the same requests in the same order); with ?char=<id> the chosen profile
  // loads, compiles in the background and then replaces the humanoid. A model that finishes loading while driving
  // stays hidden (swapper -> syncBody).
  if (charStart.invalid) console.warn(`Unknown character "${charStart.invalid}" in ?char, using "${charStart.id}"`);
  // CHAR-P5 G2: on first launch (no valid saved choice) nothing is loaded until the player picks one.
  if (!charStart.needsPick) void swapper.swap(charStart.id, { persist: charStart.persist, compile: charStart.flag, direct: !charStart.flag }).then(syncCharacterButton);
  syncCharacterButton();
  if (charStart.flag) document.body.classList.add('char-ui');

  // Blob shadow for the low preset (no shadow maps).
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 20).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -32 }),
  );
  blob.renderOrder = 8;
  world.scene.add(blob);

  const clock = new THREE.Clock();
  let hudTimer = 0;
  let fpsAcc = 0, fpsFrames = 0, fps = 0;
  let spawnReady = false;
  let simulatedDt = 0; // test hook: fixed timestep when > 0
  let wasAway = false; // CHAR-P5 N9: driving or flying on the previous frame
  let stepsPerFrame = 1; // test hook: run the simulation faster than real time

  function frame(): void {
    requestAnimationFrame(frame);
    const rawDt = clock.getDelta();
    const dt = simulatedDt > 0 ? simulatedDt : Math.min(rawDt, 0.1);

    // The world streams around the walking character, or around the free camera in OP fly mode.
    // ("Drive Car" from the pause menu streams around the car until the character stands beside it.)
    const flying = fly.active;
    const trip = carTrip ? driving.whereabouts : null;
    const focus = flying ? fly.focus : trip ? tripFocus.set(trip.x, player.position.y, trip.z) : player.position;
    // Until the player starts, chunk building may take long frames (V8.2 time budget, ChunkManager.runJobs).
    world.chunks.loadingBoost = !spawnReady || !started;
    // the day and the weather stand still behind the start screen and the pause menu
    world.clockRunning = started && !paused;
    rainSound.update(dt, started && !paused ? world.weather.rain : 0);
    world.update(dt, focus, flying ? fly.velocity : trip ? noVelocity : driving.active ? driving.velocity : player.velocity, camera);
    v5?.update(dt, rawDt, focus.x, focus.z);
    if (carTrip) stepCarTrip(dt);

    if (!spawnReady) {
      // Never let the player move before ground + collision at the spawn point exist.
      const p = world.chunks.progress();
      spawnReady = world.chunks.isReady(spawn.x, spawn.z) && p > 0.6;
      if (spawnReady) {
        resetLocation();
        applyInitialMode();
      } else menu.setLoading(p * 0.95, `Loading Kuching Waterfront… ${Math.round(p * 100)}%`, false);
    }

    input.poll();
    if (spawnReady) driving.tryPlace();
    // CHAR-P5 N9 (only with ?char): player.update (the only visual.update) is skipped in the car and in OP fly mode, so a jump entered
    // mid-air left the air pose in the hidden body until ~30 frames after leaving. Settle it once on entry.
    const away = flying || driving.active;
    if (charStart.flag && away && !wasAway) player.visual.update(0, { speed: 0, grounded: true, vy: 0 });
    wasAway = away;
    if (flying) {
      if (!paused) {
        fly.update(dt, input);
        driving.coast(dt);
      }
    } else if (driving.active) {
      if (!paused) for (let i = 0; i < stepsPerFrame; i++) driving.drive(dt, input);
      driving.drivingPrompt(input.enabled);
      driving.camera.update(dt, driving.car, input);
      // The walking camera keeps the same bearing, so the heading-up minimap and getting out are seamless.
      tpc.yaw = driving.camera.yaw;
    } else {
      if (spawnReady && !paused) for (let i = 0; i < stepsPerFrame; i++) player.update(dt, input, tpc.yaw);
      tpc.update(dt, player, input);
      driving.idle(dt, player, input.enabled);
    }
    if (driving.active) {
      player.position.copy(driving.position);
      player.velocity.copy(driving.velocity);
      player.heading = driving.car.heading;
    }
    input.endFrame();
    // V8.5: touch control set follows the controllable; held touch controls are released while menus are open.
    mobile?.update(driving.active && !flying ? 'drive' : 'walk', input.enabled, driving.canExit);

    // Contextual controls line. E belongs to the car when both the car and a shop are in reach.
    const context: ControlsContext = flying ? 'fly' : driving.active ? (driving.canExit ? 'drive-stopped' : 'drive')
      : driving.near ? 'walk-car' : placePanel.nearShop && !placeOpen ? 'walk-shop' : 'walk';
    controls.set(context);

    headlights.visible = driving.active;
    blob.visible = quality.shadowMap === 0 && !tpc.firstPerson && !driving.active;
    if (blob.visible) blob.position.set(player.position.x, world.collision.groundAt(player.position.x, player.position.z, player.position.y).h + 0.08, player.position.z);

    minimap.update(dt);
    gps.update();

    hudTimer += dt;
    if (hudTimer > 0.25 && started) {
      hudTimer = 0;
      const [lat, lon] = worldToGeo(player.position.x, player.position.z);
      const road = world.chunks.nearestRoadName(player.position.x, player.position.z);
      menu.setLocation(road ?? 'Kuching, Sarawak', lat, lon);
      menu.setChunkLoading(world.chunks.progress() < 0.999);
      placePanel.update();
      driving.refreshHud();
      if (driving.active) { /* the car reports its own obstacles */ }
      else if (player.blocked === 'water') menu.toast('The river blocks the way – use a bridge');
      else if (player.blocked === 'edge') menu.toast('Edge of the mapped area');
      else if (player.blocked === 'loading') menu.toast('Loading the next area…');
      if (menu.showStats) {
        const info = renderer.info;
        menu.setStats(
          `${fps.toFixed(0)} fps  res x${(renderer.getPixelRatio()).toFixed(2)}\n` +
          `calls ${info.render.calls}  tris ${(info.render.triangles / 1000).toFixed(0)}k\n` +
          `chunks ${world.chunks.loadedCount}  geo ${info.memory.geometries}  tex ${info.memory.textures}\n` +
          `build ${world.chunks.stats.lastBuildMs.toFixed(1)} ms (max ${world.chunks.stats.maxBuildMs.toFixed(1)})`,
        );
      }
    }

    renderer.info.reset();
    renderer.toneMappingExposure = world.exposure;
    // After a preset change the previous frame stays on screen until the new program variants have compiled.
    if (holdDraw || startHold) { /* compiling */ } else if (v5?.usesPipeline) v5.pipeline.render();
    else renderer.render(world.scene, camera);
    if (wantShot && !holdDraw) {
      // Same task as the render, so the drawing buffer is still valid.
      wantShot = false;
      canvas.toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `kuching3d-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
        a.click();
        window.setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      }, 'image/png');
    }

    fpsAcc += rawDt;
    fpsFrames++;
    if (fpsAcc >= 0.5) {
      fps = fpsFrames / fpsAcc;
      fpsAcc = 0;
      fpsFrames = 0;
    }
    if (started && !paused && adaptive.tick(rawDt)) applyResolution();
  }
  frame();

  // ?render=a|b starts in a V5 mode (after the spawn area has loaded); ?at=carpenter starts at the test section.
  const qs = new URLSearchParams(location.search);
  const wantMode = qs.get('render') as RenderMode | null;
  if (qs.get('at') === 'carpenter' || wantMode === 'a' || wantMode === 'b') {
    const wait = window.setInterval(() => {
      if (!spawnReady) return;
      window.clearInterval(wait);
      player.teleport(114.6, -0.9);
      player.heading = 1.03; tpc.yaw = -2.114; tpc.snap();
      if (wantMode === 'a' || wantMode === 'b') void v5Ready.then((c) => c.setMode(wantMode));
    }, 200);
  }

  // ?at=china starts at the Jalan China test section with its rendering on; ?view=x,y,z,yaw,pitch,fov reopens an
  // exact OP-mode camera (the "Copy link" button of the fly panel writes this).
  const viewQ = qs.get('view')?.split(',').map(Number);
  if (qs.get('at') === 'china' || (viewQ && viewQ.length === 6 && viewQ.every(Number.isFinite)) || wantMode === 'c') {
    const wait = window.setInterval(() => {
      if (!spawnReady || !started) return;
      window.clearInterval(wait);
      const mode = wantMode ?? (qs.get('at') === 'china' ? 'c' : undefined);
      if (viewQ && viewQ.length === 6) {
        const [x, y, z, yaw, pitch, fov] = viewQ, [lat, lon] = worldToGeo(x, z);
        const v: SavedView = { name: 'link', x, y, z, lat, lon, yaw, pitch, fov, mode };
        player.teleport(x, z);
        fly.applyView(v);
      } else {
        player.teleport(158.7, 14.5);
        player.heading = Math.PI - 0.588; tpc.yaw = -0.588; tpc.snap();
        if (mode && mode !== 'v4') void v5Ready.then((c) => c.setMode(mode));
      }
    }, 200);
  }

  // Debug / automated-test hook.
  (window as any).__k3d = {
    world, player, camera, tpc, input, renderer, minimap, gps, menu, placePanel, steps, v5, fly, refPanel, driving, mobile,
    geoToWorld, worldToGeo,
    /** Protected landmarks that reached a generic building generator (must stay empty). */
    landmarkGuard: guardViolations,
    get fps() { return fps; },
    get ready() { return spawnReady && renderReady; },
    controls,
    /** CHAR debug hook: current profile id, loaded files, swap(id). Only with ?char: without the flag there is no hook. */
    character: !charStart.flag ? undefined : {
      get id() { return swapper.currentId; },
      get loading() { return swapper.loading; },
      get fallback() { return swapper.usingFallback; },
      get loadedUrls() { return [...charRegistry.fetched]; },
      get live() { return charRegistry.liveCount; },
      get heights() { return tpc.heights; },
      get flag() { return charStart.flag; },
      swap: (id: string) => swapper.swap(id, { persist: charStart.flag }).then((r) => { syncCharacterButton(); return r; }),
      /** G2: a swap without the fallback to the default (the picker's), and the picker itself. */
      swapStrict: (id: string) => swapper.swap(id, { persist: true, strict: true }).then((r) => { syncCharacterButton(); return r; }),
      get lastError() { return swapper.lastError?.message ?? null; },
      openPicker: (mode: PickerMode) => openPicker(mode),
      get pickerOpen() { return pickerOpen; },
      get needsPick() { return charStart.needsPick; },
      get config() { return { shaderChecks: renderer.debug.checkShaderErrors, cfg: charCfg, cacheBudgetBytes: charRegistry.budgetBytes, mode: import.meta.env.MODE, dev: !!import.meta.env.DEV }; },
      warm: (id: string) => swapper.warm(id),
      get airWeight() { return (player.visual as unknown as { air?: number }).air ?? null; }, // N9 test hook
      hasWarm: (id: string) => swapper.hasWarm(id),
      get timings() { return charTimings; },
      get fetchCount() { return charRegistry.fetchCount; },
      get cachedBytes() { return charRegistry.cachedBytes; },
      get cachedCount() { return charRegistry.cachedCount; },
      bodyVisible: () => bodyVisible({ firstPerson: tpc.firstPerson, driving: driving.active, flying: fly.active }),
    },
    driveCar,
    /** N1-M6: stop the clock at a setting ('day', 'evening', 'night') or at an hour (0..24), or let it run ('auto'). */
    setTime: (t: TimeMode | number) => (typeof t === 'number' ? world.setTime('day', t) : world.setTime(t)),
    /** `now` (0..1): that much rain at once, instead of letting the weather build. */
    setRain: (r: RainMode, now?: number) => world.setRain(r, now),
    setSimulatedDt: (v: number) => (simulatedDt = v),
    setStepsPerFrame: (n: number) => (stepsPerFrame = Math.max(1, n | 0)),
    teleportGeo: (lat: number, lon: number) => {
      const [x, z] = geoToWorld(lat, lon);
      player.teleport(x, z);
      tpc.snap();
    },
  };
}

boot();
