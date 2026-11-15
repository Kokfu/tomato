// Synthesised footstep audio (Web Audio, no sample downloads). A step is a short burst of filtered
// noise; surface and gait change its colour and loudness.

export type Surface = 'paving' | 'deck';

export class Footsteps {
  enabled = true;
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  private master: GainNode | null = null;

  /** Must be called from a user gesture (the Start button) so the browser allows audio. */
  unlock(): void {
    if (this.ctx) { void this.ctx.resume(); return; }
    const AC = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      return;
    }
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * 0.25);
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let seed = 22222;
    for (let i = 0; i < len; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      d[i] = (seed >>> 0) / 2147483648 - 1;
    }
    this.master = ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(ctx.destination);
  }

  suspend(): void {
    void this.ctx?.suspend();
  }
  resume(): void {
    void this.ctx?.resume();
  }

  /** One footfall. speed in m/s (walk about 1.5, run about 5); impact > 1 for landings. */
  step(speed: number, surface: Surface, impact = 1): void {
    const ctx = this.ctx;
    if (!ctx || !this.enabled || !this.noise || !this.master || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const rnd = Math.random();
    const run = Math.min(1, Math.max(0, (speed - 1.5) / 3.5));
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + rnd * 0.5;
    // Heel thud (low) and sole scuff (mid): a hollow timber deck rings lower than paving.
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = surface === 'deck' ? 260 : 380 + run * 120;
    const mid = ctx.createBiquadFilter();
    mid.type = 'bandpass';
    mid.frequency.value = (surface === 'deck' ? 700 : 1500) + rnd * 500;
    mid.Q.value = 0.9;
    const gLow = ctx.createGain(), gMid = ctx.createGain();
    const loud = (0.16 + run * 0.2) * impact * (0.85 + rnd * 0.3);
    gLow.gain.setValueAtTime(0, t);
    gLow.gain.linearRampToValueAtTime(loud * 1.4, t + 0.004);
    gLow.gain.exponentialRampToValueAtTime(0.0008, t + (surface === 'deck' ? 0.17 : 0.1));
    gMid.gain.setValueAtTime(0, t);
    gMid.gain.linearRampToValueAtTime(loud * 0.5, t + 0.006);
    gMid.gain.exponentialRampToValueAtTime(0.0008, t + 0.06);
    src.connect(low).connect(gLow).connect(this.master);
    src.connect(mid).connect(gMid).connect(this.master);
    src.start(t, rnd * 0.05, 0.2);
  }
}
