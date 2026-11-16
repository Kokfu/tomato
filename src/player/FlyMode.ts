// OP / developer fly mode: a free inspection camera with no gravity and no collision.
// The walking character stays where it was left (its last safe position); leaving the mode hands
// control straight back to it. Nothing here is persisted, and the mode is always off at start-up.
import * as THREE from 'three';
import type { WorldManager } from '../world/WorldManager.ts';
import type { Landmark } from '../world/types.ts';
import { worldToGeo } from '../world/GeoProjection.ts';
import type { Input } from './Input.ts';

/** Selectable flight speeds, metres per second. Shift doubles the selected speed. */
export const FLY_SPEEDS = [25, 75, 150];
/** Landmarks listed first in the selector (ids from landmarks.json). */
const FEATURED = ['dun', 'darul-hana', 'lau-ya-keng-food-court', 'hiang-thian-siang-ti-temple', 'tua-pek-kong', 'fort-margherita', 'astana', 'waterfront'];
/** Arrival viewpoint per landmark: [distance south of it, height above ground, height looked at]. */
const VANTAGE: Record<string, [number, number, number]> = {
  dun: [200, 55, 45], 'darul-hana': [220, 80, 15], astana: [150, 60, 10], 'fort-margherita': [120, 50, 8], waterfront: [120, 60, 4],
};
const DEFAULT_VANTAGE: [number, number, number] = [70, 38, 6];

export interface FlyHost {
  /** False while a menu, the map or a panel has the input. */
  canToggle: () => boolean;
  /** Called after the mode was switched on or off. */
  onChange: (active: boolean) => void;
  /** Ask for the next rendered frame to be saved as a PNG. */
  screenshot: () => void;
  /** Put the walking character on the ground at (x, z); returns false if it cannot stand there. */
  walkHere: (x: number, z: number) => boolean;
  toast: (text: string) => void;
}

export class FlyMode {
  active = false;
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  /** Point the world streams chunks around: under the camera, or the teleport target while it loads. */
  readonly focus = new THREE.Vector3();
  /** Looks along (-sin yaw, -cos yaw), like the walking camera. Pitch > 0 looks up. */
  yaw = 0;
  pitch = 0;
  speedIndex = 0;
  /** Landmark being travelled to (its chunk is still loading). */
  pending: { lm: Landmark; since: number } | null = null;

  private world: WorldManager;
  private camera: THREE.PerspectiveCamera;
  private host: FlyHost;
  private held = new Set<string>();
  private hudTimer = 0;
  private panel: HTMLElement;
  private readout: HTMLElement;
  private toggleBtn: HTMLButtonElement;
  private speedBtns: HTMLButtonElement[] = [];

  constructor(world: WorldManager, camera: THREE.PerspectiveCamera, host: FlyHost) {
    this.world = world;
    this.camera = camera;
    this.host = host;

    const hud = document.getElementById('hud')!;
    this.toggleBtn = el('button', { id: 'op-toggle', class: 'panel', title: 'OP fly mode (P)', text: 'OP' }) as HTMLButtonElement;
    this.toggleBtn.addEventListener('click', () => { this.toggle(); this.toggleBtn.blur(); });
    this.panel = el('div', { id: 'op-panel', class: 'panel hidden' });
    this.readout = el('div', { id: 'op-readout' });
    const speeds = el('div', { class: 'op-row' });
    FLY_SPEEDS.forEach((s, i) => {
      const b = el('button', { text: `${s} m/s`, title: `Speed ${i + 1} (key ${i + 1})` }) as HTMLButtonElement;
      b.addEventListener('click', () => { this.setSpeed(i); b.blur(); });
      this.speedBtns.push(b);
      speeds.append(b);
    });
    const list = el('div', { id: 'op-landmarks' });
    const all = world.landmarks.landmarks;
    const ordered = [...FEATURED.map((id) => all.find((l) => l.id === id)).filter((l): l is Landmark => !!l), ...all.filter((l) => !FEATURED.includes(l.id))];
    ordered.forEach((lm, i) => {
      const b = el('button', { text: lm.name, class: i < FEATURED.length ? 'featured' : '' }) as HTMLButtonElement;
      b.dataset.lm = lm.id;
      b.addEventListener('click', () => { this.travelTo(lm.id); b.blur(); });
      list.append(b);
    });
    const actions = el('div', { class: 'op-row' });
    const mk = (id: string, text: string, title: string, fn: () => void) => {
      const b = el('button', { id, text, title }) as HTMLButtonElement;
      b.addEventListener('click', () => { fn(); b.blur(); });
      actions.append(b);
    };
    mk('op-shot', 'Screenshot', 'Save the view as a PNG (K)', () => host.screenshot());
    mk('op-walk', 'Walk here', 'Put the character on the ground below the camera', () => this.walkHere());
    mk('op-exit', 'Exit', 'Back to the walking position (P)', () => this.toggle());
    this.panel.append(
      el('div', { class: 'op-title', text: 'OP FLY MODE' }), this.readout, speeds,
      el('div', { class: 'op-sub', text: 'Fly to landmark' }), list, actions,
      el('div', { class: 'op-sub', text: 'WASD fly · Mouse look · Space up · Ctrl / C down · Shift boost · 1-3 speed · Esc or T frees the mouse · K screenshot · P exit' }),
    );
    hud.append(this.toggleBtn, this.panel);
    this.setSpeed(0);

    window.addEventListener('keydown', (e) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'KeyP' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) { this.toggle(); return; }
      if (!this.active) return;
      this.held.add(e.code);
      // Ctrl is "descend": keep Ctrl+S / Ctrl+D / Ctrl+A from opening browser dialogs. (Ctrl+W cannot be
      // intercepted by a page: use C to descend while flying forward.)
      if (e.ctrlKey && ['KeyS', 'KeyD', 'KeyA'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') this.setSpeed(Number(e.code.slice(5)) - 1);
      else if (e.code === 'KeyT' && document.pointerLockElement) document.exitPointerLock();
      else if (e.code === 'KeyK') host.screenshot();
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => this.held.clear());
  }

  setSpeed(i: number): void {
    this.speedIndex = Math.max(0, Math.min(FLY_SPEEDS.length - 1, i));
    this.speedBtns.forEach((b, k) => b.classList.toggle('active', k === this.speedIndex));
  }

  toggle(): void {
    if (!this.active && !this.host.canToggle()) return;
    this.active = !this.active;
    this.pending = null;
    this.held.clear();
    this.velocity.set(0, 0, 0);
    if (this.active) {
      this.position.copy(this.camera.position);
      this.focus.copy(this.position);
    }
    this.panel.classList.toggle('hidden', !this.active);
    this.toggleBtn.classList.toggle('active', this.active);
    this.host.onChange(this.active);
    if (this.active) this.refreshHud();
  }

  /** Travel to a landmark from landmarks.json: its chunk is loaded first, then the camera is moved. */
  travelTo(id: string): boolean {
    const lm = this.world.landmarks.landmarks.find((l) => l.id === id);
    if (!lm) return false;
    if (!this.active) this.toggle();
    if (!this.active) return false;
    this.pending = { lm, since: performance.now() };
    this.velocity.set(0, 0, 0);
    this.refreshHud();
    return true;
  }

  private arrive(lm: Landmark): void {
    const [dist, up, lookUp] = VANTAGE[lm.id] ?? DEFAULT_VANTAGE;
    const ground = this.world.height.sample(lm.x, lm.z);
    this.position.set(lm.x, ground + up, lm.z + dist);
    this.yaw = 0; // looking north, toward the landmark
    this.pitch = Math.atan2(ground + lookUp - this.position.y, dist);
    this.velocity.set(0, 0, 0);
    this.pending = null;
  }

  private walkHere(): void {
    if (this.host.walkHere(this.position.x, this.position.z)) this.toggle();
    else this.host.toast('Cannot stand here (water, a building or an unloaded area)');
  }

  update(dt: number, input: Input): void {
    const chunks = this.world.chunks;
    if (this.pending) {
      const { lm, since } = this.pending;
      this.focus.set(lm.x, this.world.height.sample(lm.x, lm.z), lm.z);
      // Wait for the target chunk's mesh and collision; give up waiting after 12 s or outside the map.
      if (chunks.isReady(lm.x, lm.z) || !chunks.hasData(lm.x, lm.z) || performance.now() - since > 12000) this.arrive(lm);
    }
    if (!this.pending) {
      this.yaw += input.lookYaw;
      this.pitch = THREE.MathUtils.clamp(this.pitch + input.lookPitch, -1.55, 1.55);
      const cp = Math.cos(this.pitch), sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
      const rise = (this.held.has('Space') ? 1 : 0) - (this.held.has('ControlLeft') || this.held.has('ControlRight') || this.held.has('KeyC') ? 1 : 0);
      let mx = -sy * cp * input.moveY + cy * input.moveX;
      let my = Math.sin(this.pitch) * input.moveY + (input.enabled ? rise : 0);
      let mz = -cy * cp * input.moveY - sy * input.moveX;
      const len = Math.hypot(mx, my, mz);
      if (len > 1) { mx /= len; my /= len; mz /= len; }
      const speed = FLY_SPEEDS[this.speedIndex] * (input.run ? 2 : 1);
      const k = 1 - Math.exp(-9 * dt);
      this.velocity.x += (mx * speed - this.velocity.x) * k;
      this.velocity.y += (my * speed - this.velocity.y) * k;
      this.velocity.z += (mz * speed - this.velocity.z) * k;
      this.position.addScaledVector(this.velocity, dt);
      // Stay over the prepared map (the extent of the height grid) and within sensible altitudes.
      const h = this.world.manifest.height;
      this.position.x = THREE.MathUtils.clamp(this.position.x, h.x0, h.x0 + (h.nx - 1) * h.cell);
      this.position.z = THREE.MathUtils.clamp(this.position.z, h.z0, h.z0 + (h.nz - 1) * h.cell);
      this.position.y = THREE.MathUtils.clamp(this.position.y, -60, 2500);
      this.focus.set(this.position.x, this.world.height.sample(this.position.x, this.position.z), this.position.z);
    }
    this.camera.position.copy(this.position);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    if (this.camera.fov !== 60) { this.camera.fov = 60; this.camera.updateProjectionMatrix(); }
    this.hudTimer += dt;
    if (this.hudTimer > 0.2) { this.hudTimer = 0; this.refreshHud(); }
  }

  /** Nearest landmark of landmarks.json to the camera (horizontal distance). */
  nearest(): { lm: Landmark; dist: number } | null {
    let best: { lm: Landmark; dist: number } | null = null;
    for (const lm of this.world.landmarks.landmarks) {
      const d = Math.hypot(lm.x - this.position.x, lm.z - this.position.z);
      if (!best || d < best.dist) best = { lm, dist: d };
    }
    return best;
  }

  private refreshHud(): void {
    const p = this.position;
    const [lat, lon] = worldToGeo(p.x, p.z);
    const ground = this.world.height.sample(p.x, p.z);
    const near = this.nearest();
    const lines = [
      `X ${p.x.toFixed(1)}  Z ${p.z.toFixed(1)}`,
      `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
      `Altitude ${p.y.toFixed(1)} m  (${(p.y - ground).toFixed(1)} m above ground)`,
      `Speed ${this.velocity.length().toFixed(0)} m/s  (set ${FLY_SPEEDS[this.speedIndex]})`,
      this.pending ? `Loading ${this.pending.lm.name}…` : near && near.dist < 800 ? `Near: ${near.lm.name} (${near.dist.toFixed(0)} m)` : 'Near: -',
    ];
    this.readout.textContent = lines.join('\n');
  }
}

function el(tag: string, a: { id?: string; class?: string; text?: string; title?: string } = {}): HTMLElement {
  const e = document.createElement(tag);
  if (a.id) e.id = a.id;
  if (a.class) e.className = a.class;
  if (a.text) e.textContent = a.text;
  if (a.title) e.title = a.title;
  return e;
}
