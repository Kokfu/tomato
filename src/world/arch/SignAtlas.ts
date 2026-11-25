// N1-M4: generic Malaysian road signs, painted once into one small texture (8 signs in a row; the second row holds
// their grey backs). Order = BOARDS in src/world/types.ts. Category words only ("BERHENTI", "AWAS", "BAS"): never a
// place or business name.
import * as THREE from 'three';

const CELL = 128;
export const SIGN_COUNT = 8;

let cached: THREE.CanvasTexture | null = null;

/** uv rectangle [u0, v0, u1, v1] of sign `i`; `back`: its grey reverse. */
export function signUv(i: number, back = false): [number, number, number, number] {
  return [i / SIGN_COUNT, back ? 0 : 0.5, (i + 1) / SIGN_COUNT, back ? 0.5 : 1];
}

export function signAtlas(): THREE.CanvasTexture {
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = CELL * SIGN_COUNT; c.height = CELL * 2;
  const g = c.getContext('2d')!;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const disc = (r: number) => { g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); };
  const ngon = (n: number, r: number, rot: number) => { g.beginPath(); for (let k = 0; k < n; k++) { const a = rot + (k * Math.PI * 2) / n; g[k ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); };
  const rect = (w: number, h: number, rad: number) => { g.beginPath(); if (g.roundRect) g.roundRect(-w / 2, -h / 2, w, h, rad); else g.rect(-w / 2, -h / 2, w, h); };
  const text = (s: string, px: number, col: string, y = 0) => { g.font = `700 ${px}px Arial, Helvetica, sans-serif`; g.fillStyle = col; g.fillText(s, 0, y); };
  const speed = (n: string) => (back: boolean) => {
    disc(58); g.fillStyle = back ? '#8a8d8f' : '#c8322b'; g.fill();
    if (back) return;
    disc(45); g.fillStyle = '#f4f3ee'; g.fill();
    text(n, 54, '#151515', 3);
  };
  const signs: ((back: boolean) => void)[] = [
    speed('50'), speed('60'), speed('30'),
    (back) => { // pedestrian crossing: blue square, white triangle, walking figure
      rect(112, 112, 10); g.fillStyle = back ? '#8a8d8f' : '#1f5fa8'; g.fill();
      if (back) return;
      ngon(3, 50, -Math.PI / 2); g.fillStyle = '#f4f3ee'; g.fill();
      g.strokeStyle = '#151515'; g.lineWidth = 7; g.lineCap = 'round';
      disc(6); g.translate(0, -17); g.fillStyle = '#151515'; disc(6); g.fill(); g.translate(0, 17);
      g.beginPath(); g.moveTo(0, -8); g.lineTo(0, 8); g.moveTo(0, 8); g.lineTo(-10, 23); g.moveTo(0, 8); g.lineTo(10, 23); g.moveTo(-10, -1); g.lineTo(10, -1); g.stroke();
    },
    (back) => { // stop
      ngon(8, 60, Math.PI / 8); g.fillStyle = back ? '#8a8d8f' : '#f4f3ee'; g.fill();
      if (back) return;
      ngon(8, 54, Math.PI / 8); g.fillStyle = '#c8322b'; g.fill();
      text('BERHENTI', 19, '#f4f3ee', 1);
    },
    (back) => { // caution
      ngon(4, 62, 0); g.fillStyle = back ? '#8a8d8f' : '#151515'; g.fill();
      if (back) return;
      ngon(4, 56, 0); g.fillStyle = '#f0c62b'; g.fill();
      text('AWAS', 25, '#151515', 1);
    },
    (back) => { // bus stop
      rect(96, 116, 8); g.fillStyle = back ? '#8a8d8f' : '#1f5fa8'; g.fill();
      if (back) return;
      rect(64, 44, 8); g.translate(0, -22); g.fillStyle = '#f4f3ee'; rect(64, 44, 8); g.fill();
      g.fillStyle = '#1f5fa8'; g.fillRect(-25, -15, 50, 15);
      g.fillStyle = '#151515'; g.translate(-18, 24); disc(6); g.fill(); g.translate(36, 0); disc(6); g.fill(); g.translate(-18, -24);
      g.translate(0, 22);
      text('BAS', 30, '#f4f3ee', 34);
    },
    (back) => { // no parking
      disc(58); g.fillStyle = back ? '#8a8d8f' : '#c8322b'; g.fill();
      if (back) return;
      disc(46); g.fillStyle = '#1f5fa8'; g.fill();
      g.strokeStyle = '#c8322b'; g.lineWidth = 12; g.beginPath(); g.moveTo(-32, -32); g.lineTo(32, 32); g.stroke();
    },
  ];
  signs.forEach((draw, i) => {
    for (const back of [false, true]) {
      g.save();
      g.translate(i * CELL + CELL / 2, (back ? CELL : 0) + CELL / 2);
      draw(back);
      g.restore();
    }
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  cached = t;
  return t;
}
