// DELVE — the camp.
//
// The place between delves. It is drawn by the same renderer as the dungeon —
// a hub object walks and lights exactly like a Run, minus everything that can
// kill you — and it holds the three things a run cannot: the STASH (what you
// have carried out, forever), the FORGE (what you walk in with next), and the
// BOARD (what today is asking of you).
//
// Everything here persists in localStorage. The dungeon keeps no memory on
// purpose; the camp is nothing but memory.
import { W, H, idx, WALL, FLOOR, STAIRS, GAP, rng, hashStr, makeItem, TIERS, CLASSES, reformWeapon } from './rules.js';

export const dayKey = () => new Date().toISOString().slice(0, 10);

// ------------------------------------------------------------- the ground --
// The camp is OUTSIDE now, and it is night. A firelit clearing in a pine
// wood: the great bonfire at its heart, the pond to the north-east with the
// well beside it, tents to the west, the way down south of the fire, and
// grass enough for fifty delvers to stand around the light. The same camera
// and the same walk as the dungeon — only the dark here is sky, not stone.
//
//   #/p pine    o rock    T tent    i torch    B bonfire    ~ pond    > down
const CAMP = [
  '____________________________________',
  '____________############____________',
  '_________#p##p#ppp.p#######_________',
  '_______######.#...#p.p#.#.....______',
  '______#.#.#...........p..~~~~~..____',
  '_____p##...............i..~~~~~~.___',
  '____###p..................~~~~~~.___',
  '___##.....................~~~~~~.___',
  '__###.i...i.............~~~~~~~..#__',
  '__##.#...............o...~~~~~..##__',
  '_###.p..........................###_',
  '_#.#p#..........................##._',
  '_..#..T..........B.............pp#p_',
  '_.ppp............................p#_',
  '_###............................###_',
  '_.##.....................i...ip#p.#_',
  '__##p..T........................p.__',
  '__####p....o.................#.##p__',
  '___p##pp..T.........o....p...p###___',
  '____####p....................##p____',
  '_____###.....................##_____',
  '______.##.p#...i.>.i..#.#.###.______',
  '_______#####..#....#..p####.#_______',
  '_________#p######..ppp##p##_________',
  '____________############____________',
  '____________________________________',
];
const CX0 = 4, CY0 = 9;                 // where the clearing sits on the plate
const L2G = ([x, y]) => [CX0 + x, CY0 + y];

export const STATIONS = [
  { id: 'forge', name: 'FORGE', hint: 'choose what you walk in with', x: CX0 + 8, y: CY0 + 8, tier: 'rare' },
  { id: 'board', name: 'BOARD', hint: "today's marks", x: CX0 + 27, y: CY0 + 15, tier: 'epic' },
  { id: 'well', name: 'WELL', hint: 'who else went down today', x: CX0 + 24, y: CY0 + 6, tier: 'mythic' },
];
export const CAMP_STAIR = [CX0 + 17, CY0 + 21];
export const CAMP_FIRE = [CX0 + 17, CY0 + 12];

const DECO = { '#': 'pine', 'p': 'pine2', 'o': 'rock', 'T': 'tent', 'i': 'torch', 'B': 'bonfire' };

export function makeCamp() {
  const tiles = new Uint8Array(W * H).fill(WALL);
  const known = new Uint8Array(W * H);
  const visible = new Set();
  const deco = new Map();
  const torches = [];
  const spots = [];
  const keep = [...STATIONS.map((s) => [s.x, s.y]), CAMP_STAIR, CAMP_FIRE];
  CAMP.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const gx = CX0 + x, gy = CY0 + y;
      const i = idx(gx, gy);
      if (ch === '_') { tiles[i] = GAP; return; }           // night beyond the trees
      tiles[i] = ch === '>' ? STAIRS : ch === '~' ? GAP : ch === '.' ? FLOOR : WALL;
      known[i] = 1; visible.add(`${gx},${gy}`);
      if (DECO[ch]) deco.set(i, DECO[ch]);
      if (ch === 'i') torches.push([gx, gy, torches.length + 3]);
      if (ch === '.') {
        const far = keep.every(([kx, ky]) => Math.abs(gx - kx) + Math.abs(gy - ky) >= 3);
        if (far) spots.push([gx, gy]);
      }
    });
  });
  torches.push([...CAMP_FIRE, 99]);
  // where the moon lies: the pond's centre of mass
  let px2 = 0, py2 = 0, pn = 0;
  CAMP.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '~') { px2 += CX0 + x; py2 += CY0 + y; pn++; }
  }));
  return {
    seed: 'camp', depth: 0, door: 0, tiles, known, visible,
    x: CAMP_FIRE[0], y: CAMP_FIRE[1] + 3,
    stairs: [CAMP_STAIR], stair: CAMP_STAIR, exit: null, peeks: null,
    ground: STATIONS.map((st) => ({ x: st.x, y: st.y, relic: { tier: st.tier, name: st.name, blurb: st.hint } })),
    enemies: [], doors: new Set(), roles: null, over: false, log: [],
    outdoor: true, deco, fire: CAMP_FIRE, torches, spots, campers: [],
    pond: pn ? [px2 / pn + 0.5, py2 / pn + 0.5] : null,
    threat: () => new Map(),
    canSee(x, y) { return this.visible.has(`${x},${y}`); },
    foeAt() { return null; },
    at(x, y) { return this.tiles[idx(x, y)]; },
  };
}

// ---------------------------------------------------------------- the stash --
const read = (k, fb) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? fb; } catch { return fb; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage may be blocked */ } };

export const loadStash = () => read('delve.stash', []);
export const saveStash = (s) => write('delve.stash', s);
export const loadLoadout = () => read('delve.loadout', null);
export const saveLoadout = (l) => write('delve.loadout', l);
export const groats = () => read('delve.groats', 0);
export const addGroats = (n) => write('delve.groats', groats() + n);
// null until the player has chosen — the camp asks exactly once
export const loadClass = () => { const c = read('delve.class', null); return CLASSES[c] ? c : null; };
export const saveClass = (c) => { if (CLASSES[c]) write('delve.class', c); };

// ---------------------------------------------------------------- the board --
// Three marks a day, rolled from the date so every player gets the same three.
// Progress accumulates across the day's runs; finishing all three forges the
// day's own reward into the stash.
const QUEST_KINDS = [
  { id: 'slay-husk', text: 'Fell 6 husks', need: 6, of: (s) => s.kills.husk || 0, reward: 60 },
  { id: 'slay-spitter', text: 'Fell 3 spitters', need: 3, of: (s) => s.kills.spitter || 0, reward: 80 },
  { id: 'slay-sentinel', text: 'Fell 2 sentinels', need: 2, of: (s) => s.kills.sentinel || 0, reward: 100 },
];
const QUEST_DEPTHS = [3, 4, 5];
const QUEST_THIRD = [
  { id: 'extract-rare', text: 'Carry out something rare or better', need: 1,
    of: (s) => (s.out ? s.kept.filter((g) => !g.owned && TIERS.indexOf(g.tier) >= 1).length : 0), reward: 90 },
  { id: 'flawless', text: 'Descend 2 floors untouched', need: 2, of: (s) => s.flawless, reward: 80 },
  { id: 'felled', text: 'Fell 10 of anything', need: 10, of: (s) => s.felled, reward: 70 },
];

export function questsFor(day) {
  const r = rng(hashStr(`quests:${day}`));
  const slay = QUEST_KINDS[Math.floor(r() * QUEST_KINDS.length)];
  const depth = QUEST_DEPTHS[Math.floor(r() * QUEST_DEPTHS.length)];
  const third = QUEST_THIRD[Math.floor(r() * QUEST_THIRD.length)];
  // the day's own reward: one good item, the same one for everybody, so the
  // board is also a conversation — "did you get the spear today?"
  const prize = makeItem(rng(hashStr(`prize:${day}`)), 8, 12);
  return {
    day,
    quests: [
      { ...slay },
      { id: `depth-${depth}`, text: `Reach floor ${depth}`, need: depth, of: (s) => s.depth, high: true, reward: 40 * depth },
      { ...third },
    ],
    prize,
  };
}

export const loadProgress = (day) => read(`delve.quests.${day}`, { done: {}, claimed: false, best: {} });
export const saveProgress = (day, p) => write(`delve.quests.${day}`, p);

// A finished run pays into the day. `high` quests take the best single run;
// the rest accumulate across every run of the day.
export function creditRun(summary, day = dayKey()) {
  const sheet = questsFor(day);
  const p = loadProgress(day);
  for (const q of sheet.quests) {
    const got = q.of(summary);
    p.done[q.id] = q.high ? Math.max(p.done[q.id] || 0, got) : (p.done[q.id] || 0) + got;
  }
  // the stash takes what came home; treasures become groats
  let coined = 0;
  const stash = loadStash();
  const tierPts = { common: 10, rare: 40, epic: 120, mythic: 400 };
  for (const g of summary.kept) {
    if (g.owned) continue;                       // the camp's own gear never duplicates
    if (g.slot === 'treasure') coined += tierPts[g.tier] || 10;
    else stash.push(g);
  }
  if (coined) addGroats(coined);
  saveStash(stash);
  // all three done and unclaimed: the day's prize is forged
  const allDone = sheet.quests.every((q) => (p.done[q.id] || 0) >= q.need);
  let prized = null;
  if (allDone && !p.claimed) {
    p.claimed = true;
    // a treasure prize is riches, not gear: it coins on the spot — a treasure
    // in the stash would sit invisible forever, which is no prize at all
    if (sheet.prize.slot === 'treasure') {
      const pts = tierPts[sheet.prize.tier] || 10;
      addGroats(pts);
      coined += pts;
    } else {
      stash.push({ ...reformWeapon(sheet.prize, loadClass() || 'warden'), owned: true });
      saveStash(stash);
    }
    prized = sheet.prize;
    addGroats(sheet.quests.reduce((a, q) => a + q.reward, 0));
  }
  saveProgress(day, p);
  return { coined, prized, sheet, progress: p };
}
