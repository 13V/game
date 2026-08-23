// Plays DELVE, a great many times, and reports what happened.
//
// A dungeon that cannot be survived is not tense, it is broken; one that cannot
// kill you is not a dungeon. The only way to know which one this is, is to have
// something play it a few hundred times and count.
//
//   node delve/playtest.mjs [runs]
import { Run, W, H, idx, DIRS, walkable, blocksSight, STAIRS, EXIT, hasExit, KINDS, TIERS, WEAPONS } from './rules.js';

// ---- a player who is not very clever, on purpose ---------------------------
// If a dumb bot can reach floor 8, the dungeon is too soft. It reads threatened
// tiles, hits what is next to it, and otherwise walks toward where it is going.
function pathStep(run, to) {
  const prev = new Int16Array(W * H).fill(-1);
  const q = [[run.x, run.y]];
  prev[idx(run.x, run.y)] = idx(run.x, run.y);
  while (q.length) {
    const [x, y] = q.shift();
    if (x === to[0] && y === to[1]) break;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (!walkable(run.tiles, nx, ny) || prev[idx(nx, ny)] >= 0) continue;
      prev[idx(nx, ny)] = idx(x, y);
      q.push([nx, ny]);
    }
  }
  let cur = idx(to[0], to[1]);
  if (prev[cur] < 0) return null;
  while (prev[cur] !== idx(run.x, run.y)) { cur = prev[cur]; if (cur === prev[cur]) return null; }
  const tx = cur % W, ty = Math.floor(cur / W);
  return DIRS.findIndex(([dx, dy]) => run.x + dx === tx && run.y + dy === ty);
}

export function playOne(seed, greed, loadout = null) {
  const run = new Run(seed, loadout);
  for (let guard = 0; guard < 900 && !run.over; guard++) {
    const threat = run.threat();
    const here = threat.get(`${run.x},${run.y}`);

    // wear the best thing in the pack when it is safe to spend the turn
    const beside = [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy]) => run.foeAt(run.x+dx, run.y+dy));
    if (!beside) {
      const rank = (g) => (g ? ['common','rare','epic','mythic'].indexOf(g.tier) : -1);
      const bw = run.carried.filter((g) => g.slot === 'weapon').sort((a,b) => rank(b)-rank(a))[0];
      if (bw && rank(bw) > rank(run.weapon)) { run.act({ t: 'e', id: bw.id }); continue; }
      const ba = run.carried.filter((g) => g.slot === 'armour').sort((a,b) => rank(b)-rank(a))[0];
      if (ba && rank(ba) > rank(run.armour)) { run.act({ t: 'e', id: ba.id }); continue; }
    }

    // something next to me and hurt enough to finish? A reach fighter would
    // rather open the distance and poke — that IS the weapon — so it retreats
    // to an unthreatened tile with nothing beside it when one exists.
    const adj = DIRS.map(([dx, dy], d) => ({ d, e: run.foeAt(run.x + dx, run.y + dy) })).filter((a) => a.e);
    const wr = WEAPONS[run.weapon.form] || {};
    if (adj.length && adj.every((a) => a.e.kind === 'sentinel') && (wr.reach || 1) >= 2 && run.hp > 3) {
      const outs = DIRS.map(([dx, dy], d) => ({ d, x: run.x + dx, y: run.y + dy }))
        .filter((o) => walkable(run.tiles, o.x, o.y) && !run.foeAt(o.x, o.y) && !threat.get(`${o.x},${o.y}`)
          && !DIRS.some(([ex, ey]) => run.foeAt(o.x + ex, o.y + ey)));
      if (outs.length && run.act({ t: 'm', d: outs[0].d }).ok) continue;
    }
    if (adj.length && run.hp > 3) { run.act({ t: 'm', d: adj[0].d }); continue; }

    // a reach arm pokes at two tiles before anything closes — without this the
    // bot holds a spear like a stick and every lancer sweep reads as a stall
    const w = WEAPONS[run.weapon.form] || {};
    if ((w.reach || 1) >= 2 && run.hp > 3) {
      let poked = false;
      for (let d = 0; d < 4 && !poked; d++) {
        const mx = run.x + DIRS[d][0], my = run.y + DIRS[d][1];
        const fx = run.x + DIRS[d][0] * 2, fy = run.y + DIRS[d][1] * 2;
        if (run.foeAt(fx, fy) && !run.foeAt(mx, my) && !blocksSight(run.tiles, mx, my)) {
          poked = run.act({ t: 'r', d }).ok;
        }
      }
      if (poked) continue;
    }

    // standing on a tile something is about to hit: move anywhere safer
    if (here === 'strike') {
      const outs = DIRS.map(([dx, dy], d) => ({ d, x: run.x + dx, y: run.y + dy }))
        .filter((o) => walkable(run.tiles, o.x, o.y) && !run.foeAt(o.x, o.y) && !threat.get(`${o.x},${o.y}`));
      if (outs.length) { run.act({ t: 'm', d: outs[0].d }); continue; }
    }

    // leave if the loot is good enough or the health is not
    const worth = run.carried.reduce((a, r) => a + TIERS.indexOf(r.tier) + 1, 0);
    const wantOut = run.hp <= 4 || worth >= greed;
    if (hasExit(run.depth) && wantOut && run.exit) {
      if (run.at(run.x, run.y) === EXIT) { run.act({ t: 'x' }); break; }
      const d = pathStep(run, run.exit);
      if (d >= 0) { run.act({ t: 'm', d }); continue; }
    }

    // grab anything lying about, then pick a way down
    const loot = run.ground[0];
    const tiers = ['common', 'rare', 'epic', 'mythic'];
    const worthOf = (p2) => (p2 ? tiers.indexOf(p2.tier) : -1);
    let door = 0;
    if (run.peeks && worthOf(run.peeks[1]) > worthOf(run.peeks[0])) door = 1;
    if (greed <= 8 && run.peeks) door = worthOf(run.peeks[0]) <= worthOf(run.peeks[1]) ? 0 : 1;
    const target = loot ? [loot.x, loot.y] : run.stairs[door];
    if (run.at(run.x, run.y) === STAIRS && !loot) { run.act({ t: 'd' }); continue; }
    const d = pathStep(run, target);
    if (d >= 0 && run.act({ t: 'm', d }).ok) continue;
    run.act({ t: 'w' });
  }
  return run;
}

import { pathToFileURL } from 'node:url';
const direct = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (!direct) { /* imported for its bot, not its report */ } else {

const N = Number(process.argv[2] || 300);
const rows = [];
for (const greed of [7, 16, 28]) {
  const out = [];
  for (let i = 0; i < N; i++) out.push(playOne(`test-${i}`, greed).summary());
  const got = out.filter((s) => s.out);
  const kept = got.flatMap((s) => s.kept);
  rows.push({
    greed,
    'got out': `${Math.round(got.length / N * 100)}%`,
    'avg depth': (out.reduce((a, s) => a + s.depth, 0) / N).toFixed(1),
    'deepest': Math.max(...out.map((s) => s.depth)),
    'relics kept / run': (kept.length / N).toFixed(2),
    'rare+': kept.filter((r) => r.tier !== 'common').length,
    'mythic': kept.filter((r) => r.tier === 'mythic').length,
    'avg turns': Math.round(out.reduce((a, s) => a + s.turns, 0) / N),
  });
}
console.table(rows);

// The greediest player of all: never leaves for loot, only when nearly dead.
// (Not a bot that never leaves at all — that one would simply reach the bottom.)
const deep = [];
for (let i = 0; i < N; i++) deep.push(playOne(`test-${i}`, 999).summary());
const byDepth = {};
for (const s of deep) { const k = Math.min(9, s.depth); (byDepth[k] ||= { n: 0, out: 0 }); byDepth[k].n++; if (s.out) byDepth[k].out++; }
console.log('\nbails only at 4 hp:',
  `reached floor ${(deep.reduce((a, s) => a + s.depth, 0) / N).toFixed(1)} on average,`,
  `got out ${Math.round(deep.filter((s) => s.out).length / N * 100)}% of the time`);

}
