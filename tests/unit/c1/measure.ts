// C1a test helper (not a test file): triangle and draw-call measurement of the real V5 build by the C1a gate 2 Node method,
// for one flag state per process (the ?c1=1 flag is read when geo.ts is first imported). Spawned by c1-flag.test.ts;
// prints one JSON line. Same code as C:\Kuching3D-evidence\c1\impl\tools\c1-measure.mts with the root and output fixed.
// Original header:
// C1a implementation measurement (deliverable a): the REAL flag-on build vs flag off, by the gate 2 Node method.
// Adapted from gates/tools/gate2-measure.mts: same chunk-group build and counting, same V5 mirror, except that rows, blocks,
// lot overrides and the V5 exclusion now come from the worktree itself (geo.ROWS / geo.BLOCKS / LOT_OVERRIDES /
// V5_BUILDING_IDS with ?c1=1 set or not), instead of the gate 2 projection. Run once per flag in separate processes
// (the flag is read when geo.ts is first imported).
// Read-only on the worktree. Usage: node c1-measure.mts <worktree> <off|on> <out.json>
//
// Method: every mesh the game would build is built here in Node from the same source and data, and triangles are
// summed from index counts (x instance count), so nothing depends on the camera, frustum, or frame.
//  - chunk group: ChunkManager.build + decorate stages (terrain, water, roads, shore/structure, buildings,
//    chunk landmarks, vegetation, furniture, dressing) with detail 'high' (the detail every chunk within the
//    near ring gets) and also 'low'. The V5 exclusion is active with the Jalan China section on (mode 'c').
//  - V5 group: a mirror of V5Scene.build('c') without the DOM (rows with lotSpecs incl. LOT_OVERRIDES and mapped
//    place signs, China street, yards, lamps, forecourt dressing) plus the shipped landmark GLBs (index counts read
//    from the GLB JSON). Each V5 triangle is attributed to the chunk that contains its centroid.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const [flagArg] = process.argv.slice(2), rootArg = process.cwd();
const FLAG = flagArg === 'on';
(globalThis as any).location = { search: FLAG ? '?c1=1&m5=0&roads=0&signals=0' : '?c1=0&m5=0&roads=0&signals=0' }; // N1-M5, N2-M2 and N2-M3 are measured by their own tests
const root = rootArg.split(String.fromCharCode(92)).join('/');
const U = (p: string) => 'file:///' + root + '/' + p;
const THREE = await import(U('node_modules/three/build/three.module.js'));
const { HeightMap } = await import(U('src/world/HeightMap.ts'));
const { CollisionWorld } = await import(U('src/world/CollisionWorld.ts'));
const { LandmarkManager } = await import(U('src/world/LandmarkManager.ts'));
const { GeoBuf } = await import(U('src/world/Materials.ts'));
const { buildTerrain } = await import(U('src/world/TerrainBuilder.ts'));
const { buildRoads, buildShore } = await import(U('src/world/RoadBuilder.ts'));
const { buildBuildings } = await import(U('src/world/BuildingBuilder.ts'));
const { buildWater } = await import(U('src/world/WaterBuilder.ts'));
const { buildVegetation } = await import(U('src/world/VegetationBuilder.ts'));
const { buildFurniture } = await import(U('src/world/StreetFurniture.ts'));
const geo = await import(U('src/v5/geo.ts'));
const { Kit, hex, rnd } = await import(U('src/v5/kit.ts'));
const { autoLot, buildLot, eaveY } = await import(U('src/v5/shophouse.ts'));
const street = await import(U('src/v5/street.ts'));
const { vehicle, plateFor } = await import(U('src/v5/vehicles.ts'));
const { buildChinaStreet } = await import(U('src/v5/china.ts'));
const { LOT_OVERRIDES } = await import(U('src/v5/lots.ts'));
const { c1Enabled, c1FullNameSign } = await import(U('src/v5/c1flag.ts'));
let registerLandmarks: any = null, buildDressing: any = null;
const notes: string[] = [];
try { ({ registerLandmarks } = await import(U('src/world/landmarks/index.ts'))); } catch (e) { notes.push('landmarks/index.ts not importable in Node: ' + String(e).slice(0, 160)); }
try { ({ buildDressing } = await import(U('src/world/district/Dressing.ts'))); } catch (e) { notes.push('district/Dressing.ts not importable in Node: ' + String(e).slice(0, 160)); }

const D = root + '/public/data/kuching/';
const manifest = JSON.parse(readFileSync(D + 'manifest.json', 'utf8'));
const hb = readFileSync(D + manifest.height.file);
const height = new HeightMap(manifest.height, new Int16Array(hb.buffer, hb.byteOffset, hb.byteLength / 2));
const h = (x: number, z: number) => height.sample(x, z);
const chunk = (k: string) => JSON.parse(readFileSync(D + 'chunks/' + k + '.json', 'utf8'));
const placesOf = (k: string) => { try { return JSON.parse(readFileSync(D + 'places/' + k + '.json', 'utf8')).places; } catch { return []; } };
const sha = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');

// ---- mesh counting ----
function count(objs: any[]) {
  let tris = 0, calls = 0; const parts: Record<string, number> = {};
  for (const root of objs) root.traverse((o: any) => {
    if (!o.isMesh) return;
    const g = o.geometry, n = (g.index ? g.index.count : g.attributes.position.count) / 3, inst = o.isInstancedMesh ? o.count : 1;
    tris += n * inst; calls++; const key = (o.name || o.material?.name || 'mesh'); parts[key] = (parts[key] ?? 0) + n * inst;
  });
  return { tris: Math.round(tris), calls };
}
const { CELL: TERRAIN_CELL, CHUNK_SIZE } = await import(U('src/world/config.ts'));
const run = (g: any) => { let r; while (!(r = g.next()).done); return r.value; };
const M = new THREE.MeshBasicMaterial();
const mats: any = new Proxy({}, { get: (_t, k) => (k === 'roads' ? new Proxy([], { get: () => M }) : M) });

function buildChunk(key: string, detail: 'high' | 'low') {
  const data = chunk(key);
  const collision = new CollisionWorld(height);
  const landmarks = new LandmarkManager();
  if (registerLandmarks) registerLandmarks(landmarks);
  const ctx: any = { height, collision, mats, landmarks, places: null, quality: { name: 'low' }, detail };
  const stages: Record<string, { tris: number; calls: number } | string> = {};
  const stage = (name: string, fn: () => any[]) => { try { stages[name] = count(fn().filter(Boolean)); } catch (e) { stages[name] = 'ERROR ' + String(e).slice(0, 140); } };
  // buildTerrain makes its ground texture with a canvas (DOM). Its mesh is mirrored from TerrainBuilder.ts:82-95:
  // the chunk's own terrain triangles, else a (CHUNK_SIZE/CELL)^2 grid of two triangles per cell; 1 mesh.
  stages['terrain'] = { tris: data.terrain ? data.terrain.i.length / 3 : 2 * (CHUNK_SIZE / TERRAIN_CELL) ** 2, calls: 1 };
  stage('water', () => [buildWater(data, ctx)]);
  stage('roads+structure', () => {
    const structure = new GeoBuf(); const r = run(buildRoads(data, ctx, structure)); buildShore(data, ctx, structure);
    const o: any[] = r.groups.filter(Boolean).map((g: any) => new THREE.Mesh(g, M)); if (r.marks) o.push(new THREE.Mesh(r.marks, M));
    const sg = structure.build(); if (sg) o.push(new THREE.Mesh(sg, M)); return o;
  });
  stage('buildings', () => run(buildBuildings(data, ctx)));
  stage('chunkLandmarks', () => run(landmarks.buildForChunk(data, ctx)));
  if (detail === 'high') {
    stage('vegetation', () => buildVegetation(data, ctx));
    stage('furniture', () => buildFurniture(data, ctx));
    if (buildDressing) stage('dressing', () => buildDressing(data, ctx));
  }
  let tris = 0, calls = 0; for (const v of Object.values(stages)) if (typeof v !== 'string') { tris += v.tris; calls += v.calls; }
  return { tris, calls, stages };
}

// ---- V5 mirror (V5Scene.build mode 'c') ----
const SIGN_STYLES_LEN = 1; // style only changes colours, not geometry
const TRADE: Record<string, string> = { jewelry: '金铺', watches: '钟表', restaurant: '饭店', cafe: '茶室', convenience: '便利店' }; // copy of V5Scene.ts:152
const signs: any = { rect: (t: string) => [0, 0, 0.1, 0.1], paint: (k: string) => [0, 0, 0.1, 0.1] };
const places = [...placesOf('0_0'), ...placesOf('0_-1')];
const sites = JSON.parse(readFileSync(D + 'landmark-sites.json', 'utf8')).sites;
const site = (id: string) => sites.find((s: any) => s.id === id);

function frameAway(r: any, away?: [number, number]) {
  if (!away) return geo.rowFrame(r);
  const mx = (r.a[0] + r.b[0]) / 2, mz = (r.a[1] + r.b[1]) / 2, ex = r.b[0] - r.a[0], ez = r.b[1] - r.a[1], len = Math.hypot(ex, ez);
  let nx = ez / len, nz = -ex / len;
  if ((mx - away[0]) * nx + (mz - away[1]) * nz < 0) { nx = -nx; nz = -nz; }
  const dx = nz, dz = -nx, aIsLeft = ex * dx + ez * dz > 0, o = aIsLeft ? r.a : r.b;
  return { ox: o[0], oz: o[1], ry: Math.atan2(nx, nz), len, nx, nz, dx, dz };
}
function lotSpecs(row: any, len: number, fr: any, opts: { plants0?: boolean }) {
  const w = len / row.lots, specs: any[] = [];
  const openEnds: Record<string, [boolean, boolean]> = { N2: [true, false], N3: [false, true] };
  const [eL, eR] = openEnds[row.id] ?? [true, true];
  for (let i = 0; i < row.lots; i++) {
    let s = autoLot(Math.floor(rnd(row.building % 100000, i, row.id.charCodeAt(1)) * 1e6), w, row.depth);
    if (LOT_OVERRIDES[row.id]?.[i]) s = { ...s, ...LOT_OVERRIDES[row.id][i] };
    s.exposedL = i === 0 && eL; s.exposedR = i === row.lots - 1 && eR;
    if (row.lod === 1) { s.blinds = false; s.plants = 0; s.bin = false; }
    specs.push(s);
  }
  specs.forEach((s, i) => { if (i > 0 && specs[i - 1].storeys < s.storeys) s.exposedL = true; if (i < specs.length - 1 && specs[i + 1].storeys < s.storeys) s.exposedR = true; });
  const assigned: string[] = [];
  if (row.lod === 0) for (const p of places) {
    const full = c1FullNameSign(p); // mirror of V5Scene.ts: C1a full-name board by place id (?c1=1 only)
    if (p.b !== row.building || !p.sign || (full === null && (p.name.length > 30 || p.name.includes(' - ')))) continue;
    const t = (p.x - fr.ox) * fr.dx + (p.z - fr.oz) * fr.dz, d = (p.x - fr.ox) * fr.nx + (p.z - fr.oz) * fr.nz;
    if (t < 0 || t > len || d < -row.depth || d > 3) continue;
    const li = Math.min(row.lots - 1, Math.floor(t / w)), s = specs[li];
    assigned.push(`${row.id}#${li}: ${p.name}`);
    if (!s.sign) s.sign = { text: full ?? p.name, fg: '#000', bg: '#fff' };
    if (!s.hang && TRADE[p.cat]) s.hang = { text: TRADE[p.cat], fg: '#f6e2a0', bg: '#1f3f6a' };
    if (p.cat === 'convenience') s.shop = 'glass'; else if (p.cat === 'jewelry' || p.cat === 'watches') s.shop = 'grille'; else if (p.cat === 'restaurant' || p.cat === 'cafe') s.shop = 'open';
  }
  return { specs, assigned };
}
function rowsInto(kit: any, defs: any[], opts: { plants0?: boolean }, perLot?: any[]) {
  let lots = 0; const assigned: string[] = [];
  for (const def of defs) {
    let row = def;
    if (def.skip) { const l = Math.hypot(def.b[0] - def.a[0], def.b[1] - def.a[1]); row = { ...def, a: [def.a[0] + ((def.b[0] - def.a[0]) * def.skip) / l, def.a[1] + ((def.b[1] - def.a[1]) * def.skip) / l] }; }
    const fr = geo.rowFrame(row);
    const { specs, assigned: as } = lotSpecs(row, fr.len, fr, opts); assigned.push(...as);
    const w = fr.len / row.lots; kit.lod = row.lod;
    const mid = h(fr.ox + fr.dx * fr.len / 2 + fr.nx * 2, fr.oz + fr.dz * fr.len / 2 + fr.nz * 2);
    specs.forEach((s: any, i: number) => {
      const x = fr.ox + fr.dx * i * w, z = fr.oz + fr.dz * i * w;
      const base = Math.max(mid - 0.1, Math.min(mid + 0.1, h(x + fr.dx * w / 2 + fr.nx * 1.5, z + fr.dz * w / 2 + fr.nz * 1.5))) + 0.03;
      const before = kitTris(kit);
      kit.at({ x, y: base, z, ry: fr.ry }, () => { buildLot(kit, s, row.lod === 0 ? signs : null); if (row.lod === 0) street.buildApron(kit, s.w, s.seed); });
      if (perLot) perLot.push({ id: `${row.id}#${i}`, tris: kitTris(kit) - before, base, x, z, s });
      lots++;
    });
    kit.lod = 0;
    if (row.lod === 0) { const y = mid + Math.min(...specs.map<number>(eaveY)) - 0.9; street.cables(kit, [fr.ox + fr.nx * 0.16, y, fr.oz + fr.nz * 0.16], [fr.ox + fr.dx * fr.len + fr.nx * 0.16, y, fr.oz + fr.dz * fr.len + fr.nz * 0.16], 3, row.lots); }
  }
  return { lots, assigned };
}
function kitTris(kit: any) { let t = 0; for (const b of kit.bufs.values()) t += b.idx.length / 3; return t; }
// V5Scene.yards (private) mirrored line for line.
function yards(kit: any, blocks: number[][], rows: any[]) {
  for (const ring of blocks) {
    const n = ring.length / 2; let cx = 0, cz = 0;
    for (let i = 0; i < n; i++) { cx += ring[i * 2] / n; cz += ring[i * 2 + 1] / n; }
    const base = h(cx, cz), top = base + 5.6;
    const P = (i: number): [number, number] => { const x = ring[(i % n) * 2], z = ring[(i % n) * 2 + 1], l = Math.hypot(cx - x, cz - z); return [x + ((cx - x) / l) * 0.35, z + ((cz - z) / l) * 0.35]; };
    const tris = THREE.ShapeUtils.triangulateShape(Array.from({ length: n }, (_, i) => new THREE.Vector2(...P(i))), []);
    kit.use('zinc');
    for (const t of tris) { const p = t.map((i: number) => [P(i)[0], top, P(i)[1]]); const up = (p[1][2] - p[0][2]) * (p[2][0] - p[0][0]) - (p[1][0] - p[0][0]) * (p[2][2] - p[0][2]) > 0; kit.poly(up ? p : [p[0], p[2], p[1]], hex(0x8f9496, 0.75)); }
    kit.use('plaster');
    const ccw = (() => { let a = 0; for (let i = 0; i < n; i++) { const p = P(i), q = P(i + 1); a += p[0] * q[1] - q[0] * p[1]; } return a > 0; })();
    for (let i = 0; i < n; i++) {
      const a = P(i), b = P(i + 1);
      if (rows.some((r: any) => (Math.hypot(r.a[0] - ring[(i % n) * 2], r.a[1] - ring[(i % n) * 2 + 1]) < 0.6 && Math.hypot(r.b[0] - ring[((i + 1) % n) * 2], r.b[1] - ring[((i + 1) % n) * 2 + 1]) < 0.6) || (Math.hypot(r.b[0] - ring[(i % n) * 2], r.b[1] - ring[(i % n) * 2 + 1]) < 0.6 && Math.hypot(r.a[0] - ring[((i + 1) % n) * 2], r.a[1] - ring[((i + 1) % n) * 2 + 1]) < 0.6))) continue;
      const c = hex(0xcfc9ba, 0.85 + rnd(i, n) * 0.15), lo = hex(0xcfc9ba, 0.6);
      const q: [number, number, number][] = [[a[0], base - 0.3, a[1]], [b[0], base - 0.3, b[1]], [b[0], top, b[1]], [a[0], top, a[1]]];
      kit.poly(ccw ? [q[1], q[0], q[3], q[2]] : q, ccw ? [lo, lo, c, c] : [lo, lo, c, c]);
    }
  }
}
function glbTris(file: string) {
  const b = readFileSync(file), jsonLen = b.readUInt32LE(12), j = JSON.parse(b.subarray(20, 20 + jsonLen).toString('utf8'));
  let tris = 0, prims = 0;
  for (const m of j.meshes) for (const p of m.primitives) { prims++; tris += (p.indices !== undefined ? j.accessors[p.indices].count : j.accessors[p.attributes.POSITION].count) / 3; }
  const nodesWithMesh = (j.nodes ?? []).filter((n: any) => n.mesh !== undefined).length;
  return { tris, prims, nodesWithMesh };
}
function byChunk(kit: any) {
  const per: Record<string, number> = {}; const mats = new Set<string>(); let calls = 0;
  for (const [name, b] of kit.bufs) {
    if (!b.idx.length) continue; mats.add(name); calls++;
    for (let i = 0; i < b.idx.length; i += 3) {
      let x = 0, z = 0; for (let k = 0; k < 3; k++) { x += b.pos[b.idx[i + k] * 3]; z += b.pos[b.idx[i + k] * 3 + 2]; }
      const key = Math.floor(x / 3 / 256) + '_' + Math.floor(z / 3 / 256); per[key] = (per[key] ?? 0) + 1;
    }
  }
  return { per, mats: [...mats].sort(), calls, tris: Object.values(per).reduce((a, b) => a + b, 0) };
}


function buildV5() {
  const kit = new Kit(0), perLot: any[] = [];
  street.buildRoad(kit, h);
  const rowDefs = geo.ROWS.filter((r: any) => r.id !== 'JC').map((r: any) => (r.id === 'N3' ? { ...r, depth: 5.5 } : r));
  const b0 = kitTris(kit);
  const { lots, assigned } = rowsInto(kit, rowDefs, {}, perLot);
  const tRows = kitTris(kit) - b0;
  const r = buildChinaStreet(kit, h, signs, false);
  const before = kitTris(kit);
  yards(kit, [...geo.BLOCKS, geo.CHINA_BLOCK], [...rowDefs, geo.CHINA_WEST, geo.CHINA_EAST]);
  const tYards = kitTris(kit) - before;
  for (const [rid, idx] of [['S1', 3], ['S2', 2], ['N1', 5]] as [string, number][]) {
    const row = geo.ROWS.find((q: any) => q.id === rid)!, fr = geo.rowFrame(row), w = fr.len / row.lots;
    const x = fr.ox + fr.dx * idx * w + fr.nx * 1.0, z = fr.oz + fr.dz * idx * w + fr.nz * 1.0;
    kit.at({ x, y: h(x, z) + 0.03, z, ry: fr.ry }, () => street.lampPost(kit));
  }
  const tf = site(geo.V5_LANDMARK_IDS[0]).anchor, nx = Math.sin(tf.yaw), nz = Math.cos(tf.yaw), rx = Math.cos(tf.yaw), rz = -Math.sin(tf.yaw);
  const at = (u: number, v: number, ry: number, fn: () => void) => { const x = tf.x + rx * u + nx * v, z = tf.z + rz * u + nz * v; kit.at({ x, y: h(x, z) + 0.04, z, ry: tf.yaw + ry }, fn); };
  at(-6.6, 0.9, 0.2, () => street.pushcart(kit));
  at(-7.4, 6.7, 0.03, () => vehicle(kit, 'saloon', hex(0xc9cdd0), signs, plateFor(1)));
  at(7.6, 6.7, Math.PI - 0.02, () => vehicle(kit, 'hatch', hex(0xe9e9e6), signs, plateFor(2)));
  at(-21, 1.75, Math.PI, () => vehicle(kit, 'hatch', hex(0x7a1f1c), signs, plateFor(3)));
  at(24, 6.6, 0, () => vehicle(kit, 'suv', hex(0x2c3e55), signs, plateFor(4)));
  street.streetLanterns(kit, h, [0.16, 0.3, 0.72, 0.86]);
  return { ...byChunk(kit), lots: lots + r.lots, assigned, parts: { rows: tRows, yards: tYards }, perLot };
}
/** One lot alone in a fresh Kit at the origin (lod 0, with its apron, as built in the row loop). */
function lotTris(s: any) { const k = new Kit(0); buildLot(k, s, signs); street.buildApron(k, s.w, s.seed); return kitTris(k); }

const glb: Record<string, any> = {};
['temple', 'foodcourt', 'stage'].forEach((n, i) => { const s = site(geo.V5_LANDMARK_IDS[i]).anchor; const g = glbTris(root + '/public/models/v5/' + n + '.lod0.glb'); glb[n] = { ...g, chunk: Math.floor(s.x / 256) + '_' + Math.floor(s.z / 256) }; });
const ex = geo.v5Exclusion;
ex.active = true; ex.setChina(true);
const chunks: Record<string, any> = { '0_0': { high: buildChunk('0_0', 'high'), low: buildChunk('0_0', 'low') }, '0_-1': { high: buildChunk('0_-1', 'high'), low: buildChunk('0_-1', 'low') } };
const exclusionIds = [...ex.ids].map(String).sort();
ex.setChina(false); ex.active = false;
const v5 = buildV5();
const glbChunkTris = (k: string) => Object.values(glb).filter((g: any) => g.chunk === k).reduce((a: number, g: any) => a + g.tris, 0);
const perChunk = Object.fromEntries(['0_0', '0_-1'].map((k) => [k, { chunkGroupHigh: chunks[k].high.tris, chunkGroupLow: chunks[k].low.tris, callsHigh: chunks[k].high.calls, callsLow: chunks[k].low.calls, v5Kit: v5.per[k] ?? 0, glb: glbChunkTris(k), total: chunks[k].high.tris + (v5.per[k] ?? 0) + glbChunkTris(k) }]));

// Corner wraps, each lot built alone at lod 0 with its apron:
//  net   = wrapped lot - the same lot without its wrap (the rule's exposed left side wall instead): the cost of the corner;
//  gross = wrapped lot - the same lot without its wrap and with no left side wall at all: everything the corner draws.
const wraps: any[] = [];
for (const L of v5.perLot) if (L.s.wrap) {
  const { wrap, ...plain } = L.s;
  const withWrap = lotTris(L.s), netRef = lotTris({ ...plain }), grossRef = lotTris({ ...plain, exposedL: false });
  // floor rise actually met at the far end of the return: the neighbour lot's base minus this lot's base
  const nb = L.id === 'S2#0' ? v5.perLot.find((q: any) => q.id === 'UW#1') : v5.perLot.find((q: any) => q.id === 'UX#2');
  wraps.push({ lot: L.id, wrap, trisInScene: L.tris, wrappedLotAlone: withWrap, sameLotNoWrap: netRef, sameLotNoLeftSide: grossRef, net: withWrap - netRef, gross: withWrap - grossRef, neighbour: nb?.id, neighbourBaseMinusLotBase: nb ? +(nb.base - L.base).toFixed(4) : null });
}
const strip = (L: any) => ({ id: L.id, tris: L.tris, base: +L.base.toFixed(4), w: +L.s.w.toFixed(3), depth: L.s.depth, wall: L.s.wall.map((v: number) => +v.toFixed(4)), win: L.s.win, windows: L.s.windows, shop: L.s.shop, roof: L.s.roof, plants: L.s.plants, sideArch: L.s.sideArch, exposedL: L.s.exposedL, exposedR: L.s.exposedR, sign: L.s.sign?.text, wrap: !!L.s.wrap, basis: L.s.basis });
const skipped = (r: any) => { if (!r.skip) return r; const l = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]); return { ...r, a: [r.a[0] + ((r.b[0] - r.a[0]) * r.skip) / l, r.a[1] + ((r.b[1] - r.a[1]) * r.skip) / l] }; };
const result = {
  method: 'gate 2 Node method (see gates/tools/gate2-measure.mts) on the real worktree build; triangles = index count / 3 x instances; V5 Kit triangles attributed to the chunk containing their centroid; GLB landmarks by anchor chunk; chunk group at detail high with the V5 exclusion active (mode c).',
  worktree: root, flag: FLAG ? 'on' : 'off', c1Enabled: c1Enabled(), notes, exclusionIds,
  perChunk, chunkStages: { '0_0': chunks['0_0'].high.stages, '0_-1': chunks['0_-1'].high.stages },
  v5: { tris: v5.tris, calls: v5.calls, mats: v5.mats, per: v5.per, lots: v5.lots, parts: v5.parts, signs: v5.assigned },
  glb, wraps,
  lots: v5.perLot.filter((L: any) => /^(S2|UW|UE|UX)#/.test(L.id)).map(strip),
  rows: geo.ROWS.filter((r: any) => /^(S2|UW|UE|UX)$/.test(r.id)).map((r: any) => { const f = geo.rowFrame(skipped(r)); return { id: r.id, depth: r.depth, face: r.face ?? null, frame: { ox: f.ox, oz: f.oz, nx: +f.nx.toFixed(4), nz: +f.nz.toFixed(4), len: +f.len.toFixed(3) } }; }),
};
process.stdout.write('C1MEASURE ' + JSON.stringify(result) + '\n');
