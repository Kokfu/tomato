// CHAR-P5 G2: the character selection screen (only with ?char; loaded by a dynamic import, so the default game never requests it).
//
// Plain DOM, no three.js. It owns the picker's own state (selection, loading, error) and the keyboard rules; the game
// (main.ts) owns what a choice does (warm the model on selection, swap on confirm, pause and resume).
//
//   role=dialog (aria-modal) > radiogroup of six cards (roving tabindex: one Tab stop) + a bar with status, Cancel and the
//   confirm button. Enter confirms, Escape cancels (not on first launch), Tab is trapped inside, and every other key is
//   swallowed while it is open so the game never sees it. #hud and #touch are hidden by `body.picker-open` (main.css).
import { pickerProfiles } from '../player/character/CharacterProfile.ts';

export type PickerMode = 'first' | 'change';
/** What a confirmed choice came to: installed, failed (the player may try again), or replaced by a newer request. */
export type ConfirmResult = 'ok' | 'error' | 'superseded';

export interface PickerHooks {
  /** App base URL (portraits are `<base>ui/portraits/<id>.webp`). */
  baseUrl: string;
  /** A card became the selection (click, tap or arrow key): the game starts preparing that model. */
  onSelect(id: string): void;
  /** Confirm / Try again: make `id` the character. */
  onConfirm(id: string): Promise<ConfirmResult>;
  /** Cancel / Escape (change mode only). A choice still loading is abandoned. */
  onCancel(): void;
}

type State = 'idle' | 'busy' | 'error';

export class CharacterPicker {
  private readonly hooks: PickerHooks;
  private root: HTMLElement | null = null;
  private cards: HTMLButtonElement[] = [];
  private grid!: HTMLElement;
  private status!: HTMLElement;
  private confirmBtn!: HTMLButtonElement;
  private cancelBtn!: HTMLButtonElement;
  private mode: PickerMode = 'first';
  private current: string | null = null;
  private sel: string | null = null;
  private state: State = 'idle';
  private run = 0;
  private opener: Element | null = null;
  private readonly keys = (e: KeyboardEvent) => this.onKey(e);
  isOpen = false;

  constructor(hooks: PickerHooks) { this.hooks = hooks; }

  /** The id selected now (null when none). */
  get selected(): string | null { return this.sel; }
  /** 'idle' | 'busy' | 'error' (diagnostics and tests). */
  get phase(): State { return this.state; }

  open(mode: PickerMode, current: string | null): void {
    this.build();
    this.mode = mode;
    this.current = current && pickerProfiles().some((p) => p.id === current) ? current : null;
    this.sel = mode === 'change' ? this.current : null;
    this.state = 'idle';
    ++this.run;
    const r = this.root!;
    r.dataset.mode = mode;
    this.cancelBtn.classList.toggle('hidden', mode === 'first');
    this.markCurrent();
    this.opener = document.activeElement;
    r.classList.remove('hidden');
    document.body.classList.add('picker-open');
    this.isOpen = true;
    window.addEventListener('keydown', this.keys, true);
    window.addEventListener('keyup', this.swallowUp, true);
    this.render();
    (this.cards.find((b) => b.tabIndex === 0) ?? this.cards[0]).focus({ preventScroll: true });
  }

  /** Hide it. `restoreFocus`: put the focus back where it was (Cancel); after a successful switch the game takes it. */
  close(restoreFocus = false): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    ++this.run;
    this.root!.classList.add('hidden');
    document.body.classList.remove('picker-open');
    window.removeEventListener('keydown', this.keys, true);
    window.removeEventListener('keyup', this.swallowUp, true);
    const o = this.opener as HTMLElement | null;
    this.opener = null;
    if (restoreFocus && o && o.isConnected && typeof o.focus === 'function') o.focus({ preventScroll: true });
    else (document.activeElement as HTMLElement | null)?.blur?.();
  }

  private readonly swallowUp = (e: KeyboardEvent) => { e.stopImmediatePropagation(); };

  private build(): void {
    if (this.root) return;
    const profiles = pickerProfiles();
    const r = document.createElement('div');
    r.id = 'char-picker';
    r.className = 'picker hidden';
    r.setAttribute('role', 'dialog');
    r.setAttribute('aria-modal', 'true');
    r.setAttribute('aria-labelledby', 'pk-title');
    r.setAttribute('aria-describedby', 'pk-sub');
    r.dataset.mode = 'first';
    r.innerHTML = `
      <header class="pk-head">
        <p class="pk-eyebrow">KUCHING 3D</p>
        <h2 id="pk-title">Choose your character</h2>
        <p class="pk-sub" id="pk-sub"><span lang="ms">Pilih watak anda</span> &middot; Who's exploring Kuching today?</p>
        <div class="pk-rule" aria-hidden="true"></div>
      </header>
      <div class="pk-grid" id="pk-grid" role="radiogroup" aria-labelledby="pk-title"></div>
      <footer class="pk-bar">
        <p class="pk-status" id="pk-status" aria-live="polite"></p>
        <button class="pk-btn" id="pk-cancel" type="button">Cancel<kbd>Esc</kbd></button>
        <button class="pk-btn primary" id="pk-confirm" type="button"></button>
      </footer>`;
    document.body.appendChild(r);
    this.root = r;
    this.grid = r.querySelector('#pk-grid') as HTMLElement;
    this.status = r.querySelector('#pk-status') as HTMLElement;
    this.confirmBtn = r.querySelector('#pk-confirm') as HTMLButtonElement;
    this.cancelBtn = r.querySelector('#pk-cancel') as HTMLButtonElement;
    const base = this.hooks.baseUrl;
    this.cards = profiles.map((p) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pk-card';
      b.dataset.id = p.id;
      b.setAttribute('role', 'radio');
      const art = document.createElement('span');
      art.className = 'pk-art';
      const img = document.createElement('img');
      img.src = `${base}ui/portraits/${p.id}.webp`;
      img.srcset = `${base}ui/portraits/${p.id}.webp 240w, ${base}ui/portraits/${p.id}@2x.webp 480w`;
      img.sizes = '(max-height: 500px) and (orientation: landscape) 90px, (max-width: 600px) 50vw, 250px';
      img.width = 240; img.height = 300; img.alt = ''; img.decoding = 'async';
      art.append(img);
      const tick = document.createElement('span');
      tick.className = 'pk-check'; tick.setAttribute('aria-hidden', 'true'); tick.textContent = '✓';
      art.append(tick);
      const meta = document.createElement('span');
      meta.className = 'pk-meta';
      const name = document.createElement('span'); name.className = 'pk-name'; name.textContent = p.picker!.name;
      const h = document.createElement('span'); h.className = 'pk-h'; h.textContent = p.picker!.height;
      meta.append(name, h);
      b.append(art, meta);
      b.addEventListener('click', () => this.select(p.id, true));
      this.grid.appendChild(b);
      return b;
    });
    this.confirmBtn.addEventListener('click', () => this.confirm());
    this.cancelBtn.addEventListener('click', () => this.cancel());
  }

  private nameOf(id: string): string { return pickerProfiles().find((p) => p.id === id)?.picker?.name ?? id; }
  private heightOf(id: string): string { return pickerProfiles().find((p) => p.id === id)?.picker?.height ?? ''; }

  private markCurrent(): void {
    for (const b of this.cards) {
      const old = b.querySelector('.pk-current');
      if (old) old.remove();
      const p = pickerProfiles().find((x) => x.id === b.dataset.id)!;
      const isCur = b.dataset.id === this.current;
      b.setAttribute('aria-label', `${p.picker!.name}, ${p.picker!.height} tall${isCur ? ', current character' : ''}`);
      if (isCur) {
        const pill = document.createElement('span');
        pill.className = 'pk-current'; pill.setAttribute('aria-hidden', 'true'); pill.textContent = 'Current';
        b.querySelector('.pk-art')!.append(pill);
      }
    }
  }

  private columns(): number { return getComputedStyle(this.grid).gridTemplateColumns.split(' ').length; }

  /** `focus`: move the keyboard focus to the card (a click or an arrow key). */
  select(id: string, focus = false): void {
    if (this.state === 'busy') return;
    if (this.state === 'error' && id !== this.sel) this.state = 'idle';
    this.sel = id;
    this.render();
    if (focus) this.cards.find((b) => b.dataset.id === id)?.focus({ preventScroll: true });
    this.hooks.onSelect(id);
  }

  private onCardKey(e: KeyboardEvent, i: number): void {
    const n = this.cards.length, c = this.columns();
    const to = ({ ArrowRight: i + 1, ArrowLeft: i - 1, ArrowDown: i + c, ArrowUp: i - c, Home: 0, End: n - 1 } as Record<string, number>)[e.key];
    if (to !== undefined) {
      e.preventDefault();
      // Down from the last row (and Up from the first) stays put on a grid; Left/Right wrap.
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && (to < 0 || to >= n)) return;
      this.select(this.cards[(to + n) % n].dataset.id!, true);
    } else if (e.key === ' ') { e.preventDefault(); this.select(this.cards[i].dataset.id!, true); }
  }

  private render(): void {
    const id = this.sel;
    const root = this.root!;
    for (const b of this.cards) {
      const on = b.dataset.id === id;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on || (!id && b === this.cards[0]) ? 0 : -1; // roving tabindex: the radiogroup is one Tab stop
      const old = b.querySelector('.pk-err-badge');
      if (old) old.remove();
      if (on && this.state === 'error') {
        const bad = document.createElement('span');
        bad.className = 'pk-err-badge'; bad.setAttribute('aria-hidden', 'true'); bad.textContent = '!';
        b.querySelector('.pk-art')!.append(bad);
      }
    }
    root.setAttribute('aria-busy', String(this.state === 'busy'));
    this.status.classList.toggle('pk-error', this.state === 'error' && !!id);
    this.confirmBtn.classList.remove('pk-progress');
    const st = this.status;
    st.textContent = '';
    const bold = (t: string) => { const b = document.createElement('b'); b.textContent = t; return b; };
    const muted = (t: string) => { const s = document.createElement('span'); s.className = 'muted'; s.textContent = t; return s; };
    const kbd = () => { const k = document.createElement('kbd'); k.textContent = 'Enter'; return k; };
    const btn = (label: string, withKey: boolean) => { this.confirmBtn.textContent = label; if (withKey) this.confirmBtn.append(kbd()); };
    if (this.state === 'error' && id) {
      const keep = this.mode === 'change' && this.current ? ` You're still playing as ${this.nameOf(this.current)}.` : '';
      st.append(bold(`Couldn't load ${this.nameOf(id)}.`), document.createTextNode(` Check your connection and try again.${keep}`));
      btn('Try again', true); this.confirmBtn.disabled = false;
    } else if (this.state === 'busy' && id) {
      st.append(bold(this.nameOf(id)), document.createTextNode(' '), muted('· getting ready…'));
      btn('Loading…', false); this.confirmBtn.disabled = true; this.confirmBtn.classList.add('pk-progress');
    } else if (!id) {
      st.append(muted('Tap a character to see them here.'));
      btn('Choose a character', false); this.confirmBtn.disabled = true;
    } else if (this.mode !== 'first' && id === this.current) {
      st.append(bold(this.nameOf(id)), document.createTextNode(' '), muted(`· ${this.heightOf(id)} · playing now`));
      btn('Already playing', false); this.confirmBtn.disabled = true;
    } else {
      st.append(bold(this.nameOf(id)), document.createTextNode(' '), muted(`· ${this.heightOf(id)}`));
      btn(`${this.mode === 'first' ? 'Play as' : 'Switch to'} ${this.nameOf(id)}`, true); this.confirmBtn.disabled = false;
    }
  }

  /** Confirm the selection (button or Enter), or retry after an error. */
  confirm(): void {
    if (!this.isOpen || this.confirmBtn.disabled || !this.sel || this.state === 'busy') return;
    const id = this.sel;
    const mine = ++this.run;
    this.state = 'busy';
    this.render();
    void this.hooks.onConfirm(id).then((r) => {
      if (mine !== this.run || !this.isOpen) return; // cancelled or closed meanwhile
      if (r === 'ok') { this.close(); return; }
      this.state = r === 'error' ? 'error' : 'idle';
      this.render();
      // The busy state disabled the focused control: keep the keyboard on the selection.
      this.cards.find((b) => b.dataset.id === this.sel)?.focus({ preventScroll: true });
    });
  }

  /** Cancel / Escape. Does nothing on first launch (there is nothing to go back to). */
  cancel(): void {
    if (!this.isOpen || this.mode === 'first') return;
    ++this.run;
    this.hooks.onCancel();
    this.close(true);
  }

  private onKey(e: KeyboardEvent): void {
    // The game never sees a key while the picker is open (Input listens on window; this runs first, in the capture phase).
    e.stopImmediatePropagation();
    if (e.key === 'Escape') { e.preventDefault(); this.cancel(); return; }
    if (e.key === 'Enter') {
      if (document.activeElement === this.cancelBtn) return; // Enter on Cancel is Cancel (the click it makes)
      e.preventDefault();
      this.confirm();
      return;
    }
    const ci = this.cards.indexOf(document.activeElement as HTMLButtonElement);
    if (ci >= 0 && e.key !== 'Tab') { this.onCardKey(e, ci); return; } // (the capture-phase trap stops the event before the card's own listener)
    if (e.key === 'Tab') {
      const f = [...this.root!.querySelectorAll('button')].filter((b) => !b.disabled && b.tabIndex >= 0 && b.offsetParent !== null) as HTMLElement[];
      if (!f.length) { e.preventDefault(); return; }
      const k = f.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && k <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && (k === f.length - 1 || k < 0)) { e.preventDefault(); f[0].focus(); }
    }
  }
}
