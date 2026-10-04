// Template film. Replace the scenes; keep the contract:
// draw(ctx, t, L, b) paints the frame at time t (seconds), b = t in beats.
// No state between frames. Size everything with L.u. Write times in beats.
(function () {
'use strict';
const { clamp, lerp, seg, E, spring, S, rand, noise1, rgba, letters } = M;

const BPM = 128, DUR = 7.5;             // 16 beats
const C = { bg: '#0d0d12', ink: '#f2eee6', hot: '#ff5a1f', cool: '#3b5bff' };
const FD = "'Helvetica Neue', Arial, sans-serif";
const FM = "'DejaVu Sans Mono', monospace";

// Every hit that should make a sound. audio.mjs reads this.
const cues = [
  { beat: 0, sfx: 'riser', len: 2 },
  { beat: 2, sfx: 'impact' },
  { beat: 5, sfx: 'whoosh' },
  { beat: 6, sfx: 'tick' }, { beat: 6.5, sfx: 'tick' }, { beat: 7, sfx: 'tick' }, { beat: 7.5, sfx: 'tick' },
  { beat: 9, sfx: 'pop' },
  { beat: 11, sfx: 'whoosh' },
  { beat: 12, sfx: 'impact' },
  { beat: 14, sfx: 'click' },
];

const film = M.film({ title: 'Template', BPM, DUR, cues, draw });
const sec = film.sec;

function draw(ctx, t, L, b) {
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, L.W, L.H);
  if (b < 5) hook(ctx, t, L, b);
  else if (b < 11) metric(ctx, t, L, b);
  else lockup(ctx, t, L, b);
  grain(ctx, t, L);
}

// ---- 0–5: the hook. Letters spring up out of a mask, second word slams in on beat 2.
function hook(ctx, t, L, b) {
  const size = (L.portrait ? 190 : 260) * L.u;
  const x = L.safe.x, y1 = L.cy - 0.05 * size, y2 = y1 + size * 0.95;
  ctx.save();
  if (b > 2 && b < 3) ctx.translate(noise1(t * 40, 3) * 8 * L.u * (3 - b), 0);   // shake on impact
  ctx.beginPath(); ctx.rect(0, y1 - size * 0.85, L.W, size * 2); ctx.clip();
  letters(ctx, 'STOP', x, y1, size, `900 ${FD}`, C.ink, i => {
    const p = spring(t - sec(0.25 + i * 0.12), S.bouncy);
    return { y: (1 - p) * size };
  }, { align: 'left' });
  letters(ctx, 'FADING.', x, y2, size, `900 ${FD}`, C.hot, i => {
    const p = spring(t - sec(2 + i * 0.05), S.snappy);
    return { y: (1 - p) * size * 1.1, r: (1 - p) * 0.3 };
  }, { align: 'left' });
  ctx.restore();
  // accent bar wipes across on the downbeat, exits on beat 4.25
  const inP = E.outExpo(seg(b, 2, 2.75)), outP = E.inExpo(seg(b, 4.25, 5));
  ctx.fillStyle = C.hot;
  ctx.fillRect(lerp(x, L.safe.r, outP), y2 + 0.18 * size, (L.safe.r - x) * (inP - outP), 10 * L.u);
}

// ---- 5–11: one metric. Bars spring to height, counter tracks the tallest bar.
function metric(ctx, t, L, b) {
  const n = 12, areaW = L.safe.w * (L.portrait ? 1 : 0.6), areaH = L.safe.h * (L.portrait ? 0.4 : 0.55);
  const x0 = L.safe.x, base = L.portrait ? L.cy + areaH * 0.6 : L.safe.b - 40 * L.u;
  const gap = areaW / n;
  const drift = (b - 5) * 6 * L.u;                       // slow camera drift
  ctx.save(); ctx.translate(-drift, 0);
  for (let i = 0; i < n; i++) {
    const target = 0.2 + 0.8 * Math.pow(i / (n - 1), 1.6) + (rand(i, 7) - 0.5) * 0.08;
    const p = spring(t - sec(5.5 + i * 0.25), S.bouncy);
    const exitP = E.inExpo(seg(b, 10.25, 11));
    const h = areaH * target * p * (1 - exitP);
    ctx.fillStyle = i === n - 1 ? C.hot : rgba(C.ink, 0.18 + 0.5 * i / n);
    ctx.fillRect(x0 + i * gap, base - h, gap * 0.72, h);
  }
  ctx.restore();
  const v = 3.2 * spring(t - sec(5.5), S.heavy);
  const tx = L.portrait ? L.safe.x : L.safe.x + areaW + 60 * L.u;
  const ty = L.portrait ? L.safe.y + 260 * L.u : L.cy;
  const vis = 1 - E.inExpo(seg(b, 10.25, 11));
  ctx.globalAlpha = vis;
  ctx.fillStyle = C.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.font = `900 ${220 * L.u}px ${FD}`;
  ctx.fillText(`${v.toFixed(1)}×`, tx, ty);
  ctx.font = `${32 * L.u}px ${FM}`; ctx.fillStyle = rgba(C.ink, 0.7);
  ctx.fillText('FASTER TO FINAL CUT', tx + 6 * L.u, ty + 60 * L.u);
  ctx.globalAlpha = 1;
}

// ---- 11–16: lockup. A disc springs open, wipes to colour, name assembles.
function lockup(ctx, t, L, b) {
  const R = Math.hypot(L.W, L.H);
  const r = R * spring(t - sec(11), S.gentle);
  ctx.fillStyle = C.cool; ctx.beginPath(); ctx.arc(L.cx, L.cy, Math.max(0, r), 0, M.TAU); ctx.fill();
  const r2 = R * spring(t - sec(11.75), S.settle);
  ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(L.cx, L.cy, Math.max(0, r2), 0, M.TAU); ctx.fill();
  const size = (L.portrait ? 150 : 200) * L.u;
  letters(ctx, 'MOTION', L.cx, L.cy + size * 0.35, size, `900 ${FD}`, C.bg, i => {
    const p = spring(t - sec(12 + i * 0.1), S.bouncy);
    return { y: (1 - p) * size * 0.6, s: 0.6 + 0.4 * p, a: clamp(p * 3) };
  }, { tracking: -4 * L.u });
  const cta = spring(t - sec(14), S.snappy);
  ctx.globalAlpha = clamp(cta);
  ctx.fillStyle = C.hot;
  const w = 360 * L.u, h = 72 * L.u, y = L.cy + size * 0.8 + (1 - cta) * 40 * L.u;
  ctx.fillRect(L.cx - w / 2, y, w, h);
  ctx.fillStyle = C.ink; ctx.font = `600 ${30 * L.u}px ${FD}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('START RENDERING →', L.cx, y + h / 2);
  ctx.globalAlpha = 1;
}

// Seeded film grain: changes per frame index, identical on every render.
function grain(ctx, t, L) {
  const f = Math.floor(t * 24), n = 260;
  ctx.fillStyle = 'rgba(255,255,255,0.035)';
  for (let i = 0; i < n; i++) {
    const s = (1 + rand(i, f + 11) * 2) * L.u;
    ctx.fillRect(rand(i, f) * L.W, rand(i, f + 5) * L.H, s, s);
  }
}
})();
