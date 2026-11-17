// Drivable car: a kinematic bicycle model with a little lateral slip, an oriented-box body against the
// simplified collision world, and four ground probes for height, pitch and roll. No physics engine.
// Pure TypeScript (no three.js, no DOM) so that it can be unit-tested under Node with a stub world.
//
// Conventions (same as PlayerController): heading 0 looks toward +Z and increases toward +X, so
// forward = (sin h, cos h) and the car's left side is (cos h, -sin h).
import type { RoadHit } from './RoadQuery.ts';
import { onRoad } from './RoadQuery.ts';

export const CAR = {
  /** Body footprint (the compact hatchback of src/v5/vehicles.ts), metres. */
  halfLen: 1.95,
  halfWid: 0.865,
  wheelBase: 2.44,
  track: 1.5,
  wheelRadius: 0.29,
  height: 1.5,
  /** Speed at which the engine runs out of pull, forward / in reverse, m/s. Drag settles the real top speed near 95 km/h. */
  maxSpeed: 30,
  maxReverse: 7,
  /** Engine acceleration from rest, service braking, handbrake deceleration (m/s^2). */
  engine: 5.2,
  brake: 10.5,
  handbrake: 7,
  /** Rolling resistance (m/s^2) and aerodynamic drag coefficient (1/m). */
  rolling: 0.35,
  drag: 0.0012,
  /** Extra resistance off the carriageway (verges, paving, grass): constant and speed-proportional parts. */
  offRoad: 1.5,
  offRoadV: 0.32,
  /** Steering lock (rad), steering speeds (rad/s) and the lateral acceleration the tyres hold (m/s^2). */
  maxSteer: 0.6,
  steerRate: 2.4,
  steerReturn: 4.2,
  lateralGrip: 8.5,
  /** How fast sideways slip is scrubbed off (1/s): tyres gripping / rear wheels locked by the handbrake. */
  slipGrip: 12,
  slipHandbrake: 2.2,
  gravity: 9.81,
  /** A car on a bridge deck will not drive off a drop larger than this. */
  maxDeckDrop: 1.0,
  /** Height of the road surface above the terrain / deck height field (the road ribbons are drawn this much above it). */
  roadSurface: 0.07,
  maxSubstep: 1 / 120,
};

/**
 * Where the car waits: at the mouth of Jalan China (OSM way 124545031) just off Jalan Main Bazaar, on the
 * mapped carriageway beside the east frontage, facing the direction of the one-way street (toward Jalan
 * Carpenter). It is behind the last parked car of the V7 street section (9 m of clear road ahead), so the
 * car can pull straight out whichever rendering of the street is shown, and it is the first thing seen on
 * walking up from the waterfront.
 */
export const CAR_START = { x: 207.69, z: -53.85, heading: -0.588 };

export type CarBlock = '' | 'water' | 'edge' | 'loading' | 'deck';

export interface Controls {
  /** -1 (brake / reverse) ... 1 (accelerate). */
  throttle: number;
  /** -1 (left) ... 1 (right). */
  steer: number;
  handbrake: boolean;
}
export const NEUTRAL: Controls = { throttle: 0, steer: 0, handbrake: false };

/** What the car needs from the world. `CollisionWorld` + `ChunkManager` provide it in the game. */
export interface VehicleEnv {
  /** Supporting surface under a body whose underside is at height y. */
  ground(x: number, z: number, y: number): { h: number; deck: boolean };
  /** Collision data for this position is in memory. */
  loaded(x: number, z: number): boolean;
  /** Map data exists for this position (inside the prepared area). */
  hasData(x: number, z: number): boolean;
  water(x: number, z: number): boolean;
  /** Deepest overlap of the oriented body box with the blocking outlines (see CollisionWorld.boxContact). */
  boxContact(x: number, z: number, fx: number, fz: number, halfLen: number, halfWid: number, y: number): { px: number; pz: number; cx: number; cz: number } | null;
  /** Nearest drivable carriageway, or null. */
  road(x: number, z: number): RoadHit | null;
}

export interface Pose { x: number; z: number; heading: number }

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const toward = (v: number, target: number, step: number) => (Math.abs(target - v) <= step ? target : v + Math.sign(target - v) * step);

export class VehicleBody {
  x = 0; y = 0; z = 0;
  heading = 0;
  /** Speed along the body axis (negative in reverse) and sideways slip toward the left, m/s. */
  vf = 0;
  vl = 0;
  /** Front-wheel steering angle (rad, positive = toward the left = heading increasing). */
  steer = 0;
  yawRate = 0;
  /** Attitude from the ground under the wheels: nose-up pitch and left-side-up roll (rad). */
  pitch = 0;
  roll = 0;
  /** Smoothed accelerations for body lean (m/s^2): forward and toward the left. */
  accelLong = 0;
  accelLat = 0;
  /** Distance rolled by the wheels (metres, signed) for wheel spin. */
  travel = 0;
  onRoad = false;
  onDeck = false;
  road: RoadHit | null = null;
  blocked: CarBlock = '';
  /** Closing speed of the last wall contact this update (m/s), 0 if none. */
  impact = 0;
  /** Last pose at which the whole car stood on a mapped carriageway (target of the reset key). */
  lastRoad: Pose | null = null;
  private sinceRoad = 0;
  private env: VehicleEnv;

  constructor(env: VehicleEnv) {
    this.env = env;
  }

  get speed(): number { return Math.hypot(this.vf, this.vl); }
  get kmh(): number { return Math.abs(this.vf) * 3.6; }
  /** World velocity (x, z). */
  get vx(): number { const s = Math.sin(this.heading), c = Math.cos(this.heading); return s * this.vf + c * this.vl; }
  get vz(): number { const s = Math.sin(this.heading), c = Math.cos(this.heading); return c * this.vf - s * this.vl; }

  /** Put the car on the ground at a pose, at rest. */
  place(x: number, z: number, heading: number): void {
    this.x = x; this.z = z; this.heading = heading;
    this.vf = this.vl = this.steer = this.yawRate = this.accelLong = this.accelLat = 0;
    this.blocked = '';
    this.road = this.env.road(x, z);
    this.onRoad = onRoad(this.road);
    this.y = this.env.ground(x, z, 1e6).h;
    // Settle on the surface that is really under the wheels (not on a roof above them).
    const g = this.settle(1);
    this.y = g.y; this.pitch = g.pitch; this.roll = g.roll; this.onDeck = g.deck;
  }

  /** Outline of the body footprint, world metres: [x0, z0, ...] (4 corners), grown by `pad`. */
  footprint(pad = 0): number[] {
    const s = Math.sin(this.heading), c = Math.cos(this.heading), a = CAR.halfLen + pad, b = CAR.halfWid + pad;
    const out: number[] = [];
    for (const [u, v] of [[a, b], [a, -b], [-a, -b], [-a, b]]) out.push(this.x + s * u + c * v, this.z + c * u - s * v);
    return out;
  }

  /** True when the body box at a pose is clear of walls, water and unloaded ground. */
  canOccupy(x: number, z: number, heading: number, y = this.y): boolean {
    const s = Math.sin(heading), c = Math.cos(heading);
    if (this.env.boxContact(x, z, s, c, CAR.halfLen, CAR.halfWid, y)) return false;
    return this.occupancy(x, z, s, c, y) === '';
  }

  /** Why the body cannot stand at this pose ('' = it can). */
  private occupancy(x: number, z: number, s: number, c: number, y: number): CarBlock {
    const a = CAR.halfLen, b = CAR.halfWid, env = this.env;
    for (const [u, v] of [[0, 0], [a, b], [a, -b], [-a, -b], [-a, b]]) {
      const px = x + s * u + c * v, pz = z + c * u - s * v;
      if (!env.loaded(px, pz)) return env.hasData(px, pz) ? 'loading' : 'edge';
      const g = env.ground(px, pz, y);
      if (!g.deck && env.water(px, pz)) return 'water';
      // Railing rule: a car on a bridge deck does not leave it sideways.
      if (this.onDeck && g.h < y - CAR.maxDeckDrop) return 'deck';
      // Decks are for cars only where a mapped carriageway crosses them: no footbridges, jetties or piers.
      // Checked where the body first reaches a deck; once the wheels are on a road bridge it is not asked again.
      if (g.deck && !this.onDeck) {
        const r = env.road(px, pz);
        if (!r || !r.bridge || !onRoad(r)) return 'deck';
      }
    }
    return '';
  }

  /** Height, pitch and roll from the ground under the four wheels. */
  private settle(blend: number): { y: number; pitch: number; roll: number; deck: boolean } {
    const s = Math.sin(this.heading), c = Math.cos(this.heading), a = CAR.wheelBase / 2, b = CAR.track / 2, env = this.env;
    const at = (u: number, v: number) => env.ground(this.x + s * u + c * v, this.z + c * u - s * v, this.y);
    const fl = at(a, b), fr = at(a, -b), rl = at(-a, b), rr = at(-a, -b);
    const deck = fl.deck || fr.deck || rl.deck || rr.deck;
    const off = deck ? 0 : this.onRoad ? CAR.roadSurface : 0.02;
    const y = (fl.h + fr.h + rl.h + rr.h) / 4 + off;
    const pitch = Math.atan2((fl.h + fr.h - rl.h - rr.h) / 2, CAR.wheelBase);
    const roll = Math.atan2((fl.h + rl.h - fr.h - rr.h) / 2, CAR.track);
    return { y: this.y + (y - this.y) * blend, pitch: this.pitch + (pitch - this.pitch) * blend, roll: this.roll + (roll - this.roll) * blend, deck };
  }

  /** Advance by dt seconds (sub-stepped; frame-rate independent). */
  update(dt: number, controls: Controls): void {
    this.blocked = '';
    this.impact = 0;
    // The road under the car is looked up once per frame; it changes slowly compared with a sub-step.
    this.road = this.env.road(this.x, this.z);
    this.onRoad = onRoad(this.road);
    let remaining = Math.min(dt, 0.25);
    while (remaining > 1e-6) {
      const h = Math.min(remaining, CAR.maxSubstep);
      this.step(h, controls);
      remaining -= h;
    }
    // Remember the last pose with the whole body on a carriageway, about once a second while moving.
    this.sinceRoad += dt;
    const r = this.road;
    if (r && !this.blocked && r.dist <= Math.max(0, r.width / 2 - CAR.halfWid * 0.6) && Math.abs(this.vl) < 1.5 && (this.sinceRoad > 0.8 || !this.lastRoad)) {
      // Align the stored heading with the carriageway (in the direction the car is facing).
      const along = Math.sin(this.heading) * r.dx + Math.cos(this.heading) * r.dz;
      const hd = Math.atan2(r.dx, r.dz) + (along < 0 ? Math.PI : 0);
      if (Math.abs(along) > 0.5) { this.lastRoad = { x: this.x, z: this.z, heading: hd }; this.sinceRoad = 0; }
    }
  }

  private step(dt: number, c: Controls): void {
    const C = CAR;
    const vf0 = this.vf;

    // --- steering: the lock available falls with speed so that lateral acceleration stays within the tyres' grip
    const lock = Math.min(C.maxSteer, Math.atan((C.lateralGrip * C.wheelBase) / Math.max(1, this.vf * this.vf)));
    const wantSteer = -clamp(c.steer, -1, 1) * lock;
    this.steer = toward(this.steer, wantSteer, (c.steer !== 0 ? C.steerRate : C.steerReturn) * dt);
    this.steer = clamp(this.steer, -lock, lock);

    // --- longitudinal: engine, brakes, resistances, slope
    const th = clamp(c.throttle, -1, 1);
    let drive = 0, braking = 0;
    if (th > 0) {
      if (this.vf < -0.3) braking = C.brake * th;
      else drive = C.engine * th * Math.max(0, 1 - (this.vf / C.maxSpeed) ** 2);
    } else if (th < 0) {
      if (this.vf > 0.3) braking = C.brake * -th;
      else drive = C.engine * 0.7 * th * Math.max(0, 1 + this.vf / C.maxReverse);
    }
    if (c.handbrake) braking += C.handbrake;
    let resist = C.rolling + C.drag * this.vf * this.vf + braking;
    if (!this.onRoad && !this.onDeck) resist += C.offRoad + C.offRoadV * Math.abs(this.vf);
    // Slope: only while rolling or driving, so a parked car does not creep on the noise of the terrain model.
    const slope = Math.abs(this.vf) > 0.15 || th !== 0 ? -C.gravity * Math.sin(this.pitch) : 0;
    let vf = this.vf + (drive + slope) * dt;
    // Resistances oppose motion and never reverse it.
    const dec = resist * dt;
    vf = Math.abs(vf) <= dec ? 0 : vf - Math.sign(vf) * dec;
    if (th === 0 && Math.abs(vf) < 0.05) vf = 0;

    // --- yaw from the bicycle model; locked rear wheels let the tail come round
    let yawRate = (vf * Math.tan(this.steer)) / C.wheelBase;
    const sliding = c.handbrake && Math.abs(vf) > 3;
    if (sliding) yawRate *= 1.35;
    this.yawRate = yawRate;

    // World velocity before the turn, re-expressed in the turned body frame: what does not follow the nose is slip.
    let s = Math.sin(this.heading), co = Math.cos(this.heading);
    let wx = s * vf + co * this.vl, wz = co * vf - s * this.vl;
    this.heading += yawRate * dt;
    s = Math.sin(this.heading); co = Math.cos(this.heading);
    vf = wx * s + wz * co;
    let vl = (wx * co - wz * s) * Math.exp(-(sliding ? C.slipHandbrake : C.slipGrip) * dt);

    // --- move, then push the body box out of walls
    let nx = this.x + (s * vf + co * vl) * dt, nz = this.z + (co * vf - s * vl) * dt;
    for (let iter = 0; iter < 4; iter++) {
      const hit = this.env.boxContact(nx, nz, s, co, C.halfLen, C.halfWid, this.y);
      if (!hit) break;
      nx += hit.px; nz += hit.pz;
      const pl = Math.hypot(hit.px, hit.pz);
      if (pl < 1e-7) break;
      const ux = hit.px / pl, uz = hit.pz / pl;
      wx = s * vf + co * vl; wz = co * vf - s * vl;
      const vn = wx * ux + wz * uz;
      if (vn < 0) {
        // Lose the closing speed (slight bounce) and a little along the wall; glancing blows turn the nose away.
        this.impact = Math.max(this.impact, -vn);
        wx -= 1.12 * vn * ux; wz -= 1.12 * vn * uz;
        // Scraping friction in proportion to how hard the wall is hit, not to how long it is touched.
        const sp = Math.hypot(wx, wz);
        if (sp > 1e-6) { const keep = Math.max(0, 1 - (0.35 * -vn) / sp); wx *= keep; wz *= keep; }
        // The blow lands on the part of the body that reaches furthest into the wall (a corner, or a whole face).
        const uf = ux * s + uz * co, ul = ux * co - uz * s;
        const cu = Math.abs(uf) > 0.05 ? -Math.sign(uf) * C.halfLen : 0, cv = Math.abs(ul) > 0.05 ? -Math.sign(ul) * C.halfWid : 0;
        const rx = s * cu + co * cv, rz = co * cu - s * cv;
        this.heading += clamp((rz * ux - rx * uz) * -vn * 0.012, -0.035, 0.035);
        s = Math.sin(this.heading); co = Math.cos(this.heading);
        vf = wx * s + wz * co;
        vl = wx * co - wz * s;
      }
    }

    // --- water, unloaded ground, map edge, deck sides: stay where the car was
    const why = this.occupancy(nx, nz, s, co, this.y);
    if (why) {
      this.blocked = why;
      nx = this.x; nz = this.z;
      vf *= -0.08; vl = 0;
    }
    this.travel += vf * dt;
    this.x = nx; this.z = nz;
    this.vf = vf; this.vl = vl;

    // --- ride height and attitude follow the ground under the wheels (a stiff, damped suspension)
    const g = this.settle(Math.min(1, dt * 16));
    this.y = g.y; this.pitch = g.pitch; this.roll = g.roll; this.onDeck = g.deck;

    const k = Math.min(1, dt * 7);
    this.accelLong += ((vf - vf0) / dt - this.accelLong) * k;
    this.accelLat += (vf * yawRate - this.accelLat) * k;
  }

  /**
   * Put the car back on the road: at the last pose it held on a carriageway, or, failing that, on the centre
   * line of the nearest drivable road, facing along it. Returns false when neither is free.
   */
  resetToRoad(): boolean {
    const tries: Pose[] = [];
    if (this.lastRoad) tries.push(this.lastRoad);
    const r = this.env.road(this.x, this.z) ?? (this.lastRoad ? this.env.road(this.lastRoad.x, this.lastRoad.z) : null);
    if (r) {
      const along = Math.sin(this.heading) * r.dx + Math.cos(this.heading) * r.dz;
      const hd = Math.atan2(r.dx, r.dz) + (along < 0 && !r.oneWay ? Math.PI : 0);
      // Along the centre line, in case something stands exactly at the nearest point.
      for (const d of [0, 6, -6, 12, -12, 20, -20]) tries.push({ x: r.x + r.dx * d, z: r.z + r.dz * d, heading: hd });
    }
    for (const p of tries) {
      if (!this.env.loaded(p.x, p.z)) continue;
      const y = this.env.ground(p.x, p.z, 1e6).h;
      const wasDeck = this.onDeck;
      this.onDeck = false;
      const ok = this.canOccupy(p.x, p.z, p.heading, y);
      this.onDeck = wasDeck;
      if (!ok) continue;
      this.place(p.x, p.z, p.heading);
      return true;
    }
    return false;
  }
}
