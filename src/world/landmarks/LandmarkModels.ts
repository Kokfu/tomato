// Runtime side of the landmark model registry: streams the dedicated glTF models of registered
// landmarks around the player.
//
//  - Nothing is loaded at start-up except the small site list (landmark-sites.json).
//  - Each site shows at most one LOD: the full model near the player, the distant model further
//    out, nothing beyond the visible range. A new LOD replaces the old one only once it has
//    loaded, so there is never a hole in the street while a model is in flight.
//  - Every model uses the game's shared materials; geometry and the per-landmark plaque texture are
//    disposed when a model is dropped.
//  - Independent of the graphics preset: presets change draw distance, never whether a landmark's
//    architecture is drawn.
import * as THREE from 'three';
import type { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { prepareLandmarkModel, buildPlaques } from './modelMaterials.ts';
import type { PlaqueSpec, LandmarkMaterials } from './modelMaterials.ts';

export interface LandmarkSite {
  id: string;
  version: number;
  name: string;
  category: string;
  /** Model origin in the world (metres), base elevation and rotation about +Y. */
  anchor: { x: number; z: number; y: number; yaw: number; lat: number; lon: number };
  scale: number;
  centre: { x: number; z: number };
  radius: number;
  /** Site outline, world metres, flat. */
  ring: number[];
  /** Ids of the protected building records this model stands for. */
  buildingIds: number[];
  chunks: string[];
  lods: { url: string; maxDistance: number; triangles: number; bytes: number }[];
  collision: { walls: { ring: number[]; top: number }[]; floors: { ring: number[]; h: number }[] };
  plaques: PlaqueSpec[];
  verification: string;
}

interface SiteState {
  /** LOD index wanted now (-1 = none). */
  want: number;
  /** LOD index currently in the scene (-1 = none). */
  shown: number;
  object: THREE.Object3D | null;
  triangles: number;
  /** Bumped on every change of `want`; a finished load whose token is stale is discarded. */
  token: number;
}

const HYSTERESIS = 1.12;

export class LandmarkModels {
  readonly group = new THREE.Group();
  sites: LandmarkSite[] = [];
  /** Upper bound for the distant LOD (the fogged view distance of the current preset). */
  viewDistance = 900;
  stats = { loads: 0, disposed: 0, bytes: 0, errors: 0 };
  /** Sites not drawn for now (the V5 rendering experiment draws its own versions). */
  readonly hidden = new Set<string>();
  private state = new Map<string, SiteState>();
  private loader: Promise<GLTFLoader> | null = null;
  private mats: LandmarkMaterials;
  private base: string;

  constructor(mats: LandmarkMaterials, base: string) {
    this.mats = mats;
    this.base = base;
    this.group.name = 'landmark-models';
  }

  setSites(sites: LandmarkSite[]): void {
    this.sites = sites;
    for (const s of sites) this.state.set(s.id, { want: -1, shown: -1, object: null, triangles: 0, token: 0 });
  }

  /** Site whose protected building record has this id, if any. */
  siteOfBuilding(id: number): LandmarkSite | undefined {
    return this.sites.find((s) => s.buildingIds.includes(id));
  }

  /** Per-frame: choose the LOD of every site from the player's distance. Cheap (a handful of sites). */
  update(x: number, z: number): void {
    for (const s of this.sites) {
      const st = this.state.get(s.id)!;
      const d = Math.max(0, Math.hypot(s.centre.x - x, s.centre.z - z) - s.radius);
      let want = -1;
      for (let i = 0; i < s.lods.length; i++) {
        const last = i === s.lods.length - 1;
        let lim = last ? Math.min(s.lods[i].maxDistance, this.viewDistance) : s.lods[i].maxDistance;
        if (st.want === i) lim *= HYSTERESIS; // keep the current level a little longer
        if (d <= lim) { want = i; break; }
      }
      if (this.hidden.has(s.id)) want = -1;
      if (want === st.want) continue;
      st.want = want;
      st.token++;
      if (want < 0) this.drop(st);
      else void this.load(s, st, want, st.token);
    }
  }

  /** Current LOD (-1 = not shown) and triangle count per site: for tests and the debug overlay. */
  info(): { id: string; lod: number; want: number; triangles: number }[] {
    return this.sites.map((s) => { const st = this.state.get(s.id)!; return { id: s.id, lod: st.shown, want: st.want, triangles: st.triangles }; });
  }

  /** True when every site shows the LOD it wants. */
  get settled(): boolean {
    for (const st of this.state.values()) if (st.shown !== st.want) return false;
    return true;
  }

  private async load(site: LandmarkSite, st: SiteState, lod: number, token: number): Promise<void> {
    try {
      this.loader ??= import('three/addons/loaders/GLTFLoader.js').then((m) => new m.GLTFLoader());
      const gltf = await (await this.loader).loadAsync(`${this.base}${site.lods[lod].url}`);
      const root = new THREE.Group();
      root.name = `${site.id}:lod${lod}`;
      root.add(gltf.scene);
      const info = prepareLandmarkModel(gltf.scene, this.mats);
      if (lod === 0 && site.plaques.length) root.add(buildPlaques(site.plaques));
      if (token !== st.token) { this.disposeObject(root); return; } // superseded while loading
      root.position.set(site.anchor.x, site.anchor.y, site.anchor.z);
      root.rotation.y = site.anchor.yaw;
      root.scale.setScalar(site.scale);
      root.userData.landmark = site.id;
      root.userData.triangles = info.triangles;
      root.updateMatrixWorld(true);
      root.traverse((o) => { o.matrixAutoUpdate = false; });
      this.drop(st);
      st.object = root;
      st.shown = lod;
      st.triangles = info.triangles;
      this.group.add(root);
      this.stats.loads++;
      this.stats.bytes += site.lods[lod].bytes;
    } catch (e) {
      this.stats.errors++;
      console.error(`Landmark model ${site.id} (lod ${lod}) failed to load:`, e);
      if (token === st.token) st.want = st.shown; // allow a retry on the next distance change
    }
  }

  private drop(st: SiteState): void {
    if (!st.object) return;
    this.group.remove(st.object);
    this.disposeObject(st.object);
    st.object = null;
    st.shown = -1;
    st.triangles = 0;
    this.stats.disposed++;
  }

  private disposeObject(root: THREE.Object3D): void {
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      if (mesh.userData.ownMaterial) {
        const m = mesh.material as THREE.MeshLambertMaterial;
        m.map?.dispose();
        m.dispose();
      }
    });
  }
}
