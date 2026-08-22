// STEADING — the live kingdom client, simple rules edition.
// The loop in one breath: supplies build buildings · farms feed folk ·
// houses grow the town · folk pay tax · gold swaps to groats.
// sim.js still provides the valley generator (and the consensus-exact
// runSeason path bound to the Rust parity harness); the browser game runs
// SimpleSim below, tuned for clarity over consensus.
import {
  GRID, TILES, T, K,
  generateValley, idx, ring8, seedFromString,
} from './sim.js';

// ------------------------------------------------------------------ rules --
const YEAR_DAYS = 120;         // a year of the kingdom, at 1 day per second
const TAX_EVERY = 10;          // every 10th day the folk pay
const MAX_BUILD = 200;
const SWAP_GOLD = 50, SWAP_GROATS = 5;

// Everything a building is, in one row. Costs are paid when you place it.
const B = {
  [K.FIELD]:   { name: 'Farm',    wood: 3, stone: 0,  gold: 0, worker: 1, blurb: 'feeds 4 folk a day' },
  [K.COTTAGE]: { name: 'House',   wood: 4, stone: 0,  gold: 0, worker: 0, blurb: '+4 beds — fed folk move in' },
  [K.SAWMILL]: { name: 'Sawmill', wood: 5, stone: 0,  gold: 2, worker: 1, blurb: '+2 wood a day · build by the forest' },
  [K.QUARRY]:  { name: 'Quarry',  wood: 8, stone: 0,  gold: 3, worker: 1, blurb: '+2 stone a day · build by the rock' },
  [K.MARKET]:  { name: 'Market',  wood: 12, stone: 10, gold: 6, worker: 1, blurb: '+3 gold a day' },
};
const KIND_ORDER = [K.FIELD, K.COTTAGE, K.SAWMILL, K.QUARRY, K.MARKET];

class SimpleSim {
  constructor(valley, bonus = {}) {
    this.valley = valley;
    this.day = 0; this.year = 1;
    this.pop = 4 + (bonus.startPop || 0);
    this.baseBeds = 6 + (bonus.baseBeds || 0);
    this.food = 30 + (bonus.startFood || 0);
    this.wood = 14 + (bonus.startWood || 0);
    this.stone = 0 + (bonus.startStone || 0);
    this.gold = 10 + (bonus.startGold || 0);
    this.hap = 6; this.tax = 1; this.hungry = 0;
    this.fallen = null;            // 'starved' | 'left'
    this.famineToday = false;
    this.entries = [];             // {x, y, kind, built, builtDay}
    this.staff = [];
    this.occupied = new Int32Array(TILES).fill(-1);
  }

  capacity() {
    let beds = this.baseBeds;
    for (const e of this.entries) if (e.built && e.kind === K.COTTAGE) beds += 4;
    return beds;
  }

  restaff() {
    let free = this.pop;
    this.staff = this.entries.map((e) => {
      if (!e.built || !B[e.kind].worker || free <= 0) return 0;
      free -= 1; return 1;
    });
  }

  place(x, y, kind) {
    if (this.fallen) return 'the steading has fallen';
    if (this.entries.length >= MAX_BUILD) return 'the kingdom is at its limit';
    const t = idx(x, y);
    if (this.occupied[t] !== -1) return 'occupied';
    const c = B[kind];
    if (this.wood < c.wood) return `needs ${c.wood} wood`;
    if (this.stone < c.stone) return `needs ${c.stone} stone`;
    if (this.gold < c.gold) return `needs ${c.gold} gold`;
    this.wood -= c.wood; this.stone -= c.stone; this.gold -= c.gold;
    this.entries.push({ x, y, kind, built: false, builtDay: 0 });
    this.occupied[t] = this.entries.length - 1;
    this.restaff();
    return null;
  }

  demolish(x, y) {
    const i = this.occupied[idx(x, y)];
    if (i === -1) return null;
    const e = this.entries[i], c = B[e.kind];
    if (!e.built) { this.wood += c.wood; this.stone += c.stone; this.gold += c.gold; }
    else { this.wood += c.wood >> 1; this.stone += c.stone >> 1; this.gold += c.gold >> 1; }
    this.entries.splice(i, 1);
    this.occupied.fill(-1);
    for (let k = 0; k < this.entries.length; k++) this.occupied[idx(this.entries[k].x, this.entries[k].y)] = k;
    this.restaff();
    return e.kind;
  }

  setTax(r) { this.tax = r; }

  stepDay() {
    const ev = [];
    this.day++; this.famineToday = false;
    // one building rises each day, in the order you placed them (already paid)
    const q = this.entries.find((e) => !e.built);
    if (q) { q.built = true; q.builtDay = this.day; ev.push(`the ${B[q.kind].name.toLowerCase()} is raised`); }
    this.restaff();
    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i];
      if (!e.built || !this.staff[i]) continue;
      if (e.kind === K.FIELD) this.food += 4;
      else if (e.kind === K.SAWMILL) this.wood += 2;
      else if (e.kind === K.QUARRY) this.stone += 2;
      else if (e.kind === K.MARKET) this.gold += 3;
    }
    if (this.food >= this.pop) { this.food -= this.pop; this.hungry = 0; }
    else {
      this.food = 0; this.hungry++; this.famineToday = true;
      this.hap = Math.max(0, this.hap - 2);
      ev.push('the pantry is empty — the folk go hungry');
      if (this.hungry % 2 === 0 && this.pop > 0) { this.pop--; ev.push('a villager starves'); }
    }
    if (this.day % TAX_EVERY === 0) {
      const take = this.pop * this.tax;
      if (take > 0) { this.gold += take; ev.push(`tax day — ${take} gold from ${this.pop} folk`); }
      else ev.push('tax day — the low rate asks nothing, the folk are glad');
      if (this.tax === 0) this.hap = Math.min(10, this.hap + 1);
      if (this.tax === 2) this.hap = Math.max(0, this.hap - 2);
      if (this.hap <= 1 && this.pop > 0) { this.pop--; ev.push('a family slips away in the night — the tax bites too hard'); }
    }
    if (this.hungry === 0 && this.day % 5 === 0 && this.hap < 6) this.hap++;
    if (this.day % 3 === 0 && this.hungry === 0 && this.hap >= 4
        && this.food > this.pop * 2 && this.pop < this.capacity()) {
      this.pop++; ev.push('a newcomer settles — the kingdom grows');
    }
    this.restaff();
    let yearEnded = false;
    if (this.day % YEAR_DAYS === 0) { this.year++; yearEnded = true; ev.push(`year ${this.year} dawns over the valley`); }
    if (this.pop <= 0) this.fallen = this.hungry > 0 ? 'starved' : 'left';
    return { events: ev, yearEnded };
  }

  serialize() {
    const { day, year, pop, baseBeds, food, wood, stone, gold, hap, tax, hungry } = this;
    return JSON.stringify({ v: 2, day, year, pop, baseBeds, food, wood, stone, gold, hap, tax, hungry, entries: this.entries });
  }

  static restore(valley, json) {
    const d = JSON.parse(json);
    if (d.v !== 2) throw new Error('old save');
    const s = new SimpleSim(valley);
    for (const k of ['day', 'year', 'pop', 'baseBeds', 'food', 'wood', 'stone', 'gold', 'hap', 'tax', 'hungry']) s[k] = d[k];
    s.entries = d.entries;
    s.occupied.fill(-1);
    for (let k = 0; k < s.entries.length; k++) s.occupied[idx(s.entries[k].x, s.entries[k].y)] = k;
    s.restaff();
    return s;
  }
}

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
const WORLD_H = GRID * TH + 15 * HZ + SLAB + 90;
const OX = WORLD_W / 2, OY = 15 * HZ + 30;
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
  seedName: '', valley: null, sim: null,
  tool: K.FIELD,                 // building kind, or 'erase'
  playing: false, autoPaused: true, speed: 1,   // days per second
  cam: { x: 0, y: 0, z: 1 }, hover: null,
  lastTick: 0, acc: 0, dirty: true, saveCountdown: 0,
  log: [],
};

const $ = (id) => document.getElementById(id);
let cv, ctx, terrain, tctx, dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
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
  const f = 'rgba(58,49,40,0.16)';
  if (hAt(x, y - 1) > h) quad(c, [[cx, top - TH / 2], [cx + TW / 2, top], [cx + TW / 2 - 3, top + 1.6], [cx - 3, top - TH / 2 + 1.6]], f);
  if (hAt(x - 1, y) > h) quad(c, [[cx, top - TH / 2], [cx - TW / 2, top], [cx - TW / 2 + 3, top + 1.6], [cx + 3, top - TH / 2 + 1.6]], f);
}
function buildTerrain() {
  const R = 2;
  terrain = document.createElement('canvas');
  terrain.width = WORLD_W * R; terrain.height = WORLD_H * R;
  tctx = terrain.getContext('2d');
  tctx.scale(R, R);
  const c = tctx, v = state.valley;
  const occupied = new Set((state.sim ? state.sim.entries : []).map((e) => idx(e.x, e.y)));

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
      const L = [cx - TW / 2, top], Rt = [cx + TW / 2, top], Bq = [cx, top + TH / 2];
      const tc = topColor(i);
      for (const [a, b, f] of [[L, Bq, 0.8], [Bq, Rt, 0.92]]) {
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
        if (v.kind[i] === T.FOREST && !occupied.has(i)) drawTrees(c, x, y, cx, top);
      }
    }
  }
  state.dirty = true;
}

// --------------------------------------------------------- voxel sprites --
// Everything built on the island is composed from isometric cuboids on one
// shared voxel grid, so buildings carry real volume: stepped roofs, corner
// posts, raised crop beds, cube canopies. Local coordinates are tile units
// measured from the tile centre (a full tile spans -0.5..0.5 in x and y) and
// z counts terrain height units. Only three faces of a box can ever be seen
// — the top, the +x face on the right and the +y face on the left — so each
// box paints left, right, top and the painter's algorithm handles the rest.
const F_RIGHT = 0.86, F_LEFT = 0.70;

function vpt(cx, top, x, y, z) {
  return [cx + (x - y) * TW / 2, top + (x + y) * TH / 2 - z * HZ];
}

function vbox(c, cx, top, x, y, z, w, d, h, col) {
  const x1 = x + w, y1 = y + d, z1 = z + h;
  const p = (X, Y, Z) => vpt(cx, top, X, Y, Z);
  quad(c, [p(x, y1, z1), p(x1, y1, z1), p(x1, y1, z), p(x, y1, z)], shade(col, F_LEFT));
  quad(c, [p(x1, y, z1), p(x1, y1, z1), p(x1, y1, z), p(x1, y, z)], shade(col, F_RIGHT));
  quad(c, [p(x, y, z1), p(x1, y, z1), p(x1, y1, z1), p(x, y1, z1)], col);
}

// the soft contact shadow that sits a sprite on the ground
function vshadow(c, cx, top, r) {
  c.save();
  c.fillStyle = 'rgba(58,49,40,0.17)';
  c.beginPath();
  c.ellipse(cx, top + TH * 0.16, TW * r, TH * r * 0.86, 0, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

function drawTrees(c, x, y, cx, top) {
  const n = 1 + (jhash(x, y, 11) % 2);
  for (let k = 0; k < n; k++) {
    const ox = ((jhash(x, y, 20 + k) % 9) - 4) / 26;
    const oy = ((jhash(x, y, 30 + k) % 9) - 4) / 26;
    const s = 0.82 + (jhash(x, y, 40 + k) % 5) * 0.08;
    vtree(c, cx, top, ox, oy, s, jhash(x, y, 50 + k) % 3);
  }
}

// trunk, a chunky cube canopy, a smaller cube capping it
function vtree(c, cx, top, ox, oy, s, tint) {
  const tk = 0.10 * s;
  vbox(c, cx, top, ox - tk / 2, oy - tk / 2, 0, tk, tk, 0.60 * s, P.trunk);
  const w1 = 0.44 * s;
  vbox(c, cx, top, ox - w1 / 2, oy - w1 / 2, 0.46 * s, w1, w1, 0.60 * s,
    tint === 0 ? P.canopy : tint === 1 ? shade(P.canopy, 1.06) : shade(P.canopy, 0.94));
  const w2 = w1 * 0.60;
  vbox(c, cx, top, ox - w2 / 2, oy - w2 / 2, 1.02 * s, w2, w2, 0.42 * s, shade(P.canopyD, 1.10));
}

// A timber-framed house: plaster body, corner posts and a mid rail, then a
// stepped gable roof whose rows read as courses of thatch.
function vhouse(c, cx, top, o) {
  const k = o.k, w = 0.58 * k, x0 = -w / 2, base = 0.13 * k, bodyH = 1.85 * k;
  vshadow(c, cx, top, 0.40 * k);
  // a stone footing course grounds the building
  vbox(c, cx, top, x0 - 0.025, x0 - 0.025, 0, w + 0.05, w + 0.05, base, shade(P.rock, 1.02));
  vbox(c, cx, top, x0, x0, base, w, w, bodyH, o.wall);
  if (o.beams) {
    const pb = 0.055 * k, x1 = x0 + w - pb;
    for (const [bx, by] of [[x0, x1], [x1, x0], [x1, x1]]) {
      vbox(c, cx, top, bx, by, base, pb, pb, bodyH, P.beam);
    }
    const rz = base + bodyH * 0.54, rt = 0.085 * k;
    vbox(c, cx, top, x0, x1, rz, w, pb, rt, P.beam);
    vbox(c, cx, top, x1, x0, rz, pb, w, rt, P.beam);
  }
  if (o.door) {
    const dw = 0.16 * k;
    vbox(c, cx, top, -dw / 2, x0 + w - 0.03, base, dw, 0.06, 0.82 * k, '#4a3a2b');
  }
  // stepped gable: the ridge runs along x, so each course narrows in y
  const eave = 0.05 * k, rw = w + 2 * eave, rh = 0.30 * k;
  let z = base + bodyH;
  for (let s = 0; s < 3; s++) {
    const inset = s * (rw * 0.19), dd = rw - 2 * inset;
    if (dd <= 0.05) break;
    vbox(c, cx, top, x0 - eave, x0 - eave + inset, z, rw, dd, rh,
      s % 2 ? shade(o.roof, 0.96) : o.roof);
    z += rh;
  }
}

function drawBuilding(c, e) {
  const i = idx(e.x, e.y);
  const h = Math.max(state.valley.height[i], 1.6);
  const cx = sx(e.x, e.y), top = sy(e.x, e.y, h);
  switch (e.kind) {
    case K.FIELD: {
      // a raised bed: dark tilled soil, timber edging, rows of standing crop
      vbox(c, cx, top, -0.46, -0.46, 0, 0.92, 0.92, 0.16, '#7d5c3c');
      vbox(c, cx, top, 0.40, -0.46, 0.16, 0.06, 0.92, 0.10, P.beam);
      vbox(c, cx, top, -0.46, 0.40, 0.16, 0.92, 0.06, 0.10, P.beam);
      // rows alternate wheat and greens so a field reads as tended ground
      const CROP = [P.field, shade(P.field, 1.07), '#8fae5f', '#a8bf6a'];
      for (let gy = 0; gy < 4; gy++) {
        const row = (jhash(e.x, e.y, 70 + gy) % 2) ? 2 : 0;
        for (let gx = 0; gx < 4; gx++) {
          const px = -0.34 + gx * 0.22, py = -0.34 + gy * 0.22;
          const j = jhash(e.x * 4 + gx, e.y * 4 + gy, 12) % 5;
          vbox(c, cx, top, px, py, 0.16, 0.13, 0.13, 0.30 + j * 0.035, CROP[row + (j & 1)]);
        }
      }
      break;
    }
    case K.COTTAGE:
      vhouse(c, cx, top, { k: 1, wall: P.plaster, roof: P.thatch, beams: true, door: true });
      break;
    case K.MARKET: {
      vhouse(c, cx, top, { k: 1.2, wall: P.plaster, roof: P.awn2, beams: true, door: true });
      // a pale awning slung along the near eave, and the guild pennant
      vbox(c, cx, top, -0.30, 0.30, 1.15, 0.60, 0.14, 0.09, P.goldSoft);
      vbox(c, cx, top, 0.33, 0.33, 0, 0.045, 0.045, 3.5, P.beam);
      const pole = vpt(cx, top, 0.355, 0.33, 3.42);
      quad(c, [pole, [pole[0] + 8.5, pole[1] + 2], [pole[0], pole[1] + 4.4]], P.gold);
      break;
    }
    case K.SAWMILL: {
      vhouse(c, cx, top, { k: 1, wall: '#b39268', roof: '#9c6b42', beams: true, door: true });
      // cut timber stacked in the yard, on the near side where it can be seen
      for (const [lx, ly, lz] of [[-0.44, 0.24, 0], [-0.44, 0.36, 0], [-0.44, 0.30, 0.12]]) {
        vbox(c, cx, top, lx, ly, lz, 0.34, 0.11, 0.11, shade(P.trunk, 1.24));
      }
      break;
    }
    case K.QUARRY: {
      // a terraced cut in the rock with dressed blocks stacked ready to haul
      vshadow(c, cx, top, 0.44);
      vbox(c, cx, top, -0.46, -0.46, 0, 0.92, 0.92, 0.12, shade(P.rock, 1.08));
      vbox(c, cx, top, -0.42, -0.42, 0.12, 0.54, 0.54, 0.15, shade(P.rock, 0.90));
      vbox(c, cx, top, -0.38, -0.38, 0.27, 0.34, 0.34, 0.15, shade(P.rock, 0.76));
      vbox(c, cx, top, -0.30, -0.30, 0.30, 0.20, 0.20, 0.13, '#4f4a44');
      for (const [bx, by, bz] of [[0.08, 0.12, 0.12], [0.08, 0.12, 0.33], [0.08, -0.14, 0.12]]) {
        vbox(c, cx, top, bx, by, bz, 0.21, 0.21, 0.21, '#cbc4ba');
      }
      break;
    }
  }
}

function drawVillagers(c) {
  const sim = state.sim;
  for (let i = 0; i < sim.entries.length; i++) {
    const e = sim.entries[i], take = (sim.staff && sim.staff[i]) || 0;
    if (!e.built || take === 0) continue;
    const h = Math.max(state.valley.height[idx(e.x, e.y)], 1.6);
    const cx = sx(e.x, e.y), top = sy(e.x, e.y, h);
    for (let k = 0; k < Math.min(take, 2); k++) {
      const ox = ((jhash(e.x, k, 50) % 11) - 5) / 22, oy = 0.30 + ((jhash(k, e.y, 60) % 5) - 2) / 26;
      vbox(c, cx, top, ox - 0.045, oy - 0.045, 0, 0.09, 0.09, 0.40, '#6b5a46');
      vbox(c, cx, top, ox - 0.055, oy - 0.055, 0.40, 0.11, 0.11, 0.16, P.skin);
    }
  }
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
  ctx.drawImage(terrain, 0, 0, WORLD_W, WORLD_H);

  const order = state.sim.entries.slice().sort((a, b) => (a.x + a.y) - (b.x + b.y));
  for (const e of order) {
    if (e.built) drawBuilding(ctx, e);
    else {
      // a staked plot, paid for, waiting its build day
      const hh = Math.max(state.valley.height[idx(e.x, e.y)], 1.6);
      ctx.globalAlpha = 0.32;
      diamond(ctx, sx(e.x, e.y), sy(e.x, e.y, hh), P.goldDeep);
      ctx.globalAlpha = 1;
    }
  }
  drawVillagers(ctx);

  if (state.hover != null) {
    const i = state.hover, x = i % GRID, y = (i / GRID) | 0;
    const hh = Math.max(state.valley.height[i], 1.6);
    if (state.tool === 'erase') {
      ctx.globalAlpha = 0.5; diamond(ctx, sx(x, y), sy(x, y, hh), P.red); ctx.globalAlpha = 1;
    } else {
      const err = placementProblem(x, y, state.tool);
      ctx.globalAlpha = 0.55;
      diamond(ctx, sx(x, y), sy(x, y, hh), err ? P.red : '#e9f5d8');
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1.4 / z; ctx.strokeStyle = err ? P.red : P.canopyD;
      ctx.beginPath();
      const cx0 = sx(x, y), t0 = sy(x, y, hh);
      ctx.moveTo(cx0, t0 - TH / 2); ctx.lineTo(cx0 + TW / 2, t0); ctx.lineTo(cx0, t0 + TH / 2); ctx.lineTo(cx0 - TW / 2, t0);
      ctx.closePath(); ctx.stroke();
    }
  }
  ctx.restore();

  if (state.sim.famineToday) {
    const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.34, w / 2, h / 2, Math.max(w, h) * 0.62);
    vg.addColorStop(0, 'rgba(194,94,76,0)'); vg.addColorStop(1, 'rgba(194,94,76,0.30)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
  }
}

function countAdj(t, kind) {
  let n = 0;
  for (const nb of ring8(t)) if (nb >= 0 && state.valley.kind[nb] === kind) n++;
  return n;
}

function placementProblem(x, y, kind) {
  const t = idx(x, y), v = state.valley, sim = state.sim;
  if (sim.entries.length >= MAX_BUILD) return 'the kingdom is at its limit';
  if (sim.occupied[t] !== -1) return 'occupied';
  if (v.kind[t] === T.WATER) return 'open water';
  if (v.kind[t] === T.ROCK || v.kind[t] === T.ORE) return 'bare rock — build on grass';
  if (kind === K.SAWMILL && countAdj(t, T.FOREST) === 0) return 'needs forest beside it';
  if (kind === K.QUARRY && countAdj(t, T.ROCK) + countAdj(t, T.ORE) === 0) return 'needs rock beside it';
  const c = B[kind];
  if (sim.wood < c.wood) return `needs ${c.wood} wood`;
  if (sim.stone < c.stone) return `needs ${c.stone} stone`;
  if (sim.gold < c.gold) return `needs ${c.gold} gold`;
  return null;
}

// ------------------------------------------------------------------ input --
function pickTile(mx, my) {
  const { x: px, y: py, z } = state.cam;
  const wx = (mx - px) / z, wy = (my - py) / z;
  for (let h = 15; h >= 0; h--) {
    const A = (wx - OX) / (TW / 2);
    const Bv = (wy - OY + h * HZ) / (TH / 2);
    const x = Math.round((A + Bv) / 2), y = Math.round((Bv - A) / 2);
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

function centerOn(x, y, zoom) {
  const z = zoom || state.cam.z;
  const wx = sx(x, y), wy = sy(x, y, state.valley.height[idx(x, y)]);
  state.cam.z = z;
  state.cam.x = cv.clientWidth / 2 - wx * z;
  state.cam.y = cv.clientHeight / 2 - wy * z;
  state.dirty = true;
}

function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.style.opacity = '0'; }, 2100);
}

// ----------------------------------------------------------------- empire --
// Gold swaps to GROATS in the Empire panel. Groats persist across valleys
// and buy charters: permanent head starts for every later settlement. The
// swap to an on-chain token is the next milestone (research/14-spec-
// steading.md) and is deliberately not faked here.
const CHARTERS = [
  { id: 'granary', name: 'Granary Charter', cost: 30, blurb: '+15 starting food — a deeper pantry', opts: { startFood: 15 } },
  { id: 'timber', name: 'Timberwright Charter', cost: 30, blurb: '+10 starting wood', opts: { startWood: 10 } },
  { id: 'mason', name: 'Mason Charter', cost: 30, blurb: '+8 starting stone', opts: { startStone: 8 } },
  { id: 'purse', name: 'Purse Charter', cost: 30, blurb: '+12 starting gold', opts: { startGold: 12 } },
  { id: 'founders', name: 'Founders Charter', cost: 80, blurb: '+2 founding villagers, housed', opts: { startPop: 2, baseBeds: 2 } },
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
  startBonuses() {
    const owned = this.charters();
    const opts = {};
    for (const c of CHARTERS) {
      if (!owned.includes(c.id)) continue;
      for (const [k, v] of Object.entries(c.opts)) opts[k] = (opts[k] || 0) + v;
    }
    return opts;
  },
};

function renderEmpire() {
  $('em-groats').textContent = empire.groats();
  $('em-rank').textContent = `${empire.rank()} of the Guild`;
  $('em-lifetime').textContent = empire.lifetime();
  $('tb-groats').textContent = empire.groats();
  const swap = $('em-swap');
  swap.textContent = `Swap ${SWAP_GOLD} gold → ${SWAP_GROATS} ⟡`;
  swap.disabled = !state.sim || state.sim.gold < SWAP_GOLD;
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
        toast(`${c.name} sealed — every settlement to come starts stronger`);
        renderEmpire();
      };
    }
    row.appendChild(btn);
    list.appendChild(row);
  }
}

// -------------------------------------------------------------------- UI --
function costChips(k) {
  const c = B[k]; const bits = [];
  if (c.wood) bits.push(`${c.wood}w`);
  if (c.stone) bits.push(`${c.stone}s`);
  if (c.gold) bits.push(`<i>${c.gold}g</i>`);
  return bits.map((b) => `<span class="chip">${b}</span>`).join('');
}

function renderPalette() {
  const el = $('palette');
  el.innerHTML = '';
  for (const k of KIND_ORDER) {
    const d = document.createElement('div');
    d.className = 'pal' + (state.tool === k ? ' on' : '');
    d.innerHTML = `<span class="pname">${B[k].name}</span><span class="pcost">${costChips(k)}</span>`;
    d.title = B[k].blurb;
    d.onclick = () => { state.tool = k; renderPalette(); };
    el.appendChild(d);
  }
  const e = document.createElement('div');
  e.className = 'pal erase' + (state.tool === 'erase' ? ' on' : '');
  e.innerHTML = '<span class="pname">Demolish</span><span class="pcost"><span class="chip">½ back</span></span>';
  e.onclick = () => { state.tool = 'erase'; renderPalette(); };
  el.appendChild(e);
}

// The guided ladder that replaces a manual: each goal teaches the next rule.
const OBJECTIVES = [
  { text: 'Sow a farm', hint: 'each farm feeds 4 folk a day', test: (s) => builtCount(s, K.FIELD) >= 1 },
  { text: 'Raise a house', hint: '+4 beds — fed folk move in on their own', test: (s) => builtCount(s, K.COTTAGE) >= 1 },
  { text: 'A sawmill by the forest', hint: 'wood every day pays for new buildings', test: (s) => builtCount(s, K.SAWMILL) >= 1 },
  { text: 'Grow to 8 folk', hint: 'keep food ahead of mouths — sow more farms', test: (s) => s.pop >= 8 },
  { text: 'A quarry by the rock', hint: 'stone is what the market is built from', test: (s) => builtCount(s, K.QUARRY) >= 1 },
  { text: 'Open a market', hint: '12 wood, 10 stone, 6 gold — 3 gold a day back', test: (s) => builtCount(s, K.MARKET) >= 1 },
  { text: 'Grow to 14 folk', hint: 'every folk pays tax on the 10th day', test: (s) => s.pop >= 14 },
  { text: 'Hold 100 gold', hint: 'markets and tax, minus what you spend', test: (s) => s.gold >= 100 },
  { text: 'Swap gold for groats', hint: `${SWAP_GOLD} gold → ${SWAP_GROATS} ⟡ in the Empire panel, top right`, test: () => empire.lifetime() >= SWAP_GROATS },
  { text: 'Reach 20 folk', hint: 'a true kingdom on a small island', test: (s) => s.pop >= 20 },
];
function builtCount(sim, kind) {
  let n = 0; for (const e of sim.entries) if (e.built && e.kind === kind) n++;
  return n;
}

function renderObjectives() {
  const el = $('objectives');
  el.innerHTML = '';
  let shown = 0;
  for (const o of OBJECTIVES) {
    const done = o.test(state.sim);
    if (!done && shown >= 3) break;
    const row = document.createElement('div');
    row.className = 'obj' + (done ? ' done' : '');
    row.innerHTML = `<span class="ob-mark">${done ? '✓' : '◦'}</span><span class="ob-text">${o.text}${done ? '' : `<i>${o.hint}</i>`}</span>`;
    el.appendChild(row);
    if (!done) shown++;
  }
}

function pushLog(msgs, day) {
  for (const m of msgs) state.log.push({ day, m });
  if (state.log.length > 60) state.log.splice(0, state.log.length - 60);
  const el = $('log');
  el.innerHTML = state.log.slice(-14).map((l) => `<div class="lrow"><span>d${l.day}</span>${l.m}</div>`).join('');
  el.scrollTop = el.scrollHeight;
}

function meterHTML(v10, warm) {
  let cells = '';
  for (let i = 0; i < 10; i++) cells += `<span class="uc" style="background:${i < v10 ? warm : P.panelDeep}"></span>`;
  return cells;
}

function moodWord(h) {
  return h >= 8 ? 'joyful' : h >= 6 ? 'content' : h >= 4 ? 'uneasy' : h >= 2 ? 'grim' : 'about to leave';
}

function renderCrown() {
  const s = state.sim;
  $('c-gold').textContent = s.gold;
  $('c-folk').textContent = `${s.pop} / ${s.capacity()}`;
  $('c-food').textContent = s.food;
  $('c-wood').textContent = s.wood;
  $('c-stone').textContent = s.stone;
  $('c-hap').innerHTML = meterHTML(s.hap, s.hap >= 4 ? '#8fae5f' : '#c9884f');
  $('c-hap-n').textContent = `${s.hap} of 10 · ${moodWord(s.hap)}`;
  for (let r = 0; r <= 2; r++) $(`tax${r}`).classList.toggle('on', s.tax === r);
  $('b-year').textContent = `Year ${s.year} · Day ${(s.day % YEAR_DAYS) + 1}`;
  const untilTax = TAX_EVERY - (s.day % TAX_EVERY);
  $('b-tax').textContent = s.tax === 0 ? 'tax is set low — no gold, glad folk' : `tax in ${untilTax} day${untilTax === 1 ? '' : 's'} · +${s.pop * s.tax} gold`;
}

// ------------------------------------------------------------- game flow --
function seedKey(suffix) { return `steading:${state.seedName}:${suffix}`; }

function saveLive() { store.set(seedKey('simple'), state.sim.serialize()); }

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

function loadValley(name, fresh = false) {
  state.seedName = name;
  state.valley = generateValley(seedFromString(name));
  const saved = fresh ? null : store.get(seedKey('simple'));
  if (saved) {
    try { state.sim = SimpleSim.restore(state.valley, saved); }
    catch { state.sim = new SimpleSim(state.valley, empire.startBonuses()); }
  } else {
    state.sim = new SimpleSim(state.valley, empire.startBonuses());
  }
  state.log = [];
  state.playing = false;
  state.autoPaused = true;
  $('vname').textContent = prettyName(name);
  $('vseed').textContent = name.startsWith('daily-') ? `valley of the day · ${name.slice(6)}` : `seed · ${name}`;
  $('fallen').style.display = 'none';
  buildTerrain(); fitCamera();
  renderCrown(); renderObjectives(); renderEmpire();
  $('log').innerHTML = '';
  if (state.sim.day === 0) toast('time waits — place your first building to begin');
  try { location.hash = name === dailyName() ? '' : `v=${encodeURIComponent(name)}`; } catch { /* ignore */ }
}

function stepOnce() {
  const sim = state.sim;
  const { events } = sim.stepDay();
  if (events.length) pushLog(events, sim.day);
  if (sim.fallen) {
    state.playing = false;
    $('fal-head').textContent = sim.fallen === 'starved' ? 'The steading starved' : 'The folk walked away';
    $('fal-sub').textContent = sim.fallen === 'starved'
      ? 'Too few farms for too many mouths. Sow farms before all else.'
      : 'Hunger and a harsh tax emptied the valley. Rule a little more gently.';
    $('fallen').style.display = 'flex';
  }
  if (--state.saveCountdown <= 0) { saveLive(); state.saveCountdown = 5; }
  renderCrown(); renderObjectives();
  state.dirty = true;
}

function starterHamlet() {
  const v = state.valley, sim = state.sim;
  let bestI = -1, bestScore = -1;
  for (let i = 0; i < TILES; i++) {
    if (v.kind[i] !== T.GRASS) continue;
    const x = i % GRID, y = (i / GRID) | 0;
    if (placementProblem(x, y, K.FIELD)) continue;
    let g = 0; for (const nb of ring8(i)) if (nb >= 0 && v.kind[nb] === T.GRASS) g++;
    if (g > bestScore) { bestScore = g; bestI = i; }
  }
  if (bestI < 0) { toast('no open grass for a farm'); return; }
  const fx = bestI % GRID, fy = (bestI / GRID) | 0;
  sim.place(fx, fy, K.FIELD);
  for (const nb of ring8(bestI)) {
    if (nb >= 0) {
      const x = nb % GRID, y = (nb / GRID) | 0;
      if (!placementProblem(x, y, K.COTTAGE)) { sim.place(x, y, K.COTTAGE); break; }
    }
  }
  let mill = -1, ms = -1;
  for (let i = 0; i < TILES; i++) {
    const x = i % GRID, y = (i / GRID) | 0;
    if (placementProblem(x, y, K.SAWMILL)) continue;
    const f = countAdj(i, T.FOREST);
    if (f === 0) continue;
    const score = f * 10 - (Math.abs(x - fx) + Math.abs(y - fy));
    if (score > ms) { ms = score; mill = i; }
  }
  if (mill >= 0) sim.place(mill % GRID, (mill / GRID) | 0, K.SAWMILL);
  if (state.autoPaused) { state.playing = true; state.autoPaused = false; }
  toast('a starter hamlet — farm, house, sawmill');
  buildTerrain(); renderCrown(); state.dirty = true;
}

function updateHoverCard(mx, my) {
  const el = $('hovercard');
  if (state.hover == null || state.tool === 'erase') { el.style.display = 'none'; return; }
  const i = state.hover, x = i % GRID, y = (i / GRID) | 0;
  const err = placementProblem(x, y, state.tool);
  let line = '';
  if (err) line = err;
  else if (state.tool === K.SAWMILL) line = `${countAdj(i, T.FOREST)} forest beside it`;
  else if (state.tool === K.QUARRY) line = `${countAdj(i, T.ROCK) + countAdj(i, T.ORE)} rock beside it`;
  else { el.style.display = 'none'; return; }
  el.textContent = line;
  el.style.color = err ? P.red : P.soft;
  el.style.display = 'block';
  el.style.left = `${mx + 16}px`; el.style.top = `${my - 8}px`;
}

// ------------------------------------------------------------------- boot --
export function boot() {
  cv = $('cv'); ctx = cv.getContext('2d');
  renderPalette();

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
    if (t !== state.hover) { state.hover = t; state.dirty = true; }
    updateHoverCard(e.clientX - r.left, e.clientY - r.top);
  });
  cv.addEventListener('pointerup', (e) => {
    dragging = false;
    if (moved) return;
    const r = cv.getBoundingClientRect();
    const t = pickTile(e.clientX - r.left, e.clientY - r.top);
    if (t == null) return;
    const x = t % GRID, y = (t / GRID) | 0;
    if (state.tool === 'erase') {
      const gone = state.sim.demolish(x, y);
      if (gone != null) {
        if (state.valley.kind[t] === T.FOREST) buildTerrain();
        saveLive(); renderCrown(); state.dirty = true;
      }
    } else {
      const err = placementProblem(x, y, state.tool) || state.sim.place(x, y, state.tool);
      if (err) toast(err);
      else {
        if (state.valley.kind[t] === T.FOREST) buildTerrain();
        if (state.autoPaused) { state.playing = true; state.autoPaused = false; toast('the days begin to pass'); }
        saveLive(); renderCrown(); state.dirty = true;
      }
    }
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

  window.addEventListener('resize', fitCamera);

  $('play').onclick = () => { state.playing = !state.playing; state.autoPaused = false; };
  $('speed').onclick = () => {
    state.speed = state.speed === 1 ? 3 : state.speed === 3 ? 8 : 1;
    $('speed').textContent = `${state.speed}×`;
  };
  const TAX_WORD = ['low', 'fair', 'harsh'];
  for (let r = 0; r <= 2; r++) {
    $(`tax${r}`).onclick = () => {
      state.sim.setTax(r);
      pushLog([`the tax is set ${TAX_WORD[r]}`], state.sim.day);
      renderCrown();
    };
  }
  $('em-swap').onclick = () => {
    if (state.sim.gold < SWAP_GOLD) return;
    state.sim.gold -= SWAP_GOLD;
    empire.addGroats(SWAP_GROATS);
    pushLog([`${SWAP_GOLD} gold swapped for ${SWAP_GROATS} ⟡ groats`], state.sim.day);
    toast(`+${SWAP_GROATS} ⟡ — groats carry across every valley`);
    saveLive(); renderCrown(); renderObjectives(); renderEmpire();
  };
  $('btn-daily').onclick = () => loadValley(dailyName());
  $('btn-random').onclick = () => loadValley(`vale-${Math.random().toString(36).slice(2, 8)}`);
  $('btn-starter').onclick = starterHamlet;
  $('btn-raze').onclick = () => {
    store.del(seedKey('simple'));
    loadValley(state.seedName, true);
    toast('the valley is wild again');
  };
  $('btn-empire').onclick = () => { renderEmpire(); $('empire').style.display = 'flex'; };
  $('em-close').onclick = () => { $('empire').style.display = 'none'; };
  $('btn-help').onclick = () => { $('help').style.display = $('help').style.display === 'none' ? 'block' : 'none'; };
  $('help-close').onclick = () => { $('help').style.display = 'none'; };
  $('fal-raze').onclick = () => { store.del(seedKey('simple')); loadValley(state.seedName, true); };
  $('fal-new').onclick = () => loadValley(`vale-${Math.random().toString(36).slice(2, 8)}`);

  if (!store.get('steading:seen') && !/demo|plain|empire/.test(initialHash)) $('help').style.display = 'block';
  store.set('steading:seen', '1');
  if (/empire/.test(initialHash)) { renderEmpire(); $('empire').style.display = 'flex'; }

  // #sprites — one of every building, raised and staffed, for art review
  if (/sprites/.test(initialHash)) {
    const s = state.sim;
    s.wood = 999; s.stone = 999; s.gold = 999; s.pop = 12; s.baseBeds = 40; s.food = 999;
    const placed = [];
    for (const k of KIND_ORDER) {
      let best = -1, bd = 1e9;
      for (let t = 0; t < TILES; t++) {
        const x = t % GRID, y = (t / GRID) | 0;
        if (placementProblem(x, y, k)) continue;
        const d = placed.length
          ? Math.abs(x - placed[0][0]) + Math.abs(y - placed[0][1])
          : Math.abs(x - 32) + Math.abs(y - 32);
        if (d < bd && (!placed.length || d > 1)) { bd = d; best = t; }
      }
      if (best >= 0) {
        const x = best % GRID, y = (best / GRID) | 0;
        s.place(x, y, k); placed.push([x, y]);
      }
    }
    for (let d = 0; d < placed.length + 2; d++) stepOnce();
    state.playing = false;
    if (placed.length) centerOn(placed[0][0], placed[0][1], 3.2 * (zm ? parseFloat(zm[1]) : 1));
    buildTerrain();
  }

  if (/demo/.test(initialHash)) {
    starterHamlet();
    const days = +((/d=(\d+)/.exec(initialHash) || [0, 300])[1]);
    for (let k = 0; k < days && !state.sim.fallen; k++) stepOnce();
    state.playing = false;
    if (state.sim.entries.length) {
      const e0 = state.sim.entries[0];
      centerOn(e0.x, e0.y, Math.max(state.cam.z, 2.0));
    }
  }

  requestAnimationFrame(tick);
}

function tick(t) {
  if (state.playing && state.sim && !state.sim.fallen) {
    if (!state.lastTick) state.lastTick = t;
    state.acc += t - state.lastTick;
    const perDay = 1000 / state.speed;
    let steps = 0;
    while (state.acc > perDay && steps < 12) {
      state.acc -= perDay;
      stepOnce();
      steps++;
    }
  } else {
    state.acc = 0;
  }
  state.lastTick = t;
  $('play').textContent = state.playing ? '❚❚' : '▶';
  if (state.dirty) { drawFrame(); state.dirty = false; }
  requestAnimationFrame(tick);
}
