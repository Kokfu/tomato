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
  const adaptive = new AdaptiveResolution();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.3, 2000);
  const applyResolution = () => {
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.maxPixelRatio) * adaptive.scale);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.shadowMap.enabled = quality.shadowMap > 0;
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
  const menu = new GameMenu(
    {
      onStart: () => {
        started = true;
        steps.unlock();
        syncInput();
      },
      onTimeOfDay: (t) => {
        world.setTimeOfDay(t);
        renderer.toneMappingExposure = world.exposure;
      },
      onSound: (on) => (steps.enabled = on),
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
        world.applyQuality(quality);
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

  const resetLocation = () => {
    player.teleport(spawn.x, spawn.z);
    player.heading = Math.PI;
    tpc.yaw = 0;
    tpc.snap();
  };
  const toggleView = () => {
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
  input.on('interact', () => {
    if (started && !paused && !mapOpen) placePanel.toggle();
  });

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
    if (!document.pointerLockElement && input.enabled && !isTouchDevice() && pointerWasLocked) menu.pause();
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

    world.update(dt, player.position, player.velocity, camera);

    if (!spawnReady) {
      // Never let the player move before ground + collision at the spawn point exist.
      const p = world.chunks.progress();
      spawnReady = world.chunks.isReady(spawn.x, spawn.z) && p > 0.6;
      if (spawnReady) resetLocation();
      menu.setLoading(spawnReady ? 1 : p * 0.95, spawnReady ? 'Ready' : `Loading Kuching Waterfront… ${Math.round(p * 100)}%`, spawnReady);
    }

    input.poll();
    if (spawnReady && !paused) for (let i = 0; i < stepsPerFrame; i++) player.update(dt, input, tpc.yaw);
    tpc.update(dt, player, input);
    input.endFrame();

    blob.visible = quality.shadowMap === 0 && !tpc.firstPerson;
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
      if (player.blocked === 'water') menu.toast('The river blocks the way – use a bridge');
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

    renderer.render(world.scene, camera);

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

  // Debug / automated-test hook.
  (window as any).__k3d = {
    world, player, camera, tpc, input, renderer, minimap, menu, placePanel, steps,
    geoToWorld, worldToGeo,
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
