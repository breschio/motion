# Claude — Showreel 2026

A 15-second motion-design showreel. `showreel.mp4` is the rendered result (1920×1080, 60 fps, stereo audio).

Everything is code. There are no keyframes, footage, or samples.

- `reel.js` draws each frame on a canvas as a pure function of time. Eight scenes on a 128 BPM grid (32 beats = 15 s): cold open, kinetic type, shape morph, particle sim, easing/timing study, 3D point clouds, a half-beat montage, and an end card.
- `render.mjs` drives it in headless Chromium. Each frame averages 10 sub-frames across a 180°-style shutter for real motion blur.
- `audio.mjs` synthesizes the soundtrack (kick, clap, hats, sidechained pad and bass, arpeggio, risers, impacts, reverb) on the same beat grid.

Open `index.html` to watch it live in a browser (click to restart). Rebuild the video with `npm run build` (needs ffmpeg and Playwright's Chromium).
