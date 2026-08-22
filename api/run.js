// GET  /api/run?seed=...   → the standing for one valley
// POST /api/run            → { address, message, signature, seed, acts }
//
// A submitted reign is a RECORD OF WHAT THE PLAYER DID, not a score. The server
// replays it through the same rules file the browser played by and works the
// score out itself, so the only way to post a big number is to have earned it.
import { verifyClaim } from './_claim.js';
import { replay } from './_score.js';
import { tokenBalance, gateOn, TOKEN_MIN } from './_solana.js';

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

// today's and yesterday's valleys only, so nobody grinds a week-old island
function seedAllowed(seed) {
  if (!/^daily-\d{4}-\d{2}-\d{2}$/.test(seed)) return false;
  const iso = (d) => d.toISOString().slice(0, 10);
  const now = new Date();
  const yday = new Date(now.getTime() - 86400000);
  return seed === `daily-${iso(now)}` || seed === `daily-${iso(yday)}`;
}

export default async function handler(req, res) {
  if (!URL_BASE || !SERVICE_KEY) return send(res, 503, { error: 'the standings are not configured' });

  try {
    if (req.method === 'GET') {
      const seed = String(req.query.seed || '');
      if (!/^[a-z0-9-]{1,64}$/.test(seed)) return send(res, 400, { error: 'bad seed' });
      const r = await rest(`runs?seed=eq.${seed}&select=address,score,peak_pop,gold,days&order=score.desc&limit=25`);
      if (!r.ok) return send(res, 502, { error: 'could not read the standings' });
      return send(res, 200, { seed, board: await r.json(), need: gateOn() ? TOKEN_MIN : 0 });
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return send(res, 405, { error: 'method not allowed' });
    }

    const { address, message, signature, seed, acts } = req.body || {};
    const bad = verifyClaim({ address, message, signature });
    if (bad) return send(res, 401, { error: bad });
    if (!seedAllowed(seed)) return send(res, 400, { error: 'that valley is closed — play today\'s' });

    // holders only, re-read now rather than taken from a pass that could be stale
    if (gateOn()) {
      let held;
      try { held = await tokenBalance(address); }
      catch { return send(res, 502, { error: 'could not reach a Solana node — try again' }); }
      if (held < TOKEN_MIN) {
        return send(res, 403, { error: `the standings are for holders — ${TOKEN_MIN} needed, you hold ${held}`, held, need: TOKEN_MIN });
      }
    }

    const out = replay(seed, acts);
    if (out.error) return send(res, 400, { error: `the record does not stand up: ${out.error}` });

    const row = {
      seed, address, score: out.score, peak_pop: out.peakPop,
      gold: Math.max(0, Math.min(1e9, out.gold)), days: out.days,
      acts: acts.length, submitted_at: new Date().toISOString(),
    };
    // only an improvement is kept, so resubmitting a worse reign cannot cost you
    const prev = await rest(`runs?seed=eq.${seed}&address=eq.${address}&select=score`);
    const rows = prev.ok ? await prev.json() : [];
    if (rows[0] && rows[0].score >= row.score) {
      return send(res, 200, { score: out.score, best: rows[0].score, kept: false });
    }
    const w = await rest('runs', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(row),
    });
    if (!w.ok) return send(res, 502, { error: 'could not record the reign' });
    return send(res, 200, { score: out.score, best: out.score, kept: true, peakPop: out.peakPop, gold: out.gold });
  } catch {
    return send(res, 500, { error: 'the standings could not be reached' });
  }
}
