// Writes a V5 kit mesh as compact binary glTF:
//   - duplicate vertices welded, triangles reordered for the vertex cache
//   - KHR_mesh_quantization: positions int16, normals int8, colours uint16, UVs uint16
//   - EXT_meshopt_compression on every buffer view (decoded in the browser by three's MeshoptDecoder)
// One primitive per material slot; the material NAME is the contract with the runtime, which
// substitutes its own PBR material library (the file carries no textures and no material values).
import { MeshoptEncoder } from 'meshoptimizer';
import type { Kit } from '../../src/v5/kit.ts';

await MeshoptEncoder.ready;

export interface GlbInfo { bytes: Uint8Array; triangles: number; vertices: number; rawBytes: number }

export function writeGlb(kit: Kit, name: string, compress = true): GlbInfo {
  const prims: { name: string; pos: Float32Array; nor: Float32Array; col: Float32Array; uv: Float32Array | null; idx: Uint32Array }[] = [];
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const [mat, b] of kit.bufs) {
    if (!b.idx.length) continue;
    // weld
    const map = new Map<string, number>(), remap = new Uint32Array(b.count);
    const pos: number[] = [], nor: number[] = [], col: number[] = [], uv: number[] = [];
    const withUv = mat === 'atlas' || mat === 'sign';
    for (let i = 0; i < b.count; i++) {
      const key = [b.pos[i * 3], b.pos[i * 3 + 1], b.pos[i * 3 + 2]].map((v) => Math.round(v * 2000)).join(',') + '|' + [b.nor[i * 3], b.nor[i * 3 + 1], b.nor[i * 3 + 2]].map((v) => Math.round(v * 60)).join(',') + '|' +
        [b.col[i * 3], b.col[i * 3 + 1], b.col[i * 3 + 2]].map((v) => Math.round(v * 2000)).join(',') + (withUv ? '|' + Math.round(b.uv[i * 2] * 4096) + ',' + Math.round(b.uv[i * 2 + 1] * 4096) : '');
      let j = map.get(key);
      if (j === undefined) {
        j = pos.length / 3; map.set(key, j);
        pos.push(b.pos[i * 3], b.pos[i * 3 + 1], b.pos[i * 3 + 2]); nor.push(b.nor[i * 3], b.nor[i * 3 + 1], b.nor[i * 3 + 2]); col.push(b.col[i * 3], b.col[i * 3 + 1], b.col[i * 3 + 2]); uv.push(b.uv[i * 2], b.uv[i * 2 + 1]);
      }
      remap[i] = j;
    }
    let idx = Uint32Array.from(b.idx, (i) => remap[i]);
    // drop degenerate triangles
    const keep: number[] = [];
    for (let i = 0; i < idx.length; i += 3) if (idx[i] !== idx[i + 1] && idx[i + 1] !== idx[i + 2] && idx[i] !== idx[i + 2]) keep.push(idx[i], idx[i + 1], idx[i + 2]);
    idx = Uint32Array.from(keep);
    // vertex-cache / fetch order
    const [order, unique] = MeshoptEncoder.reorderMesh(idx, true, true);
    const P = new Float32Array(unique * 3), N = new Float32Array(unique * 3), C = new Float32Array(unique * 3), U = new Float32Array(unique * 2);
    for (let i = 0; i < order.length; i++) {
      const j = order[i];
      if (j === 0xffffffff) continue;
      for (let c = 0; c < 3; c++) { P[j * 3 + c] = pos[i * 3 + c]; N[j * 3 + c] = nor[i * 3 + c]; C[j * 3 + c] = col[i * 3 + c]; }
      U[j * 2] = uv[i * 2]; U[j * 2 + 1] = uv[i * 2 + 1];
    }
    for (let i = 0; i < unique; i++) for (let c = 0; c < 3; c++) { min[c] = Math.min(min[c], P[i * 3 + c]); max[c] = Math.max(max[c], P[i * 3 + c]); }
    prims.push({ name: mat, pos: P, nor: N, col: C, uv: withUv ? U : null, idx });
  }
  const centre = min.map((v, i) => (v + max[i]) / 2), scale = Math.max(...max.map((v, i) => v - min[i])) / 65534 || 1;

  const chunks: Uint8Array[] = [];
  let offset = 0, raw = 0;
  const bufferViews: object[] = [], accessors: object[] = [], materials: object[] = [], primitives: object[] = [];
  const addView = (data: Uint8Array, count: number, stride: number, mode: 'ATTRIBUTES' | 'TRIANGLES'): number => {
    raw += data.byteLength;
    const enc = compress ? MeshoptEncoder.encodeGltfBuffer(data, count, stride, mode, 0) : data;
    const pad = (4 - (enc.byteLength % 4)) % 4;
    const view: Record<string, unknown> = compress
      ? { buffer: 1, byteOffset: 0, byteLength: data.byteLength, ...(mode === 'ATTRIBUTES' ? { byteStride: stride } : {}), extensions: { EXT_meshopt_compression: { buffer: 0, byteOffset: offset, byteLength: enc.byteLength, byteStride: stride, count, mode } } }
      : { buffer: 0, byteOffset: offset, byteLength: enc.byteLength, ...(mode === 'ATTRIBUTES' ? { byteStride: stride } : {}) };
    view.target = mode === 'ATTRIBUTES' ? 34962 : 34963;
    bufferViews.push(view);
    chunks.push(enc); if (pad) chunks.push(new Uint8Array(pad));
    offset += enc.byteLength + pad;
    return bufferViews.length - 1;
  };
  let tris = 0, verts = 0, fallback = 0;
  for (const p of prims) {
    const n = p.pos.length / 3;
    const qp = new Int16Array(n * 4), qn = new Int8Array(n * 4), qc = new Uint16Array(n * 4);
    const pmin = [32767, 32767, 32767], pmax = [-32767, -32767, -32767];
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < 3; c++) {
        const v = Math.max(-32767, Math.min(32767, Math.round((p.pos[i * 3 + c] - centre[c]) / scale)));
        qp[i * 4 + c] = v; pmin[c] = Math.min(pmin[c], v); pmax[c] = Math.max(pmax[c], v);
        qn[i * 4 + c] = Math.round(Math.max(-1, Math.min(1, p.nor[i * 3 + c])) * 127);
        qc[i * 4 + c] = Math.round(Math.max(0, Math.min(1, p.col[i * 3 + c])) * 65535);
      }
      qc[i * 4 + 3] = 65535;
    }
    const attrs: Record<string, number> = {};
    const acc = (view: number, componentType: number, type: string, count: number, extra: object = {}) => { accessors.push({ bufferView: view, componentType, count, type, ...extra }); return accessors.length - 1; };
    attrs.POSITION = acc(addView(new Uint8Array(qp.buffer), n, 8, 'ATTRIBUTES'), 5122, 'VEC3', n, { min: pmin, max: pmax });
    attrs.NORMAL = acc(addView(new Uint8Array(qn.buffer), n, 4, 'ATTRIBUTES'), 5120, 'VEC3', n, { normalized: true });
    attrs.COLOR_0 = acc(addView(new Uint8Array(qc.buffer), n, 8, 'ATTRIBUTES'), 5123, 'VEC4', n, { normalized: true });
    if (p.uv) {
      const qu = new Uint16Array(n * 2);
      for (let i = 0; i < n * 2; i++) qu[i] = Math.round(Math.max(0, Math.min(1, p.uv[i])) * 65535); // v stays up: the runtime atlas texture is flipped to match (private contract, not a general-purpose glTF)
      attrs.TEXCOORD_0 = acc(addView(new Uint8Array(qu.buffer), n, 4, 'ATTRIBUTES'), 5123, 'VEC2', n, { normalized: true });
    }
    const small = n < 65536;
    const ib = small ? new Uint8Array(Uint16Array.from(p.idx).buffer) : new Uint8Array(p.idx.buffer);
    const indices = acc(addView(ib, p.idx.length, small ? 2 : 4, 'TRIANGLES'), small ? 5123 : 5125, 'SCALAR', p.idx.length);
    materials.push({ name: p.name, pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.8 } });
    primitives.push({ attributes: attrs, indices, material: materials.length - 1 });
    tris += p.idx.length / 3; verts += n;
    fallback += n * 8 + n * 4 + n * 8 + (p.uv ? n * 4 : 0) + ib.byteLength;
  }
  const json: Record<string, unknown> = {
    asset: { version: '2.0', generator: 'kuching-3d v5 kit' },
    extensionsUsed: ['KHR_mesh_quantization', ...(compress ? ['EXT_meshopt_compression'] : [])],
    extensionsRequired: ['KHR_mesh_quantization', ...(compress ? ['EXT_meshopt_compression'] : [])],
    scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ name, mesh: 0, translation: centre, scale: [scale, scale, scale] }],
    meshes: [{ name, primitives }], materials, accessors, bufferViews,
    buffers: compress ? [{ byteLength: offset }, { byteLength: fallback, extensions: { EXT_meshopt_compression: { fallback: true } } }] : [{ byteLength: offset }],
  };
  if (compress) {
    // each view decodes into its own region of the (absent) fallback buffer
    let o = 0;
    for (const v of bufferViews as { byteOffset: number; byteLength: number }[]) { v.byteOffset = o; o += v.byteLength; }
    (json.buffers as { byteLength: number }[])[1].byteLength = o;
  }
  let jt = new TextEncoder().encode(JSON.stringify(json));
  if (jt.length % 4) { const p = new Uint8Array(jt.length + (4 - (jt.length % 4))).fill(0x20); p.set(jt); jt = p; }
  const total = 12 + 8 + jt.length + 8 + offset;
  const out = new Uint8Array(total), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jt.length, true); dv.setUint32(16, 0x4e4f534a, true); out.set(jt, 20);
  let o = 20 + jt.length;
  dv.setUint32(o, offset, true); dv.setUint32(o + 4, 0x004e4942, true); o += 8;
  for (const c of chunks) { out.set(c, o); o += c.byteLength; }
  return { bytes: out, triangles: tris, vertices: verts, rawBytes: raw };
}
