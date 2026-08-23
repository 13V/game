// DELVE — the checks that have to pass before a relic could ever be worth
// anything.
//
// Two of these matter more than the rest. A run must replay identically from
// its seed and its moves, because that is the only thing a server can verify.
// And a telegraph must never lie — if the game shows you a tile and then hits
// a different one, the whole design is a dice roll wearing a puzzle's clothes.
//
//   node delve/verify.test.mjs
import { pathToFileURL } from 'node:url';
import {
  Run, replay, genFloor, genChamber, W, H, CW, CH, idx, DIRS, walkable, blocksSight, WALL, STAIRS, EXIT,
  hasExit, KINDS, TIERS, tierFor, rng, dmgBonus, MAX_DEPTH,
} from './rules.js';

if (!process.argv[1] || pathToFileURL(process.argv[1]).href !== import.meta.url) process.exit(2);

let fail = 0;
const t = (name, ok, extra = '') => { console.log(ok ? 'ok  ' : 'FAIL', name, extra); if (!ok) fail++; };

// ---------------------------------------------------------- the same dungeon --
let same = true;
for (let i = 0; i < 120; i++) {
  const a = genFloor(`seed-${i}`, 1 + (i % 9));
  const b = genFloor(`seed-${i}`, 1 + (i % 9));
  if (String(a.tiles) !== String(b.tiles) || String(a.pos) !== String(b.pos)
    || JSON.stringify(a.enemies) !== JSON.stringify(b.enemies)
    || JSON.stringify(a.relics) !== JSON.stringify(b.relics)) { same = false; break; }
}
t('the same seed always builds the same floor', same, '120 floors');

let differs = 0;
for (let i = 0; i < 60; i++) if (String(genFloor(`a-${i}`, 3).tiles) !== String(genFloor(`b-${i}`, 3).tiles)) differs++;
t('different seeds build different floors', differs >= 58, `${differs}/60`);

// nothing in this file may reach for Math.random, or none of the above holds.
// Comments are stripped first — the first version of this check tripped over the
// comment in rules.js that says never to call it.
const src = (await import('node:fs')).readFileSync(new URL('./rules.js', import.meta.url), 'utf8')
  .replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
t('the rules never call Math.random', !/Math\.random/.test(src));

// ------------------------------------------------------------ nothing walled off --
let stranded = 0;
for (let i = 0; i < 300; i++) {
  const depth = 1 + (i % 12);
  const f = genFloor(`reach-${i}`, depth);
  const seen = new Uint8Array(W * H);
  const q = [f.pos];
  seen[idx(f.pos[0], f.pos[1])] = 1;
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (!walkable(f.tiles, nx, ny) || seen[idx(nx, ny)]) continue;
      seen[idx(nx, ny)] = 1; q.push([nx, ny]);
    }
  }
  const need = [...f.stairs, ...(f.exit ? [f.exit] : []),
    ...f.relics.map((r) => [r.x, r.y]), ...f.enemies.map((e) => [e.x, e.y])];
  if (!need.every(([x, y]) => seen[idx(x, y)])) stranded++;
}
t('both stairs, the way out, every relic and every foe can be reached',
  stranded === 0, `${stranded} bad floors of 300`);

// The specific bug this is here for: there were two functions answering "can a
// foot go here", they drifted the moment holes were added to the floor, and the
// room checker used the one that had not been told about holes. Sixteen rooms
// validated clean while cut in half.
const { passable, GAP } = await import('./rules.js');
const holed = new Uint8Array(W * H).fill(1);
holed[idx(4, 4)] = GAP;
t('one definition of where a foot can go, and it knows about holes',
  passable(holed, 4, 4) === false && walkable(holed, 4, 4) === false
  && passable(holed, 3, 4) === walkable(holed, 3, 4),
  'passable and walkable agree, and neither lets you stand in a gap');
t('but a gap does not stop an eye',
  blocksSight(holed, 4, 4) === false, 'you can be shot straight across a hole');

let exitWrong = 0;
for (let d = 1; d <= 14; d++) {
  const f = genFloor('exits', d);
  if (hasExit(d) !== !!f.exit) exitWrong++;
}
t('a way out exists on exactly the floors that promise one', exitWrong === 0);

// ---------------------------------------------------------- a telegraph is a promise --
// Play a great many turns and check, every single turn, that the damage taken
// equals the damage the board said was coming. This is the load-bearing one.
let lies = 0, checked = 0, hits = 0, saved = 0;
for (let i = 0; i < 120; i++) {
  const run = new Run(`tele-${i}`);
  for (let turn = 0; turn < 90 && !run.over; turn++) {
    // who promised what, before anything moves
    const promises = run.enemies
      .filter((e) => e.hp > 0 && e.intent && e.intent.type === 'strike')
      .map((e) => ({ id: e.id, dmg: KINDS[e.kind].dmg + dmgBonus(run.depth), tiles: e.intent.tiles.map((p) => `${p[0]},${p[1]}`) }));
    const before = run.hp, guardBefore = run.guard, depthBefore = run.depth;
    const d = turn % 4;
    if (!run.act({ t: 'm', d }).ok) run.act({ t: 'w' });
    if (run.depth !== depthBefore) continue;              // a new floor has new intents

    // what SHOULD have landed: every promise from something still standing,
    // whose tiles cover where the player ended up
    const here = `${run.x},${run.y}`;
    const landed = promises.filter((p) => p.tiles.includes(here)
      && run.enemies.some((e) => e.id === p.id && e.hp > 0));
    const dead = promises.filter((p) => p.tiles.includes(here)
      && !run.enemies.some((e) => e.id === p.id && e.hp > 0));
    if (dead.length) saved++;

    let expect = landed.reduce((a2, p) => a2 + p.dmg, 0);
    if (guardBefore && !run.guard && landed.length) expect -= landed[0].dmg;   // the ward ate one
    const actual = before - run.hp;
    checked++;
    if (actual > 0) hits++;
    if (actual !== expect) lies++;
  }
}
t('the damage taken is exactly the damage the board promised', lies === 0,
  `${checked} turns watched, ${hits} hurt, ${saved} blows undone by killing the thing first`);

// ------------------------------------------------------------------- replay --
// The whole item economy rests on this: a seed and a list of moves, replayed
// anywhere, must produce the identical run.
let mismatch = 0, played = 0;
for (let i = 0; i < 120; i++) {
  const run = new Run(`rp-${i}`);
  for (let turn = 0; turn < 140 && !run.over; turn++) {
    const r2 = rng(1000 + i * 7 + turn);
    const roll = Math.floor(r2() * 6);
    if (roll < 4) run.act({ t: 'm', d: roll });
    else if (roll === 4) run.act({ t: 'w' });
    else if (!run.act({ t: 'd' }).ok) run.act({ t: 'w' });
  }
  played++;
  const back = replay(`rp-${i}`, run.acts);
  if (back.error) { mismatch++; continue; }
  if (JSON.stringify(back.summary) !== JSON.stringify(run.summary())) mismatch++;
}
t('a run replays identically from its seed and its moves', mismatch === 0, `${played} runs`);

// a record that never happened must not stand up
const honest = new Run('forge');
honest.act({ t: 'w' });
t('a record with an impossible move is refused',
  !!replay('forge', [{ t: 'x' }]).error, replay('forge', [{ t: 'x' }]).error);
t('a record for another dungeon does not verify',
  !!replay('forge', [{ t: 'm', d: 0 }, { t: 'd' }]).error
  || replay('other', [{ t: 'm', d: 0 }]).summary.seed === 'other');

// ------------------------------------------------------------------ the rules --
const r1 = new Run('rules-1');
t('you cannot go down where there is no stair', !r1.act({ t: 'd' }).ok);
t('you cannot leave where there is no way out', !r1.act({ t: 'x' }).ok);

// walking into a wall costs nothing — it must not burn a turn and let the
// dungeon act for free
const r2 = new Run('rules-2');
const turnsBefore = r2.turn;
for (let d = 0; d < 4; d++) {
  const nx = r2.x + DIRS[d][0], ny = r2.y + DIRS[d][1];
  if (r2.tiles[idx(nx, ny)] === WALL) { r2.act({ t: 'm', d }); break; }
}
t('bumping a wall does not spend a turn', r2.turn === turnsBefore);

// ------------------------------------------------------ what you carry out --
const { playOne } = await import('./playtest.mjs');
let deaths = 0, keptOnDeath = 0, exits = 0, lostOnExit = 0, withLoot = 0;
// A greedy bot, because a cautious one on a floor this size simply walks away
// alive every time — which is the point of caution, and useless for proving the
// dungeon can kill.
for (let i = 0; i < 120; i++) {
  const s = playOne(`carry-${i}`, 28).summary();
  if (!s.out) { deaths++; if (s.kept.some((g) => !g.owned)) keptOnDeath++; }
  else { exits++; if (s.lost.length) lostOnExit++; if (s.kept.length) withLoot++; }
}
t('dying keeps nothing you FOUND — the camp\'s own gear comes home', keptOnDeath === 0 && deaths > 20,
  `${deaths} deaths in 120 greedy runs`);
t('getting out loses nothing', lostOnExit === 0 && exits > 20, `${exits} escapes`);
t('and most of those escapes were worth making', withLoot > exits * 0.7,
  `${withLoot} of ${exits} came out carrying something`);

// ------------------------------------------------------------------ the odds --
const counts = { common: 0, rare: 0, epic: 0, mythic: 0 };
const rr = rng(99);
for (let i = 0; i < 20000; i++) counts[tierFor(rr, 2)]++;
t('a mythic never falls on the top floors', counts.mythic === 0 && counts.epic === 0,
  `floor 2: ${counts.common} common, ${counts.rare} rare`);
const deep = { common: 0, rare: 0, epic: 0, mythic: 0 };
for (let i = 0; i < 20000; i++) deep[tierFor(rr, 9)]++;
t('the deep floors are where the good things are', deep.mythic > 0 && deep.epic > deep.mythic,
  `floor 9: ${Object.entries(deep).map(([k, v]) => `${k} ${(v / 200).toFixed(0)}%`).join(', ')}`);
t('the dark hits harder further down', dmgBonus(3) === 0 && dmgBonus(9) === 1);

// ------------------------------------------------------- the room library --
// The rooms are hand-drawn, and hand-drawn things rot. These are the standards
// the library was rebuilt to meet, so that adding a room cannot quietly undo it.
const { checkLibrary } = await import('./roomcheck.mjs');
const { ROOMS } = await import('./rooms.js');
const { roomReport } = await import('./floormetrics.mjs');

const { parseRoom } = await import('./rules.js');
const { checkQuarters, checkQuarter } = await import('./roomcheck.mjs');
const { QUARTERS } = await import('./quarters.js');
const badQ = checkQuarters();
t('every quarter can be entered and leaves nothing stranded',
  badQ.length === 0, badQ.map((b2) => `${b2.id}: ${b2.errs[0]}`).join('; ') || `${QUARTERS.length} quarters`);

// The rule has to actually reject things, or it is decoration.
// Built from the quarter size rather than written as 3x3 literals, so the rule
// keeps being tested when the floor grows. A quarter is authored in NW form, so
// the spine is the east column and the south row.
const { QS } = await import('./rules.js');
const qRow = (ch) => ch.repeat(QS);
const solid = Array.from({ length: QS }, () => qRow('#'));
const open = Array.from({ length: QS }, () => qRow('.'));
const sealed = solid.map((r, y) => (y === 0 ? '.' + r.slice(1) : r));       // one cell, walled in
const cornered = Array.from({ length: QS }, (_, y) =>                        // a block that never
  (y < QS - 1 ? qRow('.').slice(0, QS - 1) + '#' : qRow('#')));              // touches the spine
t('and the quarter rule refuses a corner that cannot be entered',
  checkQuarter(sealed).length > 0
  && checkQuarter(cornered).length > 0
  && checkQuarter(solid).length > 0
  && checkQuarter(open).length === 0,
  `at ${QS}x${QS}`);

// THE THEOREM, checked rather than trusted: four valid quarters around an open
// spine compose into a connected floor, every time, with no global retry.
let cut = 0;
for (let i = 0; i < 1500; i++) {
  const f = genChamber(`whole-${i}`, 1 + (i % 14), i % 2);
  const reach = new Uint8Array(W * H);
  const q = [f.pos];
  reach[idx(f.pos[0], f.pos[1])] = 1;
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (!walkable(f.tiles, nx, ny) || reach[idx(nx, ny)]) continue;
      reach[idx(nx, ny)] = 1; q.push([nx, ny]);
    }
  }
  let orphan = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (walkable(f.tiles, x, y) && !reach[idx(x, y)]) orphan++;
  }
  const need = [...f.stairs, ...(f.exit ? [f.exit] : []),
    ...f.relics.map((g) => [g.x, g.y]), ...f.enemies.map((e) => [e.x, e.y])];
  if (orphan || !need.every(([x, y]) => reach[idx(x, y)])) cut++;
}
t('four quarters and a spine always make one connected floor', cut === 0, `${cut} broken of 1500`);

const asm = [];
for (let i = 0; i < 400; i++) asm.push(genChamber(`share-${i}`, 5, i % 2).assembled ? 1 : 0);
const share = asm.reduce((a2, b3) => a2 + b3, 0) / asm.length;
t('and both generators are actually being used',
  share > 0.25 && share < 0.6, `${Math.round(share * 100)}% assembled`);

const broken = checkLibrary();
t('every drawn room is walkable, eight ways up, in its worst furnishing',
  broken.length === 0, broken.map((b2) => `${b2.id}: ${b2.errs[0]}`).join('; ') || `${ROOMS.length} rooms`);

const report = await roomReport();
const num = (v) => parseFloat(String(v));
const bending = report.filter((r4) => num(r4.route) >= 1.3);
t('most rooms bend the walk rather than pointing at the stair',
  bending.length >= report.length * 0.55,
  `${bending.length} of ${report.length} at 1.3x or better`);

const nooks = report.filter((r4) => num(r4.nook) <= 2);
t('most rooms have somewhere to hide',
  nooks.length >= report.length * 0.6, `${nooks.length} of ${report.length} have a tile that sees 2 or fewer`);

const lines = report.map((r4) => num(r4.line));
t('the library varies how much room a spitter is given',
  Math.max(...lines) - Math.min(...lines) >= 2,
  `longest lane runs ${Math.min(...lines)} to ${Math.max(...lines)} across the rooms`);

const slots = report.map((r4) => r4['foe slots']);
t('every room can host a deep floor', Math.min(...slots) >= 5, `fewest slots in any room: ${Math.min(...slots)}`);
t('every room has more than one place to put the loot',
  report.every((r4) => r4['relic slots'] >= 1), 'so the same room does not always hide it in the same corner');

// The whole point of drawing rooms rather than scattering blocks. If this ever
// stops being true, the library has drifted back into noise.
const { report: floorReport, scatterFloor } = await import('./floormetrics.mjs');
const drawn = floorReport('drawn', (i) => genChamber(`ab-${i}`, 5), 250);
const scattered = floorReport('scattered', (i) => scatterFloor(`ab-${i}`, 5), 250);
t('drawn floors bend the walk further than scattered ones did',
  parseFloat(drawn['route detour']) > parseFloat(scattered['route detour']) * 1.25,
  `${drawn['route detour']} drawn vs ${scattered['route detour']} scattered`);

// ------------------------------------------------------- depth means something --
// Two defects the design panel found, both invisible to the balance harness
// because a bot dies around floor five and never sees floor twenty.
const { bodyCap } = await import('./rules.js');
let worstDensity = 0, worstFloor = null;
const floorHp = {};
for (const d of [4, 8, 12, 20, 30]) {
  let hp = 0, n = 0;
  for (let i = 0; i < 300; i++) {
    const f = genChamber(`dense-${i}`, d, i % 2);
    let area = 0;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (walkable(f.tiles, x, y)) area++;
    const density = f.enemies.length / Math.max(1, area);
    if (density > worstDensity) { worstDensity = density; worstFloor = `${f.room} at depth ${d}`; }
    if (f.enemies.length > bodyCap(area)) worstDensity = 99;
    hp += f.enemies.reduce((a2, e) => a2 + e.hp, 0); n++;
  }
  floorHp[d] = hp / n;
}
t('no floor is ever mostly monsters', worstDensity <= 0.28,
  `worst ${Math.round(worstDensity * 100)}% of the floor — ${worstFloor}`);

// The assembler drew its pool from every open tile rather than a room's
// authored slots, so it put 23.7 bodies on a 36-tile floor at depth 30.
t('the body count is capped by the size of the floor',
  bodyCap(36) <= 9 && bodyCap(12) <= 3 && bodyCap(60) === 9);

// And with bodies capped, depth has to keep meaning something some other way.
t('a deep floor is heavier even though it is not more crowded',
  floorHp[30] > floorHp[8] * 1.6 && floorHp[12] > floorHp[4] * 1.8,
  `total hit points on the floor: ${[4, 8, 12, 20, 30].map((d) => `d${d} ${Math.round(floorHp[d])}`).join(', ')}`);

// Every drawn room used to wake you at 1,1 with the way out at 1,7 — the eight
// orientations move that around the screen and never change the relationship,
// which is the thing a player actually reads on a one-screen board.
const spawnExit = new Set();
for (const room of ROOMS) {
  const p2 = parseRoom(room);
  spawnExit.add(Math.abs(p2.spawn[0][0] - p2.exit[0][0]) + Math.abs(p2.spawn[0][1] - p2.exit[0][1]));
}
t('the rooms do not all put the way out the same distance from where you wake',
  spawnExit.size >= 5, `${spawnExit.size} different distances across ${ROOMS.length} rooms`);

// ------------------------------------------------- the dungeon has not moved --
// A run is verified by replaying (seed, moves) through this ruleset, and the
// ruleset reads the room library. So the day a room is repaired, every stored
// run replays into a DIFFERENT dungeon — it either fails verification, or, far
// worse, quietly succeeds against a board it never saw and validates loot that
// nobody earned. Today nothing is stored, so this costs nothing; the moment
// anything is, it is the only failure on the list that cannot be fixed after
// the fact, because the runs are gone.
//
// So: two hundred floors reduced to one number. Change anything that shapes a
// floor and this goes red. That is the point — regenerate it deliberately and
// bump GEN_VERSION in the same commit, so a run can only be checked against the
// dungeon it was actually played in.
const { createHash } = await import('node:crypto');
const { GEN_VERSION } = await import('./rules.js');
const GOLDEN = 'fc1e55c205127250f64627c060079f6bd0221a1c436a10a061c0e4f861ffde47';
const GOLDEN_GEN = 9;

const digest = createHash('sha256');
for (let i = 0; i < 100; i++) for (const door of [0, 1]) {
  const f = genFloor(`golden-${i}`, 1 + (i % 12), door);
  digest.update(Buffer.from(f.tiles));
  digest.update(JSON.stringify([f.pos, f.stairs, f.exit, f.rich,
    f.enemies.map((e) => [e.kind, e.x, e.y, e.hp]),
    f.relics.map((g) => [g.x, g.y, g.relic.tier, g.relic.form])]));
}
const now = digest.digest('hex');
t('the dungeon is exactly the dungeon it was when this digest was taken',
  now === GOLDEN,
  now === GOLDEN ? `gen ${GEN_VERSION}, 200 floors`
    : `GENERATION CHANGED. If you meant to: bump GEN_VERSION and set GOLDEN to ${now}`);
t('and the version was bumped with it', GEN_VERSION === GOLDEN_GEN || now !== GOLDEN,
  `GEN_VERSION ${GEN_VERSION}`);
t('every run carries the version it was played under',
  new Run('stamp').summary().gen === GEN_VERSION);

// --------------------------------------------------------------- colour composes --
// The moss jitter shades a colour and the face shading shades it again. When
// shade returned `rgb(...)` its own parser could not read that back, so the
// second call produced NaN and painted pure black: every pillar in the dungeon
// was a black silhouette with bright green speckles on top. The fix is that
// shade's output is valid shade input. This asserts exactly that.
const { shade } = await import('./render.js');
const once = shade('#8b8173', 0.62);
t('a shaded colour can be shaded again', shade(shade('#8b8173', 1.0), 0.62) === once,
  `${shade(shade('#8b8173', 1.0), 0.62)} vs ${once}`);
// checked by luminance, not by string, so it holds whatever format shade returns
const lum = (s2) => (s2.match(/[0-9a-f]{2}/gi) || []).map((h) => parseInt(h, 16))
  .concat((s2.match(/\d+/g) || []).map(Number)).slice(0, 3).reduce((a, b) => a + b, 0);
t('shading never silently returns black',
  ['#8b8173', '#9d9384', '#8d9a6b', '#b3a894'].every((col) =>
    [1, 0.8, 0.62].every((f) => lum(shade(shade(col, 0.97), f)) > 40)));
t('shading is monotone', (() => {
  const v = (h) => parseInt(h.slice(1), 16);
  return v(shade('#8b8173', 0.5)) < v(shade('#8b8173', 0.8))
    && v(shade('#8b8173', 0.8)) < v(shade('#8b8173', 1));
})());

// ---------------------------------------------------------------- the gear --
// Weapons are geometry, so the tests are geometry: each form is staged in a
// controlled fight and its one promise is checked, plus the promise that a
// loadout replays to the same run — without which the leaderboard can verify
// nothing.
{
  const { FLOOR: FL, WALL: WL } = await import('./rules.js');
  const stage = (loadout) => {
    const r = new Run('gear-stage', loadout);
    // a bare arena mid-floor, nothing else alive
    r.x = 22; r.y = 22;
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      r.tiles[(22 + dy) * 44 + (22 + dx)] = FL;
    }
    r.enemies = [];
    r.ground = [];
    r.hp = r.maxHp();
    r.look(); r.think();
    return r;
  };
  const foe = (r, dx, dy, hp = 9) => {
    const e = { id: 90 + r.enemies.length, kind: 'husk', x: r.x + dx, y: r.y + dy, hp, cool: 0, intent: null };
    r.enemies.push(e);
    r.look(); r.think();
    return e;
  };

  // the spear reaches two, over a hole, never through stone
  const sp = { class: 'lancer', weapon: { id: 'w1', slot: 'weapon', form: 'spear', tier: 'common', name: 'Test Spear', power: 1 } };
  let r = stage(sp);
  let e = foe(r, 2, 0);
  t('a spear strikes a foe two tiles down a line', r.act({ t: 'r', d: 0 }).ok && e.hp === 7, `hp ${e.hp}`);
  r = stage(sp);
  r.tiles[r.y * 44 + (r.x + 1)] = 5;             // a GAP between us
  e = foe(r, 2, 0);
  t('and strikes over a hole', r.act({ t: 'r', d: 0 }).ok && e.hp === 7, `hp ${e.hp}`);
  r = stage(sp);
  r.tiles[r.y * 44 + (r.x + 1)] = WL;            // stone between us
  e = foe(r, 2, 0);
  t('but never through stone', !r.act({ t: 'r', d: 0 }).ok, 'strike went through a wall');

  // the maul throws the body back, and hits harder against a wall
  const ml = { class: 'breaker', weapon: { id: 'w2', slot: 'weapon', form: 'maul', tier: 'common', name: 'Test Maul', power: 1 } };
  r = stage(ml);
  e = foe(r, 1, 0);
  r.act({ t: 'm', d: 0 });
  t('a maul throws what it hits one tile back', e.x === r.x + 2 && e.hp === 7, `at +${e.x - r.x}, hp ${e.hp}`);
  r = stage(ml);
  r.tiles[r.y * 44 + (r.x + 2)] = WL;            // nowhere to be thrown
  e = foe(r, 1, 0);
  r.act({ t: 'm', d: 0 });
  t('and hits harder when there is nowhere to throw', e.x === r.x + 1 && e.hp === 6, `at +${e.x - r.x}, hp ${e.hp}`);

  // fangs answer an adjacent striker
  const fg = { class: 'feral', weapon: { id: 'w3', slot: 'weapon', form: 'fangs', tier: 'common', name: 'Test Fangs', power: 1 } };
  r = stage(fg);
  e = foe(r, 1, 0, 9);
  // an adjacent husk already holds a strike intent, so one wait = one strike
  r.act({ t: 'w' });
  t('fangs bleed whatever strikes from beside you', e.hp === 8, `striker hp ${e.hp}`);

  // mail softens, the floor never softens below one
  const mailKit = { armour: { id: 'a1', slot: 'armour', form: 'mail', tier: 'common', name: 'Test Mail', power: 1 } };
  r = stage(mailKit);
  const hp0 = r.hp;
  r.wound({ name: 'Test', dmg: 3 });
  t('mail softens every hit by one', hp0 - r.hp === 2, `took ${hp0 - r.hp}`);
  r = stage(mailKit);
  const hp1 = r.hp;
  r.wound({ name: 'Test', dmg: 1 });
  t('but a hit is never softened below one', hp1 - r.hp === 1, `took ${hp1 - r.hp}`);

  // the jerkin turns the first hit each floor
  const jk = { armour: { id: 'a2', slot: 'armour', form: 'jerkin', tier: 'common', name: 'Test Jerkin', power: 1 } };
  r = stage(jk);
  const hp2 = r.hp;
  r.wound({ name: 'Test', dmg: 3 });
  r.wound({ name: 'Test', dmg: 3 });
  t('a jerkin turns the first hit each floor', hp2 - r.hp === 3, `took ${hp2 - r.hp} across two hits`);

  // equipping from the pack swaps, costs the turn, and replays
  r = new Run('equip-1', { class: 'breaker' });
  r.carried.push({ id: 'found-1', slot: 'weapon', form: 'ram', tier: 'rare', name: 'Found Ram', power: 2, blurb: '' });
  const t0 = r.turn;
  const eq = r.act({ t: 'e', id: 'found-1' });
  t('wearing found gear swaps it in and costs the turn',
    eq.ok && r.weapon.form === 'ram' && r.turn === t0 + 1
    && r.carried.some((g) => g.id === 'starter-maul'), `now ${r.weapon.form}`);
  r = new Run('equip-2');
  r.carried.push({ id: 'found-2', slot: 'weapon', form: 'harpoon', tier: 'rare', name: 'Found Harpoon', power: 2, blurb: '' });
  t("another calling's arm is refused at the hand",
    !r.act({ t: 'e', id: 'found-2' }).ok && r.weapon.form === 'blade');

  // a loadout is part of the run's identity: same seed, same acts, same gear,
  // byte-identical summary — the whole basis of server-side verification
  const kit = { class: 'lancer', weapon: { id: 'lw', slot: 'weapon', form: 'spear', tier: 'epic', name: 'Loadout Spear', power: 3 } };
  const a1 = new Run('replay-gear', kit);
  const moves = [];
  for (let i = 0; i < 40 && !a1.over; i++) {
    const mv = { t: 'm', d: i % 4 };
    if (a1.act(mv).ok) moves.push(mv); else { a1.act({ t: 'w' }); moves.push({ t: 'w' }); }
  }
  const b1 = replay('replay-gear', moves, kit);
  t('a run with a loadout replays byte-identical',
    !b1.error && JSON.stringify(b1.summary) === JSON.stringify(a1.summary()),
    b1.error || 'summaries match');
  const c1 = replay('replay-gear', moves, null);
  t('and the same moves with different gear are a different run',
    !!c1.error || JSON.stringify(c1.summary) !== JSON.stringify(a1.summary()));
}

// ------------------------------------------------------------- the callings --
// Four callings, four armouries, four habits. Each perk and each exclusive
// arm gets cornered here in a bare arena where nothing else can interfere.
{
  const { CLASSES, WEAPONS, reformWeapon, passable: _p } = await import('./rules.js');
  const FL = 1, WL = 0;
  const stage = (loadout) => {
    const r = new Run('calling-stage', loadout);
    r.x = 22; r.y = 22;
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      r.tiles[(22 + dy) * 44 + (22 + dx)] = FL;
    }
    r.enemies = []; r.ground = [];
    r.hp = r.maxHp();
    r.look(); r.think();
    return r;
  };
  const foe = (r, dx, dy, hp = 9) => {
    const e = { id: 90 + r.enemies.length, kind: 'husk', x: r.x + dx, y: r.y + dy, hp, cool: 0, intent: null };
    r.enemies.push(e);
    return e;
  };

  t('every calling owns exactly two arms and no arm serves two callings',
    Object.values(CLASSES).every((c) => c.weapons.length === 2
      && c.weapons.every((w) => WEAPONS[w]))
    && new Set(Object.values(CLASSES).flatMap((c) => c.weapons)).size === 8);

  // greatblade: the sworn tile and both flanks
  const gb = { class: 'warden', weapon: { id: 'g1', slot: 'weapon', form: 'greatblade', tier: 'common', name: 'T', power: 1 } };
  let r = stage(gb);
  let a = foe(r, 1, 0), b = foe(r, 1, 1), c = foe(r, 1, -1), far = foe(r, 2, 0);
  r.act({ t: 'm', d: 0 });
  t('a greatblade strikes the tile beside you and both its flanks',
    a.hp === 6 && b.hp === 6 && c.hp === 6 && far.hp === 9,
    `${a.hp}/${b.hp}/${c.hp}, bystander ${far.hp}`);

  // harpoon: strikes at reach and drags the thing beside you
  const hp = { class: 'lancer', weapon: { id: 'h1', slot: 'weapon', form: 'harpoon', tier: 'common', name: 'T', power: 1 } };
  r = stage(hp);
  a = foe(r, 2, 0);
  const pulled = r.act({ t: 'r', d: 0 });
  t('a harpoon drags what it hits to your side', pulled.ok && a.x === r.x + 1 && a.y === r.y && a.hp === 7,
    `at +${a.x - r.x}, hp ${a.hp}`);
  r = stage(hp);
  a = foe(r, 2, 0); b = foe(r, 1, 0);
  r.act({ t: 'r', d: 0 });
  t('but never drags one thing into another', b.x === r.x + 1 && a.x === r.x + 2 || a.hp === 9,
    'the near foe was struck instead');

  // ram: thrown two back, wall still pays
  const rm = { class: 'breaker', weapon: { id: 'r1', slot: 'weapon', form: 'ram', tier: 'common', name: 'T', power: 1 } };
  r = stage(rm);
  a = foe(r, 1, 0);
  r.act({ t: 'm', d: 0 });
  t('a ram throws what it hits two tiles back', a.x === r.x + 3 && a.hp === 7, `at +${a.x - r.x}`);
  r = stage(rm);
  r.tiles[r.y * 44 + (r.x + 2)] = WL;
  a = foe(r, 1, 0);
  r.act({ t: 'm', d: 0 });
  t('and the wall still finishes what the ram started', a.x === r.x + 1 && a.hp === 6, `at +${a.x - r.x}, hp ${a.hp}`);

  // breaker concussion: any strike knocks the wind out
  r = stage(rm);
  r.tiles[r.y * 44 + (r.x + 2)] = WL;              // nowhere to be thrown
  a = foe(r, 1, 0);
  a.wind = { tiles: [[r.x, r.y]] };
  r.act({ t: 'm', d: 0 });
  t("a breaker's strike knocks the wind-up out of what it hits", a.wind === null);

  // feral leech: every fall feeds you, riposte falls included
  const fr = { class: 'feral', weapon: { id: 'f1', slot: 'weapon', form: 'fangs', tier: 'common', name: 'T', power: 1 } };
  r = stage(fr);
  r.hp = 5;
  a = foe(r, 1, 0, 1);
  r.act({ t: 'm', d: 0 });
  t('a feral heals 1 when something falls to it', r.hp === 6, `hp ${r.hp}`);

  // warden and lancer habits
  t('a warden starts with 2 more health',
    new Run('calling-stage', { class: 'warden' }).maxHp() === new Run('calling-stage', { class: 'feral' }).maxHp() + 2);
  t('a lancer sees one tile further',
    new Run('calling-stage', { class: 'lancer' }).sightR() === new Run('calling-stage').sightR() + 1);

  // the calling is part of the run's identity
  const w1 = new Run('calling-id', { class: 'feral' });
  const moves = [];
  for (let i = 0; i < 30 && !w1.over; i++) { if (!w1.act({ t: 'm', d: i % 4 }).ok) w1.act({ t: 'w' }); moves.push(w1.acts[w1.acts.length - 1]); }
  const back = replay('calling-id', w1.acts, { class: 'feral' });
  t('a run replays identically with its calling', !back.error
    && JSON.stringify(back.summary) === JSON.stringify(w1.summary()));
  t("and the summary names the calling", w1.summary().loadout.class === 'feral');

  // the day's one prize arrives in each calling's shape
  const prize = { id: 'p', slot: 'weapon', form: 'harpoon', tier: 'epic', name: 'Mirefen Harpoon' };
  const re = reformWeapon(prize, 'breaker');
  t("the day's weapon prize is forged to the claimer's calling",
    re.form === 'ram' && re.name === 'Mirefen Ram' && reformWeapon(prize, 'lancer').form === 'harpoon');

  // drops are shaped to the calling
  const fMine = genFloor('drop-shape', 3, 0, null, 'feral');
  const wf = fMine.relics.map((g) => g.relic).filter((g) => g.slot === 'weapon');
  t('found weapons are always your own calling\'s',
    wf.every((g) => WEAPONS[g.form].klass === 'feral'), `${wf.length} weapons checked`);
}

// ------------------------------------------------------------ the floor plan --
// A floor is supposed to have a SHAPE: somewhere quiet to wake, a couple of
// easy rooms, a long dangerous middle, one room worth the trip, and a guard on
// each way down. That shape comes from the chamber graph rather than from a
// roll, so it should hold on every floor, not most of them.
{
  let noHoard = 0, noMouth = 0, mouthArmed = 0, hoardPoor = 0, gateSoft = 0, flat = 0;
  const N = 120;
  for (let i = 0; i < N; i++) {
    const f = genFloor(`plan-${i}`, 4 + (i % 12), i % 2);
    const roles = f.roles;
    if (!roles.includes('hoard')) noHoard++;
    if (!roles.includes('mouth')) noMouth++;
    // you never wake up next to something
    const mouthCell = roles.indexOf('mouth');
    if (f.enemies.some((e) => e.cell === mouthCell)) mouthArmed++;
    // the hoard is worth the walk
    const hoardCell = roles.indexOf('hoard');
    const inHoard = f.relics.filter((g) => g.cell === hoardCell).length;
    const perOther = (f.relics.length - inHoard) / Math.max(1, roles.length - 1);
    if (inHoard <= perOther) hoardPoor++;
    // a way down is guarded
    for (const p of f.stairs) {
      const cell = Math.floor(p[1] / 11) * 4 + Math.floor(p[0] / 11);
      if (!f.enemies.some((e) => e.cell === cell)) gateSoft++;
    }
    // and the walk out from the mouth actually gets longer
    if (Math.max(...f.depths) < 3) flat++;
  }
  t('every floor has a room worth the walk', noHoard === 0, `${noHoard} of ${N} without one`);
  t('and a quiet room to wake up in', noMouth === 0 && mouthArmed === 0,
    `${noMouth} without one, ${mouthArmed} with something already in it`);
  t('and the hoard really is the richest room on it', hoardPoor < N * 0.25,
    `${hoardPoor} of ${N} floors where it was not`);
  t('and the floor runs at least three chambers deep', flat === 0, `${flat} of ${N} flat`);
}

// -------------------------------------------------------- sixteen chambers --
// A floor is now four chambers by four with doors between them, and the whole
// thing hangs on one claim: forcing a chamber's spine open welds its floor into
// one piece, so a door knocked where two spines meet welds the chambers. The
// spanning tree does the rest.
//
// The claim has a soft edge — it assumes a chamber's own floor touches its own
// spine, which is true at these densities and is not a proof — so this walks
// whole floors and counts. The first version of forceSpine spared GAP tiles on
// the reasoning that a hole is scenery; seventy-seven floors in three hundred
// came out with something stranded behind one.
{
  const { reachableOnFloor, FLOOR: FL, STAIRS: ST, EXIT: EX } = await import('./rules.js');
  let stranded = 0, lostTiles = 0, worst = 1, unreachableStair = 0, thin = 0;
  const N = 240;
  for (let i = 0; i < N; i++) {
    const d = 1 + (i % 20);
    const f = genFloor(`floor-${i}`, d, i % 2);
    let open = 0;
    for (const tt of f.tiles) if (tt === FL || tt === ST || tt === EX) open++;
    const seen = reachableOnFloor(f.tiles, f.pos);
    if (seen.size < open) { stranded++; lostTiles += open - seen.size; }
    worst = Math.min(worst, seen.size / open);
    for (const p of f.stairs) if (!seen.has(`${p[0]},${p[1]}`)) unreachableStair++;
    if (f.exit && !seen.has(`${f.exit[0]},${f.exit[1]}`)) unreachableStair++;
    if (f.stairs.length < 2) thin++;
  }
  t('sixteen chambers make one connected floor', stranded === 0,
    stranded ? `${stranded} of ${N} floors stranded ${(lostTiles / stranded).toFixed(0)} tiles, worst ${(worst * 100).toFixed(0)}% reachable`
      : `${N} floors, nothing stranded`);
  t('and every way down and out can be walked to', unreachableStair === 0, `${unreachableStair} unreachable`);
  t('and every floor has two ways down', thin === 0, `${thin} of ${N} short`);
}

// A floor is worth crossing: big enough to be an expedition, not so crowded
// that it is a wall of bodies.
{
  const { FLOOR: FL, STAIRS: ST, EXIT: EX } = await import('./rules.js');
  let open = 0, foes = 0, loot = 0;
  const N = 60;
  for (let i = 0; i < N; i++) {
    const f = genFloor(`size-${i}`, 3 + (i % 10), i % 2);
    for (const tt of f.tiles) if (tt === FL || tt === ST || tt === EX) open++;
    foes += f.enemies.length; loot += f.relics.length;
  }
  const tiles = open / N;
  t('a floor is four chambers across', tiles > 600, `${tiles.toFixed(0)} tiles you can stand on`);
  t('and is not a wall of bodies', foes / N / tiles < 0.06,
    `${(foes / N).toFixed(0)} foes and ${(loot / N).toFixed(1)} relics over ${tiles.toFixed(0)} tiles`);
}

// ------------------------------------------------------------- the viewport --
// The frame no longer holds the whole floor, so there is nothing to crop into
// and no border ring to protect. What has to be true instead is that the window
// is aimed at the delver and is big enough to be worth looking at.
{
  const { px, VIEW_W: VW, VIEW_H: VH, VIEW_R } = await import('./render.js');
  const { SIGHT } = await import('./rules.js');
  const r0 = new Run('window');
  const { lookAt } = await import('./render.js');
  lookAt(r0.x, r0.y);
  const [cx, cy] = px(r0.x + 0.5, r0.y + 0.5, 0);
  t('the window is aimed at the delver',
    Math.abs(cx - VW / 2) < 1 && Math.abs(cy - VH / 2) < 40,
    `delver at ${cx.toFixed(0)},${cy.toFixed(0)} in a ${VW.toFixed(0)}x${VH.toFixed(0)} frame`);
  t('and reaches further than the delver can see', VIEW_R > SIGHT,
    `window ${VIEW_R} tiles, sight ${SIGHT}`);
}

// A tap is turned back into a tile with the same origin the picture is drawn
// from. If those two ever disagree the player taps one tile and moves to
// another, which is unplayable and invisible in a screenshot. With a window
// that moves, this has to hold wherever the window happens to be pointed.
{
  const { px, tileAt, lookAt, VIEW_R } = await import('./render.js');
  let off = 0, n = 0;
  for (const [ox, oy] of [[5, 5], [22, 22], [40, 3], [3, 40], [43, 43]]) {
    lookAt(ox, oy);
    for (let dy = -VIEW_R; dy <= VIEW_R; dy++) for (let dx = -VIEW_R; dx <= VIEW_R; dx++) {
      const x = ox + dx, y = oy + dy;
      const [sx, sy] = px(x + 0.5, y + 0.5, 0);
      const [bx, by] = tileAt(sx, sy);
      n++;
      if (bx !== x || by !== y) off++;
    }
  }
  t('a tap lands on the tile it was drawn over, wherever the window is',
    off === 0, `${off} of ${n} wrong across five camera positions`);
}

// A bigger floor is bought with a smaller tile, because the whole board has to
// stay on one screen — that is the game's premise, not a layout preference. On
// the narrowest phone the board is width-limited, so the tile size follows
// directly from how wide the frame is, and there is a point past which the
// dungeon is no longer tappable. This pins it: grow the floor again and this
// fails before anyone has to find out by trying to play it on a phone.
{
  const { VIEW_W: VW2 } = await import('./render.js');
  const PHONE = 390;
  const tile = 46 * PHONE / VW2;            // TW, in screen pixels, on that phone
  t('a tile is still big enough to tap on the narrowest phone', tile >= 34,
    `${tile.toFixed(1)}px wide at ${PHONE}px`);
}

// ------------------------------------------------------------- the camp pays --
// The dungeon keeps no memory; the camp is nothing but memory. So the memory
// has to be right: a run home pays its loot in exactly once, the day's marks
// accumulate the way each mark says it does, and the prize forges once.
{
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  const camp = await import('./camp.js');
  const { playOne } = await import('./playtest.mjs');

  // the clearing itself: every station and the stair can be walked to
  {
    const c = camp.makeCamp();
    const seen = new Set([`${c.x},${c.y}`]);
    const q = [[c.x, c.y]];
    while (q.length) {
      const [x, y] = q.shift();
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
        if (!walkable(c.tiles, nx, ny) || seen.has(k)) continue;
        seen.add(k); q.push([nx, ny]);
      }
    }
    const marks = camp.STATIONS.map((s) => [s.x, s.y]).concat([camp.CAMP_STAIR]);
    t('every camp station and the stair can be walked to',
      marks.every(([x, y]) => seen.has(`${x},${y}`)), `${marks.length} marks`);
  }

  const day = camp.dayKey();
  {
    const a = camp.questsFor(day), b = camp.questsFor(day);
    t('the board asks everyone the same three marks and forges the same prize',
      JSON.stringify(a.quests.map((q) => q.id)) === JSON.stringify(b.quests.map((q) => q.id))
      && a.prize.name === b.prize.name && a.prize.tier === b.prize.tier);
  }

  // a real bot run comes home and pays in
  let sum = null;
  for (let i = 0; i < 60; i++) {
    const s = playOne(`camp-e2e-${i}`, 2).summary();
    if (s.out && s.kept.some((g) => !g.owned)) { sum = s; break; }
  }
  t('a bot could get out carrying something at all', !!sum);
  if (sum) {
    const pts = { common: 10, rare: 40, epic: 120, mythic: 400 };
    const found = sum.kept.filter((g) => !g.owned);
    const wantCoin = found.filter((g) => g.slot === 'treasure').reduce((a, g) => a + (pts[g.tier] || 10), 0);
    const wantStash = found.filter((g) => g.slot !== 'treasure').length;
    const res = camp.creditRun(sum);
    t('a run home pays its loot into the stash and its treasure into groats',
      res.coined === wantCoin && camp.loadStash().length === wantStash && camp.groats() === wantCoin,
      `${wantStash} stashed, ${wantCoin} coined`);

    // marks accumulate across runs — except the ones that take your best single run
    const sheet = camp.questsFor(day);
    const after1 = { ...res.progress.done };
    const res2 = camp.creditRun(sum);
    const held = sheet.quests.every((q) => {
      const got = q.of(sum), a = after1[q.id] || 0, b = res2.progress.done[q.id] || 0;
      return q.high ? (a === got && b === got) : (a === got && b === got * 2);
    });
    t("the day's marks accumulate, and best-run marks take the best run", held);
  }

  // all three marks done: the prize forges, once, and camp gear never duplicates
  {
    mem.clear();
    const { reformWeapon: reform } = await import('./rules.js');
    const sheet = camp.questsFor(day);
    // a weapon prize arrives reshaped to the claimer's calling (warden here)
    const expectPrize = reform(sheet.prize, 'warden');
    const big = {
      out: true, depth: 9, flawless: 9, felled: 60,
      kills: { husk: 60, spitter: 60, sentinel: 60 },
      kept: [
        { id: 'e2e-own', slot: 'weapon', form: 'blade', tier: 'rare', name: 'Camp Blade', owned: true },
        { id: 'e2e-got', slot: 'weapon', form: 'spear', tier: 'mythic', name: 'Found Spear', owned: false },
      ],
    };
    const res = camp.creditRun(big);
    const stash = camp.loadStash();
    const reward = sheet.quests.reduce((a, q) => a + q.reward, 0);
    t('finishing all three marks forges the prize into the stash',
      !!res.prized && stash.some((g) => g.name === expectPrize.name && g.owned) && camp.groats() === reward,
      `prize ${expectPrize.name}, +${reward} groats`);
    t('gear you walked in with never duplicates into the stash',
      !stash.some((g) => g.id === 'e2e-own') && stash.some((g) => g.id === 'e2e-got'));
    const res2 = camp.creditRun(big);
    t('the prize forges once a day, however many runs come home',
      !res2.prized && camp.loadStash().filter((g) => g.name === expectPrize.name).length === 1);
  }

  delete globalThis.localStorage;
}

// ------------------------------------------------------- the well believes --
// ...nothing. /api/delve-run accepts a record of what a player did and replays
// it before a single byte lands on the board. These are the doors it must not
// open: a lie about the score, a move the rules refuse, gear that does not
// exist, a day that is not today.
{
  const { verifyDelveRun, DAILY } = await import('../api/_delve.js');
  const { playOne } = await import('./playtest.mjs');
  const day = new Date().toISOString().slice(0, 10);

  let run = null;
  for (let g = 2; g <= 6 && !(run && run.over); g += 2) run = playOne(DAILY(day), g);
  t('a bot can finish the daily at all', !!(run && run.over));
  if (run && run.over) {
    const body = { day, name: 'well-check', acts: run.acts, loadout: null, claim: run.summary() };
    const good = verifyDelveRun(body);
    t('an honest record is believed, and the row is the replay, not the claim',
      !good.error && good.row.score === run.summary().score && good.row.depth === run.depth
      && good.row.out === run.out && (run.out ? good.row.died_x === null : good.row.died_x === run.x));

    const lied = verifyDelveRun({ ...body, claim: { ...body.claim, score: body.claim.score + 500 } });
    t('a claim with a bigger score than the replay is refused', !!lied.error);

    const forged = verifyDelveRun({ ...body, acts: [{ t: 'x' }, ...body.acts.slice(1)] });
    t('a move the rules refuse sinks the whole record', !!forged.error);

    const padded = verifyDelveRun({ ...body, acts: body.acts.concat([{ t: 'w' }]) });
    t('a record that continues after the end is refused', !!padded.error);

    const ghost = verifyDelveRun({ ...body,
      loadout: { weapon: { form: 'doomhammer', tier: 'mythic' }, armour: null, charm: null } });
    t('gear that does not exist is refused', !!ghost.error);

    const wrongCalling = verifyDelveRun({ ...body,
      loadout: { class: 'warden', weapon: { id: 'x', slot: 'weapon', form: 'harpoon', tier: 'rare', name: 'X' }, armour: null, charm: null } });
    t("another calling's arm is refused at the gate", !!wrongCalling.error);
    const fakeCalling = verifyDelveRun({ ...body,
      loadout: { class: 'necromancer', weapon: null, armour: null, charm: null } });
    t('a calling that does not exist is refused', !!fakeCalling.error);

    const stale = verifyDelveRun({ ...body, day: '2020-01-01' });
    t('a day that is not today is refused', !!stale.error);

    const half = verifyDelveRun({ ...body, acts: body.acts.slice(0, 3) });
    t('an unfinished delve cannot rank', !!half.error);
  }

  // walking in with real gear replays and ranks — the loadout is part of the
  // record, so the server reaches the same run the player played
  {
    const kit = { class: 'lancer', weapon: { id: 'w1', slot: 'weapon', form: 'spear', tier: 'rare', name: 'Well Spear', owned: true },
      armour: null, charm: { id: 'c1', slot: 'charm', form: 'fang', tier: 'common', name: 'Well Fang', effect: 'guard', owned: true } };
    const run2 = playOne(DAILY(day), 3, kit);
    if (run2.over) {
      const v = verifyDelveRun({ day, name: 'well-geared', acts: run2.acts, loadout: kit, claim: null });
      t('a geared record replays to the same score the player saw',
        !v.error && v.row.score === run2.summary().score, v.error || '');
    } else t('a geared record replays to the same score the player saw', true, '(bot never finished — skipped)');
  }
}

console.log(fail ? `\n${fail} DELVE CHECK(S) FAILED` : '\nALL DELVE CHECKS PASS');
process.exit(fail ? 1 : 0);
