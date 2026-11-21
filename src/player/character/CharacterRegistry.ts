// Loads, caches and disposes character models for the player (CHAR-P2a).
//
// The registry caches the PARSED glTF per URL for as long as the caller keeps it (the swapper keeps the default and the
// last two profiles used; a file that falls out of that set is fetched again when it is asked for) and hands out an
// independent instance for every request: the scene is cloned with its own skeleton, materials and textures, and the
// clips are cloned (GlbCharacter edits clips in place). Disposing an instance therefore never touches the cache or
// another instance, and nothing here is shared with the V5 pedestrians, which parse their own copy of the default
// model. `create(id, { direct: true })` is the no-flag path: it loads exactly as before CHAR (no clone, no cache, no
// extra script). The registry owns the disposal of what it created: `dispose(visual)` for an instance, `trim` for
// cached files nobody uses any more.
import * as THREE from 'three';
import type { CharacterVisual } from '../CharacterAnimator.ts';
import type { CharacterSource, GlbCharacterOptions } from '../GlbCharacter.ts';
import { buildCharacter, loadCharacter, loadGltf } from '../CharacterLoader.ts';
import { getProfile } from './CharacterProfile.ts';
import type { CharacterProfile } from './CharacterProfile.ts';

export interface RegistryDeps {
  /** Fetch + parse one GLB by its app-relative URL. */
  load: (url: string) => Promise<CharacterSource>;
  /** Build the animated character from a (private, cloned) source. */
  build: (src: CharacterSource, opts: GlbCharacterOptions) => Promise<CharacterVisual>;
  /** Fetch, parse and build in one go, the way the game loaded its character before CHAR (no clone, no cache). */
  loadDirect: (url: string, opts: GlbCharacterOptions) => Promise<CharacterVisual>;
}

const defaultDeps: RegistryDeps = { load: loadGltf, build: buildCharacter, loadDirect: loadCharacter };

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
  /** URLs fetched so far, in order (diagnostics and tests: "only the selected GLB is fetched"). */
  readonly fetched: string[] = [];

  constructor(deps: Partial<RegistryDeps> = {}) {
    this.deps = { ...defaultDeps, ...deps };
  }

  get(id: string): CharacterProfile | null {
    return getProfile(id);
  }

  /** A new, independent character for profile `id`. Rejects when the file is missing or the model is unusable. */
  async create(id: string, opts: { direct?: boolean } = {}): Promise<CharacterVisual> {
    const profile = getProfile(id);
    if (!profile) throw new Error(`unknown character "${id}"`);
    if (opts.direct) {
      this.fetched.push(profile.url);
      const v = await this.deps.loadDirect(profile.url, profileOptions(profile));
      this.live.set(v, profile.url);
      return v;
    }
    const src = await this.source(profile.url);
    const visual = await this.deps.build(await cloneSource(src), profileOptions(profile));
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
    const inUse = new Set([...this.live.values(), ...keepUrls]);
    for (const [url, p] of [...this.cache]) {
      if (inUse.has(url)) continue;
      this.cache.delete(url);
      void p.then(disposeSource, () => { /* failed load: nothing to free */ });
    }
  }

  /** Number of live instances (for tests). */
  get liveCount(): number {
    return this.live.size;
  }

  private source(url: string): Promise<CharacterSource> {
    let p = this.cache.get(url);
    if (!p) {
      this.fetched.push(url);
      p = this.deps.load(url);
      this.cache.set(url, p);
      // A failed load must not be cached: the next request tries again.
      p.catch(() => { if (this.cache.get(url) === p) this.cache.delete(url); });
    }
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

/** Free what a cached parse holds (it was never uploaded to the GPU: this releases the CPU-side references). */
function disposeSource(src: CharacterSource): void {
  src.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      for (const value of Object.values(m)) if (value && (value as THREE.Texture).isTexture) (value as THREE.Texture).dispose();
      m.dispose();
    }
  });
}
