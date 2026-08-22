// GET /api/purse → what is actually in the treasury right now, read off chain.
//
// Nothing here is a promise. The address is public, the balance comes from a
// Solana node, and the split is the same constant the payout list divides by —
// so a player can check every number on this page against the chain themselves.
import { TREASURY, ASSET, SHARES, CUT, MIN_POP, payoutFor, human } from './_purse.js';
import { solBalance, tokenHolding, TOKEN_MINT } from './_solana.js';

const send = (res, code, body) => {
  res.setHeader('Content-Type', 'application/json');
  // a purse worth showing is worth caching for a minute — RPC calls are not free
  res.setHeader('Cache-Control', code === 200 ? 'public, max-age=30, s-maxage=30' : 'no-store');
  res.status(code).end(JSON.stringify(body));
};

export async function readPurse() {
  if (!TREASURY) return { on: false };
  const [lamports, tok] = await Promise.all([
    solBalance(TREASURY).catch(() => null),
    ASSET === 'token' ? tokenHolding(TREASURY).catch(() => null) : Promise.resolve(null),
  ]);
  const base = ASSET === 'token' ? (tok ? tok.raw : 0n) : BigInt(lamports || 0);
  const decimals = ASSET === 'token' ? (tok ? tok.decimals : 0) : 9;
  return {
    on: true,
    treasury: TREASURY,
    asset: ASSET,
    mint: ASSET === 'token' ? TOKEN_MINT : null,
    decimals,
    base: base.toString(),
    amount: human(base, decimals),
    sol: lamports === null ? null : human(BigInt(lamports), 9),
    reachable: ASSET === 'token' ? tok !== null : lamports !== null,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return send(res, 405, { error: 'method not allowed' });
  }
  try {
    const purse = await readPurse();
    if (!purse.on) return send(res, 200, { on: false, shares: SHARES, cut: CUT, minPop: MIN_POP });
    const empty = payoutFor(purse.base, []);
    return send(res, 200, {
      ...purse,
      prize: empty.prize,
      prizeAmount: human(empty.prize, purse.decimals),
      cut: CUT,
      minPop: MIN_POP,
      shares: SHARES,
      // what first place would take home if the season ended on this balance
      topAmount: human((BigInt(empty.prize) * BigInt(SHARES[0])) / 100n, purse.decimals),
    });
  } catch {
    return send(res, 502, { error: 'could not read the treasury' });
  }
}
