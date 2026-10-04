// Synthesize a score + SFX on the film's beat grid. No samples, no libraries.
// Reads BPM, DUR and cues from the film (window.FILM.meta), writes <film>/audio/score.wav.
// usage: node audio.mjs <filmDir> [--no-music] [--seed 1]
// Copy this file into the film folder to customize KEY, CHORDS and MIX.
import fs from 'node:fs';
import path from 'node:path';
import { loadPlaywright, args, filmDir, openFilm } from './common.mjs';

// ---------------------------------------------------------------- knobs
const KEY = 57;                                   // A3. Chords are semitone offsets from KEY.
const CHORDS = [[0, 3, 7, 12], [-4, 0, 3, 8], [-2, 2, 5, 10], [-5, -1, 2, 7]];   // i–VI–VII–v, one per bar
const MIX = { kick: 0.9, hat: 0.18, bass: 0.35, pad: 0.16, sfx: 0.8, reverb: 0.25 };

const { pos, o } = args({ seed: 1 });
const dir = filmDir(pos[0]);
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const page = await openFilm(browser, dir, { short: 64 });
const meta = await page.evaluate(() => window.FILM.meta);
await browser.close();

const SR = 48000, DUR = meta.DUR, N = Math.ceil(SR * DUR), B = 60 / meta.BPM;
const L = new Float32Array(N), R = new Float32Array(N), sendL = new Float32Array(N), sendR = new Float32Array(N);
const duck = new Float32Array(N).fill(1);        // sidechain envelope driven by the kick
const TAU = Math.PI * 2;
let seed = +o.seed;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const noise = () => rnd() * 2 - 1;
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const pan = p => [Math.cos((p + 1) * Math.PI / 4), Math.sin((p + 1) * Math.PI / 4)];
let bus = 1;                                     // gain of whatever is being written (music or sfx)
function add(i, v, p = 0, send = 0, ducked = false) {
  if (i < 0 || i >= N) return;
  const [gl, gr] = pan(p), d = (ducked ? duck[i] : 1) * bus;
  L[i] += v * gl * d; R[i] += v * gr * d;
  if (send) { sendL[i] += v * gl * send * d; sendR[i] += v * gr * send * d; }
}
function svf() {
  let low = 0, band = 0;
  return (x, fc, q = 0.7, mode = 'lp') => {
    const f = 2 * Math.sin(Math.PI * Math.min(fc, SR / 6) / SR);
    low += f * band; const high = x - low - q * band; band += f * high;
    return mode === 'lp' ? low : mode === 'hp' ? high : band;
  };
}

// ---------------------------------------------------------------- voices
function kick(t0, g = 1) {
  const i0 = Math.round(t0 * SR), n = Math.round(0.45 * SR);
  let ph = 0;
  for (let k = 0; k < n; k++) {
    const t = k / SR, f = 45 + 120 * Math.exp(-t * 35);
    ph += TAU * f / SR;
    const v = Math.sin(ph) * Math.exp(-t * 7) + (k < 120 ? noise() * 0.3 * (1 - k / 120) : 0);
    add(i0 + k, v * g * MIX.kick);
  }
  for (let k = 0; k < 0.3 * SR; k++) {           // sidechain
    const i = i0 + k; if (i >= N) break;
    duck[i] = Math.min(duck[i], 1 - 0.75 * Math.exp(-k / SR * 9));
  }
}
function hat(t0, g = 1, open = false) {
  const i0 = Math.round(t0 * SR), n = Math.round((open ? 0.25 : 0.05) * SR), f = svf();
  for (let k = 0; k < n; k++) add(i0 + k, f(noise(), 9000, 0.5, 'hp') * Math.exp(-k / n * 5) * g * MIX.hat, 0.3, 0.1);
}
function bass(t0, dur, midi) {
  const i0 = Math.round(t0 * SR), n = Math.round(dur * SR), f = svf(), hz = mtof(midi);
  for (let k = 0; k < n; k++) {
    const t = k / SR, saw = 2 * ((t * hz) % 1) - 1;
    const env = Math.min(1, t * 200) * Math.min(1, (dur - t) * 40);
    add(i0 + k, f(saw, 220 + 900 * Math.exp(-t * 12), 0.4) * env * MIX.bass, 0, 0, true);
  }
}
function pad(t0, dur, notes) {
  const i0 = Math.round(t0 * SR), n = Math.round(dur * SR);
  notes.forEach((m, j) => {
    const fl = svf(), hz = mtof(m), p = (j / (notes.length - 1)) * 1.2 - 0.6;
    for (let k = 0; k < n; k++) {
      const t = k / SR, env = Math.min(1, t * 3) * Math.min(1, (dur - t) * 4);
      const s1 = 2 * ((t * hz * 1.003) % 1) - 1, s2 = 2 * ((t * hz * 0.997 + 0.3) % 1) - 1;
      add(i0 + k, fl(s1 + s2, 1400, 0.6) * env * MIX.pad / notes.length * 2, p, 0.5, true);
    }
  });
}

// ---------------------------------------------------------------- sfx
const SFX = {
  whoosh(t0, len = 0.6) {
    const i0 = Math.round(t0 * SR - len * 0.6 * SR), n = Math.round(len * SR), f = svf();
    for (let k = 0; k < n; k++) {
      const u = k / n, env = Math.sin(Math.PI * u) ** 2;
      add(i0 + k, f(noise(), 300 + 5000 * u, 1.2, 'bp') * env * 0.9, -0.8 + 1.6 * u, 0.4);
    }
  },
  riser(t0, len = 2) {
    const i0 = Math.round(t0 * SR), n = Math.round(len * B * SR), f = svf();
    let ph = 0;
    for (let k = 0; k < n; k++) {
      const u = k / n; ph += TAU * (200 + 1800 * u * u) / SR;
      add(i0 + k, (f(noise(), 500 + 7000 * u, 0.9, 'bp') * 0.7 + Math.sin(ph) * 0.15) * u * u, 0, 0.5);
    }
  },
  impact(t0) {
    kick(t0, 1.3);
    const i0 = Math.round(t0 * SR), n = Math.round(1.2 * SR), f = svf();
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      add(i0 + k, (f(noise(), 2500 * Math.exp(-t * 3) + 80, 0.8) * 0.8 + Math.sin(TAU * 38 * t) * 0.6) * Math.exp(-t * 4), 0, 0.6);
    }
  },
  click(t0) {
    const i0 = Math.round(t0 * SR), f = svf();
    for (let k = 0; k < 0.02 * SR; k++) add(i0 + k, f(noise(), 4000, 2, 'bp') * Math.exp(-k / SR * 300) * 1.5, 0.2, 0.1);
  },
  tick(t0) {
    const i0 = Math.round(t0 * SR);
    for (let k = 0; k < 0.04 * SR; k++) add(i0 + k, Math.sin(TAU * 2400 * k / SR) * Math.exp(-k / SR * 120) * 0.4, 0.4, 0.2);
  },
  pop(t0) {
    const i0 = Math.round(t0 * SR);
    let ph = 0;
    for (let k = 0; k < 0.12 * SR; k++) {
      const t = k / SR; ph += TAU * (300 + 900 * Math.exp(-t * 40)) / SR;
      add(i0 + k, Math.sin(ph) * Math.exp(-t * 30) * 0.7, -0.2, 0.3);
    }
  },
};

// ---------------------------------------------------------------- arrangement
const beats = Math.floor(DUR / B + 1e-6);
const cueBeats = new Set(meta.cues.filter(c => c.sfx === 'impact').map(c => c.beat));
if (!o['no-music']) {
  for (let b = 0; b < beats; b++) {
    const bar = Math.floor(b / 4), t = b * B;
    if (b >= 2 && !cueBeats.has(b)) kick(t);     // let the intro breathe for two beats
    if (b >= 2) { hat(t + B / 2, 1); hat(t + B / 4, 0.4); hat(t + 3 * B / 4, 0.4); }
    const root = KEY - 24 + CHORDS[bar % CHORDS.length][0];
    bass(t + B / 2, B / 2 * 0.9, root);
    if (b % 4 === 0) pad(t, Math.min(4 * B, DUR - t), CHORDS[bar % CHORDS.length].map(n => KEY + n));
  }
}
bus = MIX.sfx;
for (const c of meta.cues) {
  const fn = SFX[c.sfx];
  if (!fn) { console.warn(`unknown sfx '${c.sfx}' at beat ${c.beat}`); continue; }
  fn(c.beat * B, c.len);
}
bus = 1;

// ---------------------------------------------------------------- reverb (Schroeder-ish) + master
function comb(buf, d, g) { const o = new Float32Array(N); for (let i = 0; i < N; i++) o[i] = buf[i] + (i >= d ? o[i - d] * g : 0); return o; }
function allpass(buf, d, g) { const o = new Float32Array(N); for (let i = 0; i < N; i++) { const x = buf[i], y = i >= d ? o[i - d] : 0; o[i] = -g * x + (i >= d ? buf[i - d] : 0) + g * y; } return o; }
function verb(buf, off) {
  const out = new Float32Array(N);
  for (const d of [1557, 1617, 1491, 1422]) { const c = comb(buf, d + off, 0.82); for (let i = 0; i < N; i++) out[i] += c[i] / 4; }
  return allpass(allpass(out, 225 + off, 0.5), 556 + off, 0.5);
}
const vL = verb(sendL, 0), vR = verb(sendR, 23);
let peak = 0;
for (let i = 0; i < N; i++) {
  L[i] = Math.tanh((L[i] + vL[i] * MIX.reverb) * 1.1); R[i] = Math.tanh((R[i] + vR[i] * MIX.reverb) * 1.1);
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const g = 0.89 / (peak || 1);                    // -1 dBFS
const fade = Math.round(0.05 * SR);

const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8);
buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  const f = i > N - fade ? (N - i) / fade : 1;
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * g * f)) * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * g * f)) * 32767), 46 + i * 4);
}
fs.mkdirSync(path.join(dir, 'audio'), { recursive: true });
const out = path.join(dir, 'audio', 'score.wav');
fs.writeFileSync(out, buf);
console.log(`${meta.BPM} BPM, ${DUR}s, ${meta.cues.length} cues -> ${path.relative(process.cwd(), out)}`);
