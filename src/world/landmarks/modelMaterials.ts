// Turns a loaded landmark glTF into scene-ready meshes: the model's materials are replaced by the
// game's shared ones (one material instance for every landmark), and text plaques are drawn with
// the browser's fonts into one small canvas texture per landmark (no texture download).
import * as THREE from 'three';

export interface PlaqueSpec {
  text: string;
  x: number; y: number; z: number;
  w: number; h: number;
  ry: number;
  fg: string; bg: string;
  vertical?: boolean;
}
export interface LandmarkMaterials {
  /** Shared vertex-colour material (Materials.landmark in the game). */
  opaque: THREE.Material;
}

let glass: THREE.MeshLambertMaterial | null = null;
let glow: THREE.MeshBasicMaterial | null = null;

/** Replace glTF materials by the shared ones (by material name) and set shadow flags. */
export function prepareLandmarkModel(root: THREE.Object3D, mats: LandmarkMaterials): { triangles: number; meshes: number } {
  let triangles = 0, meshes = 0;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const src = mesh.material as THREE.Material;
    const name = src.name;
    src.dispose();
    if (name === 'glass') {
      glass ??= new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.58, side: THREE.DoubleSide, depthWrite: false });
      mesh.material = glass;
      mesh.renderOrder = 3;
    } else if (name === 'glow') {
      glow ??= new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
      mesh.material = glow;
    } else {
      mesh.material = mats.opaque;
      mesh.castShadow = true;
    }
    mesh.receiveShadow = name !== 'glow';
    meshes++;
    triangles += (mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.attributes.position.count) / 3;
  });
  return { triangles, meshes };
}

const FONT = '"Noto Serif CJK TC", "Songti TC", "PMingLiU", "MingLiU", "SimSun", "Microsoft JhengHei", "Microsoft YaHei", serif';

/** One mesh carrying every plaque of a landmark (model-local coordinates). Owns its texture and material. */
export function buildPlaques(plaques: PlaqueSpec[]): THREE.Mesh {
  const CELL = 64, W = 512;
  // shelf packing
  const cells: { x: number; y: number; w: number; h: number }[] = [];
  let cx = 0, cy = 0, rowH = 0;
  for (const p of plaques) {
    const w = Math.min(W, Math.max(16, Math.round(p.vertical ? CELL : CELL * (p.w / p.h)))), h = Math.min(W, Math.round(p.vertical ? CELL * (p.h / p.w) : CELL));
    if (cx + w > W) { cx = 0; cy += rowH + 2; rowH = 0; }
    cells.push({ x: cx, y: cy, w, h });
    cx += w + 2; rowH = Math.max(rowH, h);
  }
  let H = 64;
  while (H < cy + rowH) H *= 2;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d')!;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  plaques.forEach((p, i) => {
    const c = cells[i];
    g.fillStyle = p.bg; g.fillRect(c.x, c.y, c.w, c.h);
    g.strokeStyle = p.fg; g.lineWidth = 2; g.strokeRect(c.x + 2, c.y + 2, c.w - 4, c.h - 4);
    g.fillStyle = p.fg;
    const chars = [...p.text];
    if (p.vertical) {
      const size = Math.min(c.w * 0.74, (c.h - 8) / chars.length);
      g.font = `700 ${size}px ${FONT}`;
      chars.forEach((ch, k) => g.fillText(ch, c.x + c.w / 2, c.y + 4 + ((c.h - 8) * (k + 0.5)) / chars.length));
    } else {
      let size = c.h * 0.66;
      g.font = `700 ${size}px ${FONT}`;
      const tw = g.measureText(p.text).width;
      if (tw > c.w - 12) { size *= (c.w - 12) / tw; g.font = `700 ${size}px ${FONT}`; }
      g.fillText(p.text, c.x + c.w / 2, c.y + c.h / 2 + size * 0.04);
    }
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const pos: number[] = [], uv: number[] = [], nrm: number[] = [], idx: number[] = [];
  plaques.forEach((p, i) => {
    const c = cells[i], cs = Math.cos(p.ry), sn = Math.sin(p.ry);
    const u0 = c.x / W, u1 = (c.x + c.w) / W, v0 = 1 - (c.y + c.h) / H, v1 = 1 - c.y / H;
    const base = pos.length / 3;
    for (const [lx, ly, u, v] of [[-p.w / 2, -p.h / 2, u0, v0], [p.w / 2, -p.h / 2, u1, v0], [p.w / 2, p.h / 2, u1, v1], [-p.w / 2, p.h / 2, u0, v1]]) {
      pos.push(p.x + lx * cs, p.y + ly, p.z - lx * sn);
      uv.push(u, v);
      nrm.push(sn, 0, cs);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  mesh.name = 'plaques';
  mesh.userData.ownMaterial = true;
  return mesh;
}
