// Visual of the drivable car: the compact hatchback of the parked-car kit (src/v5/vehicles.ts), built
// once as a few small meshes with separate wheels that spin and steer. About 1,500 triangles, no
// asset download. It uses ordinary three.js materials so that it renders the same in every mode.
import * as THREE from 'three';
import { Kit, hex } from '../v5/kit.ts';
import type { Buf } from '../v5/kit.ts';
import { vehicle, vehicleWheels, wheel } from '../v5/vehicles.ts';
import type { VehicleBody } from './VehiclePhysics.ts';

function geometry(b: Buf): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
  g.setIndex(b.idx);
  return g;
}

/** Tail-lamp glass colour of the kit (src/v5/vehicles.ts, lampRed). */
const LAMP_RED = hex(0x9a100c);

/**
 * Lit lamp faces: copies of the kit's tail-lamp triangles, lifted a few millimetres off the body so that they cover the
 * unlit glass. `rows` 'all' takes the whole cluster, 'lower' its lower row only (the reversing lamp).
 */
function lampOverlay(glass: Buf, rows: 'all' | 'lower', lift: number): THREE.BufferGeometry {
  const { pos, nor, col, idx } = glass;
  const red = (v: number) => Math.abs(col[v * 3] - LAMP_RED[0]) + Math.abs(col[v * 3 + 1] - LAMP_RED[1]) + Math.abs(col[v * 3 + 2] - LAMP_RED[2]) < 1e-4;
  const tris: number[] = [];
  let y0 = Infinity, y1 = -Infinity;
  for (let t = 0; t < idx.length; t += 3) {
    if (!red(idx[t]) || !red(idx[t + 1]) || !red(idx[t + 2])) continue;
    tris.push(t);
    for (let q = 0; q < 3; q++) { const y = pos[idx[t + q] * 3 + 1]; y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  const out: number[] = [];
  for (const t of tris) {
    const vs = [idx[t], idx[t + 1], idx[t + 2]];
    if (rows === 'lower' && vs.reduce((a, v) => a + pos[v * 3 + 1], 0) / 3 > (y0 + y1) / 2) continue;
    for (const v of vs) for (let q = 0; q < 3; q++) out.push(pos[v * 3 + q] + nor[v * 3 + q] * lift);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  return g;
}

function materials(): Record<string, THREE.Material> {
  return {
    carpaint: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.25 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0.55 }),
    gold: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.7 }),
    wire: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }),
  };
}

function shadowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 6, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.75)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.5)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class CarModel {
  /** Position, heading and ground attitude. Local +Z is forward, +X the left side. */
  readonly root = new THREE.Group();
  /** Floating marker shown while the player is on foot, so that the car can be found. */
  readonly marker: THREE.Mesh;
  private body = new THREE.Group();
  private wheels: { steer: THREE.Group; spin: THREE.Object3D; side: number; front: boolean }[] = [];
  private time = 0;
  /** Lamps that light up with the driving state (drawn only while lit: no cost otherwise). */
  readonly lamps = new THREE.Group();
  private brakeLamp: THREE.Mesh;
  private reverseLamp: THREE.Mesh;
  /** Lamps follow the controls only while someone is at the wheel (a parked car shows none). */
  lightsOn = false;

  constructor(colour = 0xf2b632) {
    this.root.name = 'drivable-car';
    this.root.rotation.order = 'YXZ';
    // The kit builds cars with +x forward: turn that onto the root's +z.
    const frame = new THREE.Group();
    frame.rotation.y = -Math.PI / 2;
    this.root.add(frame);
    frame.add(this.body);
    const mats = materials();

    const kit = new Kit();
    vehicle(kit, 'hatch', hex(colour), null, '', true);
    for (const [name, buf] of kit.bufs) {
      if (!buf.idx.length) continue;
      const m = new THREE.Mesh(geometry(buf), mats[name] ?? mats.wire);
      m.castShadow = name !== 'glass';
      m.receiveShadow = true;
      this.body.add(m);
    }

    // Brake and reversing lamps: unlit materials over the tail-lamp glass, toggled by visibility. Hidden meshes are not
    // compiled with the scene: Driving.prepare readies their program on getting in, before they can first light up.
    const glass = kit.bufs.get('glass')!;
    const lamp = (rows: 'all' | 'lower', lift: number, color: number, name: string) => {
      const m = new THREE.Mesh(lampOverlay(glass, rows, lift), new THREE.MeshBasicMaterial({ color }));
      m.name = name;
      m.visible = false;
      this.lamps.add(m);
      return m;
    };
    this.body.add(this.lamps);
    this.brakeLamp = lamp('all', 0.004, 0xff2414, 'brake-lamps');
    this.reverseLamp = lamp('lower', 0.007, 0xf4f1e8, 'reverse-lamps');

    // One wheel geometry (tyre + alloy), four placements.
    const wk = new Kit();
    const W = vehicleWheels('hatch');
    wheel(wk, W.rw);
    const parts: [THREE.BufferGeometry, THREE.Material][] = [];
    for (const [name, buf] of wk.bufs) if (buf.idx.length) parts.push([geometry(buf), mats[name] ?? mats.wire]);
    W.axles.forEach((xw, i) => {
      for (const side of [1, -1]) {
        const steer = new THREE.Group();
        steer.position.set(xw, W.rw, side * (W.hw[i] + 0.01));
        const tilt = new THREE.Group();
        tilt.rotation.x = (side * Math.PI) / 2; // wheel-local +y (the axle) points out of the car
        const spin = new THREE.Group();
        for (const [g, m] of parts) { const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; spin.add(mesh); }
        tilt.add(spin);
        steer.add(tilt);
        frame.add(steer);
        this.wheels.push({ steer, spin, side, front: i === 1 });
      }
    });

    // Soft contact shadow on the road (also the only shadow on the low preset, which has no shadow maps).
    const blob = new THREE.Mesh(
      new THREE.PlaneGeometry(2.5, 4.7).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -24 }),
    );
    blob.position.y = 0.025;
    blob.renderOrder = 8;
    this.root.add(blob);

    this.marker = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 0.6, 4).rotateX(Math.PI),
      new THREE.MeshBasicMaterial({ color: 0xf2c14e, fog: false, depthTest: false, transparent: true, opacity: 0.95 }),
    );
    this.marker.renderOrder = 50;
    this.root.add(this.marker);
  }

  /** Copy the physics state onto the meshes. */
  sync(car: VehicleBody, dt: number): void {
    this.time += dt;
    this.root.position.set(car.x, car.y, car.z);
    this.root.rotation.set(-car.pitch, car.heading, car.roll);
    // Body lean on its springs: squat under power, dive under braking, roll out of a turn.
    const k = 1 - Math.exp(-9 * dt);
    const pitch = THREE.MathUtils.clamp(car.accelLong * 0.0045, -0.05, 0.035);
    const roll = THREE.MathUtils.clamp(car.accelLat * 0.006, -0.06, 0.06);
    this.body.rotation.z += (pitch - this.body.rotation.z) * k;
    this.body.rotation.x += (roll - this.body.rotation.x) * k;
    const angle = car.travel / this.wheelRadius;
    for (const w of this.wheels) {
      if (w.front) w.steer.rotation.y = car.steer;
      w.spin.rotation.y = -w.side * angle;
    }
    this.brakeLamp.visible = this.lightsOn && car.braking;
    this.reverseLamp.visible = this.lightsOn && car.reverseGear;
    this.marker.position.y = 2.35 + Math.sin(this.time * 2.4) * 0.12;
    this.marker.rotation.y = this.time * 1.5;
  }

  private wheelRadius = vehicleWheels('hatch').rw;
}
