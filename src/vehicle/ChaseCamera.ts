// Third-person driving camera. Separate from the walking camera (ThirdPersonCamera) and the OP fly
// camera, which are untouched: this one is only updated while the player is in the car.
import * as THREE from 'three';
import type { CollisionWorld } from '../world/CollisionWorld.ts';
import type { Input } from '../player/Input.ts';
import type { VehicleBody } from './VehiclePhysics.ts';

export const CHASE = {
  minDist: 3.6,
  maxDist: 14,
  defaultDist: 6.6,
  /** V cycles the boom through these lengths (near, standard, far); the mouse wheel sets any length in between. */
  presets: [4.8, 6.6, 9.2],
  minPitch: -0.08,
  maxPitch: 1.2,
  defaultPitch: 0.2,
  /** Height of the look-at pivot above the road (roughly the roof line). */
  pivot: 1.35,
  /**
   * Room kept between the camera and a wall. The near plane (0.3 m) reaches about 0.4 m sideways at the widest
   * field of view, so with less room its corners show the inside of a wall the camera runs along.
   */
  wallMargin: 0.45,
  /** Field of view at rest and at top speed (degrees). */
  fov: 60,
  fovFast: 74,
  /** Seconds without mouse / touch look before the camera swings back behind the car. */
  recentreDelay: 1.1,
  /** How far the camera looks into a turn (seconds of yaw rate) and the cap on that lead (rad). */
  steerLead: 0.24,
  steerLeadMax: 0.3,
  /**
   * Reversing faster than `reverseSpeed` (m/s) for `reverseDelay` seconds turns the camera to look over the tail; it
   * comes back once the car drives forward. Short shunts (parking, three-point turns) keep the view ahead.
   */
  reverseDelay: 1.5,
  reverseSpeed: 2.5,
  /** Fastest the automatic follow swings the camera round, on top of the car's own turning (rad/s). */
  maxSwing: 2.6,
  /** Pivot follow rates (1/s): on the ground plane, and up / down. */
  followRate: 18,
  followRateY: 8,
};

const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * One step of a first-order follower (rate k) chasing a target that moved from `prev` to `next` during dt, taken as
 * moving steadily over the step. Exact for that motion, so the follower trails a moving target by the same distance
 * (velocity / k) at every frame rate; `cur += (next - cur) * damp(k, dt)` trails it by an amount that depends on dt.
 */
export function follow(cur: number, prev: number, next: number, k: number, dt: number): number {
  if (dt <= 0) return cur;
  const lag = (next - prev) / dt / k;
  return next - lag - (prev - cur - lag) * Math.exp(-k * dt);
}

/** The parts of CollisionWorld the camera uses. */
export type CameraWorld = Pick<CollisionWorld, 'rayWalls' | 'groundAt' | 'insideBuilding'>;

export class ChaseCamera {
  readonly camera: THREE.PerspectiveCamera;
  /** Orbit yaw, same convention as the walking camera: the view direction is (-sin yaw, -cos yaw). */
  yaw = 0;
  pitch = CHASE.defaultPitch;
  /** Boom length the player chose (mouse wheel, V). */
  distance = CHASE.defaultDist;
  /** Set false to keep the yaw exactly where it is put (automated tests). */
  autoFollow = true;
  /** Boom length shown: cut short at once by walls, eased back out once clear. */
  private current = CHASE.defaultDist;
  /** `distance` eased, so that zooming is smooth both ways (only walls cut the boom at once). */
  private zoomed = CHASE.defaultDist;
  private pivot = new THREE.Vector3();
  /** Where the pivot was heading last frame (the follower's previous target). */
  private target = new THREE.Vector3();
  private wantYaw = 0;
  private initialised = false;
  private idleLook = 10;
  private reversing = 0;
  private lookBack = false;
  /** Extra height keeping the camera above a parked car or other low obstacle under it (raised at once, eased down). */
  private clearance = 0;
  private fov = CHASE.fov;
  private world: CameraWorld;

  constructor(camera: THREE.PerspectiveCamera, world: CameraWorld) {
    this.camera = camera;
    this.world = world;
  }

  /** Jump straight behind the car (on entering it, after a reset or a teleport). */
  snap(car?: VehicleBody): void {
    this.initialised = false;
    if (car) { this.yaw = car.heading + Math.PI; this.pitch = CHASE.defaultPitch; this.idleLook = 10; this.reversing = 0; this.lookBack = false; }
  }

  /** V at the wheel: the next preset boom length (near, standard, far, then near again). */
  cycleDistance(): number {
    this.distance = CHASE.presets.find((d) => d > this.distance + 0.05) ?? CHASE.presets[0];
    return this.distance;
  }

  update(dt: number, car: VehicleBody, input: Input): void {
    const looking = input.lookYaw !== 0 || input.lookPitch !== 0;
    this.yaw += input.lookYaw;
    this.pitch = THREE.MathUtils.clamp(this.pitch - input.lookPitch, CHASE.minPitch, CHASE.maxPitch);
    if (input.zoom) this.distance = THREE.MathUtils.clamp(this.distance * (1 + input.zoom * 0.12), CHASE.minDist, CHASE.maxDist);

    // Orientation assistance: once the mouse is left alone the camera returns behind the car, leads a little
    // into the turn, and looks over the tail during a sustained reverse.
    this.idleLook = looking ? 0 : this.idleLook + dt;
    this.reversing = car.vf < -0.8 ? this.reversing + dt : 0;
    if (this.reversing > CHASE.reverseDelay && car.vf < -CHASE.reverseSpeed) this.lookBack = true;
    else if (car.vf > 0.8) this.lookBack = false;
    const speed = Math.abs(car.vf);
    const lead = THREE.MathUtils.clamp(car.yawRate * CHASE.steerLead, -CHASE.steerLeadMax, CHASE.steerLeadMax);
    const want = wrap(car.heading + (this.lookBack ? 0 : Math.PI) + lead);
    // The wanted bearing moves with the car; a jump (looking back, or ahead again) is a new target, not a fast one.
    let moved = this.initialised ? wrap(want - this.wantYaw) : 0;
    if (Math.abs(moved) > 0.4) moved = 0;
    if (this.autoFollow && this.idleLook > CHASE.recentreDelay && speed > 0.6) {
      const k = 1.2 + Math.min(3.2, speed * 0.45);
      // Followed in the frame of the new target, so that nothing wraps round inside the follower.
      const e0 = wrap(this.yaw - want);
      const e1 = follow(e0, -moved, 0, k, dt);
      // The swing is capped: turning to look back (or ahead again) is a pan, not a whip.
      const cap = CHASE.maxSwing * dt + Math.abs(moved);
      this.yaw += THREE.MathUtils.clamp(e1 - e0, -cap, cap);
      this.pitch += (CHASE.defaultPitch - this.pitch) * damp(0.6, dt);
    }
    this.wantYaw = want;
    this.yaw = wrap(this.yaw);

    // Field of view opens with speed.
    const wantFov = THREE.MathUtils.lerp(CHASE.fov, CHASE.fovFast, THREE.MathUtils.smoothstep(speed, 4, 28));
    this.fov += (wantFov - this.fov) * damp(3, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    // Unit vector from the pivot to the camera, and the camera's right vector on the ground plane.
    const dx = Math.sin(this.yaw) * cp, dy = sp, dz = Math.cos(this.yaw) * cp;
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);

    // The pivot rides a short spring behind the car, so speed changes are felt without the car leaving the frame.
    // Its lag is the same at every frame rate (follow); bumps under the wheels are smoothed out vertically.
    const wx = car.x + car.vx * 0.06, wy = car.y + CHASE.pivot, wz = car.z + car.vz * 0.06;
    if (!this.initialised || Math.hypot(wx - this.pivot.x, wz - this.pivot.z) > 15 || Math.hypot(wx - this.target.x, wz - this.target.z) > 15) {
      this.pivot.set(wx, wy, wz);
      this.current = this.zoomed = this.distance;
      this.clearance = 0;
      this.initialised = true;
    } else {
      this.pivot.x = follow(this.pivot.x, this.target.x, wx, CHASE.followRate, dt);
      this.pivot.z = follow(this.pivot.z, this.target.z, wz, CHASE.followRate, dt);
      this.pivot.y = follow(this.pivot.y, this.target.y, wy, CHASE.followRateY, dt);
    }
    this.target.set(wx, wy, wz);
    const px = this.pivot.x, py = this.pivot.y, pz = this.pivot.z;

    // Camera collision: sweep the boom against walls (centre and both sides, as wide as the near plane), then keep
    // it above the ground. Walls cut the boom at once (never a frame inside a wall); it eases back out once clear.
    this.zoomed += (this.distance - this.zoomed) * damp(6, dt);
    let allowed = this.zoomed;
    const reach = this.zoomed + CHASE.wallMargin;
    for (const s of [0, -CHASE.wallMargin, CHASE.wallMargin]) {
      // Cast from just above car-roof height: parked cars, benches and planters do not squeeze the camera, walls do.
      const hit = this.world.rayWalls(px + rx * s, py + 0.3, pz + rz * s, dx * reach, dy * reach, dz * reach);
      if (hit < 1) allowed = Math.min(allowed, Math.max(0.35, hit * reach - CHASE.wallMargin));
    }
    for (let i = 1; i <= 4; i++) {
      const d = (allowed * i) / 4;
      const gy = py + dy * d;
      const ground = this.world.groundAt(px + dx * d, pz + dz * d, gy).h + 0.3;
      if (gy < ground && dy < 0) {
        allowed = Math.min(allowed, Math.max(0.35, (py - ground) / -dy));
        break;
      }
    }
    if (allowed < this.current) this.current = allowed;
    else this.current += (allowed - this.current) * damp(3.5, dt);

    // Squeezed against a wall the boom is short: the camera rises over the roof instead of ending up inside the car.
    const lift = (1 - THREE.MathUtils.smoothstep(this.current, 1.2, 3.4)) * 1.15;
    let cx = px + dx * this.current, cy = py + dy * this.current + lift, cz = pz + dz * this.current;

    // A wall close beside the camera (the boom runs along a frontage): step away from it so the near plane stays clear.
    for (const s of [1, -1]) {
      const t = this.world.rayWalls(cx, cy, cz, rx * s * CHASE.wallMargin, 0, rz * s * CHASE.wallMargin);
      if (t < 1) { const push = (1 - t) * CHASE.wallMargin; cx -= rx * s * push; cz -= rz * s * push; }
    }

    // Low obstacles under the camera (a parked car beside the lane when the boom swings over it, a kiosk): the camera
    // rises clear of them at once instead of showing their insides, and settles back down once past.
    const inside = (h: number) => this.world.insideBuilding(cx, cz, cy + h, false);
    if (inside(this.clearance)) {
      let need = 1.8;
      for (const h of [0.45, 0.9, 1.35]) if (h > this.clearance && !inside(h)) { need = h; break; }
      this.clearance = Math.max(this.clearance, need);
    } else if (this.clearance > 0) {
      const next = this.clearance * (1 - damp(2.5, dt));
      if (!inside(next)) this.clearance = next < 0.01 ? 0 : next;
    }
    cy += this.clearance;

    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(px, py + 0.15 - lift * 0.35 + this.clearance * 0.3, pz);
  }
}
