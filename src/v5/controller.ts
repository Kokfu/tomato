// Browser A/B comparison: switches the Carpenter Street section between
//   V4  - the existing rendering, untouched
//   A   - V5 procedural rendering
//   B   - V5 hybrid high-fidelity rendering
// without moving the player or the camera, at the same time of day and render resolution.
//
// Keys 1-4, the bar in Settings > Developer settings, or ?render=v4|a|b|c in the URL. Since V8 the default
// (main.ts) is 'c', V7 Jalan China; the others are kept for comparison and screenshot testing.
import * as THREE from 'three';
import type { WorldManager } from '../world/WorldManager.ts';
import { V5Scene } from './V5Scene.ts';
import type { V5Mode } from './V5Scene.ts';
import { V5Pipeline } from './pipeline.ts';
import { v5Exclusion, V5_LANDMARK_IDS, STREET } from './geo.ts';
import { m5Enabled } from '../world/district/m5.ts';
import { Ambience } from './ambience.ts';
import type { Pedestrians, PedestrianHost } from './pedestrians.ts';

export type RenderMode = 'v4' | V5Mode;
const LABEL: Record<RenderMode, string> = { v4: 'V4 Existing', a: 'V5 Procedural', b: 'V5 Hybrid', c: 'V7 Jalan China' };
const MODES: RenderMode[] = ['v4', 'a', 'b', 'c'];
/** Chunks rebuilt on a mode switch. N1-M5: the section now ends at x = 262.4, 6 m into chunk 1_0. */
const CHUNKS = m5Enabled() ? ['0_0', '0_-1', '1_0'] : ['0_0', '0_-1'];
/**
 * Light balance per mode: the Jalan China section is tuned separately (softer shadow edge, more sky fill). N1-M2: the
 * whole city shares one humid haze, so the DUN at the end of the street is seen through about 350 m of it.
 */
const lookOf = (m: RenderMode) => (m === 'c'
  ? { sun: 6.6, hemi: 1.3, fog: 1, shadowRadius: 2.0, env: 1.0, exposure: 1.05 }
  : { sun: 6.6, hemi: 1.05, fog: 1, shadowRadius: 2.2, env: 0.85, exposure: 0.9 });

/** The six fixed viewpoints of the visual quality gate (same poses for every mode). */
export const GATE_VIEWS = [
  { name: '01-temple-exterior', x: 127.38, z: 5.63, yaw: 2.598, pitch: 0.06, dist: 4.5, heading: -0.543 },
  { name: '02-temple-roof-elevated', x: 125.6, z: 8.6, yaw: 2.598, pitch: 0.62, dist: 30, heading: -0.543 },
  { name: '03-lau-ya-keng-exterior', x: 126.15, z: 7.69, yaw: -0.543, pitch: 0.04, dist: 5, heading: 2.598 },
  { name: '04-food-court-interior', x: 131.47, z: 1.01, yaw: -0.573, pitch: 0.05, dist: 2.4, heading: 2.598 },
  { name: '05-shophouse-row', x: 103.0, z: -7.2, yaw: -2.123, pitch: 0.05, dist: 5, heading: 1.0186 },
  { name: '06-third-person-walk', x: 114.6, z: -0.9, yaw: -2.114, pitch: 0.12, dist: 4.2, heading: 1.03 },
];

/**
 * Cost tiers, tied to the app's graphics preset. Measured on an Intel UHD integrated GPU at 1280 x 720:
 * low / medium draw straight to the canvas (its own MSAA) and stay above 60 fps; high adds an HDR
 * target, half-resolution ambient occlusion, FXAA and a 4096 px shadow map (about 35-40 fps on that
 * integrated GPU). 4x MSAA on the HDR target was measured too: 4-8 fps there, so it is not used.
 * V8.6: low has no shadows, like the app's low preset (src/ui/GraphicsSettings.ts). Until V8.5 this tier turned
 * shadows on and the next resize turned them off again, so every program prepared for the street section had to be
 * compiled a second time, shadow-less, when it came into view (250-700 ms stalls on a throttled phone profile).
 * N1-M2: shadows by tier for the whole city: none on low, 60 m round the player on medium (5.9 cm texels), 96 m on high
 * (4.7 cm), wide enough that roadside trees and the far side of a street keep their shadows.
 */
export const V5_TIERS = {
  low: { ao: false, msaa: 0, shadowMap: 0, shadowRange: 40 },
  medium: { ao: false, msaa: 0, shadowMap: 2048, shadowRange: 60 },
  high: { ao: true, msaa: 0, shadowMap: 4096, shadowRange: 96 },
};

export class V5Controller {
  mode: RenderMode = 'v4';
  /** Fixed quality-gate viewpoints (read by the capture tool). */
  readonly views = GATE_VIEWS;
  busy = false;
  readonly scene: V5Scene;
  readonly pipeline: V5Pipeline;
  readonly ambience = new Ambience();
  /**
   * V7.4 pedestrian prototype: OFF by default (the only licensed model at hand is a stylised figure). While off,
   * nothing of it exists: its code is a separate chunk that is not fetched, no model is loaded, nothing is added
   * to the scene and nothing is updated. `?peds=on` or `setPedestrians(true)` turns it on for development.
   */
  peds: Pedestrians | null = null;
  pedsEnabled = false;
  private pedHost: PedestrianHost;
  private pedToken = 0;
  private world: WorldManager;
  private renderer: THREE.WebGLRenderer;
  private bar: HTMLDivElement;
  private info: HTMLSpanElement;
  private time = 0;
  private frameMs: number[] = [];
  onModeChanged: (() => void) | null = null;
  /** Mode whose lighting `primeMode` has already set up (start-up), if any. */
  private primed: RenderMode | null = null;
  /** False while another mode owns the number keys (OP fly mode uses 1-3 for speed). */
  keysEnabled: () => boolean = () => true;

  /** `barHost`: where the comparison buttons go (the Developer settings panel); without it they float at the top of the screen. */
  constructor(world: WorldManager, renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, tier: 'low' | 'medium' | 'high', barHost?: HTMLElement) {
    const low = tier === 'low';
    this.world = world; this.renderer = renderer;
    this.scene = new V5Scene({
      height: (x, z) => world.height.sample(x, z),
      sites: world.landmarkModels.sites as never,
      baseUrl: import.meta.env.BASE_URL,
      low, renderer,
      setFloors: (f) => world.collision.setExtraFloors(f),
      setWalls: (w) => world.collision.setExtraWalls(w),
    });
    this.pedsEnabled = new URLSearchParams(location.search).get('peds') === 'on';
    this.pedHost = {
      baseUrl: import.meta.env.BASE_URL, low,
      ground: (x, z, y) => world.collision.groundAt(x, z, y).h,
      blocked: (x, z, y) => { const [rx, rz] = world.collision.resolve(x, z, 0.28, y); return Math.hypot(rx - x, rz - z) > 0.01; },
    };
    const [ax, az] = STREET[1], [bx, bz] = STREET[3], l = Math.hypot(bx - ax, bz - az);
    // V7.2 A/B: ?assets=off keeps the Jalan China section fully procedural (the photographic road textures are not fetched).
    this.scene.realAssets = new URLSearchParams(location.search).get('assets') !== 'off';
    this.scene.materials.uniforms.uAxis.value.set((bx - ax) / l, (bz - az) / l);
    this.scene.materials.uniforms.uGroundY.value = world.height.sample(120, 3);
    this.pipeline = new V5Pipeline(renderer, { scene: world.scene, sun: world.sun, hemi: world.hemi, sunDir: world.sunDir, sky: world.sky }, camera,
      V5_TIERS[tier]);

    // comparison bar
    const css = document.createElement('style');
    css.textContent = `#v5bar{position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:30;display:flex;gap:6px;align-items:center;padding:6px 8px;border-radius:12px;background:rgba(16,22,30,.78);backdrop-filter:blur(8px);font:600 12px/1 system-ui,sans-serif;color:#dfe6ee;box-shadow:0 2px 12px rgba(0,0,0,.3)}
      #v5bar button{all:unset;cursor:pointer;padding:7px 11px;border-radius:8px;color:#b9c4d0}#v5bar button:hover{background:rgba(255,255,255,.08)}
      #v5bar button.on{background:#f2c14e;color:#1a1408}#v5bar span{padding:0 6px;font-weight:500;color:#9fb0c0;white-space:nowrap}
      @media (max-width:700px), (pointer:coarse){#v5bar{top:42%;left:auto;right:6px;transform:none;flex-direction:column;gap:3px;padding:4px;font-size:10px}#v5bar button{padding:6px 7px}#v5bar span{display:none}}
      #v5bar.embedded{position:static;transform:none;flex-direction:row;flex-wrap:wrap;gap:6px;padding:0;margin:4px 0 2px;background:none;backdrop-filter:none;box-shadow:none;font-size:12px}
      #v5bar.embedded button{padding:7px 10px;border:1px solid rgba(255,255,255,.14)}#v5bar.embedded span{display:block;flex-basis:100%;padding:2px 0 0;font-size:11px}`;
    document.head.appendChild(css);
    this.bar = document.createElement('div');
    this.bar.id = 'v5bar';
    for (const m of MODES) {
      const b = document.createElement('button');
      b.textContent = LABEL[m]; b.dataset.mode = m; b.title = `Key ${MODES.indexOf(m) + 1}`;
      b.addEventListener('click', (e) => { e.stopPropagation(); void this.setMode(m); });
      this.bar.appendChild(b);
    }
    this.info = document.createElement('span');
    this.bar.appendChild(this.info);
    if (barHost) { this.bar.classList.add('embedded'); barHost.replaceChildren(this.bar); } else document.body.appendChild(this.bar);
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const m = ({ Digit1: 'v4', Digit2: 'a', Digit3: 'b', Digit4: 'c' } as Record<string, RenderMode>)[e.code];
      if (m && this.keysEnabled()) void this.setMode(m);
    });
    this.syncBar();
  }

  private syncBar(): void {
    for (const b of this.bar.querySelectorAll('button')) b.classList.toggle('on', b.dataset.mode === this.mode);
  }

  /**
   * N1-M3b, start-up only: put the lighting and render state of mode `m` in place before its street section is built
   * (`setMode` must follow). Chunks built in the meantime can then compile their shader programs for the rendering
   * the player will see, in the background, instead of for the geographic one first.
   */
  primeMode(m: RenderMode): void {
    if (m === 'v4' || this.mode !== 'v4' || this.pipeline.active) return;
    this.pipeline.look = lookOf(m);
    this.pipeline.enable();
    this.primed = m;
  }

  /** Switch rendering mode. The player, camera and time of day are not touched. */
  async setMode(m: RenderMode): Promise<void> {
    if (m === this.mode || this.busy) return;
    this.busy = true;
    this.info.textContent = 'building…';
    try {
      const lm = this.world.landmarkModels;
      if (m === 'v4') {
        this.pipeline.disable();
        this.world.scene.remove(this.scene.group);
        this.scene.dispose();
        v5Exclusion.active = false;
        v5Exclusion.setChina(false);
        for (const id of V5_LANDMARK_IDS) lm.hidden.delete(id);
        this.ambience.stop();
        this.stopPeds();
      } else {
        await this.scene.build(m);
        v5Exclusion.active = true;
        v5Exclusion.setChina(m === 'c');
        for (const id of V5_LANDMARK_IDS) lm.hidden.add(id);
        this.world.scene.add(this.scene.group);
        if (this.primed !== m) {
          this.pipeline.look = lookOf(m);
          this.pipeline.disable();
          this.pipeline.enable();
        }
        this.primed = null;
        this.ambience.start();
        if (m === 'c' && this.pedsEnabled) void this.startPeds(); else this.stopPeds();
      }
      // Upload the section's textures and compile its programs now, not on the frame it first comes into view
      // (which may be from a car 1.3 km away, after a teleport): src/world/prepareDraw.ts. V8.6: the whole world
      // scene, not only the section: the mode changes tone mapping and lighting, so chunks built before the switch
      // (the DUN roof, built at start-up in the default V7 mode) need new program variants too.
      this.pipeline.prepare(this.world.scene);
      // The two chunks that hold the section are rebuilt with / without the replaced blocks.
      this.world.chunks.invalidate(CHUNKS);
      this.mode = m;
      this.syncBar();
      this.onModeChanged?.();
    } finally {
      this.busy = false;
    }
  }

  private async startPeds(): Promise<void> {
    if (this.peds) return;
    const token = ++this.pedToken;
    const { Pedestrians } = await import('./pedestrians.ts');
    if (token !== this.pedToken || this.peds) return;
    this.peds = new Pedestrians(this.pedHost);
    this.world.scene.add(this.peds.group);
    await this.peds.start();
  }

  private stopPeds(): void {
    this.pedToken++;
    if (!this.peds) return;
    this.peds.stop();
    this.world.scene.remove(this.peds.group);
    this.peds = null;
  }

  /** Development switch for the pedestrian prototype (off by default). */
  async setPedestrians(on: boolean): Promise<void> {
    this.pedsEnabled = on;
    if (on && this.mode === 'c') await this.startPeds(); else this.stopPeds();
  }

  /** V7.2 A/B switch at run time: rebuilds the Jalan China section with or without the photographic road material. */
  async setRealAssets(on: boolean): Promise<void> {
    this.scene.realAssets = on;
    if (this.mode !== 'c' || this.busy) return;
    this.busy = true;
    try { await this.scene.build('c'); } finally { this.busy = false; }
  }

  /** Follow the app's graphics preset. */
  setTier(tier: 'low' | 'medium' | 'high'): void { this.pipeline.setOptions(V5_TIERS[tier]); }

  /** True when the V5 post-processing pipeline should draw the frame. */
  get usesPipeline(): boolean { return this.pipeline.active; }

  setSize(w: number, h: number, pixelRatio: number): void { this.pipeline.setSize(w, h, pixelRatio); }

  /** Re-apply the V5 lighting after the app changed time of day or quality. */
  relight(): void { if (this.pipeline.active) { this.pipeline.disable(); this.pipeline.enable(); } }

  update(dt: number, rawDt: number, px: number, pz: number): void {
    this.time += dt;
    this.scene.update(this.time);
    this.ambience.update(px, pz);
    if (this.peds?.active) this.peds.update(dt, px, pz);
    this.frameMs.push(rawDt * 1000);
    if (this.frameMs.length > 120) this.frameMs.shift();
    if (this.frameMs.length % 30 === 0 && !this.busy) {
      const s = [...this.frameMs].sort((a, b) => a - b), avg = s.reduce((a, b) => a + b, 0) / s.length;
      const i = this.renderer.info.render;
      this.info.textContent = `${(1000 / avg).toFixed(0)} fps · ${avg.toFixed(1)} ms · ${(i.triangles / 1000).toFixed(0)}k tris · ${i.calls} calls`;
    }
  }

  /** Measurements for the report (frame time statistics over the last 120 frames, scene and memory figures). */
  measure(): Record<string, number | string | boolean> {
    const s = [...this.frameMs].sort((a, b) => a - b), i = this.renderer.info;
    return {
      mode: this.mode, frames: s.length, avgMs: +(s.reduce((a, b) => a + b, 0) / Math.max(1, s.length)).toFixed(2), p95Ms: +(s[Math.floor(s.length * 0.95)] ?? 0).toFixed(2), maxMs: +(s[s.length - 1] ?? 0).toFixed(2),
      calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures,
      v5Triangles: this.scene.stats.triangles, v5DrawCalls: this.scene.stats.drawCalls, v5BuildMs: this.scene.stats.buildMs, v5AssetBytes: this.scene.stats.assetBytes, v5Glb: this.scene.stats.glb,
      v5RealAssets: this.scene.realAssets, v5GeometryBytes: this.scene.stats.geometryBytes, v5TextureBytes: this.scene.stats.textureBytes, pipelineTargetBytes: this.pipeline.active ? this.pipeline.targetBytes() : 0,
    };
  }
}
