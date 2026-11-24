// A faster, resumable equivalent of three's `toCreasedNormals` (CHAR-P5, lean character build).
//
// Same rule and same output layout as BufferGeometryUtils.toCreasedNormals: the geometry is de-indexed, every corner gets
// the normalised sum of the face normals around its position (1 cm hash cells, as three) whose angle to its own face
// normal is below the crease angle. The difference is the cost: three hashes every CORNER (3 per face) into a string-keyed
// object of arrays; this hashes every SOURCE vertex once (a vertex is shared by ~5 faces), keeps the face normals in flat
// arrays and walks per-group face lists. The result is the same to float precision (face normals are kept in float64, like
// three's Vector3), and the work is split into chunks so a caller can yield between them.
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

/** Faces handled between two yields (about 1 ms on a desktop CPU, a little more while the code is still cold). */
export const CREASE_CHUNK_FACES = 1500;

/**
 * The crease as a generator: `yield` after each chunk of work, and the finished geometry as the return value. Falls back to
 * three's function (in one go) for a geometry it does not handle (no index or no position).
 */
export function* creasedNormalsSteps(geometry: THREE.BufferGeometry, creaseAngle: number, chunk = CREASE_CHUNK_FACES): Generator<void, THREE.BufferGeometry, void> {
  const pos = geometry.attributes.position as THREE.BufferAttribute | undefined;
  const idx = geometry.index;
  if (!pos || !idx || idx.count % 3 !== 0) return toCreasedNormals(geometry, creaseAngle);
  const creaseDot = Math.cos(creaseAngle);
  const mul = (1 + 1e-10) * 1e2;
  const nv = pos.count, nt = idx.count / 3;
  const index = idx.array;
  const px = (i: number) => pos.getX(i), py = (i: number) => pos.getY(i), pz = (i: number) => pos.getZ(i);

  // 1. hash every source vertex once
  const group = new Int32Array(nv);
  const groups = new Map<string, number>();
  for (let i = 0; i < nv; i++) {
    const key = `${~~(px(i) * mul)},${~~(py(i) * mul)},${~~(pz(i) * mul)}`;
    let g = groups.get(key);
    if (g === undefined) { g = groups.size; groups.set(key, g); }
    group[i] = g;
    if ((i & 4095) === 4095) yield;
  }
  const ng = groups.size;

  // 2. face normals (float64, as three's Vector3) and the number of corners per group
  const count = new Int32Array(ng);
  const fn = new Float64Array(nt * 3);
  for (let f = 0; f < nt; f++) {
    const ia = index[3 * f], ib = index[3 * f + 1], ic = index[3 * f + 2];
    // cross(c - b, a - b), normalised (zero stays zero)
    const t1x = px(ic) - px(ib), t1y = py(ic) - py(ib), t1z = pz(ic) - pz(ib);
    const t2x = px(ia) - px(ib), t2y = py(ia) - py(ib), t2z = pz(ia) - pz(ib);
    const x = t1y * t2z - t1z * t2y, y = t1z * t2x - t1x * t2z, z = t1x * t2y - t1y * t2x;
    const l = Math.sqrt(x * x + y * y + z * z) || 1;
    fn[3 * f] = x / l; fn[3 * f + 1] = y / l; fn[3 * f + 2] = z / l;
    count[group[ia]]++; count[group[ib]]++; count[group[ic]]++;
    if (f % chunk === chunk - 1) yield;
  }
  const start = new Int32Array(ng + 1);
  for (let g = 0; g < ng; g++) start[g + 1] = start[g] + count[g];
  const fill = start.slice(0, ng);
  const list = new Int32Array(start[ng]);
  for (let f = 0; f < nt; f++) {
    for (let n = 0; n < 3; n++) list[fill[group[index[3 * f + n]]]++] = f;
    if (f % (chunk * 2) === chunk * 2 - 1) yield;
  }

  // 3. every corner: the normalised sum of the group's face normals inside the crease angle
  yield;
  yield;
  const out = geometry.toNonIndexed(); // the attribute layout of three's result
  yield;
  yield;
  const normals = new Float32Array(nt * 9);
  for (let f = 0; f < nt; f++) {
    const fx = fn[3 * f], fy = fn[3 * f + 1], fz = fn[3 * f + 2];
    for (let n = 0; n < 3; n++) {
      const g = group[index[3 * f + n]];
      let x = 0, y = 0, z = 0;
      for (let k = start[g], e = start[g + 1]; k < e; k++) {
        const o = list[k] * 3;
        if (fx * fn[o] + fy * fn[o + 1] + fz * fn[o + 2] > creaseDot) { x += fn[o]; y += fn[o + 1]; z += fn[o + 2]; }
      }
      const l = Math.sqrt(x * x + y * y + z * z) || 1;
      const j = 9 * f + 3 * n;
      normals[j] = x / l; normals[j + 1] = y / l; normals[j + 2] = z / l;
    }
    if (f % chunk === chunk - 1) yield;
  }
  out.setAttribute('normal', new THREE.BufferAttribute(normals, 3, false));
  return out;
}

/** `toCreasedNormals` with the same arguments and result, computed with the cheaper algorithm above. */
export function creasedNormalsFast(geometry: THREE.BufferGeometry, creaseAngle: number): THREE.BufferGeometry {
  const it = creasedNormalsSteps(geometry, creaseAngle, Infinity);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}
