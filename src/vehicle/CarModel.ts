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
    const k = Math.min(1, dt * 9);
    const pitch = THREE.MathUtils.clamp(car.accelLong * 0.0045, -0.05, 0.035);
    const roll = THREE.MathUtils.clamp(car.accelLat * 0.006, -0.06, 0.06);
    this.body.rotation.z += (pitch - this.body.rotation.z) * k;
    this.body.rotation.x += (roll - this.body.rotation.x) * k;
    const angle = car.travel / this.wheelRadius;
    for (const w of this.wheels) {
      if (w.front) w.steer.rotation.y = car.steer;
      w.spin.rotation.y = -w.side * angle;
    }
    this.marker.position.y = 2.35 + Math.sin(this.time * 2.4) * 0.12;
    this.marker.rotation.y = this.time * 1.5;
  }

  private wheelRadius = vehicleWheels('hatch').rw;
}
