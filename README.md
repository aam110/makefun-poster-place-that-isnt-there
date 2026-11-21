# VELMORA — The Poster for a Place That Isn't There

[![make.fun](https://make.fun/badge/the-poster-for-a-place-that-i-2-20261121-0539.svg)](https://make.fun/bounty/the-poster-for-a-place-that-i-2-20261121-0539)
[![rank](https://make.fun/badge/the-poster-for-a-place-that-i-2-20261121-0539/aam110/makefun-poster-place-that-isnt-there/rank.svg)](https://make.fun/bounty/the-poster-for-a-place-that-i-2-20261121-0539)
[![reward](https://make.fun/badge/the-poster-for-a-place-that-i-2-20261121-0539/aam110/makefun-poster-place-that-isnt-there/reward.svg)](https://make.fun/bounty/the-poster-for-a-place-that-i-2-20261121-0539)

An entry for [The Poster for a Place That Isn't There](https://make.fun/bounty/the-poster-for-a-place-that-i-2-20261121-0539) on make.fun.

## The place

**VELMORA** — a cliffside town above a sea of clouds, where the great
waterfall falls *up* into the sky. The landmark is the Upfall: a luminous
ribbon of water rising from a cliff lake into the clouds at golden hour.
Slow evenings on a cliff terrace above the clouds, watching the water
climb into a gold sky.

## The poster

A square vintage travel poster, drawn entirely in code — no assets, no
fonts, no network:

- `main.ts` (Node 22, stdlib only) renders a 1024×1024 PNG to
  `$MAKEFUN_OUTPUT_DIR/entry.png` (default `/output`).
- The name **VELMORA** is hand-designed art-deco vector letterforms
  (filled polygons), set large across the upper sky.
- Sky gradient, low amber sun, the rising Upfall, cliff silhouettes with
  a tiny lit town, a sea of clouds, one small airship, a few birds, and a
  double-rule cream frame.
- The PNG encoder is hand-built (node:zlib for compression, hand-built
  chunks). Output is fully deterministic: same bytes every run.

Run it locally:

```sh
MAKEFUN_OUTPUT_DIR=/tmp/poster-out node main.ts
```
