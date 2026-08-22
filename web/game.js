// STEADING — the playable client. Rendering, input, planning, playback.
// The rules all live in sim.js (verified against the Rust core); this file
// only draws state and collects intent.
import {
  GRID, TILES, T, K, KIND_INFO, HORIZON_DAYS, MAX_PLACEMENTS,
  START_POP, START_WOOD, START_STONE, START_FOOD, START_COIN,
  UNREST_NO_GROWTH, UNREST_EMIGRATION,
  generateValley, validatePlan, placementError, runSeason,
  makeDecree, decreeDay, decreeOrder, idx, orth, ring8,
  seedFromString, seedToHex,
} from './sim.js';

// ---------------------------------------------------------------- palette --
const P = {
  bg: '#efe4d1', panel: '#f6efe1', panelDeep: '#ece0c8', border: '#d8c9ac',
  ink: '#3a3128', soft: '#6f6250', faint: '#82735a',
  gold: '#b98a2e', goldDeep: '#96690f', goldSoft: '#f0e2c0', red: '#c25e4c',
  grass: '#97c178', grassHi: '#9cc67e', forest: '#7fae62',
  canopy: '#5f9150', canopyD: '#4a7a41', trunk: '#6d4f38',
  rock: '#9c948a', oreT: '#8f8a92', oreGlint: '#e8c86a',
  water: '#6fb9c1', field: '#c9b96a', fieldRow: '#a89a52', road: '#cdb98f',
  soil: '#a5794e', soilD: '#855e3c', slab: '#6f6a63', slabD: '#5c5750',
  plaster: '#f2e7cf', plasterD: '#e0d2b4', beam: '#6d4f38',
  thatch: '#d9ae56', awn2: '#c98a4b', skin: '#d8b48c',
};

const TW = 22, TH = 11, HZ = 6, SLAB = 46;
const WORLD_W = GRID * TW + 40;
const WORLD_H = GRID * TH + MAX_HZ() + SLAB + 90;
function MAX_HZ() { return 15 * HZ; }
const OX = WORLD_W / 2, OY = MAX_HZ() + 30;

const sx = (x, y) => OX + (x - y) * TW / 2;
const sy = (x, y, h) => OY + (x + y) * TH / 2 - h * HZ;

function jhash(x, y, s) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 2246822519)) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0; h = Math.imul(h, 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
function shade(col, f) {
  let r, g, b;
  if (col[0] === '#') {
    const n = parseInt(col.slice(1), 16);
    r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255;
  } else {
    const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(col);
    r = +m[1]; g = +m[2]; b = +m[3];
  }
  return `rgb(${Math.min(255, Math.round(r * f))},${Math.min(255, Math.round(g * f))},${Math.min(255, Math.round(b * f))})`;
}

// ------------------------------------------------------------------ state --
const state = {
  seedName: '', valley: null, plan: [],
  mode: 'plan',              // 'plan' | 'watch'
  tool: K.FIELD,             // building kind, or 'erase'
  result: null, day: 1, playing: false, speed: 1,
  cam: { x: 0, y: 0, z: 1 }, hover: null,
  lastTick: 0, acc: 0, dirty: true,
};

const $ = (id) => document.getElementById(id);
let cv, ctx, terrain, tctx, dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode etc. */ } },
};

// ------------------------------------------------------------- rendering --
function topColor(i) {
  const v = state.valley, x = i % GRID, y = (i / GRID) | 0;
  const h = v.height[i], k = v.kind[i];
  const j = 1 + ((jhash(x, y, 7) % 7) - 3) * 0.012;
  const lift = 1 + (h - 3) * 0.02;
  if (k === T.WATER) return P.water;
  if (k === T.FOREST) return shade(P.forest, j * lift);
  if (k === T.ROCK) return shade(P.rock, j * lift);
  if (k === T.ORE) return shade(P.oreT, j * lift);
  return shade((x & 1) === (y & 1) ? P.grass : P.grassHi, j * lift);
}

function diamond(c, cx, top, fill) {
  c.beginPath();
  c.moveTo(cx, top - TH / 2); c.lineTo(cx + TW / 2, top);
  c.lineTo(cx, top + TH / 2); c.lineTo(cx - TW / 2, top);
  c.closePath(); c.fillStyle = fill; c.fill();
}
function quad(c, pts, fill) {
  c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  c.closePath(); c.fillStyle = fill; c.fill();
}

function drawAO(c, i, cx, top) {
  const v = state.valley, x = i % GRID, y = (i / GRID) | 0, h = v.height[i];
  const hAt = (ax, ay) => (ax >= 0 && ay >= 0 && ax < GRID && ay < GRID) ? v.height[idx(ax, ay)] : -99;
  c.fillStyle = 'rgba(58,49,40,0.16)';
  if (hAt(x, y - 1) > h) quad(c, [[cx, top - TH / 2], [cx + TW / 2, top], [cx + TW / 2 - 3, top + 1.6], [cx - 3, top - TH / 2 + 1.6]], c.fillStyle);
  if (hAt(x - 1, y) > h) quad(c, [[cx, top - TH / 2], [cx - TW / 2, top], [cx - TW / 2 + 3, top + 1.6], [cx + 3, top - TH / 2 + 1.6]], c.fillStyle);
}

function drawTileTop(c, i, fill) {
  const v = state.valley, x = i % GRID, y = (i / GRID) | 0;
  const h = Math.max(v.height[i], 1.6);
  const cx = sx(x, y), top = sy(x, y, h);
  diamond(c, cx, top, fill);
  drawAO(c, i, cx, top);
}

// Terrain cache: sides, strata, tops, water, trees on unoccupied forest.
function buildTerrain() {
  const R = 2; // cache resolution
  terrain = document.createElement('canvas');
  terrain.width = WORLD_W * R; terrain.height = WORLD_H * R;
  tctx = terrain.getContext('2d');
  tctx.scale(R, R);
  const c = tctx, v = state.valley;
  const occupiedByPlan = new Set(state.plan.filter(p => p.kind !== K.DECREE).map(p => idx(p.x, p.y)));

  // soft shadow beneath the island
  c.save();
  c.filter = 'blur(9px)';
  c.fillStyle = 'rgba(58,49,40,0.14)';
  c.beginPath();
  c.ellipse(OX, GRID * TH + OY + SLAB + 6, WORLD_W * 0.30, 13, 0, 0, Math.PI * 2);
  c.fill();
  c.restore();

  for (let s = 0; s <= 2 * (GRID - 1); s++) {
    for (let x = Math.max(0, s - GRID + 1); x <= Math.min(s, GRID - 1); x++) {
      const y = s - x, i = idx(x, y);
      const isWater = v.kind[i] === T.WATER;
      const h = Math.max(v.height[i], 1.6);
      const cx = sx(x, y), top = sy(x, y, h);
      const bot = OY + (x + y) * TH / 2 + SLAB + (jhash(x, y, 3) % 4) * 6 + ((x + y) % 3) * 4;
      const L = [cx - TW / 2, top], Rt = [cx + TW / 2, top], B = [cx, top + TH / 2];
      const tc = topColor(i);
      for (const [a, b, f] of [[L, B, 0.8], [B, Rt, 0.92]]) {
        const d1 = bot - top;
        const strata = [[0, 0.1, shade(tc, f * 0.9)], [0.1, 0.42, shade(P.soil, f)], [0.42, 0.66, shade(P.soilD, f)], [0.66, 0.88, shade(P.slab, f)], [0.88, 1, shade(P.slabD, f)]];
        for (const [u0, u1, col] of strata) {
          quad(c, [[a[0], a[1] + d1 * u0], [b[0], b[1] + d1 * u0], [b[0], b[1] + d1 * u1], [a[0], a[1] + d1 * u1]], col);
        }
      }
      if (isWater) {
        c.globalAlpha = 0.92; diamond(c, cx, top, P.water); c.globalAlpha = 1;
      } else {
        diamond(c, cx, top, tc);
        drawAO(c, i, cx, top);
        if (v.kind[i] === T.ORE) {
          for (let k = 0; k < 2; k++) {
            const gx = cx + ((jhash(x, y, k) % 12) - 6), gy = top + ((jhash(x, y, k + 9) % 5) - 2);
            c.save(); c.translate(gx, gy); c.rotate(Math.PI / 4);
            c.fillStyle = P.oreGlint; c.fillRect(-1.6, -1.6, 3.2, 3.2);
            c.strokeStyle = P.goldDeep; c.lineWidth = 0.6; c.strokeRect(-1.6, -1.6, 3.2, 3.2);
            c.restore();
          }
        }
        if (v.kind[i] === T.FOREST && !occupiedByPlan.has(i)) drawTrees(c, x, y, cx, top);
      }
    }
  }
  state.dirty = true;
}

function drawTrees(c, x, y, cx, top) {
  const n = 1 + (jhash(x, y, 11) % 2);
  for (let k = 0; k < n; k++) {
    const ox = ((jhash(x, y, 20 + k) % 12) - 6), oy = ((jhash(x, y, 30 + k) % 5) - 2);
    const bx = cx + ox, by = top + oy;
    const s = 0.45 + (jhash(x, y, 40 + k) % 5) * 0.05;
    c.fillStyle = P.trunk; c.fillRect(bx - 0.9, by - 5 * s * 1.4, 1.8, 5 * s * 1.4);
    for (const [w, dy, col] of [[15, -6, P.canopy], [10, -11, P.canopyD]]) {
      c.beginPath();
      c.moveTo(bx, by + dy * s - w * s * 0.34); c.lineTo(bx + w * s / 2, by + dy * s);
      c.lineTo(bx, by + dy * s + w * s * 0.34); c.lineTo(bx - w * s / 2, by + dy * s);
      c.closePath(); c.fillStyle = col; c.fill();
    }
  }
}

function drawHouse(c, cx, top, k, wallL, wallR, roofA, roofB) {
  const w = TW * k, h2 = TH * k, wall = 6.4, roof = 5.2;
  const L = [cx - w / 2, top - wall], Tt = [cx, top - wall - h2 / 2], Rr = [cx + w / 2, top - wall], B = [cx, top - wall + h2 / 2];
  quad(c, [[L[0], L[1]], [B[0], B[1]], [B[0], B[1] + wall], [L[0], L[1] + wall]], wallL);
  quad(c, [[B[0], B[1]], [Rr[0], Rr[1]], [Rr[0], Rr[1] + wall], [B[0], B[1] + wall]], wallR);
  const A1 = [cx - w * 0.24, top - wall - roof - h2 * 0.1], A2 = [cx + w * 0.24, top - wall - roof - h2 * 0.1];
  quad(c, [[L[0], L[1]], [Tt[0], Tt[1]], [Rr[0], Rr[1]], A2, A1], roofB);
  quad(c, [[L[0], L[1]], [B[0], B[1]], [Rr[0], Rr[1]], A2, A1], roofA);
}

function drawBuilding(c, p, day) {
  const i = idx(p.x, p.y);
  const h = Math.max(state.valley.height[i], 1.6);
  const cx = sx(p.x, p.y), top = sy(p.x, p.y, h);
  switch (p.kind) {
    case K.FIELD: {
      drawTileTop(c, i, shade(P.field, 1 + ((jhash(p.x, p.y, 7) % 7) - 3) * 0.012));
      // furrow lines from the NW edge to the SE edge, as on the island render
      c.strokeStyle = P.fieldRow; c.globalAlpha = 0.45; c.lineWidth = 1;
      const Tx = cx, Ty = top - TH / 2, Lx = cx - TW / 2, Ly = top;
      const Rx = cx + TW / 2, Ry = top, Bx = cx, By = top + TH / 2;
      for (let k = 1; k <= 3; k++) {
        const t = k / 4;
        c.beginPath();
        c.moveTo(Tx + (Lx - Tx) * t, Ty + (Ly - Ty) * t);
        c.lineTo(Rx + (Bx - Rx) * t, Ry + (By - Ry) * t);
        c.stroke();
      }
      c.globalAlpha = 1;
      break;
    }
    case K.ROAD: drawTileTop(c, i, shade(P.road, 1 + ((jhash(p.x, p.y, 7) % 7) - 3) * 0.012)); break;
    case K.COTTAGE: drawHouse(c, cx, top, 0.62, P.plaster, P.plasterD, P.thatch, shade(P.thatch, 0.88)); break;
    case K.MARKET: {
      drawHouse(c, cx, top, 0.9, P.plaster, P.plasterD, P.goldSoft, shade(P.goldSoft, 0.88));
      const w = TW * 0.9;
      for (const t of [0.24, 0.6]) {
        const x0 = cx - w / 2 + w * t;
        quad(c, [[x0, top - 11.5], [x0 + w * 0.15, top - 11.5], [x0 + w * 0.09, top - 5.4], [x0 - w * 0.06, top - 5.4]], P.awn2);
      }
      c.fillStyle = P.beam; c.fillRect(cx + 7, top - 22, 1.4, 16);
      quad(c, [[cx + 8.4, top - 22], [cx + 16, top - 20], [cx + 8.4, top - 18]], P.gold);
      break;
    }
    case K.SAWMILL: drawHouse(c, cx, top, 0.62, '#b39268', '#9a7c55', '#8a6240', '#755232'); break;
    case K.SMITHY:
      drawHouse(c, cx, top, 0.6, '#b39268', '#9a7c55', P.slab, P.slabD);
      c.fillStyle = P.ink; c.globalAlpha = 0.85; c.fillRect(cx + 4.6, top - 15, 2.2, 7); c.globalAlpha = 1;
      break;
    case K.QUARRY: {
      drawTileTop(c, i, shade(P.rock, 0.95));
      c.fillStyle = shade(P.rock, 0.72);
      for (let k = 1; k <= 2; k++) {
        const t = k / 3;
        c.fillRect(cx - 6, top - TH / 2 + TH * t - 1, 12, 1.6);
      }
      break;
    }
    case K.MINE: {
      quad(c, [[cx - 3.4, top + 2], [cx + 3.4, top + 2], [cx + 2.4, top + 6.6], [cx - 2.4, top + 6.6]], '#2e2822');
      c.fillStyle = P.beam; c.fillRect(cx - 4.4, top + 1, 8.8, 1.4);
      break;
    }
  }
}

// Villagers at staffed buildings, deterministic per day.
function drawVillagers(c, day, pop) {
  const bd = state.result ? state.result.builtDay : null;
  let idle = pop;
  for (let i = 0; i < state.plan.length && idle > 0; i++) {
    const p = state.plan[i];
    if (p.kind === K.DECREE) continue;
    const isBuilt = bd ? (bd[i] > 0 && bd[i] <= day) : false;
    if (!isBuilt) continue;
    const cap = KIND_INFO[p.kind].staff;
    if (cap === 0) continue;
    const take = Math.min(cap, idle); idle -= take;
    const h = Math.max(state.valley.height[idx(p.x, p.y)], 1.6);
    const cx = sx(p.x, p.y), top = sy(p.x, p.y, h);
    for (let k = 0; k < Math.min(take, 2); k++) {
      const ox = ((jhash(p.x, k, 50) % 14) - 7), oy = ((jhash(k, p.y, 60) % 6) - 3) + 4;
      c.fillStyle = P.ink; c.globalAlpha = 0.85;
      c.fillRect(cx + ox - 0.9, top + oy - 3.6, 1.8, 3.6);
      c.globalAlpha = 1;
      c.beginPath(); c.arc(cx + ox, top + oy - 4.6, 1.1, 0, Math.PI * 2);
      c.fillStyle = P.skin; c.fill();
    }
  }
}

function currentSnapshot() {
  if (!state.result) return null;
  const snaps = state.result.snapshots;
  const d = Math.min(state.day, snaps.length);
  return snaps[Math.max(0, d - 1)];
}

function drawFrame() {
  const w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== (w * dpr) | 0) { cv.width = w * dpr; cv.height = h * dpr; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = P.bg; ctx.fillRect(0, 0, w, h);
  const grad = ctx.createRadialGradient(w / 2, h * 0.42, 60, w / 2, h * 0.42, Math.max(w, h) * 0.6);
  grad.addColorStop(0, '#f6ecd8'); grad.addColorStop(1, P.bg);
  ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);

  const { x: px, y: py, z } = state.cam;
  ctx.save();
  ctx.translate(px, py); ctx.scale(z, z);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(terrain, 0, 0, WORLD_W, WORLD_H);

  // dynamic layer: buildings in painter order, then villagers
  const inWatch = state.mode === 'watch' && state.result;
  const bd = state.result ? state.result.builtDay : null;
  const order = state.plan.map((p, i) => [p, i]).filter(([p]) => p.kind !== K.DECREE)
    .sort((a, b) => (a[0].x + a[0].y) - (b[0].x + b[0].y));
  for (const [p, i] of order) {
    let show = true, ghosted = false;
    if (inWatch) { show = bd[i] > 0 && bd[i] <= state.day; }
    else ghosted = false;
    if (!show) { // planned but not yet raised during playback: faint stake
      const hh = Math.max(state.valley.height[idx(p.x, p.y)], 1.6);
      ctx.globalAlpha = 0.28;
      diamond(ctx, sx(p.x, p.y), sy(p.x, p.y, hh), P.goldDeep);
      ctx.globalAlpha = 1;
      continue;
    }
    drawBuilding(ctx, p, state.day);
  }
  if (inWatch) {
    const snap = currentSnapshot();
    if (snap) drawVillagers(ctx, state.day, snap.pop);
  }

  // hover ghost
  if (state.mode === 'plan' && state.hover != null && state.tool !== 'erase') {
    const i = state.hover, x = i % GRID, y = (i / GRID) | 0;
    const err = placementError(state.valley, state.plan, { x, y, kind: state.tool, param: 0 });
    const hh = Math.max(state.valley.height[i], 1.6);
    ctx.globalAlpha = 0.55;
    diamond(ctx, sx(x, y), sy(x, y, hh), err ? P.red : '#e9f5d8');
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.4 / z; ctx.strokeStyle = err ? P.red : P.canopyD;
    ctx.beginPath();
    const cx0 = sx(x, y), t0 = sy(x, y, hh);
    ctx.moveTo(cx0, t0 - TH / 2); ctx.lineTo(cx0 + TW / 2, t0); ctx.lineTo(cx0, t0 + TH / 2); ctx.lineTo(cx0 - TW / 2, t0);
    ctx.closePath(); ctx.stroke();
  }
  if (state.mode === 'plan' && state.hover != null && state.tool === 'erase') {
    const i = state.hover, x = i % GRID, y = (i / GRID) | 0;
    const hh = Math.max(state.valley.height[i], 1.6);
    ctx.globalAlpha = 0.5; diamond(ctx, sx(x, y), sy(x, y, hh), P.red); ctx.globalAlpha = 1;
  }
  ctx.restore();

  // famine vignette
  const snap = currentSnapshot();
  if (inWatch && snap && snap.famine) {
    const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.34, w / 2, h / 2, Math.max(w, h) * 0.62);
    vg.addColorStop(0, 'rgba(194,94,76,0)'); vg.addColorStop(1, 'rgba(194,94,76,0.30)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
  }
}

// ------------------------------------------------------------------ input --
function pickTile(mx, my) {
  const { x: px, y: py, z } = state.cam;
  const wx = (mx - px) / z, wy = (my - py) / z;
  for (let h = 15; h >= 0; h--) {
    const A = (wx - OX) / (TW / 2);
    const B = (wy - OY + h * HZ) / (TH / 2);
    const x = Math.round((A + B) / 2), y = Math.round((B - A) / 2);
    if (x < 0 || y < 0 || x >= GRID || y >= GRID) continue;
    const i = idx(x, y);
    if (state.valley.height[i] === h) return i;
    if (state.valley.kind[i] === T.WATER && h <= 1) return i;
  }
  return null;
}

function fitCamera() {
  const w = cv.clientWidth, h = cv.clientHeight;
  const z = Math.min(w / WORLD_W, h / WORLD_H) * 0.96;
  state.cam = { z, x: (w - WORLD_W * z) / 2, y: (h - WORLD_H * z) / 2 };
  state.dirty = true;
}

// ------------------------------------------------------------------- plan --
function seedKey(suffix) { return `steading:${state.seedName}:${suffix}`; }

function savePlan() {
  store.set(seedKey('plan'), JSON.stringify(state.plan));
}
function loadPlan() {
  const raw = store.get(seedKey('plan'));
  if (!raw) return [];
  try {
    const plan = JSON.parse(raw);
    if (Array.isArray(plan) && validatePlan(state.valley, plan).ok) return plan;
  } catch { /* fall through */ }
  return [];
}

function addPlacement(x, y, kind) {
  const err = placementError(state.valley, state.plan, { x, y, kind, param: 0 });
  if (err) { toast(err); return; }
  state.plan.push({ x, y, kind, param: 0 });
  onPlanChanged(state.valley.kind[idx(x, y)] === T.FOREST);
}
function removeAt(x, y) {
  const i = state.plan.findIndex((p) => p.kind !== K.DECREE && p.x === x && p.y === y);
  if (i >= 0) {
    const wasForest = state.valley.kind[idx(x, y)] === T.FOREST;
    state.plan.splice(i, 1);
    onPlanChanged(wasForest);
  }
}
function onPlanChanged(rebuildTerrain) {
  state.result = null;
  if (rebuildTerrain) buildTerrain();
  savePlan();
  renderPlanList(); renderBudget(); renderCrown();
  state.dirty = true;
}

function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.style.opacity = '0'; }, 1800);
}

// -------------------------------------------------------------------- UI --
const KIND_ORDER = [K.FIELD, K.COTTAGE, K.SAWMILL, K.QUARRY, K.MINE, K.SMITHY, K.ROAD, K.MARKET];
const KIND_HINT = {
  [K.FIELD]: 'food from adjacent grass — never market-scaled',
  [K.COTTAGE]: '+4 beds',
  [K.SAWMILL]: 'wood from adjacent forest',
  [K.QUARRY]: 'stone from adjacent rock',
  [K.MINE]: 'ore from adjacent ore veins',
  [K.SMITHY]: 'wood + ore → goods',
  [K.ROAD]: 'carries goods to market',
  [K.MARKET]: 'sells goods → EXPORTS · 2 coin each',
};

function costChips(k) {
  const c = KIND_INFO[k]; const bits = [];
  if (c.wood) bits.push(`${c.wood}w`);
  if (c.stone) bits.push(`${c.stone}s`);
  if (c.coin) bits.push(`<i>${c.coin}c</i>`);
  return bits.map((b) => `<span class="chip">${b}</span>`).join('');
}

function renderPalette() {
  const el = $('palette');
  el.innerHTML = '';
  for (const k of KIND_ORDER) {
    const d = document.createElement('div');
    d.className = 'pal' + (state.tool === k ? ' on' : '');
    d.innerHTML = `<span class="pname">${KIND_INFO[k].name}</span><span class="pcost">${costChips(k)}</span>`;
    d.title = KIND_HINT[k];
    d.onclick = () => { state.tool = k; renderPalette(); };
    el.appendChild(d);
  }
  const e = document.createElement('div');
  e.className = 'pal erase' + (state.tool === 'erase' ? ' on' : '');
  e.innerHTML = '<span class="pname">Remove</span>';
  e.onclick = () => { state.tool = 'erase'; renderPalette(); };
  el.appendChild(e);
}

function planLabel(p, i) {
  if (p.kind === K.DECREE) {
    const [dk, dv] = decreeOrder(p);
    return dk === 0 ? `Decree · day ${decreeDay(p)} — tithe to ${dv}` : `Decree · day ${decreeDay(p)} — festival`;
  }
  return `${KIND_INFO[p.kind].name} (${p.x}, ${p.y})`;
}

function renderPlanList() {
  const el = $('planlist');
  el.innerHTML = '';
  state.plan.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'prow' + (p.kind === K.DECREE ? ' dec' : '');
    row.innerHTML = `<span class="pn">${i + 1}</span><span class="pl">${planLabel(p, i)}</span>`;
    const up = document.createElement('button'); up.className = 'mini'; up.textContent = '↑';
    up.onclick = () => { if (i > 0) { [state.plan[i - 1], state.plan[i]] = [state.plan[i], state.plan[i - 1]]; onPlanChanged(false); } };
    const dn = document.createElement('button'); dn.className = 'mini'; dn.textContent = '↓';
    dn.onclick = () => { if (i < state.plan.length - 1) { [state.plan[i + 1], state.plan[i]] = [state.plan[i], state.plan[i + 1]]; onPlanChanged(false); } };
    const del = document.createElement('button'); del.className = 'mini del'; del.textContent = '×';
    del.onclick = () => {
      const wasForest = p.kind !== K.DECREE && state.valley.kind[idx(p.x, p.y)] === T.FOREST;
      state.plan.splice(i, 1); onPlanChanged(wasForest);
    };
    row.append(up, dn, del);
    el.appendChild(row);
  });
  if (!state.plan.length) el.innerHTML = '<div class="empty">Nothing planned. Feed them first — the pantry holds two and a half days.</div>';
}

function renderBudget() {
  $('budget').textContent = `${state.plan.length} / ${MAX_PLACEMENTS} entries · ${state.plan.length * 4} / 600 bytes`;
  $('budgetbar').style.width = `${(state.plan.length / MAX_PLACEMENTS) * 100}%`;
}

function meterHTML(unrest) {
  let cells = '';
  for (let i = 0; i < 10; i++) {
    const on = i < unrest;
    cells += `<span class="uc" style="background:${on ? '#c9884f' : P.panelDeep}"></span>`;
  }
  return cells;
}

function renderCrown() {
  const snap = currentSnapshot();
  const inWatch = state.mode === 'watch' && snap;
  const o = empire.seasonOpts();
  const v = inWatch ? snap : {
    pop: o.startPop ?? START_POP, food: o.startFood ?? START_FOOD,
    wood: o.startWood ?? START_WOOD, stone: o.startStone ?? START_STONE,
    ore: 0, goods: 0, coin: o.startCoin ?? START_COIN, unrest: 0, tax: 1, exports: 0,
  };
  $('c-coin').textContent = v.coin;
  $('c-tax').textContent = v.tax;
  $('c-folk').textContent = v.pop;
  $('c-food').textContent = v.food;
  $('c-wood').textContent = v.wood;
  $('c-stone').textContent = v.stone;
  $('c-ore').textContent = v.ore;
  $('c-goods').textContent = v.goods;
  $('c-unrest').innerHTML = meterHTML(v.unrest);
  $('c-unrest-n').textContent = `${v.unrest} of 10 ${v.unrest >= UNREST_EMIGRATION ? '· revolt' : v.unrest >= UNREST_NO_GROWTH ? '· seething' : v.unrest >= 3 ? '· uneasy' : '· content'}`;
  $('s-exp').textContent = v.exports;
  const eff = state.result && inWatch ? (((v.exports * 100) / Math.max(state.result.peakPop, 1)) | 0) : 0;
  $('s-eff').textContent = inWatch ? eff : '—';
  $('s-ftp').textContent = inWatch ? (snap.built ?? 0) : state.plan.filter(p => p.kind !== K.DECREE).length;
}

function renderTimeline() {
  const el = $('marks');
  el.innerHTML = '';
  if (state.result) {
    for (const s of state.result.snapshots) {
      if (s.famine) {
        const m = document.createElement('span');
        m.className = 'tick';
        m.style.left = `${(s.day / HORIZON_DAYS) * 100}%`;
        el.appendChild(m);
      }
    }
  }
  for (const p of state.plan) {
    if (p.kind !== K.DECREE) continue;
    const m = document.createElement('span');
    m.className = 'dia';
    m.style.left = `${(decreeDay(p) / HORIZON_DAYS) * 100}%`;
    el.appendChild(m);
  }
}

// --------------------------------------------------------------- run/watch --
function runPlan() {
  const check = validatePlan(state.valley, state.plan);
  if (!check.ok) { toast(`plan invalid: ${check.error}`); return; }
  if (!state.plan.some(p => p.kind !== K.DECREE)) { toast('place something first'); return; }
  state.result = runSeason(state.valley, state.plan, HORIZON_DAYS, empire.seasonOpts());
  state.settled = false;
  state.mode = 'watch';
  state.day = 1; state.playing = true; state.acc = 0;
  $('mode-plan').classList.remove('on'); $('mode-watch').classList.add('on');
  $('run').textContent = 'Re-run';
  renderTimeline(); state.dirty = true;
  updateBest();
}

function updateBest() {
  const r = state.result;
  if (!r || r.outcome !== 'completed') return;
  const key = seedKey('best');
  let best = null;
  try { best = JSON.parse(store.get(key) || 'null'); } catch { best = null; }
  if (!best || r.exports > best.exports) {
    store.set(key, JSON.stringify({ exports: r.exports, efficiency: r.efficiency, footprint: r.footprint }));
  }
}

function backToPlan() {
  state.mode = 'plan'; state.playing = false;
  $('mode-watch').classList.remove('on'); $('mode-plan').classList.add('on');
  $('overlay').style.display = 'none';
  renderCrown(); state.dirty = true;
}

function showResults() {
  const r = state.result;
  let minted = 0;
  if (!state.settled) { minted = empire.settle(r); state.settled = true; renderEmpire(); }
  const best = (() => { try { return JSON.parse(store.get(seedKey('best')) || 'null'); } catch { return null; } })();
  let headline, sub;
  if (r.outcome === 'extinct') {
    headline = `The steading fell on day ${r.extinctDay}`;
    sub = r.extinctBy === 'revolt'
      ? 'The folk walked out fed. The tithe asked more than the land gave back.'
      : 'The pantry emptied and the fields had no hands. Feed them first.';
  } else {
    headline = 'The season is done';
    sub = r.famineDays > 0 ? `${r.famineDays} red day${r.famineDays > 1 ? 's' : ''} — the town outgrew its fields for a while.` : 'Not one villager went hungry. A clean ledger.';
  }
  $('ov-head').textContent = headline;
  $('ov-sub').textContent = sub;
  $('ov-exp').textContent = r.exports;
  $('ov-eff').textContent = r.efficiency;
  $('ov-ftp').textContent = r.footprint;
  $('ov-extra').textContent = `peak folk ${r.peakPop} · treasury ${r.finalCoin} · ${r.buildingsBuilt} raised`;
  $('ov-best').textContent = best ? `Best exports on this valley: ${best.exports}` : '';
  $('ov-groats').textContent = r.outcome === 'completed'
    ? (minted > 0 ? `+${minted} ⟡ minted · ${empire.groats()} in the vault`
                  : `nothing new to mint — beat ${store.get(seedKey('minted-hw')) || 0} exports here to earn ⟡`)
    : 'a fallen steading mints nothing';
  $('overlay').style.display = 'flex';
}

// ------------------------------------------------------------------ decrees --
function renderDecreeForm() {
  const dayIn = $('dec-day');
  $('dec-tax0').onclick = () => sealDecree(0, 0);
  $('dec-tax1').onclick = () => sealDecree(0, 1);
  $('dec-tax2').onclick = () => sealDecree(0, 2);
  $('dec-tax3').onclick = () => sealDecree(0, 3);
  $('dec-fest').onclick = () => sealDecree(1, 0);
  function sealDecree(type, val) {
    const day = Math.max(1, Math.min(HORIZON_DAYS, parseInt(dayIn.value || '1', 10)));
    if (state.plan.length >= MAX_PLACEMENTS) { toast('plan is full'); return; }
    state.plan.push(makeDecree(day, type, val));
    onPlanChanged(false);
    toast(type === 0 ? `sealed: day ${day}, tithe ${val}` : `sealed: day ${day}, festival`);
  }
}

// ----------------------------------------------------------------- empire --
// The cross-valley layer: completed seasons mint GROATS — the kingdom's
// ledger money — and groats buy charters that strengthen every later reign.
// Balances live in this browser; the swap to an on-chain token is the next
// milestone (research/14-spec-steading.md) and is deliberately not faked here.
const CHARTERS = [
  { id: 'granary', name: 'Granary Charter', cost: 30, blurb: '+12 starting food — a deeper pantry', opts: { startFood: 12 } },
  { id: 'timber', name: 'Timberwright Charter', cost: 30, blurb: '+10 starting wood', opts: { startWood: 10 } },
  { id: 'mason', name: 'Mason Charter', cost: 30, blurb: '+10 starting stone', opts: { startStone: 10 } },
  { id: 'purse', name: 'Purse Charter', cost: 30, blurb: '+15 starting coin', opts: { startCoin: 15 } },
  { id: 'founders', name: 'Founders Charter', cost: 80, blurb: '+2 founding villagers, housed', opts: { startPop: 2, baseHousing: 2 } },
];
const RANKS = [[0, 'Apprentice'], [100, 'Journeyman'], [400, 'Guildmaster']];

const empire = {
  groats: () => parseInt(store.get('steading:groats') || '0', 10),
  lifetime: () => parseInt(store.get('steading:lifetime') || '0', 10),
  addGroats(n) {
    store.set('steading:groats', String(this.groats() + n));
    store.set('steading:lifetime', String(this.lifetime() + n));
  },
  spend(n) { store.set('steading:groats', String(this.groats() - n)); },
  charters: () => { try { return JSON.parse(store.get('steading:charters') || '[]'); } catch { return []; } },
  ownCharter(id) {
    const c = this.charters(); c.push(id);
    store.set('steading:charters', JSON.stringify(c));
  },
  rank() {
    const l = this.lifetime();
    let r = RANKS[0][1];
    for (const [min, name] of RANKS) if (l >= min) r = name;
    return r;
  },
  seasonOpts() {
    const owned = this.charters();
    const opts = {};
    for (const c of CHARTERS) {
      if (!owned.includes(c.id)) continue;
      for (const [k, v] of Object.entries(c.opts)) {
        const base = { startFood: START_FOOD, startWood: START_WOOD, startStone: START_STONE, startCoin: START_COIN, startPop: START_POP, baseHousing: 6 }[k];
        opts[k] = (opts[k] ?? base) + v;
      }
    }
    return opts;
  },
  // Mint for a completed season: every export above this valley's settled
  // high-water mark pays one groat; the first completion also converts the
  // treasury at 10 coin to the groat.
  settle(result) {
    if (result.outcome !== 'completed') return 0;
    const hwKey = seedKey('minted-hw');
    const hw = parseInt(store.get(hwKey) || '0', 10);
    let pay = Math.max(0, result.exports - hw);
    const firstKey = seedKey('first-done');
    if (!store.get(firstKey)) { pay += (result.finalCoin / 10) | 0; store.set(firstKey, '1'); }
    if (result.exports > hw) store.set(hwKey, String(result.exports));
    if (pay > 0) this.addGroats(pay);
    return pay;
  },
};

function renderEmpire() {
  $('em-groats').textContent = empire.groats();
  $('em-rank').textContent = `${empire.rank()} of the Guild`;
  $('em-lifetime').textContent = empire.lifetime();
  $('tb-groats').textContent = empire.groats();
  const list = $('em-charters');
  list.innerHTML = '';
  const owned = empire.charters();
  for (const c of CHARTERS) {
    const has = owned.includes(c.id);
    const row = document.createElement('div');
    row.className = 'charter' + (has ? ' owned' : '');
    row.innerHTML = `<div class="cinfo"><b>${c.name}</b><span>${c.blurb}</span></div>`;
    const btn = document.createElement('button');
    btn.className = 'cbuy';
    if (has) { btn.textContent = 'Sealed'; btn.disabled = true; }
    else {
      btn.textContent = `${c.cost} ⟡`;
      btn.disabled = empire.groats() < c.cost;
      btn.onclick = () => {
        if (empire.groats() < c.cost) return;
        empire.spend(c.cost); empire.ownCharter(c.id);
        toast(`${c.name} sealed — every reign to come starts stronger`);
        renderEmpire(); renderCrown();
      };
    }
    row.appendChild(btn);
    list.appendChild(row);
  }
}

// ------------------------------------------------------------------ seeds --
function dailyName() {
  const d = new Date();
  const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  return `daily-${iso}`;
}

const ADJ = ['Bracken', 'Elder', 'Harrow', 'Gorse', 'Salt', 'Thorn', 'Weeping', 'Alder', 'Mirk', 'Fallow', 'Hollow', 'Cinder'];
const NOUN = ['mere', 'fen', 'downs', 'fells', 'reach', 'vale', 'shaw', 'moor', 'holt', 'combe', 'garth', 'wick'];
function prettyName(seedName) {
  const s = seedFromString(seedName);
  return `The ${ADJ[s[2] % ADJ.length]}${NOUN[s[3] % NOUN.length]}`;
}

function loadValley(name) {
  state.seedName = name;
  state.valley = generateValley(seedFromString(name));
  state.plan = loadPlan();
  state.result = null; state.mode = 'plan'; state.day = 1; state.playing = false;
  $('mode-watch').classList.remove('on'); $('mode-plan').classList.add('on');
  $('vname').textContent = prettyName(name);
  $('vseed').textContent = name.startsWith('daily-') ? `valley of the day · ${name.slice(6)}` : `seed · ${name}`;
  $('run').textContent = 'Run the season';
  buildTerrain(); fitCamera();
  renderPlanList(); renderBudget(); renderCrown(); renderTimeline();
  try { location.hash = name === dailyName() ? '' : `v=${encodeURIComponent(name)}`; } catch { /* ignore */ }
}

// ------------------------------------------------------------------- boot --
export function boot() {
  cv = $('cv'); ctx = cv.getContext('2d');

  renderPalette(); renderDecreeForm();

  const initialHash = location.hash || '';
  let name = dailyName();
  const m = /v=([^&]+)/.exec(initialHash);
  if (m) name = decodeURIComponent(m[1]);
  loadValley(name);

  const zm = /z=([\d.]+)/.exec(initialHash);
  if (zm) {
    const z = parseFloat(zm[1]);
    state.cam.z *= z;
    const tm = /t=(\d+),(\d+)/.exec(initialHash);
    const wx = tm ? sx(+tm[1], +tm[2]) : WORLD_W / 2;
    const wy = tm ? sy(+tm[1], +tm[2], state.valley.height[idx(+tm[1], +tm[2])]) : WORLD_H / 2.6;
    state.cam.x = cv.clientWidth / 2 - wx * state.cam.z;
    state.cam.y = cv.clientHeight / 2 - wy * state.cam.z;
    state.dirty = true;
  }

  // pan / zoom / hover / click
  let dragging = false, moved = false, lx = 0, ly = 0;
  cv.addEventListener('pointerdown', (e) => { dragging = true; moved = false; lx = e.clientX; ly = e.clientY; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', (e) => {
    const r = cv.getBoundingClientRect();
    if (dragging) {
      const dx = e.clientX - lx, dy = e.clientY - ly;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      state.cam.x += dx; state.cam.y += dy; lx = e.clientX; ly = e.clientY;
      state.dirty = true;
    }
    const t = pickTile(e.clientX - r.left, e.clientY - r.top);
    if (t !== state.hover) { state.hover = t; state.dirty = true; updateHoverCard(e.clientX - r.left, e.clientY - r.top); }
    else if (t != null) positionHoverCard(e.clientX - r.left, e.clientY - r.top);
  });
  cv.addEventListener('pointerup', (e) => {
    dragging = false;
    if (moved || state.mode !== 'plan') return;
    const r = cv.getBoundingClientRect();
    const t = pickTile(e.clientX - r.left, e.clientY - r.top);
    if (t == null) return;
    const x = t % GRID, y = (t / GRID) | 0;
    if (state.tool === 'erase') removeAt(x, y);
    else addPlacement(x, y, state.tool);
  });
  cv.addEventListener('pointerleave', () => { state.hover = null; $('hovercard').style.display = 'none'; state.dirty = true; });
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = cv.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const f = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const z2 = Math.max(0.35, Math.min(2.6, state.cam.z * f));
    state.cam.x = mx - (mx - state.cam.x) * (z2 / state.cam.z);
    state.cam.y = my - (my - state.cam.y) * (z2 / state.cam.z);
    state.cam.z = z2; state.dirty = true;
  }, { passive: false });

  window.addEventListener('resize', () => { fitCamera(); });

  $('run').onclick = () => { if (state.mode === 'watch') { backToPlan(); } runPlan(); };
  $('mode-plan').onclick = backToPlan;
  $('mode-watch').onclick = () => { if (state.result) { state.mode = 'watch'; $('mode-plan').classList.remove('on'); $('mode-watch').classList.add('on'); state.dirty = true; } };
  $('play').onclick = () => { state.playing = !state.playing; };
  $('speed').onclick = () => { state.speed = state.speed === 1 ? 4 : 1; $('speed').textContent = `${state.speed}×`; };
  $('scrub').oninput = (e) => { state.day = parseInt(e.target.value, 10); state.playing = false; renderCrown(); state.dirty = true; };
  $('ov-refine').onclick = backToPlan;
  $('ov-new').onclick = () => { $('overlay').style.display = 'none'; newRandomValley(); };
  $('btn-daily').onclick = () => loadValley(dailyName());
  $('btn-random').onclick = newRandomValley;
  $('btn-help').onclick = () => { $('help').style.display = $('help').style.display === 'none' ? 'block' : 'none'; };
  $('btn-empire').onclick = () => { renderEmpire(); $('empire').style.display = 'flex'; };
  $('em-close').onclick = () => { $('empire').style.display = 'none'; };
  renderEmpire();
  if (/empire/.test(initialHash)) { renderEmpire(); $('empire').style.display = 'flex'; }
  $('help-close').onclick = () => { $('help').style.display = 'none'; };

  function newRandomValley() {
    const n = `vale-${Math.random().toString(36).slice(2, 8)}`;
    loadValley(n);
  }

  // first visit hint
  if (!store.get('steading:seen') && !/demo|plain|empire/.test(initialHash)) { $('help').style.display = 'block'; }
  store.set('steading:seen', '1');

  // demo fragment for automated screenshots: seed a starter hamlet and run
  if (/demo/.test(initialHash)) {
    starterHamlet();
    runPlan();
    state.playing = false; state.day = state.result ? state.result.daysRun : 1;
    if (state.result && !/plain/.test(initialHash)) showResults();
    renderCrown(); state.dirty = true;
  }
  $('btn-starter').onclick = () => { starterHamlet(); };

  requestAnimationFrame(tick);
}

// Find a decent flat grass pocket and lay the pantry lesson out correctly:
// field first, then a cottage, then a sawmill by the forest if one is near.
function starterHamlet() {
  const v = state.valley;
  const can = (x, y, kind) => !placementError(v, state.plan, { x, y, kind, param: 0 });
  let bestI = -1, bestScore = -1;
  for (let i = 0; i < TILES; i++) {
    if (v.kind[i] !== T.GRASS) continue;
    const x = i % GRID, y = (i / GRID) | 0;
    if (!can(x, y, K.FIELD)) continue;
    let g = 0; for (const nb of ring8(i)) if (nb >= 0 && v.kind[nb] === T.GRASS) g++;
    if (g > bestScore) { bestScore = g; bestI = i; }
  }
  if (bestI < 0) { toast('no flat grass for a field'); return; }
  const fx = bestI % GRID, fy = (bestI / GRID) | 0;
  addPlacement(fx, fy, K.FIELD);
  for (const nb of ring8(bestI)) {
    if (nb >= 0) { const x = nb % GRID, y = (nb / GRID) | 0; if (can(x, y, K.COTTAGE)) { addPlacement(x, y, K.COTTAGE); break; } }
  }
  // a sawmill somewhere with forest neighbours, near-ish the field
  let mill = -1, ms = -1;
  for (let i = 0; i < TILES; i++) {
    const x = i % GRID, y = (i / GRID) | 0;
    if (!can(x, y, K.SAWMILL)) continue;
    let f = 0; for (const nb of ring8(i)) if (nb >= 0 && v.kind[nb] === T.FOREST) f++;
    if (f === 0) continue;
    const d = Math.abs(x - fx) + Math.abs(y - fy);
    const score = f * 10 - d;
    if (score > ms) { ms = score; mill = i; }
  }
  if (mill >= 0) addPlacement(mill % GRID, mill / GRID | 0, K.SAWMILL);
  toast('a starter hamlet — field first');
}

function updateHoverCard(mx, my) {
  const el = $('hovercard');
  if (state.mode !== 'plan' || state.hover == null || state.tool === 'erase') { el.style.display = 'none'; return; }
  const i = state.hover, x = i % GRID, y = (i / GRID) | 0;
  const err = placementError(state.valley, state.plan, { x, y, kind: state.tool, param: 0 });
  let line = '';
  const count = (t) => { let n = 0; for (const nb of ring8(i)) if (nb >= 0 && state.valley.kind[nb] === t) n++; return n; };
  if (err) line = err;
  else if (state.tool === K.FIELD) line = `${count(T.GRASS)} grass adjacent`;
  else if (state.tool === K.SAWMILL) line = `${count(T.FOREST)} forest adjacent`;
  else if (state.tool === K.QUARRY) line = `${count(T.ROCK)} rock adjacent`;
  else if (state.tool === K.MINE) line = `${count(T.ORE)} ore adjacent`;
  else { el.style.display = 'none'; return; }
  el.textContent = line;
  el.style.color = err ? P.red : P.soft;
  el.style.display = 'block';
  positionHoverCard(mx, my);
}
function positionHoverCard(mx, my) {
  const el = $('hovercard');
  el.style.left = `${mx + 16}px`; el.style.top = `${my - 8}px`;
}

function tick(t) {
  if (state.mode === 'watch' && state.playing && state.result) {
    if (!state.lastTick) state.lastTick = t;
    state.acc += t - state.lastTick;
    const perDay = state.speed === 4 ? 16 : 55;
    while (state.acc > perDay) {
      state.acc -= perDay;
      if (state.day < state.result.daysRun) {
        state.day++;
        $('scrub').value = state.day;
        renderCrown(); state.dirty = true;
      } else {
        state.playing = false;
        showResults();
        break;
      }
    }
  }
  state.lastTick = t;
  $('daylabel').textContent = state.mode === 'watch' ? `Day ${state.day} of ${HORIZON_DAYS}` : 'Planning';
  $('play').textContent = state.playing ? '❚❚' : '▶';
  if (state.dirty) { drawFrame(); state.dirty = false; }
  requestAnimationFrame(tick);
}
