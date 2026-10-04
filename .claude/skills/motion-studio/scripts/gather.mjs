// Gather real brand assets from a website: screenshots, palette, fonts, logo candidates.
// usage: node gather.mjs <url> <outDir> [--mobile]
// Writes: shot_viewport.png, shot_full.png, [shot_mobile.png], palette.json, fonts.json,
//         logo_*.{svg,png,...}, assets.md (a summary to show the user before animating).
import fs from 'node:fs';
import path from 'node:path';
import { loadPlaywright, args } from './common.mjs';

const { pos, o } = args({});
const [url, outArg] = pos;
if (!url) { console.error('usage: node gather.mjs <url> <outDir>'); process.exit(1); }
const out = path.resolve(outArg || 'assets');
fs.mkdirSync(out, { recursive: true });

const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(e => console.warn('load:', e.message));
await page.waitForTimeout(1200);
await page.screenshot({ path: path.join(out, 'shot_viewport.png') });
await page.screenshot({ path: path.join(out, 'shot_full.png'), fullPage: true }).catch(() => {});

const info = await page.evaluate(() => {
  const count = new Map(), fonts = new Map();
  const bump = (m, k, w = 1) => k && m.set(k, (m.get(k) || 0) + w);
  const els = [...document.querySelectorAll('body *')].slice(0, 4000);
  for (const el of els) {
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    const area = Math.min(r.width * r.height, 4e5);
    if (!area || cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (cs.backgroundColor && !/rgba\(.*, 0\)$/.test(cs.backgroundColor)) bump(count, cs.backgroundColor, area / 1000);
    if (el.childNodes.length && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) {
      bump(count, cs.color, 5);
      bump(fonts, `${cs.fontFamily.split(',')[0].replace(/["']/g, '').trim()} ${cs.fontWeight}`, parseFloat(cs.fontSize));
    }
  }
  const hex = c => { const m = c.match(/\d+(\.\d+)?/g); if (!m) return c; return '#' + m.slice(0, 3).map(v => (+v).toString(16).padStart(2, '0')).join(''); };
  const merged = new Map();
  for (const [c, w] of count) bump(merged, hex(c), w);
  const logos = [];
  const push = (src, why) => src && !logos.some(l => l.src === src) && logos.push({ src, why });
  document.querySelectorAll('link[rel*="icon"], link[rel="apple-touch-icon"]').forEach(l => push(l.href, l.rel));
  document.querySelectorAll('meta[property="og:image"]').forEach(m => push(m.content, 'og:image'));
  document.querySelectorAll('header img, nav img, a[href="/"] img, img[alt*="logo" i], img[src*="logo" i], img[class*="logo" i]')
    .forEach(i => push(i.currentSrc || i.src, 'img'));
  const svgs = [...document.querySelectorAll('header svg, nav svg, a[href="/"] svg, svg[class*="logo" i]')]
    .slice(0, 4).map(s => s.outerHTML);
  const fontFiles = [...document.styleSheets].flatMap(ss => { try { return [...ss.cssRules]; } catch { return []; } })
    .filter(r => r.constructor.name === 'CSSFontFaceRule')
    .map(r => ({ family: r.style.getPropertyValue('font-family').replace(/["']/g, ''), weight: r.style.getPropertyValue('font-weight'), src: (r.style.getPropertyValue('src').match(/url\(["']?([^"')]+)/) || [])[1] }))
    .filter(f => f.src).map(f => ({ ...f, src: new URL(f.src, document.baseURI).href }));
  return {
    title: document.title,
    description: document.querySelector('meta[name="description"]')?.content || '',
    headings: [...document.querySelectorAll('h1, h2')].map(h => h.innerText.trim()).filter(Boolean).slice(0, 12),
    palette: [...merged].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([hex, w]) => ({ hex, weight: Math.round(w) })),
    fonts: [...fonts].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([f]) => f),
    fontFiles, logos, svgs,
  };
});

if (o.mobile) {
  const m = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
  await m.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await m.screenshot({ path: path.join(out, 'shot_mobile.png') });
}

const saved = [];
const fetchTo = async (src, base) => {
  try {
    const r = await page.request.get(src);
    if (!r.ok()) return;
    const ext = (src.split('?')[0].match(/\.(svg|png|jpe?g|webp|ico|gif|woff2?|ttf|otf)$/i) || [, 'bin'])[1].toLowerCase();
    const f = `${base}.${ext}`;
    fs.writeFileSync(path.join(out, f), await r.body());
    saved.push(f);
  } catch {}
};
for (const [i, l] of info.logos.slice(0, 8).entries()) await fetchTo(l.src, `logo_${i}`);
info.svgs.forEach((s, i) => { const f = `logo_inline_${i}.svg`; fs.writeFileSync(path.join(out, f), s); saved.push(f); });
for (const f of info.fontFiles.slice(0, 6)) await fetchTo(f.src, `font_${f.family.replace(/\W+/g, '_')}_${f.weight || 'normal'}`);
await browser.close();

fs.writeFileSync(path.join(out, 'palette.json'), JSON.stringify(info.palette, null, 2));
fs.writeFileSync(path.join(out, 'fonts.json'), JSON.stringify({ used: info.fonts, files: info.fontFiles }, null, 2));
const md = [
  `# Assets from ${url}`, '', `**${info.title}** — ${info.description}`, '',
  '## Headlines on the page', ...info.headings.map(h => `- ${h}`), '',
  '## Palette (by visual weight)', ...info.palette.map(p => `- ${p.hex} (${p.weight})`), '',
  '## Fonts in use', ...info.fonts.map(f => `- ${f}`), '',
  '## Files', '- shot_viewport.png, shot_full.png' + (o.mobile ? ', shot_mobile.png' : ''), ...saved.map(f => `- ${f}`), '',
].join('\n');
fs.writeFileSync(path.join(out, 'assets.md'), md);
console.log(md);
