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
//  - filmic tone mapping (AgX with its "punchy" look), no bloom, no colour grading pass
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { prepareForDraw } from '../world/prepareDraw.ts';
import type { Haze } from '../world/atmosphere.ts';

const AO_SCALE = 0.5;
/** Haze and sky-horizon colour by day (docs/night/refs/STYLE_GUIDE.md: horizon wash #c9d8df). */
const HORIZON = 0xc9d8df;

// AgX's base look is deliberately flat, which read as washed-out walls and weak sun / shade separation. This adds
// the standard "punchy" AgX look (a contrast power and a saturation gain inside the AgX curve, before the outset
// matrix). It is part of the tone-mapping function itself: no extra pass and no cost. Only this pipeline uses AgX.
{
  const chunk = THREE.ShaderChunk.tonemapping_pars_fragment, hook = 'color = AgXOutsetMatrix * color;';
  if (chunk.includes(hook) && !chunk.includes('kPunch')) {
    THREE.ShaderChunk.tonemapping_pars_fragment = chunk.replace(hook, `{ // kPunch
      color = pow( max( color, vec3( 0.0 ) ), vec3( 1.16 ) );
      float kPunch = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
      color = max( vec3( 0.0 ), kPunch + 1.2 * ( color - kPunch ) ); }
    ${hook}`);
  }
}

/** Ring of sunlit and shaded facades for the reflection environment, so glass and car paint mirror a street, not an empty horizon. */
function facadeRing(sunDir: THREE.Vector3): THREE.Mesh {
  const pos: number[] = [], col: number[] = [], N = 28, R = 30;
  const tones = [[0.78, 0.74, 0.62], [0.8, 0.7, 0.42], [0.74, 0.5, 0.46], [0.8, 0.8, 0.78], [0.6, 0.62, 0.6], [0.72, 0.66, 0.5]];
  const quad = (a0: number, a1: number, y0: number, y1: number, c: number[]) => {
    const p = (a: number, y: number) => [Math.cos(a) * R, y, Math.sin(a) * R];
    for (const v of [p(a0, y0), p(a1, y0), p(a1, y1), p(a0, y0), p(a1, y1), p(a0, y1)]) { pos.push(...v); col.push(...c); }
  };
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2, am = (a0 + a1) / 2;
    // the wall at angle am faces the centre; it is sunlit when the sun is behind the viewer looking at it
    const lit = Math.max(0, -(Math.cos(am) * sunDir.x + Math.sin(am) * sunDir.z));
    const t = tones[(i * 5) % tones.length], k = 0.28 + 1.25 * lit, top = 9 + ((i * 7) % 5) * 1.1;
    quad(a0, a1, -1.5, 2.6, t.map((v) => v * 0.1));                       // arcade shadow
    quad(a0, a1, 2.6, top, t.map((v) => v * k));
    quad(a0 + 0.03, a1 - 0.03, 4.4, 6.2, [0.05 + 0.25 * lit, 0.07 + 0.28 * lit, 0.1 + 0.3 * lit]); // window band
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
}

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
  /** Light balance, set before enable(). `fog` scales the world's haze density. */
  look = { sun: 6.6, hemi: 1.05, fog: 1, shadowRadius: 2.2, env: 0.85, exposure: 0.9 };

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
    s.bias = -0.00035; s.normalBias = 0.035; s.radius = this.look.shadowRadius;
  }

  enable(): void {
    if (this.active) return;
    const { scene, sun, hemi, sky } = this.rig, r = this.renderer;
    const fog = scene.fog as Haze, u = (sky.material as THREE.ShaderMaterial).uniforms;
    this.saved = { sunI: sun.intensity, sunC: sun.color.getHex(), hemiI: hemi.intensity, hemiSky: hemi.color.getHex(), hemiGround: hemi.groundColor.getHex(), fogC: fog.color.getHex(), fogD: fog.density, exposure: r.toneMappingExposure, tone: r.toneMapping, horizon: u.uHorizon.value.getHex(), zenith: u.uZenith.value.getHex(), env: scene.environment, envI: scene.environmentIntensity };
    sun.color.setHex(0xffedd2); sun.intensity = this.look.sun;
    hemi.color.setHex(0xc4d2e4); hemi.groundColor.setHex(0x9a917e); hemi.intensity = this.look.hemi;
    // Equatorial sky: a pale, humid horizon under a soft blue zenith. The haze has exactly the horizon's colour, so the
    // far ground dissolves into the sky (atmosphere.ts).
    u.uHorizon.value.setHex(HORIZON); u.uZenith.value.setHex(0x3d7fc4);
    fog.color.setHex(HORIZON); fog.density = this.saved.fogD * this.look.fog;
    (scene.background as THREE.Color | null)?.setHex?.(HORIZON);
    r.toneMapping = THREE.AgXToneMapping; r.toneMappingExposure = this.look.exposure;
    // Environment for specular reflections: the sky itself, prefiltered once (256 px cube, ~1.4 MB of GPU memory).
    const pm = new THREE.PMREMGenerator(r);
    const envScene = new THREE.Scene();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(50, 24, 12), sky.material as THREE.Material);
    envScene.add(dome);
    // Ground half: a neutral warm grey disc so downward reflections are not sky-blue.
    const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x4a473f }));
    ground.position.y = -1.5;
    envScene.add(ground);
    const ring = facadeRing(this.rig.sunDir);
    envScene.add(ring);
    this.env?.dispose();
    this.env = pm.fromScene(envScene, 0, 0.1, 100);
    pm.dispose(); dome.geometry.dispose(); ground.geometry.dispose(); ring.geometry.dispose(); (ring.material as THREE.Material).dispose();
    scene.environment = this.env.texture;
    scene.environmentIntensity = this.look.env;
    this.active = true;
    this.buildComposer();
    this.applyShadow();
  }

  disable(): void {
    if (!this.active || !this.saved) return;
    const { scene, sun, hemi, sky } = this.rig, r = this.renderer, s = this.saved;
    const fog = scene.fog as Haze, u = (sky.material as THREE.ShaderMaterial).uniforms;
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

  /**
   * Upload the textures of `object` (in, or about to join, the world scene) and start compiling its shader programs
   * for this pipeline's render state, without drawing it (src/world/prepareDraw.ts). With the HDR composer the scene
   * is drawn into the composer's target (linear output, tone mapping in the output pass), so that is the target the
   * programs are compiled for.
   */
  prepare(object: THREE.Object3D): Set<THREE.Material> {
    return prepareForDraw(this.renderer, object, this.camera, this.rig.scene, this.composer ? this.composer.readBuffer : null);
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
