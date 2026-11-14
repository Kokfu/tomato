// Exercises the minimap, full map, landmark selection and routing in the running app and saves
// screenshots (dev utility; also produces docs/screenshots/map/*).
// Usage: node tools/dev/map-check.ts <outDir> <prefix> [--url=http://localhost:5182/] [--size=1280x720] [--mobile]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const [outDir, prefix, ...rest] = process.argv.slice(2);
const opt = (k: string, d: string) => rest.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const url = opt('url', 'http://localhost:5182/');
const [w, h] = opt('size', '1280x720').split('x').map(Number);
const mobile = rest.includes('--mobile');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: mobile, isMobile: mobile, deviceScaleFactor: mobile ? 2 : 1 });
const page = await ctx.newPage();
const errors: string[] = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => errors.push(`[requestfailed] ${r.url()}`));
const requested: string[] = [];
page.on('request', (r) => { if (/overview\.json|graph\.json/.test(r.url())) requested.push(r.url().split('/').pop()!); });

const shot = (name: string) => page.screenshot({ path: `${outDir}/${prefix}-${name}.png` });
const ev = <T>(fn: string): Promise<T> => page.evaluate(fn) as Promise<T>;
const tap = (sel: string) => (mobile ? page.locator(sel).tap() : page.locator(sel).click());
const chunks = () => page.waitForFunction(() => (window as any).__k3d.world.chunks.progress() >= 0.999, null, { timeout: 60000 });
const step = (s: string) => console.log(`  ok  ${s}`);
/** Screen position (CSS px) of a landmark on the full map. */
const markerPos = (id: string) => page.evaluate((id) => {
  const k = (window as any).__k3d, v = k.minimap.fullView, c = document.querySelector('#fullmap canvas') as HTMLCanvasElement;
  const l = k.world.landmarks.landmarks.find((x: any) => x.id === id);
  return [c.clientWidth / 2 + (l.x - v.x) * v.scale, c.clientHeight / 2 + (l.z - v.z) * v.scale];
}, id);

await page.goto(url);
await page.waitForFunction(() => (window as any).__k3d?.ready, null, { timeout: 60000 });
await page.click('#btn-start');
await chunks();
await page.waitForTimeout(500);

// --- Minimap -------------------------------------------------------------------------------
assert.deepEqual(requested, [], 'overview / graph are not downloaded before they are needed');
const mm = await page.locator('#minimap-wrap').boundingBox();
assert.ok(mm && Math.abs(mm.width - mm.height) < 1, 'minimap is square (round)');
const painted = await ev<number>(`(() => { const c = document.getElementById('minimap'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const s = new Set(); for (let i = 0; i < d.length; i += 4 * 97) s.add(d[i] << 16 | d[i + 1] << 8 | d[i + 2]); return s.size; })()`);
assert.ok(painted > 4, `minimap shows several map colours (${painted})`);
await shot('1-hud-minimap');
const r0 = await ev<number>('__k3d.minimap.range');
await tap('#minimap-ctl .mm-in');
const r1 = await ev<number>('__k3d.minimap.range');
assert.ok(r1 < r0, 'minimap + button zooms in');
await tap('#minimap-ctl .mm-out');
await tap('#minimap-ctl .mm-out');
const r2 = await ev<number>('__k3d.minimap.range');
assert.ok(r2 > r0, 'minimap - button zooms out');
if (!mobile) {
  await page.locator('#minimap-wrap').hover();
  await page.mouse.wheel(0, -300);
  assert.ok((await ev<number>('__k3d.minimap.range')) < r2, 'wheel zooms the minimap');
}
assert.equal(await ev('__k3d.minimap.fullOpen'), false, 'zoom buttons do not open the full map');
await tap('#minimap-ctl .mm-mode');
assert.equal(await ev('__k3d.minimap.headingUp'), true);
await page.evaluate(() => { (window as any).__k3d.tpc.yaw = 1.2; });
await page.waitForTimeout(400);
const compass = await ev<string>(`document.getElementById('compass').style.left`);
assert.ok(parseFloat(compass) > 60, `north indicator moved round the rim in heading-up mode (${compass})`);
await shot('2-minimap-heading-up');
await tap('#minimap-ctl .mm-mode');
await page.evaluate(() => { const k = (window as any).__k3d; k.tpc.yaw = 0; k.minimap.range = 160; });
step('minimap: zoom buttons, wheel, heading-up, north indicator');

// --- Full map ------------------------------------------------------------------------------
await tap('#minimap-wrap');
await page.waitForFunction(() => (window as any).__k3d.minimap.fullOpen === true);
assert.equal(await ev('__k3d.input.enabled'), false, 'gameplay input suspended while the map is open');
await page.waitForFunction(() => (window as any).__k3d.minimap.overview !== null, null, { timeout: 20000 });
assert.deepEqual(requested, ['overview.json'], 'overview lazy-loaded on first open, graph not yet');
await page.waitForTimeout(500);
await shot('3-fullmap');
// everything interactive is inside the viewport
for (const sel of ['.fm-close', '.fm-centre', '.fm-reset', '.fm-list-btn', '.fm-zoom-in', '.fm-zoom-out']) {
  const b = await page.locator(`#fullmap ${sel}`).boundingBox();
  assert.ok(b && b.x >= 0 && b.y >= 0 && b.x + b.width <= w + 0.5 && b.y + b.height <= h + 0.5, `${sel} inside the viewport`);
}
assert.match(await page.locator('.fm-coords').innerText(), /You\s+\d+\.\d{5}°N \d+\.\d{5}°E/);
const s0 = await ev<number>('__k3d.minimap.fullView.scale');
await tap('#fullmap .fm-zoom-out');
await tap('#fullmap .fm-zoom-out');
await tap('#fullmap .fm-zoom-out');
await tap('#fullmap .fm-zoom-out');
await tap('#fullmap .fm-zoom-out');
const s1 = await ev<number>('__k3d.minimap.fullView.scale');
assert.ok(s1 < s0 * 0.5, 'zoom-out button');
await page.waitForTimeout(400);
await shot('4-fullmap-whole-area');
// pan by dragging
const before = await ev<{ x: number; z: number }>('({ ...__k3d.minimap.fullView })');
const cx = w / 2 + 40, cy = h / 2 + 30;
if (mobile) {
  const cdp = await ctx.newCDPSession(page);
  const touch = (type: string, pts: number[][]) => cdp.send('Input.dispatchTouchEvent', { type: type as any, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
  await touch('touchStart', [[cx, cy]]);
  for (let i = 1; i <= 6; i++) await touch('touchMove', [[cx - i * 12, cy - i * 6]]);
  await touch('touchEnd', []);
  const mid = await ev<{ x: number; z: number; scale: number }>('({ ...__k3d.minimap.fullView })');
  assert.ok(mid.x > before.x && mid.z > before.z, 'one-finger drag pans the map');
  // pinch out = zoom in
  await touch('touchStart', [[cx - 30, cy], [cx + 30, cy]]);
  for (let i = 1; i <= 8; i++) await touch('touchMove', [[cx - 30 - i * 10, cy], [cx + 30 + i * 10, cy]]);
  await touch('touchEnd', []);
  const after = await ev<{ scale: number }>('({ ...__k3d.minimap.fullView })');
  assert.ok(after.scale > mid.scale * 2, `pinch zooms in (${mid.scale} -> ${after.scale})`);
  assert.equal(await ev('__k3d.minimap.selected'), null, 'pinch / drag do not select anything');
} else {
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx - 80, cy - 40, { steps: 5 });
  await page.mouse.up();
  const mid = await ev<{ x: number; z: number; scale: number }>('({ ...__k3d.minimap.fullView })');
  assert.ok(mid.x > before.x && mid.z > before.z, 'drag pans the map');
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(100);
  assert.ok((await ev<number>('__k3d.minimap.fullView.scale')) > mid.scale, 'wheel zooms in');
  await page.mouse.move(cx + 5, cy + 5);
  assert.match(await page.locator('.fm-coords').innerText(), /Cursor\s+\d+\.\d{5}°N/);
}
await tap('#fullmap .fm-centre');
const pv = await ev<number[]>('[__k3d.minimap.fullView.x - __k3d.player.position.x, __k3d.minimap.fullView.z - __k3d.player.position.z]');
assert.ok(Math.hypot(pv[0], pv[1]) < 0.01, 'centre-on-player');
step('full map: open by tapping the minimap, zoom, pan, centre on player, coordinates');

// --- Landmark selection --------------------------------------------------------------------
await page.evaluate(() => { const m = (window as any).__k3d.minimap; m.fullView.scale = 0.8; m.centreOnPlayer(); });
await page.waitForTimeout(300);
// by tapping a marker on the canvas
if (mobile) await page.evaluate(() => (window as any).__k3d.minimap.setListOpen(false));
const [dx, dy] = await markerPos('darul-hana');
if (mobile) await page.touchscreen.tap(dx + 3, dy + 3); else await page.mouse.click(dx + 3, dy + 3);
assert.equal(await ev('__k3d.minimap.selected?.id'), 'darul-hana', 'tapping a marker selects the landmark');
assert.match(await page.locator('.fm-info').innerText(), /Darul Hana Bridge[\s\S]*1\.56140°N 110\.34596°E[\s\S]*Straight line\s+\d+ m[\s\S]*Bearing\s+\d{3}° \((N|NE|E)\)/);
// by list entry
if (!(await page.locator('.fm-list').isVisible())) await tap('#fullmap .fm-list-btn');
await page.waitForTimeout(200);
await shot('5-landmark-list');
await tap('.fm-item[data-id="fort-margherita"]');
assert.equal(await ev('__k3d.minimap.selected?.id'), 'fort-margherita');
const info = await page.locator('.fm-info').innerText();
assert.match(info, /Fort Margherita[\s\S]*1\.56047°N 110\.34949°E/);
const expected = await ev<{ d: number; b: number }>(`(() => { const k = __k3d, l = k.world.landmarks.landmarks.find((x) => x.id === 'fort-margherita'), p = k.player.position; return { d: Math.hypot(l.x - p.x, l.z - p.z), b: (Math.atan2(l.x - p.x, -(l.z - p.z)) * 180 / Math.PI + 360) % 360 }; })()`);
assert.ok(info.includes(`${Math.round(expected.d / 10) * 10} m`), `distance ${expected.d} shown in: ${info}`);
assert.ok(info.includes(`${String(Math.round(expected.b)).padStart(3, '0')}°`), `bearing ${expected.b} shown`);
await page.waitForTimeout(300);
await shot('6-landmark-selected');
step(`landmark selection (marker + list): ${info.replace(/\s+/g, ' ').slice(0, 110)}`);

// --- Route across the river ----------------------------------------------------------------
await tap('.fm-route-btn');
await page.waitForFunction(() => (window as any).__k3d.minimap.nav?.route != null, null, { timeout: 20000 });
assert.deepEqual(requested, ['overview.json', 'graph.json'], 'graph lazy-loaded on the first route request');
const route = await ev<{ length: number; straight: number; bridges: string[]; wet: number; inBuilding: number }>(`(() => {
  const k = __k3d, m = k.minimap, r = m.nav.route, g = m.graph;
  let wet = 0, inBuilding = 0;
  for (let i = 0; i < r.segEdge.length; i++) {
    const e = r.segEdge[i];
    if (e < 0 || g.isBridge(e)) continue;
    const x = (r.points[i * 2] + r.points[i * 2 + 2]) / 2, z = (r.points[i * 2 + 1] + r.points[i * 2 + 3]) / 2;
    if (m.overview.inWater(x, z)) wet++;
    if (k.world.chunks.dataAt(Math.floor(x / 256), Math.floor(z / 256)) && k.world.collision.insideBuilding(x, z, k.world.height.sample(x, z) + 0.5)) inBuilding++;
  }
  return { length: r.length, straight: r.straight, bridges: [...new Set(r.edges.filter((e) => g.isBridge(e)).map((e) => g.nameOf(e)))], wet, inBuilding };
})()`);
assert.ok(route.length >= route.straight);
assert.ok(route.bridges.includes('Jambatan Darul Hana'), 'route crosses on Darul Hana Bridge');
assert.equal(route.wet, 0, 'no non-bridge route segment over water');
assert.equal(route.inBuilding, 0, 'no route segment through a loaded building');
assert.match(await page.locator('.fm-info').innerText(), /Walking route \d+(\.\d+)? k?m · about \d+ min[\s\S]*Darul Hana/);
await page.waitForTimeout(500);
await shot('7-route-fullmap');
step(`route waterfront -> Fort Margherita: ${Math.round(route.length)} m (straight ${Math.round(route.straight)} m) via ${route.bridges.join(', ')}`);

// close with the close button; HUD shows the hint and the minimap shows the route
await tap('#fullmap .fm-close');
assert.equal(await ev('__k3d.minimap.fullOpen'), false);
assert.equal(await ev('__k3d.input.enabled'), true, 'input restored after closing the map');
await page.waitForTimeout(600);
await page.locator('#nav-hint').waitFor({ state: 'visible' });
const hint1 = (await page.locator('#nav-hint').innerText()).replace(/\s+/g, ' ');
assert.match(hint1, /Head (N|NE|E|SE|S|SW|W|NW)|Cross|Turn|Bear|Walk/);
const nh = await page.locator('#nav-hint').boundingBox();
const mw = await page.locator('#minimap-wrap').boundingBox();
const loc = await page.locator('#location').boundingBox();
const overlap = (a: any, b: any) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
assert.ok(nh && nh.x >= 0 && nh.x + nh.width <= w + 0.5, 'nav hint inside the viewport');
assert.ok(!overlap(nh, mw) && !overlap(nh, loc), 'nav hint does not cover the minimap or the location panel');
for (const sel of ['#minimap-ctl', '#topbar', '#location']) assert.ok(!overlap(await page.locator(sel).boundingBox(), mw), `${sel} does not cover the minimap`);
assert.ok(!overlap(await page.locator('#minimap-ctl').boundingBox(), await page.locator('#topbar').boundingBox()), 'minimap controls do not cover the top bar');
await shot('8-hud-route-start');
// walk part of the route: teleport onto the bridge and check the hint follows
await page.evaluate(() => {
  const k = (window as any).__k3d, r = k.minimap.nav.route;
  const i = r.segEdge.findIndex((e: number) => e >= 0 && k.minimap.graph.isBridge(e)) + 6;
  k.player.teleport(r.points[i * 2], r.points[i * 2 + 1]);
  k.tpc.yaw = Math.atan2(-(r.points[i * 2 + 2] - r.points[i * 2]), -(r.points[i * 2 + 3] - r.points[i * 2 + 1]));
});
await chunks();
await page.waitForTimeout(900);
const hint2 = (await page.locator('#nav-hint').innerText()).replace(/\s+/g, ' ');
assert.notEqual(hint2, hint1, 'hint updates as the player advances');
assert.ok(Math.abs(await ev<number>('__k3d.minimap.nav.route.length') - route.length) < 1, 'still the same route while on it');
await shot('9-hud-route-on-bridge');
step(`HUD hint: "${hint1}" -> "${hint2}"`);

// leave the route: it is re-planned from the new position
await page.evaluate(() => { const k = (window as any).__k3d, l = k.world.landmarks.landmarks.find((x: any) => x.id === 'astana'); k.player.teleport(l.x, l.z + 60); });
await chunks();
await page.waitForFunction((len) => Math.abs((window as any).__k3d.minimap.nav?.route?.length - len) > 50, route.length, { timeout: 15000 });
step(`re-route after leaving the route: ${Math.round(await ev<number>('__k3d.minimap.nav.route.length'))} m`);

// --- No walking connection -----------------------------------------------------------------
await page.evaluate(async () => {
  const k = (window as any).__k3d, m = k.minimap;
  const real = m.graph.route;
  m.graph.route = () => null; // simulate a destination with no mapped walking connection
  m.toggleFullMap();
  m.selectLandmark('astana');
  await m.routeTo('astana');
  m.graph.route = real;
});
const none = await page.locator('.fm-info').innerText();
assert.match(none, /No mapped walking connection[\s\S]*Straight line \d+ m, bearing \d{3}° [NESW]+/);
assert.equal(await ev('__k3d.minimap.nav.route'), null);
await page.waitForTimeout(300);
await shot('10-no-route-fallback');
if (mobile) await page.touchscreen.tap(w / 2, h / 2 - 40);
await page.keyboard.press('Escape');
await page.waitForFunction(() => (window as any).__k3d.minimap.fullOpen === false);
await page.waitForTimeout(500);
assert.match(await page.locator('#nav-hint').innerText(), /no mapped walking route[\s\S]*Straight line/);
await shot('11-hud-no-route');
await tap('#nav-hint .nav-clear');
assert.equal(await ev('__k3d.minimap.nav'), null, 'clear button removes the route');
assert.ok(await page.locator('#nav-hint').isHidden());
step('no-connection fallback (straight-line distance + bearing), clear route');

// --- Return to Waterfront + M key ----------------------------------------------------------
await page.keyboard.press('KeyM');
await page.waitForFunction(() => (window as any).__k3d.minimap.fullOpen === true);
await tap('#fullmap .fm-reset');
const sp = await ev<number[]>('[__k3d.player.position.x - __k3d.world.manifest.spawn.x, __k3d.player.position.z - __k3d.world.manifest.spawn.z]');
assert.ok(Math.hypot(sp[0], sp[1]) < 0.5, 'Return to Waterfront teleports to the spawn');
await page.keyboard.press('KeyM');
await page.waitForFunction(() => (window as any).__k3d.minimap.fullOpen === false);
step('Return to Waterfront, M key toggles the map');

console.log(errors.length ? `CONSOLE:\n${[...new Set(errors)].slice(0, 20).join('\n')}` : 'no console errors or warnings');
await browser.close();
if (errors.some((e) => !e.startsWith('[warning]'))) process.exit(1);
