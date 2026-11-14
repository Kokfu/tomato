// Dev utility: identify what is rendered at a screen position (raycast) from the spawn view.
import { chromium } from '@playwright/test';
const [nx, ny] = process.argv.slice(2).map(Number);
const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
await page.goto('http://localhost:5173/');
await page.waitForFunction(() => (window as any).__k3d?.ready);
await page.click('#btn-start');
await page.waitForFunction(() => (window as any).__k3d.world.chunks.progress() >= 0.999);
await page.waitForTimeout(500);
const out = await page.evaluate(async ([nx, ny]) => {
  const k = (window as any).__k3d;
  const THREE = await import('/node_modules/.vite/deps/three.js' as any).catch(() => null);
  const cam = k.camera;
  // manual ray
  const o = cam.position.clone();
  const d = o.clone().set(nx, ny, 0.5).unproject(cam).sub(o).normalize();
  const ray = new (k.world.scene.children[0].children[0].children[0].raycast ? (Object.getPrototypeOf(o).constructor as any) : Object)();
  const res: any[] = [];
  const RC = THREE?.Raycaster;
  if (!RC) return 'no three';
  const rc = new RC(o, d, 0.1, 3000);
  for (const h of rc.intersectObjects(k.world.chunks.group.children, true).slice(0, 4)) {
    const m = h.object;
    const g = m.parent;
    const mats = k.world.materials;
    const name = Object.keys(mats).find((key) => mats[key] === m.material || (Array.isArray(mats[key]) && mats[key].includes(m.material))) ?? 'own';
    const tri = h.face ? [h.face.a, h.face.b, h.face.c].map((i: number) => [m.geometry.attributes.position.getX(i), m.geometry.attributes.position.getY(i), m.geometry.attributes.position.getZ(i)].map((v: number) => +v.toFixed(2))) : null;
    res.push({ dist: +h.distance.toFixed(1), mat: name, chunk: [g.position.x / 256, g.position.z / 256], point: h.point.toArray().map((v: number) => +v.toFixed(1)), tri });
  }
  return res;
}, [nx, ny]);
console.log(JSON.stringify(out, null, 1));
await browser.close();
