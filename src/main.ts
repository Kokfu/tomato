import { guardViolations } from './world/landmarks/protect.ts';
import * as THREE from 'three';
import { WorldManager } from './world/WorldManager.ts';
import { worldToGeo, geoToWorld } from './world/GeoProjection.ts';
import { registerLandmarks } from './world/landmarks/index.ts';
import { Input } from './player/Input.ts';
import { PlayerController } from './player/PlayerController.ts';
import { ProceduralHumanoid } from './player/CharacterAnimator.ts';
import { loadCharacter } from './player/CharacterLoader.ts';
import { ThirdPersonCamera } from './player/ThirdPersonCamera.ts';
import { GameMenu } from './ui/GameMenu.ts';
import { Minimap } from './ui/Minimap.ts';
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
    renderer.shadowMap.enabled = quality.shadowMap > 0;
    v5?.setSize(w, h, renderer.getPixelRatio());
  };

  const input = new Input(canvas);
  let paused = false;
  let started = false;
  let mapOpen = false;
  let placeOpen = false;
  const steps = new Footsteps();
  const syncInput = () => {
    input.enabled = started && !paused && !mapOpen && !placeOpen;
    if (!input.enabled) input.releasePointer();
  };

  let world: WorldManager;
  // V5 rendering experiment (A/B comparison of the Carpenter Street section); created once the world is loaded.
  let v5: V5Controller | null = null;
  const menu = new GameMenu(
    {
      onStart: () => {
        started = true;
        steps.unlock();
        syncInput();
      },
      onTimeOfDay: (t) => {
        const m = v5?.mode ?? 'v4';
        // The V5 lighting is defined for daytime only: time-of-day changes go through V4 lighting first.
        if (v5?.usesPipeline) v5.pipeline.disable();
        world.setTimeOfDay(t);
        renderer.toneMappingExposure = world.exposure;
        if (m !== 'v4' && t === 'day') v5!.pipeline.enable();
      },
      onSound: (on) => { steps.enabled = on; v5?.ambience.setEnabled(on); if (on && v5 && v5.mode !== 'v4') v5.ambience.start(); },
      onResume: () => {
        paused = false;
        syncInput();
      },
      onPause: () => {
        paused = true;
        syncInput();
      },
      onReset: () => resetLocation(),
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
  );

  try {
    world = await WorldManager.load(quality);
  } catch (e) {
    console.error(e);
    menu.showError('Could not load map data. Run "npm run data:build" and reload.');
    return;
  }
  registerLandmarks(world.landmarks);
  world.chunks.renderer = renderer;
  // The V5 code (generators, materials, post-processing) is a separate chunk: it does not add to the first download.
  const v5Ready = import('./v5/controller.ts').then((m) => {
    v5 = new m.V5Controller(world, renderer, camera, qualityName);
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
  const spawn = world.manifest.spawn;
  player.position.set(spawn.x, world.height.sample(spawn.x, spawn.z), spawn.z);
  // Face the river (north) at spawn; the camera sits behind, to the south.
  player.heading = Math.PI;
  tpc.yaw = 0;

  // V8: one drivable car on the real road network (see src/vehicle). While it is driven the character rides
  // along (hidden), so the map, the location read-out and the streaming keep following `player.position`.
  const driving = new Driving(world, camera, { toast: (t) => menu.toast(t, 2) });
  world.scene.add(driving.model.root);
  /** Teleports and resets act on the walking character: the car is left where it stands. */
  const leaveCar = () => {
    if (!driving.active) return;
    driving.exit(player, true);
    player.visual.root.visible = !tpc.firstPerson;
  };
  const toggleCar = () => {
    if (driving.active) {
      if (driving.exit(player)) {
        player.visual.root.visible = !tpc.firstPerson;
        tpc.yaw = driving.camera.yaw;
        tpc.snap();
      }
    } else if (driving.enter(player)) {
      if (tpc.firstPerson) tpc.firstPerson = false;
    }
  };

  const resetLocation = () => {
    leaveCar();
    player.teleport(spawn.x, spawn.z);
    player.heading = Math.PI;
    tpc.yaw = 0;
    tpc.snap();
  };
  const toggleView = () => {
    if (driving.active) return; // the driving camera is third-person only
    tpc.firstPerson = !tpc.firstPerson;
    player.visual.root.visible = !tpc.firstPerson;
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
        player.visual.root.visible = !driving.active;
        driving.hidePrompt();
      } else {
        // The character never moved: walking resumes from its last safe position, with collision and gravity.
        player.visual.root.visible = !tpc.firstPerson && !driving.active;
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
    else if (!driving.active) placePanel.toggle();
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
  if (isTouchDevice()) new MobileControls(input, canvas);

  window.addEventListener('resize', applyResolution);
  new ResizeObserver(applyResolution).observe(document.documentElement);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && started && !paused) menu.pause();
  });

  // Swap in the GLB character when one is available; the procedural humanoid is the fallback.
  loadCharacter()
    .then((visual) => {
      if (visual) {
        player.setVisual(visual);
        visual.root.visible = !tpc.firstPerson;
      }
    })
    .catch((e) => console.warn('Character model unavailable, using procedural humanoid:', e));

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
  let stepsPerFrame = 1; // test hook: run the simulation faster than real time

  function frame(): void {
    requestAnimationFrame(frame);
    const rawDt = clock.getDelta();
    const dt = simulatedDt > 0 ? simulatedDt : Math.min(rawDt, 0.1);

    // The world streams around the walking character, or around the free camera in OP fly mode.
    const flying = fly.active;
    const focus = flying ? fly.focus : player.position;
    world.update(dt, focus, flying ? fly.velocity : driving.active ? driving.velocity : player.velocity, camera);
    v5?.update(dt, rawDt, focus.x, focus.z);

    if (!spawnReady) {
      // Never let the player move before ground + collision at the spawn point exist.
      const p = world.chunks.progress();
      spawnReady = world.chunks.isReady(spawn.x, spawn.z) && p > 0.6;
      if (spawnReady) resetLocation();
      menu.setLoading(spawnReady ? 1 : p * 0.95, spawnReady ? 'Ready' : `Loading Kuching Waterfront… ${Math.round(p * 100)}%`, spawnReady);
    }

    input.poll();
    if (spawnReady) driving.tryPlace();
    if (flying) {
      if (!paused) {
        fly.update(dt, input);
        driving.coast(dt);
      }
    } else if (driving.active) {
      if (!paused) for (let i = 0; i < stepsPerFrame; i++) driving.drive(dt, input);
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

    blob.visible = quality.shadowMap === 0 && !tpc.firstPerson && !driving.active;
    if (blob.visible) blob.position.set(player.position.x, world.collision.groundAt(player.position.x, player.position.z, player.position.y).h + 0.08, player.position.z);

    minimap.update(dt);

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
    if (v5?.usesPipeline) v5.pipeline.render();
    else renderer.render(world.scene, camera);
    if (wantShot) {
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
    world, player, camera, tpc, input, renderer, minimap, menu, placePanel, steps, v5, fly, refPanel, driving,
    geoToWorld, worldToGeo,
    /** Protected landmarks that reached a generic building generator (must stay empty). */
    landmarkGuard: guardViolations,
    get fps() { return fps; },
    get ready() { return spawnReady; },
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
