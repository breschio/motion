// Claude — Showreel 2026
// Every frame is a pure function of time, so the reel can be played live
// or rendered offline with true sub-frame motion blur.
(function () {
'use strict';

const W = 1920, H = 1080, FPS = 60, DUR = 15;
const BPM = 128, B = 60 / BPM;            // 32 beats = 15.0 s
const C = { bg: '#0b0b10', ink: '#f3efe6', hot: '#ff4d1c', cob: '#2b45ff' };
const FD = "'Archivo Black', sans-serif";
const FS = "'Space Grotesk', sans-serif";
const FM = "'JetBrains Mono', monospace";
const TAU = Math.PI * 2;
const CX = W / 2, CY = H / 2;

// ---------------------------------------------------------------- math
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const seg = (x, a, b) => clamp((x - a) / (b - a));
const lerp = (a, b, t) => a + (b - a) * t;
const E = {
  lin: t => t,
  outCubic: t => 1 - Math.pow(1 - t, 3),
  inCubic: t => t * t * t,
  inOutCubic: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outQuart: t => 1 - Math.pow(1 - t, 4),
  inExpo: t => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  outExpo: t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutExpo: t => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2),
  outBack: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  outElastic: t => (t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * TAU / 3) + 1),
  outBounce: t => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
};
const pulse = (b, at, k = 10) => (b >= at ? Math.exp(-(b - at) * k) : 0);
function hash(n) {
  n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n ^= n >>> 4;
  n = Math.imul(n, 0x27d4eb2d); n ^= n >>> 15; return (n >>> 0) / 4294967296;
}
function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

// ---------------------------------------------------------------- canvas
const out = document.getElementById('c');
const octx = out.getContext('2d');
const sub = document.createElement('canvas'); sub.width = W; sub.height = H;
const sctx = sub.getContext('2d');

let hudDark = false;   // HUD colour for the current background
let section = 0;

function fillBg(ctx, col) { ctx.fillStyle = col; ctx.fillRect(-400, -400, W + 800, H + 800); }

// Lay a string out letter by letter; fn(i) returns a per-letter transform.
function letters(ctx, str, x, y, size, font, color, fn, spacing = 0) {
  ctx.font = `${size}px ${font}`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  const chars = [...str];
  const ws = chars.map(ch => ctx.measureText(ch).width);
  const total = ws.reduce((a, w) => a + w, 0) + spacing * (chars.length - 1);
  let lx = x - total / 2;
  for (let i = 0; i < chars.length; i++) {
    const o = (fn && fn(i, chars.length, lx + ws[i] / 2)) || {};
    if (o.a !== 0) {
      ctx.save();
      ctx.translate(lx + ws[i] / 2 + (o.x || 0), y + (o.y || 0));
      if (o.r) ctx.rotate(o.r);
      const sx = o.sx ?? o.s ?? 1, sy = o.sy ?? o.s ?? 1;
      if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
      if (o.a != null) ctx.globalAlpha *= o.a;
      if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.lw || 3; ctx.strokeText(chars[i], -ws[i] / 2, 0); }
      else { ctx.fillStyle = o.c || color; ctx.fillText(chars[i], -ws[i] / 2, 0); }
      ctx.restore();
    }
    lx += ws[i] + spacing;
  }
  return total;
}

function text(ctx, str, x, y, size, font, color, align = 'center', spacing = 0) {
  ctx.font = `${size}px ${font}`;
  ctx.letterSpacing = spacing + 'px';
  ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color; ctx.fillText(str, x, y);
  ctx.letterSpacing = '0px';
}

function crossGrid(ctx, alpha, col, step, ox, oy) {
  if (alpha <= 0) return;
  ctx.strokeStyle = rgba(col, alpha); ctx.lineWidth = 2;
  ctx.beginPath();
  const sx = ((ox % step) + step) % step, sy = ((oy % step) + step) % step;
  for (let x = sx - step; x < W + step; x += step)
    for (let y = sy - step; y < H + step; y += step) {
      ctx.moveTo(x - 7, y); ctx.lineTo(x + 7, y); ctx.moveTo(x, y - 7); ctx.lineTo(x, y + 7);
    }
  ctx.stroke();
}

function dotGrid(ctx, alpha, col, step) {
  if (alpha <= 0) return;
  ctx.fillStyle = rgba(col, alpha);
  for (let x = step / 2; x < W; x += step)
    for (let y = step / 2; y < H; y += step) ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
}

function ring(ctx, x, y, r, lw, col) {
  ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, TAU);
  ctx.lineWidth = lw; ctx.strokeStyle = col; ctx.stroke();
}
function disc(ctx, x, y, r, col) {
  ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, TAU); ctx.fillStyle = col; ctx.fill();
}

// ================================================================ S1  0–4  cold open
function S1(ctx, t, b) {
  fillBg(ctx, C.bg); hudDark = false; section = 0;

  dotGrid(ctx, 0.09 * E.outCubic(seg(b, 0, 1)) * (1 - seg(b, 2.4, 3)), C.ink, 60);

  // crosshair
  const l = E.outExpo(seg(b, 0.15, 1.3)), la = 0.3 * (1 - seg(b, 1.9, 2.3));
  if (la > 0) {
    ctx.strokeStyle = rgba(C.ink, la); ctx.lineWidth = 1.5; ctx.beginPath();
    ctx.moveTo(CX - l * W / 2, CY); ctx.lineTo(CX + l * W / 2, CY);
    ctx.moveTo(CX, CY - l * H / 2); ctx.lineTo(CX, CY + l * H / 2); ctx.stroke();
    // tick marks along the axes
    ctx.beginPath();
    for (let i = -15; i <= 15; i++) {
      const x = CX + i * 60; if (Math.abs(x - CX) > l * W / 2) continue;
      const h = i % 5 === 0 ? 12 : 5; ctx.moveTo(x, CY - h); ctx.lineTo(x, CY + h);
    }
    ctx.stroke();
  }

  // pulse rings
  for (const pb of [1, 1.5]) {
    const u = seg(b, pb, pb + 0.9);
    if (u > 0 && u < 1) ring(ctx, CX, CY, 14 + E.outExpo(u) * 300, 2, rgba(C.ink, (1 - u) * 0.7));
  }

  // typed command line
  const cmd = '> claude render --showreel 2026';
  const n = Math.floor(clamp((b - 0.3) * 26, 0, cmd.length));
  const ta = 1 - seg(b, 1.9, 2.2);
  if (b > 0.3 && ta > 0) {
    ctx.save(); ctx.globalAlpha = ta * 0.75;
    ctx.font = `24px ${FM}`; const fw = ctx.measureText(cmd).width;
    text(ctx, cmd.slice(0, n), CX - fw / 2, CY + 110, 24, FM, C.ink, 'left');
    ctx.font = `24px ${FM}`;
    const cw = ctx.measureText(cmd.slice(0, n)).width;
    if (Math.floor(t * 4) % 2 === 0 || n < cmd.length) { ctx.fillStyle = C.hot; ctx.fillRect(CX - fw / 2 + cw + 4, CY + 88, 13, 28); }
    ctx.restore();
  }

  // dot -> anticipation -> bar -> slit -> full frame
  if (b < 2) {
    const r = 11 * E.outBack(seg(b, 0.1, 0.5)) * (1 + 0.7 * pulse(b, 1, 12) + 0.7 * pulse(b, 1.5, 12));
    const sq = E.outCubic(seg(b, 1.7, 2));        // squash before the stretch
    ctx.save(); ctx.translate(CX, CY); ctx.scale(lerp(1, 0.55, sq), lerp(1, 1.5, sq));
    disc(ctx, 0, 0, r, C.ink); ctx.restore();
  } else {
    const w = lerp(26, W * 1.3, E.outExpo(seg(b, 2, 2.55)));
    let h = lerp(30, 6, E.outExpo(seg(b, 2, 2.25)));
    h = lerp(h, H * 0.36, E.inOutExpo(seg(b, 2.55, 3.3)));
    h = lerp(h, H * 1.1, E.inExpo(seg(b, 3.4, 4)));
    const open = seg(b, 2.5, 2.9);
    ctx.fillStyle = open > 0 ? C.hot : C.ink;
    const rr = Math.min(h / 2, 15);
    ctx.beginPath(); ctx.roundRect(CX - w / 2, CY - h / 2, w, h, rr); ctx.fill();
    if (open > 0 && h > 40) {
      ctx.save();
      ctx.beginPath(); ctx.rect(CX - w / 2, CY - h / 2, w, h); ctx.clip();
      const z = lerp(1, 1.6, E.inExpo(seg(b, 3.3, 4)));
      ctx.translate(CX, CY); ctx.scale(z, z);
      const size = 300, str = 'SHOWREEL ’26 — ';
      ctx.font = `${size}px ${FD}`; const sw = ctx.measureText(str).width;
      const x0 = -((t - 2 * B) * 700 % sw) - sw * 0.35;
      for (let k = -1; k < 3; k++) text(ctx, str, x0 + k * sw, size * 0.36, size, FD, C.bg, 'left');
      ctx.restore();
      // edge labels riding the slit
      const la2 = seg(b, 2.9, 3.1) * (1 - seg(b, 3.4, 3.6));
      if (la2 > 0) {
        ctx.save(); ctx.globalAlpha = la2;
        text(ctx, 'REEL_2026.MOV', 70, CY - h / 2 - 18, 20, FM, C.ink, 'left', 2);
        text(ctx, '15.000 SEC @ 128 BPM', W - 70, CY + h / 2 + 36, 20, FM, C.ink, 'right', 2);
        ctx.restore();
      }
    }
  }
}

// ================================================================ S2  4–8  kinetic type
function S2(ctx, t, b) {
  section = 1;
  const k = Math.min(3, Math.floor(b - 4)), u = b - 4 - k;
  if (k === 0) {
    fillBg(ctx, C.hot); hudDark = true;
    const size = 340, s = 1 + u * 0.05;
    ctx.save(); ctx.translate(CX, CY); ctx.scale(s, s);
    letters(ctx, 'EVERY', 0, size * 0.36, size, FD, C.bg, i => {
      const p = seg(u, i * 0.05, i * 0.05 + 0.42), e = E.outBack(p);
      return { y: (1 - e) * -760, r: (1 - E.outCubic(p)) * 0.5 * (i % 2 ? 1 : -1), a: p > 0 ? 1 : 0 };
    }, -6);
    ctx.restore();
    // falling streak accents
    for (let i = 0; i < 6; i++) {
      const p = seg(u, 0.05 + i * 0.07, 0.4 + i * 0.07);
      if (p <= 0 || p >= 1) continue;
      const x = 260 + i * 280, y = lerp(-200, H + 200, E.inOutCubic(p));
      ctx.fillStyle = rgba(C.bg, 0.25); ctx.fillRect(x, y - 160, 6, 160);
    }
  } else if (k === 1) {
    fillBg(ctx, C.bg); hudDark = false;
    const size = 300, s = lerp(1.3, 1, E.outExpo(seg(u, 0, 0.45)));
    ctx.save(); ctx.translate(CX, CY); ctx.scale(s, s);
    const tw = letters(ctx, 'FRAME', 0, size * 0.36, size, FD, C.ink, i => {
      const p = E.outExpo(seg(u, i * 0.03, i * 0.03 + 0.3));
      return { sy: p, a: p > 0 ? 1 : 0 };
    }, -4);
    // frame stroke drawing on
    const fw = tw + 140, fh = 380, per = 2 * (fw + fh);
    const p = E.outCubic(seg(u, 0.05, 0.6));
    ctx.strokeStyle = C.hot; ctx.lineWidth = 12; ctx.lineJoin = 'miter';
    ctx.setLineDash([per * p, per]); ctx.lineDashOffset = 0;
    ctx.beginPath(); ctx.rect(-fw / 2, -fh / 2, fw, fh); ctx.stroke(); ctx.setLineDash([]);
    // corner handles
    const ha = seg(u, 0.45, 0.6);
    if (ha > 0) {
      ctx.globalAlpha = ha; ctx.fillStyle = C.ink;
      for (const [x, y] of [[-fw / 2, -fh / 2], [fw / 2, -fh / 2], [fw / 2, fh / 2], [-fw / 2, fh / 2]]) ctx.fillRect(x - 11, y - 11, 22, 22);
      text(ctx, '1920 × 1080', -fw / 2, -fh / 2 - 28, 22, FM, C.hot, 'left', 2);
      text(ctx, '60 FPS', fw / 2, fh / 2 + 46, 22, FM, C.hot, 'right', 2);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  } else if (k === 2) {
    fillBg(ctx, C.ink); hudDark = true;
    const size = 360;
    // underline sweeping from centre
    const lw = E.outExpo(seg(u, 0.15, 0.55)) * 1100;
    ctx.fillStyle = C.hot; ctx.fillRect(CX - lw / 2, CY + 170, lw, 22);
    letters(ctx, 'IS A', CX, CY + size * 0.36, size, FD, C.bg, i => {
      if (i < 2) { const p = E.outExpo(seg(u, 0, 0.38)); return { x: (1 - p) * -1500, sx: 1 + (1 - p) * 0.8 }; }
      const p = E.outExpo(seg(u, 0.07, 0.45)); return { x: (1 - p) * 1500, sx: 1 + (1 - p) * 0.8 };
    }, 10);
  } else {
    fillBg(ctx, C.cob); hudDark = false;
    const size = 250, base = CY + size * 0.36;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, base - size * 0.9, W, size * 0.98); ctx.clip();
    const tw = letters(ctx, 'DECISION', CX - 40, base, size, FD, C.ink, i => {
      const p = E.outExpo(seg(u, i * 0.035, i * 0.035 + 0.35));
      return { y: (1 - p) * size * 1.05 };
    }, -2);
    ctx.restore();
    // the full stop becomes the next scene
    const pr = size * 0.085, px = CX - 40 + tw / 2 + pr + 18, py = base - pr;
    const ps = E.outBack(seg(u, 0.3, 0.5));
    const grow = E.inExpo(seg(u, 0.5, 1));
    disc(ctx, lerp(px, CX, grow * 0.5), lerp(py, CY, grow * 0.5), pr * ps + grow * 2600, C.ink);
  }
}

// ================================================================ S3  8–12  shape morph
const SHAPES = (() => {
  const poly = n => Array.from({ length: n }, (_, i) => { const a = -Math.PI / 2 + i * TAU / n; return [Math.cos(a), Math.sin(a)]; });
  const star = Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + i * TAU / 10, r = i % 2 ? 0.52 : 1.28; return [Math.cos(a) * r, Math.sin(a) * r]; });
  const square = [[-0.9, -0.9], [0.9, -0.9], [0.9, 0.9], [-0.9, 0.9]];
  const tri = poly(3).map(([x, y]) => [x * 1.3, y * 1.3 + 0.18]);
  return [
    { name: 'CIRCLE', r: () => 1, v: [] },
    { name: 'SQUARE', r: th => polyR(square, th), v: square },
    { name: 'TRIANGLE', r: th => polyR(tri, th), v: tri },
    { name: 'STAR', r: th => polyR(star, th), v: star },
    { name: 'BLOOM', r: th => 1 + 0.16 * Math.cos(8 * th), v: [] },
  ];
})();
function polyR(v, th) {
  const dx = Math.cos(th), dy = Math.sin(th);
  let best = 1e9;
  for (let i = 0; i < v.length; i++) {
    const [ax, ay] = v[i], [bx, by] = v[(i + 1) % v.length];
    const ex = bx - ax, ey = by - ay, den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-9) continue;
    const s = (ax * ey - ay * ex) / den, q = (ax * dy - ay * dx) / den;
    if (s > 0 && q >= -1e-6 && q <= 1 + 1e-6 && s < best) best = s;
  }
  return best === 1e9 ? 1 : best;
}
function shapeState(b) {
  const marks = [9, 10, 11, 11.5];
  let from = 0, to = 0, p = 1;
  for (let i = 0; i < marks.length; i++) if (b >= marks[i]) { from = i; to = i + 1; p = E.outExpo(seg(b, marks[i], marks[i] + 0.4)); }
  let rot = t3(b);
  const sc = E.outElastic(seg(b, 8, 8.9)) * (1 + 0.06 * pulse(b, Math.floor(b), 9)) + 10 * E.inExpo(seg(b, 11.6, 12));
  return { from, to, p, rot, sc };
}
function t3(b) {
  let r = b * 0.25;
  for (const m of [9, 10, 11, 11.5]) r += E.outBack(seg(b, m, m + 0.5)) * Math.PI / 2;
  return r;
}
function shapePath(ctx, st, R, cx, cy) {
  const A = SHAPES[st.from], Bs = SHAPES[st.to], N = 220;
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const th = i / N * TAU, r = lerp(A.r(th), Bs.r(th), st.p) * R * st.sc;
    const x = cx + Math.cos(th + st.rot) * r, y = cy + Math.sin(th + st.rot) * r;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
}
function S3(ctx, t, b) {
  fillBg(ctx, C.ink); hudDark = true; section = 2;
  crossGrid(ctx, 0.13, C.bg, 120, t * 40, t * 25);
  const R = 220;
  // orbit
  ctx.save(); ctx.translate(CX, CY); ctx.rotate(t * 0.4);
  ctx.setLineDash([3, 14]); ring(ctx, 0, 0, 390, 2, rgba(C.bg, 0.35)); ctx.setLineDash([]);
  ctx.restore();
  ring(ctx, CX, CY, 470 + 30 * pulse(b, Math.floor(b), 6), 1, rgba(C.bg, 0.15));
  // onion-skin echoes
  for (let j = 7; j >= 1; j--) {
    const st = shapeState(b - j * 0.07);
    shapePath(ctx, st, R, CX, CY);
    ctx.lineWidth = 3; ctx.strokeStyle = rgba(C.hot, (1 - j / 8) * 0.8); ctx.stroke();
  }
  const st = shapeState(b);
  shapePath(ctx, st, R, CX, CY); ctx.fillStyle = C.bg; ctx.fill();
  // vertex handles like a design tool
  const v = SHAPES[st.to].v;
  if (v.length && st.p > 0.6 && b < 11.6) {
    ctx.save(); ctx.globalAlpha = seg(st.p, 0.6, 1);
    for (const [vx, vy] of v) {
      const th = Math.atan2(vy, vx), r = Math.hypot(vx, vy) * R * st.sc;
      const x = CX + Math.cos(th + st.rot) * r, y = CY + Math.sin(th + st.rot) * r;
      ctx.fillStyle = C.ink; ctx.fillRect(x - 8, y - 8, 16, 16);
      ctx.strokeStyle = C.hot; ctx.lineWidth = 3; ctx.strokeRect(x - 8, y - 8, 16, 16);
    }
    ctx.restore();
  }
  // satellites
  for (let i = 0; i < 3; i++) {
    const a = t * 1.6 + i * TAU / 3;
    disc(ctx, CX + Math.cos(a) * 390, CY + Math.sin(a) * 390, 10, C.hot);
  }
  // spec list
  const cur = st.p > 0.5 ? st.to : st.from;
  const la = E.outExpo(seg(b, 8, 8.6)) * (1 - seg(b, 11.6, 11.8));
  ctx.save(); ctx.globalAlpha = la;
  SHAPES.forEach((s, i) => {
    const y = 380 + i * 56, on = i === cur;
    text(ctx, `0${i + 1}`, 150, y, 22, FM, on ? C.hot : rgba(C.bg, 0.35), 'left');
    text(ctx, s.name, 205, y, 22, FM, on ? C.bg : rgba(C.bg, 0.35), 'left', 3);
    if (on) { ctx.fillStyle = C.hot; ctx.fillRect(122, y - 14, 10, 10); }
  });
  text(ctx, `ROT ${((st.rot * 180 / Math.PI) % 360).toFixed(1).padStart(5, '0')}°`, W - 150, 400, 22, FM, C.bg, 'right', 2);
  text(ctx, `SCL ${(st.sc * 100).toFixed(1)}%`, W - 150, 456, 22, FM, C.bg, 'right', 2);
  text(ctx, `EASE outExpo`, W - 150, 512, 22, FM, C.hot, 'right', 2);
  ctx.restore();
}

// ================================================================ S4  12–16  particles
const P = { n: 4200, list: null };
function initParticles() {
  const rnd = mulberry(7);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.font = `330px ${FD}`; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.letterSpacing = '6px';
  g.fillText('MOTION', CX, CY + 330 * 0.36);
  const d = g.getImageData(0, 0, W, H).data, pts = [];
  for (let y = 0; y < H; y += 8) for (let x = 0; x < W; x += 8) if (d[(y * W + x) * 4] > 128) pts.push([x, y]);
  for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]]; }
  P.list = Array.from({ length: P.n }, (_, i) => {
    const tg = pts[i % pts.length];
    const roll = rnd();
    return {
      th: rnd() * TAU, sp: 250 + Math.pow(rnd(), 0.6) * 1100, dir: rnd() < 0.5 ? 1 : -1,
      tx: tg[0] + (rnd() - 0.5) * 2, ty: tg[1] + (rnd() - 0.5) * 2,
      delay: rnd(), sz: 2.5 + rnd() * 2.5, ph: rnd() * TAU,
      col: roll < 0.1 ? C.hot : roll < 0.15 ? C.cob : C.ink,
    };
  });
}
function S4(ctx, t, b) {
  fillBg(ctx, C.bg); hudDark = false; section = 3;
  const t0 = 12 * B, dt = Math.max(0, t - t0);
  // shockwave
  const su = seg(b, 12, 13.2);
  if (su > 0 && su < 1) {
    ring(ctx, CX, CY, E.outExpo(su) * 1100, 40 * (1 - su), rgba(C.ink, 0.25 * (1 - su)));
    ring(ctx, CX, CY, E.outExpo(seg(b, 12.05, 13.2)) * 800, 3, rgba(C.hot, 0.8 * (1 - su)));
  }
  const k = 1.9;
  for (const p of P.list) {
    const r = p.sp * (1 - Math.exp(-k * dt)) / k;
    const th = p.th + p.dir * dt * 1.4 * (260 / (r + 160));
    let x = CX + Math.cos(th) * r, y = CY + Math.sin(th) * r * 0.82;
    const c0 = 13.4 + p.delay * 0.8;
    const cp = E.inOutCubic(seg(b, c0, c0 + 0.9));
    x = lerp(x, p.tx, cp); y = lerp(y, p.ty, cp);
    // shimmer while holding the word
    const hold = seg(b, 14.6, 15.2);
    x += Math.sin(t * 7 + p.ph) * 1.5 * hold; y += Math.cos(t * 6 + p.ph) * 1.5 * hold;
    // exit: blown off to the right, staggered left to right
    const ex0 = 15.5 + (p.tx / W) * 0.25;
    const ex = E.inExpo(seg(b, ex0, ex0 + 0.35));
    x += ex * (W + 300); y += ex * Math.sin(p.ph) * 120;
    let s = p.sz * (1 + 0.6 * Math.sin(t * 9 + p.ph) * hold);
    s *= E.outExpo(seg(b, 12, 12.15));
    ctx.fillStyle = p.col;
    ctx.fillRect(x - s / 2, y - s / 2, s, s);
  }
  // caption
  const ca = seg(b, 14.6, 14.9) * (1 - seg(b, 15.5, 15.7));
  if (ca > 0) {
    ctx.save(); ctx.globalAlpha = ca;
    text(ctx, `${P.n} PARTICLES · ANALYTIC SPIRAL FIELD · NO KEYFRAMES`, CX, CY + 230, 22, FM, rgba(C.ink, 0.6), 'center', 3);
    ctx.restore();
  }
}

// ================================================================ S5  16–20  timing
const LANES = [
  ['linear', E.lin, rgba(C.ink, 0.5)],
  ['easeInOutCubic', E.inOutCubic, C.ink],
  ['easeOutExpo', E.outExpo, C.ink],
  ['easeOutBack', E.outBack, C.hot],
  ['easeOutElastic', E.outElastic, C.ink],
  ['easeOutBounce', E.outBounce, C.ink],
];
function S5(ctx, t, b) {
  fillBg(ctx, C.bg); hudDark = false; section = 4;
  const x0 = 200, x1 = 1240, y0 = 330, dy = 100;
  // title
  const ta = E.outExpo(seg(b, 16, 16.5));
  ctx.save(); ctx.beginPath(); ctx.rect(0, 150, W, 110); ctx.clip();
  text(ctx, 'TIMING IS EVERYTHING', x0 - 6, 245 + (1 - ta) * 110, 84, FD, C.ink, 'left', -1);
  ctx.restore();
  const go0 = 16.6, go1 = 18.4;
  LANES.forEach(([name, fn, col], i) => {
    const y = y0 + i * dy;
    const lp = E.outExpo(seg(b, 16 + i * 0.05, 16.6 + i * 0.05));
    const out = E.inExpo(seg(b, 19.45 + i * 0.03, 19.85 + i * 0.03));
    ctx.fillStyle = rgba(C.ink, 0.15);
    ctx.fillRect(x0, y, (x1 - x0) * lp * (1 - out), 2);
    ctx.save(); ctx.globalAlpha = lp * (1 - out);
    text(ctx, name, x0, y - 26, 19, FM, rgba(C.ink, 0.55), 'left', 1);
    ctx.restore();
    // spacing chart: a tick for every 1/12 s of travel already elapsed
    const steps = 18;
    for (let s = 0; s <= steps; s++) {
      const bs = go0 + (go1 - go0) * s / steps;
      if (b < bs) break;
      const tx = lerp(x0, x1, fn(s / steps));
      ctx.fillStyle = rgba(col === C.hot ? C.hot : C.ink, 0.45 * (1 - out));
      ctx.fillRect(tx - 1, y - 9, 2, 20);
    }
    const fwd = fn(seg(b, go0, go1));
    const back = E.inOutExpo(seg(b, 18.8 + i * 0.07, 19.45 + i * 0.07));
    const pos = fwd * (1 - back);
    const bx = lerp(x0, x1, pos);
    const r = 17 * lp * (1 - out);
    disc(ctx, bx, y + 1, r, col);
  });
  // graph of easeOutBack
  const gx = 1420, gy = 340, gs = 400;
  const ga = E.outExpo(seg(b, 16.3, 16.9)) * (1 - E.inExpo(seg(b, 19.4, 19.8)));
  if (ga > 0) {
    ctx.save(); ctx.globalAlpha = ga;
    ctx.strokeStyle = rgba(C.ink, 0.25); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx, gy + gs); ctx.lineTo(gx + gs, gy + gs); ctx.stroke();
    ctx.setLineDash([4, 8]); ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + gs, gy); ctx.stroke(); ctx.setLineDash([]);
    const prog = seg(b, go0, go1);
    ctx.strokeStyle = C.hot; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath();
    const N = 80;
    for (let i = 0; i <= N * prog; i++) {
      const u = i / N, x = gx + u * gs, y = gy + gs - E.outBack(u) * gs;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
    const hx = gx + prog * gs, hy = gy + gs - E.outBack(prog) * gs;
    disc(ctx, hx, hy, 10, C.ink);
    ctx.strokeStyle = rgba(C.ink, 0.3); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(hx, gy + gs); ctx.lineTo(hx, hy); ctx.lineTo(gx, hy); ctx.stroke();
    text(ctx, 'y = easeOutBack(t)', gx, gy + gs + 50, 20, FM, C.hot, 'left', 1);
    text(ctx, `t ${prog.toFixed(2)}  y ${E.outBack(prog).toFixed(3)}`, gx + gs, gy + gs + 50, 20, FM, rgba(C.ink, 0.6), 'right');
    ctx.restore();
  }
  // vertical blinds wipe into cobalt
  const n = 12, bw = W / n;
  for (let i = 0; i < n; i++) {
    const p = E.inOutExpo(seg(b, 19.4 + i * 0.035, 19.85 + i * 0.035));
    if (p > 0) { ctx.fillStyle = C.cob; ctx.fillRect(i * bw - 1, -50, bw + 2, (H + 100) * p); }
  }
}

// ================================================================ S6  20–24  3D
const G3 = { n: 1764, forms: null, scatter: null };
function init3D() {
  const n = G3.n, rnd = mulberry(11);
  const sphere = [], torus = [], knot = [], plane = [], scatter = [];
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), th = i * 2.399963;
    sphere.push([Math.cos(th) * r, y, Math.sin(th) * r]);
  }
  for (let i = 0; i < n; i++) {
    const a = (i % 63) / 63 * TAU, c = Math.floor(i / 63) / 28 * TAU;
    torus.push([(1 + 0.4 * Math.cos(c)) * Math.cos(a), 0.4 * Math.sin(c), (1 + 0.4 * Math.cos(c)) * Math.sin(a)]);
  }
  const kp = s => { const p = 2, q = 3, r = Math.cos(q * s) + 2; return [r * Math.cos(p * s) * 0.42, r * Math.sin(p * s) * 0.42, -Math.sin(q * s) * 0.42]; };
  for (let i = 0; i < n; i++) {
    const s = Math.floor(i / 12) / (n / 12) * TAU, a = (i % 12) / 12 * TAU;
    const c = kp(s), nx = kp(s + 0.01);
    const tx = nx[0] - c[0], ty = nx[1] - c[1], tz = nx[2] - c[2], tl = Math.hypot(tx, ty, tz);
    // two vectors perpendicular to the tangent
    let ux = -ty, uy = tx, uz = 0; const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul;
    const vx = (ty * uz - tz * uy) / tl, vy = (tz * ux - tx * uz) / tl, vz = (tx * uy - ty * ux) / tl;
    const rr = 0.16;
    knot.push([c[0] + (ux * Math.cos(a) + vx * Math.sin(a)) * rr, c[1] + (uy * Math.cos(a) + vy * Math.sin(a)) * rr, c[2] + (uz * Math.cos(a) + vz * Math.sin(a)) * rr]);
  }
  for (let i = 0; i < n; i++) plane.push([((i % 42) / 41 - 0.5) * 2.6, 0, (Math.floor(i / 42) / 41 - 0.5) * 2.6]);
  for (let i = 0; i < n; i++) scatter.push([(rnd() - 0.5) * 8, (rnd() - 0.5) * 6, (rnd() - 0.5) * 8]);
  G3.forms = [sphere, torus, knot, plane]; G3.scatter = scatter;
}
function S6(ctx, t, b) {
  fillBg(ctx, C.cob); hudDark = false; section = 5;
  // ghost outline type behind
  ctx.save(); ctx.globalAlpha = 0.13;
  ctx.font = `360px ${FD}`; ctx.lineWidth = 3; ctx.strokeStyle = C.ink; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  const sw = ctx.measureText('DIMENSION ').width, ox = -((t * 160) % sw);
  for (let k = 0; k < 3; k++) ctx.strokeText('DIMENSION ', ox + k * sw, CY + 130);
  ctx.restore();

  const n = G3.n, F = G3.forms;
  const yaw = t * 0.9, pitch = 0.45 + Math.sin(t * 0.8) * 0.25;
  const cy_ = Math.cos(yaw), sy_ = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const punch = 1 + 0.05 * pulse(b, Math.floor(b), 7);
  const scale = 330 * punch * lerp(1, 1.25, E.inExpo(seg(b, 23.5, 24)));
  const pts = new Array(n);
  const stg = i => (i / n) * 0.18;
  for (let i = 0; i < n; i++) {
    const s0 = G3.scatter[i];
    let p = s0;
    const a = E.outExpo(seg(b, 20 + stg(i), 20.6 + stg(i)));
    p = mix3(s0, F[0][i], a);
    for (let f = 1; f < 4; f++) {
      const m = E.outExpo(seg(b, 20 + f + stg(i), 20.5 + f + stg(i)));
      if (m > 0) p = mix3(p, F[f][i], m);
    }
    let [x, y, z] = p;
    if (b > 22.8) { // ripple the plane
      const w = seg(b, 22.8, 23.3);
      y += w * 0.18 * Math.sin(Math.hypot(x, z) * 4 - t * 8);
    }
    // rotate yaw then pitch
    let x1 = x * cy_ - z * sy_, z1 = x * sy_ + z * cy_;
    let y1 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
    const d = 3.4 / (3.4 + z2);
    pts[i] = [CX + x1 * scale * d, CY + y1 * scale * d, z2, d, i];
  }
  pts.sort((a, c) => c[2] - a[2]);
  for (const [x, y, z, d, i] of pts) {
    const depth = clamp((1.6 - z) / 3.2);
    const r = (1.4 + 3.6 * depth) * d;
    ctx.fillStyle = i % 9 === 0 ? C.hot : rgba(C.ink, 0.35 + 0.65 * depth);
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const names = ['SPHERE', 'TORUS', 'TORUS KNOT 2,3', 'WAVE FIELD'];
  const fi = clamp(Math.floor(b - 20), 0, 3);
  text(ctx, `${names[fi]} · ${n} VERTICES`, W - 150, H - 190, 22, FM, C.ink, 'right', 3);
  text(ctx, `YAW ${(yaw * 57.3 % 360).toFixed(1)}°  PITCH ${(pitch * 57.3).toFixed(1)}°`, W - 150, H - 150, 22, FM, rgba(C.ink, 0.6), 'right', 2);
}
const mix3 = (a, c, t) => [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t];

// ================================================================ S7  24–28  montage
function S7(ctx, t, b) {
  section = 6;
  const k = Math.min(7, Math.floor((b - 24) * 2)), u = (b - 24) * 2 - k; // u spans one half-beat
  switch (k) {
    case 0: {
      fillBg(ctx, C.hot); hudDark = true;
      const p = E.outExpo(seg(u, 0, 0.7));
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
      ctx.translate(CX, CY + (1 - p) * 700); ctx.transform(1, 0, -0.18 * (1 - p), 1, 0, 0);
      letters(ctx, '2026', 0, 640 * 0.36, 640, FD, C.bg, i => ({ y: (1 - E.outExpo(seg(u, i * 0.08, 0.7 + i * 0.08))) * 300 }), -20);
      ctx.restore();
      break;
    }
    case 1: {
      fillBg(ctx, C.bg); hudDark = false;
      for (let j = 0; j < 16; j++) {
        const r = ((j + u * 2) * 70) % 1120;
        ring(ctx, CX, CY, r, j % 3 === 0 ? 14 : 4, j % 3 === 0 ? C.hot : rgba(C.ink, 0.8));
      }
      disc(ctx, CX, CY, 80 * E.outBack(seg(u, 0, 0.5)), C.ink);
      break;
    }
    case 2: {
      fillBg(ctx, C.ink); hudDark = true;
      ctx.save(); ctx.translate(CX, CY); ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = C.bg;
      const off = (u * 240) % 120;
      for (let x = -1600; x < 1600; x += 120) ctx.fillRect(x + off, -1600, 50, 3200);
      ctx.restore();
      const s = E.outBack(seg(u, 0, 0.6));
      disc(ctx, CX, CY, 260 * s, C.hot);
      text(ctx, 'RHYTHM', CX, CY + 30, 84 * s, FD, C.bg);
      break;
    }
    case 3: {
      fillBg(ctx, C.bg); hudDark = false;
      const cols = 16, rows = 9, cw = W / cols;
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        const x = (i + 0.5) * cw, y = (j + 0.5) * cw;
        const d = Math.hypot(i - 7.5, j - 4) / 8.5;
        const p = E.outBack(seg(u, d * 0.5, d * 0.5 + 0.45));
        if (p <= 0) continue;
        ctx.save(); ctx.translate(x, y); ctx.rotate((1 - p) * Math.PI); ctx.scale(p, p);
        ctx.fillStyle = (i + j) % 2 ? C.ink : C.hot;
        ctx.fillRect(-cw * 0.36, -cw * 0.36, cw * 0.72, cw * 0.72);
        ctx.restore();
      }
      break;
    }
    case 4: {
      fillBg(ctx, C.cob); hudDark = false;
      const p = E.outExpo(seg(u, 0, 0.8));
      for (let j = 5; j >= 0; j--) {
        ctx.save(); ctx.translate(CX, CY + j * 34 * (1 - p * 0.6)); ctx.scale(lerp(1.9, 1, p), 1);
        letters(ctx, 'KINETIC', 0, 260 * 0.36, 260, FD, C.ink, () => (j ? { stroke: rgba(C.hot, 1 - j / 6), lw: 3 } : {}), -4);
        ctx.restore();
      }
      break;
    }
    case 5: {
      fillBg(ctx, C.hot); hudDark = true;
      ctx.save(); ctx.translate(CX, CY); ctx.rotate(t * 1.5);
      ctx.fillStyle = C.bg;
      for (let j = 0; j < 24; j++) {
        ctx.rotate(TAU / 24);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(1400, -60); ctx.lineTo(1400, 60); ctx.fill();
      }
      ctx.restore();
      disc(ctx, CX, CY, 210 * E.outBack(seg(u, 0, 0.55)), C.ink);
      text(ctx, '★', CX, CY + 52, 150 * E.outBack(seg(u, 0.1, 0.6)), FS, C.hot);
      break;
    }
    case 6: {
      fillBg(ctx, C.bg); hudDark = false;
      const str = 'MOTION DESIGN • ', size = 140;
      ctx.font = `${size}px ${FD}`; const sw = ctx.measureText(str).width;
      for (let r = 0; r < 8; r++) {
        const y = 60 + r * 140 + size * 0.36;
        const dir = r % 2 ? 1 : -1, off = (((t * 1800 * dir) % sw) + sw) % sw;
        for (let x = -sw * 2 + off; x < W + sw; x += sw) {
          if (r % 2) { ctx.lineWidth = 3; ctx.strokeStyle = C.hot; ctx.textAlign = 'left'; ctx.strokeText(str, x, y); }
          else text(ctx, str, x, y, size, FD, C.ink, 'left');
        }
      }
      break;
    }
    default: { // glitch out to a single line, then black
      fillBg(ctx, C.bg); hudDark = false;
      const q = Math.floor(t * 30);
      const col = 1 - E.inExpo(seg(u, 0.35, 0.75));
      if (col > 0.01) {
        ctx.save();
        for (let s = 0; s < 18; s++) {
          const y0 = s * 60, off = (hash(q * 97 + s) - 0.5) * 260 * (0.3 + u);
          ctx.save(); ctx.beginPath(); ctx.rect(0, CY + (y0 - CY) * col, W, 60 * col + 1); ctx.clip();
          ctx.translate(CX, CY); ctx.scale(1, col); ctx.translate(-CX, -CY);
          ctx.globalCompositeOperation = 'lighter';
          text(ctx, 'CLAUDE', CX + off - 14, CY + 108, 300, FD, C.hot);
          text(ctx, 'CLAUDE', CX + off + 14, CY + 108, 300, FD, C.cob);
          ctx.globalCompositeOperation = 'source-over';
          text(ctx, 'CLAUDE', CX + off, CY + 108, 300, FD, C.ink);
          ctx.restore();
        }
        ctx.restore();
      }
      const lw = W * (1 - E.inExpo(seg(u, 0.55, 0.95)));
      if (u > 0.5 && lw > 1) { ctx.fillStyle = C.ink; ctx.fillRect(CX - lw / 2, CY - 2, lw, 4); }
    }
  }
}

// ================================================================ S8  28–32  title card
function S8(ctx, t, b) {
  fillBg(ctx, C.bg); hudDark = false; section = 7;
  // drifting dust
  for (let i = 0; i < 140; i++) {
    const x = (hash(i * 7) * W + t * (20 + hash(i * 3) * 40)) % W, y = (hash(i * 13) * H - t * 15 * hash(i)) % H;
    ctx.fillStyle = rgba(C.ink, 0.12 + 0.2 * hash(i * 5)); ctx.fillRect(x, (y + H) % H, 2, 2);
  }
  const outro = seg(b, 31, 31.5);
  const zoom = lerp(1.06, 1, E.outCubic(seg(b, 28, 31)));
  ctx.save(); ctx.translate(CX, CY); ctx.scale(zoom, zoom); ctx.translate(-CX, -CY);
  const size = 270, base = 520;
  const tw = letters(ctx, 'CLAUDE', CX, base, size, FD, C.ink, i => {
    const p = E.outExpo(seg(b, 28 + i * 0.05, 28.5 + i * 0.05));
    const o = E.inCubic(seg(b, 31 + i * 0.04, 31.35 + i * 0.04));
    return { s: lerp(2.4, 1, p), a: p > 0 ? p * (1 - o) : 0, y: -o * 80 };
  }, -6);
  // underline bar -> becomes the final dot
  const bp = E.outExpo(seg(b, 28.4, 29.1));
  const toDot = E.inOutExpo(seg(b, 31.2, 31.7));
  let bw = lerp(tw * bp, 18, toDot), bh = lerp(12, 18, toDot), by = lerp(base + 50, CY - 9, toDot);
  const end = E.inExpo(seg(b, 31.75, 31.98));
  if (bp > 0) {
    ctx.fillStyle = C.hot;
    ctx.beginPath(); ctx.roundRect(CX - bw / 2, by, bw, bh * (1 - end), lerp(0, 9, toDot)); ctx.fill();
  }
  // role
  const rp = E.outExpo(seg(b, 28.75, 29.5));
  ctx.save(); ctx.globalAlpha = 1 - outro;
  ctx.beginPath(); ctx.rect(0, base + 90, W, 80); ctx.clip();
  text(ctx, 'MOTION DESIGNER', CX, base + 150 + (1 - rp) * 80, 52, FS, C.ink, 'center', 22);
  ctx.restore();
  // credits line, typed
  const cred = 'KINETIC TYPE · SIMULATION · 3D · TIMING · SOUND';
  const nc = Math.floor(clamp((b - 29.2) * 40, 0, cred.length));
  ctx.save(); ctx.globalAlpha = 0.55 * (1 - outro);
  text(ctx, cred.slice(0, nc), CX - 330, base + 230, 20, FM, C.ink, 'left', 2);
  ctx.restore();
  ctx.restore();
  // rotating badge
  const bs = E.outBack(seg(b, 29.4, 30)) * (1 - E.inCubic(seg(b, 30.9, 31.3)));
  if (bs > 0) {
    const bx = W - 260, byy = H - 250;
    ctx.save(); ctx.translate(bx, byy); ctx.scale(bs, bs);
    disc(ctx, 0, 0, 120, C.hot);
    ctx.rotate(t * 0.9);
    const str = 'AVAILABLE FOR WORK • AVAILABLE FOR WORK • ';
    ctx.font = `17px ${FM}`; ctx.fillStyle = C.bg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < str.length; i++) {
      ctx.save(); ctx.rotate(i / str.length * TAU); ctx.fillText(str[i], 0, -94); ctx.restore();
    }
    ctx.restore();
    ctx.save(); ctx.translate(bx, byy); ctx.scale(bs, bs);
    text(ctx, '↗', 0, 26, 76, FS, C.bg);
    ctx.restore();
  }
}

// ================================================================ camera, HUD, grade
const IMPACTS = [4, 16, 28];
function camera(ctx, t, b) {
  let kick = 0;
  if (b >= 4 && b < 27.5) kick = pulse(b, Math.floor(b), 9);
  let imp = 0; for (const i of IMPACTS) imp += pulse(b, i, 3.5);
  const amp = 4 * kick + 22 * imp;
  const sx = (Math.sin(t * 91) + Math.sin(t * 57.3) * 0.6) * amp, sy = (Math.cos(t * 77) + Math.sin(t * 43.1) * 0.6) * amp;
  const z = 1 + 0.012 * kick + 0.05 * imp;
  ctx.translate(CX + sx, CY + sy); ctx.scale(z, z); ctx.rotate(0.006 * imp * Math.sin(t * 40)); ctx.translate(-CX, -CY);
}

function drawScene(ctx, t) {
  const b = t / B;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  camera(ctx, t, b);
  if (b < 4) S1(ctx, t, b);
  else if (b < 8) S2(ctx, t, b);
  else if (b < 12) S3(ctx, t, b);
  else if (b < 16) S4(ctx, t, b);
  else if (b < 20) S5(ctx, t, b);
  else if (b < 24) S6(ctx, t, b);
  else if (b < 28) S7(ctx, t, b);
  else S8(ctx, t, b);
  ctx.restore();
}

const SECTIONS = ['COLD OPEN', 'KINETIC TYPE', 'SHAPE MORPH', 'PARTICLE SIM', 'TIMING', 'DIMENSION', 'MONTAGE', 'END CARD'];
function hud(ctx, t) {
  const b = t / B;
  const a = seg(b, 0.4, 1) * (1 - seg(b, 27.6, 27.8));
  if (a <= 0) return;
  const col = hudDark ? C.bg : C.ink;
  ctx.save(); ctx.globalAlpha = a * 0.85;
  ctx.strokeStyle = col; ctx.lineWidth = 2;
  const m = 44, L = 26;
  ctx.beginPath();
  ctx.moveTo(m, m + L); ctx.lineTo(m, m); ctx.lineTo(m + L, m);
  ctx.moveTo(W - m - L, m); ctx.lineTo(W - m, m); ctx.lineTo(W - m, m + L);
  ctx.moveTo(W - m, H - m - L); ctx.lineTo(W - m, H - m); ctx.lineTo(W - m - L, H - m);
  ctx.moveTo(m + L, H - m); ctx.lineTo(m, H - m); ctx.lineTo(m, H - m - L);
  ctx.stroke();
  const f = Math.round(t * FPS), s = Math.floor(f / FPS), ff = f % FPS;
  text(ctx, 'CLAUDE / SHOWREEL 2026', m + 70, m + 40, 18, FM, col, 'left', 3);
  text(ctx, `00:00:${String(s).padStart(2, '0')}:${String(ff).padStart(2, '0')}`, W - m - 20, m + 40, 18, FM, col, 'right', 3);
  if (Math.floor(t * 2) % 2 === 0) disc(ctx, m + 40, m + 34, 7, C.hot);
  text(ctx, `[0${section + 1}] ${SECTIONS[section]}`, m + 20, H - m - 20, 18, FM, col, 'left', 3);
  const pw = 220, px = W - m - 20 - pw, py = H - m - 28;
  ctx.globalAlpha = a * 0.3; ctx.fillStyle = col; ctx.fillRect(px, py, pw, 3);
  ctx.globalAlpha = a * 0.85; ctx.fillRect(px, py, pw * t / DUR, 3);
  text(ctx, `${String(Math.floor(b) + 1).padStart(2, '0')}/32`, px - 16, py + 7, 18, FM, col, 'right', 2);
  ctx.restore();
}

let grain = null;
function makeGrain() {
  grain = document.createElement('canvas'); grain.width = grain.height = 256;
  const g = grain.getContext('2d'), id = g.createImageData(256, 256), rnd = mulberry(3);
  for (let i = 0; i < id.data.length; i += 4) { const v = rnd() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
  g.putImageData(id, 0, 0);
}
function grade(ctx, t) {
  const f = Math.round(t * FPS);
  ctx.save();
  ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.07;
  const pat = ctx.createPattern(grain, 'repeat');
  pat.setTransform(new DOMMatrix().translate(hash(f) * 256, hash(f + 999) * 256));
  ctx.fillStyle = pat; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  const v = ctx.createRadialGradient(CX, CY, H * 0.45, CX, CY, H * 1.05);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  // impact flashes
  const b = t / B;
  let fl = 0; for (const i of IMPACTS) fl += pulse(b, i, 14);
  if (fl > 0.01) { ctx.fillStyle = rgba(C.ink, Math.min(0.85, fl * 0.85)); ctx.fillRect(0, 0, W, H); }
  // final fade
  const fade = seg(t, DUR - 0.12, DUR);
  if (fade > 0) { ctx.fillStyle = `rgba(0,0,0,${fade})`; ctx.fillRect(0, 0, W, H); }
  ctx.restore();
}

// ---------------------------------------------------------------- public
const SHUTTER = 0.6;
function renderFrame(t, samples = 1) {
  octx.setTransform(1, 0, 0, 1, 0, 0);
  if (samples <= 1) drawScene(octx, t);
  else {
    let hd = false, sc = 0;
    for (let i = 0; i < samples; i++) {
      const ti = clamp(t + ((i + 0.5) / samples - 0.5) * SHUTTER / FPS, 0, DUR - 1e-4);
      drawScene(sctx, ti);
      if (i === Math.floor(samples / 2)) { hd = hudDark; sc = section; }
      octx.globalAlpha = 1 / (i + 1);
      octx.drawImage(sub, 0, 0);
    }
    octx.globalAlpha = 1; hudDark = hd; section = sc;
  }
  hud(octx, t);
  grade(octx, t);
}

const ready = (async () => {
  await Promise.all([`330px ${FD}`, `52px ${FS}`, `20px ${FM}`].map(f => document.fonts.load(f)));
  await document.fonts.ready;
  initParticles(); init3D(); makeGrain();
})();

window.REEL = { W, H, FPS, DUR, ready, renderFrame };

if (!/[?&]render/.test(location.search)) {
  ready.then(() => {
    let start = performance.now();
    const loop = now => {
      const t = ((now - start) / 1000) % DUR;
      renderFrame(t, 1);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    out.addEventListener('click', () => { start = performance.now(); });
  });
}
})();
