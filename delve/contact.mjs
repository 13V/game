// A contact sheet of floors.
//
// Level design cannot be judged one screenshot at a time, and it cannot be
// judged by numbers alone. This renders a grid of generated floors onto one
// page so a dozen of them can be looked at together — which is the only way to
// see that they are all secretly the same room.
//
//   node delve/contact.mjs [outfile] [depth] [count] [seedPrefix]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const strip = (src) => src
  .replace(/^import\s*\{[\s\S]*?\}\s*from\s*'[^']+';\n/gm, '')
  .replace(/^export function /gm, 'function ')
  .replace(/^export const /gm, 'const ')
  .replace(/^export class /gm, 'class ');

export function sheetHtml({ depth = 1, count = 12, prefix = 'c', cols = 4, labels = null } = {}) {
  const rooms = strip(read('./rooms.js'));
  const quarters = strip(read('./quarters.js'));
  const rules = strip(read('./rules.js'));
  const models = strip(read('./models.js'));
  const render = strip(read('./render.js'));
  return `<!doctype html><html><head><meta charset="utf-8"><title>DELVE floors</title>
<style>
  body { margin:0; background:#100d0b; color:#c9bda8;
         font:12px ui-sans-serif, system-ui, sans-serif; padding:14px; }
  h1 { font:600 15px ui-sans-serif; color:#d9b45a; margin:0 0 12px; letter-spacing:.1em; }
  .grid { display:grid; grid-template-columns:repeat(${cols}, 1fr); gap:12px; }
  .cell { background:#181310; border:1px solid #2e2620; border-radius:8px; padding:6px; }
  .cell canvas { width:100%; display:block; border-radius:5px; }
  .cap { font-size:10px; color:#8a7d6c; margin-top:5px; display:flex; gap:8px; flex-wrap:wrap; }
  .cap b { color:#c9bda8; font-weight:600; }
</style></head><body>
<h1 id="head">DELVE — FLOOR ${depth}</h1>
<div class="grid" id="grid"></div>
<script type="module">
${rooms}
${quarters}
${rules}
${models}
${render}

// the renderer wants a live run; a generated floor plus a few stubs is enough
function asRun(f) {
  return {
    tiles: f.tiles, ground: f.relics, enemies: f.enemies,
    x: f.pos[0], y: f.pos[1], over: false, depth: f.depth,
    foeAt(x, y) { return this.enemies.find((e) => e.hp > 0 && e.x === x && e.y === y); },
    threat() { return new Map(); },
  };
}

const grid = document.getElementById('grid');
const LABELS = ${JSON.stringify(labels)};
for (let i = 0; i < ${count}; i++) {
  const seed = ${JSON.stringify(prefix)} + '-' + i;
  const f = genFloor(seed, ${depth});
  const cell = document.createElement('div');
  cell.className = 'cell';
  const cv = document.createElement('canvas');
  cv.width = VIEW_W * 2; cv.height = VIEW_H * 2;
  cell.appendChild(cv);
  const cap = document.createElement('div');
  cap.className = 'cap';
  const foes = {};
  for (const e of f.enemies) foes[e.kind] = (foes[e.kind] || 0) + 1;
  cap.innerHTML = '<b>' + (LABELS ? LABELS[i] : f.room) + '</b>'
    + '<span>' + Object.entries(foes).map(([k, n]) => n + '×' + k).join(' ') + '</span>'
    + '<span>' + f.relics.length + ' relic' + (f.relics.length === 1 ? '' : 's') + '</span>';
  cell.appendChild(cap);
  grid.appendChild(cell);
  const c = cv.getContext('2d');
  c.setTransform(2, 0, 0, 2, 0, 0);
  drawFloor(c, asRun(f), 0, false);
}
document.body.dataset.ready = '1';
</script></body></html>`;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const [out = '/tmp/delve-sheet.html', depth = '1', count = '12', prefix = 'c'] = process.argv.slice(2);
  mkdirSync(new URL('.', pathToFileURL(out)).pathname, { recursive: true });
  writeFileSync(out, sheetHtml({ depth: +depth, count: +count, prefix }));
  console.log(`${out}  (floor ${depth}, ${count} rooms)`);
}
