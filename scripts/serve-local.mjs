// Serves the built page on localhost with the EXACT headers vercel.json will
// apply in production, read from that file rather than copied — so a CSP that
// breaks the page breaks it here first.
//
//   node scripts/serve-local.mjs [port]
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const cfg = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const headers = Object.fromEntries((cfg.headers?.[0]?.headers || []).map((h) => [h.key, h.value]));
const page = readFileSync(new URL('../public/index.html', import.meta.url));
const admin = readFileSync(new URL('../public/admin.html', import.meta.url));
const delve = readFileSync(new URL('../public/delve.html', import.meta.url));
const port = Number(process.argv[2] || 8787);

createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    res.writeHead(503, { 'Content-Type': 'application/json', ...headers });
    return res.end('{"error":"no vault store in the local server"}');
  }
  // A real phone width, faked with an iframe, because headless Chromium will
  // not open a window narrower than about 500px. This is how the dungeon gets
  // checked for sideways overflow at 390px — the bug that sliced a button off
  // the edge of a real phone and that nothing else here would have caught.
  if (/^\/phone(\?|$)/.test(req.url)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(`<!doctype html><meta charset=utf-8>
      <style>html,body{margin:0;background:#222}iframe{width:390px;height:844px;border:0;display:block}
      #r{color:#ddd;font:12px monospace;padding:6px;white-space:pre-wrap}</style>
      <iframe src="/phone-frame"></iframe><pre id="r">measuring</pre>
      <script>window.addEventListener('message', (e) => {
        document.getElementById('r').textContent = e.data.verdict;
      });</script>`);
  }
  if (/^\/phone-frame/.test(req.url)) {
    const framable = { ...headers };
    delete framable['X-Frame-Options'];
    framable['Content-Security-Policy'] = (framable['Content-Security-Policy'] || '')
      .replace(/frame-ancestors [^;]+;?\s*/, '');
    const probed = String(delve).replace('</body>', `<script>window.addEventListener('load', () => {
      document.getElementById('i-go').click();
      // the longest labels the game can produce, which is when it overflowed
      setTimeout(() => {
        const el = document.documentElement;
        const ids = ['b-wait', 'b-deep', 'b-out'];
        const cutNow = ids.map((id) => {
          const b = document.getElementById(id);
          return { id, by: b.scrollWidth - b.clientWidth };
        }).filter((x) => x.by > 1);
        const pageNow = el.scrollWidth - el.clientWidth;

        document.getElementById('b-deep').textContent = 'Take this stair \u00b7 mythic';
        document.getElementById('b-out').textContent = 'Get out with 12';
        const row = document.getElementById('acts');
        const pageForced = Math.max(el.scrollWidth - el.clientWidth,
          row.scrollWidth - row.clientWidth,
          Math.round(ids.reduce((sum, id) => sum + document.getElementById(id).getBoundingClientRect().width, 0)
            + 18 - row.clientWidth));

        const app = document.getElementById('app').getBoundingClientRect().height;
        parent.postMessage({ verdict:
          (pageNow > 0 ? 'PAGE OVERFLOWS BY ' + pageNow + 'px' : 'page fits')
          + ' | ' + (cutNow.length ? 'LABEL CUT: ' + cutNow.map((x) => x.id + ' by ' + x.by + 'px').join(', ')
            : 'every label fits')
          + ' | ' + (pageForced > 0 ? 'LONGEST LABELS PUSH THE PAGE BY ' + pageForced + 'px'
            : 'longest labels still fit the page')
          + ' | app ' + Math.round(app) + ' of ' + window.innerHeight
          + ' | board ' + Math.round(document.getElementById('stage').getBoundingClientRect().height) }, '*');
      }, 250);
    });</script></body>`);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...framable });
    return res.end(probed);
  }

  // cleanUrls: true in production, so /admin and /admin.html are the same page
  const body = /^\/admin(\.html)?(\?|$)/.test(req.url) ? admin
    : /^\/delve(\.html)?([?#]|$)/.test(req.url) ? delve : page;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...headers });
  res.end(body);
}).listen(port, () => console.log(`serving public/ with production headers on http://localhost:${port}`));
