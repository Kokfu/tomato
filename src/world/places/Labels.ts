import * as THREE from 'three';
import { SIGN_GLOW } from '../env.ts';

// Text signs (shop signboards, street-name plates) for one chunk: every label is drawn into one
// canvas texture and rendered as one merged mesh, so a chunk full of signs costs a single draw call.

export interface LabelSpec {
  text: string;
  /** Index into SIGN_STYLES. */
  style: number;
  /** Centre of the sign, chunk-local metres. */
  x: number; y: number; z: number;
  /** Unit vector along the wall (text reads along +e as seen from outside) and the outward normal. */
  ex: number; ez: number; nx: number; nz: number;
  maxW: number;
  h: number;
  /** Also draw the back face (free-standing street plates). */
  twoSided?: boolean;
}

/** Signboard colour schemes seen on Kuching shopfronts: [background, text, border]. */
export const SIGN_STYLES: [string, string, string][] = [
  ['#a3201c', '#f6e6b0', '#e3c56a'], // red board, gold lettering
  ['#f4f1e8', '#b01c1c', '#b01c1c'], // white board, red lettering
  ['#f0c63a', '#1c1a17', '#1c1a17'], // yellow / black
  ['#1f4d8f', '#ffffff', '#cfd9ea'], // blue / white
  ['#17402c', '#f0d98a', '#c9ae5a'], // dark green / gold
  ['#1d1b19', '#f3efe6', '#8a8376'], // black / white
  ['#efe3c8', '#5a2f1a', '#8a5a3a'], // cream / brown
  ['#0f5a3c', '#ffffff', '#ffffff'], // street-name plate (green, white text)
];
export const STREET_STYLE = 7;

const ROW = 64;
const WIDTH = 1024;
const FONT = '"Segoe UI", "Noto Sans", "Noto Sans CJK SC", "Microsoft YaHei", "PingFang SC", Arial, sans-serif';

export function buildLabels(specs: LabelSpec[], maxAnisotropy = 4): THREE.Mesh | null {
  if (!specs.length) return null;
  const measure = document.createElement('canvas').getContext('2d')!;
  // 1. Lay the labels out in rows (shelf packing).
  const rects: { x: number; y: number; w: number; font: number }[] = [];
  let cx = 0, cy = 0;
  for (const s of specs) {
    const aspect = Math.max(1.2, s.maxW / s.h);
    let font = 40;
    measure.font = `700 ${font}px ${FONT}`;
    let tw = measure.measureText(s.text).width + 36;
    const limit = Math.min(WIDTH, aspect * ROW);
    if (tw > limit) { font = Math.max(15, Math.floor((font * (limit - 36)) / (tw - 36))); tw = limit; }
    const w = Math.ceil(Math.max(tw, ROW * 1.6));
    if (cx + w > WIDTH) { cx = 0; cy += ROW; }
    rects.push({ x: cx, y: cy, w, font });
    cx += w;
  }
  const H = THREE.MathUtils.ceilPowerOfTwo(cy + ROW);
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = H;
  const g = canvas.getContext('2d')!;
  g.textAlign = 'center';
  g.textBaseline = 'middle';

  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  specs.forEach((s, i) => {
    const r = rects[i];
    const [bg, fg, border] = SIGN_STYLES[s.style % SIGN_STYLES.length];
    g.fillStyle = bg;
    g.fillRect(r.x, r.y, r.w, ROW);
    g.strokeStyle = border;
    g.lineWidth = 3;
    g.strokeRect(r.x + 3.5, r.y + 3.5, r.w - 7, ROW - 7);
    g.fillStyle = fg;
    g.font = `700 ${r.font}px ${FONT}`;
    g.fillText(s.text, r.x + r.w / 2, r.y + ROW / 2 + 2, r.w - 24);

    const w = Math.min(s.maxW, (s.h * r.w) / ROW);
    const u0 = (r.x + 0.5) / WIDTH, u1 = (r.x + r.w - 0.5) / WIDTH, v1 = 1 - (r.y + 0.5) / H, v0 = 1 - (r.y + ROW - 0.5) / H;
    const face = (ex: number, ez: number, nx: number, nz: number) => {
      // Seen from outside (looking against the normal), text runs toward the viewer's right.
      const rx = nz, rz = -nx; // right-hand direction for a viewer facing the wall
      const sgn = rx * ex + rz * ez >= 0 ? 1 : -1;
      const hx = (ex * sgn * w) / 2, hz = (ez * sgn * w) / 2;
      const px = s.x + nx * 0.05, pz = s.z + nz * 0.05;
      const b = pos.length / 3;
      pos.push(px - hx, s.y - s.h / 2, pz - hz, px + hx, s.y - s.h / 2, pz + hz, px + hx, s.y + s.h / 2, pz + hz, px - hx, s.y + s.h / 2, pz - hz);
      for (let k = 0; k < 4; k++) nor.push(nx, 0, nz);
      uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    };
    face(s.ex, s.ez, s.nx, s.nz);
    if (s.twoSided) face(s.ex, s.ez, -s.nx, -s.nz);
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  // N1-M6: the boards are lit at night. Every board material shares one emissive colour object (black by day).
  const mat = new THREE.MeshLambertMaterial({ map: tex, emissiveMap: tex, side: THREE.DoubleSide });
  mat.emissive = SIGN_GLOW;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.ownMaterial = true;
  mesh.receiveShadow = true;
  return mesh;
}
