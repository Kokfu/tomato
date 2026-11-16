// Browser A/B comparison: switches the Carpenter Street section between
//   V4  - the existing rendering, untouched
//   A   - V5 procedural rendering
//   B   - V5 hybrid high-fidelity rendering
// without moving the player or the camera, at the same time of day and render resolution.
//
// Keys 1 / 2 / 3, the bar at the top of the screen, or ?render=v4|a|b in the URL.
import * as THREE from 'three';
import type { WorldManager } from '../world/WorldManager.ts';
import { V5Scene } from './V5Scene.ts';
import type { V5Mode } from './V5Scene.ts';
import { V5Pipeline } from './pipeline.ts';
import { v5Exclusion, V5_LANDMARK_IDS, STREET } from './geo.ts';
import { Ambience } from './ambience.ts';

export type RenderMode = 'v4' | V5Mode;
const LABEL: Record<RenderMode, string> = { v4: 'V4 Existing', a: 'V5 Procedural', b: 'V5 Hybrid', c: 'V7 Jalan China' };
const MODES: RenderMode[] = ['v4', 'a', 'b', 'c'];
const CHUNKS = ['0_0', '0_-1'];

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
 */
export const V5_TIERS = {
  low: { ao: false, msaa: 0, shadowMap: 1024, shadowRange: 40 },
  medium: { ao: false, msaa: 0, shadowMap: 2048, shadowRange: 46 },
  high: { ao: true, msaa: 0, shadowMap: 4096, shadowRange: 46 },
};

export class V5Controller {
  mode: RenderMode = 'v4';
  /** Fixed quality-gate viewpoints (read by the capture tool). */
  readonly views = GATE_VIEWS;
  busy = false;
  readonly scene: V5Scene;
  readonly pipeline: V5Pipeline;
  readonly ambience = new Ambience();
  private world: WorldManager;
  private renderer: THREE.WebGLRenderer;
  private bar: HTMLDivElement;
  private info: HTMLSpanElement;
  private time = 0;
  private frameMs: number[] = [];
  onModeChanged: (() => void) | null = null;
  /** False while another mode owns the number keys (OP fly mode uses 1-3 for speed). */
  keysEnabled: () => boolean = () => true;

  constructor(world: WorldManager, renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, tier: 'low' | 'medium' | 'high') {
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
    const [ax, az] = STREET[1], [bx, bz] = STREET[3], l = Math.hypot(bx - ax, bz - az);
    this.scene.materials.uniforms.uAxis.value.set((bx - ax) / l, (bz - az) / l);
    this.scene.materials.uniforms.uGroundY.value = world.height.sample(120, 3);
    this.pipeline = new V5Pipeline(renderer, { scene: world.scene, sun: world.sun, hemi: world.hemi, sunDir: world.sunDir, sky: world.sky }, camera,
      V5_TIERS[tier]);

    // comparison bar
    const css = document.createElement('style');
    css.textContent = `#v5bar{position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:30;display:flex;gap:6px;align-items:center;padding:6px 8px;border-radius:12px;background:rgba(16,22,30,.78);backdrop-filter:blur(8px);font:600 12px/1 system-ui,sans-serif;color:#dfe6ee;box-shadow:0 2px 12px rgba(0,0,0,.3)}
      #v5bar button{all:unset;cursor:pointer;padding:7px 11px;border-radius:8px;color:#b9c4d0}#v5bar button:hover{background:rgba(255,255,255,.08)}
      #v5bar button.on{background:#f2c14e;color:#1a1408}#v5bar span{padding:0 6px;font-weight:500;color:#9fb0c0;white-space:nowrap}
      @media (max-width:700px), (pointer:coarse){#v5bar{top:42%;left:auto;right:6px;transform:none;flex-direction:column;gap:3px;padding:4px;font-size:10px}#v5bar button{padding:6px 7px}#v5bar span{display:none}}`;
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
    document.body.appendChild(this.bar);
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
      } else {
        await this.scene.build(m);
        v5Exclusion.active = true;
        v5Exclusion.setChina(m === 'c');
        for (const id of V5_LANDMARK_IDS) lm.hidden.add(id);
        this.world.scene.add(this.scene.group);
        // Light balance: the Jalan China section is tuned separately (softer shadow edge, more sky fill, clear air
        // so that the DUN at the end of the street keeps its colour).
        this.pipeline.look = m === 'c' ? { sun: 6.0, hemi: 1.3, fog: 0.35, shadowRadius: 3.2, env: 1.0, exposure: 0.92 } : { sun: 6.6, hemi: 1.05, fog: 0.8, shadowRadius: 2.2, env: 0.85, exposure: 0.9 };
        this.pipeline.disable();
        this.pipeline.enable();
        this.ambience.start();
      }
      // The two chunks that hold the section are rebuilt with / without the replaced blocks.
      this.world.chunks.invalidate(CHUNKS);
      this.mode = m;
      this.syncBar();
      this.onModeChanged?.();
    } finally {
      this.busy = false;
    }
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
      v5GeometryBytes: this.scene.stats.geometryBytes, v5TextureBytes: this.scene.stats.textureBytes, pipelineTargetBytes: this.pipeline.active ? this.pipeline.targetBytes() : 0,
    };
  }
}
