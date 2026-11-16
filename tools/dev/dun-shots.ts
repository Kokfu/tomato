// Fixed-camera captures of the DUN building for before / after comparison (V6).
// Usage: node tools/dev/dun-shots.ts <outDir> <prefix> [--url=http://localhost:3000/] [--quality=high]
// The camera positions are offsets from the DUN landmark's mapped coordinates (landmarks.json).
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const [outDir, prefix, ...rest] = process.argv.slice(2);
const opt = (k: string, d: string) => rest.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const url = opt('url', 'http://localhost:3000/');
const quality = opt('quality', 'high');
mkdirSync(outDir, { recursive: true });

/** [name, camera offset from the landmark (east, up above the terrain, south), look-at height] */
const VIEWS: [string, [number, number, number], number][] = [
  ['river', [-70, 7, 215], 45],
  ['facade', [60, 3, 95], 40],
  ['elevated', [170, 150, 150], 45],
  ['aerial', [10, 330, 60], 40],
  ['under-eaves', [30, 2, 62], 62],
];

const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errors: string[] = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url);
await page.waitForFunction(() => (window as any).__k3d?.ready, null, { timeout: 60000 });
await page.click('#btn-start');
await page.evaluate((q) => {
  const k = (window as any).__k3d;
  (document.querySelector(`#quality-seg [data-q="${q}"]`) as HTMLElement | null)?.click();
  const l = k.world.landmarks.landmarks.find((x: any) => x.id === 'dun');
  k.player.teleport(l.x, l.z + 120);
}, quality);
await page.waitForTimeout(1500);
await page.waitForFunction(() => (window as any).__k3d.world.chunks.progress() >= 0.999, null, { timeout: 90000 }).catch(() => errors.push('chunk load timeout'));
await page.waitForTimeout(1500);
for (const [name, off, lookY] of VIEWS) {
  const res = await page.evaluate(([off, lookY]) => {
    const k = (window as any).__k3d;
    const l = k.world.landmarks.landmarks.find((x: any) => x.id === 'dun');
    const cam = k.camera;
    cam.fov = 55; cam.updateProjectionMatrix();
    cam.position.set(l.x + off[0], off[1] + k.world.height.sample(l.x + off[0], l.z + off[2]), l.z + off[2]);
    cam.lookAt(l.x, lookY, l.z);
    cam.updateMatrixWorld(true);
    k.world.sky.position.copy(cam.position);
    k.renderer.info.reset();
    const t0 = performance.now();
    k.renderer.render(k.world.scene, cam);
    const r = k.renderer.info.render;
    return { png: k.renderer.domElement.toDataURL('image/png'), calls: r.calls, tris: r.triangles, ms: +(performance.now() - t0).toFixed(1) };
  }, [off, lookY] as [number[], number]);
  writeFileSync(`${outDir}/${prefix}-${name}.png`, Buffer.from(res.png.split(',')[1], 'base64'));
  console.log(name, JSON.stringify({ calls: res.calls, tris: res.tris, ms: res.ms }));
}
const lm = await page.evaluate(() => {
  const k = (window as any).__k3d; const out: Record<string, number> = {};
  k.world.chunks.group.traverse((o: any) => { if (o.userData?.landmark === 'dun') out[o.name || 'dun'] = (out[o.name || 'dun'] ?? 0) + (o.userData.triangles ?? 0); });
  return { dun: out, fps: +k.fps.toFixed(1) };
});
console.log('dun meshes', JSON.stringify(lm));
if (errors.length) console.log('ERRORS:', [...new Set(errors)].slice(0, 10).join('\n'));
await browser.close();
