// N1-M7: the phone. A small phone-shaped menu for play: the wallet, the job in hand, job offers (food deliveries and
// taxi fares), the garage, saving, and shortcuts to the GPS, the map and the pause menu. Opened with T or the phone
// button of the HUD; while it is open the game runs on but the controls are let go, as with the full map.
// DOM and text only: what the buttons do lives in src/play/Play.ts.
import type { JobKind } from '../play/missions.ts';

export interface OfferView { id: number; from: string; to: string; meta: string; fare: string }

export interface PhoneStatus {
  money: string;
  /** The job in hand: a title ("Food delivery"), what to do now, and where. */
  job: { title: string; step: string; place: string; pay: string } | null;
  vehicle: { name: string; driving: boolean; damage: number; repair: string | null; canRepair: boolean };
  /** Finished jobs, by kind, and everything earned. */
  stats: string;
  /** Why taxi fares cannot be taken now (not in a taxi), or '' when they can. */
  taxiBlock: string;
  /** A parked taxi is known nearby: metres to it. */
  taxiNear: number | null;
}

export interface PhoneHost {
  canOpen(): boolean;
  onOpenChange(open: boolean): void;
  status(): PhoneStatus;
  offers(kind: JobKind): Promise<OfferView[]>;
  accept(id: number): void;
  cancelJob(): void;
  showRoute(): void;
  findTaxi(): void;
  repair(): void;
  /** Returns false when the progress could not be stored. */
  save(): boolean;
  openGps(): void;
  openMap(): void;
  pause(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

type Screen = 'home' | JobKind | 'garage';

export class Phone {
  open = false;
  private host: PhoneHost;
  private root: HTMLElement;
  private body: HTMLElement;
  private title: HTMLElement;
  private money: HTMLElement;
  private back: HTMLButtonElement;
  private screen: Screen = 'home';
  private note = '';
  private token = 0;
  readonly button: HTMLButtonElement;

  constructor(host: PhoneHost) {
    this.host = host;
    this.button = el('button', 'icon-btn', '\u{1F4F1}');
    this.button.id = 'btn-phone';
    this.button.type = 'button';
    this.button.title = 'Phone: jobs, garage, save (T)';
    this.button.setAttribute('aria-label', 'Phone');
    this.button.addEventListener('click', (e) => { e.stopPropagation(); this.button.blur(); this.toggle(); });
    document.getElementById('topbar')!.prepend(this.button);

    this.root = el('div', 'hidden');
    this.root.id = 'phone';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Phone');
    const head = el('div', 'ph-head');
    this.back = el('button', 'ph-back', '‹');
    this.back.type = 'button';
    this.back.setAttribute('aria-label', 'Back');
    this.back.addEventListener('click', () => this.show('home'));
    this.title = el('b', 'ph-title', 'Phone');
    this.money = el('span', 'ph-money');
    this.money.id = 'ph-money';
    const close = el('button', 'ph-close', '✕');
    close.type = 'button';
    close.title = 'Close (T)';
    close.setAttribute('aria-label', 'Close phone');
    close.addEventListener('click', () => this.toggle(false));
    head.append(this.back, this.title, this.money, close);
    this.body = el('div', 'ph-body');
    this.root.append(head, this.body);
    for (const type of ['pointerdown', 'wheel', 'touchstart', 'click'] as const) this.root.addEventListener(type, (e) => e.stopPropagation(), { passive: true });
    // (on the page itself, not in the HUD: it must lie above the touch controls)
    document.body.append(this.root);

    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyT' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement | null)?.closest?.('input,textarea')) return;
      if (this.open || this.host.canOpen()) this.toggle();
    });
  }

  toggle(force?: boolean): void {
    const open = force ?? !this.open;
    if (open === this.open || (open && !this.host.canOpen())) return;
    this.open = open;
    this.root.classList.toggle('hidden', !open);
    this.button.classList.toggle('on', open);
    this.host.onOpenChange(open);
    if (open) { this.note = ''; this.show('home'); }
  }

  /** Called every frame (cheap): the phone closes itself when it may not be open (menus, the map, OP mode). */
  update(): void {
    if (this.open && !this.host.canOpen()) this.toggle(false);
  }

  /** Redraw what is on screen (the job changed, money came in). */
  refresh(): void {
    if (this.open) this.show(this.screen);
  }

  private row(label: string, sub: string, id: string, fn: () => void, primary = false): HTMLButtonElement {
    const b = el('button', `ph-row${primary ? ' primary' : ''}`);
    b.type = 'button';
    b.id = id;
    b.append(el('span', 'ph-label', label));
    if (sub) b.append(el('span', 'ph-sub', sub));
    b.addEventListener('click', (e) => { e.stopPropagation(); b.blur(); fn(); });
    return b;
  }

  private show(screen: Screen): void {
    this.screen = screen;
    const st = this.host.status(), body = this.body;
    const token = ++this.token;
    this.money.textContent = st.money;
    this.back.classList.toggle('hidden', screen === 'home');
    body.textContent = '';
    if (screen === 'home') {
      this.title.textContent = 'Phone';
      if (st.job) {
        const card = el('div', 'ph-job');
        card.id = 'ph-job';
        card.append(el('b', '', st.job.title), el('div', 'ph-step', st.job.step), el('div', 'ph-place', st.job.place), el('div', 'ph-sub', st.job.pay));
        const btns = el('div', 'ph-btns');
        btns.append(this.row('Show the route', '', 'ph-route', () => { this.host.showRoute(); this.toggle(false); }), this.row('Give up the job', '', 'ph-cancel', () => { this.host.cancelJob(); this.note = 'Job given up.'; this.show('home'); }));
        card.append(btns);
        body.append(card);
      } else {
        body.append(
          this.row('Food delivery', 'Collect an order, take it to the customer. Any vehicle.', 'ph-delivery', () => this.show('delivery'), true),
          this.row('Taxi fares', st.taxiBlock || 'Collect a passenger, drive them there.', 'ph-taxi', () => this.show('taxi')),
        );
      }
      body.append(
        this.row('Garage', `${st.vehicle.name}${st.vehicle.damage >= 0.02 ? ` · damage ${Math.round(st.vehicle.damage * 100)}%` : ' · no damage'}`, 'ph-garage', () => this.show('garage')),
        this.row('GPS', st.vehicle.driving ? 'Destinations by road' : 'At the wheel only', 'ph-gps', () => { this.toggle(false); this.host.openGps(); }),
        this.row('Map', '', 'ph-map', () => { this.toggle(false); this.host.openMap(); }),
        this.row('Save game', st.stats, 'ph-save', () => { this.note = this.host.save() ? 'Saved on this device.' : 'Could not save: this browser blocks storage.'; this.show('home'); }),
        this.row('Pause menu', '', 'ph-pause', () => { this.toggle(false); this.host.pause(); }),
      );
      if (this.note) { const n = el('div', 'ph-note', this.note); n.id = 'ph-note'; body.append(n); }
      return;
    }
    if (screen === 'garage') {
      this.title.textContent = 'Garage';
      const v = st.vehicle;
      body.append(el('div', 'ph-step', v.name), el('div', 'ph-sub', v.damage >= 0.02 ? `Damage ${Math.round(v.damage * 100)}%. A badly damaged vehicle is slow.` : 'No damage.'));
      if (v.repair) {
        const b = this.row(`Repair for ${v.repair}`, v.canRepair ? 'Done on the spot.' : 'Not enough money: finish a job first.', 'ph-repair', () => { this.host.repair(); this.show('garage'); }, true);
        b.disabled = !v.canRepair;
        body.append(b);
      }
      body.append(el('div', 'ph-note', 'Any parked car, kapcai, taxi or pickup can be taken: walk up to it.'));
      return;
    }
    // job offers
    this.title.textContent = screen === 'taxi' ? 'Taxi fares' : 'Food delivery';
    if (st.job) { body.append(el('div', 'ph-note', 'Finish or give up the job in hand first.')); return; }
    if (screen === 'taxi' && st.taxiBlock) {
      body.append(el('div', 'ph-note', st.taxiBlock));
      if (st.taxiNear !== null) body.append(this.row('Show the way to a taxi', `About ${Math.max(10, Math.round(st.taxiNear / 10) * 10)} m`, 'ph-find-taxi', () => { this.host.findTaxi(); this.toggle(false); }, true));
      return;
    }
    const wait = el('div', 'ph-note', 'Looking for jobs near you…');
    body.append(wait);
    void this.host.offers(screen).then((list) => {
      if (token !== this.token || !this.open) return;
      wait.remove();
      if (!list.length) { body.append(el('div', 'ph-note', 'No jobs near here just now. Try again somewhere else.')); return; }
      for (const o of list) {
        const b = el('button', 'ph-offer');
        b.type = 'button';
        b.dataset.id = String(o.id);
        b.append(el('span', 'ph-from', o.from), el('span', 'ph-to', `to ${o.to}`), el('span', 'ph-sub', o.meta), el('span', 'ph-fare', o.fare));
        b.addEventListener('click', (e) => { e.stopPropagation(); this.host.accept(o.id); this.toggle(false); });
        body.append(b);
      }
    }, () => { if (token === this.token) wait.textContent = 'Job data could not be loaded.'; });
  }
}
