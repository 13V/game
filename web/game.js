// KINGDOM — the live client, simple rules edition.
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
// SimpleSim owns its own building ids past the consensus enum in sim.js.
const K_CHAPEL = 9;
const CHAPEL_EVERY = 4;        // days between a chapel lifting the mood
const FEST_COST = 20, FEST_HAP = 3, FEST_EVERY = 10;

// Four seasons to a year, and the last of them is hard: farms grow half as much
// through winter. Before this the game had no tension past the first week —
// food climbed forever and a surplus meant nothing. Now a surplus is the only
// thing that carries a town through thirty lean days.
const SEASON_DAYS = YEAR_DAYS / 4;
const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
const FARM_SUMMER = 4, FARM_WINTER = 2;

// Gold could only ever become groats, and wood could only ever come from a
// sawmill — so spending your last wood on farms was an unrecoverable dead end
// that the game never mentioned. A merchant will always sell you supplies.
const TRADE = [
  { id: 'wood', give: 12, get: 10, what: 'wood' },
  { id: 'stone', give: 20, get: 10, what: 'stone' },
];

const B = {
  [K.FIELD]:   { name: 'Farm',    wood: 3,  stone: 0,  gold: 0, worker: 1, blurb: 'grows 4 food a day' },
  [K.COTTAGE]: { name: 'House',   wood: 4,  stone: 0,  gold: 0, worker: 0, blurb: '4 beds · folk move in' },
  [K.SAWMILL]: { name: 'Sawmill', wood: 5,  stone: 0,  gold: 2, worker: 1, blurb: '+2 wood · by the forest' },
  [K.QUARRY]:  { name: 'Quarry',  wood: 8,  stone: 0,  gold: 3, worker: 1, blurb: '+2 stone · by the rock' },
  [K.MARKET]:  { name: 'Market',  wood: 12, stone: 10, gold: 6, worker: 1, blurb: '+3 gold a day' },
  [K.MINE]:    { name: 'Mine',    wood: 10, stone: 6,  gold: 5, worker: 1, blurb: '+4 gold · by the ore' },
  [K_CHAPEL]:  { name: 'Chapel',  wood: 6,  stone: 8,  gold: 4, worker: 0, blurb: '+1 mood every 4 days' },
};
const KIND_ORDER = [K.FIELD, K.COTTAGE, K.SAWMILL, K.QUARRY, K.MARKET, K.MINE, K_CHAPEL];

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
    this.hap = 6 + (bonus.startHap || 0); this.tax = 1; this.hungry = 0;
    this.fallen = null;            // 'starved' | 'left'
    this.famineToday = false;
    this.entries = [];             // {x, y, kind, built, builtDay}
    this.staff = [];
    this.occupied = new Int32Array(TILES).fill(-1);
    // reward bookkeeping: quests already paid for, and the high-water mark that
    // decides your rank — a famine costs you folk, never a rank you earned
    this.claimed = [];
    this.peakPop = this.pop;
    this.tierAt = 0;
    this.earned = 0;               // groats this valley has paid out
    this.festDay = -FEST_EVERY;    // last festival, so the first is free to hold
    this.feasts = 0;
  }

  season() { return Math.floor((this.day % YEAR_DAYS) / SEASON_DAYS); }
  isWinter() { return this.season() === 3; }
  farmYield() { return this.isWinter() ? FARM_WINTER : FARM_SUMMER; }
  winterIn() {
    const d = this.day % YEAR_DAYS;
    return d >= SEASON_DAYS * 3 ? 0 : SEASON_DAYS * 3 - d;
  }

  buy(id) {
    const t = TRADE.find((x) => x.id === id);
    if (this.gold < t.give) return `needs ${t.give} gold`;
    this.gold -= t.give;
    this[t.what] += t.get;
    return null;
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
    if (this.fallen) return 'the kingdom has fallen';
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

  // A festival is the one thing you can spend gold on to buy goodwill outright —
  // the counterweight that makes a harsh tax a choice rather than a mistake.
  festivalIn() { return Math.max(0, FEST_EVERY - (this.day - this.festDay)); }
  festival() {
    if (this.gold < FEST_COST) return `needs ${FEST_COST} gold`;
    if (this.festivalIn() > 0) return `the last feast was too recent`;
    this.gold -= FEST_COST;
    this.hap = Math.min(10, this.hap + FEST_HAP);
    this.festDay = this.day;
    return null;
  }

  stepDay() {
    const ev = [];
    let taxTake = 0, died = false;
    this.day++; this.famineToday = false;
    // one building rises each day, in the order you placed them (already paid)
    const q = this.entries.find((e) => !e.built);
    if (q) { q.built = true; q.builtDay = this.day; ev.push(`the ${B[q.kind].name.toLowerCase()} is raised`); }
    this.restaff();
    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i];
      if (!e.built || !this.staff[i]) continue;
      if (e.kind === K.FIELD) this.food += this.farmYield();
      else if (e.kind === K.SAWMILL) this.wood += 2;
      else if (e.kind === K.QUARRY) this.stone += 2;
      else if (e.kind === K.MARKET) this.gold += 3;
      else if (e.kind === K.MINE) this.gold += 4;
    }
    // chapels comfort the folk whatever else is happening
    if (this.day % CHAPEL_EVERY === 0) {
      let ch = 0;
      for (const e of this.entries) if (e.built && e.kind === K_CHAPEL) ch++;
      if (ch) this.hap = Math.min(10, this.hap + ch);
    }
    if (this.food >= this.pop) { this.food -= this.pop; this.hungry = 0; }
    else {
      this.food = 0; this.hungry++; this.famineToday = true;
      this.hap = Math.max(0, this.hap - 2);
      ev.push('the pantry is empty — the folk go hungry');
      if (this.hungry % 2 === 0 && this.pop > 0) { this.pop--; died = true; ev.push('a villager starves'); }
    }
    if (this.day % TAX_EVERY === 0) {
      const take = this.pop * this.tax;
      taxTake = take;
      if (take > 0) { this.gold += take; ev.push(`tax day — ${take} gold from ${this.pop} folk`); }
      else ev.push('tax day — the low rate asks nothing, the folk are glad');
      if (this.tax === 0) this.hap = Math.min(10, this.hap + 1);
      if (this.tax === 2) this.hap = Math.max(0, this.hap - 2);
      if (this.hap <= 1 && this.pop > 0) { this.pop--; died = true; ev.push('a family slips away in the night — the tax bites too hard'); }
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
    return { events: ev, yearEnded, taxTake, died };
  }

  serialize() {
    const { day, year, pop, baseBeds, food, wood, stone, gold, hap, tax, hungry, peakPop, tierAt, earned,
      festDay, feasts } = this;
    return JSON.stringify({ v: 3, day, year, pop, baseBeds, food, wood, stone, gold, hap, tax, hungry,
      peakPop, tierAt, earned, festDay, feasts, claimed: this.claimed, entries: this.entries });
  }

  // v2 saves predate the rewards; they load with an empty ledger, so a kingdom
  // begun before this collects its quest groats from where it stands.
  static restore(valley, json) {
    const d = JSON.parse(json);
    if (d.v !== 2 && d.v !== 3) throw new Error('old save');
    const s = new SimpleSim(valley);
    for (const k of ['day', 'year', 'pop', 'baseBeds', 'food', 'wood', 'stone', 'gold', 'hap', 'tax', 'hungry']) s[k] = d[k];
    s.claimed = d.claimed || [];
    s.peakPop = d.peakPop || d.pop;
    s.tierAt = d.tierAt || 0;
    s.earned = d.earned || 0;
    s.festDay = d.festDay == null ? -FEST_EVERY : d.festDay;
    s.feasts = d.feasts || 0;
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

const SNOW = '#eef4f4';
const TW = 22, TH = 11, HZ = 6, SLAB = 46;
// SKY_ROOM is a band of empty world above the island. Without it the highest
// peak reaches the top of the canvas and the sun has nowhere to be but on it.
const SKY_ROOM = 170;
const WORLD_W = GRID * TW + 40;
const WORLD_H = GRID * TH + 15 * HZ + SLAB + 90 + SKY_ROOM;
const OX = WORLD_W / 2, OY = 15 * HZ + 30 + SKY_ROOM;
const sx = (x, y) => OX + (x - y) * TW / 2;
const sy = (x, y, h) => OY + (x + y) * TH / 2 - h * HZ;

function jhash(x, y, s) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 2246822519)) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0; h = Math.imul(h, 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
function parseCol(col) {
  if (col[0] === '#') {
    const n = parseInt(col.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(col);
  return [+m[1], +m[2], +m[3]];
}
function shade(col, f) {
  const [r, g, b] = parseCol(col);
  return `rgb(${Math.min(255, Math.round(r * f))},${Math.min(255, Math.round(g * f))},${Math.min(255, Math.round(b * f))})`;
}
function mixCol(col, other, t) {
  const a = parseCol(col), b = parseCol(other);
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
}

// ------------------------------------------------------------------ state --
const state = {
  seedName: '', valley: null, sim: null,
  tool: K.FIELD,                 // building kind, or 'erase'
  playing: false, autoPaused: true, speed: 1,   // days per second
  cam: { x: 0, y: 0, z: 1 }, hover: null,
  phase: 0.16, skyBucket: -1,    // where the sun is: 0 sunrise, 0.25 noon, 0.75 midnight
  lastTick: 0, acc: 0, dirty: true, saveCountdown: 0,
  log: [],
};

const $ = (id) => document.getElementById(id);
let cv, ctx, terrain, tctx, legal = null, legalTool = null;
let dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

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
  const snow = (c, t) => (state.snow ? mixCol(c, SNOW, t) : c);
  if (k === T.WATER) return state.snow ? mixCol(P.water, '#cfe3ea', 0.42) : P.water;
  if (k === T.FOREST) return snow(shade(P.forest, j * lift), 0.42);
  if (k === T.ROCK) return snow(shade(P.rock, j * lift), 0.40);
  if (k === T.ORE) return snow(shade(P.oreT, j * lift), 0.34);
  return snow(shade((x & 1) === (y & 1) ? P.grass : P.grassHi, j * lift), 0.66);
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
  let leaf = tint === 0 ? P.canopy : tint === 1 ? shade(P.canopy, 1.06) : shade(P.canopy, 0.94);
  let cap = shade(P.canopyD, 1.10);
  if (state.snow) { leaf = mixCol(leaf, SNOW, 0.30); cap = mixCol(cap, SNOW, 0.62); }
  vbox(c, cx, top, ox - w1 / 2, oy - w1 / 2, 0.46 * s, w1, w1, 0.60 * s, leaf);
  const w2 = w1 * 0.60;
  vbox(c, cx, top, ox - w2 / 2, oy - w2 / 2, 1.02 * s, w2, w2, 0.42 * s, cap);
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
    // flush with the wall face, so it reads as an opening punched into the
    // wall rather than a block glued onto it
    const dw = 0.16 * k, dd = 0.06;
    vbox(c, cx, top, -dw / 2, x0 + w - dd, base, dw, dd, 0.82 * k, '#4a3a2b');
  }
  // stepped gable: the ridge runs along x, so each course narrows in y
  const eave = 0.085 * k, rw = w + 2 * eave, rh = 0.30 * k;
  let z = base + bodyH;
  for (let s = 0; s < (o.courses || 3); s++) {
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
      vshadow(c, cx, top, 0.48);
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
      const mk = 1.2;
      vhouse(c, cx, top, { k: mk, wall: P.plaster, roof: P.awn2, beams: true, door: true });
      // a pale awning slung under the near eave — every dimension scaled by mk
      // so it stays fixed to the building rather than floating at a literal z
      const az = 0.13 * mk + 1.85 * mk - 0.34 * mk;
      vbox(c, cx, top, -0.30 * mk, 0.29 * mk, az, 0.60 * mk, 0.15 * mk, 0.09 * mk, P.goldSoft);
      vbox(c, cx, top, 0.33, 0.33, 0, 0.045, 0.045, 3.5, P.beam);
      const pole = vpt(cx, top, 0.355, 0.33, 3.42);
      quad(c, [pole, [pole[0] + 8.5, pole[1] + 2], [pole[0], pole[1] + 4.4]], P.gold);
      break;
    }
    case K.SAWMILL: {
      // two roof courses and weathered grey planking, so a sawmill is not a
      // cottage in different paint at a glance
      vhouse(c, cx, top, { k: 1, wall: '#b39268', roof: '#93866f', beams: true, door: true, courses: 2 });
      // cut timber stacked in the yard, on the near side where it can be seen
      for (const [lx, ly, lz] of [[-0.44, 0.24, 0], [-0.44, 0.36, 0], [-0.44, 0.30, 0.12]]) {
        vbox(c, cx, top, lx, ly, lz, 0.34, 0.11, 0.11, shade(P.trunk, 1.24));
      }
      break;
    }
    case K.MINE: {
      // a timber headframe leaning over a black shaft, with the ore it pulls up
      vshadow(c, cx, top, 0.46);
      vbox(c, cx, top, -0.46, -0.46, 0, 0.92, 0.92, 0.10, shade(P.rock, 1.04));
      vbox(c, cx, top, -0.34, -0.34, 0.10, 0.48, 0.48, 0.05, '#3a3229');   // the shaft mouth
      for (const [bx, by] of [[-0.36, -0.36], [0.24, -0.36], [-0.36, 0.24], [0.24, 0.24]]) {
        vbox(c, cx, top, bx, by, 0.10, 0.12, 0.12, 1.55, P.beam);
      }
      vbox(c, cx, top, -0.36, -0.36, 1.65, 0.72, 0.12, 0.12, P.beam);
      vbox(c, cx, top, -0.36, 0.24, 1.65, 0.72, 0.12, 0.12, P.beam);
      vbox(c, cx, top, -0.30, -0.30, 1.77, 0.60, 0.60, 0.14, '#7d6b52');   // the winding house
      // a heap of ore beside the mouth, flecked with gold
      vbox(c, cx, top, 0.10, 0.30, 0.10, 0.30, 0.16, 0.16, shade(P.oreT, 1.06));
      vbox(c, cx, top, 0.17, 0.34, 0.26, 0.14, 0.09, 0.09, P.oreGlint);
      break;
    }
    case K_CHAPEL: {
      // pale dressed stone, a slate roof, and a spire that steps to a gilt cap
      vhouse(c, cx, top, { k: 1.06, wall: '#e7e0d1', roof: '#8d93a1', beams: false, door: true, courses: 4 });
      const sz = 0.13 * 1.06 + 1.85 * 1.06;
      vbox(c, cx, top, -0.13, -0.13, sz, 0.26, 0.26, 0.95, '#ded6c6');
      vbox(c, cx, top, -0.15, -0.15, sz + 0.95, 0.30, 0.30, 0.16, '#8d93a1');
      vbox(c, cx, top, -0.10, -0.10, sz + 1.11, 0.20, 0.20, 0.30, '#7e8492');
      vbox(c, cx, top, -0.055, -0.055, sz + 1.41, 0.11, 0.11, 0.26, P.gold);
      break;
    }
    case K.QUARRY: {
      // a terraced cut in the rock with dressed blocks stacked ready to haul
      vshadow(c, cx, top, 0.44);
      vbox(c, cx, top, -0.46, -0.46, 0, 0.92, 0.92, 0.12, shade(P.rock, 1.08));
      vbox(c, cx, top, -0.42, -0.42, 0.12, 0.54, 0.54, 0.15, shade(P.rock, 0.90));
      vbox(c, cx, top, -0.38, -0.38, 0.27, 0.34, 0.34, 0.15, shade(P.rock, 0.65));
      vbox(c, cx, top, -0.30, -0.30, 0.30, 0.20, 0.20, 0.13, '#4f4a44');
      for (const [bx, by, bz] of [[0.08, 0.12, 0.12], [0.08, 0.12, 0.33], [0.08, -0.14, 0.12]]) {
        vbox(c, cx, top, bx, by, bz, 0.21, 0.21, 0.21, '#cbc4ba');
      }
      break;
    }
  }
}

// ----------------------------------------------------------- sky and time --
// A simulated day is one second at 1x, far too fast to light a world by, so the
// sky keeps its own clock and ignores the speed control entirely: five minutes
// of daylight, five minutes of night, always. phase 0 is sunrise, 0.25 noon,
// 0.5 sunset, 0.75 midnight — the sun owns the first half, the moon the second.
const DAY_CYCLE = 600;

// The whole of night is one multiply pass over the finished frame: a colour of
// white leaves midday untouched, and every other hour is that colour darkening
// and tinting sky and island together, which is what dusk actually does. Only
// the things that make their own light — stars, moon, windows — are painted
// afterwards, and so stay bright against it.
const AMBIENT = [
  [0.00, '#caa08b'], [0.06, '#f2ddc6'], [0.13, '#ffffff'], [0.38, '#ffffff'],
  [0.44, '#f6c79b'], [0.50, '#d4855e'], [0.56, '#74698f'], [0.64, '#4a5590'],
  [0.88, '#454f86'], [0.96, '#8c7a95'], [1.00, '#caa08b'],
];
const NIGHTNESS = [
  [0.00, 0.42], [0.07, 0.05], [0.13, 0], [0.40, 0], [0.46, 0.16],
  [0.52, 0.55], [0.58, 0.90], [0.64, 1], [0.90, 1], [0.97, 0.60], [1.00, 0.42],
];

function rampAt(table, p) {
  for (let i = 1; i < table.length; i++) {
    if (p > table[i][0]) continue;
    const [p0, v0] = table[i - 1], [p1, v1] = table[i];
    return v0 + (v1 - v0) * ((p - p0) / (p1 - p0));
  }
  return table[table.length - 1][1];
}
function rgbOf(col) {
  const n = parseInt(col.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function colAt(table, p) {
  for (let i = 1; i < table.length; i++) {
    if (p > table[i][0]) continue;
    const [p0, c0] = table[i - 1], [p1, c1] = table[i];
    const t = (p - p0) / (p1 - p0), a = rgbOf(c0), b = rgbOf(c1);
    return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
  }
  return table[table.length - 1][1];
}
const nightAmount = () => rampAt(NIGHTNESS, state.phase);

// A box that is N tiles wide is NOT a cube at N units of z: a tile spans TW=22
// across but a height unit is only HZ=6 tall, so the same number in both makes
// a squashed slab. ZC is the conversion — z units per tile unit — that gives a
// box the classic isometric cube, as tall on screen as it is wide.
const ZC = TH / HZ;

function vcube(c, cx, cy, size, col) {
  const h = size * ZC;
  vbox(c, cx, cy, -size / 2, -size / 2, -h / 2, size, size, h, col);
}

// Sun and moon ride one shallow arc high over the island — a flat, high path
// rather than a horizon-to-horizon one, because a floating island has no
// horizon and they belong in the sky, not beside the land. Both are
// world-anchored, so clearance that holds at one zoom holds at every zoom.
const ARC_X = 640, ARC_Y = 160, ARC_CY = 250;

function bodyAt(theta) {
  return [OX + Math.cos(theta) * ARC_X, ARC_CY - Math.sin(theta) * ARC_Y];
}

// A body fades in as it climbs off its end of the arc, and again if it ever
// strays to the edge of the world box, where there is no horizon to hide behind.
function edgeFade(x) {
  return Math.max(0, Math.min(1, Math.min(x + 40, WORLD_W + 40 - x) / 120));
}

// The sky is one fixed gradient — blue overhead, warm down where the island
// floats — and the ambient multiply supplies the hour, so this holds the shape
// of a sky and never the time of day. Painting the hour here too would fight
// the multiply and end up muddy.
const SKY_TOP = '#9fd0ec', SKY_MID = '#cfe6f2', SKY_LOW = '#f3e7ce';

// Multiply can darken and tint but it cannot set the sky on fire, so dawn and
// dusk get an additive band low in the frame. It goes down before the island
// does, which keeps it a sky effect, and the multiply then deepens it to red.
const HORIZON = [
  [0.00, 0.95], [0.06, 1.00], [0.16, 0.22], [0.30, 0], [0.40, 0.35],
  [0.48, 1.00], [0.55, 0.80], [0.63, 0.18], [0.72, 0], [0.94, 0], [1.00, 0.95],
];

function drawSky(c, w, h, p) {
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, SKY_TOP); g.addColorStop(0.52, SKY_MID); g.addColorStop(1, SKY_LOW);
  c.fillStyle = g; c.fillRect(0, 0, w, h);

  const warm = rampAt(HORIZON, p);
  if (warm < 0.02) return;
  const b = c.createLinearGradient(0, h * 0.30, 0, h);
  b.addColorStop(0, 'rgba(255,150,60,0)');
  b.addColorStop(0.5, `rgba(255,146,58,${0.26 * warm})`);
  b.addColorStop(1, `rgba(255,112,46,${0.42 * warm})`);
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.fillStyle = b; c.fillRect(0, 0, w, h);
  c.restore();
}

// A couple of clouds, no more — clusters of white cubes drifting the width of
// the sky once per cycle. They are drawn before the ambient pass, so they take
// the hour for free: pink at dusk, slate at midnight.
// Puffs are offset along the anti-diagonal (oy = -ox), which is straight across
// the screen in this projection, so a cloud reads as one wide mass instead of a
// row of specks marching away into the distance. Listed back to front.
const PUFFS = [
  [[-2.4, 2.1, 0, 3.3], [2.6, -2.3, 0.05, 2.9], [0.2, -0.1, 0.55, 4.4]],
  [[-3.1, 2.7, 0, 2.9], [1.4, -1.2, 0.25, 3.5], [3.4, -3.1, 0, 2.5], [-0.9, 0.7, 0.5, 3.9]],
  [[-1.3, 1.1, 0, 3.0], [1.2, -1.0, 0.35, 3.7]],
];
const CLOUDS = [
  { x: 190, y: 104, s: 1.05, kind: 0 },
  { x: 830, y: 182, s: 0.80, kind: 2 },
  { x: 1290, y: 140, s: 1.20, kind: 1 },
];

// Clouds get their own gentler shading — vcube's face factors are tuned for
// solid objects on the ground and turn a white cloud into a heap of grey bricks.
function vpuff(c, cx, cy, size) {
  const h = size * ZC, x = -size / 2, y = -size / 2, z = -h / 2;
  const x1 = x + size, y1 = y + size, z1 = z + h;
  const q = (X, Y, Z) => vpt(cx, cy, X, Y, Z);
  quad(c, [q(x, y1, z1), q(x1, y1, z1), q(x1, y1, z), q(x, y1, z)], '#dfe7f2');
  quad(c, [q(x1, y, z1), q(x1, y1, z1), q(x1, y1, z), q(x1, y, z)], '#eef3fa');
  quad(c, [q(x, y, z1), q(x1, y, z1), q(x1, y1, z1), q(x, y1, z1)], '#ffffff');
}

function drawClouds(c, p) {
  const span = WORLD_W + 620;
  for (const cl of CLOUDS) {
    let cx = cl.x + p * span;
    cx = ((cx + 310) % span + span) % span - 310;
    for (const [ox, oy, oz, size] of PUFFS[cl.kind]) {
      const q = vpt(cx, cl.y, ox * cl.s, oy * cl.s, oz * cl.s);
      vpuff(c, q[0], q[1], size * cl.s);
    }
  }
}

function glowDisc(c, cx, cy, r, col, a) {
  const g = c.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, `rgba(${col},${a})`);
  g.addColorStop(0.34, `rgba(${col},${a * 0.30})`);
  g.addColorStop(0.62, `rgba(${col},${a * 0.07})`);
  g.addColorStop(1, `rgba(${col},0)`);
  c.fillStyle = g;
  c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
}

// The sun owns the first half of the cycle: one cube, four smaller cubes budding
// off its corners for rays, and a glow. Low sun burns red, high sun is pale gold.
function drawSun(c, p) {
  if (p > 0.5) return;
  const theta = Math.PI * (1 - p / 0.5);
  const s = Math.sin(theta);
  const [cx, cy] = bodyAt(theta);
  const a = Math.min(1, s * 3.2) * edgeFade(cx);
  if (a <= 0.01) return;
  // high sun is a clean orange, low sun deepens towards ember
  const low = 1 - Math.min(1, s * 1.4);
  const core = `rgb(${Math.round(247 - low * 24)},${Math.round(159 - low * 58)},${Math.round(60 - low * 22)})`;
  c.save();
  c.globalAlpha = a;
  c.globalCompositeOperation = 'lighter';
  glowDisc(c, cx, cy, 78, '255,168,74', 0.62);
  c.globalCompositeOperation = 'source-over';
  vcube(c, cx, cy, 3.2, core);
  c.restore();
}

// The moon owns the second half: a pale cube with craters lying flat in its lit
// top face, so it never reads as a lid sitting on a box.
function drawMoon(c, p) {
  if (p < 0.5) return;
  const theta = Math.PI * (1 - (p - 0.5) / 0.5);
  const s = Math.sin(theta);
  const [cx, cy] = bodyAt(theta);
  const a = Math.min(1, s * 3.2) * edgeFade(cx);
  if (a <= 0.01) return;
  c.save();
  c.globalAlpha = a;
  c.globalCompositeOperation = 'lighter';
  glowDisc(c, cx, cy, 82, '206,220,255', 0.46);
  c.globalCompositeOperation = 'source-over';
  const size = 2.7, top = size * ZC / 2;
  vcube(c, cx, cy, size, '#eef0fb');
  for (const [a1, b1, sz] of [[-1.02, -0.78, 0.80], [0.16, 0.30, 0.54], [-0.44, 0.52, 0.38]]) {
    face(c, cx, cy, [[a1, b1, top], [a1 + sz, b1, top], [a1 + sz, b1 + sz, top], [a1, b1 + sz, top]], '#c3c9e6');
  }
  c.restore();
}

// Stars sit in screen space rather than world space: they are the sky behind
// the diorama, not another thing standing on it, so panning must not drag them.
let starField = null;
function drawStars(c, w, h, night) {
  if (night < 0.05) return;
  if (!starField || starField.w !== w || starField.h !== h) {
    const pts = [];
    for (let i = 0; i < 86; i++) {
      pts.push({
        x: (jhash(i, 3, 91) % 10000) / 10000 * w,
        y: (jhash(i, 7, 41) % 10000) / 10000 * h * 0.66,
        r: 0.6 + (jhash(i, 11, 17) % 5) * 0.24,
        ph: (jhash(i, 13, 5) % 628) / 100,
      });
    }
    starField = { w, h, pts };
  }
  c.save();
  for (const s of starField.pts) {
    c.globalAlpha = night * (0.42 + 0.38 * Math.sin(state.phase * 34 + s.ph));
    c.fillStyle = '#f4f6ff';
    c.fillRect(s.x, s.y, s.r * 2, s.r * 2);
  }
  c.restore();
}

// -------------------------------------------------------- the cosy lights --
// Painted after the ambient pass, so they are the only thing in the frame that
// night does not touch: warm squares in the walls and a pool of lamplight on
// the ground under them.
const WARM = '#ffd489', WARM_HI = '#ffeec2';

function face(c, cx, top, pts, col) {
  quad(c, pts.map(([x, y, z]) => vpt(cx, top, x, y, z)), col);
}
// a window on the +y wall (the left-facing one)
function winY(c, cx, top, Y, x1, x2, z1, z2, col) {
  face(c, cx, top, [[x1, Y, z2], [x2, Y, z2], [x2, Y, z1], [x1, Y, z1]], col);
}
// a window on the +x wall (the right-facing one)
function winX(c, cx, top, X, y1, y2, z1, z2, col) {
  face(c, cx, top, [[X, y1, z2], [X, y2, z2], [X, y2, z1], [X, y1, z1]], col);
}

function houseLights(c, cx, top, k, night) {
  const w = 0.58 * k, x0 = -w / 2, wall = x0 + w + 0.002;
  const base = 0.13 * k, bodyH = 1.85 * k;
  const z1 = base + bodyH * 0.44, z2 = z1 + 0.34 * k, ww = 0.15 * k;
  const lit = night > 0.55 ? WARM_HI : WARM;
  // either side of the door on the near wall, one more on the right wall
  winY(c, cx, top, wall, x0 + 0.05 * k, x0 + 0.05 * k + ww, z1, z2, lit);
  winY(c, cx, top, wall, x0 + w - 0.05 * k - ww, x0 + w - 0.05 * k, z1, z2, lit);
  winX(c, cx, top, wall, x0 + 0.12 * k, x0 + 0.12 * k + ww, z1, z2, shade(lit, 0.88));
}

function drawLights(c, e, night) {
  const i = idx(e.x, e.y);
  const h = Math.max(state.valley.height[i], 1.6);
  const cx = sx(e.x, e.y), top = sy(e.x, e.y, h);

  c.save();
  c.globalCompositeOperation = 'lighter';
  c.globalAlpha = night;
  glowDisc(c, cx, top - 4, e.kind === K.MARKET ? 34 : 26, '255,178,88', 0.30);
  c.restore();

  c.save();
  c.globalAlpha = Math.min(1, night * 1.25);
  switch (e.kind) {
    case K.COTTAGE: houseLights(c, cx, top, 1, night); break;
    case K.SAWMILL: houseLights(c, cx, top, 1, night); break;
    case K.MARKET: houseLights(c, cx, top, 1.2, night); break;
    case K_CHAPEL: houseLights(c, cx, top, 1.06, night); break;
    case K.MINE:
      // a lamp hung on the headframe, and the brazier by the shaft
      vbox(c, cx, top, -0.06, -0.42, 1.30, 0.12, 0.12, 0.14, WARM_HI);
      vbox(c, cx, top, 0.24, -0.10, 0.10, 0.13, 0.13, 0.09, '#ff9d47');
      break;
    case K.FIELD:
      // a lantern hung on a post at the corner of the bed
      vbox(c, cx, top, 0.30, 0.30, 0.16, 0.05, 0.05, 0.44, '#4a3a2b');
      vbox(c, cx, top, 0.275, 0.275, 0.58, 0.10, 0.10, 0.12, WARM_HI);
      break;
    case K.QUARRY:
      // a brazier still burning on the cut face
      vbox(c, cx, top, -0.27, -0.27, 0.43, 0.14, 0.14, 0.09, '#ff9d47');
      break;
  }
  c.restore();
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
  drawSky(ctx, w, h, state.phase);

  const { x: px, y: py, z } = state.cam;
  ctx.save();
  ctx.translate(px, py); ctx.scale(z, z);
  drawClouds(ctx, state.phase);
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
  ctx.restore();

  // ---- the ambient pass: one multiply that puts sky and island in the same
  // hour. Everything painted from here down makes its own light.
  const night = nightAmount();
  const amb = colAt(AMBIENT, state.phase);
  if (amb !== 'rgb(255,255,255)') {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = amb;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  drawStars(ctx, w, h, night);

  ctx.save();
  ctx.translate(px, py); ctx.scale(z, z);
  drawSun(ctx, state.phase);
  drawMoon(ctx, state.phase);
  // Where you may build is drawn on this side of the ambient pass, so nightfall
  // never hides the one overlay you build by.
  if (state.tool !== 'erase') {
    if (!legal || legalTool !== state.tool) buildLegalOverlay();
    if (legal) ctx.drawImage(legal, 0, 0);
  }
  if (night > 0.08) {
    // each lamp is a fresh gradient, so skip the ones nobody can see
    for (const e of order) {
      if (!e.built) continue;
      const scr = px + sx(e.x, e.y) * z;
      if (scr < -70 || scr > w + 70) continue;
      const scry = py + sy(e.x, e.y, Math.max(state.valley.height[idx(e.x, e.y)], 1.6)) * z;
      if (scry < -90 || scry > h + 90) continue;
      drawLights(ctx, e, night);
    }
  }

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
  drawJuice(ctx);

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

// Legality splits in two on purpose. Where a building may stand depends only on
// the land and what is already built, so it can be cached and painted onto the
// map; whether you can pay for it changes every day, so it belongs on the build
// card instead of making the whole map flicker.
function terrainProblem(x, y, kind) {
  const t = idx(x, y), v = state.valley, sim = state.sim;
  if (sim.entries.length >= MAX_BUILD) return 'the kingdom is at its limit';
  if (sim.occupied[t] !== -1) return 'occupied';
  if (v.kind[t] === T.WATER) return 'open water';
  if (v.kind[t] === T.ROCK || v.kind[t] === T.ORE) return 'bare rock — build on grass';
  if (kind === K.SAWMILL && countAdj(t, T.FOREST) === 0) return 'needs forest beside it';
  if (kind === K.QUARRY && countAdj(t, T.ROCK) + countAdj(t, T.ORE) === 0) return 'needs rock beside it';
  if (kind === K.MINE && countAdj(t, T.ORE) === 0) return 'needs a seam of ore beside it';
  return null;
}

function affordProblem(kind) {
  const c = B[kind], sim = state.sim;
  if (sim.wood < c.wood) return `needs ${c.wood} wood`;
  if (sim.stone < c.stone) return `needs ${c.stone} stone`;
  if (sim.gold < c.gold) return `needs ${c.gold} gold`;
  return null;
}

function placementProblem(x, y, kind) {
  return terrainProblem(x, y, kind) || affordProblem(kind);
}

// A cached shade over every tile the selected building may NOT stand on, so
// "sawmills need forest" is something you see rather than something you read.
// Dimming the unavailable ground rather than tinting the available ground
// keeps the island's colour intact — most tiles are legal most of the time.
function buildLegalOverlay() {
  const tool = state.tool;
  legal = null;
  if (tool === 'erase' || !state.sim) return;
  const cv2 = document.createElement('canvas');
  cv2.width = WORLD_W; cv2.height = WORLD_H;
  const c = cv2.getContext('2d');
  c.globalAlpha = 0.34;
  for (let t = 0; t < TILES; t++) {
    const x = t % GRID, y = (t / GRID) | 0;
    const bad = terrainProblem(x, y, tool);
    // an occupied tile is already telling you it is taken, by having a
    // building on it — dimming it as well only muddies the town
    if (!bad || bad === 'occupied') continue;
    const hh = Math.max(state.valley.height[t], 1.6);
    diamond(c, sx(x, y), sy(x, y, hh), '#4a4034');
  }
  c.globalAlpha = 1;
  legal = cv2;
  legalTool = tool;
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

// -------------------------------------------------------------- the juice --
// A town that pays you should look like it is paying you. Three cheap effects
// carry all of it: numbers that lift off the building that earned them, a
// spray of gold when something big lands, and a banner that names the reward.
// All of it is drawn in screen space after the camera transform, so text stays
// legible at every zoom instead of shrinking with the island.
let floats = [], sparks = [], banner = null, banQueue = [];

function worldToScreen(x, y) {
  const h = Math.max(state.valley.height[idx(x, y)], 1.6);
  return [state.cam.x + sx(x, y) * state.cam.z, state.cam.y + sy(x, y, h) * state.cam.z];
}

function townTile() {
  const es = state.sim.entries;
  if (!es.length) return [GRID >> 1, GRID >> 1];
  let ax = 0, ay = 0;
  for (const e of es) { ax += e.x; ay += e.y; }
  return [Math.round(ax / es.length), Math.round(ay / es.length)];
}

function emitFloat(x, y, text, col) {
  if (floats.length > 44) return;
  floats.push({ x, y, text, col, t: 0 });
}

function burst(n) {
  const [px, py] = worldToScreen(...townTile());
  const cols = ['#e8c86a', '#b98a2e', '#f6efe1', '#d9ae56'];
  for (let i = 0; i < (n || 38); i++) {
    const a = Math.random() * Math.PI * 2, sp = 55 + Math.random() * 200;
    sparks.push({
      x: px, y: py, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 110,
      life: 0.85 + Math.random() * 0.8, t: 0, s: 2 + Math.random() * 3.4, col: cols[i & 3],
    });
  }
}

function celebrate(title, sub, groats) {
  banQueue.push({ title, sub, groats });
  if (!banner) nextBanner();
  pushLog([`${sub} — <b>+${groats} ⟡</b>`], state.sim.day);
  renderEmpire();
  flashGroats();
}

// the purse in the top bar jumps, so a payment is noticed even if the banner is
// missed at speed
function flashGroats() {
  const el = $('btn-empire');
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
}

function nextBanner() {
  const el = $('banner');
  const b = banQueue.shift();
  if (!b) { banner = null; el.classList.remove('show'); return; }
  banner = b;
  $('ban-title').textContent = b.title;
  $('ban-sub').textContent = b.sub;
  $('ban-reward').textContent = `+${b.groats} ⟡`;
  el.classList.add('show');
  clearTimeout(nextBanner._t);
  // stack up fast at 8× speed, so each one gets a shorter turn when queued
  nextBanner._t = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(nextBanner, 220);
  }, banQueue.length ? 900 : 2300);
}

function stepJuice(dt) {
  for (const f of floats) f.t += dt / 1.15;
  floats = floats.filter((f) => f.t < 1);
  for (const p of sparks) {
    p.t += dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 340 * dt;
  }
  sparks = sparks.filter((p) => p.t < p.life);
}

function drawJuice(c) {
  for (const p of sparks) {
    c.globalAlpha = Math.max(0, 1 - p.t / p.life);
    c.fillStyle = p.col;
    c.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
  }
  c.globalAlpha = 1;
  c.textAlign = 'center';
  c.font = "700 14px 'Alegreya Sans', 'Trebuchet MS', sans-serif";
  c.lineWidth = 3;
  c.strokeStyle = 'rgba(46,38,30,0.55)';
  for (const f of floats) {
    const [px, py] = worldToScreen(f.x, f.y);
    const y = py - 16 - f.t * 34;
    c.globalAlpha = f.t < 0.12 ? f.t / 0.12 : Math.min(1, (1 - f.t) / 0.42);
    c.strokeText(f.text, px, y);
    c.fillStyle = f.col;
    c.fillText(f.text, px, y);
  }
  c.globalAlpha = 1;
  c.textAlign = 'left';
}

// The day's earnings, lifting off the buildings that made them.
const YIELD_COL = { [K.FIELD]: '#cfe89a', [K.SAWMILL]: '#e2c08f', [K.QUARRY]: '#e4e0da', [K.MARKET]: '#f0d07a' };
const YIELD_TXT = { [K.FIELD]: '+4', [K.SAWMILL]: '+2', [K.QUARRY]: '+2', [K.MARKET]: '+3' };

function emitDayJuice(sim, taxTake, starved) {
  if (state.speed > 3) return;                 // at 8× it is a blizzard, not a reward
  for (let i = 0; i < sim.entries.length; i++) {
    const e = sim.entries[i];
    if (!e.built || !sim.staff[i] || !YIELD_TXT[e.kind]) continue;
    emitFloat(e.x, e.y, YIELD_TXT[e.kind], YIELD_COL[e.kind]);
  }
  if (taxTake > 0) {
    const [tx, ty] = townTile();
    emitFloat(tx, ty, `+${taxTake} gold`, '#f0d07a');
    burst();
  }
  if (starved) {
    const [tx, ty] = townTile();
    emitFloat(tx, ty, '−1 folk', '#ef9a86');
  }
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
  { id: 'almoner', name: 'Almoner Charter', cost: 140, blurb: '+2 starting happiness — folk arrive sooner', opts: { startHap: 2 } },
  { id: 'crown', name: 'Crown Charter', cost: 260, blurb: 'a founding town: +6 beds, +25 gold, +20 wood', opts: { baseBeds: 6, startGold: 25, startWood: 20 } },
  { id: 'quarrymen', name: 'Quarrymen Charter', cost: 200, blurb: '+18 starting stone — a market on day one', opts: { startStone: 18 } },
  { id: 'dynasty', name: 'Dynasty Charter', cost: 420, blurb: '+4 founding villagers, housed and fed', opts: { startPop: 4, baseBeds: 4, startFood: 20 } },
];
const RANKS = [[0, 'Apprentice'], [120, 'Journeyman'], [350, 'Master'], [700, 'Guildmaster']];

const empire = {
  groats: () => parseInt(store.get('kingdom:groats') || '0', 10),
  lifetime: () => parseInt(store.get('kingdom:lifetime') || '0', 10),
  addGroats(n) {
    store.set('kingdom:groats', String(this.groats() + n));
    store.set('kingdom:lifetime', String(this.lifetime() + n));
  },
  spend(n) { store.set('kingdom:groats', String(this.groats() - n)); },
  charters: () => { try { return JSON.parse(store.get('kingdom:charters') || '[]'); } catch { return []; } },
  ownCharter(id) {
    const c = this.charters(); c.push(id);
    store.set('kingdom:charters', JSON.stringify(c));
  },
  rank() {
    const l = this.lifetime();
    let r = RANKS[0][1];
    for (const [min, name] of RANKS) if (l >= min) r = name;
    return r;
  },
  bestEver: () => parseInt(store.get('kingdom:bestEver') || '0', 10),
  noteBest(n) { if (n > this.bestEver()) store.set('kingdom:bestEver', String(n)); },
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

// ----------------------------------------------------------------- wallet --
// Phantom injects its provider straight into the page, so connecting and
// signing are extension calls with no network behind them — they work here.
// What does NOT work here is everything past that: this page can reach no
// Solana RPC node, so it cannot read a balance and cannot send a transaction,
// and it says so rather than mocking one. The wallet's real job today is
// identity — it names the vault's owner, and the signature proves it.
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58(bytes) {
  const digits = [];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) { digits.push(carry % 58); carry = (carry / 58) | 0; }
  }
  let out = '';
  for (const byte of bytes) { if (byte === 0) out += '1'; else break; }
  for (let i = digits.length - 1; i >= 0; i--) out += B58[digits[i]];
  return out || '1';
}
const short = (a) => (a && a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a || '');

const wallet = {
  addr: null,
  err: null,
  provider() {
    // phantom.solana is the current entry point; window.solana is the legacy one
    const p = (window.phantom && window.phantom.solana) || window.solana;
    return p && typeof p.connect === 'function' ? p : null;
  },
  bound: () => store.get('kingdom:wallet') || null,
  claim() { try { return JSON.parse(store.get('kingdom:walletClaim') || 'null'); } catch { return null; } },

  async connect(silent) {
    const p = this.provider();
    if (!p) {
      this.err = 'no-provider';
      renderWallet();
      return;
    }
    try {
      const res = await p.connect(silent ? { onlyIfTrusted: true } : undefined);
      this.addr = (res && res.publicKey ? res.publicKey : p.publicKey).toString();
      this.err = null;
      store.set('kingdom:wallet', this.addr);
    } catch (e) {
      // 4001 is the user closing the popup — not an error worth shouting about
      if (!silent) this.err = (e && e.code === 4001) ? 'declined' : 'failed';
    }
    renderWallet();
  },

  async disconnect() {
    const p = this.provider();
    try { if (p && p.disconnect) await p.disconnect(); } catch { /* already gone */ }
    this.addr = null;
    renderWallet();
  },

  // A real ed25519 signature over a real payload, produced entirely offline.
  // This is the exact message the Anchor program will verify when the groat
  // token ships, which is why it is worth signing now rather than faking later.
  async sign() {
    const p = this.provider();
    if (!p || !this.addr) return;
    const body = [
      'KINGDOM — vault claim',
      `owner: ${this.addr}`,
      `groats: ${empire.lifetime()} minted lifetime`,
      `charters: ${empire.charters().join(',') || 'none'}`,
      `at: ${new Date().toISOString()}`,
    ].join('\n');
    try {
      const res = await p.signMessage(new TextEncoder().encode(body), 'utf8');
      const sig = b58(res.signature || res);
      const claim = { addr: this.addr, body, sig };
      store.set('kingdom:walletClaim', JSON.stringify(claim));
      toast('the vault is claimed — signed by your wallet');
      pushLog(['the vault is sealed under your wallet\'s signature'], state.sim.day);
      renderWallet();
      if (await remote.sync(claim)) {
        pushLog(['the vault is mirrored to the guild ledger'], state.sim.day);
        remote.fetchBoard();
        renderEmpire();
      }
    } catch (e) {
      if (!(e && e.code === 4001)) toast('the wallet would not sign');
    }
    renderWallet();
  },
};

// The vault syncs to a server only where one exists. The artifact build has no
// network egress at all, so every call here is wrapped and any failure falls
// silently back to localStorage — the game must never depend on a backend it
// may not have.
const remote = {
  ok: null,                       // null = untried, false = unreachable
  board: null,
  async post(path, body) {
    if (this.ok === false) return null;
    if (!/^https?:$/.test(location.protocol)) { this.ok = false; return null; }
    try {
      const r = await fetch(path, body
        ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
        : undefined);
      if (!r.ok) { if (r.status === 503) this.ok = false; return null; }
      this.ok = true;
      return await r.json();
    } catch { this.ok = false; return null; }
  },

  // Merge rather than overwrite: a player who plays on a laptop and a phone
  // should end up with the better of the two vaults, never the older one.
  async sync(claim) {
    const local = {
      groats: empire.groats(), lifetime: empire.lifetime(),
      charters: empire.charters(), best_pop: empire.bestEver(),
    };
    const res = await this.post('/api/vault', {
      address: claim.addr, message: claim.body, signature: claim.sig, vault: local,
    });
    if (!res || !res.vault) return false;
    const v = res.vault;
    if (v.lifetime > local.lifetime || v.groats > local.groats) {
      store.set('kingdom:groats', String(Math.max(local.groats, v.groats)));
      store.set('kingdom:lifetime', String(Math.max(local.lifetime, v.lifetime)));
      const merged = [...new Set([...local.charters, ...(v.charters || [])])];
      store.set('kingdom:charters', JSON.stringify(merged));
      toast('vault restored from your wallet');
    }
    return true;
  },

  async fetchBoard() {
    const res = await this.post('/api/vault?board=1');
    this.board = res && res.board ? res.board : null;
    renderBoard();
  },
};

function renderBoard() {
  const el = $('board');
  if (!el) return;
  if (!remote.board || !remote.board.length) { el.innerHTML = ''; return; }
  el.innerHTML = '<div class="wsec">GREATEST VAULTS</div>'
    + remote.board.slice(0, 8).map((r, i) => `<div class="brow"><span>${i + 1}</span>`
      + `<b${r.address === wallet.addr ? ' class="me"' : ''}>${short(r.address)}</b>`
      + `<em>${r.lifetime} ⟡</em><i>${r.best_pop} folk</i></div>`).join('');
}

function renderWallet() {
  const btn = $('btn-wallet'), box = $('wallet-body');
  const has = !!wallet.provider();
  btn.textContent = wallet.addr ? short(wallet.addr) : 'Connect wallet';
  btn.classList.toggle('on', !!wallet.addr);
  if (!box) return;

  if (!has) {
    box.innerHTML = '<div class="wnote"><b>No Solana wallet is reachable from this page.</b>'
      + ' Phantom injects itself into the page it runs in — install the extension and reload,'
      + ' and if you are reading this inside another site\'s frame, open the page directly.</div>';
    return;
  }
  if (!wallet.addr) {
    const why = wallet.err === 'declined' ? 'You closed the wallet popup. Try again when ready.'
      : wallet.err === 'failed' ? 'The wallet refused the connection.'
      : 'Name the owner of this vault. Nothing leaves your browser.';
    box.innerHTML = `<button class="wbtn" id="w-connect">Connect Phantom</button><div class="wnote">${why}</div>`;
    $('w-connect').onclick = () => wallet.connect(false);
    return;
  }
  const cl = wallet.claim();
  const signed = cl && cl.addr === wallet.addr;
  box.innerHTML = `<div class="waddr"><b>${short(wallet.addr)}</b><span>connected</span>`
    + '<button class="wlink" id="w-off">disconnect</button></div>'
    + (signed
      ? `<div class="wsig"><b>Vault claimed</b><code>${cl.sig.slice(0, 22)}…</code>`
        + '<span>a real ed25519 signature over your groat balance, made offline by your wallet</span></div>'
      : '<button class="wbtn" id="w-sign">Sign the vault claim</button>'
        + '<div class="wnote">Signs a message naming this address as the vault\'s owner. No transaction, no fee.</div>');
  $('w-off').onclick = () => wallet.disconnect();
  if (!signed) $('w-sign').onclick = () => wallet.sign();
  if (signed) {
    const again = document.createElement('button');
    again.className = 'wlink';
    again.style.cssText = 'margin-top:6px;display:block;margin-left:auto;';
    again.textContent = 'sync vault again';
    again.onclick = () => wallet.sign();
    box.appendChild(again);
  }
}

function renderEmpire() {
  renderWallet();
  $('em-groats').textContent = empire.groats();
  $('em-rank').textContent = `${empire.rank()} of the Guild`;
  $('em-lifetime').textContent = empire.lifetime();
  $('tb-groats').textContent = empire.groats();
  const best = parseInt(store.get(seedKey('best')) || '0', 10);
  $('em-best').textContent = best ? `greatest here · ${best} folk` : 'no kingdom here yet';
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
// One set of icons for the whole interface: the same wheat sheaf marks the FOOD
// readout at the top and the cost of a farm in the build list, so reading a
// price never means looking a letter code up somewhere else.
const ICON = {
  food: '<path d="M8 15.2V7.2" stroke="#6f8a3f" stroke-width="1.7" stroke-linecap="round" fill="none"/>'
      + '<ellipse cx="8" cy="4.1" rx="2.05" ry="3.1" fill="#d9ae56"/>'
      + '<ellipse cx="4.5" cy="7.6" rx="1.65" ry="2.5" transform="rotate(-32 4.5 7.6)" fill="#c2913a"/>'
      + '<ellipse cx="11.5" cy="7.6" rx="1.65" ry="2.5" transform="rotate(32 11.5 7.6)" fill="#c2913a"/>',
  wood: '<rect x="1.4" y="4.6" width="13.2" height="6.8" rx="3.4" fill="#8a6440"/>'
      + '<ellipse cx="4.6" cy="8" rx="2.7" ry="3.4" fill="#a87c50"/>'
      + '<ellipse cx="4.6" cy="8" rx="1.1" ry="1.5" fill="#795536"/>',
  stone: '<path d="M8 1.9l6.1 3.3L8 8.5 1.9 5.2z" fill="#c3bdb5"/>'
       + '<path d="M14.1 5.2v5.6L8 14.1V8.5z" fill="#9c948a"/>'
       + '<path d="M1.9 5.2v5.6L8 14.1V8.5z" fill="#847e77"/>',
  gold: '<circle cx="8" cy="8" r="6.1" fill="#d9a93c"/>'
      + '<circle cx="8" cy="8" r="6.1" fill="none" stroke="#96690f" stroke-width="1.1"/>'
      + '<circle cx="8" cy="8" r="2.4" fill="#f0d07a"/>',
  folk: '<circle cx="8" cy="4.4" r="2.7" fill="#d8b48c"/>'
      + '<path d="M2.7 14.6c0-3.2 2.4-5.3 5.3-5.3s5.3 2.1 5.3 5.3z" fill="#6b5a46"/>',
};
function icon(name, px) {
  return `<svg viewBox="0 0 16 16"${px ? ` style="width:${px}px;height:${px}px"` : ''}>${ICON[name]}</svg>`;
}

// What the kingdom gains or loses each day, at today's staffing. Mirrors the
// production step of stepDay exactly — this is the number that teaches the
// whole game, so it must never drift from the rules.
function rates(s) {
  const r = { food: 0, wood: 0, stone: 0, gold: 0 };
  for (let i = 0; i < s.entries.length; i++) {
    const e = s.entries[i];
    if (!e.built || !s.staff[i]) continue;
    if (e.kind === K.FIELD) r.food += s.farmYield();
    else if (e.kind === K.SAWMILL) r.wood += 2;
    else if (e.kind === K.QUARRY) r.stone += 2;
    else if (e.kind === K.MARKET) r.gold += 3;
    else if (e.kind === K.MINE) r.gold += 4;
  }
  r.food -= s.pop;                       // every villager eats one a day
  return r;
}

// Buildings that are up but have nobody to work them produce nothing. That was
// the one rule with no visible sign at all, so it gets counted and said aloud.
function idleCount(s) {
  let n = 0;
  for (let i = 0; i < s.entries.length; i++) {
    const e = s.entries[i];
    if (e.built && B[e.kind].worker && !s.staff[i]) n++;
  }
  return n;
}
function countKind(s, kind) {
  let n = 0; for (const e of s.entries) if (e.kind === kind) n++;
  return n;
}

// ------------------------------------------------------------- build list --
const palNodes = [];

function costHTML(k) {
  const c = B[k], s = state.sim, bits = [];
  const add = (n, ic, have) => { if (n) bits.push(`<span class="cc${s && have < n ? ' short' : ''}">${icon(ic, 12)}${n}</span>`); };
  add(c.wood, 'wood', s ? s.wood : 0);
  add(c.stone, 'stone', s ? s.stone : 0);
  add(c.gold, 'gold', s ? s.gold : 0);
  return bits.join('');
}

function renderPalette() {
  const el = $('palette');
  el.innerHTML = '';
  palNodes.length = 0;
  KIND_ORDER.forEach((k, n) => {
    const d = document.createElement('button');
    d.className = 'pal';
    d.innerHTML = `<span class="pk">${n + 1}</span>`
      + `<span class="pmid"><b>${B[k].name}</b><i>${B[k].blurb}</i></span>`
      + `<span class="pcost"></span>`;
    d.onclick = () => selectTool(k);
    el.appendChild(d);
    palNodes.push({ kind: k, el: d });
  });
  const e = document.createElement('button');
  e.className = 'pal erase';
  e.innerHTML = '<span class="pk">X</span>'
    + '<span class="pmid"><b>Demolish</b><i>half the supplies come back</i></span>'
    + '<span class="pcost"></span>';
  e.onclick = () => selectTool('erase');
  el.appendChild(e);
  palNodes.push({ kind: 'erase', el: e });
  syncPalette();
}

// Selection and affordability change constantly; the cards themselves do not.
// Rebuild the text once and only re-paint the state, so hovering a card never
// has the ground shift under the cursor.
function syncPalette() {
  for (const p of palNodes) {
    p.el.classList.toggle('on', state.tool === p.kind);
    if (p.kind === 'erase') continue;
    const poor = state.sim ? !!affordProblem(p.kind) : false;
    p.el.classList.toggle('poor', poor);
    // a farm card promising 4 food through a winter that gives 2 is a lie the
    // player pays for, so the blurb follows the season
    if (p.kind === K.FIELD && state.sim) {
      const note = p.el.querySelector('.pmid i');
      const txt = state.sim.isWinter() ? 'grows 2 a day — winter' : 'grows 4 food a day';
      if (note.textContent !== txt) note.textContent = txt;
    }
    const cost = costHTML(p.kind);
    const slot = p.el.lastElementChild;
    if (slot.innerHTML !== cost) slot.innerHTML = cost;
  }
}

function selectTool(k) {
  state.tool = k;
  legal = null;
  syncPalette();
  state.dirty = true;
}

// --------------------------------------------------------------- merchant --
// Gold could only ever become groats and wood could only ever come from a
// sawmill, so spending your last wood on farms was a dead end the game never
// mentioned: a run could sit at 1 wood and 500 gold forever. A merchant is
// always at the gate, and gold now has a second job.
let tradeNodes = [];
function renderTrade() {
  const el = $('trade');
  if (!tradeNodes.length) {
    el.innerHTML = '';
    for (const t of TRADE) {
      const b = document.createElement('button');
      b.className = 'tbtn';
      b.innerHTML = `<b>+${t.get} ${t.what}</b><span>${t.give} gold</span>`;
      b.onclick = () => {
        const err = state.sim.buy(t.id);
        if (err) { toast(err); return; }
        pushLog([`the merchant sells ${t.get} ${t.what} for ${t.give} gold`], state.sim.day);
        toast(`+${t.get} ${t.what}`);
        saveLive(); renderCrown(); renderNext(); state.dirty = true;
      };
      el.appendChild(b);
      tradeNodes.push({ t, el: b });
    }
  }
  for (const n of tradeNodes) n.el.disabled = state.sim.gold < n.t.give;
}

// ------------------------------------------------------------- the ladder --
// Each quest teaches exactly one rule, in the order the rules start to matter,
// and every one of them pays. Groats are the thread that ties a single valley
// to the whole empire, so the teaching ladder and the reward ladder are the
// same ladder — you are never learning for free.
const QUESTS = [
  { id: 'farm', text: 'Sow a farm', reward: 8, hint: 'a farm grows 4 food a day · everyone eats 1',
    test: (s) => builtCount(s, K.FIELD) >= 1 },
  { id: 'house', text: 'Raise a house', reward: 8, hint: '4 more beds — well-fed folk move in on their own',
    test: (s) => builtCount(s, K.COTTAGE) >= 1 },
  { id: 'mill', text: 'Cut wood at a sawmill', reward: 10, hint: 'place it beside the forest · 2 wood a day, forever',
    test: (s) => builtCount(s, K.SAWMILL) >= 1 },
  { id: 'pop8', text: 'Grow to 8 folk', reward: 12, hint: 'keep food climbing and a bed free',
    test: (s) => s.pop >= 8, prog: (s) => [s.pop, 8] },
  { id: 'quarry', text: 'Cut stone at a quarry', reward: 12, hint: 'place it beside the rock · the market is built of stone',
    test: (s) => builtCount(s, K.QUARRY) >= 1 },
  { id: 'market', text: 'Open a market', reward: 18, hint: '3 gold a day, every day',
    test: (s) => builtCount(s, K.MARKET) >= 1 },
  { id: 'chapel', text: 'Build a chapel', reward: 20, hint: 'it lifts the mood by 1 every 4 days — the answer to a harsh tax',
    test: (s) => builtCount(s, K_CHAPEL) >= 1 },
  { id: 'pop14', text: 'Grow to 14 folk', reward: 20, hint: 'every villager pays your tax on the 10th day',
    test: (s) => s.pop >= 14, prog: (s) => [s.pop, 14] },
  { id: 'mine', text: 'Sink a mine on a seam of ore', reward: 25, hint: 'the gold flecks in the grey rock · 4 gold a day',
    test: (s) => builtCount(s, K.MINE) >= 1 },
  { id: 'feast', text: 'Hold a festival', reward: 15, hint: `${FEST_COST} gold for ${FEST_HAP} happiness — the button under the tax`,
    test: (s) => s.feasts >= 1 },
  { id: 'gold100', text: 'Hold 100 gold', reward: 22, hint: 'markets, mines and tax, minus what you spend',
    test: (s) => s.gold >= 100, prog: (s) => [s.gold, 100] },
  { id: 'farms5', text: 'Sow five farms', reward: 20, hint: 'a kingdom is only ever as big as its pantry',
    test: (s) => builtCount(s, K.FIELD) >= 5, prog: (s) => [builtCount(s, K.FIELD), 5] },
  { id: 'swap', text: 'Swap gold for ⟡ groats', reward: 15, hint: `${SWAP_GOLD} gold buys ${SWAP_GROATS} ⟡ in the Empire, top right`,
    test: () => empire.lifetime() >= SWAP_GROATS },
  { id: 'pop20', text: 'Reach 20 folk', reward: 35, hint: 'a true kingdom on one small island',
    test: (s) => s.pop >= 20, prog: (s) => [s.pop, 20] },
  { id: 'winter', text: 'Carry the kingdom through a winter', reward: 30,
    hint: 'thirty lean days · farms grow half as much, so stockpile before it lands',
    test: (s) => s.year > 1 || (s.day % YEAR_DAYS) >= YEAR_DAYS - 1 },
  { id: 'joy', text: 'Keep the folk joyful', reward: 30, hint: 'happiness at 9 — chapels, festivals and a full pantry',
    test: (s) => s.hap >= 9, prog: (s) => [s.hap, 9] },
  { id: 'gold300', text: 'Hold 300 gold', reward: 40, hint: 'enough to buy a charter outright',
    test: (s) => s.gold >= 300, prog: (s) => [s.gold, 300] },
  { id: 'pop26', text: 'Reach 26 folk', reward: 45, hint: 'more beds, more workers, more of everything',
    test: (s) => s.pop >= 26, prog: (s) => [s.pop, 26] },
];

// Past the written ladder the chase never runs out: every further ten folk is
// another quest, generated on demand, so there is always one more thing to want.
function endlessQuest(s) {
  const target = Math.max(30, Math.floor(s.peakPop / 10) * 10 + 10);
  return {
    id: `pop${target}`, text: `Reach ${target} folk`, reward: 25 + (target - 30),
    hint: 'the kingdom keeps growing as long as you feed it',
    test: (t) => t.pop >= target, prog: (t) => [t.pop, target],
  };
}
function nextQuest(s) {
  for (const q of QUESTS) if (!s.claimed.includes(q.id)) return q;
  return endlessQuest(s);
}

// A settlement earns a rank from the most folk it has ever held, so a famine
// costs you villagers but never a title you already won.
const TIERS = [
  { pop: 0, name: 'Camp', reward: 0 },
  { pop: 6, name: 'Hamlet', reward: 10 },
  { pop: 10, name: 'Village', reward: 20 },
  { pop: 16, name: 'Town', reward: 35 },
  { pop: 24, name: 'City', reward: 60 },
  { pop: 34, name: 'Kingdom', reward: 120 },
];

function builtCount(sim, kind) {
  let n = 0; for (const e of sim.entries) if (e.built && e.kind === kind) n++;
  return n;
}

// Everything that pays out runs through here, once per day and once per action
// that could complete something. Debug fragments fabricate kingdoms, so they
// advance the rank for display but are never allowed to mint groats.
function checkRewards() {
  const s = state.sim, quiet = !!state.quiet;
  if (s.pop > s.peakPop) s.peakPop = s.pop;

  for (let pass = 0; pass < 4; pass++) {
    const q = nextQuest(s);
    if (!q.test(s)) break;
    s.claimed.push(q.id);
    if (quiet) continue;
    s.earned += q.reward;
    empire.addGroats(q.reward);
    celebrate('QUEST COMPLETE', q.text, q.reward);
    burst(14);
  }

  while (s.tierAt + 1 < TIERS.length && s.peakPop >= TIERS[s.tierAt + 1].pop) {
    s.tierAt++;
    const t = TIERS[s.tierAt];
    if (quiet) continue;
    s.earned += t.reward;
    empire.addGroats(t.reward);
    celebrate(`A ${t.name.toUpperCase()} RISES`, `${prettyName(state.seedName)} is now a ${t.name.toLowerCase()}`, t.reward);
    burst();
  }

  const best = Math.max(s.peakPop, parseInt(store.get(seedKey('best')) || '0', 10));
  if (!quiet && best > 0) { store.set(seedKey('best'), String(best)); empire.noteBest(best); }
}

function renderNext() {
  const s = state.sim;
  const cur = nextQuest(s);
  const then = [];
  for (const q of QUESTS) {
    if (s.claimed.includes(q.id) || q.id === cur.id) continue;
    if (then.length < 2) then.push(q);
  }
  $('next-text').textContent = cur.text;
  $('next-reward').textContent = `+${cur.reward} ⟡`;
  $('next-hint').textContent = cur.hint;
  const bar = $('next-bar');
  if (cur.prog) {
    const [have, want] = cur.prog(s);
    bar.style.display = 'block';
    $('next-fill').style.width = `${Math.min(100, (have / want) * 100)}%`;
    $('next-prog').textContent = `${Math.min(have, want)} of ${want}`;
  } else {
    bar.style.display = 'none';
    $('next-prog').textContent = '';
  }
  $('then').innerHTML = then.map((q) => `<div class="then">${q.text}<em>+${q.reward} ⟡</em></div>`).join('');
  const done = s.claimed.length;
  $('done-count').textContent = `${done} DONE · ${s.earned} ⟡`;

  // the rank badge, and how far off the next one is
  const t = TIERS[s.tierAt], nx = TIERS[s.tierAt + 1];
  $('tier-name').textContent = t.name;
  if (nx) {
    const span = nx.pop - t.pop, into = Math.min(span, s.peakPop - t.pop);
    $('tier-fill').style.width = `${Math.max(0, (into / span) * 100)}%`;
    $('tier-next').textContent = `${nx.pop - s.peakPop} more folk → ${nx.name} · +${nx.reward} ⟡`;
    $('tier-bar').style.display = 'block';
  } else {
    $('tier-fill').style.width = '100%';
    $('tier-next').textContent = 'the highest rank there is';
    $('tier-bar').style.display = 'block';
  }
}

// ------------------------------------------------------- what is going on --
// One plain sentence naming the most urgent thing wrong and what to do about
// it. The order is the order it kills you in.
function advice(s) {
  const r = rates(s);
  if (s.entries.length >= MAX_BUILD) {
    return ['The island is full',
      `${MAX_BUILD} buildings is as large as a kingdom grows on one island. Settle a new valley — your groats and charters go with you.`];
  }
  if (countKind(s, K.FIELD) === 0) {
    return ['No farm yet', 'Every villager eats 1 food a day. Sow a farm — it grows 4.'];
  }
  if (r.food < 0) {
    const left = Math.floor(s.food / -r.food);
    return s.food === 0
      ? ['The folk are starving', 'Food ran out and they are dying. Sow farms now.']
      : [`Food is falling — ${left} day${left === 1 ? '' : 's'} left`, `You grow ${r.food + s.pop} a day and eat ${s.pop}. Sow another farm.`];
  }
  if (r.food === 0 && s.food < s.pop * 2) {
    return ['Food is only breaking even',
      `${s.pop} grown, ${s.pop} eaten. Nobody new can arrive, and one lost worker starts a famine. Sow another farm.`];
  }
  // the trap that used to end runs silently: no wood, no sawmill, no way back
  const cheapest = Math.min(...KIND_ORDER.map((k) => B[k].wood));
  if (s.wood < cheapest && countKind(s, K.SAWMILL) === 0) {
    return s.gold >= TRADE[0].give
      ? ['Out of wood, and no sawmill', `Everything is built of wood. Buy some from the merchant below — ${TRADE[0].give} gold for ${TRADE[0].get}.`]
      : ['Out of wood, and no sawmill', 'Everything is built of wood and nothing here makes any. Wait for tax day, then buy some from the merchant below.'];
  }
  const wIn = s.winterIn();
  if (wIn > 0 && wIn <= 12) {
    const need = s.pop * SEASON_DAYS - (r.food + s.pop) * SEASON_DAYS / 2;
    return [`Winter comes in ${wIn} day${wIn === 1 ? '' : 's'}`,
      need > s.food
        ? `Farms grow half as much through it. At this size you want about ${Math.ceil(need)} food put by, and you have ${s.food}.`
        : `Farms grow half as much through it, but your pantry looks deep enough.`];
  }
  if (s.isWinter() && r.food < 0) {
    const left = Math.floor(s.food / -r.food);
    return ['Winter is eating the pantry', `${left} day${left === 1 ? '' : 's'} of food left, and ${SEASON_DAYS - (s.day % YEAR_DAYS) + SEASON_DAYS * 3} of winter to go. Sow more farms.`];
  }
  const idle = idleCount(s);
  if (idle > 0) {
    return [`${idle} building${idle === 1 ? '' : 's'} stand${idle === 1 ? 's' : ''} idle`,
      'Nobody is left to work them, so they make nothing. Raise a house and more folk will come.'];
  }
  if (s.hap <= 3) {
    return ['The folk are unhappy',
      countKind(s, K_CHAPEL) === 0
        ? 'Lower the tax, or build a chapel — it lifts the mood by 1 every 4 days.'
        : `Lower the tax, or hold a festival for ${FEST_COST} gold.`];
  }
  if (s.pop >= s.capacity()) {
    return ['Every bed is full', 'The kingdom cannot grow. A house adds 4 beds.'];
  }
  if (s.wood < 4 && countKind(s, K.SAWMILL) === 0) {
    return ['Wood is running out', 'A sawmill beside the forest cuts 2 a day, and everything is built of wood.'];
  }
  return null;
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
  for (let i = 0; i < 10; i++) cells += `<span class="uc" style="background:${i < v10 ? warm : '#ded0ae'}"></span>`;
  return cells;
}

function moodWord(h) {
  return h >= 8 ? 'joyful' : h >= 6 ? 'content' : h >= 4 ? 'uneasy' : h >= 2 ? 'grim' : 'ready to leave';
}

// The five supplies, each with today's rate beside it. A rate is the only way
// to see a problem coming rather than reading about it after it lands.
function renderSupplies(s) {
  const r = rates(s);
  const set = (id, val, delta, alarm) => {
    $(`r-${id}`).textContent = val;
    const d = $(`d-${id}`);
    d.textContent = delta;
    d.className = delta.startsWith('+') ? 'up' : delta.startsWith('−') ? 'dn' : delta ? 'flat' : '';
    $(`res-${id}`).classList.toggle('alarm', !!alarm);
  };
  const perDay = (n) => (n > 0 ? `+${n}/day` : n < 0 ? `−${-n}/day` : '');
  // Food is the number that kills you, so it never goes blank: breaking even is
  // its own warning, because one new mouth tips it negative.
  set('food', s.food, r.food === 0 ? 'breaking even' : perDay(r.food),
    r.food < 0 || (r.food === 0 && s.food < s.pop));
  set('wood', s.wood, perDay(r.wood));
  set('stone', s.stone, perDay(r.stone));
  set('gold', s.gold, perDay(r.gold));
  const beds = s.capacity() - s.pop;
  set('folk', `${s.pop} / ${s.capacity()}`, beds > 0 ? `${beds} bed${beds === 1 ? '' : 's'} free` : 'no beds free', beds <= 0);
}

const TAX_NOTE = [
  'The folk pay nothing and love you for it. No gold from tax.',
  'A fair rate — 1 gold from each villager, no ill feeling.',
  'Double gold, and the mood sours every tax day.',
];

function renderCrown() {
  const s = state.sim;
  renderSupplies(s);
  syncPalette();

  renderTrade();
  const a = advice(s), box = $('c-alert');
  if (a) {
    box.style.display = 'block';
    box.firstElementChild.textContent = a[0];
    box.lastElementChild.textContent = a[1];
  } else box.style.display = 'none';

  for (let r = 0; r <= 2; r++) $(`tax${r}`).classList.toggle('on', s.tax === r);
  $('tax-note').textContent = TAX_NOTE[s.tax];
  const fin = s.festivalIn(), fb = $('festival');
  fb.disabled = fin > 0 || s.gold < FEST_COST;
  fb.textContent = `Hold a festival · ${FEST_COST} gold`;
  $('fest-note').textContent = fin > 0
    ? `the folk are still talking about the last one — ${fin} day${fin === 1 ? '' : 's'}`
    : s.gold < FEST_COST
      ? `${FEST_COST - s.gold} more gold and you can throw one`
      : `a feast lifts the mood by ${FEST_HAP}, once every ${FEST_EVERY} days`;
  $('c-hap').innerHTML = meterHTML(s.hap, s.hap >= 4 ? '#8fae5f' : '#c9884f');
  $('c-hap-n').textContent = `${s.hap} of 10 · ${moodWord(s.hap)}`;
  $('mood-note').textContent = s.hap >= 4
    ? 'Above 4 the kingdom grows. Feeding folk lifts the mood.'
    : 'Below 4 nobody new arrives — and at 1 they start to leave.';

  const seas = SEASONS[s.season()];
  $('b-year').textContent = `Year ${s.year} · ${seas} · Day ${(s.day % YEAR_DAYS) + 1}`;
  $('b-year').style.color = s.isWinter() ? '#4a6f96' : '';
  const untilTax = TAX_EVERY - (s.day % TAX_EVERY);
  $('b-tax').textContent = s.tax === 0
    ? 'no tax is asked'
    : `tax in ${untilTax} day${untilTax === 1 ? '' : 's'} · +${s.pop * s.tax} gold`;

  $('firsthint').style.display = s.entries.length === 0 ? 'block' : 'none';
}

// ------------------------------------------------------------- game flow --
function seedKey(suffix) { return `kingdom:${state.seedName}:${suffix}`; }

// The game was renamed from Steading to Kingdom. Carry a player's vault and
// their saved valleys over to the new key names once, so nobody loses a
// kingdom to a rename, then never look at the old names again.
function migrateStore() {
  if (store.get('kingdom:migrated')) return;
  try {
    const old = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('steading:')) old.push(k);
    }
    for (const k of old) {
      const nk = `kingdom:${k.slice(9)}`;
      if (localStorage.getItem(nk) == null) localStorage.setItem(nk, localStorage.getItem(k));
    }
  } catch { /* private mode, or storage disabled */ }
  store.set('kingdom:migrated', '1');
}

// The debug fragments fabricate a kingdom to look at; they must never write
// that over a real save for the same seed.
function saveLive() {
  if (state.noSave) return;
  store.set(seedKey('simple'), state.sim.serialize());
}

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
  legal = null;
  floats = []; sparks = []; banQueue = []; banner = null;
  $('banner').classList.remove('show');
  $('vname').textContent = prettyName(name);
  $('vseed').textContent = name.startsWith('daily-') ? `valley of the day · ${name.slice(6)}` : `seed · ${name}`;
  $('fallen').style.display = 'none';
  buildTerrain(); fitCamera();
  checkRewards();
  renderCrown(); renderNext(); renderEmpire();
  $('log').innerHTML = '';
  pushLog([state.sim.day === 0
    ? 'four folk step ashore with a cart of supplies'
    : 'the reign continues'], state.sim.day);
  if (state.sim.day === 0) toast('time waits — place your first building to begin');
  try { location.hash = name === dailyName() ? '' : `v=${encodeURIComponent(name)}`; } catch { /* ignore */ }
}

function stepOnce() {
  const sim = state.sim;
  const { events, taxTake, died, yearEnded } = sim.stepDay();
  if (events.length) pushLog(events, sim.day);
  if (!state.quiet) emitDayJuice(sim, taxTake, died);
  // winter changes the colour of the island, so the cache has to be rebuilt —
  // twice a year, which is nothing
  if (sim.isWinter() !== state.snow) { state.snow = sim.isWinter(); buildTerrain(); }
  // a year's end is the natural shape of a run: it pays, and it says how you did
  if (yearEnded && !state.quiet) {
    const bonus = 10 + sim.pop * 2;
    sim.earned += bonus;
    empire.addGroats(bonus);
    celebrate(`YEAR ${sim.year - 1} ENDS`, `${sim.pop} folk and ${sim.gold} gold under your crown`, bonus);
    burst(34);
  }
  checkRewards();
  if (sim.fallen) {
    state.playing = false;
    $('fal-head').textContent = sim.fallen === 'starved' ? 'The kingdom starved' : 'The folk walked away';
    $('fal-sub').innerHTML = (sim.fallen === 'starved'
      ? 'Too few farms for too many mouths. Sow farms before all else.'
      : 'Hunger and a harsh tax emptied the valley. Rule a little more gently.')
      + `<br><br>It reached <b>${TIERS[sim.tierAt].name.toLowerCase()}</b> at ${sim.peakPop} folk and earned you `
      + `<b>${sim.earned} ⟡</b> — and groats are never lost. Settle again and spend them.`;
    $('fallen').style.display = 'flex';
  }
  if (--state.saveCountdown <= 0) { saveLive(); state.saveCountdown = 5; }
  renderCrown(); renderNext();
  state.dirty = true;
}

// The button a lost player presses, so what it founds has to actually work:
// two farms (a real food surplus, not break-even) and a sawmill for income.
// It deliberately leaves the house unbuilt — that is the next goal on the
// ladder, and the first thing the player does themselves.
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
      if (!placementProblem(x, y, K.FIELD)) { sim.place(x, y, K.FIELD); break; }
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
  toast('two farms and a sawmill — now raise a house');
  buildTerrain(); renderCrown(); renderNext(); state.dirty = true;
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
  else if (state.tool === K.MINE) line = `${countAdj(i, T.ORE)} ore beside it`;
  else { el.style.display = 'none'; return; }
  el.textContent = line;
  el.style.color = err ? P.red : P.soft;
  el.style.display = 'block';
  el.style.left = `${mx + 16}px`; el.style.top = `${my - 8}px`;
}

// ------------------------------------------------------------------- boot --
export function boot() {
  cv = $('cv'); ctx = cv.getContext('2d');
  for (const n of ['food', 'wood', 'stone', 'gold', 'folk']) $(`i-${n}`).innerHTML = icon(n);
  renderPalette();

  migrateStore();
  const initialHash = location.hash || '';
  state.noSave = /demo|sprites/.test(initialHash);
  // debug fragments fabricate kingdoms, so they must not mint groats either —
  // except #party, which exists to photograph the rewards themselves
  state.quiet = state.noSave && !/party/.test(initialHash);
  let name = dailyName();
  const m = /v=([^&]+)/.exec(initialHash);
  if (m) name = decodeURIComponent(m[1]);
  loadValley(name);

  // #hour=<0..1> pins the sky at one moment, for screenshots and art review
  const hm = /hour=([\d.]+)/.exec(initialHash);
  if (hm) { state.phase = parseFloat(hm[1]) % 1; state.frozenSky = true; }

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
        legal = null;
        saveLive(); renderCrown(); renderNext(); state.dirty = true;
      }
    } else {
      const err = placementProblem(x, y, state.tool) || state.sim.place(x, y, state.tool);
      if (err) toast(err);
      else {
        if (state.valley.kind[t] === T.FOREST) buildTerrain();
        legal = null;
        if (state.autoPaused) { state.playing = true; state.autoPaused = false; toast('the days begin to pass'); }
        checkRewards();
        saveLive(); renderCrown(); renderNext(); state.dirty = true;
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
  $('festival').onclick = () => {
    const err = state.sim.festival();
    if (err) { toast(err); return; }
    pushLog(['a festival — ale, bread and dancing in the square'], state.sim.day);
    state.sim.feasts++;
    toast(`the folk are glad — +${FEST_HAP} happiness`);
    burst(22);
    checkRewards();
    saveLive(); renderCrown(); renderNext(); state.dirty = true;
  };
  $('em-swap').onclick = () => {
    if (state.sim.gold < SWAP_GOLD) return;
    state.sim.gold -= SWAP_GOLD;
    empire.addGroats(SWAP_GROATS);
    pushLog([`${SWAP_GOLD} gold swapped for ${SWAP_GROATS} ⟡ groats`], state.sim.day);
    toast(`+${SWAP_GROATS} ⟡ — groats carry across every valley`);
    checkRewards();
    saveLive(); renderCrown(); renderNext(); renderEmpire(); flashGroats();
  };
  $('btn-daily').onclick = () => loadValley(dailyName());
  $('btn-random').onclick = () => loadValley(`vale-${Math.random().toString(36).slice(2, 8)}`);
  $('btn-starter').onclick = starterHamlet;
  $('btn-raze').onclick = () => {
    store.del(seedKey('simple'));
    loadValley(state.seedName, true);
    toast('the valley is wild again');
  };
  $('btn-wallet').onclick = () => {
    if (wallet.addr || !wallet.provider()) { renderEmpire(); $('empire').style.display = 'flex'; return; }
    wallet.connect(false);
  };
  // reconnect without a popup if this browser already trusts the page, and
  // follow the wallet if the user switches accounts or locks it
  const wp = wallet.provider();
  if (wp) {
    wallet.connect(true);
    if (wp.on) {
      wp.on('disconnect', () => { wallet.addr = null; renderWallet(); });
      wp.on('accountChanged', (pk) => {
        wallet.addr = pk ? pk.toString() : null;
        if (wallet.addr) store.set('kingdom:wallet', wallet.addr);
        renderWallet();
      });
    }
  }
  renderWallet();

  $('btn-empire').onclick = () => { renderEmpire(); $('empire').style.display = 'flex'; };
  $('em-close').onclick = () => { $('empire').style.display = 'none'; };
  const showGuide = (on) => { $('guide').style.display = on ? 'flex' : 'none'; };
  $('btn-help').onclick = () => showGuide(true);
  $('guide-close').onclick = () => showGuide(false);
  $('guide-go').onclick = () => showGuide(false);
  $('fal-raze').onclick = () => { store.del(seedKey('simple')); loadValley(state.seedName, true); };
  $('fal-new').onclick = () => loadValley(`vale-${Math.random().toString(36).slice(2, 8)}`);

  if (!store.get('kingdom:seen') && !/demo|plain|empire|sprites/.test(initialHash)) showGuide(true);
  store.set('kingdom:seen', '1');
  if (/guide/.test(initialHash)) showGuide(true);
  if (/empire/.test(initialHash)) { renderEmpire(); $('empire').style.display = 'flex'; }

  // Number keys pick a building, X demolishes, space runs and stops the days.
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape') { showGuide(false); $('empire').style.display = 'none'; return; }
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= KIND_ORDER.length) selectTool(KIND_ORDER[n - 1]);
    else if (e.key === 'x' || e.key === 'X') selectTool('erase');
    else if (e.key === ' ') { e.preventDefault(); state.playing = !state.playing; state.autoPaused = false; }
  });

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
    // an explicit #z= wins, so the whole island (and the sky over it) can be
    // photographed with a hamlet standing on it
    if (state.sim.entries.length && !zm) {
      const e0 = state.sim.entries[0];
      centerOn(e0.x, e0.y, Math.max(state.cam.z, 2.0));
    }
  }

  requestAnimationFrame(tick);
}

function tick(t) {
  if (!state.lastTick) state.lastTick = t;
  const dt = Math.min(0.05, (t - state.lastTick) / 1000);
  if (state.playing && state.sim && !state.sim.fallen) {
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
  if (floats.length || sparks.length) stepJuice(dt);
  // The sky keeps moving whether or not the days are running, so a paused
  // kingdom still lives somewhere in an afternoon. Speed hurries it, but only
  // to 3x — past that a sunrise would be a flicker.
  if (!state.frozenSky) {
    state.phase = (state.phase + dt / DAY_CYCLE) % 1;
    // ten minutes of sky is far too slow to be worth a repaint every frame:
    // redraw only when it has actually moved a visible amount
    const bucket = (state.phase * 4000) | 0;
    if (bucket !== state.skyBucket) { state.skyBucket = bucket; state.dirty = true; }
  }
  $('play').textContent = state.playing ? '❚❚' : '▶';
  if (state.dirty) { drawFrame(); state.dirty = false; }
  requestAnimationFrame(tick);
}
