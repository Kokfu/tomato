import * as THREE from 'three';
import { facadeAtlas } from './arch/FacadeAtlas.ts';
import { heritageAtlas } from './arch/HeritageAtlas.ts';
import { cityAtlas } from './arch/CityAtlas.ts';
import { flatGroundTextures, GROUND_MEAN } from './GroundTextures.ts';
import type { GroundTextures } from './GroundTextures.ts';

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

const WATER_VERT = /* glsl */ `
  attribute float bank;
  varying vec3 vWorld;
  varying float vBank;
  #include <fog_pars_vertex>
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vBank = bank;
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
  varying float vBank;
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
    // The Sarawak River carries silt: opaque tea-brown water with slow olive streaks, a weak sky reflection and a
    // broad, dull sun glint (docs/night/refs/STYLE_GUIDE.md, section 3).
    float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
    vec3 silt = mix(uDeep, uDeep * vec3(0.76, 0.92, 0.8), smoothstep(0.35, 0.7, vnoise(p * vec2(0.011, 0.03) + uTime * 0.004)));
    // Along the mapped bank (vBank: 1 at the shoreline, 0 three metres out): shallower, paler water and a lapping line.
    silt = mix(silt, uDeep * 1.3 + 0.02, vBank * 0.6);
    vec3 col = mix(silt, uSky, clamp(0.05 + fres * 0.6, 0.0, 1.0));
    vec3 h = normalize(v + uSunDir);
    col += uSunCol * pow(max(dot(n, h), 0.0), 90.0) * 0.22;
    float lap = smoothstep(0.62, 0.98, vBank + 0.14 * sin(uTime * 0.8 + dot(p, vec2(0.23, 0.19))) + 0.3 * (vnoise(p * 0.8 + uTime * 0.12) - 0.5));
    col = mix(col, mix(uDeep, uSky, 0.6) * 1.25 + 0.06, lap * 0.5);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

const NOISE_GLSL = /* glsl */ `
  varying vec3 vWp;
  varying vec3 vWn;
  float k3h(vec2 q) { q = fract(q * vec2(123.34, 456.21)); q += dot(q, q + 45.32); return fract(q.x * q.y); }
  float k3n(vec2 q) { vec2 i = floor(q), f = fract(q); f = f * f * (3.0 - 2.0 * f); return mix(mix(k3h(i), k3h(i + vec2(1, 0)), f.x), mix(k3h(i + vec2(0, 1)), k3h(i + 1.0), f.x), f.y); }
  uniform sampler2D uGrass;
  uniform sampler2D uEarth;
  uniform sampler2D uConc;
  uniform sampler2D uAsphalt;
  // A ground photograph divided by its mean colour: 1.0 on average, so it gives a hue its texture without changing it.
  vec3 k3p(sampler2D t, vec2 uv, vec3 mean) { return min(texture2D(t, uv).rgb / mean, vec3(2.6)); }
`;
const v3 = (m: readonly number[]) => `vec3(${m.map((v) => v.toFixed(4)).join(', ')})`;
const GM = v3(GROUND_MEAN.grass), EM = v3(GROUND_MEAN.laterite), CM = v3(GROUND_MEAN.concrete), AM = v3(GROUND_MEAN.asphalt);

/**
 * Procedural surface detail, evaluated in world space so it needs no UVs or texture downloads.
 * Each snippet modulates `col` (the diffuse colour) given world position p, world normal n and a
 * 0..1 `fade` that removes the fine detail in the distance, where it would only alias.
 */
const DETAIL = {
  // The same asphalt photograph, at the same 2.05 m lay, as the road of the Jalan China section (src/v5/materials.ts
  // asphaltPhoto), so a road runs from the section into the rest of the city without a seam.
  asphalt: /* glsl */ `
    col *= k3p(uAsphalt, p.xz / 2.05, ${AM}) * mix(0.9, 1.08, smoothstep(0.3, 0.8, k3n(p.xz * 0.09)));
    col *= 1.0 - 0.1 * smoothstep(0.55, 0.85, k3n(p.xz * 0.023 + 9.0));`,
  paving: /* glsl */ `
    vec2 q = p.xz / 0.6;
    vec2 f = fract(q);
    float joint = step(0.05, f.x) * step(0.05, f.y);
    col *= mix(1.0, (0.8 + 0.2 * joint) * (0.9 + 0.18 * k3h(floor(q))), fade);
    col *= mix(vec3(1.0), k3p(uConc, p.xz / 3.0, ${CM}), 0.8) * (0.92 + 0.14 * k3n(p.xz * 0.35));`,
  plaster: /* glsl */ `
    float grime = k3n(vec2(dot(p.xz, vec2(0.71, 0.71)) * 1.4, p.y * 0.3));
    col *= 0.9 + 0.12 * grime;
    col *= mix(1.0, 0.95 + 0.1 * k3n(vec2(dot(p.xz, vec2(0.71, -0.71)), p.y) * 9.0), fade);`,
  roof: /* glsl */ `
    float slope = length(n.xz);
    if (vRoof.x > 0.5) {
      // Corrugated zinc sheet: ribs running down the slope, sheet laps, and rust spreading from the laps (vRoof.y).
      vec2 t = slope > 0.05 ? normalize(vec2(-n.z, n.x)) : vec2(1.0, 0.0);
      float u = dot(p.xz, t) / 0.2, s = (slope > 0.05 ? p.y / slope : dot(p.xz, vec2(-t.y, t.x))) / 2.4;
      col *= mix(1.0, 0.8 + 0.2 * (0.5 + 0.5 * cos(u * 6.2832)), fade);
      col *= (0.9 + 0.16 * k3h(floor(vec2(u / 4.0, s)))) * (1.0 - 0.22 * smoothstep(0.86, 1.0, fract(s)) * fade);
      float rust = smoothstep(0.78 - 0.5 * vRoof.y, 0.98 - 0.5 * vRoof.y, k3n(p.xz * 0.33 + 3.0) * 0.7 + k3n(p.xz * 1.9) * 0.3);
      col = mix(col, vec3(0.3, 0.165, 0.1) * (0.75 + 0.5 * k3n(p.xz * 2.3)), rust * step(0.02, vRoof.y) * 0.8);
    } else if (slope > 0.2) {
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
  // The chunk's land-use map gives the hue only. Three surfaces are told apart by that hue and each gets its own
  // photograph: grass (green), bare earth and sand (warm), concrete and paving (grey). The map is a few texels per
  // metre at best, so the boundary between two surfaces is pushed about by noise and by the grass photograph itself:
  // grass creeps over the edge of a slab instead of ending on a ruled line.
  ground: /* glsl */ `
    float big = k3n(p.xz * 0.043), mid = k3n(p.xz * 0.37 + 5.0);
    vec3 gp = k3p(uGrass, p.xz / 2.9, ${GM}), ep = k3p(uEarth, p.xz / 3.3, ${EM}), cp = k3p(uConc, p.xz / 4.1, ${CM});
    #ifndef K3_LOW
      // a second, much larger lay of each photograph takes over with distance, so no tiling shows across a field
      float far = 0.7 * smoothstep(14.0, 60.0, dist);
      gp = mix(gp, k3p(uGrass, p.xz / 31.0, ${GM}), far);
      ep = mix(ep, k3p(uEarth, p.xz / 27.0, ${EM}), far);
      cp = mix(cp, k3p(uConc, p.xz / 37.0, ${CM}), far);
    #endif
    float gW = smoothstep(0.02, 0.085, col.g - max(col.r, col.b) + (mid - 0.5) * 0.06 + (dot(gp, vec3(0.3, 0.6, 0.1)) - 1.0) * 0.03);
    float eW = (1.0 - gW) * smoothstep(0.1, 0.19, col.r - col.b + (mid - 0.5) * 0.06);
    // worn patches where the red earth shows through the grass
    float bare = smoothstep(0.6, 0.78, k3n(p.xz * 0.1 + 31.0) * 0.72 + mid * 0.28);
    vec3 grass = mix(col * gp * (0.8 + 0.4 * big), vec3(0.2, 0.1, 0.052) * ep, bare * 0.55);
    vec3 hard = col * cp * (0.88 + 0.2 * big) * (1.0 - 0.16 * smoothstep(0.5, 0.8, k3n(p.xz * 0.21 + 17.0)));
    col = mix(mix(hard, col * ep, eW), grass, gW);`,
  foliage: /* glsl */ `
    float lf = k3n(p.xz * 1.7 + p.y * 2.3) * 0.6 + k3n(p.xz * 5.5 - p.y * 4.1) * 0.4;
    col *= 0.62 + 0.8 * lf;
    col = mix(col, col * vec3(1.15, 1.2, 0.8), smoothstep(0.55, 0.85, lf) * 0.5);`,
  concrete: /* glsl */ `
    col *= 0.88 + 0.2 * k3n(p.xz * 0.9 + p.y * 1.7);`,
};

/** The ground photographs as shader uniforms (shared by every material that uses one). */
type PhotoUniforms = Record<'uGrass' | 'uEarth' | 'uConc' | 'uAsphalt', { value: THREE.Texture }>;

/** Add world-space surface detail to a Lambert material. `low`: the cheaper variant of the Low preset. */
function detail<T extends THREE.Material>(mat: T, key: keyof typeof DETAIL, photos: PhotoUniforms, low = false): T {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, photos);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWp;\nvarying vec3 vWn;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        { vec4 k3w = vec4(transformed, 1.0); vec3 k3d = objectNormal;
        #ifdef USE_INSTANCING
          k3w = instanceMatrix * k3w; k3d = mat3(instanceMatrix) * k3d;
        #endif
        vWp = (modelMatrix * k3w).xyz; vWn = normalize(mat3(modelMatrix) * k3d); }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${low ? '#define K3_LOW 1\n' : ''}${NOISE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n{ vec3 p = vWp; vec3 n = normalize(vWn); vec3 col = diffuseColor.rgb; float dist = length(cameraPosition - p); float fade = clamp(1.0 - dist / 140.0, 0.0, 1.0);\n${DETAIL[key]}\ndiffuseColor.rgb = col; }`);
  };
  mat.customProgramCacheKey = () => `k3d-${key}${low ? '-l' : ''}`;
  return mat;
}

/** Run `more` on the shader after the material's own onBeforeCompile, under a cache key of its own. */
function patch<T extends THREE.Material>(mat: T, key: string, more: (shader: THREE.WebGLProgramParametersWithUniforms) => void): T {
  const first = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => { first.call(mat, shader, renderer); more(shader); };
  mat.customProgramCacheKey = () => key;
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
  /** District (high-fidelity) facades: vertex colour x heritage atlas. Created on first use. */
  private heritageMat: THREE.MeshLambertMaterial | null = null;
  private smallTextures: boolean;
  /** Ground photographs (CC0, docs/ASSETS.md) and the uniforms that hand them to the shaders. */
  readonly ground: GroundTextures;
  private photos: PhotoUniforms;
  readonly roofs: THREE.MeshLambertMaterial;
  readonly structure: THREE.MeshLambertMaterial;
  readonly trunk: THREE.MeshLambertMaterial;
  readonly crown: THREE.MeshLambertMaterial;
  readonly frond: THREE.MeshLambertMaterial;
  /** District tree canopies and shrubs: vertex colour with dappled leaf noise. */
  readonly foliage: THREE.MeshLambertMaterial;
  readonly water: THREE.ShaderMaterial;
  readonly landmark: THREE.MeshLambertMaterial;
  /** Street furniture (instanced, vertex colours). */
  readonly furniture: THREE.MeshLambertMaterial;
  /** Lamp heads: glow in the evening. */
  readonly lampGlow: THREE.MeshBasicMaterial;

  constructor(scene: THREE.Scene, sunDir: THREE.Vector3, smallTextures = false, ground: GroundTextures = flatGroundTextures()) {
    this.smallTextures = smallTextures;
    this.ground = ground;
    const photos = (this.photos = { uGrass: { value: ground.grass }, uEarth: { value: ground.laterite }, uConc: { value: ground.concrete }, uAsphalt: { value: ground.asphalt } });
    const withDetail = <T extends THREE.Material>(mat: T, key: keyof typeof DETAIL) => detail(mat, key, photos);
    this.roads = [0, 1, 2, 3].map((g) =>
      withDetail(new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -(g + 1), polygonOffsetUnits: -(g + 1) * 4 }), g === 1 ? 'paving' : g === 0 ? 'concrete' : 'asphalt'),
    );
    this.marks = new THREE.MeshBasicMaterial({ color: 0xcfcfc6, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -24 });
    // Typed buildings (arch/TypedBuilding.ts): the city atlas, whose alpha says where the building's own colour applies.
    this.wallsTextured = patch(withDetail(new THREE.MeshLambertMaterial({ vertexColors: true, map: cityAtlas(smallTextures) }), 'plaster'), 'k3d-citywalls', (shader) => {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <map_fragment>', 'vec4 k3t = texture2D(map, vMapUv); diffuseColor.rgb *= k3t.rgb;')
        .replace('#include <color_fragment>', 'diffuseColor.rgb *= mix(vec3(1.0), vColor, k3t.a);');
    });
    this.wallsPlain = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.arch = withDetail(new THREE.MeshLambertMaterial({ vertexColors: true, map: facadeAtlas(smallTextures ? 256 : 512), side: THREE.DoubleSide }), 'plaster');
    // Roofs carry their surface in uv (tile or zinc, and how rusty), not a texture coordinate.
    this.roofs = patch(withDetail(new THREE.MeshLambertMaterial({ vertexColors: true }), 'roof'), 'k3d-roofs', (shader) => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vRoof;').replace('#include <project_vertex>', '#include <project_vertex>\nvRoof = uv;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vRoof;');
    });
    this.structure = withDetail(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), 'concrete');
    this.landmark = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.trunk = new THREE.MeshLambertMaterial({ color: 0x9a8468 }); // multiplied by each tree's bark colour
    this.crown = withDetail(new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true }), 'foliage');
    this.frond = withDetail(new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide }), 'foliage');
    this.foliage = withDetail(new THREE.MeshLambertMaterial({ vertexColors: true }), 'foliage');
    this.furniture = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.lampGlow = new THREE.MeshBasicMaterial({ color: 0x9a9a96, vertexColors: true, side: THREE.DoubleSide });
    this.water = new THREE.ShaderMaterial({
      vertexShader: WATER_VERT,
      fragmentShader: WATER_FRAG,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        { uTime: { value: 0 }, uDeep: { value: new THREE.Color(0x8f7650) }, uSky: { value: new THREE.Color(0xa9c4d6) }, uSunDir: { value: sunDir.clone() }, uSunCol: { value: new THREE.Color(1, 0.93, 0.8) } },
      ]),
      fog: true,
      side: THREE.DoubleSide, // the bank ribbon (WaterBuilder.ts) is not wound consistently
    });
    void scene;
  }

  get heritage(): THREE.MeshLambertMaterial {
    if (!this.heritageMat) this.heritageMat = detail(new THREE.MeshLambertMaterial({ vertexColors: true, map: heritageAtlas(this.smallTextures ? 256 : 512), side: THREE.DoubleSide }), 'plaster', this.photos);
    return this.heritageMat;
  }

  /** Terrain material (one per chunk because each chunk owns its land-use texture). */
  terrain(map: THREE.Texture): THREE.MeshLambertMaterial {
    return detail(new THREE.MeshLambertMaterial({ map, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 }), 'ground', this.photos, this.smallTextures);
  }

  update(time: number): void {
    this.water.uniforms.uTime.value = time;
  }
}
