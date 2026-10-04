# Step 00 · Interview

Run this before any other step. Ask with the **AskUserQuestion** tool so the user gets clickable choices. Every question also gets a free-text "Other" box automatically, so options are suggestions, not limits.

Rules:
- Up to 4 questions per call. Each question has 2–4 options. Put your recommendation first and add "(Recommended)" to its label.
- Skip any question the user's request already answers. Never ask for something you can find yourself (a site's colors, its headlines).
- Where an answer has to be the user's own words (name, URL, headline), give 2–3 concrete drafts as options. The user picks one or types their own in "Other".
- Fill each later round's options from earlier answers and from `gather.mjs` output. Don't use generic placeholders.
- Record every answer in `films/<name>/interview.json` as you go: `{ "question header": "answer", ... }`.

## Round 1 · The job

| header | question | options | multi |
|---|---|---|---|
| Film type | What are we making? | Product promo · Launch announcement · Personal/brand showreel · Social clip | no |
| Length | How long should it run? | 15 s (Recommended) · 8 s · 30 s · 60 s | no |
| Formats | Which aspect ratios do you need? | 16:9 landscape · 9:16 vertical · 1:1 square | yes |
| Source | Where should brand assets come from? | A website I'll give you · Files I'll put in assets/ · Nothing yet, design it from scratch | no |

Then:
- **Source = website**: ask for the URL (Round 1b) if the request doesn't include one, run `scripts/gather.mjs`, and read `assets/assets.md` before Round 2.
- **Source = files**: tell the user the folder path, wait until they say the files are there, then list what you found.

### Round 1b · URL (only if needed)
| header | question | options |
|---|---|---|
| Website | Which site should I pull the brand from? | Up to 3 likely domains taken from the request · "I'll paste it" |

## Round 2 · The story

Base the drafts on the gathered headlines and copy. For a showreel, ask about scenes and skills on show instead of features.

| header | question | options | multi |
|---|---|---|---|
| Message | What's the one sentence the viewer should leave with? | 3 drafts | no |
| Hook | What's the opening problem, in a few words of kinetic type? | 3 drafts, each ≤ 4 words | no |
| Features | Which features should get a UI moment? Pick up to three. | 4 candidates from the site | yes |
| Proof | Which number proves it works? | 2–3 metrics from the site · "No metric, end on the product" | no |

## Round 3 · Look and sound

| header | question | options | multi |
|---|---|---|---|
| Tone | What should it feel like? | Bold kinetic · Clean and minimal · Playful and bouncy · Technical/HUD | no |
| Palette | Which palette? | Brand colors from the site (Recommended when gathered) · Dark with one hot accent · Light editorial | no |
| Sound | What should it sound like? | Synthesized score + SFX (Recommended) · I'll supply a track · SFX only · Silent | no |
| Ending | How should it end? | Logo lockup + CTA (Recommended) · Logo only · URL on screen · Loop back to the start | no |

- If Ending includes a CTA, add one more question with 3 CTA drafts.
- If Sound = supplied track, ask for its path and BPM. If they don't know the BPM, measure it from the beats.

## Round 4 · Confirm

Write `films/<name>/BRIEF.md` from the answers: audience, duration, BPM, aspects, message, story spine (step 04), palette, type, sound, ending. Show the user a short summary of it. Then ask one last question:

| header | question | options |
|---|---|---|
| Brief | Does this brief look right? | Looks good, write the shot list (Recommended) · Change something |

On "Change something", ask what to change, update the brief, and confirm again. Go on to step 01 only after "Looks good". From here on, the brief is the spec. Interrupt the user again only at the ⏸ gates.
