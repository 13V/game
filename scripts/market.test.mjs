// Groats are money now, so the only question worth asking is whether they can
// be conjured. Runs against a live deployment; it writes rows, so point it at a
// scratch one.
//
//   BASE=https://... node scripts/market.test.mjs
import { generateKeyPairSync, sign as edSign } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { generateValley, seedFromString, GRID, TILES, K } from '../web/sim.js';
import { SimpleSim, B, terrainProblemFor } from '../web/rules.js';

if (!process.argv[1] || pathToFileURL(process.argv[1]).href !== import.meta.url) process.exit(2);
const U = process.env.BASE || 'https://game-hazel-omega.vercel.app';

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const b58 = (b) => { const d = []; for (const x of b) { let c = x; for (let i = 0; i < d.length; i++) { c += d[i] << 8; d[i] = c % 58; c = (c / 58) | 0; } while (c) { d.push(c % 58); c = (c / 58) | 0; } }
  let o = ''; for (const x of b) { if (x === 0) o += '1'; else break; } for (let i = d.length - 1; i >= 0; i--) o += B58[d[i]]; return o; };

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const address = b58(publicKey.export({ format: 'der', type: 'spki' }).subarray(12));
const claim = () => {
  const body = ['KINGDOM — vault claim', `owner: ${address}`, 'groats: 0 minted lifetime',
    'charters: none', `at: ${new Date().toISOString()}`].join('\n');
  return { address, message: body, signature: b58(edSign(null, Buffer.from(body, 'utf8'), privateKey)) };
};
const post = (p, b) => fetch(U + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })
  .then(async (r) => ({ code: r.status, body: await r.json() }));
const get = (p) => fetch(U + p).then(async (r) => ({ code: r.status, body: await r.json() }));

let fail = 0;
const t = (n, ok, extra = '') => { console.log(ok ? 'ok  ' : 'FAIL', n, extra); if (!ok) fail++; };

// 1. a browser can no longer name its own balance
const declared = await post('/api/vault', { ...claim(), vault: { groats: 999999999, charters: ['crown'] } });
t('the vault refuses a declared balance', declared.code === 405, `HTTP ${declared.code}`);

// 2. nothing bought before anything is earned
const broke = await post('/api/market', { ...claim(), buy: 'granary' });
t('you cannot buy on credit', broke.code === 402, `HTTP ${broke.code} ${broke.body.error || ''}`);

// 3. play a real season, submit it, and see what it mints
const seed = `daily-${new Date().toISOString().slice(0, 10)}`;
const valley = generateValley(seedFromString(seed));
const sim = new SimpleSim(valley); const acts = [];
const spot = (k) => { for (let i = 0; i < TILES; i++) { const x = i % GRID, y = (i / GRID) | 0; if (!terrainProblemFor(valley, sim, x, y, k)) return [x, y]; } return null; };
for (let d = 0; d < 60 && !sim.fallen; d++) {
  if (sim.wood < 5 && sim.gold >= 12) { sim.buy('wood'); acts.push([sim.day, 'y', 0]); }
  const k = d % 3 === 2 ? K.COTTAGE : K.FIELD, c = B[k];
  if (sim.wood >= c.wood && sim.stone >= c.stone && sim.gold >= c.gold) {
    const p = spot(k); if (p && !sim.place(p[0], p[1], k)) acts.push([sim.day, 'b', p[0], p[1], k]);
  }
  if (sim.evId) { const m = sim.answerEvent(0); if (m != null) acts.push([sim.day, 'e', 0]); }
  sim.stepDay(); sim.rollEvent();
}
const run = await post('/api/run', { ...claim(), seed, acts });
t('a real reign mints groats', run.code === 200 && run.body.minted > 0, JSON.stringify(run.body));
const minted = run.body.minted || 0;

await new Promise((r) => setTimeout(r, 21000));   // the rate limit is 20s

// 4. resubmitting the very same reign must mint nothing
const again = await post('/api/run', { ...claim(), seed, acts });
t('replaying the same reign mints nothing', again.code === 200 && !again.body.minted, JSON.stringify(again.body));

// 5. and the balance buys exactly what it should
const shelf = await get(`/api/market?address=${address}`);
t('the ledger shows what was minted', shelf.body.groats === minted, `${shelf.body.groats} vs ${minted}`);
const afford = shelf.body.shelf.filter((c) => c.cost <= shelf.body.groats);
if (afford.length) {
  const buy = await post('/api/market', { ...claim(), buy: afford[0].id });
  t('a charter can be bought', buy.code === 200 && buy.body.owned.includes(afford[0].id), JSON.stringify(buy.body));
  t('and the groats are gone', buy.body.groats === minted - afford[0].cost, `${buy.body.groats}`);
  const twice = await post('/api/market', { ...claim(), buy: afford[0].id });
  t('the same charter cannot be bought twice', twice.code === 409, `HTTP ${twice.code}`);
} else {
  t('minted enough to test a purchase', false, `only ${shelf.body.groats} ⟡`);
}
const dear = await post('/api/market', { ...claim(), buy: 'dynasty' });
t('an unaffordable charter is refused', dear.code === 402, `HTTP ${dear.code}`);

console.log(fail ? `\nFAILURES: ${fail}` : '\nALL MARKET CHECKS PASS');
console.log('test wallet', address);
process.exit(fail ? 1 : 0);
