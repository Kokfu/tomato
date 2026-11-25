// N1-M6: the day/night cycle and the weather, as numbers. No three.js objects and no DOM here, so the node unit tests
// cover it. WorldManager turns a Phase into light colours, sky and shader uniforms.
//
// Everything is relative to the daytime look. Both renderings (the geographic one and the Jalan China pipeline) keep
// their own tuned daylight; a Phase only scales and tints it. At DAY_HOUR every factor is exactly 1.
import { KUCHING_LAT, solarDeclination, sunDirection } from './atmosphere.ts';

export type Vec3 = [number, number, number];

/** The fixed daytime of the game before N1-M6 (09:40 solar time): the frozen "Day" setting. */
export const DAY_HOUR = 9 + 40 / 60;
export const EVENING_HOUR = 17.6;
export const NIGHT_HOUR = 21;
/** 15 April: the sun passes just north of the zenith over Kuching (as in N1-M2). */
const DECLINATION = solarDeclination(105);

export interface Phase {
  /** Directional light (sun by day, moon by night): tint and strength relative to the daytime sun. */
  sunTint: Vec3; sunI: number;
  /** Sky fill light relative to daytime. */
  skyTint: Vec3; skyI: number;
  /** Multipliers of the daytime horizon, zenith and cloud colours. */
  horizon: Vec3; zenith: Vec3; cloud: Vec3;
  /** Camera exposure relative to daytime (the eye opens at night). */
  exposure: number;
  /** 0 by day, 1 at night: windows, lamps and signs are lit by this much. */
  night: number;
  stars: number;
  /** Strength of sky reflections relative to daytime. */
  env: number;
  /** Cloud cover added by the weather, 0..1. */
  cover: number;
  /** Haze density relative to a dry day. */
  haze: number;
}

type Key = Omit<Phase, 'cover' | 'haze'> & { h: number };
const MOON: Vec3 = [0.5, 0.64, 1.0];
const night = (h: number): Key => ({
  h, sunTint: MOON, sunI: 0.07, skyTint: [0.34, 0.45, 0.82], skyI: 0.3, horizon: [0.055, 0.06, 0.085], zenith: [0.03, 0.03, 0.05], cloud: [0.06, 0.07, 0.1],
  exposure: 1.5, night: 1, stars: 1, env: 0.1,
});
const day = (h: number): Key => ({
  h, sunTint: [1, 1, 1], sunI: 1, skyTint: [1, 1, 1], skyI: 1, horizon: [1, 1, 1], zenith: [1, 1, 1], cloud: [1, 1, 1], exposure: 1, night: 0, stars: 0, env: 1,
});
/**
 * Keys in solar hours. On the equator the sun rises about 06:00 and sets about 18:00, and twilight is short. The
 * directional light is dark (sunI 0) around 05:52 and 18:08, where it changes between the moon and the sun.
 */
const KEYS: Key[] = [
  night(0),
  night(5.3),
  { h: 5.7, sunTint: MOON, sunI: 0, skyTint: [0.5, 0.52, 0.85], skyI: 0.42, horizon: [0.34, 0.24, 0.26], zenith: [0.1, 0.12, 0.2], cloud: [0.3, 0.22, 0.26], exposure: 1.4, night: 1, stars: 0.3, env: 0.25 },
  { h: 5.95, sunTint: [1, 0.5, 0.25], sunI: 0, skyTint: [0.8, 0.7, 0.85], skyI: 0.6, horizon: [0.95, 0.6, 0.45], zenith: [0.35, 0.4, 0.55], cloud: [0.95, 0.6, 0.5], exposure: 1.3, night: 0.6, stars: 0, env: 0.5 },
  { h: 6.4, sunTint: [1, 0.56, 0.3], sunI: 0.4, skyTint: [1, 0.84, 0.8], skyI: 0.8, horizon: [1.2, 0.82, 0.6], zenith: [0.62, 0.66, 0.8], cloud: [1, 0.78, 0.62], exposure: 1.15, night: 0, stars: 0, env: 0.75 },
  { h: 7.4, sunTint: [1, 0.86, 0.68], sunI: 0.82, skyTint: [1, 0.97, 0.95], skyI: 0.95, horizon: [1.05, 0.97, 0.9], zenith: [0.9, 0.92, 0.97], cloud: [1, 0.95, 0.9], exposure: 1.05, night: 0, stars: 0, env: 0.95 },
  day(8.6),
  day(15.9),
  // the old "Evening" preset: a low orange sun, long shadows, a warm horizon
  { h: 17.25, sunTint: [1, 0.55, 0.27], sunI: 0.9, skyTint: [0.8, 0.64, 0.78], skyI: 1.2, horizon: [1.3, 0.68, 0.4], zenith: [0.5, 0.33, 0.47], cloud: [1, 0.66, 0.45], exposure: 1.18, night: 0, stars: 0, env: 0.8 },
  { h: 17.85, sunTint: [1, 0.36, 0.13], sunI: 0.45, skyTint: [0.74, 0.54, 0.74], skyI: 0.95, horizon: [1.25, 0.5, 0.27], zenith: [0.32, 0.22, 0.42], cloud: [1, 0.45, 0.3], exposure: 1.25, night: 0.55, stars: 0, env: 0.6 },
  { h: 18.1, sunTint: [1, 0.3, 0.1], sunI: 0, skyTint: [0.6, 0.46, 0.76], skyI: 0.7, horizon: [0.8, 0.3, 0.22], zenith: [0.2, 0.15, 0.34], cloud: [0.7, 0.28, 0.26], exposure: 1.32, night: 0.9, stars: 0.05, env: 0.4 },
  { h: 18.45, sunTint: MOON, sunI: 0, skyTint: [0.42, 0.46, 0.8], skyI: 0.42, horizon: [0.22, 0.13, 0.17], zenith: [0.07, 0.07, 0.15], cloud: [0.18, 0.12, 0.16], exposure: 1.42, night: 1, stars: 0.5, env: 0.2 },
  night(18.9),
  night(24),
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
/** Hour of day in [0, 24). */
export const wrapHour = (h: number) => ((h % 24) + 24) % 24;

/** The light of a dry sky at a solar hour. */
export function phaseAt(hour: number): Phase {
  const h = wrapHour(hour);
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].h <= h) i++;
  const a = KEYS[i], b = KEYS[i + 1], t = Math.min(1, Math.max(0, (h - a.h) / (b.h - a.h)));
  return {
    sunTint: lerp3(a.sunTint, b.sunTint, t), sunI: lerp(a.sunI, b.sunI, t), skyTint: lerp3(a.skyTint, b.skyTint, t), skyI: lerp(a.skyI, b.skyI, t),
    horizon: lerp3(a.horizon, b.horizon, t), zenith: lerp3(a.zenith, b.zenith, t), cloud: lerp3(a.cloud, b.cloud, t),
    exposure: lerp(a.exposure, b.exposure, t), night: lerp(a.night, b.night, t), stars: lerp(a.stars, b.stars, t), env: lerp(a.env, b.env, t),
    cover: 0, haze: 1,
  };
}

/**
 * The same light under rain of strength `rain` (0..1): a closed grey sky, a weak sun, a curtain of haze, and lamps and
 * shop lights coming on as it darkens.
 */
export function withWeather(p: Phase, rain: number): Phase {
  const r = Math.min(1, Math.max(0, rain));
  if (r === 0) return p;
  return {
    ...p,
    sunTint: lerp3(p.sunTint, [0.9, 0.95, 1], r * 0.8), sunI: p.sunI * (1 - 0.82 * r),
    skyTint: lerp3(p.skyTint, [p.skyTint[1] * 0.86, p.skyTint[1] * 0.92, p.skyTint[1]], r * 0.8), skyI: p.skyI * (1 - 0.22 * r),
    exposure: p.exposure * (1 + 0.06 * r), night: Math.max(p.night, 0.5 * r), stars: p.stars * (1 - r), env: p.env * (1 - 0.3 * r),
    cover: r, haze: 1 + 2.2 * r,
  };
}

/** Seconds of play per game hour: daylight (06:00-19:00) takes 9 min 45 s, the night 3 min 40 s. */
export const SECONDS_PER_HOUR = { day: 45, night: 20 };
export function advanceHour(hour: number, dt: number): number {
  const h = wrapHour(hour);
  return wrapHour(h + dt / (h >= 6 && h < 19 ? SECONDS_PER_HOUR.day : SECONDS_PER_HOUR.night));
}

/**
 * Where the lights stand at a solar hour: the true sun (for the sky), and the direction the one directional light
 * shines from: the sun while it is up, otherwise a moon opposite it. The light's direction is kept at least
 * 12 degrees above the horizon so that its shadow map stays usable; it is dark when the two change over.
 */
export function lightAt(hour: number): { sun: Vec3; disc: Vec3; light: Vec3; moon: boolean } {
  const h = wrapHour(hour), sun = sunDirection(KUCHING_LAT, DECLINATION, h);
  const moon = sun[1] < -0.035;
  const src = moon ? sunDirection(KUCHING_LAT, -DECLINATION, h + 12) : sun;
  const y = Math.max(src[1], 0.21), k = Math.sqrt((1 - y * y) / Math.max(1e-9, src[0] * src[0] + src[2] * src[2]));
  return { sun, disc: src, light: [src[0] * k, y, src[2] * k], moon };
}

/** Rain falling now and how wet the ground is, both 0..1. */
export interface Weather { rain: number; wet: number }

/** Move the weather toward `target` rain: a shower builds in about 15 s and thins in 25 s; the ground soaks in 20 s and dries in about 2.5 min. */
export function stepWeather(w: Weather, target: number, dt: number): void {
  const t = Math.min(1, Math.max(0, target));
  w.rain = t > w.rain ? Math.min(t, w.rain + dt / 15) : Math.max(t, w.rain - dt / 25);
  w.wet = w.rain > w.wet ? Math.min(w.rain, w.wet + dt / 20) : Math.max(w.rain, w.wet - dt / 150);
}

/**
 * "Occasional" rain: dry spells of 5 to 11 minutes (the first one 3 to 5), showers of 1.5 to 3 minutes at 60 to 100 %
 * strength. Deterministic for a seed.
 */
export class Showers {
  private s: number;
  private left: number;
  private raining = false;
  private strength = 0;
  constructor(seed = 1) {
    this.s = seed | 0 || 1;
    this.left = 180 + this.rnd() * 120;
  }
  private rnd(): number {
    this.s = (Math.imul(this.s, 1664525) + 1013904223) | 0;
    return (this.s >>> 0) / 4294967296;
  }
  /** Advance by dt seconds; returns the rain strength wanted now. */
  step(dt: number): number {
    this.left -= dt;
    if (this.left <= 0) {
      this.raining = !this.raining;
      this.left = this.raining ? 90 + this.rnd() * 90 : 300 + this.rnd() * 360;
      this.strength = this.raining ? 0.6 + this.rnd() * 0.4 : 0;
    }
    return this.strength;
  }
}

export type TimeMode = 'auto' | 'day' | 'evening' | 'night';
export type RainMode = 'auto' | 'off' | 'on';
export const TIME_HOURS: Record<Exclude<TimeMode, 'auto'>, number> = { day: DAY_HOUR, evening: EVENING_HOUR, night: NIGHT_HOUR };

/**
 * Settings at start-up: `?time=` / `?rain=` in the address, else the saved choice, else the default. The default is the
 * running cycle with occasional rain, except in an automated browser (tests, screenshots, benchmarks), which gets a
 * frozen dry day so that runs are repeatable and comparable with builds that have no cycle.
 */
export function startModes(query: string, saved: { time?: string | null; rain?: string | null }, automated: boolean): { time: TimeMode; rain: RainMode; hour: number | null } {
  const q = new URLSearchParams(query), tq = q.get('time'), rq = q.get('rain');
  const isTime = (v: unknown): v is TimeMode => v === 'auto' || v === 'day' || v === 'evening' || v === 'night';
  const isRain = (v: unknown): v is RainMode => v === 'auto' || v === 'off' || v === 'on';
  const hq = tq !== null && tq !== '' && Number.isFinite(Number(tq)) ? wrapHour(Number(tq)) : null;
  const time: TimeMode = isTime(tq) ? tq : hq !== null ? 'day' : isTime(saved.time) ? saved.time : automated ? 'day' : 'auto';
  const rain: RainMode = isRain(rq) ? rq : isRain(saved.rain) ? saved.rain : automated ? 'off' : 'auto';
  return { time, rain, hour: hq };
}
