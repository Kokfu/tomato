// CHAR-P2a: character profiles, registry, swapper, body visibility and GlbCharacter options (node --test).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  CHARACTER_PROFILES, CHARACTER_STORAGE_KEY, DEFAULT_CHARACTER_ID, EYE_RATIO, PIVOT_RATIO, cameraHeights, getProfile,
  listProfiles, loadSavedCharacter, nextProfileId, resolveStartCharacter, saveCharacter,
} from '../../src/player/character/CharacterProfile.ts';
import { CharacterRegistry } from '../../src/player/character/CharacterRegistry.ts';
import { CharacterSwapper } from '../../src/player/character/swap.ts';
import type { SwapHost } from '../../src/player/character/swap.ts';
import { bodyVisible } from '../../src/player/character/visibility.ts';
import { GlbCharacter, CHARACTER_HEIGHT, findClipByName } from '../../src/player/GlbCharacter.ts';
import type { CharacterVisual } from '../../src/player/CharacterAnimator.ts';

// ---------------------------------------------------------------- profiles

test('every profile has a unique id, a url, a positive height and camera heights below the head', () => {
  const ids = new Set<string>();
  for (const p of CHARACTER_PROFILES) {
    assert.ok(!ids.has(p.id), `duplicate ${p.id}`);
    ids.add(p.id);
    assert.ok(p.url.endsWith('.glb'));
    assert.ok(p.heightM > 1 && p.heightM < 2.2);
    assert.ok(p.eyeHeight < p.heightM && p.pivotHeight < p.eyeHeight, `${p.id} camera heights`);
    assert.ok(p.licence.length > 0);
  }
  assert.ok(getProfile(DEFAULT_CHARACTER_ID));
});

test('the default profile reproduces the pre-CHAR camera exactly (pivot 1.52, eye 1.62 at 1.72 m)', () => {
  const d = getProfile(DEFAULT_CHARACTER_ID)!;
  assert.equal(d.heightM, CHARACTER_HEIGHT);
  assert.equal(d.pivotHeight, 1.52);
  assert.equal(d.eyeHeight, 1.62);
  assert.equal(d.url, 'models/characters/casual-character.glb');
  const c = cameraHeights(1.72);
  assert.ok(Math.abs(c.pivot - 1.52) < 0.001 && Math.abs(c.eye - 1.62) < 0.001);
});

test('other profiles scale the camera heights with their height', () => {
  const w = getProfile('adult-woman')!;
  assert.ok(Math.abs(w.pivotHeight - PIVOT_RATIO * w.heightM) < 1e-3);
  assert.ok(Math.abs(w.eyeHeight - EYE_RATIO * w.heightM) < 1e-3);
});

test('dev-only profiles are reachable by id but not offered by the cycle', () => {
  assert.ok(getProfile('test-short'));
  assert.ok(!listProfiles().some((p) => p.id === 'test-short'));
  // CHAR-P5 G2 (owner D3-D5, item 9): the two retired Rocketbox test characters are not in the cycle any more.
  assert.ok(!listProfiles().some((p) => p.id === 'adult-man' || p.id === 'adult-woman'));
  assert.equal(nextProfileId(DEFAULT_CHARACTER_ID), 'man');
  assert.equal(nextProfileId('woman'), 'teen-boy');
  assert.equal(nextProfileId('young-girl'), DEFAULT_CHARACTER_ID);
  assert.equal(nextProfileId('adult-woman'), DEFAULT_CHARACTER_ID); // a retired id is not in the cycle: back to the first
  assert.equal(nextProfileId('nonsense'), DEFAULT_CHARACTER_ID);
});

test('resolveStartCharacter: no flag is dormant, the flag selects, invalid ids fall back', () => {
  assert.deepEqual(resolveStartCharacter('?char=0', 'man'), { id: 'default', flag: false, persist: false, invalid: null, needsPick: false }); // N1-M1: ?char=0 is the old no-flag game
  assert.deepEqual(resolveStartCharacter('?char=0&quality=low', null), { id: 'default', flag: false, persist: false, invalid: null, needsPick: false });
  assert.deepEqual(resolveStartCharacter('', 'man'), { id: 'man', flag: true, persist: false, invalid: null, needsPick: false }); // on by default
  assert.deepEqual(resolveStartCharacter('?char=adult-woman', null), { id: 'adult-woman', flag: true, persist: true, invalid: null, needsPick: false }); // developer link: any profile
  assert.deepEqual(resolveStartCharacter('?char=teen-girl', null), { id: 'teen-girl', flag: true, persist: true, invalid: null, needsPick: false });
  // bare flag: use the saved choice (one of the six), nothing to persist
  assert.deepEqual(resolveStartCharacter('?char', 'woman'), { id: 'woman', flag: true, persist: false, invalid: null, needsPick: false });
  // invalid asked id: the saved choice if it is selectable, else the picker (first launch)
  assert.deepEqual(resolveStartCharacter('?char=zzz', 'young-boy'), { id: 'young-boy', flag: true, persist: false, invalid: 'zzz', needsPick: false });
  assert.deepEqual(resolveStartCharacter('?char=zzz', 'old-removed-id'), { id: 'default', flag: true, persist: false, invalid: 'zzz', needsPick: true });
  assert.deepEqual(resolveStartCharacter('?char', 'old-removed-id'), { id: 'default', flag: true, persist: false, invalid: null, needsPick: true });
  assert.deepEqual(resolveStartCharacter('?char', null), { id: 'default', flag: true, persist: false, invalid: null, needsPick: true });
  // a retired Rocketbox prototype, the default model and the dev profile are no longer restored from a saved choice
  for (const old of ['adult-man', 'adult-woman', 'default', 'test-short']) {
    assert.deepEqual(resolveStartCharacter('?char', old), { id: 'default', flag: true, persist: false, invalid: null, needsPick: true }, old);
  }
});

test('character storage uses the k3d.* try/catch pattern', () => {
  const mem = new Map<string, string>();
  const st = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
  assert.equal(loadSavedCharacter(st), null);
  saveCharacter('adult-man', st);
  assert.equal(mem.get(CHARACTER_STORAGE_KEY), 'adult-man');
  assert.equal(loadSavedCharacter(st), 'adult-man');
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.equal(loadSavedCharacter(broken), null);
  assert.doesNotThrow(() => saveCharacter('x', broken));
  assert.equal(loadSavedCharacter(null), null);
  assert.doesNotThrow(() => saveCharacter('x', null));
});

// ---------------------------------------------------------------- body visibility

test('bodyVisible truth table', () => {
  for (const firstPerson of [false, true]) {
    for (const flying of [false, true]) {
      // driving always hides the body
      assert.equal(bodyVisible({ firstPerson, driving: true, flying }), false);
    }
  }
  assert.equal(bodyVisible({ firstPerson: false, driving: false, flying: false }), true);
  assert.equal(bodyVisible({ firstPerson: true, driving: false, flying: false }), false);
  assert.equal(bodyVisible({ firstPerson: false, driving: false, flying: true }), true);
  assert.equal(bodyVisible({ firstPerson: true, driving: false, flying: true }), true);
});

// ---------------------------------------------------------------- registry + swapper with fakes

interface FakeVisual extends CharacterVisual { tag: string; disposed: boolean }
function fakeVisual(tag: string): FakeVisual {
  const root = new THREE.Group();
  return { tag, disposed: false, root, update() {}, pose() {}, dispose() { (this as FakeVisual).disposed = true; } } as unknown as FakeVisual;
}
const fakeSrc = () => ({ scene: new THREE.Group(), animations: [] as THREE.AnimationClip[] });

function fakeRegistry(opts: { failUrls?: Set<string> } = {}) {
  const loads: string[] = [];
  const registry = new CharacterRegistry({
    load: async (url) => { loads.push(url); if (opts.failUrls?.has(url)) throw new Error('404 ' + url); return fakeSrc(); },
    build: async (_src, o) => fakeVisual(String(o.height)),
  });
  return { registry, loads };
}

test('registry: one parse per url, independent instances, failures are not cached', async () => {
  const fail = new Set<string>(['models/characters/adult-man.glb']);
  const { registry, loads } = fakeRegistry({ failUrls: fail });
  const a = await registry.create('default');
  const b = await registry.create('default');
  assert.notEqual(a, b);
  assert.equal(loads.length, 1);
  assert.equal(registry.liveCount, 2);
  await assert.rejects(registry.create('adult-man'));
  fail.clear();
  await registry.create('adult-man');
  assert.equal(loads.filter((u) => u.endsWith('adult-man.glb')).length, 2, 'failed load retried');
  registry.dispose(a);
  assert.equal((a as FakeVisual).disposed, true);
  assert.equal((b as FakeVisual).disposed, false);
  assert.equal(registry.liveCount, 2);
  await assert.rejects(registry.create('nope'));
});

test('registry.trim drops cached files nobody uses and keeps live ones', async () => {
  const { registry } = fakeRegistry();
  const a = await registry.create('adult-man');
  await registry.create('default');
  registry.trim([]);
  assert.equal(registry.isCached('models/characters/adult-man.glb'), true, 'live instance keeps its source');
  registry.dispose(a);
  registry.trim([getProfile('default')!.url]);
  assert.equal(registry.isCached('models/characters/adult-man.glb'), false);
  assert.equal(registry.isCached(getProfile('default')!.url), true);
});

function swapHost(registry: CharacterRegistry, over: Partial<SwapHost> = {}) {
  const state = { current: fakeVisual('humanoid') as CharacterVisual, warns: [] as string[], camera: [] as string[], syncs: 0, saved: [] as string[], installs: 0 };
  const host: SwapHost = {
    registry,
    install: (next) => { const old = state.current; state.current = next; state.installs++; return old; },
    prepare: async () => {},
    applyCamera: (p) => void state.camera.push(p.id),
    syncBody: () => void state.syncs++,
    warn: (m) => void state.warns.push(m),
    persist: (id) => void state.saved.push(id),
    ...over,
  };
  return { host, state };
}

test('swapper: installs, disposes the old model, applies camera + body rule and persists on request', async () => {
  const { registry } = fakeRegistry();
  const { host, state } = swapHost(registry);
  const humanoid = state.current as FakeVisual;
  const sw = new CharacterSwapper(host);
  assert.equal(await sw.swap('adult-man', { persist: true }), true);
  assert.equal(sw.currentId, 'adult-man');
  assert.equal(sw.usingFallback, false);
  assert.equal(humanoid.disposed, true);
  assert.deepEqual(state.camera, ['adult-man']);
  assert.equal(state.syncs, 1);
  assert.deepEqual(state.saved, ['adult-man']);
  // same id again is a no-op that does not install
  assert.equal(await sw.swap('adult-man'), true);
  assert.equal(state.installs, 1);
  // not persisted when the caller does not ask
  await sw.swap('adult-woman');
  assert.deepEqual(state.saved, ['adult-man']);
  assert.equal(registry.liveCount, 1, 'only the current model is live');
});

test('swapper: a broken profile warns once and restores the default', async () => {
  const { registry } = fakeRegistry({ failUrls: new Set(['models/characters/adult-man.glb']) });
  const { host, state } = swapHost(registry);
  const sw = new CharacterSwapper(host);
  assert.equal(await sw.swap('adult-man', { persist: true }), false);
  assert.equal(state.warns.length, 1);
  assert.equal(sw.currentId, 'default');
  assert.deepEqual(state.camera, ['default']);
  assert.deepEqual(state.saved, [], 'a failed choice is not persisted');
  // already on default: another failure leaves it alone with a single warning
  assert.equal(await sw.swap('adult-man'), false);
  assert.equal(state.warns.length, 2);
  assert.equal(state.installs, 1);
});

test('swapper: unknown id and a failing default never leave the player without a model', async () => {
  const { registry } = fakeRegistry({ failUrls: new Set([getProfile('default')!.url, 'models/characters/adult-man.glb']) });
  const { host, state } = swapHost(registry);
  const humanoid = state.current as FakeVisual;
  const sw = new CharacterSwapper(host);
  assert.equal(await sw.swap('nonsense'), false);
  assert.equal(await sw.swap('adult-man'), false);
  assert.equal(state.current, humanoid);
  assert.equal(humanoid.disposed, false);
  assert.equal(sw.usingFallback, true);
  assert.equal(state.warns.length, 2);
});

test('swapper: a stale swap is thrown away and disposed', async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const built: FakeVisual[] = [];
  const registry = new CharacterRegistry({
    load: async () => fakeSrc(),
    build: async (_s, o) => { if (o.height === 1.7) await gate; const v = fakeVisual(String(o.height)); built.push(v); return v; },
  });
  const { host, state } = swapHost(registry);
  const sw = new CharacterSwapper(host);
  const slow = sw.swap('adult-man'); // 1.70, blocked
  const fast = sw.swap('adult-woman'); // 1.58, newer
  assert.equal(await fast, true);
  release();
  assert.equal(await slow, false);
  assert.equal(sw.currentId, 'adult-woman');
  assert.equal(state.installs, 1);
  assert.equal(built.find((v) => v.tag === '1.7')!.disposed, true);
  assert.equal(registry.liveCount, 1);
});

test('swapper: compile:false skips prepare (the no-flag path stays as before)', async () => {
  const { registry } = fakeRegistry();
  let prepared = 0;
  const { host } = swapHost(registry, { prepare: async () => { prepared++; } });
  const sw = new CharacterSwapper(host);
  await sw.swap('default', { compile: false });
  assert.equal(prepared, 0);
  await sw.swap('adult-man');
  assert.equal(prepared, 1);
});

test('swapper: a prepare failure disposes the new model and falls back', async () => {
  const { registry } = fakeRegistry();
  let n = 0;
  const { host, state } = swapHost(registry, { prepare: async () => { if (n++ === 0) throw new Error('compile failed'); } });
  const sw = new CharacterSwapper(host);
  assert.equal(await sw.swap('adult-woman'), false);
  assert.equal(sw.currentId, 'default');
  assert.equal(state.warns.length, 1);
  assert.equal(registry.liveCount, 1);
});

test('regression: a model that finishes loading while driving (or flying) stays hidden', async () => {
  // The old load handler set `visible = !firstPerson`, so a model arriving in the car became visible inside it.
  const { registry } = fakeRegistry();
  const flags = { firstPerson: false, driving: true, flying: false };
  const holder = { visual: fakeVisual('humanoid') as CharacterVisual };
  const syncBody = () => { holder.visual.root.visible = bodyVisible(flags); };
  const { host } = swapHost(registry, {
    install: (next) => { const old = holder.visual; next.root.visible = true; holder.visual = next; return old; },
    syncBody,
  });
  const sw = new CharacterSwapper(host);
  await sw.swap('adult-man');
  assert.equal(holder.visual.root.visible, false, 'hidden in the car');
  flags.driving = false;
  syncBody();
  assert.equal(holder.visual.root.visible, true);
  flags.firstPerson = true;
  await sw.swap('adult-woman');
  assert.equal(holder.visual.root.visible, false, 'hidden in first person');
  flags.flying = true;
  await sw.swap('default');
  assert.equal(holder.visual.root.visible, true, 'avatar shown in OP fly mode');
});

// ---------------------------------------------------------------- GlbCharacter options

async function loadModel() {
  const buf = readFileSync(new URL('../../public/models/characters/casual-character.glb', import.meta.url));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  return new GLTFLoader().parseAsync(ab, '');
}
function heightOf(root: THREE.Object3D): { min: number; max: number } {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  root.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) box.expandByObject(o); });
  return { min: box.min.y, max: box.max.y };
}

test('GlbCharacter: the one-argument constructor (pedestrians) still yields the 1.72 m default', async () => {
  const ch = new GlbCharacter(await loadModel());
  const h = heightOf(ch.root);
  assert.ok(Math.abs(h.max - h.min - CHARACTER_HEIGHT) < 0.05, `height ${h.max - h.min}`);
  assert.ok(Math.abs(h.min) < 0.05);
});

test('GlbCharacter: opts.height normalises to the profile height with the feet on the ground', async () => {
  const ch = new GlbCharacter(await loadModel(), { height: 1.3 });
  const h = heightOf(ch.root);
  assert.ok(Math.abs(h.max - h.min - 1.3) < 0.05, `height ${h.max - h.min}`);
  assert.ok(Math.abs(h.min) < 0.05);
});

test('findClipByName matches exact names; GlbCharacter falls back to the word search for a missing name', async () => {
  const clips = ['Armature|Idle', 'Man_Walk', 'Man_Run'].map((n) => new THREE.AnimationClip(n, 1, []));
  assert.equal(findClipByName(clips, 'Man_Walk')?.name, 'Man_Walk');
  assert.equal(findClipByName(clips, 'nope'), null);
  assert.equal(findClipByName(clips, undefined), null);
  const gltf = await loadModel();
  assert.doesNotThrow(() => new GlbCharacter(gltf, { clips: { idle: 'no-such-clip' } }));
});

test('cloneSource keeps one skeleton per glTF skin (not one per mesh) and its own materials', async () => {
  const gltf = await loadModel();
  const skeletons = (root: THREE.Object3D) => { const s = new Set<THREE.Skeleton>(); root.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) s.add((o as THREE.SkinnedMesh).skeleton); }); return s; };
  const meshes = (root: THREE.Object3D) => { let n = 0; root.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) n++; }); return n; };
  const { cloneSource } = await import('../../src/player/character/CharacterRegistry.ts');
  const c = await cloneSource(gltf);
  assert.equal(meshes(c.scene), meshes(gltf.scene));
  assert.equal(skeletons(c.scene).size, skeletons(gltf.scene).size);
  for (const sk of skeletons(c.scene)) assert.ok(!skeletons(gltf.scene).has(sk), 'the clone has its own skeleton');
  const m0 = (o: THREE.Object3D) => { let m: THREE.Material | null = null; o.traverse((x) => { if (!m && (x as THREE.Mesh).isMesh) m = (x as THREE.Mesh).material as THREE.Material; }); return m; };
  assert.notEqual(m0(c.scene), m0(gltf.scene));
});

// ---------------------------------------------------------------- shipped Rocketbox adults

function glbJson(path: string): { animations: { name: string }[]; nodes: { name?: string }[]; skins: { joints: number[] }[]; materials: { name: string; alphaMode?: string; doubleSided?: boolean }[]; textures?: unknown[]; images?: unknown[] } {
  const b = readFileSync(path);
  assert.equal(b.readUInt32LE(0), 0x46546c67, 'glTF magic');
  return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8'));
}

for (const id of ['adult-man', 'adult-woman'] as const) {
  test(`${id}: the shipped GLB has the profile's clips, its foot bones and cut-out hair; the MIT notice ships beside it`, () => {
    const p = getProfile(id)!;
    const j = glbJson(`public/${p.url}`);
    const clips = j.animations.map((a) => a.name);
    for (const role of ['idle', 'walk', 'run', 'turnL', 'turnR'] as const) assert.ok(clips.includes(p.clips[role]!), `${id} clip ${role}=${p.clips[role]} in [${clips}]`);
    assert.equal(p.turnInPlace, true);
    // three.js sanitises node names (spaces become underscores): the profile must name the sanitised bones.
    const bones = new Set(j.skins[0].joints.map((i) => THREE.PropertyBinding.sanitizeNodeName(j.nodes[i].name ?? '')));
    for (const f of p.feet!) assert.ok(bones.has(f), `${id} foot bone ${f}`);
    assert.equal(j.skins.length, 1);
    const hair = j.materials.find((m) => /Hair/.test(m.name))!;
    assert.equal(hair.alphaMode, 'MASK');
    assert.equal(hair.doubleSided, true);
    const lic = readFileSync('public/models/characters/LICENSE-rocketbox.txt', 'utf8');
    assert.match(lic, /MIT License/);
    assert.match(lic, /Copyright \(c\) 2020 Microsoft/);
  });
}

// CHAR-P4: the six MakeHuman/MPFB characters.
const MPFB = [['man', 1.707], ['woman', 1.589], ['teen-boy', 1.666], ['teen-girl', 1.572], ['young-boy', 1.294], ['young-girl', 1.277]] as const;
test('CHAR-P4: the six MPFB profiles exist, in the cycle, with their own file, height and the Jump clip as the airborne pose', () => {
  for (const [id, h] of MPFB) {
    const p = getProfile(id)!;
    assert.ok(p, id);
    assert.equal(p.url, `models/characters/${id}.glb`);
    assert.equal(p.heightM, h);
    assert.equal(p.clips.airborne, 'Jump');
    assert.equal(p.licence, 'CC0-1.0+MIT-Rocketbox-clips');
    assert.ok(!p.dev && listProfiles().some((q) => q.id === id));
  }
  assert.deepEqual(MPFB.map(([id]) => getProfile(id)!.label), ['Adult Man', 'Adult Woman', 'Teen Boy', 'Teen Girl', 'Young Boy', 'Young Girl']);
});

for (const [id] of MPFB) {
  test(`${id}: the shipped GLB has the profile's clips (incl. Jump), foot_l/foot_r, one skin, two materials (cut-out hair) and two textures`, () => {
    const p = getProfile(id)!;
    const j = glbJson(`public/${p.url}`);
    const clips = j.animations.map((a) => a.name);
    for (const role of ['idle', 'walk', 'run', 'turnL', 'turnR', 'airborne'] as const) assert.ok(clips.includes(p.clips[role]!), `${id} clip ${role}=${p.clips[role]} in [${clips}]`);
    const bones = new Set(j.skins[0].joints.map((i) => THREE.PropertyBinding.sanitizeNodeName(j.nodes[i].name ?? '')));
    for (const f of p.feet!) assert.ok(bones.has(f), `${id} foot bone ${f}`);
    assert.equal(j.skins.length, 1);
    const hair = j.materials.find((m) => /Hair/.test(m.name))!;
    assert.equal(hair.alphaMode, 'MASK');
    assert.equal(hair.doubleSided, true);
    assert.equal(j.materials.length, 2);
    assert.equal(j.textures?.length, 2, `${id}: textures`);
    assert.equal(j.images?.length, 2, `${id}: images`);
    assert.ok(readFileSync(`public/${p.url}`).length < 1_500_000, 'size budget');
  });
}

// ---------------------------------------------------------------- review fixes (F1-F5, F8)

test('F1: setVisual keeps the rendered facing for every heading (no mirrored yaw past 90 degrees)', async () => {
  const { PlayerController } = await import('../../src/player/PlayerController.ts');
  const facing = (root: THREE.Object3D) => {
    root.updateMatrixWorld(true);
    return new THREE.Vector3(0, 0, 1).applyMatrix4(root.matrixWorld).sub(new THREE.Vector3().setFromMatrixPosition(root.matrixWorld));
  };
  for (const heading of [Math.PI, 2.5, 1.2, -2.0, -Math.PI + 0.01, 0]) {
    const old = fakeVisual('old');
    const p = new PlayerController({} as never, old);
    p.heading = heading;
    old.root.rotation.y = heading; // what update() leaves on the old root
    const next = fakeVisual('next');
    p.setVisual(next, { disposeOld: false });
    // The character's forward axis is +Z in its own frame: rendered facing = (sin h, 0, cos h).
    let f = facing(next.root);
    assert.ok(Math.abs(f.x - Math.sin(heading)) < 1e-9 && Math.abs(f.z - Math.cos(heading)) < 1e-9, `heading ${heading}: facing ${f.x.toFixed(3)},${f.z.toFixed(3)}`);
    // update() writes only rotation.y afterwards: the result must be the same yaw again.
    next.root.rotation.y = heading;
    f = facing(next.root);
    assert.ok(Math.abs(f.x - Math.sin(heading)) < 1e-9 && Math.abs(f.z - Math.cos(heading)) < 1e-9);
  }
});

test('F2: the direct (no-flag) path loads with loadDirect only: no parse cache, no clone', async () => {
  const calls: string[] = [];
  const registry = new CharacterRegistry({
    load: async (u) => { calls.push('load ' + u); return fakeSrc(); },
    build: async (_s, o) => { calls.push('build'); return fakeVisual(String(o.height)); },
    loadDirect: async (u, o) => { calls.push('direct ' + u); return fakeVisual(String(o.height)); },
  });
  const v = await registry.create('default', { direct: true });
  assert.deepEqual(calls, ['direct models/characters/casual-character.glb']);
  assert.equal(registry.isCached('models/characters/casual-character.glb'), false);
  assert.equal(registry.liveCount, 1);
  assert.deepEqual(registry.fetched, ['models/characters/casual-character.glb']);
  registry.dispose(v);
  assert.equal(registry.liveCount, 0);
});

test('F2: the swapper uses the direct path only when asked (no-flag start) and installs through the usual step', async () => {
  const seen: boolean[] = [];
  const registry = new CharacterRegistry({
    load: async () => fakeSrc(),
    build: async (_s, o) => { seen.push(false); return fakeVisual(String(o.height)); },
    loadDirect: async (_u, o) => { seen.push(true); return fakeVisual(String(o.height)); },
  });
  const { host, state } = swapHost(registry);
  const sw = new CharacterSwapper(host);
  assert.equal(await sw.swap('default', { compile: false, direct: true }), true);
  assert.equal(state.installs, 1);
  assert.equal(state.syncs, 1);
  await sw.swap('adult-man');
  assert.deepEqual(seen, [true, false]);
});

test('F3: an unknown id while a swap is loading does not cancel it, and loading is clear at the end', async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const registry = new CharacterRegistry({
    load: async () => fakeSrc(),
    build: async (_s, o) => { if (o.height === 1.7) await gate; return fakeVisual(String(o.height)); },
  });
  const { host } = swapHost(registry);
  const sw = new CharacterSwapper(host);
  const slow = sw.swap('adult-man');
  assert.equal(sw.loading, true);
  assert.equal(await sw.swap('no-such-character'), false);
  assert.equal(sw.loading, true, 'the pending swap is still pending');
  release();
  assert.equal(await slow, true, 'the pending choice still wins');
  assert.equal(sw.currentId, 'adult-man');
  assert.equal(sw.loading, false);
});

test('F3: asking for the model already on screen drops a pending swap and clears loading at once', async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const built: FakeVisual[] = [];
  const registry = new CharacterRegistry({
    load: async () => fakeSrc(),
    build: async (_s, o) => { if (o.height === 1.7) await gate; const v = fakeVisual(String(o.height)); built.push(v); return v; },
  });
  const { host, state } = swapHost(registry);
  const sw = new CharacterSwapper(host);
  assert.equal(await sw.swap('default'), true);
  const slow = sw.swap('adult-man');
  assert.equal(sw.loading, true);
  assert.equal(await sw.swap('default'), true);
  assert.equal(sw.loading, false, 'loading cleared by the call that superseded the pending swap');
  release();
  assert.equal(await slow, false);
  assert.equal(sw.loading, false);
  assert.equal(sw.currentId, 'default');
  assert.equal(state.installs, 1);
  assert.equal(built.find((v) => v.tag === '1.7')!.disposed, true, 'the dropped model is disposed');
  assert.equal(registry.liveCount, 1);
});

test('F3: loading stays true until the newest of two overlapping swaps finishes', async () => {
  let releaseA!: () => void, releaseB!: () => void;
  const gateA = new Promise<void>((r) => { releaseA = r; });
  const gateB = new Promise<void>((r) => { releaseB = r; });
  const registry = new CharacterRegistry({
    load: async () => fakeSrc(),
    build: async (_s, o) => { await (o.height === 1.7 ? gateA : gateB); return fakeVisual(String(o.height)); },
  });
  const { host } = swapHost(registry);
  const sw = new CharacterSwapper(host);
  const a = sw.swap('adult-man');
  const b = sw.swap('adult-woman');
  releaseA();
  assert.equal(await a, false);
  assert.equal(sw.loading, true, 'the older swap finishing does not clear the newer one');
  releaseB();
  assert.equal(await b, true);
  assert.equal(sw.loading, false);
});

test('F4: a superseded failure does not load or prepare the default fallback', async () => {
  let releaseFail!: () => void;
  const gate = new Promise<void>((r) => { releaseFail = r; });
  const loads: string[] = [];
  let prepared = 0;
  const registry = new CharacterRegistry({
    load: async (u) => { loads.push(u); if (u.endsWith('adult-man.glb')) { await gate; throw new Error('404'); } return fakeSrc(); },
    build: async (_s, o) => fakeVisual(String(o.height)),
  });
  const { host, state } = swapHost(registry, { prepare: async () => { prepared++; } });
  const sw = new CharacterSwapper(host);
  const failing = sw.swap('adult-man');
  assert.equal(await sw.swap('adult-woman'), true);
  const preparedBefore = prepared;
  releaseFail();
  assert.equal(await failing, false);
  assert.equal(loads.filter((u) => u.endsWith('casual-character.glb')).length, 0, 'default never fetched');
  assert.equal(prepared, preparedBefore);
  assert.equal(state.warns.length, 0, 'a superseded failure is silent');
  assert.equal(sw.currentId, 'adult-woman');
  assert.equal(sw.loading, false);
});

test('F8: a failing default says so (no "falling back to default" for the default itself)', async () => {
  const { registry } = fakeRegistry({ failUrls: new Set([getProfile('default')!.url]) });
  const { host, state } = swapHost(registry);
  const sw = new CharacterSwapper(host);
  assert.equal(await sw.swap('default'), false);
  assert.equal(state.warns.length, 1);
  assert.match(state.warns[0], /unavailable, using procedural humanoid/);
  assert.doesNotMatch(state.warns[0], /falling back to "default"/);
});

test('F5: the parsed cache keeps the default and the last two profiles; revisits do not fetch again', async () => {
  const { registry, loads } = fakeRegistry();
  const { host } = swapHost(registry);
  const sw = new CharacterSwapper(host);
  for (const id of ['adult-man', 'adult-woman', 'default', 'adult-man', 'adult-woman', 'adult-man', 'default']) assert.equal(await sw.swap(id), true);
  const count = (f: string) => loads.filter((u) => u.endsWith(f)).length;
  assert.equal(count('adult-man.glb'), 1);
  assert.equal(count('adult-woman.glb'), 1);
  assert.equal(count('casual-character.glb'), 1);
  assert.equal(registry.isCached('models/characters/adult-man.glb'), true);
  assert.equal(registry.isCached('models/characters/adult-woman.glb'), true);
  assert.equal(registry.liveCount, 1);
});

test('F5: a file that falls out of the default + last-two set is released (registry level)', async () => {
  const { registry } = fakeRegistry();
  const { host } = swapHost(registry);
  const sw = new CharacterSwapper(host);
  for (const id of ['adult-man', 'adult-woman']) await sw.swap(id);
  registry.trim([getProfile('default')!.url, 'models/characters/adult-woman.glb']);
  assert.equal(registry.isCached('models/characters/adult-man.glb'), false);
  assert.equal(registry.isCached('models/characters/adult-woman.glb'), true);
});
