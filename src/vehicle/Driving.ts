// The driving feature as one unit: the car's physics, model, chase camera and HUD, and the rules for
// getting in and out. main.ts owns the game loop and decides which controllable is active; walking
// (PlayerController) and OP fly mode are not changed by anything in here.
import * as THREE from 'three';
import type { WorldManager } from '../world/WorldManager.ts';
import type { Input } from '../player/Input.ts';
import type { PlayerController } from '../player/PlayerController.ts';
import { CAR_START, NEUTRAL, VEHICLE_SPECS, VehicleBody } from './VehiclePhysics.ts';
import type { DriveKind, Pose, VehicleEnv, ResetResult } from './VehiclePhysics.ts';
import { nearestDrivable } from './RoadQuery.ts';
import { CarModel, START_PAINT } from './CarModel.ts';
import { powerAt } from '../play/crash.ts';
import { ChaseCamera } from './ChaseCamera.ts';

/** Walking distance from the car body within which E gets in (metres). */
export const ENTER_RANGE = 2.6;
/** N1-M7: what each kind is called in the prompts. */
export const KIND_NAME: Record<DriveKind, string> = { hatch: 'Car', kapcai: 'Kapcai', taxi: 'Taxi', pickup: 'Pickup' };
/** The car must be slower than this to get out (m/s). */
const EXIT_SPEED = 1.5;
const WALL_ID = 'drivable-car';
const PLAYER_RADIUS = 0.35;

export interface DrivingHost {
  toast(text: string): void;
}

export class Driving {
  readonly car: VehicleBody;
  /** The model of the vehicle in use (N1-M7: it changes when the player takes another vehicle). */
  model: CarModel;
  /** Holds the model; added to the scene once. */
  readonly mount = new THREE.Group();
  readonly camera: ChaseCamera;
  /** N1-M7: what the player's vehicle is, its paint (sRGB hex) and how wrecked it is (0..1). */
  kind: DriveKind = 'hatch';
  paint = START_PAINT;
  damage = 0;
  /** Where the vehicle stands when the game starts (N1-M7: a saved game puts it where it was left). */
  start: Pose = { ...CAR_START };
  private models = new Map<DriveKind, CarModel>();
  /** Objects that ride on whichever model is in use (the headlight patch). */
  private riders: THREE.Object3D[] = [];
  /** What E would get into, for the prompt: the player's own vehicle or a parked one within reach (set by Play). */
  nearKind: DriveKind | null = null;
  /** True while the player is in the car. */
  active = false;
  /** True once the car stands on loaded ground at its starting place. */
  placed = false;
  /** World velocity of the car (for chunk streaming and the minimap). */
  readonly velocity = new THREE.Vector3();
  readonly position = new THREE.Vector3();
  private world: WorldManager;
  private host: DrivingHost;
  private hud = document.getElementById('hud')!;
  private speedo = document.getElementById('speedo')!;
  private speedEl = document.getElementById('speedo-kmh')!;
  private gearEl = document.getElementById('speedo-gear')!;
  private noteEl = document.getElementById('speedo-note')!;
  private prompt = document.getElementById('car-prompt')!;
  /** The E prompt shown for the car: "Enter Car" on foot within reach, "Exit Car" at the wheel when nearly stopped. */
  private promptKind: 'enter' | 'exit' | null = null;
  private shownKmh = -1;
  private shownGear = '';
  private shownNote = '';
  private toastWait = 0;
  /**
   * Readies the programs of objects not drawn yet for the current render path (main.ts: src/world/prepareDraw.ts), so
   * that the lamps do not compile on the frame they first light up.
   */
  prepare: ((o: THREE.Object3D) => void) | null = null;

  constructor(world: WorldManager, camera: THREE.PerspectiveCamera, host: DrivingHost) {
    this.world = world;
    this.host = host;
    const c = world.collision, chunks = world.chunks;
    const env: VehicleEnv = {
      // A deck lying on dry land at ground level (a footway "bridge" over a drain, crossing the carriageway at
      // grade) is ordinary ground for a car. Only raised decks and decks over water are bridges.
      ground: (x, z, y) => {
        const g = c.groundAt(x, z, y);
        return g.deck && g.h - world.height.sample(x, z) < 0.35 && !c.inWater(x, z) ? { h: g.h, deck: false } : g;
      },
      // V8.2: ground the car may enter has its collision registered and its road surface drawn (chunk mesh built).
      loaded: (x, z) => c.isLoaded(x, z) && chunks.isReady(x, z),
      hasData: (x, z) => chunks.hasData(x, z),
      water: (x, z) => c.inWater(x, z),
      boxContact: (x, z, fx, fz, a, b, y) => c.boxContact(x, z, fx, fz, a, b, y),
      road: (x, z) => nearestDrivable((cx, cz) => chunks.dataAt(cx, cz), x, z, this.car.spec.halfWid * 2),
      // Reset key only: the road must be drawn, and the body must not stand wholly inside a building or parked car.
      ready: (x, z) => chunks.isReady(x, z),
      solid: (x, z, y) => c.insideBuilding(x, z, y, false),
    };
    this.car = new VehicleBody(env);
    this.model = new CarModel('hatch', this.paint);
    this.models.set('hatch', this.model);
    this.mount.add(this.model.root);
    this.model.root.visible = false;
    this.camera = new ChaseCamera(camera, c);
  }

  /** Where the car is, or will stand once its area has loaded. */
  get whereabouts(): { x: number; z: number } {
    return this.placed ? { x: this.car.x, z: this.car.z } : { x: this.start.x, z: this.start.z };
  }

  /** Something that rides on the vehicle whichever model is shown (main.ts: the headlight patch). */
  attach(o: THREE.Object3D): void {
    this.riders.push(o);
    this.model.root.add(o);
  }

  /**
   * N1-M7: the player's vehicle becomes one of another kind, paint and state (it takes a parked vehicle, or a saved game
   * is loaded). The pose is not changed here: see `adopt`.
   */
  setVehicle(kind: DriveKind, paint: number, damage = 0): void {
    if (kind !== this.kind) {
      const old = this.model;
      let next = this.models.get(kind);
      if (!next) { next = new CarModel(kind, paint); this.models.set(kind, next); }
      next.root.visible = old.root.visible;
      next.marker.visible = old.marker.visible;
      next.lightsOn = old.lightsOn;
      old.lightsOn = false;
      this.mount.remove(old.root);
      this.mount.add(next.root);
      for (const o of this.riders) next.root.add(o);
      this.model = next;
      this.kind = kind;
      this.car.setSpec(VEHICLE_SPECS[kind]);
      this.prepare?.(next.root);
    }
    this.paint = paint;
    this.damage = Math.min(1, Math.max(0, damage));
    this.car.power = powerAt(this.damage);
    this.model.setPaint(paint, this.damage);
    this.model.setRidden(this.active);
    this.shownNote = '?';
  }

  /** N1-M7: stand the player's vehicle at a pose, at rest (the place of the parked vehicle it has just become). */
  adopt(x: number, z: number, heading: number): void {
    this.car.place(x, z, heading);
    this.placed = true;
    this.model.root.visible = true;
    this.model.sync(this.car, 0);
    this.position.set(this.car.x, this.car.y, this.car.z);
    this.velocity.set(0, 0, 0);
    if (!this.active) this.setParked(true);
  }

  /** N1-M7: a blow (0..1 of a whole vehicle). Returns the new damage. */
  hurt(amount: number): number {
    if (amount <= 0) return this.damage;
    this.damage = Math.min(1, this.damage + amount);
    this.car.power = powerAt(this.damage);
    this.model.setPaint(this.paint, this.damage);
    return this.damage;
  }

  /** N1-M7: repaired (the phone's garage). */
  repair(): void {
    this.damage = 0;
    this.car.power = 1;
    this.model.setPaint(this.paint, 0);
  }

  /** True on foot within reach of the car (the "Enter Car" prompt is up; E gets in, ahead of shop inspection). */
  get near(): boolean { return this.promptKind === 'enter'; }

  /** True at the wheel when the car is slow enough to get out. */
  get canExit(): boolean { return this.active && this.car.speed <= EXIT_SPEED; }

  /** Stand the car at its starting place as soon as the ground there is loaded. Cheap to call every frame. */
  tryPlace(): void {
    if (this.placed) return;
    const s = this.start;
    if (!this.world.collision.isLoaded(s.x, s.z) || !this.world.chunks.isReady(s.x, s.z)) return;
    this.car.place(s.x, s.z, s.heading);
    // If something stands in the bay (data changed), slide along the kerb to the nearest free spot.
    if (!this.car.canOccupy(s.x, s.z, s.heading)) {
      const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
      for (const d of [3, -3, 6, -6, 9, -9, 12, -12]) {
        if (this.car.canOccupy(s.x + fx * d, s.z + fz * d, s.heading)) { this.car.place(s.x + fx * d, s.z + fz * d, s.heading); break; }
      }
    }
    this.placed = true;
    this.model.root.visible = true;
    this.model.sync(this.car, 0);
    this.position.set(this.car.x, this.car.y, this.car.z);
    this.setParked(true);
  }

  /** The parked car is an obstacle for the walking character (and its camera); a driven car is not. */
  private setParked(parked: boolean): void {
    this.world.collision.setDynamicWall(WALL_ID, parked ? this.car.footprint(0.02) : null, this.car.y + Math.min(1.5, this.car.spec.height));
  }

  /** Distance from a point to the car body outline (0 inside). */
  private distanceTo(x: number, z: number): number {
    const s = Math.sin(this.car.heading), c = Math.cos(this.car.heading);
    const dx = x - this.car.x, dz = z - this.car.z;
    const u = Math.abs(dx * s + dz * c) - this.car.spec.halfLen, v = Math.abs(dx * c - dz * s) - this.car.spec.halfWid;
    return Math.hypot(Math.max(0, u), Math.max(0, v));
  }

  canEnter(player: PlayerController): boolean {
    return this.placed && !this.active && Math.abs(player.position.y - this.car.y) < 2 && this.distanceTo(player.position.x, player.position.z) <= ENTER_RANGE;
  }

  enter(player: PlayerController): boolean {
    if (!this.canEnter(player)) return false;
    this.active = true;
    this.setParked(false);
    player.velocity.set(0, 0, 0);
    player.visual.root.visible = false;
    this.camera.snap(this.car);
    this.model.marker.visible = false;
    this.model.lightsOn = true;
    this.model.setRidden(true);
    this.prepare?.(this.model.lamps);
    this.setPrompt(null);
    this.hud.classList.add('driving');
    this.speedo.classList.remove('hidden');
    this.refreshHud(true);
    return true;
  }

  /**
   * Get out next to the driver's door (right-hand drive: the right side), or wherever there is room.
   * `force` (teleports, "return to waterfront") skips the speed check and leaves the character where it is.
   */
  exit(player: PlayerController, force = false): boolean {
    if (!this.active) return false;
    if (!force) {
      if (this.car.speed > EXIT_SPEED) { this.host.toast('Stop the car before getting out'); return false; }
      const spot = this.exitSpot();
      if (!spot) { this.host.toast('No room to get out here'); return false; }
      this.car.vf = this.car.vl = 0;
      this.setParked(true);
      player.teleport(spot[0], spot[1]);
      player.heading = this.car.heading;
    } else {
      this.car.vf = this.car.vl = 0;
      this.setParked(true);
    }
    this.active = false;
    this.velocity.set(0, 0, 0);
    player.velocity.set(0, 0, 0);
    this.model.marker.visible = true;
    this.model.lightsOn = false;
    this.model.setRidden(false);
    this.model.sync(this.car, 0);
    this.hud.classList.remove('driving');
    this.speedo.classList.add('hidden');
    this.setPrompt(null);
    return true;
  }

  /**
   * Pause menu "Drive Car": a free place for the walking character beside the parked car (the same search as
   * getting out), or null while the car or the ground round it is not loaded, or when there is no room.
   */
  standSpot(): [number, number] | null {
    if (!this.placed || this.active) return null;
    const c = this.world.collision;
    if (!c.isLoaded(this.car.x, this.car.z) || !this.world.chunks.isReady(this.car.x, this.car.z)) return null;
    return this.exitSpot();
  }

  /** A free standing place beside the car: right door first, then left, then behind and in front. */
  private exitSpot(): [number, number] | null {
    const car = this.car, c = this.world.collision;
    const s = Math.sin(car.heading), co = Math.cos(car.heading);
    const side = car.spec.halfWid + PLAYER_RADIUS + 0.3, end = car.spec.halfLen + PLAYER_RADIUS + 0.3;
    // (u along forward, v toward the left)
    for (const [u, v] of [[0.2, -side], [0.2, side], [-0.8, -side], [-0.8, side], [-end, 0], [end, 0]]) {
      const x = car.x + s * u + co * v, z = car.z + co * u - s * v;
      if (!c.isLoaded(x, z)) continue;
      const g = c.groundAt(x, z, car.y);
      if (Math.abs(g.h - car.y) > 0.8) continue;
      if (!g.deck && c.inWater(x, z)) continue;
      if (c.insideBuilding(x, z, g.h)) continue;
      // The spot must not need pushing out of a wall, pier or parked car (the driven car itself is checked by distance).
      const [rx, rz] = c.resolve(x, z, PLAYER_RADIUS, g.h);
      if (Math.hypot(rx - x, rz - z) > 0.02) continue;
      return [x, z];
    }
    return null;
  }

  /** Outcome of the last R press (tests and diagnostics). */
  lastReset: ResetResult | null = null;

  /** R: back to a verified safe place on the road (VehicleBody.resetToRoad), or a message saying why not. */
  resetToRoad(): void {
    if (!this.active) return;
    const res = (this.lastReset = this.car.resetToRoad());
    if (res.ok) {
      this.after(0);
      this.camera.snap(this.car);
      this.host.toast('Back on the road');
    } else this.host.toast(res.reason === 'loading' ? 'Cannot reset yet: the road here is still loading' : 'No safe place on the road nearby: the car stays here');
  }

  /** One simulation step with the player at the wheel. */
  drive(dt: number, input: Input): void {
    this.car.update(dt, { throttle: input.moveY, steer: input.moveX, handbrake: input.handbrake });
    this.after(dt);
    this.toastWait -= dt;
    if (this.car.blocked && this.toastWait <= 0) {
      this.toastWait = 1.5;
      const b = this.car.blocked;
      this.host.toast(b === 'water' ? 'The river blocks the way' : b === 'edge' ? 'Edge of the mapped area' : b === 'loading' ? 'Loading the next area…' : 'Cars cannot drive there');
    }
  }

  /** The car while nobody steers it (OP fly mode switched on mid-drive): it brakes to a stop. */
  coast(dt: number): void {
    if (!this.placed || (this.car.vf === 0 && this.car.vl === 0)) return;
    this.car.update(dt, { ...NEUTRAL, throttle: 0, handbrake: true });
    this.after(dt);
  }

  private after(dt: number): void {
    const car = this.car;
    this.velocity.set(car.vx, 0, car.vz);
    this.position.set(car.x, car.y, car.z);
    this.model.sync(car, dt);
  }

  /** On foot: marker animation and the "get in" prompt. */
  idle(dt: number, player: PlayerController, promptAllowed: boolean): void {
    if (!this.placed) return;
    this.model.sync(this.car, dt);
    const p = player.position;
    const far = Math.hypot(p.x - this.car.x, p.z - this.car.z);
    this.model.root.visible = far < this.world.viewDistance;
    this.model.marker.visible = far < 260;
    // (the player's own vehicle comes first; `nearKind` is a parked one within reach, set by Play)
    const what = this.canEnter(player) ? this.kind : this.nearKind;
    this.setPrompt(promptAllowed && what ? 'enter' : null, what ?? this.kind);
  }

  /** At the wheel, once per frame: "Exit Car" while the car is nearly stopped. */
  drivingPrompt(promptAllowed: boolean): void {
    this.setPrompt(promptAllowed && this.canExit ? 'exit' : null);
  }

  private promptWhat: DriveKind = 'hatch';
  private setPrompt(kind: 'enter' | 'exit' | null, what: DriveKind = this.kind): void {
    if (kind === this.promptKind && (!kind || what === this.promptWhat)) return;
    this.promptKind = kind;
    this.promptWhat = what;
    this.prompt.classList.toggle('hidden', !kind);
    if (kind) {
      // (the car keeps its V8 wording; the other kinds are named)
      const bike = what === 'kapcai';
      const text = kind === 'enter' ? (bike ? 'Ride Kapcai' : `Enter ${KIND_NAME[what]}`) : bike ? 'Get off' : `Exit ${KIND_NAME[what]}`;
      this.prompt.innerHTML = `<kbd>E</kbd>${text}`;
      this.prompt.setAttribute('aria-label', text);
    }
    this.hud.classList.toggle('near-car', kind === 'enter');
  }

  /** Hide the prompt (menus, map, OP mode). */
  hidePrompt(): void {
    this.setPrompt(null);
  }

  /** Speedometer: km/h, gear and surface note. Only touches the DOM when a value changes. */
  refreshHud(force = false): void {
    if (!this.active) return;
    const car = this.car;
    const kmh = Math.round(car.kmh);
    if (force || kmh !== this.shownKmh) { this.shownKmh = kmh; this.speedEl.textContent = String(kmh); }
    const gear = car.vf < -0.3 ? 'R' : car.vf > 0.3 ? 'D' : 'N';
    if (force || gear !== this.shownGear) { this.shownGear = gear; this.gearEl.textContent = gear; this.gearEl.dataset.gear = gear; }
    // (one short note at a time: off the road and damaged, the two take turns)
    const off = !(car.onRoad || car.onDeck), hurt = this.damage >= 0.08 ? `DAMAGE ${Math.round(this.damage * 100)}%` : '';
    const note = off && hurt ? (Math.floor(performance.now() / 1500) % 2 ? 'OFF ROAD' : hurt) : off ? 'OFF ROAD' : hurt;
    if (force || note !== this.shownNote) { this.shownNote = note; this.noteEl.textContent = note; }
  }
}
