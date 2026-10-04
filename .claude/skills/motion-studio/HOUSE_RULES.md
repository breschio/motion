# House rules

Read these before every pass. They override your defaults.

## Determinism
- Every film is a pure function of time. `window.FILM.seek(t)` paints frame `t`.
- No CSS transitions or animations. No `setTimeout`, `setInterval`, or `requestAnimationFrame` in render mode. No state carried between frames.
- Randomness comes only from seeded noise (`rand(seed)`, `noise1`). Never `Math.random()`.
- Motion is closed-form springs (`spring`, `springV`) or easing curves. No physics integration across frames.
- Time is written in beats. `beat(t)` converts.

## Layout
- No fixed pixels. Size and position from the layout object `L` (`L.u`, `L.cx`, `L.cy`, `L.safe`, `L.portrait`).
- Every frame must work at 16:9, 9:16, and 1:1. Keep type inside `L.safe`.

## Banned defaults
- Centered title on a gradient.
- Everything fading in. Opacity is never the only thing that changes.
- Logo-at-the-end as the only idea.
- Corner labels and frame borders that carry no information.
- Glow on UI chrome.
- Linear motion on anything that represents a physical object.
- Stock-looking abstract blobs as filler.
- Invented product UI when real screenshots exist.

## Craft
- One focal point per frame.
- Type scale contrast of at least 3:1 between headline and support text.
- Cuts land on the beat grid. Impacts get a cue.
- Motion blur on in the final render (`--samples 8` or more).

## Render
- Render with `node $SKILL/scripts/render.mjs <film>`.
- Encode H.264, yuv420p, CRF 16, AAC 256k, `+faststart`.
- Critique with the contact sheet before showing anything. All axes ≥ 8 to ship.

## Workflow gates
plan → rig → stills → animatic → full pass → polish → audio → render. Don't skip gates.
