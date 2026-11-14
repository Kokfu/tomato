import * as THREE from 'three';
import type { CollisionWorld } from '../world/CollisionWorld.ts';
import type { Input } from './Input.ts';

export const CAMERA = {
  minDist: 1.6,
  maxDist: 14,
  defaultDist: 5.2,
  minPitch: -0.35,
  maxPitch: 1.25,
  /** Height of the look-at pivot above the character's feet. */
  pivot: 1.5,
  eye: 1.62,
  wallMargin: 0.3,
};

/** GTA-style orbiting follow camera with wall/ground avoidance and an optional first-person view. */
export class ThirdPersonCamera {
  readonly camera: THREE.PerspectiveCamera;
  /** Orbit yaw: the camera looks along (-sin yaw, -cos yaw) on the ground plane. */
  yaw = 0;
  pitch = 0.22;
  distance = CAMERA.defaultDist;
  firstPerson = false;
  private current = CAMERA.defaultDist;
  private pivot = new THREE.Vector3();
  private world: CollisionWorld;
  private initialised = false;

  constructor(camera: THREE.PerspectiveCamera, world: CollisionWorld) {
    this.camera = camera;
    this.world = world;
  }

  update(dt: number, target: THREE.Vector3, input: Input): void {
    this.yaw += input.lookYaw;
    this.pitch = THREE.MathUtils.clamp(this.pitch - input.lookPitch, this.firstPerson ? -1.2 : CAMERA.minPitch, CAMERA.maxPitch);
    if (input.zoom) this.distance = THREE.MathUtils.clamp(this.distance * (1 + input.zoom * 0.12), CAMERA.minDist, CAMERA.maxDist);

    // Smoothed pivot removes the small vertical steps of terrain following.
    const want = new THREE.Vector3(target.x, target.y + CAMERA.pivot, target.z);
    if (!this.initialised) {
      this.pivot.copy(want);
      this.initialised = true;
    } else {
      this.pivot.x = want.x;
      this.pivot.z = want.z;
      this.pivot.y += (want.y - this.pivot.y) * (1 - Math.exp(-dt * 12));
    }

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    // Unit vector from the pivot to the camera.
    const dx = Math.sin(this.yaw) * cp, dy = sp, dz = Math.cos(this.yaw) * cp;

    if (this.firstPerson) {
      this.camera.position.set(target.x, target.y + CAMERA.eye, target.z);
      this.camera.lookAt(target.x - dx, target.y + CAMERA.eye - dy, target.z - dz);
      return;
    }

    // Shorten the boom when a building wall or the ground is in the way.
    let allowed = this.distance;
    const reach = this.distance + CAMERA.wallMargin;
    const t = this.world.rayWalls(this.pivot.x, this.pivot.y, this.pivot.z, dx * reach, dy * reach, dz * reach);
    if (t < 1) allowed = Math.max(0.5, t * reach - CAMERA.wallMargin);
    for (let i = 1; i <= 4; i++) {
      const d = (allowed * i) / 4;
      const gx = this.pivot.x + dx * d, gz = this.pivot.z + dz * d;
      const gy = this.pivot.y + dy * d;
      const ground = this.world.groundAt(gx, gz, gy).h + 0.25;
      if (gy < ground && dy < 0) {
        allowed = Math.min(allowed, Math.max(0.5, (this.pivot.y - ground) / -dy));
        break;
      }
    }
    // Pull in instantly, ease back out.
    if (allowed < this.current) this.current = allowed;
    else this.current += (allowed - this.current) * (1 - Math.exp(-dt * 5));

    this.camera.position.set(this.pivot.x + dx * this.current, this.pivot.y + dy * this.current, this.pivot.z + dz * this.current);
    this.camera.lookAt(this.pivot);
  }
}
