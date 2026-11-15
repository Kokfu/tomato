// V5 lighting and image pipeline (still three.js / WebGL2 - see docs/V5_REPORT.md for why the
// renderer was not replaced):
//
//  - HDR half-float render target with 4x MSAA, so tone mapping happens once, at the end
//  - ground-truth ambient occlusion (GTAO) for contact shading between architectural elements
//  - tropical daylight: strong warm sun over a cooler, much weaker sky fill (about 4.5 : 1 instead
//    of V4's 1.9 : 1), so shadows have real contrast and form reads
//  - a prefiltered environment map rendered from the same procedural sky, for specular reflection
//    on glass, glazed tiles, gloss paint, wet-look floor tiles and metal
//  - tight, high-resolution soft shadow map around the player
//  - filmic tone mapping (AgX), no bloom, no colour grading
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

const AO_SCALE = 0.5;

export interface PipelineOptions { ao: boolean; msaa: number; shadowMap: number; shadowRange: number }

export interface LightRig {
  scene: THREE.Scene; sun: THREE.DirectionalLight; hemi: THREE.HemisphereLight; sunDir: THREE.Vector3;
  /** Sky dome mesh and its uniforms (horizon, zenith, sun colour). */
  sky: THREE.Mesh;
}

interface Saved { sunI: number; sunC: number; hemiI: number; hemiSky: number; hemiGround: number; fogC: number; fogD: number; exposure: number; tone: THREE.ToneMapping; horizon: number; zenith: number; env: THREE.Texture | null; envI: number }

export class V5Pipeline {
  active = false;
  options: PipelineOptions;
  private renderer: THREE.WebGLRenderer;
  private rig: LightRig;
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer | null = null;
  private gtao: GTAOPass | null = null;
  private fxaa: ShaderPass | null = null;
  private saved: Saved | null = null;
  private env: THREE.WebGLRenderTarget | null = null;
  private w = 1; private h = 1; private pr = 1;

  constructor(renderer: THREE.WebGLRenderer, rig: LightRig, camera: THREE.PerspectiveCamera, options: PipelineOptions) {
    this.renderer = renderer; this.rig = rig; this.camera = camera; this.options = options;
  }

  private buildComposer(): void {
    this.composer?.dispose();
    this.composer = null; this.gtao = null;
    // Without ambient occlusion there is nothing to post-process: draw straight to the canvas (its own
    // MSAA, tone mapping in the material shaders). This is the cheap tier for integrated and mobile GPUs.
    if (!this.options.ao) return;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: this.options.msaa, depthBuffer: true });
    const c = new EffectComposer(this.renderer, target);
    c.addPass(new RenderPass(this.rig.scene, this.camera));
    this.gtao = null;
    if (this.options.ao) {
      const g = new GTAOPass(this.rig.scene, this.camera, size.x, size.y);
      // Occlusion is computed at half resolution (a quarter of the pixels) and blended at full resolution.
      const setSize = g.setSize.bind(g);
      g.setSize = (w: number, h: number) => setSize(Math.max(1, Math.round(w * AO_SCALE)), Math.max(1, Math.round(h * AO_SCALE)));
      g.setSize(size.x, size.y);
      g.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1.3, thickness: 1.2, scale: 1.0, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
      g.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 8, radiusExponent: 1.3, rings: 2, samples: 12 });
      g.blendIntensity = 1.0;
      c.addPass(g);
      this.gtao = g;
    }
    c.addPass(new OutputPass());
    // Without MSAA on the HDR target, edges are smoothed by one FXAA pass after tone mapping.
    this.fxaa = null;
    if (!this.options.msaa) { this.fxaa = new ShaderPass(FXAAShader); c.addPass(this.fxaa); }
    this.composer = c;
    this.setSize(this.w, this.h, this.pr);
  }

  setSize(w: number, h: number, pixelRatio: number): void {
    this.w = w; this.h = h; this.pr = pixelRatio;
    if (!this.composer) return;
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
    if (this.fxaa) (this.fxaa.material.uniforms.resolution.value as THREE.Vector2).set(1 / (w * pixelRatio), 1 / (h * pixelRatio));
  }

  setOptions(o: Partial<PipelineOptions>): void {
    this.options = { ...this.options, ...o };
    if (this.active) { this.buildComposer(); this.applyShadow(); }
  }

  private applyShadow(): void {
    const s = this.rig.sun.shadow, o = this.options;
    this.rig.sun.castShadow = o.shadowMap > 0;
    this.renderer.shadowMap.enabled = o.shadowMap > 0;
    if (!o.shadowMap) return;
    if (s.mapSize.x !== o.shadowMap) { s.mapSize.set(o.shadowMap, o.shadowMap); s.map?.dispose(); s.map = null; }
    const c = s.camera;
    c.left = c.bottom = -o.shadowRange; c.right = c.top = o.shadowRange; c.near = 150; c.far = 450;
    c.updateProjectionMatrix();
    s.bias = -0.00035; s.normalBias = 0.035; s.radius = 2.2;
  }

  enable(): void {
    if (this.active) return;
    const { scene, sun, hemi, sky } = this.rig, r = this.renderer;
    const fog = scene.fog as THREE.FogExp2, u = (sky.material as THREE.ShaderMaterial).uniforms;
    this.saved = { sunI: sun.intensity, sunC: sun.color.getHex(), hemiI: hemi.intensity, hemiSky: hemi.color.getHex(), hemiGround: hemi.groundColor.getHex(), fogC: fog.color.getHex(), fogD: fog.density, exposure: r.toneMappingExposure, tone: r.toneMapping, horizon: u.uHorizon.value.getHex(), zenith: u.uZenith.value.getHex(), env: scene.environment, envI: scene.environmentIntensity };
    sun.color.setHex(0xffedd2); sun.intensity = 6.6;
    hemi.color.setHex(0xc4d2e4); hemi.groundColor.setHex(0x9a917e); hemi.intensity = 1.05;
    u.uHorizon.value.setHex(0xbfd3e2); u.uZenith.value.setHex(0x2f6fb8);
    fog.color.setHex(0xc3d3df); fog.density = this.saved.fogD * 0.8;
    (scene.background as THREE.Color | null)?.setHex?.(0xc3d3df);
    r.toneMapping = THREE.AgXToneMapping; r.toneMappingExposure = 0.9;
    // Environment for specular reflections: the sky itself, prefiltered once (256 px cube, ~1.4 MB of GPU memory).
    const pm = new THREE.PMREMGenerator(r);
    const envScene = new THREE.Scene();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(50, 24, 12), sky.material as THREE.Material);
    envScene.add(dome);
    // Ground half: a neutral warm grey disc so downward reflections are not sky-blue.
    const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x4a473f }));
    ground.position.y = -1.5;
    envScene.add(ground);
    this.env?.dispose();
    this.env = pm.fromScene(envScene, 0, 0.1, 100);
    pm.dispose(); dome.geometry.dispose(); ground.geometry.dispose();
    scene.environment = this.env.texture;
    scene.environmentIntensity = 0.85;
    this.active = true;
    this.buildComposer();
    this.applyShadow();
  }

  disable(): void {
    if (!this.active || !this.saved) return;
    const { scene, sun, hemi, sky } = this.rig, r = this.renderer, s = this.saved;
    const fog = scene.fog as THREE.FogExp2, u = (sky.material as THREE.ShaderMaterial).uniforms;
    sun.intensity = s.sunI; sun.color.setHex(s.sunC);
    hemi.intensity = s.hemiI; hemi.color.setHex(s.hemiSky); hemi.groundColor.setHex(s.hemiGround);
    u.uHorizon.value.setHex(s.horizon); u.uZenith.value.setHex(s.zenith);
    fog.color.setHex(s.fogC); fog.density = s.fogD;
    (scene.background as THREE.Color | null)?.setHex?.(s.fogC);
    r.toneMapping = s.tone; r.toneMappingExposure = s.exposure;
    scene.environment = s.env; scene.environmentIntensity = s.envI;
    this.composer?.dispose(); this.composer = null; this.gtao = null;
    this.env?.dispose(); this.env = null;
    this.active = false;
  }

  render(): void {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.rig.scene, this.camera);
  }

  /** Bytes of GPU memory held by the pipeline's own render targets (estimate from formats and sizes). */
  targetBytes(): number {
    const s = this.renderer.getDrawingBufferSize(new THREE.Vector2()), px = s.x * s.y, o = this.options;
    const hdr = px * 8 * 2 * Math.max(1, o.msaa) + px * 4 * Math.max(1, o.msaa); // two HDR buffers (+ MSAA storage) and depth
    const ao = o.ao ? px * (4 + 4 + 4 + 4) : 0;                                     // normal, depth, ao, denoise targets
    const shadow = o.shadowMap * o.shadowMap * 4 * 2;                              // depth + PCF-soft blur
    return hdr + ao + shadow + 256 * 256 * 6 * 8 * 1.5;
  }
}
