import * as THREE from 'three';

// One procedurally painted texture atlas for every shophouse facade (no image downloads).
// Wall areas are white so the per-lot vertex colour tints them; shutters, glass and doors carry
// their own colour. 4 x 4 grid of square tiles.

export const TILE = {
  white: 0, upperLouvre: 1, upperArched: 2, upperCasement: 3,
  upperFrench: 4, groundShutter: 5, groundTimber: 6, groundOpen: 7,
  floorTile: 8, blind: 9,
} as const;
const GRID = 4;
const PAD = 0.004;

/** [u0, v0, u1, v1] of a tile (v0 = bottom). */
export function tileUV(t: number): readonly number[] {
  return UVS[t];
}
const UVS: number[][] = [];
for (let t = 0; t < GRID * GRID; t++) {
  const c = t % GRID, r = Math.floor(t / GRID);
  UVS.push([c / GRID + PAD, 1 - (r + 1) / GRID + PAD, (c + 1) / GRID - PAD, 1 - r / GRID - PAD]);
}
/** A point inside the white tile, for untextured coloured faces. */
export const WHITE_UV: readonly number[] = [0.11, 0.86, 0.14, 0.89];

type G = CanvasRenderingContext2D;

function rnd(seed: number): () => number {
  let s = seed | 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) | 0) >>> 0) / 4294967296;
}

/** Louvred timber shutter leaf. */
function shutter(g: G, x: number, y: number, w: number, h: number, colour: string, dark: string): void {
  g.fillStyle = colour;
  g.fillRect(x, y, w, h);
  g.fillStyle = dark;
  const slats = Math.round(h / (w * 0.16));
  for (let i = 0; i < slats; i++) g.fillRect(x + w * 0.12, y + (h * (i + 0.5)) / slats, w * 0.76, Math.max(1, h / slats / 2.6));
  g.strokeStyle = dark;
  g.lineWidth = Math.max(1, w * 0.05);
  g.strokeRect(x + g.lineWidth / 2, y + g.lineWidth / 2, w - g.lineWidth, h - g.lineWidth);
}

function frame(g: G, x: number, y: number, w: number, h: number, t: number, colour = '#e9e6df'): void {
  g.fillStyle = 'rgba(0,0,0,0.22)'; // soft shadow under the surround
  g.fillRect(x - t, y + h, w + 2 * t, t * 0.9);
  g.fillStyle = colour;
  g.fillRect(x - t, y - t, w + 2 * t, h + 2 * t);
}

function glass(g: G, x: number, y: number, w: number, h: number): void {
  const grad = g.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, '#7e98a8');
  grad.addColorStop(0.55, '#4a5d69');
  grad.addColorStop(1, '#2f3b44');
  g.fillStyle = grad;
  g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(255,255,255,0.13)';
  g.beginPath();
  g.moveTo(x, y + h * 0.55); g.lineTo(x + w * 0.6, y); g.lineTo(x + w * 0.85, y); g.lineTo(x, y + h * 0.8);
  g.fill();
}

/** Faint moulding lines and weathering common to the upper-storey tiles. */
function upperBase(g: G, S: number, seed: number): void {
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, S, S);
  const r = rnd(seed);
  // rain streaks below the cornice
  for (let i = 0; i < 26; i++) {
    const x = r() * S, len = S * (0.08 + r() * 0.3);
    const grad = g.createLinearGradient(0, 0, 0, len);
    grad.addColorStop(0, `rgba(60,55,45,${0.05 + r() * 0.07})`);
    grad.addColorStop(1, 'rgba(60,55,45,0)');
    g.fillStyle = grad;
    g.fillRect(x, 0, S * (0.006 + r() * 0.012), len);
  }
  g.fillStyle = 'rgba(0,0,0,0.07)';
  g.fillRect(0, S * 0.965, S, S * 0.035);
}

function drawTiles(g: G, S: number): void {
  const at = (t: number, fn: () => void) => {
    g.save();
    g.translate((t % GRID) * S, Math.floor(t / GRID) * S);
    g.beginPath(); g.rect(0, 0, S, S); g.clip();
    fn();
    g.restore();
  };
  at(TILE.white, () => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S); });

  // Upper storey, three tall louvred shutter windows with fanlights (the classic Main Bazaar look).
  at(TILE.upperLouvre, () => {
    upperBase(g, S, 11);
    for (let i = 0; i < 3; i++) {
      const w = S * 0.2, x = S * (0.1 + i * 0.3), y = S * 0.26, h = S * 0.56;
      frame(g, x, y, w, h, S * 0.018);
      shutter(g, x, y + h * 0.2, w / 2 - 1, h * 0.8, '#3f6f62', '#2a4c43');
      shutter(g, x + w / 2 + 1, y + h * 0.2, w / 2 - 1, h * 0.8, '#3f6f62', '#2a4c43');
      glass(g, x, y, w, h * 0.17);
      g.fillStyle = '#e9e6df'; g.fillRect(x + w / 2 - 1, y, 2, h * 0.17);
    }
  });
  // Upper storey, arched openings with brown shutters.
  at(TILE.upperArched, () => {
    upperBase(g, S, 23);
    for (let i = 0; i < 3; i++) {
      const w = S * 0.21, x = S * (0.095 + i * 0.3), y = S * 0.3, h = S * 0.5;
      g.fillStyle = '#e9e6df';
      g.beginPath(); g.arc(x + w / 2, y, w / 2 + S * 0.02, Math.PI, 0); g.fill();
      frame(g, x, y, w, h, S * 0.02);
      g.fillStyle = '#4b5a63';
      g.beginPath(); g.arc(x + w / 2, y, w / 2, Math.PI, 0); g.fill();
      g.strokeStyle = '#e9e6df'; g.lineWidth = 2;
      for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(x + w / 2, y); g.lineTo(x + w / 2 + Math.cos(Math.PI * (1 + k / 4)) * w / 2, y + Math.sin(Math.PI * (1 + k / 4)) * w / 2); g.stroke(); }
      shutter(g, x, y, w / 2 - 1, h, '#7a5236', '#553722');
      shutter(g, x + w / 2 + 1, y, w / 2 - 1, h, '#7a5236', '#553722');
    }
    // balustrade band under the windows
    g.fillStyle = 'rgba(0,0,0,0.1)';
    for (let i = 0; i < 24; i++) g.fillRect(S * (0.05 + i * 0.038), S * 0.86, S * 0.014, S * 0.07);
    g.fillStyle = '#eeebe4'; g.fillRect(S * 0.03, S * 0.84, S * 0.94, S * 0.022);
  });
  // Upper storey, later renovation: glazed casements, window hoods.
  at(TILE.upperCasement, () => {
    upperBase(g, S, 37);
    for (let i = 0; i < 2; i++) {
      const w = S * 0.3, x = S * (0.13 + i * 0.44), y = S * 0.3, h = S * 0.42;
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x - S * 0.03, y - S * 0.045, w + S * 0.06, S * 0.05);
      g.fillStyle = '#dedad0'; g.fillRect(x - S * 0.035, y - S * 0.06, w + S * 0.07, S * 0.03);
      frame(g, x, y, w, h, S * 0.014, '#f2f0ea');
      glass(g, x, y, w, h);
      g.fillStyle = '#f2f0ea';
      g.fillRect(x + w / 3 - 1, y, 3, h); g.fillRect(x + (2 * w) / 3 - 1, y, 3, h); g.fillRect(x, y + h * 0.3, w, 3);
    }
  });
  // Upper storey, full-height French shutters behind a low railing.
  at(TILE.upperFrench, () => {
    upperBase(g, S, 51);
    for (let i = 0; i < 2; i++) {
      const w = S * 0.26, x = S * (0.16 + i * 0.42), y = S * 0.2, h = S * 0.68;
      frame(g, x, y, w, h, S * 0.02);
      shutter(g, x, y, w / 2 - 1, h, '#4f7396', '#35516c');
      shutter(g, x + w / 2 + 1, y, w / 2 - 1, h, '#4f7396', '#35516c');
      g.strokeStyle = '#2b2b2b'; g.lineWidth = Math.max(1, S * 0.006);
      g.strokeRect(x - S * 0.02, y + h * 0.68, w + S * 0.04, h * 0.3);
      for (let k = 1; k < 7; k++) { g.beginPath(); g.moveTo(x - S * 0.02 + ((w + S * 0.04) * k) / 7, y + h * 0.68); g.lineTo(x - S * 0.02 + ((w + S * 0.04) * k) / 7, y + h * 0.98); g.stroke(); }
    }
  });

  // Ground floor: closed roller shutter between plastered jambs.
  at(TILE.groundShutter, () => {
    g.fillStyle = '#e8e4da'; g.fillRect(0, 0, S, S);
    const x = S * 0.07, w = S * 0.86, y = S * 0.1;
    g.fillStyle = '#6f7478'; g.fillRect(x, y - S * 0.05, w, S * 0.06); // shutter box
    const grad = g.createLinearGradient(0, y, 0, S);
    grad.addColorStop(0, '#a9aeb1'); grad.addColorStop(1, '#8b9093');
    g.fillStyle = grad; g.fillRect(x, y, w, S - y);
    for (let i = 0; i < 34; i++) {
      const yy = y + ((S - y) * i) / 34;
      g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(x, yy, w, 1.5);
      g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x, yy + (S - y) / 34 - 2, w, 2);
    }
    const r = rnd(5);
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(90,60,40,${r() * 0.1})`; g.fillRect(x + r() * w, y + r() * (S - y), S * 0.03 * r(), S * 0.12 * r()); }
    g.fillStyle = '#5d6165'; g.fillRect(x, S * 0.955, w, S * 0.045);
    g.fillStyle = '#3c3f42'; g.fillRect(x + w / 2 - S * 0.02, S * 0.93, S * 0.04, S * 0.03);
  });
  // Ground floor: timber folding doors with ventilation transom.
  at(TILE.groundTimber, () => {
    g.fillStyle = '#e8e4da'; g.fillRect(0, 0, S, S);
    const x = S * 0.07, w = S * 0.86;
    g.fillStyle = '#3a2a1e'; g.fillRect(x, S * 0.04, w, S * 0.96);
    // transom: vertical bars
    g.fillStyle = '#211812'; g.fillRect(x + 3, S * 0.06, w - 6, S * 0.16);
    g.fillStyle = '#6d4c33';
    for (let i = 0; i < 22; i++) g.fillRect(x + 6 + ((w - 12) * i) / 22, S * 0.06, (w - 12) / 44, S * 0.16);
    for (let i = 0; i < 6; i++) {
      const px = x + 4 + ((w - 8) * i) / 6, pw = (w - 8) / 6 - 3;
      const grad = g.createLinearGradient(px, 0, px + pw, 0);
      grad.addColorStop(0, '#7b5638'); grad.addColorStop(0.5, '#8a6242'); grad.addColorStop(1, '#6a4a30');
      g.fillStyle = grad; g.fillRect(px, S * 0.25, pw, S * 0.75);
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2;
      g.strokeRect(px + pw * 0.14, S * 0.29, pw * 0.72, S * 0.28);
      g.strokeRect(px + pw * 0.14, S * 0.62, pw * 0.72, S * 0.32);
    }
  });
  // Ground floor: open shop, dim interior with shelves and a counter.
  at(TILE.groundOpen, () => {
    g.fillStyle = '#e8e4da'; g.fillRect(0, 0, S, S);
    const x = S * 0.07, w = S * 0.86, y = S * 0.05;
    const grad = g.createLinearGradient(0, y, 0, S);
    grad.addColorStop(0, '#15130f'); grad.addColorStop(0.6, '#2c2620'); grad.addColorStop(1, '#4a4138');
    g.fillStyle = grad; g.fillRect(x, y, w, S - y);
    const r = rnd(77);
    const goods = ['#b9442f', '#d9b23c', '#3f7fa6', '#e6e0cf', '#5d8f4e', '#c9772f', '#8d5fa8'];
    for (let row = 0; row < 4; row++) {
      const yy = S * (0.2 + row * 0.13);
      g.fillStyle = '#5a4634'; g.fillRect(x + w * 0.04, yy + S * 0.085, w * 0.55, S * 0.012);
      for (let i = 0; i < 12; i++) { g.fillStyle = goods[Math.floor(r() * goods.length)]; g.globalAlpha = 0.75; g.fillRect(x + w * (0.05 + i * 0.045), yy + S * 0.085 - S * (0.03 + r() * 0.045), w * 0.035, S * (0.03 + r() * 0.045)); }
      g.globalAlpha = 1;
    }
    g.fillStyle = '#6b513a'; g.fillRect(x + w * 0.62, S * 0.72, w * 0.34, S * 0.28); // counter
    g.fillStyle = '#8a6c4e'; g.fillRect(x + w * 0.6, S * 0.7, w * 0.38, S * 0.03);
    // hanging lamps
    for (const lx of [0.3, 0.72]) {
      const gl = g.createRadialGradient(x + w * lx, S * 0.16, 1, x + w * lx, S * 0.16, S * 0.16);
      gl.addColorStop(0, 'rgba(255,225,160,0.75)'); gl.addColorStop(1, 'rgba(255,225,160,0)');
      g.fillStyle = gl; g.fillRect(x, y, w, S * 0.4);
    }
    g.fillStyle = '#6f7478'; g.fillRect(x, y - S * 0.045, w, S * 0.055); // rolled-up shutter
  });

  // Five-foot way floor: small square tiles.
  at(TILE.floorTile, () => {
    g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#cfcfcf'; g.fillRect(0, 0, S, S); // grout
    const r = rnd(9), N = 24;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const v = 232 + Math.floor(r() * 23);
      g.fillStyle = (i + j) % 2 ? `rgb(${v},${v},${v})` : `rgb(${v - 16},${v - 16},${v - 16})`;
      g.fillRect((i * S) / N + 0.7, (j * S) / N + 0.7, S / N - 1.4, S / N - 1.4);
    }
  });
  // Bamboo / canvas blind: horizontal slats.
  at(TILE.blind, () => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 40; i++) { g.fillStyle = i % 2 ? 'rgba(0,0,0,0.16)' : 'rgba(0,0,0,0.03)'; g.fillRect(0, (i * S) / 40, S, S / 40); }
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, S * 0.96, S, S * 0.04);
  });
}

export function facadeAtlas(tile = 512): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = tile * GRID;
  drawTiles(c.getContext('2d')!, tile);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
