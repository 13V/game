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

// ----------------------------------------------------------------- the gear --
// Everything you can pick up is an ITEM with a SLOT. What used to be "relics"
// splits four ways:
//
//   weapon    changes the SHAPE of your attack, not just the number
//   armour    changes what a hit does to you
//   charm     a passive riding in your pack, stacking with caps (the old tools)
//   treasure  worth carrying out, and nothing else
//
// Rarity is one system for all of them: the tier scales the numbers, and the
// tier colours the name everywhere it appears.
//
// WEAPONS are geometry first. A blade is the plain answer; a spear strikes two
// tiles down a line, over a hole if it has to; a maul throws the body it hits
// one tile backward, and hits harder when there is nowhere to throw it; fangs
// bite back at anything that strikes you from beside you. Numbers are close on
// purpose — you choose a shape of fighting, not a bigger number.
export const WEAPONS = {
  blade: { noun: 'Blade', dmg: 3, blurb: 'a plain answer: strikes the tile beside you' },
  spear: { noun: 'Spear', dmg: 2, reach: 2, blurb: 'strikes up to two tiles down a line, over a gap' },
  maul:  { noun: 'Maul',  dmg: 2, shove: true, blurb: 'throws what it hits one tile back — harder against a wall' },
  fangs: { noun: 'Fangs', dmg: 2, riposte: 1, blurb: 'anything that strikes you from beside you bleeds for it' },
};
export const ARMOURS = {
  jerkin: { noun: 'Jerkin', dodge: 1, blurb: 'the first hit each floor misses you' },
  mail:   { noun: 'Mail',   soak: 1,  blurb: 'every hit is softened by one' },
  plate:  { noun: 'Plate',  soak: 2,  deep: true, blurb: 'every hit is softened by two' },
};
const CHARMS = [
  { id: 'fang', noun: 'Fang', effect: 'bite', blurb: 'strike +1' },
  { id: 'crown', noun: 'Crown', effect: 'vigour', blurb: 'max health +2' },
  { id: 'ward', noun: 'Ward', effect: 'guard', blurb: 'the first hit each floor is turned' },
  { id: 'draught', noun: 'Draught', effect: 'mend', blurb: 'heal 2 on the stair' },
  { id: 'coin', noun: 'Sigil', effect: 'luck', blurb: 'relics fall more often' },
];
const TREASURE = [
  { id: 'idol', noun: 'Idol' }, { id: 'torc', noun: 'Torc' },
  { id: 'reliquary', noun: 'Reliquary' }, { id: 'chalice', noun: 'Chalice' },
  { id: 'seal', noun: 'Seal' }, { id: 'bead', noun: 'Bead-string' },
  { id: 'mask', noun: 'Death-mask' },
];

const PLACES = ['Ashvale', 'Coldiron', 'Salt', 'Mirefen', 'Gravemoor', 'Hollow', 'Thistle', 'Rookmoor', 'Blackmarl', 'Dunmere'];
export const FLOOR_NAMES = ['The Sump', 'Salt Warrens', 'The Kiln', 'Bone Gallery', 'The Drowned Stair',
  'Ashvault', 'The Long Dark', 'Gravemoor Deep', 'The Cold Mouth', 'Nether Warrens'];

export const floorName = (depth) => FLOOR_NAMES[(depth - 1) % FLOOR_NAMES.length]
  + (depth > FLOOR_NAMES.length ? ` ${Math.floor((depth - 1) / FLOOR_NAMES.length) + 1}` : '');

const tierIdx = (t) => TIERS.indexOf(t);

export function makeItem(r, depth, luckDepth = depth) {
  const tier = tierFor(r, luckDepth);
  const place = pick(r, PLACES);
  const roll_ = r();
  const power = tierIdx(tier) + 1;
  const base = { tier, power, depth };
  if (roll_ < 0.36) {                                    // treasure
    const f = pick(r, TREASURE);
    return { ...base, id: `${f.id}-${roll(r, 1e9)}`, slot: 'treasure', form: f.id,
      name: `${place} ${f.noun}`, effect: 'none', blurb: 'worth carrying out' };
  }
  if (roll_ < 0.64) {                                    // charm
    const f = pick(r, CHARMS);
    return { ...base, id: `${f.id}-${roll(r, 1e9)}`, slot: 'charm', form: f.id,
      name: `${place} ${f.noun}`, effect: f.effect, blurb: f.blurb };
  }
  if (roll_ < 0.86) {                                    // weapon
    const forms = Object.keys(WEAPONS);
    const form = forms[roll(r, forms.length)];
    return { ...base, id: `${form}-${roll(r, 1e9)}`, slot: 'weapon', form,
      name: `${place} ${WEAPONS[form].noun}`, effect: 'none', blurb: WEAPONS[form].blurb };
  }
  const forms = Object.keys(ARMOURS).filter((f) => !ARMOURS[f].deep || tierIdx(tier) >= 2);
  const form = forms[roll(r, forms.length)];
  return { ...base, id: `${form}-${roll(r, 1e9)}`, slot: 'armour', form,
    name: `${place} ${ARMOURS[form].noun}`, effect: 'none', blurb: ARMOURS[form].blurb };
}

// the relic name survives: everything below the Run still calls makeRelic
export const makeRelic = makeItem;

// What you walk in with. The blade is nobody's and everybody's; a loadout is
// whatever the camp sent you down with, and it comes back with you even when
// the dungeon keeps everything else.
export function starterKit() {
  return {
    weapon: { id: 'starter-blade', slot: 'weapon', form: 'blade', tier: 'common',
      name: 'Camp Blade', power: 1, blurb: WEAPONS.blade.blurb, owned: true },
    armour: null,
    charm: null,
  };
}

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
export function genChamber(seed, depth, door = 0, force = null, wantRoom = null) {
  const r = rng(floorSeed(seed, depth, door));
  const assembled = force === null ? r() < ASSEMBLY_SHARE : (r(), force);
  return assembled
    ? assemble(r, depth, String(seed), door)
    : buildFloor(r, depth, String(seed), door, wantRoom);
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

function buildFloor(r, depth, seed, door, wantRoom = null) {
  const rich = depth > 1 && door === richDoor(seed, depth);
  // A floor may ask for a particular room by name, because on a 44x44 floor the
  // chamber you wake in and the chamber holding the hoard should not be drawn
  // from the same hat as everything else. Ask for nothing and it behaves
  // exactly as it always did.
  const named = wantRoom === null ? -1 : ROOMS.findIndex((x) => x.id === wantRoom);
  const room = named >= 0 ? ROOMS[named] : ROOMS[roomIndexFor(seed, depth, door)];
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

export const GEN_VERSION = 8;

// how far the delver's own light reaches, in tiles
export const SIGHT = 8;
// how close the delver has to be before a thing starts hunting. Further than
// sight on purpose: what comes at you should arrive out of the dark.
export const WAKE = 13;
export const MAX_DEPTH = 30;
export const BASE_HP = 10, BASE_DMG = 3;

// ============================================================== the floor ==
// Sixteen chambers in a four-by-four grid, with the seams between them opened.
//
// WHY IT IS CONNECTED, rather than checked until it is. Every chamber gets its
// spine forced open first — the middle row and column of its interior, which
// assemblies already guarantee and drawn rooms now get too. Forcing tiles open
// can only add connectivity, never remove it, and a chamber's own floor is
// already proven connected, so after this a chamber is one piece with a cross
// through the middle of it.
//
// A seam then opens somewhere along its length, and a stub is carved from the
// opening inward until it meets that cross — so every opening reaches the room
// behind it whatever the room looks like. The seams that open are a random
// spanning tree over the sixteen chambers plus a third of the rest, so the
// floor is connected by construction and still has loops in it.
//
// The cross itself is scaffolding. Once the openings exist and are reachable,
// finishFloor takes most of it back one tile at a time, keeping a tile only
// while the whole floor is still one piece — which is what stops all sixteen
// chambers having an identical cut through the middle of them.
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

// Floor-scale reachability, as a set of keys. reachableFrom is chamber-scale —
// it preallocates a CW*CH visited array — so handing it a 44x44 floor silently
// dropped every mark past tile 121 and the search never terminated.
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

// ---------------------------------------------------------- the floor plan --
// Sixteen chambers is not a floor, it is sixteen rooms in a filing cabinet. The
// first version of this made every one of them the same: a door at the middle
// of every seam, a forced cross of open floor through every chamber, and the
// population sprinkled evenly over the lot. Printed as a plan it read as graph
// paper, and it played like it — nowhere on the floor meant anything different
// from anywhere else.
//
// So the plan decides three things before a single tile is placed: where the
// seams open and how wide, how far every chamber is from the one you wake in,
// and what each chamber is FOR.

// how wide a seam opens
const SEAM_DOOR = 0, SEAM_ARCH = 1, SEAM_HALL = 2;

function planSeams(r) {
  const cells = GRID * GRID;
  const seams = [];
  for (let gy = 0; gy < GRID; gy++) for (let gx = 0; gx < GRID; gx++) {
    if (gx + 1 < GRID) seams.push({ a: gy * GRID + gx, b: gy * GRID + gx + 1, axis: 'x', gx, gy });
    if (gy + 1 < GRID) seams.push({ a: gy * GRID + gx, b: (gy + 1) * GRID + gx, axis: 'y', gx, gy });
  }
  const parent = Array.from({ length: cells }, (_, i) => i);
  const find = (a) => (parent[a] === a ? a : (parent[a] = find(parent[a])));
  const open = [], spare = [];
  for (const seam of shuffled(r, seams)) {
    const ra = find(seam.a), rb = find(seam.b);
    if (ra === rb) { spare.push(seam); continue; }
    parent[ra] = rb;
    open.push(seam);
  }
  for (const seam of spare) if (r() < 0.34) open.push(seam);

  // A door in the middle of every seam is the single strongest reason the plan
  // looked machine-made. Most openings move along the seam; a few widen into an
  // arch, and two or three go away entirely so that two chambers read as one
  // long hall — which is the only thing on this floor that changes the SIZE of
  // a room rather than its furniture.
  let halls = 2 + (r() < 0.5 ? 1 : 0);
  for (const seam of shuffled(r, open.slice())) {
    if (halls > 0 && r() < 0.5) { seam.kind = SEAM_HALL; halls--; continue; }
    seam.kind = r() < 0.3 ? SEAM_ARCH : SEAM_DOOR;
    // anywhere along the seam except hard against the corners
    seam.at = 2 + Math.floor(r() * (CW - 4));
  }
  return open;
}

// The chamber graph, walked out from where the delver wakes. Everything else —
// what lives where, what is worth carrying, where the stairs are — hangs off
// this number, so that walking further into a floor means something.
function chamberDepths(seams, from) {
  const near = Array.from({ length: GRID * GRID }, () => []);
  for (const s of seams) { near[s.a].push(s.b); near[s.b].push(s.a); }
  const d = new Int8Array(GRID * GRID).fill(-1);
  d[from] = 0;
  const q = [from];
  for (let i = 0; i < q.length; i++) {
    for (const n of near[q[i]]) if (d[n] < 0) { d[n] = d[q[i]] + 1; q.push(n); }
  }
  return d;
}

// WHAT A CHAMBER IS FOR. Roles come from the graph, not from a roll, so a floor
// always has the same shape of experience even though it never has the same
// rooms: somewhere quiet to wake up, a couple of easy rooms, a long dangerous
// middle, one room worth the trip, and a guard on each way down.
// The rooms a role is built from. A hoard should read as a hoard before the
// delver has seen a single relic in it, and the chamber you wake in should not
// be a gauntlet. Everything else still comes from the hat.
const ROLE_ROOMS = {
  mouth: ['antechamber', 'twohalls', 'crossing'],
  approach: ['shooting', 'causeway', 'crossing', 'split'],
  warren: ['comb', 'cells', 'larder', 'spiral'],
  deep: ['rubblefield', 'gauntlet', 'pincer', 'ledges'],
  gate: ['gauntlet', 'split', 'well'],
  hoard: ['vault', 'well', 'larder'],
};

const ROLE = {
  mouth:    { foes: 0.0, loot: 0.0, heavy: 0 },
  approach: { foes: 0.35, loot: 0.5, heavy: 0 },
  warren:   { foes: 0.8, loot: 0.8, heavy: 0 },
  deep:     { foes: 1.0, loot: 1.0, heavy: 1 },
  gate:     { foes: 1.0, loot: 0.6, heavy: 1 },
  hoard:    { foes: 1.0, loot: 3.0, heavy: 2 },
};

function assignRoles(depths, hoardCell, gateCells) {
  const roles = [];
  for (let i = 0; i < depths.length; i++) {
    const d = depths[i];
    roles.push(d === 0 ? 'mouth' : d <= 1 ? 'approach' : d <= 2 ? 'warren' : 'deep');
  }
  for (const g of gateCells) if (roles[g] !== 'mouth') roles[g] = 'gate';
  if (roles[hoardCell] !== 'mouth') roles[hoardCell] = 'hoard';
  return roles;
}

// Floor-scale flood, on a byte array rather than a Set of strings, because the
// erosion pass below runs it once per attempt and the string version is far too
// slow to do that forty times a floor.
function floodCount(tiles, from) {
  const seen = new Uint8Array(tiles.length);
  const q = new Int32Array(tiles.length);
  let head = 0, tail = 0, n = 0;
  const start = from[1] * W + from[0];
  seen[start] = 1; q[tail++] = start; n = 1;
  while (head < tail) {
    const i = q[head++];
    const x = i % W, y = (i - x) / W;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (seen[j]) continue;
      const t = tiles[j];
      if (t === WALL || t === RUBBLE || t === GAP) continue;
      seen[j] = 1; q[tail++] = j; n++;
    }
  }
  return n;
}

const openTiles = (tiles) => {
  let n = 0;
  for (const t of tiles) if (t === FLOOR || t === STAIRS || t === EXIT) n++;
  return n;
};

export function genFloor(seed, depth, door = 0, force = null) {
  const r = rng(floorSeed(seed, depth, door));

  // THE PLAN COMES FIRST. Seams, then how far every chamber is from the one you
  // wake in, then what each chamber is for — all decided before a single tile
  // is placed, so a chamber can be BUILT as what it is rather than dressed up
  // as it afterwards.
  const seams = planSeams(r);
  const rim = [];
  for (let gy = 0; gy < GRID; gy++) for (let gx = 0; gx < GRID; gx++) {
    if (gx === 0 || gy === 0 || gx === GRID - 1 || gy === GRID - 1) rim.push(gy * GRID + gx);
  }
  const mouth = shuffled(r, rim)[0];
  const depths = chamberDepths(seams, mouth);
  const ranked = [...depths].map((d, i) => [d, i]).filter(([d]) => d >= 0).sort((a, b) => b[0] - a[0]);
  const hoardCell = ranked.length ? ranked[0][1] : mouth;
  const gateCells = ranked.filter(([, i]) => i !== hoardCell && i !== mouth).slice(0, 2).map(([, i]) => i);
  const roles = assignRoles(depths, hoardCell, gateCells);

  const tiles = new Uint8Array(W * H).fill(WALL);
  const chambers = [];
  for (let gy = 0; gy < GRID; gy++) for (let gx = 0; gx < GRID; gx++) {
    const cell = gy * GRID + gx;
    const pool = ROLE_ROOMS[roles[cell]];
    // the mouth and the hoard are always drawn rooms so they are recognisable;
    // everything else may still be an assembly, which is where the variety is
    const named = pool ? pool[Math.floor(r() * pool.length)] : null;
    const pinned = roles[cell] === 'mouth' || roles[cell] === 'hoard' ? false : force;
    const c = genChamber(`${seed}:${gx},${gy}`, depth, door, pinned, named);
    forceSpine(c.tiles);
    const ox = gx * CW, oy = gy * CH;
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
      tiles[idx(ox + x, oy + y)] = c.tiles[y * CW + x];
    }
    chambers.push({ gx, gy, cell, ox, oy, c, role: roles[cell] });
  }

  // a chamber drew its own stairs and its own way out; a FLOOR has two ways
  // down and one way out, so those are plain floor until the plan says
  for (const ch of chambers) {
    for (const p of ch.c.stairs) tiles[idx(ch.ox + p[0], ch.oy + p[1])] = FLOOR;
    if (ch.c.exit) tiles[idx(ch.ox + ch.c.exit[0], ch.oy + ch.c.exit[1])] = FLOOR;
  }

  const doorTiles = new Set();   // everything the erosion pass must not take back
  const frames = new Set();      // just the tiles ON a seam, which the renderer frames
  const cut = (x, y) => { tiles[idx(x, y)] = FLOOR; doorTiles.add(idx(x, y)); };
  const gap = (x, y) => { cut(x, y); frames.add(idx(x, y)); };
  for (const seam of seams) {
    const { axis, gx, gy, kind } = seam;
    if (kind === SEAM_HALL) {
      // the whole wall goes: two chambers become one long room, and that is the
      // only thing on this floor that changes the SIZE of a space
      for (let i = 1; i < CW - 1; i++) {
        if (axis === 'x') { cut(gx * CW + CW - 1, gy * CH + i); cut((gx + 1) * CW, gy * CH + i); }
        else { cut(gx * CW + i, gy * CH + CH - 1); cut(gx * CW + i, (gy + 1) * CH); }
      }
      // a hall has no doorway — that is what makes it read as one room
      continue;
    }
    for (const off of kind === SEAM_ARCH ? [0, 1] : [0]) {
      const at = Math.min(CW - 2, seam.at + off);
      if (axis === 'x') {
        const y = gy * CH + at;
        gap(gx * CW + CW - 1, y); gap((gx + 1) * CW, y);
        // a stub inward until it meets the spine, so an opening always reaches
        // the room behind it whatever that room turned out to look like
        for (let k = CHAMBER_MID; k < CW - 1; k++) cut(gx * CW + k, y);
        for (let k = 1; k <= CHAMBER_MID; k++) cut((gx + 1) * CW + k, y);
      } else {
        const x = gx * CW + at;
        gap(x, gy * CH + CH - 1); gap(x, (gy + 1) * CH);
        for (let k = CHAMBER_MID; k < CH - 1; k++) cut(x, gy * CH + k);
        for (let k = 1; k <= CHAMBER_MID; k++) cut(x, (gy + 1) * CH + k);
      }
    }
  }

  const spineTiles = [];
  for (const ch of chambers) {
    for (let i = 1; i < CW - 1; i++) {
      if (i === CHAMBER_MID) continue;
      spineTiles.push(idx(ch.ox + i, ch.oy + CHAMBER_MID));
      spineTiles.push(idx(ch.ox + CHAMBER_MID, ch.oy + i));
    }
  }
  return finishFloor(r, depth, tiles, chambers,
    { seams, depths, roles, mouth, hoardCell, gateCells, frames }, spineTiles, doorTiles);
}

// How much of what the sixteen chambers each suggested actually survives onto
// the floor. A chamber drew its population for a board where it WAS the whole
// floor and you had to cross it; here you cross four of them to reach a stair.
// These are the floor-wide dials; ROLE decides how each chamber spends them.
const CROWD = 0.4, LOOT = 0.24;

function finishFloor(r, depth, tiles, chambers, plan, spineTiles, doorTiles) {
  const { depths, roles, mouth, hoardCell, gateCells, frames } = plan;
  const stand = (x, y) => walkable(tiles, x, y);
  const away = (p, q) => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]);
  const cellOf = (x, y) => Math.floor(y / CH) * GRID + Math.floor(x / CW);

  // ---- where you wake, inside the chamber the plan set aside for it
  const mc = chambers[mouth];
  let pos = [mc.ox + mc.c.pos[0], mc.oy + mc.c.pos[1]];
  if (!stand(pos[0], pos[1])) pos = [mc.ox + CHAMBER_MID, mc.oy + CHAMBER_MID];

  const reach0 = reachableOnFloor(tiles, pos);
  const canWalk = (x, y) => reach0.has(`${x},${y}`);

  // ---- a way down in each of the two chambers the plan named as gates, and if
  // one of them cannot take it, the deepest reachable tile that can
  const stairs = [];
  for (const cell of gateCells) {
    const ch = chambers[cell];
    if (!ch) continue;
    const spot = shuffled(r, ch.c.stairs.map((p) => [ch.ox + p[0], ch.oy + p[1]]))
      .find(([x, y]) => stand(x, y) && canWalk(x, y) && away([x, y], pos) >= CW);
    if (spot) stairs.push([spot[0], spot[1], cell]);
  }
  if (stairs.length < 2) {
    const rest = [];
    for (const ch of chambers) {
      if (depths[ch.cell] < 1) continue;
      for (const p of ch.c.stairs) {
        const x = ch.ox + p[0], y = ch.oy + p[1];
        if (stand(x, y) && canWalk(x, y)) rest.push([x, y, ch.cell]);
      }
    }
    rest.sort((a, b) => depths[b[2]] - depths[a[2]]);
    for (const p of rest) {
      if (stairs.length >= 2) break;
      if (stairs.some((q) => q[2] === p[2] || away(q, p) < CW)) continue;
      stairs.push(p);
    }
  }
  // never ship a floor with one way down
  if (stairs.length < 2) {
    for (const k of reach0) {
      if (stairs.length >= 2) break;
      const [x, y] = k.split(',').map(Number);
      if (away([x, y], pos) < CW) continue;
      if (stairs.some((q) => away(q, [x, y]) < CW)) continue;
      stairs.push([x, y, cellOf(x, y)]);
    }
  }

  // ---- the way out sits along the walk, never beside a stair
  let exit = null;
  if (hasExit(depth)) {
    const pool = [];
    for (const ch of chambers) {
      if (depths[ch.cell] < 1 || ch.cell === hoardCell || !ch.c.exit) continue;
      const x = ch.ox + ch.c.exit[0], y = ch.oy + ch.c.exit[1];
      if (stand(x, y) && canWalk(x, y) && stairs.every((p) => away(p, [x, y]) >= 5)) pool.push([x, y]);
    }
    if (pool.length) exit = shuffled(r, pool)[0];
  }

  // ---- take back the scaffolding spine, one tile at a time
  const openBefore = openTiles(tiles);
  let reachable = floodCount(tiles, pos);
  const keep = new Set([idx(pos[0], pos[1]), ...stairs.map((p) => idx(p[0], p[1]))]);
  if (exit) keep.add(idx(exit[0], exit[1]));
  let taken = 0;
  for (const i of shuffled(r, spineTiles)) {
    if (taken >= 30) break;
    if (doorTiles.has(i) || keep.has(i) || tiles[i] !== FLOOR) continue;
    tiles[i] = r() < 0.45 ? RUBBLE : WALL;
    const now = floodCount(tiles, pos);
    if (now !== reachable - 1) { tiles[i] = FLOOR; continue; }
    reachable = now;
    taken++;
  }

  for (const p of stairs) tiles[idx(p[0], p[1])] = STAIRS;
  if (exit) tiles[idx(exit[0], exit[1])] = EXIT;

  // ---- population, spent by role
  const seen = reachableOnFloor(tiles, pos);
  const free = (x, y) => stand(x, y) && seen.has(`${x},${y}`);
  const used = new Set([`${pos[0]},${pos[1]}`, ...stairs.map((p) => `${p[0]},${p[1]}`)]);
  if (exit) used.add(`${exit[0]},${exit[1]}`);

  const relics = [], enemies = [];
  for (const ch of chambers) {
    const role = ROLE[ch.role] || ROLE.warren;

    let wantLoot = role.loot * LOOT * Math.max(1, ch.c.relics.length);
    for (const g of shuffled(r, ch.c.relics)) {
      if (wantLoot < r()) continue;
      wantLoot -= 1;
      const x = ch.ox + g.x, y = ch.oy + g.y;
      if (!free(x, y) || used.has(`${x},${y}`)) continue;
      used.add(`${x},${y}`);
      relics.push({ ...g, x, y, cell: ch.cell });
    }

    let wantFoes = role.foes * CROWD * ch.c.enemies.length + role.heavy;
    for (const e of shuffled(r, ch.c.enemies)) {
      if (wantFoes < r()) continue;
      wantFoes -= 1;
      const x = ch.ox + e.x, y = ch.oy + e.y;
      if (!free(x, y) || used.has(`${x},${y}`)) continue;
      if (away([x, y], pos) < 5) continue;
      used.add(`${x},${y}`);
      enemies.push({ ...e, x, y, cell: ch.cell });
    }
    // whatever the chamber drew, a hoard and a way down are guarded by
    // something that hits hard
    if (ch.role === 'hoard' || ch.role === 'gate') {
      const mine = enemies.filter((e) => e.cell === ch.cell);
      if (mine.length) mine[0].kind = 'sentinel';
    }
  }
  enemies.forEach((e, i) => { e.id = i; e.hp = KINDS[e.kind].hp + hpBonus(depth); });

  return {
    tiles, pos, stairs: stairs.map((p) => [p[0], p[1]]), stair: [stairs[0][0], stairs[0][1]],
    exit, relics, enemies, depth, roles, depths, mouth,
    // where one chamber opens into the next, so the renderer can frame them
    doors: frames,
    room: `grid:${chambers.map((c) => c.role).join(',')}`, variant: 0, assembled: true,
    eroded: openBefore - openTiles(tiles),
  };
}

export class Run {
  constructor(seed, loadout = null) {
    this.seed = String(seed);
    this.er = rng(hashStr(`${seed}:events`));
    this.acts = [];
    this.depth = 0;
    this.carried = [];
    this.felled = 0;
    this.kills = { husk: 0, spitter: 0, sentinel: 0 };
    this.flawless = 0;             // floors descended without taking a hit
    this.hurtThisFloor = false;
    this.turn = 0;
    this.over = false;
    this.out = false;              // true only if you walked out with the loot
    this.log = [];
    this.events = [];              // what the last act LOOKED like — fx only,
                                   // read by the renderer, never by the rules
    // The loadout is part of the run's identity the same way the seed is: a
    // replay must know what you walked in with, or the fight it verifies is a
    // different fight. Loadout gear is the camp's property — marked owned, and
    // it comes home even when the dungeon keeps everything else.
    const kit = { ...starterKit(), ...(loadout || {}) };
    this.loadout = {
      weapon: kit.weapon ? { ...kit.weapon, owned: true } : starterKit().weapon,
      armour: kit.armour ? { ...kit.armour, owned: true } : null,
      charm: kit.charm ? { ...kit.charm, owned: true } : null,
    };
    this.weapon = this.loadout.weapon;
    this.armour = this.loadout.armour;
    if (this.loadout.charm) this.carried.push(this.loadout.charm);
    this.hp = BASE_HP;
    this.enterFloor(1);
    this.hp = this.maxHp();
  }

  // ---- what the gear and the pack are worth -------------------------------
  count(effect, cap = 3) { return Math.min(cap, this.carried.filter((r) => r.effect === effect).length); }
  maxHp() {
    const a = this.armour ? tierIdx(this.armour.tier) : 0;
    return BASE_HP + this.count('vigour') * 2 + a;
  }
  dmg() {
    const w = WEAPONS[this.weapon.form] || WEAPONS.blade;
    return w.dmg + tierIdx(this.weapon.tier) + this.count('bite', 2);
  }
  soak() { return this.armour ? (ARMOURS[this.armour.form].soak || 0) : 0; }
  floorGuards() {
    return (this.count('guard') > 0 ? 1 : 0)
      + (this.armour && ARMOURS[this.armour.form].dodge ? 1 : 0);
  }

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
    this.doors = f.doors || new Set();
    // what each chamber is for, so the renderer can light a room as what it is
    this.roles = f.roles;
    this.enemies = f.enemies;
    this.guard = this.floorGuards();        // hits turned per floor, not per run
    this.hurtThisFloor = false;
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
    this.events = [];
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
      if (!this.hurtThisFloor) this.flawless++;
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

    // equip something from the pack: costs the turn, which is the whole cost
    if (a.t === 'e') {
      const i = this.carried.findIndex((g) => g.id === a.id);
      if (i < 0) return { ok: false, why: 'you are not carrying that' };
      const item = this.carried[i];
      if (item.slot !== 'weapon' && item.slot !== 'armour') return { ok: false, why: 'that is not gear' };
      this.carried.splice(i, 1);
      const old = item.slot === 'weapon' ? this.weapon : this.armour;
      if (old) this.carried.push(old);
      if (item.slot === 'weapon') this.weapon = item; else this.armour = item;
      this.hp = Math.min(this.hp, this.maxHp());
      this.say(`you take up the ${item.name}`);
      this.events.push({ k: 'equip', x: this.x, y: this.y });
      return { ok: true, equipped: item };
    }

    // a reach attack: the spear's move. Strikes the first foe up to `reach`
    // tiles down a line — over a GAP, because a hole blocks feet and not a
    // spear, but never through stone.
    if (a.t === 'r') {
      const d = DIRS[a.d];
      if (!d) return { ok: false, why: 'unknown direction' };
      const reach = WEAPONS[this.weapon.form].reach || 1;
      let foe = null, fx = this.x, fy = this.y;
      for (let step = 1; step <= reach; step++) {
        fx = this.x + d[0] * step; fy = this.y + d[1] * step;
        foe = this.foeAt(fx, fy);
        if (foe) break;
        if (blocksSight(this.tiles, fx, fy)) return { ok: false, why: 'stone in the way' };
      }
      if (!foe) return { ok: false, why: 'nothing in reach' };
      this.events.push({ k: 'lunge', x: this.x, y: this.y, tx: fx, ty: fy });
      this.strike(foe, d);
      return { ok: true, hit: foe };
    }

    if (a.t !== 'm') return { ok: false, why: 'unknown move' };
    const d = DIRS[a.d];
    if (!d) return { ok: false, why: 'unknown direction' };
    const nx = this.x + d[0], ny = this.y + d[1];

    const foe = this.foeAt(nx, ny);
    if (foe) {
      this.events.push({ k: 'swing', x: nx, y: ny });
      this.strike(foe, d);
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
      this.events.push({ k: 'took', x: nx, y: ny, tier: got.relic.tier });
      return { ok: true, took: got.relic };
    }
    return { ok: true };
  }

  // a sigil in your pack makes the dead more generous. Drawn from the run's own
  // event stream so a replay of the same moves finds the same things.
  strike(foe, d) {
    let dmg = this.dmg();
    const w = WEAPONS[this.weapon.form] || WEAPONS.blade;
    if (w.shove) {
      // thrown one tile back along the blow — and when there is nowhere to be
      // thrown, the wall finishes what the maul started
      const px2 = foe.x + d[0], py2 = foe.y + d[1];
      const open = walkable(this.tiles, px2, py2) && !this.foeAt(px2, py2)
        && !(px2 === this.x && py2 === this.y);
      if (open) {
        this.events.push({ k: 'shove', fx: foe.x, fy: foe.y, tx: px2, ty: py2 });
        foe.x = px2; foe.y = py2;
        foe.wind = null;           // nothing keeps its aim while flying backward
      } else dmg += 1;
    }
    foe.hp -= dmg;
    this.events.push({ k: 'hit', x: foe.x, y: foe.y, kind: foe.kind, dmg });
    if (foe.hp <= 0) {
      this.felled++;
      this.kills[foe.kind] = (this.kills[foe.kind] || 0) + 1;
      this.events.push({ k: 'slay', x: foe.x, y: foe.y, kind: foe.kind });
      this.say(`the ${KINDS[foe.kind].name.toLowerCase()} falls`);
      this.maybeDrop(foe);
    } else this.say(`you strike the ${KINDS[foe.kind].name.toLowerCase()}`);
  }

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
        if (it.tiles.some(([x, y]) => x === this.x && y === this.y)) {
          if (e.kind === 'spitter') this.events.push({ k: 'spit', fx: e.x, fy: e.y, tx: this.x, ty: this.y });
          this.wound(KINDS[e.kind], e);
        } else if (e.kind === 'spitter' && it.tiles.length) {
          const [mx, my] = it.tiles[it.tiles.length - 1];
          this.events.push({ k: 'spit', fx: e.x, fy: e.y, tx: mx, ty: my });
        }
      }
    }
    if (this.hp <= 0) { this.over = true; this.out = false; this.say('the dark takes you'); }
  }

  wound(K, from = null) {
    if (this.guard > 0) {
      this.guard--;
      this.say('the blow is turned');
      this.events.push({ k: 'turned', x: this.x, y: this.y });
      return;
    }
    const d = Math.max(1, K.dmg + dmgBonus(this.depth) - this.soak());
    this.hp -= d;
    this.hurtThisFloor = true;
    this.events.push({ k: 'wound', x: this.x, y: this.y, dmg: d });
    this.say(`the ${K.name.toLowerCase()} hits you for ${d}`);
    // fangs: whatever struck from beside you bleeds for it
    const w = WEAPONS[this.weapon.form] || {};
    if (w.riposte && from && Math.abs(from.x - this.x) + Math.abs(from.y - this.y) === 1) {
      from.hp -= w.riposte;
      this.events.push({ k: 'riposte', x: from.x, y: from.y });
      if (from.hp <= 0) {
        this.felled++;
        this.kills[from.kind] = (this.kills[from.kind] || 0) + 1;
        this.events.push({ k: 'slay', x: from.x, y: from.y, kind: from.kind });
        this.say(`the ${KINDS[from.kind].name.toLowerCase()} dies on your fangs`);
        this.maybeDrop(from);
      }
    }
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
    const gear = [this.weapon, this.armour].filter(Boolean);
    // Died and you keep nothing you FOUND. The camp's own gear walks back out
    // with you either way — losing your last blade to a husk is not tension,
    // it is a reason to stop playing.
    const found = this.carried.filter((g) => !g.owned).concat(this.out ? [] : gear.filter((g) => !g.owned));
    const owned = this.carried.filter((g) => g.owned).concat(gear.filter((g) => g.owned));
    return {
      gen: GEN_VERSION,
      seed: this.seed, depth: this.depth, floor: this.floorName,
      out: this.out, hp: Math.max(0, this.hp), maxHp: this.maxHp(),
      felled: this.felled, turns: this.turn, score: this.score(),
      kills: { ...this.kills }, flawless: this.flawless,
      loadout: {
        weapon: this.loadout.weapon ? { form: this.loadout.weapon.form, tier: this.loadout.weapon.tier } : null,
        armour: this.loadout.armour ? { form: this.loadout.armour.form, tier: this.loadout.armour.tier } : null,
        charm: this.loadout.charm ? { form: this.loadout.charm.form, tier: this.loadout.charm.tier } : null,
      },
      kept: this.out ? this.carried.concat(gear.filter((g) => !g.owned)) : owned,
      lost: this.out ? [] : found,
      best: this.carried.reduce((b, r) => (TIERS.indexOf(r.tier) > TIERS.indexOf(b?.tier || 'common') ? r : b), this.carried[0] || null),
    };
  }
}

// A run is a seed and a list of moves. Replaying those two things must produce
// the identical run — this is the function a server will call to check that a
// relic somebody wants to sell was actually pulled out of the dark.
export function replay(seed, acts, loadout = null) {
  const run = new Run(seed, loadout);
  for (const a of acts) {
    const r = run.act(a);
    if (!r.ok) return { error: `illegal move on turn ${run.turn}: ${r.why}` };
    if (run.over) break;
  }
  return { run, summary: run.summary() };
}
