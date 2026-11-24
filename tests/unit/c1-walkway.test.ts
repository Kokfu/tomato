// C1a experiment (?c1=1): the corner-wrap return five-foot ways must be walkable at the height they are drawn
// (Auditor C:\Kuching3D-evidence\c1\impl-audit\AUDIT.md S1: feet 0.15-0.21 m below the paving on both 12 m returns;
// walkfix-audit F1: the drawn front paving's corner sliver on UE#0, and F2: the test must cover V5Scene.build itself).
// Visible height: read from the real triangles buildLot draws for the wrapped lot (up-facing 'paving' and kerb 'stone' tops).
// Ground: CollisionWorld.groundAt with the chunk data and the floors the real V5Scene.build('c') hands to host.setFloors
// (run in Node with minimal browser stubs: no canvas drawing, every fetch fails, so places, atlas and GLBs fall back).
// The flag is read once per process at import, so it is set before the imports.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
(globalThis as any).location = { search: '?c1=1' };
const ctx2d: any = new Proxy({}, {
  get: (t: any, k) => (k in t ? t[k] : k === 'measureText' ? (s: string) => ({ width: 10 * String(s).length, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }) : () => ctx2d),
  set: (t: any, k, v) => ((t[k] = v), true),
});
(globalThis as any).document ??= { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx2d }) };
(globalThis as any).fetch = async () => ({ ok: false, status: 404, headers: { get: () => '' }, json: async () => { throw new Error('404'); } });
const geo = await import('../../src/v5/geo.ts');
const { LOT_OVERRIDES } = await import('../../src/v5/lots.ts');
const { Kit, rnd } = await import('../../src/v5/kit.ts');
const { autoLot, buildLot, ARCADE, KERB } = await import('../../src/v5/shophouse.ts');
const V5: Record<string, any> = await import('../../src/v5/V5Scene.ts');
const { HeightMap } = await import('../../src/world/HeightMap.ts');
const { CollisionWorld } = await import('../../src/world/CollisionWorld.ts');

const TOL = 0.02; // feet vs visible paving, metres
const D = new URL('../../public/data/kuching/', import.meta.url);
const man = JSON.parse(readFileSync(new URL('manifest.json', D), 'utf8'));
const hb = readFileSync(new URL(man.height.file, D));
const height = new HeightMap(man.height, new Int16Array(hb.buffer, hb.byteOffset, hb.byteLength / 2));
const h = (x: number, z: number) => height.sample(x, z);
const cw = new CollisionWorld(height);
for (const k of ['0_0', '0_-1', '-1_0', '-1_-1']) cw.addChunk(JSON.parse(readFileSync(new URL('chunks/' + k + '.json', D), 'utf8')));
geo.v5Exclusion.active = true; geo.v5Exclusion.setChina(true); // what the game has while V5 'c' is shown

// The floors V5Scene.build('c') registers, captured from host.setFloors.
type Floor = { ring: number[]; h: number };
let floors: Floor[] = [];
const sites = JSON.parse(readFileSync(new URL('landmark-sites.json', D), 'utf8')).sites;
const scene = new V5.V5Scene({ height: h, sites, baseUrl: '/', low: false, renderer: null, setFloors: (f: Floor[]) => { floors = f; }, setWalls: () => {} });
scene.realAssets = false;
await scene.build('c');
cw.setExtraFloors(floors);

// The wrapped lots' frames (rows, corner skip, frame, per-lot base as in V5Scene.build), to draw them with buildLot.
const wrapped: { id: string; s: any; base: number; x: number; z: number; fr: any; at: (x: number, z: number) => number[] }[] = [];
const rowDefs = geo.ROWS.filter((r: any) => r.id !== 'JC').map((r: any) => (r.id === 'N3' ? { ...r, depth: 5.5 } : r));
for (const def of rowDefs) {
  let row = def;
  if (def.skip) { const l = Math.hypot(def.b[0] - def.a[0], def.b[1] - def.a[1]); row = { ...def, a: [def.a[0] + ((def.b[0] - def.a[0]) * def.skip) / l, def.a[1] + ((def.b[1] - def.a[1]) * def.skip) / l] }; }
  const fr = geo.rowFrame(row), w = fr.len / row.lots;
  const mid = h(fr.ox + fr.dx * fr.len / 2 + fr.nx * 2, fr.oz + fr.dz * fr.len / 2 + fr.nz * 2);
  for (let i = 0; i < row.lots; i++) {
    const o = LOT_OVERRIDES[row.id]?.[i];
    if (!o?.wrap) continue;
    const x = fr.ox + fr.dx * i * w, z = fr.oz + fr.dz * i * w;
    const base = Math.max(mid - 0.1, Math.min(mid + 0.1, h(x + fr.dx * w / 2 + fr.nx * 1.5, z + fr.dz * w / 2 + fr.nz * 1.5))) + 0.03;
    const c = (u: number, v: number) => [x + fr.dx * u + fr.nx * v, z + fr.dz * u + fr.nz * v];
    const s = { ...autoLot(Math.floor(rnd(row.building % 100000, i, row.id.charCodeAt(1)) * 1e6), w, row.depth), ...o };
    wrapped.push({ id: `${row.id}#${i}`, s, base, x, z, fr, at: c });
  }
}
/** V5Scene's own return and corner floors for a wrapped lot (what build should have registered for it). */
const returnFloors = (L: (typeof wrapped)[number]): Floor[] => V5.wrapReturnFloors(L.s, L.at, L.base);
const registered = new Set(floors.map((f) => JSON.stringify(f)));

/** Highest up-facing drawn surface of the given buffers at (x, z), below maxY; undefined if none. */
function surfaceAt(bufs: any[], x: number, z: number, maxY: number): number | undefined {
  let best: number | undefined;
  for (const b of bufs) for (let t = 0; t < b.idx.length; t += 3) {
    const p = [b.idx[t], b.idx[t + 1], b.idx[t + 2]].map((i: number) => [b.pos[3 * i], b.pos[3 * i + 1], b.pos[3 * i + 2]]);
    if (p.some((q) => q[1] > maxY)) continue;
    const e1 = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]], e2 = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
    const ny = e1[2] * e2[0] - e1[0] * e2[2], nl = Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], ny, e1[0] * e2[1] - e1[1] * e2[0]);
    if (!nl || Math.abs(ny) / nl < 0.95) continue; // near-horizontal tops only
    const det = e1[0] * e2[2] - e1[2] * e2[0]; if (!det) continue;
    const px = x - p[0][0], pz = z - p[0][2], a = (px * e2[2] - pz * e2[0]) / det, bb = (e1[0] * pz - e1[2] * px) / det;
    if (a < -1e-9 || bb < -1e-9 || a + bb > 1 + 1e-9) continue;
    const y = p[0][1] + a * e1[1] + bb * e2[1];
    if (best === undefined || y > best) best = y;
  }
  return best;
}

test('corner wraps: the player walks on the return five-foot way, not below it (feet within 2 cm of the drawn paving)', () => {
  assert.equal(wrapped.map((w) => w.id).join(','), 'S2#0,UE#0');
  const bad: string[] = [];
  for (const L of wrapped) {
    const k = new Kit(0);
    k.at({ x: L.x, y: L.base, z: L.z, ry: L.fr.ry }, () => buildLot(k, L.s, null));
    const bufs = ['paving', 'stone'].map((n) => k.bufs.get(n)).filter(Boolean);
    const W = L.s.wrap, c = Math.cos(W.skew), sn = Math.sin(W.skew), len = W.len, A = ARCADE;
    const rf = (u: number, v: number) => L.at(-c * v + sn * (u - len), sn * v + c * (u - len)); // shophouse.ts return frame
    const u0 = len - A / c, u1 = len - (A * (1 - sn)) / c; // where the return paving meets the front five-foot way
    const pts: [number, number][] = [];
    for (let u = 0.2; u < len + 0.2; u += 0.25) {
      for (const v of [-2.2, -1.7, -1.15, -0.6, -0.1]) if (u < u0 + ((u1 - u0) * -v) / A - 0.1) pts.push([u, v]); // paving
      pts.push([u, 0.12]); // kerb, including its cap round the corner
    }
    // Auditor walkfix F1 line: along the return 0.1 m inside the return line, through the corner onto the front paving
    for (let u = 0.2; u < len - 0.02; u += 0.1) pts.push([u, -0.1]);
    // across the corner sliver of drawn front paving between lot x = 0 and the return line (lot z = -A ... 0)
    for (const lz of [-2.25, -1.75, -1.25, -0.75, -0.5, -0.25]) for (const f of [0.25, 0.5, 0.75]) {
      const lx = lz * Math.tan(W.skew) * f; // between the return line (x = z tan) and x = 0
      pts.push([sn * lx + c * lz + len, -c * lx + sn * lz]);
    }
    let worst = 0, at = '';
    for (const [u, v] of pts) {
      const [x, z] = rf(u, v);
      const vis = surfaceAt(bufs, x, z, L.base + KERB + Math.max(0, W.rise) + 0.05);
      assert.ok(vis !== undefined, `${L.id}: no drawn paving at return u=${u.toFixed(2)} v=${v}`);
      const g = cw.groundAt(x, z, vis!).h, d = g - vis!;
      if (Math.abs(d) > Math.abs(worst)) { worst = d; at = `u=${u.toFixed(2)} v=${v}`; }
    }
    console.log(`# ${L.id}: ${pts.length} samples, ${returnFloors(L).length} return floors, max |feet - paving| = ${Math.abs(worst).toFixed(4)} m (${at})`);
    if (Math.abs(worst) > TOL) bad.push(`${L.id}: feet ${worst.toFixed(3)} m from the drawn paving at ${at}`);
  }
  assert.deepEqual(bad, [], `tolerance ${TOL} m`);
});

test('corner wraps: V5Scene.build registers the return floors, and they stay on the return (nothing outside the return strip, its kerb and the corner sliver)', () => {
  for (const L of wrapped) {
    const W = L.s.wrap, c = Math.cos(W.skew), sn = Math.sin(W.skew), len = W.len;
    const ret = returnFloors(L);
    assert.ok(ret.length > 0, `${L.id}: no return floors`);
    for (const f of ret) assert.ok(registered.has(JSON.stringify(f)), `${L.id}: V5Scene.build did not register a return floor (h=${f.h.toFixed(3)})`);
    for (const f of ret) for (let i = 0; i < f.ring.length; i += 2) {
      // back to the return frame: lot (x, z) from the row frame, then (u, v)
      const wx = f.ring[i] - L.x, wz = f.ring[i + 1] - L.z;
      const lx = wx * L.fr.dx + wz * L.fr.dz, lz = wx * L.fr.nx + wz * L.fr.nz;
      const v = -c * lx + sn * lz, u = sn * lx + c * lz + len;
      assert.ok(u >= -1e-6 && u <= len + 0.26 && v >= -ARCADE - 1e-6 && v <= 0.24 + 1e-6, `${L.id}: floor vertex outside the return (u=${u.toFixed(3)}, v=${v.toFixed(3)})`);
    }
  }
});
