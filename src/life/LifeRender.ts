// N1-M6 part B: drawing the ambient traffic and the walkers, instanced.
//
// Vehicles: the three cars of the parked-car kit (src/v5/vehicles.ts) and a kapcai with its rider, one InstancedMesh
// per kind, one shared material. The paint is a per-instance colour applied to the body panels only; lamps are an
// emissive attribute driven by the shared night uniform (and by the brakes).
// Walkers: the CC0 "Casual Character" that is already shipped (docs/ASSETS.md). Its walk cycle is baked once into a
// small float texture (one row block per frame, one texel per vertex) and replayed in the vertex shader, so every
// walker is one instance of ONE draw call, with its own clothes, height and step. No skeleton per walker.
// Under everything: one InstancedMesh of soft contact shadows; at night one of headlight patches on the road.
import * as THREE from 'three';
import { Kit, hex } from '../v5/kit.ts';
import type { Col } from '../v5/kit.ts';
import { vehicle, kapcai } from '../v5/vehicles.ts';
import type { VehicleKind } from '../v5/vehicles.ts';
import { ENV } from '../world/env.ts';
import { headlightGeometry } from '../world/StreetFurniture.ts';
import { KIND, KINDS, SIZE } from './traffic.ts';
import type { Vehicle } from './traffic.ts';
import type { Walker } from './walkers.ts';

/** Body paints seen on Kuching's roads (plain colours; no make or model is implied). */
export const PAINTS = [0xf1f1ee, 0xf1f1ee, 0xbfc3c7, 0xbfc3c7, 0x70757b, 0x1b1c1f, 0x9e1f1f, 0x22427a, 0x5c1a22, 0xc7b697, 0x2f5a4a, 0xd8d5cc];
const TOPS = [0xf2f0ea, 0xd9e4ee, 0x2f5f8a, 0x8a2f3a, 0xe0b23a, 0x2e6b4f, 0x1f2a44, 0xd98aa5, 0x7b7f86, 0x6a4a2f, 0xe9e2c8, 0x3a3f4a, 0xb8442e, 0x5aa0a8];
const BOTTOMS = [0x1f2433, 0x17181c, 0x8d7b5c, 0x55585e, 0x3d5a80, 0x2a2c33, 0x6a6258, 0x23262b];
const SKINS = [0xc79a72, 0xb07a52, 0x95653f, 0xd9b08c, 0x7a5236, 0xbd8d68];

/** Body style of each kind of src/life/traffic.ts (KIND order); the kapcai has its own builder. */
const CAR_KINDS: VehicleKind[] = ['hatch', 'saloon', 'suv', 'hatch', 'saloon', 'pickup'];
const LAMP_RED = hex(0x9a100c), LAMP_CLEAR = hex(0xdfe3e6);
/** N1-M7: the one plain paint of the generic taxi (ambient and parked alike). */
export const TAXI_PAINT = 0xa8241c;
/** N1-M7: what a wrecked body's paint turns toward (the damage tint). */
export const SOOT = 0x2b2622;
/** N1-M7: kinds that stand parked for the player to take, so they get a mesh on every preset. */
export const PARKED_KINDS: readonly number[] = [KIND.hatch, KIND.kapcai, KIND.taxi, KIND.pickup];

/** N1-M7: a vehicle standing parked (src/play/parked.ts), drawn with the traffic's meshes. */
export interface ParkedDraw { id: number; kind: number; x: number; y: number; z: number; heading: number; pitch: number; paint: number; damage: number }

const near = (c: ArrayLike<number>, i: number, k: Col) => Math.abs(c[i] - k[0]) + Math.abs(c[i + 1] - k[1]) + Math.abs(c[i + 2] - k[2]) < 1e-4;

interface Raw { pos: number[]; nor: number[]; col: number[]; idx: number[] }

function merge(kit: Kit): Raw {
  const out: Raw = { pos: [], nor: [], col: [], idx: [] };
  for (const [name, b] of kit.bufs) {
    if (name === 'contact' || !b.idx.length) continue; // the baked shadow quad: the blob below replaces it
    const base = out.pos.length / 3;
    for (const v of b.pos) out.pos.push(v);
    for (const v of b.nor) out.nor.push(v);
    for (const v of b.col) out.col.push(v);
    for (const i of b.idx) out.idx.push(base + i);
  }
  return out;
}

/**
 * Geometry of one vehicle kind with +Z forward: `color` is the vehicle with black paint, `tintK` what white paint adds
 * (so colour = color + tintK * paint), `glow` the lamps (rgb, w: 1 = also lit by the brakes, 2 = always lit).
 * N1-M7: `rider` is 1 on the kapcai's rider, who is folded away on a parked bike (iPaint.w >= 2).
 */
export function vehicleGeometry(kind: number): THREE.BufferGeometry {
  const build = (paint: Col, rider = true): Raw => {
    const k = new Kit(1);
    if (kind === KIND.kapcai) kapcai(k, paint, rider); else vehicle(k, CAR_KINDS[kind], paint, null, '', false, kind === KIND.taxi);
    return merge(k);
  };
  const dark = build([0, 0, 0]), light = build([1, 1, 1]), marked = build(hex(0x808080)), n = dark.pos.length / 3;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), tint = new Float32Array(n * 3), glow = new Float32Array(n * 4), rider = new Float32Array(n);
  if (kind === KIND.kapcai) {
    // (the rider is built last: whatever comes after the counts taken before him is his)
    const k = new Kit(1), start = kapcai(k, [0, 0, 0], true);
    let base = 0;
    for (const [name, b] of k.bufs) {
      if (name === 'contact' || !b.idx.length) continue;
      for (let i = start.get(name) ?? 0; i < b.count; i++) rider[base + i] = 1;
      base += b.count;
    }
  }
  for (let i = 0; i < n; i++) {
    const x = dark.pos[i * 3], z = dark.pos[i * 3 + 2];
    pos[i * 3] = -z; pos[i * 3 + 1] = dark.pos[i * 3 + 1]; pos[i * 3 + 2] = x;
    nor[i * 3] = -dark.nor[i * 3 + 2]; nor[i * 3 + 1] = dark.nor[i * 3 + 1]; nor[i * 3 + 2] = dark.nor[i * 3];
    for (let q = 0; q < 3; q++) { col[i * 3 + q] = dark.col[i * 3 + q]; tint[i * 3 + q] = light.col[i * 3 + q] - dark.col[i * 3 + q]; }
    if (near(marked.col, i * 3, LAMP_RED)) glow.set([1.7, 0.1, 0.06, 1], i * 4);
    else if (near(marked.col, i * 3, LAMP_CLEAR) && x > 0) glow.set([1.5, 1.38, 1.05, kind === KIND.kapcai ? 2 : 0], i * 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('tintK', new THREE.BufferAttribute(tint, 3));
  g.setAttribute('glow', new THREE.BufferAttribute(glow, 4));
  g.setAttribute('rider', new THREE.BufferAttribute(rider, 1));
  g.setIndex(dark.idx);
  return g;
}

function vehicleMaterial(): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (s) => {
    s.uniforms.uNight = ENV.uNight;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 tintK;\nattribute vec4 glow;\nattribute vec4 iPaint;\nattribute float rider;\nuniform float uNight;\nvarying vec3 vGlow;')
      // (iPaint.w: 0 = driving, 1 = braking, 2 = parked: no lamps, and the kapcai's rider is folded away)
      .replace('#include <color_vertex>', '#include <color_vertex>\nvColor.rgb = color + tintK * iPaint.rgb;\nvGlow = iPaint.w > 1.5 ? vec3(0.0) : glow.rgb * max(smoothstep(0.25, 0.6, uNight), glow.w > 1.5 ? 0.8 : glow.w * iPaint.w);')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nif (rider > 0.5 && iPaint.w > 1.5) transformed = vec3(0.0, 0.4, 0.0);');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vGlow;');
  };
  m.customProgramCacheKey = () => 'life-vehicle';
  return m;
}

/** Shadow pass of the kapcai: the same folding of the rider, so a parked bike casts no rider's shadow. */
function kapcaiDepthMaterial(): THREE.MeshDepthMaterial {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 iPaint;\nattribute float rider;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nif (rider > 0.5 && iPaint.w > 1.5) transformed = vec3(0.0, 0.4, 0.0);');
  };
  m.customProgramCacheKey = () => 'life-kapcai-depth';
  return m;
}

function blobTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!, grad = g.createRadialGradient(32, 32, 5, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.8)'); grad.addColorStop(0.6, 'rgba(0,0,0,0.5)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// ---- walkers: the baked walk cycle ------------------------------------------------------------------------------

/** Walk-cycle frames baked into the texture (frame 0 of the texture is the standing pose). */
export const WALK_FRAMES = 12;
const VAT_W = 512;
/** Material names of the model whose colour comes from the walker: 1 = top, 2 = bottom, 3 = skin, 4 = hair. */
const PART: Record<string, number> = { LightBrown: 1, LightBlue: 2, Skin: 3, Skin_Darker: 3, Hair: 4, Eyebrows: 4 };

export interface WalkerBake { geometry: THREE.BufferGeometry; texture: THREE.DataTexture; rows: number; vertices: number; triangles: number }

/**
 * Bake the standing pose and the walk cycle of a skinned glTF character. `cell` > 0 merges vertices that lie in the
 * same cell of that size (metres at 1.72 m body height): a coarser, cheaper figure for the lower presets.
 * `pause` is awaited between frames so the work is spread over several rendered frames.
 */
export async function bakeWalker(gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] }, cell: number, pause: () => Promise<void>): Promise<WalkerBake> {
  const root = gltf.scene, meshes: THREE.SkinnedMesh[] = [];
  root.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh); });
  const clip = (re: RegExp) => gltf.animations.find((a) => re.test(a.name));
  const walk = clip(/walk/i), idle = clip(/idle/i);
  if (!meshes.length || !walk) throw new Error('walker model has no skinned mesh or no walk clip');
  const mixer = new THREE.AnimationMixer(root);
  const pose = (c: THREE.AnimationClip | undefined, t: number) => {
    mixer.stopAllAction();
    if (c) { const a = mixer.clipAction(c); a.play(); mixer.setTime(t); }
    root.updateMatrixWorld(true);
    for (const m of meshes) m.skeleton.update();
  };
  // unique vertices: the same place in the same material is one vertex (the model repeats each one per face)
  const src: [number, number][] = [], tris: number[] = [], part: number[] = [], base: number[] = [];
  const tmp = new THREE.Vector3(), skinMain = new THREE.Color(0xc79a72);
  meshes.forEach((m) => {
    const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial;
    if (mat.name === 'Skin') skinMain.copy(mat.color);
  });
  meshes.forEach((m, mi) => {
    const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial;
    const p = m.geometry.getAttribute('position'), index = m.geometry.getIndex(), seen = new Map<string, number>(), remap: number[] = [];
    const kind = PART[mat.name] ?? 0, c = mat.color.clone();
    if (kind === 3) c.setRGB(c.r / skinMain.r, c.g / skinMain.g, c.b / skinMain.b);
    else if (kind === 4) c.setRGB(1, 1, 1);
    else if (mat.name === 'Red_Dark') c.setHex(0x1d1d20);
    for (let i = 0; i < p.count; i++) {
      const key = `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`;
      let id = seen.get(key);
      if (id === undefined) { id = src.length; seen.set(key, id); src.push([mi, i]); part.push(kind); base.push(c.r, c.g, c.b); }
      remap.push(id);
    }
    const count = index ? index.count : p.count;
    for (let i = 0; i < count; i++) tris.push(remap[index ? index.getX(i) : i]);
  });
  const sample = (): Float32Array => {
    const out = new Float32Array(src.length * 3);
    for (let i = 0; i < src.length; i++) {
      const m = meshes[src[i][0]];
      m.getVertexPosition(src[i][1], tmp).applyMatrix4(m.matrixWorld);
      out[i * 3] = tmp.x; out[i * 3 + 1] = tmp.y; out[i * 3 + 2] = tmp.z;
    }
    return out;
  };
  const centre = (f: Float32Array): [number, number] => { let x = 0, z = 0; for (let i = 0; i < f.length; i += 3) { x += f[i]; z += f[i + 2]; } return [x / (f.length / 3), z / (f.length / 3)]; };
  pose(idle, 0);
  const frames: Float32Array[] = [sample()];
  for (let f = 0; f < WALK_FRAMES; f++) { await pause(); pose(walk, (walk.duration * f) / WALK_FRAMES); frames.push(sample()); }
  mixer.stopAllAction(); mixer.uncacheRoot(root);
  // normalise: soles on y = 0, 1 unit tall, the body's middle over the origin in every frame (no root motion), facing +Z
  const st = frames[0];
  let y0 = Infinity, y1 = -Infinity;
  for (let i = 1; i < st.length; i += 3) { y0 = Math.min(y0, st[i]); y1 = Math.max(y1, st[i]); }
  const k = 1 / (y1 - y0);
  let eyeZ = 0, eyes = 0;
  const sz = centre(st)[1];
  meshes.forEach((m, mi) => { const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.Material; if (mat.name === 'Eye') src.forEach((s, i) => { if (s[0] === mi) { eyeZ += st[i * 3 + 2] - sz; eyes++; } }); });
  const flip = eyes > 0 && eyeZ < 0 ? -1 : 1;
  for (const f of frames) {
    const [cx, cz] = centre(f);
    for (let i = 0; i < f.length; i += 3) { f[i] = (f[i] - cx) * k * flip; f[i + 1] = (f[i + 1] - y0) * k; f[i + 2] = (f[i + 2] - cz) * k * flip; }
  }
  // optional vertex clustering on the standing pose
  let keep: number[] = src.map((_, i) => i), to: number[] = keep.slice();
  if (cell > 0) {
    const c = cell / 1.72, seen = new Map<string, number>();
    keep = []; to = [];
    for (let i = 0; i < src.length; i++) {
      const key = `${part[i]}|${base[i * 3].toFixed(3)}|${Math.floor(st[i * 3] / c)},${Math.floor(st[i * 3 + 1] / c)},${Math.floor(st[i * 3 + 2] / c)}`;
      let id = seen.get(key);
      if (id === undefined) { id = keep.length; seen.set(key, id); keep.push(i); }
      to.push(id);
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < tris.length; i += 3) {
    const a = to[tris[i]], b = to[tris[i + 1]], c = to[tris[i + 2]];
    if (a !== b && b !== c && a !== c) idx.push(a, b, c);
  }
  const n = keep.length, rows = Math.ceil(n / VAT_W), data = new Float32Array(VAT_W * rows * frames.length * 4);
  frames.forEach((f, fi) => { for (let i = 0; i < n; i++) { const o = (fi * rows * VAT_W + i) * 4, s = keep[i] * 3; data[o] = f[s]; data[o + 1] = f[s + 1]; data[o + 2] = f[s + 2]; } });
  const texture = new THREE.DataTexture(data, VAT_W, rows * frames.length, THREE.RGBAFormat, THREE.FloatType);
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), prt = new Float32Array(n);
  for (let i = 0; i < n; i++) { const s = keep[i]; pos.set(st.subarray(s * 3, s * 3 + 3), i * 3); col.set(base.slice(s * 3, s * 3 + 3), i * 3); prt[i] = part[s]; }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geometry.setAttribute('part', new THREE.BufferAttribute(prt, 1));
  geometry.setIndex(idx);
  return { geometry, texture, rows, vertices: n, triangles: idx.length / 3 };
}

function walkerMaterial(bake: WalkerBake): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  m.onBeforeCompile = (s) => {
    s.uniforms.uVat = { value: bake.texture };
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>
uniform highp sampler2D uVat;
attribute float part;
attribute vec3 iTop;
attribute vec3 iBottom;
attribute vec4 iSkin;
attribute vec2 iAnim;
vec3 vatAt(int frame) { return texelFetch(uVat, ivec2(gl_VertexID % ${VAT_W}, frame * ${bake.rows} + gl_VertexID / ${VAT_W}), 0).xyz; }`)
      .replace('#include <color_vertex>', '#include <color_vertex>\nif (part > 0.5) vColor.rgb = part < 1.5 ? iTop : part < 2.5 ? iBottom : part < 3.5 ? iSkin.rgb * color : vec3(iSkin.a);')
      .replace('#include <begin_vertex>', `vec3 transformed;
if (iAnim.y > 0.5) transformed = vatAt(0);
else { float f = fract(iAnim.x) * ${WALK_FRAMES}.0; int f0 = int(f) % ${WALK_FRAMES}; transformed = mix(vatAt(1 + f0), vatAt(1 + (f0 + 1) % ${WALK_FRAMES}), fract(f)); }`);
  };
  m.customProgramCacheKey = () => `life-walker-${bake.rows}`;
  // (a plain property, so that the shader preparation finds the texture and uploads it before the first walker is drawn)
  Object.assign(m, { vatTexture: bake.texture });
  return m;
}

// ---- the scene objects ---------------------------------------------------------------------------------------------

export interface RenderBudget { vehicles: number; walkers: number; kinds: readonly number[]; shadows: boolean; /** N1-M7: parked vehicles drawn besides the traffic. */ parked?: number }

export class LifeRender {
  readonly group = new THREE.Group();
  private cars: (THREE.InstancedMesh | null)[] = new Array(KINDS).fill(null);
  private paint: (THREE.InstancedBufferAttribute | null)[] = new Array(KINDS).fill(null);
  private depthMat: THREE.Material | null = null;
  private soot = new THREE.Color(SOOT);
  private people: THREE.InstancedMesh | null = null;
  private vat: THREE.Texture | null = null;
  private pAttr: { top: THREE.InstancedBufferAttribute; bottom: THREE.InstancedBufferAttribute; skin: THREE.InstancedBufferAttribute; anim: THREE.InstancedBufferAttribute } | null = null;
  private blobs: THREE.InstancedMesh;
  private beams: THREE.InstancedMesh;
  private beamMat: THREE.MeshBasicMaterial;
  private carMat = vehicleMaterial();
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler(0, 0, 0, 'YXZ');
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();
  private dressed = 0;
  private sig = new Array<number>(KINDS).fill(0);
  private sent = new Array<number>(KINDS).fill(0);
  private counts = new Array<number>(KINDS).fill(0);
  private maxVehicles: number;
  private maxWalkers: number;
  /** Triangles of one walker (after the bake). */
  walkerTriangles = 0;

  /** `budget.kinds`: which vehicle kinds get a mesh (weight > 0). `pools` is the world's lamp-pool material: the beams follow it. */
  constructor(budget: RenderBudget, private pools: THREE.MeshBasicMaterial) {
    this.group.name = 'life';
    const parked = budget.parked ?? 0;
    this.maxVehicles = budget.vehicles + 4 + parked; this.maxWalkers = budget.walkers + 4;
    for (let kind = 0; kind < KINDS; kind++) {
      if (!((budget.kinds[kind] ?? 0) > 0) && !(parked > 0 && PARKED_KINDS.includes(kind))) continue;
      const g = vehicleGeometry(kind), a = new THREE.InstancedBufferAttribute(new Float32Array(this.maxVehicles * 4), 4);
      a.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('iPaint', a);
      const mesh = new THREE.InstancedMesh(g, this.carMat, this.maxVehicles);
      mesh.count = 0; mesh.frustumCulled = false; mesh.receiveShadow = true; mesh.castShadow = budget.shadows; mesh.userData.noAO = true; mesh.name = `life-vehicles-${kind}`;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (kind === KIND.kapcai && budget.shadows) mesh.customDepthMaterial = this.depthMat = kapcaiDepthMaterial();
      this.cars[kind] = mesh; this.paint[kind] = a;
      this.group.add(mesh);
    }
    const n = this.maxVehicles + this.maxWalkers;
    this.blobs = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: blobTexture(), color: 0x000000, transparent: true, opacity: 0.58, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -24 }),
      n,
    );
    this.blobs.count = 0; this.blobs.frustumCulled = false; this.blobs.renderOrder = 8; this.blobs.userData.noAO = true; this.blobs.name = 'life-shadows';
    this.blobs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.beamMat = new THREE.MeshBasicMaterial({ color: 0x000000, vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -7, polygonOffsetUnits: -28 });
    this.beams = new THREE.InstancedMesh(headlightGeometry(), this.beamMat, this.maxVehicles);
    this.beams.count = 0; this.beams.frustumCulled = false; this.beams.renderOrder = 7; this.beams.userData.noAO = true; this.beams.name = 'life-headlights';
    this.beams.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.blobs, this.beams);
  }

  /** Add the walkers' mesh once their model is baked. It stays hidden until the caller has compiled its program. */
  setWalkers(bake: WalkerBake): THREE.InstancedMesh {
    const g = bake.geometry, n = this.maxWalkers;
    const attr = (size: number) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(n * size), size); a.setUsage(THREE.DynamicDrawUsage); return a; };
    this.pAttr = { top: attr(3), bottom: attr(3), skin: attr(4), anim: attr(2) };
    g.setAttribute('iTop', this.pAttr.top); g.setAttribute('iBottom', this.pAttr.bottom); g.setAttribute('iSkin', this.pAttr.skin); g.setAttribute('iAnim', this.pAttr.anim);
    const mesh = new THREE.InstancedMesh(g, walkerMaterial(bake), n);
    mesh.count = 0; mesh.frustumCulled = false; mesh.receiveShadow = true; mesh.userData.noAO = true; mesh.name = 'life-walkers';
    mesh.visible = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.people = mesh; this.vat = bake.texture;
    this.walkerTriangles = bake.triangles;
    this.group.add(mesh);
    return mesh;
  }

  /**
   * Draw one of each vehicle kind 40 m under (x, z) for a frame or two: the first draw of a mesh compiles what
   * `renderer.compile` does not (its shadow-pass program) and uploads its buffers, and this way that happens behind the
   * start screen, not when the first car comes round a corner.
   */
  warm(x: number, y: number, z: number): void {
    this.m.compose(this.p.set(x, y - 40, z), this.q.identity(), this.s.set(1, 1, 1));
    for (const mesh of this.cars) if (mesh) { mesh.setMatrixAt(0, this.m); mesh.count = 1; mesh.visible = true; mesh.instanceMatrix.needsUpdate = true; }
  }

  /**
   * Copy the simulation onto the instances. `age`: seconds since the simulation last ran (the Low preset runs it every
   * second frame): everything is drawn that much further along its way. `parked` (N1-M7): vehicles standing parked.
   */
  sync(vehicles: readonly Vehicle[], walkers: readonly Walker[], age = 0, parked: readonly ParkedDraw[] = []): void {
    const { m, q, e, p, s, c } = this;
    const counts = this.counts.fill(0);
    let blobs = 0, beams = 0;
    const night = this.pools.visible;
    this.beams.visible = night;
    if (night) this.beamMat.color.copy(this.pools.color);
    // (paint and brake lamps are sent to the GPU only when they changed)
    const sig = this.sig;
    sig.fill(7);
    let drawn = 0;
    for (const v of vehicles) {
      const mesh = this.cars[v.kind];
      if (!mesh || drawn >= this.maxVehicles) continue;
      drawn++;
      e.set(-v.pitch, v.heading, 0);
      q.setFromEuler(e);
      const ahead = v.v * age, vx = v.x + Math.sin(v.heading) * ahead, vz = v.z + Math.cos(v.heading) * ahead;
      m.compose(p.set(vx, v.y, vz), q, s.set(1, 1, 1));
      const i = counts[v.kind]++;
      mesh.setMatrixAt(i, m);
      c.setHex(v.kind === KIND.taxi ? TAXI_PAINT : PAINTS[v.tint % PAINTS.length]);
      this.paint[v.kind]!.setXYZW(i, c.r, c.g, c.b, v.braking ? 1 : 0);
      sig[v.kind] = (Math.imul(sig[v.kind], 31) + v.id * 2 + (v.braking ? 1 : 0)) | 0;
      const size = SIZE[v.kind];
      m.compose(p.set(vx, v.y + 0.03, vz), q, s.set(size.hw * 2 + 1.1, 1, size.half * 2 + 1.0));
      this.blobs.setMatrixAt(blobs++, m);
      if (night && beams < this.maxVehicles) { m.compose(p.set(vx, v.y, vz), q, s.set(v.kind === KIND.kapcai ? 0.6 : 1, 1, 1)); this.beams.setMatrixAt(beams++, m); }
    }
    // N1-M7: the parked vehicles, in the same meshes (no lamps, no rider on a kapcai, paint dulled by damage)
    for (const v of parked) {
      const mesh = this.cars[v.kind];
      if (!mesh || drawn >= this.maxVehicles) continue;
      drawn++;
      e.set(-v.pitch, v.heading, 0);
      q.setFromEuler(e);
      m.compose(p.set(v.x, v.y, v.z), q, s.set(1, 1, 1));
      const i = counts[v.kind]++;
      mesh.setMatrixAt(i, m);
      c.setHex(v.paint).lerp(this.soot, Math.min(1, v.damage) * 0.72);
      this.paint[v.kind]!.setXYZW(i, c.r, c.g, c.b, 2);
      sig[v.kind] = (Math.imul(sig[v.kind], 31) + v.id * 64 + Math.round(v.damage * 20) + 3) | 0;
      const size = SIZE[v.kind];
      m.compose(p.set(v.x, v.y + 0.03, v.z), q, s.set(size.hw * 2 + 1.1, 1, size.half * 2 + 1.0));
      this.blobs.setMatrixAt(blobs++, m);
    }
    this.cars.forEach((mesh, k) => {
      if (!mesh) return;
      mesh.count = counts[k];
      mesh.visible = counts[k] > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (sig[k] !== this.sent[k]) { this.sent[k] = sig[k]; this.paint[k]!.needsUpdate = true; }
    });
    if (this.people && this.pAttr) {
      const a = this.pAttr;
      let n = 0;
      // clothes are sent to the GPU only when the list of walkers changed
      let sig = walkers.length;
      for (const w of walkers) sig = (Math.imul(sig, 31) + w.id) | 0;
      const dress = sig !== this.dressed;
      this.dressed = sig;
      for (const w of walkers) {
        if (n >= this.maxWalkers) break;
        e.set(0, w.heading, 0);
        q.setFromEuler(e);
        const ahead = w.stand || w.wait > 0 ? 0 : w.v * age, wx = w.x + Math.sin(w.heading) * ahead, wz = w.z + Math.cos(w.heading) * ahead;
        m.compose(p.set(wx, w.y, wz), q, s.setScalar(w.height));
        this.people.setMatrixAt(n, m);
        if (dress) {
          c.setHex(TOPS[w.look % TOPS.length]); a.top.setXYZ(n, c.r, c.g, c.b);
          c.setHex(BOTTOMS[(w.look >>> 5) % BOTTOMS.length]); a.bottom.setXYZ(n, c.r, c.g, c.b);
          c.setHex(SKINS[(w.look >>> 9) % SKINS.length]); a.skin.setXYZW(n, c.r, c.g, c.b, 0.012 + ((w.look >>> 13) % 4) * 0.012);
        }
        a.anim.setXY(n, w.phase + ahead / 1.45, w.stand || w.v < 0.08 ? 1 : 0);
        n++;
        m.compose(p.set(wx, w.y + 0.02, wz), q, s.set(0.8, 1, 0.8));
        this.blobs.setMatrixAt(blobs++, m);
      }
      this.people.count = n;
      this.people.instanceMatrix.needsUpdate = true;
      a.anim.needsUpdate = true;
      if (dress) a.top.needsUpdate = a.bottom.needsUpdate = a.skin.needsUpdate = true;
    }
    this.blobs.count = blobs; this.blobs.instanceMatrix.needsUpdate = true;
    this.beams.count = beams; this.beams.instanceMatrix.needsUpdate = true;
  }

  /** Everything that needs its program compiled before it is first drawn (the beams too, although hidden by day). */
  get meshes(): THREE.Object3D[] { return this.group.children.slice(); }

  dispose(): void {
    this.group.removeFromParent();
    for (const o of this.group.children) {
      const mesh = o as THREE.InstancedMesh;
      mesh.geometry.dispose();
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.map?.dispose(); mat.dispose();
      mesh.dispose();
    }
    this.vat?.dispose();
    this.depthMat?.dispose();
    this.group.clear();
  }
}
