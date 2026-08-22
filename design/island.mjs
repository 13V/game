// Generates the floating-island diorama as an SVG fragment for the design
// mockups. Isometric 2:1 projection, painter's algorithm, hand-authored
// 16x16 map. Not the game renderer - a design artifact tuned by eye - but it
// follows the same art rules as spec section 7: warm pastels, baked AO as
// darkened edges, static villagers, nothing modeled.
//
// Usage: node island.mjs            -> writes island.svg (fragment)
//        node island.mjs --page     -> also writes island-preview.html

import { writeFileSync } from 'node:fs';

const TW = 44, TH = 22, HZ = 10;      // tile width/height, height step px
const N = 16;

// --- the map -----------------------------------------------------------
// Heights 1-8. 1 = water (the tarn). A plateau village, forest to the
// north-west, a rocky ridge north-east falling to the south shore.
const HEIGHT = [
  '3334455566777665',
  '3334455667788765',
  '3344455667787655',
  '3344455566776555',
  '3334445556665554',
  '3334444455555444',
  '3333444444444443',
  '3333344444444433',
  '2333334444443333',
  '2233333444433332',
  '2211233334433322',
  '2211123333333222',
  '2111122233332222',
  '2211112223322222',
  '2221111222222222',
  '2222111122222222',
];
// Overlay: . auto  F forest  R rock  O ore  c cottage  m market  s sawmill
//          y smithy  q quarry  n mine  f field  r road  v villager
const OVER = [
  '..FFF...RRRORR..',
  '.FFFF...RRORRR..',
  '.FFFF..RRRRRR...',
  '.sFF....RRRR....',
  '.r.F......q.....',
  '.rr.......r.....',
  '..rr.c.c..r.....',
  '...rrrmyrrr.....',
  '.....crv........',
  '....c.rf........',
  '......rff.......',
  '.......f........',
  '................',
  '................',
  '................',
  '................',
];

const H = HEIGHT.map(r => [...r].map(Number));
const O = OVER.map(r => [...r]);
if (H.length !== N || O.length !== N || H.some(r => r.length !== N) || O.some(r => r.length !== N))
  throw new Error('map must be 16x16');

// --- palette (spec section 7: 16 warm pastels) --------------------------
const P = {
  grass: '#97c178', grassHi: '#9cc67e', grassLo: '#88b269',
  forest: '#7fae62', canopy: '#5f9150', canopyD: '#4a7a41', trunk: '#6d4f38',
  rock: '#9c948a', rockHi: '#aaa298', ore: '#8f8a92', oreGlint: '#e8c86a',
  water: '#6fb9c1', waterRim: '#a8dade',
  field: '#c9b96a', fieldRow: '#a89a52',
  road: '#cdb98f',
  soil: '#a5794e', soilD: '#855e3c', slab: '#6f6a63', slabD: '#5c5750',
  sideL: 0.80, sideR: 0.92,
  plaster: '#f2e7cf', plasterD: '#e0d2b4', beam: '#6d4f38',
  thatch: '#d9ae56', thatchD: '#c2953f',
  awn1: '#f2e7cf', awn2: '#c98a4b',
  ink: '#3a3128',
};

function hash(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2246822519) >>> 0;
  h = (h ^ (h >> 13)) >>> 0; h = (h * 1274126177) >>> 0;
  return (h ^ (h >> 16)) >>> 0;
}
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

const OX = (N) * TW / 2 + 8, OY = 96;
const sx = (x, y) => OX + (x - y) * TW / 2;
const sy = (x, y, h) => OY + (x + y) * TH / 2 - h * HZ;
const pt = (x, y) => `${x.toFixed(1)},${y.toFixed(1)}`;
const poly = (pts, fill, extra = '') => `<polygon points="${pts.map(p => pt(p[0], p[1])).join(' ')}" fill="${fill}" ${extra}/>`;

const out = [];
const waterAt = (x, y) => x >= 0 && y >= 0 && x < N && y < N && H[y][x] <= 1;
const hAt = (x, y) => (x >= 0 && y >= 0 && x < N && y < N) ? H[y][x] : -99;

function topColor(x, y) {
  const o = O[y][x], h = H[y][x];
  const j = 1 + ((hash(x, y, 7) % 7) - 3) * 0.012;       // per-tile jitter
  const lift = 1 + (h - 3) * 0.022;                       // height tint
  if (h <= 1) return P.water;
  if (o === 'F') return shade(P.forest, j * lift);
  if (o === 'R' || o === 'q' || o === 'n') return shade(P.rock, j * lift);
  if (o === 'O') return shade(P.ore, j * lift);
  if (o === 'f') return shade(P.field, j);
  if (o === 'r') return shade(P.road, j);
  return shade(x % 2 === y % 2 ? P.grass : P.grassHi, j * lift);
}

// slab bottom depth per column (screen px below h=0 top), jagged
const bottomOf = (x, y) => 56 + (hash(x, y, 3) % 4) * 8 + ((x + y) % 3) * 5;

// --- terrain, painter order --------------------------------------------
for (let s = 0; s <= 2 * (N - 1); s++) {
  for (let x = 0; x <= s; x++) {
    const y = s - x;
    if (x >= N || y >= N) continue;
    const h = Math.max(H[y][x], 1.6);                     // water sits at 1.6
    const cx = sx(x, y), top = sy(x, y, h);
    const L = [cx - TW / 2, top], T = [cx, top - TH / 2], R = [cx + TW / 2, top], B = [cx, top + TH / 2];
    const bot = OY + (x + y) * TH / 2 + bottomOf(x, y);

    // side faces down to the slab bottom; strata bands
    for (const [a, b, f] of [[L, B, P.sideL], [B, R, P.sideR]]) {
      const strata = [
        [0.00, 0.10, shade(topColor(x, y), f * 0.9)],      // grassy lip
        [0.10, 0.42, shade(P.soil, f)],
        [0.42, 0.66, shade(P.soilD, f)],
        [0.66, 0.88, shade(P.slab, f)],
        [0.88, 1.00, shade(P.slabD, f)],
      ];
      const d0 = 0, d1 = bot - top;
      for (const [u0, u1, c] of strata) {
        out.push(poly([
          [a[0], a[1] + d0 + (d1 - d0) * u0], [b[0], b[1] + d0 + (d1 - d0) * u0],
          [b[0], b[1] + d0 + (d1 - d0) * u1], [a[0], a[1] + d0 + (d1 - d0) * u1],
        ], c));
      }
    }

    // top face
    if (H[y][x] <= 1) {
      out.push(poly([T, R, B, L], P.water, 'opacity="0.92"'));
      // light rim where water meets land
      if (hAt(x, y - 1) > 1) out.push(poly([T, R, [R[0] - 3, R[1] + 1.6], [T[0] - 3, T[1] + 1.6]], P.waterRim, 'opacity="0.8"'));
      if (hAt(x - 1, y) > 1) out.push(poly([T, L, [L[0] + 3, L[1] + 1.6], [T[0] + 3, T[1] + 1.6]], P.waterRim, 'opacity="0.8"'));
    } else {
      out.push(poly([T, R, B, L], topColor(x, y)));
      // baked AO: darken the back edges under a taller neighbour
      if (hAt(x, y - 1) > H[y][x]) out.push(poly([T, R, [R[0] - 5, R[1] + 2.6], [T[0] - 5, T[1] + 2.6]], P.ink, 'opacity="0.16"'));
      if (hAt(x - 1, y) > H[y][x]) out.push(poly([T, L, [L[0] + 5, L[1] + 2.6], [T[0] + 5, T[1] + 2.6]], P.ink, 'opacity="0.16"'));
      // field rows
      if (O[y][x] === 'f') for (let k = 1; k <= 3; k++) {
        const t = k / 4;
        out.push(poly([
          [T[0] + (L[0] - T[0]) * t, T[1] + (L[1] - T[1]) * t],
          [R[0] + (B[0] - R[0]) * t, R[1] + (B[1] - R[1]) * t],
          [R[0] + (B[0] - R[0]) * t - 1.5, R[1] + (B[1] - R[1]) * t + 1],
          [T[0] + (L[0] - T[0]) * t - 1.5, T[1] + (L[1] - T[1]) * t + 1],
        ], P.fieldRow, 'opacity="0.42"'));
      }
      // ore glints
      if (O[y][x] === 'O') for (let k = 0; k < 3; k++) {
        const gx = cx + ((hash(x, y, k) % 20) - 10), gy = top + ((hash(x, y, k + 9) % 8) - 3);
        out.push(`<rect x="${gx}" y="${gy}" width="4.6" height="4.6" fill="${P.oreGlint}" stroke="#b98a2e" stroke-width="0.8" transform="rotate(45 ${gx} ${gy})"/>`);
      }
      // quarry terraces
      if (O[y][x] === 'q') for (let k = 1; k <= 2; k++) {
        const t = k / 3;
        out.push(poly([
          [T[0] + (B[0] - T[0]) * t - 10, T[1] + (B[1] - T[1]) * t],
          [T[0] + (B[0] - T[0]) * t + 10, T[1] + (B[1] - T[1]) * t],
          [T[0] + (B[0] - T[0]) * t + 10, T[1] + (B[1] - T[1]) * t + 2.4],
          [T[0] + (B[0] - T[0]) * t - 10, T[1] + (B[1] - T[1]) * t + 2.4],
        ], shade(P.rock, 0.72)));
      }
    }

    // sprites, drawn with their tile so painter order holds
    const o = O[y][x];
    if (o === 'F') drawTrees(x, y, cx, top);
    if (o === 'c') drawHouse(cx, top, 0.62, P.plaster, P.plasterD, P.thatch, P.thatchD);
    if (o === 'm') drawMarket(cx, top);
    if (o === 's' || o === 'y') drawHouse(cx, top, 0.6, '#b39268', '#9a7c55', o === 's' ? '#8a6240' : '#6f6a63', o === 's' ? '#755232' : '#5c5750');
    if (o === 'y') out.push(`<rect x="${cx + 8}" y="${top - 26}" width="4" height="12" fill="${P.ink}" opacity="0.85"/>`);
    if (o === 'n') { // mine: dark adit on the south face
      out.push(poly([[cx - 6, top + 4], [cx + 6, top + 4], [cx + 4, top + 12], [cx - 4, top + 12]], '#2e2822'));
      out.push(poly([[cx - 8, top + 3], [cx + 8, top + 3], [cx + 8, top + 5.4], [cx - 8, top + 5.4]], P.beam));
    }
    if (o === 'v') drawVillagers(cx, top, hash(x, y, 5) % 3 + 2);
  }
}

function drawTrees(x, y, cx, top) {
  const n = 2 + (hash(x, y, 11) % 2);
  for (let k = 0; k < n; k++) {
    const ox = ((hash(x, y, 20 + k) % 22) - 11), oy = ((hash(x, y, 30 + k) % 10) - 5);
    const bx = cx + ox, by = top + oy;
    const s = 0.85 + (hash(x, y, 40 + k) % 5) * 0.08;
    out.push(`<rect x="${(bx - 1.6).toFixed(1)}" y="${(by - 7 * s).toFixed(1)}" width="3.2" height="${7 * s}" fill="${P.trunk}"/>`);
    for (const [w, dy, c] of [[16, -8, P.canopy], [11, -15, P.canopyD]]) {
      const yy = by + dy * s;
      out.push(poly([[bx, yy - w * s * 0.34], [bx + w * s / 2, yy], [bx, yy + w * s * 0.34], [bx - w * s / 2, yy]], c));
    }
  }
}
function drawHouse(cx, top, k, wallL, wallR, roofA, roofB) {
  const w = TW * k, h2 = TH * k, wall = 11, roof = 9;
  const L = [cx - w / 2, top - wall], T = [cx, top - wall - h2 / 2], R = [cx + w / 2, top - wall], B = [cx, top - wall + h2 / 2];
  out.push(poly([[L[0], L[1]], [B[0], B[1]], [B[0], B[1] + wall], [L[0], L[1] + wall]], wallL));
  out.push(poly([[B[0], B[1]], [R[0], R[1]], [R[0], R[1] + wall], [B[0], B[1] + wall]], wallR));
  const A1 = [cx - w * 0.24, top - wall - roof - h2 * 0.1], A2 = [cx + w * 0.24, top - wall - roof - h2 * 0.1];
  out.push(poly([[L[0], L[1]], [T[0], T[1]], [R[0], R[1]], A2, A1], roofB));
  out.push(poly([[L[0], L[1]], [B[0], B[1]], [R[0], R[1]], A2, A1], roofA));
}
function drawMarket(cx, top) {
  drawHouse(cx, top, 0.88, P.plaster, P.plasterD, P.awn1, shade(P.awn1, 0.86));
  // striped awning bands on the front roof face
  const w = TW * 0.88;
  for (const t of [0.22, 0.58]) {
    const x0 = cx - w / 2 + w * t;
    out.push(poly([[x0, top - 20], [x0 + w * 0.16, top - 20], [x0 + w * 0.10, top - 9], [x0 - w * 0.06, top - 9]], P.awn2, 'opacity="0.95"'));
  }
  // banner
  out.push(`<rect x="${cx + 14}" y="${top - 40}" width="2.4" height="30" fill="${P.beam}"/>`);
  out.push(poly([[cx + 16.4, top - 40], [cx + 30, top - 36.4], [cx + 16.4, top - 32.8]], '#b98a2e'));
}
function drawVillagers(cx, top, n) {
  for (let k = 0; k < n; k++) {
    const ox = ((hash(9, k, 50) % 26) - 13), oy = ((hash(k, 7, 60) % 10) - 5);
    out.push(`<rect x="${cx + ox - 1.6}" y="${top + oy - 6}" width="3.2" height="6" rx="1.6" fill="${P.ink}" opacity="0.85"/>`);
    out.push(`<circle cx="${cx + ox}" cy="${top + oy - 7.6}" r="1.9" fill="#d8b48c"/>`);
  }
}

// --- assemble -----------------------------------------------------------
const W = N * TW + 16, Hh = N * TH + 8 * HZ + 100 + 60;
const svg = `<svg width="${W}" height="${Hh}" viewBox="0 0 ${W} ${Hh}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The valley of Brackenmere, a floating island">
<defs><filter id="soft" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="9"/></filter></defs>
<ellipse cx="${OX}" cy="${Hh - 26}" rx="${W * 0.34}" ry="15" fill="#3a3128" opacity="0.13" filter="url(#soft)"/>
${out.join('\n')}
</svg>`;

writeFileSync(new URL('./island.svg', import.meta.url), svg);
console.log(`island.svg: ${(svg.length / 1024).toFixed(0)} KB, ${out.length} elements`);

if (process.argv.includes('--page')) {
  writeFileSync(new URL('./island-preview.html', import.meta.url),
    `<!doctype html><body style="margin:0;background:#efe4d1;display:grid;place-items:center;height:100vh">${svg}</body>`);
}
