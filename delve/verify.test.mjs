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
  Run, replay, genFloor, W, H, idx, DIRS, walkable, blocksSight, WALL, STAIRS, EXIT,
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
for (let i = 0; i < 200; i++) {
  const s = playOne(`carry-${i}`, 6).summary();
  if (!s.out) { deaths++; if (s.kept.length) keptOnDeath++; }
  else { exits++; if (s.lost.length) lostOnExit++; if (s.kept.length) withLoot++; }
}
t('dying keeps nothing at all', keptOnDeath === 0 && deaths > 20, `${deaths} deaths`);
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
  const f = genFloor(`whole-${i}`, 1 + (i % 14), i % 2);
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
for (let i = 0; i < 400; i++) asm.push(genFloor(`share-${i}`, 5, i % 2).assembled ? 1 : 0);
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
const drawn = floorReport('drawn', (i) => genFloor(`ab-${i}`, 5), 250);
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
    const f = genFloor(`dense-${i}`, d, i % 2);
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
const GOLDEN = '204a2e6b0208bdae62e442a29be74ad6f3cbe0a8b801136702d686500773bf38';
const GOLDEN_GEN = 5;

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

// ------------------------------------------------------------- the viewport --
// The frame is cropped INTO the outer ring of tiles to buy back the width a
// phone was spending on unlit rim. That is only safe while the ring holds
// nothing but wall and empty space, so this asserts it over 1600 floors rather
// than trusting that the room library still says so.
{
  const { WALL: WL, GAP: GP, W: GW, H: GH, idx } = await import('./rules.js');
  const bad = {};
  for (let i = 0; i < 800; i++) for (const door of [0, 1]) {
    const f = genFloor(`edge-${i}`, 1 + (i % 20), door);
    const look = (x, y) => { const t = f.tiles[idx(x, y)]; if (t !== WL && t !== GP) bad[t] = (bad[t] || 0) + 1; };
    for (let x = 0; x < GW; x++) { look(x, 0); look(x, GH - 1); }
    for (let y = 1; y < GH - 1; y++) { look(0, y); look(GW - 1, y); }
    const edge = (x, y) => x === 0 || y === 0 || x === GW - 1 || y === GH - 1;
    for (const e of f.enemies) if (edge(e.x, e.y)) bad.body = (bad.body || 0) + 1;
    for (const g of f.relics) if (edge(g.x, g.y)) bad.loot = (bad.loot || 0) + 1;
  }
  t('the ring the viewport crops into is only ever wall or nothing',
    Object.keys(bad).length === 0, JSON.stringify(bad) || '1600 floors');
}

// A tap is turned back into a tile with the same origin the picture is drawn
// from. If those two ever disagree the player taps one tile and moves to
// another, which is unplayable and invisible in a screenshot.
{
  const { px, tileAt, VIEW_W: VW, VIEW_H: VH } = await import('./render.js');
  const { W: GW2, H: GH2 } = await import('./rules.js');
  let off = 0, outside = 0;
  for (let y = 0; y < GH2; y++) for (let x = 0; x < GW2; x++) {
    const [sx, sy] = px(x + 0.5, y + 0.5, 0);
    const [bx, by] = tileAt(sx, sy);
    if (bx !== x || by !== y) off++;
    // every tile you can stand on has to be inside the frame, head included
    if (x > 0 && y > 0 && x < GW2 - 1 && y < GH2 - 1) {
      const [, ty] = px(x + 0.5, y + 0.5, 1.85);
      if (sx < 0 || sx > VW || sy < 0 || sy > VH || ty < 0) outside++;
    }
  }
  t('a tap lands on the tile it was drawn over', off === 0, `${off} of ${GW2 * GH2} wrong`);
  t('and no tile you can stand on falls outside the frame', outside === 0,
    `${outside} clipped of ${(GW2 - 2) * (GH2 - 2)}`);
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

console.log(fail ? `\n${fail} DELVE CHECK(S) FAILED` : '\nALL DELVE CHECKS PASS');
process.exit(fail ? 1 : 0);
