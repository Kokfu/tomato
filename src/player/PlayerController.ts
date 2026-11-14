import * as THREE from 'three';
import type { CollisionWorld } from '../world/CollisionWorld.ts';
import type { Input } from './Input.ts';
import type { CharacterVisual } from './CharacterAnimator.ts';

export const PLAYER = {
  radius: 0.35,
  height: 1.72,
  walkSpeed: 2.0,
  runSpeed: 6.0,
  accel: 14,
  decel: 18,
  turnRate: 11,
  gravity: 22,
  jumpSpeed: 5.6,
  /** A grounded character on a bridge/pier deck will not step off a drop larger than this. */
  maxDeckDrop: 1.2,
  maxSubstep: 1 / 60,
};

export type BlockReason = '' | 'water' | 'edge' | 'loading';

/** Kinematic character controller: frame-rate independent, collides with the simplified world. */
export class PlayerController {
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  /** Facing angle (radians): 0 looks toward +Z, increasing toward +X. */
  heading = Math.PI;
  grounded = true;
  onDeck = false;
  /** Why the last movement attempt was blocked (for HUD feedback). */
  blocked: BlockReason = '';
  visual: CharacterVisual;
  /** Returns true where the map data exists (inside the prepared area). */
  hasData: (x: number, z: number) => boolean = () => true;
  private world: CollisionWorld;

  constructor(world: CollisionWorld, visual: CharacterVisual) {
    this.world = world;
    this.visual = visual;
  }

  setVisual(visual: CharacterVisual): void {
    const parent = this.visual.root.parent;
    parent?.remove(this.visual.root);
    this.visual.dispose();
    this.visual = visual;
    parent?.add(visual.root);
  }

  /** Place the character on the ground at (x, z). */
  teleport(x: number, z: number): void {
    this.position.set(x, this.world.groundAt(x, z, 1e6).h, z);
    this.velocity.set(0, 0, 0);
    this.grounded = true;
  }

  get speed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  private canStand(x: number, z: number): { ok: boolean; h: number; deck: boolean } {
    const p = this.position;
    if (!this.world.isLoaded(x, z)) {
      this.blocked = this.hasData(x, z) ? 'loading' : 'edge';
      return { ok: false, h: p.y, deck: false };
    }
    const g = this.world.groundAt(x, z, p.y);
    if (!g.deck && this.world.inWater(x, z)) {
      this.blocked = 'water';
      return { ok: false, h: g.h, deck: false };
    }
    // Railing rule: do not walk off the side of an elevated deck.
    if (this.grounded && this.onDeck && g.h < p.y - PLAYER.maxDeckDrop) return { ok: false, h: g.h, deck: g.deck };
    return { ok: true, h: g.h, deck: g.deck };
  }

  update(dt: number, input: Input, cameraYaw: number): void {
    let remaining = Math.min(dt, 0.25);
    this.blocked = '';
    let jump = input.jump;
    while (remaining > 1e-6) {
      const h = Math.min(remaining, PLAYER.maxSubstep);
      this.step(h, input, cameraYaw, jump);
      jump = false;
      remaining -= h;
    }
    const root = this.visual.root;
    root.position.copy(this.position);
    root.rotation.y = this.heading;
    this.visual.update(dt, { speed: this.speed, grounded: this.grounded, vy: this.velocity.y });
  }

  private step(dt: number, input: Input, camYaw: number, jump: boolean): void {
    const p = this.position;
    const v = this.velocity;

    // Desired velocity relative to the camera. Camera forward (on the ground plane) is (-sin, -cos).
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const rx = -fz, rz = fx;
    const wishX = fx * input.moveY + rx * input.moveX;
    const wishZ = fz * input.moveY + rz * input.moveX;
    const wishLen = Math.hypot(wishX, wishZ);
    const maxSpeed = (input.run ? PLAYER.runSpeed : PLAYER.walkSpeed) * Math.min(1, wishLen);
    const tx = wishLen > 1e-4 ? (wishX / wishLen) * maxSpeed : 0;
    const tz = wishLen > 1e-4 ? (wishZ / wishLen) * maxSpeed : 0;
    const dvx = tx - v.x, dvz = tz - v.z;
    const dv = Math.hypot(dvx, dvz);
    const rate = (wishLen > 1e-4 ? PLAYER.accel : PLAYER.decel) * (this.grounded ? 1 : 0.35);
    if (dv > 1e-6) {
      const f = Math.min(1, (rate * dt) / dv);
      v.x += dvx * f;
      v.z += dvz * f;
    }

    // Smooth turning toward the direction of travel.
    if (wishLen > 1e-4) {
      const target = Math.atan2(wishX, wishZ);
      let d = target - this.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const maxTurn = PLAYER.turnRate * dt;
      this.heading += Math.abs(d) < maxTurn ? d : Math.sign(d) * maxTurn;
    }

    // Horizontal move with building push-out, then walkability checks with axis sliding.
    let nx = p.x + v.x * dt, nz = p.z + v.z * dt;
    [nx, nz] = this.world.resolve(nx, nz, PLAYER.radius, p.y);
    let st = this.canStand(nx, nz);
    if (!st.ok) {
      const sx = this.canStand(nx, p.z);
      if (sx.ok) { nz = p.z; v.z = 0; st = sx; }
      else {
        const sz = this.canStand(p.x, nz);
        if (sz.ok) { nx = p.x; v.x = 0; st = sz; }
        else { nx = p.x; nz = p.z; v.x = 0; v.z = 0; st = { ok: true, ...this.world.groundAt(p.x, p.z, p.y) }; }
      }
    }
    p.x = nx;
    p.z = nz;

    // Vertical motion.
    if (this.grounded) {
      if (jump) {
        v.y = PLAYER.jumpSpeed;
        this.grounded = false;
      } else if (st.h >= p.y - 0.55) {
        // Follow slopes and small steps smoothly.
        p.y += (st.h - p.y) * Math.min(1, dt * 30);
        if (Math.abs(st.h - p.y) < 0.002) p.y = st.h;
        v.y = 0;
      } else {
        this.grounded = false;
      }
    }
    if (!this.grounded) {
      v.y -= PLAYER.gravity * dt;
      p.y += v.y * dt;
      if (p.y <= st.h && v.y <= 0) {
        p.y = st.h;
        v.y = 0;
        this.grounded = true;
      }
    }
    if (this.grounded) this.onDeck = st.deck;
  }
}
