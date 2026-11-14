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

export type Detail = 'high' | 'low';
export interface BuildContext {
  height: HeightMap;
  collision: CollisionWorld;
  mats: Materials;
  landmarks: LandmarkManager;
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

  constructor(manifest: Manifest, height: HeightMap, collision: CollisionWorld, mats: Materials, landmarks: LandmarkManager, quality: Quality) {
    this.manifest = manifest;
    this.available = new Set(manifest.chunks);
    this.ctxBase = { height, collision, mats, landmarks };
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
      if (c && (c.built === d || c.state === 'error')) done++;
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
    const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
    if (cx !== this.centre.cx || cz !== this.centre.cz) {
      this.centre = { cx, cz };
      this.recomputeWanted();
    }
    // Prefetch (download only) the chunks the player is heading toward.
    this.prefetchKeys = [];
    const sp = Math.hypot(vx, vz);
    if (sp > 0.5) {
      const reach = (this.quality.lowRadius + 1) * CHUNK_SIZE;
      const px = Math.floor((x + (vx / sp) * reach) / CHUNK_SIZE), pz = Math.floor((z + (vz / sp) * reach) / CHUNK_SIZE);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const k = chunkKey(px + dx, pz + dz);
        if (this.available.has(k) && !this.chunks.has(k)) this.prefetchKeys.push(k);
      }
    }
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
        this.want.set(k, Math.max(Math.abs(dx), Math.abs(dz)) <= H ? 'high' : 'low');
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
    // 2. Build at most one chunk mesh per frame, nearest first, to avoid frame spikes.
    for (const k of this.order) {
      const c = this.chunks.get(k);
      const detail = this.want.get(k)!;
      if (c && c.state === 'loaded' && c.built !== detail) {
        this.build(c, detail);
        break;
      }
    }
  }

  private fetchChunk(key: string): void {
    const [cx, cz] = key.split('_').map(Number);
    const c: Chunk = { cx, cz, key, state: 'fetching' };
    this.chunks.set(key, c);
    this.inflight++;
    fetch(`${this.base}${key}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((text) => {
        this.stats.bytes += text.length;
        this.stats.fetched++;
        if (this.chunks.get(key) !== c) return; // unloaded while in flight
        c.data = JSON.parse(text) as ChunkData;
        c.state = 'loaded';
        this.ctxBase.collision.addChunk(c.data);
        this.onChunkData?.(c.data);
      })
      .catch((e) => {
        console.error(`Chunk ${key} failed to load:`, e);
        c.state = 'error';
      })
      .finally(() => this.inflight--);
  }

  private build(c: Chunk, detail: Detail): void {
    const t0 = performance.now();
    this.disposeMesh(c);
    const data = c.data!;
    const ctx: BuildContext = { ...this.ctxBase, quality: this.quality, detail };
    const g = new THREE.Group();
    g.position.set(c.cx * CHUNK_SIZE, 0, c.cz * CHUNK_SIZE);
    g.add(buildTerrain(data, ctx));
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
    buildShore(data, ctx, structure);
    const sg = structure.build();
    if (sg) {
      const m = new THREE.Mesh(sg, ctx.mats.structure);
      m.castShadow = detail === 'high';
      m.receiveShadow = true;
      g.add(m);
    }
    for (const o of buildBuildings(data, ctx)) g.add(o);
    if (detail === 'high') for (const o of buildVegetation(data, ctx)) g.add(o);
    // Landmark models are cheap (a few thousand triangles, one draw call each) and their generic
    // extrusions are suppressed at every detail level, so they are built for low detail as well:
    // otherwise the bridge masts and the DUN roof would vanish from the distant skyline.
    for (const o of ctx.landmarks.buildForChunk(data, ctx)) g.add(o);
    g.updateMatrixWorld(true);
    g.traverse((o) => {
      o.matrixAutoUpdate = false;
    });
    c.group = g;
    c.built = detail;
    this.group.add(g);
    this.stats.built++;
    this.stats.lastBuildMs = performance.now() - t0;
    this.stats.maxBuildMs = Math.max(this.stats.maxBuildMs, this.stats.lastBuildMs);
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
    this.stats.disposed++;
  }

  private unload(c: Chunk): void {
    this.disposeMesh(c);
    if (c.data) {
      this.ctxBase.collision.removeChunk(c.cx, c.cz);
      this.onChunkRemoved?.(c.cx, c.cz);
    }
    this.chunks.delete(c.key);
  }
}
