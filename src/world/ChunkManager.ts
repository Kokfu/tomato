import * as THREE from 'three';
import { CHUNK_SIZE, QUANT, DATA_ROOT, chunkKey } from './config.ts';
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
  /** Detail level of the current mesh, if built. */
  built?: Detail;
  /** High-detail chunk whose decorations (trees, furniture, signs) are still to be added. */
  decor?: boolean;
}

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
  private base: string;
  private frame = 0;
  private failures = new Map<string, number>();
  private warming: { group: THREE.Group; frame: number }[] = [];
  readonly places: PlaceIndex;
  /** Chunk meshes that may be built this frame (raised at vehicle speeds). */
  private buildBudget = 1;

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
    // Rebuild everything at the new settings (data stays cached).
    for (const c of this.chunks.values()) this.disposeMesh(c);
    this.centre = { cx: 1e9, cz: 1e9 };
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
    while (this.warming.length && this.warming[0].frame < this.frame - 1) {
      this.warming.shift()!.group.traverse((o) => {
        o.frustumCulled = true;
      });
    }
    const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
    if (cx !== this.centre.cx || cz !== this.centre.cz) {
      this.centre = { cx, cz };
      this.recomputeWanted();
    }
    // Prefetch (download only) the chunks the player is heading toward.
    this.prefetchKeys = [];
    const sp = Math.hypot(vx, vz);
    if (sp > 0.5) {
      // Look further ahead at vehicle speeds so chunks are downloaded before they are needed.
      const reach = (this.quality.lowRadius + 1 + Math.min(2, sp / 14)) * CHUNK_SIZE;
      const px = Math.floor((x + (vx / sp) * reach) / CHUNK_SIZE), pz = Math.floor((z + (vz / sp) * reach) / CHUNK_SIZE);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const k = chunkKey(px + dx, pz + dz);
        if (this.available.has(k) && !this.chunks.has(k)) this.prefetchKeys.push(k);
      }
    }
    this.buildBudget = sp > 9 ? 2 : 1;
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
      if (d > R + 1) this.unload(c);
      else if (!this.want.has(c.key) && c.built === 'high') this.disposeMesh(c);
    }
  }

  private pump(): void {
    // 1. Start downloads (nearest first).
    for (const k of [...this.order, ...this.prefetchKeys]) {
      if (this.inflight >= 6) break;
      if (!this.chunks.has(k)) this.fetchChunk(k);
    }
    // 2. Build at most one chunk mesh per frame (two at vehicle speeds), nearest first, to avoid frame
    // spikes. A high-detail chunk is built in two frames: geometry first, decorations after.
    let budget = this.buildBudget;
    for (const k of this.order) {
      const c = this.chunks.get(k);
      if (c?.decor && c.group) {
        this.decorate(c);
        if (--budget <= 0) return;
      }
    }
    for (const k of this.order) {
      const c = this.chunks.get(k);
      const detail = this.want.get(k)!;
      if (c && c.state === 'loaded' && c.built !== detail) {
        this.build(c, detail);
        if (--budget <= 0) break;
      }
    }
  }

  private fetchChunk(key: string): void {
    const [cx, cz] = key.split('_').map(Number);
    const c: Chunk = { cx, cz, key, state: 'fetching' };
    this.chunks.set(key, c);
    this.inflight++;
    // The chunk's place file (shop identities) is fetched alongside it, so signs are ready when the
    // mesh is first built.
    Promise.all([
      fetch(`${this.base}${key}.json`).then((r) => {
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

  private build(c: Chunk, detail: Detail): void {
    const t0 = performance.now();
    this.disposeMesh(c);
    const data = c.data!;
    const ctx: BuildContext = { ...this.ctxBase, quality: this.quality, detail };
    const g = new THREE.Group();
    let tp = t0;
    const lap = (name: string) => {
      const now = performance.now();
      this.buildProfile[name] = (this.buildProfile[name] ?? 0) + now - tp;
      tp = now;
    };
    g.position.set(c.cx * CHUNK_SIZE, 0, c.cz * CHUNK_SIZE);
    g.add(buildTerrain(data, ctx));
    lap('terrain');
    const water = buildWater(data, ctx);
    if (water) g.add(water);
    const structure = new GeoBuf();
    const roads = buildRoads(data, ctx, structure);
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
    lap('roads');
    buildShore(data, ctx, structure);
    const sg = structure.build();
    if (sg) {
      const m = new THREE.Mesh(sg, ctx.mats.structure);
      m.castShadow = detail === 'high';
      m.receiveShadow = true;
      g.add(m);
    }
    lap('shore');
    for (const o of buildBuildings(data, ctx)) g.add(o);
    lap('buildings');
    c.decor = detail === 'high';
    // Landmark models are cheap (a few thousand triangles, one draw call each) and their generic
    // extrusions are suppressed at every detail level, so they are built for low detail as well:
    // otherwise the bridge masts and the DUN roof would vanish from the distant skyline.
    for (const o of ctx.landmarks.buildForChunk(data, ctx)) g.add(o);
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
    lap('upload');
    this.warming.push({ group: g, frame: this.frame });
    c.group = g;
    c.built = detail;
    this.group.add(g);
    this.stats.built++;
    this.stats.lastBuildMs = performance.now() - t0;
    this.stats.maxBuildMs = Math.max(this.stats.maxBuildMs, this.stats.lastBuildMs);
  }

  /** Second build frame of a high-detail chunk: trees, street furniture and signs. */
  private decorate(c: Chunk): void {
    const t0 = performance.now();
    c.decor = false;
    const data = c.data!, g = c.group!;
    const ctx: BuildContext = { ...this.ctxBase, quality: this.quality, detail: 'high' };
    const added: THREE.Object3D[] = [...buildVegetation(data, ctx), ...buildFurniture(data, ctx), ...buildDressing(data, ctx)];
    const labels = buildChunkLabels(data, ctx);
    if (labels) added.push(labels);
    for (const o of added) {
      g.add(o);
      o.updateMatrixWorld(true);
      o.matrixAutoUpdate = false;
      const mesh = o as THREE.Mesh;
      mesh.frustumCulled = false;
      const map = (mesh.material as THREE.MeshLambertMaterial).map;
      if (map && mesh.userData.ownMaterial) this.renderer?.initTexture(map);
    }
    this.warming.push({ group: g, frame: this.frame });
    const ms = performance.now() - t0;
    this.buildProfile.decor = (this.buildProfile.decor ?? 0) + ms;
    this.stats.maxBuildMs = Math.max(this.stats.maxBuildMs, ms);
  }

  private disposeMesh(c: Chunk): void {
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
