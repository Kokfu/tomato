import * as THREE from 'three';
import { facadeAtlas } from './arch/FacadeAtlas.ts';

/** Growable buffers for building merged geometry. */
export class GeoBuf {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  uv: number[] = [];
  idx: number[] = [];
  private useUv: boolean;

  constructor(useUv = false) {
    this.useUv = useUv;
  }

  get count(): number {
    return this.pos.length / 3;
  }

  vert(x: number, y: number, z: number, nx: number, ny: number, nz: number, c: THREE.Color, u = 0, v = 0): number {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.col.push(c.r, c.g, c.b);
    if (this.useUv) this.uv.push(u, v);
    return this.pos.length / 3 - 1;
  }

  tri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }

  /** Add a triangle, flipping it if needed so that it faces +Y. */
  triUp(a: number, b: number, c: number): void {
    const p = this.pos;
    const cr = (p[b * 3 + 2] - p[a * 3 + 2]) * (p[c * 3] - p[a * 3]) - (p[b * 3] - p[a * 3]) * (p[c * 3 + 2] - p[a * 3 + 2]);
    if (cr >= 0) this.idx.push(a, b, c);
    else this.idx.push(a, c, b);
  }

  build(): THREE.BufferGeometry | null {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.useUv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

function facadeTexture(): THREE.CanvasTexture {
  // One bay x one storey. Multiplied by the per-building vertex colour, so the wall stays white.
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, S, S);
  // faint floor line
  g.fillStyle = '#e4e4e2';
  g.fillRect(0, S - 5, S, 5);
  // window: frame, glass with sky tint, mullions, sill
  g.fillStyle = '#b9bcbf';
  g.fillRect(38, 30, 52, 62);
  const grad = g.createLinearGradient(0, 33, 0, 89);
  grad.addColorStop(0, '#8fa9bd');
  grad.addColorStop(1, '#566b7c');
  g.fillStyle = grad;
  g.fillRect(41, 33, 46, 56);
  g.fillStyle = '#c7cacd';
  g.fillRect(63, 33, 2, 56);
  g.fillRect(41, 58, 46, 2);
  g.fillStyle = '#eceae6';
  g.fillRect(34, 92, 60, 4);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const WATER_VERT = /* glsl */ `
  varying vec3 vWorld;
  #include <fog_pars_vertex>
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const WATER_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uDeep;
  uniform vec3 uSky;
  uniform vec3 uSunDir;
  uniform vec3 uSunCol;
  varying vec3 vWorld;
  #include <fog_pars_fragment>
  float h21(vec2 q) { q = fract(q * vec2(123.34, 456.21)); q += dot(q, q + 45.32); return fract(q.x * q.y); }
  float vnoise(vec2 q) { vec2 i = floor(q), f = fract(q); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + 1.0), f.x), f.y); }
  void main() {
    vec2 p = vWorld.xz;
    // Analytic normal from a few travelling sine waves (river flows roughly east).
    vec2 g = vec2(0.0);
    g += vec2(0.8, 0.6) * cos(dot(p, vec2(0.8, 0.6)) * 0.55 + uTime * 0.9) * 0.06;
    g += vec2(-0.5, 0.86) * cos(dot(p, vec2(-0.5, 0.86)) * 1.3 + uTime * 1.4) * 0.05;
    g += vec2(0.95, -0.3) * cos(dot(p, vec2(0.95, -0.3)) * 2.7 + uTime * 2.1) * 0.035;
    g += vec2(0.2, 0.98) * cos(dot(p, vec2(0.2, 0.98)) * 5.1 + uTime * 2.8) * 0.02;
    // Fade the ripples with distance: sub-pixel waves alias into moire patterns otherwise.
    float dist = length(cameraPosition - vWorld);
    g *= 1.0 / (1.0 + dist * dist * 0.0004);
    g += (vec2(vnoise(p * 0.07 + uTime * 0.03), vnoise(p.yx * 0.06 - uTime * 0.02)) - 0.5) * 0.05;
    vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
    vec3 v = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    vec3 col = mix(uDeep, uSky, clamp(0.12 + fres * 0.85, 0.0, 1.0));
    vec3 h = normalize(v + uSunDir);
    col += uSunCol * pow(max(dot(n, h), 0.0), 220.0) * 0.55;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

const NOISE_GLSL = /* glsl */ `
  varying vec3 vWp;
  varying vec3 vWn;
  float k3h(vec2 q) { q = fract(q * vec2(123.34, 456.21)); q += dot(q, q + 45.32); return fract(q.x * q.y); }
  float k3n(vec2 q) { vec2 i = floor(q), f = fract(q); f = f * f * (3.0 - 2.0 * f); return mix(mix(k3h(i), k3h(i + vec2(1, 0)), f.x), mix(k3h(i + vec2(0, 1)), k3h(i + 1.0), f.x), f.y); }
`;

/**
 * Procedural surface detail, evaluated in world space so it needs no UVs or texture downloads.
 * Each snippet modulates `col` (the diffuse colour) given world position p, world normal n and a
 * 0..1 `fade` that removes the fine detail in the distance, where it would only alias.
 */
const DETAIL = {
  asphalt: /* glsl */ `
    float a = k3n(p.xz * 11.0) * 0.55 + k3n(p.xz * 2.1) * 0.45;
    col *= mix(1.0, 0.8 + 0.34 * a, fade);
    col *= 0.9 + 0.2 * k3n(p.xz * 0.11);`,
  paving: /* glsl */ `
    vec2 q = p.xz / 0.6;
    vec2 f = fract(q);
    float joint = step(0.05, f.x) * step(0.05, f.y);
    col *= mix(1.0, (0.8 + 0.2 * joint) * (0.9 + 0.18 * k3h(floor(q))), fade);
    col *= 0.92 + 0.14 * k3n(p.xz * 0.35);`,
  plaster: /* glsl */ `
    float grime = k3n(vec2(dot(p.xz, vec2(0.71, 0.71)) * 1.4, p.y * 0.3));
    col *= 0.86 + 0.18 * grime;
    col *= mix(1.0, 0.95 + 0.1 * k3n(vec2(dot(p.xz, vec2(0.71, -0.71)), p.y) * 9.0), fade);`,
  roof: /* glsl */ `
    float slope = length(n.xz);
    if (slope > 0.2) {
      // Clay-tile courses running along the slope, with staggered joints.
      float s = p.y / max(slope, 0.25) / 0.34;
      vec2 t = normalize(vec2(-n.z, n.x));
      float u = dot(p.xz, t) / 0.26 + 0.5 * floor(s);
      float course = smoothstep(0.0, 0.3, fract(s));
      float jointU = smoothstep(0.0, 0.12, abs(fract(u) - 0.5) * 2.0);
      col *= mix(1.0, (0.72 + 0.28 * course) * (0.86 + 0.14 * jointU) * (0.88 + 0.24 * k3h(floor(vec2(u, s)))), fade);
      col *= 0.85 + 0.25 * k3n(p.xz * 0.5);
    } else {
      col *= 0.82 + 0.24 * k3n(p.xz * 0.45);
      col *= mix(1.0, 0.94 + 0.12 * k3n(p.xz * 6.0), fade);
    }`,
  ground: /* glsl */ `
    float green = smoothstep(0.02, 0.1, col.g - max(col.r, col.b));
    float turf = k3n(p.xz * 3.0) * 0.5 + k3n(p.xz * 17.0) * 0.5;
    vec2 q = p.xz / 1.2;
    vec2 f = fract(q);
    float joint = step(0.025, f.x) * step(0.025, f.y);
    float paved = (0.88 + 0.12 * joint) * (0.93 + 0.12 * k3h(floor(q)));
    col *= mix(1.0, mix(paved, 0.72 + 0.5 * turf, green), fade);
    col *= 0.9 + 0.18 * k3n(p.xz * 0.09);`,
  concrete: /* glsl */ `
    col *= 0.88 + 0.2 * k3n(p.xz * 0.9 + p.y * 1.7);`,
};

/** Add world-space procedural detail to a Lambert material. */
function withDetail<T extends THREE.Material>(mat: T, key: keyof typeof DETAIL): T {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWp;\nvarying vec3 vWn;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWn = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${NOISE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n{ vec3 p = vWp; vec3 n = normalize(vWn); vec3 col = diffuseColor.rgb; float fade = clamp(1.0 - length(cameraPosition - p) / 140.0, 0.0, 1.0);\n${DETAIL[key]}\ndiffuseColor.rgb = col; }`);
  };
  mat.customProgramCacheKey = () => `k3d-${key}`;
  return mat;
}

/** Shared materials: one instance per layer for the whole world keeps draw state changes low. */
export class Materials {
  readonly roads: THREE.MeshLambertMaterial[];
  readonly marks: THREE.MeshBasicMaterial;
  readonly wallsTextured: THREE.MeshLambertMaterial;
  readonly wallsPlain: THREE.MeshLambertMaterial;
  /** Shophouse rows: vertex colour x procedural facade atlas. */
  readonly arch: THREE.MeshLambertMaterial;
  readonly roofs: THREE.MeshLambertMaterial;
  readonly structure: THREE.MeshLambertMaterial;
  readonly trunk: THREE.MeshLambertMaterial;
  readonly crown: THREE.MeshLambertMaterial;
  readonly frond: THREE.MeshLambertMaterial;
  readonly water: THREE.ShaderMaterial;
  readonly landmark: THREE.MeshLambertMaterial;
  /** Street furniture (instanced, vertex colours). */
  readonly furniture: THREE.MeshLambertMaterial;
  /** Lamp heads: glow in the evening. */
  readonly lampGlow: THREE.MeshBasicMaterial;

  constructor(scene: THREE.Scene, sunDir: THREE.Vector3, smallTextures = false) {
    this.roads = [0, 1, 2, 3].map((g) =>
      withDetail(new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -(g + 1), polygonOffsetUnits: -(g + 1) * 4 }), g === 1 ? 'paving' : g === 0 ? 'concrete' : 'asphalt'),
    );
    this.marks = new THREE.MeshBasicMaterial({ color: 0xcfcfc6, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -24 });
    this.wallsTextured = withDetail(new THREE.MeshLambertMaterial({ vertexColors: true, map: facadeTexture() }), 'plaster');
    this.wallsPlain = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.arch = withDetail(new THREE.MeshLambertMaterial({ vertexColors: true, map: facadeAtlas(smallTextures ? 256 : 512), side: THREE.DoubleSide }), 'plaster');
    this.roofs = withDetail(new THREE.MeshLambertMaterial({ vertexColors: true }), 'roof');
    this.structure = withDetail(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), 'concrete');
    this.landmark = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.trunk = new THREE.MeshLambertMaterial({ color: 0x6b4f3a });
    this.crown = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
    this.frond = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide });
    this.furniture = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.lampGlow = new THREE.MeshBasicMaterial({ color: 0x9a9a96, vertexColors: true, side: THREE.DoubleSide });
    this.water = new THREE.ShaderMaterial({
      vertexShader: WATER_VERT,
      fragmentShader: WATER_FRAG,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        { uTime: { value: 0 }, uDeep: { value: new THREE.Color(0x4e5d49) }, uSky: { value: new THREE.Color(0xa9c4d6) }, uSunDir: { value: sunDir.clone() }, uSunCol: { value: new THREE.Color(1, 0.93, 0.8) } },
      ]),
      fog: true,
    });
    void scene;
  }

  /** Terrain material (one per chunk because each chunk owns its land-use texture). */
  terrain(map: THREE.Texture): THREE.MeshLambertMaterial {
    return withDetail(new THREE.MeshLambertMaterial({ map, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 }), 'ground');
  }

  update(time: number): void {
    this.water.uniforms.uTime.value = time;
  }
}
