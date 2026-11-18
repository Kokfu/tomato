import type { Input } from '../player/Input.ts';

/** What the touch layer drives: the walking character (joystick) or the car (V8.5 pedals and steering). */
export type TouchMode = 'walk' | 'drive';

type Pedal = 'steer' | 'gas' | 'brake' | 'hb';

/**
 * Touch controls. On foot: a virtual joystick (left), run / jump buttons (right). At the wheel (V8.5): a steering
 * pad (left; analogue by finger position), gas, brake / reverse and handbrake (right), and tap buttons for getting
 * out, the camera distance and the road reset. Drag-to-look and pinch-to-zoom on the rest of the screen in both.
 *
 * The car is driven through the same Input fields as the keyboard (touchX = steer, touchY = throttle, handbrake), so
 * the vehicle physics is shared. Every held control is tracked by its touch identifier and released on lift, touch
 * cancel, lost focus, a hidden page, an orientation change, a mode change or a menu opening (Input disabled).
 * All handlers call preventDefault so the page never scrolls or zooms.
 */
export class MobileControls {
  private input: Input;
  private joyId = -1;
  private lookId = -1;
  private lookX = 0;
  private lookY = 0;
  private pinch = 0;
  private stick: HTMLElement;
  private joy: HTMLElement;
  /** Touch identifier -> the driving control it holds down. */
  private held = new Map<number, Pedal>();
  private steer = 0;
  private steerPad: HTMLElement;
  private steerKnob: HTMLElement;
  private pedalEls: Record<Pedal, HTMLElement>;
  private exitBtn: HTMLElement;
  mode: TouchMode = 'walk';
  /** Releases performed (tests and diagnostics). */
  releases = 0;

  constructor(input: Input, canvas: HTMLElement) {
    this.input = input;
    const root = document.getElementById('touch')!;
    root.classList.remove('hidden');
    document.body.classList.add('touch');
    this.joy = document.getElementById('joystick')!;
    this.stick = document.getElementById('stick')!;
    const opts = { passive: false } as AddEventListenerOptions;

    this.joy.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (!this.input.enabled) return;
      const t = e.changedTouches[0];
      this.joyId = t.identifier;
      this.moveStick(t);
    }, opts);
    this.joy.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) if (t.identifier === this.joyId) this.moveStick(t);
    }, opts);
    const endJoy = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) if (t.identifier === this.joyId) this.releaseJoystick();
    };
    this.joy.addEventListener('touchend', endJoy, opts);
    this.joy.addEventListener('touchcancel', endJoy, opts);

    const run = document.getElementById('btn-run')!;
    run.addEventListener('touchstart', (e) => {
      e.preventDefault();
      // Tap toggles run so the thumb is free for looking around.
      this.input.touchRun = !this.input.touchRun;
      run.classList.toggle('active', this.input.touchRun);
    }, opts);
    const jump = document.getElementById('btn-jump')!;
    jump.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.input.enabled) this.input.jump = true;
    }, opts);

    // --- Driving (V8.5) ---------------------------------------------------------------------------------
    this.steerPad = document.getElementById('steer-pad')!;
    this.steerKnob = document.getElementById('steer-knob')!;
    this.pedalEls = {
      steer: this.steerPad,
      gas: document.getElementById('btn-gas')!,
      brake: document.getElementById('btn-brake')!,
      hb: document.getElementById('btn-hb')!,
    };
    for (const [kind, el] of Object.entries(this.pedalEls) as [Pedal, HTMLElement][]) {
      el.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (!this.input.enabled || this.mode !== 'drive') return;
        for (const t of Array.from(e.changedTouches)) {
          this.held.set(t.identifier, kind);
          if (kind === 'steer') this.steerFrom(t);
        }
        this.apply();
      }, opts);
      el.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (kind !== 'steer') return;
        for (const t of Array.from(e.changedTouches)) if (this.held.get(t.identifier) === 'steer') this.steerFrom(t);
        this.apply();
      }, opts);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    // Lifts and cancels are handled at the document so a finger that slid off its button still releases it; every
    // touch event also drops held controls whose finger is no longer on the screen (a missed touchend).
    const lift = (e: TouchEvent) => {
      let changed = false;
      for (const t of Array.from(e.changedTouches)) if (this.held.delete(t.identifier)) changed = true;
      if (this.pruneHeld(e.touches)) changed = true;
      if (changed) this.apply();
    };
    document.addEventListener('touchend', lift, { capture: true });
    document.addEventListener('touchcancel', lift, { capture: true });
    document.addEventListener('touchstart', (e) => { if (this.pruneHeld(e.touches)) this.apply(); }, { capture: true });

    this.exitBtn = document.getElementById('btn-exit')!;
    tap(this.exitBtn, () => this.input.trigger('interact'));
    tap(document.getElementById('btn-cam')!, () => this.input.trigger('view'));
    tap(document.getElementById('btn-reset')!, () => this.input.trigger('reset'));
    // The GPS button and its destination list: taps work while another finger holds a pedal (a synthetic click is
    // not guaranteed during multitouch), and they never reach the pedals or the camera.
    const gpsBtn = document.getElementById('gps-btn');
    if (gpsBtn) tap(gpsBtn, () => gpsBtn.click());
    const gpsPanel = document.getElementById('gps-panel');
    if (gpsPanel) tapDelegate(gpsPanel);
    const navHint = document.getElementById('nav-hint');
    if (navHint) tapDelegate(navHint);

    // Anything that takes the fingers away from the game lets go of every control.
    window.addEventListener('blur', () => this.releaseAll());
    window.addEventListener('pagehide', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.releaseAll(); });
    window.addEventListener('orientationchange', () => this.releaseAll());
    screen.orientation?.addEventListener?.('change', () => this.releaseAll());

    // Drag-to-look and pinch-to-zoom on the 3D canvas.
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (e.touches.length >= 2 && this.joyId < 0) {
        this.pinch = this.pinchDist(e);
      }
      if (this.lookId < 0) {
        const t = e.changedTouches[0];
        this.lookId = t.identifier;
        this.lookX = t.clientX;
        this.lookY = t.clientY;
      }
    }, opts);
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (!this.input.enabled) return;
      const onCanvas = Array.from(e.touches).filter((t) => t.target === canvas);
      if (onCanvas.length >= 2) {
        const d = Math.hypot(onCanvas[0].clientX - onCanvas[1].clientX, onCanvas[0].clientY - onCanvas[1].clientY);
        if (this.pinch > 0) this.input.zoom += (this.pinch - d) * 0.02;
        this.pinch = d;
        return;
      }
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier !== this.lookId) continue;
        this.input.lookYaw -= (t.clientX - this.lookX) * 0.0052;
        this.input.lookPitch -= (t.clientY - this.lookY) * 0.0052;
        this.lookX = t.clientX;
        this.lookY = t.clientY;
      }
    }, opts);
    const endLook = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) if (t.identifier === this.lookId) this.lookId = -1;
      this.pinch = 0;
    };
    canvas.addEventListener('touchend', endLook, opts);
    canvas.addEventListener('touchcancel', endLook, opts);
    // Block double-tap zoom / long-press menus over the HUD.
    document.addEventListener('gesturestart', (e) => e.preventDefault());
  }

  /**
   * Called once per frame by the game loop (cheap): switches the control set when the player gets in or out of the
   * car and lets go of everything while gameplay input is off (pause, settings, full map, place panel).
   */
  update(mode: TouchMode, enabled: boolean, canExit: boolean): void {
    if (mode !== this.mode) {
      this.releaseAll();
      this.mode = mode;
      document.body.classList.toggle('touch-drive', mode === 'drive');
    }
    if (!enabled && this.holding) this.releaseAll();
    this.exitBtn.classList.toggle('dim', !canExit);
  }

  /** True while any finger holds a control (joystick, pedal, steering, look). */
  get holding(): boolean {
    return this.held.size > 0 || this.joyId >= 0 || this.lookId >= 0 || this.input.touchX !== 0 || this.input.touchY !== 0 || this.input.touchHandbrake;
  }

  /** Let go of every held control: no steering, no throttle, no handbrake, joystick centred. */
  releaseAll(): void {
    this.releases++;
    this.held.clear();
    this.steer = 0;
    this.releaseJoystick();
    this.lookId = -1;
    this.pinch = 0;
    this.apply();
  }

  private releaseJoystick(): void {
    this.joyId = -1;
    this.input.touchX = this.input.touchY = 0;
    this.stick.style.transform = '';
  }

  /** Drop held controls whose finger is no longer in `touches`. */
  private pruneHeld(touches: TouchList): boolean {
    if (!this.held.size) return false;
    const live = new Set(Array.from(touches, (t) => t.identifier));
    let changed = false;
    for (const id of [...this.held.keys()]) if (!live.has(id)) { this.held.delete(id); changed = true; }
    return changed;
  }

  /** Analogue steering from the finger's place on the pad: full lock at 70 % of the half-width, small dead zone. */
  private steerFrom(t: Touch): void {
    const r = this.steerPad.getBoundingClientRect();
    const half = r.width / 2;
    const v = Math.max(-1, Math.min(1, (t.clientX - (r.left + half)) / (half * 0.7)));
    this.steer = Math.abs(v) < 0.08 ? 0 : v;
  }

  /** Write the held driving controls into Input (the same fields the keyboard path reads). */
  private apply(): void {
    if (this.mode !== 'drive') {
      this.input.touchHandbrake = false;
      return;
    }
    const kinds = new Set(this.held.values());
    if (!kinds.has('steer')) this.steer = 0;
    // Brake wins over gas: holding both never drives the car forward.
    const throttle = kinds.has('brake') ? -1 : kinds.has('gas') ? 1 : 0;
    this.input.touchX = this.steer;
    this.input.touchY = throttle;
    this.input.touchHandbrake = kinds.has('hb');
    for (const k of ['gas', 'brake', 'hb'] as const) this.pedalEls[k].classList.toggle('active', kinds.has(k));
    this.steerPad.classList.toggle('active', this.steer !== 0);
    this.steerKnob.style.transform = this.steer ? `translateX(${(this.steer * (this.steerPad.clientWidth / 2 - 30)).toFixed(1)}px)` : '';
  }

  private pinchDist(e: TouchEvent): number {
    return Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  }

  private moveStick(t: Touch): void {
    const r = this.joy.getBoundingClientRect();
    const max = r.width / 2;
    let dx = t.clientX - (r.left + max), dy = t.clientY - (r.top + max);
    const len = Math.hypot(dx, dy);
    if (len > max) { dx *= max / len; dy *= max / len; }
    this.stick.style.transform = `translate(${dx * 0.7}px, ${dy * 0.7}px)`;
    const dead = 0.12;
    const nx = dx / max, ny = -dy / max;
    const m = Math.hypot(nx, ny);
    this.input.touchX = m < dead ? 0 : nx;
    this.input.touchY = m < dead ? 0 : ny;
  }
}

/** Distance a finger may move and still count as a tap (px). */
const TAP_SLOP = 14;

/**
 * A tap button driven by its own touch identifier: fires when that finger lifts on (or near) the button, even while
 * other fingers hold pedals. Mouse clicks still work (desktop emulation); a touch tap never fires twice.
 */
function tap(el: HTMLElement, fn: () => void): void {
  let id = -1, x = 0, y = 0;
  const opts = { passive: false } as AddEventListenerOptions;
  el.addEventListener('touchstart', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const t = e.changedTouches[0];
    id = t.identifier; x = t.clientX; y = t.clientY;
  }, opts);
  el.addEventListener('touchend', (e) => {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier !== id) continue;
      id = -1;
      if (Math.hypot(t.clientX - x, t.clientY - y) <= TAP_SLOP) fn();
    }
  }, opts);
  el.addEventListener('touchcancel', () => { id = -1; });
  // Mouse / pen only: a touch tap was already handled above and its synthetic click is suppressed.
  el.addEventListener('click', (e) => { if ((e as PointerEvent).pointerType === 'touch') e.stopImmediatePropagation(); }, { capture: true });
}

/** Taps on any enabled button inside `root` (lists that scroll keep their native pan). */
function tapDelegate(root: HTMLElement): void {
  const starts = new Map<number, { x: number; y: number; btn: HTMLButtonElement | null }>();
  root.addEventListener('touchstart', (e) => {
    for (const t of Array.from(e.changedTouches)) {
      const btn = (t.target as Element | null)?.closest?.('button') as HTMLButtonElement | null;
      starts.set(t.identifier, { x: t.clientX, y: t.clientY, btn: btn && root.contains(btn) ? btn : null });
    }
  }, { passive: true });
  root.addEventListener('touchend', (e) => {
    for (const t of Array.from(e.changedTouches)) {
      const s = starts.get(t.identifier);
      starts.delete(t.identifier);
      if (!s?.btn) continue;
      // No synthetic click follows; a finger that moved was scrolling the list.
      e.preventDefault();
      if (!s.btn.disabled && Math.hypot(t.clientX - s.x, t.clientY - s.y) <= TAP_SLOP) s.btn.click();
    }
  }, { passive: false });
  root.addEventListener('touchcancel', (e) => { for (const t of Array.from(e.changedTouches)) starts.delete(t.identifier); });
}
