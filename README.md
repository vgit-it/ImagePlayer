# ImagePlayer

A photo loop to run in the background of a family gathering. Open it, put it
fullscreen, walk away.

No build step, no dependencies, no server, no network. Node is used only to
regenerate the playlist when you add photos.

## Use it

1. Drop your images into `photos/` (any mix of sizes and aspect ratios).
2. Run `node tools/build-manifest.mjs`.
3. Open `index.html` in a browser and press `F` for fullscreen.

That's the whole workflow. While `photos/` is empty the player falls back to
the placeholder images in `samples/`, so it runs the moment you clone it.

**Adding photos through github.com instead?** Just upload them — you can skip
step 2. A GitHub Action watches `photos/` and regenerates the playlist for you,
because there is no shell to run node in when you drag files onto the web UI.

## The design — "Ambient Frame"

The screen is never "a photo on a background." It is one softly-lit surface
whose colour comes from the photo currently showing. The photo sits whole and
uncropped in the middle; behind it, the same image blown up, heavily blurred and
dimmed, fills everything else.

That single move is what makes mixed aspect ratios work. A tall portrait photo
doesn't sit in two black bars — it sits in a haze of its own colours, and the
room changes colour every time the photo changes.

Everything else follows from one constraint: **this is background, not
foreground.** Nobody watches it. People glance up mid-conversation, catch a
photo, smile, and look away.

- **Nothing on screen but the photo.** No captions, counters, dots, progress
  bar, filenames or controls.
- **Sized per axis — 88% of screen height, 78% of width.** On a 16:9 screen the
  scarce axis is vertical for a portrait photo and horizontal for a panorama, so
  a single shared cap serves neither. Small images are enlarged to match rather
  than sitting as little islands, but only up to 1.8x, past which they stop
  looking like photographs.
- **Warm off-black base** (`#0d0b0a`), not `#000` — pure black makes a bright
  photo look like it's punching a hole in the wall.
- **10s hold, ~4% drift.** You should not be able to *see* it moving, only
  notice afterwards that it has. Direction alternates so consecutive photos
  never push the same way.
- **1.5s cross-dissolve — but the backdrop fades over 2.5s.** The room's colour
  shifts a beat behind the photo. That lag is the detail that makes it feel
  considered rather than generic.
- **Shuffle per pass.** The full set is shuffled, played through once, then
  reshuffled, so nothing repeats until everything has been seen. A fixed order
  becomes recognisable after forty minutes.
- **Fails in silence.** An unreadable file is dropped from the playlist rather
  than showing a broken-image icon on a TV in front of the family.

## Hidden controls

Nothing is drawn on screen for these.

| Key | |
| --- | --- |
| `F` or double-click | fullscreen |
| `Space` | pause / resume |
| `→` / `←` | next / previous |

The pointer hides itself after two seconds of stillness. The browser's Screen
Wake Lock is requested on start, so the display shouldn't sleep mid-event.

## Tuning

Timings and motion live in the `CONFIG` block at the top of
`assets/player.js`; palette and layout live in the `:root` block of
`assets/styles.css`. The committed values are the **warm & nostalgic** preset.

Other presets, if the occasion changes:

| | hold | drift | notes |
| --- | --- | --- | --- |
| Warm & nostalgic *(current)* | 10s | 0.04 | amber cast, unhurried |
| Bright & celebratory | 6s | 0.04 | raise `--backdrop-brightness` to `0.55`, drop `sepia` to `0` |
| Quiet & reverent | 12s | 0 | drop `saturate` to `0.75`, `--backdrop-brightness` to `0.35` |
| Neutral & modern | 8s | 0.03 | drop `sepia` to `0`, base to `#0b0b0c` |

`prefers-reduced-motion` is respected — the drift is dropped, the
cross-dissolves stay.

## Layout

```
index.html                 the page
assets/styles.css          palette, layout, vignette
assets/player.js           playlist, preloading, drift, transitions
photos/                    your images go here
samples/                   placeholder images in assorted aspect ratios
photos.js                  generated playlist — do not edit by hand
tools/build-manifest.mjs   rescans photos/ and rewrites photos.js
tools/make-samples.mjs     regenerates samples/
.github/workflows/         rebuilds photos.js when photos/ changes on a push
```

### A note on large photos

Straight-from-the-camera files (8–12 MB each) are fine for a set this size —
two photos are decoded ahead, so a big file never lands mid-fade. If you ever
push past a few hundred photos, downscale them to roughly 2560px on the long
edge first.
