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
export const W = 9, H = 9;             // one screen, whole floor visible at once
export const WALL = 0, FLOOR = 1, RUBBLE = 2, STAIRS = 3, EXIT = 4, GAP = 5;

export const inBounds = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
export const idx = (x, y) => y * W + x;
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

export const hpBonus = (depth) => (depth > 8 ? 2 : depth > 4 ? 1 : 0);
export const dmgBonus = (depth) => (depth >= 7 ? 1 : 0);

function bestiaryFor(depth) {
  if (depth <= 1) return ['husk'];
  if (depth <= 3) return ['husk', 'husk', 'spitter'];
  if (depth <= 6) return ['husk', 'spitter', 'spitter', 'sentinel'];
  return ['husk', 'spitter', 'sentinel', 'sentinel'];
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
  const tiles = new Uint8Array(W * H);
  const spawn = [];
  const stair = [];
  const exit = [];
  const foes = [];
  const heavies = [];
  const relics = [];
  const maybe = [];
  room.cells.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      tiles[idx(x, y)] = TILE_OF[ch] ?? FLOOR;
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
const rot = ([x, y]) => [W - 1 - y, x];
const flip = ([x, y]) => [W - 1 - x, y];

export function transformRoom(parsed, turns, mirror) {
  let map = (p) => p;
  for (let i = 0; i < turns; i++) { const prev = map; map = (p) => rot(prev(p)); }
  if (mirror) { const prev = map; map = (p) => flip(prev(p)); }
  const tiles = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const [nx, ny] = map([x, y]);
    tiles[idx(nx, ny)] = parsed.tiles[idx(x, y)];
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
  const seen = new Uint8Array(W * H);
  if (!passable(tiles, from[0], from[1])) return seen;
  seen[idx(from[0], from[1])] = 1;
  const q = [from];
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (!passable(tiles, nx, ny) || seen[idx(nx, ny)]) continue;
      seen[idx(nx, ny)] = 1;
      q.push([nx, ny]);
    }
  }
  return seen;
}

// ------------------------------------------------------------- floor making --
// A floor is a room with cover in it, not a maze. You can see all of it at once,
// so the interest has to come from where the pillars are rather than from what
// is hidden — and everything reachable is guaranteed reachable before it ships.
export function genFloor(seed, depth, door = 0) {
  const r = rng(floorSeed(seed, depth, door));
  return buildFloor(r, depth, String(seed), door);
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

  for (const [x, y] of v.maybe) if (r() < 0.42) tiles[idx(x, y)] = RUBBLE;

  // The way out is drawn into every room; on an odd floor it is simply not
  // there, and the tile it would have occupied stays plain floor.
  let exit = null;
  if (hasExit(depth) && v.exit.length) {
    exit = shuffled(r, v.exit)[0];
    tiles[idx(exit[0], exit[1])] = EXIT;
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
  const want = Math.min(slots.length, 1 + Math.floor(depth * 0.75) + (r() < 0.4 ? 1 : 0) + (rich ? 1 : 0));
  const enemies = [];
  for (let i = 0; i < want; i++) {
    const s = slots[i];
    const kind = s.heavy && canHeavy ? 'sentinel' : light[Math.floor(r() * light.length)];
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

export const walkable = (t, x, y) =>
  inBounds(x, y) && t[idx(x, y)] !== WALL && t[idx(x, y)] !== RUBBLE && t[idx(x, y)] !== GAP;
// Rubble is cover: you cannot stand in it and nothing can shoot through it.
// A gap is the opposite kind of obstacle — you cannot stand in it and everything
// can shoot straight across it. Until this existed, the game's two blocking
// tiles were byte-for-byte identical, so no drawn pillar could ever mean
// anything different from any other drawn pillar.
export const blocksSight = (t, x, y) =>
  !inBounds(x, y) || t[idx(x, y)] === WALL || t[idx(x, y)] === RUBBLE;

function reachable(t, from, targets) {
  const seen = new Uint8Array(W * H);
  const q = [from];
  seen[idx(from[0], from[1])] = 1;
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (!walkable(t, nx, ny) || seen[idx(nx, ny)]) continue;
      seen[idx(nx, ny)] = 1;
      q.push([nx, ny]);
    }
  }
  return targets.every(([x, y]) => seen[idx(x, y)]);
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

export const GEN_VERSION = 2;

export const MAX_DEPTH = 30;
export const BASE_HP = 10, BASE_DMG = 3;

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
    this.peeks = [this.peek(0), this.peek(1)];
    this.think();
  }

  at(x, y) { return this.tiles[idx(x, y)]; }
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
    if (!this.over) { this.doEnemies(); this.think(); }
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
