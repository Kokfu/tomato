// N1-M7: the play loop. Money, jobs, the vehicles standing parked for the player to take, what happens when the driven
// vehicle hits something, the horn, the phone and saved progress. The pure parts (jobs, parking places, box tests,
// the saved value) live beside this file and are unit-tested; this is the glue to the game.
// Flag `m7` (on by default; `?m7=0` = the N1-M6 game: one car, nothing to earn, nothing collides with the traffic).
import * as THREE from 'three';
import type { WorldManager } from '../world/WorldManager.ts';
import type { PlayerController } from '../player/PlayerController.ts';
import type { Minimap } from '../ui/Minimap.ts';
import type { Life } from '../life/Life.ts';
import type { Landmark } from '../world/types.ts';
import { CHUNK_SIZE, DATA_ROOT } from '../world/config.ts';
import { worldToGeo } from '../world/GeoProjection.ts';
import { loadRouteGraph, isStoppingEdge, formatDistance } from '../ui/Router.ts';
import type { RouteGraph } from '../ui/Router.ts';
import { nearestDrivable } from '../vehicle/RoadQuery.ts';
import { ENTER_RANGE, KIND_NAME } from '../vehicle/Driving.ts';
import type { Driving } from '../vehicle/Driving.ts';
import type { DriveKind } from '../vehicle/VehiclePhysics.ts';
import { KIND, SIZE, rng } from '../life/traffic.ts';
import type { Obstacle, Vehicle } from '../life/traffic.ts';
import { PAINTS, TAXI_PAINT } from '../life/LifeRender.ts';
import type { ParkedDraw } from '../life/LifeRender.ts';
import { Phone } from '../ui/Phone.ts';
import type { OfferView, PhoneStatus } from '../ui/Phone.ts';
import { Sfx } from './Sfx.ts';
import { boxOverlap, closingSpeed, damageFrom, repairCost } from './crash.ts';
import type { Box } from './crash.ts';
import { DRIVE_TO_KIND, parkingSpots, settle } from './parked.ts';
import type { Pose } from './parked.ts';
import { arrive, arrived, formatRM, goalOf, makeOffers, parTime, sen, startJob } from './missions.ts';
import type { Job, JobKind, Offer } from './missions.ts';
import { describeSite, sitesOf } from './sites.ts';
import type { JobsFile, Site } from './sites.ts';
import { freshSave, loadSave, writeSave } from './save.ts';
import type { SaveState } from './save.ts';

/** A vehicle standing parked: one placed by the rule (`key`), or one the player left behind. */
export interface Parked extends ParkedDraw { drive: DriveKind; key: string | null; chunk: string | null }

export interface PlayHost {
  world: WorldManager;
  player: PlayerController;
  driving: Driving;
  minimap: Minimap;
  life: Life | null;
  baseUrl: string;
  touch: boolean;
  toast(text: string, seconds?: number): void;
  /** True while the game is being played (started, not paused, no menu, map or OP mode). */
  playing(): boolean;
  /** Menus and panels that the phone must not cover. */
  canOpenPhone(): boolean;
  onPhone(open: boolean): void;
  openGps(): void;
  openMap(): void;
  pause(): void;
  prepare(o: THREE.Object3D): void;
}

const JOB_ID = 'job-goal', TAXI_ID = 'job-taxi';
const JOB_TITLE: Record<JobKind, string> = { delivery: 'Food delivery', taxi: 'Taxi fare' };
/** Parked vehicles become walls for the walking player within this distance; the driven vehicle tests boxes within `HIT`. */
const WALLS = 6, WALL_RANGE = 14, HIT = 9;

export class Play {
  money = 0;
  job: Job | null = null;
  readonly parked: Parked[] = [];
  readonly sfx = new Sfx();
  readonly phone: Phone;
  /** Progress as it would be saved now. */
  readonly stats: SaveState;
  /** Offers last shown by the phone. */
  offersShown: Offer[] = [];
  /** Collisions that did damage, and the hardest blow (tests and diagnostics). */
  crashes = 0;
  hardest = 0;
  /** Jobs finished this session, with what each paid. */
  readonly paid: { kind: JobKind; total: number; tip: number }[] = [];
  /** The parked vehicle within reach of the walking player (E takes it), if any. */
  near: Parked | null = null;
  private host: PlayHost;
  private wallet: HTMLElement;
  private moneyEl: HTMLElement;
  private jobEl: HTMLElement;
  private beacon: THREE.Mesh;
  private beaconAt: { x: number; z: number } | null = null;
  private time = 0;
  private tick = 0;
  private scanned = new Map<string, number>();
  private taken = new Set<string>();
  private walled = 0;
  private nextParkedId = 1;
  private lastHit = -10;
  private hornHeld = false;
  private hornKey = false;
  private hornTouch = false;
  private sites: Site[] | null = null;
  private graph: RouteGraph | null = null;
  private loading: Promise<void> | null = null;
  private rand = rng((Date.now() & 0x7fffffff) || 1);
  private nextOffer = 1;
  private wasDriving = false;
  private hinted = false;
  private obstacles: Obstacle[] = [];
  private shownMoney = '';
  private shownJob = '';
  private draw: Parked[] = [];
  private box: Box = { x: 0, z: 0, heading: 0, half: 1, hw: 1 };
  private other: Box = { x: 0, z: 0, heading: 0, half: 1, hw: 1 };

  constructor(host: PlayHost) {
    this.host = host;
    // saved progress: money, jobs done, and the vehicle the player had (put back where it was left)
    const saved = loadSave();
    this.stats = saved ?? freshSave();
    this.money = this.stats.money;
    if (saved?.vehicle) {
      const v = saved.vehicle;
      host.driving.setVehicle(v.kind, v.paint, v.damage);
      host.driving.start = { x: v.x, z: v.z, heading: v.heading };
    }

    const hud = document.getElementById('hud')!;
    this.wallet = document.createElement('div');
    this.wallet.id = 'wallet';
    this.wallet.className = 'panel';
    this.wallet.setAttribute('aria-label', 'Money and job');
    this.moneyEl = document.createElement('b');
    this.moneyEl.id = 'wallet-money';
    this.jobEl = document.createElement('span');
    this.jobEl.id = 'wallet-job';
    this.wallet.append(this.moneyEl, this.jobEl);
    hud.append(this.wallet);

    // the marker over the place a job is heading for (the same kind of material as the car's marker: no new program)
    this.beacon = new THREE.Mesh(
      new THREE.ConeGeometry(0.75, 1.7, 4).rotateX(Math.PI),
      new THREE.MeshBasicMaterial({ color: 0x35d6c2, fog: false, depthTest: false, transparent: true, opacity: 0.92 }),
    );
    this.beacon.renderOrder = 50;
    this.beacon.visible = false;
    this.beacon.name = 'job-beacon';
    host.world.scene.add(this.beacon);

    this.phone = new Phone({
      canOpen: () => host.canOpenPhone(),
      onOpenChange: (open) => host.onPhone(open),
      status: () => this.status(),
      offers: (kind) => this.offers(kind).then((list) => list.map((o) => this.view(o))),
      accept: (id) => { const o = this.offersShown.find((q) => q.id === id); if (o) this.accept(o); },
      cancelJob: () => this.cancelJob(),
      showRoute: () => this.route(),
      findTaxi: () => this.findTaxi(),
      repair: () => this.repair(),
      save: () => this.save(),
      openGps: () => host.openGps(),
      openMap: () => host.openMap(),
      pause: () => host.pause(),
    });

    // the horn: H while driving (and the HORN button on touch)
    window.addEventListener('keydown', (e) => { if (e.code === 'KeyH' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) this.hornKey = true; });
    window.addEventListener('keyup', (e) => { if (e.code === 'KeyH') this.hornKey = false; });
    window.addEventListener('blur', () => { this.hornKey = this.hornTouch = false; });
    const hornBtn = document.getElementById('btn-horn');
    if (hornBtn) {
      const opts = { passive: false } as AddEventListenerOptions;
      hornBtn.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); this.hornTouch = true; }, opts);
      const up = (e: Event) => { e.preventDefault(); this.hornTouch = false; };
      hornBtn.addEventListener('touchend', up, opts);
      hornBtn.addEventListener('touchcancel', up, opts);
      hornBtn.addEventListener('mousedown', () => { this.hornTouch = true; });
      window.addEventListener('mouseup', () => { this.hornTouch = false; });
    }
    this.showMoney();
  }

  /** After the first click: audio may start. */
  unlock(): void {
    this.sfx.unlock();
  }

  private heard(v: Vehicle): void {
    const p = this.host.player.position;
    this.sfx.honk(Math.hypot(v.x - p.x, v.z - p.z), v.kind === KIND.kapcai);
  }

  /** The same job offers for the same seed and place (tests). */
  seed(n: number): void {
    this.rand = rng(n);
  }

  // ---- parked vehicles --------------------------------------------------------------------------------------------

  private get budget(): number { return this.host.life?.active ? this.host.life.budget.parked : 0; }

  /** Is a vehicle of `kind` at `p` clear of walls, water, other carriageways and steep or roofed ground? */
  private clear(p: Pose, kind: DriveKind): boolean {
    const { world } = this.host, c = world.collision, size = SIZE[DRIVE_TO_KIND[kind]];
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading), a = size.half, b = size.hw;
    const h = world.height.sample(p.x, p.z);
    const dataAt = (cx: number, cz: number) => world.chunks.dataAt(cx, cz);
    for (const [u, v] of [[0, 0], [a, 0], [-a, 0], [a, b], [a, -b], [-a, -b], [-a, b]]) {
      const x = p.x + fx * u + fz * v, z = p.z + fz * u - fx * v;
      if (!c.isLoaded(x, z) || c.inWater(x, z)) return false;
      const g = c.groundAt(x, z, h + 0.6);
      if (g.deck || Math.abs(g.h - h) > 0.35) return false;
      if (c.insideBuilding(x, z, h + 0.3, false)) return false;
      if (v === 0) {
        const r = nearestDrivable(dataAt, x, z, 0, 9);
        if (r && r.dist < r.width / 2 - 0.05) return false;
      }
    }
    return !c.boxContact(p.x, p.z, fx, fz, a + 0.35, b + 0.2, h);
  }

  /** Work out the vehicles of one more chunk near the player, and forget those of chunks that were unloaded. */
  private scan(px: number, pz: number): void {
    const { world } = this.host, c = world.collision;
    const cx0 = Math.floor(px / CHUNK_SIZE), cz0 = Math.floor(pz / CHUNK_SIZE);
    for (const key of this.scanned.keys()) {
      const [cx, cz] = key.split('_').map(Number);
      if (world.chunks.dataAt(cx, cz)) continue;
      this.scanned.delete(key);
      for (let i = this.parked.length - 1; i >= 0; i--) if (this.parked[i].chunk === key) this.parked.splice(i, 1);
    }
    let best: [number, number] | null = null, bd = Infinity;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const cx = cx0 + dx, cz = cz0 + dz, key = `${cx}_${cz}`;
      if (this.scanned.has(key) || !world.chunks.dataAt(cx, cz)) continue;
      // (walls of the neighbours must be known too: a vehicle near the chunk's edge is tested against them)
      const x0 = cx * CHUNK_SIZE, z0 = cz * CHUNK_SIZE;
      let ready = world.chunks.isReady(x0 + CHUNK_SIZE / 2, z0 + CHUNK_SIZE / 2);
      for (const [ox, oz] of [[-6, -6], [CHUNK_SIZE + 6, -6], [-6, CHUNK_SIZE + 6], [CHUNK_SIZE + 6, CHUNK_SIZE + 6]]) {
        const nx = Math.floor((x0 + ox) / CHUNK_SIZE), nz = Math.floor((z0 + oz) / CHUNK_SIZE);
        if (world.manifest.chunks.includes(`${nx}_${nz}`) && !c.isLoaded(x0 + ox, z0 + oz)) ready = false;
      }
      if (!ready) continue;
      const d = Math.hypot(x0 + CHUNK_SIZE / 2 - px, z0 + CHUNK_SIZE / 2 - pz);
      if (d < bd) { bd = d; best = [cx, cz]; }
    }
    if (!best) return;
    const [cx, cz] = best, key = `${cx}_${cz}`, data = world.chunks.dataAt(cx, cz)!;
    const car = this.host.driving;
    const spots = settle(parkingSpots(data, PAINTS.length), cx, cz, (p, kind) => this.clear(p, kind));
    let n = 0;
    for (const s of spots) {
      if (this.taken.has(s.key)) continue;
      // (not on top of the player's own vehicle, wherever that stands)
      if (car.placed && Math.hypot(s.x - car.car.x, s.z - car.car.z) < 6) continue;
      this.parked.push(this.make(s.kind, s.kind === 'taxi' ? TAXI_PAINT : PAINTS[(s.tint * 5 + 1) % PAINTS.length], 0, s.x, s.z, s.heading, s.key, key));
      n++;
    }
    this.scanned.set(key, n);
  }

  private make(drive: DriveKind, paint: number, damage: number, x: number, z: number, heading: number, key: string | null, chunk: string | null): Parked {
    const c = this.host.world.collision, h = this.host.world.height.sample(x, z);
    const y = c.isLoaded(x, z) ? c.groundAt(x, z, h + 0.6).h : h;
    const fx = Math.sin(heading) * 1.2, fz = Math.cos(heading) * 1.2;
    const pitch = c.isLoaded(x + fx, z + fz) && c.isLoaded(x - fx, z - fz) ? Math.atan2(c.groundAt(x + fx, z + fz, y + 0.8).h - c.groundAt(x - fx, z - fz, y + 0.8).h, 2.4) : 0;
    return { id: this.nextParkedId++, kind: DRIVE_TO_KIND[drive], drive, x, y: y + 0.03, z, heading, pitch, paint, damage, key, chunk };
  }

  /** Distance from a point to a parked vehicle's outline (0 inside). */
  private reach(p: Parked, x: number, z: number): number {
    const s = Math.sin(p.heading), c = Math.cos(p.heading), size = SIZE[p.kind];
    const dx = x - p.x, dz = z - p.z;
    return Math.hypot(Math.max(0, Math.abs(dx * s + dz * c) - size.half), Math.max(0, Math.abs(dx * c - dz * s) - size.hw));
  }

  /** True when E would take a parked vehicle (the player's own vehicle, when in reach too, comes first). */
  canTake(): boolean {
    return !!this.near && !this.host.driving.active;
  }

  /**
   * The player takes the parked vehicle within reach: it becomes the player's vehicle where it stands, and the vehicle
   * the player had until now stays behind, parked, where it was left. The caller then gets in (Driving.enter).
   */
  take(): boolean {
    const p = this.near, d = this.host.driving;
    if (!p || d.active) return false;
    const i = this.parked.indexOf(p);
    if (i < 0) return false;
    this.parked.splice(i, 1);
    if (p.key) this.taken.add(p.key);
    if (d.placed) {
      this.parked.push(this.make(d.kind, d.paint, d.damage, d.car.x, d.car.z, d.car.heading, null, null));
      // (no more than three vehicles are left about: the one furthest away goes)
      const left = this.parked.filter((q) => !q.key);
      if (left.length > 3) {
        const { x, z } = this.host.player.position;
        left.sort((a, b) => Math.hypot(b.x - x, b.z - z) - Math.hypot(a.x - x, a.z - z));
        this.parked.splice(this.parked.indexOf(left[0]), 1);
      }
    }
    d.setVehicle(p.drive, p.paint, p.damage);
    d.adopt(p.x, p.z, p.heading);
    this.near = null;
    this.clearWalls();
    return true;
  }

  private clearWalls(): void {
    for (let i = 0; i < this.walled; i++) this.host.world.collision.setDynamicWall(`park${i}`, null);
    this.walled = 0;
  }

  // ---- collisions and the horn ------------------------------------------------------------------------------------

  /** After the driven vehicle has moved this frame: push it out of other vehicles and count the damage. */
  afterDrive(): void {
    const d = this.host.driving, car = d.car, spec = car.spec;
    if (!d.active) return;
    if (car.impact > 0) this.hit(car.impact, null, null);
    const me = this.box, other = this.other;
    me.heading = car.heading; me.half = spec.halfLen; me.hw = spec.halfWid;
    const traffic = this.host.life?.active ? this.host.life.traffic : null;
    if (traffic) for (const v of traffic.vehicles) {
      if (Math.abs(v.x - car.x) > HIT || Math.abs(v.z - car.z) > HIT || Math.abs(v.y - car.y) > 2.5) continue;
      const size = SIZE[v.kind];
      me.x = car.x; me.z = car.z;
      other.x = v.x; other.z = v.z; other.heading = v.heading; other.half = size.half; other.hw = size.hw;
      const o = boxOverlap(me, other);
      if (!o) continue;
      const speed = closingSpeed(o, car.vx, car.vz, Math.sin(v.heading) * v.v, Math.cos(v.heading) * v.v);
      car.shove(o.px, o.pz);
      this.hit(speed, v, null);
    }
    for (const p of this.parked) {
      if (Math.abs(p.x - car.x) > HIT || Math.abs(p.z - car.z) > HIT || Math.abs(p.y - car.y) > 2.5) continue;
      const size = SIZE[p.kind];
      me.x = car.x; me.z = car.z;
      other.x = p.x; other.z = p.z; other.heading = p.heading; other.half = size.half; other.hw = size.hw;
      const o = boxOverlap(me, other);
      if (!o) continue;
      const speed = closingSpeed(o, car.vx, car.vz, 0, 0);
      car.shove(o.px, o.pz);
      this.hit(speed, null, p);
    }
  }

  private hit(speed: number, ambient: Vehicle | null, parked: Parked | null): void {
    if (ambient && speed > 0.8) this.host.life?.traffic?.bump(ambient, speed);
    if (speed < 1.5 || this.time - this.lastHit < 0.3) return;
    this.lastHit = this.time;
    this.sfx.crash(speed);
    const dmg = damageFrom(speed), d = this.host.driving;
    if (dmg <= 0) return;
    this.crashes++;
    this.hardest = Math.max(this.hardest, speed);
    const before = d.damage, after = d.hurt(dmg);
    if (parked) parked.damage = Math.min(1, parked.damage + dmg);
    if (this.job?.stage === 'dropoff') this.job.crashes++;
    if (before < 1 && after >= 1) this.host.toast(`Your ${KIND_NAME[d.kind].toLowerCase()} is wrecked: it limps. Repair it from the phone, or take another vehicle.`, 4);
    else if (before < 0.5 && after >= 0.5) this.host.toast('Badly damaged: it is losing power. The phone has a garage.', 3.5);
    else if (this.job?.stage === 'dropoff') this.host.toast(this.job.offer.kind === 'taxi' ? 'Careful: the passenger tips less after a bump.' : 'Careful: a shaken order means a smaller tip.', 2.2);
  }

  private honk(): void {
    const d = this.host.driving, car = d.car, life = this.host.life;
    const hx = Math.sin(car.heading), hz = Math.cos(car.heading);
    life?.traffic?.honk(car.x, car.z, hx, hz);
    life?.walkers?.startle(car.x, car.z, hx, hz);
  }

  // ---- jobs -------------------------------------------------------------------------------------------------------

  /** Load the job places and the road graph (first use only). */
  private load(): Promise<void> {
    this.loading ??= (async () => {
      const base = `${this.host.baseUrl}${DATA_ROOT}`;
      const [graph, file] = await Promise.all([
        loadRouteGraph(`${base}/drive-graph.json`),
        fetch(`${base}/jobs.json`).then((r) => { if (!r.ok) throw new Error(`jobs.json ${r.status}`); return r.json() as Promise<JobsFile>; }),
      ]);
      const stopping = (e: number) => isStoppingEdge(graph, e);
      const sites = sitesOf(file);
      // the game's landmarks are places too (called by their mapped names), where a public road passes within 150 m
      for (const l of this.host.world.landmarks.landmarks) if (graph.snap(l.x, l.z, 150, undefined, stopping).length) sites.push({ x: l.x, z: l.z, group: 'landmark', name: l.name });
      this.graph = graph;
      this.sites = sites;
    })();
    this.loading.catch(() => { this.loading = null; });
    return this.loading;
  }

  /** The mapped street a place stands on (the name of the nearest public carriageway), worked out when it is shown. */
  private street(s: Site): void {
    if (s.street !== undefined || s.group === 'landmark' || !this.graph) return;
    const g = this.graph, snap = g.snap(s.x, s.z, 80, undefined, (e) => isStoppingEdge(g, e) && !!g.nameOf(e))[0];
    s.street = snap ? g.nameOf(snap.edge) ?? '' : '';
  }

  /** Up to three offers of one kind from where the player is. */
  async offers(kind: JobKind): Promise<Offer[]> {
    await this.load();
    const g = this.graph!, p = this.host.player.position;
    const stopping = (e: number) => isStoppingEdge(g, e);
    const list = makeOffers(kind, this.sites!, p.x, p.z, {
      rand: this.rand, nextId: this.nextOffer,
      road: (ax, az, bx, bz) => g.route(ax, az, bx, bz, { maxSnapStart: 250, maxSnap: 160, endEdge: stopping })?.length ?? null,
    });
    this.nextOffer += list.length;
    for (const o of list) { this.street(o.from); this.street(o.to); }
    this.offersShown = list;
    return list;
  }

  private view(o: Offer): OfferView {
    return {
      id: o.id, from: describeSite(o.from), to: describeSite(o.to),
      meta: `${formatDistance(o.approach)} away · ${formatDistance(o.trip)} trip`,
      fare: `${formatRM(o.fare)} + tip`,
    };
  }

  accept(o: Offer): void {
    if (this.job) return;
    this.job = startJob(o);
    this.route();
    const where = describeSite(o.from);
    this.host.toast(o.kind === 'taxi' ? `Fare accepted. Collect the passenger: ${where}.` : `Order accepted. Collect it: ${where}.`, 4);
    this.showJob();
  }

  cancelJob(): void {
    if (!this.job) return;
    this.job = null;
    if (this.host.minimap.nav?.target.id === JOB_ID) this.host.minimap.clearRoute();
    this.beacon.visible = false; this.beaconAt = null;
    this.showJob();
  }

  private target(id: string, name: string, x: number, z: number): Landmark {
    const [lat, lon] = worldToGeo(x, z);
    return { id, name, kind: 'job', lat, lon, x, z };
  }

  /** Point the GPS (or the walking route, on foot) at the place the job is heading for. */
  route(): void {
    const job = this.job;
    if (!job) return;
    const goal = goalOf(job);
    void this.host.minimap.routeTo(this.target(JOB_ID, `${job.stage === 'pickup' ? 'pick-up' : 'drop-off'}: ${describeSite(goal)}`, goal.x, goal.z), this.host.driving.active ? 'drive' : 'walk');
  }

  private findTaxi(): void {
    const { x, z } = this.host.player.position;
    let best: Parked | null = null, bd = Infinity;
    for (const p of this.parked) { const d = Math.hypot(p.x - x, p.z - z); if (p.drive === 'taxi' && d < bd) { bd = d; best = p; } }
    if (best) void this.host.minimap.routeTo(this.target(TAXI_ID, 'a parked taxi', best.x, best.z), 'walk');
  }

  private taxiNear(): number | null {
    const { x, z } = this.host.player.position;
    let bd = Infinity;
    for (const p of this.parked) if (p.drive === 'taxi') bd = Math.min(bd, Math.hypot(p.x - x, p.z - z));
    return bd === Infinity ? null : bd;
  }

  /** Four times a second: has the job's place been reached? */
  private stepJob(): void {
    const job = this.job;
    if (!job) return;
    const { driving, player, minimap } = this.host, goal = goalOf(job);
    const nav = minimap.nav?.target.id === JOB_ID ? minimap.nav : null;
    const stop = nav?.stop ?? null, p = player.position;
    // the marker stands over the place itself
    if (!this.beaconAt || this.beaconAt.x !== goal.x || this.beaconAt.z !== goal.z) {
      this.beaconAt = { x: goal.x, z: goal.z };
      (this.beacon.material as THREE.MeshBasicMaterial).color.setHex(job.stage === 'pickup' ? 0x35d6c2 : 0xff5fd2);
    }
    this.beacon.visible = Math.hypot(goal.x - p.x, goal.z - p.z) < 400;
    if (!arrived(p.x, p.z, driving.active ? driving.car.speed : player.speed, goal, stop)) return;
    if (job.offer.kind === 'taxi' && !(driving.active && driving.kind === 'taxi')) {
      this.host.toast('Passengers ride in the taxi: bring the taxi here.', 2.5);
      return;
    }
    const pay = arrive(job);
    if (!pay) {
      // collected: now to the customer
      this.route();
      const to = describeSite(job.offer.to), secs = Math.round(parTime(job.offer.trip) / 5) * 5;
      this.host.toast(job.offer.kind === 'taxi' ? `Passenger aboard. Take them to ${to}. Full tip inside ${secs} s.` : `Order collected. Deliver it to ${to}. Full tip inside ${secs} s.`, 4.5);
      this.showJob();
      return;
    }
    this.job = null;
    this.money = sen(this.money + pay.total);
    this.stats.earned = sen(this.stats.earned + pay.total);
    this.stats[job.offer.kind]++;
    this.paid.push({ kind: job.offer.kind, total: pay.total, tip: pay.tip });
    if (minimap.nav?.target.id === JOB_ID) minimap.clearRoute();
    this.beacon.visible = false; this.beaconAt = null;
    this.sfx.cash();
    this.host.toast(`${job.offer.kind === 'taxi' ? 'Fare paid' : 'Delivered'}: ${formatRM(pay.fare)}${pay.tip > 0 ? ` + ${formatRM(pay.tip)} tip` : ', no tip'}. The phone has more jobs.`, 5);
    this.showMoney(true);
    this.showJob();
    this.save();
    this.phone.refresh();
  }

  // ---- money, the garage, saving ----------------------------------------------------------------------------------

  private repair(): void {
    const d = this.host.driving, cost = repairCost(d.damage);
    if (cost <= 0 || this.money < cost) return;
    this.money = sen(this.money - cost);
    d.repair();
    this.showMoney(true);
    this.host.toast(`Repaired for ${formatRM(cost)}.`, 2.5);
    this.save();
  }

  /** Store the progress. False when the browser would not keep it (the game carries on). */
  save(): boolean {
    const d = this.host.driving, s = this.stats;
    s.money = this.money;
    s.vehicle = d.placed ? { kind: d.kind, x: d.car.x, z: d.car.z, heading: d.car.heading, damage: d.damage, paint: d.paint } : null;
    return writeSave(s);
  }

  private status(): PhoneStatus {
    const d = this.host.driving, job = this.job, cost = repairCost(d.damage);
    const inTaxi = d.active && d.kind === 'taxi';
    return {
      money: formatRM(this.money),
      job: job ? {
        title: JOB_TITLE[job.offer.kind],
        step: job.stage === 'pickup' ? (job.offer.kind === 'taxi' ? 'Collect the passenger' : 'Collect the order') : job.offer.kind === 'taxi' ? 'Drive the passenger to' : 'Deliver the order to',
        place: describeSite(goalOf(job)),
        pay: `${formatRM(job.offer.fare)} + tip`,
      } : null,
      vehicle: { name: `${KIND_NAME[d.kind]}${d.active ? '' : ' (parked)'}`, driving: d.active, damage: d.damage, repair: cost > 0 ? formatRM(cost) : null, canRepair: this.money >= cost },
      stats: `${this.stats.delivery} deliveries · ${this.stats.taxi} fares · ${formatRM(this.stats.earned)} earned`,
      taxiBlock: inTaxi ? '' : 'Fares are driven in a taxi: get into one first.',
      taxiNear: inTaxi ? null : this.taxiNear(),
    };
  }

  private showMoney(flash = false): void {
    const text = formatRM(this.money);
    if (text !== this.shownMoney) { this.shownMoney = text; this.moneyEl.textContent = text; }
    if (flash) { this.wallet.classList.remove('flash'); void this.wallet.offsetWidth; this.wallet.classList.add('flash'); }
  }

  private showJob(): void {
    const job = this.job;
    const text = !job ? '' : `${JOB_TITLE[job.offer.kind]}: ${job.stage === 'pickup' ? 'collect at' : 'take to'} ${describeSite(goalOf(job))}`;
    if (text !== this.shownJob) { this.shownJob = text; this.jobEl.textContent = text; this.wallet.classList.toggle('has-job', !!job); }
  }

  // ---- the frame --------------------------------------------------------------------------------------------------

  /**
   * Once a frame, before the walking or driving step. `running`: the game is being played (not paused, started).
   * `inputOn`: the controls are live (no menu, map, phone or panel is open).
   */
  update(dt: number, running: boolean, inputOn: boolean): void {
    const { driving, player, world, life } = this.host;
    this.phone.update();
    if (!running) { if (this.hornHeld) { this.hornHeld = false; this.sfx.hornOff(); } return; }
    this.time += dt;
    const p = player.position;
    if (this.job?.stage === 'dropoff') this.job.time += dt;

    // the horn
    const want = (this.hornKey || this.hornTouch) && driving.active && inputOn;
    if (want !== this.hornHeld) {
      this.hornHeld = want;
      if (want) { this.sfx.hornOn(driving.kind === 'kapcai'); this.honk(); } else this.sfx.hornOff();
    }

    // getting in and out: the first time at a wheel, say where the jobs are
    if (driving.active !== this.wasDriving) {
      this.wasDriving = driving.active;
      if (driving.active) this.clearWalls();
      if (driving.active && !this.hinted && !this.job && this.stats.delivery + this.stats.taxi === 0) {
        this.hinted = true;
        this.host.toast(this.host.touch ? 'Tap the phone button for delivery and taxi jobs.' : 'Press T for the phone: delivery and taxi jobs.', 4.5);
      }
    }

    // the parked vehicles: which exist, which are drawn, which block the walker, which one E would take
    const budget = this.budget;
    this.tick++;
    if (budget > 0 && this.tick % 12 === 0) this.scan(p.x, p.z);
    if (budget <= 0 && this.parked.length) { this.parked.length = 0; this.scanned.clear(); this.clearWalls(); }
    if (life) {
      // (an ambient driver's horn is heard from where the vehicle is)
      if (life.traffic && !life.traffic.onHorn) life.traffic.onHorn = (v) => this.heard(v);
      const draw = this.draw;
      draw.length = 0;
      if (budget > 0) {
        for (const q of this.parked) if (Math.abs(q.x - p.x) < 170 && Math.abs(q.z - p.z) < 170) draw.push(q);
        if (draw.length > budget) { draw.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z)); draw.length = budget; }
      }
      life.parked = draw;
      // vehicles the player left standing are in the traffic's way like the player's own
      const obs = this.obstacles;
      let n = 0;
      for (const q of this.parked) {
        if (q.key || Math.abs(q.x - p.x) > 200 || Math.abs(q.z - p.z) > 200) continue;
        for (const k of [-1, 1]) {
          const o = obs[n] ?? (obs[n] = { x: 0, z: 0, r: 0, vx: 0, vz: 0 });
          const half = SIZE[q.kind].half * 0.5;
          o.x = q.x + Math.sin(q.heading) * half * k; o.z = q.z + Math.cos(q.heading) * half * k; o.r = q.kind === KIND.kapcai ? 0.5 : 1; n++;
        }
      }
      obs.length = n;
      life.extraObstacles = obs;
    }
    let near: Parked | null = null;
    if (!driving.active) {
      const c = world.collision;
      let k = 0, best = ENTER_RANGE;
      for (const q of this.draw) {
        if (Math.abs(q.x - p.x) > WALL_RANGE || Math.abs(q.z - p.z) > WALL_RANGE) continue;
        const d = this.reach(q, p.x, p.z);
        if (d <= best && Math.abs(q.y - p.y) < 2) { best = d; near = q; }
        if (k >= WALLS) continue;
        const s = SIZE[q.kind], hx = Math.sin(q.heading), hz = Math.cos(q.heading), a = s.half, e = s.hw;
        c.setDynamicWall(`park${k++}`, [
          q.x + hx * a + hz * e, q.z + hz * a - hx * e, q.x + hx * a - hz * e, q.z + hz * a + hx * e,
          q.x - hx * a - hz * e, q.z - hz * a + hx * e, q.x - hx * a + hz * e, q.z - hz * a - hx * e,
        ], q.y + (q.kind === KIND.kapcai ? 1.0 : 1.3));
      }
      for (let i = k; i < this.walled; i++) c.setDynamicWall(`park${i}`, null);
      this.walled = k;
    }
    this.near = near;
    // (the player's own vehicle, when it is in reach too, is what E gets into)
    driving.nearKind = near && inputOn ? near.drive : null;

    if (this.job) {
      if (this.tick % 15 === 0) this.stepJob();
      if (this.beacon.visible && this.beaconAt) {
        const b = this.beaconAt, c = world.collision;
        const y = c.isLoaded(b.x, b.z) ? c.groundAt(b.x, b.z, 1e6).h : world.height.sample(b.x, b.z);
        this.beacon.position.set(b.x, y + 4.2 + Math.sin(this.time * 2.4) * 0.25, b.z);
        this.beacon.rotation.y = this.time * 1.5;
      }
    }
  }

  setSound(on: boolean): void { this.sfx.setEnabled(on); }
}
