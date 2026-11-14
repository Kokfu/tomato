// 2D-canvas map painting shared by the minimap and the full map: detailed loaded chunks, the
// whole-area overview (overview.json) and the dynamic overlays (route, markers, player arrow).
// Everything is drawn from the same generated data that builds the 3D world.
import { CHUNK_SIZE, QUANT } from '../world/config.ts';
import { AREA_COLORS, AREA_KINDS, BUILDING_KINDS, ROAD_STYLE, ROAD_TYPES } from '../world/types.ts';
import type { ChunkData, Landmark } from '../world/types.ts';
import type { Route } from './Router.ts';

export const MAP_COLORS = {
  outside: '#22323b',
  land: '#cbc8b8',
  water: '#7fb4c4',
  major: '#f7dfa2',
  road: '#ffffff',
  foot: '#efe2c4',
  bridge: '#8d7f6a',
  building: '#9d968a',
  /** Machine-detected footprints (Overture: Microsoft / Google): lighter than mapped OSM buildings. */
  buildingMl: '#b4aea3',
  roof: '#b9b2a4',
  ink: '#1b2a33',
  route: '#1a73e8',
  routeCasing: '#ffffff',
  player: '#f2c14e',
};

/** Whole-area overview (public/data/kuching/overview.json): decimetre integers in the world frame. */
export interface OverviewFile {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  roads: { t: number; n?: string; p: number[] }[];
  water: number[][][];
}
const OV_SCALE = 10;

export interface OverviewLabel { name: string; x: number; z: number; angle: number; len: number; major: boolean }

export class Overview {
  readonly bounds: OverviewFile['bounds'];
  private water = new Path2D();
  private major = new Path2D();
  private mid = new Path2D();
  private minor = new Path2D();
  private foot = new Path2D();
  private rings: { bb: number[]; poly: number[][] }[] = [];
  readonly labels: OverviewLabel[] = [];

  constructor(file: OverviewFile) {
    this.bounds = file.bounds;
    for (const poly of file.water) {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const r of poly) {
        for (let i = 0; i < r.length; i += 2) {
          if (i === 0) this.water.moveTo(r[0], r[1]); else this.water.lineTo(r[i], r[i + 1]);
        }
        this.water.closePath();
      }
      for (let i = 0; i < poly[0].length; i += 2) {
        x0 = Math.min(x0, poly[0][i]); x1 = Math.max(x1, poly[0][i]); z0 = Math.min(z0, poly[0][i + 1]); z1 = Math.max(z1, poly[0][i + 1]);
      }
      this.rings.push({ bb: [x0, z0, x1, z1], poly });
    }
    const longest = new Map<string, OverviewLabel>();
    for (const r of file.roads) {
      const type = ROAD_TYPES[r.t];
      const st = ROAD_STYLE[type];
      if (!st || st.group === 0) continue;
      const path = r.t <= 2 ? this.major : r.t <= 4 ? this.mid : st.group === 2 ? this.minor : this.foot;
      const p = r.p;
      path.moveTo(p[0], p[1]);
      let len = 0;
      for (let i = 2; i < p.length; i += 2) {
        path.lineTo(p[i], p[i + 1]);
        len += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
      }
      if (!r.n || st.group < 2) continue;
      // Label anchor: the middle of the polyline, oriented along the local segment.
      len /= OV_SCALE;
      let acc = 0;
      for (let i = 2; i < p.length; i += 2) {
        const l = Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]) / OV_SCALE;
        if (acc + l >= len / 2) {
          const t = l > 0 ? (len / 2 - acc) / l : 0;
          let angle = Math.atan2(p[i + 1] - p[i - 1], p[i] - p[i - 2]);
          if (angle > Math.PI / 2) angle -= Math.PI;
          if (angle < -Math.PI / 2) angle += Math.PI;
          const label: OverviewLabel = {
            name: r.n, x: (p[i - 2] + (p[i] - p[i - 2]) * t) / OV_SCALE, z: (p[i - 1] + (p[i + 1] - p[i - 1]) * t) / OV_SCALE, angle, len, major: r.t <= 4,
          };
          // One label per ~400 m cell and name: keep the longest piece.
          const key = `${r.n}|${Math.floor(label.x / 400)}|${Math.floor(label.z / 400)}`;
          const cur = longest.get(key);
          if (!cur || cur.len < len) longest.set(key, label);
          break;
        }
        acc += l;
      }
    }
    this.labels = [...longest.values()].sort((a, b) => Number(b.major) - Number(a.major) || b.len - a.len);
  }

  /** True when the point is inside a mapped water polygon (simplified whole-area outline). */
  inWater(x: number, z: number): boolean {
    const X = x * OV_SCALE, Z = z * OV_SCALE;
    for (const w of this.rings) {
      if (X < w.bb[0] || X > w.bb[2] || Z < w.bb[1] || Z > w.bb[3]) continue;
      let inside = false;
      for (let k = 0; k < w.poly.length; k++) {
        const r = w.poly[k];
        let hit = false;
        for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
          if (r[i + 1] > Z !== r[j + 1] > Z && X < ((r[j] - r[i]) * (Z - r[i + 1])) / (r[j + 1] - r[i + 1]) + r[i]) hit = !hit;
        }
        if (k === 0) { if (!hit) break; inside = true; } else if (hit) { inside = false; break; }
      }
      if (inside) return true;
    }
    return false;
  }

  /**
   * Paint water + roads. The context transform must map world metres to pixels; `pxPerM` is that
   * scale (device pixels per metre) and is used to keep line widths readable.
   */
  draw(g: CanvasRenderingContext2D, pxPerM: number, dpr: number): void {
    g.save();
    g.scale(1 / OV_SCALE, 1 / OV_SCALE);
    const px = (OV_SCALE / pxPerM) * dpr; // one CSS pixel in path units
    g.fillStyle = MAP_COLORS.water;
    g.fill(this.water, 'evenodd');
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const cssScale = pxPerM / dpr;
    if (cssScale > 0.3) {
      g.strokeStyle = MAP_COLORS.foot;
      g.lineWidth = Math.max(2.2 * OV_SCALE, 0.9 * px);
      g.stroke(this.foot);
    }
    g.strokeStyle = MAP_COLORS.road;
    if (cssScale > 0.12) {
      g.lineWidth = Math.max(6 * OV_SCALE, (cssScale > 0.3 ? 1.2 : 0.6) * px);
      g.stroke(this.minor);
    }
    g.lineWidth = Math.max(8 * OV_SCALE, 1.6 * px);
    g.stroke(this.mid);
    g.strokeStyle = MAP_COLORS.major;
    g.lineWidth = Math.max(10 * OV_SCALE, 2.4 * px);
    g.stroke(this.major);
    g.restore();
  }
}

interface ChunkPaths {
  water: Path2D;
  buildings: Path2D;
  mlBuildings: Path2D;
  roofs: Path2D;
  areas: [string, Path2D][];
  /** [group, widthCm, bridge, path] sorted by group. */
  roads: [number, number, boolean, Path2D][];
}
const chunkPaths = new WeakMap<ChunkData, ChunkPaths>();

function ring(path: Path2D, r: number[]): void {
  path.moveTo(r[0], r[1]);
  for (let i = 2; i < r.length; i += 2) path.lineTo(r[i], r[i + 1]);
  path.closePath();
}

function pathsOf(d: ChunkData): ChunkPaths {
  let cp = chunkPaths.get(d);
  if (cp) return cp;
  cp = { water: new Path2D(), buildings: new Path2D(), mlBuildings: new Path2D(), roofs: new Path2D(), areas: [], roads: [] };
  for (const poly of d.water) for (const r of poly) ring(cp.water, r);
  const roofKind = BUILDING_KINDS.indexOf('roof');
  for (const b of d.buildings) ring(b.k === roofKind ? cp.roofs : b.s ? cp.mlBuildings : cp.buildings, b.r[0]);
  const areas = new Map<string, Path2D>();
  for (const a of d.areas) {
    const color = AREA_COLORS[AREA_KINDS[a.k]];
    if (!color) continue;
    let p = areas.get(color);
    if (!p) areas.set(color, (p = new Path2D()));
    for (const r of a.r) ring(p, r);
  }
  cp.areas = [...areas.entries()];
  const roads = new Map<string, [number, number, boolean, Path2D]>();
  for (const r of d.roads) {
    const st = ROAD_STYLE[ROAD_TYPES[r.t]];
    if (!st || st.group === 0 || ROAD_TYPES[r.t] === 'rail') continue;
    const group = r.t <= 2 ? 4 : st.group;
    const bridge = (r.f & 1) !== 0;
    const key = `${group}|${r.w}|${bridge ? 1 : 0}`;
    let e = roads.get(key);
    if (!e) roads.set(key, (e = [group, r.w, bridge, new Path2D()]));
    e[3].moveTo(r.p[0], r.p[1]);
    for (let i = 2; i < r.p.length; i += 2) e[3].lineTo(r.p[i], r.p[i + 1]);
  }
  cp.roads = [...roads.values()].sort((a, b) => a[0] - b[0] || Number(a[2]) - Number(b[2]));
  chunkPaths.set(d, cp);
  return cp;
}

/**
 * Paint detailed chunks over whatever is already on the canvas. The context transform must map
 * world metres to pixels. Each chunk first clears its own square so the coarser overview beneath
 * does not show through.
 */
export function drawChunks(g: CanvasRenderingContext2D, chunks: ChunkData[], pxPerM: number, dpr: number): void {
  const unit = (QUANT / pxPerM) * dpr; // one CSS pixel in chunk units (cm)
  const each = (fn: (cp: ChunkPaths) => void) => {
    for (const d of chunks) {
      g.save();
      g.translate(d.cx * CHUNK_SIZE, d.cz * CHUNK_SIZE);
      g.scale(1 / QUANT, 1 / QUANT);
      fn(pathsOf(d));
      g.restore();
    }
  };
  g.fillStyle = MAP_COLORS.land;
  // Slight overdraw hides hairline seams between neighbouring chunks.
  const pad = 0.5 / pxPerM;
  for (const d of chunks) g.fillRect(d.cx * CHUNK_SIZE - pad, d.cz * CHUNK_SIZE - pad, CHUNK_SIZE + 2 * pad, CHUNK_SIZE + 2 * pad);
  each((cp) => {
    g.globalAlpha = 0.55;
    for (const [color, p] of cp.areas) { g.fillStyle = color; g.fill(p, 'evenodd'); }
    g.globalAlpha = 1;
    g.fillStyle = MAP_COLORS.water;
    g.fill(cp.water, 'evenodd');
  });
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const pass of [1, 2, 3, 4]) {
    each((cp) => {
      for (const [group, w, bridge, p] of cp.roads) {
        if (group !== pass) continue;
        const min = (group === 1 ? 1 : group === 2 ? 1.4 : 2) * unit;
        if (bridge) {
          // Bridges and piers get a dark casing so river crossings stand out.
          g.strokeStyle = MAP_COLORS.bridge;
          g.lineWidth = Math.max(w, min) + 2 * unit;
          g.lineCap = 'butt';
          g.stroke(p);
          g.lineCap = 'round';
        }
        g.strokeStyle = group === 4 ? MAP_COLORS.major : group >= 2 ? MAP_COLORS.road : MAP_COLORS.foot;
        g.lineWidth = Math.max(w, min);
        g.stroke(p);
      }
    });
  }
  each((cp) => {
    g.fillStyle = MAP_COLORS.roof;
    g.fill(cp.roofs);
    g.fillStyle = MAP_COLORS.buildingMl;
    g.fill(cp.mlBuildings);
    g.fillStyle = MAP_COLORS.building;
    g.fill(cp.buildings);
  });
}

/** Stroke the active route. `toScreen` maps world metres to canvas pixels. */
export function drawRoute(g: CanvasRenderingContext2D, route: Route, toScreen: (x: number, z: number) => [number, number], width: number, drawConnector: (i: number) => boolean): void {
  const p = route.points, n = route.segEdge.length;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const trace = (network: boolean) => {
    g.beginPath();
    let pen = false;
    for (let i = 0; i < n; i++) {
      const on = route.segEdge[i] >= 0;
      if (on !== network || (!on && !drawConnector(i))) { pen = false; continue; }
      if (!pen) { const [x, y] = toScreen(p[i * 2], p[i * 2 + 1]); g.moveTo(x, y); pen = true; }
      const [x, y] = toScreen(p[i * 2 + 2], p[i * 2 + 3]);
      g.lineTo(x, y);
    }
  };
  trace(true);
  g.strokeStyle = MAP_COLORS.routeCasing;
  g.lineWidth = width + 3;
  g.stroke();
  g.strokeStyle = MAP_COLORS.route;
  g.lineWidth = width;
  g.stroke();
  // Off-network connectors (start point -> nearest way, nearest way -> destination): thin dotted line.
  trace(false);
  g.setLineDash([1, width * 1.8]);
  g.lineWidth = Math.max(2, width * 0.7);
  g.stroke();
  g.setLineDash([]);
}

/** Player arrow at (x, y), pointing along `rotation` radians clockwise from screen-up. */
export function drawPlayer(g: CanvasRenderingContext2D, x: number, y: number, rotation: number, size: number): void {
  g.save();
  g.translate(x, y);
  g.rotate(rotation);
  g.fillStyle = MAP_COLORS.player;
  g.strokeStyle = MAP_COLORS.ink;
  g.lineWidth = size * 0.17;
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(0, -size);
  g.lineTo(size * 0.68, size * 0.8);
  g.lineTo(0, size * 0.4);
  g.lineTo(-size * 0.68, size * 0.8);
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();
}

const KIND_COLORS: Record<string, string> = {
  landmark: '#c0392b', bridge: '#8e5a2b', civic: '#7b4fa3', worship: '#d35400', museum: '#2c6fbb', street: '#00796b',
  market: '#b7950b', park: '#2e8b57', mall: '#ad1457',
};
export function landmarkColor(l: Landmark): string {
  return KIND_COLORS[l.kind] ?? '#c0392b';
}

export function drawMarker(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, selected: boolean): void {
  if (selected) {
    g.beginPath();
    g.arc(x, y, r + 5, 0, Math.PI * 2);
    g.fillStyle = 'rgba(242, 193, 78, 0.45)';
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = MAP_COLORS.player;
    g.stroke();
  }
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = color;
  g.fill();
  g.lineWidth = Math.max(1, r * 0.35);
  g.strokeStyle = '#ffffff';
  g.stroke();
}

/** Text with a light halo, readable over any map colour. */
export function drawLabel(g: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  g.fillStyle = MAP_COLORS.ink;
  g.strokeText(text, x, y);
  g.fillText(text, x, y);
}
