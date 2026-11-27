import * as THREE from 'three';
import { DATA_ROOT } from './config.ts';
import { withDataVersion } from '../version.ts';
import type { Manifest, Landmark } from './types.ts';
import { HeightMap } from './HeightMap.ts';
import { CollisionWorld } from './CollisionWorld.ts';
import { Materials } from './Materials.ts';
import { ChunkManager } from './ChunkManager.ts';
import { LandmarkManager } from './LandmarkManager.ts';
import type { Quality } from '../ui/GraphicsSettings.ts';
import { PlaceIndex } from './places/PlaceIndex.ts';
import { LandmarkModels } from './landmarks/LandmarkModels.ts';
import type { LandmarkSite } from './landmarks/LandmarkModels.ts';
import { Haze } from './atmosphere.ts';
import { DAY_HOUR, Showers, TIME_HOURS, advanceHour, lightAt, phaseAt, stepWeather, withWeather, wrapHour } from './dayCycle.ts';
import type { RainMode, TimeMode, Weather } from './dayCycle.ts';
import { ENV, SIGN_GLOW, envListeners } from './env.ts';
import { Rain } from './Rain.ts';
import { loadGroundTextures } from './GroundTextures.ts';
import type { GroundTextures } from './GroundTextures.ts';

/** The frozen times of day of the settings panel (kept for callers of `setTimeOfDay`). */
export type TimeOfDay = Exclude<TimeMode, 'auto'>;

/** Humid air: exponential-squared haze density per metre, the same on every preset (docs/night/refs/STYLE_GUIDE.md, section 3). */
const HAZE_DENSITY = 0.0012;

/**
 * A rendering's daylight: light colours and strengths, sky colours, exposure and reflection strength at DAY_HOUR.
 * The hour and the weather (dayCycle.ts) scale and tint it; they never replace it.
 */
export interface Look {
  sun: number; sunI: number; sky: number; ground: number; hemiI: number; horizon: number; zenith: number; exposure: number;
  /** Strength of the scene's environment reflections by day. */
  env: number;
  /** Scale of the haze density. */
  fog: number;
}
/** The geographic rendering's daylight (09:40: the sun 54 degrees up, a little north of east). */
export const DAY_LOOK: Look = { sun: 0xfff1dc, sunI: 2.45, sky: 0xcfe0f2, ground: 0x9a9078, hemiI: 1.3, horizon: 0xcfdde4, zenith: 0x4a8ace, exposure: 1.0, env: 1, fog: 1 };

/** Lights that stand on the river at night: [landmark id, height, r, g, b, strength]. */
const RIVER_LIGHTS: [string, number, number, number, number, number][] = [
  ['dun', 38, 1.0, 0.7, 0.28, 3.2],
  ['darul-hana', 22, 0.72, 0.84, 1.0, 2.0],
  ['floating-mosque', 11, 0.8, 1.0, 0.86, 1.6],
  ['waterfront', 6, 1.0, 0.8, 0.52, 1.3],
  ['square-tower', 9, 1.0, 0.8, 0.52, 1.1],
  ['fort-margherita', 12, 1.0, 0.82, 0.58, 1.0],
  ['astana', 12, 1.0, 0.9, 0.7, 1.2],
];

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
  uniform float uStars;
  uniform float uCover;
  varying vec3 vDir;
  float h31(vec3 q) { return fract(sin(dot(q, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  float h21(vec2 q) { q = fract(q * vec2(123.34, 456.21)); q += dot(q, q + 45.32); return fract(q.x * q.y); }
  float vn(vec2 q) { vec2 i = floor(q), f = fract(q); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + 1.0), f.x), f.y); }
  float fbm(vec2 q) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vn(q); q = q * 2.03 + 7.1; a *= 0.5; } return s; }
  void main() {
    vec3 d = normalize(vDir);
    float h = max(d.y, 0.0);
    // Equatorial humidity: the lowest part of the dome is pure haze, then the blue comes in slowly.
    float up = 1.0 - exp(-h * 2.6);
    vec3 col = mix(uHorizon, uZenith, up * up * (3.0 - 2.0 * up));
    float s = max(dot(d, uSunDir), 0.0);
    col += uSunCol * (pow(s, 6.0) * 0.16 * exp(-h * 2.0) + pow(s, 64.0) * 0.25 + pow(s, 1400.0) * 6.0) * (1.0 - 0.92 * uCover);
    if (uStars > 0.01) {
      vec3 q = d * 190.0, id = floor(q);
      float st = step(0.9965, h31(id)) * smoothstep(0.45, 0.05, length(fract(q) - 0.5));
      col += vec3(0.9, 0.95, 1.0) * st * uStars * smoothstep(0.02, 0.3, d.y) * (0.5 + 0.9 * h31(id + 3.0));
    }
    if (d.y > 0.01) {
      vec2 uv = d.xz / (d.y + 0.16) * 1.1 + vec2(uTime * 0.006, uTime * 0.002);
      float c = fbm(uv);
      // rain closes the sky into one grey deck
      float cover = smoothstep(0.5 - 0.5 * uCover, 0.78 - 0.5 * uCover, c);
      float lit = 0.72 + 0.28 * smoothstep(0.5, 0.9, c) + 0.25 * pow(s, 4.0);
      vec3 cc = mix(uHorizon, uCloud, 0.8) * lit;
      col = mix(col, cc, cover * mix(0.85, 1.0, uCover) * smoothstep(0.03 - 0.03 * uCover, 0.24 - 0.2 * uCover, d.y));
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
  /** Dedicated glTF models of registered landmarks (lazy-loaded, distance LOD). */
  readonly landmarkModels: LandmarkModels;
  readonly places: PlaceIndex;
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly sunDir = new THREE.Vector3();
  /** 'auto': the clock runs; otherwise it stands still (at that setting's hour unless `setTime` was given one). */
  timeMode: TimeMode = 'day';
  /** 'auto': occasional showers; 'on' / 'off': always / never. */
  rainMode: RainMode = 'off';
  /** Solar hour of day, 0..24. */
  hour = DAY_HOUR;
  /** False while the game is paused or not started: the clock and the weather wait. */
  clockRunning = true;
  readonly weather: Weather = { rain: 0, wet: 0 };
  /** The daylight being scaled by the hour: the geographic rendering's, or the one a render pipeline put in place. */
  private look: Look = DAY_LOOK;
  private showers = new Showers((Date.now() & 0xffff) + 1);
  private rain: Rain;
  private lit = '';
  private readonly cA = new THREE.Color();
  private readonly cB = new THREE.Color();
  /** Tone-mapping exposure wanted by the hour and the look (applied by the renderer owner every frame). */
  exposure = 1;
  /** Sky dome (public so the V5 pipeline can reuse it for its environment map). */
  readonly sky: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;
  private quality: Quality;
  private time = 0;
  private shadowTick = 0;

  static async load(quality: Quality): Promise<WorldManager> {
    const base = `${import.meta.env.BASE_URL}${DATA_ROOT}/`;
    const manifest = (await (await fetch(withDataVersion(`${base}manifest.json`))).json()) as Manifest;
    const ver = manifest.hash || undefined;
    const [hbuf, landmarks, sites] = await Promise.all([
      fetch(withDataVersion(`${base}${manifest.height.file}`, ver)).then((r) => r.arrayBuffer()),
      fetch(withDataVersion(`${base}landmarks.json`, ver)).then((r) => r.json() as Promise<Landmark[]>).catch(() => [] as Landmark[]),
      fetch(withDataVersion(`${base}landmark-sites.json`, ver)).then((r) => r.json() as Promise<{ sites: LandmarkSite[] }>).then((j) => j.sites).catch(() => [] as LandmarkSite[]),
    ]);
    const places = new PlaceIndex(ver);
    const [ground] = await Promise.all([loadGroundTextures(import.meta.env.BASE_URL), places.load()]);
    return new WorldManager(manifest, new Int16Array(hbuf), landmarks, quality, places, sites, ground);
  }

  constructor(manifest: Manifest, heights: Int16Array, landmarks: Landmark[], quality: Quality, places = new PlaceIndex(), sites: LandmarkSite[] = [], ground?: GroundTextures) {
    this.manifest = manifest;
    this.quality = quality;
    this.height = new HeightMap(manifest.height, heights);
    this.collision = new CollisionWorld(this.height);
    this.materials = new Materials(this.scene, this.sunDir, quality.name === 'low', ground);
    this.landmarks = new LandmarkManager();
    this.landmarks.setLandmarks(landmarks);
    this.collision.setLandmarkSites(sites);
    this.landmarkModels = new LandmarkModels({ opaque: this.materials.landmark }, import.meta.env.BASE_URL);
    this.landmarkModels.setSites(sites);
    this.scene.add(this.landmarkModels.group);
    this.places = places;
    this.chunks = new ChunkManager(manifest, this.height, this.collision, this.materials, this.landmarks, places, quality);
    this.scene.add(this.chunks.group);

    // Humid haze: light at street level, closing completely at the edge of the streamed world (atmosphere.ts).
    this.scene.background = new THREE.Color();
    this.scene.fog = new Haze(0xffffff, HAZE_DENSITY, 900);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.shadow.autoUpdate = false;
    this.scene.add(this.hemi, this.sun, this.sun.target);

    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: {
        uHorizon: { value: new THREE.Color() }, uZenith: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunCol: { value: new THREE.Color() }, uCloud: { value: new THREE.Color() }, uTime: { value: 0 }, uStars: { value: 0 }, uCover: { value: 0 },
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
    // N1-M6: rain streaks (one draw call, drawn only while it rains) and the lights the river mirrors at night.
    this.rain = new Rain(1500);
    this.scene.add(this.rain.mesh);
    const wl = this.materials.water.uniforms.uLights.value as THREE.Vector4[], wc = this.materials.water.uniforms.uLightCol.value as THREE.Vector3[];
    RIVER_LIGHTS.forEach(([id, y, r, g, b, k], i) => {
      const l = landmarks.find((m) => m.id === id);
      if (l && i < wl.length) { wl[i].set(l.x, y, l.z, k); wc[i].set(r, g, b); }
    });
    this.applyLight();
    this.applyQuality(quality);
  }

  /** Freeze the clock at a setting's hour ('day', 'evening', 'night'), at `hour`, or let it run ('auto'). */
  setTime(mode: TimeMode, hour?: number): void {
    this.timeMode = mode;
    if (hour !== undefined) this.hour = wrapHour(hour);
    else if (mode !== 'auto') this.hour = TIME_HOURS[mode];
    this.applyLight();
  }

  setTimeOfDay(t: TimeOfDay): void { this.setTime(t); }

  /** `now`: jump to that weather at once (0..1) instead of letting it build. */
  setRain(mode: RainMode, now?: number): void {
    this.rainMode = mode;
    if (now !== undefined) this.weather.rain = this.weather.wet = Math.min(1, Math.max(0, now));
    this.applyLight();
  }

  /** A render pipeline's own daylight (null: back to the geographic rendering's). */
  setLook(look: Look | null): void {
    this.look = look ?? DAY_LOOK;
    this.lit = '';
    this.applyLight();
  }

  /** Run `fn` under the sky of a dry day at DAY_HOUR (a reflection map is baked from it), then put the hour and weather back. */
  inDaylight(fn: () => void): void {
    const h = this.hour, { rain, wet } = this.weather;
    this.hour = DAY_HOUR;
    this.weather.rain = this.weather.wet = 0;
    this.applyLight();
    try { fn(); } finally {
      this.hour = h;
      this.weather.rain = rain;
      this.weather.wet = wet;
      this.applyLight();
    }
  }

  /** Lights, sky, haze, water and the shared night / wet uniforms for the hour, the weather and the look. */
  private applyLight(): void {
    const key = `${this.hour.toFixed(4)}|${this.weather.rain.toFixed(3)}|${this.weather.wet.toFixed(3)}`;
    if (key === this.lit) return;
    this.lit = key;
    const L = this.look, p = withWeather(phaseAt(this.hour), this.weather.rain), at = lightAt(this.hour), a = this.cA, b = this.cB;
    this.sunDir.set(...at.light).normalize();
    this.sun.color.setHex(L.sun).multiply(a.setRGB(...p.sunTint));
    this.sun.intensity = L.sunI * p.sunI;
    a.setRGB(...p.skyTint);
    this.hemi.color.setHex(L.sky).multiply(a);
    this.hemi.groundColor.setHex(L.ground).multiply(a);
    this.hemi.intensity = L.hemiI * p.skyI;
    const u = this.skyMat.uniforms, horizon = u.uHorizon.value as THREE.Color, zenith = u.uZenith.value as THREE.Color;
    horizon.setHex(L.horizon).multiply(a.setRGB(...p.horizon));
    zenith.setHex(L.zenith).multiply(a.setRGB(...p.zenith));
    // Rain: the whole dome turns the grey of its own horizon.
    const g = (horizon.r * 0.3 + horizon.g * 0.55 + horizon.b * 0.15) * 0.74;
    a.setRGB(g * 0.95, g, g * 1.06);
    zenith.lerp(a, p.cover * 0.9);
    horizon.lerp(a, p.cover * 0.6);
    (u.uCloud.value as THREE.Color).setRGB(...p.cloud).lerp(a.multiplyScalar(0.8), p.cover);
    u.uStars.value = p.stars;
    u.uCover.value = p.cover;
    // The disc in the sky: the sun, or a pale moon.
    (u.uSunDir.value as THREE.Vector3).set(...at.disc).normalize();
    // It fades out as the sun sinks to 2 degrees under the horizon and the moon fades in as it climbs, so nothing pops
    // where the two change over. (Its colour is the geographic rendering's in every rendering, as before N1-M6.)
    const disc = at.moon ? 0.22 * Math.min(1, Math.max(0, (at.disc[1] - 0.035) / 0.1)) : Math.min(1, Math.max(0, (at.disc[1] + 0.035) / 0.06));
    (u.uSunCol.value as THREE.Color).setHex(DAY_LOOK.sun).multiply(a.setRGB(...p.sunTint)).multiplyScalar(disc);
    const fog = this.scene.fog as Haze;
    fog.color.copy(horizon);
    fog.density = HAZE_DENSITY * L.fog * p.haze;
    (this.scene.background as THREE.Color).copy(horizon);
    this.scene.environmentIntensity = L.env * p.env;
    this.exposure = L.exposure * p.exposure;

    // Light falling on a flat unlit surface, relative to daytime: lane paint, the canopy cloth and the river's silt.
    const amb = a.setRGB(...p.skyTint).multiplyScalar(p.skyI * 0.55).add(b.setRGB(...p.sunTint).multiplyScalar(p.sunI * 0.45));
    const m = this.materials, w = m.water.uniforms;
    m.marks.color.setHex(0xd9d9d0).multiply(amb);
    (w.uAmb.value as THREE.Color).copy(amb);
    w.uSunDir.value.copy(this.sunDir);
    (w.uSunCol.value as THREE.Color).setHex(DAY_LOOK.sun).multiply(b.setRGB(...p.sunTint)).multiplyScalar(p.sunI);
    (w.uSky.value as THREE.Color).setHex(0xa9c4d6).multiply(b.setRGB(...p.horizon)).lerp(horizon, p.cover);
    w.uNight.value = p.night;
    m.lampGlow.color.setHex(0x9a9a96).lerp(b.setRGB(1.7, 1.42, 0.98), p.night);
    m.pools.visible = p.night > 0.02;
    m.pools.color.setRGB(1, 0.8, 0.5).multiplyScalar(p.night * 0.36 * (1 + 0.2 * this.weather.wet));
    SIGN_GLOW.setScalar(p.night * 0.85);
    ENV.uNight.value = p.night;
    ENV.uWet.value = this.weather.wet;
    ENV.uRain.value = this.weather.rain;
    // (at night a wet road also picks up the glow of the town)
    ENV.uSkyRefl.value.copy(horizon).lerp(zenith, 0.25).add(b.setRGB(0.09, 0.065, 0.04).multiplyScalar(p.night));
    for (const f of envListeners) f(p.night, this.weather.wet);
  }

  applyQuality(q: Quality): void {
    this.quality = q;
    // The haze closes just beyond the nearest point of the edge of the streamed area (the player at the rim of the centre chunk).
    (this.scene.fog as Haze).reach = (q.lowRadius + 0.15) * this.manifest.chunkSize;
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
    this.rain.setDensity(q.name === 'low' ? 1 / 3 : 1);
    this.landmarkModels.viewDistance = this.viewDistance;
    if (this.chunks.quality !== q) this.chunks.setQuality(q);
  }

  /** Far plane needed to see everything inside the fog. */
  get viewDistance(): number {
    return (this.quality.lowRadius + 1.5) * this.manifest.chunkSize;
  }

  update(dt: number, focus: THREE.Vector3, velocity: THREE.Vector3, camera: THREE.Camera): void {
    this.time += dt;
    if (this.clockRunning) {
      if (this.timeMode === 'auto') this.hour = advanceHour(this.hour, dt);
      stepWeather(this.weather, this.rainMode === 'on' ? 1 : this.rainMode === 'off' ? 0 : this.showers.step(dt), dt);
      ENV.uSignalTime.value = (ENV.uSignalTime.value + dt) % 36; // (Life sets it from the traffic clock when traffic runs)
    }
    this.applyLight();
    ENV.uEnvTime.value = this.time % 600;
    this.rain.update(dt, camera.position, this.weather.rain, this.cA.copy(ENV.uSkyRefl.value).multiplyScalar(0.9).addScalar(0.05 * ENV.uNight.value));
    this.materials.update(this.time);
    this.skyMat.uniforms.uTime.value = this.time;
    this.chunks.update(focus.x, focus.z, velocity.x, velocity.z);
    this.landmarkModels.update(focus.x, focus.z);
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
