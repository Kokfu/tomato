// Subtle synthesised street ambience for the V5 section (no audio files): a low city hum, an
// occasional bird, and a murmur of voices and crockery that swells near the food court.
const FOOD_COURT: [number, number] = [132.5, -2.5];

export class Ambience {
  enabled = true;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private murmur: GainNode | null = null;
  private timer = 0;

  start(): void {
    if (this.ctx || !this.enabled) return;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try {
      const ctx = new AC();
      const master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
      master.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 2);
      // 4 s of looping noise shared by the hum and the murmur
      const buf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate), d = buf.getChannelData(0);
      let b = 0;
      for (let i = 0; i < d.length; i++) { b = (b + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = b * 3.5; }
      const src = () => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; };
      const hum = ctx.createBiquadFilter(); hum.type = 'lowpass'; hum.frequency.value = 220;
      const humGain = ctx.createGain(); humGain.gain.value = 0.22;
      src().connect(hum).connect(humGain).connect(master);
      const band = ctx.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = 900; band.Q.value = 0.7;
      const murmur = ctx.createGain(); murmur.gain.value = 0;
      const s2 = src(); s2.playbackRate.value = 1.7;
      s2.connect(band).connect(murmur).connect(master);
      this.ctx = ctx; this.master = master; this.murmur = murmur;
      this.timer = window.setInterval(() => this.bird(), 5200);
    } catch { /* audio unavailable */ }
  }

  private bird(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || ctx.state !== 'running' || Math.random() < 0.45) return;
    const n = 2 + Math.floor(Math.random() * 3), t0 = ctx.currentTime + 0.05;
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain(), t = t0 + i * 0.16;
      o.type = 'sine';
      o.frequency.setValueAtTime(2600 + Math.random() * 900, t);
      o.frequency.exponentialRampToValueAtTime(3400 + Math.random() * 900, t + 0.07);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.03, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.12);
      o.connect(g).connect(this.master);
      o.start(t); o.stop(t + 0.14);
    }
  }

  update(x: number, z: number): void {
    if (!this.ctx || !this.murmur) return;
    const d = Math.hypot(x - FOOD_COURT[0], z - FOOD_COURT[1]);
    this.murmur.gain.setTargetAtTime(0.5 * Math.max(0, 1 - d / 22), this.ctx.currentTime, 0.4);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.stop();
  }

  stop(): void {
    if (!this.ctx) return;
    window.clearInterval(this.timer);
    void this.ctx.close();
    this.ctx = null; this.master = null; this.murmur = null;
  }
}
