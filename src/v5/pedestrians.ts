// V7.4 street-life prototype: two or three pedestrians in the Jalan China section.
//
// Deliberately small: each pedestrian walks back and forth along a fixed route down the middle of a
// five-foot way (through the party-wall walk-throughs, up and down the steps between lots), stops for a
// while at marked points, and waits when the player stands in the way. No path finding, no crowd logic,
// no dialogue. Everything is created when the section is shown and disposed when it is hidden.
//
// Model: the CC0 "Casual Character" already shipped for the player (docs/ASSETS.md), cloned and re-coloured.
// It is a stylised low-poly figure, not a realistic human: see docs/V7.4_REPORT.md.
import * as THREE from 'three';
import { CHINA } from './geo.ts';
import type { CharacterVisual } from '../player/CharacterAnimator.ts';

export interface PedestrianHost {
  baseUrl: string;
  low: boolean;
  /** Height of the walkable surface under feet at height y. */
  ground(x: number, z: number, y: number): number;
  /** True when a standing character at this point would be pushed by a wall, pier or vehicle. */
  blocked(x: number, z: number, y: number): boolean;
}

/** A route point: station along the street (m from the Carpenter Street end) and depth behind the pier line. */
interface Stop { s: number; d: number; wait?: number; faceShop?: boolean }
interface RouteDef {
  /** -1 = west row, +1 = east row. */
  side: -1 | 1;
  stops: Stop[];
  speed: number;
  height: number;
  /** Clothing and hair colours by the model's material names. */
  tint: Record<string, number>;
  /** Where along the route the pedestrian starts (0..1 of the stop list). */
  start: number;
}

// Depth 1.38 m is the middle of the walk-through openings (0.72 .. 2.05 m behind the pier line).
const ROUTES: RouteDef[] = [
  // west row: from the Ann Kee shopfront (No. 27) down to No. 17 and back, pausing at the shopfront
  { side: -1, speed: 1.25, height: 1.66, start: 0.35, tint: { LightBrown: 0x2f5f8a, LightBlue: 0x2a2c33, Red_Dark: 0x1d1d20, Hair: 0x0c0a09 },
    stops: [{ s: 8.6, d: 1.38, wait: 3 }, { s: 13.7, d: 1.38, wait: 7, faceShop: true }, { s: 41.0, d: 1.38, wait: 4 }] },
  // east row: most of the row, opposite direction
  { side: 1, speed: 1.35, height: 1.72, start: 0.7, tint: { LightBrown: 0xc9c2b2, LightBlue: 0x3a3f4a, Red_Dark: 0x3a2a22, Hair: 0x1a1512, Skin: 0xb07a52, Skin_Darker: 0x95653f },
    stops: [{ s: 6.0, d: 1.38, wait: 4 }, { s: 33.0, d: 1.38, wait: 5, faceShop: true }, { s: 62.0, d: 1.38, wait: 4 }] },
  // west row, lower half (kept clear of the first route, so that two never meet in a walk-through)
  { side: -1, speed: 1.1, height: 1.58, start: 0.2, tint: { LightBrown: 0x8a2f3a, LightBlue: 0x6a6258, Red_Dark: 0x2a2a2e, Hair: 0x3a3a3a, Skin: 0xc79a72, Skin_Darker: 0xa67a56 },
    stops: [{ s: 46.6, d: 1.38, wait: 6, faceShop: true }, { s: 84.0, d: 1.38, wait: 4 }] },
];

const ACCEL = 2.2, TURN = 4.5, PLAYER_GAP = 1.15;

class Pedestrian {
  readonly visual: CharacterVisual;
  readonly def: RouteDef;
  /** Index of the stop being walked toward, and the direction through the stop list. */
  private next = 1;
  private dir: 1 | -1 = 1;
  private wait = 0;
  private faceYaw: number | null = null;
  s = 0; d = 0; y = 0; yaw = 0; speed = 0;
  frozen = false;

  constructor(visual: CharacterVisual, def: RouteDef) {
    this.visual = visual; this.def = def;
    visual.root.scale.setScalar(def.height / 1.72);
    // start part-way along the route
    const n = def.stops.length - 1, f = Math.min(0.999, Math.max(0, def.start)) * n, i = Math.floor(f), a = def.stops[i], b = def.stops[i + 1];
    this.s = a.s + (b.s - a.s) * (f - i); this.d = a.d + (b.d - a.d) * (f - i); this.next = i + 1;
  }

  world(): [number, number] { return CHINA.toWorld(this.s, this.def.side * (CHINA.half + this.d)); }

  /** Put the pedestrian at a station, standing or in mid-stride, and hold it there (used for fixed captures). */
  place(s: number, walking: boolean, northward: boolean, host: PedestrianHost): void {
    this.s = s; this.frozen = true; this.speed = walking ? this.def.speed : 0;
    const [x, z] = this.world();
    this.y = host.ground(x, z, 1e6);
    this.yaw = Math.atan2(CHINA.dx, CHINA.dz) + (northward ? 0 : Math.PI);
    this.apply(0.4);
  }

  update(dt: number, host: PedestrianHost, px: number, pz: number): void {
    if (this.frozen) { this.visual.update(0, { speed: this.speed, grounded: true, vy: 0 }); return; }
    const stops = this.def.stops, t = stops[this.next];
    let want = this.def.speed;
    const ds = t.s - this.s, dd = t.d - this.d, dist = Math.hypot(ds, dd);
    if (this.wait > 0) { this.wait -= dt; want = 0; }
    else if (dist < 0.05) {
      // arrived: pause if the stop says so, then carry on (turning round at the ends)
      this.wait = t.wait ?? 0;
      this.faceYaw = t.faceShop ? Math.atan2(CHINA.nx * this.def.side, CHINA.nz * this.def.side) : null;
      if (this.next + this.dir < 0 || this.next + this.dir >= stops.length) this.dir = -this.dir as 1 | -1;
      this.next += this.dir;
      want = 0;
    } else {
      // slow down into the stop; stand still while the player is in the way
      want = Math.min(want, Math.sqrt(2 * ACCEL * dist) + 0.05);
      const [x, z] = this.world(), fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), ox = px - x, oz = pz - z;
      if (ox * ox + oz * oz < PLAYER_GAP * PLAYER_GAP && ox * fx + oz * fz > 0) want = 0;
    }
    this.speed += Math.max(-ACCEL * dt, Math.min(ACCEL * dt, want - this.speed));
    let target = this.yaw;
    if (this.speed > 0.02 && dist > 1e-4 && this.wait <= 0) {
      const step = Math.min(dist, this.speed * dt);
      this.s += (ds / dist) * step; this.d += (dd / dist) * step;
      const wx = CHINA.dx * ds + CHINA.nx * this.def.side * dd, wz = CHINA.dz * ds + CHINA.nz * this.def.side * dd;
      target = Math.atan2(wx, wz);
    } else if (this.wait > 0 && this.faceYaw !== null) target = this.faceYaw;
    const dy = Math.atan2(Math.sin(target - this.yaw), Math.cos(target - this.yaw));
    this.yaw += Math.max(-TURN * dt, Math.min(TURN * dt, dy));
    const [x, z] = this.world();
    const g = host.ground(x, z, this.y);
    this.y += (g - this.y) * Math.min(1, dt * 14);
    this.apply(dt);
  }

  private apply(dt: number): void {
    const [x, z] = this.world(), r = this.visual.root;
    r.position.set(x, this.y, z);
    r.rotation.y = this.yaw;
    this.visual.update(dt, { speed: this.speed, grounded: true, vy: 0 });
  }
}

/** Soft round patch under the feet (the shadow map is too coarse under the covered way). */
function blobMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec2 vUv; void main() { float r = length(vUv - 0.5) * 2.0; gl_FragColor = vec4(0.0, 0.0, 0.0, 0.34 * (1.0 - smoothstep(0.25, 1.0, r))); }',
  });
}

export class Pedestrians {
  readonly group = new THREE.Group();
  list: Pedestrian[] = [];
  readonly host: PedestrianHost;
  private token = 0;
  private blobGeo: THREE.PlaneGeometry | null = null;
  private blobMat: THREE.ShaderMaterial | null = null;
  private blobs: THREE.Mesh[] = [];

  constructor(host: PedestrianHost) { this.host = host; this.group.name = 'v7-pedestrians'; }

  get active(): boolean { return this.list.length > 0; }

  /** Load the model and create the pedestrians (two on the low preset, three otherwise). Safe to call twice. */
  async start(): Promise<void> {
    if (this.list.length) return;
    const token = ++this.token;
    try {
      const [{ GLTFLoader }, { GlbCharacter }, SkeletonUtils] = await Promise.all([
        import('three/addons/loaders/GLTFLoader.js'), import('../player/GlbCharacter.ts'), import('three/addons/utils/SkeletonUtils.js'),
      ]);
      const gltf = await new GLTFLoader().loadAsync(`${this.host.baseUrl}models/characters/casual-character.glb`);
      if (token !== this.token) return;
      this.blobGeo = new THREE.PlaneGeometry(0.8, 0.8).rotateX(-Math.PI / 2);
      this.blobMat = blobMaterial();
      for (const def of ROUTES.slice(0, this.host.low ? 2 : 3)) {
        const visual = new GlbCharacter({ scene: SkeletonUtils.clone(gltf.scene), animations: gltf.animations });
        visual.root.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = !this.host.low;
          mesh.receiveShadow = true; // shaded under the covered way like everything round them
          for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) { const c = def.tint[m.name]; if (c !== undefined) (m as THREE.MeshLambertMaterial).color.setHex(c); }
        });
        const p = new Pedestrian(visual, def);
        const [x, z] = p.world();
        p.y = this.host.ground(x, z, 1e6);
        this.group.add(visual.root);
        const blob = new THREE.Mesh(this.blobGeo, this.blobMat);
        blob.renderOrder = 4;
        this.group.add(blob); this.blobs.push(blob);
        this.list.push(p);
      }
      this.update(0, 1e9, 1e9);
    } catch (e) {
      console.warn('V7.4 pedestrians unavailable:', e);
      this.stop();
    }
  }

  update(dt: number, px: number, pz: number): void {
    this.list.forEach((p, i) => {
      p.update(Math.min(dt, 0.1), this.host, px, pz);
      const r = p.visual.root.position;
      this.blobs[i].position.set(r.x, p.y + 0.012, r.z);
    });
  }

  /** Check every route against the collision world: [route, station] of each blocked or unsupported sample. */
  validate(): { route: number; s: number; why: string }[] {
    const bad: { route: number; s: number; why: string }[] = [];
    ROUTES.forEach((def, i) => {
      for (let j = 1; j < def.stops.length; j++) {
        const a = def.stops[j - 1], b = def.stops[j], n = Math.ceil(Math.abs(b.s - a.s) / 0.2);
        let y = Infinity;
        for (let q = 0; q <= n; q++) {
          const s = a.s + ((b.s - a.s) * q) / n, d = a.d + ((b.d - a.d) * q) / n, [x, z] = CHINA.toWorld(s, def.side * (CHINA.half + d));
          const g = this.host.ground(x, z, y === Infinity ? 1e6 : y);
          if (y !== Infinity && Math.abs(g - y) > 0.22) bad.push({ route: i, s: +s.toFixed(2), why: `step ${(g - y).toFixed(2)} m` });
          y = g;
          if (this.host.blocked(x, z, y)) bad.push({ route: i, s: +s.toFixed(2), why: 'blocked' });
        }
      }
    });
    return bad;
  }

  /** Remove the pedestrians and free their meshes, materials and skeletons. */
  stop(): void {
    this.token++;
    for (const p of this.list) p.visual.dispose();
    for (const b of this.blobs) b.removeFromParent();
    this.blobGeo?.dispose(); this.blobMat?.dispose();
    this.blobGeo = null; this.blobMat = null;
    this.list = []; this.blobs = [];
    this.group.clear();
  }
}
