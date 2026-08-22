// Parity harness: runs the JavaScript sim against the exact vectors pinned by
// the Rust test suite (crates/st-sim/tests). Any mismatch means the port has
// diverged from the consensus rules. Run: node web/verify.mjs

import {
  GRID, TILES, T, K, HORIZON_DAYS, BASE_HOUSING,
  generateValley, validatePlan, runSeason, scaleOutput, makeDecree,
} from './sim.js';

let failures = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failures++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
  else console.log(`ok   ${name}`);
}

const p = (x, y, kind) => ({ x, y, kind, param: 0 });

function flatGrass() {
  return { height: new Uint8Array(TILES).fill(3), kind: new Uint8Array(TILES).fill(T.GRASS) };
}
function set(v, tiles, t) { for (const [x, y] of tiles) v.kind[y * GRID + x] = t; }
function shelf() {
  const v = flatGrass();
  set(v, [[11, 7], [12, 7], [13, 7], [11, 8], [13, 8]], T.FOREST);
  set(v, [[16, 9], [17, 8], [18, 9], [17, 10]], T.ROCK);
  return v;
}

// --- scale_output (tests/rules.rs) ---
check('scale(4,0)', scaleOutput(4, 0), 4);
check('scale(4,10)', scaleOutput(4, 10), 2);
check('scale(4,15)', scaleOutput(4, 15), 1);
check('scale(4,255)', scaleOutput(4, 255), 1);
check('scale(8,255)', scaleOutput(8, 255), 2);
check('scale(0,0)', scaleOutput(0, 0), 0);
check('scale(1,255)', scaleOutput(1, 255), 1);
check('scale(2,255)', scaleOutput(2, 255), 1);
check('scale(4,4)', scaleOutput(4, 4), 4);

// --- validation (tests/rules.rs) ---
{
  const v = flatGrass(); set(v, [[5, 5]], T.WATER);
  check('water rejected', validatePlan(v, [p(5, 5, K.COTTAGE)]).error, 'water');
}
{
  const v = flatGrass();
  check('overlap rejected', validatePlan(v, [p(5, 5, K.FIELD), p(5, 5, K.COTTAGE)]).error, 'overlap');
}
{
  const v = flatGrass(); v.height[5 * GRID + 6] = 5;
  check('steep rejected', validatePlan(v, [p(5, 5, K.COTTAGE)]).error, 'steep');
  check('road climbs', validatePlan(v, [p(5, 5, K.ROAD)]).ok, true);
}
{
  const v = flatGrass();
  const items = [];
  for (let i = 0; i < 150; i++) items.push(p(i % 50, (i / 50) | 0, K.ROAD));
  check('budget rejected', validatePlan(v, items, 300).error, 'budget');
  check('budget at cap ok', validatePlan(v, items, 240).ok, true);
}
{
  const v = flatGrass();
  check('bad decree type', validatePlan(v, [makeDecree(1, 2, 0)]).error, 'bad-decree');
  check('bad tax value', validatePlan(v, [makeDecree(1, 0, 4)]).error, 'bad-decree');
}

// --- worked example (tests/worked_example.rs) ---
{
  const v = shelf();
  const a = runSeason(v, [p(12, 8, K.SAWMILL), p(14, 9, K.FIELD), p(13, 10, K.COTTAGE)]);
  check('plan A outcome', a.outcome, 'extinct');
  check('plan A day', a.extinctDay, 8);
  check('plan A famine', a.famineDays, 3);
  check('plan A peak', a.peakPop, 6);
  check('plan A built', a.buildingsBuilt, 3);

  const b = runSeason(v, [p(14, 9, K.FIELD), p(13, 10, K.COTTAGE), p(12, 8, K.SAWMILL)]);
  check('plan B outcome', b.outcome, 'completed');
  check('plan B peak', b.peakPop, 10);
  check('plan B final', b.finalPop, 8);
  check('plan B famine', b.famineDays, 2);
  check('plan B days', b.daysRun, HORIZON_DAYS);
}

// --- full chain reference town (tests/worked_example.rs) ---
{
  const v = flatGrass();
  set(v, [[13, 7], [14, 7], [15, 7], [13, 8], [15, 8]], T.FOREST);
  set(v, [[13, 13], [14, 13], [15, 13], [15, 12]], T.ROCK);
  set(v, [[13, 17], [14, 17], [15, 17], [15, 16]], T.ORE);
  const plan = [
    p(10, 10, K.FIELD), p(8, 10, K.COTTAGE), p(10, 12, K.FIELD), p(8, 12, K.COTTAGE),
    p(14, 8, K.SAWMILL), p(8, 14, K.COTTAGE), p(14, 12, K.QUARRY), p(6, 10, K.COTTAGE),
    p(10, 14, K.FIELD), p(6, 12, K.COTTAGE), p(10, 8, K.FIELD), p(6, 14, K.COTTAGE),
    p(13, 10, K.ROAD), p(14, 10, K.ROAD), p(14, 9, K.ROAD), p(14, 11, K.ROAD),
    p(12, 10, K.MARKET), p(6, 8, K.COTTAGE), p(8, 8, K.COTTAGE),
    p(13, 11, K.ROAD), p(13, 12, K.ROAD), p(12, 12, K.ROAD), p(12, 13, K.ROAD),
    p(12, 14, K.ROAD), p(12, 15, K.ROAD), p(12, 16, K.ROAD), p(13, 16, K.ROAD),
    p(14, 16, K.MINE), p(16, 10, K.SMITHY), p(15, 10, K.ROAD),
  ];
  const r = runSeason(v, plan);
  check('chain outcome', r.outcome, 'completed');
  check('chain exports', r.exports, 69);
  check('chain efficiency', r.efficiency, 181);
  check('chain footprint', r.footprint, 30);
  check('chain built', r.buildingsBuilt, 30);
  check('chain peak', r.peakPop, 38);
  check('chain final', r.finalPop, 32);
  check('chain famine', r.famineDays, 2);
  check('chain coin > 500', r.finalCoin > 500, true);
}

// --- the crown (tests/crown.rs) ---
{
  const v = flatGrass();
  const hamlet = [p(10, 10, K.FIELD), p(8, 10, K.COTTAGE)];

  const rt = runSeason(v, hamlet);
  check('treasury fills', rt.finalCoin > 100, true);

  const holiday = runSeason(v, [makeDecree(1, 0, 0), ...hamlet]);
  check('holiday outcome', holiday.outcome, 'completed');
  check('holiday coin', holiday.finalCoin, 12 - 1 - 2);
  check('holiday unrest', holiday.finalUnrest, 0);

  const greedy = runSeason(v, [makeDecree(1, 0, 3), ...hamlet]);
  check('overtax extinct', greedy.outcome, 'extinct');
  check('overtax fast', greedy.extinctDay < 100, true);

  const festivals = runSeason(v, [
    makeDecree(1, 0, 3), ...hamlet,
    makeDecree(20, 1, 0), makeDecree(40, 1, 0), makeDecree(60, 1, 0),
    makeDecree(80, 1, 0), makeDecree(100, 1, 0), makeDecree(120, 1, 0),
  ]);
  check('festivals outlast greed', festivals.daysRun > greedy.daysRun, true);

  const reign = runSeason(v, [makeDecree(1, 0, 0), ...hamlet, makeDecree(60, 0, 2)]);
  check('grow-then-tax completes', reign.outcome, 'completed');
  check('grow-then-tax out-earns', reign.finalCoin > rt.finalCoin, true);
  check('grow-then-tax unrest', reign.finalUnrest > rt.finalUnrest, true);

  const noGround = runSeason(v, [makeDecree(1, 0, 1), ...hamlet, makeDecree(100, 1, 0)]);
  check('decrees take no ground', noGround.footprint, 2);

  const noFood = runSeason(shelf(), [p(12, 8, K.SAWMILL)]);
  check('no food extinct', noFood.outcome, 'extinct');
  check('no food fast', noFood.extinctDay <= 5, true);

  const blocked = runSeason(v, [p(12, 10, K.MARKET), ...hamlet]);
  check('market blocks queue', blocked.buildingsBuilt, 0);
  check('blocked extinct', blocked.outcome, 'extinct');

  const capped = runSeason(v, [p(10, 10, K.FIELD), p(10, 12, K.FIELD)]);
  check('housing caps growth', capped.peakPop, BASE_HOUSING);
  check('housing no famine', capped.famineDays, 0);
}

// --- valley distributions, byte-for-byte vs the Rust generator ---
// Counts recorded from crates/st-sim tests for seeds n: s[0]=n, s[31]=n*37.
{
  const EXPECT = {
    0: [1939, 1248, 564, 78, 267],
    1: [1689, 916, 974, 120, 397],
    2: [1844, 1307, 485, 70, 390],
    3: [1662, 1129, 546, 88, 671],
    4: [2280, 1251, 201, 29, 335],
    5: [1619, 742, 1329, 209, 197],
    6: [2108, 793, 382, 69, 744],
    7: [1523, 1140, 965, 131, 337],
  };
  for (let n = 0; n < 8; n++) {
    const seed = new Uint8Array(32);
    seed[0] = n; seed[31] = (n * 37) & 0xff;
    const v = generateValley(seed);
    const c = [0, 0, 0, 0, 0];
    for (let i = 0; i < TILES; i++) c[v.kind[i]]++;
    check(`valley seed ${n}`, c, EXPECT[n]);
  }
}

console.log(failures === 0 ? '\nALL PARITY CHECKS PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
