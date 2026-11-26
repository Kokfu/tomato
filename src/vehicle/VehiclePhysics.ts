// Drivable car: a kinematic bicycle model with a little lateral slip, an oriented-box body against the
// simplified collision world, and four ground probes for height, pitch and roll. No physics engine.
// Pure TypeScript (no three.js, no DOM) so that it can be unit-tested under Node with a stub world.
//
// Conventions (same as PlayerController): heading 0 looks toward +Z and increases toward +X, so
// forward = (sin h, cos h) and the car's left side is (cos h, -sin h).
import type { RoadHit } from './RoadQuery.ts';
import { onRoad } from './RoadQuery.ts';

/** Size and handling of one kind of vehicle (metres, m/s, m/s^2). */
export interface VehicleSpec {
  halfLen: number; halfWid: number; wheelBase: number; track: number; wheelRadius: number; height: number;
  maxSpeed: number; maxReverse: number; engine: number; brake: number; handbrake: number;
  rolling: number; drag: number; engineBrake: number; offRoad: number; offRoadV: number;
  maxSteer: number; steerRate: number; steerReturn: number; steerEaseFast: number;
  lateralGrip: number; slipGrip: number; slipHandbrake: number;
  gravity: number; maxDeckDrop: number; roadSurface: number; maxSubstep: number;
}

export const CAR: VehicleSpec = {
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
  /** V8.3: engine braking with the throttle released (m/s^2), so that a coasting car slows within a street, not a block. */
  engineBrake: 0.6,
  /** Extra resistance off the carriageway (verges, paving, grass): constant and speed-proportional parts. */
  offRoad: 1.5,
  offRoadV: 0.32,
  /** Steering lock (rad), steering speeds (rad/s) and the lateral acceleration the tyres hold (m/s^2). */
  maxSteer: 0.6,
  steerRate: 2.4,
  steerReturn: 4.2,
  /**
   * V8.3: the wheels turn at a rate in proportion to the lock available, so a tap at speed builds up to the grip limit
   * over a moment instead of in one frame: full lock takes steerRate / maxSteer = 0.25 s when slow, up to
   * (1 + steerEaseFast) times that at speed.
   */
  steerEaseFast: 0.6,
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
 * Where the car waits: at the mouth of Jalan China (OSM way 124545031) just off Jalan Main Bazaar, in the
 * middle of the street between its two mapped frontages (street frame of src/v5/geo.ts: s = 91 m, o = 0),
 * facing along the street in the direction of the one-way traffic (toward Jalan Carpenter).
 *
 * That is the free lane between the two rows of parked cars of the V7 street section (inner edges at
 * o = -1.35 and +1.35 m, so 0.48 m to spare on each side of the body), so holding W drives straight down
 * Jalan China to Jalan Carpenter in either rendering. It is 2.6 m west of the OSM centre line, which runs
 * through the east parked row (docs/V8_REPORT.md, data finding 1), and still on that carriageway by the
 * runtime rule (2.59 m from the line, mapped width 6 m). It is the first thing seen on walking up from
 * the waterfront.
 */
export const CAR_START = { x: 205.882, z: -55.044, heading: -0.58863 };

export type CarBlock = '' | 'water' | 'edge' | 'loading' | 'deck';

/**
 * V8.2 reset key: what a pose must offer before the car is put there. Nothing here moves a road or an obstacle: the
 * search only looks for room on the mapped carriageways as they are (in Jalan China that is the lane between the
 * parked rows, 2.25 m off the OSM centre line, which runs through the east row).
 */
export const RESET = {
  /** Free space wanted round the body: sideways and at each end (metres). The Jalan China lane leaves 0.48 m a side. */
  sidePad: 0.2,
  endPad: 0.3,
  /** Steepest grade along the car and across it (rise / run; the steepest mapped street is 11.2 %). */
  maxGrade: 0.16,
  maxCross: 0.1,
  /** Largest twist between the ground under the four wheels, and largest gap between the centre and the wheels (metres). */
  maxStep: 0.2,
  /** Verified poses kept from the drive (newest first), how often one is stored (s), and how far back one is still used (m). */
  keep: 12,
  every: 0.5,
  recentRange: 200,
  /** Carriageway search: this far along the road either way, in these steps; across it in steps of at least `acrossStep`. */
  along: 30,
  alongStep: 3,
  acrossStep: 0.25,
};

export type ResetResult = { ok: true; pose: Pose; source: 'recent' | 'road'; tried: number } | { ok: false; reason: 'loading' | 'none'; tried: number };

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
  /** The chunk at this position has its mesh built (road surface drawn). Reset only; absent = always. */
  ready?(x: number, z: number): boolean;
  /** The point lies inside a blocking outline (building, pier, parked car) below its top. Reset only; absent = never. */
  solid?(x: number, z: number, y: number): boolean;
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
  /** Lamps: the service brake or the handbrake is applied; reverse is engaged (backing, or S held from a standstill). */
  braking = false;
  reverseGear = false;
  onRoad = false;
  onDeck = false;
  road: RoadHit | null = null;
  blocked: CarBlock = '';
  /** Closing speed of the last wall contact this update (m/s), 0 if none. */
  impact = 0;
  /** Poses the car held on a carriageway with room round it, verified when stored, newest first (reset key). */
  readonly recent: Pose[] = [];
  /** The newest of `recent`; setting it replaces the list (null clears it). */
  get lastRoad(): Pose | null { return this.recent[0] ?? null; }
  set lastRoad(p: Pose | null) { this.recent.length = 0; if (p) this.recent.push(p); }
  private sinceRoad = 0;
  private env: VehicleEnv;
  /** N1-M7: the body's size and handling. Changed with `setSpec` when the player takes another vehicle. */
  spec: VehicleSpec;
  /** N1-M7: share of the engine's pull that is left (a badly damaged vehicle limps). */
  power = 1;

  constructor(env: VehicleEnv, spec: VehicleSpec = CAR) {
    this.env = env;
    this.spec = spec;
  }

  /** Become another kind of vehicle (N1-M7). The pose is kept; the remembered reset poses are not (other clearances). */
  setSpec(spec: VehicleSpec): void {
    if (spec === this.spec) return;
    this.spec = spec;
    this.recent.length = 0;
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
    this.braking = this.reverseGear = false;
    this.blocked = '';
    this.road = this.env.road(x, z);
    this.onRoad = onRoad(this.road);
    this.y = this.env.ground(x, z, 1e6).h;
    // Settle on the surface that is really under the wheels (not on a roof above them).
    const g = this.settle(1);
    this.y = g.y; this.pitch = g.pitch; this.roll = g.roll; this.onDeck = g.deck;
  }

  /**
   * N1-M7: pushed out of another vehicle by (px, pz) (src/play/crash.ts). The body moves if the place is free (not into
   * a wall, the river or unloaded ground) and loses the speed it had toward the other vehicle. `keep` is the share of
   * that speed that comes back as a bounce.
   */
  shove(px: number, pz: number, keep = 0.12): void {
    const l = Math.hypot(px, pz);
    if (l < 1e-7) return;
    const s = Math.sin(this.heading), c = Math.cos(this.heading), nx = this.x + px, nz = this.z + pz;
    if (!this.env.boxContact(nx, nz, s, c, this.spec.halfLen, this.spec.halfWid, this.y) && this.occupancy(nx, nz, s, c, this.y) === '') { this.x = nx; this.z = nz; }
    const ux = px / l, uz = pz / l;
    let wx = this.vx, wz = this.vz;
    const vn = wx * ux + wz * uz;
    if (vn >= 0) return;
    wx -= (1 + keep) * vn * ux; wz -= (1 + keep) * vn * uz;
    this.vf = wx * s + wz * c;
    this.vl = wx * c - wz * s;
  }

  /** Outline of the body footprint, world metres: [x0, z0, ...] (4 corners), grown by `pad`. */
  footprint(pad = 0): number[] {
    const s = Math.sin(this.heading), c = Math.cos(this.heading), a = this.spec.halfLen + pad, b = this.spec.halfWid + pad;
    const out: number[] = [];
    for (const [u, v] of [[a, b], [a, -b], [-a, -b], [-a, b]]) out.push(this.x + s * u + c * v, this.z + c * u - s * v);
    return out;
  }

  /** True when the body box at a pose is clear of walls, water and unloaded ground. */
  canOccupy(x: number, z: number, heading: number, y = this.y): boolean {
    const s = Math.sin(heading), c = Math.cos(heading);
    if (this.env.boxContact(x, z, s, c, this.spec.halfLen, this.spec.halfWid, y)) return false;
    return this.occupancy(x, z, s, c, y) === '';
  }

  /** Why the body cannot stand at this pose ('' = it can). */
  private occupancy(x: number, z: number, s: number, c: number, y: number): CarBlock {
    const a = this.spec.halfLen, b = this.spec.halfWid, env = this.env;
    for (const [u, v] of [[0, 0], [a, b], [a, -b], [-a, -b], [-a, b]]) {
      const px = x + s * u + c * v, pz = z + c * u - s * v;
      if (!env.loaded(px, pz)) return env.hasData(px, pz) ? 'loading' : 'edge';
      const g = env.ground(px, pz, y);
      if (!g.deck && env.water(px, pz)) return 'water';
      // Railing rule: a car on a bridge deck does not leave it sideways.
      if (this.onDeck && g.h < y - this.spec.maxDeckDrop) return 'deck';
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
    const s = Math.sin(this.heading), c = Math.cos(this.heading), a = this.spec.wheelBase / 2, b = this.spec.track / 2, env = this.env;
    const at = (u: number, v: number) => env.ground(this.x + s * u + c * v, this.z + c * u - s * v, this.y);
    const fl = at(a, b), fr = at(a, -b), rl = at(-a, b), rr = at(-a, -b);
    const deck = fl.deck || fr.deck || rl.deck || rr.deck;
    const off = deck ? 0 : this.onRoad ? this.spec.roadSurface : 0.02;
    const y = (fl.h + fr.h + rl.h + rr.h) / 4 + off;
    const pitch = Math.atan2((fl.h + fr.h - rl.h - rr.h) / 2, this.spec.wheelBase);
    const roll = Math.atan2((fl.h + rl.h - fr.h - rr.h) / 2, this.spec.track);
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
      const h = Math.min(remaining, this.spec.maxSubstep);
      this.step(h, controls);
      remaining -= h;
    }
    // Remember poses on a carriageway with room round the body (twice a second while moving), for the reset key.
    this.sinceRoad += dt;
    const r = this.road;
    if (r && !this.blocked && r.dist <= r.width / 2 && Math.abs(this.vl) < 1.5 && (this.sinceRoad >= RESET.every || !this.recent.length)) {
      // Align the stored heading with the carriageway (in the direction the car is facing).
      const along = Math.sin(this.heading) * r.dx + Math.cos(this.heading) * r.dz;
      const hd = Math.atan2(r.dx, r.dz) + (along < 0 ? Math.PI : 0);
      const prev = this.recent[0];
      if (Math.abs(along) > 0.5 && (!prev || Math.hypot(prev.x - this.x, prev.z - this.z) > 2)) {
        this.sinceRoad = 0;
        if (this.check(this.x, this.z, hd) === '') {
          this.recent.unshift({ x: this.x, z: this.z, heading: hd });
          if (this.recent.length > RESET.keep) this.recent.length = RESET.keep;
        }
      }
    }
  }

  private step(dt: number, c: Controls): void {
    const C = this.spec;
    const vf0 = this.vf;

    // --- steering: the lock available falls with speed so that lateral acceleration stays within the tyres' grip
    const lock = Math.min(C.maxSteer, Math.atan((C.lateralGrip * C.wheelBase) / Math.max(1, this.vf * this.vf)));
    const wantSteer = -clamp(c.steer, -1, 1) * lock;
    const ease = (lock / C.maxSteer) / (1 + C.steerEaseFast * clamp((Math.abs(this.vf) - 8) / 17, 0, 1));
    this.steer = toward(this.steer, wantSteer, (c.steer !== 0 ? C.steerRate : C.steerReturn) * ease * dt);
    this.steer = clamp(this.steer, -lock, lock);

    // --- longitudinal: engine, brakes, resistances, slope
    const th = clamp(c.throttle, -1, 1);
    let drive = 0, braking = 0;
    if (th > 0) {
      if (this.vf < -0.3) braking = C.brake * th;
      else drive = C.engine * this.power * th * Math.max(0, 1 - (this.vf / (C.maxSpeed * (0.45 + 0.55 * this.power))) ** 2);
    } else if (th < 0) {
      if (this.vf > 0.3) braking = C.brake * -th;
      else drive = C.engine * 0.7 * th * Math.max(0, 1 + this.vf / C.maxReverse);
    }
    if (c.handbrake) braking += C.handbrake;
    this.braking = braking > 0;
    this.reverseGear = this.vf < -0.3 || (th < 0 && this.vf <= 0.3);
    let resist = C.rolling + C.drag * this.vf * this.vf + braking + (th === 0 ? C.engineBrake : 0);
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
   * Why the car could not be put at this pose at rest ('' = it can): every part of the body and a margin round it
   * (RESET.sidePad / endPad) must be loaded and drawn, clear of walls, piers, parked cars, water and footbridges; the
   * body must stand on a drivable carriageway (centre within its mapped half width, corners within the on-road rule,
   * so never on a pedestrian street, footway or pier); and the ground under the wheels must be gentle enough.
   */
  check(x: number, z: number, heading: number): '' | 'loading' | 'blocked' {
    const env = this.env, s = Math.sin(heading), c = Math.cos(heading);
    const a = this.spec.halfLen + RESET.endPad, b = this.spec.halfWid + RESET.sidePad;
    const at = (u: number, v: number): [number, number] => [x + s * u + c * v, z + c * u - s * v];
    const probes = [[0, 0], [a, b], [a, -b], [-a, -b], [-a, b], [a, 0], [-a, 0], [0, b], [0, -b]].map(([u, v]) => at(u, v));
    for (const [px, pz] of probes) if (!env.loaded(px, pz) || (env.ready && !env.ready(px, pz))) return 'loading';
    // On a drivable carriageway.
    const r = env.road(x, z);
    if (!r || r.dist > r.width / 2) return 'blocked';
    for (const [u, v] of [[this.spec.halfLen, this.spec.halfWid], [this.spec.halfLen, -this.spec.halfWid], [-this.spec.halfLen, -this.spec.halfWid], [-this.spec.halfLen, this.spec.halfWid]]) {
      const [px, pz] = at(u, v);
      if (!onRoad(env.road(px, pz))) return 'blocked';
    }
    // Ground: the surface the car would settle on (a road bridge deck where the carriageway is a bridge), gentle slope.
    const g0 = env.ground(x, z, 1e6);
    const y = g0.h;
    const w = this.spec.wheelBase / 2, t = this.spec.track / 2;
    const wh = [at(w, t), at(w, -t), at(-w, t), at(-w, -t)].map(([px, pz]) => env.ground(px, pz, y + 0.5));
    if ((g0.deck || wh.some((g) => g.deck)) && !r.bridge) return 'blocked';
    const [fl, fr, rl, rr] = wh.map((g) => g.h);
    if (Math.abs(fl + fr - rl - rr) / 2 / this.spec.wheelBase > RESET.maxGrade) return 'blocked';
    if (Math.abs(fl + rl - fr - rr) / 2 / this.spec.track > RESET.maxCross) return 'blocked';
    if (Math.abs(fl - fr - rl + rr) > RESET.maxStep || Math.abs((fl + fr + rl + rr) / 4 - y) > RESET.maxStep) return 'blocked';
    // Clear of water, walls and obstacles with the margin; and not wholly inside an outline (no edge to touch then).
    for (const [px, pz] of probes) {
      if (env.water(px, pz) && !r.bridge) return 'blocked';
      if (env.solid?.(px, pz, y + 0.1)) return 'blocked';
    }
    if (env.boxContact(x, z, s, c, a, b, y)) return 'blocked';
    return '';
  }

  /**
   * Places on the carriageway nearest (x, z) where the car might stand: along the road up to RESET.along either way
   * (following its centre line through bends and junctions) and across the whole mapped width, nearest to (x, z)
   * first. Each faces along the road: in the direction the car faces, or the way of a one-way street.
   */
  private roadPlaces(x: number, z: number, heading: number): Pose[] {
    const env = this.env, r0 = env.road(x, z);
    if (!r0) return [];
    const out: { p: Pose; d: number }[] = [];
    for (let d = 0; d <= RESET.along; d += RESET.alongStep) {
      for (const sg of d ? [1, -1] : [1]) {
        const r = d ? env.road(r0.x + r0.dx * d * sg, r0.z + r0.dz * d * sg) : r0;
        if (!r) continue;
        const along = Math.sin(heading) * r.dx + Math.cos(heading) * r.dz;
        const hd = Math.atan2(r.dx, r.dz) + (r.oneWay ? 0 : along < 0 ? Math.PI : 0);
        const half = r.width / 2, step = Math.max(RESET.acrossStep, half / 12);
        // Across the road: left of its direction is (dz, -dx).
        for (let o = 0; o <= half + 1e-6; o += step) {
          for (const so of o ? [1, -1] : [1]) {
            const px = r.x + r.dz * o * so, pz = r.z - r.dx * o * so;
            out.push({ p: { x: px, z: pz, heading: hd }, d: Math.hypot(px - x, pz - z) });
          }
        }
      }
    }
    return out.sort((p, q) => p.d - q.d).map((o) => o.p);
  }

  /**
   * R: put the car back at a verified safe place on the road, at rest. Tried in order: the poses it recently held on
   * a carriageway (newest first, within RESET.recentRange), places on the carriageway nearest the car, the remembered
   * poses further away, then places near the newest remembered pose. Every candidate is checked now (`check`): nothing is
   * trusted from when it was stored. When none passes the car is not moved, and the result says whether that was
   * for want of loaded ground.
   */
  resetToRoad(): ResetResult {
    const cand: [Pose, 'recent' | 'road'][] = [];
    const near = this.recent.filter((p) => Math.hypot(p.x - this.x, p.z - this.z) <= RESET.recentRange);
    for (const p of near) cand.push([p, 'recent']);
    for (const p of this.roadPlaces(this.x, this.z, this.heading)) cand.push([p, 'road']);
    for (const p of this.recent) if (!near.includes(p)) cand.push([p, 'recent']);
    const last = this.recent[0];
    if (last) for (const p of this.roadPlaces(last.x, last.z, last.heading)) cand.push([p, 'road']);
    let loading = false, tried = 0;
    for (const [p, source] of cand) {
      tried++;
      const why = this.check(p.x, p.z, p.heading);
      if (why === 'loading') { loading = true; continue; }
      if (why) continue;
      this.place(p.x, p.z, p.heading);
      return { ok: true, pose: { ...p }, source, tried };
    }
    // With the car's own ground not loaded yet there may be no road data to search at all: that is 'loading' too.
    const here = !this.env.loaded(this.x, this.z) && this.env.hasData(this.x, this.z);
    return { ok: false, reason: loading || here ? 'loading' : 'none', tried };
  }
}

/** N1-M7: the vehicles a player can drive. `hatch` is the car that has waited in Jalan China since V8. */
export type DriveKind = 'hatch' | 'kapcai' | 'taxi' | 'pickup';
export const DRIVE_KINDS: readonly DriveKind[] = ['hatch', 'kapcai', 'taxi', 'pickup'];

/**
 * Handling by kind. All invented, to feel different: the kapcai (underbone motorbike) is narrow, quick off the mark and
 * slower flat out; the taxi is the four-door saloon; the pickup is long, heavy and at home off the carriageway.
 */
export const VEHICLE_SPECS: Record<DriveKind, VehicleSpec> = {
  hatch: CAR,
  kapcai: { ...CAR, halfLen: 0.95, halfWid: 0.36, wheelBase: 1.24, track: 0.5, wheelRadius: 0.27, height: 1.7, maxSpeed: 25, maxReverse: 2.5, engine: 6.4, brake: 9, handbrake: 6, maxSteer: 0.7, steerRate: 3.0, lateralGrip: 9.5, offRoad: 1.2, offRoadV: 0.28 },
  taxi: { ...CAR, halfLen: 2.2, halfWid: 0.86, wheelBase: 2.57, wheelRadius: 0.3, height: 1.45, engine: 4.9 },
  pickup: { ...CAR, halfLen: 2.65, halfWid: 0.93, wheelBase: 3.1, track: 1.56, wheelRadius: 0.37, height: 1.8, maxSpeed: 28, engine: 4.4, brake: 9.5, maxSteer: 0.56, steerRate: 2.1, lateralGrip: 7.8, offRoad: 0.7, offRoadV: 0.16 },
};
