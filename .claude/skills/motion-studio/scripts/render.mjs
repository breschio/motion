// Render a film to MP4: frames via headless Chromium, encode via ffmpeg.
// usage: node render.mjs <filmDir> [--aspect 16:9] [--fps 60] [--samples 8] [--workers 4]
//                                  [--short 1080] [--out out/name.mp4] [--keep-frames]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadPlaywright, args, filmDir, openFilm, grab, slug } from './common.mjs';

const { pos, o } = args({ aspect: '16:9', fps: 60, samples: 8, workers: 4, short: 1080 });
const dir = filmDir(pos[0]);
const name = path.basename(dir);
const fps = +o.fps, samples = +o.samples, workers = +o.workers;
const outFile = path.resolve(dir, o.out || `out/${name}_${slug(o.aspect)}.mp4`);
const frames = path.join(dir, 'out', `.frames_${slug(o.aspect)}_${fps}`);
fs.rmSync(frames, { recursive: true, force: true });
fs.mkdirSync(frames, { recursive: true });
fs.mkdirSync(path.dirname(outFile), { recursive: true });

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const probe = await openFilm(browser, dir, { aspect: o.aspect, fps, short: o.short });
const meta = await probe.evaluate(() => window.FILM.meta);
await probe.close();
const total = Math.round(meta.DUR * fps);
console.log(`${name} ${o.aspect} ${meta.W}x${meta.H} ${fps}fps ${total} frames, ${samples} samples`);

let next = 0, done = 0;
const t0 = Date.now();
await Promise.all(Array.from({ length: Math.min(workers, total) }, async () => {
  const page = await openFilm(browser, dir, { aspect: o.aspect, fps, short: o.short });
  while (next < total) {
    const f = next++;
    const b64 = await grab(page, f / fps, samples);
    fs.writeFileSync(path.join(frames, `f_${String(f).padStart(5, '0')}.png`), Buffer.from(b64, 'base64'));
    if (++done % fps === 0) console.log(`  ${done}/${total}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  await page.close();
}));
await browser.close();

const wav = path.join(dir, 'audio', 'score.wav');
const ff = ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(frames, 'f_%05d.png')];
if (fs.existsSync(wav)) ff.push('-i', wav, '-c:a', 'aac', '-b:a', '256k', '-shortest');
else console.log('  no audio/score.wav — rendering silent (run audio.mjs first)');
ff.push('-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outFile);
const r = spawnSync('ffmpeg', ff, { stdio: 'inherit' });
if (r.status !== 0) { console.error('ffmpeg failed'); process.exit(1); }
if (!o['keep-frames']) fs.rmSync(frames, { recursive: true, force: true });
console.log(`wrote ${path.relative(process.cwd(), outFile)} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
