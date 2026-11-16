// Reference comparison panel (OP mode only): shows a real photograph next to, or over, the rendered
// scene so that a reconstruction can be checked against its source.
//
// Photographs come from two places, never from the network at large:
//  - public/reference/manifest.json: licensed photographs shipped with the project, with credit;
//  - files the user picks or drops here. They are read in the browser only (object URLs), are not
//    uploaded anywhere and are gone after a reload.
// Nothing here fetches street-level imagery from a map provider.
//
// A photograph taken from another standpoint or with another lens cannot be laid over the render
// honestly, so every reference is labelled "approximate" unless it has been marked as aligned.
import type { SavedView } from '../player/FlyMode.ts';

interface Ref {
  name: string;
  url: string;
  title?: string;
  author?: string;
  license?: string;
  source?: string;
  note?: string;
  /** True (the default) when the camera position or lens differs from the photograph's. */
  approx: boolean;
  /** Camera pose to compare from. */
  view?: SavedView;
  local?: boolean;
}

export interface ReferenceHost {
  baseUrl: string;
  /** Called when the scene must give up / take back the right half of the window. */
  onSplit: (split: boolean) => void;
  currentView: (name: string) => SavedView;
  goView: (v: SavedView) => void;
  toast: (text: string) => void;
}

const STORE = 'k3d.ref.links';

export class ReferencePanel {
  open = false;
  mode: 'side' | 'overlay' = 'side';
  opacity = 0.5;
  private host: ReferenceHost;
  private root: HTMLElement;
  private img: HTMLImageElement;
  private badge: HTMLElement;
  private credit: HTMLElement;
  private select: HTMLSelectElement;
  private refs: Ref[] = [];
  private cur = -1;
  private loaded = false;
  private btnMode!: HTMLButtonElement; private btnApprox!: HTMLButtonElement; private range!: HTMLInputElement; private btnGo!: HTMLButtonElement;

  constructor(host: ReferenceHost) {
    this.host = host;
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
    this.root = el('div', 'hidden');
    this.root.id = 'ref-panel';
    const stage = el('div', 'ref-stage');
    this.img = el('img');
    this.img.alt = 'Reference photograph';
    this.img.draggable = false;
    this.badge = el('div', 'ref-badge');
    stage.append(this.img, this.badge);
    const bar = el('div', 'ref-bar panel');
    this.select = el('select');
    this.select.title = 'Reference photograph';
    this.select.addEventListener('change', () => this.show(Number(this.select.value)));
    const file = el('input');
    file.type = 'file'; file.accept = 'image/*'; file.multiple = true; file.hidden = true;
    file.addEventListener('change', () => { this.addFiles(file.files); file.value = ''; });
    const btn = (text: string, title: string, fn: () => void) => { const b = el('button', '', text); b.title = title; b.addEventListener('click', () => { fn(); b.blur(); }); return b; };
    const add = btn('Add photo…', 'Load photographs from this computer (they stay in the browser)', () => file.click());
    this.btnMode = btn('', 'Side by side, or laid over the scene', () => this.setMode(this.mode === 'side' ? 'overlay' : 'side'));
    this.range = el('input');
    this.range.type = 'range'; this.range.min = '0'; this.range.max = '100'; this.range.value = '50'; this.range.title = 'Photograph opacity';
    this.range.addEventListener('input', () => { this.opacity = Number(this.range.value) / 100; this.sync(); });
    this.btnApprox = btn('', 'Mark whether this photograph was taken from the linked camera position with a matching lens', () => { const r = this.refs[this.cur]; if (r) { r.approx = !r.approx; this.persist(); this.sync(); } });
    const link = btn('Link view', 'Remember the current camera as the viewpoint for this photograph', () => { const r = this.refs[this.cur]; if (r) { r.view = this.host.currentView(r.name); this.persist(); this.sync(); this.host.toast('Viewpoint linked to this photograph'); } });
    this.btnGo = btn('Go to view', 'Move the camera to the viewpoint linked to this photograph', () => { const r = this.refs[this.cur]; if (r?.view) this.host.goView(r.view); });
    const close = btn('Close', 'Close the comparison (R)', () => this.toggle(false));
    this.credit = el('div', 'ref-credit');
    bar.append(this.select, add, file, this.btnMode, this.range, this.btnApprox, link, this.btnGo, close, this.credit);
    this.root.append(stage, bar);
    document.body.appendChild(this.root);
    // Dropping image files anywhere on the panel adds them.
    this.root.addEventListener('dragover', (e) => e.preventDefault());
    this.root.addEventListener('drop', (e) => { e.preventDefault(); this.addFiles(e.dataTransfer?.files ?? null); });
    this.sync();
  }

  private links(): Record<string, { approx: boolean; view?: SavedView }> {
    try { return JSON.parse(localStorage.getItem(STORE) ?? '{}'); } catch { return {}; }
  }
  private persist(): void {
    const out = this.links();
    for (const r of this.refs) out[r.name] = { approx: r.approx, view: r.view };
    try { localStorage.setItem(STORE, JSON.stringify(out)); } catch { /* private window: links last for this visit only */ }
  }

  private async loadManifest(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const res = await fetch(`${this.host.baseUrl}reference/manifest.json`);
      if (res.ok && (res.headers.get('content-type') ?? '').includes('json')) {
        const saved = this.links();
        for (const m of (await res.json()).images as (Omit<Ref, 'url' | 'name' | 'approx'> & { file: string; approx?: boolean })[]) {
          const s = saved[m.file];
          this.refs.push({ ...m, name: m.file, url: `${this.host.baseUrl}reference/${m.file}`, approx: s?.approx ?? m.approx ?? true, view: s?.view ?? m.view });
        }
      }
    } catch { /* no bundled references: local photographs still work */ }
    this.fill();
    if (this.cur < 0 && this.refs.length) this.show(0);
  }

  private addFiles(files: FileList | null): void {
    if (!files) return;
    const saved = this.links();
    let first = -1;
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('image/')) continue;
      const s = saved[f.name];
      this.refs.push({ name: f.name, title: f.name, url: URL.createObjectURL(f), approx: s?.approx ?? true, view: s?.view, local: true, note: 'Local file: licence and source are for you to confirm.' });
      if (first < 0) first = this.refs.length - 1;
    }
    this.fill();
    if (first >= 0) this.show(first);
  }

  private fill(): void {
    this.select.replaceChildren(...this.refs.map((r, i) => { const o = document.createElement('option'); o.value = String(i); o.textContent = (r.local ? '(local) ' : '') + (r.title ?? r.name); return o; }));
    if (!this.refs.length) { const o = document.createElement('option'); o.textContent = 'No photograph loaded'; this.select.append(o); }
    if (this.cur >= 0) this.select.value = String(this.cur);
  }

  private show(i: number): void {
    const r = this.refs[i];
    if (!r) return;
    this.cur = i;
    this.img.src = r.url;
    this.select.value = String(i);
    this.sync();
  }

  setMode(m: 'side' | 'overlay'): void {
    this.mode = m;
    if (this.open) this.host.onSplit(m === 'side');
    this.sync();
  }

  toggle(on = !this.open): void {
    this.open = on;
    this.root.classList.toggle('hidden', !on);
    this.host.onSplit(on && this.mode === 'side');
    if (on) void this.loadManifest();
    this.sync();
  }

  private sync(): void {
    const r = this.refs[this.cur];
    this.root.dataset.mode = this.mode;
    this.btnMode.textContent = this.mode === 'side' ? 'Side by side' : 'Overlay';
    this.range.style.display = this.mode === 'overlay' ? '' : 'none';
    this.img.style.opacity = this.mode === 'overlay' ? String(this.opacity) : '1';
    this.img.style.display = r ? '' : 'none';
    this.btnApprox.textContent = r?.approx === false ? 'Aligned' : 'Approximate';
    this.btnApprox.disabled = !r;
    this.btnGo.disabled = !r?.view;
    this.badge.textContent = !r ? 'Add a photograph: "Add photo…" or drop image files here'
      : r.approx ? 'APPROXIMATE COMPARISON · the photograph was taken from a different position or with a different lens; compare content, not pixels'
        : 'ALIGNED VIEW · camera position and lens matched to the photograph';
    this.badge.classList.toggle('approx', !!r?.approx);
    this.credit.replaceChildren();
    if (r) {
      const parts = [r.title, r.author && `by ${r.author}`, r.license, r.note].filter(Boolean).join(' · ');
      this.credit.append(parts);
      if (r.source) { const a = document.createElement('a'); a.href = r.source; a.target = '_blank'; a.rel = 'noopener'; a.textContent = ' source'; this.credit.append(a); }
    }
  }
}
