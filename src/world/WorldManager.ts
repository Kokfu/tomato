import * as THREE from 'three';
import { DATA_ROOT } from './config.ts';
import type { Manifest, Landmark } from './types.ts';
import { HeightMap } from './HeightMap.ts';
import { CollisionWorld } from './CollisionWorld.ts';
import { Materials } from './Materials.ts';
import { ChunkManager } from './ChunkManager.ts';
import { LandmarkManager } from './LandmarkManager.ts';
import type { Quality } from '../ui/GraphicsSettings.ts';

const HORIZON = new THREE.Color(0xcfdde6);
const ZENITH = new THREE.Color(0x4f8fd0);

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;
const SKY_FRAG = /* glsl */ `
  uniform vec3 uHorizon;
  uniform vec3 uZenith;
  uniform vec3 uSunDir;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float h = clamp(d.y, 0.0, 1.0);
    vec3 col = mix(uHorizon, uZenith, pow(h, 0.55));
    float s = max(dot(d, uSunDir), 0.0);
    col += vec3(1.0, 0.85, 0.6) * (pow(s, 600.0) * 1.5 + pow(s, 12.0) * 0.18);
    col = mix(col, uHorizon, step(d.y, 0.0));
    gl_FragColor = vec4(col, 1.0);
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
  readonly sun: THREE.DirectionalLight;
  readonly sunDir = new THREE.Vector3(0.45, 0.72, 0.52).normalize();
  private sky: THREE.Mesh;
  private quality: Quality;
  private time = 0;

  static async load(quality: Quality): Promise<WorldManager> {
    const base = `${import.meta.env.BASE_URL}${DATA_ROOT}/`;
    const manifest = (await (await fetch(`${base}manifest.json`)).json()) as Manifest;
    const [hbuf, landmarks] = await Promise.all([
      fetch(`${base}${manifest.height.file}`).then((r) => r.arrayBuffer()),
      fetch(`${base}landmarks.json`).then((r) => r.json() as Promise<Landmark[]>).catch(() => [] as Landmark[]),
    ]);
    return new WorldManager(manifest, new Int16Array(hbuf), landmarks, quality);
  }

  constructor(manifest: Manifest, heights: Int16Array, landmarks: Landmark[], quality: Quality) {
    this.manifest = manifest;
    this.quality = quality;
    this.height = new HeightMap(manifest.height, heights);
    this.collision = new CollisionWorld(this.height);
    this.materials = new Materials(this.scene, this.sunDir);
    this.landmarks = new LandmarkManager();
    this.landmarks.setLandmarks(landmarks);
    this.chunks = new ChunkManager(manifest, this.height, this.collision, this.materials, this.landmarks, quality);
    this.scene.add(this.chunks.group);

    // Warm tropical daylight with light haze.
    this.scene.background = HORIZON;
    this.scene.fog = new THREE.Fog(HORIZON, 100, 900);
    this.scene.add(new THREE.HemisphereLight(0xdfeaf5, 0x8a8468, 1.05));
    this.sun = new THREE.DirectionalLight(0xfff0d8, 2.1);
    this.sun.position.copy(this.sunDir).multiplyScalar(300);
    this.scene.add(this.sun, this.sun.target);

    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 12),
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        uniforms: { uHorizon: { value: HORIZON }, uZenith: { value: ZENITH }, uSunDir: { value: this.sunDir } },
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: true,
        fog: false,
      }),
    );
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
    this.applyQuality(quality);
  }

  applyQuality(q: Quality): void {
    this.quality = q;
    const fog = this.scene.fog as THREE.Fog;
    const reach = (q.lowRadius + 0.5) * this.manifest.chunkSize;
    fog.near = reach * 0.35;
    fog.far = reach;
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
      s.bias = -0.0006;
      s.normalBias = 0.06;
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
    this.chunks.update(focus.x, focus.z, velocity.x, velocity.z);
    this.sky.position.copy(camera.position);
    // Shadow frustum follows the player, snapped to whole metres to limit shimmering.
    const fx = Math.round(focus.x), fz = Math.round(focus.z);
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx, focus.y, fz).addScaledVector(this.sunDir, 300);
    this.sun.target.updateMatrixWorld();
  }
}
