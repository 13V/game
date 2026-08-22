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
export const floorSeed = (seed, depth) => hashStr(`${seed}:floor:${depth}`);

const pick = (r, list) => list[Math.floor(r() * list.length)];
const roll = (r, n) => Math.floor(r() * n);

// ------------------------------------------------------------------- world --
export const W = 9, H = 9;             // one screen, whole floor visible at once
export const WALL = 0, FLOOR = 1, RUBBLE = 2, STAIRS = 3, EXIT = 4;

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
  { id: 'fang', noun: 'Fang', effect: 'bite', blurb: 'strike +1' },
  { id: 'crown', noun: 'Crown', effect: 'vigour', blurb: 'max health +2' },
  { id: 'lamp', noun: 'Lantern', effect: 'sight', blurb: 'see one floor deeper' },
  { id: 'ward', noun: 'Ward', effect: 'guard', blurb: 'the first hit each floor is turned' },
  { id: 'coin', noun: 'Sigil', effect: 'luck', blurb: 'relics fall more often' },
  { id: 'draught', noun: 'Draught', effect: 'mend', blurb: 'heal 2 on the stair' },
];
const PLACES = ['Ashvale', 'Coldiron', 'Salt', 'Mirefen', 'Gravemoor', 'Hollow', 'Thistle', 'Rookmoor', 'Blackmarl', 'Dunmere'];
export const FLOOR_NAMES = ['The Sump', 'Salt Warrens', 'The Kiln', 'Bone Gallery', 'The Drowned Stair',
  'Ashvault', 'The Long Dark', 'Gravemoor Deep', 'The Cold Mouth', 'Nether Warrens'];

export const floorName = (depth) => FLOOR_NAMES[(depth - 1) % FLOOR_NAMES.length]
  + (depth > FLOOR_NAMES.length ? ` ${Math.floor((depth - 1) / FLOOR_NAMES.length) + 1}` : '');

export function makeRelic(r, depth) {
  const tier = tierFor(r, depth);
  const form = pick(r, FORMS);
  const place = pick(r, PLACES);
  const power = TIERS.indexOf(tier) + 1;
  return {
    id: `${form.id}-${roll(r, 1e9)}`,
    name: `${place} ${form.noun}`,
    tier, form: form.id, effect: form.effect, blurb: form.blurb,
    power, depth,
  };
}

// ------------------------------------------------------------- floor making --
// A floor is a room with cover in it, not a maze. You can see all of it at once,
// so the interest has to come from where the pillars are rather than from what
// is hidden — and everything reachable is guaranteed reachable before it ships.
export function genFloor(seed, depth) {
  const r = rng(floorSeed(seed, depth));
  for (let attempt = 0; attempt < 40; attempt++) {
    const f = tryFloor(r, depth);
    if (f) return f;
  }
  return tryFloor(rng(floorSeed(seed, depth) ^ 0x9e37), depth, true);
}

function tryFloor(r, depth, lenient = false) {
  const t = new Uint8Array(W * H).fill(FLOOR);
  for (let x = 0; x < W; x++) { t[idx(x, 0)] = WALL; t[idx(x, H - 1)] = WALL; }
  for (let y = 0; y < H; y++) { t[idx(0, y)] = WALL; t[idx(W - 1, y)] = WALL; }

  const clutter = 5 + roll(r, 5) + Math.min(4, Math.floor(depth / 3));
  for (let i = 0; i < clutter; i++) {
    const x = 1 + roll(r, W - 2), y = 1 + roll(r, H - 2);
    t[idx(x, y)] = r() < 0.55 ? WALL : RUBBLE;
  }

  const open = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (t[idx(x, y)] === FLOOR) open.push([x, y]);
  if (open.length < 30) return lenient ? null : null;

  // the player starts near one corner, the stair sits far from it
  const start = open.filter(([x, y]) => x + y <= 6);
  const far = open.filter(([x, y]) => x + y >= 10);
  if (!start.length || !far.length) return null;
  const pos = pick(r, start);
  const stair = pick(r, far);
  if (stair[0] === pos[0] && stair[1] === pos[1]) return null;
  t[idx(stair[0], stair[1])] = STAIRS;

  let exit = null;
  if (hasExit(depth)) {
    const spots = open.filter(([x, y]) => dist([x, y], pos) > 3 && dist([x, y], stair) > 2);
    if (!spots.length) return null;
    exit = pick(r, spots);
    t[idx(exit[0], exit[1])] = EXIT;
  }

  const taken = new Set([key(pos), key(stair)]);
  if (exit) taken.add(key(exit));

  // relics on the ground, more of them the deeper you are
  const relics = [];
  const nRelics = (r() < 0.52 ? 1 : 0) + (depth >= 7 && r() < 0.18 ? 1 : 0);
  for (let i = 0; i < nRelics; i++) {
    const spot = freeSpot(r, open, taken, pos, 2);
    if (!spot) break;
    taken.add(key(spot));
    relics.push({ x: spot[0], y: spot[1], relic: makeRelic(r, depth) });
  }

  // enemies, never adjacent to where you appear
  const enemies = [];
  const roster = bestiaryFor(depth);
  const nFoes = Math.min(7, 1 + Math.floor(depth * 0.7) + (r() < 0.4 ? 1 : 0));
  for (let i = 0; i < nFoes; i++) {
    const spot = freeSpot(r, open, taken, pos, 3);
    if (!spot) break;
    taken.add(key(spot));
    const kind = pick(r, roster);
    enemies.push({
      id: i, kind, x: spot[0], y: spot[1],
      hp: KINDS[kind].hp + hpBonus(depth), cool: 0, intent: null,
    });
  }

  if (!reachable(t, pos, [stair, exit].filter(Boolean).concat(relics.map((p) => [p.x, p.y])))) return null;
  return { tiles: t, pos, stair, exit, relics, enemies, depth };
}

const key = ([x, y]) => `${x},${y}`;
const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

function freeSpot(r, open, taken, away, minAway) {
  const ok = open.filter((p) => !taken.has(key(p)) && dist(p, away) >= minAway);
  return ok.length ? pick(r, ok) : null;
}

export const walkable = (t, x, y) => inBounds(x, y) && t[idx(x, y)] !== WALL && t[idx(x, y)] !== RUBBLE;
// rubble is cover: you cannot stand in it, and nothing can shoot through it
export const blocksSight = (t, x, y) => !inBounds(x, y) || t[idx(x, y)] === WALL || t[idx(x, y)] === RUBBLE;

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
  count(effect) { return this.carried.filter((r) => r.effect === effect).length; }
  maxHp() { return BASE_HP + this.count('vigour') * 2; }
  dmg() { return BASE_DMG + this.count('bite'); }

  enterFloor(depth) {
    const f = genFloor(this.seed, depth);
    this.depth = depth;
    this.tiles = f.tiles;
    this.x = f.pos[0]; this.y = f.pos[1];
    this.stair = f.stair;
    this.exit = f.exit;
    this.ground = f.relics;
    this.enemies = f.enemies;
    this.guard = this.count('guard') > 0;   // one hit turned per floor, not per run
    this.floorName = floorName(depth);
    this.think();
  }

  at(x, y) { return this.tiles[idx(x, y)]; }
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

  // greedy chase along whichever axis it is furthest out on, then the other
  stepIntent(e) {
    const dx = this.x - e.x, dy = this.y - e.y;
    const tries = Math.abs(dx) >= Math.abs(dy)
      ? [[Math.sign(dx), 0], [0, Math.sign(dy)]]
      : [[0, Math.sign(dy)], [Math.sign(dx), 0]];
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
      const mend = Math.min(4, this.count('mend') * 2);
      if (mend) this.hp = Math.min(this.maxHp(), this.hp + mend);
      if (this.depth >= MAX_DEPTH) { this.over = true; this.out = true; return { ok: true }; }
      this.enterFloor(this.depth + 1);
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
