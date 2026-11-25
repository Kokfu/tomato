import * as THREE from 'three';
import type { ChunkData, Landmark } from './types.ts';
import type { BuildContext } from './ChunkManager.ts';

/**
 * A landmark model builder. It receives the chunk being built and returns an object positioned in
 * CHUNK-LOCAL coordinates (metres from the chunk min-x / min-z corner, y = absolute elevation).
 * Builders must derive positions from mapped data (the building footprint, the road geometry or
 * the mapped landmark coordinates). They are invoked for every built chunk (ctx.detail tells the
 * level; models are cheap enough to be shown at low detail too), so landmark
 * geometry is lazy-loaded and disposed together with its chunk.
 */
export type LandmarkBuilder = (args: { data: ChunkData; ctx: BuildContext; landmark?: Landmark }) => THREE.Object3D | null;

export interface LandmarkOverride {
  /** OSM building ids whose generic extrusion is replaced by the custom model. */
  buildingIds: number[];
  /**
   * OSM way ids of roads that trigger the builder when present in a chunk (e.g. bridge ways).
   * The generic deck sides / railings / piers of these roads are suppressed; the walkable road
   * surface and its collision decks are still generated from the mapped geometry.
   */
  roadIds?: number[];
  /** Chunk keys ("cx_cz") that trigger the builder: for structures that are mapped as a point, not a footprint. */
  chunks?: string[];
  /** Id in landmarks.json, passed to the builder for convenience. */
  landmarkId?: string;
  build: LandmarkBuilder;
}

/**
 * Registry for hand-made landmark models that override generic generated buildings.
 * Register overrides before chunks are built.
 */
export class LandmarkManager {
  landmarks: Landmark[] = [];
  private overrides: LandmarkOverride[] = [];
  private replaced = new Set<number>();
  private customRoads = new Set<number>();

  setLandmarks(list: Landmark[]): void {
    this.landmarks = list;
  }

  register(o: LandmarkOverride): void {
    this.overrides.push(o);
    for (const id of o.buildingIds) this.replaced.add(id);
    for (const id of o.roadIds ?? []) this.customRoads.add(id);
  }

  /** True when a custom model replaces the generic extrusion of this OSM building. */
  replacesBuilding(osmId: number): boolean {
    return this.replaced.has(osmId);
  }

  /** True when a custom model supplies the structure (railings, towers, piers) of this bridge way. */
  replacesRoadStructure(osmWayId: number): boolean {
    return this.customRoads.has(osmWayId);
  }

  /** Called by the chunk builder for every chunk it builds (high and low detail). */
  /** A generator (V8.2): yields after each landmark it builds, so ChunkManager can give each its own frame. */
  *buildForChunk(data: ChunkData, ctx: BuildContext): Generator<void, THREE.Object3D[]> {
    const out: THREE.Object3D[] = [];
    for (const o of this.overrides) {
      const hit = data.buildings.some((b) => o.buildingIds.includes(b.id)) || (!!o.roadIds && data.roads.some((r) => o.roadIds!.includes(r.id))) || !!o.chunks?.includes(`${data.cx}_${data.cz}`);
      if (!hit) continue;
      const obj = o.build({ data, ctx, landmark: this.landmarks.find((l) => l.id === o.landmarkId) });
      if (obj) out.push(obj);
      yield;
    }
    return out;
  }
}
