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
// A clearing carved in the void, mid-plate so the camera maths never learns
// this is not a dungeon floor.
const CAMP = [
  '#######________',
  '#.....########_',
  '#..#..........#',
  '#.....###..#..#',
  '#..............',
  '#...>......#..#',
  '#..............',
  '#..#...##.....#',
  '#.......#..#..#',
  '#..###........#',
  '#.............#',
  '####...########',
  '___#####_______',
];
const CX0 = 15, CY0 = 16;               // where the clearing sits on the plate

export const STATIONS = [
  { id: 'forge', name: 'FORGE', hint: 'choose what you walk in with', x: CX0 + 3, y: CY0 + 3, tier: 'rare' },
  { id: 'board', name: 'BOARD', hint: "today's marks", x: CX0 + 11, y: CY0 + 4, tier: 'epic' },
  { id: 'well', name: 'WELL', hint: 'who else went down today', x: CX0 + 8, y: CY0 + 9, tier: 'mythic' },
];
export const CAMP_STAIR = [CX0 + 4, CY0 + 5];

export function makeCamp() {
  const tiles = new Uint8Array(W * H).fill(WALL);
  const known = new Uint8Array(W * H);
  const visible = new Set();
  CAMP.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const gx = CX0 + x, gy = CY0 + y;
      tiles[idx(gx, gy)] = ch === '#' ? WALL : ch === '_' ? GAP : ch === '>' ? STAIRS : FLOOR;
      if (ch !== '_') { known[idx(gx, gy)] = 1; visible.add(`${gx},${gy}`); }
    });
  });
  return {
    seed: 'camp', depth: 0, door: 0, tiles, known, visible,
    x: CX0 + 7, y: CY0 + 6,
    stairs: [CAMP_STAIR], stair: CAMP_STAIR, exit: null, peeks: null,
    ground: STATIONS.map((st) => ({ x: st.x, y: st.y, relic: { tier: st.tier, name: st.name, blurb: st.hint } })),
    enemies: [], doors: new Set(), roles: null, over: false, log: [],
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
export function creditRun(summary) {
  const day = dayKey();
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
    stash.push({ ...reformWeapon(sheet.prize, loadClass() || 'warden'), owned: true });
    saveStash(stash);
    prized = sheet.prize;
    addGroats(sheet.quests.reduce((a, q) => a + q.reward, 0));
  }
  saveProgress(day, p);
  return { coined, prized, sheet, progress: p };
}
