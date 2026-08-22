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

console.log(fail ? `\n${fail} DELVE CHECK(S) FAILED` : '\nALL DELVE CHECKS PASS');
process.exit(fail ? 1 : 0);
