// N1-M6: tropical rain as one draw call. A fixed set of streaks lives in a box round the camera; the vertex shader
// moves them down the wind and wraps them, so nothing is updated on the CPU but four uniforms. Sound: synthesised
// (filtered noise), no audio file.
import * as THREE from 'three';

const VERT = /* glsl */ `
  attribute vec3 seed;
  attribute vec2 corner;
  uniform vec3 uCam;
  uniform vec3 uFall;
  uniform float uT;
  uniform float uAmount;
  varying float vA;
  const vec3 BOX = vec3(26.0, 18.0, 26.0);
  void main() {
    // light rain shows fewer streaks
    if (fract(seed.x * 7.31 + seed.z * 3.17) > uAmount) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vA = 0.0; return; }
    vec3 p = seed * BOX + uFall * uT * (0.8 + 0.4 * fract(seed.z * 13.7));
    p = mod(p - uCam, BOX) - 0.5 * BOX;
    vec3 dir = normalize(uFall);
    float len = 0.5 + 0.55 * fract(seed.y * 9.3);
    float d = length(p);
    vec3 side = normalize(cross(dir, -p / max(d, 0.001)));
    // as wide as its distance asks: about two pixels across wherever it is
    vec3 w = uCam + p - dir * (corner.y * len) + side * (corner.x * (0.0008 + 0.0012 * d));
    gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
    vA = smoothstep(13.0, 8.0, length(p.xz)) * smoothstep(0.6, 2.2, d) * (0.55 + 0.45 * fract(seed.y * 5.9));
  }
`;
const FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying float vA;
  void main() {
    gl_FragColor = vec4(uColor, vA * 0.42);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class Rain {
  readonly mesh: THREE.Mesh;
  private u: { uCam: { value: THREE.Vector3 }; uFall: { value: THREE.Vector3 }; uT: { value: number }; uAmount: { value: number }; uColor: { value: THREE.Color } };
  private t = 0;

  private count: number;

  /** `count` streaks (two triangles each). */
  constructor(count: number) {
    this.count = count;
    const seed = new Float32Array(count * 12), corner = new Float32Array(count * 8), idx = new Uint16Array(count * 6);
    let s = 12345;
    const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) | 0) >>> 0) / 4294967296;
    for (let i = 0; i < count; i++) {
      const x = rnd(), y = rnd(), z = rnd();
      for (let k = 0; k < 4; k++) {
        seed.set([x, y, z], i * 12 + k * 3);
        corner.set([k === 0 || k === 3 ? -1 : 1, k < 2 ? 0 : 1], i * 8 + k * 2);
      }
      idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(seed, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 3));
    g.setAttribute('corner', new THREE.BufferAttribute(corner, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    this.u = { uCam: { value: new THREE.Vector3() }, uFall: { value: new THREE.Vector3(1.6, -11.5, 0.7) }, uT: { value: 0 }, uAmount: { value: 0 }, uColor: { value: new THREE.Color(0.7, 0.75, 0.8) } };
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.u, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
    this.mesh.visible = false;
    this.mesh.userData.noAO = true; // not part of the ambient-occlusion depth pass (src/v5/pipeline.ts)
  }

  /** Draw only this fraction of the streaks (the Low preset: a third). */
  setDensity(fraction: number): void {
    this.mesh.geometry.setDrawRange(0, Math.max(1, Math.round(this.count * fraction)) * 6);
  }

  /** `amount`: rain falling now, 0..1; `light`: the colour of the daylight the streaks catch. */
  update(dt: number, camera: THREE.Vector3, amount: number, light: THREE.Color): void {
    this.mesh.visible = amount > 0.01;
    if (!this.mesh.visible) { this.t = 0; return; }
    this.t += dt;
    this.u.uT.value = this.t;
    this.u.uCam.value.copy(camera);
    this.u.uAmount.value = amount;
    this.u.uColor.value.copy(light);
  }
}

/** Rain on roofs and road: two bands of looping noise whose level follows the rain, and now and then far thunder. */
export class RainSound {
  enabled = true;
  private ctx: AudioContext | null = null;
  private hiss: GainNode | null = null;
  private drum: GainNode | null = null;
  private unlocked = false;
  private thunderIn = 20;
  /** The level last handed to the gains. */
  private level = 0;

  /**
   * Call from a user gesture: browsers (Safari above all) only start audio made or resumed inside one. The context is
   * made here and put to sleep at once; it runs only while rain is heard.
   */
  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    this.start();
    void this.ctx?.suspend();
    // a hidden tab draws no frames, so nothing would fade the rain out: stop it here
    document.addEventListener('visibilitychange', () => { if (document.hidden) void this.ctx?.suspend(); });
  }

  private start(): void {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try {
      const ctx = new AC(), buf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const band = (type: BiquadFilterType, f: number, rate: number) => {
        const src = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), g = ctx.createGain();
        src.buffer = buf; src.loop = true; src.playbackRate.value = rate;
        flt.type = type; flt.frequency.value = f; flt.Q.value = 0.4;
        g.gain.value = 0;
        src.connect(flt).connect(g).connect(ctx.destination);
        src.start();
        return g;
      };
      this.hiss = band('highpass', 1800, 1);
      this.drum = band('lowpass', 420, 0.6);
      this.ctx = ctx;
    } catch { /* audio unavailable */ }
  }

  /** `level`: rain falling now, 0..1. */
  update(dt: number, level: number): void {
    const on = this.enabled && this.unlocked && level > 0.01;
    const ctx = this.ctx;
    if (!ctx || !this.hiss || !this.drum) return;
    const t = ctx.currentTime, l = on ? level : 0;
    // Nothing is touched on a dry day: a sleeping context would only pile the scheduled changes up.
    if (!on && this.level === 0 && ctx.state !== 'running') return;
    if (on && ctx.state === 'suspended') void ctx.resume();
    if (Math.abs(l - this.level) > 0.01 || (l === 0 && this.level !== 0)) {
      this.level = l;
      this.hiss.gain.setTargetAtTime(0.085 * l, t, 0.6);
      this.drum.gain.setTargetAtTime(0.2 * l, t, 0.6);
    }
    if (!on) {
      // asleep again once it has faded (a dry day, the pause menu, sound switched off)
      if (ctx.state === 'running' && this.hiss.gain.value < 0.001) void ctx.suspend();
      return;
    }
    this.thunderIn -= dt;
    if (this.thunderIn <= 0 && level > 0.55 && ctx.state === 'running') {
      this.thunderIn = 22 + Math.random() * 40;
      const src = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), g = ctx.createGain(), len = 3 + Math.random() * 2;
      const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate), d = b.getChannelData(0);
      let v = 0;
      for (let i = 0; i < d.length; i++) { v = (v + 0.03 * (Math.random() * 2 - 1)) / 1.03; d[i] = v * 6; }
      src.buffer = b;
      flt.type = 'lowpass'; flt.frequency.value = 130;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.25); g.gain.exponentialRampToValueAtTime(0.001, t + len);
      src.connect(flt).connect(g).connect(ctx.destination);
      src.start(t); src.stop(t + len);
    }
  }
}
