import * as THREE from 'three';
import type { CollisionWorld } from '../world/CollisionWorld.ts';
import type { Input } from './Input.ts';
import type { CharacterVisual } from './CharacterAnimator.ts';

export const PLAYER = {
  radius: 0.35,
  height: 1.72,
  /** Relaxed walking pace and a steady run (m/s); a sprint would be about 7. */
  walkSpeed: 1.6,
  runSpeed: 5.2,
  /** Ground acceleration when speeding up / changing direction, and when letting go (m/s^2). */
  accel: 9,
  decel: 11,
  /** Turn rate standing still and at full run (rad/s): a runner cannot spin on the spot. */
  turnRate: 12,
  turnRateRun: 6.5,
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
  /** Fired on every footfall (speed in m/s, whether the surface is a bridge / pier deck) and on landing. */
  onFootstep: ((speed: number, deck: boolean, impact: number) => void) | null = null;
  private stride = 0;
  private speedSmooth = 0;
  /** Returns true where the map data exists (inside the prepared area). */
  hasData: (x: number, z: number) => boolean = () => true;
  private world: CollisionWorld;

  constructor(world: CollisionWorld, visual: CharacterVisual) {
    this.world = world;
    this.visual = visual;
  }

  /**
   * Replace the character model. The new root takes over the old root's pose and visibility (so a swap while the
   * body is hidden, e.g. in the car, never pops it into view); update() rewrites the pose on the next walking frame.
   * By default the old model is disposed; pass `disposeOld: false` to dispose it elsewhere (the character registry).
   * Returns the old model.
   */
  setVisual(visual: CharacterVisual, opts: { disposeOld?: boolean } = {}): CharacterVisual {
    const old = this.visual;
    const parent = old.root.parent;
    visual.root.position.copy(old.root.position);
    // Yaw only: copying the old quaternion lets three.js decompose it as (pi, pi-h, pi) for |h| > 90 degrees, and update()
    // writes only rotation.y, so the model would render mirrored (CHAR-P2a review F1).
    visual.root.rotation.set(0, this.heading, 0);
    visual.root.visible = old.root.visible;
    parent?.remove(old.root);
    if (opts.disposeOld !== false) old.dispose();
    this.visual = visual;
    parent?.add(visual.root);
    return old;
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
    // Acceleration eases off as the target speed is approached (no abrupt snap to full speed), and
    // stopping takes a few steps instead of freezing the character in place.
    const speedNow = Math.hypot(v.x, v.z);
    const base = wishLen > 1e-4 ? PLAYER.accel : PLAYER.decel;
    const rate = base * (0.45 + 0.55 * Math.min(1, dv / 2.5)) * (this.grounded ? 1 : 0.3);
    if (dv > 1e-6) {
      const f = Math.min(1, (rate * dt) / dv);
      v.x += dvx * f;
      v.z += dvz * f;
    }

    // Turn toward the direction of travel; the faster the character moves, the wider the turn.
    if (wishLen > 1e-4) {
      const target = Math.atan2(wishX, wishZ);
      let d = target - this.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const k = Math.min(1, speedNow / PLAYER.runSpeed);
      const maxTurn = (PLAYER.turnRate + (PLAYER.turnRateRun - PLAYER.turnRate) * k) * dt;
      // Ease into the final few degrees so the body does not snap to its heading.
      const want = d * Math.min(1, dt * 14);
      this.heading += Math.abs(want) < maxTurn ? want : Math.sign(d) * maxTurn;
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
        this.onFootstep?.(Math.hypot(v.x, v.z), st.deck, Math.min(2.2, 1.1 + -v.y * 0.12));
        p.y = st.h;
        v.y = 0;
        this.grounded = true;
        this.stride = 0;
      }
    }
    if (this.grounded) {
      this.onDeck = st.deck;
      // Footfalls: one per step length, which grows with speed (0.78 m walking, about 1.25 m running).
      const sp = Math.hypot(v.x, v.z);
      this.speedSmooth += (sp - this.speedSmooth) * Math.min(1, dt * 8);
      if (sp > 0.5) {
        this.stride += sp * dt;
        const stepLen = 0.56 + 0.135 * this.speedSmooth;
        if (this.stride >= stepLen) {
          this.stride -= stepLen;
          this.onFootstep?.(sp, st.deck, 1);
        }
      } else this.stride = 0.3;
    }
  }
}
