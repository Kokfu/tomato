// V8.3 handling probe on a flat stub world: acceleration, braking, coasting, steering, reverse, slope, frame-rate independence.
// Usage: node tools/dev/handling-probe.ts
import { NEUTRAL, VehicleBody } from '../../src/vehicle/VehiclePhysics.ts';
import type { Controls, VehicleEnv } from '../../src/vehicle/VehiclePhysics.ts';
const env = (slope = 0): VehicleEnv => ({
  ground: (_x, z) => ({ h: z * slope, deck: false }), loaded: () => true, hasData: () => true, water: () => false, boxContact: () => null,
  road: (x, z) => ({ id: 1, name: 'T', type: 'residential', width: 600, dist: Math.abs(x), x: 0, z, dx: 0, dz: 1, oneWay: false, bridge: false }),
});
const mk = (slope = 0) => { const c = new VehicleBody(env(slope)); c.place(0, 0, 0); return c; };
const run = (car: VehicleBody, s: number, c: Partial<Controls>, fps = 60, until?: () => boolean) => { let t = 0; const n = Math.round(s * fps); for (let i = 0; i < n; i++) { car.update(1 / fps, { ...NEUTRAL, ...c }); t += 1 / fps; if (until?.()) return t; } return t; };
const out: Record<string, string> = {};
{ const c = mk(); out['0-50 km/h s'] = run(c, 30, { throttle: 1 }, 60, () => c.kmh >= 50).toFixed(2); out['0-80 km/h s'] = (+out['0-50 km/h s'] + run(c, 30, { throttle: 1 }, 60, () => c.kmh >= 80)).toFixed(2);  }
{ const c = mk(); run(c, 30, { throttle: 1 }, 60, () => c.kmh >= 50); const z0 = c.z; const t = run(c, 10, { throttle: -1 }, 60, () => c.vf <= 0.05); out['brake 50->0 m / s'] = `${(c.z - z0).toFixed(1)} / ${t.toFixed(2)}`; }
{ const c = mk(); run(c, 30, { throttle: 1 }, 60, () => c.kmh >= 50); const z0 = c.z; const t = run(c, 10, { handbrake: true }, 60, () => c.vf <= 0.05); out['handbrake 50->0 m / s'] = `${(c.z - z0).toFixed(1)} / ${t.toFixed(2)}`; }
{ const c = mk(); run(c, 30, { throttle: 1 }, 60, () => c.kmh >= 50); const z0 = c.z; const t = run(c, 60, {}, 60, () => c.vf <= 0.05); out['coast 50->0 m / s'] = `${(c.z - z0).toFixed(1)} / ${t.toFixed(1)}`; }
for (const kmh of [10, 20, 40, 70]) { const c = mk(); run(c, 30, { throttle: 1 }, 60, () => c.kmh >= kmh); let t = 0; const h0 = c.heading; const t1 = run(c, 0.5, { steer: -1, throttle: c.kmh > kmh ? 0 : 0.3 }); const yaw = c.yawRate; out[`at ${kmh} km/h: steer 0.5s, yawRate, radius m, latAcc`] = `${c.steer.toFixed(2)} rad, ${yaw.toFixed(2)} rad/s, ${(c.vf / Math.max(1e-6, Math.abs(yaw))).toFixed(1)}, ${(c.vf * Math.abs(yaw)).toFixed(1)}`; void t; void h0; void t1; }
{ const c = mk(); const t = run(c, 10, { throttle: -1 }, 60, () => c.vf <= -6.5); out['reverse 0->-6.5 m/s s'] = t.toFixed(2); }
{ const c = mk(0.11); const t = run(c, 30, { throttle: 1 }, 60, () => c.kmh >= 30); out['11% uphill 0-30 s'] = t.toFixed(2); run(c, 1, {}); }
{ const c = mk(-0.11); run(c, 2, {}); out['11% downhill parked creep m'] = c.z.toFixed(3); }
// dt independence: same 8 s scripted drive at different fps
const script = (t: number): Partial<Controls> => t < 3 ? { throttle: 1 } : t < 5 ? { throttle: 0.6, steer: 1 } : t < 6 ? { handbrake: true, steer: -1 } : { throttle: -1 };
for (const fps of [20, 30, 60, 144]) { const c = mk(); for (let i = 0; i < 8 * fps; i++) c.update(1 / fps, { ...NEUTRAL, ...script(i / fps) }); out[`8s script @${fps}fps x,z,h`] = `${c.x.toFixed(2)}, ${c.z.toFixed(2)}, ${c.heading.toFixed(3)}`; }
console.table(out);
