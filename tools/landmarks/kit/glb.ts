// Minimal binary glTF 2.0 writer for the landmark models.
//
// One mesh, one primitive per material. Vertex data is quantised (KHR_mesh_quantization, read
// natively by three.js GLTFLoader, no decoder needed):
//   POSITION  int16 x3 (+2 pad bytes)  decoded by the node's translation + scale
//   NORMAL    int8 x3 normalised (+1 pad byte)
//   COLOR_0   uint8 x4 normalised (linear RGB)
// = 16 bytes per vertex instead of 36, before transport compression.
import type { MeshBuilder } from './mesh.ts';

export interface GlbMaterial {
  /** RGBA base colour factor (multiplied with the vertex colour). */
  color: [number, number, number, number];
  emissive?: [number, number, number];
  blend?: boolean;
}
export const MATERIALS: Record<string, GlbMaterial> = {
  /** Everything solid: vertex colours carry the appearance. */
  opaque: { color: [1, 1, 1, 1] },
  /** Translucent roofing sheet. */
  glass: { color: [1, 1, 1, 0.55], blend: true },
  /** Self-lit surfaces (lantern bodies, light tubes). */
  glow: { color: [1, 1, 1, 1], emissive: [1, 1, 1] },
};

export function writeGlb(mesh: MeshBuilder, name: string): Uint8Array {
  const { min, max } = mesh.bounds();
  const centre = [0, 1, 2].map((k) => (min[k] + max[k]) / 2);
  const half = Math.max(...[0, 1, 2].map((k) => (max[k] - min[k]) / 2), 1e-3);
  const scale = half / 32767;

  const chunks: Uint8Array[] = [];
  const views: object[] = [], accessors: object[] = [], primitives: object[] = [], materials: object[] = [];
  let offset = 0;
  const addView = (bytes: Uint8Array, stride: number | undefined, target: number): number => {
    const pad = (4 - (bytes.length % 4)) % 4;
    const padded = pad ? new Uint8Array(bytes.length + pad) : bytes;
    if (pad) padded.set(bytes);
    chunks.push(padded);
    views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, ...(stride ? { byteStride: stride } : {}), target });
    offset += padded.length;
    return views.length - 1;
  };

  for (const [mat, part] of mesh.parts) {
    const n = part.vertices;
    if (!n || !part.idx.length) continue;
    const pos = new Int16Array(n * 4), nrm = new Int8Array(n * 4), col = new Uint8Array(n * 4);
    const pmin = [32767, 32767, 32767], pmax = [-32767, -32767, -32767];
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 3; k++) {
        const q = Math.max(-32767, Math.min(32767, Math.round((part.pos[i * 3 + k] - centre[k]) / scale)));
        pos[i * 4 + k] = q;
        pmin[k] = Math.min(pmin[k], q); pmax[k] = Math.max(pmax[k], q);
        nrm[i * 4 + k] = Math.round(Math.max(-1, Math.min(1, part.nrm[i * 3 + k])) * 127);
        col[i * 4 + k] = Math.round(Math.max(0, Math.min(1, part.col[i * 3 + k])) * 255);
      }
      col[i * 4 + 3] = 255;
    }
    const big = n > 65535;
    const idx = big ? new Uint32Array(part.idx) : new Uint16Array(part.idx);
    const vp = addView(new Uint8Array(pos.buffer), 8, 34962);
    const vn = addView(new Uint8Array(nrm.buffer), 4, 34962);
    const vc = addView(new Uint8Array(col.buffer), 4, 34962);
    const vi = addView(new Uint8Array(idx.buffer), undefined, 34963);
    const a0 = accessors.length;
    accessors.push(
      { bufferView: vp, componentType: 5122, count: n, type: 'VEC3', min: pmin, max: pmax },
      { bufferView: vn, componentType: 5120, normalized: true, count: n, type: 'VEC3' },
      { bufferView: vc, componentType: 5121, normalized: true, count: n, type: 'VEC4' },
      { bufferView: vi, componentType: big ? 5125 : 5123, count: idx.length, type: 'SCALAR' },
    );
    const def = MATERIALS[mat];
    if (!def) throw new Error(`unknown material "${mat}"`);
    materials.push({
      name: mat, doubleSided: true,
      pbrMetallicRoughness: { baseColorFactor: def.color, metallicFactor: 0, roughnessFactor: 1 },
      ...(def.emissive ? { emissiveFactor: def.emissive } : {}),
      ...(def.blend ? { alphaMode: 'BLEND' } : {}),
    });
    primitives.push({ attributes: { POSITION: a0, NORMAL: a0 + 1, COLOR_0: a0 + 2 }, indices: a0 + 3, material: materials.length - 1, mode: 4 });
  }

  const json = {
    asset: { version: '2.0', generator: 'kuching-3d tools/landmarks' },
    extensionsUsed: ['KHR_mesh_quantization'],
    extensionsRequired: ['KHR_mesh_quantization'],
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name, mesh: 0, translation: centre, scale: [scale, scale, scale] }],
    meshes: [{ name, primitives }],
    materials, accessors, bufferViews: views,
    buffers: [{ byteLength: offset }],
  };
  let jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jpad = (4 - (jsonBytes.length % 4)) % 4;
  if (jpad) { const p = new Uint8Array(jsonBytes.length + jpad).fill(0x20); p.set(jsonBytes); jsonBytes = p; }
  const total = 12 + 8 + jsonBytes.length + 8 + offset;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jsonBytes.length, true); dv.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20);
  let o = 20 + jsonBytes.length;
  dv.setUint32(o, offset, true); dv.setUint32(o + 4, 0x004e4942, true);
  o += 8;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}
