// N1-M7: the few sounds of play, all synthesised (no asset): the horn of the driven vehicle, a horn somewhere near,
// a collision and the money coming in. Nothing is scheduled per frame: each sound is a handful of nodes created when
// it starts (an audio parameter written every frame costs frame time on a phone: docs/night/m6a/NOTES.md).

export class Sfx {
  enabled = true;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private horn: { gain: GainNode; stop: () => void } | null = null;
  private noise: AudioBuffer | null = null;
  /** Sounds started (tests and diagnostics): horn, honk, crash, cash. */
  readonly played = { horn: 0, honk: 0, crash: 0, cash: 0 };

  /** Call from a user gesture (the Start button): browsers allow audio only after one. */
  unlock(): void {
    if (this.ctx) { void this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const len = Math.floor(this.ctx.sampleRate * 0.4);
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch { this.ctx = null; }
  }

  private get live(): AudioContext | null { return this.enabled && this.ctx && this.ctx.state === 'running' ? this.ctx : null; }

  /** Two notes a third apart through a low-pass: a car horn. The kapcai's is higher and thinner. */
  private tone(high: boolean, level: number): { gain: GainNode; stop: () => void } | null {
    const ctx = this.live;
    if (!ctx || !this.master) return null;
    const gain = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = high ? 2600 : 1700;
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(level, ctx.currentTime, 0.012);
    lp.connect(gain); gain.connect(this.master);
    const osc = (high ? [610, 760] : [392, 494]).map((f) => {
      const o = ctx.createOscillator();
      o.type = high ? 'square' : 'sawtooth';
      o.frequency.value = f;
      o.connect(lp); o.start();
      return o;
    });
    return {
      gain,
      stop: () => {
        const t = ctx.currentTime;
        gain.gain.cancelScheduledValues(t);
        gain.gain.setTargetAtTime(0, t, 0.02);
        for (const o of osc) o.stop(t + 0.15);
        window.setTimeout(() => { try { gain.disconnect(); lp.disconnect(); } catch { /* already gone */ } }, 400);
      },
    };
  }

  /** The player's horn: sounds while held. */
  hornOn(high: boolean): void {
    if (this.horn) return;
    this.played.horn++;
    this.horn = this.tone(high, 0.5);
  }
  hornOff(): void {
    this.horn?.stop();
    this.horn = null;
  }

  /** Another driver hoots, `dist` metres away. */
  honk(dist: number, high = false): void {
    this.played.honk++;
    const t = this.tone(high, 0.42 / (1 + dist * dist / 180));
    if (t) window.setTimeout(t.stop, 320);
  }

  /** A blow at `speed` m/s: a short burst of filtered noise and a low thump. */
  crash(speed: number): void {
    this.played.crash++;
    const ctx = this.live;
    if (!ctx || !this.master || !this.noise) return;
    const level = Math.min(1, 0.25 + speed / 14), t = ctx.currentTime;
    const src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = this.noise;
    bp.type = 'lowpass'; bp.frequency.value = 900 + speed * 120;
    g.gain.setValueAtTime(level * 0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 0.32);
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    og.gain.setValueAtTime(level * 0.8, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(og); og.connect(this.master);
    o.start(t); o.stop(t + 0.24);
  }

  /** Money in: two short rising notes. */
  cash(): void {
    this.played.cash++;
    const ctx = this.live;
    if (!ctx || !this.master) return;
    [1318, 1760].forEach((f, i) => {
      const t = ctx.currentTime + i * 0.09, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.28, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
      o.connect(g); g.connect(this.master!);
      o.start(t); o.stop(t + 0.28);
    });
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.hornOff();
  }
}
