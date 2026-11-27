import * as THREE from 'three';
import { CHUNK_SIZE, CELL, QUANT } from './config.ts';
import type { AreaData, ChunkData, RoadData, RoadType } from './types.ts';
import { AREA_KINDS, BUILDING_KINDS, ROAD_STYLE, ROAD_TYPES } from './types.ts';
import type { BuildContext } from './ChunkManager.ts';
import { MB_LINE, MB_NORTH } from './district/mainBazaar.ts';
import { stationOfChunk } from './district/props.ts';
import { roadsEnabled, roadWidthCm, ROAD_DEEP_TUNNEL } from './roadsFlag.ts';

/**
 * Hues of the land-use map (N1-M2). The terrain shader reads the surface from the hue: green = grass, warm = bare earth
 * or sand, grey = concrete and paving (src/world/Materials.ts, `ground`), and lays the matching photograph over it.
 * Ground with no mapped land use is rough grass over red earth, which is what an empty lot in Kuching looks like.
 */
const ROUGH = '#6f843c', CONCRETE = '#9f9c95', LATERITE = '#96633f', ASPHALT = '#66686a';
const AREA_TINT: Record<(typeof AREA_KINDS)[number], string> = {
  park: '#5c8c40', grass: '#618c44', wood: '#426b37', sand: '#d8c9a0', pitch: '#5c9643', parking: '#6c6d6e',
  plaza: '#b3b0a8', cemetery: '#6f8c55', residential: '#668641', commercial: '#a29f98', industrial: '#9c9993',
  scrub: '#5a7c3c', school: '#6f8b47', construction: '#a06c48',
};
/** Concrete beside a carriageway, metres each side, by road type (footpath and kerb strip; inferred, not mapped). */
const ROAD_APRON: Partial<Record<RoadType, number>> = { motorway: 1.2, trunk: 2.6, primary: 2.6, secondary: 2.6, tertiary: 2.4, residential: 1.8, service: 0.8 };

/** Paint mapped land-use polygons into a small ground texture for the chunk (yields between layers, V8.2). */
function* groundTexture(data: ChunkData, size: number): Generator<void, THREE.CanvasTexture> {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = ROUGH;
  g.fillRect(0, 0, size, size);
  const s = size / (CHUNK_SIZE * QUANT);
  g.lineJoin = g.lineCap = 'round';
  const trace = (r: number[], close: boolean) => {
    g.moveTo(r[0] * s, r[1] * s);
    for (let i = 2; i < r.length; i += 2) g.lineTo(r[i] * s, r[i + 1] * s);
    if (close) g.closePath();
  };
  // Mapped land use, one path per kind. A half-transparent outline feathers each edge by a texel or two.
  const byKind = new Map<number, AreaData[]>();
  for (const a of data.areas) { const l = byKind.get(a.k); if (l) l.push(a); else byKind.set(a.k, [a]); }
  for (const [k, list] of byKind) {
    g.fillStyle = g.strokeStyle = AREA_TINT[AREA_KINDS[k]] ?? ROUGH;
    g.beginPath();
    for (const a of list) for (const r of a.r) trace(r, true);
    g.fill('evenodd');
    g.globalAlpha = 0.5; g.lineWidth = 2.5; g.stroke(); g.globalAlpha = 1;
    yield;
  }
  // Roads: a fringe of red earth, the concrete beside the carriageway, then the carriageway itself (drawn as a mesh
  // near the player; far chunks leave their minor roads out, so there the paint is the road).
  const trueRoads = roadsEnabled();
  const roads = new Map<number, RoadData[]>();
  for (const r of data.roads) {
    if (r.f & 3 || (trueRoads && (r.f & ROAD_DEEP_TUNNEL)) || r.p.length < 4) continue; // bridges and tunnels have no ground beside them
    const wCm = roadWidthCm(r);
    const key = r.t * 4096 + Math.min(4095, Math.round(wCm / 20));
    const l = roads.get(key);
    if (l) l.push(r); else roads.set(key, [r]);
  }
  const strokeRoads = (width: (type: RoadType, w: number) => number, colour: (type: RoadType) => string, alpha = 1) => {
    g.globalAlpha = alpha;
    for (const list of roads.values()) {
      const type = ROAD_TYPES[list[0].t], w = width(type, roadWidthCm(list[0]) / QUANT);
      if (w <= 0) continue;
      g.strokeStyle = colour(type); g.lineWidth = w * QUANT * s;
      g.beginPath();
      for (const r of list) trace(r.p, false);
      g.stroke();
    }
    g.globalAlpha = 1;
  };
  strokeRoads((t, w) => (ROAD_APRON[t] && ROAD_STYLE[t].major ? w + 2 * ROAD_APRON[t]! + 1.6 : 0), () => LATERITE, 0.45);
  yield;
  strokeRoads((t, w) => (ROAD_APRON[t] ? w + 2 * ROAD_APRON[t]! : 0), () => CONCRETE);
  yield;
  strokeRoads((t, w) => (ROAD_STYLE[t].group === 0 || t === 'rail' ? 0 : w), (t) => (ROAD_STYLE[t].group >= 2 ? ASPHALT : '#' + ROAD_STYLE[t].color.toString(16).padStart(6, '0')));
  yield;
  // N2-M2 (?roads=1): roundabout central islands and dual-carriageway medians paint green grass over the road apron.
  if (trueRoads && (data.rbi?.length || data.med?.length)) {
    g.fillStyle = g.strokeStyle = AREA_TINT.grass;
    g.beginPath();
    for (const poly of [...(data.rbi ?? []), ...(data.med ?? [])]) {
      for (const r of poly) trace(r, true);
    }
    g.fill('evenodd');
    g.globalAlpha = 0.55; g.lineWidth = 1.6; g.stroke(); g.globalAlpha = 1;
  }
  // Buildings stand on a concrete apron (inferred): houses a narrow one, everything else a wide one, so a dense
  // block is paved from wall to wall and a house in a garden keeps its lawn.
  for (const house of [true, false]) {
    g.fillStyle = g.strokeStyle = CONCRETE;
    g.lineWidth = (house ? 2.4 : 6.4) * QUANT * s;
    g.beginPath();
    for (const b of data.buildings) if ((BUILDING_KINDS[b.k] === 'house' || BUILDING_KINDS[b.k] === 'hut') === house) trace(b.r[0], true);
    g.fill(); g.stroke();
    yield;
  }
  if (stationOfChunk(data)) paintDistrict(g, data, size);
  const t = new THREE.CanvasTexture(c);
  t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/**
 * Ground surfaces of the Main Bazaar district, painted by stroking the mapped river bank and the
 * mapped carriageways: promenade paving along the bank, a planted verge behind it, red-brick
 * footpaths beside the street (the carriageways themselves are drawn over this as road meshes).
 * Surface types follow the reference photographs; exact extents are approximate.
 */
function paintDistrict(g: CanvasRenderingContext2D, data: ChunkData, size: number): void {
  const s = size / CHUNK_SIZE, ox = data.cx * CHUNK_SIZE, oz = data.cz * CHUNK_SIZE;
  g.save();
  g.lineJoin = 'round';
  g.lineCap = 'butt';
  const stroke = (pts: [number, number][], width: number, colour: string) => {
    g.strokeStyle = colour;
    g.lineWidth = width * s;
    g.beginPath();
    pts.forEach(([x, z], i) => (i ? g.lineTo((x - ox) * s, (z - oz) * s) : g.moveTo((x - ox) * s, (z - oz) * s)));
    g.stroke();
  };
  const rails = (data.rail ?? []).map((r) => { const p: [number, number][] = []; for (let i = 0; i < r.length; i += 2) p.push([ox + r[i] / QUANT, oz + r[i + 1] / QUANT]); return p; });
  const near = (p: [number, number][]) => p.filter(([x, z]) => x > 40 && x < 470 && z > -280 && z < 110);
  for (const r of rails) if (near(r).length > 1) stroke(near(r), 58, '#6f9258');
  for (const r of rails) if (near(r).length > 1) stroke(near(r), 21, '#a9a194');
  stroke(MB_NORTH, 5.4 + 6.2, '#a39c8f');
  stroke(MB_LINE, 5.4 + 5.6, '#a39c8f');
  g.restore();
}

/** Terrain mesh for a chunk. Vertex heights come from the global height grid. */
/** The chunk's ground mesh. A generator (V8.2): yields after the geometry and while painting its texture. */
export function* buildTerrain(data: ChunkData, ctx: BuildContext): Generator<void, THREE.Mesh> {
  const ox = data.cx * CHUNK_SIZE, oz = data.cz * CHUNK_SIZE;
  let xz: number[];
  let index: number[];
  if (data.terrain) {
    xz = data.terrain.p.map((v) => v / QUANT);
    index = data.terrain.i;
  } else {
    const n = CHUNK_SIZE / CELL;
    xz = [];
    index = [];
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) xz.push(i * CELL, j * CELL);
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const a = j * (n + 1) + i, b = a + 1, d = a + n + 1, c = d + 1;
        index.push(a, d, c, a, c, b);
      }
  }
  const count = xz.length / 2;
  const pos = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const x = xz[i * 2], z = xz[i * 2 + 1];
    pos[i * 3] = x;
    pos[i * 3 + 1] = ctx.height.sample(ox + x, oz + z);
    pos[i * 3 + 2] = z;
    uv[i * 2] = x / CHUNK_SIZE;
    uv[i * 2 + 1] = z / CHUNK_SIZE;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  yield;
  const mat = ctx.mats.terrain(yield* groundTexture(data, ctx.detail === 'high' ? ctx.quality.groundTex : 128));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.userData.ownMaterial = true;
  return mesh;
}
