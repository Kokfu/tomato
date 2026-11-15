// Builds the landmark models: runs each model script at every LOD and writes
//   public/models/landmarks/<id>/lod<N>.glb   quantised binary glTF
//   public/models/landmarks/<id>/meta.json    triangle / byte counts, bounds, collision, plaques
// Usage: node tools/landmarks/build-models.ts [landmark-id]
// Run before "npm run data:build": the world build reads meta.json to place collision.
import { mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { LANDMARK_REGISTRY } from '../../src/world/landmarks/registry.ts';
import { writeGlb } from './kit/glb.ts';
import type { ModelScript } from './kit/model.ts';

const only = process.argv[2];
for (const def of LANDMARK_REGISTRY) {
  if (only && def.id !== only) continue;
  const build = (await import(`./models/${def.id}.ts`)).build as ModelScript;
  const dir = `public/${def.model.dir}`;
  mkdirSync(dir, { recursive: true });
  const lods: object[] = [];
  let meta: Record<string, unknown> = {};
  def.model.lods.forEach((l, i) => {
    const out = build(i === 0 ? 0 : 1);
    const glb = writeGlb(out.mesh, `${def.id}-lod${i}`);
    writeFileSync(`${dir}/${l.file}`, glb);
    const info = { file: l.file, triangles: out.mesh.triangles, vertices: out.mesh.vertices, bytes: glb.length, gzipBytes: gzipSync(glb).length };
    lods.push(info);
    console.log(`${def.id} ${l.file}: ${info.triangles} tris, ${info.vertices} verts, ${(info.bytes / 1024).toFixed(0)} KB (${(info.gzipBytes / 1024).toFixed(0)} KB gzip)`);
    if (i === 0) {
      const bd = out.mesh.bounds();
      const r2 = (v: number) => +v.toFixed(2);
      meta = { bounds: { min: bd.min.map(r2), max: bd.max.map(r2) }, collision: out.collision, plaques: out.plaques };
    }
  });
  writeFileSync(`${dir}/meta.json`, JSON.stringify({ id: def.id, version: def.version, name: def.name, lods, ...meta }, null, 1));
}
