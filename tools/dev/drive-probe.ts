// Developer probe for the driving prototype: prints the blocking outlines near a world position.
// Usage: node tools/dev/drive-probe.ts <x> <z> [radius] [--url=http://localhost:3000/]
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const url = args.find((a) => a.startsWith('--url='))?.slice(6) ?? 'http://localhost:3000/';
const [x, z, radius = 8] = args.filter((a) => !a.startsWith('--')).map(Number);
const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
await page.goto(url);
await page.waitForFunction(() => (window as any).__k3d?.ready, null, { timeout: 90000 });
await page.click('#btn-start');
await page.evaluate(([x, z]) => { const k = (window as any).__k3d; k.player.teleport(x, z); }, [x, z]);
await page.waitForTimeout(2500);
const out = await page.evaluate(([x, z, radius]) => {
  const k = (window as any).__k3d, c = k.world.collision, found: unknown[] = [];
  const seen = new Set<unknown>();
  c.forNearWalls(x, z, radius, (w: any) => {
    if (seen.has(w)) return;
    seen.add(w);
    found.push({ bbox: [w.minX, w.minZ, w.maxX, w.maxZ].map((v: number) => +v.toFixed(1)), top: +w.top.toFixed(1), verts: w.rings[0].length / 2, dressOf: w.dressOf, ring: w.rings[0].length <= 16 ? Array.from(w.rings[0] as Float32Array).map((v) => +v.toFixed(1)) : undefined });
  });
  const road = k.driving.car.env.road(x, z);
  return { ground: c.groundAt(x, z, 1e6), inside: c.insideBuilding(x, z, c.groundAt(x, z, 1e6).h), road, walls: found };
}, [x, z, radius]);
console.log(JSON.stringify(out, null, 1));
await browser.close();
