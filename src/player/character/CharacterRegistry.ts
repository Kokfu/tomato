// Loads, caches and disposes character models for the player (CHAR-P2a).
//
// The registry caches the PARSED glTF per URL under a byte budget (CHAR-P5: `enforceBudget` keeps the files the caller
// protects, the files of live instances, and as many more of the most recently used as fit; a file that falls out is
// fetched again when it is asked for) and hands out an
// independent instance for every request: the scene is cloned with its own skeleton, materials and textures, and the
// clips are cloned (GlbCharacter edits clips in place). Disposing an instance therefore never touches the cache or
// another instance, and nothing here is shared with the V5 pedestrians, which parse their own copy of the default
// model. `create(id, { direct: true })` is the no-flag path: it loads exactly as before CHAR (no clone, no cache, no
// extra script). The registry owns the disposal of what it created: `dispose(visual)` for an instance, `trim` and
// `enforceBudget` for cached files nobody uses any more.
import * as THREE from 'three';
import type { CharacterVisual } from '../CharacterAnimator.ts';
import type { CharacterSource, GlbCharacterOptions } from '../GlbCharacter.ts';
import { buildCharacter, loadCharacter, loadGltf } from '../CharacterLoader.ts';
import { getProfile } from './CharacterProfile.ts';
import type { CharacterProfile } from './CharacterProfile.ts';

export interface RegistryDeps {
  /** Fetch + parse one GLB by its app-relative URL. `onProgress` receives the download's progress events (CHAR-P5 G2: the stall timeout). */
  load: (url: string, onProgress?: (e: ProgressEvent) => void) => Promise<CharacterSource>;
  /** Build the animated character from a (private, cloned) source; with `yieldToMain`, in steps of a few ms each. */
  build: (src: CharacterSource, opts: GlbCharacterOptions, yieldToMain?: () => Promise<void>) => Promise<CharacterVisual>;
  /** Fetch, parse and build in one go, the way the game loaded its character before CHAR (no clone, no cache). */
  loadDirect: (url: string, opts: GlbCharacterOptions) => Promise<CharacterVisual>;
  /** Bytes a parsed source holds (geometry buffers + decoded textures), for the cache budget. */
  sizeOf: (src: CharacterSource) => number;
}

/** Bytes held by a parsed glTF: vertex and index buffers plus every distinct image decoded at 4 bytes a pixel. */
export function estimateSourceBytes(src: CharacterSource): number {
  let bytes = 0;
  const images = new Set<unknown>();
  const geometries = new Set<THREE.BufferGeometry>();
  src.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (!geometries.has(mesh.geometry)) {
      geometries.add(mesh.geometry);
      for (const a of Object.values(mesh.geometry.attributes)) bytes += (a.array as { byteLength?: number }).byteLength ?? 0;
      bytes += (mesh.geometry.index?.array as { byteLength?: number } | undefined)?.byteLength ?? 0;
    }
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      for (const value of Object.values(m)) {
        const tex = value as THREE.Texture | null;
        if (!tex || !tex.isTexture) continue;
        const img = tex.image as { width?: number; height?: number } | null;
        if (img && !images.has(img)) { images.add(img); bytes += (img.width ?? 0) * (img.height ?? 0) * 4; }
      }
    }
  });
  return bytes;
}

/** Parsed-file budget: a phone keeps about two models besides the one on screen, a desktop about five. */
export function defaultCacheBudget(): number {
  const touch = typeof navigator !== 'undefined' && (navigator.maxTouchPoints ?? 0) > 0;
  return (touch ? 32 : 64) * 1024 * 1024;
}

/** CHAR-P5: longest stretch of build work between two yields, in ms (touch devices / others). */
export const BUILD_SLICE_MS_TOUCH = 3;
export const BUILD_SLICE_MS = 6;

/**
 * CHAR-P5 G2 (N1): a GLB load that makes no progress for this long is abandoned ("Couldn't load X", Try again). It is an inactivity
 * timeout, not a total: every chunk of the download re-arms it, so a slow but moving phone connection is never cut off. The files
 * are 0.4 to 0.8 MB, so even a 2G-class link delivers a chunk every few seconds; 15 s without a single byte is a dead request.
 * Once the last byte is in (loaded >= total) the parse and image decode have no progress events, so that stretch gets 3x.
 */
export const LOAD_STALL_MS = 15000;
export const LOAD_PARSE_FACTOR = 3;

/** The load made no progress (see LOAD_STALL_MS). */
export class LoadStalledError extends Error {
  readonly url: string;
  readonly ms: number;
  constructor(url: string, ms: number) { super(`loading ${url} made no progress for ${ms} ms`); this.name = 'LoadStalledError'; this.url = url; this.ms = ms; }
}

/**
 * Run `start` and reject with LoadStalledError when it reports no activity for `stallMs` (0 = no timeout: `start` runs as it is).
 * A result that arrives after the timeout is handed to `discard` (it is not used). `activity(true)` marks "the download is complete".
 */
export function withStallTimeout<T>(url: string, start: (activity: (downloaded?: boolean) => void) => Promise<T>, stallMs: number, discard: (v: T) => void): Promise<T> {
  if (!(stallMs > 0)) return start(() => {});
  return new Promise<T>((resolve, reject) => {
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(() => { if (done) return; done = true; reject(new LoadStalledError(url, ms)); }, ms);
    };
    arm(stallMs);
    start((downloaded) => { if (!done) arm(downloaded ? stallMs * LOAD_PARSE_FACTOR : stallMs); }).then(
      (v) => { if (done) { discard(v); return; } done = true; clearTimeout(timer); resolve(v); },
      (e) => { if (done) return; done = true; clearTimeout(timer); reject(e); },
    );
  });
}

/** URLs kept in `fetched` (the newest); `fetchCount` counts all. */
export const FETCHED_KEPT = 64;

const defaultDeps: RegistryDeps = { load: loadGltf, build: buildCharacter, loadDirect: loadCharacter, sizeOf: estimateSourceBytes };

/** Options handed to GlbCharacter for a profile. */
export function profileOptions(p: CharacterProfile): GlbCharacterOptions {
  return {
    height: p.heightM,
    clips: { idle: p.clips.idle, walk: p.clips.walk, run: p.clips.run, jump: p.clips.airborne, turnL: p.clips.turnL, turnR: p.clips.turnR },
    animRate: p.animRate,
    turnInPlace: p.turnInPlace,
    yawFix: p.yawFix,
    scale: p.scale,
    offset: p.offset,
    feet: p.feet,
  };
}

export class CharacterRegistry {
  private cache = new Map<string, Promise<CharacterSource>>();
  private live = new Map<CharacterVisual, string>();
  private deps: RegistryDeps;
  /** Estimated bytes of each parsed file that finished loading, and when each cached file was last asked for. */
  private bytes = new Map<string, number>();
  private lastUsed = new Map<string, number>();
  private tick = 0;
  /** Files an instance is being made from: never evicted meanwhile (the clone would share closed images). */
  private pinned = new Map<string, number>();
  private readonly budget: number;
  private readonly stallMs: number;
  /** Number of stalled loads per URL (see source()). */
  private stalls = new Map<string, number>();
  /** The newest URLs fetched (diagnostics and tests: "only the selected GLB is fetched"); at most FETCHED_KEPT, see fetchCount. */
  readonly fetched: string[] = [];
  /** Number of fetches since the registry was made (`fetched` keeps only the newest). */
  fetchCount = 0;

  /** `stallMs` (CHAR-P5 G2, only the `?char` game passes it): abandon a GLB load that makes no progress for that long. 0 = never. */
  constructor(deps: Partial<RegistryDeps> = {}, opts: { budgetBytes?: number; stallMs?: number } = {}) {
    this.deps = { ...defaultDeps, ...deps };
    this.budget = opts.budgetBytes ?? defaultCacheBudget();
    this.stallMs = opts.stallMs ?? 0;
  }

  /** The parsed-file byte budget in force (CHAR-P5 G2: shown by the debug hook). */
  get budgetBytes(): number { return this.budget; }

  get(id: string): CharacterProfile | null {
    return getProfile(id);
  }

  private noteFetch(url: string): void {
    this.fetchCount++;
    this.fetched.push(url);
    if (this.fetched.length > FETCHED_KEPT) this.fetched.splice(0, this.fetched.length - FETCHED_KEPT);
  }

  /**
   * A new, independent character for profile `id`. Rejects when the file is missing or the model is unusable. With
   * `yieldToMain` the work is split into steps with a yield between them (the swap on the `?char` path); `mark` receives
   * the stage timings.
   */
  async create(id: string, opts: { direct?: boolean; yieldToMain?: () => Promise<void>; mark?: (stage: string, ms: number) => void } = {}): Promise<CharacterVisual> {
    const profile = getProfile(id);
    if (!profile) throw new Error(`unknown character "${id}"`);
    if (opts.direct) {
      this.noteFetch(profile.url);
      const v = await this.deps.loadDirect(profile.url, profileOptions(profile));
      this.live.set(v, profile.url);
      return v;
    }
    const { yieldToMain, mark } = opts;
    this.pinned.set(profile.url, (this.pinned.get(profile.url) ?? 0) + 1);
    try {
      return await this.createFrom(profile, yieldToMain, mark);
    } finally {
      const n = (this.pinned.get(profile.url) ?? 1) - 1;
      if (n > 0) this.pinned.set(profile.url, n); else this.pinned.delete(profile.url);
    }
  }

  private async createFrom(profile: CharacterProfile, yieldToMain?: () => Promise<void>, mark?: (stage: string, ms: number) => void): Promise<CharacterVisual> {
    let t = performance.now();
    const lap = (name: string) => { const n = performance.now(); mark?.(name, n - t); t = n; };
    const src = await this.source(profile.url);
    lap('source'); // fetch + parse, or the cache
    if (yieldToMain) await yieldToMain();
    t = performance.now();
    const own = await cloneSource(src);
    lap('clone');
    if (yieldToMain) await yieldToMain();
    // The lean build (CHAR-P5): the same character, built from the indexed geometry with the faster crease.
    // sliceMs: the build's long loops yield after this many ms (a phone is 3 to 4 times slower than a desktop: smaller slices).
    const touch = typeof navigator !== 'undefined' && (navigator.maxTouchPoints ?? 0) > 0;
    const build: GlbCharacterOptions = { ...profileOptions(profile), lean: true, sliceMs: touch ? BUILD_SLICE_MS_TOUCH : BUILD_SLICE_MS };
    if (mark) build.onStage = (name, ms) => mark('build.' + name, ms);
    t = performance.now();
    const visual = await this.deps.build(own, build, yieldToMain);
    if (mark) mark('build.wall', performance.now() - t);
    this.live.set(visual, profile.url);
    return visual;
  }

  /** Dispose a character created by `create` (its geometry, materials and textures are its own). */
  dispose(visual: CharacterVisual): void {
    visual.dispose();
    this.live.delete(visual);
  }

  /** Whether a parsed file is cached (not necessarily in use). */
  isCached(url: string): boolean {
    return this.cache.has(url);
  }

  /** Drop the cached parse of every file except `keepUrls` that no live instance came from. */
  trim(keepUrls: readonly string[]): void {
    const inUse = new Set([...this.live.values(), ...this.pinned.keys(), ...keepUrls]);
    for (const url of [...this.cache.keys()]) if (!inUse.has(url)) this.evict(url);
  }

  /**
   * The cache policy: files of live instances and `protect` always stay; of the others the most recently used stay while the
   * parsed files together fit the byte budget, and the rest are released (their decoded images closed).
   */
  enforceBudget(protect: readonly string[]): void {
    const keep = new Set([...this.live.values(), ...this.pinned.keys(), ...protect]);
    let total = this.cachedBytes;
    if (total <= this.budget) return;
    const order = [...this.bytes.keys()].filter((u) => !keep.has(u)).sort((a, b) => (this.lastUsed.get(a) ?? 0) - (this.lastUsed.get(b) ?? 0));
    for (const url of order) {
      if (total <= this.budget) break;
      total -= this.bytes.get(url) ?? 0;
      this.evict(url);
    }
  }

  /** Estimated bytes of the parsed files now cached. */
  get cachedBytes(): number {
    let n = 0;
    for (const b of this.bytes.values()) n += b;
    return n;
  }

  /** Number of parsed files cached (loading ones included). */
  get cachedCount(): number {
    return this.cache.size;
  }

  /** Number of live instances (for tests). */
  get liveCount(): number {
    return this.live.size;
  }

  private evict(url: string): void {
    const p = this.cache.get(url);
    if (!p) return;
    this.cache.delete(url);
    this.bytes.delete(url);
    this.lastUsed.delete(url);
    void p.then(disposeSource, () => { /* failed load: nothing to free */ });
  }

  private source(url: string): Promise<CharacterSource> {
    let p = this.cache.get(url);
    if (!p) {
      this.noteFetch(url);
      // After a stall the request that hung may still be open. three's FileLoader joins a second load of the same URL to the first, and
      // the browser strips a #fragment, so a `#retryN` retry shares the HTTP-cache entry of the hung request and queues behind it (a real
      // browser holds it back about 20 s, or revalidates and waits on the dead body). A query string is a different cache key, so
      // "Try again" is a request of its own. The first attempt keeps the plain URL.
      const retry = this.stalls.get(url) ?? 0;
      const asked = retry > 0 ? `${url}?retry=${retry}` : url;
      const mine = (p = withStallTimeout(url, (activity) => this.deps.load(asked, (e) => activity(e.lengthComputable && e.loaded >= e.total)), this.stallMs, disposeSource));
      this.cache.set(url, mine);
      // A failed load must not be cached: the next request tries again.
      mine.then(
        (src) => { if (this.cache.get(url) === mine) this.bytes.set(url, this.deps.sizeOf(src)); },
        (e) => { if (e instanceof LoadStalledError) this.stalls.set(url, retry + 1); if (this.cache.get(url) === mine) this.cache.delete(url); },
      );
    }
    this.lastUsed.set(url, ++this.tick);
    return p;
  }
}

/** An independent copy of a parsed glTF: own skeleton, materials, textures and clips. Geometry buffers are shared
 *  until GlbCharacter replaces them with its own (creased-normal) copies. */
export async function cloneSource(src: CharacterSource): Promise<CharacterSource> {
  const { clone } = await import('three/addons/utils/SkeletonUtils.js');
  const scene = clone(src.scene);
  shareSkeletons(src.scene, scene);
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const own = mats.map((m) => {
      const c = m.clone();
      for (const [key, value] of Object.entries(c)) {
        if (value && (value as THREE.Texture).isTexture) (c as unknown as Record<string, unknown>)[key] = (value as THREE.Texture).clone();
      }
      return c;
    });
    mesh.material = Array.isArray(mesh.material) ? own : own[0];
  });
  return { scene, animations: src.animations.map((c) => c.clone()) };
}

/**
 * SkeletonUtils.clone gives every SkinnedMesh its own Skeleton, while a glTF skin is one Skeleton shared by all the
 * meshes that use it. Separate skeletons would each compute their bone matrices and upload their own bone texture
 * every frame (CHAR-P2a perf finding: +6 textures, one per mesh). Re-share them as in the source.
 */
export function shareSkeletons(source: THREE.Object3D, cloned: THREE.Object3D): void {
  const src: THREE.SkinnedMesh[] = [], dst: THREE.SkinnedMesh[] = [];
  source.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) src.push(o as THREE.SkinnedMesh); });
  cloned.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) dst.push(o as THREE.SkinnedMesh); });
  if (src.length !== dst.length) return;
  const first = new Map<THREE.Skeleton, THREE.Skeleton>();
  src.forEach((m, i) => {
    const mine = first.get(m.skeleton);
    if (!mine) first.set(m.skeleton, dst[i].skeleton);
    else dst[i].skeleton = mine;
  });
}

/**
 * Free what a cached parse holds (it was never uploaded to the GPU: this releases the CPU-side references) and close the
 * decoded images: an ImageBitmap holds native memory the garbage collector returns only when it gets to it. Only the cache
 * closes them: the instances' textures are clones that share these images, and none is alive when a file is evicted.
 */
function disposeSource(src: CharacterSource): void {
  const images = new Set<{ close: () => void }>();
  src.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      for (const value of Object.values(m)) {
        if (!value || !(value as THREE.Texture).isTexture) continue;
        const tex = value as THREE.Texture;
        const img = tex.image as { close?: unknown } | null;
        if (img && typeof img.close === 'function') images.add(img as { close: () => void });
        tex.dispose();
      }
      m.dispose();
    }
  });
  for (const img of images) { try { img.close(); } catch { /* already closed */ } }
}
