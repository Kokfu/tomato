// Regression tests for the landmark registry, architectural classification and the generated
// landmark sites. They read the built data in public/, so run "npm run models:build" and
// "npm run data:build" first (the same precondition as the other data tests).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import polygonClipping from 'polygon-clipping';
import { classifyArchitecture } from '../../src/world/arch/classify.ts';
import { LANDMARK_REGISTRY, landmarkById } from '../../src/world/landmarks/registry.ts';
import { assertGeneric, guardViolations, isProtectedLandmark, mayHaveShopfront } from '../../src/world/landmarks/protect.ts';
import { ARCH_CLASSES, ARCH_BASIS, BUILDING_KINDS, SHOPFRONT_CLASSES } from '../../src/world/types.ts';
import type { ChunkData, BuildingData } from '../../src/world/types.ts';
import { CHUNK_SIZE, QUANT } from '../../src/world/config.ts';
import { geoToWorld } from '../../src/world/GeoProjection.ts';
import { pointInRingFlat, projectOnSegment } from '../../src/world/arch/frontage.ts';

const DATA = 'public/data/kuching';
const read = (f: string) => JSON.parse(readFileSync(`${DATA}/${f}`, 'utf8'));
interface Site {
  id: string; version: number; category: string; anchor: { x: number; z: number; y: number; yaw: number }; centre: { x: number; z: number };
  ring: number[]; buildingIds: number[]; chunks: string[]; widthM: number; depthM: number; groundRangeM: number;
  lods: { url: string; maxDistance: number; triangles: number; bytes: number }[];
  collision: { walls: { ring: number[]; top: number }[]; floors: { ring: number[]; h: number }[] };
  checks: { ref: string; inside: boolean }[];
}
const sites = (read('landmark-sites.json').sites as Site[]);
const site = (id: string) => { const s = sites.find((x) => x.id === id); assert.ok(s, `site ${id}`); return s!; };
const chunk = (key: string) => read(`chunks/${key}.json`) as ChunkData;
const worldRing = (d: ChunkData, b: BuildingData) => b.r[0].map((v, i) => (i % 2 ? d.cz : d.cx) * CHUNK_SIZE + v / QUANT);
const toPoly = (r: number[]) => { const o: [number, number][] = []; for (let i = 0; i < r.length; i += 2) o.push([r[i], r[i + 1]]); o.push(o[0]); return [o]; };
const area = (mp: [number, number][][][]) => { let a = 0; for (const p of mp) { const r = p[0]; let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += r[j][0] * r[i][1] - r[i][0] * r[j][1]; a += Math.abs(s) / 2; } return a; };
const TEMPLE = 'hiang-thian-siang-ti-temple', FOOD = 'lau-ya-keng-food-court', STAGE = 'yang-choon-tai-opera-stage';

// ---- classification: form vs tenancy --------------------------------------------------------------
test('a business tag never decides the architectural class of a building', () => {
  for (const tags of [{ building: 'yes', shop: 'jewelry' } as Record<string, string>, { building: 'yes', amenity: 'restaurant' }, { building: 'yes', amenity: 'cafe', name: 'Kopi' }, { building: 'yes', amenity: 'bank' }]) {
    const r = classifyArchitecture({ tags, source: 0 });
    assert.equal(r.cls, 'unknown', JSON.stringify(tags));
    assert.equal(r.basis, 'default');
  }
});
test('religious, civic and monument forms come from the footprint\'s own tags', () => {
  const c = (tags: Record<string, string>) => classifyArchitecture({ tags, source: 0 }).cls;
  assert.equal(c({ amenity: 'place_of_worship', religion: 'taoist' }), 'chinese_temple');
  assert.equal(c({ amenity: 'place_of_worship', religion: 'buddhist', name: 'Hong San Si Temple', building: 'yes' }), 'chinese_temple');
  assert.equal(c({ amenity: 'place_of_worship', religion: 'muslim', building: 'yes' }), 'mosque');
  assert.equal(c({ building: 'cathedral' }), 'church');
  assert.equal(c({ amenity: 'place_of_worship', religion: 'hindu' }), 'other_worship');
  assert.equal(c({ building: 'yes', tourism: 'museum' }), 'museum');
  assert.equal(c({ building: 'yes', man_made: 'ceremonial_gate' }), 'monument');
  assert.equal(c({ building: 'yes', amenity: 'marketplace' }), 'market');
  assert.equal(c({ building: 'retail' }), 'commercial');
  assert.equal(c({ building: 'apartments' }), 'residential');
});
test('uncertain evidence gives a conservative default, and the registry outranks tags', () => {
  assert.equal(classifyArchitecture({ tags: { building: 'yes' }, source: 0 }).cls, 'unknown');
  assert.equal(classifyArchitecture({ tags: { building: 'temple' }, source: 1 }).cls, 'unknown', 'machine-detected footprints carry no form evidence');
  const r = classifyArchitecture({ tags: { building: 'yes', shop: 'gift' }, source: 0, registry: 'chinese_temple' });
  assert.deepEqual([r.cls, r.basis], ['chinese_temple', 'registry']);
  assert.equal(classifyArchitecture({ tags: { amenity: 'place_of_worship', religion: 'buddhist', name: 'Wat X' }, source: 0 }).cls, 'other_worship');
  for (const c of ['chinese_temple', 'mosque', 'church', 'food_court', 'opera_stage', 'museum', 'market', 'government', 'monument', 'bridge'] as const) assert.ok(!SHOPFRONT_CLASSES.has(c), `${c} must not accept shopfronts`);
});

// ---- registry integrity ---------------------------------------------------------------------------
test('every registry entry is complete, coordinate-free and has its model files', () => {
  const ids = new Set<string>();
  for (const d of LANDMARK_REGISTRY) {
    assert.ok(!ids.has(d.id), `duplicate id ${d.id}`); ids.add(d.id);
    assert.ok(d.version >= 1 && d.name && d.location && ARCH_CLASSES.includes(d.category));
    assert.ok(d.sources.identity.length && d.sources.footprints.length, `${d.id}: sources`);
    for (const ref of [...d.sources.identity, ...d.sources.footprints, ...(d.sources.places ?? [])]) assert.match(ref, /^(way|node|relation)\/\d+$/);
    assert.ok(d.references.length >= 2, `${d.id}: at least two references`);
    for (const r of d.references) assert.match(r.url, /^https:\/\//);
    assert.ok(d.verification.matches.length && d.verification.approximations.length, `${d.id}: verification notes`);
    assert.ok(d.model.lods.length >= 2, `${d.id}: at least a near and a distant LOD`);
    for (let i = 1; i < d.model.lods.length; i++) assert.ok(d.model.lods[i].maxDistance > d.model.lods[i - 1].maxDistance);
    // No coordinates anywhere in a definition: positions are derived from the mapped sources.
    assert.doesNotMatch(JSON.stringify({ ...d, references: [] }), /\b(lat|lon|latitude|longitude)\b|1\.5\d{3,}|110\.3\d{3,}/, `${d.id}: no hard-coded coordinates`);
    const meta = JSON.parse(readFileSync(`public/${d.model.dir}/meta.json`, 'utf8'));
    assert.equal(meta.version, d.version, `${d.id}: model files are stale (npm run models:build)`);
    d.model.lods.forEach((l, i) => {
      const buf = readFileSync(`public/${d.model.dir}/${l.file}`);
      assert.equal(buf.readUInt32LE(0), 0x46546c67, `${l.file} is a binary glTF`);
      assert.equal(buf.readUInt32LE(8), buf.length);
      assert.equal(meta.lods[i].bytes, buf.length);
      const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
      assert.ok(json.extensionsRequired.includes('KHR_mesh_quantization'), 'quantised vertex data');
      assert.ok(json.materials.every((m: { name: string }) => ['opaque', 'glass', 'glow'].includes(m.name)), 'only shared materials');
      assert.ok(!json.images && !json.textures, 'no embedded textures');
    });
    assert.ok(meta.lods[0].triangles <= 20000 && meta.lods[0].bytes <= 450_000, `${d.id}: full model within budget`);
    assert.ok(meta.lods[meta.lods.length - 1].triangles <= 2500 && meta.lods[meta.lods.length - 1].bytes <= 64_000, `${d.id}: distant model within budget`);
    assert.ok(meta.lods[0].triangles > 2000, `${d.id}: the full model is real geometry, not a box`);
  }
  assert.ok(landmarkById(TEMPLE) && landmarkById(FOOD) && landmarkById(STAGE));
});

// ---- generated sites ------------------------------------------------------------------------------
test('each landmark has exactly one protected building record, classified from the registry', () => {
  for (const d of LANDMARK_REGISTRY) {
    const s = site(d.id);
    assert.equal(s.version, d.version);
    const found: { d: ChunkData; b: BuildingData }[] = [];
    for (const key of s.chunks) for (const b of chunk(key).buildings) if (b.lm === d.id) found.push({ d: chunk(key), b });
    assert.equal(found.length, 1, `${d.id}: one site record`);
    const b = found[0].b;
    assert.deepEqual(s.buildingIds, [b.id]);
    assert.equal(ARCH_CLASSES[b.ac ?? 0], d.category);
    assert.equal(ARCH_BASIS[b.ab ?? 0], 'registry');
    assert.equal(b.a, undefined, `${d.id} must carry no shophouse-row annotation`);
    assert.notEqual(BUILDING_KINDS[b.k], 'shophouse');
    assert.ok(isProtectedLandmark(b) && !mayHaveShopfront(b));
  }
});
test('the temple is not a shophouse, the food court is not a shoplot, the opera stage is its own structure', () => {
  assert.equal(site(TEMPLE).category, 'chinese_temple');
  assert.equal(site(FOOD).category, 'food_court');
  assert.equal(site(STAGE).category, 'opera_stage');
  assert.notDeepEqual(site(STAGE).buildingIds, site(FOOD).buildingIds);
  assert.notEqual(site(STAGE).lods[0].url, site(FOOD).lods[0].url);
  // distinct, adjacent, non-overlapping outlines
  const inter = polygonClipping.intersection(toPoly(site(FOOD).ring) as any, toPoly(site(STAGE).ring) as any) as any;
  assert.ok(area(inter) < 0.05, 'hall and stage do not overlap');
  const d = Math.hypot(site(FOOD).centre.x - site(STAGE).centre.x, site(FOOD).centre.z - site(STAGE).centre.z);
  assert.ok(d > 12 && d < 18, `stage directly behind the hall (${d.toFixed(1)} m between centres)`);
});
test('no generic building remains beneath a landmark model, and no landmark is drawn twice', () => {
  const count = new Map<string, number>();
  for (const s of sites) {
    // Sample the site on a 0.4 m grid (0.2 m inside its outline) and look for any other footprint there.
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < s.ring.length; i += 2) { x0 = Math.min(x0, s.ring[i]); x1 = Math.max(x1, s.ring[i]); z0 = Math.min(z0, s.ring[i + 1]); z1 = Math.max(z1, s.ring[i + 1]); }
    const pts: [number, number][] = [];
    for (let x = x0; x <= x1; x += 0.4) for (let z = z0; z <= z1; z += 0.4) {
      if (!pointInRingFlat(x, z, s.ring)) continue;
      let d = Infinity;
      for (let k = 0, j = s.ring.length - 2; k < s.ring.length; j = k, k += 2) d = Math.min(d, projectOnSegment(x, z, s.ring[j], s.ring[j + 1], s.ring[k], s.ring[k + 1])[1]);
      if (d > 0.2) pts.push([x, z]);
    }
    assert.ok(pts.length > 150, `${s.id}: sample points`);
    const [cx, cz] = s.chunks[0].split('_').map(Number);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const key = `${cx + dx}_${cz + dz}`;
      if (!existsSync(`${DATA}/chunks/${key}.json`)) continue;
      const d = chunk(key);
      for (const b of d.buildings) {
        if (b.lm === s.id) { count.set(s.id, (count.get(s.id) ?? 0) + 1); continue; }
        const ring = worldRing(d, b);
        const hits = pts.filter(([x, z]) => pointInRingFlat(x, z, ring)).length;
        assert.equal(hits, 0, `building ${b.id} (${b.lm ?? BUILDING_KINDS[b.k]}) lies under ${s.id}: ${(hits * 0.16).toFixed(1)} m2`);
      }
    }
  }
  for (const s of sites) assert.equal(count.get(s.id), 1, `${s.id} exists exactly once`);
});
test('landmark positions, orientation and scale follow the mapped features', () => {
  const osm = JSON.parse(readFileSync('data-src/osm/kuching.json', 'utf8')).elements as any[];
  const pois = JSON.parse(readFileSync('data-src/osm/pois.json', 'utf8')).elements as any[];
  const way = (id: number) => osm.find((e) => e.type === 'way' && e.id === id).geometry.map((g: any) => geoToWorld(g.lat, g.lon)) as [number, number][];
  const flat = (r: [number, number][]) => r.flatMap((p) => p);
  const temple = site(TEMPLE), food = site(FOOD), stage = site(STAGE);
  // Temple: centred on the mapped plot, inside its mapped host block, front on the plot's street edge.
  const plot = way(1388134054).slice(0, -1);
  assert.ok(pointInRingFlat(temple.centre.x, temple.centre.z, flat(plot)), 'temple centre inside the mapped plot');
  const fx = (plot[0][0] + plot[3][0]) / 2, fz = (plot[0][1] + plot[3][1]) / 2;
  assert.ok(Math.hypot(temple.anchor.x - fx, temple.anchor.z - fz) < 0.05, 'temple origin = midpoint of the plot\'s street edge');
  assert.ok(Math.abs(temple.depthM - 29.5) < 0.6 && Math.abs(temple.widthM - 10.4) < 0.01);
  // Every site lies inside the mapped footprint it was cut from.
  for (const [s, host] of [[temple, 236495089], [food, 233690735], [stage, 233690735]] as [Site, number][]) {
    const h = flat(way(host).slice(0, -1));
    for (let i = 0; i < s.ring.length; i += 2) {
      let dmin = Infinity;
      for (let k = 0, j = h.length - 2; k < h.length; j = k, k += 2) dmin = Math.min(dmin, projectOnSegment(s.ring[i], s.ring[i + 1], h[j], h[j + 1], h[k], h[k + 1])[1]);
      assert.ok(pointInRingFlat(s.ring[i], s.ring[i + 1], h) || dmin < 0.05, `${s.id}: vertex outside way/${host}`);
    }
  }
  // Orientation: each model looks at Carpenter Street; temple and food court face each other on one axis.
  const n = (s: Site): [number, number] => [Math.sin(s.anchor.yaw), Math.cos(s.anchor.yaw)];
  const carpenter = osm.filter((e) => e.type === 'way' && e.tags?.highway && e.tags.name === 'Jalan Carpenter').flatMap((e) => { const p = e.geometry.map((g: any) => geoToWorld(g.lat, g.lon)); return p.slice(1).map((q: number[], i: number) => [p[i][0], p[i][1], q[0], q[1]]); }) as number[][];
  const streetDist = (x: number, z: number) => Math.min(...carpenter.map((s) => projectOnSegment(x, z, s[0], s[1], s[2], s[3])[1]));
  for (const s of [temple, food]) {
    const [nx, nz] = n(s);
    assert.ok(streetDist(s.anchor.x + nx * 3, s.anchor.z + nz * 3) < streetDist(s.anchor.x, s.anchor.z), `${s.id} faces the street`);
    assert.ok(streetDist(s.anchor.x, s.anchor.z) < 9, `${s.id} fronts Carpenter Street`);
  }
  const [tx, tz] = n(temple), [gx, gz] = n(food);
  assert.ok(tx * gx + tz * gz < -0.99, 'temple and food court face each other');
  const off = Math.abs((food.anchor.x - temple.anchor.x) * tz - (food.anchor.z - temple.anchor.z) * tx);
  assert.ok(off < 0.05, `food court is on the temple axis (${off.toFixed(3)} m off)`);
  assert.ok(Math.abs(n(stage)[0] - gx) < 1e-6 && Math.abs(n(stage)[1] - gz) < 1e-6, 'the stage looks out through the hall toward the temple');
  // Independent mapped points confirm the derived sites.
  const node = (id: number) => { const e = pois.find((p) => p.type === 'node' && p.id === id); return geoToWorld(e.lat, e.lon); };
  assert.ok(pointInRingFlat(...node(4989957225), food.ring), 'OSM "Lau Ya Keng Foodcourt" node inside the hall site');
  assert.ok(pointInRingFlat(...node(12779002958), stage.ring), 'OSM wayang-stage node inside the stage site');
  for (const s of sites) { assert.ok(s.checks.every((c) => c.inside)); assert.equal(read('landmark-sites.json').sites.find((x: any) => x.id === s.id).scale, 1); assert.ok(s.groundRangeM < 1, `${s.id}: site is close to level`); }
  assert.equal(stage.anchor.y, food.anchor.y, 'hall and stage share one floor level');
});
test('collision comes from the model, once: solid halls, open forecourt and dining floor', () => {
  const inWall = (s: Site, x: number, z: number) => s.collision.walls.some((w) => pointInRingFlat(x, z, w.ring));
  const local = (s: Site, lx: number, lz: number): [number, number] => { const nx = Math.sin(s.anchor.yaw), nz = Math.cos(s.anchor.yaw); return [s.anchor.x + nz * lx + nx * lz, s.anchor.z - nx * lx + nz * lz]; };
  const temple = site(TEMPLE), food = site(FOOD), stage = site(STAGE);
  assert.ok(!inWall(temple, ...local(temple, 1.5, -1.5)), 'temple forecourt is walkable');
  assert.ok(inWall(temple, ...local(temple, 0, -15)), 'temple halls are solid');
  assert.ok(!inWall(food, ...local(food, 1.0, -3.5)), 'aisle between the tables is walkable');
  assert.ok(!inWall(food, ...local(food, 0, -0.5)), 'the food court entrance is open');
  assert.ok(inWall(food, ...local(food, -4.2, -5.2)), 'stalls block');
  assert.ok(!inWall(stage, ...local(stage, 0, -0.5)), 'the player can walk up to the stage');
  assert.ok(inWall(stage, ...local(stage, 0, -3)), 'the stage itself is solid');
  for (const s of sites) {
    assert.ok(s.collision.floors.length + s.collision.walls.length >= 1);
    for (const w of s.collision.walls) for (let i = 0; i < w.ring.length; i += 2) {
      let d = Infinity;
      for (let k = 0, j = s.ring.length - 2; k < s.ring.length; j = k, k += 2) d = Math.min(d, projectOnSegment(w.ring[i], w.ring[i + 1], s.ring[j], s.ring[j + 1], s.ring[k], s.ring[k + 1])[1]);
      assert.ok(pointInRingFlat(w.ring[i], w.ring[i + 1], s.ring) || d < 0.6, `${s.id}: collision stays on its own site`);
    }
  }
});

// ---- the guard ------------------------------------------------------------------------------------
test('a protected landmark passed to a generic renderer fails loudly', () => {
  const before = guardViolations.length;
  assert.doesNotThrow(() => assertGeneric({ id: 1 }, 'shophouse row'));
  assert.throws(() => assertGeneric({ id: 2, lm: TEMPLE }, 'shophouse row'), /Protected landmark/);
  assert.equal(guardViolations.length, before + 1);
  guardViolations.length = before;
  assert.ok(!mayHaveShopfront({ id: 3, ac: ARCH_CLASSES.indexOf('chinese_temple'), a: { f: [0] } }), 'a temple never gets shopfronts, even with frontage edges');
  assert.ok(mayHaveShopfront({ id: 4, ac: ARCH_CLASSES.indexOf('heritage_shophouse'), a: { f: [0] } }));
});
test('every generic building generator is behind the guard', () => {
  const src = (f: string) => readFileSync(f, 'utf8');
  for (const [file, fn] of [['src/world/BuildingBuilder.ts', 'function addBuilding('], ['src/world/arch/Shophouse.ts', 'export function addShophouseRow('], ['src/world/arch/HeritageRow.ts', 'export function addHeritageRow(']]) {
    const s = src(file), i = s.indexOf(fn);
    assert.ok(i >= 0, `${fn} in ${file}`);
    assert.match(s.slice(i, i + 400), /assertGeneric\(b, /, `${file}: ${fn} must call assertGeneric first`);
  }
  const bb = src('src/world/BuildingBuilder.ts');
  assert.ok(bb.indexOf('if (isProtectedLandmark(b)) continue;') > 0 && bb.indexOf('if (isProtectedLandmark(b)) continue;') < bb.indexOf('addHeritageRow(b, ox'), 'landmark sites are skipped before any generator runs');
  assert.match(src('src/world/CollisionWorld.ts'), /if \(b\.lm !== undefined\) continue;/, 'no footprint collision under a landmark model');
  assert.match(src('tools/generate-world/build-streetscape.ts'), /if \(b\.lm \|\| !SHOPFRONT_CLASSES\.has/, 'streetscape pass skips protected sites');
});

// ---- neighbours -----------------------------------------------------------------------------------
test('the carved host blocks stay ordinary shophouse rows with their business signs', () => {
  // Rows that touch a landmark site: both sides of the temple, and beside the food court.
  let touching = 0;
  for (const key of ['0_0', '0_-1']) {
    const d = chunk(key);
    for (const b of d.buildings) {
      if (b.lm || !b.a?.f.length) continue;
      const r = worldRing(d, b);
      let near = false;
      for (const s of sites) for (let i = 0; i < r.length && !near; i += 2) for (let k = 0, j = s.ring.length - 2; k < s.ring.length; j = k, k += 2) if (projectOnSegment(r[i], r[i + 1], s.ring[j], s.ring[j + 1], s.ring[k], s.ring[k + 1])[1] < 0.3) { near = true; break; }
      if (!near) continue;
      touching++;
      assert.equal(ARCH_CLASSES[b.ac ?? 0], 'heritage_shophouse');
      assert.equal(BUILDING_KINDS[b.k], 'shophouse');
    }
  }
  assert.ok(touching >= 3, `shophouse rows adjoin the temple and the food court (${touching})`);
  const places = ['0_0', '0_-1'].flatMap((k) => JSON.parse(readFileSync(`${DATA}/places/${k}.json`, 'utf8')).places) as { id: string; name: string; b?: number; e?: number; sign?: boolean; x: number; z: number }[];
  const siteIds = new Set(sites.flatMap((s) => s.buildingIds));
  const inSites = places.filter((p) => p.b !== undefined && siteIds.has(p.b));
  assert.ok(inSites.some((p) => /Lau Ya Keng/.test(p.name)), 'food court businesses are still inspectable');
  for (const p of inSites) assert.ok(!p.sign && p.e === undefined, `${p.name}: no generic facade sign on a landmark`);
  const signsNearby = places.filter((p) => p.sign && Math.hypot(p.x - site(TEMPLE).anchor.x, p.z - site(TEMPLE).anchor.z) < 70);
  assert.ok(signsNearby.length >= 5, `nearby shops keep their signs (${signsNearby.length})`);
  for (const name of ['7-Eleven', 'Curry House Carpenter Street']) assert.ok(places.some((p) => p.name === name && p.b !== undefined && !siteIds.has(p.b)), `${name} is still attached to its own building`);
});
test('no building anywhere combines a non-shop architectural class with shopfront geometry', () => {
  let rows = 0;
  for (const f of readdirSync(`${DATA}/chunks`)) {
    const d = JSON.parse(readFileSync(`${DATA}/chunks/${f}`, 'utf8')) as ChunkData;
    for (const b of d.buildings) {
      if (!b.a?.f.length) continue;
      rows++;
      assert.ok(SHOPFRONT_CLASSES.has(ARCH_CLASSES[b.ac ?? 0]) && !b.lm, `${f} building ${b.id}: ${ARCH_CLASSES[b.ac ?? 0]} with shopfronts`);
    }
  }
  assert.ok(rows > 50);
});

// ---- derived road alignment -----------------------------------------------------------------------
test('Jalan Carpenter runs through the Harmony Arch and midway between its blocks, junctions unmoved', async () => {
  const osm = await import('../../tools/generate-world/osm.ts');
  const { ROAD_ALIGNMENTS, ALIGNMENT_NODE_BASE } = await import('../../tools/generate-world/road-alignments.ts');
  const raw = JSON.parse(readFileSync('data-src/osm/kuching.json', 'utf8')).elements as any[];
  const { elements } = osm.loadOsm();
  const def = ROAD_ALIGNMENTS.find((d) => d.way === 196054157)!;
  assert.doesNotMatch(JSON.stringify({ ...def, basis: '' }), /\d+\.\d{4,}/, 'an alignment holds no coordinates');
  const before = raw.find((e) => e.type === 'way' && e.id === def.way), after = elements.find((e) => e.type === 'way' && e.id === def.way)!;
  // Every original node is still there, in order, at its mapped position; only derived vertices were inserted.
  assert.deepEqual(after.nodes!.filter((n) => n < ALIGNMENT_NODE_BASE), before.nodes);
  const kept = after.geometry!.filter((_, i) => after.nodes![i] < ALIGNMENT_NODE_BASE);
  assert.deepEqual(kept, before.geometry);
  const inserted = after.nodes!.length - before.nodes.length;
  assert.ok(inserted >= 2 && inserted <= 8 && osm.roadAlignments[0].inserted === inserted);
  const line = after.geometry!.map((g) => geoToWorld(g.lat, g.lon));
  const dist = (x: number, z: number) => { let d = Infinity; for (let i = 1; i < line.length; i++) d = Math.min(d, projectOnSegment(x, z, line[i - 1][0], line[i - 1][1], line[i][0], line[i][1])[1]); return d; };
  const arch = site('carpenter-street-harmony-arch');
  assert.ok(dist(arch.centre.x, arch.centre.z) < 0.3, `street passes through the centre of the arch (${dist(arch.centre.x, arch.centre.z).toFixed(2)} m off)`);
  // In front of the temple the centre line is the same distance from both sides of the street.
  const t = site(TEMPLE), f = site(FOOD);
  const south = dist(t.anchor.x, t.anchor.z), north = dist(f.anchor.x, f.anchor.z);
  assert.ok(Math.abs(south - north) < 0.3, `midway between temple (${south.toFixed(2)} m) and food court (${north.toFixed(2)} m)`);
  assert.ok(south > 3.5 && south < 5, 'room for the carriageway and a footway each side');
});
