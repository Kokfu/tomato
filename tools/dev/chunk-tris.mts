// Triangles and meshes of named chunks in the running game (the stable per-place measure; view totals vary run to run).
// Usage: node tools/dev/chunk-tris.mts <url> <x,z;x,z;...> <key,key,...> [--quality=medium]
import { chromium } from '@playwright/test';

const [url, spots, keys, ...rest] = process.argv.slice(2);
const quality = rest.find((a) => a.startsWith('--quality='))?.slice(10) ?? 'medium';
const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript(() => { try { if (!localStorage.getItem('k3d.character')) localStorage.setItem('k3d.character', 'man'); } catch { /* ignore */ } });
const page = await ctx.newPage();
await page.goto(url);
await page.waitForFunction(() => (window as any).__k3d?.ready, null, { timeout: 90000 });
await page.click('#btn-start');
await page.evaluate((q) => (document.querySelector(`#quality-seg [data-q="${q}"]`) as HTMLElement | null)?.click(), quality);
const want = new Set(keys.split(','));
const out: Record<string, { tris: number; meshes: number }> = {};
for (const s of spots.split(';')) {
  const [x, z] = s.split(',').map(Number);
  await page.evaluate(([px, pz]) => (window as any).__k3d.player.teleport(px, pz), [x, z]);
  await page.waitForTimeout(6000);
  const got = await page.evaluate((list) => {
    const k = (window as any).__k3d, res: Record<string, { tris: number; meshes: number; detail: string }> = {};
    for (const key of list) {
      const c = k.world.chunks.chunks.get(key);
      if (!c?.group || c.built !== 'high' || c.decor) continue;
      let tris = 0, meshes = 0;
      c.group.traverse((o: any) => { if (o.isMesh && o.geometry) { meshes++; const n = o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count; tris += (n / 3) * (o.isInstancedMesh ? o.count : 1); } });
      res[key] = { tris: Math.round(tris), meshes, detail: c.built };
    }
    return res;
  }, [...want]);
  for (const [key, v] of Object.entries(got)) if (!out[key]) out[key] = { tris: v.tris, meshes: v.meshes };
}
console.log(JSON.stringify(out));
await browser.close();
