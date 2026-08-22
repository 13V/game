// Builds the single-file playable page: inlines sim.js and game.js into the
// template. Both modules use only `export`/one `import` line, so inlining is
// a matter of stripping those keywords — no bundler required.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

const sim = read('./sim.js')
  .replace(/^export function /gm, 'function ')
  .replace(/^export const /gm, 'const ');

const rules = read('./rules.js')
  .replace(/import\s*\{[\s\S]*?\}\s*from\s*'\.\/sim\.js';\n/, '')
  .replace(/^export function /gm, 'function ')
  .replace(/^export const /gm, 'const ')
  .replace(/^export class /gm, 'class ');

const game = read('./game.js')
  .replace(/import\s*\{[\s\S]*?\}\s*from\s*'\.\/sim\.js';\n/, '')
  .replace(/import\s*\{[\s\S]*?\}\s*from\s*'\.\/rules\.js';\n/, '')
  .replace(/^export function boot/m, 'function boot');

// sim.js and game.js are concatenated into ONE module scope, so a top-level
// name declared in both is a hard SyntaxError and a blank page — and `node
// verify.mjs` cannot see it, because there the two are separate modules. This
// once shipped a broken build over a function called `mix`. Never again.
const topNames = (src) => {
  const out = new Map();
  const re = /^(?:export\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm;
  for (const m of src.matchAll(re)) out.set(m[1], (out.get(m[1]) || 0) + 1);
  return out;
};
const simNames = topNames(sim + '\n' + rules), gameNames = topNames(game);
const clash = [...simNames.keys()].filter((n) => gameNames.has(n));
const dupes = [...gameNames].filter(([, n]) => n > 1).map(([k]) => k)
  .concat([...simNames].filter(([, n]) => n > 1).map(([k]) => k));
if (clash.length || dupes.length) {
  console.error('BUILD FAILED — the inlined scope has duplicate top-level names.');
  if (clash.length) console.error('  declared in both sim.js and game.js:', clash.join(', '));
  if (dupes.length) console.error('  declared twice in one file:', dupes.join(', '));
  process.exit(1);
}

const html = read('./index.template.html')
  .replace('{{SIM}}', () => `${sim}\n${rules}`)
  .replace('{{GAME}}', () => game);

// Two outputs, one page. The artifact keeps its historic filename because that
// is what its published URL is bound to; the deploy wants an index.html.
writeFileSync(new URL('./steading-season-zero.html', import.meta.url), html);
mkdirSync(new URL('../public/', import.meta.url), { recursive: true });
writeFileSync(new URL('../public/index.html', import.meta.url), html);

// The paymaster. Plain HTML, no inlining to do — it is a separate page on
// purpose, because the thing that pays the prizes should not share a scope
// with the thing that plays the game.
const admin = read('./admin.html');
writeFileSync(new URL('../public/admin.html', import.meta.url), admin);

console.log(`steading-season-zero.html + public/index.html: ${(html.length / 1024).toFixed(0)} KB`);
console.log(`public/admin.html: ${(admin.length / 1024).toFixed(0)} KB`);
