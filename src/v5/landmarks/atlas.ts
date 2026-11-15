// Layout and painter of the small hand-authored texture atlas used by the hybrid (Approach B)
// landmark models: painted wall panels, door paintings, calligraphy boards, sign beams, banners.
//
// Everything here is ORIGINAL artwork drawn with Canvas 2D in the style of the real objects; no
// photograph or third-party texture is used. tools/v5/build-assets.ts runs paintAtlas() once in a
// headless browser and stores the result as public/models/v5/atlas.webp, so the shipped pixels do
// not depend on the fonts of the player's device.
export const ATLAS_SIZE = 1024;

/** name: [x, y, w, h] in pixels, y down. */
export const ATLAS_RECTS = {
  tiger: [0, 0, 256, 352],
  dragon: [256, 0, 256, 352],
  doorL: [512, 0, 128, 320],
  doorR: [640, 0, 128, 320],
  coupletL: [768, 0, 64, 320],
  coupletR: [832, 0, 64, 320],
  tag: [896, 0, 64, 128],
  swatch: [960, 0, 64, 64],
  plaqueTemple: [0, 352, 384, 112],
  stageBoard: [384, 352, 256, 112],
  notice: [640, 352, 128, 112],
  stoneCarve: [768, 352, 256, 112],
  beamBand: [0, 464, 512, 48],
  ridgeBand: [512, 464, 512, 48],
  ridgeBand2: [0, 512, 1024, 64],
  lykSign: [0, 576, 1024, 96],
  blindA: [0, 672, 256, 160],
  blindB: [256, 672, 256, 160],
  blindC: [512, 672, 256, 160],
  blindD: [768, 672, 256, 160],
  stall0: [0, 832, 256, 64],
  stall1: [256, 832, 256, 64],
  stall2: [512, 832, 256, 64],
  stall3: [768, 832, 256, 64],
  stall4: [0, 896, 256, 64],
  stall5: [256, 896, 256, 64],
  lattice: [512, 896, 128, 128],
  altar: [640, 896, 192, 128],
  menu: [832, 896, 192, 128],
} as const;
export type AtlasName = keyof typeof ATLAS_RECTS;

/** UV rectangle [u0, v0, u1, v1] (v up) of a named region, inset by half a texel. */
export function atlasUV(name: AtlasName): [number, number, number, number] {
  const [x, y, w, h] = ATLAS_RECTS[name], S = ATLAS_SIZE, e = 0.75;
  return [(x + e) / S, 1 - (y + h - e) / S, (x + w - e) / S, 1 - (y + e) / S];
}

const CJK = '"KaiTi", "STKaiti", "DFKai-SB", "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", serif';

/** Paint the whole atlas. `g` is a 2D context of an ATLAS_SIZE square canvas. */
export function paintAtlas(g: CanvasRenderingContext2D): void {
  const R = ATLAS_RECTS;
  g.fillStyle = '#808080';
  g.fillRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);
  let seed = 7;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const within = (name: AtlasName, fn: (w: number, h: number) => void) => {
    const [x, y, w, h] = R[name];
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.translate(x, y); fn(w, h); g.restore();
  };
  const text = (s: string, x: number, y: number, size: number, col: string, font = CJK, weight = 'bold') => {
    g.font = `${weight} ${size}px ${font}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = col; g.fillText(s, x, y);
  };
  const vtext = (s: string, x: number, y0: number, y1: number, size: number, col: string) => {
    const ch = [...s]; ch.forEach((c, i) => text(c, x, y0 + ((i + 0.5) * (y1 - y0)) / ch.length, size, col));
  };
  const speckle = (w: number, h: number, n: number, a: number) => {
    for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${rand() < 0.5 ? '0,0,0' : '255,255,255'},${a * rand()})`; g.fillRect(rand() * w, rand() * h, 1 + rand() * 3, 1 + rand() * 3); }
  };
  const border = (w: number, h: number, t: number, cols: string[]) => {
    // mosaic border of small ceramic pieces
    for (let i = 0; i < Math.ceil(w / t); i++) for (const y of [0, h - t]) { g.fillStyle = cols[(i + (y ? 1 : 0)) % cols.length]; g.fillRect(i * t, y, t - 1, t - 1); }
    for (let j = 0; j < Math.ceil(h / t); j++) for (const x of [0, w - t]) { g.fillStyle = cols[(j + (x ? 2 : 0)) % cols.length]; g.fillRect(x, j * t, t - 1, t - 1); }
  };
  const cloud = (x: number, y: number, s: number) => {
    g.fillStyle = 'rgba(240,244,240,0.9)';
    for (const [dx, dy, r] of [[0, 0, 1], [0.9, 0.15, 0.8], [-0.9, 0.2, 0.7], [0.35, -0.5, 0.75], [1.7, 0.35, 0.5]]) { g.beginPath(); g.ellipse(x + dx * s, y + dy * s, r * s, r * s * 0.62, 0, 0, 7); g.fill(); }
  };
  const rocks = (w: number, h: number) => {
    for (let i = 0; i < 7; i++) {
      const x = rand() * w, r = 22 + rand() * 30;
      const gr = g.createLinearGradient(0, h - r * 1.6, 0, h);
      gr.addColorStop(0, '#4f7f6a'); gr.addColorStop(1, '#24493f');
      g.fillStyle = gr; g.beginPath(); g.moveTo(x - r, h); g.lineTo(x - r * 0.5, h - r * 1.2); g.lineTo(x + r * 0.1, h - r * 1.6); g.lineTo(x + r * 0.8, h - r * 0.8); g.lineTo(x + r, h); g.fill();
    }
  };
  const panelBase = (w: number, h: number, top: string, bot: string) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, top); gr.addColorStop(1, bot);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  };

  // --- tiger relief panel (left of the centre door) ---
  within('tiger', (w, h) => {
    panelBase(w, h, '#7fc3cf', '#2f7f95');
    cloud(70, 60, 26); cloud(190, 100, 20);
    // pine
    g.strokeStyle = '#5a3a24'; g.lineWidth = 9; g.beginPath(); g.moveTo(215, h - 20); g.quadraticCurveTo(190, 190, 232, 70); g.stroke();
    for (let i = 0; i < 9; i++) { g.fillStyle = i % 2 ? '#2f6f45' : '#3f8a55'; g.beginPath(); g.ellipse(170 + rand() * 80, 60 + rand() * 90, 26, 9, rand() * 0.6 - 0.3, 0, 7); g.fill(); }
    rocks(w, h - 14);
    // tiger: body, haunch, head, legs, tail, stripes
    g.fillStyle = '#e09a2c';
    g.beginPath(); g.ellipse(120, 215, 72, 36, -0.12, 0, 7); g.fill();
    g.beginPath(); g.ellipse(70, 232, 34, 38, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(185, 180, 30, 27, 0, 0, 7); g.fill();
    for (const x of [62, 92, 150, 178]) g.fillRect(x, 240, 15, 46);
    g.strokeStyle = '#e09a2c'; g.lineWidth = 11; g.lineCap = 'round'; g.beginPath(); g.moveTo(45, 215); g.bezierCurveTo(10, 190, 30, 150, 58, 160); g.stroke();
    g.fillStyle = '#f4e3c0'; g.beginPath(); g.ellipse(190, 190, 15, 11, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(125, 236, 50, 12, -0.1, 0, 7); g.fill();
    g.strokeStyle = '#2a1a10'; g.lineWidth = 4;
    for (let i = 0; i < 9; i++) { const x = 62 + i * 13; g.beginPath(); g.moveTo(x, 188 + (i % 2) * 4); g.quadraticCurveTo(x + 6, 208, x - 2, 230); g.stroke(); }
    g.fillStyle = '#2a1a10'; g.beginPath(); g.arc(178, 174, 3, 0, 7); g.arc(194, 174, 3, 0, 7); g.fill();
    g.beginPath(); g.moveTo(166, 160); g.lineTo(172, 146); g.lineTo(180, 160); g.moveTo(190, 160); g.lineTo(198, 146); g.lineTo(204, 162); g.fillStyle = '#e09a2c'; g.fill();
    speckle(w, h, 500, 0.1);
    border(w, h, 12, ['#d9b23c', '#b8392c', '#2f6fae', '#e9e4d0', '#3f9a6a']);
  });
  // --- dragon relief panel (right of the centre door) ---
  within('dragon', (w, h) => {
    panelBase(w, h, '#86c8cc', '#2c7c8f');
    cloud(60, 70, 22); cloud(200, 50, 24); cloud(80, 250, 18);
    // waves
    for (let j = 0; j < 4; j++) { g.strokeStyle = j % 2 ? '#e6efe9' : '#1f5f7a'; g.lineWidth = 4; g.beginPath(); for (let x = 0; x <= w; x += 8) g.lineTo(x, h - 30 - j * 9 + Math.sin(x * 0.11 + j) * 6); g.stroke(); }
    // serpentine body with scales
    const P = (t: number): [number, number] => [128 + Math.sin(t * 7.2) * 70 * (0.5 + 0.5 * t), 300 - t * 235];
    for (let i = 0; i <= 60; i++) { const t = i / 60, [x, y] = P(t), r = 9 + 13 * Math.sin(Math.PI * Math.min(1, t * 1.15)); g.fillStyle = i % 2 ? '#2f9a5e' : '#58bf7c'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
    for (let i = 0; i <= 60; i += 3) { const t = i / 60, [x, y] = P(t); g.fillStyle = '#e7c24a'; g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
    const [hx, hy] = P(1);
    g.fillStyle = '#3aa868'; g.beginPath(); g.ellipse(hx + 8, hy - 4, 26, 17, -0.3, 0, 7); g.fill();
    g.strokeStyle = '#e7c24a'; g.lineWidth = 4; g.beginPath(); g.moveTo(hx - 4, hy - 16); g.lineTo(hx - 22, hy - 40); g.moveTo(hx + 12, hy - 18); g.lineTo(hx + 6, hy - 46); g.stroke();
    g.strokeStyle = '#d8402f'; g.lineWidth = 3; g.beginPath(); g.moveTo(hx + 30, hy); g.quadraticCurveTo(hx + 52, hy + 10, hx + 46, hy + 30); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(hx + 14, hy - 8, 4, 0, 7); g.fill(); g.fillStyle = '#111'; g.beginPath(); g.arc(hx + 15, hy - 8, 2, 0, 7); g.fill();
    g.fillStyle = '#d8402f'; g.beginPath(); g.arc(210, 150, 11, 0, 7); g.fill(); g.fillStyle = '#f6d36a'; g.beginPath(); g.arc(207, 147, 4, 0, 7); g.fill();
    speckle(w, h, 500, 0.1);
    border(w, h, 12, ['#d9b23c', '#b8392c', '#2f6fae', '#e9e4d0', '#3f9a6a']);
  });
  // --- door leaves: red lacquer with a painted guardian each ---
  for (const [name, flip] of [['doorL', 1], ['doorR', -1]] as [AtlasName, number][]) within(name, (w, h) => {
    panelBase(w, h, '#a3261c', '#7f1a14');
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2; g.strokeRect(5, 5, w - 10, h - 10);
    g.save(); g.translate(w / 2, 0); g.scale(flip, 1);
    g.fillStyle = '#d9b23c'; g.beginPath(); g.ellipse(0, 120, 30, 46, 0, 0, 7); g.fill();          // robe
    g.fillStyle = '#2f6fae'; g.beginPath(); g.moveTo(-34, 150); g.lineTo(34, 150); g.lineTo(44, 262); g.lineTo(-44, 262); g.fill();
    g.fillStyle = '#3f9a6a'; g.fillRect(-30, 150, 60, 14);
    g.fillStyle = '#e9c9a4'; g.beginPath(); g.arc(0, 62, 17, 0, 7); g.fill();                        // face
    g.fillStyle = '#1c1512'; g.beginPath(); g.moveTo(-12, 70); g.lineTo(12, 70); g.lineTo(0, 108); g.fill(); // beard
    g.fillStyle = '#b8392c'; g.beginPath(); g.moveTo(-22, 50); g.lineTo(22, 50); g.lineTo(12, 28); g.lineTo(0, 16); g.lineTo(-12, 28); g.fill(); // helmet
    g.strokeStyle = '#e9e4d0'; g.lineWidth = 5; g.beginPath(); g.moveTo(36, 40); g.lineTo(46, 250); g.stroke(); // halberd
    g.fillStyle = '#1c1512'; g.fillRect(-26, 262, 20, 14); g.fillRect(6, 262, 20, 14);
    g.restore();
    g.fillStyle = '#d9b23c'; g.beginPath(); g.arc(flip > 0 ? w - 16 : 16, h * 0.52, 7, 0, 7); g.fill(); // ring pull
    speckle(w, h, 260, 0.12);
  });
  // --- couplet boards: gold characters on black lacquer ---
  // Wording is generic temple couplet phrasing, not a transcription of the real boards.
  within('coupletL', (w, h) => { panelBase(w, h, '#15110e', '#0d0a08'); g.strokeStyle = '#b8902c'; g.lineWidth = 3; g.strokeRect(3, 3, w - 6, h - 6); vtext('風調雨順民安樂', w / 2, 14, h - 14, 34, '#e3bd4f'); });
  within('coupletR', (w, h) => { panelBase(w, h, '#15110e', '#0d0a08'); g.strokeStyle = '#b8902c'; g.lineWidth = 3; g.strokeRect(3, 3, w - 6, h - 6); vtext('國泰民安百業興', w / 2, 14, h - 14, 34, '#e3bd4f'); });
  within('tag', (w, h) => { g.fillStyle = '#f3ded8'; g.fillRect(0, 0, w, h); g.fillStyle = '#c9423a'; g.fillRect(0, 0, w, 10); vtext('平安', w / 2, 20, h - 10, 34, '#b3261e'); });
  within('swatch', (w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); });
  // --- name board (wording approximate: the real board was not legible in the references) ---
  within('plaqueTemple', (w, h) => {
    panelBase(w, h, '#1a1410', '#0f0b08');
    g.strokeStyle = '#c79a2e'; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
    g.strokeStyle = '#8a1c15'; g.lineWidth = 2; g.strokeRect(14, 14, w - 28, h - 28);
    const ch = ['廟', '帝', '上']; ch.forEach((c, i) => text(c, w * (0.2 + i * 0.3), h / 2 + 2, 74, '#e9c35a'));
  });
  within('stageBoard', (w, h) => {
    panelBase(w, h, '#1a1410', '#0f0b08');
    g.strokeStyle = '#c79a2e'; g.lineWidth = 5; g.strokeRect(5, 5, w - 10, h - 10);
    ['臺', '春', '陽'].forEach((c, i) => text(c, w * (0.2 + i * 0.3), h / 2 + 2, 62, '#e9c35a'));
  });
  within('notice', (w, h) => { g.fillStyle = '#b3261e'; g.fillRect(0, 0, w, h); for (let i = 0; i < 5; i++) { g.fillStyle = '#f3e3b0'; g.fillRect(12, 14 + i * 19, w - 24 - (i % 2) * 20, 6); } });
  within('stoneCarve', (w, h) => {
    panelBase(w, h, '#8f8f88', '#6f706a');
    for (let i = 0; i < 3; i++) { const x = 10 + i * 82; g.strokeStyle = '#55564f'; g.lineWidth = 3; g.strokeRect(x, 12, 72, h - 24); g.strokeStyle = '#a9aaa2'; g.lineWidth = 2; g.beginPath(); g.ellipse(x + 36, h / 2, 22, 30, 0, 0, 7); g.stroke(); g.beginPath(); g.moveTo(x + 36, h / 2 - 26); g.lineTo(x + 50, h / 2); g.lineTo(x + 36, h / 2 + 26); g.lineTo(x + 22, h / 2); g.closePath(); g.stroke(); }
    speckle(w, h, 900, 0.16);
  });
  // --- painted beam band and cut-ceramic ridge bands ---
  within('beamBand', (w, h) => {
    g.fillStyle = '#8c1f19'; g.fillRect(0, 0, w, h);
    const cols = ['#2f6fae', '#3f9a6a', '#d9b23c', '#e9e4d0'];
    for (let i = 0; i < 16; i++) { const x = i * 32 + 16; g.fillStyle = cols[i % 4]; g.beginPath(); g.moveTo(x - 13, h / 2); g.lineTo(x, 8); g.lineTo(x + 13, h / 2); g.lineTo(x, h - 8); g.fill(); g.fillStyle = '#d9b23c'; g.beginPath(); g.arc(x, h / 2, 3.5, 0, 7); g.fill(); }
    g.fillStyle = '#d9b23c'; g.fillRect(0, 0, w, 4); g.fillRect(0, h - 4, w, 4);
  });
  const shards = (w: number, h: number, bg: string) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    const cols = ['#d8402f', '#e7c24a', '#2f6fae', '#f1ede0', '#3f9a6a', '#e58fb0', '#7b4fa8'];
    for (let i = 0; i < w / 5; i++) {
      const x = rand() * w, y = 6 + rand() * (h - 12), r = 4 + rand() * 7;
      g.fillStyle = cols[Math.floor(rand() * cols.length)];
      g.beginPath(); for (let k = 0; k < 5; k++) { const a = (k / 5) * 6.283 + rand(); g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.8); } g.fill();
    }
    // flowers
    for (let i = 0; i < w / 64; i++) { const x = 32 + i * 64 + rand() * 10, y = h / 2; for (let k = 0; k < 6; k++) { const a = (k / 6) * 6.283; g.fillStyle = i % 2 ? '#e58fb0' : '#f1ede0'; g.beginPath(); g.ellipse(x + Math.cos(a) * 8, y + Math.sin(a) * 8, 6, 4, a, 0, 7); g.fill(); } g.fillStyle = '#e7c24a'; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); }
    g.fillStyle = '#1f7d58'; g.fillRect(0, 0, w, 4); g.fillRect(0, h - 4, w, 4);
  };
  within('ridgeBand', (w, h) => shards(w, h, '#2a6f8c'));
  within('ridgeBand2', (w, h) => shards(w, h, '#1f6a55'));
  // --- Lau Ya Keng sign beam: yellow cartouche 陽春臺 (read right to left) between diamond panels ---
  within('lykSign', (w, h) => {
    g.fillStyle = '#7a1f1a'; g.fillRect(0, 0, w, h);
    const cols = ['#2f5fa8', '#2c8c84', '#d9822b', '#3f8f4f'];
    for (const s of [-1, 1]) for (let k = 0; k < 4; k++) {
      const x = w / 2 + s * (190 + k * 82) - 36;
      g.fillStyle = '#d8b24a'; g.fillRect(x, 8, 72, h - 16);
      g.fillStyle = cols[k]; g.fillRect(x + 5, 13, 62, h - 26);
      g.fillStyle = cols[(k + 2) % 4]; g.beginPath(); g.moveTo(x + 36, 18); g.lineTo(x + 60, h / 2); g.lineTo(x + 36, h - 18); g.lineTo(x + 12, h / 2); g.fill();
      g.fillStyle = '#f1e6c0'; g.beginPath(); g.arc(x + 36, h / 2, 7, 0, 7); g.fill();
    }
    g.fillStyle = '#d8b24a'; g.fillRect(w / 2 - 150, 6, 300, h - 12);
    g.fillStyle = '#edc23c'; g.fillRect(w / 2 - 143, 12, 286, h - 24);
    ['臺', '春', '陽'].forEach((c, i) => text(c, w / 2 - 92 + i * 92, h / 2 + 2, 68, '#b3261e'));
    speckle(w, h, 700, 0.08);
  });
  // --- roll-down blinds with printed banners ---
  const blind = (name: AtlasName, fn: (w: number, h: number) => void) => within(name, (w, h) => {
    g.fillStyle = '#ebe5d2'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 5) { g.fillStyle = 'rgba(0,0,0,0.06)'; g.fillRect(0, y, w, 1); }
    fn(w, h);
  });
  blind('blindA', (w, h) => { text('古晋潮州公会', w / 2, 44, 30, '#1f7a45', '"Microsoft YaHei", sans-serif'); text('PERSATUAN TEOCHEW KUCHING', w / 2, 76, 12, '#1f7a45', 'Arial, sans-serif'); g.fillStyle = '#d9382b'; g.fillRect(24, 112, w - 48, 30); text('陽春臺茶室', w / 2, 128, 20, '#fff3c9', '"Microsoft YaHei", sans-serif'); void h; });
  for (const n of ['blindB', 'blindC'] as AtlasName[]) blind(n, (w, h) => {
    const gr = g.createRadialGradient(w / 2, h, 10, w / 2, h, 130); gr.addColorStop(0, '#f6c83a'); gr.addColorStop(1, 'rgba(246,200,58,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#d9382b'; g.beginPath(); g.moveTo(w / 2 - 60, h - 20); g.lineTo(w / 2 + 60, h - 20); g.lineTo(w / 2 + 46, h - 64); g.lineTo(w / 2 - 46, h - 64); g.fill();
    g.fillStyle = '#b8261c'; g.fillRect(w / 2 - 70, h - 70, 140, 10);
  });
  blind('blindD', (w, h) => { g.strokeStyle = '#2f9a6a'; g.lineWidth = 3; g.beginPath(); g.ellipse(w / 2, 50, 70, 26, 0, 0, 7); g.stroke(); text('茶 · KOPI', w / 2, 50, 26, '#2f9a6a', '"Microsoft YaHei", sans-serif'); text('Sarawak Laksa · Kolo Mee', w / 2, 112, 15, '#2f9a6a', 'Arial, sans-serif'); void h; });
  // --- stall signboards (names from mapped places and the published dish list) ---
  const stalls: [AtlasName, string, string, string][] = [
    ['stall0', 'Sarawak Laksa 叻沙', '#b3261e', '#fff3c9'], ['stall1', 'Kueh Chap 粿汁', '#1f5f3a', '#fff3c9'], ['stall2', 'Satay 沙爹', '#e9c35a', '#7a1612'],
    ['stall3', 'Kolo Mee 哥罗面', '#f4efe2', '#b3261e'], ['stall4', 'Kopi · Teh 茶水', '#3a2a1e', '#f4e7c3'], ['stall5', '陈记特色虾面', '#b3261e', '#ffe9a8'],
  ];
  for (const [n, t, bg, fg] of stalls) within(n, (w, h) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.strokeStyle = fg; g.lineWidth = 2; g.strokeRect(4, 4, w - 8, h - 8); text(t, w / 2, h / 2 + 1, 27, fg, '"Microsoft YaHei", Arial, sans-serif'); });
  within('lattice', (w, h) => { g.fillStyle = '#1c120e'; g.fillRect(0, 0, w, h); g.strokeStyle = '#8a3a2a'; g.lineWidth = 5; for (let i = -8; i < 16; i++) { g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16 + h, h); g.moveTo(i * 16 + h, 0); g.lineTo(i * 16, h); g.stroke(); } g.lineWidth = 8; g.strokeRect(0, 0, w, h); });
  within('altar', (w, h) => {
    panelBase(w, h, '#3a0f0c', '#1a0706');
    g.fillStyle = '#9c1c16'; g.fillRect(20, h - 46, w - 40, 46); g.fillStyle = '#d9b23c'; g.fillRect(20, h - 50, w - 40, 6);
    g.fillStyle = '#c79a2e'; g.beginPath(); g.moveTo(w / 2 - 22, h - 50); g.lineTo(w / 2 + 22, h - 50); g.lineTo(w / 2 + 16, 38); g.lineTo(w / 2, 20); g.lineTo(w / 2 - 16, 38); g.fill();
    for (const x of [w / 2 - 52, w / 2 + 52]) { g.fillStyle = '#f0b040'; g.fillRect(x - 4, h - 86, 8, 36); g.fillStyle = '#ffe9a0'; g.beginPath(); g.ellipse(x, h - 92, 5, 9, 0, 0, 7); g.fill(); }
  });
  within('menu', (w, h) => { g.fillStyle = '#f4efe2'; g.fillRect(0, 0, w, h); for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) { g.fillStyle = ['#d98a3a', '#b3261e', '#8a5a2a', '#e9c35a'][(i + j) % 4]; g.beginPath(); g.ellipse(26 + i * 46, 26 + j * 40, 17, 12, 0, 0, 7); g.fill(); g.fillStyle = '#333'; g.fillRect(12 + i * 46, 42 + j * 40, 28, 3); } });
}
