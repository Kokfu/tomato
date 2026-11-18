// V8.3 driving camera and car lamps: the chase camera on a stub world, driven by the real vehicle physics (node --test).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CHASE, ChaseCamera, follow } from '../../src/vehicle/ChaseCamera.ts';
import type { CameraWorld } from '../../src/vehicle/ChaseCamera.ts';
import { NEUTRAL, VehicleBody } from '../../src/vehicle/VehiclePhysics.ts';
import type { Controls, VehicleEnv } from '../../src/vehicle/VehiclePhysics.ts';
import type { Input } from '../../src/player/Input.ts';

const flat: VehicleEnv = {
  ground: () => ({ h: 0, deck: false }), loaded: () => true, hasData: () => true, water: () => false, boxContact: () => null,
  road: (x, z) => ({ id: 1, name: 'T', type: 'residential', width: 600, dist: Math.abs(x), x: 0, z, dx: 0, dz: 1, oneWay: false, bridge: false }),
};
const noLook = { lookYaw: 0, lookPitch: 0, zoom: 0 } as Input;

/** A world with optional walls: infinite vertical planes z = const (height `top`), and low boxes (parked cars). */
function world(opts: { wallZ?: number; top?: number; boxes?: [number, number, number, number, number][] } = {}): CameraWorld {
  const top = opts.top ?? 20;
  return {
    rayWalls: (ox, oy, oz, dx, dy, dz) => {
      if (opts.wallZ === undefined || Math.abs(dz) < 1e-9) return 1;
      const t = (opts.wallZ - oz) / dz;
      return t > 0 && t < 1 && oy + dy * t < top ? t : 1;
    },
    groundAt: () => ({ h: 0, deck: false }),
    insideBuilding: (x, z, y) => (opts.boxes ?? []).some(([x0, x1, z0, z1, h]) => x > x0 && x < x1 && z > z0 && z < z1 && y < h),
  } as CameraWorld;
}

function rig(w = world()) {
  const car = new VehicleBody(flat);
  car.place(0, 0, 0);
  const cam = new ChaseCamera(new THREE.PerspectiveCamera(60, 16 / 9, 0.3, 2000), w);
  cam.snap(car);
  return { car, cam };
}
/** Drive for `seconds` at `fps`, calling `each` after every frame. */
function drive(car: VehicleBody, cam: ChaseCamera, seconds: number, fps: number, c: (t: number) => Partial<Controls>, each?: (t: number) => void, t0 = 0): void {
  const n = Math.round(seconds * fps);
  for (let i = 0; i < n; i++) {
    const t = t0 + i / fps;
    car.update(1 / fps, { ...NEUTRAL, ...c(t) });
    cam.update(1 / fps, car, noLook);
    each?.(t);
  }
}

test('follow: trails a steadily moving target by velocity / rate at any step size', () => {
  for (const dt of [1 / 10, 1 / 30, 1 / 144]) {
    let p = 0, prev = 0;
    for (let t = 0; t < 3; t += dt) { const next = prev + 20 * dt; p = follow(p, prev, next, 18, dt); prev = next; }
    assert.ok(Math.abs(prev - p - 20 / 18) < 1e-6, `dt ${dt}: lag ${prev - p}`);
  }
});

test('the chase camera ends up in the same place at 20, 60 and 144 fps', () => {
  const script = (t: number): Partial<Controls> => (t < 4 ? { throttle: 1 } : t < 6 ? { throttle: 0.5, steer: 1 } : t < 7 ? { throttle: -1 } : {});
  const at: THREE.Vector3[] = [];
  for (const fps of [20, 60, 144]) {
    const { car, cam } = rig();
    drive(car, cam, 8, fps, script);
    at.push(cam.camera.position.clone());
  }
  for (const p of at.slice(1)) assert.ok(p.distanceTo(at[0]) < 0.12, `camera ${p.toArray()} vs ${at[0].toArray()}`);
});

test('behind the car at speed, a steady boom (no creeping or jitter)', () => {
  const { car, cam } = rig();
  const boom: number[] = [];
  drive(car, cam, 10, 60, () => ({ throttle: 1 }), (t) => { if (t > 6) boom.push(Math.hypot(cam.camera.position.x - car.x, cam.camera.position.z - car.z)); });
  assert.ok(cam.camera.position.z < car.z - 4, 'camera behind the car');
  assert.ok(Math.max(...boom) - Math.min(...boom) < 0.3, `boom varies ${Math.min(...boom)}..${Math.max(...boom)}`);
});

test('a wall behind the car: the camera never passes it, not even on the frame it first cuts the boom', () => {
  // The car backs toward a wall at z = -7.5 (the camera looks from behind, so the boom runs into it) and stops with
  // its tail about half a metre short of it (the stub world has no car collision).
  const wallZ = -7.5;
  const { car, cam } = rig(world({ wallZ }));
  let worst = Infinity;
  drive(car, cam, 5, 60, () => (car.z > -4.5 ? { throttle: -0.6 } : { throttle: 1 }), () => { worst = Math.min(worst, cam.camera.position.z - wallZ); });
  assert.ok(car.z - 1.95 > wallZ, 'the car itself stays clear of the wall');
  assert.ok(worst >= CHASE.wallMargin * 0.9, `closest approach to the wall ${worst}`);
});

test('a parked car under the boom: the camera rises over it instead of entering it', () => {
  // The camera looks down the street from low pitch; a 1.5 m high box stands where the camera would be.
  const { car, cam } = rig(world({ boxes: [[-3, 3, -10, -3, 1.5]] }));
  cam.pitch = CHASE.minPitch;
  cam.autoFollow = false;
  let inside = 0;
  drive(car, cam, 1, 60, () => ({}), () => { const p = cam.camera.position; if (p.z > -10 && p.z < -3 && Math.abs(p.x) < 3 && p.y < 1.5) inside++; });
  assert.equal(inside, 0);
  assert.ok(cam.camera.position.y >= 1.5, `camera height ${cam.camera.position.y}`);
});

test('reversing: a short shunt keeps the view ahead; a long reverse pans round to look back, no faster than maxSwing', () => {
  const { car, cam } = rig();
  drive(car, cam, 1.2, 60, () => ({ throttle: -1 }));
  // Behind the car means the camera on its -Z side while it faces +Z.
  assert.ok(cam.camera.position.z < car.z, 'still behind after a 1.2 s shunt');
  let maxRate = 0, last = cam.yaw;
  drive(car, cam, 4, 60, () => ({ throttle: -1 }), () => { maxRate = Math.max(maxRate, Math.abs(Math.atan2(Math.sin(cam.yaw - last), Math.cos(cam.yaw - last))) * 60); last = cam.yaw; }, 1.2);
  assert.ok(cam.camera.position.z > car.z, 'looking over the tail after a sustained reverse');
  assert.ok(maxRate <= CHASE.maxSwing + 0.05, `swing ${maxRate} rad/s`);
});

test('V cycles the chase distance through the presets', () => {
  const { cam } = rig();
  const seen = [cam.cycleDistance(), cam.cycleDistance(), cam.cycleDistance(), cam.cycleDistance()];
  assert.deepEqual(seen, [CHASE.presets[2], CHASE.presets[0], CHASE.presets[1], CHASE.presets[2]]);
});

test('lamp state: brake lamps with the brake or handbrake, reversing lamps in reverse', () => {
  const car = new VehicleBody(flat);
  car.place(0, 0, 0);
  car.update(1 / 60, { ...NEUTRAL, throttle: 1 });
  assert.deepEqual([car.braking, car.reverseGear], [false, false], 'accelerating');
  for (let i = 0; i < 120; i++) car.update(1 / 60, { ...NEUTRAL, throttle: 1 });
  car.update(1 / 60, { ...NEUTRAL, throttle: -1 });
  assert.deepEqual([car.braking, car.reverseGear], [true, false], 'braking while moving forward');
  for (let i = 0; i < 300; i++) car.update(1 / 60, { ...NEUTRAL, throttle: -1 });
  assert.deepEqual([car.braking, car.reverseGear], [false, true], 'backing up');
  car.update(1 / 60, { ...NEUTRAL, throttle: 1 });
  assert.deepEqual([car.braking, car.reverseGear], [true, true], 'braking a reversing car');
  car.update(1 / 60, { ...NEUTRAL, handbrake: true });
  assert.equal(car.braking, true, 'handbrake');
});
