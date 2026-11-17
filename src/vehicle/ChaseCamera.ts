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
  minPitch: -0.08,
  maxPitch: 1.2,
  defaultPitch: 0.2,
  /** Height of the look-at pivot above the road (roughly the roof line). */
  pivot: 1.35,
  wallMargin: 0.3,
  /** Field of view at rest and at top speed (degrees). */
  fov: 60,
  fovFast: 74,
  /** Seconds without mouse / touch look before the camera swings back behind the car. */
  recentreDelay: 1.1,
  /** How far the camera looks into a turn (seconds of yaw rate) and the cap on that lead (rad). */
  steerLead: 0.24,
  steerLeadMax: 0.3,
  /** Reversing for this long turns the camera to look over the tail (seconds). */
  reverseDelay: 0.9,
};

const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class ChaseCamera {
  readonly camera: THREE.PerspectiveCamera;
  /** Orbit yaw, same convention as the walking camera: the view direction is (-sin yaw, -cos yaw). */
  yaw = 0;
  pitch = CHASE.defaultPitch;
  distance = CHASE.defaultDist;
  /** Set false to keep the yaw exactly where it is put (automated tests). */
  autoFollow = true;
  private current = CHASE.defaultDist;
  private pivot = new THREE.Vector3();
  private initialised = false;
  private idleLook = 10;
  private reversing = 0;
  private fov = CHASE.fov;
  private world: CollisionWorld;

  constructor(camera: THREE.PerspectiveCamera, world: CollisionWorld) {
    this.camera = camera;
    this.world = world;
  }

  /** Jump straight behind the car (on entering it, after a reset or a teleport). */
  snap(car?: VehicleBody): void {
    this.initialised = false;
    if (car) { this.yaw = car.heading + Math.PI; this.pitch = CHASE.defaultPitch; this.idleLook = 10; this.reversing = 0; }
  }

  update(dt: number, car: VehicleBody, input: Input): void {
    const looking = input.lookYaw !== 0 || input.lookPitch !== 0;
    this.yaw += input.lookYaw;
    this.pitch = THREE.MathUtils.clamp(this.pitch - input.lookPitch, CHASE.minPitch, CHASE.maxPitch);
    if (input.zoom) this.distance = THREE.MathUtils.clamp(this.distance * (1 + input.zoom * 0.12), CHASE.minDist, CHASE.maxDist);

    // Orientation assistance: once the mouse is left alone the camera returns behind the car, leads a little
    // into the turn, and looks over the tail while reversing.
    this.idleLook = looking ? 0 : this.idleLook + dt;
    this.reversing = car.vf < -0.8 ? this.reversing + dt : 0;
    const speed = Math.abs(car.vf);
    if (this.autoFollow && this.idleLook > CHASE.recentreDelay && speed > 0.6) {
      const back = this.reversing > CHASE.reverseDelay;
      const lead = THREE.MathUtils.clamp(car.yawRate * CHASE.steerLead, -CHASE.steerLeadMax, CHASE.steerLeadMax);
      const want = car.heading + (back ? 0 : Math.PI) + lead;
      this.yaw += wrap(want - this.yaw) * damp(1.2 + Math.min(3.2, speed * 0.45), dt);
      this.pitch += (CHASE.defaultPitch - this.pitch) * damp(0.6, dt);
    }
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
    const wx = car.x + car.vx * 0.06, wy = car.y + CHASE.pivot, wz = car.z + car.vz * 0.06;
    if (!this.initialised || Math.hypot(wx - this.pivot.x, wz - this.pivot.z) > 15) {
      this.pivot.set(wx, wy, wz);
      this.current = this.distance;
      this.initialised = true;
    } else {
      const f = damp(18, dt);
      this.pivot.x += (wx - this.pivot.x) * f;
      this.pivot.z += (wz - this.pivot.z) * f;
      this.pivot.y += (wy - this.pivot.y) * damp(8, dt);
    }
    const px = this.pivot.x, py = this.pivot.y, pz = this.pivot.z;

    // Camera collision: sweep the boom against walls (centre and both sides), then keep it above the ground.
    let allowed = this.distance;
    const reach = this.distance + CHASE.wallMargin;
    for (const s of [0, -0.35, 0.35]) {
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
    this.current += (allowed - this.current) * damp(allowed < this.current ? 24 : 3.5, dt);
    if (this.current > allowed + 0.6) this.current = allowed + 0.6;

    // Squeezed against a wall the boom is short: the camera rises over the roof instead of ending up inside the car.
    const lift = (1 - THREE.MathUtils.smoothstep(this.current, 1.2, 3.4)) * 1.15;
    this.camera.position.set(px + dx * this.current, py + dy * this.current + lift, pz + dz * this.current);
    this.camera.lookAt(px, py + 0.15 - lift * 0.35, pz);
  }
}
