import type { PlaceIndex } from '../world/places/PlaceIndex.ts';
import type { Place } from '../world/places/types.ts';
import { googleMapsUrl } from '../world/places/types.ts';

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const SOURCE_LABEL: Record<Place['src'], string> = {
  osm: 'OpenStreetMap contributors (ODbL)',
  overture: 'Overture Maps Places (unverified)',
  manual: 'Verified by the map owner',
};
const VERIFY_LABEL = ['Unverified', 'Mapped in an open data source', 'Manually verified'];

export interface PlacePanelHost {
  places: PlaceIndex;
  /** Places within reach of the player, nearest first. */
  nearby: () => { place: Place; dist: number }[];
  /** Player position as [lat, lon]. */
  playerGeo: () => [number, number];
  onOpenChange: (open: boolean) => void;
}

/**
 * "Inspect a business" interaction: a prompt appears next to a known place; opening it shows the
 * verified information and a link out to Google Maps. With ?admin=1 the same panel becomes an
 * editor whose corrections are stored locally and can be exported as data/places-overrides.json.
 */
export class PlacePanel {
  readonly admin: boolean;
  private host: PlacePanelHost;
  private current: Place | null = null;
  private list: Place[] = [];
  open = false;

  /** True while a shop is within reach (its "Inspect Shop" prompt is up, unless the car takes E). */
  get nearShop(): boolean { return this.list.length > 0 && !this.open; }

  constructor(host: PlacePanelHost) {
    this.host = host;
    const q = new URLSearchParams(location.search);
    if (q.has('admin')) { try { localStorage.setItem('k3d.admin', q.get('admin') === '0' ? '0' : '1'); } catch { /* ignore */ } }
    let stored = '0';
    try { stored = localStorage.getItem('k3d.admin') ?? '0'; } catch { /* ignore */ }
    this.admin = q.has('admin') ? q.get('admin') !== '0' : stored === '1';
    $('place-prompt').addEventListener('click', () => this.toggle());
    $('place-close').addEventListener('click', () => this.close());
    $('place-panel').addEventListener('click', (e) => { if (e.target === $('place-panel')) this.close(); });
    $('place-admin').classList.toggle('hidden', !this.admin);
    if (this.admin) {
      $('place-save').addEventListener('click', () => this.save());
      $('place-remove').addEventListener('click', () => this.removeCurrent());
      $('place-add').addEventListener('click', () => this.addHere());
      $('place-export').addEventListener('click', () => this.exportEdits());
      $('place-discard').addEventListener('click', () => { this.host.places.clearEdits(); this.refreshAdmin(); this.close(); });
    }
  }

  /** Called a few times per second with the current surroundings. */
  update(): void {
    const near = this.host.nearby();
    this.list = near.map((n) => n.place);
    const p = $('place-prompt');
    const first = this.list[0];
    p.classList.toggle('hidden', (!first && !this.admin) || this.open);
    if (first) p.innerHTML = `<kbd>E</kbd>Inspect Shop <span class="more">${esc(first.name)}${this.list.length > 1 ? ` +${this.list.length - 1}` : ''}</span>`;
    else if (this.admin) p.innerHTML = '<kbd>E</kbd> Add a place here';
  }

  toggle(): void {
    if (this.open) this.close();
    else if (this.list.length || this.admin) this.show(this.list[0] ?? null);
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    $('place-panel').classList.add('hidden');
    this.host.onOpenChange(false);
  }

  private show(place: Place | null): void {
    this.current = place;
    this.open = true;
    $('place-panel').classList.remove('hidden');
    $('place-prompt').classList.add('hidden');
    this.host.onOpenChange(true);
    const info = $('place-info');
    if (place) {
      const how = place.b === undefined ? 'Free-standing mapped point (not tied to a building)' : place.how === 'inside' ? 'Inside the mapped building outline' : 'Beside the mapped building outline';
      info.innerHTML =
        `<h2>${esc(place.name)}</h2>` +
        `<div class="place-cat">${esc(place.cat.replace(/_/g, ' '))}</div>` +
        (place.addr ? `<div class="place-row"><span>Address</span>${esc(place.addr)}</div>` : '') +
        (place.pin ? `<div class="place-row"><span>Storefront</span>Lot No. ${place.pin.no}${place.pin.span > 1 ? `-${place.pin.no + place.pin.span - 1}` : ''} (${place.pin.evidence === 'address+position' ? 'house number and mapped position agree' : 'placed by house number; mapped position differs'})</div>` : '') +
        `<div class="place-row"><span>Position</span>${place.lat.toFixed(5)}&deg;N ${place.lon.toFixed(5)}&deg;E &middot; ${how}</div>` +
        `<div class="place-row"><span>Source</span>${SOURCE_LABEL[place.src]}${place.upd ? `, updated ${esc(place.upd)}` : ''}</div>` +
        `<div class="place-row"><span>Status</span><b class="v${place.v}">${VERIFY_LABEL[place.v]}</b>${place.conf !== undefined ? ` (source confidence ${Math.round(place.conf * 100)} %)` : ''}</div>` +
        `<a class="place-link" href="${esc(googleMapsUrl(place))}" target="_blank" rel="noopener noreferrer">Open in Google Maps &#8599;</a>`;
    } else {
      info.innerHTML = '<h2>No mapped place here</h2><div class="place-cat">Use the editor below to add one at your position.</div>';
    }
    const others = $('place-others');
    const rest = this.list.filter((p) => p !== place).slice(0, 6);
    others.innerHTML = rest.length ? '<div class="place-sub">Also here</div>' : '';
    for (const p of rest) {
      const b = document.createElement('button');
      b.textContent = p.name;
      b.addEventListener('click', () => this.show(p));
      others.appendChild(b);
    }
    if (this.admin) {
      ($('pe-name') as HTMLInputElement).value = place?.name ?? '';
      ($('pe-cat') as HTMLInputElement).value = place?.cat ?? 'shop';
      ($('pe-addr') as HTMLInputElement).value = place?.addr ?? '';
      $('place-save').textContent = place ? 'Save correction' : 'Add place here';
      $('place-remove').classList.toggle('hidden', !place);
      $('place-add').classList.toggle('hidden', !place);
      this.refreshAdmin();
    }
  }

  private refreshAdmin(): void {
    const n = this.host.places.editCount;
    $('place-export').textContent = `Export corrections (${n})`;
    ($('place-export') as HTMLButtonElement).disabled = n === 0;
    ($('place-discard') as HTMLButtonElement).disabled = n === 0;
  }

  private fields(): { name: string; cat: string; addr?: string } | null {
    const name = ($('pe-name') as HTMLInputElement).value.trim();
    if (!name) return null;
    return { name, cat: ($('pe-cat') as HTMLInputElement).value.trim() || 'shop', addr: ($('pe-addr') as HTMLInputElement).value.trim() || undefined };
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private save(): void {
    const f = this.fields();
    if (!f) return;
    if (this.current) this.host.places.upsert({ id: this.current.id, ...f, lat: this.current.lat, lon: this.current.lon, upd: this.today() });
    else this.addHere();
    this.close();
  }

  private addHere(): void {
    const f = this.fields();
    if (!f) return;
    const [lat, lon] = this.host.playerGeo();
    this.host.places.upsert({ id: `manual:local-${Date.now().toString(36)}`, ...f, src: 'manual', lat: +lat.toFixed(7), lon: +lon.toFixed(7), upd: this.today() });
    this.close();
  }

  private removeCurrent(): void {
    if (!this.current) return;
    this.host.places.remove(this.current.id);
    this.close();
  }

  /** Download the local corrections in the format of data/places-overrides.json. */
  private exportEdits(): void {
    const e = this.host.places.edits;
    const out = { upsert: e.upsert.map((u) => ({ ...u, id: u.id.replace('manual:local-', 'manual:') })), remove: e.remove };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }));
    a.download = 'places-overrides.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
}
