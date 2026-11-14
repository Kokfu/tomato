import * as THREE from 'three';

/** State handed to a character visual every frame. */
export interface CharacterState {
  /** Horizontal speed in m/s. */
  speed: number;
  grounded: boolean;
  /** Vertical velocity in m/s. */
  vy: number;
}

/**
 * A character visual: a root object whose origin is at the feet, facing +Z in its local frame.
 * The GLB-based character implements the same interface so it can replace the procedural one.
 */
export interface CharacterVisual {
  readonly root: THREE.Object3D;
  update(dt: number, state: CharacterState): void;
  dispose(): void;
}

const SKIN = 0xc68e6a;
const SHIRT = 0x2f6f9f;
const TROUSERS = 0x2c2f38;
const SHOES = 0x1b1b1d;
const HAIR = 0x18120e;

function limb(len: number, radius: number, color: number): THREE.Mesh {
  const geo = new THREE.CapsuleGeometry(radius, Math.max(0.01, len - radius * 2), 3, 8);
  geo.translate(0, -len / 2, 0); // pivot at the top
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }));
  mesh.castShadow = true;
  return mesh;
}

/**
 * Lightweight procedural humanoid (1.72 m) with idle / walk / run / jump animation.
 * The gait phase advances with distance travelled, so stride matches ground speed (no foot sliding).
 */
export class ProceduralHumanoid implements CharacterVisual {
  readonly root = new THREE.Group();
  private hips = new THREE.Group();
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private foreL = new THREE.Group();
  private foreR = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private shinL = new THREE.Group();
  private shinR = new THREE.Group();
  private phase = 0;
  private idleT = 0;
  private blend = 0; // 0 idle .. 1 moving
  private runBlend = 0;
  private air = 0;

  private static HIP_Y = 0.92;
  private static THIGH = 0.44;
  private static SHIN = 0.44;

  constructor() {
    const P = ProceduralHumanoid;
    this.root.add(this.hips);
    this.hips.position.y = P.HIP_Y;

    // Pelvis + torso
    const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.2), new THREE.MeshLambertMaterial({ color: TROUSERS }));
    pelvis.position.y = 0.02;
    pelvis.castShadow = true;
    this.hips.add(pelvis);
    this.hips.add(this.torso);
    this.torso.position.y = 0.1;
    const chestGeo = new THREE.CapsuleGeometry(0.17, 0.3, 3, 10);
    chestGeo.scale(1.08, 1, 0.72);
    const chest = new THREE.Mesh(chestGeo, new THREE.MeshLambertMaterial({ color: SHIRT }));
    chest.position.y = 0.3;
    chest.castShadow = true;
    this.torso.add(chest);

    // Neck + head
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 8), new THREE.MeshLambertMaterial({ color: SKIN }));
    neck.position.y = 0.6;
    this.torso.add(neck);
    this.torso.add(this.head);
    this.head.position.y = 0.66;
    const skullGeo = new THREE.SphereGeometry(0.105, 14, 12);
    skullGeo.scale(0.92, 1.12, 1);
    const skull = new THREE.Mesh(skullGeo, new THREE.MeshLambertMaterial({ color: SKIN }));
    skull.position.y = 0.11;
    skull.castShadow = true;
    this.head.add(skull);
    const hairGeo = new THREE.SphereGeometry(0.11, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
    hairGeo.scale(0.95, 1.1, 1.03);
    const hair = new THREE.Mesh(hairGeo, new THREE.MeshLambertMaterial({ color: HAIR }));
    hair.position.set(0, 0.125, -0.012);
    this.head.add(hair);

    // Arms
    for (const side of [-1, 1]) {
      const arm = side < 0 ? this.armL : this.armR;
      const fore = side < 0 ? this.foreL : this.foreR;
      arm.position.set(side * 0.215, 0.52, 0);
      this.torso.add(arm);
      const upper = limb(0.29, 0.048, SHIRT);
      arm.add(upper);
      fore.position.y = -0.28;
      arm.add(fore);
      fore.add(limb(0.27, 0.04, SKIN));
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshLambertMaterial({ color: SKIN }));
      hand.position.y = -0.29;
      fore.add(hand);
    }

    // Legs
    for (const side of [-1, 1]) {
      const leg = side < 0 ? this.legL : this.legR;
      const shin = side < 0 ? this.shinL : this.shinR;
      leg.position.set(side * 0.095, 0, 0);
      this.hips.add(leg);
      leg.add(limb(P.THIGH, 0.075, TROUSERS));
      shin.position.y = -P.THIGH;
      leg.add(shin);
      shin.add(limb(P.SHIN, 0.058, TROUSERS));
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.07, 0.25), new THREE.MeshLambertMaterial({ color: SHOES }));
      foot.position.set(0, -P.SHIN + 0.0, 0.06);
      foot.castShadow = true;
      shin.add(foot);
    }
  }

  update(dt: number, s: CharacterState): void {
    const P = ProceduralHumanoid;
    const k = 1 - Math.exp(-dt * 10);
    this.blend += ((s.speed > 0.15 ? 1 : 0) - this.blend) * k;
    this.runBlend += (THREE.MathUtils.clamp((s.speed - 2.6) / 2.4, 0, 1) - this.runBlend) * k;
    this.air += ((s.grounded ? 0 : 1) - this.air) * (1 - Math.exp(-dt * 14));
    this.idleT += dt;

    // Stride length (one full cycle = two steps) grows with speed: ~1.45 m walking, ~3.0 m running.
    const stride = 1.45 + this.runBlend * 1.55;
    if (s.grounded) this.phase += (s.speed * dt * Math.PI * 2) / stride;
    const ph = this.phase;
    const m = this.blend;
    const r = this.runBlend;

    const swing = (0.5 + 0.38 * r) * m;
    const kneeAmp = (0.75 + 0.75 * r) * m;
    const armAmp = (0.42 + 0.55 * r) * m;
    const elbow = 0.18 + 1.15 * r * m + 0.1 * m;

    const legPose = (leg: THREE.Group, shin: THREE.Group, p: number) => {
      const sn = Math.sin(p);
      leg.rotation.x = -sn * swing + this.air * -0.35;
      // Knee flexes while the leg swings forward (recovery phase).
      const flex = Math.max(0, Math.cos(p - 0.35));
      shin.rotation.x = flex * kneeAmp + 0.04 + this.air * 0.9;
    };
    legPose(this.legL, this.shinL, ph);
    legPose(this.legR, this.shinR, ph + Math.PI);

    const breathe = Math.sin(this.idleT * 1.6) * 0.012 * (1 - m);
    this.armL.rotation.x = Math.sin(ph) * armAmp + this.air * -0.5;
    this.armR.rotation.x = Math.sin(ph + Math.PI) * armAmp + this.air * -0.5;
    this.armL.rotation.z = -0.07 - this.air * 0.35;
    this.armR.rotation.z = 0.07 + this.air * 0.35;
    this.foreL.rotation.x = -elbow;
    this.foreR.rotation.x = -elbow;

    // Body bob (twice per cycle), forward lean when running, subtle counter-rotation.
    const bob = Math.abs(Math.cos(ph)) * (0.025 + 0.035 * r) * m;
    const legDrop = (1 - Math.cos(swing)) * (P.THIGH + P.SHIN) * 0.5;
    this.hips.position.y = P.HIP_Y - legDrop + bob + breathe;
    this.torso.rotation.x = 0.03 + 0.16 * r * m + this.air * 0.1;
    this.torso.rotation.y = Math.sin(ph) * 0.09 * m;
    this.hips.rotation.y = -Math.sin(ph) * 0.06 * m;
    this.head.rotation.x = -0.1 * r * m;
    this.head.rotation.y = -this.torso.rotation.y * 0.7;
    this.torso.scale.y = 1 + breathe * 0.6;
  }

  dispose(): void {
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    });
  }
}
