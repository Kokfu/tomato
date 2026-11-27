import { patchHeroData } from './district/indiaStreet.ts';
import * as THREE from 'three';
import { CHUNK_SIZE, QUANT, DATA_ROOT, chunkKey } from './config.ts';
import { withDataVersion } from '../version.ts';
import type { ChunkData, Manifest } from './types.ts';
import type { HeightMap } from './HeightMap.ts';
import type { CollisionWorld } from './CollisionWorld.ts';
import { Materials, GeoBuf } from './Materials.ts';
import type { LandmarkManager } from './LandmarkManager.ts';
import type { Quality } from '../ui/GraphicsSettings.ts';
import { buildTerrain } from './TerrainBuilder.ts';
import { buildRoads, buildShore } from './RoadBuilder.ts';
import { buildBuildings } from './BuildingBuilder.ts';
import { buildWater } from './WaterBuilder.ts';
import { buildVegetation } from './VegetationBuilder.ts';
import { buildFurniture } from './StreetFurniture.ts';
import { PlaceIndex, buildChunkLabels } from './places/PlaceIndex.ts';
import { buildDressing } from './district/Dressing.ts';
import { ROAD_WIDTHS } from './district/mainBazaar.ts';

export type Detail = 'high' | 'low';
export interface BuildContext {
  height: HeightMap;
  collision: CollisionWorld;
  mats: Materials;
  landmarks: LandmarkManager;
  places: PlaceIndex;
  quality: Quality;
  detail: Detail;
}

interface Chunk {
  cx: number;
  cz: number;
  key: string;
  state: 'fetching' | 'loaded' | 'error';
  data?: ChunkData;
  group?: THREE.Group;
  /** Near-detail prop mesh (India Street stalls, City Mosque graves) hidden beyond its sub-chunk radius. */
  nearMesh?: THREE.Mesh;
  nearSpec?: { x: number; z: number; maxDist: number };
  /** Detail level of the current mesh, if built. */
  built?: Detail;
  /** High-detail chunk whose decorations (trees, furniture, signs) are still to be added. */
  decor?: boolean;
}

/** A chunk mesh (or a chunk's decorations) being built over one or more frames (V8.2, see `runJobs`). */
interface Job {
  c: Chunk;
  kind: 'build' | 'decor';
  detail: Detail;
  it: Generator<void, void>;
  /** Stage the build is in (profiling), main-thread time so far, the most of it spent in one frame, frames used. */
  stage: string;
  ms: number;
  maxFrameMs: number;
  frames: number;
  frameMs: number;
  lastFrame: number;
  prof: Record<string, number>;
}

/** A finished build, as recorded in `ChunkManager.jobLog` (profiling aid). */
export interface JobRecord { kind: 'build' | 'decor'; key: string; detail: Detail; ms: number; maxFrameMs: number; frames: number; prof: Record<string, number> }

/**
 * Streams geographic chunks around the player: fetches chunk files, registers collision data,
 * builds meshes at two detail levels, and disposes everything that falls out of range.
 */
export class ChunkManager {
  readonly group = new THREE.Group();
  /** Fired whenever a chunk's data becomes available / is dropped (used by the minimap). */
  onChunkData: ((data: ChunkData) => void) | null = null;
  onChunkRemoved: ((cx: number, cz: number) => void) | null = null;
  quality: Quality;
  /** lastBuildMs: main-thread time of the last finished build (all its frames); maxBuildMs: the most build work done in one frame. */
  stats = { fetched: 0, built: 0, disposed: 0, bytes: 0, lastBuildMs: 0, maxBuildMs: 0 };
  /** Cumulative milliseconds spent in each stage of chunk mesh building (profiling aid). */
  buildProfile: Record<string, number> = {};
  /** When set, new chunk meshes are uploaded to the GPU as they are built instead of when first seen. */
  renderer: THREE.WebGLRenderer | null = null;

  private chunks = new Map<string, Chunk>();
  private available: Set<string>;
  private manifest: Manifest;
  private ctxBase: Omit<BuildContext, 'detail' | 'quality'>;
  private inflight = 0;
  private centre = { cx: 1e9, cz: 1e9 };
  private want = new Map<string, Detail>();
  private order: string[] = [];
  private prefetchKeys: string[] = [];
  /** Chunks in the block ahead of a moving player: downloaded early and not unloaded while still ahead. */
  private ahead = new Set<string>();
  private base: string;
  private frame = 0;
  private failures = new Map<string, number>();
  private warming: { group: THREE.Group; frame: number }[] = [];
  readonly places: PlaceIndex;
  /** The chunk mesh under construction, if any: one at a time, nearest first (see runJobs). */
  private job: Job | null = null;
  /** Main-thread milliseconds chunk building may take per frame (set from the speed in update). */
  private frameBudgetMs = 8;
  /** Profiling aid (tools/dev/drive-bench.ts): when an array, every finished build is appended to it. */
  jobLog: JobRecord[] | null = null;
  /** Set by the game while the loading screen or start menu is up: frame smoothness does not matter then, load time does. */
  loadingBoost = false;
  /**
   * N1-M3b: set while the game draws nothing (behind the loading screen). Built chunks then keep waiting for the
   * frame that uploads their buffers, instead of being marked as drawn.
   */
  holdWarm = false;
  /** N1-M3b: called with each finished chunk mesh and each batch of decorations (shader preparation while loading). */
  onBuilt: ((o: THREE.Object3D) => void) | null = null;

  constructor(manifest: Manifest, height: HeightMap, collision: CollisionWorld, mats: Materials, landmarks: LandmarkManager, places: PlaceIndex, quality: Quality) {
    this.manifest = manifest;
    this.available = new Set(manifest.chunks);
    this.ctxBase = { height, collision, mats, landmarks, places };
    this.places = places;
    // Local place corrections change signs: rebuild the affected chunk mesh.
    places.onChanged = (key) => {
      const c = this.chunks.get(key);
      if (c?.built === 'high') this.disposeMesh(c);
    };
    this.quality = quality;
    this.base = `${import.meta.env.BASE_URL}${DATA_ROOT}/chunks/`;
    this.group.name = 'chunks';
  }

  /** True when map data exists for this position (inside the prepared area). */
  hasData(x: number, z: number): boolean {
    return this.available.has(chunkKey(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)));
  }

  /** True when the chunk containing (x, z) has collision data and a mesh. */
  isReady(x: number, z: number): boolean {
    const c = this.chunks.get(chunkKey(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)));
    return !!c && !!c.built;
  }

  get loadedCount(): number {
    let n = 0;
    for (const c of this.chunks.values()) if (c.built) n++;
    return n;
  }

  /** Loaded chunk data (for minimap drawing and queries). */
  dataAt(cx: number, cz: number): ChunkData | undefined {
    return this.chunks.get(chunkKey(cx, cz))?.data;
  }

  /** Fraction (0..1) of wanted chunks that are built. */
  progress(): number {
    if (!this.want.size) return 0;
    let done = 0;
    for (const [k, d] of this.want) {
      const c = this.chunks.get(k);
      if (c && ((c.built === d && !c.decor) || c.state === 'error')) done++;
    }
    return done / this.want.size;
  }

  setQuality(q: Quality): void {
    this.quality = q;
    this.job = null;
    // Rebuild everything at the new settings (data stays cached).
    for (const c of this.chunks.values()) this.disposeMesh(c);
    this.centre = { cx: 1e9, cz: 1e9 };
  }

  /** Drop the meshes of the given chunks so they are rebuilt (data stays loaded). Used by the V5 A/B switch. */
  invalidate(keys: string[]): void {
    for (const k of keys) { const c = this.chunks.get(k); if (c) this.disposeMesh(c); }
  }

  /** Name of the nearest named road within `maxDist` metres. */
  nearestRoadName(x: number, z: number, maxDist = 40): string | null {
    const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
    let best = maxDist, name: string | null = null;
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const d = this.dataAt(cx + dx, cz + dz);
        if (!d) continue;
        const lx = (x - d.cx * CHUNK_SIZE) * QUANT, lz = (z - d.cz * CHUNK_SIZE) * QUANT;
        for (const r of d.roads) {
          if (r.n === undefined) continue;
          for (let i = 2; i < r.p.length; i += 2) {
            const ax = r.p[i - 2], az = r.p[i - 1], vx = r.p[i] - ax, vz = r.p[i + 1] - az;
            const l2 = vx * vx + vz * vz;
            let t = l2 > 0 ? ((lx - ax) * vx + (lz - az) * vz) / l2 : 0;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            const dist = Math.hypot(ax + vx * t - lx, az + vz * t - lz) / QUANT;
            if (dist < best) { best = dist; name = d.names[r.n]; }
          }
        }
      }
    return name;
  }

  /**
   * Per-frame update. (x, z) is the player position, (vx, vz) its velocity (used to prefetch
   * chunks in the direction of travel).
   */
  update(x: number, z: number, vx = 0, vz = 0): void {
    // Meshes built earlier have now been drawn once (buffers uploaded): restore frustum culling.
    this.frame++;
    if (this.holdWarm) for (const w of this.warming) w.frame = this.frame;
    while (this.warming.length && this.warming[0].frame < this.frame - 1) {
      this.warming.shift()!.group.traverse((o) => {
        o.frustumCulled = true;
      });
    }
    for (const c of this.chunks.values()) {
      if (c.nearMesh && c.nearSpec && !this.holdWarm) {
        c.nearMesh.visible = Math.hypot(x - c.nearSpec.x, z - c.nearSpec.z) <= c.nearSpec.maxDist;
      }
    }
    const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
    // Prefetch (download only) the chunks the player is heading toward.
    this.prefetchKeys = [];
    this.ahead.clear();
    const sp = Math.hypot(vx, vz);
    if (sp > 0.5) {
      // Look further ahead at vehicle speeds so chunks are downloaded before they are needed.
      const reach = (this.quality.lowRadius + 1 + Math.min(2, sp / 14)) * CHUNK_SIZE;
      // At flying speeds (OP mode) a second block further ahead is downloaded too: about 1.5 s of travel.
      for (const ahead of sp > 40 ? [reach, reach + sp * 1.5] : [reach]) {
        const px = Math.floor((x + (vx / sp) * ahead) / CHUNK_SIZE), pz = Math.floor((z + (vz / sp) * ahead) / CHUNK_SIZE);
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          const k = chunkKey(px + dx, pz + dz);
          if (!this.available.has(k)) continue;
          this.ahead.add(k);
          if (!this.chunks.has(k) && !this.prefetchKeys.includes(k)) this.prefetchKeys.push(k);
        }
      }
    }
    // After the look-ahead, so that crossing a chunk border does not throw away the chunks just downloaded
    // ahead of a car (their road and collision data stay in memory until the car turns away from them).
    if (cx !== this.centre.cx || cz !== this.centre.cz) {
      this.centre = { cx, cz };
      this.recomputeWanted();
    }
    // Chunk building gets a time budget per frame instead of a number of whole chunks (V8.2): a heavy old-town chunk
    // took 50-80 ms in one frame. Least while driving (smooth frames matter most and downloads run well ahead), most
    // at OP-mode flying speeds, where whole rings of chunks must keep up with the camera.
    this.frameBudgetMs = this.loadingBoost ? 40 : sp > 60 ? 14 : sp > 9 ? 6 : 8;
    this.pump();
  }

  private recomputeWanted(): void {
    const { cx, cz } = this.centre;
    const R = this.quality.lowRadius, H = this.quality.highRadius;
    this.want.clear();
    const list: [string, number][] = [];
    for (let dz = -R; dz <= R; dz++)
      for (let dx = -R; dx <= R; dx++) {
        const d = Math.hypot(dx, dz);
        if (d > R + 0.5) continue;
        const k = chunkKey(cx + dx, cz + dz);
        if (!this.available.has(k)) continue;
        // Hysteresis: a chunk already built at high detail keeps it until it is two rings out, so
        // crossing a chunk border does not trigger a burst of demote-and-rebuild work behind the player.
        const ring = Math.max(Math.abs(dx), Math.abs(dz));
        this.want.set(k, ring <= H || (ring === H + 1 && this.chunks.get(k)?.built === 'high') ? 'high' : 'low');
        list.push([k, d]);
      }
    list.sort((a, b) => a[1] - b[1]);
    this.order = list.map((l) => l[0]);
    // Unload chunks well outside the wanted radius (hysteresis of one chunk).
    for (const c of [...this.chunks.values()]) {
      const d = Math.max(Math.abs(c.cx - cx), Math.abs(c.cz - cz));
      if (d > R + 1) { if (!this.ahead.has(c.key)) this.unload(c); }
      else if (!this.want.has(c.key) && c.built === 'high') this.disposeMesh(c);
    }
  }

  private pump(): void {
    // 1. Start downloads (nearest first).
    for (const k of [...this.order, ...this.prefetchKeys]) {
      if (this.inflight >= 6) break;
      if (!this.chunks.has(k)) this.fetchChunk(k);
    }
    // 2. Build chunk meshes within this frame's time budget.
    this.runJobs(performance.now() + this.frameBudgetMs);
  }

  /**
   * Chunk meshes are built one at a time, nearest first (decorations of built chunks before new chunks), as
   * generators that yield between roads, buildings, land-use polygons and landmarks. Steps run until the frame's
   * budget is spent (at least one step a frame), so a heavy chunk is spread over a few frames instead of stalling
   * one. The chunk joins the scene only when its build is complete, and a chunk changing detail level keeps its old
   * mesh until then: no half-built chunk and no hole is ever drawn, and `isReady` (ground and roads drawn) never
   * goes false during a rebuild. Collision does not wait for any of this: it is registered when the data arrives.
   */
  private runJobs(deadline: number): void {
    do {
      const j = this.job ?? (this.job = this.nextJob());
      if (!j) return;
      // Abandon a build the chunk no longer wants (unloaded, or wanted at another detail level now).
      if (this.chunks.get(j.c.key) !== j.c || (j.kind === 'build' && this.want.get(j.c.key) !== j.detail)) { this.job = null; continue; }
      const t = performance.now();
      const r = j.it.next();
      const d = performance.now() - t;
      this.buildProfile[j.stage] = (this.buildProfile[j.stage] ?? 0) + d;
      j.prof[j.stage] = (j.prof[j.stage] ?? 0) + d;
      if (j.lastFrame !== this.frame) { j.lastFrame = this.frame; j.frames++; j.frameMs = 0; }
      j.ms += d;
      j.frameMs += d;
      j.maxFrameMs = Math.max(j.maxFrameMs, j.frameMs);
      if (r.done) {
        if (this.job === j) this.job = null;
        this.stats.lastBuildMs = j.ms;
        this.stats.maxBuildMs = Math.max(this.stats.maxBuildMs, j.maxFrameMs);
        this.jobLog?.push({ kind: j.kind, key: j.c.key, detail: j.detail, ms: j.ms, maxFrameMs: j.maxFrameMs, frames: j.frames, prof: j.prof });
      }
    } while (performance.now() < deadline);
  }

  private nextJob(): Job | null {
    const job = (c: Chunk, kind: Job['kind'], detail: Detail): Job => {
      const j: Job = { c, kind, detail, it: null!, stage: kind === 'build' ? 'terrain' : 'decor', ms: 0, maxFrameMs: 0, frames: 0, frameMs: 0, lastFrame: -1, prof: {} };
      j.it = kind === 'build' ? this.build(j) : this.decorate(j);
      return j;
    };
    for (const k of this.order) {
      const c = this.chunks.get(k);
      if (c?.decor && c.group) return job(c, 'decor', 'high');
    }
    for (const k of this.order) {
      const c = this.chunks.get(k);
      const detail = this.want.get(k)!;
      if (c && c.state === 'loaded' && c.built !== detail) return job(c, 'build', detail);
    }
    return null;
  }

  private fetchChunk(key: string): void {
    const [cx, cz] = key.split('_').map(Number);
    const c: Chunk = { cx, cz, key, state: 'fetching' };
    this.chunks.set(key, c);
    this.inflight++;
    // The chunk's place file (shop identities) is fetched alongside it, so signs are ready when the
    // mesh is first built.
    Promise.all([
      fetch(withDataVersion(`${this.base}${key}.json`, this.manifest.hash || undefined)).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      }),
      this.places.fetchChunk(key),
    ])
      .then(([text]) => {
        this.stats.bytes += text.length;
        this.stats.fetched++;
        if (this.chunks.get(key) !== c) return; // unloaded while in flight
        c.data = JSON.parse(text) as ChunkData;
        // District carriageway widths estimated from photographs (see district/mainBazaar.ts).
        for (const r of c.data.roads) if (ROAD_WIDTHS[r.id]) r.w = Math.round(ROAD_WIDTHS[r.id] * QUANT);
        // N1-M5: India Street's rows get their street frontage (district/indiaStreet.ts; nothing happens with ?m5=0).
        patchHeroData(c.data);
        c.state = 'loaded';
        this.ctxBase.collision.addChunk(c.data);
        this.onChunkData?.(c.data);
      })
      .catch((e) => {
        // Transient network failures are retried (the chunk is simply requested again); only a
        // repeated failure is reported and leaves the chunk as a solid "not loaded" boundary.
        const tries = (this.failures.get(key) ?? 0) + 1;
        this.failures.set(key, tries);
        if (tries < 4) {
          console.warn(`Chunk ${key} failed to load (attempt ${tries}), retrying`);
          window.setTimeout(() => {
            if (this.chunks.get(key) === c) this.chunks.delete(key);
          }, 400 * tries);
        } else {
          console.error(`Chunk ${key} failed to load:`, e);
          c.state = 'error';
        }
      })
      .finally(() => this.inflight--);
  }

  /** A chunk mesh at one detail level, step by step (run by runJobs; `j.stage` names the stage for profiling). */
  private *build(j: Job): Generator<void, void> {
    const c = j.c, detail = j.detail;
    const data = c.data!;
    const ctx: BuildContext = { ...this.ctxBase, quality: this.quality, detail };
    const g = new THREE.Group();
    g.position.set(c.cx * CHUNK_SIZE, 0, c.cz * CHUNK_SIZE);
    j.stage = 'terrain';
    g.add(yield* buildTerrain(data, ctx));
    const water = buildWater(data, ctx);
    if (water) g.add(water);
    yield;
    j.stage = 'roads';
    const structure = new GeoBuf();
    const roads = yield* buildRoads(data, ctx, structure);
    roads.groups.forEach((geo, i) => {
      if (!geo) return;
      const m = new THREE.Mesh(geo, ctx.mats.roads[i]);
      m.receiveShadow = true;
      m.renderOrder = i + 1;
      g.add(m);
    });
    if (roads.marks) {
      const m = new THREE.Mesh(roads.marks, ctx.mats.marks);
      m.renderOrder = 6;
      g.add(m);
    }
    yield;
    j.stage = 'shore';
    buildShore(data, ctx, structure);
    const sg = structure.build();
    if (sg) {
      const m = new THREE.Mesh(sg, ctx.mats.structure);
      m.castShadow = detail === 'high';
      m.receiveShadow = true;
      g.add(m);
    }
    let nearMesh: THREE.Mesh | undefined;
    if (roads.near) {
      nearMesh = new THREE.Mesh(roads.near.geo, ctx.mats.structure);
      nearMesh.name = 'hero-near-props';
      nearMesh.castShadow = detail === 'high';
      nearMesh.receiveShadow = true;
      g.add(nearMesh);
    }
    yield;
    j.stage = 'buildings';
    for (const o of yield* buildBuildings(data, ctx)) g.add(o);
    // Landmark models are cheap (a few thousand triangles, one draw call each) and their generic
    // extrusions are suppressed at every detail level, so they are built for low detail as well:
    // otherwise the bridge masts and the DUN roof would vanish from the distant skyline.
    j.stage = 'landmarks';
    for (const o of yield* ctx.landmarks.buildForChunk(data, ctx)) g.add(o);
    yield;
    j.stage = 'upload';
    g.updateMatrixWorld(true);
    g.traverse((o) => {
      o.matrixAutoUpdate = false;
    });
    // Warm-up: upload textures now and draw the chunk once even if it is off-screen, so turning the
    // camera toward freshly streamed chunks does not cause an upload burst.
    g.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.frustumCulled = false;
      const map = (mesh.material as THREE.MeshLambertMaterial).map;
      if (map && mesh.userData.ownMaterial) this.renderer?.initTexture(map);
    });
    // Swap in the finished chunk: the mesh it had until now (another detail level) goes in the same frame.
    this.disposeMesh(c, false);
    this.warming.push({ group: g, frame: this.frame });
    c.group = g;
    c.nearMesh = nearMesh;
    c.nearSpec = roads.near ? { x: roads.near.x, z: roads.near.z, maxDist: roads.near.maxDist } : undefined;
    c.built = detail;
    c.decor = detail === 'high';
    this.group.add(g);
    this.stats.built++;
    this.onBuilt?.(g);
  }

  /** After a high-detail build: trees, street furniture and signs, added together once all are made. */
  private *decorate(j: Job): Generator<void, void> {
    const c = j.c, data = c.data!;
    const ctx: BuildContext = { ...this.ctxBase, quality: this.quality, detail: 'high' };
    const added: THREE.Object3D[] = [...buildVegetation(data, ctx)];
    yield;
    added.push(...buildFurniture(data, ctx));
    yield;
    added.push(...buildDressing(data, ctx));
    yield;
    const labels = buildChunkLabels(data, ctx);
    if (labels) added.push(labels);
    const g = c.group!;
    c.decor = false;
    for (const o of added) {
      g.add(o);
      o.updateMatrixWorld(true);
      o.matrixAutoUpdate = false;
      const mesh = o as THREE.Mesh;
      mesh.frustumCulled = false;
      const map = (mesh.material as THREE.MeshLambertMaterial).map;
      if (map && mesh.userData.ownMaterial) this.renderer?.initTexture(map);
      this.onBuilt?.(o);
    }
    this.warming.push({ group: g, frame: this.frame });
  }

  /** Drop a chunk's mesh (and, unless `abortJob` is false, any build of it in progress: its settings are stale). */
  private disposeMesh(c: Chunk, abortJob = true): void {
    if (abortJob && this.job?.c === c) this.job = null;
    if (!c.group) return;
    this.group.remove(c.group);
    c.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (!mesh.userData.sharedGeometry) mesh.geometry.dispose();
      if ((mesh as unknown as THREE.InstancedMesh).isInstancedMesh) (mesh as unknown as THREE.InstancedMesh).dispose();
      if (mesh.userData.ownMaterial) {
        const mat = mesh.material as THREE.MeshLambertMaterial;
        mat.map?.dispose();
        mat.dispose();
      }
    });
    c.group = undefined;
    c.nearMesh = undefined;
    c.nearSpec = undefined;
    c.built = undefined;
    c.decor = false;
    this.stats.disposed++;
  }

  private unload(c: Chunk): void {
    this.disposeMesh(c);
    if (c.data) {
      this.ctxBase.collision.removeChunk(c.cx, c.cz);
      this.onChunkRemoved?.(c.cx, c.cz);
    }
    this.places.dropChunk(c.key);
    this.chunks.delete(c.key);
  }
}
