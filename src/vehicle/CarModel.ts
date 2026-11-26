// Visual of the vehicle the player drives: one of the bodies of the parked-car kit (src/v5/vehicles.ts), built once as
// a few small meshes with separate wheels that spin and steer. About 1,500 triangles, no asset download. It uses
// ordinary three.js materials so that it renders the same in every mode.
// N1-M7: four kinds (hatchback, kapcai, taxi, pickup). The body is built in white and painted by the material colour,
// so one model serves any paint, and the damage tint is that same colour pulled toward soot.
import * as THREE from 'three';
import { Kit, hex } from '../v5/kit.ts';
import type { Buf } from '../v5/kit.ts';
import { vehicle, vehicleWheels, wheel, kapcai, kapcaiWheel, KAPCAI_AXLES, KAPCAI_WHEEL } from '../v5/vehicles.ts';
import type { VehicleKind } from '../v5/vehicles.ts';
import type { DriveKind, VehicleBody } from './VehiclePhysics.ts';

function geometry(b: Buf, from = 0, to = b.idx.length): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
  g.setIndex(from === 0 && to === b.idx.length ? b.idx : b.idx.slice(from, to));
  return g;
}

/** Tail-lamp glass colour of the kit (src/v5/vehicles.ts, lampRed). */
const LAMP_RED = hex(0x9a100c);
/** What a wrecked body's paint turns toward (the same soot as the parked and ambient vehicles). */
const SOOT = new THREE.Color(0x2b2622);

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

function materials(): Record<string, THREE.MeshStandardMaterial> {
  return {
    carpaint: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.25 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0.55 }),
    gold: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.7 }),
    wire: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }),
  };
}

let shadowTex: THREE.Texture | null = null;
function shadowTexture(): THREE.Texture {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 6, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.75)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.5)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return (shadowTex = new THREE.CanvasTexture(c));
}

/** Body style of the kit for each kind the player can drive (the kapcai has its own builder). */
const STYLE: Record<Exclude<DriveKind, 'kapcai'>, VehicleKind> = { hatch: 'hatch', taxi: 'saloon', pickup: 'pickup' };
/** The paint of the car that has waited in Jalan China since V8. */
export const START_PAINT = 0xf2b632;

export class CarModel {
  /** Position, heading and ground attitude. Local +Z is forward, +X the left side. */
  readonly root = new THREE.Group();
  /** Floating marker shown while the player is on foot, so that the car can be found. */
  readonly marker: THREE.Mesh;
  readonly kind: DriveKind;
  private body = new THREE.Group();
  private wheels: { steer: THREE.Group; spin: THREE.Object3D; side: number; front: boolean }[] = [];
  private time = 0;
  /** Lamps that light up with the driving state (drawn only while lit: no cost otherwise). */
  readonly lamps = new THREE.Group();
  private brakeLamp: THREE.Mesh;
  private reverseLamp: THREE.Mesh | null = null;
  /** Lamps follow the controls only while someone is at the wheel (a parked car shows none). */
  lightsOn = false;
  private mats = materials();
  private wheelRadius: number;
  private paintColor = new THREE.Color(START_PAINT);
  /** The kapcai's rider: there only while the bike is ridden. */
  private rider: THREE.Group | null = null;
  private markerY: number;
  private lean = 0;

  constructor(kind: DriveKind = 'hatch', colour = START_PAINT) {
    this.kind = kind;
    this.root.name = 'drivable-car';
    this.root.rotation.order = 'YXZ';
    // The kit builds vehicles with +x forward: turn that onto the root's +z.
    const frame = new THREE.Group();
    frame.rotation.y = -Math.PI / 2;
    this.root.add(frame);
    frame.add(this.body);
    const mats = this.mats;
    const white = hex(0xffffff);
    const add = (parent: THREE.Object3D, g: THREE.BufferGeometry, name: string) => {
      const m = new THREE.Mesh(g, mats[name] ?? mats.wire);
      m.castShadow = name !== 'glass';
      m.receiveShadow = true;
      parent.add(m);
    };

    const kit = new Kit();
    let blob: [number, number];
    if (kind === 'kapcai') {
      // body and rider are built together; the rider's triangles come last in each material and get their own meshes
      const start = kapcai(kit, white, true, true);
      this.rider = new THREE.Group();
      this.rider.visible = false;
      this.body.add(this.rider);
      for (const [name, buf] of kit.bufs) {
        if (!buf.idx.length) continue;
        const first = start.get(name) ?? 0;
        let cut = buf.idx.length;
        for (let i = 0; i < buf.idx.length; i += 3) if (buf.idx[i] >= first) { cut = i; break; }
        if (cut > 0) add(this.body, geometry(buf, 0, cut), name);
        if (cut < buf.idx.length) add(this.rider, geometry(buf, cut), name);
      }
      this.wheelRadius = KAPCAI_WHEEL;
      const wk = new Kit();
      wk.use('wire');
      for (const s of [-1, 1]) wk.at({ rx: (s * Math.PI) / 2 }, () => kapcaiWheel(wk));
      const parts: [THREE.BufferGeometry, THREE.Material][] = [];
      for (const [name, buf] of wk.bufs) if (buf.idx.length) parts.push([geometry(buf), mats[name] ?? mats.wire]);
      KAPCAI_AXLES.forEach((xw, i) => {
        const steer = new THREE.Group();
        steer.position.set(xw, KAPCAI_WHEEL, 0);
        const spin = new THREE.Group();
        for (const [g, m] of parts) { const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; spin.add(mesh); }
        steer.add(spin);
        frame.add(steer);
        // (side 0: this wheel's axle is the frame's z, so it spins about z)
        this.wheels.push({ steer, spin, side: 0, front: i === 1 });
      });
      blob = [1.3, 2.5];
      this.markerY = 2.2;
    } else {
      const style = STYLE[kind];
      vehicle(kit, style, white, null, '', true, kind === 'taxi');
      for (const [name, buf] of kit.bufs) if (buf.idx.length) add(this.body, geometry(buf), name);
      // One wheel geometry (tyre + alloy), four placements.
      const wk = new Kit();
      const W = vehicleWheels(style);
      this.wheelRadius = W.rw;
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
      blob = kind === 'pickup' ? [2.7, 6.1] : kind === 'taxi' ? [2.5, 5.2] : [2.5, 4.7];
      this.markerY = kind === 'pickup' ? 2.65 : 2.35;
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
    if (kind !== 'kapcai') this.reverseLamp = lamp('lower', 0.007, 0xf4f1e8, 'reverse-lamps');

    // Soft contact shadow on the road (also the only shadow on the low preset, which has no shadow maps).
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(blob[0], blob[1]).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -24 }),
    );
    shadow.position.y = 0.025;
    shadow.renderOrder = 8;
    this.root.add(shadow);

    this.marker = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 0.6, 4).rotateX(Math.PI),
      new THREE.MeshBasicMaterial({ color: 0xf2c14e, fog: false, depthTest: false, transparent: true, opacity: 0.95 }),
    );
    this.marker.renderOrder = 50;
    this.root.add(this.marker);
    this.setPaint(colour, 0);
  }

  /** Paint the body (sRGB hex), dulled toward soot by `damage` (0..1): the damage tint. */
  setPaint(colour: number, damage = 0): void {
    this.paintColor.setHex(colour).lerp(SOOT, Math.min(1, Math.max(0, damage)) * 0.72);
    this.mats.carpaint.color.copy(this.paintColor);
    // (glass and trim go dull too, less)
    const k = 1 - Math.min(1, Math.max(0, damage)) * 0.35;
    this.mats.glass.color.setScalar(k);
    this.mats.gold.color.setScalar(k);
  }

  /** The kapcai's rider is shown while it is ridden (the player's own body is hidden at the wheel). */
  setRidden(on: boolean): void {
    if (this.rider) this.rider.visible = on;
  }

  /** Copy the physics state onto the meshes. */
  sync(car: VehicleBody, dt: number): void {
    this.time += dt;
    this.root.position.set(car.x, car.y, car.z);
    const bike = this.kind === 'kapcai';
    // (two wheels in line: the ground gives no roll worth showing; the bike leans into the turn instead)
    this.root.rotation.set(-car.pitch, car.heading, bike ? 0 : car.roll);
    // Body lean on its springs: squat under power, dive under braking, roll out of a turn.
    const k = 1 - Math.exp(-9 * dt);
    const pitch = THREE.MathUtils.clamp(car.accelLong * 0.0045, -0.05, 0.035);
    this.body.rotation.z += (pitch - this.body.rotation.z) * k;
    if (bike) {
      this.lean += (THREE.MathUtils.clamp(-car.accelLat * 0.055, -0.5, 0.5) - this.lean) * k;
      this.root.rotation.z = this.lean;
    } else {
      const roll = THREE.MathUtils.clamp(car.accelLat * 0.006, -0.06, 0.06);
      this.body.rotation.x += (roll - this.body.rotation.x) * k;
    }
    const angle = car.travel / this.wheelRadius;
    for (const w of this.wheels) {
      if (w.front) w.steer.rotation.y = car.steer;
      if (w.side === 0) w.spin.rotation.z = -angle; else w.spin.rotation.y = -w.side * angle;
    }
    this.brakeLamp.visible = this.lightsOn && car.braking;
    if (this.reverseLamp) this.reverseLamp.visible = this.lightsOn && car.reverseGear;
    this.marker.position.y = this.markerY + Math.sin(this.time * 2.4) * 0.12;
    this.marker.rotation.y = this.time * 1.5;
  }
}
