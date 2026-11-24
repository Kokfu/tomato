// CHAR-P5 G2: the picker's data, the retired test characters, the saved choice and the strict (no fallback) swap. node --test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  CHARACTER_PROFILES, DEFAULT_CHARACTER_ID, getProfile, isPickable, listProfiles, pickerProfiles, resolveStartCharacter,
} from '../../src/player/character/CharacterProfile.ts';
import { CharacterRegistry, LoadStalledError, withStallTimeout } from '../../src/player/character/CharacterRegistry.ts';
import { CharacterSwapper } from '../../src/player/character/swap.ts';
import type { SwapHost } from '../../src/player/character/swap.ts';
import type { CharacterVisual } from '../../src/player/CharacterAnimator.ts';

const SIX = ['man', 'woman', 'teen-boy', 'teen-girl', 'young-boy', 'young-girl'];

test('G2.1 the picker offers exactly the six approved characters, in order, with the short names and heights', () => {
  const p = pickerProfiles();
  assert.deepEqual(p.map((x) => x.id), SIX);
  assert.deepEqual(p.map((x) => x.picker!.name), ['Man', 'Woman', 'Teen boy', 'Teen girl', 'Young boy', 'Young girl']);
  assert.deepEqual(p.map((x) => x.picker!.height), ['1.70 m', '1.58 m', '1.66 m', '1.56 m', '1.28 m', '1.27 m']);
});

test('G2.2 the retired Rocketbox characters and the dev/default profiles are not selectable, not in the cycle, not restorable', () => {
  for (const id of ['adult-man', 'adult-woman', 'test-short', DEFAULT_CHARACTER_ID, 'nonsense', '', null, undefined]) {
    assert.equal(isPickable(id as string), false, String(id));
    assert.ok(!pickerProfiles().some((p) => p.id === id));
  }
  for (const id of SIX) assert.equal(isPickable(id), true, id);
  assert.ok(!listProfiles().some((p) => p.legacy || p.dev));
  assert.deepEqual(listProfiles().map((p) => p.id), [DEFAULT_CHARACTER_ID, ...SIX]);
  // still defined (the e2e tests keep their reference models; ?char=<id> still works) and their files stay in the repository
  assert.ok(getProfile('adult-man')?.legacy && getProfile('adult-woman')?.legacy);
  for (const f of ['adult-man.glb', 'adult-woman.glb']) assert.ok(existsSync(new URL(`../../public/models/characters/${f}`, import.meta.url)), f);
});

test('G2.3 every picker card has its v2 portrait (1x and @2x) in public/ui/portraits', () => {
  for (const id of SIX) for (const suffix of ['', '@2x']) {
    const u = new URL(`../../public/ui/portraits/${id}${suffix}.webp`, import.meta.url);
    assert.ok(existsSync(u), u.pathname);
    assert.equal(readFileSync(u).subarray(8, 12).toString('latin1'), 'WEBP');
  }
});

test('G2.4 the saved choice: a selectable id restores, anything else is first launch (the picker); no flag never reads it', () => {
  for (const id of SIX) assert.deepEqual(resolveStartCharacter('?char', id), { id, flag: true, persist: false, invalid: null, needsPick: false });
  for (const bad of ['adult-man', 'adult-woman', 'removed-character', '']) assert.equal(resolveStartCharacter('?char', bad).needsPick, true, bad);
  assert.equal(resolveStartCharacter('?char', null).needsPick, true);
  assert.equal(resolveStartCharacter('', 'man').needsPick, false);
  assert.equal(resolveStartCharacter('?other=1', 'man').flag, false);
});

// ---------------------------------------------------------------- strict swap

function fakeVisual(): CharacterVisual & { disposed: boolean } {
  return { disposed: false, root: new THREE.Group(), update() {}, pose() {}, dispose() { (this as { disposed: boolean }).disposed = true; } } as unknown as CharacterVisual & { disposed: boolean };
}
function setup(fail: Set<string> = new Set()) {
  const loads: string[] = [];
  const warns: string[] = [];
  const persisted: string[] = [];
  const registry = new CharacterRegistry({
    load: async (url) => { loads.push(url); if ([...fail].some((f) => url.includes(f))) throw new Error('network down'); return { scene: new THREE.Group(), animations: [] }; },
    build: async () => fakeVisual(),
    sizeOf: () => 0,
  }, { budgetBytes: 64 * 1024 * 1024 });
  let current: CharacterVisual = fakeVisual();
  const host: SwapHost = {
    registry,
    install: (next) => { const old = current; current = next; return old; },
    prepare: async () => {},
    applyCamera: () => {},
    syncBody: () => {},
    warn: (m) => void warns.push(m),
    persist: (id) => void persisted.push(id),
    yieldToMain: async () => { await Promise.resolve(); },
  };
  return { sw: new CharacterSwapper(host), loads, warns, persisted, fail, get current() { return current; } };
}

test('G2.5 a strict swap that fails reports the error, keeps the player, persists nothing and does NOT fall back to the default', async () => {
  const s = setup(new Set(['woman.glb']));
  assert.equal(await s.sw.swap('man', { persist: true, strict: true }), true);
  const before = s.current;
  assert.equal(await s.sw.swap('woman', { persist: true, strict: true }), false);
  assert.equal(s.sw.currentId, 'man');
  assert.equal(s.current, before, 'the model on screen is untouched');
  assert.ok(s.sw.lastError instanceof Error && /network down/.test(s.sw.lastError.message));
  assert.equal(s.sw.loading, false);
  assert.deepEqual(s.persisted, ['man']);
  assert.ok(!s.loads.some((u) => u.includes('casual-character')), 'the default model was not loaded as a fallback');
  // Try again: the failed fetch was not cached; once the network is back the same call works and clears the error
  s.fail.clear();
  assert.equal(await s.sw.swap('woman', { persist: true, strict: true }), true);
  assert.equal(s.sw.lastError, null);
  assert.equal(s.sw.currentId, 'woman');
  assert.deepEqual(s.persisted, ['man', 'woman']);
});

test('G2.6 without strict the old behaviour stays: a failed model falls back to the default (CHAR-P4)', async () => {
  const s = setup(new Set(['woman.glb']));
  assert.equal(await s.sw.swap('woman'), false);
  assert.equal(s.sw.currentId, DEFAULT_CHARACTER_ID);
  assert.ok(s.loads.some((u) => u.includes('casual-character')));
  assert.equal(s.sw.lastError, null);
});

test('G2.7 a first-launch strict swap that fails leaves the stand-in humanoid (usingFallback) and lets Try again work', async () => {
  const s = setup(new Set(['teen-girl.glb']));
  assert.equal(s.sw.usingFallback, true);
  assert.equal(await s.sw.swap('teen-girl', { persist: true, strict: true }), false);
  assert.equal(s.sw.usingFallback, true);
  assert.equal(s.persisted.length, 0);
  s.fail.clear();
  assert.equal(await s.sw.swap('teen-girl', { persist: true, strict: true }), true);
  assert.equal(s.sw.usingFallback, false);
  assert.deepEqual(s.persisted, ['teen-girl']);
});

test('G2.8 abort() drops a swap still loading: nothing is installed or persisted and the loaded model is disposed', async () => {
  const s = setup();
  const p = s.sw.swap('young-boy', { persist: true, strict: true });
  s.sw.abort();
  assert.equal(await p, false);
  assert.equal(s.sw.currentId, DEFAULT_CHARACTER_ID);
  assert.equal(s.sw.usingFallback, true);
  assert.equal(s.sw.loading, false);
  assert.equal(s.persisted.length, 0);
  assert.equal(s.sw.lastError, null);
  // a later choice works normally
  assert.equal(await s.sw.swap('young-girl', { persist: true, strict: true }), true);
  assert.equal(s.sw.currentId, 'young-girl');
});

test('G2.9 only the six approved characters carry a picker card', () => {
  assert.deepEqual(CHARACTER_PROFILES.filter((p) => p.picker).map((p) => p.id), SIX);
});

// ---------------------------------------------------------------- G2 fix2 (N1): the no-progress load timeout

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

test('G2.10 withStallTimeout: a load with no activity is rejected after stallMs, and a late result is discarded', async () => {
  const discarded: string[] = [];
  let late!: (v: string) => void;
  const t0 = Date.now();
  await assert.rejects(withStallTimeout('x.glb', () => new Promise<string>((r) => { late = r; }), 80, (v) => discarded.push(v)), (e) => e instanceof LoadStalledError && /no progress/.test(e.message));
  assert.ok(Date.now() - t0 >= 70);
  late('arrived');
  await sleep(10);
  assert.deepEqual(discarded, ['arrived']);
});

test('G2.11 withStallTimeout: activity re-arms it (a slow but moving load is never cut off), the total may be many times stallMs', async () => {
  const t0 = Date.now();
  const v = await withStallTimeout('x.glb', async (activity) => {
    for (let i = 0; i < 8; i++) { await sleep(40); activity(); } // 320 ms in all, never 80 ms quiet
    return 'ok';
  }, 80, () => assert.fail('nothing to discard'));
  assert.equal(v, 'ok');
  assert.ok(Date.now() - t0 >= 300);
});

test('G2.12 withStallTimeout: after "download complete" the parse gets 3x the stall time; no timeout (0) leaves the load alone', async () => {
  // quiet for 150 ms after the download: more than stallMs (80) but within 3x (240)
  assert.equal(await withStallTimeout('x.glb', async (activity) => { activity(true); await sleep(150); return 'parsed'; }, 80, () => {}), 'parsed');
  await assert.rejects(withStallTimeout('x.glb', async (activity) => { activity(true); await sleep(400); return 'too slow'; }, 80, () => {}), LoadStalledError);
  assert.equal(await withStallTimeout('x.glb', async () => { await sleep(120); return 'no timeout'; }, 0, () => {}), 'no timeout');
});

test('G2.13 registry with stallMs: a hung GLB makes create() reject (LoadStalledError), is not cached, Try again fetches again, the late file is disposed', async () => {
  let calls = 0;
  const urls: string[] = [];
  const hung: Array<(s: unknown) => void> = [];
  const registry = new CharacterRegistry({
    load: (url) => { urls.push(url); calls++; return calls === 1 ? new Promise((r) => hung.push(r as (s: unknown) => void)) : Promise.resolve({ scene: new THREE.Group(), animations: [] }); },
    build: async () => fakeVisual(),
    sizeOf: () => 0,
  }, { budgetBytes: 64 * 1024 * 1024, stallMs: 60 });
  await assert.rejects(registry.create('man'), LoadStalledError);
  assert.equal(registry.isCached(getProfile('man')!.url), false, 'a stalled load is not cached');
  const v = await registry.create('man'); // Try again
  assert.ok(v);
  assert.equal(calls, 2);
  assert.equal(urls[0], getProfile('man')!.url);
  assert.equal(urls[1], getProfile('man')!.url + '?retry=1', 'the retry is a request of its own: a query is a different HTTP-cache key (a #fragment is stripped by the browser and queues behind the hung request, B1)');
  assert.ok(!urls[1].includes('#'), 'no fragment');
  assert.equal(registry.liveCount, 1);
  // the first request finally answers: nothing is cached or kept for it
  hung[0]({ scene: new THREE.Group(), animations: [] });
  await sleep(10);
  assert.equal(registry.liveCount, 1);
});

test('G2.14 a stalled GLB is a strict-swap error: the player keeps the model, nothing persisted, Try again works', async () => {
  let hang = true;
  const persisted: string[] = [];
  const registry = new CharacterRegistry({
    load: () => (hang ? new Promise(() => {}) : Promise.resolve({ scene: new THREE.Group(), animations: [] })),
    build: async () => fakeVisual(),
    sizeOf: () => 0,
  }, { stallMs: 60 });
  let current: CharacterVisual = fakeVisual();
  const sw = new CharacterSwapper({
    registry, install: (n) => { const o = current; current = n; return o; }, prepare: async () => {}, applyCamera: () => {}, syncBody: () => {},
    warn: () => {}, persist: (id) => void persisted.push(id), yieldToMain: async () => { await Promise.resolve(); },
  });
  assert.equal(await sw.swap('woman', { persist: true, strict: true }), false);
  assert.ok(sw.lastError instanceof LoadStalledError);
  assert.equal(sw.usingFallback, true);
  assert.equal(sw.loading, false);
  assert.equal(persisted.length, 0);
  hang = false;
  assert.equal(await sw.swap('woman', { persist: true, strict: true }), true);
  assert.deepEqual(persisted, ['woman']);
});

/** Registry + swapper whose FIRST GLB request hangs (and stalls); later requests answer. `urls` are the requests made. */
function stallRig(stallMs = 60) {
  const urls: string[] = [];
  const persisted: string[] = [];
  const registry = new CharacterRegistry({
    load: (url) => { urls.push(url); return urls.length === 1 ? new Promise(() => {}) : Promise.resolve({ scene: new THREE.Group(), animations: [] }); },
    build: async () => fakeVisual(),
    sizeOf: () => 0,
  }, { stallMs });
  let current: CharacterVisual = fakeVisual();
  const sw = new CharacterSwapper({
    registry, install: (n) => { const o = current; current = n; return o; }, prepare: async () => {}, applyCamera: () => {}, syncBody: () => {},
    warn: () => {}, persist: (id) => void persisted.push(id), yieldToMain: async () => { await Promise.resolve(); },
  });
  return { urls, persisted, registry, sw };
}

test('G2.15 (B3) a strict swap that waited on a stalled warm-up reports the error at once: one stall timer, not two; Try again then loads', async () => {
  const { urls, persisted, sw } = stallRig();
  const warm = sw.warm('woman'); // the picker's warm-up: its request hangs
  const t0 = Date.now();
  assert.equal(await sw.swap('woman', { persist: true, strict: true }), false); // Confirm while the warm-up is still loading
  const waited = Date.now() - t0;
  assert.ok(sw.lastError instanceof LoadStalledError, "the warm-up's stall is the error");
  assert.equal(urls.length, 1, 'no second request (and no second wait) after the warm-up stalled');
  assert.ok(waited < 60 * 1.9, `one stall timer, not two (waited ${waited} ms)`);
  assert.equal(sw.loading, false);
  assert.equal(persisted.length, 0);
  assert.equal(await warm, false);
  assert.equal(await sw.swap('woman', { persist: true, strict: true }), true); // Try again: the retry request answers
  assert.equal(urls.length, 2);
  assert.ok(urls[1].endsWith('?retry=1'));
  assert.deepEqual(persisted, ['woman']);
});

test('G2.16 (B3) a warm-up that failed before Confirm is not held against it (Confirm loads afresh); a non-strict swap still retries', async () => {
  const a = stallRig();
  assert.equal(await a.sw.warm('woman'), false); // stalled and settled before anyone asked
  assert.equal(await a.sw.swap('woman', { persist: true, strict: true }), true, 'a failed warm-up long ago does not poison the choice');
  assert.equal(a.urls.length, 2);
  const b = stallRig();
  const warm = b.sw.warm('woman');
  assert.equal(await b.sw.swap('woman', { persist: true }), true, 'not strict (the hook): it loads again after the warm-up stalled');
  await warm;
  assert.equal(b.urls.length, 2);
});
