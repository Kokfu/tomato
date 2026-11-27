import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CharacterState, CharacterVisual } from './CharacterAnimator.ts';
import { creasedNormalsSteps } from './character/creasedNormals.ts';

/** The parts of a loaded glTF that the character needs (matches three's GLTF result). */
export interface CharacterSource {
  scene: THREE.Object3D;
  animations: THREE.AnimationClip[];
}

export const CHARACTER_HEIGHT = 1.72;
const creasedCache = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();

/** Clip roles a profile can name explicitly. `jump` is the airborne pose; turnL/turnR are optional turn-in-place clips. */
export type ClipNames = Partial<Record<'idle' | 'walk' | 'run' | 'jump' | 'turnL' | 'turnR', string>>;

/** Optional, additive settings. With none given the character behaves exactly as before (1.72 m, clips found by name). */
export interface GlbCharacterOptions {
  /** Normalisation height in metres (default CHARACTER_HEIGHT). */
  height?: number;
  /** Exact clip names (the full name or the part after '|'); a missing or unknown name falls back to the word search. */
  clips?: ClipNames;
  /** Playback-rate factor of the gait cycle (per metre travelled), the idle loop and turn clips. Default 1. */
  animRate?: number;
  /** Turn on the spot when the body yaw changes while standing: turn clips if present, else a slowed walk cycle. */
  turnInPlace?: boolean;
  /** Extra yaw (radians) applied to the model after the facing direction was detected. */
  yawFix?: number;
  /** Extra uniform scale applied after normalisation (the feet stay on y = 0). */
  scale?: number;
  /** Extra offset of the model (metres) applied after normalisation. */
  offset?: readonly [number, number, number];
  /** Exact left/right foot bone names when the automatic match fails. */
  feet?: readonly [string, string];
  /**
   * CHAR-P5 lean build (set by the character registry on the `?char` path, never by the no-flag start). Same result as the
   * default build, in less time: the bounding box and the sole candidates are taken on the indexed geometry before the crease
   * (a fifth of the vertices), the crease is the faster equivalent in character/creasedNormals.ts and runs last, and the sole
   * set keeps one vertex per distinct skinned position.
   */
  lean?: boolean;
  /**
   * CHAR-P5 (lean build only): the longest stretch of build work between two yields, in ms. The loops that dominate the build
   * check the clock and yield when it is exceeded (the registry passes a smaller value on touch devices). 0 or absent: only
   * the fixed yield points.
   */
  sliceMs?: number;
  /** Stage timings of the build in ms (`crease`, `bbox`, `gait`, `sole`, ... and `maxChunk`, the longest stretch without a yield). */
  onStage?: (name: string, ms: number) => void;
}

/** Find a clip by its exact name: the full name or the part after the last '|' (case-insensitive). */
export function findClipByName(clips: readonly THREE.AnimationClip[], name: string | undefined): THREE.AnimationClip | null {
  if (!name) return null;
  const want = name.toLowerCase();
  return clips.find((c) => c.name.toLowerCase() === want) ?? clips.find((c) => (c.name.split('|').pop() ?? '').toLowerCase() === want) ?? null;
}

/** Distance covered by one full gait cycle (two steps) when it cannot be measured from the clip. */
const FALLBACK_STRIDE = { walk: 1.45, run: 3.0 };
/** Speeds (m/s) between which the walk cycle blends into the run cycle. */
const RUN_BLEND_START = 2.6;
const RUN_BLEND_END = 4.2;
const SAMPLES = 60;
/** CHAR-P5 lean build: how many of the lowest sole candidates each sampled pose keeps (see `reduceSole`). */
const SOLE_KEEP_PER_POSE = 6;

/** Lets the lean build's long loops yield when their time slice is used up (`GlbCharacterOptions.sliceMs`). */
interface Slicer {
  /** True when the current stretch of work has used its slice. */
  due(): boolean;
  /** Close the stretch (attributed to stage `at`) just before the caller yields. */
  cut(at: string): void;
  /** Start the next stretch, just after the yield. */
  resume(): void;
}

type Role = 'idle' | 'walk' | 'run' | 'jump';

/** Pick the clip for a role by name: an exact match wins, then the shortest name containing the word. */
export function findClip(clips: readonly THREE.AnimationClip[], role: Role): THREE.AnimationClip | null {
  const words: Record<Role, string[]> = { idle: ['idle'], walk: ['walk'], run: ['run', 'jog', 'sprint'], jump: ['jump', 'fall'] };
  const short = (c: THREE.AnimationClip) => (c.name.split('|').pop() ?? '').toLowerCase();
  for (const w of words[role]) {
    const exact = clips.find((c) => short(c) === w);
    if (exact) return exact;
    const partial = clips
      .filter((c) => short(c).includes(w) && (role === 'jump' || !short(c).includes('jump')))
      .sort((a, b) => a.name.length - b.name.length)[0];
    if (partial) return partial;
  }
  return null;
}

/**
 * Remove root motion: any net translation between the first and last key of a position track is
 * subtracted as a linear ramp, so the clip plays in place while keeping bob and sway.
 */
export function stripRootMotion(clip: THREE.AnimationClip): void {
  for (const track of clip.tracks) {
    if (!track.name.endsWith('.position') || track.times.length < 2) continue;
    const v = track.values;
    const n = track.times.length;
    const t0 = track.times[0], span = track.times[n - 1] - t0;
    if (span <= 0) continue;
    for (let c = 0; c < 3; c++) {
      const drift = v[(n - 1) * 3 + c] - v[c];
      if (Math.abs(drift) < 1e-9) continue;
      for (let i = 0; i < n; i++) v[i * 3 + c] -= (drift * (track.times[i] - t0)) / span;
    }
  }
}

interface Gait {
  /** Metres travelled per full cycle at the normalised character scale. */
  stride: number;
  /** Normalised clip time at which the left foot is furthest forward (used to keep walk and run in step). */
  offset: number;
  /** +1 when the feet push toward -Z during stance (model faces +Z), -1 when it faces -Z. */
  facing: number;
}

/**
 * A skinned glTF character driven by an AnimationMixer.
 * Root origin at the feet, facing +Z, normalised to 1.72 m. The clips are scrubbed by distance
 * travelled rather than by time, so the feet stay planted at any ground speed.
 */
export class GlbCharacter implements CharacterVisual {
  readonly root = new THREE.Group();
  private model!: THREE.Object3D;
  private mixer!: THREE.AnimationMixer;
  private idle!: THREE.AnimationAction;
  private walk!: THREE.AnimationAction;
  private run!: THREE.AnimationAction;
  private airAction!: THREE.AnimationAction;
  private turnL: THREE.AnimationAction | null = null;
  private turnR: THREE.AnimationAction | null = null;
  private rate = 1;
  private turnInPlace = false;
  private turn = 0;
  private turnT = 0;
  private yawPrev: number | null = null;
  private yawRate = 0;
  private walkGait!: Gait;
  private runGait!: Gait;
  private airTime = 0;
  /** Only for an explicitly named jump clip: the shoe vertices that can reach the ground, and the model's resting height. */
  private soleVerts: { mesh: THREE.SkinnedMesh; index: number }[] | null = null;
  private baseY = 0;
  /** The pose (action weights and times) the last sole scan was made for, and its result: an unchanged pose reuses it. */
  private soleSig: Float64Array | null = null;
  private soleSigDepth = 0;
  /** CHAR-P5: built by the lean (?char) path: reduced sole set and pose cache. The no-flag path never sets it (CHAR-P4 behaviour). */
  private lean = false;
  private readonly initSteps: Generator<void, void, void>;
  private phase = 0;
  private idleT = 0;
  private move = 0;
  private runBlend = 0;
  private air = 0;

  /**
   * Throws when the source has no skinned mesh or lacks an idle, walk or run clip. `deferred` (CHAR-P5, used only by
   * `buildStaged`) returns before the build ran: the caller steps `initSteps` itself.
   */
  constructor(src: CharacterSource, opts: GlbCharacterOptions = {}, deferred = false) {
    this.initSteps = this.build(src, opts);
    if (deferred) return;
    for (;;) if (this.initSteps.next().done) break;
  }

  /** Build the character in steps, awaiting `yieldToMain` between them (a few ms of work each) so no frame is held for long. */
  static async buildStaged(src: CharacterSource, opts: GlbCharacterOptions, yieldToMain: () => Promise<void>): Promise<GlbCharacter> {
    const c = new GlbCharacter(src, opts, true);
    for (;;) {
      if (c.initSteps.next().done) return c;
      await yieldToMain();
    }
  }

  /** The constructor body as a generator; every `yield` is a point where the work can pause. */
  private *build(src: CharacterSource, opts: GlbCharacterOptions): Generator<void, void, void> {
    const lean = !!opts.lean;
    this.lean = lean;
    const stages: Record<string, number> = {};
    let t0 = performance.now(), chunk0 = t0, longest = 0, longestAt = '';
    let place = 'setup';
    const lap = (name: string) => { const n = performance.now(); stages[name] = (stages[name] ?? 0) + (n - t0); t0 = n; place = name; };
    const cut = () => { const n = performance.now(); if (n - chunk0 > longest) { longest = n - chunk0; longestAt = place; } };
    const resume = () => { t0 = chunk0 = performance.now(); };
    const budget = lean && opts.sliceMs && opts.sliceMs > 0 ? opts.sliceMs : 0;
    /** The loops below ask this between small units of work; true = the slice is used up, yield. */
    const slice: Slicer = { due: () => budget > 0 && performance.now() - chunk0 >= budget, cut: (at) => { lap(at); cut(); }, resume };
    const names = opts.clips ?? {};
    const pick = (role: 'idle' | 'walk' | 'run' | 'jump') => findClipByName(src.animations, names[role]) ?? findClip(src.animations, role);
    const idleClip = pick('idle');
    const walkClip = pick('walk');
    const runClip = pick('run');
    if (!idleClip || !walkClip || !runClip) throw new Error('character model lacks idle/walk/run animation clips');
    const jumpClip = pick('jump');
    const turnLClip = findClipByName(src.animations, names.turnL);
    const turnRClip = findClipByName(src.animations, names.turnR);
    this.rate = opts.animRate !== undefined && opts.animRate > 0 ? opts.animRate : 1;
    this.turnInPlace = !!opts.turnInPlace;
    const targetHeight = opts.height !== undefined && opts.height > 0 ? opts.height : CHARACTER_HEIGHT;

    this.model = src.scene;
    this.root.add(this.model);
    const skinned: THREE.SkinnedMesh[] = [];
    this.model.traverse((o) => {
      const mesh = o as THREE.SkinnedMesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      // The bind-pose bounds do not follow the animation; one character is never worth culling.
      mesh.frustumCulled = false;
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(toLambert) : toLambert(mesh.material);
      // The model ships flat-shaded (every facet visible). Smooth the normals across edges shallower
      // than 70 degrees so limbs and torso read as rounded forms; hard edges (soles, hair) stay crisp.
      // (The lean build does it last, once the box and the sole candidates are known: see below.)
      if (!lean) try { mesh.geometry = toCreasedNormals(mesh.geometry, (70 * Math.PI) / 180); } catch { /* keep the authored normals */ }
      if (mesh.isSkinnedMesh) skinned.push(mesh);
    });
    if (!skinned.length) throw new Error('character model has no skinned mesh');
    lap(lean ? 'setup' : 'setup+crease');
    cut(); yield; resume();

    this.mixer = new THREE.AnimationMixer(this.model);
    const action = (clip: THREE.AnimationClip) => {
      stripRootMotion(clip);
      const a = this.mixer.clipAction(clip);
      a.setEffectiveWeight(0);
      a.play();
      return a;
    };
    // All actions stay active and are scrubbed manually (mixer.update(0)); only the weights change.
    this.idle = action(idleClip);
    this.walk = action(walkClip);
    this.run = action(runClip);
    // Without a jump clip the airborne pose is the flight phase of the run cycle.
    this.airAction = jumpClip ? action(jumpClip) : this.mixer.clipAction(runClip.clone()).setEffectiveWeight(0).play();
    if (this.turnInPlace) {
      if (turnLClip) this.turnL = action(turnLClip);
      if (turnRClip) this.turnR = action(turnRClip);
    }

    // Normalise: idle pose -> skinned bounds -> scale to 1.72 m with the soles on y = 0.
    this.pose(this.idle, 0);
    const box = new THREE.Box3();
    const bv = new THREE.Vector3();
    for (const mesh of skinned) {
      if (budget > 0) {
        // The same loop as SkinnedMesh.computeBoundingBox, cut into slices (one mesh can have tens of thousands of vertices).
        const bb = mesh.boundingBox ?? (mesh.boundingBox = new THREE.Box3());
        bb.makeEmpty();
        const n = mesh.geometry.attributes.position.count;
        for (let i = 0; i < n; i++) {
          mesh.getVertexPosition(i, bv);
          bb.expandByPoint(bv);
          if ((i & 63) === 63 && slice.due()) { slice.cut('bbox'); yield; slice.resume(); }
        }
      } else mesh.computeBoundingBox();
      // The first draw would otherwise compute the sphere by skinning every vertex on the CPU (12-22 ms for one 21-33k-vertex mesh, in the frame
      // that first draws the model). The box's sphere encloses the same points; frustum culling only needs a conservative one.
      if (lean) mesh.boundingSphere = mesh.boundingBox!.getBoundingSphere(new THREE.Sphere());
      box.union(mesh.boundingBox!.clone().applyMatrix4(mesh.matrixWorld));
    }
    const height = box.max.y - box.min.y;
    if (!(height > 1e-6) || !Number.isFinite(height)) throw new Error('character model has degenerate bounds');
    const s = targetHeight / height;
    this.model.scale.multiplyScalar(s);
    this.model.position.multiplyScalar(s);
    this.model.position.y -= box.min.y * s;
    lap('bbox');
    cut(); yield; resume();

    // Measure the gait of each clip (stride per cycle, foot phase, facing direction).
    const feet = findFeet(this.model, opts.feet);
    this.walkGait = this.measureGait(this.walk, feet, FALLBACK_STRIDE.walk * (targetHeight / CHARACTER_HEIGHT));
    cut(); yield; resume();
    this.runGait = this.measureGait(this.run, feet, FALLBACK_STRIDE.run * (targetHeight / CHARACTER_HEIGHT));
    if (this.walkGait.facing < 0 && this.runGait.facing < 0) this.model.rotation.y += Math.PI;
    cut(); yield; resume();
    this.airTime = this.findAirTime(this.airAction, feet, jumpClip ? 0.5 : 0.25);
    lap('gait');
    cut(); yield; resume();
    // Profile fine-tuning, after the measurements (they only depend on the normalised proportions).
    if (opts.yawFix) this.model.rotation.y += opts.yawFix;
    if (opts.scale && opts.scale > 0 && opts.scale !== 1) this.model.scale.multiplyScalar(opts.scale);
    if (opts.offset) this.model.position.add(new THREE.Vector3(...opts.offset));

    // An authored jump pose (an explicitly named clip) has its own ground offset: its shoes sit below the root. Keep the
    // lowest sole vertices so update() can lift the model by exactly that much while the pose is blended in or out.
    const wantSole = !!(jumpClip && names.jump && findClipByName(src.animations, names.jump) === jumpClip);
    if (!lean) {
      if (wantSole) this.collectSoleVertices(skinned, targetHeight);
      lap('sole');
    } else {
      // Lean: the candidates are found on the original (indexed) geometry; the crease then runs, and the candidates are
      // translated to the creased vertices that carry the same position (see `soleCandidates`).
      const pending = wantSole ? yield* this.soleCandidates(skinned, targetHeight, slice) : [];
      lap('sole');
      cut(); yield; resume();
      const sole: { mesh: THREE.SkinnedMesh; index: number }[] = [];
      for (const mesh of skinned) {
        const orig = mesh.geometry;
        const origIndex = orig.index ? orig.index.array : null;
        let creased: THREE.BufferGeometry | null = null;
        const cached = creasedCache.get(orig);
        if (cached) {
          creased = cached.clone();
          lap('crease'); cut(); yield; resume();
        } else {
          try {
            const it = creasedNormalsSteps(orig, (70 * Math.PI) / 180);
            for (;;) {
              const r = it.next();
              if (r.done) { creased = r.value; break; }
              lap('crease'); cut(); yield; resume();
            }
            if (creased && creased !== orig) creasedCache.set(orig, creased.clone());
          } catch { creased = null; /* keep the authored normals */ }
        }
        lap('crease');
        if (creased && creased !== orig) mesh.geometry = creased;
        const mine = pending.find((p) => p.mesh === mesh);
        if (mine) {
          if (creased && origIndex && creased !== orig) {
            // The creased geometry has one vertex per corner (3 * face + n): the first corner that uses a candidate.
            const want = new Map<number, true>(mine.indices.map((i) => [i, true]));
            const found = new Map<number, number>();
            for (let c = 0; c < origIndex.length && found.size < want.size; c++) {
              const v = origIndex[c];
              if (want.has(v) && !found.has(v)) found.set(v, c);
              if ((c & 4095) === 4095 && slice.due()) { slice.cut('sole'); yield; slice.resume(); }
            }
            for (const c of found.values()) sole.push({ mesh, index: c });
          } else {
            for (const i of mine.indices) sole.push({ mesh, index: i });
          }
        }
        cut(); yield; resume();
      }
      if (sole.length) this.soleVerts = sole;
    }
    this.baseY = this.model.position.y;

    this.update(0, { speed: 0, grounded: true, vy: 0 });
    lap('final');
    cut();
    if (opts.onStage) { for (const [k, v] of Object.entries(stages)) opts.onStage(k, v); opts.onStage('maxChunk', longest); if (lean && longestAt) opts.onStage(`maxChunk.${longestAt}`, longest); }
  }

  /**
   * Lean build: the sole candidates on the ORIGINAL geometry, one per distinct skinned position. Two source vertices with the
   * same position, bone indices and bone weights skin to the same point in every pose, so keeping one of them leaves the
   * minimum height (all `soleDepth` needs) unchanged. Vertices no triangle uses are not candidates (the creased geometry
   * has no such vertex), exactly as in `collectSoleVertices`.
   */
  private *soleCandidates(skinned: THREE.SkinnedMesh[], targetHeight: number, slice: Slicer): Generator<void, { mesh: THREE.SkinnedMesh; indices: number[] }[], void> {
    this.pose(this.idle, 0);
    const v = new THREE.Vector3();
    const limit = this.root.position.y + 0.25 * (targetHeight / CHARACTER_HEIGHT);
    const out: { mesh: THREE.SkinnedMesh; indices: number[] }[] = [];
    for (const mesh of skinned) {
      const g = mesh.geometry;
      const pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
      const n = pos.count;
      let used: Uint8Array | null = null;
      if (g.index) { used = new Uint8Array(n); const a = g.index.array; for (let i = 0; i < a.length; i++) used[a[i]] = 1; }
      const seen = new Set<string>();
      const indices: number[] = [];
      for (let i = 0; i < n; i++) {
        if ((i & 63) === 63 && slice.due()) { slice.cut('sole'); yield; slice.resume(); }
        if (used && !used[i]) continue;
        mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld);
        if (v.y > limit) continue;
        const key = `${pos.getX(i)},${pos.getY(i)},${pos.getZ(i)}|${si.getX(i)},${si.getY(i)},${si.getZ(i)},${si.getW(i)}|${sw.getX(i)},${sw.getY(i)},${sw.getZ(i)},${sw.getW(i)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        indices.push(i);
      }
      out.push({ mesh, indices });
    }
    return yield* this.reduceSole(out, slice);
  }

  /**
   * Lean build: keep, of the deduplicated candidates, only those that are among the lowest vertices in some sampled pose.
   * soleDepth() needs the lowest sole vertex of the current pose only; the sampled poses are the jump clip's apex pose blended
   * (weights .9 / .6 / .3 / .1, as update() does while the air weight eases in and out) with idle, walk, run and walk+run at
   * three gait phases, plus the pure apex pose. The vertices next to the lowest one in a pose stand at nearly the same
   * height, so an unsampled blend picks a kept neighbour a few millimetres off at most (tests/unit/char-p5.test.ts measures it
   * on random blends). The runtime scan then skins several times fewer vertices per airborne frame.
   */
  private *reduceSole(
    sets: { mesh: THREE.SkinnedMesh; indices: number[] }[],
    slice: Slicer,
  ): Generator<void, { mesh: THREE.SkinnedMesh; indices: number[] }[], void> {
    const total = sets.reduce((a, s) => a + s.indices.length, 0);
    if (total <= SOLE_KEEP_PER_POSE * 2) return sets;
    const keep = sets.map(() => new Set<number>());
    const v = new THREE.Vector3();
    const dI = this.idle.getClip().duration, dW = this.walk.getClip().duration, dR = this.run.getClip().duration;
    const poses: number[][] = []; // [airW, idleW, walkW, runW, phase]
    poses.push([1, 0, 0, 0, 0]);
    for (const wj of [0.9, 0.6, 0.3, 0.1]) {
      const rest = 1 - wj;
      poses.push([wj, rest, 0, 0, 0]);
      for (const ph of [0, 1 / 3, 2 / 3]) {
        poses.push([wj, 0, rest, 0, ph], [wj, 0, 0, rest, ph], [wj, 0, rest / 2, rest / 2, ph]);
      }
    }
    for (const [wj, wi, ww, wr, ph] of poses) {
      for (const a of this.actions()) a.setEffectiveWeight(0);
      this.airAction.setEffectiveWeight(wj);
      this.idle.setEffectiveWeight(wi);
      this.walk.setEffectiveWeight(ww);
      this.run.setEffectiveWeight(wr);
      this.idle.time = ph * dI;
      this.walk.time = ph * dW;
      this.run.time = ph * dR;
      this.airAction.time = this.airTime;
      this.mixer.update(0);
      this.root.updateMatrixWorld(true);
      // The SOLE_KEEP_PER_POSE lowest candidates of this pose, over all meshes.
      const best: { y: number; m: number; i: number }[] = [];
      for (let m = 0; m < sets.length; m++) {
        const { mesh, indices } = sets[m];
        for (let k = 0; k < indices.length; k++) {
          mesh.getVertexPosition(indices[k], v).applyMatrix4(mesh.matrixWorld);
          const y = v.y;
          if (best.length < SOLE_KEEP_PER_POSE || y < best[best.length - 1].y) {
            let at = best.length;
            while (at > 0 && best[at - 1].y > y) at--;
            best.splice(at, 0, { y, m, i: indices[k] });
            if (best.length > SOLE_KEEP_PER_POSE) best.pop();
          }
        }
      }
      for (const b of best) keep[b.m].add(b.i);
      if (slice.due()) { slice.cut('sole'); yield; slice.resume(); }
    }
    return sets.map((s, m) => ({ mesh: s.mesh, indices: s.indices.filter((i) => keep[m].has(i)) }));
  }

  /** The skinned vertices within 0.25 m of the soles in the idle pose: whichever of them is lowest is the sole in any pose. */
  private collectSoleVertices(skinned: THREE.SkinnedMesh[], targetHeight: number): void {
    this.pose(this.idle, 0);
    const v = new THREE.Vector3();
    const limit = this.root.position.y + 0.25 * (targetHeight / CHARACTER_HEIGHT);
    const out: { mesh: THREE.SkinnedMesh; index: number }[] = [];
    for (const mesh of skinned) {
      const n = mesh.geometry.attributes.position.count;
      for (let i = 0; i < n; i++) {
        mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld);
        if (v.y <= limit) out.push({ mesh, index: i });
      }
    }
    if (out.length) this.soleVerts = out;
  }

  /** Metres the lowest sole vertex is below the root (0 when none is). Expects the pose and matrices to be current. */
  private soleDepth(): number {
    const v = new THREE.Vector3();
    const rootY = this.root.matrixWorld.elements[13];
    let low = Infinity;
    for (const { mesh, index } of this.soleVerts!) {
      mesh.getVertexPosition(index, v).applyMatrix4(mesh.matrixWorld);
      if (v.y < low) low = v.y;
    }
    return Math.max(0, rootY - low);
  }

  /** Show a single action at a given time (used while measuring; update() restores the blend). */
  private pose(a: THREE.AnimationAction, time: number): void {
    for (const o of this.actions()) o.setEffectiveWeight(o === a ? 1 : 0);
    a.time = time;
    this.mixer.update(0);
    this.root.updateMatrixWorld(true);
  }

  private actions(): THREE.AnimationAction[] {
    const all = [this.idle, this.walk, this.run, this.airAction];
    if (this.turnL) all.push(this.turnL);
    if (this.turnR) all.push(this.turnR);
    return all;
  }

  private sampleFeet(a: THREE.AnimationAction, feet: [THREE.Object3D, THREE.Object3D]): THREE.Vector3[][] {
    const dur = a.getClip().duration;
    const out: THREE.Vector3[][] = [[], []];
    for (let i = 0; i < SAMPLES; i++) {
      this.pose(a, (i / SAMPLES) * dur);
      for (let f = 0; f < 2; f++) out[f].push(feet[f].getWorldPosition(new THREE.Vector3()));
    }
    return out;
  }

  private measureGait(a: THREE.AnimationAction, feet: [THREE.Object3D, THREE.Object3D] | null, fallback: number): Gait {
    const gait: Gait = { stride: fallback, offset: 0, facing: 1 };
    const dur = a.getClip().duration;
    if (!feet || dur <= 0) return gait;
    const pos = this.sampleFeet(a, feet);
    const dt = dur / SAMPLES;
    // Stance = the foot is near its lowest point; its speed relative to the body is the ground speed.
    let v = 0; // mean of the two feet; negative when the model faces +Z
    for (const p of pos) {
      const speeds: number[] = [];
      const ys = p.map((q) => q.y);
      const lo = Math.min(...ys), hi = Math.max(...ys);
      for (let i = 0; i < SAMPLES; i++) {
        if (p[i].y > lo + (hi - lo) * 0.15) continue;
        const next = p[(i + 1) % SAMPLES], prev = p[(i + SAMPLES - 1) % SAMPLES];
        speeds.push((next.z - prev.z) / (2 * dt));
      }
      if (!speeds.length) return gait;
      // Median: the foot eases in and out at touch-down and toe-off, which would bias a mean.
      speeds.sort((x, y) => x - y);
      v += speeds[speeds.length >> 1] / pos.length;
    }
    gait.facing = v <= 0 ? 1 : -1;
    const stride = Math.abs(v) * dur;
    if (Number.isFinite(stride) && stride > fallback * 0.4 && stride < fallback * 2.5) gait.stride = stride;
    let best = 0;
    for (let i = 1; i < SAMPLES; i++) {
      if ((pos[0][i].z - pos[1][i].z) * gait.facing > (pos[0][best].z - pos[1][best].z) * gait.facing) best = i;
    }
    gait.offset = best / SAMPLES;
    return gait;
  }

  /** Time in the airborne clip at which both feet are highest off the ground. */
  private findAirTime(a: THREE.AnimationAction, feet: [THREE.Object3D, THREE.Object3D] | null, fallbackFrac: number): number {
    const dur = a.getClip().duration;
    if (!feet) return dur * fallbackFrac;
    const pos = this.sampleFeet(a, feet);
    let best = 0, bestY = -Infinity;
    for (let i = 0; i < SAMPLES; i++) {
      const y = Math.min(pos[0][i].y, pos[1][i].y);
      if (y > bestY) { bestY = y; best = i; }
    }
    return (best / SAMPLES) * dur;
  }

  update(dt: number, s: CharacterState): void {
    const k = 1 - Math.exp(-dt * 10);
    // Body yaw rate (rad/s, positive = turning to the character's left), from the root the controller rotates.
    const yaw = this.root.rotation.y;
    let rate = 0;
    if (this.yawPrev !== null && dt > 0) rate = Math.atan2(Math.sin(yaw - this.yawPrev), Math.cos(yaw - this.yawPrev)) / dt;
    this.yawPrev = yaw;
    this.yawRate += (rate - this.yawRate) * (dt > 0 ? 1 - Math.exp(-dt * 20) : 1);
    const turning = this.turnInPlace && s.grounded && s.speed <= 0.15 && Math.abs(this.yawRate) > 0.5 ? 1 : 0;
    this.turn += (turning - this.turn) * k;
    if (dt === 0) this.turn = turning;
    const turnClips = !!(this.turnL || this.turnR);

    const run01 = THREE.MathUtils.clamp((s.speed - RUN_BLEND_START) / (RUN_BLEND_END - RUN_BLEND_START), 0, 1);
    this.move += ((s.speed > 0.15 ? 1 : 0) - this.move) * k;
    this.runBlend += (run01 - this.runBlend) * k;
    this.air += ((s.grounded ? 0 : 1) - this.air) * (1 - Math.exp(-dt * 12));
    if (dt === 0) {
      this.move = s.speed > 0.15 ? 1 : 0;
      this.runBlend = run01;
      this.air = s.grounded ? 0 : 1;
    }

    // Advance the shared gait phase by distance travelled so both cycles stay locked to the ground.
    // Turning on the spot without turn clips: a slowed walk cycle, as if stepping around the heel.
    const stride = THREE.MathUtils.lerp(this.walkGait.stride, this.runGait.stride, this.runBlend);
    const stepSpeed = turnClips ? s.speed : Math.max(s.speed, this.turn * Math.min(Math.abs(this.yawRate) * 0.3, 0.9));
    if (s.grounded) this.phase = (this.phase + (stepSpeed * dt * this.rate) / stride) % 1;
    this.idleT += dt * this.rate;
    // The turn clips are one-shot 90 degree turns: start each turn from the first frame, not from wherever the loop was.
    if (this.turn < 0.02) this.turnT = 0;
    this.turnT += dt * this.rate;

    const ground = 1 - this.air;
    const walkMove = turnClips ? this.move : Math.max(this.move, this.turn);
    const still = ground * (1 - walkMove);
    const turnW = turnClips ? still * this.turn : 0;
    this.idle.setEffectiveWeight(still - turnW);
    this.walk.setEffectiveWeight(ground * walkMove * (1 - this.runBlend));
    this.run.setEffectiveWeight(ground * walkMove * this.runBlend);
    this.airAction.setEffectiveWeight(this.air);
    const left = this.yawRate > 0;
    // A character with only one turn clip uses it for both directions.
    const wl = this.turnL && (left || !this.turnR) ? turnW : 0;
    const wr = this.turnR && (!left || !this.turnL) ? turnW : 0;
    this.turnL?.setEffectiveWeight(wl);
    this.turnR?.setEffectiveWeight(wr);

    this.idle.time = this.idleT % this.idle.getClip().duration;
    this.walk.time = ((this.phase + this.walkGait.offset) % 1) * this.walk.getClip().duration;
    this.run.time = ((this.phase + this.runGait.offset) % 1) * this.run.getClip().duration;
    this.airAction.time = this.airTime;
    if (this.turnL) this.turnL.time = this.turnT % this.turnL.getClip().duration;
    if (this.turnR) this.turnR.time = this.turnT % this.turnR.getClip().duration;
    this.mixer.update(0);
    // A jump pose that is blended in or out must not push the shoes through the ground: lift the model by the measured depth.
    if (this.soleVerts) {
      this.model.position.y = this.baseY;
      if (this.air > 0.005) {
        if (!this.lean) {
          // The CHAR-P4 path, unchanged. updateMatrixWorld, not updateWorldMatrix: only the former refreshes a SkinnedMesh's
          // inverse bind matrix.
          this.root.updateMatrixWorld(true);
          this.model.position.y = this.baseY + this.soleDepth();
        } else {
          // CHAR-P5 (lean): the lift depends on the pose only (action weights and times; the root's own move or yaw shifts
          // the sole and the root alike), so an unchanged pose reuses the last scan (the apex of a long jump or fall).
          let depth = this.cachedSoleDepth();
          if (depth < 0) {
            this.root.updateMatrixWorld(true);
            depth = this.soleDepth();
            this.soleSigDepth = depth;
          }
          this.model.position.y = this.baseY + depth;
        }
      }
    }
  }

  /** The depth of the last scan when the pose is unchanged since it (weights within 1e-6, times of the active actions equal), else -1. */
  private cachedSoleDepth(): number {
    const all = this.actions();
    const sig = this.soleSig ?? (this.soleSig = new Float64Array(all.length * 2).fill(NaN));
    let same = true;
    for (let i = 0; i < all.length; i++) {
      const w = all[i].getEffectiveWeight(), t = all[i].time;
      const w0 = sig[2 * i], t0 = sig[2 * i + 1];
      if (!(Math.abs(w - w0) <= 1e-6) || (w > 1e-6 && !(Math.abs(t - t0) <= 1e-9))) same = false;
    }
    if (same) return this.soleSigDepth;
    // A new pose: remember it now (the caller stores the depth it measures right after).
    for (let i = 0; i < all.length; i++) { sig[2 * i] = all[i].getEffectiveWeight(); sig[2 * i + 1] = all[i].time; }
    return -1;
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
    const skeletons = new Set<THREE.Skeleton>();
    this.root.traverse((o) => {
      const mesh = o as THREE.SkinnedMesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) disposeMaterial(m);
      if (mesh.isSkinnedMesh && mesh.skeleton) skeletons.add(mesh.skeleton);
    });
    for (const sk of skeletons) sk.dispose();
    this.root.removeFromParent();
    this.root.clear();
  }
}

/** The world is lit with Lambert materials; the exported "PBR" values are FBX conversions, not authored. */
function toLambert(m: THREE.Material): THREE.Material {
  const std = m as THREE.MeshStandardMaterial;
  if (!std.isMeshStandardMaterial) return m;
  const out = new THREE.MeshLambertMaterial({
    name: std.name,
    color: std.color,
    map: std.map,
    vertexColors: std.vertexColors,
    transparent: std.transparent,
    opacity: std.opacity,
    alphaTest: std.alphaTest,
    side: std.side,
  });
  std.dispose();
  return out;
}

function disposeMaterial(m: THREE.Material): void {
  for (const value of Object.values(m)) {
    if (value && (value as THREE.Texture).isTexture) (value as THREE.Texture).dispose();
  }
  m.dispose();
}

/** Left and right foot bones, matched on common naming schemes (Foot.L, LeftFoot, mixamorigLeftFoot, foot_r, "Bip01 L Foot"...). */
function findFeet(model: THREE.Object3D, names?: readonly [string, string]): [THREE.Object3D, THREE.Object3D] | null {
  if (names) {
    const l = model.getObjectByName(names[0]), r = model.getObjectByName(names[1]);
    if (l && r) return [l, r];
  }
  let left: THREE.Object3D | null = null, right: THREE.Object3D | null = null;
  model.traverse((o) => {
    const n = o.name.toLowerCase();
    if (!(o as THREE.Bone).isBone || !n.includes('foot')) return;
    const rest = n.replace('foot', '').trim();
    if (!left && /(left|(^|[^a-z])l$|^l([^a-z]|$))/.test(rest)) left = o;
    else if (!right && /(right|(^|[^a-z])r$|^r([^a-z]|$))/.test(rest)) right = o;
  });
  return left && right ? [left, right] : null;
}
