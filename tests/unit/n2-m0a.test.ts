// N2-M0a unit tests: versioned data URLs, procedural walker stand-in VAT bake, and Credits & Licences completeness.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { withDataVersion } from '../../src/version.ts';
import { bakeStandInWalker, WALK_FRAMES } from '../../src/life/LifeRender.ts';
import { MAP_DATA_CREDITS, MODEL_TEXTURE_CREDITS, PHOTO_CREDITS, ROCKETBOX_MIT } from '../../src/ui/Credits.ts';

test('withDataVersion appends ?v= or &v= only when a non-empty hash is supplied', () => {
  assert.equal(withDataVersion('/data/kuching/manifest.json', 'a1b2c3d4e5'), '/data/kuching/manifest.json?v=a1b2c3d4e5');
  assert.equal(withDataVersion('/data/kuching/chunks/0_0.json?foo=1', 'a1b2c3d4e5'), '/data/kuching/chunks/0_0.json?foo=1&v=a1b2c3d4e5');
  assert.equal(withDataVersion('/data/kuching/manifest.json', ''), '/data/kuching/manifest.json');
});

test('bakeStandInWalker builds a valid VAT with top, bottom, skin and hair parts at Low, Medium and High cells', () => {
  const hi = bakeStandInWalker(0);
  const med = bakeStandInWalker(0.03);
  const low = bakeStandInWalker(0.05);
  assert.ok(hi.triangles > med.triangles && med.triangles > low.triangles, `triangles scale down with cell: ${hi.triangles} > ${med.triangles} > ${low.triangles}`);
  assert.ok(low.triangles >= 400 && hi.triangles <= 2800, `triangle bounds: low=${low.triangles}, hi=${hi.triangles}`);
  assert.equal(hi.texture.image.height, hi.rows * (WALK_FRAMES + 1));

  const prt = hi.geometry.getAttribute('part');
  const seenParts = new Set<number>();
  for (let i = 0; i < prt.count; i++) seenParts.add(prt.getX(i));
  for (const kind of [0, 1, 2, 3, 4]) assert.ok(seenParts.has(kind), `missing clothing/body part ${kind}`);

  // Frame 1 and frame 4 of the walk cycle must differ (legs swing).
  const data = hi.texture.image.data as Float32Array;
  let diff = 0;
  for (let i = 0; i < hi.vertices; i++) {
    const o1 = (1 * hi.rows * 512 + i) * 4, o4 = (4 * hi.rows * 512 + i) * 4;
    diff = Math.max(diff, Math.hypot(data[o1] - data[o4], data[o1 + 1] - data[o4 + 1], data[o1 + 2] - data[o4 + 2]));
  }
  assert.ok(diff > 0.08, `walk cycle animates limb positions (max delta ${diff.toFixed(3)})`);

  hi.geometry.dispose(); hi.texture.dispose();
  med.geometry.dispose(); med.texture.dispose();
  low.geometry.dispose(); low.texture.dispose();
});

test('Credits carries the verbatim Microsoft Rocketbox MIT notice, every shipped reference photo author, and index.html drops "plain grey"', () => {
  const upstream = readFileSync('public/models/characters/LICENSE-rocketbox.txt', 'utf8').replace(/\r\n/g, '\n').trim();
  assert.equal(ROCKETBOX_MIT.trim(), upstream);

  const manifest = JSON.parse(readFileSync('public/reference/manifest.json', 'utf8')) as { images: { file: string; author: string }[] };
  const photoText = PHOTO_CREDITS.map((c) => `${c.item} ${c.author} ${c.licence}`).join('\n');
  for (const img of manifest.images) {
    assert.ok(photoText.includes(img.author), `missing reference photo author: ${img.author}`);
    assert.ok(photoText.includes(img.file), `missing reference photo file: ${img.file}`);
  }
  assert.ok(MAP_DATA_CREDITS.some((c) => c.author.includes('OpenStreetMap')));
  assert.ok(MAP_DATA_CREDITS.some((c) => c.author.includes('Overture')));
  assert.ok(MODEL_TEXTURE_CREDITS.some((c) => c.author.includes('Quaternius')));
  assert.ok(MODEL_TEXTURE_CREDITS.some((c) => c.author.includes('Poly Haven')));

  const html = readFileSync('index.html', 'utf8');
  assert.ok(!/plain grey/i.test(html), 'index.html no longer claims machine-detected footprints are plain grey');
  assert.ok(html.includes('id="pause-credits"') && html.includes('id="start-credits"'));
});
