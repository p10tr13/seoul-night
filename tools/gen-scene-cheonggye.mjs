// Cheonggyecheon at dusk: pixel-art backdrop generator.
// Paints a 640x360 indexed pixel buffer, vectorizes it into merged SVG paths,
// and adds a few CSS-animated overlays. Deterministic (hash-based randomness).
// Usage: node gen.mjs  ->  scene.ts, scene.svg (static), scene-b.svg (second animation state, preview only)
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const W = 640, H = 360, VX = 367, VY = 206;
const LIMIT = 120000;

// ---------- helpers
function hash(a, b = 0, c = 0) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1274126177) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const toHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
function mix(a, b, t) { const A = rgb(a), B = rgb(b); return toHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); }
const shortHex = (h) => (h[1] === h[2] && h[3] === h[4] && h[5] === h[6] ? '#' + h[1] + h[3] + h[5] : h);
const pick = (v, th, cols) => { for (let i = 0; i < th.length; i++) if (v < th[i]) return cols[i]; return cols[th.length]; };

const pal = [], pmap = new Map();
function C(hex) { let i = pmap.get(hex); if (i === undefined) { i = pal.length; pal.push(hex); pmap.set(hex, i); } return i; }
const buf = new Int16Array(W * H);
function P(x, y, c) { x = Math.floor(x); y = Math.floor(y); if (x < 0 || y < 0 || x >= W || y >= H) return; buf[y * W + x] = C(c); }
function rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) P(x + i, y + j, c); }

// ---------- vectorizer: per colour (big areas first), row runs that may bridge over
// pixels painted later, merged vertically into rects; 1px-high runs become strokes.
function vectorize(get, x0, y0, x1, y1) {
  const cnt = new Map();
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const v = get(x, y); if (v >= 0) cnt.set(v, (cnt.get(v) || 0) + 1); }
  const order = [...cnt.keys()].sort((a, b) => cnt.get(b) - cnt.get(a) || a - b);
  const rank = new Int32Array(pal.length).fill(-1);
  order.forEach((c, i) => { rank[c] = i; });
  const byPos = (a, b) => a.v - b.v || a.u - b.u;
  // u runs along the scan direction, v across it
  const variant = (c, T, flat) => {
    const rc = rank[c], g = T ? (u, v) => get(v, u) : get;
    const [u0, u1, w0, w1] = T ? [y0, y1, x0, x1] : [x0, x1, y0, y1];
    const singles = [], rects = [];
    let open = new Map();
    for (let v = w0; v < w1; v++) {
      const cur = new Map();
      let u = u0;
      while (u < u1) {
        if (g(u, v) !== c) { u++; continue; }
        const s = u; let e = u; u++;
        while (u < u1) { const p = g(u, v); if (p === c) { e = u; u++; } else if (p >= 0 && rank[p] > rc) u++; else break; }
        u = e + 1;
        const key = s * 4096 + (e - s + 1);
        const o = open.get(key);
        if (o) { o.h++; cur.set(key, o); } else cur.set(key, { u: s, v, w: e - s + 1, h: 1 });
      }
      for (const [k, r] of open) if (!cur.has(k)) (r.h === 1 ? singles : rects).push(r);
      open = cur;
    }
    for (const r of open.values()) (r.h === 1 ? singles : rects).push(r);
    if (flat) { for (const r of rects) for (let k = 0; k < r.h; k++) singles.push({ u: r.u, v: r.v + k, w: r.w, h: 1 }); rects.length = 0; }
    const col = shortHex(pal[c]);
    let out = '';
    if (singles.length) {
      singles.sort(byPos);
      let d = '', pu = 0, pv = 0;
      singles.forEach((r, i) => {
        if (T) d += i === 0 ? `M${r.v}.5 ${r.u}v${r.w}` : `m${r.v - pv} ${r.u - pu}v${r.w}`;
        else d += i === 0 ? `M${r.u} ${r.v}.5h${r.w}` : `m${r.u - pu} ${r.v - pv}h${r.w}`;
        pu = r.u + r.w; pv = r.v;
      });
      out += `<path stroke="${col}" d="${d}"/>`;
    }
    if (rects.length) {
      rects.sort(byPos);
      let d = '', px = 0, py = 0;
      rects.forEach((r, i) => {
        const [x, y, w, h] = T ? [r.v, r.u, r.h, r.w] : [r.u, r.v, r.w, r.h];
        d += (i === 0 ? `M${x} ${y}` : `m${x - px} ${y - py}`) + `h${w}v${h}h-${w}z`;
        px = x; py = y;
      });
      out += `<path fill="${col}" d="${d}"/>`;
    }
    return out.replace(/ -/g, '-');
  };
  let out = '';
  for (const c of order) out += [variant(c, false), variant(c, true), variant(c, false, true), variant(c, true, true)].reduce((a, b) => (b.length < a.length ? b : a));
  return out;
}

class Sprite {
  constructor() { this.m = new Map(); this.x0 = 1e9; this.y0 = 1e9; this.x1 = -1e9; this.y1 = -1e9; }
  set(x, y, c) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || x >= W || y < 0 || y >= H + 16) return;
    this.m.set(y * 1024 + x, C(c));
    this.x0 = Math.min(this.x0, x); this.x1 = Math.max(this.x1, x); this.y0 = Math.min(this.y0, y); this.y1 = Math.max(this.y1, y);
  }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
  disc(cx, cy, r, c) { for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) { const dx = x + 0.5 - cx, dy = y + 0.5 - cy; if (dx * dx + dy * dy <= r * r) this.set(x, y, c); } }
  get empty() { return this.m.size === 0; }
  paths() { return this.empty ? '' : vectorize((x, y) => this.m.get(y * 1024 + x) ?? -1, this.x0, this.y0, this.x1 + 1, this.y1 + 1); }
  blit() { for (const [k, c] of this.m) if (k >> 10 < H) buf[(k >> 10) * W + (k & 1023)] = c; }
}

// ---------- sky
{
  const stops = [[0, '#050a20'], [70, '#08122e'], [130, '#0f2048'], [175, '#1a3163'], [198, '#273b6f'], [210, '#3a4376']];
  for (let y = 0; y < 208; y += 8) {
    const m = y + 4; let i = 0; while (i < stops.length - 2 && m > stops[i + 1][0]) i++;
    const t = clamp((m - stops[i][0]) / (stops[i + 1][0] - stops[i][0]), 0, 1);
    rect(0, y, W, 8, mix(stops[i][1], stops[i + 1][1], t));
  }
  for (let i = 0; i < 16; i++) { const x = 200 + Math.floor(hash(i, 1, 3) * 310), y = 4 + Math.floor(hash(i, 2, 3) * 100); P(x, y, hash(i, 3, 3) < 0.3 ? '#55648f' : '#2b3761'); }
}

// ---------- distant flat towers
function tower(x0, x1, top, wall, o = {}) {
  const base = o.base ?? 208;
  rect(x0, top, x1 - x0, base - top, wall);
  if (o.roof) rect(x0, top, x1 - x0, 1, o.roof);
  const { pX = 4, pY = 4, ww = 2, wh = 2, cols = [], seed = 1, mx = 2, my = 3 } = o;
  for (let y = top + my; y + wh < base - 1; y += pY) for (let x = x0 + mx; x + ww <= x1 - 1; x += pX) {
    const h = hash(x, y, seed); let acc = 0;
    for (const [p, c] of cols) { acc += p; if (h < acc) { rect(x, y, ww, wh, c); break; } }
  }
}
// far haze layer near the vanishing point
tower(300, 320, 160, '#222f5c', { cols: [[0.25, '#34497f']], seed: 11, pX: 3, pY: 3, ww: 1, wh: 1 });
tower(404, 424, 166, '#222f5c', { cols: [[0.25, '#34497f']], seed: 12, pX: 3, pY: 3, ww: 1, wh: 1 });
tower(318, 338, 178, '#1d2a55', { cols: [[0.3, '#3a5088'], [0.08, '#7d7260']], seed: 13, pX: 3, pY: 3, ww: 2, wh: 1 });
tower(336, 353, 168, '#1a264f', { cols: [[0.3, '#35497f']], seed: 14, pX: 3, pY: 4, ww: 1, wh: 2, roof: '#2a3866' });
tower(353, 385, 150, '#16234c', { cols: [[0.34, '#24437e'], [0.18, '#33599a'], [0.04, '#4f7fba']], seed: 15, pX: 4, pY: 3, ww: 3, wh: 2, my: 7 });
rect(358, 152, 22, 3, '#a82c3a'); rect(360, 153, 5, 1, '#d8626c'); rect(369, 153, 7, 1, '#d8626c');
tower(385, 406, 174, '#1c2852', { cols: [[0.22, '#3a5088'], [0.1, '#8a7a5c']], seed: 16, pX: 3, pY: 3, ww: 2, wh: 1 });
// mid towers inside the text column: dim and low-contrast
tower(262, 302, 120, '#18224a', { cols: [[0.22, '#2c4176'], [0.1, '#5c5a5e']], seed: 21, pX: 5, pY: 4, ww: 2, wh: 3, roof: '#25315c' });
rect(274, 114, 12, 6, '#18224a');
tower(428, 470, 97, '#141c40', { cols: [[0.16, '#2a3c70'], [0.05, '#6a5c50']], seed: 22, pX: 6, pY: 5, ww: 3, wh: 2, my: 8 });
rect(428, 97, 42, 1, '#b46c38'); rect(428, 98, 42, 1, '#6e4534'); rect(441, 132, 16, 12, '#0d1433');
// nearer mid towers flanking the column
tower(212, 262, 92, '#262d52', { cols: [[0.26, '#7d7452'], [0.16, '#4c5f88'], [0.08, '#a8935e']], seed: 23, pX: 5, pY: 5, ww: 2, wh: 3, roof: '#3b4370' });
rect(226, 86, 18, 6, '#222949'); rect(240, 80, 1, 6, '#222949');
tower(470, 512, 108, '#323b62', { cols: [[0.42, '#7088b0'], [0.1, '#b9a273'], [0.1, '#9fb9d6']], seed: 24, pX: 5, pY: 4, ww: 4, wh: 2, roof: '#48527c' });
rect(497, 111, 8, 3, '#c8343c'); rect(499, 112, 4, 1, '#f08088');
rect(478, 102, 14, 6, '#2b3358');

// ---------- receding facades (one-point perspective towards VX,VY)
function facade(o) {
  const dir = Math.sign(o.x1 - o.x0), A = o.x0 - VX;
  const colOf = (x) => Math.floor(((A / (x + 0.5 - VX)) - 1) * Math.abs(A) / o.colW);
  for (let x = o.x0; x !== o.x1; x += dir) {
    const s = (x + 0.5 - VX) / A;
    const yTop = Math.round(VY + (o.top0 - VY) * s), yBase = Math.round(VY + (o.base0 - VY) * s);
    const ci = colOf(x), mull = x === o.x0 || colOf(x - dir) !== ci;
    const fOf = (y) => (o.base0 - (VY + (y + 0.5 - VY) / s)) / o.floorH;
    for (let y = Math.max(0, yTop); y < Math.min(H, yBase); y++) {
      const f = fOf(y), fi = Math.floor(f), ff = f - fi;
      const fline = Math.floor(fOf(y + 1)) !== fi;
      P(x, y, o.shade({ ci, fi, ff, mull, fline, x, y, s }));
    }
  }
}
const shop = (ci, fi, seed) => (hash(ci >> 2, fi, seed) < 0.55 ? '#bfe3ee' : hash(ci >> 2, fi, seed + 1) < 0.6 ? '#f2d28a' : '#7fa6c8');
const winToggle = []; // {x,y,c,g} pixels of lit windows that blink (overlay), buffer keeps the unlit colour
function toggled(key, x, y, lit, dark, groups, seed) {
  const h = hash(key[0], key[1], seed);
  if (h < 0.035) { winToggle.push({ x, y, c: lit, g: Math.floor(h / 0.035 * groups) }); return dark; }
  return lit;
}

// left: pale older tower (flat front + receding side)
{
  rect(0, 0, 100, 224, '#4a5378');
  for (let k = 2; k < 26; k++) {
    const wy = 224 - 9 * (k + 1) + 2;
    rect(0, wy + 6, 100, 1, '#3d4568');
    for (let x = 3; x < 96; x += 8) { const h = hash(x, k, 31); rect(x, wy, 5, 5, h < 0.16 ? '#e8b860' : h < 0.24 ? '#9cc6e2' : '#18203f'); }
  }
  rect(0, 206, 100, 18, '#1a2040');
  for (let x = 2; x < 98; x += 12) rect(x, 209, 10, 12, hash(x, 0, 32) < 0.5 ? '#bfe3ee' : '#f2d28a');
}
// left: glass tower with blue-lit grid
facade({
  x0: 100, x1: 190, top0: -52, base0: 223, floorH: 9, colW: 9,
  shade: ({ ci, fi, ff, mull, fline, x, y }) => {
    if (fi < 2) return mull && ci % 4 === 0 ? '#0a1430' : shop(ci, 0, 41);
    if (mull || fline) return '#0a1430';
    const v = hash(ci, fi, 42) * 0.62 + hash(ci >> 1, fi >> 1, 43) * 0.38;
    if (v < 0.4) return '#10224a';
    if (v < 0.58) return '#1c4585';
    if (v < 0.82) return toggled([ci, fi], x, y, '#2f6fc4', '#10224a', 3, 44);
    return toggled([ci, fi], x, y, '#62aaec', '#10224a', 3, 44);
  },
});
rect(100, 0, 1, 222, '#1d3566');
// slim dark tower behind it
tower(190, 212, 22, '#0b1230', { base: 216, cols: [[0.2, '#172452'], [0.06, '#2f4f8c']], seed: 45, pX: 3, pY: 5, ww: 1, wh: 3 });
rect(203, 27, 6, 3, '#d83040'); rect(204, 28, 3, 1, '#ff8a8a');

// right: big pale office block (receding ribbon-window side + flat front)
{
  rect(590, 0, 50, 226, '#59638c');
  for (let y = 4; y < 204; y += 11) rect(590, y, 50, 1, '#4b557e');
  for (let k = 0; k < 9; k++) { const y = 12 + k * 22, h = hash(k, 5, 51); rect(612, y, 7, 6, h < 0.22 ? '#f0c870' : '#1a2344'); rect(612, y + 6, 7, 1, '#6c77a0'); }
  rect(590, 206, 50, 20, '#2a2a3c');
  for (let x = 593; x < 640; x += 12) rect(x, 208, 9, 14, '#e6c070');
  rect(590, 0, 1, 226, '#7682ac');
  facade({
    x0: 589, x1: 511, top0: -200, base0: 226, floorH: 14, colW: 7,
    shade: ({ ci, fi, ff, mull, fline, x, y }) => {
      if (fi < 1) return mull && ci % 4 === 0 ? '#2a2a3c' : '#e6c070';
      if (ff < 0.5) return '#4c567e';
      if (mull && ci % 3 === 0) return '#39426a';
      const h = hash(Math.floor(ci / 3), fi, 53);
      if (h < 0.5) return toggled([Math.floor(ci / 3), fi], x, y, '#a9c8de', '#1a2344', 3, 54);
      if (h < 0.62) return '#ecc878';
      if (h < 0.76) return '#6f8fb8';
      return '#1a2344';
    },
  });
}

// ---------- street level: trees, lamps
const lamps = []; // {x,y,s,R}
for (const s of [0.86, 0.64, 0.49, 0.38, 0.29, 0.22, 0.17, 0.13]) lamps.push({ x: Math.round(VX - 300 * s), y: Math.round(VY - 46 * s), base: Math.round(VY + 18 * s), s });
for (const s of [0.9, 0.68, 0.52, 0.4, 0.3, 0.23, 0.17, 0.13]) lamps.push({ x: Math.round(VX + 292 * s), y: Math.round(VY - 44 * s), base: Math.round(VY + 17 * s), s });

function blob(cx, cy, r, id, cols, o = {}) {
  const cw = o.cw ?? 4, ch = o.ch ?? 2, sq = o.sq ?? 0.75, lit = o.lamps ?? [];
  const circles = [[0, 0, r * 0.72]];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + hash(id, i, 5) * 0.8, d = r * (0.45 + 0.2 * hash(id, i, 7));
    circles.push([Math.cos(a) * d, Math.sin(a) * d * sq, r * (0.42 + 0.2 * hash(id, i, 9))]);
  }
  const R = Math.ceil(r * 1.35) + 2;
  for (let y = Math.floor(cy - R); y <= cy + R; y++) for (let x = Math.floor(cx - R); x <= cx + R; x++) {
    const gy = Math.floor(y / ch), gx = Math.floor((x + (gy & 1 ? cw >> 1 : 0)) / cw);
    const n = hash(gx, gy, id);
    let inside = false;
    for (const c of circles) { const dx = x - cx - c[0], dy = (y - cy - c[1]) / sq, rr = c[2] + (n - 0.5) * Math.min(4, r * 0.3); if (dx * dx + dy * dy < rr * rr) { inside = true; break; } }
    if (!inside) continue;
    let l = 0.3 * n + 0.5 * clamp((y - (cy - r)) / (2 * r), 0, 1) + (o.bias ?? 0);
    for (const L of lit) { const d = Math.hypot(x - L.x, (y - L.y) * 1.2), LR = 44 * L.s + 3; if (d < LR) l += 0.6 * (1 - d / LR); }
    P(x, y, pick(l, [0.26, 0.46, 0.7, 0.94], cols));
  }
}
const treeBase = ['#0b2016', '#12301f', '#1c4a29', '#33702e', '#6a9a38'];
const treePal = (haze) => treeBase.map((c) => mix(c, '#16244c', haze));
const trees = [];
[1.0, 0.74, 0.56, 0.43, 0.33, 0.26, 0.2, 0.155, 0.12, 0.09].forEach((s, i) => trees.push({ x: VX - 330 * s, base: VY + 18 * s, r: 46 * s, s, id: 100 + i }));
[1.0, 0.8, 0.6, 0.45, 0.34, 0.26, 0.2, 0.155, 0.12, 0.09].forEach((s, i) => trees.push({ x: VX + 318 * s, base: VY + 17 * s, r: 44 * s, s, id: 200 + i }));
trees.sort((a, b) => a.s - b.s);
// cars on the right street
for (const [x, y, w] of [[556, 216, 9], [528, 213, 7], [498, 211, 5]]) { rect(x, y, w, 3, '#10142a'); rect(x + 1, y - 1, w - 2, 1, '#1a2040'); P(x, y + 1, '#e83a3a'); P(x + w - 1, y + 1, '#e83a3a'); }
for (const t of trees) {
  const haze = t.s > 0.5 ? 0 : t.s > 0.28 ? 0.25 : 0.5;
  const cy = t.base - 1.5 * t.r;
  const tw = Math.max(1, Math.round(3 * t.s));
  rect(Math.round(t.x - tw / 2), Math.round(cy), tw, Math.round(t.base - cy) + 1, '#17111c');
  blob(t.x, cy, t.r, t.id, treePal(haze), { cw: Math.max(2, Math.round(8 * t.s)), ch: Math.max(1, Math.round(4 * t.s)), lamps: lamps.filter((L) => Math.abs(L.s - t.s) < 0.3 * t.s + 0.05) });
}
for (const L of lamps) {
  rect(L.x, L.y, 1, L.base - L.y, '#141424');
  const k = Math.max(1, Math.round(3 * L.s));
  const c = L.s > 0.3 ? '#fff2c0' : L.s > 0.2 ? '#e8c880' : '#b89a6a';
  rect(L.x - (k >> 1), L.y - 1, k, Math.max(1, k - 1), c);
  if (L.s > 0.45) { P(L.x - (k >> 1) - 1, L.y - 1, '#f0b050'); P(L.x - (k >> 1) + k, L.y - 1, '#f0b050'); }
}

// ---------- ground: hedge, rail, walls, walkways, banks, water
const calm = (x, y) => 0.5 + 0.5 * Math.max(clamp((Math.abs(x - VX) - 95) / 55, 0, 1), clamp((y - 258) / 18, 0, 1));
const lineY = (xe, ye, x) => VY + (ye - VY) * (x + 0.5 - VX) / (xe - VX);
const SIDES = [
  { sgn: -1, xe: 0, rail: 227, top: 236, base: 300, zs: [], k: 154 / 94 },
  { sgn: 1, xe: 640, rail: 226, top: 234, base: 292, zs: [], k: 154 / 86 },
];
for (let i = 0; i < 10; i++) { SIDES[0].zs.push(1.12 + 0.42 * i); SIDES[1].zs.push(1.05 + 0.42 * i); }
const wallPal = ['#272d4b', '#343b5c', '#5c5058', '#947650', '#cda25a'];
const walkPal = ['#2a2738', '#43363c', '#66503f', '#8f6c43', '#bb8c4c', '#e2b462'];
const wallLamps = [];
for (const S of SIDES) {
  const A = Math.abs(S.xe - VX);
  for (let x = S.sgn < 0 ? 0 : VX + 1; x < (S.sgn < 0 ? VX : W); x++) {
    const s = Math.abs(x + 0.5 - VX) / A, z = 1 / s, zn = A / Math.abs(x + 1.5 - VX);
    const yr = Math.round(lineY(S.xe, S.rail, x)), yt = Math.round(lineY(S.xe, S.top, x)), yb = Math.round(lineY(S.xe, S.base, x));
    for (let y = yr; y < H; y++) P(x, y, '#0b0f24');
    // hedge + rail
    for (let y = yr; y < yt; y++) { const n = hash(Math.floor(z * 9), 0, 61); P(x, y, y === yr ? '#245430' : n < 0.25 && y - yr < 4 && yt - yr > 4 ? '#1a4026' : '#102a1c'); }
    if (yt - yr >= 3) { P(x, yr - 3, '#3c4262'); if (Math.floor(z * 4) !== Math.floor(zn * 4)) { P(x, yr - 2, '#2c3150'); P(x, yr - 1, '#2c3150'); } }
    const hgt = yb - yt; if (hgt < 1) continue;
    let dzm = 9; for (const zi of S.zs) dzm = Math.min(dzm, Math.abs(z - zi) / 0.17);
    for (let y = yt; y < yb; y++) {
      const v = (y - yt + 0.5) / hgt;
      const dv = (v - 0.27) / (v < 0.27 ? 0.3 : 0.8);
      let I = 0.13 + 0.95 * Math.exp(-(dzm * dzm + dv * dv)) * calm(x, y);
      const course = Math.floor(v * 4);
      const hj = hgt >= 10 && y < yb - 1 && Math.floor((y - yt + 1.5) / hgt * 4) !== course;
      const vj = hgt >= 10 && Math.floor(z * 5 + (course & 1) * 0.5) !== Math.floor(zn * 5 + (course & 1) * 0.5);
      if ((hj || vj) && I < 0.34) I -= 0.1;
      P(x, y, y === yt && hgt > 4 ? (I > 0.45 ? '#8f7a62' : '#4a5274') : pick(I, [0.17, 0.34, 0.54, 0.76], wallPal));
    }
  }
  // vines
  for (let i = 0; i < 16; i++) {
    const z = 1.05 + hash(i, 1, 63 + S.sgn) * 3.4, s = 1 / z, x0 = Math.round(VX + S.sgn * A * s);
    const wv = Math.max(1, Math.round((2 + hash(i, 2, 63) * 5) * s));
    for (let j = 0; j < wv; j++) {
      const x = x0 + j, yt = Math.round(lineY(S.xe, S.top, x)), yb = Math.round(lineY(S.xe, S.base, x));
      const len = Math.round((yb - yt) * (0.25 + 0.5 * hash(i, j, 64)));
      for (let y = yt; y < yt + len; y++) P(x, y, hash(x, y >> 1, 65) < 0.35 ? '#1c4729' : '#0f2a1b');
    }
  }
  for (const zi of S.zs) {
    const s = 1 / zi, x = Math.round(VX + S.sgn * A * s);
    const yt = lineY(S.xe, S.top, x), yb = lineY(S.xe, S.base, x), y = Math.round(yt + (yb - yt) * 0.25);
    if (yb - yt < 5) continue;
    const k = Math.max(1, Math.round(2.4 * s));
    rect(x - (k >> 1), y, k, k, '#fff2c0'); if (s > 0.5) rect(x - (k >> 1), y - 1, k, 1, '#3a2c2c');
    wallLamps.push({ x, y, s });
  }
}
const waterEdge = []; // per row [xc, xd]
for (let y = 207; y < H; y++) {
  const t = (y + 0.5 - VY) / 154, zr = 1 / t, zrn = 154 / (y + 1.5 - VY);
  const xa = VX - 601.3 * t, xb = VX - 217 * t, xc = VX - 105 * t, xd = VX + 113 * t, xe = VX + 223 * t, xf = VX + 489 * t;
  waterEdge[y] = [xc, xd];
  const joint = t > 0.18 && Math.floor(zr * 4) !== Math.floor(zrn * 4);
  const walk = (x0, x1, S, inner) => {
    let lz = 0; for (const zi of S.zs) { const d = (zr - zi * S.k) / 0.23; lz = Math.max(lz, Math.exp(-d * d)); }
    for (let x = Math.max(0, Math.ceil(x0)); x < Math.min(W, x1); x++) {
      const w = clamp(inner ? (x1 - x) / (x1 - x0) : (x - x0) / (x1 - x0), 0, 1);
      let I = 0.12 + (lz * (1 - 0.82 * w) * 0.95 + (1 - w) * 0.16) * calm(x, y);
      if (joint) I -= 0.07;
      P(x, y, pick(I, [0.18, 0.32, 0.48, 0.64, 0.82], walkPal));
    }
  };
  walk(xa, xb, SIDES[0], false); walk(xe, xf, SIDES[1], true);
  // water
  const half = (xd - xc) / 2, cxm = (xc + xd) / 2;
  const seg = Math.max(5, Math.round(7 + 26 * t)) * (hash(y, 1, 90) > 0.5 ? 2 : 1), off = Math.floor(hash(y, 0, 90) * seg * 3);
  for (let x = Math.ceil(xc); x < xd; x++) {
    const a = Math.abs((x - cxm) / half), h = hash(Math.floor((x + off) / seg), y, 91);
    let v = (1 - a) * 0.62 + h * 0.5 + (1 - t) * 0.12;
    let c = pick(v, [0.56, 0.78, 0.98], ['#060b1f', '#0a1230', '#101d46', '#1a3064']);
    if (y >= 224 && y < 264 && Math.abs(x - (VX + 2)) < 2 + (y - 222) * 0.13 && hash(y, 3, 92) > 0.22) { const h2 = hash(x >> 2, y, 92); c = h2 < 0.45 ? '#8a2c52' : h2 < 0.85 ? '#5a1f48' : '#b84c6c'; }
    else if (a > 0.72 && h > 0.9 && t > 0.2) c = '#5a3f34';
    P(x, y, c);
  }
  // banks
  const chh = Math.max(2, Math.round(5 * t + 1)), cww = Math.max(4, Math.round(12 * t + 3)), gy = Math.floor(y / chh);
  const e = (k) => hash(gy, k, 77);
  const bank = (x0, x1, litLeft, seed) => {
    for (let x = Math.max(0, Math.round(x0)); x < Math.min(W, x1); x++) {
      const gx = Math.floor((x + (gy & 1 ? cww >> 1 : 0)) / cww), n = hash(gx, gy, seed);
      const w = clamp((x - x0) / (x1 - x0), 0, 1), lit = litLeft ? 1 - w : w;
      P(x, y, pick(n * 0.5 + lit * 0.5, [0.3, 0.52, 0.72, 0.9], ['#0a1e14', '#113021', '#1a4627', '#2f6a2c', '#5f9236']));
    }
  };
  bank(xb - e(1) * 5 * t, xc + e(2) * 16 * t - 3 * t, true, 78);
  bank(xd - e(3) * 16 * t + 3 * t, xe + e(4) * 5 * t, false, 79);
}
// footbridge in the middle distance
{
  const y = 228, t = (y - VY) / 154, x0 = Math.round(VX - 601.3 * t) + 3, x1 = Math.round(VX + 489 * t) - 3;
  rect(x0, y - 3, x1 - x0, 1, '#2f3759');
  for (let x = x0; x < x1; x += 4) P(x, y - 2, '#252c4c');
  rect(x0, y - 1, x1 - x0, 1, '#59638c'); rect(x0, y, x1 - x0, 2, '#1c2141');
  for (const f of [0.38, 0.62]) rect(Math.round(x0 + (x1 - x0) * f), y + 2, 2, 3, '#121630');
  P(x0, y - 2, '#e0b060'); P(x1 - 1, y - 2, '#e0b060');
}
// bushes along the banks
const plantPal = ['#0a1e14', '#113021', '#1a4627', '#2f6a2c', '#5f9236'];
for (const [x, y, r, id, bias] of [[246, 338, 26, 301, -0.05], [228, 304, 17, 302, 0.02], [262, 284, 11, 303, -0.05], [286, 262, 7, 304, -0.05], [505, 334, 28, 305, -0.06], [488, 296, 16, 306, -0.02], [456, 272, 9, 307, -0.05], [436, 256, 6, 308, -0.05], [200, 350, 16, 309, 0.08], [560, 352, 18, 310, 0.05]]) {
  blob(x, y, r, id, plantPal, { cw: Math.max(2, Math.round(r / 5)), ch: Math.max(1, Math.round(r / 9)), sq: 0.7, bias });
}
// rocks, bottom left
for (const [x, y, w, h] of [[176, 344, 12, 6], [188, 351, 9, 5], [530, 346, 10, 5]]) { rect(x, y, w, h, '#3a3d52'); rect(x + 1, y - 1, w - 3, 1, '#565a70'); rect(x, y + h - 2, w, 2, '#22243a'); }
// walkers
function person(x, y, h, shirt) {
  const hd = Math.max(2, Math.round(h * 0.18)), body = Math.round(h * 0.42), legs = h - hd - body, w = Math.max(3, Math.round(h * 0.3));
  rect(x + ((w - hd) >> 1), y - h, hd, hd, '#b88c70'); rect(x, y - h + hd, w, body, shirt);
  rect(x, y - legs, 1, legs, '#15121f'); rect(x + w - 1, y - legs, 1, legs, '#15121f'); if (w > 3) rect(x + 1, y - legs, w - 2, 2, '#15121f');
  rect(x - 1, y, w + 3, 1, '#43363c');
}
person(203, 264, 13, '#c8642c'); person(210, 263, 12, '#d8d0c0'); person(532, 272, 14, '#2c3a5c');

// ---------- animated overlays
const B = { on: false };
// lamp halos (flicker)
function halos() {
  const groups = [0, 1, 2].map(() => ({ o: new Sprite(), i: new Sprite() }));
  lamps.forEach((L, n) => { if (L.s < 0.2) return; const g = groups[n % 3]; g.o.disc(L.x + 0.5, L.y, 15 * L.s + 2, '#ffb84a'); g.i.disc(L.x + 0.5, L.y, 7 * L.s + 1, '#ffd98a'); });
  wallLamps.forEach((L, n) => { if (L.s < 0.3) return; const g = groups[(n + 1) % 3]; g.o.disc(L.x + 0.5, L.y + 2 * L.s, 11 * L.s + 1, '#ffb84a'); });
  return groups.map((g, n) => `<g opacity=".15"><g class="lp a${n}"${B.on ? ' opacity=".55"' : ''}>${g.o.paths()}</g></g><g opacity=".22"><g class="lp a${n}"${B.on ? ' opacity=".55"' : ''}>${g.i.paths()}</g></g>`).join('');
}
function windows() {
  const sp = [0, 1, 2].map(() => new Sprite());
  for (const p of winToggle) sp[p.g].set(p.x, p.y, p.c);
  return sp.map((s, n) => `<g class="wn a${n}"${B.on && n !== 1 ? ' opacity="0"' : ''}>${s.paths()}</g>`).join('');
}
function glints() {
  const sp = [0, 1, 2].map(() => new Sprite());
  for (let i = 0; i < 22; i++) {
    const y = 238 + Math.floor(hash(i, 1, 95) * 116), [xc, xd] = waterEdge[y], t = (y - VY) / 154;
    const x = Math.round(xc + (xd - xc) * (0.25 + 0.5 * hash(i, 2, 95))), w = Math.round(2 + 5 * t * hash(i, 3, 95) + 2 * t);
    sp[i % 3].rect(x, y, w, 1, hash(i, 4, 95) < 0.35 ? '#7fa0d8' : '#3d5c9c');
  }
  return sp.map((s, n) => `<g class="gl a${n}"${B.on && n !== 2 ? ' opacity=".15"' : ''}>${s.paths()}</g>`).join('');
}
// lanterns
const LC = {
  red: ['#e23838', '#a01c2c', '#ff8a5c'], orange: ['#f08828', '#b45418', '#ffc868'], yellow: ['#f2c430', '#bc861a', '#ffee9a'],
  green: ['#46c258', '#1c843c', '#a6f08c'], pink: ['#ee5c9c', '#aa2c6c', '#ffaed0'],
};
const NIGHT = '#141a3a';
function lanternSprite(L) {
  const sp = new Sprite();
  const r = Math.max(1.5, L.r), rx = Math.round(r), ry = Math.max(1, Math.round(r * 0.9)), cx = Math.round(L.x), cy = Math.round(L.y);
  const [base, shade, hi] = LC[L.col].map((c) => (L.dim ? mix(c, NIGHT, L.dim) : c));
  const dark = '#15121f', paper = mix('#e9dfc4', NIGHT, L.dim + 0.1);
  const capH = Math.max(1, Math.round(r / 6)), capW = Math.max(0, Math.round(r * 0.42)), cord = Math.max(2, Math.round(r * 0.55));
  for (let dy = -ry; dy <= ry; dy++) {
    const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy / (ry + 0.5)) ** 2)));
    for (let dx = -half; dx <= half; dx++) {
      let lv = 1;
      const ex = (dx + rx * 0.3) / (rx * 0.98), ey = (dy + ry * 0.3) / (ry * 0.98); if (ex * ex + ey * ey > 1) lv = 0;
      const gx = (dx + rx * 0.18) / (rx * 0.5), gyy = (dy + ry * 0.12) / (ry * 0.52); if (r >= 3 && gx * gx + gyy * gyy < 1) lv = 2;
      if (r >= 7 && (dy + ry) % (r >= 11 ? 4 : 3) === 2 && lv > 0) lv--;
      sp.set(cx + dx, cy + dy, [shade, base, hi][lv]);
    }
  }
  sp.rect(cx - capW, cy - ry - capH, capW * 2 + 1, capH, dark);
  sp.rect(cx - capW, cy + ry + 1, capW * 2 + 1, capH, dark);
  sp.rect(cx, cy - ry - capH - cord, 1, cord, '#2a2a40');
  const tw = r >= 9 ? 1 : 0, th = Math.max(1, Math.round(r * 0.42));
  sp.rect(cx - tw, cy + ry + 1 + capH, tw * 2 + 1, th, paper);
  return { sp, px: cx + 0.5, py: cy - ry - capH - cord };
}
const STRINGS = [
  { X: -185, Y: 78, s: [1.32, 0.95, 0.68, 0.5, 0.37, 0.27, 0.2, 0.15], cols: ['red', 'orange', 'green', 'pink', 'yellow', 'red', 'green', 'orange'] },
  { X: 185, Y: 84, s: [1.22, 0.88, 0.63, 0.46, 0.34, 0.25, 0.185, 0.14], cols: ['green', 'pink', 'yellow', 'red', 'orange', 'green', 'pink', 'red'] },
  { X: -108, Y: 100, s: [1.3, 0.9, 0.62, 0.43, 0.3, 0.21, 0.15], cols: ['yellow', 'pink', 'red', 'green', 'orange', 'pink', 'yellow'], water: true },
  { X: 125, Y: 96, s: [1.18, 0.82, 0.57, 0.4, 0.28, 0.2, 0.14], cols: ['orange', 'red', 'green', 'yellow', 'pink', 'red', 'green'], water: true },
];
const lanternList = [];
STRINGS.forEach((S, si) => S.s.forEach((s, i) => {
  const dim = s > 0.6 ? 0 : s > 0.3 ? 0.2 : 0.38;
  lanternList.push({ x: VX + S.X * s, y: VY + S.Y * s, r: 13 * s, s, col: S.cols[i], dim: Math.abs(S.X * s) < 125 && VY + S.Y * s < 266 ? Math.max(dim, 0.38) : dim, water: S.water, Y: S.Y, n: si * 3 + i });
}));
lanternList.sort((a, b) => a.s - b.s);
// strings the lanterns hang from (static)
for (const S of STRINGS) {
  const top = (s) => { const q = lanternSprite({ x: VX + S.X * s, y: VY + S.Y * s, r: 13 * s, col: 'red', dim: 0 }); return [q.px - 0.5, q.py]; };
  const pts = S.water ? [top(S.s[0] * 1.45), ...S.s.slice(0, 3).map(top)] : [top(S.s[0] * 1.45), ...S.s.map(top)];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1], len = Math.hypot(bx - ax, by - ay), sag = len * 0.05;
    const steps = Math.ceil(len * 1.5);
    for (let k = 0; k <= steps; k++) { const t = k / steps; P(Math.round(ax + (bx - ax) * t), Math.round(ay + (by - ay) * t + sag * 4 * t * (1 - t)), '#30304c'); }
  }
}
// tiny far lanterns are static pixels
for (const L of lanternList) if (L.r < 3.4) lanternSprite(L).sp.blit();
function lanterns() {
  let out = '';
  for (const L of lanternList) {
    if (L.r < 3.4) continue;
    const { sp, px, py } = lanternSprite(L);
    const ang = L.n % 2 ? 3.5 : -3.5;
    out += `<g class="sw${L.n % 3 === 2 ? ' sx' : ''} a${L.n % 4}"${B.on ? ` transform="rotate(${ang} ${px} ${py})"` : ''}>${sp.paths()}</g>`;
  }
  return out;
}
function reflections() {
  let out = '';
  for (const L of lanternList) {
    if (!L.water || L.s < 0.2) continue;
    const yr = Math.round(VY + (308 - L.Y) * L.s); if (yr >= H - 2) continue;
    const sp = new Sprite(), [base, shade] = LC[L.col], r = 13 * L.s, cx = Math.round(L.x);
    const rows = Math.max(3, Math.round(r * 1.1));
    for (let k = 0; k < rows; k++) {
      const y = yr + k * 2 - rows; if (y >= H || !waterEdge[y]) continue;
      const hw = Math.max(1, Math.round(r * (0.95 - 0.5 * Math.abs(k - rows / 2) / rows) * (0.7 + 0.5 * hash(k, L.n, 96))));
      const jx = Math.round((hash(k, L.n, 97) - 0.5) * 3);
      for (let x = cx - hw + jx; x <= cx + hw + jx; x++) if (x > waterEdge[y][0] + 1 && x < waterEdge[y][1] - 1) sp.set(x, y, mix(k % 3 === 1 ? base : shade, '#0a1230', 0.3 + L.dim * 0.5));
    }
    if (!sp.empty) out += `<g class="rf a${L.n % 4}"${B.on ? ` transform="translate(${L.n % 2 ? 1 : -1} 1)"` : ''}>${sp.paths()}</g>`;
  }
  return out;
}

const CSS = [
  // the swing has to move the lantern's foot by a few grid pixels to be seen at all
  '.sw{transform-box:fill-box;transform-origin:50% 0;animation:sw 4.4s steps(6) infinite alternate}',
  '.sx{animation-duration:5.6s}',
  '@keyframes sw{from{transform:rotate(-6deg)}to{transform:rotate(6deg)}}',
  '.rf{animation:rf 2.4s step-end infinite}',
  '@keyframes rf{25%{transform:translate(2px,1px)}50%{transform:translate(-1px,0)}75%{transform:translate(-2px,1px)}}',
  '.gl{animation:gl 4.5s step-end infinite}',
  '@keyframes gl{40%{opacity:.15}75%{opacity:1}}',
  '.wn{animation:wn 14s step-end infinite}',
  '@keyframes wn{55%{opacity:0}90%{opacity:1}}',
  '.lp{animation:lp 7s step-end infinite}',
  '@keyframes lp{38%{opacity:.55}44%{opacity:1}71%{opacity:.75}80%{opacity:1}}',
  '.a1{animation-delay:-1.3s}.a2{animation-delay:-2.9s}.a3{animation-delay:-4.1s}',
  '@media (prefers-reduced-motion:reduce){*{animation:none!important}}',
].join('\n');

const staticArt = vectorize((x, y) => buf[y * W + x], 0, 0, W, H);
function build(b) {
  B.on = b;
  const parts = { art: staticArt, halos: halos(), windows: windows(), reflections: reflections(), glints: glints(), lanterns: lanterns() };
  // The desktop app runs a backdrop's animations only when its CSS has one rule per line and
  // the markup holds no shape-rendering anywhere (attribute or CSS): pixels stay crisp without it
  // at whole-number scales.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice">${b ? "" : `<style>\n${CSS}\n</style>`}<rect width="640" height="360" fill="#050a20"/><g fill="none">${Object.values(parts).join('')}</g></svg>`;
  return { svg, parts };
}
const a = build(false), b = build(true);
writeFileSync(path.join(DIR, 'scene.svg'), a.svg);
writeFileSync(path.join(DIR, 'scene-b.svg'), b.svg);
writeFileSync(path.join(DIR, 'scene.ts'), `export const SCENE = ${JSON.stringify(a.svg)}\n`);
for (const [k, v] of Object.entries(a.parts)) console.log(k.padEnd(12), v.length);
console.log('colours', pal.length);
console.log('SVG characters:', a.svg.length, a.svg.length <= LIMIT ? '(ok)' : '(OVER LIMIT)');
if (a.svg.length > LIMIT) process.exitCode = 1;
