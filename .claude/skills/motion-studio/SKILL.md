---
name: motion-studio
description: Produce a motion-graphics video (showreel, product promo, launch film, social clip) entirely from code — a seek(t) canvas film, closed-form springs, a beat grid, a synthesized score and SFX, a contact-sheet critique loop, and multi-aspect H.264 renders. Use when the user asks for a motion graphics video, an animated promo, a showreel, a launch video, kinetic type, or an MP4 made with code.
---

# Motion studio

A 12-step pipeline for code-rendered motion design. The prompt is 10% of the video. The harness below is the other 90%.

Everything lives in this skill folder (`$SKILL` below = the directory holding this file):

| Path | What it is |
|---|---|
| `HOUSE_RULES.md` | Non-negotiable rules. Copied into the film folder; re-read before every pass. |
| `template/` | Starter film: `index.html`, `lib.js` (springs, easing, beat grid, layout, seeded noise, motion blur), `film.js` (the scenes). |
| `scripts/new-film.sh <dir>` | Scaffolds a film folder from `template/`. |
| `scripts/gather.mjs <url> <dir>` | Screenshots + colors + fonts + logo candidates from a website. |
| `scripts/render.mjs <dir>` | Renders frames in headless Chromium and encodes MP4 with audio. |
| `scripts/audio.mjs <dir>` | Synthesizes score + SFX on the film's beat grid into `audio/score.wav`. |
| `scripts/contact-sheet.mjs <dir>` | Renders stills and tiles them into a contact sheet PNG for critique. |

Requirements: Node 18+, `playwright` (global or local; Chromium already installed), `ffmpeg`. Never run `playwright install` if a browser is already present.

## The 12 steps

Work through the gates in order: **plan → rig → stills → animatic → full pass → polish → audio → render**. Don't skip gates. Show the user the artifact at each gate marked ⏸.

### 01 · Baseline
If the user just wants to see what's possible, run the one-liner from step 03 with no harness first. It shows the default failure mode: centered text on a gradient, everything fading in, a logo at the end. Everything after this step exists to beat that.

### 02 · Install the studio
```bash
bash $SKILL/scripts/new-film.sh films/<name>      # copies template + HOUSE_RULES.md
```
Read `films/<name>/HOUSE_RULES.md` in full. It overrides your defaults for the rest of the job.

### 03 · The one-liner and why it works
Reference prompt: *"make a dynamic 15-second motion graphics video that shows what an incredible motion designer you are, like it's your showreel for a résumé. go all out."*
It works because it names a duration (forces a timeline), an audience (a résumé reel must show range), and a bar ("go all out" licenses camera moves, kinetic type, and sound). When the user's request is vaguer than this, fill in those three things yourself before planning.

### 04 · Brief and story
Write `films/<name>/BRIEF.md`: audience, duration, aspect ratios, one-sentence message, palette, type.
For a product film, use this spine unless the user gives another:
1. Hook — the problem, in large kinetic type.
2. The product appears; its UI assembles itself.
3. Three features as UI moments with a cursor doing real actions.
4. One metric that proves it works.
5. Logo lockup and call to action.

For a showreel, plan 6–8 scenes that each show a different skill (type, shape morph, particles, easing study, 3D, montage, end card).

### 05 · Gather real assets
If there's a product or brand, never invent it.
```bash
node $SKILL/scripts/gather.mjs https://example.com films/<name>/assets
```
This saves full-page and viewport screenshots, `palette.json` (computed colors), `fonts.json`, and logo/icon candidates. List what you found to the user before animating. Use real screenshots, real logos, real colors, real fonts. Put any font files in `assets/` and register them in `index.html` with `@font-face`.

### 06 · Beat grid
Pick a BPM (120–128 for promos; 128 gives 32 beats = 15 s). Set `BPM` and `DUR` in `film.js`. Every scene start, cut, and impact is written in **beats**, not seconds (`beat(t)` in `lib.js`). Add a `cues` entry for every hit that should get a sound: `{ beat: 8, sfx: 'impact' }`. Available SFX: `whoosh`, `click`, `impact`, `riser`, `tick`, `pop`.

### 07 · Shot list ⏸
Write the shot list in `BRIEF.md`: scene, beat range, what moves, which spring, which cue. Get the user's approval before writing scene code.

### 08 · Springs — make motion feel expensive
Cheap motion eases from A to B on a fixed curve. Expensive motion has mass: it accelerates, overshoots a hair, settles. Use `spring(t - t0, { stiffness, damping, mass })` from `lib.js`. It is closed-form, so `seek(t)` stays a pure function of time. When one motion hands off to another, start the next from the previous end value and use `springV` to match velocity at the seam. Reserve `E.*` easing curves for camera moves and wipes.

### 09 · Rig, stills, animatic ⏸
- **Rig**: build each scene as a function `(ctx, t, L)` where `L` is the layout object. Never use fixed pixels; use `L.u` (1 unit = 1/1080 of the short side), `L.cx/cy`, `L.safe`, and `L.portrait`.
- **Stills**: `node $SKILL/scripts/contact-sheet.mjs films/<name>` — inspect the key poses before animating between them.
- **Animatic**: `node $SKILL/scripts/render.mjs films/<name> --fps 15 --samples 1 --out out/animatic.mp4` for a fast timing check. Show it.

### 10 · Full pass, polish, sound
- Full pass at 60 fps with motion blur (`--samples 8`).
- Polish: secondary motion, staggered letters, camera drift, grain, a HUD only if it carries information.
- Sound: `node $SKILL/scripts/audio.mjs films/<name>`. It reads `BPM`, `DUR`, and `cues` from the film, then writes a kick/hat/bass/pad score plus SFX on the cues. Adjust `KEY`, `CHORDS`, and the mix at the top of `audio.mjs` (copy it into the film folder first if you change it). If the user supplies a track, put it at `audio/score.wav` and skip synthesis; re-time the beat grid to the track's BPM.

### 11 · Critique loop — Opus fixes its own frames
Before showing the user any full render, critique it yourself. Minimum 3 rounds.
1. `node $SKILL/scripts/contact-sheet.mjs films/<name>` → `out/contact.png` (stills on every beat boundary + midpoints).
2. Read the contact sheet image. Also read 2–3 individual stills at the busiest moments.
3. Score each axis 1–10 and write it to `out/critique.md`:
   - hierarchy (one focal point per frame)
   - composition (safe area, balance, nothing clipped)
   - typography (size contrast, kerning, no orphans)
   - motion (springs not linear, staggers, no dead frames)
   - timing (hits land on beats, cuts on the grid)
   - originality (zero banned defaults from HOUSE_RULES)
   - craft (no aliasing, banding, overlaps, empty frames)
4. List each defect with its timestamp and the fix. Fix, re-render, re-score.
5. Ship only when every axis is ≥ 8 and the banned-defaults list is clean. Report the final scores.

### 12 · Ship ⏸
Render every aspect the brief asks for. Run them in parallel:
```bash
node $SKILL/scripts/audio.mjs  films/<name>
node $SKILL/scripts/render.mjs films/<name> --aspect 16:9 &
node $SKILL/scripts/render.mjs films/<name> --aspect 9:16 &
node $SKILL/scripts/render.mjs films/<name> --aspect 1:1  &
wait
```
Outputs land in `films/<name>/out/<name>_<aspect>.mp4` (H.264, yuv420p, CRF 16, AAC). Make a contact sheet for each aspect and check the portrait one for clipped type. Hand the user the file paths, durations, and final critique scores.

## Rules of thumb
- Don't show the user anything you haven't looked at yourself.
- One idea per scene. Cut on the beat.
- If a frame would make a good poster, the scene is working.
