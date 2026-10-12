// Vision Grounding: starts the app, takes screenshots of the configured pages at phone, tablet
// and desktop widths with Playwright, checks for overflow, broken images and console errors,
// and sends the screenshots to VibeAssist, where Claude looks for layout problems.
import { spawn } from 'node:child_process';
import { context, env, report } from './lib.mjs';

const ctx = context();
const playwrightPath = env('PLAYWRIGHT_MODULE');
const { chromium } = await import(playwrightPath);
const base = env('VISION_BASE_URL', 'http://localhost:3000').replace(/\/$/, '');
const paths = env('VISION_URLS', '/').split(/[\s,]+/).filter(Boolean).slice(0, 6);
const widths = [390, 768, 1440];
const MAX_IMAGES = 6;

let server = null;
if (env('START_COMMAND')) {
  server = spawn(env('START_COMMAND'), { shell: true, stdio: 'ignore', detached: true });
  const waitOn = env('WAIT_ON', base);
  const deadline = Date.now() + 120_000;
  for (;;) {
    try {
      if ((await fetch(waitOn)).ok) break;
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) {
      await report({ repo: ctx.repo, sha: ctx.sha, ref: ctx.ref, pr_number: ctx.prNumber, run_url: ctx.runUrl, module: 'vision', status: 'failed', summary: `The app didn't answer at ${waitOn} within 2 minutes.` });
      process.exit(0);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

const browser = await chromium.launch();
const findings = [];
const images = [];
// Spread the screenshot budget: every page at phone width first, then wider ones
const shots = widths.flatMap((w) => paths.map((p) => ({ p, w }))).slice(0, MAX_IMAGES);
for (const { p, w } of shots) {
  const page = await browser.newPage({ viewport: { width: w, height: Math.round(w * (w < 800 ? 2 : 0.66)) } });
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)));
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
  try {
    await page.goto(`${base}${p}`, { waitUntil: 'networkidle', timeout: 30_000 });
  } catch (error) {
    findings.push({ severity: 'high', category: 'load', title: `Page didn't load: ${p}`, file: `${p} @ ${w}px`, evidence: String(error.message).slice(0, 200), fix: 'Check that the page loads on its own and the start command serves it.' });
    await page.close();
    continue;
  }
  const checks = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    broken: [...document.images].filter((img) => img.complete && img.naturalWidth === 0).map((img) => img.currentSrc || img.src).slice(0, 5),
  }));
  if (checks.overflow > 1) findings.push({ severity: w < 800 ? 'high' : 'medium', category: 'layout', title: `Page is ${checks.overflow}px wider than the screen`, file: `${p} @ ${w}px`, evidence: `scrollWidth exceeds viewport by ${checks.overflow}px`, fix: 'Find the element that is too wide (often a table, image or long word) and let it shrink or wrap.' });
  for (const src of checks.broken) findings.push({ severity: 'medium', category: 'images', title: 'Broken image', file: `${p} @ ${w}px`, evidence: src.slice(0, 200), fix: 'Fix the image path or remove the image.' });
  for (const e of [...new Set(errors)].slice(0, 3)) findings.push({ severity: 'medium', category: 'console', title: 'Error in the browser console', file: `${p} @ ${w}px`, evidence: e, fix: 'Open the page with the browser console and fix the error.' });
  const jpeg = await page.screenshot({ type: 'jpeg', quality: 70, fullPage: false });
  images.push({ url: p, viewport: w, data: jpeg.toString('base64') });
  await page.close();
}
await browser.close();
if (server) process.kill(-server.pid);

await report({
  repo: ctx.repo, sha: ctx.sha, ref: ctx.ref, pr_number: ctx.prNumber, run_url: ctx.runUrl, module: 'vision', status: 'succeeded',
  summary: '', stats: { screenshots: images.length, pages: paths.length }, findings, images,
});
