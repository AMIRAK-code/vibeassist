// Usage: node stills.mjs 1.2 4.5 8.0 ...   -> stills/t_<time>.png (+ contact sheet when many)
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const dir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
const times = process.argv.slice(2).map(Number);
fs.mkdirSync(path.join(dir, 'stills'), { recursive: true });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars', '--force-device-scale-factor=1', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warn') console.log('[page]', m.text()); });
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(path.join(dir, 'ad.html')).href + '?render=1', { waitUntil: 'networkidle0' });
await page.evaluate(() => window.__ready);
for (const t of times) {
  await page.evaluate(t => window.renderAt(t), t);
  const f = path.join(dir, 'stills', `t_${t.toFixed(2)}.png`);
  await page.screenshot({ path: f });
  console.log('wrote', f);
}
await browser.close();
