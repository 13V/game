// The leaderboard's whole claim is that the server can reproduce a reign from
// its record. If a replay diverges from the play by so much as a coin, the
// claim is false — so this plays a game, records it, replays it, and demands
// the two agree exactly.
import { pathToFileURL } from 'node:url';
import { generateValley, seedFromString, idx, GRID, TILES, T, K, ring8 } from '../web/sim.js';
import { SimpleSim, B, KIND_ORDER, K_CHAPEL, TRADE, terrainProblemFor } from '../web/rules.js';
import { replay, scoreOf } from '../api/_score.js';

if (!process.argv[1] || pathToFileURL(process.argv[1]).href !== import.meta.url) process.exit(2);

const SEED = 'daily-2026-08-22';
const valley = generateValley(seedFromString(SEED));
const sim = new SimpleSim(valley);
const acts = [];
const act = (a) => acts.push([sim.day, ...a]);

function spot(kind) {
  for (let t = 0; t < TILES; t++) {
    const x = t % GRID, y = (t / GRID) | 0;
    if (!terrainProblemFor(valley, sim, x, y, kind)) return [x, y];
  }
  return null;
}

// a plausible 90-day reign that uses every kind of decision there is
for (let d = 0; d < 90 && !sim.fallen; d++) {
  const want = d % 5 === 0 ? K.FIELD : d % 5 === 1 ? K.COTTAGE : d % 5 === 2 ? K.SAWMILL
    : d % 5 === 3 ? K.QUARRY : K_CHAPEL;
  const c = B[want];
  if (sim.wood >= c.wood && sim.stone >= c.stone && sim.gold >= c.gold) {
    const p = spot(want);
    if (p && !sim.place(p[0], p[1], want)) act(['b', p[0], p[1], want]);
  }
  if (d === 20) { sim.setTax(2); act(['t', 2]); }
  if (d === 45) { sim.setTax(1); act(['t', 1]); }
  if (d % 17 === 3 && !sim.festival()) act(['f']);
  if (d % 11 === 5 && !sim.buy('wood')) act(['y', 0]);
  if (sim.evId) { const m = sim.answerEvent(d % 2); if (m != null) act(['e', d % 2]); }
  sim.stepDay();
  sim.rollEvent();
}

const out = replay(SEED, acts);
let fail = 0;
const t = (name, ok, extra = '') => { console.log(ok ? 'ok  ' : 'FAIL', name, extra); if (!ok) fail++; };

t('the replay ran', !out.error, out.error || '');
if (!out.error) {
  const a = sim, b = out.sim;
  for (const k of ['day', 'year', 'pop', 'peakPop', 'food', 'wood', 'stone', 'gold', 'hap', 'tax', 'hungry', 'weather', 'evId']) {
    t(`${k} matches`, a[k] === b[k], `played=${a[k]} replayed=${b[k]}`);
  }
  t('same buildings', a.entries.length === b.entries.length, `${a.entries.length} vs ${b.entries.length}`);
  t('same score', scoreOf(a) === out.score, `${scoreOf(a)} vs ${out.score}`);
  console.log(`\n  reign: ${out.days} days, ${out.peakPop} peak folk, ${out.gold} gold, score ${out.score}, ${acts.length} acts`);
}

// and the things that must be refused
t('an illegal placement is refused', !!replay(SEED, [[0, 'b', 0, 0, K.MARKET]]).error);
t('an unaffordable placement is refused', !!replay(SEED, [[0, 'b', ...(spot(K.MARKET) || [5, 5]), K.MARKET]]).error);
t('an out-of-order record is refused', !!replay(SEED, [[5, 't', 1], [2, 't', 0]]).error);
t('an unknown act is refused', !!replay(SEED, [[0, 'zzz']]).error);
t('an oversized record is refused', !!replay(SEED, new Array(5000).fill([0, 't', 1])).error);

console.log(fail ? `\nFAILURES: ${fail}` : '\nALL REPLAY CHECKS PASS');
process.exit(fail ? 1 : 0);
