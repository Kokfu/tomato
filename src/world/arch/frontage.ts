// Pure geometry shared by the offline tools, the collision world and the facade builder.
// No three.js imports: this file runs under Node (tools/) and in the browser.
//
// Conventions: a ring is a flat [x0, z0, x1, z1, ...] list in metres (closed implicitly).
// "Edge i" runs from vertex i to vertex (i + 1) % n.

/** Depth of the covered five-foot way (kaki lima) behind a shophouse frontage, metres. */
export const ARCADE_DEPTH = 2.3;

export function ringArea2(r: ArrayLike<number>): number {
  let a = 0;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) a += r[j] * r[i + 1] - r[i] * r[j + 1];
  return a;
}

/** Unit normal of edge i pointing out of the polygon. */
export function edgeOutward(r: ArrayLike<number>, i: number, area2 = ringArea2(r)): [number, number] {
  const n = r.length / 2, j = (i + 1) % n;
  const dx = r[j * 2] - r[i * 2], dz = r[j * 2 + 1] - r[i * 2 + 1];
  const l = Math.hypot(dx, dz) || 1;
  const s = area2 > 0 ? 1 : -1;
  return [(dz / l) * s, (-dx / l) * s];
}

/**
 * Move the given edges inward by `depth` (the others stay), keeping the vertex count. Used for the
 * recessed shopfront line behind a five-foot way: the result is both the back wall of the arcade
 * and the collision outline, so what the player sees and what blocks them agree.
 */
export function insetEdges(r: ArrayLike<number>, edges: ArrayLike<number>, depth: number): number[] {
  const n = r.length / 2;
  const a2 = ringArea2(r);
  const d = new Float64Array(n);
  for (let k = 0; k < edges.length; k++) if (edges[k] >= 0 && edges[k] < n) d[edges[k]] = depth;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = (i + n - 1) % n; // edge p ends at vertex i, edge i starts there
    const vx = r[i * 2], vz = r[i * 2 + 1];
    if (d[p] === 0 && d[i] === 0) { out.push(vx, vz); continue; }
    const [pnx, pnz] = edgeOutward(r, p, a2), [inx, inz] = edgeOutward(r, i, a2);
    // Offset lines: point + direction for the edge before and after the vertex.
    const ax = vx - pnx * d[p], az = vz - pnz * d[p];
    const bx = vx - inx * d[i], bz = vz - inz * d[i];
    const pdx = -pnz, pdz = pnx; // direction of edge p (any sign)
    const idx = -inz, idz = inx;
    const den = pdx * idz - pdz * idx;
    let x: number, z: number;
    if (Math.abs(den) < 0.08) {
      // Nearly collinear neighbours: take the deeper offset.
      const dd = Math.max(d[p], d[i]);
      const nx = d[p] >= d[i] ? pnx : inx, nz = d[p] >= d[i] ? pnz : inz;
      x = vx - nx * dd; z = vz - nz * dd;
    } else {
      const t = ((bx - ax) * idz - (bz - az) * idx) / den;
      x = ax + pdx * t; z = az + pdz * t;
      if (Math.hypot(x - vx, z - vz) > depth * 3) { x = vx - (pnx * d[p] + inx * d[i]); z = vz - (pnz * d[p] + inz * d[i]); }
    }
    out.push(x, z);
  }
  return out;
}

/** Deterministic 32-bit hash of up to three integers (building id, edge, unit, ...). */
export function hash3(a: number, b = 0, c = 0): number {
  let h = Math.imul((a | 0) ^ Math.floor(a / 4294967296), 2654435761) ^ Math.imul(b + 0x9e3779b9, 2246822519) ^ Math.imul(c + 0x85ebca6b, 3266489917);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Closest point on segment a-b to p: returns [t in 0..1, distance]. */
export function projectOnSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): [number, number] {
  const vx = bx - ax, vz = bz - az;
  const l2 = vx * vx + vz * vz;
  let t = l2 > 0 ? ((px - ax) * vx + (pz - az) * vz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return [t, Math.hypot(ax + vx * t - px, az + vz * t - pz)];
}

export function pointInRingFlat(x: number, z: number, r: ArrayLike<number>): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const xi = r[i], zi = r[i + 1], xj = r[j], zj = r[j + 1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Number of shop units along a frontage of the given length, and the width of each. */
export function unitsAlong(len: number): { n: number; w: number } {
  // Kuching old-town lots are roughly 4.5 - 6 m wide (inferred lot rhythm; lot lines are not mapped).
  const n = Math.max(1, Math.round(len / 5.2));
  return { n, w: len / n };
}
