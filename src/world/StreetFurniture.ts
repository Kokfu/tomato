import * as THREE from 'three';
import { v5Exclusion } from '../v5/geo.ts';
import { CHUNK_SIZE, QUANT } from './config.ts';
import type { ChunkData } from './types.ts';
import { FURN, BOARDS } from './types.ts';
import { GeoBuf } from './Materials.ts';
import type { BuildContext } from './ChunkManager.ts';
import { stationOf } from './district/mainBazaar.ts';
import { signUv } from './arch/SignAtlas.ts';
import { PAINT_WHITE, PAINT_YELLOW } from './StreetEdges.ts';
import { roadsEnabled } from './roadsFlag.ts';
import { decodeSignalExtra, inferredSignalsEnabled, signalsEnabled } from './signalsFlag.ts';

class GlowBuf extends GeoBuf {
  sig: number[] = [];
  sigCur: [number, number] = [0, 0];
  override vert(x: number, y: number, z: number, nx: number, ny: number, nz: number, c: THREE.Color, u = 0, v = 0): number {
    this.sig.push(this.sigCur[0], this.sigCur[1]);
    return super.vert(x, y, z, nx, ny, nz, c, u, v);
  }
  override build(): THREE.BufferGeometry | null {
    const g = super.build();
    if (g) g.setAttribute('sig', new THREE.Float32BufferAttribute(this.sig, 2));
    return g;
  }
}

const SIG_RED = new THREE.Color(0xf5281e);
const SIG_AMBER = new THREE.Color(0xffad14);
const SIG_GREEN = new THREE.Color(0x1ee85a);
const SIG_LENSES: readonly [THREE.Color, number, number][] = [
  [SIG_RED, 0.68, 0],
  [SIG_AMBER, 0.37, 1],
  [SIG_GREEN, 0.06, 2],
];

// Lamp posts, traffic signals, street-sign posts, benches and bollards, merged into one mesh per
// chunk (plus one tiny unlit mesh for lamp heads and signal lenses). Positions come from
// tools/generate-world/build-streetscape.ts; see there for what is mapped and what is inferred.
// N1-M4: zebra crossings and yellow box junctions (paint, drawn with the lane-marking material), bus shelters and
// generic road-sign boards (one small textured mesh per chunk; none on the Low preset).

const POLE = new THREE.Color(0x4b4f52);
const POLE_LIGHT = new THREE.Color(0x8d9193);
const TIMBER = new THREE.Color(0x7a5a3c);
const CONCRETE = new THREE.Color(0xa7a399);
const HOUSING = new THREE.Color(0x1f2123);
const WHITE = new THREE.Color(0xffffff);
const YELLOW = new THREE.Color(0xd9b030);
const SHELTER_FRAME = new THREE.Color(0x6b7780);
const SHELTER_ROOF = new THREE.Color(0x4d6f8f);
const SHELTER_PANEL = new THREE.Color(0xb9c4c8);
const tmp = new THREE.Color();

const POOL = new THREE.Color(), BLACK = new THREE.Color(0, 0, 0);
/**
 * N1-M6: the light a lamp throws on the ground, as a fan that is bright in the middle and black at its rim. It is drawn
 * additively, and only at night (Materials.pools). `ground` gives the height at a point; `low`: a coarser fan.
 */
export function lightPool(buf: GeoBuf, ground: (x: number, z: number) => number, x: number, z: number, radius: number, low: boolean, strength = 1): void {
  const n = low ? 6 : 10, lift = 0.17;
  const centre = buf.vert(x, ground(x, z) + lift, z, 0, 1, 0, POOL.setScalar(strength));
  const ring = (r: number, c: THREE.Color) => {
    const first = buf.count;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      buf.vert(px, ground(px, pz) + lift, pz, 0, 1, 0, c);
    }
    return first;
  };
  if (low) {
    const rim = ring(radius, BLACK);
    for (let i = 0; i < n; i++) buf.triUp(centre, rim + i, rim + ((i + 1) % n));
    return;
  }
  const mid = ring(radius * 0.4, POOL.setScalar(strength * 0.45)), rim = ring(radius, BLACK);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    buf.triUp(centre, mid + i, mid + j);
    buf.triUp(mid + i, rim + i, rim + j);
    buf.triUp(mid + i, rim + j, mid + j);
  }
}

/**
 * N1-M6: the patch of road a car's headlights light, in the car's frame (+Z forward, the ground at y = 0): bright at
 * the nose, gone 17 m ahead. For a mesh with Materials.pools, so it costs nothing by day.
 */
export function headlightGeometry(): THREE.BufferGeometry {
  const buf = new GeoBuf(), y = 0.16;
  const rows: [number, number, number][] = [[1.9, 0.75, 1.5], [7, 2.1, 0.75], [17, 3.6, 0]]; // z ahead, half width, brightness
  const v = rows.map(([z, w, k]) => [buf.vert(w, y, z, 0, 1, 0, POOL.setScalar(k)), buf.vert(-w, y, z, 0, 1, 0, POOL)]);
  for (let i = 0; i + 1 < v.length; i++) { buf.triUp(v[i][0], v[i][1], v[i + 1][1]); buf.triUp(v[i][0], v[i + 1][1], v[i + 1][0]); }
  return buf.build()!;
}

/** Box centred at (x, z) in the frame rotated by `a` about +Y; lx along the local X, lz along local Z. */
function box(buf: GeoBuf, x: number, y0: number, y1: number, z: number, a: number, lx0: number, lx1: number, lz0: number, lz1: number, c: THREE.Color): void {
  const ca = Math.cos(a), sa = Math.sin(a);
  const P = (lx: number, lz: number): [number, number] => [x + lx * ca + lz * sa, z - lx * sa + lz * ca];
  const c00 = P(lx0, lz0), c10 = P(lx1, lz0), c11 = P(lx1, lz1), c01 = P(lx0, lz1);
  const side = (p: [number, number], q: [number, number], nx: number, nz: number) => {
    const wx = nx * ca + nz * sa, wz = -nx * sa + nz * ca;
    const i = buf.vert(p[0], y0, p[1], wx, 0, wz, c), j = buf.vert(q[0], y0, q[1], wx, 0, wz, c);
    const k = buf.vert(q[0], y1, q[1], wx, 0, wz, c), l = buf.vert(p[0], y1, p[1], wx, 0, wz, c);
    // Wind toward the normal.
    const ux = q[0] - p[0], uz = q[1] - p[1];
    if (-(y1 - y0) * uz * wx + (y1 - y0) * ux * wz >= 0) { buf.tri(i, j, k); buf.tri(i, k, l); } else { buf.tri(i, k, j); buf.tri(i, l, k); }
  };
  side(c00, c10, 0, -1); side(c10, c11, 1, 0); side(c11, c01, 0, 1); side(c01, c00, -1, 0);
  for (const [y, ny] of [[y1, 1], [y0, -1]] as const) {
    const i = buf.vert(c00[0], y, c00[1], 0, ny, 0, c), j = buf.vert(c10[0], y, c10[1], 0, ny, 0, c);
    const k = buf.vert(c11[0], y, c11[1], 0, ny, 0, c), l = buf.vert(c01[0], y, c01[1], 0, ny, 0, c);
    if (ny > 0) { buf.triUp(i, j, k); buf.triUp(i, k, l); } else { buf.triUp(i, j, k); buf.triUp(i, k, l); const n = buf.idx.length; for (const o of [n - 6, n - 3]) { const t = buf.idx[o + 1]; buf.idx[o + 1] = buf.idx[o + 2]; buf.idx[o + 2] = t; } }
  }
}

/** A sign plate (0.6 m, or `size`) facing local +Z with its grey back, centred `cy` above the ground. */
function plate(buf: GeoBuf, x: number, cy: number, z: number, a: number, kind: number, size = 0.6, lx = 0, lz = 0.05): void {
  const ca = Math.cos(a), sa = Math.sin(a), h = size / 2;
  const P = (px: number, pz: number): [number, number] => [x + px * ca + pz * sa, z - px * sa + pz * ca];
  for (const back of [false, true]) {
    const [u0, v0, u1, v1] = signUv(kind, back), s = back ? -1 : 1, off = lz - (back ? 0.012 : 0);
    // (a) is on the left and (b) on the right for someone looking at this face, so u runs a -> b
    const [ax, az] = P(lx - h * s, off), [bx, bz] = P(lx + h * s, off);
    const n: [number, number, number] = [sa * s, 0, ca * s];
    const i = buf.vert(ax, cy - h, az, ...n, WHITE, u0, v0), j = buf.vert(bx, cy - h, bz, ...n, WHITE, u1, v0);
    const k = buf.vert(bx, cy + h, bz, ...n, WHITE, u1, v1), l = buf.vert(ax, cy + h, az, ...n, WHITE, u0, v1);
    buf.tri(i, j, k); buf.tri(i, k, l);
  }
}

/** Flat paint on the road: a quad given by two points (local frame of `a`), `half` wide, draped on the ground. */
function stripe(buf: GeoBuf, ground: (x: number, z: number) => number, x: number, z: number, a: number, x0: number, z0: number, x1: number, z1: number, half: number, c: THREE.Color): void {
  const ca = Math.cos(a), sa = Math.sin(a);
  const l = Math.hypot(x1 - x0, z1 - z0) || 1, nx = (-(z1 - z0) / l) * half, nz = ((x1 - x0) / l) * half;
  const v = ([[x0 - nx, z0 - nz], [x0 + nx, z0 + nz], [x1 + nx, z1 + nz], [x1 - nx, z1 - nz]] as const).map(([px, pz]) => {
    const wx = x + px * ca + pz * sa, wz = z - px * sa + pz * ca;
    return buf.vert(wx, ground(wx, wz) + 0.1, wz, 0, 1, 0, c);
  });
  buf.triUp(v[0], v[1], v[2]); buf.triUp(v[0], v[2], v[3]);
}

export function buildFurniture(data: ChunkData, ctx: BuildContext): THREE.Object3D[] {
  const furn = data.furn;
  if (!furn?.length) return [];
  const ox = data.cx * CHUNK_SIZE, oz = data.cz * CHUNK_SIZE;
  const low = ctx.quality.name === 'low';
  const solid = new GeoBuf(), glow = new GlowBuf(), paint = new GeoBuf(), plates = new GeoBuf(true), pools = new GeoBuf();
  const ground = (x: number, z: number) => ctx.height.sample(ox + x, oz + z);
  for (let i = 0; i < furn.length; i += 5) {
    const x = furn[i + 1] / QUANT, z = furn[i + 2] / QUANT, a = (furn[i + 3] * Math.PI) / 180, extra = furn[i + 4];
    if (v5Exclusion.active && v5Exclusion.inCorridor(data.cx * CHUNK_SIZE + x, data.cz * CHUNK_SIZE + z)) continue;
    const y = ground(x, z);
    switch (furn[i]) {
      case FURN.lamp: {
        // N2-M2: extra === 2 is a central dual-carriageway twin-arm median lamp (?roads=1 only).
        if (extra === 2) {
          if (!roadsEnabled()) break;
          const H = 9.2, arm = 2.05;
          box(solid, x, y - 0.1, y + 0.65, z, a, -0.12, 0.12, -0.12, 0.12, POLE);
          box(solid, x, y + 0.65, y + H, z, a, -0.065, 0.065, -0.065, 0.065, POLE_LIGHT);
          box(solid, x, y + H - 0.1, y + H, z, a, -0.04, 0.04, -arm, arm, POLE_LIGHT);
          for (const sgn of [-1, 1]) {
            box(solid, x, y + H - 0.18, y + H - 0.08, z, a, -0.14, 0.14, sgn * arm - 0.3, sgn * arm + 0.3, POLE);
            box(glow, x, y + H - 0.22, y + H - 0.18, z, a, -0.11, 0.11, sgn * arm - 0.25, sgn * arm + 0.25, WHITE);
            lightPool(pools, ground, x + sgn * (arm + 1.4) * Math.sin(a), z + sgn * (arm + 1.4) * Math.cos(a), 10.5, low);
          }
          break;
        }
        // The district draws its own median and promenade lamps (district/Dressing.ts).
        if (stationOf(ox + x, oz + z).d < 16) break;
        // Tapered steel column with a single arm reaching over the carriageway (local +Z). N1-M4: the larger roads
        // (extra = 1) have a 9 m galvanised column with a longer arm.
        const H = extra === 1 ? 8.8 : 6.2, arm = extra === 1 ? 2.1 : 1.3;
        box(solid, x, y - 0.2, y + 0.5, z, a, -0.11, 0.11, -0.11, 0.11, POLE);
        box(solid, x, y + 0.5, y + H, z, a, -0.06, 0.06, -0.06, 0.06, POLE_LIGHT);
        box(solid, x, y + H - 0.1, y + H, z, a, -0.04, 0.04, 0, arm, POLE_LIGHT);
        box(solid, x, y + H - 0.18, y + H - 0.08, z, a, -0.14, 0.14, arm - 0.3, arm + 0.3, POLE);
        box(glow, x, y + H - 0.22, y + H - 0.18, z, a, -0.11, 0.11, arm - 0.25, arm + 0.25, WHITE);
        // its light falls a little out over the carriageway
        lightPool(pools, ground, x + (arm + 1.2) * Math.sin(a), z + (arm + 1.2) * Math.cos(a), extra === 1 ? 11 : 8, low);
        break;
      }
      case FURN.signal: {
        const dec = decodeSignalExtra(extra);
        if (signalsEnabled()) {
          if (!dec || (dec.inferred && !inferredSignalsEnabled())) break;
          // Lens code starts at 2: a lamp mesh without a `sig` attribute reads WebGL's generic value, which another
          // program may have left at 1 (ShaderMaterial's default colour), and must never look like a signal.
          const sigKey = dec.jctId * 2 + dec.group + 2;
          const poleTop = dec.wide ? 5.65 : 3.6;
          box(solid, x, y - 0.2, y + poleTop, z, a, -0.075, 0.075, -0.075, 0.075, dec.wide ? POLE_LIGHT : POLE);
          // Primary kerbside signal head (y + 2.52 .. y + 3.58) with white border backing & lens hoods.
          box(solid, x, y + 2.50, y + 3.60, z, a, -0.19, 0.19, 0.06, 0.10, WHITE);
          box(solid, x, y + 2.53, y + 3.57, z, a, -0.17, 0.17, 0.09, 0.30, HOUSING);
          for (const [col, dy, aspect] of SIG_LENSES) {
            box(solid, x, y + 2.55 + dy + 0.21, y + 2.55 + dy + 0.25, z, a, -0.13, 0.13, 0.28, 0.40, HOUSING);
            glow.sigCur = [sigKey, aspect];
            box(glow, x, y + 2.55 + dy, y + 2.55 + dy + 0.22, z, a, -0.11, 0.11, 0.30, 0.33, col);
          }
          // Wide multi-lane carriageway (>= 7.8 m): Malaysian galvanised cantilever mast-arm + overhead repeater head.
          if (dec.wide) {
            box(solid, x, y + 5.46, y + 5.58, z, a, 0.0, 2.55, -0.055, 0.055, POLE_LIGHT);
            box(solid, x, y + 4.76, y + 5.94, z, a, 2.02, 2.44, 0.04, 0.08, WHITE);
            box(solid, x, y + 4.80, y + 5.90, z, a, 2.05, 2.41, 0.07, 0.28, HOUSING);
            for (const [col, dy, aspect] of SIG_LENSES) {
              glow.sigCur = [sigKey, aspect];
              box(glow, x, y + 4.83 + dy * 1.06, y + 4.83 + dy * 1.06 + 0.25, z, a, 2.10, 2.36, 0.28, 0.32, col);
            }
          }
          glow.sigCur = [0, 0];
          box(solid, x, y + 1.05, y + 1.3, z, a, -0.09, 0.09, 0.07, 0.16, YELLOW);
          break;
        }
        if (dec) break; // `?signals=0`: skip N2-M3 per-approach poles and draw Night 1's static single poles
        glow.sigCur = [0, 0];
        box(solid, x, y - 0.2, y + 3.5, z, a, -0.07, 0.07, -0.07, 0.07, POLE);
        box(solid, x, y + 2.55, y + 3.55, z, a, -0.17, 0.17, 0.07, 0.3, HOUSING);
        const lens: [number, number][] = [[0xd23a2e, 3.22], [0xe0a52e, 2.92], [0x3fae5a, 2.62]];
        for (const [hex, ly] of lens) box(glow, x, y + ly, y + ly + 0.2, z, a, -0.1, 0.1, 0.3, 0.32, tmp.setHex(hex).multiplyScalar(0.75).clone());
        box(solid, x, y + 1.05, y + 1.3, z, a, -0.09, 0.09, 0.07, 0.16, YELLOW);
        break;
      }
      case FURN.sign:
        box(solid, x, y - 0.2, y + 2.75, z, a, -0.04, 0.04, -0.04, 0.04, POLE_LIGHT);
        break;
      case FURN.bench:
        box(solid, x, y + 0.4, y + 0.47, z, a, -0.8, 0.8, -0.22, 0.22, TIMBER);
        box(solid, x, y + 0.5, y + 0.9, z, a, -0.8, 0.8, -0.26, -0.21, TIMBER);
        box(solid, x, y, y + 0.4, z, a, -0.72, -0.64, -0.2, 0.2, CONCRETE);
        box(solid, x, y, y + 0.4, z, a, 0.64, 0.72, -0.2, 0.2, CONCRETE);
        break;
      case FURN.bollard:
        box(solid, x, y - 0.1, y + 0.9, z, a, -0.08, 0.08, -0.08, 0.08, CONCRETE);
        break;
      case FURN.zebra: {
        // Mapped crossing: yellow bars along the direction of travel (local +Z) between two white edge lines.
        const hw = extra / QUANT / 2 - 0.25;
        for (let lx = -hw + 0.3; lx + 0.5 <= hw; lx += 1) stripe(paint, ground, x, z, a, lx + 0.25, -1.5, lx + 0.25, 1.5, 0.25, PAINT_YELLOW);
        for (const lz of [-1.75, 1.75]) stripe(paint, ground, x, z, a, -hw, lz, hw, lz, 0.06, PAINT_WHITE);
        break;
      }
      case FURN.box: {
        // Yellow box junction: half length along local Z, half width along local X (decimetres in `extra`).
        const A = Math.floor(extra / 1000) / 10, B = (extra % 1000) / 10, step = low ? 3.2 : 1.6;
        for (const [x0, z0, x1, z1] of [[-B, -A, B, -A], [-B, A, B, A], [-B, -A, -B, A], [B, -A, B, A]]) stripe(paint, ground, x, z, a, x0, z0, x1, z1, 0.07, PAINT_YELLOW);
        for (let c = -(A + B) + step / 2; c < A + B; c += step) {
          // x + z = c and x - z = c, clipped to the box
          const u0 = Math.max(-B, c - A), u1 = Math.min(B, c + A);
          if (u1 - u0 < 0.3) continue;
          stripe(paint, ground, x, z, a, u0, c - u0, u1, c - u1, 0.05, PAINT_YELLOW);
          stripe(paint, ground, x, z, a, u0, u0 - c, u1, u1 - c, 0.05, PAINT_YELLOW);
        }
        break;
      }
      case FURN.busStop: {
        // Generic steel shelter open toward the carriageway (local +Z): four posts, a roof, a back panel and a bench.
        for (const [px, pz] of [[-2, -0.7], [2, -0.7], [-2, 0.45], [2, 0.45]]) box(solid, x, y, y + 2.4, z, a, px - 0.045, px + 0.045, pz - 0.045, pz + 0.045, SHELTER_FRAME);
        box(solid, x, y + 2.4, y + 2.5, z, a, -2.3, 2.3, -0.9, 0.75, SHELTER_ROOF);
        box(solid, x, y + 0.55, y + 2.0, z, a, -1.95, 1.95, -0.72, -0.69, SHELTER_PANEL);
        box(solid, x, y + 0.4, y + 0.46, z, a, -1.5, 1.5, -0.55, -0.2, SHELTER_FRAME);
        for (const px of [-1.3, 1.3]) box(solid, x, y, y + 0.4, z, a, px - 0.04, px + 0.04, -0.5, -0.25, SHELTER_FRAME);
        // the stop's sign on its own pole, beside the shelter
        box(solid, x, y - 0.1, y + 2.7, z, a, 2.62, 2.7, 0.26, 0.34, POLE_LIGHT);
        if (!low) plate(plates, x, y + 2.35, z, a, BOARDS.indexOf('bus'), 0.62, 2.66, 0.36);
        break;
      }
      case FURN.board:
        // Generic road sign facing local +Z. The Low preset keeps the bare pole of only every other one.
        if (low && (i / 5) % 2) break;
        box(solid, x, y - 0.1, y + 2.55, z, a, -0.035, 0.035, -0.035, 0.035, POLE_LIGHT);
        if (!low) plate(plates, x, y + 2.25, z, a, extra);
        break;
    }
  }
  const out: THREE.Object3D[] = [];
  const sg = solid.build();
  if (sg) {
    const m = new THREE.Mesh(sg, ctx.mats.furniture);
    m.castShadow = true;
    m.receiveShadow = true;
    out.push(m);
  }
  const gg = glow.build();
  if (gg) out.push(new THREE.Mesh(gg, ctx.mats.lampGlow));
  const lg = pools.build();
  if (lg) { const m = new THREE.Mesh(lg, ctx.mats.pools); m.renderOrder = 7; m.userData.noAO = true; out.push(m); }
  const pg = paint.build();
  if (pg) { const m = new THREE.Mesh(pg, ctx.mats.marks); m.renderOrder = 6; out.push(m); }
  const sp = plates.build();
  if (sp) out.push(new THREE.Mesh(sp, ctx.mats.signs));
  return out;
}
