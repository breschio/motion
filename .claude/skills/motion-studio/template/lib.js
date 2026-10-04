// Motion studio runtime. Pure functions of time plus a tiny film harness.
// Exposes window.M (helpers) and, after M.film({...}), window.FILM.
(function () {
'use strict';

const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (x, a, b) => clamp((x - a) / (b - a));       // 0..1 progress of x through [a, b]

// ---------------------------------------------------------------- easing
// For camera moves and wipes. Use springs for objects.
const E = {
  lin: t => t,
  outCubic: t => 1 - Math.pow(1 - t, 3),
  inCubic: t => t * t * t,
  inOutCubic: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outQuart: t => 1 - Math.pow(1 - t, 4),
  outExpo: t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inExpo: t => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  inOutExpo: t => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2),
};

// ---------------------------------------------------------------- springs
// Closed-form damped harmonic oscillator from 0 to 1 with initial velocity v0
// (in units of "distance per second", where distance 1 = the whole move).
// Returns { x, v } at time t (seconds since the spring started). Pure in t.
function springState(t, { stiffness = 170, damping = 26, mass = 1, v0 = 0 } = {}) {
  if (t <= 0) return { x: 0, v: 0 };
  const w = Math.sqrt(stiffness / mass);
  const z = damping / (2 * Math.sqrt(stiffness * mass));
  if (z < 1) {                                   // underdamped: overshoots and settles
    const a = z * w, wd = w * Math.sqrt(1 - z * z);
    const B = (v0 - a) / wd, e = Math.exp(-a * t), c = Math.cos(wd * t), s = Math.sin(wd * t);
    return { x: 1 + e * (-c + B * s), v: e * (v0 * c + (wd - a * B) * s) };
  }
  if (z === 1) {                                 // critically damped
    const B = v0 - w, e = Math.exp(-w * t);
    return { x: 1 + (-1 + B * t) * e, v: e * (v0 - w * B * t) };
  }
  const q = w * Math.sqrt(z * z - 1);            // overdamped
  const r1 = -z * w + q, r2 = -z * w - q;
  const C1 = (v0 + r2) / (r1 - r2), C2 = -1 - C1;
  const e1 = Math.exp(r1 * t), e2 = Math.exp(r2 * t);
  return { x: 1 + C1 * e1 + C2 * e2, v: r1 * C1 * e1 + r2 * C2 * e2 };
}
const spring = (t, o) => springState(t, o).x;
const springV = (t, o) => springState(t, o).v;
// Value moving from `from` to `to`, starting at time t0.
const springTo = (t, t0, from, to, o) => lerp(from, to, spring(t - t0, o));
// Presets. Tune per film, but start here.
const S = {
  snappy: { stiffness: 380, damping: 30 },
  gentle: { stiffness: 120, damping: 20 },
  bouncy: { stiffness: 260, damping: 14 },
  heavy:  { stiffness: 90, damping: 18, mass: 2 },
  settle: { stiffness: 200, damping: 40 },       // overdamped, no overshoot
};

// Hand off from one spring to the next with matched velocity at the seam.
// Returns options for the second spring given the first's state at the seam.
function handoff(prevT, prevOpts, prevFrom, prevTo, nextFrom, nextTo, nextOpts = prevOpts) {
  const v = springV(prevT, prevOpts) * (prevTo - prevFrom);   // absolute velocity
  const span = nextTo - nextFrom || 1;
  return { ...nextOpts, v0: v / span };
}

// ---------------------------------------------------------------- seeded noise
function hash(n) {
  n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n ^= n >>> 4;
  n = Math.imul(n, 0x27d4eb2d); n ^= n >>> 15; return (n >>> 0) / 4294967296;
}
const rand = (i, seed = 1) => hash((i * 374761393 + seed * 668265263) | 0);
// Smooth 1D value noise in [-1, 1].
function noise1(x, seed = 1) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return lerp(rand(i, seed), rand(i + 1, seed), u) * 2 - 1;
}

// ---------------------------------------------------------------- layout
// 1 unit (u) = 1/1080 of the short side, so a 1080p design scales to any aspect.
function layout(W, H) {
  const u = Math.min(W, H) / 1080, m = 0.06 * Math.min(W, H);
  return {
    W, H, u, cx: W / 2, cy: H / 2,
    portrait: H > W * 1.05, square: Math.abs(W - H) < W * 0.05, landscape: W > H * 1.05,
    safe: { x: m, y: m, w: W - 2 * m, h: H - 2 * m, r: W - m, b: H - m },
  };
}

// ---------------------------------------------------------------- color + text
function rgba(hex, a = 1) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}
// CSS font shorthand from a size and a family that may carry a weight/style prefix ("900 Inter").
function font(size, family) {
  const m = family.match(/^((?:italic|bold|normal|\d{3})\s+)+/);
  return m ? `${m[0]}${size}px ${family.slice(m[0].length)}` : `${size}px ${family}`;
}
// Draw a string letter by letter; fn(i, n) returns {x, y, s, r, a} offsets per letter.
function letters(ctx, str, x, y, size, family, color, fn, { align = 'center', tracking = 0 } = {}) {
  ctx.font = font(size, family);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  const chars = [...str];
  const ws = chars.map(ch => ctx.measureText(ch).width);
  const total = ws.reduce((s, w) => s + w, 0) + tracking * (chars.length - 1);
  let lx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  for (let i = 0; i < chars.length; i++) {
    const o = (fn && fn(i, chars.length)) || {};
    if (o.a !== 0) {
      ctx.save();
      ctx.translate(lx + ws[i] / 2 + (o.x || 0), y + (o.y || 0));
      if (o.r) ctx.rotate(o.r);
      if (o.s !== undefined) ctx.scale(o.s, o.s);
      ctx.globalAlpha *= o.a === undefined ? 1 : o.a;
      ctx.fillStyle = color;
      ctx.fillText(chars[i], -ws[i] / 2, 0);
      ctx.restore();
    }
    lx += ws[i] + tracking;
  }
  return total;
}

// ---------------------------------------------------------------- film harness
// M.film({ title, BPM, DUR, cues, draw(ctx, t, L, b) })
function film(def) {
  const q = new URLSearchParams(location.search);
  const [aw, ah] = (q.get('aspect') || '16:9').split(':').map(Number);
  const short = +(q.get('short') || 1080);
  const W = Math.round(aw >= ah ? short * aw / ah : short) & ~1;
  const H = Math.round(aw >= ah ? short : short * ah / aw) & ~1;
  const FPS = +(q.get('fps') || 60);
  const B = 60 / def.BPM;
  const beat = t => t / B;               // seconds -> beats
  const sec = b => b * B;                // beats -> seconds

  const out = document.getElementById('c');
  out.width = W; out.height = H;
  const octx = out.getContext('2d');
  const sub = document.createElement('canvas'); sub.width = W; sub.height = H;
  const sctx = sub.getContext('2d');
  const L = layout(W, H);

  function paint(ctx, t) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    def.draw(ctx, clamp(t, 0, def.DUR), L, beat(t));
    ctx.restore();
  }
  function seek(t) { paint(octx, t); }
  // Motion blur: average `samples` sub-frames over a 180° shutter.
  function renderFrame(t, samples = 1, shutter = 0.5) {
    if (samples <= 1) return seek(t);
    for (let i = 0; i < samples; i++) {
      paint(sctx, t + (i / samples) * shutter / FPS);
      octx.globalAlpha = 1 / (i + 1);
      octx.drawImage(sub, 0, 0);
    }
    octx.globalAlpha = 1;
  }

  const ready = Promise.all([...document.fonts].map(f => f.load().catch(() => {})))
    .then(() => document.fonts.ready);
  window.FILM = {
    meta: { title: def.title || document.title, BPM: def.BPM, DUR: def.DUR, cues: def.cues || [], W, H, FPS },
    seek, renderFrame, ready, beat, sec,
  };

  // Live preview: plays in real time unless ?render. Click restarts.
  if (!q.has('render')) {
    ready.then(() => {
      let start = performance.now();
      out.addEventListener('click', () => { start = performance.now(); });
      const loop = now => { seek(((now - start) / 1000) % def.DUR); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    });
  }
  return window.FILM;
}

window.M = {
  TAU, clamp, lerp, seg, E, spring, springV, springState, springTo, handoff, S,
  hash, rand, noise1, layout, rgba, font, letters, film,
};
})();
