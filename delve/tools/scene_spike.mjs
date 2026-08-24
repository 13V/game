// A standalone page that runs a REAL Run through the 3D renderer.
import { readFileSync, writeFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const strip = (s) => s.replace(/^import\s*\{[\s\S]*?\}\s*from\s*'[^']+';\n/gm, '')
  .replace(/^export (function|const|class|let) /gm, '$1 ');
const parts = [
  read('../vendor/three.bundle.js'),
  strip(read('../rooms.js')), strip(read('../quarters.js')), strip(read('../rules.js')),
  strip(read('../models.js')), strip(read('../monogon.js')),
  strip(read('../mesh3d.js')), strip(read('../render3d.js')),
].join('\n');
const app = `
const cv = document.getElementById('c');
const S = init3d(THREE, cv);
resize3d(900, 600);
const run = new Run(SEED, { class: KLASS });
for (const mv of MOVES) run.act(mv);
window.__run = run;
draw3d(run, 0, false);
window.__ok = Object.assign({ depth: run.depth, x: run.x, y: run.y }, stats3d());
window.__redraw = (t) => draw3d(run, t || 0, false);
`;
const seed = process.argv[3] || 'scene-probe';
const klass = process.argv[4] || 'warden';
const moves = process.argv[5] || '[]';
writeFileSync(process.argv[2],
  `<!doctype html><html><body style="margin:0;background:#000">
<canvas id="c" width="900" height="600"></canvas>
<script>const SEED=${JSON.stringify(seed)},KLASS=${JSON.stringify(klass)},MOVES=${moves};
${parts}
${app}</script></body></html>`);
console.log('scene page written');
