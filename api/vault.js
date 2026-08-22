// GET /api/vault?address=...  → that address's verified vault
// GET /api/vault?board=1       → the greatest vaults ever minted
//
// Every secret lives in the environment. Nothing in this repository contains a
// key, and the browser never sees one: the anon key is not used at all, because
// the vaults table has RLS on with no policies and the anon key is public.
import { verifyClaim } from './_claim.js';

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

export default async function handler(req, res) {
  if (!URL_BASE || !SERVICE_KEY) {
    return send(res, 503, { error: 'the vault store is not configured on this deployment' });
  }

  try {
    if (req.method === 'GET') {
      if (req.query.board) {
        const r = await rest('vaults?select=address,minted&order=minted.desc&limit=20');
        if (!r.ok) return send(res, 502, { error: 'the vault store refused the read' });
        return send(res, 200, { board: await r.json() });
      }
      const address = String(req.query.address || '');
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return send(res, 400, { error: 'bad address' });
      const r = await rest(`vaults?address=eq.${address}&select=minted,spent,owned,updated_at`);
      if (!r.ok) return send(res, 502, { error: 'the vault store refused the read' });
      const rows = await r.json();
      const v = rows[0];
      return send(res, 200, {
        vault: v ? { minted: Number(v.minted), groats: Number(v.minted) - Number(v.spent),
          owned: v.owned || [], updated_at: v.updated_at } : null,
      });
    }

    // POST is gone on purpose. It used to take the browser's word for a groat
    // balance and a list of charters, which was harmless while those only bought
    // head starts in a single-player game — and became a printing press the
    // moment they were worth a token. A wallet that had never played could
    // declare a billion. Groats are minted by /api/run from a reign the server
    // replayed itself, and spent through /api/market. Neither reads the client.
    res.setHeader('Allow', 'GET');
    return send(res, 405, { error: 'the vault is read-only — groats are minted by playing' });
  } catch {
    return send(res, 500, { error: 'the vault store could not be reached' });
  }
}
