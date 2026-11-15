import * as THREE from 'three';

// Procedurally painted atlas for the high-fidelity district facades (no image downloads).
// "Tintable" tiles are painted in greys around white so the per-lot vertex colour gives the paint
// colour; the others carry their own colours. 4 x 4 grid of square tiles.

export const HT = {
  white: 0, louvre: 1, plaster: 2, glass: 3,
  roller: 4, timberDoor: 5, shopCraft: 6, shopCafe: 7,
  shopDry: 8, floorTile: 9, stripes: 10, zinc: 11,
  clayTile: 12, goods: 13, fanlight: 14, panel: 15,
} as const;
const GRID = 4;
const PAD = 0.006;

const UVS: number[][] = [];
for (let t = 0; t < GRID * GRID; t++) {
  const c = t % GRID, r = Math.floor(t / GRID);
  UVS.push([c / GRID + PAD, 1 - (r + 1) / GRID + PAD, (c + 1) / GRID - PAD, 1 - r / GRID - PAD]);
}
/** [u0, v0, u1, v1] of a tile (v0 = bottom). */
export function htUV(t: number): readonly number[] {
  return UVS[t];
}
/** Sub-rectangle of a tile: fractions of the tile, (0, 0) = bottom-left. */
export function htSub(t: number, x0: number, y0: number, x1: number, y1: number): number[] {
  const u = UVS[t];
  return [u[0] + (u[2] - u[0]) * x0, u[1] + (u[3] - u[1]) * y0, u[0] + (u[2] - u[0]) * x1, u[1] + (u[3] - u[1]) * y1];
}
export const HT_WHITE: readonly number[] = [0.11, 0.86, 0.14, 0.89];

type G = CanvasRenderingContext2D;
function rnd(seed: number): () => number {
  let s = seed | 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) | 0) >>> 0) / 4294967296;
}

function draw(g: G, S: number): void {
  const at = (t: number, fn: () => void) => {
    g.save();
    g.translate((t % GRID) * S, Math.floor(t / GRID) * S);
    g.beginPath(); g.rect(0, 0, S, S); g.clip();
    fn();
    g.restore();
  };
  at(HT.white, () => { g.fillStyle = '#fff'; g.fillRect(0, 0, S, S); });

  // Timber louvred shutter leaf (tintable): stiles, rails and angled slats with a shadow under each.
  at(HT.louvre, () => {
    g.fillStyle = '#e9e9e9'; g.fillRect(0, 0, S, S);
    const m = S * 0.09;
    const panel = (y0: number, y1: number) => {
      g.fillStyle = '#8f8f8f'; g.fillRect(m, y0, S - 2 * m, y1 - y0);
      const n = Math.round((y1 - y0) / (S * 0.036));
      for (let i = 0; i < n; i++) {
        const y = y0 + ((y1 - y0) * i) / n, h = (y1 - y0) / n;
        const gr = g.createLinearGradient(0, y, 0, y + h);
        gr.addColorStop(0, '#fbfbfb'); gr.addColorStop(0.55, '#d2d2d2'); gr.addColorStop(0.62, '#5c5c5c'); gr.addColorStop(1, '#757575');
        g.fillStyle = gr; g.fillRect(m, y, S - 2 * m, h);
      }
    };
    panel(S * 0.05, S * 0.47); panel(S * 0.53, S * 0.95);
    g.strokeStyle = 'rgba(0,0,0,0.28)'; g.lineWidth = S * 0.008;
    g.strokeRect(m, S * 0.05, S - 2 * m, S * 0.42); g.strokeRect(m, S * 0.53, S - 2 * m, S * 0.42);
    const r = rnd(3);
    for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(40,30,20,${r() * 0.08})`; g.fillRect(r() * S, r() * S, S * 0.01, S * (0.03 + r() * 0.12)); }
  });

  // Painted lime plaster (tintable): rain streaks from the top, damp darkening at the foot, patches.
  at(HT.plaster, () => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, S, S);
    const r = rnd(41);
    for (let i = 0; i < 90; i++) {
      const x = r() * S, len = S * (0.1 + r() * 0.55), w = S * (0.004 + r() * 0.02);
      const gr = g.createLinearGradient(0, 0, 0, len);
      gr.addColorStop(0, `rgba(58,52,40,${0.04 + r() * 0.09})`); gr.addColorStop(1, 'rgba(58,52,40,0)');
      g.fillStyle = gr; g.fillRect(x, 0, w, len);
    }
    for (let i = 0; i < 26; i++) {
      const x = r() * S, y = r() * S, rad = S * (0.03 + r() * 0.09);
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      const dark = r() < 0.6;
      gr.addColorStop(0, dark ? `rgba(70,66,52,${0.02 + r() * 0.05})` : `rgba(255,255,255,${0.2 + r() * 0.3})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    const foot = g.createLinearGradient(0, S * 0.8, 0, S);
    foot.addColorStop(0, 'rgba(50,55,40,0)'); foot.addColorStop(1, 'rgba(50,55,40,0.3)');
    g.fillStyle = foot; g.fillRect(0, S * 0.8, S, S * 0.2);
    const top = g.createLinearGradient(0, 0, 0, S * 0.1);
    top.addColorStop(0, 'rgba(30,28,22,0.3)'); top.addColorStop(1, 'rgba(30,28,22,0)');
    g.fillStyle = top; g.fillRect(0, 0, S, S * 0.1);
  });

  // Glazed casement: dark room behind, sky reflection, timber glazing bars.
  at(HT.glass, () => {
    const gr = g.createLinearGradient(0, 0, S, S);
    gr.addColorStop(0, '#8fa7b4'); gr.addColorStop(0.45, '#3d4d58'); gr.addColorStop(1, '#1f282e');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    g.fillStyle = 'rgba(255,255,255,0.14)';
    g.beginPath(); g.moveTo(0, S * 0.7); g.lineTo(S * 0.7, 0); g.lineTo(S, 0); g.lineTo(0, S); g.fill();
    g.fillStyle = '#ece8df';
    const t = S * 0.045;
    g.fillRect(0, 0, S, t); g.fillRect(0, S - t, S, t); g.fillRect(0, 0, t, S); g.fillRect(S - t, 0, t, S);
    g.fillRect(S / 2 - t / 2, 0, t, S);
    for (const y of [0.33, 0.66]) g.fillRect(0, S * y - t / 3, S, t / 1.5);
  });

  // Roller shutter (tintable), with the hood box on top and grime.
  at(HT.roller, () => {
    g.fillStyle = '#c9c9c9'; g.fillRect(0, 0, S, S);
    const n = 30;
    for (let i = 0; i < n; i++) {
      const y = (S * i) / n, h = S / n;
      const gr = g.createLinearGradient(0, y, 0, y + h);
      gr.addColorStop(0, '#f1f1f1'); gr.addColorStop(0.7, '#b9b9b9'); gr.addColorStop(1, '#6f6f6f');
      g.fillStyle = gr; g.fillRect(0, y, S, h);
    }
    const r = rnd(8);
    for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(80,55,35,${r() * 0.12})`; g.fillRect(r() * S, r() * S, S * 0.04 * r(), S * 0.2 * r()); }
    g.fillStyle = '#7b7b7b'; g.fillRect(0, 0, S, S * 0.06);
    g.fillStyle = '#5a5a5a'; g.fillRect(0, S * 0.96, S, S * 0.04);
  });

  // Timber folding doors with a barred ventilation transom.
  at(HT.timberDoor, () => {
    g.fillStyle = '#2c2018'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#17110c'; g.fillRect(0, 0, S, S * 0.2);
    g.fillStyle = '#7a5738';
    for (let i = 0; i < 26; i++) g.fillRect((S * i) / 26 + 2, S * 0.015, S / 60, S * 0.17);
    g.fillStyle = '#5d4129'; g.fillRect(0, S * 0.19, S, S * 0.03);
    for (let i = 0; i < 6; i++) {
      const x = (S * i) / 6 + 2, w = S / 6 - 4;
      const gr = g.createLinearGradient(x, 0, x + w, 0);
      gr.addColorStop(0, '#7a5435'); gr.addColorStop(0.5, '#8d6442'); gr.addColorStop(1, '#63432a');
      g.fillStyle = gr; g.fillRect(x, S * 0.23, w, S * 0.77);
      g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 2;
      g.strokeRect(x + w * 0.15, S * 0.27, w * 0.7, S * 0.28); g.strokeRect(x + w * 0.15, S * 0.6, w * 0.7, S * 0.34);
    }
  });

  const interior = (seed: number, paint: (r: () => number) => void) => {
    const gr = g.createLinearGradient(0, 0, 0, S);
    gr.addColorStop(0, '#3a332a'); gr.addColorStop(0.7, '#4a4136'); gr.addColorStop(1, '#5d5245');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    paint(rnd(seed));
    for (const lx of [0.28, 0.72]) {
      const gl = g.createRadialGradient(S * lx, S * 0.08, 1, S * lx, S * 0.08, S * 0.5);
      gl.addColorStop(0, 'rgba(255,232,180,0.55)'); gl.addColorStop(1, 'rgba(255,232,180,0)');
      g.fillStyle = gl; g.fillRect(0, 0, S, S);
      g.fillStyle = '#fff6dc'; g.fillRect(S * lx - S * 0.05, S * 0.05, S * 0.1, S * 0.012);
    }
  };
  // Handicraft / souvenir shop: shelves of pottery, baskets, textiles, masks on the wall.
  at(HT.shopCraft, () => interior(61, (r) => {
    const goods = ['#b5482f', '#d7ad3d', '#2f6f8f', '#e3dcc8', '#5d8a4a', '#c5722c', '#7d4f95', '#8a5a36', '#c9a36a'];
    for (let row = 0; row < 5; row++) {
      const y = S * (0.2 + row * 0.14);
      g.fillStyle = '#6b4f37'; g.fillRect(S * 0.03, y + S * 0.1, S * 0.94, S * 0.014);
      let x = S * 0.04;
      while (x < S * 0.94) {
        const w = S * (0.025 + r() * 0.05), h = S * (0.035 + r() * 0.06);
        g.fillStyle = goods[Math.floor(r() * goods.length)];
        if (r() < 0.35) { g.beginPath(); g.ellipse(x + w / 2, y + S * 0.1 - h / 2, w / 2, h / 2, 0, 0, 7); g.fill(); } else g.fillRect(x, y + S * 0.1 - h, w, h);
        x += w + S * 0.008;
      }
    }
    for (let i = 0; i < 7; i++) { g.fillStyle = ['#a8452f', '#d9b24a', '#3d6f5a', '#e8dcc0'][i % 4]; g.fillRect(S * (0.06 + i * 0.13), S * 0.03, S * 0.09, S * 0.13); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(S * (0.06 + i * 0.13), S * 0.09, S * 0.09, S * 0.01); }
    g.fillStyle = '#74573b'; g.fillRect(S * 0.55, S * 0.86, S * 0.42, S * 0.14);
  }));
  // Kopitiam: marble tables, stools, drinks counter, menu boards.
  at(HT.shopCafe, () => interior(67, (r) => {
    g.fillStyle = '#d8d2c2'; g.fillRect(0, S * 0.12, S, S * 0.5);
    g.fillStyle = '#9db6a8'; g.fillRect(0, S * 0.45, S, S * 0.17);
    for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#b3261e' : '#f1e3a0'; g.fillRect(S * (0.05 + i * 0.24), S * 0.15, S * 0.2, S * 0.12); g.fillStyle = 'rgba(20,20,20,0.6)'; for (let k = 0; k < 4; k++) g.fillRect(S * (0.07 + i * 0.24), S * (0.17 + k * 0.022), S * (0.08 + r() * 0.08), S * 0.008); }
    g.fillStyle = '#5b4632'; g.fillRect(S * 0.6, S * 0.62, S * 0.4, S * 0.38);
    g.fillStyle = '#d9d4c8'; g.fillRect(S * 0.58, S * 0.6, S * 0.42, S * 0.03);
    for (let i = 0; i < 3; i++) {
      const x = S * (0.08 + i * 0.17), y = S * (0.74 + (i % 2) * 0.05);
      g.fillStyle = '#e9e5dc'; g.beginPath(); g.ellipse(x + S * 0.05, y, S * 0.075, S * 0.02, 0, 0, 7); g.fill();
      g.fillStyle = '#3c2f24'; g.fillRect(x + S * 0.04, y, S * 0.02, S * 0.2);
      g.fillStyle = '#b6332b'; g.fillRect(x - S * 0.035, y + S * 0.1, S * 0.05, S * 0.12); g.fillRect(x + S * 0.09, y + S * 0.1, S * 0.05, S * 0.12);
    }
  }));
  // Dry goods / antiques: dark timber cabinets, jars, hanging lanterns.
  at(HT.shopDry, () => interior(71, (r) => {
    g.fillStyle = '#4a3423'; g.fillRect(S * 0.02, S * 0.14, S * 0.96, S * 0.6);
    for (let row = 0; row < 4; row++) for (let col = 0; col < 8; col++) {
      const x = S * (0.04 + col * 0.118), y = S * (0.17 + row * 0.14);
      g.fillStyle = '#1e1610'; g.fillRect(x, y, S * 0.105, S * 0.12);
      g.fillStyle = ['#c9b48a', '#a8732f', '#7f8f6a', '#b55a3a', '#d8cfb8', '#4d6f86'][Math.floor(r() * 6)];
      const h = S * (0.04 + r() * 0.06);
      g.beginPath(); g.ellipse(x + S * 0.052, y + S * 0.12 - h / 2, S * 0.032, h / 2, 0, 0, 7); g.fill();
    }
    for (let i = 0; i < 5; i++) { g.fillStyle = '#c4281f'; g.beginPath(); g.ellipse(S * (0.12 + i * 0.19), S * 0.07, S * 0.04, S * 0.05, 0, 0, 7); g.fill(); g.fillStyle = '#e6c15a'; g.fillRect(S * (0.105 + i * 0.19), S * 0.115, S * 0.03, S * 0.02); }
    g.fillStyle = '#6a4c33'; g.fillRect(0, S * 0.8, S, S * 0.2); g.fillStyle = '#8b6a48'; g.fillRect(0, S * 0.78, S, S * 0.03);
  }));

  // Five-foot-way floor: terracotta and cream cement tiles laid diagonally, worn grout.
  at(HT.floorTile, () => {
    g.fillStyle = '#8c8377'; g.fillRect(0, 0, S, S);
    const r = rnd(9), N = 8, c = S / N;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const even = (i + j) % 2 === 0, v = r() * 22 - 11;
      g.fillStyle = even ? `rgb(${176 + v},${96 + v},${72 + v})` : `rgb(${226 + v},${214 + v},${188 + v})`;
      g.fillRect(i * c + 1.2, j * c + 1.2, c - 2.4, c - 2.4);
    }
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(40,36,30,${r() * 0.1})`; g.beginPath(); g.ellipse(r() * S, r() * S, S * 0.05 * r(), S * 0.03 * r(), r() * 3, 0, 7); g.fill(); }
  });

  // Awning canvas (tintable): broad stripes alternating with white, sagging shade lines.
  at(HT.stripes, () => {
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#9a9a9a'; g.fillRect((S * i) / 8, 0, S / 8, S); }
    const gr = g.createLinearGradient(0, 0, 0, S);
    gr.addColorStop(0, 'rgba(0,0,0,0.22)'); gr.addColorStop(0.3, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.12)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  });

  // Corrugated zinc sheet (tintable), ribs run down the slope, rust blooms.
  at(HT.zinc, () => {
    const n = 22;
    for (let i = 0; i < n; i++) {
      const x = (S * i) / n, w = S / n;
      const gr = g.createLinearGradient(x, 0, x + w, 0);
      gr.addColorStop(0, '#8d8d8d'); gr.addColorStop(0.45, '#f4f4f4'); gr.addColorStop(1, '#7c7c7c');
      g.fillStyle = gr; g.fillRect(x, 0, w + 1, S);
    }
    const r = rnd(15);
    for (let i = 0; i < 30; i++) { const x = r() * S, y = r() * S, rad = S * (0.02 + r() * 0.07); const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(120,70,40,${0.12 + r() * 0.2})`); gr.addColorStop(1, 'rgba(120,70,40,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  });

  // Clay roof tiles (tintable): half-round courses seen from below the eaves line.
  at(HT.clayTile, () => {
    g.fillStyle = '#7f7f7f'; g.fillRect(0, 0, S, S);
    const cols = 14, rows = 9, r = rnd(19);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const x = (S * i) / cols, y = (S * j) / rows, w = S / cols, h = S / rows, v = 0.86 + r() * 0.28;
      const gr = g.createLinearGradient(x, 0, x + w, 0);
      const c = (k: number) => `rgb(${Math.min(255, 255 * k * v)},${Math.min(255, 255 * k * v)},${Math.min(255, 255 * k * v)})`;
      gr.addColorStop(0, c(0.5)); gr.addColorStop(0.5, c(0.98)); gr.addColorStop(1, c(0.5));
      g.fillStyle = gr; g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, y + h - 2.5, w, 2.5);
    }
  });

  // Merchandise: rattan baskets, rolled mats, pottery (own colours) for the goods stacked outside.
  at(HT.goods, () => {
    g.fillStyle = '#6b5236'; g.fillRect(0, 0, S, S);
    const r = rnd(27);
    for (let j = 0; j < 4; j++) for (let i = 0; i < 5; i++) {
      const x = S * (0.02 + i * 0.196), y = S * (0.02 + j * 0.245), w = S * 0.18, h = S * 0.225;
      const base = ['#c9a56a', '#b78a4d', '#d8bd86', '#a8703a', '#8c5a30', '#b9482f', '#3d7a8c', '#d8cfb5'][Math.floor(r() * 8)];
      g.fillStyle = base; g.beginPath(); g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, 7); g.fill();
      g.strokeStyle = 'rgba(60,40,20,0.45)'; g.lineWidth = 1.5;
      for (let k = 1; k < 6; k++) { g.beginPath(); g.ellipse(x + w / 2, y + h / 2, (w / 2) * (k / 6), (h / 2) * (k / 6), 0, 0, 7); g.stroke(); }
    }
  });

  // Semicircular fanlight with radiating glazing bars on white plaster (tintable surround).
  at(HT.fanlight, () => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#e2e2e2'; g.beginPath(); g.arc(S / 2, S, S * 0.5, Math.PI, 0); g.fill();
    const gr = g.createLinearGradient(0, S * 0.5, 0, S);
    gr.addColorStop(0, '#6f8794'); gr.addColorStop(1, '#2c3840');
    g.fillStyle = gr; g.beginPath(); g.arc(S / 2, S, S * 0.42, Math.PI, 0); g.fill();
    g.strokeStyle = '#f4f1ea'; g.lineWidth = S * 0.03;
    for (let k = 1; k < 6; k++) { g.beginPath(); g.moveTo(S / 2, S); g.lineTo(S / 2 + Math.cos(Math.PI * (1 + k / 6)) * S * 0.42, S + Math.sin(Math.PI * (1 + k / 6)) * S * 0.42); g.stroke(); }
    g.beginPath(); g.arc(S / 2, S, S * 0.16, Math.PI, 0); g.stroke();
  });

  // Timber boarding (own colour): dark stained planks, used for carved signboard backings, crates.
  at(HT.panel, () => {
    for (let i = 0; i < 6; i++) { const v = 52 + (i * 37) % 22; g.fillStyle = `rgb(${v + 30},${v + 8},${v - 12})`; g.fillRect(0, (S * i) / 6, S, S / 6 - 2); }
    g.fillStyle = 'rgba(0,0,0,0.3)'; for (let i = 0; i < 6; i++) g.fillRect(0, (S * (i + 1)) / 6 - 2, S, 2);
  });
}

export function heritageAtlas(tile = 512): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = tile * GRID;
  draw(c.getContext('2d')!, tile);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
