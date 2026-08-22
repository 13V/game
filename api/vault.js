// GET  /api/vault?address=...  → that address's vault
// GET  /api/vault?board=1      → the top vaults, for the leaderboard
// POST /api/vault              → { address, message, signature, vault }  (upsert)
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

const clamp = (n, hi) => Math.max(0, Math.min(hi, Math.floor(Number(n) || 0)));

export default async function handler(req, res) {
  if (!URL_BASE || !SERVICE_KEY) {
    return send(res, 503, { error: 'the vault store is not configured on this deployment' });
  }

  try {
    if (req.method === 'GET') {
      if (req.query.board) {
        const r = await rest('vaults?select=address,lifetime,best_pop&order=lifetime.desc&limit=20');
        if (!r.ok) return send(res, 502, { error: 'the vault store refused the read' });
        return send(res, 200, { board: await r.json() });
      }
      const address = String(req.query.address || '');
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return send(res, 400, { error: 'bad address' });
      const r = await rest(`vaults?address=eq.${address}&select=*`);
      if (!r.ok) return send(res, 502, { error: 'the vault store refused the read' });
      const rows = await r.json();
      return send(res, 200, { vault: rows[0] || null });
    }

    if (req.method === 'POST') {
      const { address, message, signature, vault } = req.body || {};
      const bad = verifyClaim({ address, message, signature });
      if (bad) return send(res, 401, { error: bad });

      // The signature proves who is writing, not that the numbers are honest —
      // see the note in supabase/schema.sql. Bound them so a typo or a fuzzer
      // cannot store nonsense.
      const row = {
        address,
        groats: clamp(vault?.groats, 1e9),
        lifetime: clamp(vault?.lifetime, 1e9),
        best_pop: clamp(vault?.best_pop, 100000),
        charters: Array.isArray(vault?.charters) ? vault.charters.slice(0, 64).map(String) : [],
        updated_at: new Date().toISOString(),
      };
      const r = await rest('vaults', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(row),
      });
      if (!r.ok) return send(res, 502, { error: 'the vault store refused the write' });
      const rows = await r.json();
      return send(res, 200, { vault: rows[0] || row });
    }

    res.setHeader('Allow', 'GET, POST');
    return send(res, 405, { error: 'method not allowed' });
  } catch {
    return send(res, 500, { error: 'the vault store could not be reached' });
  }
}
