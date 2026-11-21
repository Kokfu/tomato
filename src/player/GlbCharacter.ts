import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CharacterState, CharacterVisual } from './CharacterAnimator.ts';

/** The parts of a loaded glTF that the character needs (matches three's GLTF result). */
export interface CharacterSource {
  scene: THREE.Object3D;
  animations: THREE.AnimationClip[];
}

export const CHARACTER_HEIGHT = 1.72;

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
  private model: THREE.Object3D;
  private mixer: THREE.AnimationMixer;
  private idle: THREE.AnimationAction;
  private walk: THREE.AnimationAction;
  private run: THREE.AnimationAction;
  private airAction: THREE.AnimationAction;
  private turnL: THREE.AnimationAction | null = null;
  private turnR: THREE.AnimationAction | null = null;
  private readonly rate: number;
  private readonly turnInPlace: boolean;
  private turn = 0;
  private turnT = 0;
  private yawPrev: number | null = null;
  private yawRate = 0;
  private walkGait: Gait;
  private runGait: Gait;
  private airTime = 0;
  /** Only for an explicitly named jump clip: the shoe vertices that can reach the ground, and the model's resting height. */
  private soleVerts: { mesh: THREE.SkinnedMesh; index: number }[] | null = null;
  private baseY = 0;
  private phase = 0;
  private idleT = 0;
  private move = 0;
  private runBlend = 0;
  private air = 0;

  /** Throws when the source has no skinned mesh or lacks an idle, walk or run clip. */
  constructor(src: CharacterSource, opts: GlbCharacterOptions = {}) {
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
      try { mesh.geometry = toCreasedNormals(mesh.geometry, (70 * Math.PI) / 180); } catch { /* keep the authored normals */ }
      if (mesh.isSkinnedMesh) skinned.push(mesh);
    });
    if (!skinned.length) throw new Error('character model has no skinned mesh');

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
    for (const mesh of skinned) {
      mesh.computeBoundingBox();
      box.union(mesh.boundingBox!.clone().applyMatrix4(mesh.matrixWorld));
    }
    const height = box.max.y - box.min.y;
    if (!(height > 1e-6) || !Number.isFinite(height)) throw new Error('character model has degenerate bounds');
    const s = targetHeight / height;
    this.model.scale.multiplyScalar(s);
    this.model.position.multiplyScalar(s);
    this.model.position.y -= box.min.y * s;

    // Measure the gait of each clip (stride per cycle, foot phase, facing direction).
    const feet = findFeet(this.model, opts.feet);
    this.walkGait = this.measureGait(this.walk, feet, FALLBACK_STRIDE.walk * (targetHeight / CHARACTER_HEIGHT));
    this.runGait = this.measureGait(this.run, feet, FALLBACK_STRIDE.run * (targetHeight / CHARACTER_HEIGHT));
    if (this.walkGait.facing < 0 && this.runGait.facing < 0) this.model.rotation.y += Math.PI;
    this.airTime = this.findAirTime(this.airAction, feet, jumpClip ? 0.5 : 0.25);
    // Profile fine-tuning, after the measurements (they only depend on the normalised proportions).
    if (opts.yawFix) this.model.rotation.y += opts.yawFix;
    if (opts.scale && opts.scale > 0 && opts.scale !== 1) this.model.scale.multiplyScalar(opts.scale);
    if (opts.offset) this.model.position.add(new THREE.Vector3(...opts.offset));

    // An authored jump pose (an explicitly named clip) has its own ground offset: its shoes sit below the root. Keep the
    // lowest sole vertices so update() can lift the model by exactly that much while the pose is blended in or out.
    if (jumpClip && names.jump && findClipByName(src.animations, names.jump) === jumpClip) this.collectSoleVertices(skinned, targetHeight);
    this.baseY = this.model.position.y;

    this.update(0, { speed: 0, grounded: true, vy: 0 });
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
        // updateMatrixWorld, not updateWorldMatrix: only the former refreshes a SkinnedMesh's inverse bind matrix.
        this.root.updateMatrixWorld(true);
        this.model.position.y = this.baseY + this.soleDepth();
      }
    }
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
