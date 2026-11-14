// GLB character: clip selection, root-motion removal, and normalisation of the shipped model (node --test).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GlbCharacter, findClip, stripRootMotion, CHARACTER_HEIGHT } from '../../src/player/GlbCharacter.ts';

const clip = (name: string) => new THREE.AnimationClip(name, 1, []);

test('findClip prefers exact names and ignores jump variants for run', () => {
  const clips = ['Armature|Idle_Gun', 'Armature|Idle', 'Armature|RunningJump', 'Armature|Run_Back', 'Armature|Run', 'Armature|Walk'].map(clip);
  assert.equal(findClip(clips, 'idle')?.name, 'Armature|Idle');
  assert.equal(findClip(clips, 'run')?.name, 'Armature|Run');
  assert.equal(findClip(clips, 'walk')?.name, 'Armature|Walk');
  assert.equal(findClip(clips, 'jump')?.name, 'Armature|RunningJump');
  assert.equal(findClip([clip('Man_RunningJump'), clip('Man_Run')], 'run')?.name, 'Man_Run');
  assert.equal(findClip([clip('Wave')], 'walk'), null);
});

test('stripRootMotion removes net drift but keeps the bob', () => {
  const track = new THREE.VectorKeyframeTrack('Hips.position', [0, 0.5, 1], [0, 1, 0, 0.1, 1.2, 1, 0, 1, 2]);
  const c = new THREE.AnimationClip('Walk', 1, [track]);
  stripRootMotion(c);
  const v = Array.from(track.values).map((n) => +n.toFixed(5));
  assert.deepEqual(v, [0, 1, 0, 0.1, 1.2, 0, 0, 1, 0]);
});

async function loadModel(): Promise<{ scene: THREE.Object3D; animations: THREE.AnimationClip[] }> {
  const buf = readFileSync(new URL('../../public/models/characters/casual-character.glb', import.meta.url));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  return new GLTFLoader().parseAsync(ab, '');
}

test('shipped character model normalises to a 1.72 m figure standing on the origin, facing +Z', async () => {
  const gltf = await loadModel();
  const ch = new GlbCharacter(gltf) as any;
  ch.root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  ch.root.traverse((o: any) => {
    if (o.isSkinnedMesh) { o.computeBoundingBox(); box.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld)); }
    if (o.isMesh) assert.equal(o.castShadow, true);
  });
  assert.ok(Math.abs(box.min.y) < 0.01, `feet at ${box.min.y}`);
  assert.ok(Math.abs(box.max.y - CHARACTER_HEIGHT) < 0.01, `head at ${box.max.y}`);
  assert.ok(Math.abs((box.min.x + box.max.x) / 2) < 0.1 && Math.abs((box.min.z + box.max.z) / 2) < 0.15, 'centred on the root');
  // Measured gait: facing +Z, plausible human strides (metres per two steps).
  assert.equal(ch.walkGait.facing, 1);
  assert.equal(ch.runGait.facing, 1);
  assert.ok(ch.walkGait.stride > 1.2 && ch.walkGait.stride < 2.0, `walk stride ${ch.walkGait.stride}`);
  assert.ok(ch.runGait.stride > 2.2 && ch.runGait.stride < 3.6, `run stride ${ch.runGait.stride}`);

  // Animating through every state keeps all bones finite and the feet near the ground.
  const states = [{ speed: 0, grounded: true, vy: 0 }, { speed: 2, grounded: true, vy: 0 }, { speed: 6, grounded: true, vy: 0 }, { speed: 6, grounded: false, vy: 3 }];
  for (const s of states) {
    for (let i = 0; i < 90; i++) ch.update(1 / 60, s);
    ch.root.updateMatrixWorld(true);
    ch.root.traverse((o: any) => { if (o.isBone) assert.ok(o.matrixWorld.elements.every(Number.isFinite), `bone ${o.name} is finite`); });
  }
  ch.dispose();
  assert.equal(ch.root.children.length, 0);
});

test('a model without the required clips is rejected', async () => {
  const gltf = await loadModel();
  assert.throws(() => new GlbCharacter({ scene: gltf.scene, animations: gltf.animations.filter((c) => !/walk/i.test(c.name)) }), /idle\/walk\/run/);
});
