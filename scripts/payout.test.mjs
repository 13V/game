// The prize rail. A season's purse is real money, so the two things worth
// proving are that the arithmetic never invents a coin, and that nothing but
// the admin secret can see or write the list.
//
// This one needs no credentials: the Supabase and Solana calls are stubbed, so
// it runs in `npm run check` on every build. What it exercises is the handler
// itself — the same file the deployment runs.
//
//   node scripts/payout.test.mjs
import { pathToFileURL } from 'node:url';

if (!process.argv[1] || pathToFileURL(process.argv[1]).href !== import.meta.url) process.exit(2);

// set the environment BEFORE the modules read it at import time
process.env.SUPABASE_URL = 'https://stub.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub';
process.env.TREASURY_WALLET = 'TreaSuRy1111111111111111111111111111111111';
process.env.PAYOUT_SECRET = 'open-sesame';
process.env.PAYOUT_CUT = '0.2';
process.env.PAYOUT_MIN_POP = '25';
delete process.env.PAYOUT_ASSET;

// what the stubbed world holds
const world = {
  lamports: 12_500_000_000,            // 12.5 SOL
  runs: [
    { address: 'Aaa11111111111111111111111111111111111111111', score: 244_023, peak_pop: 244, gold: 23, days: 60, minted: 246 },
    { address: 'Bbb22222222222222222222222222222222222222222', score: 120_500, peak_pop: 120, gold: 500, days: 60, minted: 170 },
    { address: 'Ccc33333333333333333333333333333333333333333', score: 60_100, peak_pop: 60, gold: 100, days: 60, minted: 70 },
    { address: 'Ddd44444444444444444444444444444444444444444', score: 4_000, peak_pop: 4, gold: 0, days: 3, minted: 4 },
  ],
  payouts: [],
};

const real = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const reply = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  if (u.startsWith('https://stub.invalid/rest/v1/runs')) return reply(world.runs);
  if (u.startsWith('https://stub.invalid/rest/v1/payouts')) {
    if (init.method === 'POST') {
      const row = JSON.parse(init.body);
      world.payouts = world.payouts.filter((p) => p.address !== row.address).concat(row);
      return reply([row]);
    }
    return reply(world.payouts);
  }
  // the Solana node
  const call = JSON.parse(init.body || '{}');
  if (call.method === 'getBalance') return reply({ jsonrpc: '2.0', id: 1, result: { value: world.lamports } });
  if (call.method === 'getTokenAccountsByOwner') return reply({ jsonrpc: '2.0', id: 1, result: { value: [] } });
  return real(url, init);
};

const { payoutFor, seal, secretOk, human, SHARES, CUT } = await import('../api/_purse.js');
const payApi = (await import('../api/payout.js')).default;
const purseApi = (await import('../api/purse.js')).default;

const call = (fn, req) => new Promise((done) => {
  const res = {
    statusCode: 200, setHeader() {}, status(c) { this.statusCode = c; return this; },
    end(b) { done({ code: this.statusCode, body: JSON.parse(b) }); },
  };
  fn(req, res);
});
const get = (fn, p) => {
  const qs = p.split('?')[1] || '';
  return call(fn, { method: 'GET', query: Object.fromEntries(new URLSearchParams(qs)), body: {} });
};
const post = (fn, b) => call(fn, { method: 'POST', query: {}, body: b });

let fail = 0;
const t = (n, ok, extra = '') => { console.log(ok ? 'ok  ' : 'FAIL', n, extra); if (!ok) fail++; };

// ── the arithmetic ─────────────────────────────────────────────────────────
t('the published split adds to a hundred', SHARES.reduce((a, b) => a + b, 0) === 100, SHARES.join('/'));

const L = payoutFor(world.lamports, world.runs);
t('a reign under the floor does not place', L.rows.length === 3 && !L.rows.some((r) => r.peakPop < 25),
  `${L.rows.length} placed of ${world.runs.length}`);
t('the prize is the published cut of the purse',
  BigInt(L.prize) === BigInt(world.lamports) * 2n / 10n, `${human(L.prize, 9)} of ${human(L.purse, 9)} SOL`);
t('every coin is accounted for', BigInt(L.paid) + BigInt(L.rollover) === BigInt(L.prize),
  `${human(L.paid, 9)} paid + ${human(L.rollover, 9)} rolled = ${human(L.prize, 9)}`);
t('nothing is ever paid out of the purse that is not in it', BigInt(L.paid) <= BigInt(L.purse));
t('the order is by score, best first',
  L.rows.every((r, i) => i === 0 || r.score <= L.rows[i - 1].score), L.rows.map((r) => r.score).join(' > '));
t('first place takes the top share',
  BigInt(L.rows[0].owed) === BigInt(L.prize) * BigInt(SHARES[0]) / 100n, `${human(L.rows[0].owed, 9)} SOL`);

// an empty island must not divide by anything
const none = payoutFor(world.lamports, []);
t('an island nobody won pays nothing and rolls it all over',
  none.rows.length === 0 && none.paid === '0' && none.rollover === none.prize);

// an empty treasury must not owe
const dry = payoutFor(0, world.runs);
t('an empty treasury owes nothing', dry.rows.every((r) => r.owed === '0') && dry.prize === '0');

// exactness: a purse of odd size must never round UP
const odd = payoutFor(999_999_999n, world.runs);
t('a share is floored, never rounded up', BigInt(odd.paid) <= BigInt(odd.prize));

// ── the seal ───────────────────────────────────────────────────────────────
const s1 = seal({ ...L, seed: 'daily-2026-08-22' });
const s2 = seal({ ...L, seed: 'daily-2026-08-22' });
t('the same list always seals the same', s1 === s2 && !!s1, s1.slice(0, 16) + '…');
const tampered = { ...L, seed: 'daily-2026-08-22', rows: L.rows.map((r, i) => (i ? r : { ...r, owed: '999999999' })) };
t('an altered list does not match its seal', seal(tampered) !== s1);
t('a list for another island does not match', seal({ ...L, seed: 'daily-2026-08-21' }) !== s1);

// ── the secret ─────────────────────────────────────────────────────────────
t('the right secret opens it', secretOk('open-sesame'));
t('a wrong secret does not', !secretOk('open-sesamf'));
t('a prefix of the secret does not', !secretOk('open'));
t('an empty secret does not', !secretOk('') && !secretOk(null) && !secretOk(undefined));

// ── the endpoints ──────────────────────────────────────────────────────────
const pub = await get(purseApi, '/api/purse');
t('the purse is public and read off the chain',
  pub.code === 200 && pub.body.amount === '12.5' && pub.body.treasury === process.env.TREASURY_WALLET,
  `${pub.body.amount} SOL, prize ${pub.body.prizeAmount}`);

const listPub = await get(payApi, '/api/payout?seed=daily-2026-08-22');
t('the payout list is public so players can check it',
  listPub.code === 200 && listPub.body.rows.length === 3);
t('the public list carries no seal, no CSV and no commands',
  !listPub.body.seal && !listPub.body.csv && !listPub.body.cli,
  Object.keys(listPub.body).filter((k) => ['seal', 'csv', 'cli'].includes(k)).join(',') || 'none of them');

const listAdm = await get(payApi, '/api/payout?seed=daily-2026-08-22&secret=open-sesame');
t('the secret unlocks the CSV, the commands and the seal',
  !!listAdm.body.seal && listAdm.body.csv.split('\n').length === 4 && listAdm.body.cli.split('\n').length === 3);
t('the commands name the right wallets and the right amounts',
  listAdm.body.cli.includes(L.rows[0].address) && listAdm.body.cli.includes(human(L.rows[0].owed, 9)),
  listAdm.body.cli.split('\n')[0]);

const wrong = await get(payApi, '/api/payout?seed=daily-2026-08-22&secret=nope');
t('a wrong secret gets the public view, not the tools', wrong.code === 200 && !wrong.body.seal);

// ── recording what was actually sent ───────────────────────────────────────
const TX = '5'.repeat(66);
const noSecret = await post(payApi, { seed: 'daily-2026-08-22', address: L.rows[0].address, tx: TX });
t('a payment cannot be recorded without the secret', noSecret.code === 401, `HTTP ${noSecret.code}`);

const junkTx = await post(payApi, { secret: 'open-sesame', seed: 'daily-2026-08-22', address: L.rows[0].address, tx: 'nope' });
t('a made-up signature is refused', junkTx.code === 400, junkTx.body.error);

const junkAddr = await post(payApi, { secret: 'open-sesame', seed: 'daily-2026-08-22', address: 'x', tx: TX });
t('a made-up wallet is refused', junkAddr.code === 400, junkAddr.body.error);

const rec = await post(payApi, {
  secret: 'open-sesame', seed: 'daily-2026-08-22',
  address: L.rows[0].address, amount: L.rows[0].owed, place: 1, tx: TX,
});
t('a real payment is recorded', rec.code === 200 && rec.body.recorded.tx === TX);

const after = await get(payApi, '/api/payout?seed=daily-2026-08-22&secret=open-sesame');
t('a paid winner shows as paid, with the transaction',
  after.body.rows[0].paid && after.body.rows[0].paid.tx === TX && after.body.unpaid === 2,
  `${after.body.unpaid} still unpaid`);
t('a paid winner drops out of the commands to run',
  !after.body.cli.includes(L.rows[0].address) && after.body.cli.split('\n').length === 2);

// ── the server holds no key ────────────────────────────────────────────────
const { readFileSync, readdirSync } = await import('node:fs');
const keyish = readdirSync('api').filter((f) => f.endsWith('.js')).filter((f) => {
  const src = readFileSync(`api/${f}`, 'utf8');
  return /sendTransaction|signTransaction|Keypair|SECRET_KEY|PRIVATE_KEY|fromSecretKey/i.test(src);
});
t('nothing in /api can sign or send a transaction', keyish.length === 0, keyish.join(', ') || 'no signing code anywhere');

globalThis.fetch = real;
console.log(fail ? `\n${fail} PAYOUT CHECK(S) FAILED` : '\nALL PAYOUT CHECKS PASS');
process.exit(fail ? 1 : 0);
