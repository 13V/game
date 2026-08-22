// The prize maths, and nothing else. No network, no database, no secrets — so
// it can be tested exactly and printed on the page, which is the point: a purse
// nobody can check is not a prize, it is a promise.
import { createHmac, timingSafeEqual } from 'node:crypto';

// The wallet the prizes are paid FROM. Its balance is read off the chain, never
// declared here, so the number the game shows is the real one.
export const TREASURY = process.env.TREASURY_WALLET || '';

// Which asset the treasury pays in. SOL by default; set PAYOUT_ASSET=token to
// pay the season out in the game's own token instead.
export const ASSET = process.env.PAYOUT_ASSET === 'token' ? 'token' : 'sol';

// The published split. Ten places, per cent of the season's prize, adding to a
// hundred. Short enough to say out loud, which is the whole requirement.
export const SHARES = [30, 20, 12, 9, 7, 6, 5, 4, 4, 3];

// A season pays out a fifth of the purse, not all of it. A pot that empties
// every season is a pot nobody trusts to be there next season.
export const CUT = Math.max(0, Math.min(1, Number(process.env.PAYOUT_CUT || 0.2)));

// A reign has to be a reign. Without a floor, a wallet that opened the tab and
// walked away collects three per cent for four villagers.
export const MIN_POP = Number(process.env.PAYOUT_MIN_POP || 25);

// Everything below is in BASE UNITS — lamports, or the token's smallest unit —
// held as BigInt. Dividing a purse ten ways in floating point loses money on
// every row and the rows have to add back up to what was sent.
export function payoutFor(purse, board) {
  const total = BigInt(purse);
  const prize = (total * BigInt(Math.round(CUT * 10000))) / 10000n;

  const eligible = (board || [])
    .filter((r) => Number(r.peak_pop || 0) >= MIN_POP)
    .sort((a, b) => Number(b.score) - Number(a.score))
    .slice(0, SHARES.length);

  let paid = 0n;
  const rows = eligible.map((r, i) => {
    const share = SHARES[i];
    const owed = (prize * BigInt(share)) / 100n;
    paid += owed;
    return {
      place: i + 1,
      address: r.address,
      score: Number(r.score),
      peakPop: Number(r.peak_pop || 0),
      gold: Number(r.gold || 0),
      days: Number(r.days || 0),
      groats: Number(r.minted || 0),
      share,
      owed: owed.toString(),
    };
  });

  return {
    asset: ASSET,
    purse: total.toString(),
    prize: prize.toString(),
    paid: paid.toString(),
    // Unclaimed shares — places nobody qualified for — stay in the treasury and
    // ride into the next season rather than being redistributed. Simpler to
    // explain, and it means a thin season quietly fattens the next one.
    rollover: (prize - paid).toString(),
    cut: CUT,
    minPop: MIN_POP,
    shares: SHARES,
    rows,
  };
}

// Human-readable amount, for the page and the CSV. Trailing zeroes trimmed
// because "0.412000000 SOL" reads like a machine wrote it.
export function human(base, decimals) {
  const s = BigInt(base).toString().padStart(decimals + 1, '0');
  const whole = s.slice(0, s.length - decimals) || '0';
  const frac = decimals ? s.slice(s.length - decimals).replace(/0+$/, '') : '';
  return frac ? `${whole}.${frac}` : whole;
}

// The list is paid by hand out of a wallet no server can touch, which means the
// only thing that can go wrong is the list itself being altered between the
// server producing it and the coins going out. A keyed digest makes that
// visible: keep the seal with the payment record and the same list will always
// produce the same seal.
const SECRET = process.env.PAYOUT_SECRET || '';
export const sealingOn = () => !!SECRET;

export function seal(list) {
  if (!SECRET) return null;
  const canon = JSON.stringify({
    seed: list.seed, asset: list.asset, prize: list.prize, cut: list.cut,
    rows: list.rows.map((r) => [r.place, r.address, r.score, r.owed]),
  });
  return createHmac('sha256', SECRET).update(canon).digest('hex');
}

// Constant-time, because a secret compared with === leaks itself one character
// at a time to anyone patient enough to time the answers.
export function secretOk(given) {
  if (!SECRET || typeof given !== 'string' || !given) return false;
  const a = Buffer.from(SECRET), b = Buffer.from(given);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
