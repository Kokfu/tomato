// Extra V2 evidence shots: the place inspection panel, the admin editor and the evening preset.
// Usage: node tools/dev/v2-extra.ts <outDir> [--url=http://localhost:3000/]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const [outDir, ...rest] = process.argv.slice(2);
const url = rest.find((a) => a.startsWith('--url='))?.split('=')[1] ?? 'http://localhost:3000/';
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const errors: string[] = [];

async function open(query: string) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url + query);
  await page.waitForFunction(() => (window as any).__k3d?.ready, null, { timeout: 60000 });
  await page.click('#btn-start');
  await page.evaluate(() => {
    const k = (window as any).__k3d;
    (document.querySelector('#quality-seg [data-q="high"]') as HTMLElement).click();
    k.player.teleport(169.4, -100.2); k.player.heading = -0.6; k.tpc.yaw = 2.548; k.tpc.pitch = -0.1; k.tpc.distance = 4.6; k.tpc.snap();
  });
  await page.waitForFunction(() => (window as any).__k3d.world.chunks.progress() >= 0.999, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  return page;
}

// 1. Inspect a business with the E key.
let page = await open('');
await page.waitForSelector('#place-prompt:not(.hidden)');
const prompt = await page.textContent('#place-prompt');
await page.screenshot({ path: `${outDir}/07-place-prompt.png` });
await page.keyboard.press('KeyE');
await page.waitForSelector('#place-panel:not(.hidden)');
await page.screenshot({ path: `${outDir}/08-place-panel.png` });
const info = await page.evaluate(() => ({ text: document.getElementById('place-info')!.innerText, href: (document.querySelector('.place-link') as HTMLAnchorElement).href, inputEnabled: (window as any).__k3d.input.enabled }));
await page.keyboard.press('Escape');
await page.waitForSelector('#place-panel.hidden', { state: 'attached' });
const afterClose = await page.evaluate(() => ({ inputEnabled: (window as any).__k3d.input.enabled, paused: !document.getElementById('pause')!.classList.contains('hidden') }));
console.log(JSON.stringify({ prompt, info, afterClose }, null, 1));

// 2. Evening preset.
await page.click('#btn-settings');
await page.click('#time-seg [data-t="evening"]');
await page.click('#settings-close');
await page.evaluate(() => { const k = (window as any).__k3d; k.player.teleport(180, -105); k.player.heading = 0.96; k.tpc.yaw = -2.178; k.tpc.pitch = 0.08; k.tpc.distance = 4.2; k.tpc.snap(); });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${outDir}/09-evening-main-bazaar.png` });
await page.context().close();

// 3. Admin editor: correct a name, check the sign is rebuilt, export count.
page = await open('?admin=1');
await page.keyboard.press('KeyE');
await page.waitForSelector('#place-panel:not(.hidden)');
const before = await page.inputValue('#pe-name');
await page.fill('#pe-name', `${before} (corrected)`);
await page.screenshot({ path: `${outDir}/10-admin-editor.png` });
await page.click('#place-save');
await page.waitForFunction(() => (window as any).__k3d.world.chunks.progress() >= 0.999);
await page.waitForTimeout(1200);
await page.screenshot({ path: `${outDir}/11-admin-sign-updated.png` });
const admin = await page.evaluate(() => { const k = (window as any).__k3d; return { edits: k.world.places.edits, nearest: k.world.places.near(k.player.position.x, k.player.position.z, 7, (cx: number, cz: number) => k.world.chunks.dataAt(cx, cz))[0]?.place }; });
console.log(JSON.stringify({ before, admin }, null, 1));
await page.evaluate(() => { (window as any).__k3d.world.places.clearEdits(); localStorage.removeItem('k3d.admin'); });
await browser.close();
if (errors.length) console.log('CONSOLE ERRORS:', [...new Set(errors)].join('\n'));
