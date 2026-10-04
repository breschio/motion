// Render stills and tile them into a contact sheet for the critique loop.
// Default: a still just after every beat (every half-beat if the film has < 24 beats).
// usage: node contact-sheet.mjs <filmDir> [--aspect 16:9] [--times 0.5,1.2,...] [--every 1] [--cols 6] [--samples 4]
// Writes out/stills_<aspect>/NNN.png (unlabelled, full res) and out/contact_<aspect>.png (labelled grid).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadPlaywright, args, filmDir, openFilm, slug } from './common.mjs';

const { pos, o } = args({ aspect: '16:9', cols: 6, samples: 4 });
const dir = filmDir(pos[0]);
const a = slug(o.aspect);
const stills = path.join(dir, 'out', `stills_${a}`);
const cells = path.join(dir, 'out', `.cells_${a}`);
for (const d of [stills, cells]) { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); }

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const page = await openFilm(browser, dir, { aspect: o.aspect });
const meta = await page.evaluate(() => window.FILM.meta);
const B = 60 / meta.BPM, beats = meta.DUR / B;

let times;
if (o.times) times = String(o.times).split(',').map(Number);
else {
  const step = +(o.every || (beats < 24 ? 0.5 : 1));
  times = [];
  for (let b = 0; b < beats - 1e-6; b += step) times.push(Math.min(meta.DUR - 1 / 60, b * B + 0.12));
}

const cellW = meta.W >= meta.H ? 480 : 300;
const index = [];
for (const [i, t] of times.entries()) {
  const [full, cell] = await page.evaluate(([t, s, cw]) => {
    window.FILM.renderFrame(t, s);
    const c = document.getElementById('c');
    const full = c.toDataURL('image/png').split(',')[1];
    const k = document.createElement('canvas');
    k.width = cw; k.height = Math.round(cw * c.height / c.width / 2) * 2;
    const x = k.getContext('2d');
    x.drawImage(c, 0, 0, k.width, k.height);
    const label = `${t.toFixed(2)}s  b${(t * window.FILM.meta.BPM / 60).toFixed(1)}`;
    x.font = '600 15px monospace';
    x.fillStyle = 'rgba(0,0,0,0.65)'; x.fillRect(4, 4, x.measureText(label).width + 12, 22);
    x.fillStyle = '#fff'; x.fillText(label, 10, 20);
    x.strokeStyle = '#000'; x.lineWidth = 2; x.strokeRect(0, 0, k.width, k.height);
    return [full, k.toDataURL('image/png').split(',')[1]];
  }, [t, +o.samples, cellW]);
  const n = String(i).padStart(3, '0');
  fs.writeFileSync(path.join(stills, `${n}.png`), Buffer.from(full, 'base64'));
  fs.writeFileSync(path.join(cells, `${n}.png`), Buffer.from(cell, 'base64'));
  index.push(`${n}.png  t=${t.toFixed(3)}s  beat=${(t / B).toFixed(2)}`);
}
await browser.close();
fs.writeFileSync(path.join(stills, 'index.txt'), index.join('\n') + '\n');

const cols = Math.min(+o.cols, times.length), rows = Math.ceil(times.length / cols);
const sheet = path.join(dir, 'out', `contact_${a}.png`);
const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(cells, '%03d.png'),
  '-vf', `tile=${cols}x${rows}`, '-frames:v', '1', sheet], { stdio: 'inherit' });
fs.rmSync(cells, { recursive: true, force: true });
if (r.status !== 0) { console.error('ffmpeg tiling failed; stills are in', stills); process.exit(1); }
console.log(`${times.length} stills -> ${path.relative(process.cwd(), sheet)}  (index: ${path.relative(process.cwd(), stills)}/index.txt)`);
