// GET /api/delve-board?day=YYYY-MM-DD — today's standings, and today's dead.
//
// The runs rank the day. The deaths are the day's other gift: every name that
// did not come back left its bones on the floor it died on, at the tile it
// died on, and every other player's client draws them there — the same dungeon,
// so the same tile means the same place.
const URL_BASE = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const rest = (path) => fetch(`${URL_BASE}/rest/v1/${path}`, {
  headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
});

const send = (res, code, body, cache) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', cache || 'no-store');
  res.status(code).end(JSON.stringify(body));
};

export default async function handler(req, res) {
  if (!URL_BASE || !SERVICE_KEY) return send(res, 503, { error: 'the well is not configured' });
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return send(res, 405, { error: 'method not allowed' });
  }

  const day = String(req.query.day || new Date().toISOString().slice(0, 10));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return send(res, 400, { error: 'bad day' });

  const r = await rest(
    `delve_runs?day=eq.${day}&select=name,score,depth,out,felled,turns,died_depth,died_x,died_y,gear`
    + '&order=score.desc,turns.asc&limit=100',
  );
  if (!r.ok) return send(res, 502, { error: 'could not read the well' });
  const rows = await r.json();

  const runs = rows.map((x) => ({
    name: x.name, score: Number(x.score), depth: x.depth, out: x.out,
    felled: x.felled, turns: x.turns, gear: x.gear,
  }));
  const deaths = rows
    .filter((x) => !x.out && x.died_depth != null)
    .map((x) => ({ name: x.name, depth: x.died_depth, x: x.died_x, y: x.died_y }));

  // a minute of cache keeps a popular day from hammering the table
  return send(res, 200, { day, runs, deaths }, 'public, max-age=60');
}
