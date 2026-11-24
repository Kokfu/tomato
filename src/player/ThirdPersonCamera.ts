import * as THREE from 'three';
import type { CollisionWorld } from '../world/CollisionWorld.ts';
import type { Input } from './Input.ts';

export const CAMERA = {
  minDist: 1.6,
  maxDist: 14,
  defaultDist: 4.4,
  minPitch: -0.35,
  maxPitch: 1.25,
  /** Height of the look-at pivot above the character's feet. */
  pivot: 1.52,
  eye: 1.62,
  wallMargin: 0.3,
  /** Sideways offset of the pivot (over-the-shoulder framing), metres at the default distance. */
  shoulder: 0.32,
  /** Field of view walking / running (degrees). */
  fov: 60,
  fovRun: 66,
  /** How quickly the pivot catches up with the character (1/s). Higher = stiffer. */
  followRate: 13,
  /** Seconds without look input before the camera starts drifting back behind the character. */
  autoFollowDelay: 1.4,
};

/** What the camera follows. A future vehicle controller provides the same shape (see docs/VEHICLES.md). */
export interface CameraTarget {
  position: THREE.Vector3;
  /** Facing angle (radians): 0 looks toward +Z, increasing toward +X. */
  heading: number;
  /** Horizontal speed, m/s. */
  speed: number;
  velocity: THREE.Vector3;
}

const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

/**
 * Third-person follow camera: orbit by mouse / touch, spring-damped follow with a little
 * look-ahead, over-the-shoulder framing, speed-dependent field of view, gentle auto-centring
 * behind the character while moving, and a swept boom that shortens smoothly at walls and ground.
 * Also provides the first-person view.
 */
export class ThirdPersonCamera {
  readonly camera: THREE.PerspectiveCamera;
  /** Orbit yaw: the camera looks along (-sin yaw, -cos yaw) on the ground plane. */
  yaw = 0;
  pitch = 0.16;
  distance = CAMERA.defaultDist;
  firstPerson = false;
  /** Set false to keep the yaw exactly where it is put (automated tests, cut-scenes). */
  autoFollow = true;
  private current = CAMERA.defaultDist;
  private pivot = new THREE.Vector3();
  private lead = new THREE.Vector2();
  private world: CollisionWorld;
  private initialised = false;
  private idleLook = 0;
  private fov = CAMERA.fov;
  private side = 1;
  /** Look-at pivot and first-person eye above the feet: per character (setProfile), the adult-man values by default. */
  private pivotH = CAMERA.pivot;
  private eyeH = CAMERA.eye;

  constructor(camera: THREE.PerspectiveCamera, world: CollisionWorld) {
    this.camera = camera;
    this.world = world;
  }

  /** Camera heights of the current character (metres above the feet). The pivot eases to its new height. */
  setProfile(p: { pivotHeight: number; eyeHeight: number }): void {
    this.pivotH = p.pivotHeight;
    this.eyeH = p.eyeHeight;
  }

  /** Current pivot and eye heights (tests, diagnostics). */
  get heights(): { pivot: number; eye: number } {
    return { pivot: this.pivotH, eye: this.eyeH };
  }

  /** Jump to the target without easing (after a teleport). */
  snap(): void {
    this.initialised = false;
  }

  update(dt: number, t: CameraTarget, input: Input): void {
    const target = t.position;
    const looking = input.lookYaw !== 0 || input.lookPitch !== 0;
    this.yaw += input.lookYaw;
    this.pitch = THREE.MathUtils.clamp(this.pitch - input.lookPitch, this.firstPerson ? -1.2 : CAMERA.minPitch, CAMERA.maxPitch);
    if (input.zoom) this.distance = THREE.MathUtils.clamp(this.distance * (1 + input.zoom * 0.12), CAMERA.minDist, CAMERA.maxDist);

    // Drift back behind the character when the player is walking and has left the mouse alone.
    this.idleLook = looking ? 0 : this.idleLook + dt;
    if (this.autoFollow && !this.firstPerson && this.idleLook > CAMERA.autoFollowDelay && t.speed > 0.8) {
      // Behind the character: camera looks along the heading, i.e. yaw = heading + PI.
      let d = t.heading + Math.PI - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      // Leave it alone when the character walks toward the camera (deliberate look-back).
      if (Math.abs(d) < 2.0) this.yaw += d * damp(0.9 * Math.min(1, t.speed / 3), dt);
    }

    // Field of view opens up slightly at running speed.
    const wantFov = THREE.MathUtils.lerp(CAMERA.fov, CAMERA.fovRun, THREE.MathUtils.smoothstep(t.speed, 2.2, 5));
    this.fov += (wantFov - this.fov) * damp(4, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    // Unit vector from the pivot to the camera, and the camera's right vector on the ground plane.
    const dx = Math.sin(this.yaw) * cp, dy = sp, dz = Math.cos(this.yaw) * cp;
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);

    if (this.firstPerson) {
      this.camera.position.set(target.x, target.y + this.eyeH, target.z);
      this.camera.lookAt(target.x - dx, target.y + this.eyeH - dy, target.z - dz);
      this.initialised = false;
      return;
    }

    // Spring-damped pivot with a small lead in the direction of travel.
    const k = damp(4, dt);
    this.lead.x += (t.velocity.x * 0.12 - this.lead.x) * k;
    this.lead.y += (t.velocity.z * 0.12 - this.lead.y) * k;
    const wx = target.x + this.lead.x, wy = target.y + this.pivotH, wz = target.z + this.lead.y;
    if (!this.initialised || Math.hypot(wx - this.pivot.x, wz - this.pivot.z) > 12) {
      this.pivot.set(wx, wy, wz);
      this.current = this.distance;
      this.initialised = true;
    } else {
      const f = damp(CAMERA.followRate, dt);
      this.pivot.x += (wx - this.pivot.x) * f;
      this.pivot.z += (wz - this.pivot.z) * f;
      this.pivot.y += (wy - this.pivot.y) * damp(9, dt);
    }

    // Shoulder offset shrinks when the boom is short so the character never leaves the frame.
    // ... and gives way in narrow places (five-foot ways, lanes): the camera centres between the walls.
    const clearR = this.world.rayWalls(this.pivot.x, this.pivot.y, this.pivot.z, rx * 1.3, 0, rz * 1.3);
    const clearL = this.world.rayWalls(this.pivot.x, this.pivot.y, this.pivot.z, -rx * 1.3, 0, -rz * 1.3);
    const wantSide = clearR < 1 ? (clearL < 1 ? (clearR - clearL) * 0.5 : -0.6) : 1;
    this.side += (wantSide - this.side) * damp(6, dt);
    const sh = CAMERA.shoulder * this.side * Math.min(1, this.current / CAMERA.defaultDist);
    const px = this.pivot.x + rx * sh, py = this.pivot.y, pz = this.pivot.z + rz * sh;

    // Boom length: sweep three rays (centre and both sides) against the walls, then keep clear of the ground.
    let allowed = this.distance;
    const reach = this.distance + CAMERA.wallMargin;
    for (const s of [0, -0.22, 0.22]) {
      const ox = px + rx * s, oz = pz + rz * s;
      const hit = this.world.rayWalls(ox, py, oz, dx * reach, dy * reach, dz * reach);
      if (hit < 1) allowed = Math.min(allowed, Math.max(0.45, hit * reach - CAMERA.wallMargin));
    }
    for (let i = 1; i <= 4; i++) {
      const d = (allowed * i) / 4;
      const gy = py + dy * d;
      const ground = this.world.groundAt(px + dx * d, pz + dz * d, gy).h + 0.28;
      if (gy < ground && dy < 0) {
        allowed = Math.min(allowed, Math.max(0.45, (py - ground) / -dy));
        break;
      }
    }
    // Pull in fast (but not as a one-frame pop), ease back out slowly.
    this.current += (allowed - this.current) * damp(allowed < this.current ? 28 : 4, dt);
    if (this.current > allowed + 0.6) this.current = allowed + 0.6;

    this.camera.position.set(px + dx * this.current, py + dy * this.current, pz + dz * this.current);
    this.camera.lookAt(px, py, pz);
  }
}
