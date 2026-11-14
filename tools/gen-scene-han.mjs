// Han river at night with Namsan: a 640x360 pixel-art backdrop as one animated SVG string.
// Usage: node gen.mjs  -> scene.ts (export const SCENE), scene.svg, scene-b.svg (preview of the animations' second state)
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const W = 640;
const H = 360;

// ---- seeded random -------------------------------------------------------------------------
let seed = 20261114;
function rnd() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (a) => a[Math.floor(rnd() * a.length)];
const R = Math.round;

function mix(a, b, t) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return '#' + pa.map((v, i) => R(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
function interp(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    if (x <= x2) return y1 + ((y2 - y1) * (x - x1)) / (x2 - x1);
  }
  return pts.at(-1)[1];
}

// ---- pixel layers, turned into merged rect paths ---------------------------------------------
const P = (a, b) => a + (b < 0 ? '' : ' ') + b;
class Layer {
  constructor() {
    this.p = new Array(W * H).fill(null);
  }
  px(x, y, c) {
    x = R(x);
    y = R(y);
    if (x >= 0 && x < W && y >= 0 && y < H) this.p[y * W + x] = c;
  }
  get(x, y) {
    return x >= 0 && x < W && y >= 0 && y < H ? this.p[y * W + x] : null;
  }
  rect(x, y, w, h, c) {
    x = R(x);
    y = R(y);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c);
  }
  svg() {
    const rects = [];
    let active = new Map();
    for (let y = 0; y < H; y++) {
      const next = new Map();
      let x = 0;
      while (x < W) {
        const c = this.p[y * W + x];
        if (c == null) {
          x++;
          continue;
        }
        let x1 = x + 1;
        while (x1 < W && this.p[y * W + x1] === c) x1++;
        const key = x + ',' + (x1 - x) + ',' + c;
        const r = active.get(key);
        if (r) {
          r.h++;
          next.set(key, r);
        } else {
          const n = { x, y, w: x1 - x, h: 1, c };
          rects.push(n);
          next.set(key, n);
        }
        x = x1;
      }
      active = next;
    }
    const by = new Map();
    for (const r of rects) {
      if (!by.has(r.c)) by.set(r.c, { h: [], v: [], f: [] });
      const g = by.get(r.c);
      (r.h === 1 ? g.h : r.w === 1 ? g.v : g.f).push(r);
    }
    let hs = '';
    let vs = '';
    let fs = '';
    for (const [c, g] of by) {
      if (g.h.length) {
        let d = '';
        let cx = 0;
        let cy = 0;
        for (const r of g.h) {
          d += d ? `m${P(r.x - cx, r.y - cy)}h${r.w}` : `M${r.x} ${r.y}h${r.w}`;
          cx = r.x + r.w;
          cy = r.y;
        }
        hs += `<path stroke="${c}" d="${d}"/>`;
      }
      if (g.v.length) {
        let d = '';
        let cx = 0;
        let cy = 0;
        for (const r of g.v) {
          d += d ? `m${P(r.x - cx, r.y - cy)}v${r.h}` : `M${r.x} ${r.y}v${r.h}`;
          cx = r.x;
          cy = r.y + r.h;
        }
        vs += `<path stroke="${c}" d="${d}"/>`;
      }
      if (g.f.length) {
        let d = '';
        let cx = 0;
        let cy = 0;
        for (const r of g.f) {
          d += (d ? `m${P(r.x - cx, r.y - cy)}` : `M${r.x} ${r.y}`) + `h${r.w}v${r.h}h-${r.w}z`;
          cx = r.x;
          cy = r.y;
        }
        fs += `<path fill="${c}" d="${d}"/>`;
      }
    }
    return (hs ? `<g transform="translate(0 .5)">${hs}</g>` : '') + (vs ? `<g transform="translate(.5)">${vs}</g>` : '') + fs;
  }
}

const water = new Layer(); // static ripples on the river
const bg = new Layer(); // big masses
const det = new Layer(); // lights and small detail over the masses
const top = new Layer(); // foreground: lamp posts, the park
const anim = {};
const A = (n) => (anim[n] ??= new Layer());

// the chat column: everything behind it stays dim
const dim = (x) => (x < 226 ? 1 : x < 250 ? 1 - (x - 226) / 24 : x < 482 ? 0 : x < 504 ? (x - 482) / 22 : 1);

// ---- sky and water bands (plain rects with dithered seams) -------------------------------------
const WATER_Y = 247;
const skyC = ['#050a20', '#060c26', '#07102d', '#081334', '#09173b', '#0b1b43', '#0d1f4a', '#102452', '#13295a'];
const skyY = [0, 36, 68, 96, 120, 140, 157, 171, 183, WATER_Y];
const watC = ['#0d1c46', '#0a173c', '#081334', '#07102d', '#060d27', '#050b22'];
const watY = [WATER_Y, 254, 268, 288, 312, 336, H];
function bands(cols, ys) {
  let s = '';
  let dz = '';
  for (let i = 0; i < cols.length; i++) {
    s += `<rect y="${ys[i]}" width="640" height="${ys[i + 1] - ys[i]}" fill="${cols[i]}"/>`;
    if (i > 0) {
      const y = ys[i];
      dz += `<path stroke="${cols[i]}" stroke-dasharray="1 3" d="M0 ${y - 3}h640"/>`;
      dz += `<path stroke="${cols[i]}" stroke-dasharray="1 1" d="M1 ${y - 1}h639"/>`;
      dz += `<path stroke="${cols[i - 1]}" stroke-dasharray="1 3" d="M2 ${y + 1}h638"/>`;
    }
  }
  return s + `<g transform="translate(0 .5)">${dz}</g>`;
}

// stars: dim ones behind the text, a few bright ones at the sides
for (let i = 0; i < 90; i++) {
  const x = ri(0, 639);
  const y = ri(2, 150);
  const calm = x > 236 && x < 498;
  bg.px(x, y, calm ? pick(['#1c2a58', '#26366c']) : pick(['#3e5596', '#6f86c8', '#3e5596', '#a9b8ea', '#2c3d78', '#2c3d78']));
}
for (const [x, y] of [[112, 22], [205, 88], [140, 104], [556, 30], [610, 58], [520, 20], [596, 96], [186, 26]]) bg.px(x, y, '#dfeaff');

// a thin moon with a soft halo, left of the text
function disc(layer, cx, cy, r, c, keep) {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6 && (!keep || keep(x, y))) layer.px(cx + x, cy + y, c);
}
disc(bg, 168, 46, 11, '#070f2c');
disc(bg, 168, 46, 8, '#0a1538');
disc(bg, 168, 46, 5, '#efe6c0', (x, y) => (x - 3) * (x - 3) + (y + 2) * (y + 2) > 27);
disc(bg, 168, 46, 5, '#c9bf9a', (x, y) => (x - 3) * (x - 3) + (y + 2) * (y + 2) > 27 && x * x + y * y > 22 && x < 0 && y > 1);

// flat clouds, one step lighter than the sky behind them
function cloud(cx, cy, w, c) {
  bg.rect(cx - w / 2, cy, w, 2, c);
  bg.rect(cx - w * 0.3, cy - 1, w * 0.45, 1, c);
  bg.rect(cx - w * 0.38, cy + 2, w * 0.66, 1, c);
}
cloud(96, 126, 110, '#0c1c48');
cloud(214, 147, 80, '#11275a');
cloud(46, 160, 70, '#16306a');
cloud(356, 101, 130, '#0a1740');
cloud(440, 60, 80, '#080f2d');
cloud(590, 146, 96, '#11275a');
cloud(300, 132, 90, '#0c1c48');

// ---- hills -----------------------------------------------------------------------------------
function ridge(layer, pts, base, c, n = 0, hl = null, hlWhen = null) {
  const tops = [];
  for (let x = Math.max(0, pts[0][0]); x <= Math.min(W - 1, pts.at(-1)[0]); x++) {
    const y = R(interp(pts, x) + n * (Math.sin(x * 0.9) * 0.6 + Math.sin(x * 0.37 + 1) * 0.7));
    layer.rect(x, y, 1, base - y, c);
    if (hl && (!hlWhen || hlWhen(x))) layer.rect(x, y, 1, 2, hl);
    tops[x] = y;
  }
  return tops;
}
ridge(bg, [[0, 176], [40, 170], [90, 161], [140, 166], [190, 177], [250, 186], [330, 192], [420, 197]], WATER_Y, '#102557');
ridge(bg, [[0, 189], [60, 183], [120, 187], [200, 193], [280, 198]], WATER_Y, '#0e2050');

// the tower's haze, behind the hill
const TX = 526;
function ellipse(layer, cx, cy, rx, ry, c) {
  for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) layer.px(cx + x, cy + y, c);
}
ellipse(bg, TX, 76, 11, 10, '#08133a');
ellipse(bg, TX, 76, 8, 6, '#0b1a47');
ellipse(bg, TX, 104, 15, 9, '#08133a');
bg.rect(TX - 3, 82, 7, 24, '#0a1740');
ellipse(bg, TX, 105, 9, 5, '#0e1f4e');

const NAMSAN = [[150, 216], [190, 204], [230, 193], [270, 182], [310, 170], [350, 158], [390, 146], [430, 134], [465, 123], [495, 114], [512, 110], [526, 108], [542, 109], [562, 113], [583, 118], [602, 115], [622, 117], [640, 121]];
const hillTop = ridge(bg, NAMSAN, WATER_Y, '#081231', 1, '#0b183c', (x) => x > 300 && x < 524);
// a darker wooded fold low on the slope gives the hill some body
ridge(bg, [[300, 200], [350, 186], [400, 176], [450, 168], [500, 160], [540, 154], [580, 158], [620, 160], [640, 163]], WATER_Y, '#070f2b', 1);

for (let i = 0; i < 260; i++) {
  const x = ri(160, 636);
  const y = ri(hillTop[x] + 4, 206);
  const c = bg.get(x, y);
  const to = c === '#081231' ? '#0a1637' : c === '#070f2b' ? '#091332' : null;
  if (!to) continue;
  for (let k = ri(2, 5); k >= 0; k--) if (bg.get(x + k, y) === c) bg.px(x + k, y, to);
}

// ---- N Seoul Tower and the masts ---------------------------------------------------------------
det.rect(TX - 10, 106, 21, 3, '#1a2148');
det.rect(TX - 8, 107, 17, 1, '#ffb86b');
det.rect(TX - 4, 107, 6, 1, '#fff1c4');
det.rect(TX - 6, 105, 13, 1, '#4a3f52');
det.rect(TX + 1, 82, 1, 24, '#7f9fd8'); // shaded side of the shaft
det.rect(TX - 2, 72, 5, 1, '#9fb8e8'); // observatory
det.rect(TX - 4, 73, 9, 1, '#c9d8f4');
det.rect(TX - 5, 76, 11, 1, '#2a3566');
det.rect(TX - 3, 79, 7, 1, '#9fb8e8');
det.rect(TX - 2, 80, 5, 2, '#6f88c8');
det.rect(TX + 1, 60, 1, 12, '#7f9fd8');
for (let y = 36; y < 60; y++) det.px(TX, y, Math.floor((y - 36) / 3) % 2 ? '#f0ecff' : '#ff4f6d');
det.px(TX, 35, '#7a1c34');
const towerRects = [
  ['tw', TX - 1, 82, 2, 24, '#eaf4ff'],
  ['tw', TX - 4, 77, 9, 2, '#eaf4ff'],
  ['tw', TX - 1, 60, 2, 12, '#eaf4ff'],
  ['tp', TX - 5, 74, 11, 2, '#5ff3ff'],
];
const blinks = [[TX, 35]];
function mast(x, y0) {
  const y1 = hillTop[x] + 1;
  for (let y = y0; y < y1; y++) det.px(x, y, Math.floor((y - y0) / 3) % 2 ? '#d8d4ec' : '#e0455f');
  det.rect(x - 1, y0 + 9, 3, 1, '#8a8fb0');
  det.rect(x - 1, y0 + 21, 3, 1, '#8a8fb0');
  det.px(x, y0 - 1, '#7a1c34');
  blinks.push([x, y0 - 1]);
}
mast(499, 80);
mast(591, 86);
// lamps along the road down the right slope
for (let i = 0; i < 8; i++) {
  const x = 548 + i * 11;
  det.px(x, hillTop[x] + 4 + (i % 3), '#b98a58');
}

// ---- the city ----------------------------------------------------------------------------------
const SPUR = [[236, 240], [250, 228], [272, 217], [300, 210], [340, 206], [380, 204], [420, 207], [450, 212], [474, 221], [490, 231], [499, 240]];
const spurTop = (x) => (x < 236 || x > 499 ? 999 : interp(SPUR, x) - 2);
const city = (x, y, c) => {
  if (y < spurTop(x)) det.px(x, y, c);
};

const brightWin = ['#fff4d6', '#ffe3b0', '#ffd28a', '#e6eeff', '#cfe0ff', '#ffffff', '#ffb86b'];
const hazeWin = ['#7a84b0', '#8a7f8a', '#a0907a', '#6a78a8'];
const dimWin = ['#333d68', '#3a3550', '#2c365e'];
let winN = 0;
function block(x0, w, y0, y1, o) {
  bg.rect(x0, y0, w, y1 - y0, o.body);
  bg.rect(x0 + w - 2, y0, 2, y1 - y0, o.side);
  bg.rect(x0, y0, w - 2, 1, o.roof);
  if (rnd() < 0.6) bg.rect(x0 + ri(1, Math.max(1, w - 5)), y0 - 2, 3, 2, o.side);
  const stair = o.tall ? x0 + 1 + 2 * ri(0, Math.floor((w - 4) / 2)) : -1;
  for (let y = y0 + 2; y < y1 - 1; y += 3) {
    const darkFloor = rnd() < 0.08;
    for (let x = x0 + 1; x < x0 + w - 2; x += 2) {
      if (x === stair) {
        city(x, y, o.stair);
        city(x, y + 1, o.stair);
        if (y + 2 < y1 - 1) city(x, y + 2, o.stair);
        continue;
      }
      if (darkFloor || rnd() > o.dens) continue;
      const c = pick(o.lit);
      if (o.tall && y < 204 && rnd() < 0.09) {
        const l = A('w' + (winN++ % 4));
        l.px(x, y, c);
        l.px(x, y + 1, c);
      } else {
        city(x, y, c);
        if (o.tall) city(x, y + 1, c);
      }
    }
  }
}
// far row, hazy
for (let x = -3; x < W; ) {
  const w = ri(8, 12);
  const d = dim(x + w / 2);
  if (d > 0.5 || rnd() < 0.45) {
    block(x, w, ri(180, 194), 214, d > 0.5 ? { body: '#121b42', side: '#0e1638', roof: '#17224e', lit: hazeWin, dens: 0.45 } : { body: '#0a1335', side: '#08102e', roof: '#0c173c', lit: dimWin, dens: 0.16 });
  }
  x += w + ri(1, 6);
}
// near row: tall blocks left and right of the text column
const roofLights = [];
for (const [from, to] of [[-4, 232], [500, 640]]) {
  for (let x = from; x < to; ) {
    const w = ri(10, 15);
    if (x + w > to + 6) break;
    const y0 = ri(160, 184);
    const tint = pick([brightWin, brightWin, ['#fff4d6', '#ffe3b0', '#ffd28a', '#ffb86b'], ['#e6eeff', '#cfe0ff', '#ffffff', '#b7c6ea']]);
    block(x, w, y0, 220, { body: '#171e44', side: '#0f1533', roof: '#28325e', lit: tint, dens: 0.62, tall: true, stair: '#5f78b8' });
    if (y0 < 168) roofLights.push([x + R(w / 2) - 1, y0 - 3]);
    x += w + ri(1, 4);
  }
}
for (const [x, y] of roofLights.filter(([x]) => (x > 100 && x < 230) || (x > 505 && x < 600)).slice(0, 4)) {
  det.px(x, y, '#7a1c34');
  blinks.push([x, y]);
}

// low-rise carpet: a dark base, warmer where the lights are thick
bg.rect(0, 209, W, 34, '#0b1230');
for (let x = 0; x < W; ) {
  const w = ri(3, 7);
  bg.rect(x, 209 - ri(0, 5), w, 6, '#0b1230');
  x += w;
}
bg.rect(0, 222, 224, 21, '#111436');
bg.rect(0, 231, 232, 12, '#17173b');
bg.rect(508, 222, 132, 21, '#111436');
bg.rect(500, 231, 140, 12, '#17173b');
for (let i = 0; i < 70; i++) {
  const x = ri(0, 636);
  if (dim(x) < 1) continue;
  bg.rect(x, ri(211, 236), ri(3, 7), ri(2, 3), '#1a1c44');
}
const warm = ['#ffd28a', '#ffb86b', '#ff9a4d', '#ffe3b0', '#f2803a', '#c8552a', '#ffd28a', '#ffb86b', '#b8502c', '#fff4d6', '#d87a3a', '#8a4a3a'];
const neon = ['#ff5fa8', '#5ff3ff', '#a070d8', '#ff5fa8', '#4f8fff'];
const dimLight = ['#4a3a34', '#3f3340', '#30365c', '#4a3d30', '#3a2c4c'];
for (let i = 0; i < 2300; i++) {
  const x = ri(0, 639);
  const y = 207 + Math.floor(Math.pow(rnd(), 0.8) * 34);
  const d = dim(x);
  if (rnd() > 0.16 + 0.84 * d) continue;
  const c = d > 0.6 ? (rnd() < 0.1 ? pick(neon) : pick(warm)) : pick(dimLight);
  city(x, y, c);
  if (d > 0.6 && rnd() < 0.12) city(x + 1, y, c);
}
// signs
for (const [x, y, w, h, c, hi] of [
  [196, 214, 7, 3, '#5ff3ff', '#d4fdff'],
  [131, 224, 4, 2, '#ff5fa8', '#ffc0dc'],
  [58, 221, 5, 2, '#5ff3ff', '#d4fdff'],
  [160, 232, 3, 2, '#4f8fff', '#b0ceff'],
  [560, 218, 5, 3, '#ff5fa8', '#ffc0dc'],
  [606, 226, 6, 2, '#5ff3ff', '#d4fdff'],
  [524, 231, 4, 2, '#ffd28a', '#fff4d6'],
  [108, 213, 3, 2, '#ffd28a', '#fff4d6'],
]) {
  det.rect(x, y, w, h, c);
  det.rect(x + 1, y, w - 2, 1, hi);
}

// the wooded spur at the foot of the hill, behind the text: dark and quiet
ridge(bg, SPUR, 244, '#070f29', 1, '#0a1534');
for (let i = 0; i < 12; i++) {
  const x = ri(262, 476);
  det.px(x, ri(R(interp(SPUR, x)) + 5, 238), pick(['#3a3340', '#2c365e']));
}

// riverside road, trees on the bank, the embankment
bg.rect(0, 241, W, 2, '#161c40');
for (let x = 0; x < W; ) {
  const d = dim(x);
  det.px(x, 241, d > 0.6 ? pick(['#ff4f6d', '#fff4d6', '#ffd28a', '#ff4f6d', '#ffb86b', '#ffffff']) : pick(['#5a3a44', '#55506a', '#4a3d30']));
  x += d > 0.6 ? ri(2, 4) : ri(5, 9);
}
bg.rect(0, 243, W, 3, '#081428');
for (let x = 0; x < W; ) {
  const w = ri(3, 8);
  if (rnd() < 0.55) bg.rect(x, 242, w, 1, '#081428');
  x += w + ri(0, 3);
}
bg.rect(0, 246, W, 1, '#121c44');

// ---- water: ripples (static) and light streaks (two groups that shimmer) -------------------------
for (let i = 0; i < 110; i++) {
  const y = ri(249, 357);
  water.rect(ri(0, 630), y, ri(3, 10), 1, y < 268 ? '#112354' : y < 300 ? '#0c1a44' : '#091436');
}
for (let i = 0; i < 70; i++) {
  const x = rnd() < 0.5 ? ri(0, 236) : ri(500, 636);
  water.rect(x, ri(247, 253), ri(4, 12), 1, pick(['#1c1f4c', '#231d48', '#182a5c']));
}
for (const [x, col, len] of [[110, '#ff5fa8', 70], [150, '#ffd28a', 84], [186, '#ff4f6d', 64], [222, '#5ff3ff', 50], [128, '#4f8fff', 40], [60, '#ffd28a', 60], [30, '#ff5fa8', 50], [520, '#ffd28a', 34], [566, '#ff5fa8', 36], [612, '#5ff3ff', 30]]) {
  for (let i = 0; i < len; i++) {
    if (rnd() > 0.75 - (0.45 * i) / len) continue;
    water.rect(x - 3 + ri(-1, 1), WATER_Y + i, ri(4, 8), 1, mix(watC[Math.min(5, Math.floor(i / 18))], col, i < len / 3 ? 0.16 : 0.1));
  }
}
let streakN = 0;
function streak(x, y0, len, col, w, strength = 1) {
  const wc = '#081334';
  const tones = [mix(wc, col, 0.85 * strength), mix(wc, col, 0.5 * strength), mix(wc, col, 0.26 * strength)];
  const si = streakN++;
  for (let i = 0; i < len; i++) {
    const t = i / len;
    if (rnd() > 0.96 - 0.62 * t) continue;
    let tone = t < 0.22 ? 0 : t < 0.58 ? 1 : 2;
    if (tone < 2 && rnd() < 0.2) tone++;
    const ww = Math.max(1, w + (rnd() < 0.25 ? 1 : 0) - (t > 0.7 && w > 1 ? 1 : 0));
    const xx = x + (rnd() < 0.25 ? ri(-1, 1) : 0);
    A('s' + ((y0 + i + si) % 2)).rect(xx, y0 + i, ww, 1, tones[tone]);
  }
}
const glow = ['#ff5fa8', '#5ff3ff', '#ffd28a', '#f4f0ff', '#ff4f6d', '#4f8fff', '#ff9a4d', '#ffd28a', '#ff5fa8'];
for (let x = 5; x < 244; ) {
  const c = pick(glow);
  const long = c === '#ff5fa8' || c === '#ff4f6d' || c === '#ffd28a';
  det.px(x, 245, c);
  det.px(x + 1, 245, c);
  streak(x, WATER_Y, long ? ri(60, 110) : ri(30, 74), c, rnd() < 0.5 ? 2 : 1);
  x += ri(6, 11);
}
for (let x = 262; x < 480; ) {
  streak(x, WATER_Y, ri(6, 12), pick(['#8a6a5a', '#5a6a9a', '#7a5a8a']), 1, 0.45);
  x += ri(14, 24);
}
for (let x = 502; x < 638; ) {
  const c = pick(glow);
  det.px(x, 245, c);
  det.px(x + 1, 245, c);
  streak(x, WATER_Y, ri(22, 46), c, rnd() < 0.4 ? 2 : 1);
  x += ri(8, 13);
}

// the flat far bridge on the right
bg.rect(300, 249, 340, 2, '#232a58');
bg.rect(300, 249, 340, 1, '#333c72');
for (let i = 0; i < 6; i++) bg.rect(294 + i, 248 - 0 + (i < 3 ? 0 : 1), 1, 1, '#232a58');
for (let x = 304; x < W; x += 16) bg.rect(x, 251, 2, 4, '#141b40');
for (let x = 312; x < W; x += 8) {
  const d = dim(x);
  det.px(x, 248, d > 0.6 ? '#ffe9b8' : '#6a6470');
  if (d > 0.6 && x % 16 === 8) streak(x, 255, ri(4, 9), '#ffe9b8', 1, 0.8);
}

// ---- the long bridge ---------------------------------------------------------------------------
const VX = 70;
const VY = WATER_Y;
const yU = (x) => VY + 0.079 * (x - VX); // far edge of the road
const yR = (x) => VY + 0.16 * (x - VX); // lit rim (near edge)
const yF = (x) => VY + 0.184 * (x - VX) + 1.5; // underside of the fascia
const yW = (x) => VY + 0.36 * (x - VX) + 2; // waterline under the piers
const zx = (z) => VX + 570 / z;

// far end: the piers merge into a comb
for (let x = 80; x < 152; x++) {
  const f = R(yF(x));
  const wl = R(yW(x));
  if (x % 2 === 0) {
    bg.rect(x, f, 1, wl - f, '#262c5a');
    det.px(x, wl - 1, x % 4 === 0 ? '#ffd28a' : '#a87c5c');
    if (x % 8 === 0) streak(x, wl, ri(5, 10), '#ffb86b', 1, 0.8);
  }
}
for (let k = 36; k >= 0; k--) {
  const z = 1.03 + 0.17 * k;
  const x = R(zx(z));
  const w = Math.max(1, R(12 / z));
  const x0 = x - Math.floor(w / 2);
  const t0 = R(yF(x)) - 1;
  const foot = R(yW(x));
  const hgt = foot - t0;
  for (let y = t0; y < Math.min(H, foot); y++) {
    const t = (y - t0) / hgt;
    const c = t < 0.45 ? '#272d5c' : t < 0.7 ? '#3a3866' : t < 0.88 ? '#5f4e68' : '#96705e';
    bg.rect(x0, y, w, 1, c);
    if (w >= 3) bg.px(x0, y, t < 0.45 ? '#3a437c' : t < 0.7 ? '#524c80' : t < 0.88 ? '#836a78' : '#c9955a');
    if (w >= 4) bg.px(x0 + w - 1, y, t < 0.7 ? '#1c224c' : '#4a3d58');
  }
  if (w >= 4) bg.rect(x0 - 1, t0, w + 2, 2, '#343c70');
  if (foot <= H) {
    det.rect(x0, foot - 1, w, 1, '#ffd28a');
    if (w >= 3) det.rect(x0 + 1, foot - 1, w - 2, 1, '#fff4d6');
    streak(x0, foot, R(46 / z) + 3, '#ffb86b', Math.max(1, w - 1));
  }
}
const laneS = [];
for (let j = 0; j < 8; j++) laneS.push(0.079 + ((0.16 - 0.079) * (j + 0.75)) / 8.5);
const laneY = (j, x) => R(VY + laneS[j] * (x - VX));
for (let x = 74; x < W; x++) {
  const u = R(yU(x));
  const r = R(yR(x));
  const f = R(yF(x));
  bg.rect(x, u, 1, r - u, x < 190 ? '#211b3c' : x < 420 ? '#1a1834' : '#15152e');
  if (r - u >= 4) bg.px(x, u, '#2c3466');
  bg.rect(x, r + 1, 1, f - r, '#262d5c');
  if (f - r >= 4) bg.rect(x, r + 1 + Math.ceil((f - r) / 2), 1, Math.floor((f - r) / 2), '#1a2048');
  det.px(x, r, '#e6eeff');
  if (x > 430) det.px(x, r + 1, '#8fa6e8');
}
// far traffic: too small to move, a static glitter
for (let x = 82; x < 300; x++) {
  const u = R(yU(x));
  const r = R(yR(x));
  if (r - u < 1 || rnd() > (x > 250 ? 0.8 * (1 - (x - 250) / 50) : x > 170 ? 0.85 : 0.55)) continue;
  const y = ri(u, r - 1);
  det.px(x, y, y - u < (r - u) / 2 ? pick(['#c8405a', '#c84a40', '#c87038', '#8a3048']) : pick(['#d8ceb8', '#d0aa74', '#b8c0d8', '#8a7a70']));
}
// light trails: dim lines in the base, bright dashes in four phase groups that chase along each lane
const redLane = ['#ff3b55', '#ff5a4a', '#ff5fa8', '#ff8a3d'];
const whiteLane = ['#dfeaff', '#ffd28a', '#ffffff', '#fff4d6'];
const DZ = 0.035;
for (let j = 0; j < 8; j++) {
  const away = j < 4;
  const col = away ? redLane[j] : whiteLane[j - 4];
  const under = mix('#15152e', col, 0.28);
  for (let x = 250; x < W; x++) {
    const y = laneY(j, x) + (j === 0 ? 1 : 0);
    bg.px(x, y, under);
    if (x > 470 && j > 0) bg.px(x, y + 1, mix('#15152e', col, 0.16));
  }
  const far = [mix('#1a1834', col, 0.5), mix('#1a1834', col, 0.75)];
  const off = rnd() * DZ;
  const ph0 = ri(0, 3);
  for (let i = 0; ; i++) {
    const z0 = 0.86 + off + i * DZ;
    if (z0 > 3.16) break;
    const xa = Math.floor(zx(z0));
    const xb = Math.ceil(zx(z0 + DZ));
    const gap = xa - xb >= 12 ? 2 : xa - xb >= 4 ? 1 : 0;
    const phase = away ? (((ph0 - i) % 4) + 4) % 4 : (ph0 + i) % 4;
    const l = A('c' + phase);
    for (let x = xb + gap; x <= Math.min(xa, W - 1); x++) {
      const y = laneY(j, x) + (j === 0 ? 1 : 0);
      l.px(x, y, x < 300 ? far[0] : x < 360 ? far[1] : col);
    }
  }
}
// lamp posts along the far side of the deck
for (let k = 0; k < 15; k++) {
  const z = 1.12 + 0.3 * k;
  const x = R(zx(z));
  const h = R(30 / z);
  const u = R(yU(x));
  top.rect(x, u - h, 1, h, '#3a4272');
  const head = dim(x) > 0.6 || u - h > 262 ? '#fff6d8' : '#b59a78';
  if (z < 2) {
    top.rect(x - 2, u - h, 3, 1, head);
    top.px(x - 3, u - h, '#ffd28a');
  } else {
    top.rect(x - 1, u - h, 2, 1, head);
  }
}

// ---- the park, bottom left -----------------------------------------------------------------------
const SHORE = [[0, 339], [90, 342], [170, 347], [228, 353], [262, 360]];
const shoreY = (x) => R(interp(SHORE, x));
for (let x = 0; x < 262; x++) {
  top.rect(x, shoreY(x), 1, H - shoreY(x), '#060e1c');
  top.px(x, shoreY(x), '#0e1d33');
}
for (let x = 18; x < 236; x += 5) top.px(x, shoreY(x) + 2, x % 10 === 3 ? '#5ff3ff' : '#4f8fff');
const TREE = ['#092022', '#10322e'];
for (let x = 2; x < 232; ) {
  const r = pick([5, 6, 7, 8, 9, 11]);
  const cy = shoreY(x) - r + ri(1, 3);
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const e = (dx * dx) / (r * r) + (dy * dy) / (r * r * 0.8);
      if (e > 1 + (rnd() - 0.5) * 0.3) continue;
      top.px(x + dx, cy + dy, dx + dy * 1.4 < -r * 0.55 ? TREE[1] : TREE[0]);
    }
  }
  top.rect(x, cy + r - 2, 1, 5, '#081a18');
  x += ri(9, 16);
}
for (const lx of [128, 207]) {
  const gy = shoreY(lx);
  const hy = gy - 27;
  for (let dy = -9; dy <= 9; dy++) {
    for (let dx = -9; dx <= 9; dx++) {
      if (dx * dx + dy * dy > 81) continue;
      const c = top.get(lx + dx, hy + dy);
      if (c === TREE[0]) top.px(lx + dx, hy + dy, dx * dx + dy * dy < 30 ? '#1b5540' : '#123a30');
      else if (c === TREE[1]) top.px(lx + dx, hy + dy, dx * dx + dy * dy < 30 ? '#2a7a54' : '#1b5540');
    }
  }
  top.rect(lx, hy, 1, 27, '#2c3466');
  top.rect(lx - 1, hy - 1, 3, 2, '#fff6d8');
  top.px(lx - 2, hy - 1, '#ffd28a');
  top.px(lx + 2, hy - 1, '#ffd28a');
  top.px(lx, hy - 2, '#ffd28a');
}

// ---- assemble ------------------------------------------------------------------------------------
const CSS =
  '.hn-s0{animation:hn-sa 3.2s steps(1) infinite}.hn-s1{animation:hn-sb 4.4s steps(1) infinite}' +
  '@keyframes hn-sa{50%{transform:translate(1px,0)}}@keyframes hn-sb{50%{transform:translate(-1px,0)}}' +
  '.hn-c0,.hn-c1{animation:hn-c 2.4s steps(1) infinite}.hn-c2,.hn-c3{animation:hn-d 2.4s steps(1) infinite}.hn-c1,.hn-c3{animation-delay:-.6s}' +
  '@keyframes hn-c{50%{opacity:.3}}@keyframes hn-d{50%{opacity:1}}' +
  '.hn-w0{animation:hn-w 13s steps(1) infinite}.hn-w1{animation:hn-w 17s steps(1) -5s infinite}.hn-w2{animation:hn-w 19s steps(1) -11s infinite}.hn-w3{animation:hn-w 23s steps(1) -3s infinite}' +
  '@keyframes hn-w{55%{opacity:0}}' +
  '.hn-tw{animation:hn-t 32s steps(4) infinite}.hn-tp{animation:hn-t 32s steps(4) -8s infinite}' +
  '@keyframes hn-t{0%,19%{fill:#eaf4ff}25%,44%{fill:#5ff3ff}50%,69%{fill:#ff5fa8}75%,94%{fill:#ffd28a}100%{fill:#eaf4ff}}' +
  '.hn-b0,.hn-b1,.hn-b2{animation:hn-b 2.4s steps(1) infinite}.hn-b1{animation-delay:-.8s}.hn-b2{animation-delay:-1.6s}' +
  '@keyframes hn-b{60%{opacity:.15}}' +
  '@media (prefers-reduced-motion: reduce){*{animation:none!important}}';

/** One top-level CSS rule per line, with a newline before the first and after the last. */
function cssLines(css) {
  let out = '\n';
  let depth = 0;
  for (const ch of css) {
    out += ch;
    if (ch === '{') depth++;
    if (ch === '}' && --depth === 0) out += '\n';
  }
  return out;
}

const parts = {};
for (const n of Object.keys(anim)) parts[n] = anim[n].svg();
const staticParts = { water: water.svg(), bg: bg.svg(), det: det.svg(), top: top.svg() };

/** mode 'a' is the real scene; 'b' bakes the animations' second state into attributes, for a still preview. */
function build(mode) {
  const b = mode === 'b';
  const g = (n, override, rest) => `<g class="hn-${n}"${b ? (override ? ' ' + override : '') : rest ? ' ' + rest : ''}>${parts[n] ?? ''}</g>`;
  // The desktop app runs a scene's animations only with its CSS one rule per line and no
  // shape-rendering on the root, so crisp pixels are asked for on a group inside instead.
  let s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice">';
  s += `<style>${cssLines(CSS)}</style><g shape-rendering="crispEdges">`;
  s += bands(skyC, skyY) + bands(watC, watY) + staticParts.water;
  s += g('s0', 'transform="translate(1 0)"') + g('s1', 'transform="translate(-1 0)"');
  s += staticParts.bg + staticParts.det;
  s += g('w0') + g('w1', 'opacity="0"') + g('w2') + g('w3', 'opacity="0"');
  for (const [cls, x, y, w, h, fill] of towerRects) {
    const f = b ? (cls === 'tw' ? '#ff5fa8' : '#ffd28a') : fill;
    s += `<rect class="hn-${cls}" x="${x}" y="${y}" width="${w}" height="${h}" fill="${f}"/>`;
  }
  s += g('c0', 'opacity=".3"') + g('c1', 'opacity=".3"') + g('c2', '', 'opacity=".3"') + g('c3', '', 'opacity=".3"');
  blinks.forEach(([x, y], i) => {
    s += `<rect class="hn-b${i % 3}"${b && i % 3 !== 1 ? ' opacity=".15"' : ''} x="${x}" y="${y}" width="1" height="1" fill="#ff2b46"/>`;
  });
  s += staticParts.top + '</g></svg>';
  return s;
}

const svg = build('a');
writeFileSync(join(DIR, 'scene.svg'), svg);
writeFileSync(join(DIR, 'scene-b.svg'), build('b'));
writeFileSync(join(DIR, 'scene.ts'), `export const SCENE = ${JSON.stringify(svg)}\n`);
console.log(`scene.svg: ${svg.length} characters (limit 120000)`);
for (const [n, v] of Object.entries({ ...staticParts, ...parts })) console.log(`  ${n}: ${v.length}`);
if (svg.length > 120000) {
  console.error('too large');
  process.exitCode = 1;
}
