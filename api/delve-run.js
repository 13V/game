// POST /api/delve-run — put a finished delve on today's board.
//
// The body is { day, name, acts, loadout, claim }. Nothing in it is believed:
// _delve.js replays the record through the real rules and the row that lands
// in the table is entirely the replay's opinion. One row per (day, name); a
// better run replaces a worse one and a worse run changes nothing.
import { verifyDelveRun } from './_delve.js';

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
  if (!URL_BASE || !SERVICE_KEY) return send(res, 503, { error: 'the well is not configured' });
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'method not allowed' });
  }

  try {
    const v = verifyDelveRun(req.body);
    if (v.error) return send(res, v.status || 400, { error: v.error });
    const { row } = v;

    // keep the best run of the day for this name
    const q = `delve_runs?day=eq.${row.day}&name=eq.${encodeURIComponent(row.name)}&select=score`;
    const had = await rest(q);
    if (!had.ok) return send(res, 502, { error: 'could not reach the board' });
    const rows = await had.json();
    if (rows.length && Number(rows[0].score) >= row.score) {
      return send(res, 200, { ok: true, kept: true, score: Number(rows[0].score) });
    }

    const up = await rest('delve_runs?on_conflict=day,name', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(row),
    });
    if (!up.ok) return send(res, 502, { error: 'the board would not take it' });

    const above = await rest(`delve_runs?day=eq.${row.day}&score=gt.${row.score}&select=name`, {
      headers: { Prefer: 'count=exact', Range: '0-0', 'Range-Unit': 'items' },
    });
    const total = above.headers.get('content-range');
    const rank = total ? Number(total.split('/')[1]) + 1 : null;

    return send(res, 200, { ok: true, score: row.score, out: row.out, depth: row.depth, rank });
  } catch (e) {
    return send(res, 500, { error: 'the well swallowed it — try again' });
  }
}
