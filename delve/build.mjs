// Builds DELVE into one file. rules.js, render.js and game.js use only plain
// `export`/`import` lines, so inlining is a matter of striking those out — no
// bundler, no dependency, nothing to go stale.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const strip = (src) => src
  .replace(/^import\s*\{[\s\S]*?\}\s*from\s*'[^']+';\n/gm, '')
  .replace(/^export function /gm, 'function ')
  .replace(/^export const /gm, 'const ')
  .replace(/^export class /gm, 'class ');

const rules = strip(read('./rules.js'));
const render = strip(read('./render.js'));
const game = strip(read('./game.js'));

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
const parts = { rules: topNames(rules), render: topNames(render), game: topNames(game) };
const clashes = [];
for (const [a, b] of [['rules', 'render'], ['rules', 'game'], ['render', 'game']]) {
  for (const n of parts[a].keys()) if (parts[b].has(n)) clashes.push(`${n} (${a} + ${b})`);
}
const dupes = Object.entries(parts).flatMap(([f, m]) =>
  [...m].filter(([, n]) => n > 1).map(([k]) => `${k} (twice in ${f})`));
if (clashes.length || dupes.length) {
  console.error('BUILD FAILED — the inlined scope has duplicate top-level names.');
  for (const c of clashes.concat(dupes)) console.error('  ' + c);
  process.exit(1);
}

const html = read('./index.template.html')
  .replace('{{RULES}}', () => rules)
  .replace('{{RENDER}}', () => render)
  .replace('{{GAME}}', () => game);

mkdirSync(new URL('../public/', import.meta.url), { recursive: true });
writeFileSync(new URL('../public/delve.html', import.meta.url), html);
writeFileSync(new URL('./delve.html', import.meta.url), html);
console.log(`public/delve.html: ${(html.length / 1024).toFixed(0)} KB`);
