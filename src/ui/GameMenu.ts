import { QUALITY, saveQuality } from './GraphicsSettings.ts';
import type { QualityName } from './GraphicsSettings.ts';

const $ = (id: string) => document.getElementById(id)!;

export interface MenuCallbacks {
  onStart: () => void;
  onResume: () => void;
  onPause: () => void;
  onReset: () => void;
  onQuality: (q: QualityName) => void;
  onAdaptive: (on: boolean) => void;
  onSensitivity: (v: number) => void;
  onToggleView: () => void;
  onToggleMap: () => void;
}

/** Start screen, pause menu, settings panel and HUD text. */
export class GameMenu {
  private cb: MenuCallbacks;
  private toastTimer = 0;
  private settingsFromPause = false;
  showStats = false;

  constructor(cb: MenuCallbacks, quality: QualityName) {
    this.cb = cb;
    $('btn-start').addEventListener('click', () => {
      $('start').classList.add('hidden');
      $('hud').classList.remove('hidden');
      cb.onStart();
    });
    $('btn-pause').addEventListener('click', () => this.pause());
    $('pause-resume').addEventListener('click', () => this.resume());
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
