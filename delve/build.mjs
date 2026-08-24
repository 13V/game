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
const INLINED = ['./rooms.js', './quarters.js', './rules.js', './models.js', './monogon.js', './render.js', './mesh3d.js', './render3d.js', './camp.js', './game.js'];
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
const monogon = byFile['./monogon.js'];
const render = byFile['./render.js'];
const mesh3d = byFile['./mesh3d.js'];
const render3d = byFile['./render3d.js'];
const camp = byFile['./camp.js'];
const game = byFile['./game.js'];

// The three files land in ONE module scope, so a top-level name declared in two
// of them is a hard SyntaxError and a blank page — and running them as separate
// modules in node cannot see it, because there they are separate scopes. The
// island game shipped a broken build over exactly this. The build fails instead.
const topNames = (src) => {
  const out = new Map();
  const add = (n) => out.set(n, (out.get(n) || 0) + 1);
  // functions and classes declare exactly one name
  for (const m of src.matchAll(/^(?:export\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)/gm)) add(m[1]);
  // A const/let/var can declare SEVERAL: `const TW = 46, TH = 33, HZ = 18`.
  // Reading only the first name let TH through, and TH collided with three.js's
  // handle in the 3D renderer — a blank page that the guard existed to prevent.
  // Everything up to the end of the line is scanned, skipping over anything
  // bracketed so a value like `[1, 2]` cannot look like another declarator.
  for (const m of src.matchAll(/^(?:export\s+)?(?:const|let|var)\s+([^\n;]*)/gm)) {
    let depth = 0, buf = '', expect = true;
    for (const ch of m[1]) {
      if ('([{'.includes(ch)) depth++;
      else if (')]}'.includes(ch)) depth--;
      if (depth > 0) continue;
      if (ch === '=') { if (expect && buf.trim()) add(buf.trim()); buf = ''; expect = false; }
      else if (ch === ',') { if (expect && buf.trim()) add(buf.trim()); buf = ''; expect = true; }
      else if (expect) buf += ch;
    }
    if (expect && buf.trim() && /^[A-Za-z_$][\w$]*$/.test(buf.trim())) add(buf.trim());
  }
  return out;
};
const named = { rooms: topNames(rooms), quarters: topNames(quarters), rules: topNames(rules),
  models: topNames(models), monogon: topNames(monogon), render: topNames(render),
  mesh3d: topNames(mesh3d), render3d: topNames(render3d), camp: topNames(camp), game: topNames(game) };
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

// The effect sheets ride inside the page as data URIs — the game stays one
// self-contained file, and the CSP never has to trust another host for them.
const fxManifest = JSON.parse(read('./fx/manifest.json'));
const fxEntries = Object.entries(fxManifest).map(([name, m]) => {
  const b64 = readFileSync(new URL(`./fx/${name}.png`, import.meta.url)).toString('base64');
  return `  ${name}: { src: 'data:image/png;base64,${b64}', fw: ${m.fw}, fh: ${m.fh}, n: ${m.n} },`;
});
const fx = `// baked by build.mjs from delve/fx/ — Super Pixel Effects Gigapack, Will Tice / unTied Games
const FX_SHEETS = {
${fxEntries.join('\n')}
};`;

const html = read('./index.template.html')
  .replace('{{FX}}', () => fx)
  .replace('{{RULES}}', () => `${rooms}\n${quarters}\n${rules}`)
  .replace('{{RENDER}}', () => `${models}\n${monogon}\n${render}\n${mesh3d}\n${render3d}`)
  .replace('{{GAME}}', () => `${camp}\n${game}`);

mkdirSync(new URL('../public/', import.meta.url), { recursive: true });
// three.js as its own file, served from our own origin — the CSP allows 'self',
// and the browser caches 728 KB once instead of re-downloading it inside every
// copy of the page.
writeFileSync(new URL('../public/three.js', import.meta.url), read('./vendor/three.bundle.js'));
writeFileSync(new URL('../public/delve.html', import.meta.url), html);
writeFileSync(new URL('./delve.html', import.meta.url), html);
console.log(`public/delve.html: ${(html.length / 1024).toFixed(0)} KB`);
