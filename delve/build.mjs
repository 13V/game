// Builds DELVE into one file. rules.js, render.js and game.js use only plain
// `export`/`import` lines, so inlining is a matter of striking those out — no
// bundler, no dependency, nothing to go stale.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

const pulled = new Set();
const strip = (src) => src
  .replace(/^import\s*\{[\s\S]*?\}\s*from\s*'([^']+)';\n/gm, (m, spec) => { pulled.add(spec); return ''; })
  .replace(/^export function /gm, 'function ')
  .replace(/^export const /gm, 'const ')
  .replace(/^export class /gm, 'class ');

// rooms.js first: rules.js reads ROOMS at call time, but a const must still be
// declared above the code that uses it once they share one scope.
const INLINED = ['./rooms.js', './quarters.js', './rules.js', './models.js', './render.js', './camp.js', './game.js'];
const parts = INLINED.map((f) => [f, strip(read(f))]);
const byFile = Object.fromEntries(parts);

const missing = [...pulled].filter((spec) => !INLINED.includes(spec));
if (missing.length) {
  console.error('BUILD FAILED — these imports were stripped but never inlined:');
  for (const m of missing) console.error('  ' + m + '  (add it to INLINED, in dependency order)');
  process.exit(1);
}

const rooms = byFile['./rooms.js'];
const quarters = byFile['./quarters.js'];
const rules = byFile['./rules.js'];
const models = byFile['./models.js'];
const render = byFile['./render.js'];
const camp = byFile['./camp.js'];
const game = byFile['./game.js'];

// The three files land in ONE module scope, so a top-level name declared in two
// of them is a hard SyntaxError and a blank page — and running them as separate
// modules in node cannot see it, because there they are separate scopes. The
// island game shipped a broken build over exactly this. The build fails instead.
const topNames = (src) => {
  const out = new Map();
  const re = /^(?:export\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm;
  for (const m of src.matchAll(re)) out.set(m[1], (out.get(m[1]) || 0) + 1);
  return out;
};
const named = { rooms: topNames(rooms), quarters: topNames(quarters), rules: topNames(rules),
  models: topNames(models), render: topNames(render), camp: topNames(camp), game: topNames(game) };
const clashes = [];
const files = Object.keys(named);
for (let i = 0; i < files.length; i++) for (let j = i + 1; j < files.length; j++) {
  for (const n of named[files[i]].keys()) if (named[files[j]].has(n)) clashes.push(`${n} (${files[i]} + ${files[j]})`);
}
const dupes = Object.entries(named).flatMap(([f, m]) =>
  [...m].filter(([, n]) => n > 1).map(([k]) => `${k} (twice in ${f})`));
if (clashes.length || dupes.length) {
  console.error('BUILD FAILED — the inlined scope has duplicate top-level names.');
  for (const c of clashes.concat(dupes)) console.error('  ' + c);
  process.exit(1);
}

const html = read('./index.template.html')
  .replace('{{RULES}}', () => `${rooms}\n${quarters}\n${rules}`)
  .replace('{{RENDER}}', () => `${models}\n${render}`)
  .replace('{{GAME}}', () => `${camp}\n${game}`);

mkdirSync(new URL('../public/', import.meta.url), { recursive: true });
writeFileSync(new URL('../public/delve.html', import.meta.url), html);
writeFileSync(new URL('./delve.html', import.meta.url), html);
console.log(`public/delve.html: ${(html.length / 1024).toFixed(0)} KB`);
