// Balance scenarios, run against the real rules module rather than a copy —
// these used to eval the rules out of game.js, which stopped working the moment
// they moved into web/rules.js, which is itself the argument for one file.
import { pathToFileURL } from 'node:url';
import { generateValley, seedFromString, GRID, TILES, K } from '../web/sim.js';
import { SimpleSim, B, K_CHAPEL, terrainProblemFor, YEAR_DAYS } from '../web/rules.js';

if (!process.argv[1] || pathToFileURL(process.argv[1]).href !== import.meta.url) process.exit(2);

const SEED = 'daily-2026-08-22';
const fresh = () => new SimpleSim(generateValley(seedFromString(SEED)));
const valley = generateValley(seedFromString(SEED));
const spot = (sim, kind) => {
  for (let t = 0; t < TILES; t++) {
    const x = t % GRID, y = (t / GRID) | 0;
    if (!terrainProblemFor(valley, sim, x, y, kind)) return [x, y];
  }
  return null;
};

// A player with sense: keep food ahead of mouths first, add beds when they run
// out, otherwise industry. A bot that builds houses faster than farms starves,
// which is correct behaviour by the rules and useless as a balance test.
function playWell(s, days, extra = []) {
  for (let d = 0; d < days && !s.fallen; d++) {
    // exactly what the game's own advice tells a player: never be stranded
    // without wood, get a sawmill up, then keep food ahead of mouths
    if (s.wood < 5 && s.gold >= 12) s.buy('wood');
    const built = (k) => s.entries.filter((e) => e.kind === k).length;
    const grow = s.entries.filter((e, i) => e.built && s.staff[i] && e.kind === K.FIELD).length * s.farmYield();
    const want = built(K.FIELD) === 0 ? K.FIELD
      : built(K.SAWMILL) === 0 ? K.SAWMILL
      : grow - s.pop < 4 ? K.FIELD
      : s.capacity() - s.pop <= 2 ? K.COTTAGE
      : extra.length ? extra[d % extra.length] : K.SAWMILL;
    for (const k of [want, K.FIELD]) {
      const c = B[k];
      if (s.wood < c.wood || s.stone < c.stone || s.gold < c.gold) continue;
      const p = spot(s, k);
      if (p && !s.place(p[0], p[1], k)) break;
    }
    s.stepDay();
  }
}

let fail = 0;
const t = (name, ok, extra = '') => { console.log(ok ? 'ok  ' : 'FAIL', name, extra); if (!ok) fail++; };

// an idle valley starves
{
  const s = fresh();
  let d = 0;
  while (d < 200 && !s.fallen) { s.stepDay(); d++; }
  t('doing nothing starves the valley', s.fallen === 'starved', `fell on day ${d}`);
}

// a well-run town grows and banks
{
  const s = fresh();
  playWell(s, 200, [K.SAWMILL, K.MARKET]);
  t('a well-run town grows', s.pop >= 20, `pop ${s.pop}`);
  t('a well-run town banks gold', s.gold > 100, `gold ${s.gold}`);
  t('and never fell', !s.fallen);
}

// winter really bites a town living hand to mouth
{
  const s = fresh();
  const p = spot(s, K.FIELD); s.place(p[0], p[1], K.FIELD);
  const q = spot(s, K.FIELD); s.place(q[0], q[1], K.FIELD);
  let summerRate = 0, winterRate = 0;
  for (let d = 0; d < YEAR_DAYS && !s.fallen; d++) {
    if (s.season() === 1) summerRate = s.farmYield();
    if (s.isWinter()) winterRate = s.farmYield();
    s.stepDay();
  }
  t('winter halves what a farm grows', winterRate * 2 === summerRate || winterRate === Math.floor(summerRate / 2),
    `summer ${summerRate} winter ${winterRate}`);
}

// a harsh tax is a price, not a death sentence, for a fed and comforted town
{
  const s = fresh();
  s.setTax(2);
  playWell(s, 240, [K.SAWMILL, K_CHAPEL, K.QUARRY]);
  t('a harsh tax does not wipe a fed town', !s.fallen, `pop ${s.pop} hap ${s.hap}`);
  t('a harsh tax pays', s.gold > 200, `gold ${s.gold}`);
  t('and a harsh tax still costs goodwill', s.hap < 10, `hap ${s.hap}`);
}

console.log(fail ? `\nFAILURES: ${fail}` : '\nALL BALANCE CHECKS PASS');
process.exit(fail ? 1 : 0);
