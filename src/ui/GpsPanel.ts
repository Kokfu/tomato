// V8.4 GPS: a small destination list for the driver. Opened with the GPS button beside the speedometer or
// the G key while driving; picking a destination plans a driving route on the mapped road network
// (Minimap.routeTo(..., 'drive')). Navigation itself (route line, next turn, re-planning, arrival) lives in
// Minimap; this panel only chooses and cancels.
import type { Landmark } from '../world/types.ts';
import type { Minimap } from './Minimap.ts';
import { formatDistance } from './Router.ts';

/** Verified landmarks offered as GPS destinations (ids in public/data/kuching/landmarks.json). */
export const GPS_DESTINATIONS = ['waterfront', 'main-bazaar', 'lau-ya-keng-food-court', 'fort-margherita', 'dun'];

export interface GpsDeps {
  minimap: Minimap;
  landmarks: () => Landmark[];
  /** The panel and its button exist only at the wheel (and not in OP mode, menus or the full map). */
  available: () => boolean;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

export class GpsPanel {
  open = false;
  private deps: GpsDeps;
  private btn: HTMLButtonElement;
  private panel: HTMLElement;
  private list: HTMLElement;
  private status: HTMLElement;
  private cancelBtn: HTMLButtonElement;
  private shown = false;
  private busy = false;

  constructor(deps: GpsDeps) {
    this.deps = deps;
    const hud = document.getElementById('hud')!;
    this.btn = el('button', 'panel hidden', 'GPS');
    this.btn.id = 'gps-btn';
    this.btn.type = 'button';
    this.btn.title = 'GPS destinations (G)';
    this.btn.setAttribute('aria-label', 'GPS destinations');
    this.btn.addEventListener('click', (e) => { e.stopPropagation(); this.btn.blur(); this.toggle(); });

    this.panel = el('div', 'panel hidden');
    this.panel.id = 'gps-panel';
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', 'GPS destinations');
    const head = el('div', 'gps-head');
    const close = el('button', 'gps-close', '✕');
    close.type = 'button';
    close.title = 'Close (G)';
    close.setAttribute('aria-label', 'Close GPS');
    close.addEventListener('click', (e) => { e.stopPropagation(); this.toggle(false); });
    head.append(el('b', '', 'GPS'), el('span', '', 'driving routes on mapped roads'), close);
    this.list = el('div', 'gps-list');
    this.status = el('div', 'gps-status');
    this.cancelBtn = el('button', 'gps-cancel', 'Cancel navigation');
    this.cancelBtn.type = 'button';
    this.cancelBtn.addEventListener('click', (e) => { e.stopPropagation(); this.deps.minimap.clearRoute(); this.toggle(false); });
    this.panel.append(head, this.list, this.status, this.cancelBtn);
    for (const type of ['pointerdown', 'wheel', 'touchstart'] as const) this.panel.addEventListener(type, (e) => e.stopPropagation(), { passive: true });
    hud.append(this.btn, this.panel);

    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyG' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || !this.deps.available()) return;
      this.toggle();
    });
    deps.minimap.onNavChange = () => { if (this.open) this.render(); };
  }

  /** Called every frame (cheap): shows the button only while driving and closes the panel otherwise. */
  update(): void {
    const ok = this.deps.available();
    if (ok !== this.shown) {
      this.shown = ok;
      this.btn.classList.toggle('hidden', !ok);
      if (!ok) this.toggle(false);
    }
    this.btn.classList.toggle('gps-active', !!this.deps.minimap.nav && this.deps.minimap.nav.mode === 'drive');
  }

  toggle(force?: boolean): void {
    const open = force ?? !this.open;
    if (open && !this.deps.available()) return;
    if (open === this.open) return;
    this.open = open;
    this.panel.classList.toggle('hidden', !open);
    if (open) void this.refresh();
  }

  /** Load the graphs (first time only) and list each destination with its driving distance from the car. */
  private async refresh(): Promise<void> {
    this.render(true);
    try {
      await this.deps.minimap.loadGraphs('drive');
    } catch {
      this.status.textContent = 'Road data could not be loaded.';
      return;
    }
    if (this.open) this.render();
  }

  private render(loading = false): void {
    const { minimap } = this.deps;
    const nav = minimap.nav?.mode === 'drive' ? minimap.nav : null;
    this.list.textContent = '';
    for (const id of GPS_DESTINATIONS) {
      const lm = this.deps.landmarks().find((l) => l.id === id);
      if (!lm) continue;
      const item = el('button', 'gps-item');
      item.type = 'button';
      item.dataset.id = id;
      const name = el('span', 'gps-name', lm.name);
      let info = loading ? 'Checking roads…' : '';
      let ok = !loading;
      if (!loading) {
        const p = minimap.previewDrive(lm);
        if (!p || !p.length) { ok = false; info = p?.reason || 'No mapped road connection'; }
        else info = `${formatDistance(p.length)} by road${p.walk >= 15 ? ` + ${formatDistance(p.walk)} walk` : ''}`;
      }
      const meta = el('span', 'gps-meta', info);
      item.append(name, meta);
      item.disabled = !ok || this.busy;
      item.classList.toggle('none', !loading && !ok);
      item.classList.toggle('current', nav?.target.id === id);
      item.addEventListener('click', async (e) => {
        e.stopPropagation();
        item.blur();
        this.busy = true;
        await minimap.routeTo(lm, 'drive');
        this.busy = false;
        this.toggle(false);
      });
      this.list.append(item);
    }
    this.status.textContent = nav ? `Navigating to ${nav.target.name}` : 'Choose a destination. Routes follow mapped roads and one-way streets.';
    this.cancelBtn.classList.toggle('hidden', !nav);
  }
}
