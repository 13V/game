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
  // cleanUrls: true in production, so /admin and /admin.html are the same page
  const body = /^\/admin(\.html)?(\?|$)/.test(req.url) ? admin
    : /^\/delve(\.html)?([?#]|$)/.test(req.url) ? delve : page;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...headers });
  res.end(body);
}).listen(port, () => console.log(`serving public/ with production headers on http://localhost:${port}`));
