// Contact sheet of a tour capture set: 4 columns, label = view name. No dependency beyond Playwright.
// Usage: node tools/dev/contact-sheet.ts <dir of .jpg> <out.jpg> [--cell=480]
import { chromium } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
const [dir, out, ...rest] = process.argv.slice(2);
const cell = +(rest.find((a) => a.startsWith('--cell='))?.slice(7) ?? 480);
const files = readdirSync(dir).filter((f) => f.endsWith('.jpg')).sort();
const first = readFileSync(`${dir}/${files[0]}`);
const html = `<body style="margin:0;background:#111;font:14px sans-serif;color:#fff"><div style="display:grid;grid-template-columns:repeat(4,${cell}px);gap:4px">${files.map((f) => `<figure style="margin:0;position:relative"><img style="width:${cell}px;display:block" src="data:image/jpeg;base64,${readFileSync(`${dir}/${f}`).toString('base64')}"><figcaption style="position:absolute;left:0;bottom:0;background:#000b;padding:2px 6px">${f.replace('.jpg', '')}</figcaption></figure>`).join('')}</div></body>`;
void first;
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: cell * 4 + 12, height: 400 } });
await page.setContent(html);
await page.waitForTimeout(500);
await page.screenshot({ path: out, type: 'jpeg', quality: 80, fullPage: true });
await browser.close();
