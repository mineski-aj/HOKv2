# Matte reveal / matte hide in a browser overlay

How the HOK overlays reveal and hide an image with an animated **matte** (an After Effects / video
alpha matte), using only CSS in a plain HTML page (works as an OBS / vMix browser source).
Used in `html/led-events.html` (hero reveal + wipe) and `html/draftpick.html` (hero pick reveal).

## The idea

A matte is a short video whose **alpha channel** goes from empty (0) to fully opaque (1) in an organic
shape (flames, brush strokes...). Wherever the matte is opaque, the image underneath is visible.

- **Reveal** = play the matte forward (empty → opaque).
- **Hide / wipe out** = play the same (or another) matte **in reverse** (opaque → empty).

A browser cannot use a `<video>` as a CSS mask, so the video is turned into a **sprite strip**: every
frame stacked vertically in one PNG (alpha = matte). The animation is then just stepping
`mask-position` down (or up) the strip with `steps()`.

```
 strip PNG (frame size W x H, N frames, total W x H*N)
 ┌────────┐ frame 0   alpha 0   (nothing visible)
 │        │
 ├────────┤ frame 1
 │        │
 ├────────┤  ...
 ├────────┤ frame N-1 alpha 1   (everything visible)
 └────────┘
```

## Step 1 — turn the matte video into a strip (ffmpeg)

The matte lives in the video's **alpha** channel (we received ProRes 4444 `.mov` files with alpha;
`pix_fmt=yuva444p12le`). Check first that alpha really goes 0 → 1 (and which way) — see "Checking" below.

```bash
# 1) frames: every 2nd frame (60 fps source -> 30 fps), scaled to the frame size you need,
#    alpha extracted to grey, stacked vertically (tile=1xN).   N = number of frames kept.
ffmpeg -y -i "MATTE.mov" \
  -vf "select='not(mod(n\,2))',scale=960:175,format=rgba,alphaextract,format=gray,tile=1x46" \
  -frames:v 1 strip_gray.png

# 2) make it an RGBA PNG whose ALPHA is that grey strip (CSS masks read alpha)
ffmpeg -y -f lavfi -i color=c=white:s=960x8050,format=rgba -i strip_gray.png \
  -filter_complex "[0][1]alphamerge" -frames:v 1 matte_strip.png
```

Rules for the numbers:

- `tile=1xN` → `N` must equal the number of frames after `select` (91 source frames, every 2nd = 46).
  Check with `ffprobe -show_entries stream=nb_frames`.
- Strip height in step 2 = frame height × N (here 175 × 46 = 8050).
- Mirrored version (for the other side of the screen): add `,hflip` after `format=gray`.
- Frame size: the matte is soft, so a half-resolution frame is fine. Keep the **aspect ratio of the
  element you will mask** (see "Aspect ratio" below).
- If the source video is **premultiplied** it does not matter here — we only use its alpha.

### Aspect ratio

The matte video is 16:9 (1920x1080). To mask an element with another shape either:

1. **Squash** the whole frame to the element's shape (`scale=960:175` for a 1408x256 element). Keeps the
   whole sweep and its timing; the shape just looks flatter. This is what the LED events use.
2. **Crop** the centre to the element's ratio (`crop=W:H:X:Y,scale=...`) — no distortion but you lose the
   sides, and the sweep may finish "off-screen" earlier. Draft Pick uses a 792x1080 portrait centre crop.

## Step 2 — the CSS

Element `.reveal` is the thing being revealed (an `<img>`, or a wrapper `<div>` containing it).

```css
.reveal {
  -webkit-mask-image: url('matte_strip.png');
  mask-image:         url('matte_strip.png');
  -webkit-mask-size: 100% 4600%;      mask-size: 100% 4600%;      /* 100% x (N*100)%  ->  N = 46 */
  -webkit-mask-repeat: no-repeat;     mask-repeat: no-repeat;
  -webkit-mask-position: 0 0;         mask-position: 0 0;         /* 0% = first frame = hidden */
}
```

`mask-size: 100% <N*100>%` makes ONE frame exactly fill the element; `mask-position-y` then picks the frame:
`0%` = frame 0, `100%` = frame N-1, and `i/(N-1)` = frame i.

Animate it with `steps(N-1)` so it shows each frame once, no blending between frames:

```css
/* reveal: hidden -> visible */
.reveal.in  { animation: matteIn 1.5s steps(45, end) forwards; }
@keyframes matteIn {
  from { -webkit-mask-position: 0 0;    mask-position: 0 0; }
  to   { -webkit-mask-position: 0 100%; mask-position: 0 100%; }
}

/* hide: visible -> hidden (same strip played backwards) */
.reveal.out { animation: matteOut 1.5s steps(45, end) forwards; }
@keyframes matteOut {
  from { -webkit-mask-position: 0 100%; mask-position: 0 100%; }
  to   { -webkit-mask-position: 0 0;    mask-position: 0 0; }
}
```

Duration = N frames ÷ fps (46 frames at 30 fps ≈ 1.5 s). `steps(N-1, end)` for N frames.

Trigger from JS by toggling the class (restart a finished animation by removing the class, forcing a
reflow, then adding it again):

```js
el.classList.remove('in', 'out');
void el.offsetWidth;            // reflow so the animation restarts from frame 0
el.classList.add('in');         // reveal
// ... later:
el.classList.remove('in');
el.classList.add('out');        // hide
```

## Step 3 — using TWO different mattes (reveal one, hide with another)

LED Events reveals with one matte and hides with a different one. Putting both on the same element
with a class swap makes the second strip load only when it is first needed → a visible pop/flicker.
Instead **attach both as two mask layers, always**, multiplied together (`intersect`), and animate
each layer's position independently. Both PNGs are then loaded at page start.

```css
.reveal {
  -webkit-mask-image: url('in_strip.png'), url('out_strip.png');
  mask-image:         url('in_strip.png'), url('out_strip.png');
  -webkit-mask-size: 100% 4100%, 100% 4600%;   mask-size: 100% 4100%, 100% 4600%;   /* 41 and 46 frames */
  -webkit-mask-repeat: no-repeat, no-repeat;   mask-repeat: no-repeat, no-repeat;
  -webkit-mask-composite: source-in;           mask-composite: intersect;          /* alpha x alpha */
  /* layer 1 (reveal) rests EMPTY, layer 2 (hide) rests FULLY OPAQUE */
  -webkit-mask-position: 0 0, 0 100%;          mask-position: 0 0, 0 100%;
}
.reveal.in  { animation: matteIn  1.35s steps(40, end) forwards; }
.reveal.out { animation: matteOut 1.5s  steps(45, end) forwards; }
@keyframes matteIn {
  from { -webkit-mask-position: 0 0,    0 100%; mask-position: 0 0,    0 100%; }
  to   { -webkit-mask-position: 0 100%, 0 100%; mask-position: 0 100%, 0 100%; }
}
@keyframes matteOut {   /* layer 1 must be held at "open" while layer 2 plays */
  from { -webkit-mask-position: 0 100%, 0 100%; mask-position: 0 100%, 0 100%; }
  to   { -webkit-mask-position: 0 100%, 0 0;    mask-position: 0 100%, 0 0; }
}
```

The first/last frame of each strip must be truly empty / truly opaque (alpha 0 / 255 everywhere) or the
layers will leave residue. Check it (below).

## Gotchas we hit

- **Attach the mask image up front** (always-on mask resting on its opaque frame, or two layers as
  above). Adding `mask-image` only when the hide starts made the image blink while the PNG loaded.
- **Do not animate with a CSS transition between frames** — always `steps()`, or the matte blends and
  looks like a soft fade.
- **Reverse = just swap `from`/`to`.** No second asset needed (the LED events also use a different
  matte for the hide, but reversing the reveal matte works the same way).
- **Mask goes on a wrapper if you also transform the image.** Zoom / shake animations (`transform`) on
  the same element as the mask move the mask with it. Put the mask on the outer element and zoom/shake
  the `<img>` (or an inner wrapper) inside it. Shaking a wrapper that is oversized (`inset: -14px`)
  stops the edge from showing during the shake.
- **Mirrored pairs:** a left-side element uses one strip, the right-side element the `hflip`ped copy.
- **Large strips are fine:** 960x8050 RGBA PNG ≈ 700 KB on disk; it decodes to ~30 MB, so do not make
  the frames bigger than they need to be (the matte is soft).
- **Browser support:** unprefixed `mask-*` and `mask-composite: intersect` work in recent Chromium (OBS
  30+). The `-webkit-mask-*` lines above keep older OBS/CEF builds working
  (`-webkit-mask-composite: source-in` is the old name for intersect). Always keep both versions.
- **Order of the layers in `mask-position`/`mask-size` lists matches the order in `mask-image`.**

## Checking a matte video / strip (python + numpy)

Is the video's alpha going 0 → 1 (reveal) or 1 → 0?

```bash
ffmpeg -v error -i MATTE.mov -vf "scale=96:54,format=rgba,alphaextract,format=gray" -f rawvideo - \
 | python3 -c "
import sys,numpy as np
d=np.frombuffer(sys.stdin.buffer.read(),np.uint8); n=len(d)//(96*54)
print(n,[round(d[i*96*54:(i+1)*96*54].mean()/255,2) for i in range(0,n,max(1,n//20))])"
```

Expect something like `0.0 … 0.5 … 1.0` for a reveal. Verify a finished strip: first frame's max
alpha ≈ 0 and last frame's min alpha = 255:

```bash
N=46; W=960; H=175
ffmpeg -v error -i matte_strip.png -vf "format=rgba,alphaextract,format=gray" -f rawvideo - | python3 -c "
import sys,numpy as np
d=np.frombuffer(sys.stdin.buffer.read(),np.uint8).reshape($N,$H,$W)
print('first max',d[0].max(),'last min',d[$N-1].min())"
```

## Where this is in the repo

- `html/css/led-events.css` + `html/js/led-events.js` — two-layer reveal (`led_in_*.png`) and hide
  (`led_matte_*.png`) across a 1408x256 LED table; slow zoom + small image shake after the reveal.
- `html/css/draftpick.css` — single-matte hero reveal (`hero_matte_L/R.png`, 165x225 frames).
- `assets/images/led-events/`, `assets/images/0.draft-phase/` — the strips.
- Source mattes: `MATTE 2.mov` (91 frames, 1.5 s), `MATTE 6.mov` (81 frames, 1.35 s).
