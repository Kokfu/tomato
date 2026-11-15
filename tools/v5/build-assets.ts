// Builds the authored assets of the V5 hybrid approach:
//   public/models/v5/{temple,foodcourt,stage}.lod{0,1}.glb   meshopt-compressed, quantised glTF
//   public/models/v5/atlas.webp                              the painted 1024 px texture atlas
//   public/models/v5/manifest.json                           sizes and triangle counts (used by the report)
// Usage: node tools/v5/build-assets.ts [--url=http://localhost:3000/]   (the dev server is needed
// only for the atlas, which is painted with Canvas 2D in a headless browser)
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { Kit } from '../../src/v5/kit.ts';
import { buildTemple } from '../../src/v5/landmarks/temple.ts';
import { buildFoodCourt, buildOperaStage } from '../../src/v5/landmarks/foodcourt.ts';
import { writeGlb } from './glb.ts';

const url = process.argv.find((a) => a.startsWith('--url='))?.split('=')[1] ?? 'http://localhost:3000/';
const dir = 'public/models/v5';
mkdirSync(dir, { recursive: true });
const manifest: Record<string, unknown> = {};

const models: [string, (k: Kit) => void][] = [['temple', buildTemple], ['foodcourt', buildFoodCourt], ['stage', buildOperaStage]];
for (const [name, build] of models) for (const lod of [0, 1] as const) {
  const kit = new Kit(lod);
  build(kit);
  const glb = writeGlb(kit, `${name}-lod${lod}`);
  const plain = writeGlb(kit, `${name}-lod${lod}`, false);
  const file = `${dir}/${name}.lod${lod}.glb`;
  writeFileSync(file, glb.bytes);
  const info = { triangles: glb.triangles, vertices: glb.vertices, bytes: glb.bytes.length, gzip: gzipSync(glb.bytes).length, brotli: brotliCompressSync(glb.bytes).length, quantisedOnlyBytes: plain.bytes.length, float32Bytes: glb.vertices * 44 + glb.triangles * 6 };
  manifest[`${name}.lod${lod}.glb`] = info;
  console.log(`${file}: ${info.triangles} tris, ${info.vertices} verts, ${(info.bytes / 1024).toFixed(1)} KB meshopt (${(info.gzip / 1024).toFixed(1)} KB gzip, ${(info.brotli / 1024).toFixed(1)} KB brotli); quantised only ${(info.quantisedOnlyBytes / 1024).toFixed(1)} KB; float32 ${(info.float32Bytes / 1024).toFixed(0)} KB`);
}

try {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage();
  await page.goto(url);
  const data: Record<string, string> = await page.evaluate(async () => {
    const m = await import('/src/v5/landmarks/atlas.ts' as string);
    const c = document.createElement('canvas');
    c.width = c.height = m.ATLAS_SIZE;
    m.paintAtlas(c.getContext('2d')!);
    return { webp: c.toDataURL('image/webp', 0.86), png: c.toDataURL('image/png') };
  });
  await browser.close();
  for (const [ext, d] of Object.entries(data)) {
    const buf = Buffer.from(d.split(',')[1], 'base64');
    if (ext === 'webp') { writeFileSync(`${dir}/atlas.webp`, buf); manifest['atlas.webp'] = { bytes: buf.length, size: 1024, gpuBytesWithMips: Math.round(1024 * 1024 * 4 * 1.333) }; console.log(`${dir}/atlas.webp: ${(buf.length / 1024).toFixed(1)} KB`); }
    else { manifest['atlas.png (not shipped)'] = { bytes: buf.length }; console.log(`atlas as PNG would be ${(buf.length / 1024).toFixed(1)} KB`); }
  }
} catch (e) {
  console.warn('Atlas not rebuilt (is the dev server running at ' + url + '?):', (e as Error).message);
  try { manifest['atlas.webp'] = { bytes: statSync(`${dir}/atlas.webp`).size, size: 1024 }; } catch { /* none */ }
}
writeFileSync(`${dir}/manifest.json`, JSON.stringify(manifest, null, 1));
