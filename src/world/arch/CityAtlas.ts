import * as THREE from 'three';

// One painted facade atlas for every typed building in the city (N1-M3): no downloads, one texture, one material.
//
// Layout: ROWS full-width rows, one per facade kind. A row is two bays wide and one storey tall, and the texture
// repeats along U, so a wall needs one quad per storey however many bays it has.
//
// The alpha channel is a TINT MASK, not transparency: 1 = plaster, planks or cladding that take the building's own
// colour (vertex colour), 0 = glass, shutters, grilles, air-conditioners and signs that keep the colour painted here.
//
// N1-M6: a second, two-channel texture of the same layout says what is lit at night: red = a window (lit or dark by
// bay, in a warm or a cool white), green = a sign or a shop interior (glows in its own painted colour).

export const ROW = {
  plain: 0, houseUp: 1, houseGround: 2, kampung: 3, shopUpA: 4, shopUpB: 5, shopGround: 6, ribbon: 7, balcony: 8, curtain: 9,
  podium: 10, mallClad: 11, mallGround: 12, wareUp: 13, wareGround: 14, school: 15, colonialUp: 16, colonialGround: 17,
  worship: 18, shed: 19,
} as const;
export const ROWS = 20;
const PAD = 0.002; // about five texels of a row: keeps the next row out of a storey's head and foot in the first mip levels
/** [v at the foot of the storey, v at its head] of a row. */
export function rowV(row: number): readonly [number, number] {
  return [(row + 1) / ROWS - PAD, row / ROWS + PAD];
}
/** A point on blank wall, for untextured faces that only carry the building's colour. */
export const PLAIN_UV: readonly [number, number] = [0.02, (ROW.plain + 0.5) / ROWS];
/** Mean brightness of a wall once its row is laid on it: far chunks draw walls without the atlas, in this tone. */
export const ROW_TONE = 0.84;

type G = CanvasRenderingContext2D;
const W = 256, H = 128;

/** Paints colour and tint mask together. Coordinates are in one row: x 0..256 (two bays), y 0..128 (head to foot). */
class Painter {
  private y0 = 0;
  private c: G;
  private m: G;
  private g: G;
  constructor(c: G, m: G, g: G) {
    this.c = c;
    this.m = m;
    this.g = g;
  }
  /** Mark what is there as lit at night: `win` 0..1 window light, `own` 0..1 glow in its own colour. */
  lit(x: number, y: number, w: number, h: number, win: number, own = 0): void {
    this.g.fillStyle = `rgb(${Math.round(win * 255)},${Math.round(own * 255)},0)`;
    this.g.fillRect(x, this.y0 + y, w, h);
  }
  row(r: number): void { this.y0 = r * H; this.r(0, 0, W, H, '#f6f4ee', 1); }
  /** Filled rectangle; `tint` 1 = takes the building colour. */
  r(x: number, y: number, w: number, h: number, col: string, tint = 0): void {
    this.c.fillStyle = col;
    this.c.fillRect(x, this.y0 + y, w, h);
    this.m.fillStyle = tint ? '#fff' : '#000';
    this.m.fillRect(x, this.y0 + y, w, h);
    this.lit(x, y, w, h, 0); // whatever is painted over a window (a frame, a bar) is not lit
  }
  /** Round-headed opening. */
  arch(x: number, y: number, w: number, h: number, col: string, tint = 0): void {
    for (const [g, f] of [[this.c, col], [this.m, tint ? '#fff' : '#000']] as const) {
      g.fillStyle = f;
      g.beginPath();
      g.arc(x + w / 2, this.y0 + y + w / 2, w / 2, Math.PI, 0);
      g.fill();
      g.fillRect(x, this.y0 + y + w / 2, w, h - w / 2);
    }
  }
  /** Darken (or with a colour, stain) what is there, keeping the mask. */
  shade(x: number, y: number, w: number, h: number, a: number, col = '0,0,0'): void {
    this.c.fillStyle = `rgba(${col},${a})`;
    this.c.fillRect(x, this.y0 + y, w, h);
  }
  glass(x: number, y: number, w: number, h: number, top = '#8198a6', bot = '#3d4c58'): void {
    this.r(x, y, w, h, bot);
    const g = this.c.createLinearGradient(0, this.y0 + y, 0, this.y0 + y + h);
    g.addColorStop(0, top);
    g.addColorStop(1, bot);
    this.c.fillStyle = g;
    this.c.fillRect(x, this.y0 + y, w, h);
    this.shade(x, y, w * 0.4, h, 0.07, '255,255,255');
    this.lit(x, y, w, h, 1);
  }
  /** Bars over an opening: nx vertical, ny horizontal. */
  grille(x: number, y: number, w: number, h: number, nx: number, ny: number, col = '#e9e9e4'): void {
    for (let i = 0; i <= nx; i++) this.r(x + (w - 1.5) * (i / nx), y, 1.5, h, col);
    for (let i = 0; i <= ny; i++) this.r(x, y + (h - 1.5) * (i / ny), w, 1.5, col);
  }
  /** Horizontal slats (louvres, roller shutters, planks). */
  slats(x: number, y: number, w: number, h: number, n: number, a = 0.3): void {
    for (let i = 0; i < n; i++) this.shade(x, y + (h * (i + 0.62)) / n, w, Math.max(1, (h / n) * 0.38), a);
  }
  /** Vertical ribs (metal cladding, zinc). */
  ribs(x: number, y: number, w: number, h: number, pitch: number, a = 0.16): void {
    for (let u = x; u < x + w; u += pitch) this.shade(u, y, pitch * 0.4, h, a);
  }
  /** Window with frame, glass and a sill shadow. */
  win(x: number, y: number, w: number, h: number, frame = '#e8e6df', panes = 2): void {
    this.r(x - 3, y - 3, w + 6, h + 6, frame);
    this.glass(x, y, w, h);
    for (let i = 1; i < panes; i++) this.r(x + (w * i) / panes - 1, y, 2, h, frame);
    this.shade(x - 5, y + h + 3, w + 10, 4, 0.22);
    this.streak(x + w * 0.2, y + h + 7, w * 0.6, 22);
  }
  /** Rain / mould streak running down from an edge. */
  streak(x: number, y: number, w: number, h: number): void {
    const g = this.c.createLinearGradient(0, this.y0 + y, 0, this.y0 + y + h);
    g.addColorStop(0, 'rgba(60,66,54,0.17)');
    g.addColorStop(1, 'rgba(60,66,54,0)');
    this.c.fillStyle = g;
    this.c.fillRect(x, this.y0 + y, w, h);
  }
  /** Split air-conditioner condenser on a bracket. */
  ac(x: number, y: number): void {
    this.r(x, y, 24, 16, '#d9dad6');
    this.r(x + 2, y + 2, 13, 12, '#8e9496');
    this.r(x + 5, y + 5, 7, 6, '#5d6366');
    this.shade(x, y + 16, 24, 3, 0.3);
    this.r(x + 22, y - 14, 2, 14, '#55585a'); // pipe up to the room
    this.streak(x + 3, y + 19, 18, 26);
  }
  /** What every storey shares: shadow under the slab above, weathering from the head down. */
  storey(eave = 0.14): void {
    this.streak(0, 0, W, 40);
    this.shade(0, 0, W, 5, eave);
    this.shade(0, H - 3, W, 3, 0.1);
  }
}

function paint(p: Painter): void {
  const bays = [0, 128];
  // -- plain wall --
  p.row(ROW.plain);
  p.streak(0, 0, W, 54);
  p.shade(0, H - 14, W, 14, 0.07);

  // -- house, upper floor: aluminium sliding windows behind a welded grille --
  p.row(ROW.houseUp);
  p.storey();
  p.win(26, 34, 76, 54, '#f0efea', 2);
  p.grille(26, 34, 76, 54, 6, 4);
  p.win(166, 40, 50, 46, '#f0efea', 2);
  p.grille(166, 40, 50, 46, 4, 3);
  p.ac(224, 86);

  // -- house, ground floor: front door with grille gate, wide living-room window --
  p.row(ROW.houseGround);
  p.storey(0.2);
  p.r(40, 30, 46, 98, '#f0efea');
  p.r(44, 34, 38, 94, '#6b4a34');
  p.grille(44, 34, 38, 94, 4, 7, '#2f3b36');
  p.win(150, 42, 84, 54, '#f0efea', 3);
  p.grille(150, 42, 84, 54, 7, 4);
  p.shade(0, 104, W, 24, 0.13); // dado
  p.shade(0, 120, W, 8, 0.14, '70,74,60');

  // -- kampung house: plank walls, shuttered openings without glass, a plank door --
  p.row(ROW.kampung);
  p.slats(0, 0, W, H, 13, 0.16);
  for (let x = 31; x < W; x += 64) p.shade(x, 0, 1.5, H, 0.14);
  p.r(34, 36, 60, 52, '#2c2723');
  p.lit(34, 36, 60, 52, 0.7);
  p.r(34, 36, 17, 52, '#b9b2a2', 1);
  p.r(77, 36, 17, 52, '#b9b2a2', 1);
  p.slats(34, 36, 17, 52, 9, 0.3);
  p.slats(77, 36, 17, 52, 9, 0.3);
  p.r(51, 62, 26, 2, '#8d8577');
  p.r(51, 74, 26, 2, '#8d8577');
  p.r(158, 26, 42, 102, '#cfc8b8', 1);
  p.r(162, 30, 34, 98, '#8c8474', 1);
  p.slats(162, 30, 34, 40, 8, 0.3);
  p.shade(0, 0, W, 8, 0.3);

  // -- concrete shophouse block, upper floor A: pairs of louvre windows, condensers on the ledge --
  p.row(ROW.shopUpA);
  p.storey();
  for (const b of bays) {
    p.shade(b, 0, 5, H, 0.1); // party-wall pilaster
    for (const x of [22, 72]) {
      p.r(b + x - 3, 27, 40, 66, '#e3e1da');
      p.r(b + x, 30, 34, 60, '#6f858e');
      p.lit(b + x, 30, 34, 60, 0.8);
      p.slats(b + x, 30, 34, 60, 11, 0.36);
      p.shade(b + x - 4, 93, 42, 4, 0.24);
    }
    p.streak(b + 20, 97, 88, 22);
  }
  p.ac(98, 100);
  p.ac(140, 100);
  p.ac(226, 100);
  p.r(0, 118, W, 4, '#d5d2c8', 1);

  // -- concrete shophouse block, upper floor B: one wide grilled window per bay --
  p.row(ROW.shopUpB);
  p.storey();
  for (const b of bays) {
    p.shade(b, 0, 5, H, 0.1);
    p.win(b + 22, 34, 86, 50, '#dcdad2', 3);
    p.grille(b + 22, 34, 86, 50, 9, 3, '#cfd0cb');
  }
  p.ac(30, 100);
  p.ac(186, 100);
  p.r(118, 0, 3, H, '#6e7170'); // rain-water downpipe
  p.r(0, 118, W, 4, '#d5d2c8', 1);

  // -- shophouse ground floor: generic sign boards (no words), a roller shutter, an open shop --
  p.row(ROW.shopGround);
  p.r(8, 4, 114, 24, '#a8473c');
  p.r(16, 12, 60, 3, '#e8d9c0');
  p.r(16, 18, 38, 2, '#e8d9c0');
  p.r(136, 4, 114, 24, '#e3dcc6');
  p.r(144, 11, 72, 3, '#3f6a4a');
  p.r(144, 18, 46, 2, '#3f6a4a');
  p.lit(8, 4, 114, 24, 0, 1);
  p.lit(136, 4, 114, 24, 0, 1);
  p.shade(0, 28, W, 7, 0.34);
  p.r(12, 35, 106, 93, '#7f8d8f');
  p.slats(12, 35, 106, 93, 22, 0.24);
  p.shade(12, 112, 106, 16, 0.16, '72,60,44');
  p.r(140, 35, 106, 93, '#2b2622');
  for (let i = 0; i < 4; i++) {
    p.r(146 + i * 25, 52, 20, 14, ['#b99a5a', '#8a9aa8', '#a5553f', '#7f9a6a'][i]);
    p.r(146 + i * 25, 74, 20, 12, ['#8a9aa8', '#c9b78a', '#6f8a9a', '#b98a5a'][i]);
  }
  p.r(140, 90, 106, 3, '#5a5148');
  p.shade(140, 35, 106, 20, 0.35);
  p.lit(140, 35, 106, 93, 0.55, 1); // an open shop: a lit room and its goods
  p.shade(0, 120, W, 8, 0.2, '70,74,60');

  // -- mid-rise: ribbon windows between plaster spandrels --
  p.row(ROW.ribbon);
  p.storey(0.08);
  p.r(0, 30, W, 56, '#d7d8d4');
  p.glass(0, 33, W, 50, '#7f9db4', '#42586c');
  for (let x = 0; x < W; x += 32) p.r(x, 33, 2.5, 50, '#cfd0cc');
  p.shade(0, 86, W, 4, 0.2);
  p.streak(0, 90, W, 26);

  // -- mid-rise flats or hotel: balcony with a rail in front of a sliding door --
  p.row(ROW.balcony);
  p.storey(0.08);
  for (const b of bays) {
    p.r(b + 14, 22, 100, 106, '#2f3940');
    p.glass(b + 20, 28, 56, 100, '#72889a', '#35424d');
    p.r(b + 47, 28, 2, 100, '#c9cac6');
    p.shade(b + 14, 22, 100, 22, 0.3);
    p.r(b + 8, 84, 112, 44, '#e2e0d8', 1); // balcony upstand
    p.grille(b + 8, 66, 112, 20, 14, 1, '#9da2a3');
    p.shade(b + 8, 122, 112, 6, 0.25);
  }
  p.ac(84, 50);
  p.ac(212, 50);

  // -- office curtain wall --
  p.row(ROW.curtain);
  p.glass(0, 0, W, H, '#7fa6c4', '#4c7696');
  p.r(0, 96, W, 32, '#3f6480');
  for (let x = 0; x < W; x += 64) p.r(x, 0, 3, H, '#b9c2c8');
  p.r(0, 94, W, 3, '#b9c2c8');
  p.r(0, 0, W, 3, '#b9c2c8');
  p.shade(64, 0, 64, 94, 0.07, '255,255,255');

  // -- podium: glass shopfronts between columns, under a canopy --
  p.row(ROW.podium);
  p.r(0, 0, W, 20, '#e9e7e0', 1);
  p.shade(0, 20, W, 10, 0.35);
  for (const b of bays) {
    p.glass(b + 12, 30, 104, 98, '#6f8796', '#2c3740');
    p.r(b + 62, 30, 3, 98, '#3a3f42');
    p.r(b + 12, 60, 104, 3, '#3a3f42');
    p.shade(b + 12, 30, 104, 16, 0.25);
  }
  p.shade(0, 120, W, 8, 0.18, '70,74,60');

  // -- mall cladding: panels with joints, a slim glass strip, a blank banner frame --
  p.row(ROW.mallClad);
  p.streak(0, 0, W, 30);
  for (let x = 0; x < W; x += 64) p.shade(x, 0, 2, H, 0.16);
  p.shade(0, 62, W, 2, 0.16);
  p.shade(0, H - 3, W, 3, 0.16);
  p.glass(8, 18, 112, 30, '#7fb0b8', '#3f6f78');
  for (let x = 8; x < 120; x += 28) p.r(x, 18, 2, 30, '#c9cfd0');
  p.r(158, 28, 66, 56, '#e9e6dc');
  p.r(161, 31, 60, 50, '#b9a78c');
  p.r(161, 58, 60, 23, '#6f8798');
  p.lit(161, 31, 60, 50, 0, 1);

  // -- mall ground floor: shop glazing, entrance doors, fascia band --
  p.row(ROW.mallGround);
  p.r(0, 0, W, 22, '#e6e3da', 1);
  p.r(0, 22, W, 8, '#6b6f72');
  p.shade(0, 30, W, 10, 0.3);
  p.glass(6, 34, 116, 94, '#7b93a2', '#2a343c');
  p.r(62, 34, 3, 94, '#2f3437');
  p.glass(140, 34, 110, 94, '#8aa2b0', '#39464f');
  for (const x of [176, 194, 212]) p.r(x, 50, 3, 78, '#d8dadb');
  p.r(140, 48, 110, 3, '#d8dadb');
  p.shade(0, 122, W, 6, 0.2, '70,74,60');

  // -- warehouse cladding: ribbed metal sheet, louvre band under the eaves --
  p.row(ROW.wareUp);
  p.ribs(0, 0, W, H, 8);
  p.r(0, 12, W, 22, '#7c8588');
  p.slats(0, 12, W, 22, 6, 0.4);
  p.shade(0, 0, W, 6, 0.25);
  p.streak(0, 34, W, 50);

  // -- warehouse ground floor: block wall under the cladding, a lorry shutter --
  p.row(ROW.wareGround);
  p.ribs(0, 0, W, 48, 8);
  p.r(0, 48, W, 80, '#b3b0a6');
  for (let y = 48; y < H; y += 16) p.shade(0, y, W, 1.5, 0.2);
  for (let x = 0; x < W; x += 32) p.shade(x, 48, 1.5, 80, 0.12);
  p.r(18, 16, 96, 112, '#8a959a');
  p.slats(18, 16, 96, 112, 24, 0.22);
  p.r(176, 70, 30, 58, '#5f6a70');
  p.shade(0, 108, W, 20, 0.2, '96,66,44'); // rust and splash-back at the foot

  // -- school block: louvre-glass window ribbon on a corridor, one accent band --
  p.row(ROW.school);
  p.storey(0.2);
  p.r(0, 26, W, 52, '#dcdcd6');
  p.glass(0, 29, W, 46, '#a9bcc6', '#6f8590');
  p.slats(0, 29, W, 46, 10, 0.22);
  for (let x = 0; x < W; x += 32) p.r(x, 26, 3, 52, '#e4e3dd');
  p.r(100, 26, 30, 102, '#5b7386');
  p.r(0, 96, 100, 12, '#2f5f8a');
  p.r(130, 96, 126, 12, '#2f5f8a');
  p.shade(0, 120, W, 8, 0.16, '70,74,60');

  // -- colonial civic, upper floor: tall round-headed openings with dark louvre shutters --
  p.row(ROW.colonialUp);
  p.storey();
  for (const b of bays) {
    p.arch(b + 36, 14, 56, 98, '#f4f3ee');
    p.arch(b + 41, 19, 46, 93, '#6a3a2c');
    p.slats(b + 41, 44, 46, 68, 14, 0.34);
    p.r(b + 63, 19, 2, 93, '#4a2a20');
    p.shade(b + 34, 112, 60, 4, 0.24);
    p.streak(b + 40, 116, 48, 12);
    p.shade(b, 0, 6, H, 0.07);
  }
  p.r(0, 120, W, 5, '#ecebe5', 1);

  // -- colonial civic, ground floor: verandah arcade --
  p.row(ROW.colonialGround);
  p.shade(0, 0, W, 6, 0.14);
  for (const b of bays) {
    p.arch(b + 20, 16, 88, 112, '#35302c');
    p.lit(b + 24, 50, 80, 78, 0.4);
    p.arch(b + 44, 52, 40, 76, '#5f3528');
    p.shade(b + 20, 16, 88, 30, 0.3);
  }
  p.shade(0, 118, W, 10, 0.14, '70,74,60');

  // -- place of worship (generic hall): round-headed windows --
  p.row(ROW.worship);
  p.storey();
  for (const b of bays) {
    p.arch(b + 44, 20, 40, 84, '#f4f3ee');
    p.arch(b + 48, 24, 32, 78, '#6f8f9c');
    p.lit(b + 48, 40, 32, 62, 1);
    p.grille(b + 48, 40, 32, 62, 2, 4, '#e6e6e0');
    p.streak(b + 46, 106, 36, 20);
  }

  // -- shed / lean-to: zinc sheet, a plank door --
  p.row(ROW.shed);
  p.ribs(0, 0, W, H, 6, 0.2);
  p.r(150, 34, 44, 94, '#6f5d4a');
  p.shade(0, 0, W, 6, 0.3);
  p.shade(0, 96, W, 32, 0.22, '110,70,44');
}

let cached: { small: boolean; tex: THREE.DataTexture; glow: THREE.DataTexture } | null = null;

/** What is lit at night, in the atlas's layout (red: windows, green: signs and shop interiors). Browser only. */
export function cityGlow(small = false): THREE.DataTexture {
  cityAtlas(small);
  return cached!.glow;
}

/** The atlas texture. `small`: half resolution (Low preset). Browser only. */
export function cityAtlas(small = false): THREE.DataTexture {
  if (cached && cached.small === small) return cached.tex;
  const s = small ? 0.5 : 1, w = W * s, h = H * ROWS * s;
  const mk = (): G => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.scale(s, s);
    return g;
  };
  const col = mk(), mask = mk(), lit = mk();
  lit.fillStyle = '#000';
  lit.fillRect(0, 0, W, H * ROWS);
  paint(new Painter(col, mask, lit));
  const rgba = col.getImageData(0, 0, w, h).data, m = mask.getImageData(0, 0, w, h).data;
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = rgba[i]; data[i + 1] = rgba[i + 1]; data[i + 2] = rgba[i + 2]; data[i + 3] = m[i]; }
  // Canvas row 0 becomes v = 0: a row's head is at its low v (see rowV).
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = small ? 2 : 8;
  tex.needsUpdate = true;
  const lg = lit.getImageData(0, 0, w, h).data, rg = new Uint8Array(w * h * 2);
  for (let i = 0, j = 0; i < lg.length; i += 4, j += 2) { rg[j] = lg[i]; rg[j + 1] = lg[i + 1]; }
  const glow = new THREE.DataTexture(rg, w, h, THREE.RGFormat, THREE.UnsignedByteType);
  glow.wrapS = THREE.RepeatWrapping;
  glow.wrapT = THREE.ClampToEdgeWrapping;
  glow.magFilter = THREE.LinearFilter;
  glow.minFilter = THREE.LinearMipmapLinearFilter;
  glow.generateMipmaps = true;
  glow.unpackAlignment = 1;
  glow.needsUpdate = true;
  cached = { small, tex, glow };
  return tex;
}
