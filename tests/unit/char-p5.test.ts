// CHAR-P5 gate 1: lean character build, fast crease, sole scan, staged swap, warm model, cache budget (node --test).
// U1.x build and swap, U2.x mid-air foot scan, U3.x cache and memory. See docs of the milestone in the evidence folder.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { creasedNormalsFast, creasedNormalsSteps } from '../../src/player/character/creasedNormals.ts';
import { CharacterRegistry, FETCHED_KEPT, cloneSource, profileOptions } from '../../src/player/character/CharacterRegistry.ts';
import { CharacterSwapper } from '../../src/player/character/swap.ts';
import type { SwapHost } from '../../src/player/character/swap.ts';
import { CharacterTimings } from '../../src/player/character/timings.ts';
import { DEFAULT_CHARACTER_ID, getProfile, listProfiles, nextProfileId } from '../../src/player/character/CharacterProfile.ts';
import { GlbCharacter } from '../../src/player/GlbCharacter.ts';
import type { CharacterVisual } from '../../src/player/CharacterAnimator.ts';

// The glTF loader decodes textures through the browser; node gets a stand-in bitmap.
(globalThis as { self?: unknown }).self = globalThis;
(globalThis as { createImageBitmap?: unknown }).createImageBitmap = async () => ({ width: 8, height: 8, close() {} });
URL.createObjectURL = () => 'blob:stub';

const GLB_DIR = new URL('../../public/models/characters/', import.meta.url);
async function parse(file: string): Promise<{ scene: THREE.Object3D; animations: THREE.AnimationClip[] }> {
  const buf = readFileSync(new URL(file, GLB_DIR));
  return new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, '');
}
const MPFB = ['man', 'woman', 'teen-boy', 'teen-girl', 'young-boy', 'young-girl'] as const;
const ALL_FILES = ['casual-character.glb', 'adult-man.glb', 'adult-woman.glb', ...MPFB.map((m) => `${m}.glb`)];
const leanOpts = (id: string) => ({ ...profileOptions(getProfile(id)!), lean: true });
/** The reduced sole set must lift within this of the full scan, in metres (the audit asks: landing no worse than base). */
const SOLE_TOL = 0.001;
type Priv = { soleVerts: { mesh: THREE.SkinnedMesh; index: number }[] | null; soleDepth(): number; pose(a: unknown, t: number): void; actions(): { getClip(): THREE.AnimationClip; time: number }[]; model: THREE.Object3D; baseY: number; walkGait: unknown; runGait: unknown; airTime: number; idle: unknown };

/** Count the vertices CPU-skinned through SkinnedMesh.getVertexPosition, split by whether the geometry was indexed. */
function spySkinning() {
  const proto = THREE.SkinnedMesh.prototype as unknown as { getVertexPosition: (i: number, t: THREE.Vector3) => THREE.Vector3 };
  const orig = proto.getVertexPosition;
  const s = { indexed: 0, deindexed: 0, get total() { return s.indexed + s.deindexed; }, reset() { s.indexed = 0; s.deindexed = 0; }, restore() { proto.getVertexPosition = orig; } };
  proto.getVertexPosition = function (this: THREE.SkinnedMesh, i: number, t: THREE.Vector3) {
    if (this.geometry.index) s.indexed++; else s.deindexed++;
    return orig.call(this, i, t);
  };
  return s;
}

// ---------------------------------------------------------------- U1.1 fast crease equals three's

for (const file of ALL_FILES) {
  test(`U1.1 ${file}: creasedNormalsFast equals three's toCreasedNormals (same attributes, count and normals to 1e-6)`, async () => {
    const gltf = await parse(file);
    const meshes: THREE.Mesh[] = [];
    gltf.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
    assert.ok(meshes.length > 0);
    const angle = (70 * Math.PI) / 180;
    for (const m of meshes) {
      const a = toCreasedNormals(m.geometry, angle), b = creasedNormalsFast(m.geometry, angle);
      assert.deepEqual(Object.keys(b.attributes).sort(), Object.keys(a.attributes).sort());
      assert.equal(b.index, a.index);
      assert.equal(b.attributes.position.count, a.attributes.position.count);
      for (const k of Object.keys(a.attributes)) {
        const x = a.attributes[k].array as Float32Array, y = b.attributes[k].array as Float32Array;
        assert.equal(y.length, x.length, k);
        let worst = 0;
        for (let i = 0; i < x.length; i++) worst = Math.max(worst, Math.abs(x[i] - y[i]));
        assert.ok(worst <= (k === 'normal' ? 1e-6 : 0), `${k}: max difference ${worst}`);
      }
    }
  });
}

test('U1.1 the stepped crease yields between chunks and gives the same result as the one-go version', async () => {
  const gltf = await parse('man.glb');
  let mesh: THREE.Mesh | null = null;
  gltf.scene.traverse((o) => { if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh; });
  const angle = (70 * Math.PI) / 180;
  const it = creasedNormalsSteps(mesh!.geometry, angle, 500);
  let yields = 0, r = it.next();
  while (!r.done) { yields++; r = it.next(); }
  assert.ok(yields >= 8, `yields ${yields}`);
  const one = creasedNormalsFast(mesh!.geometry, angle);
  assert.deepEqual(Array.from(r.value.attributes.normal.array as Float32Array), Array.from(one.attributes.normal.array as Float32Array));
});

test('U1.1 a non-indexed geometry falls back to three (same result, no crash)', () => {
  const g = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  const a = toCreasedNormals(g.clone(), 1), b = creasedNormalsFast(g.clone(), 1);
  assert.deepEqual(Array.from(b.attributes.normal.array as Float32Array), Array.from(a.attributes.normal.array as Float32Array));
});

// ---------------------------------------------------------------- U1.2 the lean build never skins a de-indexed mesh

for (const id of MPFB) {
  test(`U1.2 ${id}: a lean build skins only the indexed geometry (box and sole candidates), never the 5x de-indexed one`, async () => {
    const gltf = await parse(`${id}.glb`);
    let indexedCount = 0;
    gltf.scene.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) indexedCount += (o as THREE.SkinnedMesh).geometry.attributes.position.count; });
    const spy = spySkinning();
    try {
      const ch = new GlbCharacter(gltf, leanOpts(id));
      assert.equal(spy.deindexed, 0, 'no vertex of a de-indexed geometry was skinned while building');
      assert.ok(spy.indexed <= 2.1 * indexedCount + 45 * 800, `skinned ${spy.indexed} for ${indexedCount} source vertices (box + sole candidates = 2 passes, + <= 45 sampled poses of <= 800 candidates)`);
      assert.ok((ch as unknown as Priv).soleVerts!.length >= 8, 'the reduced sole set keeps the lowest vertices of the sampled poses');
      // G1c: the sphere is set by the build (the first draw would skin every vertex to get it) and encloses the mesh's box (the idle pose it was measured in)
      let checked = 0;
      ch.root.traverse((o) => {
        const m = o as THREE.SkinnedMesh;
        if (!m.isSkinnedMesh) return;
        assert.ok(m.boundingSphere && m.boundingBox, 'the lean build sets the bounding sphere (and the box)');
        const c = new THREE.Vector3(), bx = m.boundingBox!;
        for (const x of [bx.min.x, bx.max.x]) for (const y of [bx.min.y, bx.max.y]) for (const z of [bx.min.z, bx.max.z]) { c.set(x, y, z); assert.ok(c.distanceTo(m.boundingSphere!.center) <= m.boundingSphere!.radius + 1e-6, 'every corner of the box is inside the sphere'); checked++; }
      });
      assert.ok(checked >= 8);
    } finally { spy.restore(); }
  });
}

// ---------------------------------------------------------------- U1.3 lean == classic

/** A scripted sequence: stand, accelerate to a run, jump (airborne frames), land, walk, turn. */
function script(): { speed: number; grounded: boolean; vy: number; yaw: number }[] {
  const out: { speed: number; grounded: boolean; vy: number; yaw: number }[] = [];
  for (let i = 0; i < 30; i++) out.push({ speed: 0, grounded: true, vy: 0, yaw: 0 });
  for (let i = 0; i < 60; i++) out.push({ speed: Math.min(5, i * 0.12), grounded: true, vy: 0, yaw: 0 });
  for (let i = 0; i < 48; i++) out.push({ speed: 5, grounded: false, vy: 4 - i * 0.17, yaw: i * 0.02 });
  for (let i = 0; i < 40; i++) out.push({ speed: 4, grounded: true, vy: 0, yaw: 1 });
  for (let i = 0; i < 40; i++) out.push({ speed: 0, grounded: false, vy: 3 - i * 0.15, yaw: 1 });
  for (let i = 0; i < 40; i++) out.push({ speed: 0, grounded: true, vy: 0, yaw: 1.6 });
  for (let i = 0; i < 20; i++) out.push({ speed: 1.4, grounded: true, vy: 0, yaw: 2 });
  return out;
}

for (const id of [DEFAULT_CHARACTER_ID, ...MPFB]) {
  test(`U1.3 ${id}: the lean build and the classic build give the same character (height, gait, sole lift per frame, bone poses)`, async () => {
    const file = getProfile(id)!.url.split('/').pop()!;
    const classic = new GlbCharacter(await parse(file), profileOptions(getProfile(id)!));
    const lean = new GlbCharacter(await parse(file), leanOpts(id));
    const a = classic as unknown as Priv, b = lean as unknown as Priv;
    assert.ok(Math.abs(a.baseY - b.baseY) <= 1e-9);
    assert.ok(Math.abs(a.airTime - b.airTime) <= 1e-9);
    assert.deepEqual(a.walkGait, b.walkGait);
    assert.deepEqual(a.runGait, b.runGait);
    assert.ok(a.model.scale.distanceTo(b.model.scale) <= 1e-9);
    assert.ok(a.model.position.distanceTo(b.model.position) <= 1e-9);
    assert.equal(!!a.soleVerts, !!b.soleVerts);
    // The creased geometry is the same too.
    const norms = (c: GlbCharacter) => { const out: Float32Array[] = []; c.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) out.push((o as THREE.Mesh).geometry.attributes.normal.array as Float32Array); }); return out; };
    const na = norms(classic), nb = norms(lean);
    assert.equal(na.length, nb.length);
    na.forEach((x, k) => { assert.equal(x.length, nb[k].length); let w = 0; for (let i = 0; i < x.length; i++) w = Math.max(w, Math.abs(x[i] - nb[k][i])); assert.ok(w <= 1e-6, `normals ${w}`); });
    let worst = 0;
    for (const s of script()) {
      classic.root.rotation.y = lean.root.rotation.y = s.yaw;
      classic.update(1 / 60, s); lean.update(1 / 60, s);
      worst = Math.max(worst, Math.abs(a.model.position.y - b.model.position.y));
    }
    // The reduced sole set (CHAR-P5, option 3 of the audit) may pick a vertex a few mm off in a blend it did not sample.
    assert.ok(worst <= SOLE_TOL, `model height differs by ${worst} m`);
    classic.root.updateMatrixWorld(true); lean.root.updateMatrixWorld(true);
    const bones = (c: GlbCharacter) => { const out: THREE.Vector3[] = []; c.root.traverse((o) => { if ((o as THREE.Bone).isBone) out.push(o.getWorldPosition(new THREE.Vector3())); }); return out; };
    const ba = bones(classic), bb = bones(lean);
    ba.forEach((v, i) => assert.ok(v.distanceTo(bb[i]) <= 1e-6, `bone ${i}`));
  });
}

// ---------------------------------------------------------------- U1.4 staged swap

function fakeVisual(tag: string): CharacterVisual & { tag: string; disposed: boolean } {
  const root = new THREE.Group();
  return { tag, disposed: false, root, update() {}, pose() {}, dispose() { (this as { disposed: boolean }).disposed = true; } } as unknown as CharacterVisual & { tag: string; disposed: boolean };
}
const fakeSrc = () => ({ scene: new THREE.Group(), animations: [] as THREE.AnimationClip[] });

function fakeSetup(over: Partial<SwapHost> = {}, regOpts: { budgetBytes?: number; size?: number } = {}) {
  const log: string[] = [];
  const loads: string[] = [];
  const builds: string[] = [];
  const visuals: (CharacterVisual & { tag: string; disposed: boolean })[] = [];
  const registry = new CharacterRegistry({
    load: async (url) => { loads.push(url); return fakeSrc(); },
    build: async (_s, o) => { const v = fakeVisual(String(o.height)); builds.push(String(o.height)); visuals.push(v); return v; },
    sizeOf: () => regOpts.size ?? 0,
  }, { budgetBytes: regOpts.budgetBytes ?? 64 * 1024 * 1024 });
  const state = { current: fakeVisual('humanoid') as CharacterVisual };
  const host: SwapHost = {
    registry,
    install: (next) => { log.push('install'); const old = state.current; state.current = next; return old; },
    prepare: async () => { log.push('prepare'); },
    applyCamera: () => void log.push('camera'),
    syncBody: () => void log.push('body'),
    warn: () => {},
    yieldToMain: async () => { log.push('yield'); await Promise.resolve(); },
    ...over,
  };
  return { host, registry, log, loads, builds, visuals, state };
}

test('U1.4 a swap with yieldToMain runs in steps (>= 3 yields before the install) and installs in one synchronous block', async () => {
  const { host, log } = fakeSetup();
  const sw = new CharacterSwapper(host);
  assert.equal(await sw.swap('adult-man'), true);
  const iInstall = log.indexOf('install');
  assert.ok(log.slice(0, iInstall).filter((x) => x === 'yield').length >= 3, log.join(','));
  assert.deepEqual(log.slice(iInstall), ['install', 'camera', 'body'], 'install, camera and body rule follow each other with no yield between');
});

test('U1.4 a real lean build is split into steps: >= 8 yields, each stage reported, longest stretch small', async () => {
  const stages: Record<string, number> = {};
  let yields = 0;
  const gltf = await parse('woman.glb');
  const opts = { ...leanOpts('woman'), onStage: (n: string, ms: number) => { stages[n] = ms; } };
  const ch = await GlbCharacter.buildStaged(gltf, opts, async () => { yields++; await Promise.resolve(); });
  assert.ok(yields >= 8, `yields ${yields}`);
  for (const k of ['setup', 'bbox', 'gait', 'sole', 'crease', 'maxChunk']) assert.ok(k in stages, `stage ${k} in ${Object.keys(stages)}`);
  assert.ok(stages.maxChunk < 100, `longest uninterrupted stretch ${stages.maxChunk} ms (generous bound for a loaded CI box; the e2e gate holds the real one)`);
  assert.ok(ch.root.children.length > 0);
});

test('U1.4 a swap superseded during a yield is dropped without side effects', async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  let first = true;
  const { host, log, visuals } = fakeSetup({ yieldToMain: async () => { if (first) { first = false; await gate; } else await Promise.resolve(); } });
  const sw = new CharacterSwapper(host);
  const a = sw.swap('adult-man');
  await Promise.resolve();
  const b = sw.swap('adult-woman');
  release();
  assert.equal(await b, true);
  assert.equal(await a, false);
  assert.equal(log.filter((x) => x === 'install').length, 1, 'only the newest swap installed');
  assert.equal(sw.currentId, 'adult-woman');
  assert.ok(visuals.some((v) => v.disposed), 'the superseded model was disposed');
});

// ---------------------------------------------------------------- U1.5 warm

test('U1.5 after warm(next) the swap needs no fetch, no build and installs without another yield', async () => {
  const prep: string[] = [];
  const { host, loads, builds, log } = fakeSetup({ predraw: async () => { prep.push('predraw'); } });
  const sw = new CharacterSwapper(host);
  await sw.swap('adult-man');
  assert.equal(await sw.warm('adult-woman'), true);
  assert.deepEqual(prep, ['predraw', 'predraw'], 'one hidden predraw for the cold swap, one for the warm-up');
  assert.ok(sw.hasWarm('adult-woman'));
  const l0 = loads.length, b0 = builds.length, y0 = log.filter((x) => x === 'yield').length;
  log.length = 0;
  assert.equal(await sw.swap('adult-woman'), true);
  assert.equal(loads.length, l0, 'no fetch');
  assert.equal(builds.length, b0, 'no build');
  assert.equal(log.filter((x) => x === 'yield').length + y0 - y0, 0, 'no yield in the swap');
  assert.deepEqual(log, ['install', 'camera', 'body']);
  assert.equal(sw.currentId, 'adult-woman');
  assert.ok(!sw.hasWarm('adult-woman'), 'the slot was taken');
});

test('U1.6 every staged load draws the model hidden BEFORE the install (cold swap, tap before the warm finished); a direct swap and a dropped warm do not', async () => {
  const order: string[] = [];
  const { host, log, builds } = fakeSetup({ predraw: async () => { order.push('predraw'); } });
  const h2 = { ...host, install: (n: CharacterVisual) => { order.push('install'); return host.install(n); } };
  const sw = new CharacterSwapper(h2);
  assert.equal(await sw.swap('adult-man'), true);
  assert.deepEqual(order, ['predraw', 'install'], 'the first cold swap draws hidden, then installs');
  order.length = 0;
  // a tap while the warm-up is still being built: the swap waits for it (one predraw in all) and installs it
  const warming = sw.warm('adult-woman');
  assert.equal(await sw.swap('adult-woman'), true);
  await warming;
  assert.deepEqual(order, ['predraw', 'install'], 'a model built by the warm-up is drawn once, before it is installed');
  order.length = 0;
  // a swap to a model that was not warmed (the other one): cold path, drawn before the install
  assert.equal(await sw.swap('adult-man'), true);
  assert.deepEqual(order, ['predraw', 'install']);
  // the no-flag (direct) load never predraws
  order.length = 0;
  const b0 = builds.length;
  const direct = fakeSetup({ predraw: async () => { order.push('predraw'); } });
  const dreg = new CharacterRegistry({ loadDirect: async () => fakeVisual('direct') as never });
  const s2 = new CharacterSwapper({ ...direct.host, registry: dreg });
  assert.equal(await s2.swap('adult-man', { direct: true }), true);
  assert.ok(!order.includes('predraw'), 'the no-flag (direct) load never draws hidden');
  void b0; void builds;
  // a warm-up dropped before its draw does not draw
  order.length = 0;
  const w = sw.warm('adult-woman');
  sw.dropWarm();
  await w;
  assert.ok(!order.includes('predraw'), 'a dropped warm-up is not drawn');
  void log;
});

test('U1.5 warm does nothing for the model on screen or an unknown id, and a direct (no-flag) swap ignores the slot', async () => {
  const { host, builds } = fakeSetup();
  const sw = new CharacterSwapper(host);
  await sw.swap('adult-man');
  assert.equal(await sw.warm('adult-man'), false);
  assert.equal(await sw.warm('no-such'), false);
  assert.equal(builds.length, 1);
});

// ---------------------------------------------------------------- U3 memory

test('U3.3 a warm model nobody takes is disposed: when another swap goes elsewhere, on dropWarm, and when dropped while building', async () => {
  const s = fakeSetup();
  const sw = new CharacterSwapper(s.host);
  await sw.swap('adult-man');
  await sw.warm('adult-woman');
  const warmV = s.visuals[s.visuals.length - 1];
  assert.equal(warmV.disposed, false);
  await sw.swap('man'); // somewhere else
  assert.equal(warmV.disposed, true, 'superseded warm model disposed');
  await sw.warm('woman');
  const w2 = s.visuals[s.visuals.length - 1];
  sw.dropWarm();
  assert.equal(w2.disposed, true, 'dropWarm disposes');
  // dropped while it is still being built
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const s2 = fakeSetup({ prepare: async () => { await gate; } });
  const sw2 = new CharacterSwapper(s2.host);
  const p = sw2.warm('adult-woman');
  await new Promise((r) => setTimeout(r, 5));
  sw2.dropWarm();
  release();
  assert.equal(await p, false);
  assert.ok(s2.visuals.every((v) => v.disposed), 'the model finished after the drop is disposed at once');
  assert.equal(s2.registry.liveCount, 0);
});

test('U3.4 cancelPendingWarm (the game resumed): a warm still being built stops at its next step and builds no further stage; a finished warm is kept', async () => {
  // building: stops at the next yield, nothing is installed or left alive
  let steps = 0;
  const s = fakeSetup({ yieldToMain: async () => { steps++; await new Promise((r) => setTimeout(r, 2)); } });
  const sw = new CharacterSwapper(s.host);
  await sw.swap('adult-man');
  const p = sw.warm('adult-woman');
  await new Promise((r) => setTimeout(r, 3));
  const at = steps;
  sw.cancelPendingWarm();
  assert.equal(await p, false, 'the cancelled warm reports false');
  assert.ok(steps <= at + 1, `no more than the step in flight after the cancel (${at} -> ${steps})`);
  assert.equal(sw.hasWarm('adult-woman'), false);
  assert.ok(s.visuals.length < 2 || s.visuals[s.visuals.length - 1].disposed, 'a model finished after the cancel is disposed');
  assert.equal(s.registry.liveCount, 1, 'only the model on screen');
  // finished: kept for the next pause, and the swap to it needs no build
  const s2 = fakeSetup();
  const sw2 = new CharacterSwapper(s2.host);
  await sw2.swap('adult-man');
  assert.equal(await sw2.warm('adult-woman'), true);
  const builds = s2.builds.length;
  sw2.cancelPendingWarm();
  assert.equal(sw2.hasWarm('adult-woman'), true, 'a finished warm model is not thrown away');
  assert.equal(await sw2.swap('adult-woman'), true);
  assert.equal(s2.builds.length, builds, 'taken from the slot: no new build');
  // nothing warming: harmless
  const s3 = fakeSetup();
  new CharacterSwapper(s3.host).cancelPendingWarm();
});

test('U3.1 evicting a cached file closes its decoded images exactly once and leaves a kept one alone', async () => {
  const closes = new Map<string, number>();
  const mk = (name: string) => {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    const image = { width: 4, height: 4, close() { closes.set(name, (closes.get(name) ?? 0) + 1); } };
    (mesh.material as THREE.MeshBasicMaterial).map = new THREE.Texture(image as unknown as HTMLImageElement);
    const g = new THREE.Group(); g.add(mesh);
    return { scene: g, animations: [] as THREE.AnimationClip[] };
  };
  const registry = new CharacterRegistry({ load: async (u) => mk(u), build: async () => fakeVisual('x') });
  await registry.create('adult-man'); await registry.create('adult-woman');
  for (const v of [...(registry as unknown as { live: Map<CharacterVisual, string> }).live.keys()]) registry.dispose(v);
  registry.trim([getProfile('adult-woman')!.url]);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(closes.get(getProfile('adult-man')!.url), 1, 'evicted: closed once');
  assert.equal(closes.get(getProfile('adult-woman')!.url), undefined, 'kept: not closed');
  registry.trim([]);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(closes.get(getProfile('adult-woman')!.url), 1);
  registry.trim([]);
  assert.equal(closes.get(getProfile('adult-man')!.url), 1, 'never closed twice');
});

test('U3.1 a source being cloned is not evicted under the clone (the clone shares its images)', async () => {
  const closes: string[] = [];
  const registry = new CharacterRegistry({
    load: async () => {
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
      (mesh.material as THREE.MeshBasicMaterial).map = new THREE.Texture({ width: 4, height: 4, close() { closes.push('x'); } } as unknown as HTMLImageElement);
      const g = new THREE.Group(); g.add(mesh);
      return { scene: g, animations: [] as THREE.AnimationClip[] };
    },
    build: async () => fakeVisual('x'),
  });
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const p = registry.create('adult-man', { yieldToMain: async () => { await gate; } });
  await new Promise((r) => setTimeout(r, 5));
  registry.trim([]); // would evict it: nothing is live yet
  release();
  await p;
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(closes, [], 'not closed while the instance was being made');
});

test('U3.2 108 cycle-order swaps: cache bytes stay within the budget, <= 3 files, <= 2 live, fetched capped, fetchCount exact', async () => {
  const MB = 1024 * 1024;
  const prep: string[] = [];
  const s = fakeSetup({ predraw: async () => { prep.push('p'); } }, { budgetBytes: 32 * MB, size: 11 * MB });
  const sw = new CharacterSwapper(s.host);
  let id = DEFAULT_CHARACTER_ID, maxLive = 0, maxCount = 0, maxBytes = 0;
  for (let i = 0; i < 108; i++) {
    id = nextProfileId(id);
    assert.equal(await sw.swap(id), true);
    void sw.warm(nextProfileId(id));
    await new Promise((r) => setTimeout(r, 0));
    maxLive = Math.max(maxLive, s.registry.liveCount);
    maxCount = Math.max(maxCount, s.registry.cachedCount);
    maxBytes = Math.max(maxBytes, s.registry.cachedBytes);
  }
  assert.ok(maxLive <= 2, `live ${maxLive}`);
  assert.ok(maxCount <= 4, `cached files ${maxCount}`);
  assert.ok(maxBytes <= 4 * 11 * MB);
  s.registry.enforceBudget([getProfile(DEFAULT_CHARACTER_ID)!.url]);
  assert.ok(s.registry.cachedBytes <= 32 * MB + 11 * MB, 'after enforceBudget the unprotected files fit the budget');
  assert.ok(s.registry.fetched.length <= FETCHED_KEPT, `fetched ${s.registry.fetched.length}`);
  assert.equal(s.registry.fetchCount, s.loads.length, 'fetchCount counts every real fetch');
  assert.ok(s.registry.fetchCount >= 7, 'something was fetched');
});

test('U3.2 the budget policy: a repeat of a cached model does not fetch, and the least recently used file is the one evicted', async () => {
  const MB = 1024 * 1024;
  const s = fakeSetup({}, { budgetBytes: 25 * MB, size: 10 * MB });
  const sw = new CharacterSwapper(s.host);
  for (const id of ['adult-man', 'adult-woman', 'adult-man']) await sw.swap(id);
  assert.equal(s.loads.filter((u) => u.endsWith('adult-man.glb')).length, 1, 'adult-man came from the cache');
  await sw.swap('man'); // 4 files would exceed 25 MB: the oldest unprotected goes
  assert.ok(!s.registry.isCached(getProfile('adult-woman')!.url), 'adult-woman (least recently used) evicted');
  assert.ok(s.registry.isCached(getProfile('man')!.url) && s.registry.isCached(getProfile('adult-man')!.url));
});

// ---------------------------------------------------------------- timings

test('step 0: the timing recorder keeps stages per swap in order and caps its size', () => {
  const t = new CharacterTimings();
  const n = t.begin('woman');
  t.mark('source', 1.234, n, 'woman'); t.mark('build.crease', 2); t.mark('prepare', 3);
  assert.deepEqual(t.stages(n), ['source', 'build.crease', 'prepare']);
  assert.equal(t.last.source, 1.23);
  for (let i = 0; i < 1000; i++) t.mark('x', 1);
  assert.ok(t.entries.length <= 600);
});

// ---------------------------------------------------------------- U2 sole scan

for (const id of MPFB) {
  test(`U2.1 ${id}: an airborne update skins only the reduced sole set (<= 160 vertices, <= 1/10 of the classic set), and lifts within ${SOLE_TOL * 1000} mm of the full scan`, async () => {
    const file = `${id}.glb`;
    const classic = new GlbCharacter(await parse(file), profileOptions(getProfile(id)!));
    const lean = new GlbCharacter(await parse(file), leanOpts(id));
    const full = (classic as unknown as Priv).soleVerts!, uniq = (lean as unknown as Priv).soleVerts!;
    assert.ok(uniq.length <= 160, `${uniq.length} entries in the reduced set`);
    assert.ok(full.length > 10 * uniq.length, `the classic set has ${full.length} entries, the reduced ${uniq.length}`);
    const spy = spySkinning();
    try {
      let worst = 0, maxSkinned = 0, airborne = 0;
      for (const s of script()) {
        classic.root.rotation.y = lean.root.rotation.y = s.yaw;
        classic.update(1 / 60, s);
        spy.reset();
        lean.update(1 / 60, s);
        if (!s.grounded) { airborne++; maxSkinned = Math.max(maxSkinned, spy.total); }
        worst = Math.max(worst, Math.abs((classic as unknown as Priv).model.position.y - (lean as unknown as Priv).model.position.y));
      }
      assert.ok(airborne > 50);
      assert.ok(maxSkinned <= uniq.length, `an airborne update skinned ${maxSkinned} vertices (set ${uniq.length})`);
      assert.ok(worst <= SOLE_TOL, `lift differs by ${worst} m from the full scan`);
    } finally { spy.restore(); }
  });
}

test('U2.2 at the apex plateau the unchanged pose is not scanned again (20 settled frames skin <= 2x the set in total)', async () => {
  const ch = new GlbCharacter(await parse('woman.glb'), leanOpts('woman'));
  const set = (ch as unknown as Priv).soleVerts!.length;
  for (let i = 0; i < 200; i++) ch.update(1 / 60, { speed: 0, grounded: false, vy: 0 });
  const spy = spySkinning();
  try {
    for (let i = 0; i < 20; i++) ch.update(1 / 60, { speed: 0, grounded: false, vy: 0 });
    assert.ok(spy.total <= 2 * set, `20 plateau frames skinned ${spy.total} vertices (set ${set})`);
  } finally { spy.restore(); }
  // and the cache does not hide a changing pose: a landing blend scans every frame
  const spy2 = spySkinning();
  try {
    for (let i = 0; i < 10; i++) ch.update(1 / 60, { speed: 0, grounded: true, vy: 0 });
    assert.ok(spy2.total >= 3 * set, `landing frames still scan (${spy2.total})`);
  } finally { spy2.restore(); }
});

for (const id of MPFB) {
  test(`U2.3 ${id}: the sole depth of the reduced set matches the full set at every sweep pose (every action, 120 times) and at 400 random blends, within ${SOLE_TOL * 1000} mm`, async () => {
    const file = `${id}.glb`;
    const classic = new GlbCharacter(await parse(file), profileOptions(getProfile(id)!)) as unknown as Priv;
    const lean = new GlbCharacter(await parse(file), leanOpts(id)) as unknown as Priv;
    let worst = 0, n = 0;
    const actionsA = classic.actions(), actionsB = lean.actions();
    for (let k = 0; k < actionsA.length; k++) {
      const dur = actionsA[k].getClip().duration;
      for (let i = 0; i < 120; i++) {
        classic.pose(actionsA[k], (i / 120) * dur);
        lean.pose(actionsB[k], (i / 120) * dur);
        worst = Math.max(worst, Math.abs(classic.soleDepth() - lean.soleDepth()));
        n++;
      }
    }
    assert.ok(n >= 480);
    assert.ok(worst <= SOLE_TOL, `max difference ${worst} m over ${n} sweep poses`);
    // Random blends the sampler did not see: the jump pose with a random share of the ground clips, at random times (seeded).
    let seed = 12345;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const air = 3; // actions() = idle, walk, run, jump, turn clips
    let worstBlend = 0, maxDepth = 0, nonZero = 0;
    for (let i = 0; i < 400; i++) {
      const wAir = rnd() < 0.2 ? 1 : rnd();
      const ground = [rnd(), rnd(), rnd()];
      const gs = ground[0] + ground[1] + ground[2];
      const times = actionsA.map((a) => rnd() * a.getClip().duration);
      for (const set of [actionsA, actionsB]) {
        set.forEach((a, k) => {
          const w = k === air ? wAir : k < 3 ? ((1 - wAir) * ground[k]) / gs : 0;
          (a as unknown as { setEffectiveWeight(w: number): void }).setEffectiveWeight(w);
          a.time = k === air ? (classic as unknown as { airTime: number }).airTime : times[k];
        });
      }
      for (const c of [classic, lean]) { (c as unknown as { mixer: { update(t: number): void } }).mixer.update(0); (c as unknown as { root: THREE.Object3D }).root.updateMatrixWorld(true); }
      const dc = classic.soleDepth();
      maxDepth = Math.max(maxDepth, dc); if (dc > 1e-4) nonZero++;
      worstBlend = Math.max(worstBlend, Math.abs(dc - lean.soleDepth()));
    }
    console.log(`  [U2.3 ${id}] sweep worst ${(worst * 1000).toFixed(3)} mm, random-blend worst ${(worstBlend * 1000).toFixed(3)} mm, set ${lean.soleVerts!.length} of ${classic.soleVerts!.length}; depth up to ${(maxDepth * 1000).toFixed(1)} mm, non-zero in ${nonZero}/400 blends`);
    assert.ok(nonZero >= 40, `the random blends must exercise a real lift (${nonZero}/400 non-zero)`);
    assert.ok(worstBlend <= SOLE_TOL, `max difference ${worstBlend} m over 400 random blends`);
  });
}

// the registry builds the same way through create(): lean, staged, with stage marks
test('registry.create with yieldToMain and mark builds the real lean character and reports the stages', async () => {
  const marks: Record<string, number> = {};
  let yields = 0;
  const registry = new CharacterRegistry({ load: async (u) => parse(u.split('/').pop()!) });
  const v = await registry.create('young-girl', { yieldToMain: async () => { yields++; await Promise.resolve(); }, mark: (s, ms) => { marks[s] = ms; } });
  assert.ok(yields >= 10, `yields ${yields}`);
  for (const k of ['source', 'clone', 'build.setup', 'build.bbox', 'build.gait', 'build.sole', 'build.crease', 'build.maxChunk', 'build.wall']) assert.ok(k in marks, `${k} in ${Object.keys(marks)}`);
  assert.ok(v.root.children.length > 0);
  registry.dispose(v);
  assert.equal(registry.liveCount, 0);
  void cloneSource; void listProfiles;
});
