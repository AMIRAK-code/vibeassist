// Frame-accurate renderer: N headless Chrome workers each render an interleaved slice
// of frames (every frame is a pure function of t), then ffmpeg muxes frames + soundtrack.
// Usage: node render.mjs [fps=60] [workers=6] [out=vibeassist-ad.mp4]
import puppeteer from 'puppeteer-core';
import ffmpegPath from 'ffmpeg-static';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const dir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
const FPS = +(process.argv[2] || 60), WORKERS = +(process.argv[3] || Math.max(2, Math.min(8, os.cpus().length - 2)));
const OUT = path.resolve(dir, process.argv[4] || 'vibeassist-ad.mp4');
const DUR = 30, TOTAL = FPS * DUR, FRAMES = path.join(dir, 'frames');
fs.rmSync(FRAMES, { recursive: true, force: true }); fs.mkdirSync(FRAMES, { recursive: true });

const url = pathToFileURL(path.join(dir, 'ad.html')).href + '?render=1';
const t0 = Date.now(); let done = 0;
async function worker(w) {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars', '--force-device-scale-factor=1', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
  const page = await browser.newPage();
  page.on('pageerror', e => console.log(`[w${w}] pageerror`, e.message));
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.evaluate(() => window.__ready);
  for (let f = w; f < TOTAL; f += WORKERS) {
    await page.evaluate(t => window.renderAt(t), f / FPS);
    await page.screenshot({ path: path.join(FRAMES, `f${String(f).padStart(5, '0')}.png`), type: 'png', optimizeForSpeed: true });
    if (++done % 60 === 0) { const s = (Date.now() - t0) / 1000; process.stdout.write(`\r${done}/${TOTAL} frames  ${(done / s).toFixed(1)} fps  eta ${((TOTAL - done) / (done / s)).toFixed(0)}s   `); }
  }
  const proc = browser.process();
  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 4000))]);
  try { proc && proc.kill('SIGKILL'); } catch { }
}
await Promise.all([...Array(WORKERS)].map((_, w) => worker(w)));
console.log(`\nframes rendered in ${((Date.now() - t0) / 1000).toFixed(0)}s — encoding…`);

const args = ['-hide_banner', '-y', '-framerate', String(FPS), '-i', path.join(FRAMES, 'f%05d.png'), '-i', path.join(dir, 'soundtrack.wav'),
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-maxrate', '24M', '-bufsize', '48M', '-tune', 'film', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.2',
  '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-vf', 'scale=out_color_matrix=bt709',
  '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-shortest', '-movflags', '+faststart', OUT];
const r = spawnSync(ffmpegPath, args, { stdio: ['ignore', 'inherit', 'pipe'] });
if (r.status !== 0) { console.error(r.stderr.toString().slice(-3000)); process.exit(1); }
console.log('wrote', OUT, (fs.statSync(OUT).size / 1e6).toFixed(1) + ' MB');
