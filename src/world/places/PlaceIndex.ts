import * as THREE from 'three';
import { v5Exclusion } from '../../v5/geo.ts';
import { CHUNK_SIZE, QUANT, DATA_ROOT, chunkKey } from '../config.ts';
import type { ChunkData } from '../types.ts';
import { FURN } from '../types.ts';
import type { BuildContext } from '../ChunkManager.ts';
import type { Place, PlaceChunk, PlaceOverrides } from './types.ts';
import { associate } from './associate.ts';
import { buildLabels, STREET_STYLE } from './Labels.ts';
import type { LabelSpec } from './Labels.ts';
import { fasciaAt, rowFrame, SHOP } from '../arch/Shophouse.ts';
import { edgeOutward, hash3, ringArea2, unitsAlong } from '../arch/frontage.ts';
import { geoToWorld } from '../GeoProjection.ts';
import { heritageFascia } from '../arch/HeritageRow.ts';
import { isDistrictRow, pinPosition, PIN_DUPLICATES } from '../district/mainBazaar.ts';

/** Attach district pins: a pinned business moves to its house-numbered lot and always gets a sign. */
function applyPin(p: Place): Place {
  if (PIN_DUPLICATES.has(p.id)) return { ...p, sign: false };
  const a = pinPosition(p.id);
  if (!a) return p;
  return { ...p, b: a.b, e: a.e, t: a.t, how: p.how ?? 'adjacent', sign: true, pin: { no: a.no, span: a.span, evidence: a.pin.evidence, sign: a.pin.sign } };
}

const EDIT_KEY = 'k3d.placeEdits';

/**
 * Runtime side of the shop identity system: streams per-chunk place files, applies the local
 * corrections made in the in-app editor, answers "what is near the player" and produces the sign
 * labels for a chunk.
 */
export class PlaceIndex {
  /** Chunk keys that have a place file. */
  private available = new Set<string>();
  private byChunk = new Map<string, Place[]>();
  private base: string;
  /** Local (not yet published) corrections; see docs/SHOP_IDENTITY.md. */
  edits: PlaceOverrides = { upsert: [], remove: [] };
  /** Called when local edits change the places of a chunk (so its signs can be rebuilt). */
  onChanged: ((key: string) => void) | null = null;
  meta: { generatedAt?: string; sources?: Record<string, unknown>; stats?: Record<string, number> } = {};

  constructor() {
    this.base = `${import.meta.env.BASE_URL}${DATA_ROOT}/places/`;
    try {
      const raw = localStorage.getItem(EDIT_KEY);
      if (raw) this.edits = { upsert: [], remove: [], ...JSON.parse(raw) };
    } catch { /* storage unavailable */ }
  }

  async load(): Promise<void> {
    try {
      const idx = await (await fetch(`${this.base}index.json`)).json();
      this.available = new Set(idx.chunks as string[]);
      this.meta = idx;
    } catch {
      // No place data: the world works without it (no signs, nothing to inspect).
    }
  }

  /** Fetch the place file of a chunk (resolves immediately when there is none). */
  async fetchChunk(key: string): Promise<void> {
    if (this.byChunk.has(key)) return;
    let list: Place[] = [];
    if (this.available.has(key)) {
      try {
        const r = await fetch(`${this.base}${key}.json`);
        if (r.ok) list = ((await r.json()) as PlaceChunk).places;
      } catch { /* treated as no places */ }
    }
    this.byChunk.set(key, list);
  }

  dropChunk(key: string): void {
    this.byChunk.delete(key);
  }

  /** Places stored with a chunk, with local edits applied. */
  inChunk(key: string, data?: ChunkData): Place[] {
    const removed = new Set(this.edits.remove);
    const edited = new Map(this.edits.upsert.map((u) => [u.id, u]));
    const out: Place[] = [];
    for (const p of this.byChunk.get(key) ?? []) {
      if (removed.has(p.id)) continue;
      const e = edited.get(p.id);
      out.push(e ? ({ ...p, ...e, v: 2 } as Place) : applyPin(p));
      edited.delete(p.id);
    }
    // Places added locally: positioned by lat/lon, associated on the fly with this chunk's buildings.
    for (const u of edited.values()) {
      if (u.lat === undefined || u.lon === undefined || !u.name) continue;
      const [x, z] = geoToWorld(u.lat, u.lon);
      if (chunkKey(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)) !== key) continue;
      const p = { cat: 'shop', src: 'manual', ...u, x, z, v: 2 } as Place;
      if (data) {
        const ox = data.cx * CHUNK_SIZE, oz = data.cz * CHUNK_SIZE;
        const a = associate(x, z, data.buildings.filter((b) => !b.s).map((b) => ({ id: b.id, ring: b.r[0].map((v, i) => (i % 2 ? oz : ox) + v / QUANT), front: b.a?.f })));
        if (a) Object.assign(p, a, { sign: a.e !== undefined });
      }
      out.push(p);
    }
    return out;
  }

  /** Places within `radius` metres of a world position, nearest first. */
  near(x: number, z: number, radius: number, dataAt: (cx: number, cz: number) => ChunkData | undefined): { place: Place; dist: number }[] {
    const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
    const out: { place: Place; dist: number }[] = [];
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const data = dataAt(cx + dx, cz + dz);
        for (const p of this.inChunk(chunkKey(cx + dx, cz + dz), data)) {
          const a = this.anchor(p, data);
          const dist = Math.hypot(a[0] - x, a[1] - z);
          if (dist <= radius) out.push({ place: p, dist });
        }
      }
    return out.sort((a, b) => a.dist - b.dist);
  }

  /** Where a place is "met" on the street: its sign position when it has one, else its mapped point. */
  private anchor(p: Place, data?: ChunkData): [number, number] {
    if (data && p.b !== undefined && p.e !== undefined) {
      const b = data.buildings.find((q) => q.id === p.b);
      if (b) {
        const r = b.r[0], n = r.length / 2, j = (p.e + 1) % n, t = p.t ?? 0.5;
        if (p.e < n) return [data.cx * CHUNK_SIZE + (r[p.e * 2] + (r[j * 2] - r[p.e * 2]) * t) / QUANT, data.cz * CHUNK_SIZE + (r[p.e * 2 + 1] + (r[j * 2 + 1] - r[p.e * 2 + 1]) * t) / QUANT];
      }
    }
    return [p.x, p.z];
  }

  // ---- local corrections (admin editor) ---------------------------------------------------------
  upsert(p: Partial<Place> & { id: string }): void {
    this.edits.upsert = this.edits.upsert.filter((u) => u.id !== p.id);
    this.edits.upsert.push(p);
    this.edits.remove = this.edits.remove.filter((id) => id !== p.id);
    this.persist();
  }
  remove(id: string): void {
    this.edits.upsert = this.edits.upsert.filter((u) => u.id !== id);
    if (!id.startsWith('manual:local-') && !this.edits.remove.includes(id)) this.edits.remove.push(id);
    this.persist();
  }
  clearEdits(): void {
    this.edits = { upsert: [], remove: [] };
    this.persist();
  }
  get editCount(): number {
    return this.edits.upsert.length + this.edits.remove.length;
  }
  private persist(): void {
    try { localStorage.setItem(EDIT_KEY, JSON.stringify(this.edits)); } catch { /* storage unavailable */ }
    for (const key of this.byChunk.keys()) this.onChanged?.(key);
  }
}

/** Sign mesh for a chunk: storefront signboards of associated places plus street-name plates. */
export function buildChunkLabels(data: ChunkData, ctx: BuildContext): THREE.Object3D | null {
  const specs: LabelSpec[] = [];
  const ox = data.cx * CHUNK_SIZE, oz = data.cz * CHUNK_SIZE;

  // Storefront signs.
  const used = new Map<string, number>();
  // Pinned (house-numbered) businesses claim their lot first.
  const list = ctx.places.inChunk(chunkKey(data.cx, data.cz), data).sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0));
  for (const p of list) {
    if (!p.sign || p.b === undefined || p.e === undefined) continue;
    if (v5Exclusion.active && v5Exclusion.ids.has(p.b)) continue;
    const b = data.buildings.find((q) => q.id === p.b);
    if (!b || b.lm !== undefined || ctx.landmarks.replacesBuilding(b.id)) continue;
    const style = hash3(p.id.length, p.name.charCodeAt(0) | 0, p.name.length * 31 + (p.name.charCodeAt(1) | 0)) % 7;
    if (b.a?.f.includes(p.e) && isDistrictRow(b, ox, oz)) {
      const fr = rowFrame(b, ox, oz, ctx);
      const span = p.pin?.span ?? 1;
      const f = heritageFascia(fr, b.id, p.e, p.t ?? 0.5, span);
      let taken = false;
      for (let k = 0; k < span; k++) if (used.has(`${b.id}:${p.e}:L${f.slot + k}`)) taken = true;
      if (taken) continue;
      for (let k = 0; k < span; k++) used.set(`${b.id}:${p.e}:L${f.slot + k}`, 1);
      specs.push({ text: p.pin?.sign ?? p.name, style, x: f.x, y: f.y, z: f.z, ex: f.ex, ez: f.ez, nx: f.nx, nz: f.nz, maxW: Math.min(f.w - 0.5, 7), h: 0.66 });
    } else if (b.a?.f.includes(p.e)) {
      const fr = rowFrame(b, ox, oz, ctx);
      const f = fasciaAt(fr, p.e, p.t ?? 0.5);
      const slot = `${b.id}:${p.e}:${f.unitCentreT.toFixed(3)}`;
      const n = used.get(slot) ?? 0;
      if (n > 0) continue;
      used.set(slot, n + 1);
      // First sign on the fascia over the five-foot way, a second one just above it.
      specs.push({ text: p.name, style, x: f.x, y: n === 0 ? f.y : fr.ground + SHOP.beamTop + 0.55, z: f.z, ex: f.ex, ez: f.ez, nx: f.nx, nz: f.nz, maxW: f.unitW - 0.7, h: n === 0 ? 0.6 : 0.5 });
    } else {
      const r = b.r[0], nv = r.length / 2;
      if (p.e >= nv) continue;
      const j = (p.e + 1) % nv;
      const ax = r[p.e * 2] / QUANT, az = r[p.e * 2 + 1] / QUANT, bx = r[j * 2] / QUANT, bz = r[j * 2 + 1] / QUANT;
      const len = Math.hypot(bx - ax, bz - az) || 1;
      const u = unitsAlong(len);
      const unit = Math.min(u.n - 1, Math.floor((p.t ?? 0.5) * u.n));
      const slot = `${b.id}:${p.e}:${unit}`;
      const n = used.get(slot) ?? 0;
      if (n > 0) continue;
      used.set(slot, n + 1);
      const t = (unit + 0.5) / u.n;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      const [nx, nz] = edgeOutward(r, p.e, ringArea2(r));
      const y = ctx.height.sample(ox + x, oz + z) + 3.1 + n * 0.7;
      if (y + 0.4 > ctx.height.sample(ox + x, oz + z) + b.h / QUANT) continue; // wall too low for a sign
      specs.push({ text: p.name, style, x, y, z, ex: (bx - ax) / len, ez: (bz - az) / len, nx, nz, maxW: Math.min(4.2, u.w - 0.5), h: 0.6 });
    }
  }

  // Street-name plates.
  const furn = data.furn ?? [];
  for (let i = 0; i < furn.length; i += 5) {
    if (furn[i] !== FURN.sign) continue;
    const x = furn[i + 1] / QUANT, z = furn[i + 2] / QUANT, a = (furn[i + 3] * Math.PI) / 180;
    if (v5Exclusion.active && v5Exclusion.inCorridor(ox + x, oz + z)) continue; // its pole is skipped too (StreetFurniture.ts)
    const ex = Math.sin(a), ez = Math.cos(a);
    specs.push({ text: data.names[furn[i + 4]] ?? '', style: STREET_STYLE, x: x + ex * 0.45, y: ctx.height.sample(ox + x, oz + z) + 2.55, z: z + ez * 0.45, ex, ez, nx: ez, nz: -ex, maxW: 1.5, h: 0.24, twoSided: true });
  }
  return buildLabels(specs);
}
