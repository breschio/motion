// Offline renderer: drives reel.js in headless Chromium and writes PNG frames.
// usage: node render.mjs <outDir> [--times 1.2,3.4] [--samples 6] [--workers 4]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const outDir = path.resolve(args[0] || 'frames');
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const samples = +opt('--samples', 6);
const workers = +opt('--workers', 4);
fs.mkdirSync(outDir, { recursive: true });

const FPS = 60, DUR = 15;
const jobs = opt('--times', null)
  ? opt('--times').split(',').map((s, i) => ({ t: +s, name: `still_${String(i).padStart(2, '0')}_${s}s.png` }))
  : Array.from({ length: FPS * DUR }, (_, f) => ({ t: f / FPS, name: `f_${String(f).padStart(4, '0')}.png` }));

const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const url = pathToFileURL(path.join(here, 'index.html')).href + '?render';
let next = 0, done = 0;
const t0 = Date.now();
await Promise.all(Array.from({ length: Math.min(workers, jobs.length) }, async () => {
  const page = await browser.newPage();
  page.on('pageerror', e => { console.error('page error:', e.message); process.exit(1); });
  await page.goto(url);
  await page.evaluate(() => window.REEL.ready);
  while (next < jobs.length) {
    const job = jobs[next++];
    const b64 = await page.evaluate(([t, s]) => {
      window.REEL.renderFrame(t, s);
      return document.getElementById('c').toDataURL('image/png').split(',')[1];
    }, [job.t, samples]);
    fs.writeFileSync(path.join(outDir, job.name), Buffer.from(b64, 'base64'));
    if (++done % 60 === 0) console.log(`${done}/${jobs.length}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  await page.close();
}));
await browser.close();
console.log(`rendered ${done} frames in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
