import * as THREE from 'three';
import { DATA_ROOT } from './config.ts';
import type { Manifest, Landmark } from './types.ts';
import { HeightMap } from './HeightMap.ts';
import { CollisionWorld } from './CollisionWorld.ts';
import { Materials } from './Materials.ts';
import { ChunkManager } from './ChunkManager.ts';
import { LandmarkManager } from './LandmarkManager.ts';
import type { Quality } from '../ui/GraphicsSettings.ts';
import { PlaceIndex } from './places/PlaceIndex.ts';

export type TimeOfDay = 'day' | 'evening';

/** Lighting presets. Sun directions point from the ground toward the sun (+X east, -Z north). */
const TIMES: Record<TimeOfDay, {
  sunDir: [number, number, number]; sun: number; sunIntensity: number; skyLight: number; groundLight: number; hemiIntensity: number;
  horizon: number; zenith: number; fog: number; exposure: number; cloud: number; water: number; lampGlow: number;
}> = {
  // Mid-morning: the sun stands in the north-east, so the river-facing Main Bazaar fronts are lit.
  day: {
    sunDir: [0.52, 0.7, -0.49], sun: 0xfff1dc, sunIntensity: 2.6, skyLight: 0xcfe0f2, groundLight: 0x8f876e, hemiIntensity: 1.0,
    horizon: 0xcfdde4, zenith: 0x3f82c8, fog: 0xc9d8e0, exposure: 1.0, cloud: 0xffffff, water: 0xa9c4d6, lampGlow: 0x9a9a96,
  },
  // Shortly before sunset: low warm sun in the west, long shadows, lamps lit.
  evening: {
    sunDir: [-0.86, 0.2, -0.24], sun: 0xffb070, sunIntensity: 2.2, skyLight: 0xb9b4d6, groundLight: 0x8a7462, hemiIntensity: 1.7,
    horizon: 0xf2b98a, zenith: 0x33508f, fog: 0xd9b59a, exposure: 1.2, cloud: 0xffd2b0, water: 0xd9a988, lampGlow: 0xffe2a8,
  },
};

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;
// Analytic sky: exponential zenith falloff (Rayleigh-like), horizon haze, Mie glow around the sun,
// and a slowly drifting layer of procedural cumulus. No textures.
const SKY_FRAG = /* glsl */ `
  uniform vec3 uHorizon;
  uniform vec3 uZenith;
  uniform vec3 uSunDir;
  uniform vec3 uSunCol;
  uniform vec3 uCloud;
  uniform float uTime;
  varying vec3 vDir;
  float h21(vec2 q) { q = fract(q * vec2(123.34, 456.21)); q += dot(q, q + 45.32); return fract(q.x * q.y); }
  float vn(vec2 q) { vec2 i = floor(q), f = fract(q); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + 1.0), f.x), f.y); }
  float fbm(vec2 q) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vn(q); q = q * 2.03 + 7.1; a *= 0.5; } return s; }
  void main() {
    vec3 d = normalize(vDir);
    float h = max(d.y, 0.0);
    vec3 col = mix(uHorizon, uZenith, 1.0 - exp(-h * 3.4));
    float s = max(dot(d, uSunDir), 0.0);
    col += uSunCol * (pow(s, 6.0) * 0.16 * exp(-h * 2.0) + pow(s, 64.0) * 0.25 + pow(s, 1400.0) * 6.0);
    if (d.y > 0.01) {
      vec2 uv = d.xz / (d.y + 0.16) * 1.1 + vec2(uTime * 0.006, uTime * 0.002);
      float c = fbm(uv);
      float cover = smoothstep(0.5, 0.78, c);
      float lit = 0.72 + 0.28 * smoothstep(0.5, 0.9, c) + 0.25 * pow(s, 4.0);
      vec3 cc = mix(uHorizon, uCloud, 0.8) * lit;
      col = mix(col, cc, cover * 0.85 * smoothstep(0.01, 0.16, d.y));
    }
    col = mix(col, uHorizon, step(d.y, 0.0));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Owns the scene, lighting, sky, shared materials and the chunk streamer. */
export class WorldManager {
  readonly scene = new THREE.Scene();
  readonly manifest: Manifest;
  readonly height: HeightMap;
  readonly collision: CollisionWorld;
  readonly materials: Materials;
  readonly chunks: ChunkManager;
  readonly landmarks: LandmarkManager;
  readonly places: PlaceIndex;
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly sunDir = new THREE.Vector3();
  timeOfDay: TimeOfDay = 'day';
  /** Tone-mapping exposure wanted by the current time of day (applied by the renderer owner). */
  exposure = 1;
  private sky: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;
  private quality: Quality;
  private time = 0;
  private shadowTick = 0;

  static async load(quality: Quality): Promise<WorldManager> {
    const base = `${import.meta.env.BASE_URL}${DATA_ROOT}/`;
    const manifest = (await (await fetch(`${base}manifest.json`)).json()) as Manifest;
    const [hbuf, landmarks] = await Promise.all([
      fetch(`${base}${manifest.height.file}`).then((r) => r.arrayBuffer()),
      fetch(`${base}landmarks.json`).then((r) => r.json() as Promise<Landmark[]>).catch(() => [] as Landmark[]),
    ]);
    const places = new PlaceIndex();
    await places.load();
    return new WorldManager(manifest, new Int16Array(hbuf), landmarks, quality, places);
  }

  constructor(manifest: Manifest, heights: Int16Array, landmarks: Landmark[], quality: Quality, places = new PlaceIndex()) {
    this.manifest = manifest;
    this.quality = quality;
    this.height = new HeightMap(manifest.height, heights);
    this.collision = new CollisionWorld(this.height);
    this.materials = new Materials(this.scene, this.sunDir, quality.name === 'low');
    this.landmarks = new LandmarkManager();
    this.landmarks.setLandmarks(landmarks);
    this.places = places;
    this.chunks = new ChunkManager(manifest, this.height, this.collision, this.materials, this.landmarks, places, quality);
    this.scene.add(this.chunks.group);

    // Exponential-squared haze: clear at street level, dissolving the far city into the sky colour.
    this.scene.background = new THREE.Color();
    this.scene.fog = new THREE.FogExp2(0xffffff, 0.002);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.shadow.autoUpdate = false;
    this.scene.add(this.hemi, this.sun, this.sun.target);

    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: {
        uHorizon: { value: new THREE.Color() }, uZenith: { value: new THREE.Color() }, uSunDir: { value: this.sunDir },
        uSunCol: { value: new THREE.Color() }, uCloud: { value: new THREE.Color() }, uTime: { value: 0 },
      },
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
    this.setTimeOfDay('day');
    this.applyQuality(quality);
  }

  setTimeOfDay(t: TimeOfDay): void {
    this.timeOfDay = t;
    const p = TIMES[t];
    this.sunDir.set(...p.sunDir).normalize();
    this.sun.color.setHex(p.sun);
    this.sun.intensity = p.sunIntensity;
    this.hemi.color.setHex(p.skyLight);
    this.hemi.groundColor.setHex(p.groundLight);
    this.hemi.intensity = p.hemiIntensity;
    const u = this.skyMat.uniforms;
    u.uHorizon.value.setHex(p.horizon);
    u.uZenith.value.setHex(p.zenith);
    u.uSunCol.value.setHex(p.sun);
    u.uCloud.value.setHex(p.cloud);
    (this.scene.fog as THREE.FogExp2).color.setHex(p.fog);
    (this.scene.background as THREE.Color).setHex(p.fog);
    const w = this.materials.water.uniforms;
    w.uSunDir.value.copy(this.sunDir);
    w.uSunCol.value.setHex(p.sun);
    w.uSky.value.setHex(p.water);
    this.materials.lampGlow.color.setHex(p.lampGlow);
    this.exposure = p.exposure;
  }

  applyQuality(q: Quality): void {
    this.quality = q;
    // Density chosen so the haze reaches ~97 % at the edge of the streamed area.
    const reach = (q.lowRadius + 0.5) * this.manifest.chunkSize;
    (this.scene.fog as THREE.FogExp2).density = 1.9 / reach;
    this.sun.castShadow = q.shadowMap > 0;
    if (q.shadowMap > 0) {
      const s = this.sun.shadow;
      if (s.mapSize.x !== q.shadowMap) {
        s.mapSize.set(q.shadowMap, q.shadowMap);
        s.map?.dispose();
        s.map = null;
      }
      const c = s.camera;
      c.left = c.bottom = -q.shadowRange;
      c.right = c.top = q.shadowRange;
      c.near = 10;
      c.far = 700;
      c.updateProjectionMatrix();
      s.bias = -0.0005;
      s.normalBias = 0.05;
      s.radius = 2.5;
    }
    if (this.chunks.quality !== q) this.chunks.setQuality(q);
  }

  /** Far plane needed to see everything inside the fog. */
  get viewDistance(): number {
    return (this.quality.lowRadius + 1.5) * this.manifest.chunkSize;
  }

  update(dt: number, focus: THREE.Vector3, velocity: THREE.Vector3, camera: THREE.Camera): void {
    this.time += dt;
    this.materials.update(this.time);
    this.skyMat.uniforms.uTime.value = this.time;
    this.chunks.update(focus.x, focus.z, velocity.x, velocity.z);
    this.sky.position.copy(camera.position);
    // Shadow frustum follows the player, snapped to whole shadow-map texels so that shadow edges do
    // not crawl while walking.
    const texel = this.quality.shadowMap > 0 ? (this.quality.shadowRange * 2) / this.quality.shadowMap : 1;
    const snap = Math.max(texel * 4, 0.25);
    const fx = Math.round(focus.x / snap) * snap, fz = Math.round(focus.z / snap) * snap, fy = Math.round(focus.y);
    // The shadow map is re-rendered every other frame (the light only moves on those frames, so the
    // map and its projection always agree). Halves the depth-pass cost; the only moving caster is
    // the character, whose shadow trails by one frame.
    if (this.shadowTick++ % 2 === 0) {
      this.sun.target.position.set(fx, fy, fz);
      this.sun.position.set(fx, fy, fz).addScaledVector(this.sunDir, 300);
      this.sun.target.updateMatrixWorld();
      this.sun.shadow.needsUpdate = true;
    }
  }
}
