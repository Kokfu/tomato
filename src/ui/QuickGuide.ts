// UX1 prototype (opt-in, `?ux1=1`): a first-minute controls guide on the Start and Pause cards, and a short message
// when E, G, R or P is pressed and nothing applies. Text and DOM only: no key binding, physics, camera or car change.
// Off (the default) nothing here runs and the page is exactly V8.6. Rollback: delete this file and its main.ts calls.
import { worldDirToBearing } from '../world/GeoProjection.ts';

export const ux1Enabled = (search: string): boolean => new URLSearchParams(search).get('ux1') === '1';

export type HintKind = 'noCar' | 'gps' | 'reset' | 'op';
export type PlayState = 'foot' | 'drive' | 'fly' | 'map' | 'off';
export const HINT_COOLDOWN_MS = 4000;

const POINTS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

/** "about 120 m to the south", from the player to the car (world metres, +z is south). Read-only. */
export function carWhere(dx: number, dz: number): string {
  const m = Math.max(10, Math.round(Math.hypot(dx, dz) / 10) * 10);
  return `about ${m} m to the ${POINTS[Math.round(worldDirToBearing(dx, dz) / 45) % 8]}`;
}

/** The guide lines. Touch wording never mentions keys; keyboard wording lists the real keys. */
export function guideFor(touch: boolean): string[] {
  return touch
    ? ['Walk with the left stick. Drag the view to look, pinch to zoom.',
       'Walking is slow on purpose: tap RUN to run, JUMP to jump.',
       'Your car is parked a few minutes away: tap Pause > Drive Car to stand beside it, then tap Enter Car.']
    : ['Walk with WASD. Hold Shift to run (walking is slow on purpose), Space to jump, mouse to look.',
       'M map, V camera, Esc pause. Click the game to capture the mouse.',
       'Your car is parked a few minutes away: Esc > Drive Car stands you beside it, then press E to get in.'];
}

export const enterCarToast = (touch: boolean): string => (touch ? 'Tap Enter Car to get in.' : 'Press E to enter car.');

/** `car` is null when the car is not placed yet (then there is nothing to point at). */
export function hintText(kind: HintKind, car: { dx: number; dz: number } | null, touch = false): string {
  if (kind === 'noCar') {
    if (car && Math.hypot(car.dx, car.dz) < 30) return 'Move right up to the car to get in.';
    const way = touch ? 'Pause > Drive Car' : 'Esc > Drive Car';
    return car ? `Nothing to use here. The car is ${carWhere(car.dx, car.dz)}: ${way}.` : `Nothing to use here. ${way} takes you to the car.`;
  }
  if (kind === 'gps') return 'GPS works while driving: get in the car first.';
  if (kind === 'reset') return 'R puts the car back on the road: you are not driving.';
  return 'Close the map (M) first to use OP mode.';
}

export interface GuideEnv {
  touch: boolean;
  toast: (text: string, seconds?: number) => void;
  /** What the player is doing. Fly (OP mode) wins over the map, because P leaves OP mode even with the map open. */
  state: () => PlayState;
  /** Player-to-car offset in world metres, or null while the car is not placed. */
  car: () => { dx: number; dz: number } | null;
  /** True in admin mode, where E opens the add-place panel instead of finding nothing. */
  admin: () => boolean;
}

export class QuickGuide {
  private last = new Map<HintKind, number>();
  private env: GuideEnv;
  private opEl: HTMLElement | null = null;
  private opTimer = 0;
  constructor(env: GuideEnv) {
    this.env = env;
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM' || e.code === 'Escape') this.opEl?.classList.add('hidden');
      const kind = ({ KeyG: 'gps', KeyR: 'reset', KeyP: 'op' } as Record<string, HintKind>)[e.code];
      if (!kind || e.repeat || e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement | null)?.closest?.('input,textarea')) return;
      this.hint(kind);
    });
  }

  /** Adds the guide to the Start and Pause cards, and the map-level hint element (created here, so flag-off pages have no extra DOM). */
  mount(): void {
    for (const note of Array.from(document.querySelectorAll('#start .note, #pause .note'))) {
      const el = document.createElement('div');
      el.className = 'guide';
      el.setAttribute('aria-label', 'How to play');
      el.innerHTML = guideFor(this.env.touch).map((t) => `<p>${t}</p>`).join('');
      note.before(el);
    }
    this.opEl = document.createElement('div');
    this.opEl.className = 'guide-hint hidden';
    this.opEl.setAttribute('role', 'status');
    document.body.append(this.opEl);
  }

  /** Shows the message when it applies to what the player is doing, unless it was shown within the cooldown. */
  hint(kind: HintKind, now = performance.now()): boolean {
    const s = this.env.state();
    if (kind === 'op' ? s !== 'map' : s !== 'foot' || (kind === 'noCar' && this.env.admin())) return false;
    if (now - (this.last.get(kind) ?? -Infinity) < HINT_COOLDOWN_MS) return false;
    this.last.set(kind, now);
    const text = hintText(kind, this.env.car(), this.env.touch);
    if (!this.opEl || kind !== 'op') { this.env.toast(text, 3); return true; }
    // The map covers the shared toast, so the OP hint has its own element above the map.
    this.opEl.textContent = text;
    this.opEl.classList.remove('hidden');
    window.clearTimeout(this.opTimer);
    this.opTimer = window.setTimeout(() => this.opEl?.classList.add('hidden'), 3000);
    return true;
  }
}
