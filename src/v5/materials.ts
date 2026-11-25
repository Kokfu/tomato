// V5 Kuching material library: physically based materials with procedural surface detail.
//
// Every material is a MeshStandardMaterial (metal/roughness PBR) whose shader is extended with a
// small world-space "surface" function that modulates albedo, roughness, metalness and a height
// value; the height is turned into a per-pixel normal with screen-space derivatives, so no UVs,
// tangents or normal-map downloads are needed. Fine grain comes from ONE tileable detail texture
// generated on the CPU at load (65 KB of GPU memory at 128 px, 262 KB at 256 px) and sampled
// triplanar at several scales - the technique the Abyssal Garden demo uses for all its rock.
//
// Vertex colours carry paint colour x baked occlusion (see kit.ts).
import * as THREE from 'three';
import { ENV, ENV_PARS } from '../world/env.ts';

export const MATERIAL_NAMES = [
  'plaster', 'concrete', 'tile', 'glazed', 'shutter', 'louvre', 'timber', 'paint', 'asphalt', 'paving', 'stone',
  'zinc', 'glass', 'fabric', 'foliage', 'glow', 'gold', 'atlas', 'sign', 'poly', 'wire', 'carpaint', 'contact',
  'asphaltPhoto', 'pane',
] as const;
export type MaterialName = (typeof MATERIAL_NAMES)[number];

/** Tileable RGBA detail texture. R: fine grain height, G: broad mottling, B: sparse speckle, A: medium grain. */
function detailTexture(size: number): THREE.DataTexture {
  const hash = (x: number, y: number, s: number) => {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const vnoise = (u: number, v: number, period: number, seed: number) => {
    const x = u * period, y = v * period, xi = Math.floor(x), yi = Math.floor(y);
    let fx = x - xi, fy = y - yi;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const w = (a: number) => ((a % period) + period) % period;
    const a = hash(w(xi), w(yi), seed), b = hash(w(xi + 1), w(yi), seed), c = hash(w(xi), w(yi + 1), seed), d = hash(w(xi + 1), w(yi + 1), seed);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  const fbm = (u: number, v: number, base: number, oct: number, seed: number) => {
    let s = 0, a = 0.5, p = base, n = 0;
    for (let i = 0; i < oct; i++) { s += a * vnoise(u, v, p, seed + i); n += a; a *= 0.5; p *= 2; }
    return s / n;
  };
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size, o = (y * size + x) * 4;
    const fine = fbm(u, v, 32, 3, 11);
    const broad = fbm(u, v, 4, 4, 23);
    const sp = vnoise(u, v, 64, 37) * vnoise(u, v, 48, 41);
    const med = fbm(u, v, 12, 3, 53);
    data[o] = Math.round(fine * 255);
    data[o + 1] = Math.round(Math.min(1, Math.max(0, (broad - 0.25) * 2)) * 255);
    data[o + 2] = Math.round(Math.min(1, Math.max(0, (sp - 0.42) * 4.5)) * 255);
    data[o + 3] = Math.round(med * 255);
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

const COMMON = /* glsl */ `
  uniform sampler2D uDetail;
  uniform sampler2D uRoadA;
  uniform sampler2D uRoadN;
  uniform float uGroundY;
  uniform vec2 uAxis;
  uniform float uTime;
  varying vec3 vWp;
  varying vec3 vWn;
  float kHash(vec2 q) { q = fract(q * vec2(123.34, 456.21)); q += dot(q, q + 45.32); return fract(q.x * q.y); }
  vec4 kTex(vec2 uv) { return texture2D(uDetail, uv); }
  // Triplanar sample of the detail texture (no UVs needed, no stretching on any face).
  vec4 kTri(vec3 p, vec3 n, float s) {
    #ifdef K_LOW
      return abs(n.y) > 0.6 ? kTex(p.xz * s) : (abs(n.x) > abs(n.z) ? kTex(p.zy * s) : kTex(p.xy * s));
    #else
      vec3 w = abs(n); w *= w; w *= w; w /= (w.x + w.y + w.z);
      return kTex(p.zy * s) * w.x + kTex(p.xz * s) * w.y + kTex(p.xy * s) * w.z;
    #endif
  }
  // Coordinate running horizontally along a wall (or along the street on a floor).
  float kAlong(vec3 p, vec3 n) { return abs(n.y) > 0.7 ? dot(p.xz, uAxis) : dot(p.xz, normalize(vec2(-n.z, n.x) + 1e-5)); }
  // 1 while a periodic pattern (coordinate in periods) is resolvable, 0 once a period is smaller than ~2 pixels.
  float kAA(float c) { return clamp(1.7 - fwidth(c) * 3.2, 0.0, 1.0); }
  vec3 kBump(vec3 N, vec3 vp, float h, float fd) {
    vec3 sx = dFdx(vp), sy = dFdy(vp);
    vec3 r1 = cross(sy, N), r2 = cross(N, sx);
    float det = dot(sx, r1) * fd;
    vec3 g = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
    return normalize(abs(det) * N - g);
  }
`;

/**
 * Surface functions. In scope: p (world position), n (world normal), dist, fade (1 near .. 0 at
 * ~55 m; removes sub-pixel detail that would only shimmer). They modify kAlb, kRough, kMetal and
 * kH (height in metres, bumped into the shading normal).
 */
const SURFACE: Record<string, string> = {
  // Aged painted lime plaster: broad mottling, rain streaks down walls, rising damp at the foot.
  plaster: /* glsl */ `
    vec4 a = kTri(p, n, 2.3), b = kTri(p, n, 0.21);
    float wallF = step(abs(n.y), 0.5);
    float streak = kTex(vec2(kAlong(p, n) * 0.83, p.y * 0.045)).a;
    float damp = smoothstep(1.5, 0.0, p.y - uGroundY) * wallF;
    kAlb *= 0.9 + 0.16 * b.g;
    float worn = smoothstep(0.25, 0.8, kTri(p, n, 0.057).g);
    kAlb *= 1.0 - wallF * 0.42 * smoothstep(0.5, 0.78, streak) * (0.15 + 0.85 * b.a) * worn;
    kAlb = mix(kAlb, kAlb * vec3(0.8, 0.79, 0.72), worn * 0.35 * b.a);
    kAlb *= 1.0 - wallF * 0.25 * smoothstep(0.55, 0.0, fract((p.y - uGroundY) / 3.15 + 0.02) ) * smoothstep(0.4, 0.9, kTex(vec2(kAlong(p, n) * 0.31, 0.3)).a) * step(3.5, p.y - uGroundY);
    kAlb = mix(kAlb, kAlb * vec3(0.62, 0.64, 0.6), damp * (0.25 + 0.5 * b.g));
    kAlb *= 0.96 + 0.08 * a.r;
    kRough = 0.9 - 0.12 * b.g;
    kH = (a.r * 0.003 + b.a * 0.006) * fade;`,
  concrete: /* glsl */ `
    vec4 a = kTri(p, n, 1.9), b = kTri(p, n, 0.17);
    kAlb *= (0.84 + 0.26 * b.g) * (1.0 - 0.3 * a.b) * (0.95 + 0.1 * a.r);
    float damp = smoothstep(0.5, 0.0, p.y - uGroundY) * step(abs(n.y), 0.5);
    kAlb *= 1.0 - 0.3 * damp;
    kRough = 0.93;
    kH = (a.r * 0.004 - a.b * 0.004) * fade;`,
  // Unglazed terracotta pan-and-roll tiles laid in courses down the slope.
  tile: /* glsl */ `
    float slope = length(n.xz);
    vec2 t = slope > 0.05 ? normalize(vec2(-n.z, n.x)) : uAxis;
    float u = dot(p.xz, t) / 0.23, s = p.y / max(slope, 0.25) / 0.33;
    float roll = abs(sin(u * 3.14159265)), course = fract(s);
    float id = kHash(floor(vec2(u, s)));
    vec4 b = kTex(p.xz * 0.11);
    float lap = smoothstep(0.0, 0.1, course);
    fade *= kAA(u) * kAA(s);
    kAlb *= mix(0.86, (0.78 + 0.34 * id) * mix(0.5, 1.0, lap) * mix(0.62, 1.0, smoothstep(0.0, 0.5, roll)), fade);
    kAlb *= 0.82 + 0.3 * b.g;
    kAlb = mix(kAlb, kAlb * vec3(0.5, 0.55, 0.45), smoothstep(0.55, 0.9, b.a) * 0.5);
    kRough = 0.86 - 0.1 * id;
    kH = (roll * 0.03 + (1.0 - course) * 0.014) * fade;`,
  // Glazed ceramic tube tiles of a Chinese temple roof: same lay, glossy.
  glazed: /* glsl */ `
    float slope = length(n.xz);
    vec2 t = slope > 0.05 ? normalize(vec2(-n.z, n.x)) : uAxis;
    float u = dot(p.xz, t) / 0.2, s = p.y / max(slope, 0.25) / 0.3;
    float roll = abs(sin(u * 3.14159265)), course = fract(s);
    float id = kHash(floor(vec2(u, s)));
    float lap = smoothstep(0.0, 0.1, course);
    fade *= kAA(u) * kAA(s);
    kAlb *= mix(0.8, (0.86 + 0.22 * id) * mix(0.55, 1.0, lap) * mix(0.3, 1.0, smoothstep(0.0, 0.6, roll)), fade);
    kAlb *= 0.9 + 0.16 * kTex(p.xz * 0.13).g;
    kRough = mix(0.5, 0.2 + 0.12 * id, fade);
    kH = (roll * 0.04 + (1.0 - course) * 0.012) * fade;`,
  // Galvanised roller shutter: interlocking horizontal slats.
  shutter: /* glsl */ `
    float sc = p.y / 0.085, s = fract(sc);
    fade *= kAA(sc);
    float prof = smoothstep(0.0, 0.3, s) * (1.0 - smoothstep(0.82, 1.0, s));
    vec4 a = kTri(p, n, 1.3);
    kAlb *= mix(0.85, mix(0.5, 1.0, prof), fade) * (0.88 + 0.2 * a.g);
    kAlb = mix(kAlb, kAlb * vec3(0.75, 0.62, 0.5), a.b * 0.5);
    kRough = 0.5 + 0.25 * a.g; kMetal = 0.55;
    kH = prof * 0.012 * fade;`,
  // Timber louvred window shutters: downward-sloping blades.
  louvre: /* glsl */ `
    float sc = p.y / 0.055, s = fract(sc);
    fade *= kAA(sc);
    vec4 a = kTri(p, n, 2.1);
    kAlb *= mix(0.78, mix(0.38, 1.05, smoothstep(0.0, 0.55, s)), fade) * (0.85 + 0.25 * a.g);
    kRough = 0.62;
    kH = s * 0.014 * fade;`,
  // Sawn timber boards with grain along the board.
  timber: /* glsl */ `
    float u = kAlong(p, n);
    float bd = u / 0.16, f = fract(bd);
    float joint = mix(1.0, smoothstep(0.0, 0.05, min(f, 1.0 - f)), kAA(bd));
    float grain = kTex(vec2(u * 5.0 + kHash(vec2(floor(bd), 3.0)) * 7.0, p.y * 0.35)).r;
    kAlb *= mix(0.45, 1.0, joint) * (0.78 + 0.4 * grain) * (0.9 + 0.2 * kHash(vec2(floor(bd), 1.0)));
    kRough = 0.72;
    kH = (joint * 0.004 + grain * 0.002) * fade;`,
  // Gloss-painted metal and joinery.
  paint: /* glsl */ `
    vec4 a = kTri(p, n, 1.7);
    kAlb *= 0.9 + 0.16 * a.g;
    kRough = 0.42 + 0.2 * a.g;
    kH = a.r * 0.0012 * fade;`,
  // Worn asphalt: aggregate, polished wheel paths, patches and cracks.
  asphalt: /* glsl */ `
    vec4 a = kTex(p.xz * 1.7), b = kTex(p.xz * 0.09), c = kTex(p.xz * 6.1);
    float patchy = smoothstep(0.3, 0.8, b.g);
    float crack = smoothstep(0.012, 0.0, abs(kTex(p.xz * 0.31 + 0.37).a - 0.5)) * smoothstep(0.55, 0.75, b.a) * fade;
    kAlb *= mix(0.66, 1.2, patchy) * (0.86 + 0.28 * a.a);
    kAlb = mix(kAlb, kAlb * 1.9 + 0.012, c.b * 0.55 * fade);
    kAlb *= 1.0 - 0.35 * crack;
    kRough = mix(0.96, 0.8, patchy) - 0.1 * a.g;
    kH = (a.r * 0.004 + c.r * 0.0025 - crack * 0.003) * fade;`,
  // Ceramic / cement floor tiles on a grid aligned with the street.
  paving: /* glsl */ `
    vec2 q = vec2(dot(p.xz, uAxis), dot(p.xz, vec2(-uAxis.y, uAxis.x))) / K_TILE;
    vec2 f = fract(q), id = floor(q);
    float e = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
    float aa = kAA(q.x) * kAA(q.y);
    float joint = mix(0.93, smoothstep(0.0, 0.035, e), aa), tv = mix(0.5, kHash(id), aa);
    vec4 a = kTex(p.xz * 2.3), b = kTex(p.xz * 0.19);
    kAlb *= mix(0.5, 1.0, joint) * (0.88 + 0.22 * tv) * (0.86 + 0.22 * b.g);
    kRough = mix(0.9, K_GLOSS + 0.25 * tv + 0.2 * b.g, joint);
    kH = (joint * 0.003 + a.r * 0.0008) * fade;`,
  // Granite slabs and carved stone.
  stone: /* glsl */ `
    vec4 a = kTri(p, n, 3.1), b = kTri(p, n, 0.23);
    float joint = 1.0;
    if (n.y > 0.7) {
      vec2 q = vec2(dot(p.xz, uAxis), dot(p.xz, vec2(-uAxis.y, uAxis.x))) / vec2(0.9, 0.6);
      q.x += 0.5 * floor(q.y);
      vec2 f = fract(q);
      float aa = kAA(q.x) * kAA(q.y);
      joint = mix(0.95, smoothstep(0.0, 0.025, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y))), aa);
      kAlb *= mix(1.0, 0.9 + 0.2 * kHash(floor(q)), aa);
    }
    kAlb *= mix(0.55, 1.0, joint) * (0.8 + 0.3 * b.g) * (0.9 + 0.3 * a.b) * (0.94 + 0.12 * a.r);
    kRough = 0.78 + 0.15 * b.g;
    kH = (joint * 0.005 + a.r * 0.003) * fade;`,
  // Corrugated galvanised sheet with rust.
  zinc: /* glsl */ `
    float slope = length(n.xz);
    vec2 t = slope > 0.05 ? normalize(vec2(-n.z, n.x)) : uAxis;
    float u = dot(p.xz, t) / 0.076;
    vec4 b = kTex(vec2(dot(p.xz, t) * 0.45, p.y * 0.12 + dot(p.xz, vec2(t.y, -t.x)) * 0.05));
    float rust = smoothstep(0.62, 0.9, b.a) * (0.4 + 0.6 * b.g);
    kAlb = mix(kAlb, vec3(0.2, 0.09, 0.05), rust * 0.6);
    kAlb *= 0.88 + 0.2 * kTex(p.xz * 0.37).g;
    fade *= kAA(u);
    kAlb *= mix(0.88, 0.7 + 0.3 * abs(sin(u * 3.14159265)), fade);
    kRough = mix(0.42, 0.9, rust); kMetal = mix(0.75, 0.1, rust);
    kH = sin(u * 6.2831853) * 0.009 * fade;`,
  // Woven canvas / bamboo blinds.
  fabric: /* glsl */ `
    float sc = p.y / 0.022, s = fract(sc);
    fade *= kAA(sc);
    vec4 b = kTri(p, n, 0.4);
    kAlb *= (0.85 + 0.2 * b.g) * mix(0.9, 0.8 + 0.2 * smoothstep(0.0, 0.5, s), fade);
    kRough = 0.95;
    kH = s * 0.002 * fade;`,
  foliage: /* glsl */ `
    vec4 a = kTri(p, n, 1.9);
    kAlb *= 0.6 + 0.8 * a.a;
    kAlb = mix(kAlb, kAlb * vec3(1.25, 1.2, 0.7), a.b);
    kRough = 0.7;`,
  // Translucent polycarbonate roofing sheet.
  poly: /* glsl */ `
    float u = dot(p.xz, uAxis) / 0.076;
    fade *= kAA(u);
    kAlb *= 0.92 + 0.08 * sin(u * 6.2831853) * fade;
    kRough = 0.35;
    kH = sin(u * 6.2831853) * 0.004 * fade;`,
  gold: /* glsl */ `
    vec4 a = kTri(p, n, 2.9);
    kAlb *= 0.85 + 0.3 * a.g;
    kRough = 0.32 + 0.25 * a.g; kMetal = 0.85;`,
  // Automotive paint: smooth clear-coated surface (no grain bump), a light film of road dust low down.
  carpaint: /* glsl */ `
    vec4 b = kTri(p, n, 0.45);
    kAlb *= 0.96 + 0.07 * b.g;
    kRough = 0.2 + 0.1 * b.g; kMetal = 0.32;`,
  // Window and vehicle glass: near-neutral mirror whose tint does not colour the reflection; old panes are
  // slightly uneven and dusty, so reflections break up from pane to pane instead of reading as flat paint.
  glass: /* glsl */ `
    float sat = max(kAlb.r, max(kAlb.g, kAlb.b)) - min(kAlb.r, min(kAlb.g, kAlb.b));
    float tint = step(sat, 0.16);
    vec4 b = kTri(p, n, 0.55);
    float lum = dot(kAlb, vec3(0.333));
    kAlb = mix(kAlb, vec3(0.05, 0.054, 0.058) + min(lum * 3.0, 0.2), tint * 0.85); // dark tinted car glass reflects less than a window pane
    kAlb *= 0.85 + 0.3 * b.g;
    kRough = 0.05 + 0.1 * b.a * tint; kMetal = 0.6;
    kH = b.g * 0.0035 * tint * fade;`,
  // --- V7.2 photographic road set (CC0, see docs/ASSETS.md). RGB = albedo (sRGB), A = roughness; second texture = GL normal. ---
  // The albedo is divided by its own mean, so the photo supplies texture and the vertex colour still supplies the hue.
  // Poly Haven asphalt_03: the scan is 2.05 m wide and is laid at that size on the ground plane.
  asphaltPhoto: /* glsl */ `
    vec2 uv = p.xz / 2.05;
    vec4 t = texture2D(uRoadA, uv);
    vec4 b = kTex(p.xz * 0.09);
    kAlb *= t.rgb / vec3(0.0842, 0.0571, 0.0402);
    kAlb *= mix(0.9, 1.08, smoothstep(0.3, 0.8, b.g)); // broad tone drift hides the 2 m repeat
    kRough = t.a;
    #ifndef K_LOW
      vec3 m = texture2D(uRoadN, uv).xyz * 2.0 - 1.0;
      vec3 tn = normalize(vec3(1.0, 0.0, 0.0) - n * n.x);
      kNw = normalize(tn * m.x + cross(tn, n) * m.y + n * m.z);
    #endif`,
  none: '',
};

export interface KuchingMaterials {
  byName: Record<MaterialName, THREE.Material>;
  /** Shared uniforms (ground level, street axis, time, detail texture). */
  uniforms: { uDetail: { value: THREE.Texture }; uGroundY: { value: number }; uAxis: { value: THREE.Vector2 }; uTime: { value: number };
    /** V7.2 photographic road set, null until the Jalan China section loads it. */
    uRoadA: { value: THREE.Texture | null }; uRoadN: { value: THREE.Texture | null } };
  dispose(): void;
}

interface Spec {
  surface: keyof typeof SURFACE;
  rough?: number; metal?: number; env?: number;
  defines?: Record<string, string>;
  double?: boolean; transparent?: number; glow?: number; sway?: boolean; map?: THREE.Texture | null; shadowSide?: THREE.Side;
  /**
   * N1-M6, what the surface does at night: 'window' glass lit from inside (in patches along the street), 'sign' a board
   * lit in its own colours, 'lamp' a `glow` that gets stronger, 'daylight' a `glow` that stands for light coming
   * through (the polycarbonate roofs) and goes out with the day.
   */
  night?: 'window' | 'sign' | 'lamp' | 'daylight';
  /** Rain makes it dark and glossy (roads and floors). */
  wet?: boolean;
}

/**
 * The street at night: lanterns, shop lights and lamps are not light sources here, so everything near street level
 * gets a warm wash of its own colour, fading out about two storeys up.
 */
const STREET_WASH = 'totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.76, 0.48) * (uNight * 0.17 * smoothstep(uGroundY + 9.0, uGroundY + 0.5, vWp.y));';
/** A wet road or floor mirrors the sky at a grazing angle (as the roads of the rest of the city do). */
const WET_SHEEN = 'if (uWet > 0.003 && vWn.y > 0.6) totalEmissiveRadiance += uSkyRefl * (uWet * (0.03 + 0.5 * pow(1.0 - max(normalize(cameraPosition - vWp).y, 0.0), 5.0)));';

const NIGHT = {
  // (upper floors only: the same glass material glazes the parked cars)
  window: 'totalEmissiveRadiance += vec3(1.0, 0.72, 0.4) * (uNight * 0.9 * step(uGroundY + 3.0, vWp.y) * smoothstep(0.42, 0.56, kTex(vec2(dot(vWp.xz, vec2(0.031, 0.027)), floor(vWp.y / 3.2) * 0.37)).r));',
  sign: 'totalEmissiveRadiance += diffuseColor.rgb * (uNight * 0.75);',
  lamp: '',
  daylight: '',
};

/** Sky irradiance comes from the hemisphere light shared with the rest of the world; the environment map adds specular only. */
const LIGHTS_MAPS = THREE.ShaderChunk.lights_fragment_maps.replace('iblIrradiance += getIBLIrradiance( geometryNormal );', '');

/** Soft dark patch under a parked car (ambient occlusion the shadow map and screen-space AO are too coarse to give). */
function contactMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec2 vUv; void main() { vec2 e = smoothstep(vec2(0.0), vec2(0.22, 0.34), vUv) * smoothstep(vec2(1.0), vec2(0.78, 0.66), vUv); gl_FragColor = vec4(0.0, 0.0, 0.0, 0.8 * e.x * e.y); }',
  });
}

function make(spec: Spec, uniforms: KuchingMaterials['uniforms'], low: boolean, key: string): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: spec.rough ?? 0.8, metalness: spec.metal ?? 0, envMapIntensity: spec.env ?? 1,
    side: spec.double ? THREE.DoubleSide : THREE.FrontSide, map: spec.map ?? null,
  });
  if (spec.transparent !== undefined) { m.transparent = true; m.opacity = spec.transparent; m.depthWrite = false; }
  // Kit geometry is open shells (single-sided roofs, walls): both faces must write to the shadow map.
  m.shadowSide = spec.shadowSide ?? THREE.DoubleSide;
  const defs = Object.entries({ ...(spec.defines ?? {}), ...(low ? { K_LOW: '1' } : {}) }).map(([k, v]) => `#define ${k} ${v}`).join('\n');
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms, ENV);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWp;\nvarying vec3 vWn;\nuniform float uTime;`)
      .replace('#include <begin_vertex>', spec.sway
        ? `#include <begin_vertex>\n{ vec3 wp0 = (modelMatrix * vec4(transformed, 1.0)).xyz; float k = clamp(transformed.y * 0.6, 0.0, 1.0);\n transformed.x += sin(uTime * 1.3 + wp0.x * 0.9 + wp0.z * 1.7) * 0.035 * k; transformed.z += sin(uTime * 1.7 + wp0.z * 1.1) * 0.025 * k; }`
        : '#include <begin_vertex>')
      .replace('#include <project_vertex>', `#include <project_vertex>
        { vec4 wp4 = vec4(transformed, 1.0); vec3 wn3 = objectNormal;
        #ifdef USE_INSTANCING
          wp4 = instanceMatrix * wp4; wn3 = mat3(instanceMatrix) * wn3;
        #endif
        vWp = (modelMatrix * wp4).xyz; vWn = normalize(mat3(modelMatrix) * wn3); }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${defs}\n${COMMON}${ENV_PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 kAlb = diffuseColor.rgb; float kRough = roughness; float kMetal = metalness; float kH = 0.0; vec3 kNw = vec3(0.0);
        { vec3 p = vWp; vec3 n = normalize(vWn); float dist = length(cameraPosition - p); float fade = clamp(1.3 - dist / 42.0, 0.0, 1.0);
        ${SURFACE[spec.surface]}
        ${spec.wet ? 'if (uWet > 0.003 && n.y > 0.6) { kAlb *= mix(1.0, 0.62, uWet); kRough = mix(kRough, 0.1, uWet * 0.85); }' : ''}
        }
        diffuseColor.rgb = kAlb;`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp(kRough, 0.045, 1.0);')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = clamp(kMetal, 0.0, 1.0);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n#ifndef K_LOW\n if (dot(kNw, kNw) > 0.0) normal = normalize(mat3(viewMatrix) * kNw);\n if (kH != 0.0) normal = kBump(normal, -vViewPosition, kH, faceDirection);\n#endif')
      .replace('#include <lights_fragment_maps>', LIGHTS_MAPS)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${
        spec.glow ? `totalEmissiveRadiance += diffuseColor.rgb * (${spec.glow.toFixed(3)} * ${spec.night === 'lamp' ? '(1.0 + 1.6 * uNight)' : spec.night === 'daylight' ? '(1.0 - 0.92 * uNight)' : '1.0'});` : ''
      }\n${spec.night ? NIGHT[spec.night] : ''}\n${spec.transparent === undefined ? STREET_WASH : ''}\n${spec.wet ? WET_SHEEN : ''}`);
  };
  m.customProgramCacheKey = () => `k5-${key}-${low ? 'l' : 'h'}`;
  return m;
}

export function createMaterials(opts: { low?: boolean; atlas?: THREE.Texture | null; sign?: THREE.Texture | null } = {}): KuchingMaterials {
  const low = !!opts.low;
  const uniforms = {
    uDetail: { value: detailTexture(low ? 128 : 256) as THREE.Texture },
    uGroundY: { value: 7.7 },
    uAxis: { value: new THREE.Vector2(0.866, 0.5) },
    uTime: { value: 0 },
    uRoadA: { value: null as THREE.Texture | null }, uRoadN: { value: null as THREE.Texture | null },
  };
  const specs: Record<MaterialName, Spec> = {
    plaster: { surface: 'plaster', env: 0.5 },
    concrete: { surface: 'concrete', env: 0.4 },
    tile: { surface: 'tile', env: 0.5 },
    glazed: { surface: 'glazed', env: 1.0 },
    shutter: { surface: 'shutter', env: 0.9 },
    louvre: { surface: 'louvre', env: 0.5, double: true },
    timber: { surface: 'timber', env: 0.4, double: true },
    paint: { surface: 'paint', env: 0.8, double: true },
    asphalt: { surface: 'asphalt', env: 0.6, wet: true },
    paving: { surface: 'paving', env: 0.8, defines: { K_TILE: '0.3', K_GLOSS: '0.34' }, wet: true },
    stone: { surface: 'stone', env: 0.5, wet: true },
    zinc: { surface: 'zinc', env: 1.0, double: true },
    glass: { surface: 'glass', rough: 0.07, metal: 0.6, env: 1.35, double: true, night: 'window' },
    fabric: { surface: 'fabric', env: 0.2, double: true },
    foliage: { surface: 'foliage', env: 0.3, double: true, sway: true },
    glow: { surface: 'none', rough: 0.6, env: 0.3, glow: 0.95, double: true, night: 'lamp' },
    gold: { surface: 'gold', env: 1.2 },
    atlas: { surface: 'none', rough: 0.62, env: 0.5, map: opts.atlas ?? null, double: true },
    sign: { surface: 'none', rough: 0.55, env: 0.6, map: opts.sign ?? null, double: true, night: 'sign' },
    poly: { surface: 'poly', env: 1.0, double: true, transparent: 0.62, glow: 0.5, night: 'daylight' },
    wire: { surface: 'none', rough: 0.7, env: 0.2 },
    carpaint: { surface: 'carpaint', env: 1.2 },
    contact: { surface: 'none' },
    asphaltPhoto: { surface: 'asphaltPhoto', env: 0.6, wet: true },
    // Clear glass of display cases (V7.4): see-through, with a faint reflection.
    pane: { surface: 'none', rough: 0.05, env: 0.4, double: true, transparent: 0.2 },
  };
  const byName = {} as Record<MaterialName, THREE.Material>;
  for (const n of MATERIAL_NAMES) byName[n] = n === 'contact' ? contactMaterial() : make(specs[n], uniforms, low, n);
  return {
    byName, uniforms,
    dispose() { for (const n of MATERIAL_NAMES) byName[n].dispose(); uniforms.uDetail.value.dispose(); uniforms.uRoadA.value?.dispose(); uniforms.uRoadN.value?.dispose(); },
  };
}
