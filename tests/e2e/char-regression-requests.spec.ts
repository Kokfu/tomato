// CHAR-P2a review F2: without ?char the game must request exactly what it did before CHAR (f1c9458): the same scripts
// and the same single character GLB, loaded in the same order (no SkeletonUtils chunk, no extra model).
// Version-agnostic like char-regression-visibility: it only uses APIs that exist both on f1c9458 and on the branch.
//   REQ_OUT=<file>   write the normalised request list there (run it against each build);
//   REQ_BASE=<file>  assert that this build's list equals the one recorded on the base (production builds only: the
//                    names of hashed chunks are normalised, a dev server lists source modules and is not comparable).
import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { start, waitChunks } from './helpers.ts';

/** `/assets/GlbCharacter-AbC123xy.js` -> `assets/GlbCharacter.js`; other paths are kept. */
function norm(url: string, base: string): string {
  const path = url.startsWith(base) ? url.slice(base.length) : new URL(url).pathname;
  return path.replace(/^\/+/, '').replace(/-[A-Za-z0-9_-]{8}\.(js|css)$/, '.$1');
}

test('regression: no flag requests the same scripts and the same single character GLB, in the same order, as f1c9458', async ({ page, baseURL }) => {
  const seen: string[] = [];
  page.on('request', (r) => {
    const u = r.url();
    if (/\.glb(\?|$)/.test(u) || r.resourceType() === 'script') seen.push(norm(u, baseURL ?? ''));
  });
  await page.addInitScript(() => { try { localStorage.setItem('k3d.quality', 'low'); } catch { /* ignore */ } });
  // N1-M8: life=0 keeps the walkers (N1-M6), who share the default character model, out of the request counts
  await page.goto('./?char=0&life=0');
  await start(page, { navigate: false });
  await waitChunks(page);
  // The GLB model replaces the procedural stand-in.
  await page.waitForFunction(() => { let skinned = false; (window as any).__k3d.player.visual.root.traverse((o: any) => { if (o.isSkinnedMesh) skinned = true; }); return skinned; }, null, { timeout: 60_000 });
  await page.waitForTimeout(500);

  const glbs = seen.filter((u) => u.startsWith('models/characters/') && u.endsWith('.glb'));
  expect(glbs, 'exactly one character model, the default').toEqual(['models/characters/casual-character.glb']);
  expect(seen.filter((u) => /SkeletonUtils/i.test(u)), 'no SkeletonUtils script without the flag').toEqual([]);
  expect(seen.filter((u) => /adult-/.test(u))).toEqual([]);
  // The model is requested only after the glTF loader and the character code were requested (the old load order).
  const iGlb = seen.indexOf(glbs[0]);
  const iChar = seen.findIndex((u) => /GlbCharacter/.test(u));
  expect(iChar, 'the character code is requested').toBeGreaterThanOrEqual(0);
  expect(iChar).toBeLessThan(iGlb);

  if (process.env.REQ_OUT) writeFileSync(process.env.REQ_OUT, JSON.stringify(seen, null, 1));
  if (process.env.REQ_BASE) {
    const base: string[] = JSON.parse(readFileSync(process.env.REQ_BASE, 'utf8'));
    expect([...seen].sort(), 'the same set of scripts and models as f1c9458').toEqual([...base].sort());
    expect(seen.filter((u) => /GLTFLoader|GlbCharacter|models\/characters\//.test(u)), 'the character-related requests in the same order').toEqual(base.filter((u) => /GLTFLoader|GlbCharacter|models\/characters\//.test(u)));
  }
});
