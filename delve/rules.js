// DELVE — the rules, and nothing else.
//
// No DOM, no canvas, no randomness the caller cannot reproduce. A run is a
// SEED plus a LIST OF MOVES; replaying those two things anywhere must produce
// the identical run, tile for tile and hit point for hit point. That is what
// lets a server verify a delve it did not watch, which is the only reason an
// item pulled out of one can be worth anything.
//
// The same file runs in the browser and on the server. Never import anything
// into it that only one of them has.

import { ROOMS, LEGEND } from './rooms.js';
import { QUARTERS } from './quarters.js';

// ------------------------------------------------------------------ chance --
// mulberry32: small, fast, and identical in every JS engine. Math.random() is
// none of those things and must never appear in this file.
export function rng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Each floor draws from its own stream, keyed by the run seed and the depth.
// That is not tidiness: it is what lets the server hand out floor 7's seed only
// when you set foot on floor 7, so nobody can solve the dungeon from the lobby.
export const floorSeed = (seed, depth, door = 0) => hashStr(`${seed}:floor:${depth}:${door}`);

const pick = (r, list) => list[Math.floor(r() * list.length)];
const roll = (r, n) => Math.floor(r() * n);

// ------------------------------------------------------------------- world --
// ------------------------------------------------------------ two grid sizes --
// A CHAMBER is 11x11: a border, a spine, four quarters. That is the unit the
// sixteen drawn rooms are authored at, the unit the quarter theorem is proved
// over, and the unit every validator in this repo checks. It has not changed.
//
// A FLOOR is now four chambers by four — 44x44 — laid in a grid with doors
// knocked between neighbours. Sixteen rooms to a floor instead of one.
//
// So there are two coordinate systems here, and mixing them is the way this
// file gets broken. Everything above `class Run` generates ONE chamber and uses
// the chamber helpers: CW, CH, cidx, cIn. Everything from Run down is the
// floor the player walks and uses W, H, idx, inBounds. The tile predicates —
// walkable, blocksSight, passable — read the grid width off the array they are
// given, because both grids are square, so they work at either scale.
export const CW = 11, CH = 11;       // one chamber
export const GRID = 4;               // chambers across a floor
export const W = CW * GRID, H = CH * GRID;   // the floor itself: 44x44

export const inBounds = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
export const idx = (x, y) => y * W + x;

const cIn = (x, y) => x >= 0 && y >= 0 && x < CW && y < CH;
const cidx = (x, y) => y * CW + x;
export const WALL = 0, FLOOR = 1, RUBBLE = 2, STAIRS = 3, EXIT = 4, GAP = 5;

export const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Extraction is not a button that is always there. It shows up every other
// floor, so going down is a commitment to two floors rather than one — which
// is the whole decision the game is made of.
export const hasExit = (depth) => depth >= 2 && depth % 2 === 0;

// --------------------------------------------------------------- the bestiary --
// Every one of these announces what it is about to do BEFORE you move, and then
// does exactly that even if you have moved out of the way. Committed intent is
// what turns a fight into a puzzle instead of a dice roll.
export const KINDS = {
  husk: {
    name: 'Husk', hp: 3, dmg: 1, every: 1, reach: 1,
    blurb: 'shambles one tile toward you',
  },
  spitter: {
    name: 'Spitter', hp: 2, dmg: 2, every: 1, reach: 4,
    blurb: 'winds up, then spits down a straight line',
  },
  sentinel: {
    name: 'Sentinel', hp: 6, dmg: 3, every: 2, reach: 1,
    blurb: 'slow, and sweeps three tiles at once',
  },
};

export const hpBonus = (depth) => (depth > 20 ? 4 : depth > 14 ? 3 : depth > 8 ? 2 : depth > 4 ? 1 : 0);

// No more than about one tile in four and a half may hold a monster. Without
// this the assembler — whose pool is every open tile rather than a room's
// authored slots — put 23.7 bodies on a 36-tile floor at depth 30, which is 65%
// of the floor. The bots die around floor five, so nothing ever saw it.
export const bodyCap = (area) => Math.max(2, Math.min(9, Math.round(area * 0.22)));

// A heavy post always holds the heaviest thing available. Past floor twelve the
// ordinary posts start holding them too, which is how a floor gets worse when
// it cannot get bigger.
function pickKind(r, heavy, canHeavy, light, depth) {
  if (heavy && canHeavy) return 'sentinel';
  if (canHeavy && depth > 12 && r() < 0.28) return 'sentinel';
  return light.length ? light[Math.floor(r() * light.length)] : 'husk';
}
export const dmgBonus = (depth) => (depth >= 7 ? 1 : 0);

function bestiaryFor(depth) {
  if (depth <= 1) return ['husk'];
  if (depth <= 3) return ['husk', 'husk', 'spitter'];
  if (depth <= 6) return ['husk', 'spitter', 'spitter', 'sentinel'];
  if (depth <= 12) return ['husk', 'spitter', 'sentinel', 'sentinel'];
  // the deep floors stop sending more and start sending worse
  return ['husk', 'spitter', 'sentinel', 'sentinel', 'sentinel'];
}

// ------------------------------------------------------------------ relics --
export const TIERS = ['common', 'rare', 'epic', 'mythic'];
export const TIER_COL = { common: '#cdd8e0', rare: '#5aa9e6', epic: '#b06ede', mythic: '#ffc83d' };

// Depth is the only thing that raises the odds, and the odds are published.
// A mythic is rare because floor nine kills people, not because a box said no.
const TIER_TABLE = [
  { upTo: 3, w: [90, 10, 0, 0] },
  { upTo: 6, w: [55, 35, 10, 0] },
  { upTo: 9, w: [25, 40, 30, 5] },
  { upTo: 99, w: [10, 30, 40, 20] },
];

export function tierFor(r, depth) {
  const row = TIER_TABLE.find((t) => depth <= t.upTo) || TIER_TABLE[TIER_TABLE.length - 1];
  let n = r() * row.w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < row.w.length; i++) { n -= row.w[i]; if (n < 0) return TIERS[i]; }
  return 'common';
}

const FORMS = [
  // tools — they change how you play, and they are the minority on purpose
  { id: 'fang', noun: 'Fang', effect: 'bite', blurb: 'strike +1', tool: true },
  { id: 'crown', noun: 'Crown', effect: 'vigour', blurb: 'max health +2', tool: true },
  { id: 'ward', noun: 'Ward', effect: 'guard', blurb: 'the first hit each floor is turned', tool: true },
  { id: 'draught', noun: 'Draught', effect: 'mend', blurb: 'heal 2 on the stair', tool: true },
  { id: 'coin', noun: 'Sigil', effect: 'luck', blurb: 'relics fall more often', tool: true },
  // treasure — worth carrying out, and nothing else
  { id: 'idol', noun: 'Idol', effect: 'none', blurb: 'worth carrying out' },
  { id: 'torc', noun: 'Torc', effect: 'none', blurb: 'worth carrying out' },
  { id: 'reliquary', noun: 'Reliquary', effect: 'none', blurb: 'worth carrying out' },
  { id: 'chalice', noun: 'Chalice', effect: 'none', blurb: 'worth carrying out' },
  { id: 'seal', noun: 'Seal', effect: 'none', blurb: 'worth carrying out' },
  { id: 'bead', noun: 'Bead-string', effect: 'none', blurb: 'worth carrying out' },
  { id: 'mask', noun: 'Death-mask', effect: 'none', blurb: 'worth carrying out' },
];

// Two treasures for every tool. Draw the class first so the odds do not shift
// when the list of either grows.
const TOOLS = FORMS.filter((f) => f.tool);
const TREASURE = FORMS.filter((f) => !f.tool);
const PLACES = ['Ashvale', 'Coldiron', 'Salt', 'Mirefen', 'Gravemoor', 'Hollow', 'Thistle', 'Rookmoor', 'Blackmarl', 'Dunmere'];
export const FLOOR_NAMES = ['The Sump', 'Salt Warrens', 'The Kiln', 'Bone Gallery', 'The Drowned Stair',
  'Ashvault', 'The Long Dark', 'Gravemoor Deep', 'The Cold Mouth', 'Nether Warrens'];

export const floorName = (depth) => FLOOR_NAMES[(depth - 1) % FLOOR_NAMES.length]
  + (depth > FLOOR_NAMES.length ? ` ${Math.floor((depth - 1) / FLOOR_NAMES.length) + 1}` : '');

export function makeRelic(r, depth, luckDepth = depth) {
  const tier = tierFor(r, luckDepth);
  const form = r() < 0.34 ? pick(r, TOOLS) : pick(r, TREASURE);
  const place = pick(r, PLACES);
  const power = TIERS.indexOf(tier) + 1;
  return {
    id: `${form.id}-${roll(r, 1e9)}`,
    name: `${place} ${form.noun}`,
    tier, form: form.id, effect: form.effect, blurb: form.blurb,
    power, depth,
  };
}

// ------------------------------------------------------------ the room library --
// A floor is not scattered, it is DRAWN. rooms.js holds hand-made nine-by-nine
// rooms; this turns one into a place, eight ways up, with its slots filled to
// suit the depth. See rooms.js for the legend and for why each room exists.

// what a glyph becomes on the tile map, before slots are filled
const TILE_OF = { '#': WALL, ':': RUBBLE, '_': GAP, '.': FLOOR, '?': FLOOR, '@': FLOOR, '>': STAIRS, '^': FLOOR, e: FLOOR, E: FLOOR, '*': FLOOR };

export function parseRoom(room) {
  const tiles = new Uint8Array(CW * CH);
  const spawn = [];
  const stair = [];
  const exit = [];
  const foes = [];
  const heavies = [];
  const relics = [];
  const maybe = [];
  room.cells.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      tiles[cidx(x, y)] = TILE_OF[ch] ?? FLOOR;
      if (ch === '@') spawn.push([x, y]);
      else if (ch === '>') stair.push([x, y]);
      else if (ch === '^') exit.push([x, y]);
      else if (ch === 'e') foes.push([x, y]);
      else if (ch === 'E') heavies.push([x, y]);
      else if (ch === '*') relics.push([x, y]);
      else if (ch === '?') maybe.push([x, y]);
    });
  });
  return { id: room.id, name: room.name, tiles, spawn, stair, exit, foes, heavies, relics, maybe };
}

// ------------------------------------------------------------ eight ways --
// A square room has eight symmetries. Ten hand-drawn rooms become eighty
// arrangements without a single one of them being a room nobody designed —
// which is the honest limit of this trick, and why the library still has to
// grow rather than lean on it.
const rot = ([x, y]) => [CW - 1 - y, x];
const flip = ([x, y]) => [CW - 1 - x, y];

export function transformRoom(parsed, turns, mirror) {
  let map = (p) => p;
  for (let i = 0; i < turns; i++) { const prev = map; map = (p) => rot(prev(p)); }
  if (mirror) { const prev = map; map = (p) => flip(prev(p)); }
  const tiles = new Uint8Array(CW * CH);
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const [nx, ny] = map([x, y]);
    tiles[cidx(nx, ny)] = parsed.tiles[cidx(x, y)];
  }
  const move = (list) => list.map(map);
  return {
    id: parsed.id, name: parsed.name, tiles,
    spawn: move(parsed.spawn), stair: move(parsed.stair), exit: move(parsed.exit),
    foes: move(parsed.foes), heavies: move(parsed.heavies), relics: move(parsed.relics),
    maybe: move(parsed.maybe), turns, mirror,
  };
}

export const VARIANTS = 8;
export const variantOf = (parsed, n) => transformRoom(parsed, n & 3, !!(n & 4));

export function passable(tiles, x, y) { return walkable(tiles, x, y); }

export function reachableFrom(tiles, from) {
  const seen = new Uint8Array(CW * CH);
  if (!passable(tiles, from[0], from[1])) return seen;
  seen[cidx(from[0], from[1])] = 1;
  const q = [from];
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (!passable(tiles, nx, ny) || seen[cidx(nx, ny)]) continue;
      seen[cidx(nx, ny)] = 1;
      q.push([nx, ny]);
    }
  }
  return seen;
}

// ---------------------------------------------------------- the assembler --
// Four 3x3 quarters around an always-open spine. See quarters.js for the
// geometry and for why any four valid quarters compose into a connected floor
// without a single global check.
//
// The quarters bring the shape. Everything that has to be true of a FLOOR —
// one spawn, two stairs a real walk apart, a way out, loot worth crossing the
// room for — is decided here, from the assembled geometry rather than from
// tags, because no 3x3 can promise anything about a 9x9.

// The geometry of the theorem, in terms of the grid rather than of 9. A floor is
// a border, a spine down the middle row and column, and four square quarters in
// the corners — so the spine sits at (CW-1)/2 and each quarter is (CW-3)/2 across.
// For a 9 that is a spine at 4 and 3x3 quarters; for an 11, a spine at 5 and 4x4.
export const MID = (CW - 1) / 2;
export const QS = (CW - 3) / 2;
const CORNERS = [[1, 1], [MID + 1, 1], [1, MID + 1], [MID + 1, MID + 1]];
const QUARTER_FORMS = 8;
const SPAN_Q = Array.from({ length: QS }, (_, i) => i);

// form: bit 0 = transpose, bits 1-2 unused (the corner sets the reflection)
function placeQuarter(cells, corner, form) {
  let g = cells.map((r) => [...r]);
  if (form & 1) g = SPAN_Q.map((y) => SPAN_Q.map((x) => g[x][y]));          // transpose
  if (corner === 1 || corner === 3) g = g.map((r) => r.slice().reverse());  // mirror x
  if (corner === 2 || corner === 3) g = g.slice().reverse();                // mirror y
  return g;
}

const SIGHT_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function seenFrom(tiles, x, y) {
  let n = 0;
  for (const [dx, dy] of SIGHT_DIRS) {
    let cx = x + dx, cy = y + dy;
    while (!blocksSight(tiles, cx, cy)) { n++; cx += dx; cy += dy; }
  }
  return n;
}

const manhattan = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

// is every walkable tile joined to every other one?
function allReachable(tiles) {
  let start = -1, count = 0;
  for (let y = 1; y < CH - 1; y++) for (let x = 1; x < CW - 1; x++) {
    if (!walkable(tiles, x, y)) continue;
    count++;
    if (start < 0) start = cidx(x, y);
  }
  if (start < 0) return false;
  const seen = new Uint8Array(CW * CH);
  seen[start] = 1;
  const q = [[start % CW, Math.floor(start / CW)]];
  let n = 1;
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (!walkable(tiles, nx, ny) || seen[cidx(nx, ny)]) continue;
      seen[cidx(nx, ny)] = 1; n++; q.push([nx, ny]);
    }
  }
  return n === count;
}

export function assemble(r, depth, seed, door) {
  const tiles = new Uint8Array(CW * CH).fill(WALL);
  const maybe = [], hintLoot = [], hintFoe = [], hintStair = [];

  // the spine: the middle row and column, always open, and the reason
  // connectivity is a theorem rather than a hope
  for (let i = 1; i < CW - 1; i++) { tiles[cidx(i, MID)] = FLOOR; tiles[cidx(MID, i)] = FLOOR; }

  const picked = [];
  for (let corner = 0; corner < 4; corner++) {
    const q = QUARTERS[Math.floor(r() * QUARTERS.length)];
    const form = Math.floor(r() * QUARTER_FORMS) & 1;
    picked.push(q.id);
    const g = placeQuarter(q.cells, corner, form);
    const [ox, oy] = CORNERS[corner];
    for (let j = 0; j < QS; j++) for (let i = 0; i < QS; i++) {
      const ch = g[j][i], x = ox + i, y = oy + j;
      tiles[cidx(x, y)] = ch === '#' ? WALL : ch === ':' ? RUBBLE : ch === '_' ? GAP : FLOOR;
      if (ch === '?') maybe.push([x, y]);
      else if (ch === '*') hintLoot.push([x, y]);
      else if (ch === 'e') hintFoe.push([x, y]);
      else if (ch === '>') hintStair.push([x, y]);
    }
  }

  // A hole that reaches the edge bites the plate's outline, which is what stops
  // every assembled floor being the same filled square with furniture on it.
  for (let i = 1; i < CW - 1; i++) {
    if (tiles[cidx(i, 1)] === GAP) tiles[cidx(i, 0)] = GAP;
    if (tiles[cidx(i, CH - 2)] === GAP) tiles[cidx(i, CH - 1)] = GAP;
    if (tiles[cidx(1, i)] === GAP) tiles[cidx(0, i)] = GAP;
    if (tiles[cidx(CW - 2, i)] === GAP) tiles[cidx(CW - 1, i)] = GAP;
  }

  for (const [x, y] of maybe) if (r() < 0.42) tiles[cidx(x, y)] = RUBBLE;

  // A spine that is always thirteen open tiles is a motorway through the middle
  // of every floor: measured, it cost 0.17x of the walk-in-walk-out detour,
  // which is the coherence that authoring bought being spent on variety. So
  // fallen stone goes into it, but only where the floor survives it — each block
  // is kept only if everything is still reachable afterwards.
  //
  // This is not the old retry loop. That rerolled a whole floor up to forty
  // times and so quietly preferred the safest floor it could find. Here the
  // theorem is the ground under the experiment: an untouched spine always works,
  // so the worst case is simply that no stone lands.
  const spineCells = [];
  for (let i = 1; i < CW - 1; i++) { if (i !== MID) { spineCells.push([i, MID]); spineCells.push([MID, i]); } }
  for (const [bx, by] of shuffled(r, spineCells).slice(0, Math.round(spineCells.length * 0.25))) {
    if (r() >= 0.55) continue;
    const was = tiles[cidx(bx, by)];
    tiles[cidx(bx, by)] = r() < 0.5 ? RUBBLE : GAP;
    if (!allReachable(tiles)) tiles[cidx(bx, by)] = was;
  }

  const open = [];
  for (let y = 1; y < CH - 1; y++) for (let x = 1; x < CW - 1; x++) if (walkable(tiles, x, y)) open.push([x, y]);
  const exposure = new Map(open.map((p) => [`${p[0]},${p[1]}`, seenFrom(tiles, p[0], p[1])]));
  const expo = (p) => exposure.get(`${p[0]},${p[1]}`) ?? 0;
  const taken = new Set();
  const free = (list) => list.filter((p) => !taken.has(`${p[0]},${p[1]}`));
  const claim = (p) => { taken.add(`${p[0]},${p[1]}`); return p; };

  // Two stairs, as far apart as the floor allows. Hints first, then anywhere —
  // a stair should be somewhere you can see, so exposed tiles win ties.
  const stairPool = shuffled(r, free(hintStair).length >= 2 ? free(hintStair) : open);
  let best = null;
  for (const a of stairPool) for (const b of stairPool) {
    const d = manhattan(a, b);
    if (d < 6) continue;
    const score = d * 2 + expo(a) + expo(b);
    if (!best || score > best.score) best = { a, b, score };
  }
  if (!best) {
    const sorted = shuffled(r, open).sort((p, q2) => (q2[0] + q2[1]) - (p[0] + p[1]));
    best = { a: sorted[0], b: sorted[sorted.length - 1] };
  }
  const stairs = [claim(best.a), claim(best.b)];

  // you wake as far from both doors as the room allows
  const spawn = claim(shuffled(r, free(open))
    .reduce((p, q2) => (manhattan(q2, stairs[0]) + manhattan(q2, stairs[1])
      > manhattan(p, stairs[0]) + manhattan(p, stairs[1]) ? q2 : p)));

  let exit = null;
  if (hasExit(depth)) {
    const spots = free(open).filter((p) => manhattan(p, spawn) > 3);
    if (spots.length) {
      exit = claim(shuffled(r, spots).reduce((p, q2) =>
        (manhattan(q2, stairs[0]) + manhattan(q2, stairs[1]) > manhattan(p, stairs[0]) + manhattan(p, stairs[1]) ? q2 : p)));
      tiles[cidx(exit[0], exit[1])] = EXIT;
    }
  }
  for (const [x, y] of stairs) tiles[cidx(x, y)] = STAIRS;

  // Loot belongs where you would not otherwise go. Hints first; failing that,
  // the quietest tiles on the floor, which is a better rule than any hint.
  const rich = depth > 1 && door === richDoor(seed, depth);
  const lootPool = free(hintLoot).length ? shuffled(r, free(hintLoot))
    : shuffled(r, free(open)).sort((p, q2) => expo(p) - expo(q2));
  const nRelics = Math.min(lootPool.length, 1 + ((rich || depth >= 6) && r() < 0.35 ? 1 : 0));
  const relics = [];
  for (let i = 0; i < nRelics; i++) {
    relics.push({ x: lootPool[i][0], y: lootPool[i][1], relic: makeRelic(r, depth, depth + (rich ? 3 : 0)) });
    claim(lootPool[i]);
  }

  // and the monsters where the room said something could stand, never next to
  // where you wake up
  const roster = bestiaryFor(depth);
  const canHeavy = roster.includes('sentinel');
  const light = roster.filter((k) => k !== 'sentinel');
  const foePool = shuffled(r, free(hintFoe).concat(free(open)))
    .filter((p) => manhattan(p, spawn) >= 3);
  const want = Math.min(foePool.length, bodyCap(open.length),
    1 + Math.floor(depth * 0.75) + (r() < 0.4 ? 1 : 0) + (rich ? 1 : 0));
  const enemies = [];
  for (let i = 0; i < want; i++) {
    const p = foePool[i];
    const heavy = canHeavy && expo(p) >= 6 && i % 3 === 0;      // the big one takes the open ground
    const kind = pickKind(r, heavy, canHeavy, light, depth);
    enemies.push({ id: i, kind, x: p[0], y: p[1], hp: KINDS[kind].hp + hpBonus(depth), cool: 0, intent: null });
  }

  return {
    tiles, pos: spawn, stairs, stair: stairs[0], exit, relics, enemies, depth, rich,
    room: `assembly:${picked.join('+')}`, variant: 0, assembled: true,
  };
}

// ------------------------------------------------------------- floor making --
// A floor is a room with cover in it, not a maze. You can see all of it at once,
// so the interest has to come from where the pillars are rather than from what
// is hidden — and everything reachable is guaranteed reachable before it ships.
export const ASSEMBLY_SHARE = 0.4;

// `force` exists for the measuring tools, which need to look at each generator
// on its own. It draws from the stream either way, so a forced floor is the
// same floor the mix would have made.
export function genChamber(seed, depth, door = 0, force = null) {
  const r = rng(floorSeed(seed, depth, door));
  const assembled = force === null ? r() < ASSEMBLY_SHARE : (r(), force);
  return assembled
    ? assemble(r, depth, String(seed), door)
    : buildFloor(r, depth, String(seed), door);
}

// Deterministic shuffle. Every choice this generator makes has to come out of
// the seeded stream in a fixed order, or two machines replaying the same delve
// disagree about where the monsters were.
function shuffled(r, list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

const roomAt = (seed, d, door) => (d < 1 ? -1
  : Math.floor(rng(hashStr(`${seed}:room:${d}:${door}`))() * ROOMS.length));

// Never the same room two floors running. You came through one of the two doors
// above, so both of them are ruled out — which keeps this a pure function of
// (seed, depth, door) and still means a repeat is impossible.
export function roomIndexFor(seed, depth, door = 0) {
  let want = roomAt(seed, depth, door);
  const above = [roomAt(seed, depth - 1, 0), roomAt(seed, depth - 1, 1)];
  for (let guard = 0; guard < ROOMS.length && above.includes(want); guard++) {
    want = (want + 1) % ROOMS.length;
  }
  return want;
}

export const richDoor = (seed, depth) =>
  (rng(hashStr(`${seed}:rich:${depth}`))() < 0.5 ? 0 : 1);

function buildFloor(r, depth, seed, door) {
  const rich = depth > 1 && door === richDoor(seed, depth);
  const room = ROOMS[roomIndexFor(seed, depth, door)];
  const v = variantOf(parseRoom(room), Math.floor(r() * VARIANTS));
  const tiles = v.tiles.slice();

  for (const [x, y] of v.maybe) if (r() < 0.42) tiles[cidx(x, y)] = RUBBLE;

  // The way out is drawn into every room; on an odd floor it is simply not
  // there, and the tile it would have occupied stays plain floor.
  let exit = null;
  if (hasExit(depth) && v.exit.length) {
    exit = shuffled(r, v.exit)[0];
    tiles[cidx(exit[0], exit[1])] = EXIT;
  }

  const pos = v.spawn[0];
  const stairs = v.stair.slice();

  // The room decides where things can stand. Depth decides how many of those
  // places are used. That is the difference between an encounter and a sprinkle.
  const roster = bestiaryFor(depth);
  const canHeavy = roster.includes('sentinel');
  const light = roster.filter((k) => k !== 'sentinel');
  const slots = shuffled(r, v.foes.map((p) => ({ p, heavy: false }))
    .concat(v.heavies.map((p) => ({ p, heavy: true }))));
  let area = 0;
  for (let y = 1; y < CH - 1; y++) for (let x = 1; x < CW - 1; x++) if (walkable(tiles, x, y)) area++;
  const want = Math.min(slots.length, bodyCap(area),
    1 + Math.floor(depth * 0.75) + (r() < 0.4 ? 1 : 0) + (rich ? 1 : 0));
  const enemies = [];
  for (let i = 0; i < want; i++) {
    const s = slots[i];
    const kind = pickKind(r, s.heavy, canHeavy, light, depth);
    enemies.push({
      id: i, kind, x: s.p[0], y: s.p[1],
      hp: KINDS[kind].hp + hpBonus(depth), cool: 0, intent: null,
    });
  }

  // Every floor has something on it worth walking to. Two thirds of the old
  // floors had nothing at all, in a game whose entire pitch is what you carry
  // out of them.
  const relicSpots = shuffled(r, v.relics);
  const nRelics = Math.min(relicSpots.length, 1 + ((rich || depth >= 6) && r() < 0.35 ? 1 : 0));
  const relics = [];
  // A rich floor rolls its loot on the table three floors deeper than it is.
  // That is what the badge is telling you, and the only thing it tells you.
  for (let i = 0; i < nRelics; i++) {
    relics.push({ x: relicSpots[i][0], y: relicSpots[i][1], relic: makeRelic(r, depth, depth + (rich ? 3 : 0)) });
  }

  return {
    tiles, pos, stairs, stair: stairs[0], exit, relics, enemies, depth, rich,
    room: room.id, variant: v.turns + (v.mirror ? 4 : 0),
  };
}

const key = ([x, y]) => `${x},${y}`;
const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

function freeSpot(r, open, taken, away, minAway) {
  const ok = open.filter((p) => !taken.has(key(p)) && dist(p, away) >= minAway);
  return ok.length ? pick(r, ok) : null;
}

// Both grids are square, so a tile array knows how wide it is. That is what
// lets one definition of "can you stand here" serve an 11x11 chamber being
// generated and the 44x44 floor being walked, instead of two that drift.
const SIDE = new Map([[CW * CH, CW], [W * H, W]]);
export const gridOf = (t) => SIDE.get(t.length) ?? Math.round(Math.sqrt(t.length));
const on = (t, x, y) => { const w = gridOf(t); return x >= 0 && y >= 0 && x < w && y < w; };
const tileOf = (t, x, y) => t[y * gridOf(t) + x];

export const walkable = (t, x, y) =>
  on(t, x, y) && tileOf(t, x, y) !== WALL && tileOf(t, x, y) !== RUBBLE && tileOf(t, x, y) !== GAP;
// Rubble is cover: you cannot stand in it and nothing can shoot through it.
// A gap is the opposite kind of obstacle — you cannot stand in it and everything
// can shoot straight across it. Until this existed, the game's two blocking
// tiles were byte-for-byte identical, so no drawn pillar could ever mean
// anything different from any other drawn pillar.
export const blocksSight = (t, x, y) =>
  !on(t, x, y) || tileOf(t, x, y) === WALL || tileOf(t, x, y) === RUBBLE;

function reachable(t, from, targets) {
  const seen = new Uint8Array(CW * CH);
  const q = [from];
  seen[cidx(from[0], from[1])] = 1;
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (!walkable(t, nx, ny) || seen[cidx(nx, ny)]) continue;
      seen[cidx(nx, ny)] = 1;
      q.push([nx, ny]);
    }
  }
  return targets.every(([x, y]) => seen[cidx(x, y)]);
}

// -------------------------------------------------------------- the delve --
// The order of a turn, and the reason the game is a puzzle rather than a
// gamble: intents are shown BEFORE you move, and an enemy carries out the
// intent it showed even if you stepped out of the way. Reading the board and
// making a monster hit empty air is the whole skill.
//
//   1. intents are visible          (the player can see every threatened tile)
//   2. the player acts              (move, strike, wait, descend, leave)
//   3. every enemy does what it said it would do
//   4. new intents are worked out and shown

export const GEN_VERSION = 6;

// how far the delver's own light reaches, in tiles
export const SIGHT = 8;
// how close the delver has to be before a thing starts hunting. Further than
// sight on purpose: what comes at you should arrive out of the dark.
export const WAKE = 13;
export const MAX_DEPTH = 30;
export const BASE_HP = 10, BASE_DMG = 3;

// ============================================================== the floor ==
// Sixteen chambers in a four-by-four grid, doors knocked between neighbours.
//
// WHY IT IS CONNECTED, rather than checked until it is. Every chamber gets its
// spine forced open first — the middle row and column of its interior, which
// assemblies already guarantee and drawn rooms now get too. Forcing tiles open
// can only add connectivity, never remove it, and a chamber's own floor is
// already proven connected, so after this a chamber is one piece with a cross
// through the middle of it.
//
// A door is then knocked exactly where two spines meet: between chambers side
// by side, that is the pair of border tiles at local (10,5) and (0,5), which
// sit against spine tiles (9,5) and (1,5). Opening them welds the two spines
// together. Doors are chosen as a random spanning tree over the sixteen
// chambers plus a few extras, so the floor is connected by construction and
// still has loops in it rather than being one forced corridor.
//
// The one thing this does NOT prove is that a chamber's own floor touches its
// own spine. It always does at these densities — a chamber carries about fifty
// walkable tiles across an eighty-one tile interior — but "always at these
// densities" is not a proof, so verify.test.mjs walks whole floors and counts.
const CHAMBER_MID = (CW - 1) / 2;

// Everything on the spine opens, GAPS INCLUDED. The first version spared them,
// on the reasoning that a hole is scenery — but an assembly deliberately drops
// gaps into its spine as fallen stone, and a spine with a hole in it is not a
// spine. Seventy-seven floors in three hundred came out with something stranded
// behind exactly that.
function forceSpine(t) {
  for (let i = 1; i < CW - 1; i++) {
    if (t[i * CW + CHAMBER_MID] !== FLOOR) t[i * CW + CHAMBER_MID] = FLOOR;
    if (t[CHAMBER_MID * CW + i] !== FLOOR) t[CHAMBER_MID * CW + i] = FLOOR;
  }
  return t;
}

// which neighbours get a door: a spanning tree so everything is reachable,
// plus a share of the remaining seams so the floor is a warren and not a line
function doorPlan(r) {
  const cells = GRID * GRID;
  const seams = [];
  for (let gy = 0; gy < GRID; gy++) for (let gx = 0; gx < GRID; gx++) {
    if (gx + 1 < GRID) seams.push([gy * GRID + gx, gy * GRID + gx + 1, 'x', gx, gy]);
    if (gy + 1 < GRID) seams.push([gy * GRID + gx, (gy + 1) * GRID + gx, 'y', gx, gy]);
  }
  const parent = Array.from({ length: cells }, (_, i) => i);
  const find = (a) => (parent[a] === a ? a : (parent[a] = find(parent[a])));
  const open = [];
  const spare = [];
  for (const seam of shuffled(r, seams)) {
    const ra = find(seam[0]), rb = find(seam[1]);
    if (ra === rb) { spare.push(seam); continue; }
    parent[ra] = rb;
    open.push(seam);
  }
  for (const seam of spare) if (r() < 0.34) open.push(seam);
  return open;
}

// How much of what the sixteen chambers each suggested actually survives onto
// the floor. A chamber drew its population for a board where it WAS the whole
// floor and you had to cross it; here you cross four of them to reach a stair,
// so keeping all of it put eighty bodies in the player's way. This is the one
// number that decides whether a big floor is an expedition or a slog.
// Floor-scale reachability. reachableFrom is chamber-scale — it allocates a
// CW*CH visited array — so handing it a 44x44 floor silently dropped every mark
// past tile 121 and the search never terminated. Two grid sizes, two searches;
// the predicates can infer their width from the array but a preallocated
// visited buffer cannot.
export function reachableOnFloor(tiles, from) {
  const seen = new Set();
  if (!walkable(tiles, from[0], from[1])) return seen;
  seen.add(`${from[0]},${from[1]}`);
  const q = [from];
  for (let head = 0; head < q.length; head++) {
    const [x, y] = q[head];
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      const k = `${nx},${ny}`;
      if (!walkable(tiles, nx, ny) || seen.has(k)) continue;
      seen.add(k);
      q.push([nx, ny]);
    }
  }
  return seen;
}

const CROWD = 0.35, LOOT = 0.2;
const FAR_FROM_SPAWN = 6;

function finishFloor(r, depth, tiles, chambers, spawnSpots, stairSpots, exitSpots, relics, enemies) {
  const stand = (x, y) => walkable(tiles, x, y);

  // wake in a chamber, at a tile that chamber already chose to wake you at
  const starts = shuffled(r, spawnSpots.filter(([x, y]) => stand(x, y)));
  const pos = starts[0] ? [starts[0][0], starts[0][1]] : [1, 1];

  // Reachability decides everything else. A stair you cannot walk to is worse
  // than no stair, and on a floor this size that is not something a player can
  // see at a glance the way they could on one screen.
  const seen = reachableOnFloor(tiles, pos);
  const reach = (x, y) => seen.has(`${x},${y}`);
  const away = (p, q) => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]);

  const stairPool = shuffled(r, stairSpots.filter(([x, y]) => stand(x, y) && reach(x, y)
    && away([x, y], pos) >= CW));
  const stairs = [];
  for (const [x, y] of stairPool) {
    if (stairs.length >= 2) break;
    if (stairs.some((p) => away(p, [x, y]) < CW * 1.5)) continue;
    stairs.push([x, y]);
  }
  // a floor always has two ways down; if the spread could not be met, take the
  // furthest reachable pair rather than shipping a floor with one
  for (const [x, y] of stairPool) {
    if (stairs.length >= 2) break;
    if (stairs.some((p) => p[0] === x && p[1] === y)) continue;
    stairs.push([x, y]);
  }
  for (const p of stairs) tiles[idx(p[0], p[1])] = STAIRS;

  let exit = null;
  if (hasExit(depth)) {
    const pool = shuffled(r, exitSpots.filter(([x, y]) => stand(x, y) && reach(x, y)
      && away([x, y], pos) >= FAR_FROM_SPAWN
      && stairs.every((p) => away(p, [x, y]) >= 4)));
    if (pool.length) { exit = [pool[0][0], pool[0][1]]; tiles[idx(exit[0], exit[1])] = EXIT; }
  }

  const taken = new Set([key(pos), ...stairs.map(key)]);
  if (exit) taken.add(key(exit));

  const keptLoot = shuffled(r, relics.filter((g) => reach(g.x, g.y) && !taken.has(key([g.x, g.y]))))
    .filter(() => r() < LOOT);
  for (const g of keptLoot) taken.add(key([g.x, g.y]));

  const keptFoes = shuffled(r, enemies.filter((e) => reach(e.x, e.y)
    && !taken.has(key([e.x, e.y])) && away([e.x, e.y], pos) >= 4))
    .filter(() => r() < CROWD)
    .map((e, i) => ({ ...e, id: i }));

  return {
    tiles, pos, stairs, stair: stairs[0], exit,
    relics: keptLoot, enemies: keptFoes, depth,
    room: `grid:${chambers.map((c) => c.c.room).slice(0, 2).join('+')}+…`,
    variant: 0, assembled: true,
  };
}

export function genFloor(seed, depth, door = 0, force = null) {
  const r = rng(floorSeed(seed, depth, door));
  const tiles = new Uint8Array(W * H).fill(WALL);
  const chambers = [];
  const enemies = [];
  const relics = [];
  const stairSpots = [];
  const spawnSpots = [];
  const exitSpots = [];

  for (let gy = 0; gy < GRID; gy++) for (let gx = 0; gx < GRID; gx++) {
    const cell = gy * GRID + gx;
    // each chamber is its own dungeon floor, seeded from where it sits, so the
    // same floor rebuilds identically and neighbours never repeat each other
    const c = genChamber(`${seed}:${gx},${gy}`, depth, door, force);
    forceSpine(c.tiles);
    const ox = gx * CW, oy = gy * CH;
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
      tiles[idx(ox + x, oy + y)] = c.tiles[y * CW + x];
    }
    chambers.push({ gx, gy, cell, ox, oy, c });
    // a chamber's own suggestions, moved into floor coordinates
    for (const p of [c.pos]) spawnSpots.push([ox + p[0], oy + p[1], cell]);
    for (const p of c.stairs) stairSpots.push([ox + p[0], oy + p[1], cell]);
    if (c.exit) exitSpots.push([ox + c.exit[0], oy + c.exit[1], cell]);
    for (const g of c.relics) relics.push({ ...g, x: ox + g.x, y: oy + g.y, cell });
    for (const e of c.enemies) enemies.push({ ...e, x: ox + e.x, y: oy + e.y, cell });
  }

  // the stairs a chamber drew are just floor now — a FLOOR has two ways down,
  // not thirty-two — and so is any exit it drew
  for (const [x, y] of stairSpots) tiles[idx(x, y)] = FLOOR;
  for (const [x, y] of exitSpots) tiles[idx(x, y)] = FLOOR;

  // knock the doors
  for (const [, , axis, gx, gy] of doorPlan(r)) {
    if (axis === 'x') {
      const y = gy * CH + CHAMBER_MID;
      tiles[idx(gx * CW + CW - 1, y)] = FLOOR;
      tiles[idx((gx + 1) * CW, y)] = FLOOR;
    } else {
      const x = gx * CW + CHAMBER_MID;
      tiles[idx(x, gy * CH + CH - 1)] = FLOOR;
      tiles[idx(x, (gy + 1) * CH)] = FLOOR;
    }
  }

  return finishFloor(r, depth, tiles, chambers, spawnSpots, stairSpots, exitSpots, relics, enemies);
}

export class Run {
  constructor(seed) {
    this.seed = String(seed);
    this.er = rng(hashStr(`${seed}:events`));
    this.acts = [];
    this.depth = 0;
    this.carried = [];
    this.felled = 0;
    this.turn = 0;
    this.over = false;
    this.out = false;              // true only if you walked out with the loot
    this.log = [];
    this.hp = BASE_HP;
    this.enterFloor(1);
    this.hp = this.maxHp();
  }

  // ---- what the relics in your pack are worth -----------------------------
  count(effect, cap = 3) { return Math.min(cap, this.carried.filter((r) => r.effect === effect).length); }
  maxHp() { return BASE_HP + this.count('vigour') * 2; }
  dmg() { return BASE_DMG + this.count('bite', 2); }

  enterFloor(depth, door = 0) {
    const f = genFloor(this.seed, depth, door);
    this.depth = depth;
    this.door = door;
    this.tiles = f.tiles;
    this.x = f.pos[0]; this.y = f.pos[1];
    this.stairs = f.stairs;
    this.stair = f.stairs[0];
    this.exit = f.exit;
    this.ground = f.relics;
    this.enemies = f.enemies;
    this.guard = this.count('guard') > 0;   // one hit turned per floor, not per run
    this.floorName = floorName(depth);
    this.known = new Uint8Array(W * H);
    this.visible = new Set();
    this.peeks = [this.peek(0), this.peek(1)];
    this.look();
    this.think();
  }

  at(x, y) { return this.tiles[idx(x, y)]; }

  // WHAT YOU CAN SEE, and why it decides what moves.
  //
  // On one screen the promise was simple: every enemy was visible and every one
  // of them showed the exact tiles it was about to strike. A 44x44 floor cannot
  // put everything on screen, so the promise is kept the other way round — an
  // enemy that cannot see you does not act. Break line of sight and the thing
  // chasing you stops where it is. Nothing can ever hit you from a tile you
  // could not have looked at, and slipping behind a pillar is a real move.
  sight() {
    const vis = new Set([`${this.x},${this.y}`]);
    for (let dy = -SIGHT; dy <= SIGHT; dy++) for (let dx = -SIGHT; dx <= SIGHT; dx++) {
      if (dx * dx + dy * dy > SIGHT * SIGHT) continue;
      const tx = this.x + dx, ty = this.y + dy;
      if (!inBounds(tx, ty) || vis.has(`${tx},${ty}`)) continue;
      if (this.clearTo(tx, ty)) vis.add(`${tx},${ty}`);
    }
    return vis;
  }

  // A straight look from the delver to one tile. The tile itself may be a wall
  // — you can see the wall you cannot walk through — so only what lies strictly
  // between the two counts.
  clearTo(tx, ty) {
    let x = this.x, y = this.y;
    const dx = Math.abs(tx - x), dy = Math.abs(ty - y);
    const sx = x < tx ? 1 : -1, sy = y < ty ? 1 : -1;
    let err = dx - dy;
    for (;;) {
      if (x === tx && y === ty) return true;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
      if (x === tx && y === ty) return true;
      if (blocksSight(this.tiles, x, y)) return false;
    }
  }

  look() {
    this.visible = this.sight();
    for (const k of this.visible) {
      const [x, y] = k.split(',');
      this.known[idx(+x, +y)] = 1;
    }
  }

  canSee(x, y) { return this.visible.has(`${x},${y}`); }
  doorAt(x, y) { const i = this.stairs.findIndex((p) => p[0] === x && p[1] === y); return i < 0 ? 0 : i; }

  // What waits below a stair, without going down it. This says what the floor is
  // WORTH and never how dangerous it is — you must be able to tell which door
  // pays more, and never which one is safer, or the greed stops being a gamble.
  peek(door) {
    if (this.depth >= MAX_DEPTH) return null;
    const f = genFloor(this.seed, this.depth + 1, door);
    if (!f.relics.length) return null;
    const best = f.relics.reduce((b2, g) =>
      (TIERS.indexOf(g.relic.tier) > TIERS.indexOf(b2.relic.tier) ? g : b2), f.relics[0]);
    return { tier: best.relic.tier, name: best.relic.name, blurb: best.relic.blurb, floor: floorName(this.depth + 1) };
  }
  foeAt(x, y) { return this.enemies.find((e) => e.hp > 0 && e.x === x && e.y === y); }

  // ---- step 4: what everything is about to do ----------------------------
  think() {
    for (const e of this.enemies) {
      if (e.hp <= 0) { e.intent = null; continue; }
      // Asleep until the delver is close, and then it hunts — through walls,
      // out of the dark, whether or not it can be seen coming.
      //
      // The first version froze anything the delver could not see, which was
      // safe and dull: a floor this size let you walk around fifty monsters.
      // Waking them costs nothing, because the guarantee never depended on
      // seeing an enemy MOVE — it depends on seeing it WIND UP. Nothing in this
      // ruleset deals damage without a telegraph the turn before, and every
      // telegraph needs the delver in reach: a husk must be adjacent, a
      // sentinel adjacent, a spitter on a clear line. All three of those are
      // positions the delver can see from. So a thing can cross a dark room at
      // you, but it cannot touch you on the turn you first meet it.
      const near = Math.abs(e.x - this.x) + Math.abs(e.y - this.y);
      if (near > WAKE && !this.canSee(e.x, e.y)) { e.intent = null; e.wind = null; continue; }
      if (e.wind) { e.intent = { type: 'strike', tiles: e.wind }; continue; }
      e.intent = this.planFor(e);
    }
  }

  planFor(e) {
    const K = KINDS[e.kind];
    const near = Math.abs(e.x - this.x) + Math.abs(e.y - this.y);

    if (e.kind === 'sentinel') {
      e.tick = (e.tick || 0) + 1;
      if (near === 1) return { type: 'aim', tiles: this.sweepFrom(e) };
      if (e.tick % K.every !== 0) return { type: 'rest', tiles: [] };
      return this.stepIntent(e);
    }
    if (e.kind === 'spitter') {
      const line = this.lineFrom(e, K.reach);
      if (line) return { type: 'aim', tiles: line };
      return this.stepIntent(e);
    }
    if (near === 1) return { type: 'strike', tiles: [[this.x, this.y]] };
    return this.stepIntent(e);
  }

  // Greedy chase: the axis it is furthest out on, then the other, then — if it
  // is lined up with you and walled off along that line — around the side.
  stepIntent(e) {
    const dx = this.x - e.x, dy = this.y - e.y;
    const tries = Math.abs(dx) >= Math.abs(dy)
      ? [[Math.sign(dx), 0], [0, Math.sign(dy)]]
      : [[0, Math.sign(dy)], [Math.sign(dx), 0]];
    if (!dy) tries.push([0, 1], [0, -1]);
    if (!dx) tries.push([1, 0], [-1, 0]);
    for (const [mx, my] of tries) {
      if (!mx && !my) continue;
      const nx = e.x + mx, ny = e.y + my;
      if (walkable(this.tiles, nx, ny) && !this.foeAt(nx, ny)) return { type: 'step', tiles: [[nx, ny]] };
    }
    return { type: 'rest', tiles: [] };
  }

  // a straight run of tiles to the player, stopped by walls and by rubble —
  // which is what makes a lump of fallen masonry worth standing behind
  lineFrom(e, reach) {
    for (const [dx, dy] of DIRS) {
      const tiles = [];
      for (let i = 1; i <= reach; i++) {
        const nx = e.x + dx * i, ny = e.y + dy * i;
        if (blocksSight(this.tiles, nx, ny)) break;
        tiles.push([nx, ny]);
        if (nx === this.x && ny === this.y) return tiles;
      }
    }
    return null;
  }

  // three tiles at once: where you stand and the two either side of it
  sweepFrom(e) {
    const dx = Math.sign(this.x - e.x), dy = Math.sign(this.y - e.y);
    const out = [[e.x + dx, e.y + dy]];
    if (dx) { out.push([e.x + dx, e.y - 1], [e.x + dx, e.y + 1]); }
    else { out.push([e.x - 1, e.y + dy], [e.x + 1, e.y + dy]); }
    return out.filter(([x, y]) => inBounds(x, y));
  }

  // ---- step 2 and 3: the player acts, then everything else does ----------
  act(a) {
    if (this.over) return { ok: false, why: 'the delve is finished' };
    const done = this.doPlayer(a);
    if (!done.ok) return done;
    this.acts.push(a);
    this.turn++;
    if (!this.over) { this.look(); this.doEnemies(); this.look(); this.think(); }
    return done;
  }

  doPlayer(a) {
    if (a.t === 'w') { this.say('you hold still'); return { ok: true }; }

    if (a.t === 'd') {
      if (this.at(this.x, this.y) !== STAIRS) return { ok: false, why: 'no stair here' };
      const door = this.doorAt(this.x, this.y);
      const mend = Math.min(4, this.count('mend') * 2);
      if (mend) this.hp = Math.min(this.maxHp(), this.hp + mend);
      if (this.depth >= MAX_DEPTH) { this.over = true; this.out = true; return { ok: true }; }
      this.enterFloor(this.depth + 1, door);
      this.say(`you go down into ${this.floorName}`);
      return { ok: true, descended: true };
    }

    if (a.t === 'x') {
      if (this.at(this.x, this.y) !== EXIT) return { ok: false, why: 'no way out here' };
      this.over = true; this.out = true;
      this.say('you climb out into the light');
      return { ok: true, extracted: true };
    }

    if (a.t !== 'm') return { ok: false, why: 'unknown move' };
    const d = DIRS[a.d];
    if (!d) return { ok: false, why: 'unknown direction' };
    const nx = this.x + d[0], ny = this.y + d[1];

    const foe = this.foeAt(nx, ny);
    if (foe) {
      foe.hp -= this.dmg();
      if (foe.hp <= 0) {
        this.felled++;
        this.say(`the ${KINDS[foe.kind].name.toLowerCase()} falls`);
        this.maybeDrop(foe);
      } else this.say(`you strike the ${KINDS[foe.kind].name.toLowerCase()}`);
      return { ok: true, hit: foe };
    }

    if (!walkable(this.tiles, nx, ny)) return { ok: false, why: 'blocked' };
    this.x = nx; this.y = ny;
    const found = this.ground.findIndex((g) => g.x === nx && g.y === ny);
    if (found >= 0) {
      const [got] = this.ground.splice(found, 1);
      this.carried.push(got.relic);
      this.hp = Math.min(this.hp, this.maxHp());
      this.say(`you take the ${got.relic.name}`);
      return { ok: true, took: got.relic };
    }
    return { ok: true };
  }

  // a sigil in your pack makes the dead more generous. Drawn from the run's own
  // event stream so a replay of the same moves finds the same things.
  maybeDrop(foe) {
    const chance = Math.min(0.30, 0.07 + this.count('luck') * 0.07);
    if (this.er() >= chance) return;
    const r = rng(hashStr(`${this.seed}:drop:${this.depth}:${foe.id}`));
    this.ground.push({ x: foe.x, y: foe.y, relic: makeRelic(r, this.depth) });
    this.say('something glints where it fell');
  }

  doEnemies() {
    for (const e of this.enemies) {
      if (e.hp <= 0 || !e.intent) continue;
      const it = e.intent;
      if (it.type === 'aim') { e.wind = it.tiles; continue; }
      if (it.type === 'step') {
        const [nx, ny] = it.tiles[0];
        if (walkable(this.tiles, nx, ny) && !this.foeAt(nx, ny) && !(nx === this.x && ny === this.y)) {
          e.x = nx; e.y = ny;
        }
        continue;
      }
      if (it.type === 'strike') {
        e.wind = null;
        if (it.tiles.some(([x, y]) => x === this.x && y === this.y)) this.wound(KINDS[e.kind]);
      }
    }
    if (this.hp <= 0) { this.over = true; this.out = false; this.say('the dark takes you'); }
  }

  wound(K) {
    if (this.guard) { this.guard = false; this.say('your ward turns the blow'); return; }
    const d = K.dmg + dmgBonus(this.depth);
    this.hp -= d;
    this.say(`the ${K.name.toLowerCase()} hits you for ${d}`);
  }

  say(line) { this.log.push({ turn: this.turn, depth: this.depth, line }); if (this.log.length > 60) this.log.shift(); }

  // every tile something has promised to hit this turn, for the renderer
  threat() {
    const m = new Map();
    for (const e of this.enemies) {
      if (e.hp <= 0 || !e.intent) continue;
      if (e.intent.type === 'step' || e.intent.type === 'rest') continue;
      for (const [x, y] of e.intent.tiles) m.set(`${x},${y}`, e.intent.type);
    }
    return m;
  }

  // ---- what you walked out with ------------------------------------------
  score() {
    const tierPts = { common: 10, rare: 40, epic: 120, mythic: 400 };
    const loot = this.out ? this.carried.reduce((a, r) => a + tierPts[r.tier], 0) : 0;
    return (this.out ? this.depth * 100 : 0) + loot + this.felled * 5;
  }

  summary() {
    return {
      gen: GEN_VERSION,
      seed: this.seed, depth: this.depth, floor: this.floorName,
      out: this.out, hp: Math.max(0, this.hp), maxHp: this.maxHp(),
      felled: this.felled, turns: this.turn, score: this.score(),
      // Died and you carry nothing out. That is the whole game, and it is also
      // the share card people actually post.
      kept: this.out ? this.carried : [],
      lost: this.out ? [] : this.carried,
      best: this.carried.reduce((b, r) => (TIERS.indexOf(r.tier) > TIERS.indexOf(b?.tier || 'common') ? r : b), this.carried[0] || null),
    };
  }
}

// A run is a seed and a list of moves. Replaying those two things must produce
// the identical run — this is the function a server will call to check that a
// relic somebody wants to sell was actually pulled out of the dark.
export function replay(seed, acts) {
  const run = new Run(seed);
  for (const a of acts) {
    const r = run.act(a);
    if (!r.ok) return { error: `illegal move on turn ${run.turn}: ${r.why}` };
    if (run.over) break;
  }
  return { run, summary: run.summary() };
}
