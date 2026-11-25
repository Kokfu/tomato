import { QUALITY, saveQuality } from './GraphicsSettings.ts';
import type { QualityName } from './GraphicsSettings.ts';
import { buildLabel } from '../version.ts';
import type { RainMode, TimeMode } from '../world/dayCycle.ts';

const $ = (id: string) => document.getElementById(id)!;

export interface MenuCallbacks {
  onStart: () => void;
  onResume: () => void;
  onPause: () => void;
  onReset: () => void;
  /** Pause menu "Drive Car": take the character to the car (the menu stays open until it is there). */
  onDriveCar?: () => void;
  /** "Change character" row of the pause menu (shown only with ?char): open the character picker. Not called while the row is blocked. */
  onChangeCharacter?: () => void;
  onQuality: (q: QualityName) => void;
  onAdaptive: (on: boolean) => void;
  onSensitivity: (v: number) => void;
  onToggleView: () => void;
  onToggleMap: () => void;
  /** 'auto': the day passes; the others stop the clock at that time. */
  onTimeOfDay?: (t: TimeMode) => void;
  /** 'auto': occasional showers. */
  onRain?: (r: RainMode) => void;
  onSound?: (on: boolean) => void;
}

/** Start screen, pause menu, settings panel and HUD text. */
export class GameMenu {
  private cb: MenuCallbacks;
  private toastTimer = 0;
  private settingsFromPause = false;
  showStats = false;

  constructor(cb: MenuCallbacks, quality: QualityName, modes: { time: TimeMode; rain: RainMode } = { time: 'day', rain: 'off' }) {
    this.cb = cb;
    $('btn-start').addEventListener('click', () => {
      $('start').classList.add('hidden');
      $('hud').classList.remove('hidden');
      cb.onStart();
    });
    $('btn-pause').addEventListener('click', () => this.pause());
    $('pause-resume').addEventListener('click', () => this.resume());
    $('pause-drive').addEventListener('click', () => cb.onDriveCar?.());
    $('pause-char').addEventListener('click', () => { if ($('pause-char').getAttribute('aria-disabled') !== 'true') cb.onChangeCharacter?.(); });
    $('build-version').textContent = `Version: ${buildLabel()}`;
    $('pause-reset').addEventListener('click', () => {
      cb.onReset();
      this.resume();
    });
    $('pause-settings').addEventListener('click', () => {
      this.settingsFromPause = true;
      $('pause').classList.add('hidden');
      $('settings').classList.remove('hidden');
    });
    $('btn-settings').addEventListener('click', () => {
      this.settingsFromPause = false;
      $('settings').classList.remove('hidden');
      cb.onPause();
    });
    $('settings-close').addEventListener('click', () => {
      $('settings').classList.add('hidden');
      if (this.settingsFromPause) $('pause').classList.remove('hidden');
      else cb.onResume();
    });
    $('btn-view').addEventListener('click', () => cb.onToggleView());
    $('btn-map').addEventListener('click', () => cb.onToggleMap());
    for (const b of Array.from($('quality-seg').querySelectorAll('button'))) {
      b.addEventListener('click', () => {
        const q = b.dataset.q as QualityName;
        if (!QUALITY[q]) return;
        this.markQuality(q);
        saveQuality(q);
        cb.onQuality(q);
      });
    }
    this.markQuality(quality);
    ($('opt-adaptive') as HTMLInputElement).addEventListener('change', (e) => cb.onAdaptive((e.target as HTMLInputElement).checked));
    ($('opt-stats') as HTMLInputElement).addEventListener('change', (e) => {
      this.showStats = (e.target as HTMLInputElement).checked;
      $('stats').classList.toggle('hidden', !this.showStats);
    });
    // N1-M6: time of day and rain. The choice is kept for the next visit.
    const seg = (id: string, key: 't' | 'r', store: string, current: string, pick: (v: string) => void) => {
      const buttons = Array.from($(id).querySelectorAll('button'));
      for (const b of buttons) {
        b.classList.toggle('active', b.dataset[key] === current);
        b.addEventListener('click', () => {
          for (const o of buttons) o.classList.toggle('active', o === b);
          try { localStorage.setItem(store, b.dataset[key]!); } catch { /* storage unavailable */ }
          pick(b.dataset[key]!);
        });
      }
    };
    seg('time-seg', 't', 'k3d.time', modes.time, (v) => cb.onTimeOfDay?.(v as TimeMode));
    seg('rain-seg', 'r', 'k3d.rain', modes.rain, (v) => cb.onRain?.(v as RainMode));
    ($('opt-sound') as HTMLInputElement).addEventListener('change', (e) => cb.onSound?.((e.target as HTMLInputElement).checked));
    ($('opt-sens') as HTMLInputElement).addEventListener('input', (e) => cb.onSensitivity(parseFloat((e.target as HTMLInputElement).value)));
  }

  private markQuality(q: QualityName): void {
    for (const b of Array.from($('quality-seg').querySelectorAll('button'))) b.classList.toggle('active', b.dataset.q === q);
  }

  get anyModalOpen(): boolean {
    return !$('pause').classList.contains('hidden') || !$('settings').classList.contains('hidden') || !$('start').classList.contains('hidden');
  }

  pause(): void {
    if (!$('start').classList.contains('hidden')) return;
    $('settings').classList.add('hidden');
    $('pause').classList.remove('hidden');
    this.cb.onPause();
  }

  /** State of the pause menu's Drive Car button (busy while the car's surroundings load). */
  setDriveCar(text: string, enabled: boolean, title = ''): void {
    const b = $('pause-drive') as HTMLButtonElement;
    if (b.textContent !== text) b.textContent = text;
    b.disabled = !enabled;
    b.title = title;
  }

  /**
   * CHAR-P5 G2: the pause menu's "Change character" row. Hidden (null) unless ?char is on. `blocked` is the reason to show
   * (driving, flying): the button then carries aria-disabled (it stays focusable, the reason is read out by aria-describedby)
   * and ignores clicks, and the reason line appears under it.
   */
  setCharacterButton(state: { blocked: string | null } | null): void {
    const b = $('pause-char') as HTMLButtonElement;
    b.classList.toggle('hidden', state === null);
    if (state === null) { $('pause-char-why')?.classList.add('hidden'); return; }
    if (b.textContent !== 'Change character') b.textContent = 'Change character';
    b.title = '';
    let why = document.getElementById('pause-char-why');
    if (!why) {
      why = document.createElement('p');
      why.id = 'pause-char-why';
      why.className = 'pause-why hidden';
      why.setAttribute('role', 'status');
      b.insertAdjacentElement('afterend', why);
    }
    if (state.blocked) {
      b.setAttribute('aria-disabled', 'true');
      b.setAttribute('aria-describedby', 'pause-char-why');
      if (why.textContent !== state.blocked) why.textContent = state.blocked;
      why.classList.remove('hidden');
    } else {
      b.removeAttribute('aria-disabled');
      b.removeAttribute('aria-describedby');
      why.classList.add('hidden');
    }
  }

  private pauseHeld = false;
  /** CHAR-P5 G2: the picker covers the pause menu: it is hidden while the picker is open and comes back on Cancel. */
  setPickerOpen(open: boolean, restorePause: boolean): void {
    const p = $('pause');
    if (open) { this.pauseHeld = !p.classList.contains('hidden'); p.classList.add('hidden'); return; }
    if (restorePause && this.pauseHeld) p.classList.remove('hidden');
    this.pauseHeld = false;
  }

  resume(): void {
    $('pause').classList.add('hidden');
    $('settings').classList.add('hidden');
    this.cb.onResume();
  }

  togglePause(): void {
    if ($('pause').classList.contains('hidden') && $('settings').classList.contains('hidden')) this.pause();
    else this.resume();
  }

  setLoading(fraction: number, text: string, ready: boolean): void {
    $('load-fill').style.width = `${Math.round(fraction * 100)}%`;
    $('load-text').textContent = text;
    ($('btn-start') as HTMLButtonElement).disabled = !ready;
  }

  showError(text: string): void {
    $('load-text').textContent = text;
    $('load-text').style.color = '#ff9b8a';
  }

  setLocation(name: string, lat: number, lon: number): void {
    $('loc-name').textContent = name;
    $('loc-coords').textContent = `${Math.abs(lat).toFixed(5)}°${lat >= 0 ? 'N' : 'S'}  ${Math.abs(lon).toFixed(5)}°${lon >= 0 ? 'E' : 'W'}`;
  }

  setChunkLoading(on: boolean): void {
    $('chunk-loading').classList.toggle('hidden', !on);
  }

  setStats(text: string): void {
    $('stats').textContent = text;
  }

  toast(text: string, seconds = 1.6): void {
    const el = $('toast');
    if (el.textContent !== text) el.textContent = text;
    el.classList.remove('hidden');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => el.classList.add('hidden'), seconds * 1000);
  }
}
