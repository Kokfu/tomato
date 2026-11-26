// N1-M6 part B: the living city. Ambient traffic (src/life/traffic.ts) and walkers (src/life/walkers.ts) round the
// player, drawn instanced (src/life/LifeRender.ts). Started after the game is ready, so start-up is not delayed; the
// drive graph is the one the GPS already uses, the walker model the character that is already shipped.
// Flag `life` (on by default; `?life=0` = no traffic and no walkers, the N1-M6a city).
import * as THREE from 'three';
import type { WorldManager } from '../world/WorldManager.ts';
import type { Quality, QualityName } from '../ui/GraphicsSettings.ts';
import { loadRouteGraph } from '../ui/Router.ts';
import { CHUNK_SIZE, DATA_ROOT, QUANT } from '../world/config.ts';
import { FURN } from '../world/types.ts';
import { ENV } from '../world/env.ts';
import { nearestDrivable } from '../vehicle/RoadQuery.ts';
import { Traffic, rng, SIZE } from './traffic.ts';
import type { FillOptions, Obstacle } from './traffic.ts';
import { Walkers } from './walkers.ts';
import type { WalkOptions } from './walkers.ts';
import { LifeRender, PAINTS, bakeWalker } from './LifeRender.ts';
import type { ParkedDraw } from './LifeRender.ts';

interface Budget {
  vehicles: number; walkers: number;
  /** Share of hatchback, saloon, SUV, kapcai, taxi, pickup. A kind with 0 is not built (one draw call less). */
  kinds: readonly number[];
  /** N1-M7: parked vehicles drawn (the nearest ones), in the same meshes. */
  parked: number;
  /** Vehicles appear between these distances and are removed beyond `far`. */
  vMin: number; vMax: number; vFar: number;
  wMin: number; wMax: number; wFar: number;
  /** Vertex clustering of the walker model, metres (0 = the model as it is). */
  cell: number;
}

/** What each preset can afford. Low is the phone: two vehicle kinds, a coarse walker, a short ring. */
export const LIFE_BUDGET: Record<QualityName, Budget> = {
  low: { vehicles: 8, walkers: 9, kinds: [3, 0, 0, 2, 0, 0], parked: 6, vMin: 45, vMax: 130, vFar: 175, wMin: 12, wMax: 55, wFar: 72, cell: 0.05 },
  medium: { vehicles: 18, walkers: 22, kinds: [6, 6, 4, 8, 1, 3], parked: 12, vMin: 55, vMax: 190, vFar: 245, wMin: 14, wMax: 75, wFar: 95, cell: 0.03 },
  high: { vehicles: 26, walkers: 34, kinds: [6, 6, 4, 8, 1, 3], parked: 16, vMin: 55, vMax: 230, vFar: 290, wMin: 14, wMax: 90, wFar: 112, cell: 0 },
};

export interface LifeHost {
  world: WorldManager;
  baseUrl: string;
  /** Upload the textures and compile the programs of `o` for the render path in use; resolves when they are ready. */
  prepare(o: THREE.Object3D): Promise<void>;
}

/** What the traffic gives way to besides itself. */
export interface PlayerState {
  x: number; z: number; vx: number; vz: number; driving: boolean;
  /** The player's car, wherever it stands (null until it has been placed). */
  car: { x: number; z: number; heading: number } | null;
}

const WALLS = 3;

export class Life {
  traffic: Traffic | null = null;
  walkers: Walkers | null = null;
  render: LifeRender | null = null;
  private host: LifeHost;
  private quality: QualityName;
  private token = 0;
  /** Seconds left of filling the ring from close by (the first fill, and after the player was moved somewhere else). */
  private fresh = 4;
  private last = new THREE.Vector2(Infinity, Infinity);
  private obstacles: Obstacle[] = [];
  private gltf: Promise<{ scene: THREE.Object3D; animations: THREE.AnimationClip[] }> | null = null;
  private walled = 0;
  /** Seconds not simulated yet, seconds since the simulation last ran, and a frame counter. */
  private owed = 0;
  private age = 0;
  private tick = 0;
  /**
   * Measuring only (tools/dev/life-probe.ts --ab): while true nothing is simulated or drawn, as with `?life=0`, so the
   * cost of the traffic and the walkers can be read from one page by switching it to and fro.
   */
  suspended = false;
  /** Milliseconds of one update: a running mean and a slowly fading maximum (debug hook, life-probe). */
  cost = 0;
  costMax = 0;
  /** Frames left of drawing the vehicle meshes once, out of sight (LifeRender.warm). */
  private warm = 0;
  /** N1-M7 (set by src/play/Play.ts each frame): the parked vehicles to draw, and what else stands in the traffic's way. */
  parked: readonly ParkedDraw[] = [];
  extraObstacles: readonly Obstacle[] = [];
  /** N1-M7: no parked vehicles are drawn (`?m7=0`). */
  noParked = false;

  constructor(host: LifeHost, quality: Quality) { this.host = host; this.quality = quality.name; }

  /** What the preset can afford. With `noParked` (`?m7=0`) it is the N1-M6 city: no parked vehicles, no taxi or pickup in the traffic. */
  get budget(): Budget {
    if (!this.noParked) return LIFE_BUDGET[this.quality];
    if (!this.m6) {
      const o = {} as Record<QualityName, Budget>;
      for (const q of Object.keys(LIFE_BUDGET) as QualityName[]) o[q] = { ...LIFE_BUDGET[q], parked: 0, kinds: LIFE_BUDGET[q].kinds.map((w, i) => (i < 4 ? w : 0)) };
      this.m6 = o;
    }
    return this.m6[this.quality];
  }
  private m6: Record<QualityName, Budget> | null = null;
  /** True once vehicles can be drawn. */
  get active(): boolean { return !!this.render && !!this.traffic; }

  /** Load the drive graph, build the meshes, compile their programs; then the walker model. Safe to call again. */
  async start(): Promise<void> {
    const token = ++this.token, { world } = this.host, c = world.collision;
    try {
      const graph = await loadRouteGraph(`${this.host.baseUrl}${DATA_ROOT}/drive-graph.json`);
      if (token !== this.token) return;
      const dataAt = (cx: number, cz: number) => world.chunks.dataAt(cx, cz);
      this.traffic ??= new Traffic(graph, {
        ground: (x, z, y) => c.groundAt(x, z, y).h,
        loaded: (x, z) => c.isLoaded(x, z),
        width: (x, z) => nearestDrivable(dataAt, x, z, 0, 12)?.width ?? null,
        // Jalan China is the hand-built street where the player's car waits in the only free lane between parked cars
        closed: (name) => name === 'Jalan China',
        signal: (x, z) => {
          // (no answer until every chunk within reach is loaded: a "no" would be remembered for the whole session)
          let known = true;
          for (let cz = Math.floor((z - 18) / CHUNK_SIZE); cz <= Math.floor((z + 18) / CHUNK_SIZE); cz++)
            for (let cx = Math.floor((x - 18) / CHUNK_SIZE); cx <= Math.floor((x + 18) / CHUNK_SIZE); cx++) {
              const d = dataAt(cx, cz);
              if (!d) { if (world.manifest.chunks.includes(`${cx}_${cz}`)) known = false; continue; }
              const f = d.furn;
              if (!f) continue;
              for (let i = 0; i < f.length; i += 5) if (f[i] === FURN.signal && Math.hypot(cx * CHUNK_SIZE + f[i + 1] / QUANT - x, cz * CHUNK_SIZE + f[i + 2] / QUANT - z) < 18) return true;
            }
          return known ? false : null;
        },
      });
      this.walkers ??= new Walkers({
        chunk: dataAt,
        ground: (x, z, y) => c.groundAt(x, z, y).h,
        clear: (x, z, y) => {
          if (!c.isLoaded(x, z) || c.inWater(x, z) || c.insideBuilding(x, z, y)) return false;
          const [rx, rz] = c.resolve(x, z, 0.32, y);
          return Math.abs(rx - x) + Math.abs(rz - z) < 0.02;
        },
      }, rng(20261127));
      const b = this.budget, render = new LifeRender({ vehicles: b.vehicles, walkers: b.walkers, kinds: b.kinds, shadows: this.quality !== 'low', parked: b.parked }, world.materials.pools);
      this.traffic.pitch = this.quality !== 'low';
      // (whatever the new preset does not draw must not stay in the simulation, unseen)
      this.traffic.trim(b.kinds, b.vehicles);
      this.walkers.trim(b.walkers);
      try { await this.host.prepare(render.group); } catch (e) { render.dispose(); throw e; }
      if (token !== this.token) { render.dispose(); return; }
      this.render = render;
      world.scene.add(render.group);
      this.fresh = 4; this.warm = this.traffic.vehicles.length ? 0 : 3;
      // the walkers: load the model once, bake its walk cycle a frame at a time, compile, show
      this.gltf ??= import('three/addons/loaders/GLTFLoader.js').then(({ GLTFLoader }) => new GLTFLoader().loadAsync(`${this.host.baseUrl}models/characters/casual-character.glb`));
      this.gltf.catch(() => { this.gltf = null; }); // a failed download is tried again at the next start
      const gltf = await this.gltf;
      if (token !== this.token) return;
      const bake = await bakeWalker(gltf, b.cell, () => new Promise((r) => window.setTimeout(r, 30)));
      if (token !== this.token) { bake.geometry.dispose(); bake.texture.dispose(); return; }
      const mesh = render.setWalkers(bake);
      await this.host.prepare(mesh);
      mesh.visible = true;
    } catch (e) {
      console.warn('Ambient traffic and walkers unavailable:', e);
    }
  }

  /** A new preset: other meshes, another ring. The simulation carries on. */
  setQuality(q: Quality): void {
    if (q.name === this.quality) return;
    this.quality = q.name;
    if (!this.traffic) return; // not started (or switched off)
    this.stopRender();
    void this.start();
  }

  private stopRender(): void {
    this.token++;
    this.render?.dispose();
    this.render = null;
    this.warm = 0;
    this.clearWalls();
  }

  private clearWalls(): void {
    for (let i = 0; i < this.walled; i++) this.host.world.collision.setDynamicWall(`life${i}`, null);
    this.walled = 0;
  }

  /**
   * One frame. `running` is false behind the start screen and the pause menu (everything stands still but stays drawn).
   * Night and `rain` (0..1) thin the streets out.
   */
  update(dt: number, fx: number, fz: number, player: PlayerState, running: boolean, rain: number): void {
    const t = this.traffic, w = this.walkers, r = this.render;
    if (!t || !w || !r) return;
    r.group.visible = !this.suspended;
    if (this.suspended) return;
    const t0 = performance.now();
    if (this.warm > 0 && !t.vehicles.length) { this.warm--; r.warm(fx, this.host.world.collision.groundAt(fx, fz, 1e6).h, fz); return; }
    // The Low preset (the phone) simulates every second frame and lets everything glide on in between.
    this.owed += running ? Math.min(dt, 0.1) : 0;
    const glide = running && this.quality === 'low' && (this.tick++ & 1) === 1;
    if (glide) this.age = this.owed;
    else if (running) {
      dt = Math.min(this.owed, 0.2);
      this.owed = 0; this.age = 0;
      const night = ENV.uNight.value;
      const b = this.budget, c = this.host.world.collision;
      if (Math.hypot(fx - this.last.x, fz - this.last.y) > 60) this.fresh = 4; // moved somewhere else: fill from close by
      this.fresh = Math.max(0, this.fresh - dt);
      this.last.set(fx, fz);
      const fill: FillOptions = { want: Math.round(b.vehicles * (1 - 0.45 * night)), rMin: b.vMin, rMax: b.vMax, far: b.vFar, kinds: b.kinds, tints: PAINTS.length };
      const walk: WalkOptions = { want: Math.round(b.walkers * (1 - 0.5 * night) * (1 - 0.6 * rain)), rMin: b.wMin, rMax: b.wMax, far: b.wFar };
      // what the traffic brakes for: the player (the car as two circles) and every walker
      const obs = this.obstacles;
      let n = 0;
      const put = (x: number, z: number, rad: number, vx: number, vz: number) => {
        const o = obs[n] ?? (obs[n] = { x: 0, z: 0, r: 0, vx: 0, vz: 0 });
        o.x = x; o.z = z; o.r = rad; o.vx = vx; o.vz = vz; n++;
      };
      if (!player.driving) put(player.x, player.z, 0.5, player.vx, player.vz);
      if (player.car) {
        const car = player.car, hx = Math.sin(car.heading), hz = Math.cos(car.heading), vx = player.driving ? player.vx : 0, vz = player.driving ? player.vz : 0;
        put(car.x + hx, car.z + hz, 1.0, vx, vz);
        put(car.x - hx, car.z - hz, 1.0, vx, vz);
      }
      for (const p of w.list) put(p.x, p.z, 0.3, Math.sin(p.heading) * p.v, Math.cos(p.heading) * p.v);
      for (const o of this.extraObstacles) put(o.x, o.z, o.r, 0, 0);
      obs.length = n;
      t.update(dt, fx, fz, fill, obs, this.fresh > 0 && t.vehicles.length < fill.want * 0.7);
      w.update(dt, fx, fz, walk, player.x, player.z, this.fresh > 0 && w.list.length < walk.want * 0.7);
      // the nearest vehicles block the walking player (and the walking camera), like the parked car does
      let k = 0;
      if (!player.driving) for (const v of t.vehicles) {
        if (k >= WALLS) break;
        if (Math.abs(v.x - player.x) > 9 || Math.abs(v.z - player.z) > 9) continue;
        const s = SIZE[v.kind], hx = Math.sin(v.heading), hz = Math.cos(v.heading), a = s.half, e = s.hw;
        c.setDynamicWall(`life${k++}`, [
          v.x + hx * a + hz * e, v.z + hz * a - hx * e, v.x + hx * a - hz * e, v.z + hz * a + hx * e,
          v.x - hx * a - hz * e, v.z - hz * a + hx * e, v.x - hx * a + hz * e, v.z - hz * a - hx * e,
        ], v.y + 1.3);
      }
      for (let i = k; i < this.walled; i++) c.setDynamicWall(`life${i}`, null);
      this.walled = k;
    }
    r.sync(t.vehicles, w.list, this.age, this.parked);
    const ms = performance.now() - t0;
    this.cost += (ms - this.cost) * 0.02; this.costMax = Math.max(this.costMax * 0.999, ms);
  }

  /** Numbers for the debug hook and the tests. */
  get stats(): { vehicles: number; walkers: number; walkerTriangles: number } {
    return { vehicles: this.traffic?.vehicles.length ?? 0, walkers: this.walkers?.list.length ?? 0, walkerTriangles: this.render?.walkerTriangles ?? 0 };
  }
}
