import * as THREE from 'three';
import { CHUNK_SIZE, QUANT, WATER_LEVEL } from '../config.ts';
import type { ChunkData } from '../types.ts';
import { GeoBuf } from '../Materials.ts';
import type { BuildContext } from '../ChunkManager.ts';
import { PROP, chunkProps, medianRuns, stationOfChunk } from './props.ts';
import type { Prop } from './props.ts';
import { MB_CARRIAGEWAY, MB_NORTH, inDistrict, lineLength, pointAt } from './mainBazaar.ts';

// Meshes for the district street dressing (see props.ts for what is real and what is approximate).
// One merged vertex-colour mesh for hard objects, one for foliage, one unlit mesh for lamp globes.

const c = new THREE.Color();
const UP: [number, number, number] = [0, 1, 0];

/** Frame at (x, z) with forward t and right r = (-tz, tx); a = along, b = across. */
class Fr {
  constructor(readonly buf: GeoBuf, readonly x: number, readonly y: number, readonly z: number, readonly tx: number, readonly tz: number) {}
  p(a: number, b: number, h: number): [number, number, number] {
    return [this.x + this.tx * a - this.tz * b, this.y + h, this.z + this.tz * a + this.tx * b];
  }
  /** Convex polygon from points given as [a, b, h], flat shaded, double-sided material assumed. */
  poly(pts: [number, number, number][], col: THREE.Color): void {
    const P = pts.map((q) => this.p(q[0], q[1], q[2]));
    const ux = P[1][0] - P[0][0], uy = P[1][1] - P[0][1], uz = P[1][2] - P[0][2];
    const vx = P[2][0] - P[0][0], vy = P[2][1] - P[0][1], vz = P[2][2] - P[0][2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const base = this.buf.count;
    for (const q of P) this.buf.vert(q[0], q[1], q[2], nx, ny, nz, col);
    for (let i = 1; i < P.length - 1; i++) this.buf.tri(base, base + i, base + i + 1);
  }
  /** Box a0..a1, b0..b1, h0..h1 (bottom omitted). Faces wound outward. */
  box(a0: number, a1: number, b0: number, b1: number, h0: number, h1: number, col: THREE.Color): void {
    this.poly([[a0, b0, h1], [a0, b1, h1], [a1, b1, h1], [a1, b0, h1]], col);
    this.poly([[a0, b0, h0], [a0, b0, h1], [a1, b0, h1], [a1, b0, h0]], col);
    this.poly([[a1, b1, h0], [a1, b1, h1], [a0, b1, h1], [a0, b1, h0]], col);
    this.poly([[a0, b1, h0], [a0, b1, h1], [a0, b0, h1], [a0, b0, h0]], col);
    this.poly([[a1, b0, h0], [a1, b0, h1], [a1, b1, h1], [a1, b1, h0]], col);
  }
  /** Tapered n-gon column standing at (a, b). */
  cyl(a: number, b: number, h0: number, h1: number, r0: number, r1: number, sides: number, col: THREE.Color, cap = true): void {
    for (let i = 0; i < sides; i++) {
      const u0 = (i / sides) * Math.PI * 2, u1 = ((i + 1) / sides) * Math.PI * 2;
      this.poly([[a + Math.cos(u0) * r0, b + Math.sin(u0) * r0, h0], [a + Math.cos(u0) * r1, b + Math.sin(u0) * r1, h1], [a + Math.cos(u1) * r1, b + Math.sin(u1) * r1, h1], [a + Math.cos(u1) * r0, b + Math.sin(u1) * r0, h0]], col);
    }
    if (cap) { const top: [number, number, number][] = []; for (let i = 0; i < sides; i++) { const u = (i / sides) * Math.PI * 2; top.push([a + Math.cos(u) * r1, b - Math.sin(u) * r1, h1]); } this.poly(top, col); }
  }
  /** Wheel: octagonal disc in the vertical plane along the forward axis at (a, b), b1 = outer face. */
  wheel(a: number, b0: number, b1: number, r: number, col: THREE.Color): void {
    const N = 10, rim: [number, number, number][] = [];
    for (let i = 0; i < N; i++) { const u = (i / N) * Math.PI * 2; rim.push([a + Math.cos(u) * r, b1, r + Math.sin(u) * r]); }
    this.poly(rim, col);
    for (let i = 0; i < N; i++) { const p = rim[i], q = rim[(i + 1) % N]; this.poly([[p[0], b0, p[2]], [p[0], b1, p[2]], [q[0], b1, q[2]], [q[0], b0, q[2]]], col); }
    const hub: [number, number, number][] = [];
    const off = b1 + Math.sign(b1 - b0) * 0.005;
    for (let i = 0; i < 10; i++) { const u = (i / 10) * Math.PI * 2; hub.push([a + Math.cos(u) * r * 0.46, off, r + Math.sin(u) * r * 0.46]); }
    this.poly(hub, c.setRGB(0.3, 0.31, 0.33));
  }
}

let ICO: Float32Array | null = null;
/** Lumpy smooth-shaded blob (foliage mass): jittered icosphere, darker underneath. */
export function blob(buf: GeoBuf, x: number, y: number, z: number, rx: number, ry: number, rz: number, col: THREE.Color, seed: number, u = 0, v = 0): void {
  if (!ICO) ICO = new THREE.IcosahedronGeometry(1, 1).getAttribute('position').array as Float32Array;
  const jit = (i: number) => { const s = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453; return s - Math.floor(s); };
  const base = buf.count;
  const tmp = new THREE.Color();
  for (let i = 0; i < ICO.length; i += 3) {
    const nx = ICO[i], ny = ICO[i + 1], nz = ICO[i + 2];
    // Jitter keyed on the rounded direction so shared corners move together (no cracks).
    const k = Math.round(nx * 50) * 7 + Math.round(ny * 50) * 131 + Math.round(nz * 50) * 1009;
    const r = 0.8 + jit(k) * 0.38;
    const shade = 0.5 + 0.5 * Math.max(0, ny * 0.5 + 0.5) + (jit(k + 5) - 0.5) * 0.22;
    tmp.copy(col).multiplyScalar(shade);
    buf.vert(x + nx * rx * r, y + ny * ry * r, z + nz * rz * r, nx, ny * 0.8 + 0.2, nz, tmp, u, v);
  }
  for (let i = 0; i < ICO.length / 3; i += 3) buf.tri(base + i, base + i + 1, base + i + 2);
}

/** Straight tapered limb between two points (trunks, branches). */
function limb(buf: GeoBuf, p0: THREE.Vector3, p1: THREE.Vector3, r0: number, r1: number, col: THREE.Color): void {
  const d = new THREE.Vector3().subVectors(p1, p0).normalize();
  const u = new THREE.Vector3(1, 0, 0);
  if (Math.abs(d.x) > 0.9) u.set(0, 0, 1);
  const a = new THREE.Vector3().crossVectors(d, u).normalize(), b = new THREE.Vector3().crossVectors(d, a);
  const N = 6;
  for (let i = 0; i < N; i++) {
    const t0 = (i / N) * Math.PI * 2, t1 = ((i + 1) / N) * Math.PI * 2;
    const n0 = a.clone().multiplyScalar(Math.cos(t0)).addScaledVector(b, Math.sin(t0)), n1 = a.clone().multiplyScalar(Math.cos(t1)).addScaledVector(b, Math.sin(t1));
    const i0 = buf.vert(p0.x + n0.x * r0, p0.y + n0.y * r0, p0.z + n0.z * r0, n0.x, n0.y, n0.z, col);
    const i1 = buf.vert(p0.x + n1.x * r0, p0.y + n1.y * r0, p0.z + n1.z * r0, n1.x, n1.y, n1.z, col);
    const i2 = buf.vert(p1.x + n1.x * r1, p1.y + n1.y * r1, p1.z + n1.z * r1, n1.x, n1.y, n1.z, col);
    const i3 = buf.vert(p1.x + n0.x * r1, p1.y + n0.y * r1, p1.z + n0.z * r1, n0.x, n0.y, n0.z, col);
    buf.tri(i0, i1, i2); buf.tri(i0, i2, i3);
  }
}

const CAR_PAINT = [0xf2f2f0, 0xdcdddf, 0xa9adb2, 0x2a2c30, 0xf2f2f0, 0x8f1f1c, 0x24457a, 0xc9c9c6, 0x5d6166, 0xe9e6dc, 0x7a1d24, 0x3a6f8f];

function car(f: Fr, v: number): void {
  const type = v % 5; // 0-2 hatchback, 3 sedan, 4 pickup
  const L = type === 4 ? 5.1 : type === 3 ? 4.4 : 3.9, W = type === 4 ? 0.9 : 0.84;
  const body = new THREE.Color(CAR_PAINT[(v >>> 4) % CAR_PAINT.length]);
  const dark = new THREE.Color(0x15171a), glass = new THREE.Color(0x27333b), trim = new THREE.Color(0x1d1e20);
  const h0 = 0.26, belt = 0.92, roof = type === 4 ? 1.72 : 1.5;
  const x0 = -L / 2, x1 = L / 2;
  // Lower body with sloping nose and tail.
  f.box(x0 + 0.08, x1 - 0.1, -W, W, h0, 0.62, body);
  f.poly([[x0, -W + 0.04, 0.62], [x0, W - 0.04, 0.62], [x0 + 0.12, W - 0.04, belt], [x0 + 0.12, -W + 0.04, belt]], body);
  f.poly([[x1, W - 0.04, 0.62], [x1, -W + 0.04, 0.62], [x1 - 0.2, -W + 0.04, belt - 0.1], [x1 - 0.2, W - 0.04, belt - 0.1]], body);
  f.box(x0 + 0.12, x1 - 0.2, -W, W, 0.62, belt - 0.1, body);
  f.poly([[x0 + 0.12, -W, belt - 0.1], [x0 + 0.12, W, belt - 0.1], [x0 + 0.12, W, belt], [x0 + 0.12, -W, belt]], body);
  // Bumpers and lights.
  f.box(x0 - 0.04, x0 + 0.1, -W + 0.02, W - 0.02, h0, 0.5, trim);
  f.box(x1 - 0.12, x1 + 0.04, -W + 0.02, W - 0.02, h0, 0.5, trim);
  for (const s of [-1, 1]) {
    f.poly([[x1 - 0.06, s * (W - 0.34), 0.66], [x1 - 0.06, s * (W - 0.06), 0.66], [x1 - 0.13, s * (W - 0.06), 0.8], [x1 - 0.13, s * (W - 0.34), 0.8]], c.setRGB(0.95, 0.93, 0.82));
    f.poly([[x0 + 0.03, s * (W - 0.3), 0.7], [x0 + 0.03, s * (W - 0.05), 0.7], [x0 + 0.09, s * (W - 0.05), 0.88], [x0 + 0.09, s * (W - 0.3), 0.88]], c.setRGB(0.7, 0.08, 0.06));
  }
  // Greenhouse.
  const cb = type === 4 ? x1 - 2.75 : type === 3 ? x0 + 0.85 : x0 + 0.14, cf = x1 - (type === 4 ? 1.35 : 1.2);
  const tb = cb + (type === 3 ? 0.5 : 0.22), tf = cf - 0.62, w2 = W - 0.1;
  f.poly([[cb, -W, belt], [cb, W, belt], [tb, w2, roof], [tb, -w2, roof]], glass);
  f.poly([[cf, W, belt], [cf, -W, belt], [tf, -w2, roof], [tf, w2, roof]], glass);
  for (const s of [-1, 1]) {
    f.poly([[cb, s * W, belt], [cf, s * W, belt], [tf, s * w2, roof], [tb, s * w2, roof]], glass);
    // Pillars over the glass.
    for (const pa of [cb + 0.04, (cb + cf) / 2 - 0.1, cf - 0.3]) {
      const t = (pa - cb) / (cf - cb), top = tb + (tf - tb) * t;
      f.poly([[pa, s * (W + 0.004), belt], [pa + 0.09, s * (W + 0.004), belt], [top + 0.09, s * (w2 + 0.004), roof], [top, s * (w2 + 0.004), roof]], body);
    }
  }
  f.poly([[tb, -w2, roof], [tb, w2, roof], [tf, w2, roof], [tf, -w2, roof]], body);
  f.poly([[cf, -W, belt], [cf, W, belt], [x1 - 0.2, W, belt - 0.1], [x1 - 0.2, -W, belt - 0.1]], body); // bonnet
  if (type === 4) {
    // Pickup bed.
    f.box(x0 + 0.14, cb - 0.04, -W, -W + 0.06, belt - 0.1, belt + 0.28, body);
    f.box(x0 + 0.14, cb - 0.04, W - 0.06, W, belt - 0.1, belt + 0.28, body);
    f.box(x0 + 0.12, x0 + 0.18, -W, W, belt - 0.1, belt + 0.28, body);
    f.poly([[x0 + 0.14, -W, belt - 0.08], [x0 + 0.14, W, belt - 0.08], [cb, W, belt - 0.08], [cb, -W, belt - 0.08]], dark);
  } else if (type !== 3) f.poly([[x0 + 0.12, -W, belt], [x0 + 0.12, W, belt], [cb, W, belt], [cb, -W, belt]], body);
  else f.poly([[x0 + 0.12, -W, belt], [x0 + 0.12, W, belt], [cb, W, belt], [cb, -W, belt]], body);
  const r = type === 4 ? 0.37 : 0.31;
  for (const a of [x0 + 0.8, x1 - 0.85]) { f.wheel(a, W - 0.2, W + 0.02, r, dark); f.wheel(a, -W + 0.2, -W - 0.02, r, dark); }
  // Shadow-catching underside.
  f.poly([[x0 + 0.1, -W + 0.1, h0], [x1 - 0.1, -W + 0.1, h0], [x1 - 0.1, W - 0.1, h0], [x0 + 0.1, W - 0.1, h0]], dark);
}

function rainTree(solid: GeoBuf, leaf: GeoBuf, x: number, y: number, z: number, v: number): void {
  const bark = new THREE.Color(0x5d4a3a);
  const s = 0.85 + (v % 7) * 0.05;
  const base = new THREE.Vector3(x, y - 0.2, z), fork = new THREE.Vector3(x + ((v >>> 3) % 5 - 2) * 0.08, y + 3.1 * s, z + ((v >>> 6) % 5 - 2) * 0.08);
  limb(solid, base, fork, 0.42 * s, 0.3 * s, bark);
  const green = new THREE.Color().setHSL(0.29 + ((v >>> 9) % 6) * 0.008, 0.48, 0.2 + ((v >>> 12) % 5) * 0.012);
  const N = 5;
  for (let i = 0; i < N; i++) {
    const ang = (i / N) * Math.PI * 2 + (v % 13) * 0.3, reach = (4.2 + ((v >>> (i * 2)) % 4) * 0.5) * s;
    const end = new THREE.Vector3(fork.x + Math.cos(ang) * reach, fork.y + (3.2 + (i % 2) * 0.7) * s, fork.z + Math.sin(ang) * reach);
    limb(solid, fork, end, 0.2 * s, 0.07 * s, bark);
    blob(leaf, end.x, end.y + 0.5 * s, end.z, 3.6 * s, 1.5 * s, 3.6 * s, green, v + i * 17);
  }
  blob(leaf, fork.x, fork.y + 5.2 * s, fork.z, 4.4 * s, 1.7 * s, 4.4 * s, green, v + 99);
}

function boat(f: Fr, v: number): void {
  // Tambang: narrow timber ferry with a pitched canopy; hull stripes in the usual red / white / blue.
  const hull = new THREE.Color([0x1f4f9a, 0xb3261e, 0x1c7a4a, 0x1f4f9a][v % 4]), white = new THREE.Color(0xf1efe8), red = new THREE.Color([0xb3261e, 0x1f4f9a, 0xd9a520][(v >>> 3) % 3]);
  const L = 3.6, W = 0.72;
  const sect: [number, number][] = [[-L, 0.18], [-L * 0.75, W * 0.8], [-L * 0.2, W], [L * 0.45, W], [L * 0.85, W * 0.55], [L, 0.1]];
  for (let i = 0; i < sect.length - 1; i++) {
    const [a0, w0] = sect[i], [a1, w1] = sect[i + 1];
    const lift0 = Math.abs(a0) > L * 0.8 ? 0.22 : 0, lift1 = Math.abs(a1) > L * 0.8 ? 0.22 : 0;
    for (const s of [-1, 1]) {
      f.poly([[a0, s * w0 * 0.6, -0.15], [a1, s * w1 * 0.6, -0.15], [a1, s * w1, 0.3 + lift1], [a0, s * w0, 0.3 + lift0]], hull);
      f.poly([[a0, s * w0, 0.3 + lift0], [a1, s * w1, 0.3 + lift1], [a1, s * w1, 0.48 + lift1], [a0, s * w0, 0.48 + lift0]], white);
    }
    f.poly([[a0, -w0, 0.34 + lift0], [a0, w0, 0.34 + lift0], [a1, w1, 0.34 + lift1], [a1, -w1, 0.34 + lift1]], c.setHex(0x8a6a48));
  }
  for (const a of [-1.9, 1.5]) for (const s of [-1, 1]) f.box(a - 0.03, a + 0.03, s * (W - 0.08) - 0.03, s * (W - 0.08) + 0.03, 0.4, 1.55, white);
  f.poly([[-2.2, -W - 0.05, 1.5], [1.8, -W - 0.05, 1.5], [1.8, 0, 1.78], [-2.2, 0, 1.78]], red);
  f.poly([[-2.2, W + 0.05, 1.5], [1.8, W + 0.05, 1.5], [1.8, 0, 1.78], [-2.2, 0, 1.78]], red);
}

const BIKE_PAINT = [0xb3261e, 0x1f4f9a, 0x1b1c1e, 0xe9e6dc, 0x1c7a4a, 0xd9a520];

/** N1-M5 kapcai (underbone motorbike), long axis forward. Generic form. */
function kapcai(f: Fr, v: number): void {
  const paint = new THREE.Color(BIKE_PAINT[v % BIKE_PAINT.length]), dark = new THREE.Color(0x17181a), steel = new THREE.Color(0x8a8f93);
  f.wheel(-0.62, -0.045, 0.045, 0.28, dark); f.wheel(0.62, -0.045, 0.045, 0.28, dark);
  f.box(-0.55, 0.12, -0.13, 0.13, 0.4, 0.7, paint);                       // body under the seat
  f.box(-0.52, 0.05, -0.12, 0.12, 0.7, 0.77, dark);                       // seat
  f.box(-0.84, -0.5, -0.09, 0.09, 0.6, 0.68, paint);                      // tail
  f.box(-0.9, -0.62, -0.14, 0.14, 0.68, 0.71, steel);                     // rack
  f.box(0.12, 0.3, -0.07, 0.07, 0.3, 0.42, dark);                         // step-through floor and engine
  f.poly([[0.28, -0.2, 0.34], [0.28, 0.2, 0.34], [0.44, 0.16, 0.9], [0.44, -0.16, 0.9]], paint); // leg shield
  f.box(0.5, 0.56, -0.035, 0.035, 0.28, 0.92, steel);                     // fork
  f.box(0.42, 0.54, -0.1, 0.1, 0.86, 1.0, paint);                         // headlamp cowl
  f.box(0.4, 0.45, -0.31, 0.31, 1.0, 1.04, dark);                         // handlebar
  f.poly([[0.545, -0.07, 0.89], [0.545, 0.07, 0.89], [0.545, 0.07, 0.98], [0.545, -0.07, 0.98]], c.setRGB(0.95, 0.93, 0.82));
}

/** N1-M5 palm on the river bank: ringed trunk and a crown of arching fronds (generic form). */
function palm(f: Fr, v: number): void {
  const H = 5.6 + (v % 5) * 0.4, lean = ((v >>> 4) % 5 - 2) * 0.09;
  const bark = new THREE.Color(0x8a7a66);
  // a gently curved trunk in four straight pieces that share their joints
  const bend = (t: number) => lean * 5 * t * t, top = bend(1);
  for (let k = 0; k < 4; k++) {
    const t0 = k / 4, t1 = (k + 1) / 4, p0 = f.p(bend(t0), 0, H * t0 - (k ? 0 : 0.15)), p1 = f.p(bend(t1), 0, H * t1);
    limb(f.buf, new THREE.Vector3(...p0), new THREE.Vector3(...p1), 0.17 - k * 0.018, 0.152 - k * 0.018, bark);
  }
  const N = 9;
  for (let i = 0; i < N; i++) {
    const u = (i / N) * Math.PI * 2 + (v % 7) * 0.4, cu = Math.cos(u), su = Math.sin(u), droop = 0.25 + (((v >>> (i + 3)) & 3) * 0.12);
    const g = new THREE.Color().setHSL(0.27 + ((v >>> i) & 3) * 0.008, 0.5, 0.2 + ((v >>> (i + 1)) & 3) * 0.02);
    const P = (r: number, l: number, h: number): [number, number, number] => [top + cu * r - su * l, su * r + cu * l, H + h];
    f.poly([P(0.1, -0.2, 0), P(0.1, 0.2, 0), P(1.5, 0.42, 0.7), P(1.5, -0.42, 0.7)], g);
    f.poly([P(1.5, -0.42, 0.7), P(1.5, 0.42, 0.7), P(2.7, 0.3, 0.35 - droop), P(2.7, -0.3, 0.35 - droop)], c.copy(g).multiplyScalar(0.9));
    f.poly([P(2.7, -0.3, 0.35 - droop), P(2.7, 0.3, 0.35 - droop), P(3.5, 0, -0.5 - droop * 2)], c.copy(g).multiplyScalar(0.8));
  }
  f.cyl(top, 0, H - 0.35, H + 0.15, 0.2, 0.26, 6, c.setHSL(0.24, 0.45, 0.24));
}

/** Black-and-white striped kerb along a polyline of [x, z] points (chunk-local), facing side `sgn`. */
function kerb(buf: GeoBuf, pts: [number, number][], h: (x: number, z: number) => number, top: number, phase: number): void {
  let acc = phase;
  const w = 0.16;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.01) continue;
    const tx = (bx - ax) / len, tz = (bz - az) / len;
    for (let s = 0; s < len; ) {
      const seg = Math.min(len - s, 1.2 - (acc % 1.2));
      const f = new Fr(buf, ax + tx * s, h(ax + tx * s, az + tz * s), az + tz * s, tx, tz);
      f.box(0, seg, -w / 2, w / 2, -0.1, top, Math.floor(acc / 1.2) % 2 ? c.setRGB(0.12, 0.12, 0.12) : c.setRGB(0.88, 0.88, 0.85));
      s += seg; acc += seg + 1e-4;
    }
  }
}

export function buildDressing(data: ChunkData, ctx: BuildContext): THREE.Object3D[] {
  if (!stationOfChunk(data)) return [];
  const ox = data.cx * CHUNK_SIZE, oz = data.cz * CHUNK_SIZE;
  const solid = new GeoBuf(), leaf = new GeoBuf(), glow = new GeoBuf();
  const H = (x: number, z: number) => ctx.height.sample(ox + x, oz + z);
  const inside = (x: number, z: number) => x >= 0 && x < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE;
  const white = new THREE.Color(0xffffff);

  for (const p of chunkProps(data)) drawProp(p);
  // Individually mapped trees (OpenStreetMap natural=tree) inside the district: real positions.
  for (let i = 0; i < data.trees.length; i += 2) {
    const lx = data.trees[i] / QUANT, lz = data.trees[i + 1] / QUANT;
    if (inDistrict(ox + lx, oz + lz)) rainTree(solid, leaf, lx, H(lx, lz), lz, (data.trees[i] * 31 + data.trees[i + 1]) >>> 0);
  }
  function drawProp(p: Prop): void {
    const lx = p.x - ox, lz = p.z - oz, y = p.kind === PROP.boat ? WATER_LEVEL + 0.05 : H(lx, lz);
    if (p.kind === PROP.festoon) {
      // N1-M5: a wire with small lamps slung from one promenade lamp post to the next (tx, tz = the span)
      const L = Math.hypot(p.tx, p.tz), ux = p.tx / L, uz = p.tz / L, y1 = H(lx + p.tx, lz + p.tz), N = 12;
      const w = new Fr(solid, lx, 0, lz, ux, uz), g = new Fr(glow, lx, 0, lz, ux, uz), wire = new THREE.Color(0x1b1c1e), bulb = new THREE.Color(1.5, 1.35, 0.95);
      const at = (i: number): [number, number] => { const t = i / N; return [L * t, y + (y1 - y) * t + 3.52 - 0.45 * 4 * t * (1 - t)]; };
      for (let i = 0; i < N; i++) {
        const [a0, h0] = at(i), [a1, h1] = at(i + 1);
        w.poly([[a0, 0, h0], [a1, 0, h1], [a1, 0, h1 + 0.016], [a0, 0, h0 + 0.016]], wire);
        if (i > 0) { g.poly([[a0 - 0.035, 0, h0 - 0.09], [a0 + 0.035, 0, h0 - 0.09], [a0 + 0.035, 0, h0 - 0.005], [a0 - 0.035, 0, h0 - 0.005]], bulb); g.poly([[a0, -0.035, h0 - 0.09], [a0, 0.035, h0 - 0.09], [a0, 0.035, h0 - 0.005], [a0, -0.035, h0 - 0.005]], bulb); }
      }
      return;
    }
    const f = new Fr(solid, lx, y, lz, p.tx, p.tz);
    switch (p.kind) {
      case PROP.car: car(f, p.v); break;
      case PROP.rainTree: rainTree(solid, leaf, lx, y, lz, p.v); break;
      case PROP.boat: boat(f, p.v); break;
      case PROP.kapcai: kapcai(f, p.v); break;
      case PROP.palm: palm(f, p.v); break;
      case PROP.bin:
        f.cyl(0, 0, 0, 0.82, 0.22, 0.26, 8, c.setRGB(0.07, 0.22, 0.13), false);
        f.cyl(0, 0, 0.82, 0.9, 0.28, 0.24, 8, c.setRGB(0.05, 0.09, 0.07));
        break;
      case PROP.planter:
        f.cyl(0, 0, 0.12, 0.55, 0.24, 0.32, 8, c.setRGB(0.1, 0.1, 0.1));
        blob(leaf, lx, y + 0.8, lz, 0.4, 0.34, 0.4, c.setHSL(0.3, 0.5, 0.24), p.v);
        break;
      case PROP.medianLamp: {
        const steel = new THREE.Color(0x8a8f93);
        f.cyl(0, 0, 0.1, 0.8, 0.11, 0.08, 8, steel, false);
        f.cyl(0, 0, 0.8, 9, 0.07, 0.045, 6, steel);
        for (const s of [-1, 1]) {
          // Arms reach over both carriageways (across the median axis).
          f.poly([[-0.04, 0, 8.7], [0.04, 0, 8.7], [0.04, s * 1.7, 9.05], [-0.04, s * 1.7, 9.05]], steel);
          f.box(-0.13, 0.13, s * 1.45 - 0.3, s * 1.45 + 0.3, 9.0, 9.12, c.setRGB(0.3, 0.31, 0.32));
          const g = new Fr(glow, lx, y, lz, p.tx, p.tz);
          g.poly([[-0.1, s * 1.45 - 0.25, 8.99], [0.1, s * 1.45 - 0.25, 8.99], [0.1, s * 1.45 + 0.25, 8.99], [-0.1, s * 1.45 + 0.25, 8.99]], white);
        }
        break;
      }
      case PROP.globeLamp: {
        const iron = new THREE.Color(0x1b1c1e);
        f.cyl(0, 0, 0, 0.7, 0.11, 0.07, 8, iron, false);
        f.cyl(0, 0, 0.7, 3.6, 0.05, 0.04, 6, iron);
        f.cyl(0, 0, 3.6, 3.68, 0.13, 0.1, 8, iron);
        const g = new Fr(glow, lx, y, lz, p.tx, p.tz);
        g.cyl(0, 0, 3.68, 3.86, 0.13, 0.2, 8, white, false);
        g.cyl(0, 0, 3.86, 4.06, 0.2, 0.11, 8, white);
        break;
      }
      case PROP.bench: {
        const timber = new THREE.Color(0x7a5a3c), iron = new THREE.Color(0x232426);
        for (let k = 0; k < 4; k++) f.box(-0.85, 0.85, -0.24 + k * 0.125, -0.15 + k * 0.125, 0.4, 0.44, timber);
        for (let k = 0; k < 3; k++) f.box(-0.85, 0.85, -0.3, -0.26, 0.52 + k * 0.13, 0.62 + k * 0.13, timber);
        for (const a of [-0.72, 0.72]) { f.box(a - 0.03, a + 0.03, -0.3, 0.24, 0, 0.4, iron); f.box(a - 0.03, a + 0.03, -0.32, -0.26, 0.4, 0.9, iron); }
        break;
      }
    }
  }

  // Raised median: brick pavers between striped kerbs.
  for (const run of medianRuns()) {
    const L: [number, number][] = [], R: [number, number][] = [];
    for (const m of run) { L.push([m.x - ox - m.tz * -m.hw, m.z - oz + m.tx * -m.hw]); R.push([m.x - ox - m.tz * m.hw, m.z - oz + m.tx * m.hw]); }
    for (let i = 1; i < run.length; i++) {
      if (!inside(run[i].x - ox, run[i].z - oz)) continue;
      const y0 = H(L[i - 1][0], L[i - 1][1]) + 0.16, y1 = H(L[i][0], L[i][1]) + 0.16;
      const tone = 0.9 + ((i * 7) % 5) * 0.03;
      c.setRGB(0.5 * tone, 0.3 * tone, 0.25 * tone);
      const a = solid.vert(L[i - 1][0], y0, L[i - 1][1], ...UP, c), b = solid.vert(R[i - 1][0], y0, R[i - 1][1], ...UP, c);
      const d = solid.vert(R[i][0], y1, R[i][1], ...UP, c), e = solid.vert(L[i][0], y1, L[i][1], ...UP, c);
      solid.triUp(a, b, d); solid.triUp(a, d, e);
      kerb(solid, [L[i - 1], L[i]], H, 0.18, i * 2);
      kerb(solid, [R[i - 1], R[i]], H, 0.18, i * 2);
    }
  }
  // River-side edge of the street: striped kerb.
  const LN = lineLength(MB_NORTH), KO = MB_CARRIAGEWAY / 2 + 0.12;
  for (let s = 10; s < LN - 8; s += 2) {
    const p = pointAt(MB_NORTH, s), q = pointAt(MB_NORTH, s + 2);
    const a: [number, number] = [p.x + p.tz * KO - ox, p.z - p.tx * KO - oz], b: [number, number] = [q.x + q.tz * KO - ox, q.z - q.tx * KO - oz];
    if (inside(a[0], a[1])) kerb(solid, [a, b], H, 0.16, s);
  }

  // Red-brick footpath behind that kerb: a raised, hard-edged strip (drawn as geometry so its edges stay crisp).
  for (let s = 10; s < LN - 8; s += 2) {
    const p = pointAt(MB_NORTH, s), q = pointAt(MB_NORTH, s + 2);
    const at = (n: typeof p, off: number): [number, number] => [n.x + n.tz * off - ox, n.z - n.tx * off - oz];
    const a0 = at(p, KO + 0.08), a1 = at(p, KO + 2.5), b0 = at(q, KO + 0.08), b1 = at(q, KO + 2.5);
    if (!inside(a0[0], a0[1])) continue;
    const tone = 0.88 + ((s * 7) % 5) * 0.03;
    c.setRGB(0.5 * tone, 0.3 * tone, 0.25 * tone);
    const y = (x: number, z: number) => H(x, z) + 0.14;
    const v0 = solid.vert(a0[0], y(a0[0], a0[1]), a0[1], ...UP, c), v1 = solid.vert(a1[0], y(a1[0], a1[1]), a1[1], ...UP, c);
    const v2 = solid.vert(b1[0], y(b1[0], b1[1]), b1[1], ...UP, c), v3 = solid.vert(b0[0], y(b0[0], b0[1]), b0[1], ...UP, c);
    solid.triUp(v0, v1, v2); solid.triUp(v0, v2, v3);
  }

  const out: THREE.Object3D[] = [];
  const add = (g: THREE.BufferGeometry | null, mat: THREE.Material, shadow: boolean) => {
    if (!g) return;
    const m = new THREE.Mesh(g, mat);
    m.castShadow = shadow; m.receiveShadow = shadow;
    out.push(m);
  };
  add(solid.build(), ctx.mats.furniture, true);
  add(leaf.build(), ctx.mats.foliage, true);
  add(glow.build(), ctx.mats.lampGlow, false);
  return out;
}
