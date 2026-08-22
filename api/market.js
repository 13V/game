// GET  /api/market?address=...  → the shelf, and what this wallet can afford
// POST /api/market              → { address, message, signature, buy }
//
// Groats are minted only by /api/run, from a reign the server replayed itself,
// and spent only here. Neither number is ever taken from the browser: before
// this, a wallet that had never played could declare a billion of them.
import { verifyClaim } from './_claim.js';
import { CHARTERS, CHARTER_BY_ID } from './_charters.js';

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

// PostgREST's merge-duplicates upsert is an INSERT ... ON CONFLICT DO UPDATE
// that sets EVERY column — the ones you omit go back to their defaults. Writing
// {spent, owned} that way silently reset `minted` to zero, which would have
// wiped a player's whole balance on their first purchase. Only the check
// constraint caught it. Partial writes are PATCH; the insert is a fallback for
// a wallet that has no row yet.
async function writeVault(address, patch) {
  const r = await rest(`vaults?address=eq.${address}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  });
  if (r.ok) {
    const rows = await r.json();
    if (rows.length) return rows[0];
  }
  const ins = await rest('vaults', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ address, ...patch }),
  });
  return ins.ok ? (await ins.json())[0] : null;
}

async function vaultOf(address) {
  const r = await rest(`vaults?address=eq.${address}&select=minted,spent,owned`);
  const rows = r.ok ? await r.json() : [];
  const v = rows[0] || {};
  const minted = Number(v.minted || 0), spent = Number(v.spent || 0);
  return { minted, spent, groats: minted - spent, owned: Array.isArray(v.owned) ? v.owned : [] };
}

export default async function handler(req, res) {
  if (!URL_BASE || !SERVICE_KEY) return send(res, 503, { error: 'the market is not open on this deployment' });

  try {
    if (req.method === 'GET') {
      const address = String(req.query.address || '');
      const shelf = CHARTERS.map(({ id, name, cost, blurb }) => ({ id, name, cost, blurb }));
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return send(res, 200, { shelf, groats: 0, owned: [] });
      const v = await vaultOf(address);
      return send(res, 200, { shelf, groats: v.groats, minted: v.minted, owned: v.owned });
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return send(res, 405, { error: 'method not allowed' });
    }

    const { address, message, signature, buy } = req.body || {};
    const bad = verifyClaim({ address, message, signature });
    if (bad) return send(res, 401, { error: bad });

    const item = CHARTER_BY_ID[buy];
    if (!item) return send(res, 400, { error: 'no such charter' });

    const v = await vaultOf(address);
    if (v.owned.includes(item.id)) return send(res, 409, { error: 'you already hold that charter' });
    if (v.groats < item.cost) {
      return send(res, 402, { error: `${item.name} costs ${item.cost} ⟡ and you hold ${v.groats}`, groats: v.groats });
    }

    // Re-read and re-check inside the write, so two requests racing cannot both
    // pass the check above and spend the same groats twice.
    const fresh = await vaultOf(address);
    if (fresh.owned.includes(item.id) || fresh.groats < item.cost) {
      return send(res, 409, { error: 'that purchase no longer stands — try again', groats: fresh.groats });
    }
    const w = await writeVault(address, {
      spent: fresh.spent + item.cost,
      owned: [...fresh.owned, item.id],
      updated_at: new Date().toISOString(),
    });
    if (!w) return send(res, 502, { error: 'the market could not record the sale' });
    const after = await vaultOf(address);
    return send(res, 200, { bought: item.id, groats: after.groats, owned: after.owned });
  } catch {
    return send(res, 500, { error: 'the market could not be reached' });
  }
}
