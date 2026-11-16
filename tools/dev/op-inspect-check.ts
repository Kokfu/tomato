// @ts-nocheck  (browser-side snippets; a dev utility, not part of the app)
// Exercises the OP-mode inspection tools in a real browser and reports what happened.
// Usage: node tools/dev/op-inspect-check.ts <outDir> [url]   (writes compare-side-by-side.png and compare-overlay.png)
import { chromium } from '@playwright/test';
const out = process.argv[2];
const base = process.argv[3] ?? 'http://localhost:3000/';
const b = await chromium.launch({ channel: 'msedge', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1600, height: 900 } });
const p = await ctx.newPage();
const errs: string[] = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
const R: Record<string, unknown> = {};
await p.goto(base);
await p.waitForFunction(() => (window as any).__k3d?.ready, null, { timeout: 90000 });
await p.click('#btn-start');
await p.evaluate(() => { const a = document.querySelector('#opt-adaptive'); if (a?.checked) a.click(); });
// 1. preset view (switches the section on), eye level
await p.keyboard.press('KeyP');
R.flyOn = await p.evaluate(() => (window as any).__k3d.fly.active);
await p.click('#op-views button[data-preset="01-along-street"]');
await p.waitForFunction(() => (window as any).__k3d.v5?.mode === 'c' && !(window as any).__k3d.v5.busy, null, { timeout: 60000 });
await p.waitForFunction(() => (window as any).__k3d.world.chunks.progress() >= 0.999, null, { timeout: 90000 }).catch(() => {});
await p.waitForTimeout(2500);
const pose = () => p.evaluate(() => { const k = (window as any).__k3d, f = k.fly, c = k.camera; return { x: +c.position.x.toFixed(3), y: +c.position.y.toFixed(3), z: +c.position.z.toFixed(3), yaw: +f.yaw.toFixed(4), pitch: +f.pitch.toFixed(4), fov: c.fov, above: +(c.position.y - k.world.height.sample(c.position.x, c.position.z)).toFixed(2) }; });
R.preset = await pose();
// 2. save, move away, restore
await p.fill('#op-view-name', 'gate one');
await p.click('#op-view-save');
await p.evaluate(() => { const f = (window as any).__k3d.fly; f.position.set(300, 80, -200); f.yaw = 2; f.pitch = -0.7; f.setFov(35); });
await p.waitForTimeout(600);
R.moved = await pose();
await p.click('#op-views button[data-view="gate one"]');
await p.waitForTimeout(600);
R.restored = await pose();
R.identical = JSON.stringify(R.restored) === JSON.stringify(R.preset);
// 3. survives a reload (localStorage) and the copy-link URL
const url = await p.evaluate(() => (window as any).__k3d.fly.viewUrl());
R.url = url.replace(/^https?:\/\/[^/]+/, '');
await p.goto(url);
await p.waitForFunction(() => (window as any).__k3d?.ready, null, { timeout: 90000 });
await p.click('#btn-start');
await p.evaluate(() => { const a = document.querySelector('#opt-adaptive'); if (a?.checked) a.click(); });
await p.waitForFunction(() => (window as any).__k3d.fly.active && (window as any).__k3d.v5?.mode === 'c' && !(window as any).__k3d.v5.busy, null, { timeout: 60000 });
await p.waitForTimeout(1500);
R.afterReload = await pose();
R.reloadIdentical = JSON.stringify(R.afterReload) === JSON.stringify(R.preset);
R.storedViews = await p.evaluate(() => (window as any).__k3d.fly.views.map((v) => v.name));
await p.waitForFunction(() => (window as any).__k3d.world.chunks.progress() >= 0.999, null, { timeout: 90000 }).catch(() => {});
await p.waitForTimeout(2500);
// 4. eye-level preset from above
await p.evaluate(() => { const f = (window as any).__k3d.fly; f.position.set(170, 60, -5); });
await p.waitForTimeout(300);
await p.keyboard.press('KeyG');
await p.waitForTimeout(400);
R.eyeLevel = await p.evaluate(() => { const k = (window as any).__k3d, f = k.fly; return { lock: f.eyeLock, aboveWalkable: +(f.position.y - k.world.collision.groundAt(f.position.x, f.position.z, f.position.y - 1.3).h).toFixed(3) }; });
await p.keyboard.press('KeyG');
await p.click('#op-views button[data-preset="01-along-street"]');
await p.waitForTimeout(1200);
// 5. reference panel: side by side, then overlay
await p.keyboard.press('KeyR');
await p.waitForFunction(() => document.querySelector('#ref-panel img')?.complete && document.querySelector('#ref-panel img').naturalWidth > 0, null, { timeout: 20000 });
await p.waitForTimeout(1500);
R.side = await p.evaluate(() => { const c = document.querySelector('#scene'); return { canvasCss: c.clientWidth + 'x' + c.clientHeight, aspect: +(window as any).__k3d.camera.aspect.toFixed(3), badge: document.querySelector('.ref-badge').textContent.slice(0, 22), options: document.querySelectorAll('#ref-panel select option').length, credit: document.querySelector('.ref-credit').textContent.slice(0, 80) }; });
await p.screenshot({ path: out + '/compare-side-by-side.png' });
await p.click('#ref-panel .ref-bar button:nth-of-type(2)');
await p.evaluate(() => { const r = document.querySelector('#ref-panel input[type=range]'); r.value = '45'; r.dispatchEvent(new Event('input')); });
await p.waitForTimeout(1500);
R.overlay = await p.evaluate(() => ({ mode: (window as any).__k3d.refPanel.mode, opacity: document.querySelector('#ref-panel img').style.opacity, canvasCss: document.querySelector('#scene').clientWidth }));
await p.screenshot({ path: out + '/compare-overlay.png' });
// 6. screenshot is the rendered scene only (canvas), panel closes with the mode
const dl = p.waitForEvent('download', { timeout: 15000 }).catch(() => null);
await p.keyboard.press('KeyK');
const d = await dl;
R.screenshot = d ? d.suggestedFilename().replace(/\d/g, '0') : 'no download';
await p.keyboard.press('KeyP');
await p.waitForTimeout(500);
R.afterExit = await p.evaluate(() => ({ fly: (window as any).__k3d.fly.active, panelOpen: (window as any).__k3d.refPanel.open, fov: (window as any).__k3d.camera.fov, canvas: document.querySelector('#scene').clientWidth }));
R.errors = [...new Set(errs)].slice(0, 8);
console.log(JSON.stringify(R, null, 1));
await b.close();
