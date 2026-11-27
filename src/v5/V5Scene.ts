// Assembles the V5 Carpenter Street section in one of two ways:
//
//  Approach A "procedural": everything is generated in the browser from the mapped geography and
//    rules. Lots are hashed variations, landmarks come from generic class grammars fitted to their
//    mapped sites, signs are drawn at run time. No asset downloads at all.
//  Approach B "hybrid": the same geography and the same procedural street shell, plus authored
//    content: a per-lot facade table, reconstructed landmark models loaded as meshopt-compressed
//    GLB files, a small painted texture atlas, and reference-specific street dressing.
//
// Both use the same V5 materials, lighting and post-processing, so the comparison isolates what
// authored content adds on top of procedural generation.
import * as THREE from 'three';
import { Kit, Buf, hex, rnd } from './kit.ts';
import { createMaterials } from './materials.ts';
import type { KuchingMaterials, MaterialName } from './materials.ts';
import { autoLot, buildLot, eaveY, ARCADE, KERB, PIER, F1, UP } from './shophouse.ts';
import type { LotSpec, SignSource } from './shophouse.ts';
import { ROWS, BLOCKS, rowFrame, V5_LANDMARK_IDS, CHINA_WEST, CHINA_EAST, CHINA_BLOCK, CARP_E_ROWS } from './geo.ts';
import { buildChinaStreet } from './china.ts';
import type { RowDef } from './geo.ts';
import { LOT_OVERRIDES, M5_GENERIC_SIGNS, M5_WRAP_NEIGHBOUR } from './lots.ts';
import { m5Enabled } from '../world/district/m5.ts';
import { buildCarpenterEast } from './carpenterEast.ts';
import { c1FullNameSign } from './c1flag.ts';
import { buildRoad, buildApron, lampPost, cables, pushcart, streetLanterns } from './street.ts';
import { vehicle, plateFor } from './vehicles.ts';
import { buildTemple, buildGenericTemple } from './landmarks/temple.ts';
import { buildFoodCourt, buildGenericFoodCourt, buildOperaStage, buildGenericStage } from './landmarks/foodcourt.ts';
import { paintAtlas, ATLAS_SIZE } from './landmarks/atlas.ts';

/** 'c' = the hybrid Carpenter Street section plus the V7 Jalan China section. */
export type V5Mode = 'a' | 'b' | 'c';

interface SiteLike { id: string; anchor: { x: number; z: number; y: number; yaw: number }; widthM?: number; depthM?: number }
interface PlaceLike { id?: string; name: string; cat: string; x: number; z: number; b?: number; sign?: boolean }

export interface V5Host {
  height(x: number, z: number): number;
  sites: SiteLike[];
  baseUrl: string;
  low: boolean;
  renderer: THREE.WebGLRenderer;
  /** Walkable raised floors (five-foot ways) are registered with the collision world while V5 is shown. */
  setFloors(floors: { ring: number[]; h: number }[]): void;
  /** Blocking outlines (piers, parked cars) registered with the collision world while V5 is shown. */
  setWalls(walls: { ring: number[]; top: number }[]): void;
}

/** One canvas that holds all run-time sign text (shop names from the mapped place data). */
class SignAtlas implements SignSource {
  readonly canvas = document.createElement('canvas');
  readonly texture: THREE.CanvasTexture;
  private g: CanvasRenderingContext2D;
  private sky: [number, number, number][];
  /** Pixels of the short side of a sign cell. */
  private cell: number;
  private cache = new Map<string, [number, number, number, number]>();
  constructor(size = 1024) {
    this.canvas.width = this.canvas.height = size;
    this.sky = [[0, size, 0]];
    this.cell = Math.round((54 * size) / 1024); // sized so that both sections' signs fit (about 90 boards)
    this.g = this.canvas.getContext('2d')!;
    this.g.fillStyle = '#222'; this.g.fillRect(0, 0, size, size);
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
  }
  /** Skyline packer: each cell goes where it sits lowest, so tall vertical signs no longer waste a whole row. */
  private alloc(w: number, h: number): [number, number] | null {
    const S = this.canvas.width, sky = this.sky;
    w = Math.min(S, w + 2); h += 2;
    let best = -1, bestY = Infinity;
    for (let i = 0; i < sky.length; i++) {
      if (sky[i][0] + w > S) break;
      let y = 0;
      for (let j = i; j < sky.length && sky[j][0] < sky[i][0] + w; j++) y = Math.max(y, sky[j][2]);
      if (y < bestY) { bestY = y; best = i; }
    }
    if (best < 0 || bestY + h > S) { console.warn("V5 sign atlas is full: sign text dropped"); return null; }
    const x = sky[best][0], x1 = x + w, out: [number, number, number][] = [];
    for (const [sx, sw, sy] of sky) {
      if (sx + sw <= x || sx >= x1) { out.push([sx, sw, sy]); continue; }
      if (sx < x) out.push([sx, x - sx, sy]);
      if (sx + sw > x1) out.push([x1, sx + sw - x1, sy]);
    }
    out.push([x, w, bestY + h]);
    this.sky = out.sort((p, q) => p[0] - q[0]);
    return [x, bestY];
  }
  /** Custom-painted board: `draw` works in a clipped w x h box. The short side is `scale` cells. */
  paint(key: string, aspect: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, scale = 2): [number, number, number, number] {
    const hit = this.cache.get('paint|' + key);
    if (hit) return hit;
    const S = this.canvas.width, g = this.g, c = Math.round(this.cell * scale);
    const w = aspect >= 1 ? Math.min(S, Math.round(c * aspect)) : c, h = aspect >= 1 ? c : Math.min(S, Math.round(c / aspect));
    const at = this.alloc(w, h);
    if (!at) return [0, 0, 0.001, 0.001];
    g.save(); g.translate(at[0], at[1]); g.beginPath(); g.rect(0, 0, w, h); g.clip();
    draw(g, w, h);
    g.restore();
    const r: [number, number, number, number] = [(at[0] + 1) / S, 1 - (at[1] + h - 1) / S, (at[0] + w - 1) / S, 1 - (at[1] + 1) / S];
    this.cache.set('paint|' + key, r);
    this.texture.needsUpdate = true;
    return r;
  }
  /** aspect = width / height of the board. Lines are separated by "\n"; `vertical` stacks the characters. */
  rect(text: string, fg: string, bg: string, aspect: number, vertical = false): [number, number, number, number] {
    const key = `${text}|${fg}|${bg}|${vertical}|${aspect.toFixed(2)}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const S = this.canvas.width, g = this.g, c = this.cell, f = c / 72;
    const tall = vertical || aspect < 1;
    const w = tall ? c : Math.min(S, Math.round(c * Math.min(aspect, 4.5))), h = tall ? Math.min(Math.round(320 * f), Math.round(c / aspect)) : c;
    const at = this.alloc(w, h);
    if (!at) return [0, 0, 0.001, 0.001];
    const [x, y] = at;
    g.fillStyle = bg; g.fillRect(x, y, w, h);
    g.strokeStyle = fg; g.globalAlpha = 0.6; g.lineWidth = 2 * f; g.strokeRect(x + 3 * f, y + 3 * f, w - 6 * f, h - 6 * f); g.globalAlpha = 1;
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    const font = '"Segoe UI", "Microsoft JhengHei", "Microsoft YaHei", "PingFang TC", "Noto Sans CJK TC", "Noto Sans", Arial, sans-serif';
    if (vertical) {
      const ch = [...text].slice(0, 9), step = (h - 16 * f) / ch.length, size = Math.min(48 * f, step * 0.9);
      g.font = `700 ${size}px ${font}`;
      ch.forEach((q, i) => g.fillText(q, x + w / 2, y + 8 * f + (i + 0.5) * step));
    } else {
      const lines = text.split('\n'), lh = (h - 12 * f) / lines.length;
      let size = Math.min(lines.length > 1 ? lh * 0.82 : h * 0.62, 56 * f);
      g.font = `700 ${size}px ${font}`;
      const tw = Math.max(...lines.map((l) => g.measureText(l).width));
      if (tw > w - 16 * f) { size = Math.max(9 * f, (size * (w - 16 * f)) / tw); g.font = `700 ${size}px ${font}`; }
      lines.forEach((l, i) => g.fillText(l, x + w / 2, y + 6 * f + (i + 0.5) * lh + 1));
    }
    const r: [number, number, number, number] = [(x + 1) / S, 1 - (y + h - 1) / S, (x + w - 1) / S, 1 - (y + 1) / S];
    this.cache.set(key, r);
    this.texture.needsUpdate = true;
    return r;
  }
}

function bufGeometry(b: Buf): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
  g.setIndex(b.count > 65535 ? new THREE.Uint32BufferAttribute(b.idx, 1) : new THREE.Uint16BufferAttribute(b.idx, 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

function mergeBufs(list: Buf[]): Buf {
  if (list.length === 1) return list[0];
  const out = new Buf();
  for (const b of list) {
    const base = out.count;
    for (let i = 0; i < b.pos.length; i++) { out.pos.push(b.pos[i]); out.nor.push(b.nor[i]); out.col.push(b.col[i]); }
    for (let i = 0; i < b.uv.length; i++) out.uv.push(b.uv[i]);
    for (let i = 0; i < b.idx.length; i++) out.idx.push(base + b.idx[i]);
  }
  return out;
}

const NO_SHADOW = new Set<string>(['poly', 'glow', 'glass', 'wire', 'contact', 'pane']);
const NO_RECEIVE = new Set<string>(['poly', 'glow', 'wire', 'contact', 'pane']);
/** Trade words for hanging signboards, by mapped category (a description of the trade, not a claimed shop name). */
const TRADE: Record<string, string> = { jewelry: '金铺', watches: '钟表', restaurant: '饭店', cafe: '茶室', convenience: '便利店' };
const SIGN_STYLES: [string, string][] = [['#f6efe0', '#8c1c15'], ['#f3d98a', '#1f3f6a'], ['#ffffff', '#1f6a45'], ['#f6e7b0', '#3a2a1e'], ['#b3261e', '#f4efe2'], ['#f2c53d', '#7a1612']];

/**
 * C1a corner wrap (?c1=1 only): walkable floor under the return five-foot way that shophouse.ts wrapReturn draws, which
 * ramps from this lot's floor to the side-street neighbour's floor. Collision floors are flat, so the paving is cut into
 * bands at most 0.5 m long, each at the drawn paving height at its centre (within a few mm on today's 0.081 / 0.189 m
 * rises), with the kerb beside each band and one kerb piece round the corner at the front five-foot-way height;
 * with a positive skew also the corner sliver of drawn front paving left of the front floor rectangle.
 * Return frame as in shophouse.ts: u from the far end of the return (0) to the corner front line (len), v outward;
 * lot x = -cos(skew) v + sin(skew) (u - len), lot z = sin(skew) v + cos(skew) (u - len). at(x, z) maps lot coordinates
 * to world xz; base is the lot's floor datum. Returns [] for a lot without a wrap.
 */
export function wrapReturnFloors(s: LotSpec, at: (x: number, z: number) => number[], base: number): { ring: number[]; h: number }[] {
  const W = s.wrap;
  if (!W) return [];
  const c = Math.cos(W.skew), sn = Math.sin(W.skew), L = W.len, A = ARCADE, R = W.rise, y = base + KERB;
  const u0 = L - A / c, u1 = L - (A * (1 - sn)) / c; // the paving meets the front five-foot way (z = -A) at v = 0 / v = -A
  // drawn height above the front floor: the two triangles of the paving quad [0,R,0] [u0,0,0] [u1,0,-A] [0,R,-A] (Kit.poly fan)
  const pave = (u: number, v: number) => (v * u1 >= -A * u ? R * (1 - u / u0) + ((R * (1 - u1 / u0)) / A) * v : R * (1 - u / u1));
  const ring = (pts: number[][]) => pts.flatMap(([u, v]) => at(-c * v + sn * (u - L), sn * v + c * (u - L)));
  // the paving quad cut to ua <= u <= ub (convex clip)
  const clip = (pts: number[][], k: number, side: number) => {
    const out: number[][] = [];
    pts.forEach((p, i) => {
      const q = pts[(i + 1) % pts.length], dp = (p[0] - k) * side, dq = (q[0] - k) * side;
      if (dp >= 0) out.push(p);
      if (dp * dq < 0) { const t = dp / (dp - dq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    });
    return out;
  };
  const floors: { ring: number[]; h: number }[] = [], um = Math.max(u0, u1), n = Math.ceil(um / 0.5), d = um / n;
  for (let i = 0; i < n; i++) {
    const ua = i * d, ub = (i + 1) * d;
    const p = clip(clip([[0, 0], [u0, 0], [u1, -A], [0, -A]], ua, 1), ub, -1);
    if (p.length >= 3) {
      const cu = p.reduce((a, q) => a + q[0], 0) / p.length, cv = p.reduce((a, q) => a + q[1], 0) / p.length;
      floors.push({ ring: ring(p), h: y + pave(cu, cv) });
    }
    if (ua < u0) { const kb = Math.min(ub, u0); floors.push({ ring: ring([[ua, 0.24], [kb, 0.24], [kb, 0], [ua, 0]]), h: y + 0.003 + R * (1 - (ua + kb) / 2 / u0) }); }
  }
  // kerb round the corner, level with the front five-foot way so that where it meets the front floor nothing changes
  floors.push({ ring: ring([[u0, 0.24], [L + 0.255, 0.24], [L + 0.255, 0], [u0, 0]]), h: y });
  // positive skew: the drawn front five-foot way reaches past the front floor (lot x < 0) to the return line, a sliver
  // lot (0,0) (-A tan, -A) (0,-A); floor it at the front five-foot-way height (Auditor walkfix F1)
  if (sn > 0) floors.push({ ring: ring([[L, 0], [u0, 0], [L - A * c, -A * sn]]), h: y });
  return floors;
}

/**
 * N1-M3b: the exported models carry RGBA vertex colours with alpha 1 throughout, where the kit's own geometry has RGB.
 * three.js compiles a second variant of a material's program for RGBA (USE_COLOR_ALPHA): 15 extra programs of the
 * street section's 40, each a 75 kB fragment shader, which the start screen waited for. Opaque alpha is dropped here.
 */
function rgbColours(g: THREE.BufferGeometry): void {
  const c = g.getAttribute('color');
  if (!c || c.itemSize !== 4) return;
  for (let i = 0; i < c.count; i++) if (c.getW(i) < 0.999) return;
  const src = c.array as Float32Array, Ctor = src.constructor as Float32ArrayConstructor;
  const out = new Ctor(c.count * 3);
  const inter = (c as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute ? (c as THREE.InterleavedBufferAttribute) : null;
  const stride = inter ? inter.data.stride : 4, off = inter ? inter.offset : 0;
  for (let i = 0; i < c.count; i++) for (let k = 0; k < 3; k++) out[i * 3 + k] = src[i * stride + off + k];
  g.setAttribute('color', new THREE.BufferAttribute(out, 3, c.normalized));
}

export class V5Scene {
  readonly group = new THREE.Group();
  readonly materials: KuchingMaterials;
  mode: V5Mode | null = null;
  stats = { triangles: 0, drawCalls: 0, buildMs: 0, assetBytes: 0, glb: false, lots: 0, geometryBytes: 0, textureBytes: 0 };
  private host: V5Host;
  private signs: SignAtlas;
  private atlas: THREE.Texture | null = null;
  private places: PlaceLike[] | null = null;
  /** V7.2 A/B switch: photographic road material in the Jalan China section (false = all procedural). */
  realAssets = true;
  private photoBytes = 0;
  private photoLoad: Promise<boolean> | null = null;
  private token = 0;

  constructor(host: V5Host) {
    this.host = host;
    this.group.name = 'v5-scene';
    // Sign text is read at arm's length in the Jalan China section: 2048 px except on the low preset.
    this.signs = new SignAtlas(host.low ? 1024 : 2048);
    this.materials = createMaterials({ low: host.low, sign: this.signs.texture });
  }

  private async loadPlaces(): Promise<PlaceLike[]> {
    if (this.places) return this.places;
    const out: PlaceLike[] = [];
    for (const k of ['0_0', '0_-1']) {
      try { const j = await (await fetch(`${this.host.baseUrl}data/kuching/places/${k}.json`)).json(); out.push(...(j.places as PlaceLike[])); } catch { /* signs stay empty */ }
    }
    return (this.places = out);
  }

  /** Painted atlas: the shipped WebP if present, otherwise painted now with this device's fonts. */
  private async loadAtlas(): Promise<THREE.Texture> {
    if (this.atlas) return this.atlas;
    let tex: THREE.Texture | null = null;
    try {
      const r = await fetch(`${this.host.baseUrl}models/v5/atlas.webp`);
      if (r.ok && (r.headers.get('content-type') ?? '').startsWith('image/')) {
        const blob = await r.blob();
        this.stats.assetBytes += blob.size;
        tex = new THREE.Texture(await createImageBitmap(blob, { imageOrientation: 'flipY' }));
        tex.flipY = false;
      }
    } catch { /* fall through */ }
    if (!tex) {
      const c = document.createElement('canvas');
      c.width = c.height = ATLAS_SIZE;
      paintAtlas(c.getContext('2d')!);
      tex = new THREE.CanvasTexture(c);
    }
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.needsUpdate = true;
    (this.materials.byName.atlas as THREE.MeshStandardMaterial).map = tex;
    this.materials.byName.atlas.needsUpdate = true;
    return (this.atlas = tex);
  }

  /** Photographic road set: fetched the first time the Jalan China section is built with real assets on. */
  private loadPhotoSets(): Promise<boolean> {
    return (this.photoLoad ??= (async () => {
      const u = this.materials.uniforms;
      const jobs: [{ value: THREE.Texture | null }, string, boolean, number][] = [[u.uRoadA, 'asphalt_03_albedo_rough', true, 8]];
      if (!this.host.low) jobs.push([u.uRoadN, 'asphalt_03_normal', false, 8]);
      try {
        await Promise.all(jobs.map(async ([slot, name, srgb, aniso]) => {
          const r = await fetch(`${this.host.baseUrl}textures/v7/${name}.webp`);
          if (!r.ok || !(r.headers.get('content-type') ?? '').startsWith('image/')) throw new Error(`${name}: ${r.status}`);
          const blob = await r.blob(), src = URL.createObjectURL(blob);
          const tex = await new THREE.TextureLoader().loadAsync(src).finally(() => URL.revokeObjectURL(src));
          tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
          tex.anisotropy = aniso;
          tex.needsUpdate = true;
          slot.value = tex;
          this.stats.assetBytes += blob.size;
          this.photoBytes += Math.round(tex.image.width * tex.image.height * 4 * 1.333);
        }));
        return true;
      } catch (e) {
        console.warn('V7.2 photographic road material unavailable, using the procedural one:', e);
        return false;
      }
    })());
  }

  private lotSpecs(row: RowDef, mode: V5Mode, places: PlaceLike[], len: number, fr: ReturnType<typeof rowFrame>): LotSpec[] {
    const w = len / row.lots, specs: LotSpec[] = [];
    // N1-M5: CN ends against the Bishopgate corner return, CH and CS stand side by side
    const openEnds: Record<string, [boolean, boolean]> = { N2: [true, false], N3: [false, true], CN: [true, false], CH: [false, true], CS: [true, false] };
    const [eL, eR] = openEnds[row.id] ?? [true, true];
    for (let i = 0; i < row.lots; i++) {
      let s = autoLot(Math.floor(rnd(row.building % 100000, i, row.id.charCodeAt(1)) * 1e6), w, row.depth);
      if (mode !== 'a' && LOT_OVERRIDES[row.id]?.[i]) s = { ...s, ...LOT_OVERRIDES[row.id][i] };
      s.exposedL = i === 0 && eL; s.exposedR = i === row.lots - 1 && eR;
      if (row.lod === 1) { s.blinds = false; s.plants = 0; s.bin = false; }
      specs.push(s);
    }
    // A lot that stands taller than its neighbour shows its side wall above the neighbour's roof.
    specs.forEach((s, i) => { if (i > 0 && specs[i - 1].storeys < s.storeys) s.exposedL = true; if (i < specs.length - 1 && specs[i + 1].storeys < s.storeys) s.exposedR = true; });
    // Shop names: mapped places of this building, assigned to the lot they fall in front of.
    if (row.lod === 0) for (const p of places) {
      // Only businesses with a shop name: mapped notes such as "... - pushcart in front of temple" are not signboards.
      // C1a (?c1=1 only): an owner-approved full-name board keyed by place id (c1flag.ts); null for every other place.
      const full = c1FullNameSign(p);
      if (p.b !== row.building || !p.sign || (full === null && (p.name.length > 30 || p.name.includes(' - ')))) continue;
      const t = (p.x - fr.ox) * fr.dx + (p.z - fr.oz) * fr.dz, d = (p.x - fr.ox) * fr.nx + (p.z - fr.oz) * fr.nz;
      if (t < 0 || t > len || d < -row.depth || d > 3) continue;
      const s = specs[Math.min(row.lots - 1, Math.floor(t / w))];
      const st = SIGN_STYLES[Math.floor(rnd(p.name.length, p.name.charCodeAt(0)) * SIGN_STYLES.length)];
      if (!s.sign) s.sign = { text: full ?? p.name, fg: st[0], bg: st[1] };
      if (!s.hang && TRADE[p.cat]) s.hang = { text: TRADE[p.cat], fg: '#f6e2a0', bg: p.cat === 'jewelry' ? '#8c1c15' : '#1f3f6a' };
      // The mapped category decides the kind of shopfront (a rule, used by both approaches).
      if (p.cat === 'convenience') s.shop = 'glass';
      else if (p.cat === 'jewelry' || p.cat === 'watches') s.shop = 'grille';
      else if (p.cat === 'restaurant' || p.cat === 'cafe') s.shop = 'open';
    }
    // N1-M5: a generic trade board on some lots that carry no mapped shop name
    M5_GENERIC_SIGNS[row.id]?.forEach((g, i) => { if (g && specs[i] && !specs[i].sign) specs[i].sign = g; });
    return specs;
  }

  /** (Re)build the scene for a mode. Resolves when meshes are in the group. */
  async build(mode: V5Mode): Promise<void> {
    const token = ++this.token, t0 = performance.now();
    const places = await this.loadPlaces();
    if (mode !== 'a') await this.loadAtlas();
    if (token !== this.token) return;
    const h = this.host.height;
    // N2-M0b: build into three street-block kits (Carpenter West, Jalan China, Carpenter East) so the heaviest opaque
    // materials can be frustum-culled block by block while keeping lightweight materials merged (at most +6 draw calls).
    const kitWest = new Kit(0), kitChina = new Kit(0), kitEast = new Kit(0);
    const floors: { ring: number[]; h: number }[] = [];
    let lots = 0;

    buildRoad(kitWest, h);
    // With the Jalan China section the corner building keeps only its Carpenter Street bay depth, and the
    // simplified Jalan China frontage ("JC") is replaced by the detailed rows.
    const china = mode === 'c';
    const photo = china && this.realAssets && (await this.loadPhotoSets());
    if (token !== this.token) return;
    const rowDefs = china ? ROWS.filter((r) => r.id !== 'JC').map((r) => (r.id === 'N3' ? { ...r, depth: 5.5 } : r)) : ROWS;
    let walls: { ring: number[]; top: number }[] = [];
    const stepWalls: { ring: number[]; top: number }[] = [];
    // a row's frame after its corner skip, and the floor datum of each of its lots
    const frame = (def: RowDef) => {
      let row = def;
      if (def.skip) { const l = Math.hypot(def.b[0] - def.a[0], def.b[1] - def.a[1]); row = { ...def, a: [def.a[0] + ((def.b[0] - def.a[0]) * def.skip) / l, def.a[1] + ((def.b[1] - def.a[1]) * def.skip) / l] }; }
      const fr = rowFrame(row), w = fr.len / row.lots;
      const mid = h(fr.ox + fr.dx * fr.len / 2 + fr.nx * 2, fr.oz + fr.dz * fr.len / 2 + fr.nz * 2);
      // N1-M5: the long rows east of Jalan China stand on ground that falls 0.9 m along the street and up to 0.7 m
      // across it. There each lot takes its own level (a few centimetres' step from its neighbour) and is never lower
      // than the terrain under its own five-foot way, as in the Jalan China section.
      const stepped = CARP_E_ROWS.includes(def.id);
      const baseOf = (i: number) => {
        const x = fr.ox + fr.dx * i * w, z = fr.oz + fr.dz * i * w, front = h(x + fr.dx * w / 2 + fr.nx * 1.5, z + fr.dz * w / 2 + fr.nz * 1.5);
        if (!stepped) return Math.max(mid - 0.1, Math.min(mid + 0.1, front)) + 0.03;
        let top = -Infinity;
        for (const u of [0, w / 2, w]) for (const v of [0.24, -ARCADE]) top = Math.max(top, h(x + fr.dx * u + fr.nx * v, z + fr.dz * u + fr.nz * v));
        return Math.max(front + 0.03, top - 0.11);
      };
      return { row, fr, w, mid, baseOf, stepped };
    };
    for (const def of rowDefs) {
      const { row, fr, w, mid, baseOf, stepped } = frame(def);
      const kit = stepped ? kitEast : kitWest;
      const specs = this.lotSpecs(row, mode, places, fr.len, fr);
      // N1-M5: on the low preset the new rows drop the fine timber (ceiling joists, rafter tails) and loose dressing
      kit.lod = stepped && this.host.low ? 1 : row.lod;
      specs.forEach((s, i) => {
        const x = fr.ox + fr.dx * i * w, z = fr.oz + fr.dz * i * w;
        const base = baseOf(i);
        // N1-M5: a corner return whose rise is not tabulated ramps to the neighbouring row's floor, read from the terrain
        const nb = M5_WRAP_NEIGHBOUR[`${row.id}:${i}`], nbDef = nb && rowDefs.find((r) => r.id === nb[0]);
        if (s.wrap && Number.isNaN(s.wrap.rise)) s.wrap = { ...s.wrap, rise: nbDef ? frame(nbDef).baseOf(nb[1]) - base : 0 };
        kit.at({ x, y: base, z, ry: fr.ry }, () => {
          buildLot(kit, s, row.lod === 0 ? this.signs : null);
          if (row.lod === 0) buildApron(kit, s.w, s.seed);
          // footing under the kerb and drain where the lot stands above the falling road
          if (stepped) { kit.use('concrete'); kit.box(0, s.w, -0.8, 0, -0.3, 0.78, hex(0x8a8880, 0.85), 'y+y-z-', 0.75); }
        });
        // walkable five-foot way
        const c = (u: number, v: number) => [x + fr.dx * u + fr.nx * v, z + fr.dz * u + fr.nz * v];
        floors.push({ ring: [...c(0, 0.24), ...c(w, 0.24), ...c(w, -ARCADE), ...c(0, -ARCADE)], h: base + 0.14 });
        // C1a (?c1=1 only): the corner wrap's return five-foot way (Auditor S1)
        if (s.wrap) floors.push(...wrapReturnFloors(s, c, base));
        // N1-M5 rows: the shopfront line and the piers block, as in the Jalan China section (the chunk's own collision
        // keeps a strip about 0.7 m deeper than the drawn five-foot way open)
        if (stepped && row.lod === 0) {
          stepWalls.push({ ring: [...c(s.wrap ? ARCADE : 0, -ARCADE), ...c(w, -ARCADE), ...c(w, -ARCADE - 0.5), ...c(s.wrap ? ARCADE : 0, -ARCADE - 0.5)], top: base + 3 });
          for (const u of i === 0 && !s.wrap ? [0, w] : [w]) stepWalls.push({ ring: [...c(u - PIER / 2, 0), ...c(u + PIER / 2, 0), ...c(u + PIER / 2, -PIER), ...c(u - PIER / 2, -PIER)], top: base + 3 });
        }
        lots++;
      });
      kit.lod = 0;
      if (row.lod === 0 && stepped && this.host.low) {
        // no cables on the low preset
      } else if (row.lod === 0 && stepped) {
        // utility cables under the eave, lot by lot: these lots step with the ground
        specs.forEach((s, i) => {
          const y = baseOf(i) + Math.min(eaveY(s), F1 + UP) - 0.8, q = (u: number): [number, number, number] => [fr.ox + fr.dx * u + fr.nx * 0.16, y, fr.oz + fr.dz * u + fr.nz * 0.16];
          cables(kit, q(i * w), q((i + 1) * w), 3, row.lots * 7 + i);
        });
      } else if (row.lod === 0) {
        // utility cables along the facade under the eave
        const y = mid + Math.min(...specs.map(eaveY)) - 0.9;
        cables(kit, [fr.ox + fr.nx * 0.16, y, fr.oz + fr.nz * 0.16], [fr.ox + fr.dx * fr.len + fr.nx * 0.16, y, fr.oz + fr.dz * fr.len + fr.nz * 0.16], 3, row.lots);
      }
    }
    if (china) { const r = buildChinaStreet(kitChina, h, this.signs, photo); floors.push(...r.floors); walls = r.walls; lots += r.lots; }
    if (m5Enabled()) { const r = buildCarpenterEast(kitEast, h, this.signs, china); floors.push(...r.floors); walls.push(...r.walls, ...stepWalls); }
    const allRowDefs = china ? [...rowDefs, CHINA_WEST, CHINA_EAST] : ROWS;
    const westBlocks = m5Enabled() ? BLOCKS.slice(0, -2) : BLOCKS;
    this.yards(kitWest, h, westBlocks, allRowDefs);
    if (china) this.yards(kitChina, h, [CHINA_BLOCK], allRowDefs);
    if (m5Enabled()) this.yards(kitEast, h, BLOCKS.slice(-2), allRowDefs);

    // street lamps on the south side at lot boundaries
    for (const [rid, idx] of [['S1', 3], ['S2', 2], ['N1', 5]] as [string, number][]) {
      const row = ROWS.find((r) => r.id === rid)!, fr = rowFrame(row), w = fr.len / row.lots;
      const x = fr.ox + fr.dx * idx * w + fr.nx * 1.0, z = fr.oz + fr.dz * idx * w + fr.nz * 1.0;
      kitWest.at({ x, y: h(x, z) + 0.03, z, ry: fr.ry }, () => lampPost(kitWest));
    }

    // landmarks
    const site = (id: string) => this.host.sites.find((s) => s.id === id);
    const temple = site(V5_LANDMARK_IDS[0]), court = site(V5_LANDMARK_IDS[1]), stage = site(V5_LANDMARK_IDS[2]);
    const place = (s: SiteLike | undefined, fn: () => void, k = kitWest) => { if (s) k.at({ x: s.anchor.x, y: s.anchor.y, z: s.anchor.z, ry: s.anchor.yaw }, fn); };
    let glbs: THREE.Object3D[] = [];
    if (mode === 'a') {
      place(temple, () => buildGenericTemple(kitWest, temple!.widthM ?? 10.4, temple!.depthM ?? 29.4));
      place(court, () => buildGenericFoodCourt(kitWest));
      place(stage, () => buildGenericStage(kitWest));
    } else {
      glbs = await this.loadGlbs([temple, court, stage]);
      if (token !== this.token) return;
      if (!glbs.length) {
        // GLB assets not built yet: run the authored generators in the browser instead.
        place(temple, () => buildTemple(kitWest)); place(court, () => buildFoodCourt(kitWest)); place(stage, () => buildOperaStage(kitWest));
      }
      // reference-specific street dressing
      const tf = temple!.anchor, nx = Math.sin(tf.yaw), nz = Math.cos(tf.yaw), rx = Math.cos(tf.yaw), rz = -Math.sin(tf.yaw);
      const at = (u: number, v: number, ry: number, fn: () => void) => { const x = tf.x + rx * u + nx * v, z = tf.z + rz * u + nz * v; kitWest.at({ x, y: h(x, z) + 0.04, z, ry: tf.yaw + ry }, fn); };
      at(-6.6, 0.9, 0.2, () => pushcart(kitWest));                                   // mapped banana-fritter pushcart beside the forecourt
      // cars at the kerb either side of the food court mouth (iPackTravel street-front photograph)
      at(-7.4, 6.7, 0.03, () => vehicle(kitWest, 'saloon', hex(0xc9cdd0), this.signs, plateFor(1)));
      at(7.6, 6.7, Math.PI - 0.02, () => vehicle(kitWest, 'hatch', hex(0xe9e9e6), this.signs, plateFor(2)));
      at(-21, 1.75, Math.PI, () => vehicle(kitWest, 'hatch', hex(0x7a1f1c), this.signs, plateFor(3)));
      at(24, 6.6, 0, () => vehicle(kitWest, 'suv', hex(0x2c3e55), this.signs, plateFor(4)));
      streetLanterns(kitWest, h, [0.16, 0.3, 0.72, 0.86]);
    }

    // kits -> meshes: split the heaviest opaque materials across the 3 street blocks (adding <= 6 draw calls total)
    this.disposeMeshes();
    let tris = 0, calls = 0, gbytes = 0;
    const addBuf = (name: string, buf: Buf) => {
      if (!buf.idx.length) return;
      const mesh = new THREE.Mesh(bufGeometry(buf), this.materials.byName[name as MaterialName]);
      mesh.castShadow = !NO_SHADOW.has(name); mesh.receiveShadow = !NO_RECEIVE.has(name);
      mesh.renderOrder = name === 'poly' ? 5 : name === 'pane' ? 6 : 0;
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
      tris += buf.idx.length / 3; calls++; gbytes += buf.count * 44 + buf.idx.length * (buf.count > 65535 ? 4 : 2);
    };
    const blockKits = [kitWest, kitChina, kitEast];
    const byMat = new Map<string, Buf[]>();
    for (const k of blockKits) for (const [name, buf] of k.bufs) {
      if (!buf.idx.length) continue;
      const list = byMat.get(name);
      if (list) list.push(buf); else byMat.set(name, [buf]);
    }
    const candidates = [...byMat.entries()]
      .filter(([name, list]) => list.length > 1 && !NO_SHADOW.has(name))
      .map(([name, list]) => ({ name, extra: list.length - 1, tris: list.reduce((a, b) => a + b.idx.length / 3, 0) }))
      .sort((a, b) => b.tris - a.tris);
    const splitMats = new Set<string>();
    let extraCalls = 0;
    for (const c of candidates) {
      if (extraCalls + c.extra <= 6) { splitMats.add(c.name); extraCalls += c.extra; }
    }
    for (const [name, list] of byMat) {
      if (splitMats.has(name)) for (const buf of list) addBuf(name, buf);
      else addBuf(name, mergeBufs(list));
    }
    for (const o of glbs) {
      this.group.add(o);
      o.traverse((m) => { const mesh = m as THREE.Mesh; if (!mesh.isMesh) return; calls++; tris += (mesh.geometry.index?.count ?? 0) / 3; for (const a of Object.values(mesh.geometry.attributes)) gbytes += (a as THREE.BufferAttribute).array.byteLength; gbytes += mesh.geometry.index?.array.byteLength ?? 0; });
    }
    this.host.setFloors(floors);
    this.host.setWalls(walls);
    this.mode = mode;
    const S = this.signs.canvas.width, det = (this.materials.uniforms.uDetail.value.image as { width: number }).width;
    this.stats = { ...this.stats, triangles: Math.round(tris), drawCalls: calls, buildMs: Math.round(performance.now() - t0), glb: glbs.length > 0, lots, geometryBytes: gbytes,
      textureBytes: Math.round((S * S * 4 + det * det * 4 + (mode !== 'a' ? ATLAS_SIZE * ATLAS_SIZE * 4 : 0)) * 1.333) + (photo ? this.photoBytes : 0) };
  }

  /** Low zinc back-of-lot roofs over each replaced block and plain yard walls on edges without a row. */
  private yards(kit: Kit, h: (x: number, z: number) => number, blocks: number[][], rows: RowDef[]): void {
    for (const ring of blocks) {
      const n = ring.length / 2;
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += ring[i * 2] / n; cz += ring[i * 2 + 1] / n; }
      const base = h(cx, cz), top = base + 5.6;
      // inset the outline slightly so these never coincide with lot walls
      const P = (i: number): [number, number] => { const x = ring[(i % n) * 2], z = ring[(i % n) * 2 + 1], l = Math.hypot(cx - x, cz - z); return [x + ((cx - x) / l) * 0.35, z + ((cz - z) / l) * 0.35]; };
      const tris = THREE.ShapeUtils.triangulateShape(Array.from({ length: n }, (_, i) => new THREE.Vector2(...P(i))), []);
      kit.use('zinc');
      for (const t of tris) {
        const p = t.map((i) => [P(i)[0], top, P(i)[1]] as [number, number, number]);
        const up = (p[1][2] - p[0][2]) * (p[2][0] - p[0][0]) - (p[1][0] - p[0][0]) * (p[2][2] - p[0][2]) > 0;
        kit.poly(up ? p : [p[0], p[2], p[1]], hex(0x8f9496, 0.75));
      }
      kit.use('plaster');
      const ccw = (() => { let a = 0; for (let i = 0; i < n; i++) { const p = P(i), q = P(i + 1); a += p[0] * q[1] - q[0] * p[1]; } return a > 0; })();
      for (let i = 0; i < n; i++) {
        const a = P(i), b = P(i + 1);
        if (rows.some((r) => (Math.hypot(r.a[0] - ring[(i % n) * 2], r.a[1] - ring[(i % n) * 2 + 1]) < 0.6 && Math.hypot(r.b[0] - ring[((i + 1) % n) * 2], r.b[1] - ring[((i + 1) % n) * 2 + 1]) < 0.6) || (Math.hypot(r.b[0] - ring[(i % n) * 2], r.b[1] - ring[(i % n) * 2 + 1]) < 0.6 && Math.hypot(r.a[0] - ring[((i + 1) % n) * 2], r.a[1] - ring[((i + 1) % n) * 2 + 1]) < 0.6))) continue;
        const c = hex(0xcfc9ba, 0.85 + rnd(i, n) * 0.15), lo = hex(0xcfc9ba, 0.6);
        const q: [number, number, number][] = [[a[0], base - 0.3, a[1]], [b[0], base - 0.3, b[1]], [b[0], top, b[1]], [a[0], top, a[1]]];
        // outward = away from the centroid
        kit.poly(ccw ? [q[1], q[0], q[3], q[2]] : q, ccw ? [lo, lo, c, c] : [lo, lo, c, c]);
      }
    }
  }

  private async loadGlbs(sites: (SiteLike | undefined)[]): Promise<THREE.Object3D[]> {
    const out: THREE.Object3D[] = [];
    try {
      const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([import('three/addons/loaders/GLTFLoader.js'), import('three/addons/libs/meshopt_decoder.module.js')]);
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const names = ['temple', 'foodcourt', 'stage'];
      for (let i = 0; i < 3; i++) {
        const s = sites[i];
        if (!s) continue;
        const url = `${this.host.baseUrl}models/v5/${names[i]}.lod0.glb`;
        const head = await fetch(url);
        if (!head.ok || (head.headers.get('content-type') ?? '').includes('text/html')) return [];
        const bytes = await head.arrayBuffer();
        this.stats.assetBytes += bytes.byteLength;
        const gltf = await loader.parseAsync(bytes, '');
        const root = new THREE.Group();
        root.add(gltf.scene);
        gltf.scene.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          const name = (mesh.material as THREE.Material).name as MaterialName;
          (mesh.material as THREE.Material).dispose();
          mesh.material = this.materials.byName[name] ?? this.materials.byName.paint;
          mesh.castShadow = !NO_SHADOW.has(name); mesh.receiveShadow = !NO_RECEIVE.has(name);
          mesh.renderOrder = name === 'poly' ? 5 : 0;
          rgbColours(mesh.geometry);
        });
        // Same tag as the registry's models (LandmarkModels): the site this object draws, so the one-copy-per-landmark
        // rule can be checked across both renderers.
        root.name = `${s.id}:v5`;
        root.userData.landmark = s.id;
        root.position.set(s.anchor.x, s.anchor.y, s.anchor.z);
        root.rotation.y = s.anchor.yaw;
        root.updateMatrixWorld(true);
        out.push(root);
      }
    } catch (e) {
      console.warn('V5 landmark GLB unavailable, using in-browser generation:', e);
      return [];
    }
    return out;
  }

  update(time: number): void { this.materials.uniforms.uTime.value = time; }

  private disposeMeshes(): void {
    for (const o of [...this.group.children]) {
      this.group.remove(o);
      o.traverse((m) => { const mesh = m as THREE.Mesh; if (mesh.isMesh) mesh.geometry.dispose(); });
    }
  }

  dispose(): void { this.token++; this.disposeMeshes(); this.host.setFloors([]); this.host.setWalls([]); this.mode = null; }
}
