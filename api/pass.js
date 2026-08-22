// POST /api/pass  { address, message, signature }
//
// Establishes that a wallet holds enough of the token to keep playing, and says
// so for a short while. Two honest limits, stated here because they are easy to
// forget and expensive to assume away:
//
//   1. This gates the SERVER — the leaderboard, and anything with a prize
//      behind it. It cannot gate the game itself. The game is one HTML file
//      that runs in the player's browser; a determined player edits it, or
//      saves the page and opens it offline. Treat the pass as the door to the
//      competition, not as a lock on the pixels.
//   2. A balance is true at the moment it is read. Somebody can hold, pass,
//      and sell a minute later — which is why the pass expires quickly and why
//      /api/run re-reads the balance rather than trusting a pass.
import { verifyClaim } from './_claim.js';
import { tokenBalance, gateOn, TOKEN_MIN, TOKEN_MINT } from './_solana.js';

const PASS_MINUTES = 45;

const send = (res, code, body) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.status(code).end(JSON.stringify(body));
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'method not allowed' });
  }
  // no mint configured yet means no gate at all — a token that has not launched
  // must never lock people out
  if (!gateOn()) return send(res, 200, { gate: false, reason: 'no token configured' });

  const { address, message, signature } = req.body || {};
  const bad = verifyClaim({ address, message, signature });
  if (bad) return send(res, 401, { gate: true, error: bad });

  let held;
  try { held = await tokenBalance(address); }
  catch { return send(res, 502, { gate: true, error: 'could not reach a Solana node — try again' }); }

  const ok = held >= TOKEN_MIN;
  return send(res, 200, {
    gate: true, ok, held, need: TOKEN_MIN, mint: TOKEN_MINT,
    until: ok ? Date.now() + PASS_MINUTES * 60000 : 0,
  });
}
