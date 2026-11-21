// VELMORA — a travel poster for a place that does not exist.
// A cliffside town above a sea of clouds, where the great waterfall
// falls UP into the sky. Drawn entirely in code: gradients, polygons,
// silhouettes and soft ellipses. No assets, no network, deterministic.
//
// Output: $MAKEFUN_OUTPUT_DIR/entry.png (default /output), 1024x1024.

import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

const W = 1024;
const H = 1024;

type RGB = [number, number, number];

function hex(h: string): RGB {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

// ---------------------------------------------------------------- canvas
class Canvas {
  data = new Uint8Array(W * H * 4);

  // Blend a source colour over the pixel at (x, y) with opacity a (0..1).
  px(x: number, y: number, c: RGB, a: number): void {
    if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
    const i = (y * W + x) * 4;
    if (a >= 1) {
      this.data[i] = c[0];
      this.data[i + 1] = c[1];
      this.data[i + 2] = c[2];
      this.data[i + 3] = 255;
      return;
    }
    const inv = 1 - a;
    this.data[i] = Math.round(c[0] * a + this.data[i] * inv);
    this.data[i + 1] = Math.round(c[1] * a + this.data[i + 1] * inv);
    this.data[i + 2] = Math.round(c[2] * a + this.data[i + 2] * inv);
    this.data[i + 3] = 255;
  }

  rect(x0: number, y0: number, x1: number, y1: number, c: RGB, a = 1): void {
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(H, Math.ceil(y1)); y++)
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(W, Math.ceil(x1)); x++)
        this.px(x, y, c, a);
  }

  // Vertical multi-stop gradient over the whole canvas.
  vgrad(stops: Array<[number, RGB]>): void {
    for (let y = 0; y < H; y++) {
      const t = y / (H - 1);
      let c: RGB = stops[stops.length - 1][1];
      for (let s = 0; s < stops.length - 1; s++) {
        const [t0, c0] = stops[s];
        const [t1, c1] = stops[s + 1];
        if (t >= t0 && t <= t1) {
          c = mix(c0, c1, t1 === t0 ? 0 : (t - t0) / (t1 - t0));
          break;
        }
      }
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        this.data[i] = c[0];
        this.data[i + 1] = c[1];
        this.data[i + 2] = c[2];
        this.data[i + 3] = 255;
      }
    }
  }

  // Fill a list of polygons with the even-odd rule (lets a letter like O
  // carry a counter as a second contour).
  polys(polys: number[][][], c: RGB, a = 1): void {
    let minY = H, maxY = 0, minX = W, maxX = 0;
    for (const p of polys)
      for (const [x, y] of p) {
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    const y0 = Math.max(0, Math.floor(minY));
    const y1 = Math.min(H - 1, Math.ceil(maxY));
    const x0 = Math.max(0, Math.floor(minX));
    const x1 = Math.min(W - 1, Math.ceil(maxX));
    for (let y = y0; y <= y1; y++) {
      const yc = y + 0.5;
      const xs: number[] = [];
      for (const p of polys) {
        for (let i = 0; i < p.length; i++) {
          const [ax, ay] = p[i];
          const [bx, by] = p[(i + 1) % p.length];
          if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) {
            xs.push(ax + ((yc - ay) * (bx - ax)) / (by - ay));
          }
        }
      }
      xs.sort((m, n) => m - n);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = Math.max(x0, Math.ceil(xs[k] - 0.5));
        const xb = Math.min(x1, Math.floor(xs[k + 1] - 0.5));
        for (let x = xa; x <= xb; x++) this.px(x, y, c, a);
      }
    }
  }

  // Hard-edged filled ellipse.
  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB, a = 1): void {
    const x0 = Math.max(0, Math.floor(cx - rx));
    const x1 = Math.min(W - 1, Math.ceil(cx + rx));
    const y0 = Math.max(0, Math.floor(cy - ry));
    const y1 = Math.min(H - 1, Math.ceil(cy + ry));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.px(x, y, c, a);
      }
  }

  // Soft-edged ellipse: opacity falls off smoothly toward the rim.
  // power controls how fast it fades (higher = harder core, softer rim).
  softEllipse(
    cx: number, cy: number, rx: number, ry: number,
    c: RGB, a: number, power = 2,
  ): void {
    const x0 = Math.max(0, Math.floor(cx - rx));
    const x1 = Math.min(W - 1, Math.ceil(cx + rx));
    const y0 = Math.max(0, Math.floor(cy - ry));
    const y1 = Math.min(H - 1, Math.ceil(cy + ry));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        const d = dx * dx + dy * dy;
        if (d < 1) {
          const f = Math.pow(1 - d, power);
          this.px(x, y, c, a * f);
        }
      }
  }

  // Stroked rectangle (frame rule), centred on the given inset.
  frameRect(inset: number, thick: number, c: RGB, a = 1): void {
    this.rect(inset, inset, W - inset, inset + thick, c, a);
    this.rect(inset, H - inset - thick, W - inset, H - inset, c, a);
    this.rect(inset, inset, inset + thick, H - inset, c, a);
    this.rect(W - inset - thick, inset, W - inset, H - inset, c, a);
  }
}

// ------------------------------------------------------- letterforms
// Each glyph is a list of groups; each group is a list of contours filled
// together with the even-odd rule. Strokes that overlap (a stem crossing
// a bar) must live in SEPARATE groups, or the overlap cancels out and
// leaves a hole; only O's counter shares a group with its outline.
// Coordinates live in a 10-wide x 14-tall unit grid, art-deco style:
// tall, geometric, with slight flares at the feet.
const GLYPHS: Record<string, number[][][][]> = {
  V: [
    [[[0, 0], [2.3, 0], [5.7, 14], [4.1, 14]]],
    [[[10, 0], [7.7, 0], [4.3, 14], [5.9, 14]]],
  ],
  E: [
    [[[0, 0], [1.9, 0], [1.9, 14], [0, 14]]],
    [[[0, 0], [10, 0], [10, 1.9], [0, 1.9]]],
    [[[0, 6.05], [7.6, 6.05], [7.6, 7.95], [0, 7.95]]],
    [[[0, 12.1], [10, 12.1], [10, 14], [0, 14]]],
    [[[-0.3, 13.1], [2.2, 13.1], [2.2, 14], [-0.3, 14]]],
  ],
  L: [
    [[[0, 0], [1.9, 0], [1.9, 14], [0, 14]]],
    [[[0, 12.1], [10, 12.1], [10, 14], [0, 14]]],
    [[[-0.3, 13.1], [2.2, 13.1], [2.2, 14], [-0.3, 14]]],
  ],
  M: [
    [[[0, 0], [1.9, 0], [1.9, 14], [0, 14]]],
    [[[8.1, 0], [10, 0], [10, 14], [8.1, 14]]],
    [[[1.9, 0], [3.7, 0], [5.6, 9.4], [4.4, 9.4]]],
    [[[8.1, 0], [6.3, 0], [4.4, 9.4], [5.6, 9.4]]],
    [[[-0.3, 13.1], [2.2, 13.1], [2.2, 14], [-0.3, 14]]],
    [[[7.8, 13.1], [10.3, 13.1], [10.3, 14], [7.8, 14]]],
  ],
  O: [
    [
      [[2.2, 0], [7.8, 0], [10, 2.2], [10, 11.8], [7.8, 14], [2.2, 14], [0, 11.8], [0, 2.2]],
      [[3.4, 1.9], [6.6, 1.9], [8.1, 3.4], [8.1, 10.6], [6.6, 12.1], [3.4, 12.1], [1.9, 10.6], [1.9, 3.4]],
    ],
  ],
  R: [
    [[[0, 0], [1.9, 0], [1.9, 14], [0, 14]]],
    [[[0, 0], [9, 0], [9, 1.9], [0, 1.9]]],
    [[[7.1, 1.9], [9, 1.9], [9, 7], [7.1, 7]]],
    [[[1.9, 5.1], [8, 5.1], [8, 7], [1.9, 7]]],
    [[[4.6, 7], [6.8, 7], [10, 14], [7.8, 14]]],
    [[[-0.3, 13.1], [2.2, 13.1], [2.2, 14], [-0.3, 14]]],
  ],
  A: [
    [[[0, 14], [2.2, 14], [5.9, 0], [4.1, 0]]],
    [[[10, 14], [7.8, 14], [5.9, 0], [4.1, 0]]],
    [[[3.1, 8.4], [6.9, 8.4], [6.9, 10.3], [3.1, 10.3]]],
    [[[-0.3, 13.1], [2.5, 13.1], [2.5, 14], [-0.3, 14]]],
    [[[7.5, 13.1], [10.3, 13.1], [10.3, 14], [7.5, 14]]],
  ],
};

function drawName(cv: Canvas, word: string, cx: number, top: number, size: number, c: RGB, a = 1): void {
  const unit = size / 14; // pixels per grid unit
  const gap = unit * 1.9;
  const total = word.length * 10 * unit + (word.length - 1) * gap;
  let x = cx - total / 2;
  for (const ch of word) {
    const glyph = GLYPHS[ch];
    if (!glyph) continue;
    for (const group of glyph) {
      const scaled = group.map((poly) =>
        poly.map(([gx, gy]) => [x + gx * unit, top + gy * unit]),
      );
      cv.polys(scaled, c, a);
    }
    x += 10 * unit + gap;
  }
}

// ------------------------------------------------------------- palette
const C = {
  skyTop: hex("#122e42"),
  skyMid: hex("#2c6274"),
  skyLow: hex("#c98d54"),
  horizon: hex("#eec27a"),
  sunCore: hex("#ffe9a8"),
  sun: hex("#f2a95c"),
  sunGlow: hex("#f7c873"),
  cream: hex("#f7e7c3"),
  gold: hex("#e9b95e"),
  cliff: hex("#17323e"),
  cliffR: hex("#1c3947"),
  cliffEdge: hex("#3d7285"),
  town: hex("#224653"),
  window: hex("#ffd27a"),
  cloudLight: hex("#faf0d3"),
  cloudMid: hex("#f0d9a4"),
  cloudShade: hex("#cfa06b"),
  cloudDeep: hex("#a97e50"),
  cloudBank: hex("#966f47"),
  cloudTeal: hex("#8fa9a6"),
  upfallCore: hex("#fff8e0"),
  upfallEdge: hex("#bfe0e2"),
  mist: hex("#f6ecd2"),
  airship: hex("#c96f4a"),
  airshipDark: hex("#8f4a30"),
  bird: hex("#1d3a44"),
  frame: hex("#f2e6c8"),
};

function draw(): Canvas {
  const cv = new Canvas();

  // 1. Sky: deep indigo-teal at top grading to warm gold at the horizon.
  cv.vgrad([
    [0.0, C.skyTop],
    [0.32, C.skyMid],
    [0.55, C.skyLow],
    [0.68, C.horizon],
    [1.0, C.horizon],
  ]);

  // 2. Sun: large low disc, slightly right of centre, with a soft glow.
  cv.softEllipse(668, 505, 210, 210, C.sunGlow, 0.55, 2.2);
  cv.softEllipse(668, 505, 150, 150, C.sunGlow, 0.5, 2);
  cv.ellipse(668, 505, 102, 102, C.sun, 1);
  cv.ellipse(668, 505, 78, 78, C.sunCore, 0.85);
  // Thin cloud veiling the sun's lower half.
  cv.softEllipse(600, 545, 190, 22, C.cloudLight, 0.35, 2);
  cv.softEllipse(740, 560, 150, 18, C.cloudLight, 0.3, 2);

  // 3. Distant cloud band along the horizon, plus thin wisps mid-sky
  // so the middle of the poster is never flat empty gradient.
  cv.softEllipse(300, 640, 260, 34, C.cloudMid, 0.55, 2);
  cv.softEllipse(620, 655, 300, 30, C.cloudLight, 0.5, 2);
  cv.softEllipse(880, 640, 220, 28, C.cloudMid, 0.5, 2);
  cv.softEllipse(480, 600, 210, 13, C.cloudLight, 0.3, 2);
  cv.softEllipse(650, 622, 180, 11, C.cloudLight, 0.28, 2);
  cv.softEllipse(380, 585, 150, 11, C.cloudLight, 0.25, 2);

  // 4. The Upfall: a bright ribbon rising from the cliff lake into the sky.
  // S-curve centreline, tapering from wide at the base to narrow at the top.
  // Narrower and more curved than a column, with a white core strand, so
  // it reads as falling water going the wrong way.
  const baseX = 336, baseY = 652, topX = 294, topY = 292;
  const steps = 26;
  const pts: Array<[number, number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = baseY + (topY - baseY) * t;
    const x = baseX + (topX - baseX) * t + Math.sin(t * Math.PI * 1.6) * 24 * (1 - t * 0.35);
    const w = 34 * (1 - t) + 9 * t;
    pts.push([x, y, w]);
  }
  // Pale underlay, bright core, then a thin white core strand.
  for (const [scale, col, alpha] of [
    [1.4, C.upfallEdge, 0.45],
    [1.0, C.upfallCore, 0.92],
    [0.42, hex("#fffdf4"), 0.9],
  ] as const) {
    for (let i = 0; i < steps; i++) {
      const [x0, y0, w0] = pts[i];
      const [x1, y1, w1] = pts[i + 1];
      cv.polys(
        [[
          [x0 - (w0 * scale) / 2, y0],
          [x0 + (w0 * scale) / 2, y0],
          [x1 + (w1 * scale) / 2, y1],
          [x1 - (w1 * scale) / 2, y1],
        ]],
        col,
        alpha,
      );
    }
  }
  // Mist where the water vanishes into cloud at the top. (Base mist and the
  // lake are drawn later, after the cliffs and cloud sea, so the ribbon's
  // lower end dissolves into mist instead of ending in a hard edge.)
  cv.softEllipse(294, 296, 82, 34, C.mist, 0.6, 2);
  cv.softEllipse(332, 318, 52, 22, C.mist, 0.5, 2);
  cv.softEllipse(258, 312, 44, 20, C.mist, 0.45, 2);

  // 5. Cliffs framing the middle, dark slate-teal silhouettes.
  // Inner edges are jagged, never a straight vertical line.
  cv.polys(
    [[
      [0, 1024], [0, 468], [72, 452], [132, 478], [192, 466], [242, 502],
      [298, 556], [330, 640], [312, 760], [344, 880], [316, 1024],
    ]],
    C.cliff,
  );
  cv.polys(
    [[
      [1024, 1024], [1024, 538], [952, 518], [884, 552], [824, 598],
      [792, 676], [808, 780], [780, 900], [802, 1024],
    ]],
    C.cliffR,
  );
  // Sunlit top edges.
  cv.polys([[[0, 468], [72, 452], [132, 478], [192, 466], [242, 502], [298, 556], [330, 640], [330, 648], [296, 564], [240, 510], [190, 474], [130, 486], [70, 460], [0, 476]]], C.cliffEdge, 0.7);
  cv.polys([[[1024, 538], [952, 518], [884, 552], [824, 598], [792, 676], [792, 684], [822, 606], [882, 560], [950, 526], [1024, 546]]], C.cliffEdge, 0.6);

  // 6. The town on the left cliff: tiny houses, a few warm lit windows.
  const houses: Array<[number, number, number, number]> = [
    // x, baseY, width, height
    [58, 460, 26, 20],
    [88, 456, 22, 24],
    [114, 468, 28, 18],
    [146, 470, 22, 22],
    [172, 466, 26, 19],
    [202, 478, 24, 20],
    [228, 492, 22, 18],
  ];
  for (const [hx, hy, hw, hh] of houses) {
    cv.rect(hx, hy - hh, hx + hw, hy, C.town, 1);
    cv.polys([[[hx - 2, hy - hh], [hx + hw / 2, hy - hh - 11], [hx + hw + 2, hy - hh]]], C.town, 1);
  }
  // One slim tower with a spire.
  cv.rect(128, 424, 140, 468, C.town, 1);
  cv.polys([[[127, 424], [134, 404], [141, 424]]], C.town, 1);
  // Warm lit windows.
  const windows: Array<[number, number]> = [
    [64, 446], [94, 442], [120, 456], [152, 458], [178, 454], [208, 466], [233, 480],
    [100, 446], [132, 436], [158, 462],
  ];
  for (const [wx, wy] of windows) cv.rect(wx, wy, wx + 4, wy + 5, C.window, 1);

  // 7. Sea of clouds, bottom third. First a bed of large, very soft,
  // heavily overlapping masses fills the whole middle column — no hard
  // edges anywhere, no flat gold gaps — then layered rounder puffs,
  // light over shade, with cool shadows between the masses.
  cv.softEllipse(400, 730, 280, 95, C.cloudMid, 0.9, 1.4);
  cv.softEllipse(650, 740, 280, 95, C.cloudLight, 0.9, 1.4);
  cv.softEllipse(300, 700, 200, 80, C.cloudMid, 0.85, 1.4);
  cv.softEllipse(810, 710, 200, 80, C.cloudMid, 0.85, 1.4);
  cv.softEllipse(420, 870, 290, 105, C.cloudLight, 0.9, 1.4);
  cv.softEllipse(660, 880, 290, 105, C.cloudMid, 0.9, 1.4);
  cv.softEllipse(400, 990, 300, 110, C.cloudMid, 0.9, 1.4);
  cv.softEllipse(660, 1000, 300, 110, C.cloudLight, 0.9, 1.4);
  cv.softEllipse(180, 700, 220, 55, C.cloudShade, 0.5, 2);
  cv.softEllipse(560, 715, 260, 58, C.cloudShade, 0.45, 2);
  cv.softEllipse(880, 705, 220, 55, C.cloudShade, 0.5, 2);
  cv.softEllipse(120, 760, 190, 60, C.cloudLight, 0.85, 2);
  cv.softEllipse(420, 780, 200, 62, C.cloudMid, 0.9, 2);
  cv.softEllipse(512, 700, 170, 52, C.cloudLight, 0.85, 2);
  cv.softEllipse(660, 800, 190, 60, C.cloudLight, 0.9, 2);
  cv.softEllipse(300, 880, 210, 66, C.cloudLight, 0.9, 2);
  cv.softEllipse(700, 900, 210, 68, C.cloudMid, 0.9, 2);
  cv.softEllipse(500, 950, 230, 70, C.cloudLight, 0.9, 2);
  cv.softEllipse(60, 950, 200, 64, C.cloudMid, 0.85, 2);
  cv.softEllipse(980, 950, 200, 64, C.cloudLight, 0.85, 2);
  // Puffs overlapping the cliff edges so the cliffs melt into the sea.
  cv.softEllipse(330, 760, 130, 46, C.cloudMid, 0.55, 2);
  cv.softEllipse(790, 780, 130, 46, C.cloudMid, 0.7, 2);
  cv.softEllipse(280, 930, 140, 50, C.cloudMid, 0.7, 2);
  cv.softEllipse(790, 930, 140, 50, C.cloudLight, 0.7, 2);
  // Cool teal shadows between the cloud masses for depth.
  cv.softEllipse(430, 845, 170, 24, C.cloudTeal, 0.28, 2);
  cv.softEllipse(760, 830, 160, 22, C.cloudTeal, 0.25, 2);
  cv.softEllipse(150, 835, 140, 20, C.cloudTeal, 0.25, 2);
  cv.softEllipse(560, 720, 150, 18, C.cloudTeal, 0.2, 2);
  // Bright rims where the low sun catches the cloud tops.
  cv.softEllipse(180, 735, 170, 20, C.sunCore, 0.35, 2);
  cv.softEllipse(720, 742, 180, 20, C.sunCore, 0.35, 2);
  cv.softEllipse(500, 690, 150, 16, C.sunCore, 0.3, 2);
  // Polish: deeper shadow masses in the lower sea so the cloud bed reads
  // as layered, three-dimensional forms instead of one flat bright panel.
  // Kept below y ~ 830 so the warm glow near the sun and horizon survives;
  // each shadow mass gets a sunlit puff overlapping its top edge, so the
  // forms read lit-on-top, shaded-below.
  cv.softEllipse(380, 862, 200, 42, C.cloudDeep, 0.55, 2);
  cv.softEllipse(660, 886, 210, 44, C.cloudDeep, 0.5, 2);
  cv.softEllipse(500, 968, 240, 46, C.cloudDeep, 0.5, 2);
  cv.softEllipse(180, 900, 150, 36, C.cloudDeep, 0.4, 2);
  cv.softEllipse(860, 902, 150, 36, C.cloudDeep, 0.4, 2);
  cv.softEllipse(380, 836, 180, 30, C.cloudLight, 0.5, 2);
  cv.softEllipse(660, 860, 190, 30, C.cloudLight, 0.5, 2);
  // A slightly darker cloud bank along the bottom edge grounds the sea.
  cv.softEllipse(330, 1042, 320, 78, C.cloudBank, 0.6, 1.8);
  cv.softEllipse(700, 1042, 320, 78, C.cloudBank, 0.6, 1.8);

  // The cliff lake the Upfall rises from: a bright pool on a dark cliff
  // lip, ringed with mist — so the eye unmistakably reads water rising
  // FROM the pool UP into the sky, instead of the ribbon dissolving
  // into bright cloud. The lip juts from the left cliff; a cool rim
  // separates the bright pool from the warm cloud around it.
  // A shelf jutting from the left cliff: thin at its outer tip, thick
  // where it meets the cliff, so it reads as rock, not a floating bowl.
  cv.polys(
    [[
      [240, 646], [394, 644], [386, 660], [330, 674], [270, 688], [240, 692],
    ]],
    C.cliff,
  );
  cv.polys(
    [[
      [240, 646], [394, 644], [392, 650], [242, 652],
    ]],
    C.cliffEdge, 0.7,
  );
  cv.softEllipse(336, 652, 52, 17, C.cloudTeal, 0.8, 1.6);
  cv.softEllipse(336, 650, 46, 14, C.upfallCore, 0.95, 1.6);
  cv.softEllipse(336, 649, 26, 8, hex("#fffdf4"), 0.6, 1.6);
  // Mist ring around the pool (offset blobs, not a wash over the pool
  // itself) plus a light wisp where the ribbon leaves the water.
  cv.softEllipse(300, 636, 46, 16, C.mist, 0.5, 2);
  cv.softEllipse(372, 640, 44, 16, C.mist, 0.45, 2);
  cv.softEllipse(306, 668, 50, 14, C.mist, 0.45, 2);
  cv.softEllipse(368, 670, 48, 14, C.mist, 0.4, 2);
  cv.softEllipse(336, 628, 40, 12, C.mist, 0.4, 2);

  // 8. One small airship drifting near the sun, for wonder and scale.
  const ax = 812, ay = 372;
  cv.ellipse(ax, ay, 36, 12, C.airship, 1);
  cv.ellipse(ax, ay + 3, 36, 8, C.airshipDark, 0.55);
  cv.polys([[[ax + 30, ay - 2], [ax + 44, ay - 10], [ax + 40, ay + 1]]], C.airshipDark, 1);
  cv.polys([[[ax + 30, ay + 2], [ax + 44, ay + 10], [ax + 40, ay - 1]]], C.airshipDark, 1);
  cv.rect(ax - 8, ay + 11, ax + 8, ay + 17, C.airshipDark, 1);

  // A few tiny birds as simple arcs.
  const birds: Array<[number, number, number]> = [
    [185, 335, 12], [232, 306, 10], [560, 292, 11], [730, 296, 9], [770, 330, 10],
  ];
  for (const [bx, by, bs] of birds) {
    cv.polys(
      [[
        [bx - bs, by + 3], [bx - bs / 2, by - 2], [bx, by + 1],
        [bx + bs / 2, by - 2], [bx + bs, by + 3],
        [bx + bs / 2, by], [bx, by + 4], [bx - bs / 2, by],
      ]],
      C.bird,
      0.75,
    );
  }

  // 9. The name: VELMORA, large art-deco caps across the upper sky.
  // One soft offset shadow so it sits in the sky, then cream letterforms.
  drawName(cv, "VELMORA", 516, 119, 118, hex("#0d2431"), 0.45);
  drawName(cv, "VELMORA", 512, 112, 118, C.cream, 1);

  // Thin rule + deco diamond beneath the name.
  cv.rect(300, 256, 712, 258, C.cream, 0.75);
  cv.polys([[[512, 248], [520, 257], [512, 266], [504, 257]]], C.gold, 1);

  // 10. Thin double-rule cream frame near the edges.
  cv.frameRect(20, 3, C.frame, 0.9);
  cv.frameRect(32, 1, C.frame, 0.65);

  return cv;
}

// ------------------------------------------------------------ PNG writer
// Minimal encoder: signature, IHDR, one IDAT (zlib deflate, filter 0 per
// row), IEND. CRC32 with a precomputed table. Fully deterministic.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(cv: Canvas): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0; // filter: None
    Buffer.from(cv.data.buffer, cv.data.byteOffset + y * W * 4, W * 4).copy(
      raw,
      y * (W * 4 + 1) + 1,
    );
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------ main
function main(): void {
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  fs.mkdirSync(outDir, { recursive: true });
  const cv = draw();
  const png = encodePNG(cv);
  const outPath = path.join(outDir, "entry.png");
  fs.writeFileSync(outPath, png);
  console.log(`wrote ${outPath} (${png.length} bytes, ${W}x${H})`);
}

main();
