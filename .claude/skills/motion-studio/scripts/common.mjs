// Shared helpers: find Playwright (local or global), open a film page, parse args.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export async function loadPlaywright() {
  try { return await import('playwright'); } catch {}
  const roots = [path.resolve('node_modules')];
  try { roots.push(execSync('npm root -g', { encoding: 'utf8' }).trim()); } catch {}
  for (const r of roots) {
    try { return createRequire(path.join(r, 'noop.js'))('playwright'); } catch {}
  }
  console.error('playwright not found. Install it with: npm i -D playwright');
  process.exit(1);
}

export function args(defaults) {
  const a = process.argv.slice(2), pos = [], o = { ...defaults };
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith('--')) {
      const k = a[i].slice(2), next = a[i + 1];
      if (next === undefined || next.startsWith('--')) o[k] = true; else { o[k] = next; i++; }
    } else pos.push(a[i]);
  }
  return { pos, o };
}

export function filmDir(p) {
  const dir = path.resolve(p || '.');
  if (!fs.existsSync(path.join(dir, 'index.html'))) {
    console.error(`no index.html in ${dir}`); process.exit(1);
  }
  return dir;
}

export const slug = s => String(s).replace(/:/g, 'x');

export async function openFilm(browser, dir, { aspect = '16:9', fps = 60, short = 1080 } = {}) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const url = pathToFileURL(path.join(dir, 'index.html')).href + `?render&aspect=${aspect}&fps=${fps}&short=${short}`;
  await page.goto(url);
  await page.waitForFunction(() => window.FILM, null, { timeout: 15000 }).catch(() => {});
  if (errors.length) { console.error('page error:\n' + errors.join('\n')); process.exit(1); }
  await page.evaluate(() => window.FILM.ready);
  page.on('pageerror', e => { console.error('page error:', e.message); process.exit(1); });
  return page;
}

export const grab = (page, t, samples) => page.evaluate(([t, s]) => {
  window.FILM.renderFrame(t, s);
  return document.getElementById('c').toDataURL('image/png').split(',')[1];
}, [t, samples]);
