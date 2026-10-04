// Synthesizes the 15 s soundtrack on the reel's 128 BPM grid. No samples, no libraries.
// usage: node audio.mjs out.wav
import fs from 'node:fs';

const SR = 48000, DUR = 15, N = SR * DUR;
const B = 60 / 128;
const L = new Float32Array(N), R = new Float32Array(N);
const revL = new Float32Array(N), revR = new Float32Array(N);   // reverb send
const TAU = Math.PI * 2;
let seed = 1;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const noise = () => rnd() * 2 - 1;
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function add(i, l, r, send = 0) {
  if (i < 0 || i >= N) return;
  L[i] += l; R[i] += r;
  if (send) { revL[i] += l * send; revR[i] += r * send; }
}
const pan = p => [Math.cos((p + 1) * Math.PI / 4), Math.sin((p + 1) * Math.PI / 4)];

// state-variable filter
function svf() {
  let low = 0, band = 0;
  return (x, fc, q = 0.7, mode = 'lp') => {
    const f = 2 * Math.sin(Math.PI * Math.min(fc, SR / 6) / SR);
    low += f * band; const high = x - low - q * band; band += f * high;
    return mode === 'lp' ? low : mode === 'hp' ? high : band;
  };
}

// ---------------------------------------------------------------- arrangement
// bars:        0    1    2    3    4    5    6    7
const CHORDS = [
  [57, 60, 64, 69], [57, 60, 65, 69], [55, 60, 64, 67], [55, 59, 62, 67],
  [57, 60, 64, 69], [57, 60, 65, 69], [55, 59, 62, 67], [57, 60, 64, 69],
];
const ROOTS = [33, 29, 36, 31, 33, 29, 31, 33];
const GAP0 = 27.75 * B, GAP1 = 28 * B;   // the breath before the final hit
const inGap = t => t >= GAP0 && t < GAP1;

// sidechain envelope from the kick pattern
const kicks = [];
for (let b = 4; b < 27.5; b++) kicks.push(b * B);
kicks.push(28 * B);
function duck(t) {
  let g = 1;
  for (const k of kicks) if (t >= k && t - k < 0.4) g = Math.min(g, 1 - 0.75 * Math.exp(-(t - k) * 9));
  return g;
}

// ---------------------------------------------------------------- voices
function kick(t0, amp = 1) {
  let ph = 0; const s0 = Math.floor(t0 * SR);
  for (let i = 0; i < SR * 0.45; i++) {
    const t = i / SR, f = 46 + 130 * Math.exp(-t * 28) + 600 * Math.exp(-t * 300);
    ph += TAU * f / SR;
    const v = (Math.sin(ph) * Math.exp(-t * 5.5) + noise() * 0.25 * Math.exp(-t * 250)) * amp;
    const s = Math.tanh(v * 1.6) * 0.9;
    add(s0 + i, s, s);
  }
}
function clap(t0, amp = 1) {
  const s0 = Math.floor(t0 * SR), f = svf();
  for (let i = 0; i < SR * 0.35; i++) {
    const t = i / SR;
    let env = Math.exp(-t * 16);
    for (const o of [0, 0.011, 0.022]) if (t >= o && t < o + 0.01) env = Math.max(env, Math.exp(-(t - o) * 200));
    const v = f(noise(), 1500, 0.6, 'bp') * env * 0.9 * amp + Math.sin(TAU * 190 * t) * Math.exp(-t * 40) * 0.15 * amp;
    add(s0 + i, v, v, 0.35);
  }
}
function hat(t0, amp = 1, open = false, p = 0.2) {
  const s0 = Math.floor(t0 * SR), f = svf(), dec = open ? 11 : 55, [pl, pr] = pan(p);
  for (let i = 0; i < SR * (open ? 0.3 : 0.08); i++) {
    const t = i / SR, v = f(noise(), 9000, 0.4, 'hp') * Math.exp(-t * dec) * 0.22 * amp;
    add(s0 + i, v * pl, v * pr, 0.1);
  }
}
function tick(t0, freq, amp = 0.3) {
  const s0 = Math.floor(t0 * SR);
  for (let i = 0; i < SR * 0.25; i++) {
    const t = i / SR, v = Math.sin(TAU * freq * t) * Math.exp(-t * 30) * amp;
    add(s0 + i, v, v, 0.6);
  }
}
function impact(t0, amp = 1) {
  const s0 = Math.floor(t0 * SR), f = svf(), f2 = svf();
  let ph = 0;
  for (let i = 0; i < SR * 3; i++) {
    const t = i / SR;
    ph += TAU * (32 + 60 * Math.exp(-t * 6)) / SR;
    const boom = Math.sin(ph) * Math.exp(-t * 1.6) * 0.8;
    const crash = f(noise(), 4000, 0.5, 'hp') * Math.exp(-t * 2.2) * 0.28;
    const body = f2(noise(), 300, 0.8, 'lp') * Math.exp(-t * 8) * 0.7;
    const v = (boom + body) * amp, c = crash * amp;
    add(s0 + i, v + c * (0.8 + 0.2 * Math.sin(t * 7)), v + c * (0.8 + 0.2 * Math.cos(t * 7)), 0.25);
  }
}
function whoosh(tEnd, len = 0.5, amp = 0.5) {
  // swell into tEnd, sweep a band upward, quick tail after
  const s0 = Math.floor((tEnd - len) * SR), f = svf();
  for (let i = 0; i < SR * (len + 0.15); i++) {
    const t = i / SR, u = clamp(t / len, 0, 1);
    const env = t < len ? Math.pow(u, 2.5) : Math.exp(-(t - len) * 30);
    const v = f(noise(), 300 + 6000 * u * u, 1.2, 'bp') * env * amp;
    add(s0 + i, v * (0.6 + 0.4 * u), v * (1 - 0.4 * u), 0.2);
  }
}
function riser(t0, t1, amp = 0.4) {
  const s0 = Math.floor(t0 * SR), n = Math.floor((t1 - t0) * SR), f = svf();
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n, t = t0 + i / SR;
    if (inGap(t)) continue;
    ph += TAU * (200 + 1400 * u * u) / SR;
    const v = (f(noise(), 500 + 9000 * u * u, 0.8, 'bp') * 0.8 + Math.sin(ph) * 0.12) * u * u * amp;
    add(s0 + i, v, v, 0.3);
  }
}
function pluck(t0, midi, amp, p) {
  const s0 = Math.floor(t0 * SR), f = svf(), fr = mtof(midi), [pl, pr] = pan(p);
  let ph = 0;
  for (let i = 0; i < SR * 0.4; i++) {
    const t = i / SR, tt = t0 + t;
    if (inGap(tt)) break;
    ph += fr / SR;
    const raw = (ph % 1) < 0.5 ? 1 : -1;
    const v = f(raw, 600 + 5000 * Math.exp(-t * 18), 0.5) * Math.exp(-t * 9) * amp * duck(tt);
    add(s0 + i, v * pl, v * pr, 0.45);
  }
}

// ---------------------------------------------------------------- pad + bass (continuous)
{
  const fl = svf(), fr = svf(), fb = svf();
  const phases = new Float64Array(32), bph = [0, 0];
  for (let i = 0; i < N; i++) {
    const t = i / SR, b = t / B, bar = Math.min(7, Math.floor(b / 4));
    if (inGap(t)) continue;
    const ch = CHORDS[bar];
    // pad: detuned saws
    let sl = 0, sr = 0;
    for (let n = 0; n < ch.length; n++) for (let d = 0; d < 3; d++) {
      const k = n * 3 + d, det = (d - 1) * 0.12;
      phases[k] += mtof(ch[n] + det) / SR;
      const s = 2 * (phases[k] % 1) - 1;
      if (d === 0) sl += s; else if (d === 2) sr += s; else { sl += s * 0.5; sr += s * 0.5; }
    }
    let cut = 500 + 1800 * clamp((b - 0) / 4, 0, 1);
    if (b >= 24 && b < 28) cut = 800 + 5000 * ((b - 24) / 4) ** 2;           // filter build
    if (b >= 28) cut = 3500 * Math.exp(-(b - 28) * 0.6) + 600;
    let padAmp = 0.035 * clamp(b / 2, 0, 1);
    if (b >= 28) padAmp = 0.05 * Math.exp(-(b - 28) * 0.45);
    const dk = duck(t);
    const pl = fl(sl, cut, 0.6) * padAmp * dk, pr = fr(sr, cut, 0.6) * padAmp * dk;
    // bass: offbeat 8ths + sustained sub on the last bar
    let bv = 0;
    if (b >= 4) {
      const f0 = mtof(ROOTS[bar]);
      bph[0] += f0 / SR; bph[1] += f0 * 2.005 / SR;
      const saw = (2 * (bph[0] % 1) - 1) * 0.7 + (2 * (bph[1] % 1) - 1) * 0.3;
      const sub = Math.sin(TAU * bph[0]);
      let env;
      if (b < 28) {
        const e8 = (b * 2) % 1;                 // position inside an 8th
        const on = Math.floor(b * 2) % 2 === 1; // offbeats
        env = on ? Math.exp(-e8 * 3) * clamp(e8 * 60, 0, 1) : 0;
      } else env = Math.exp(-(b - 28) * 0.5);
      bv = (fb(saw, 220 + 900 * env, 0.8) * 0.9 + sub * 0.6) * env * 0.22 * (b < 28 ? dk : 1);
    }
    L[i] += pl + bv; R[i] += pr + bv;
    revL[i] += pl * 0.4; revR[i] += pr * 0.4;
  }
}

// ---------------------------------------------------------------- sequence
// intro
tick(1 * B, 1760, 0.25); tick(1.5 * B, 1760, 0.2); tick(2 * B, 2637, 0.18);
whoosh(2.1 * B, 0.25, 0.35);
riser(2.4 * B, 4 * B, 0.55);
impact(4 * B, 1);

for (let b = 4; b < 28; b++) {
  const t = b * B;
  if (b < 27.5) kick(t, b === 4 || b === 16 ? 1.1 : 0.95);
  const inMontage = b >= 24;
  if (b >= 6 && b % 2 === 1 && b < 26) clap(t, 0.8);
  // hats
  if (b < 27) {
    hat(t + B / 2, 1, true, 0.25);
    hat(t + B / 4, 0.5, false, -0.3); hat(t + 3 * B / 4, 0.5, false, -0.3);
    if (inMontage) { hat(t, 0.4, false, 0.4); hat(t + B / 8, 0.25, false, 0.4); hat(t + 5 * B / 8, 0.25, false, -0.4); }
  }
}
// snare roll build into the drop: 8ths -> 16ths -> 32nds
for (let b = 26; b < 27.75; b += 0.5) clap(b * B, 0.45 + (b - 26) * 0.2);
for (let b = 27; b < 27.75; b += 0.25) clap(b * B, 0.6);
for (let b = 27.5; b < 27.75; b += 0.125) clap(b * B, 0.7);

// arpeggio from bar 2 through the montage
const ARP = [0, 1, 2, 3, 2, 1, 3, 2];
for (let s = 32; s < 111; s++) {               // 16th steps: beat 8 -> 27.75
  const b = s / 4, bar = Math.floor(b / 4), ch = CHORDS[bar];
  const note = ch[ARP[s % 8]] + 12 + (s % 16 >= 12 ? 12 : 0);
  pluck(b * B, note, 0.07 * (s % 4 === 0 ? 1.2 : 0.85), s % 2 ? 0.45 : -0.45);
}

// transitions
for (const b of [8, 12, 16, 20, 24]) whoosh(b * B, 0.45, 0.45);
impact(16 * B, 0.8);
impact(12 * B, 0.5);
// montage cut blips
for (let k = 0; k < 7; k++) tick((24 + k * 0.5) * B, 3520 / (1 + (k % 3) * 0.5), 0.12);
riser(25 * B, GAP0, 0.6);
// glitch zap before the gap
{
  const s0 = Math.floor(27.5 * B * SR), n = Math.floor((GAP0 - 27.5 * B) * SR);
  for (let i = 0; i < n; i++) {
    const t = i / SR, v = (Math.floor(t * 90) % 2 ? 1 : -1) * Math.sin(TAU * (800 - 600 * t / (n / SR)) * t) * 0.12;
    add(s0 + i, v, -v);
  }
}
// final hit
kick(28 * B, 1.2); impact(28 * B, 1.2);
for (const [n, d] of [[81, 0], [76, 0.5], [72, 1], [69, 1.5]]) tick((28.5 + d) * B, mtof(n), 0.1);
tick(31.75 * B, 1760, 0.15);

// ---------------------------------------------------------------- reverb (Schroeder)
function reverb(inp, offs) {
  const combs = [1557, 1617, 1491, 1422].map(n => ({ buf: new Float32Array(n + offs), i: 0, lp: 0 }));
  const aps = [225, 556].map(n => ({ buf: new Float32Array(n + offs), i: 0 }));
  const outp = new Float32Array(N);
  for (let s = 0; s < N; s++) {
    let acc = 0;
    for (const c of combs) {
      const y = c.buf[c.i];
      c.lp = y * 0.75 + c.lp * 0.25;
      c.buf[c.i] = inp[s] + c.lp * 0.82;
      c.i = (c.i + 1) % c.buf.length; acc += y;
    }
    for (const a of aps) {
      const y = a.buf[a.i], v = -acc * 0.5 + y;
      a.buf[a.i] = acc + y * 0.5; a.i = (a.i + 1) % a.buf.length; acc = v;
    }
    outp[s] = acc * 0.2;
  }
  return outp;
}
const wl = reverb(revL, 0), wr = reverb(revR, 23);

// ---------------------------------------------------------------- master
let peak = 0;
const mix = new Float32Array(N * 2);
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const fade = clamp((DUR - t) / 0.35, 0, 1) * clamp(t / 0.02, 0, 1);
  const l = Math.tanh((L[i] + wl[i]) * 0.85) * fade, r = Math.tanh((R[i] + wr[i]) * 0.85) * fade;
  mix[i * 2] = l; mix[i * 2 + 1] = r;
  peak = Math.max(peak, Math.abs(l), Math.abs(r));
}
const g = 0.89 / peak;
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8);
buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N * 2; i++) buf.writeInt16LE(Math.round(clamp(mix[i] * g, -1, 1) * 32767), 44 + i * 2);
fs.writeFileSync(process.argv[2] || 'soundtrack.wav', buf);
console.log('peak', peak.toFixed(3), 'gain', g.toFixed(3));
