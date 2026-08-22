// GET  /api/payout?seed=...            → who won this island, and what they are owed
// GET  /api/payout?seed=...&secret=... → the same list, sealed, with a CSV to pay from
// POST /api/payout                     → { secret, seed, address, tx } marks one winner paid
//
// The server never holds a key. It works out who is owed what from reigns it
// replayed itself and a treasury balance it read off the chain, and then a
// human sends the coins. That is the whole rail: nothing here can move money,
// so nothing here can be drained.
import { payoutFor, human, seal, sealingOn, secretOk, TREASURY, ASSET } from './_purse.js';
import { readPurse } from './purse.js';

const URL_BASE = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const rest = (path, init = {}) => fetch(`${URL_BASE}/rest/v1/${path}`, {
  ...init,
  headers: {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    ...(init.headers || {}),
  },
});

const send = (res, code, body) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.status(code).end(JSON.stringify(body));
};

const seedOk = (s) => /^[a-z0-9-]{1,64}$/.test(s);
const addrOk = (s) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s || '');
const txOk = (s) => /^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(s || '');

// A season is settled once its island has closed. /api/run takes today's and
// yesterday's valleys, so a list is only final on the day after that — before
// then it is a running tally and the admin page says so.
function isFinal(seed) {
  const m = /^daily-(\d{4}-\d{2}-\d{2})$/.exec(seed);
  if (!m) return true;
  const opened = Date.parse(`${m[1]}T00:00:00Z`);
  return Number.isFinite(opened) && Date.now() - opened > 2 * 86400000;
}

const csvOf = (list, decimals) => ['address,amount,asset,place,score,peak_folk,groats']
  .concat(list.rows.map((r) => [
    r.address, human(r.owed, decimals), list.asset, r.place, r.score, r.peakPop, r.groats,
  ].join(',')))
  .join('\n');

export default async function handler(req, res) {
  if (!URL_BASE || !SERVICE_KEY) return send(res, 503, { error: 'the standings are not configured' });
  if (!TREASURY) return send(res, 503, { error: 'no treasury wallet is set on this deployment' });

  try {
    if (req.method === 'POST') {
      const { secret, seed, address, amount, place, tx } = req.body || {};
      if (!sealingOn()) return send(res, 503, { error: 'no admin secret is set on this deployment' });
      if (!secretOk(secret)) return send(res, 401, { error: 'wrong secret' });
      if (!seedOk(seed) || !addrOk(address)) return send(res, 400, { error: 'bad seed or address' });
      if (!txOk(tx)) return send(res, 400, { error: 'that does not look like a transaction signature' });

      const row = {
        seed, address, asset: ASSET, amount: String(amount || '0'),
        place: Number(place) || 0, tx, paid_at: new Date().toISOString(),
      };
      const w = await rest('payouts', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(row),
      });
      if (!w.ok) return send(res, 502, { error: 'could not record the payment' });
      return send(res, 200, { recorded: (await w.json())[0] });
    }

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET, POST');
      return send(res, 405, { error: 'method not allowed' });
    }

    const seed = String(req.query.seed || '');
    if (!seedOk(seed)) return send(res, 400, { error: 'bad seed' });
    const admin = secretOk(String(req.query.secret || ''));

    const [purse, boardRes, paidRes] = await Promise.all([
      readPurse(),
      rest(`runs?seed=eq.${seed}&select=address,score,peak_pop,gold,days,minted&order=score.desc&limit=25`),
      rest(`payouts?seed=eq.${seed}&select=address,amount,tx,paid_at,place`),
    ]);
    if (!boardRes.ok) return send(res, 502, { error: 'could not read the standings' });
    const board = await boardRes.json();
    const paid = paidRes.ok ? await paidRes.json() : [];
    const byAddr = new Map(paid.map((p) => [p.address, p]));

    const list = payoutFor(purse.base || '0', board);
    list.seed = seed;
    list.final = isFinal(seed);
    list.treasury = TREASURY;
    list.decimals = purse.decimals ?? 9;
    list.purseAmount = human(list.purse, list.decimals);
    list.prizeAmount = human(list.prize, list.decimals);
    list.rollAmount = human(list.rollover, list.decimals);
    for (const r of list.rows) {
      r.amount = human(r.owed, list.decimals);
      const p = byAddr.get(r.address);
      r.paid = p ? { tx: p.tx, at: p.paid_at, amount: p.amount } : null;
    }
    list.unpaid = list.rows.filter((r) => !r.paid).length;

    if (!admin) return send(res, 200, list);
    return send(res, 200, {
      ...list,
      seal: seal(list),
      sealed: sealingOn(),
      csv: csvOf(list, list.decimals),
      // Exactly what to type, in the order to type it. Paying by hand is only
      // safe if the instruction is copy-paste rather than arithmetic.
      cli: ASSET === 'sol'
        ? list.rows.filter((r) => !r.paid)
          .map((r) => `solana transfer ${r.address} ${r.amount} --allow-unfunded-recipient`).join('\n')
        : list.rows.filter((r) => !r.paid)
          .map((r) => `spl-token transfer ${purse.mint} ${r.amount} ${r.address} --fund-recipient --allow-unfunded-recipient`).join('\n'),
    });
  } catch {
    return send(res, 500, { error: 'the payout list could not be built' });
  }
}
