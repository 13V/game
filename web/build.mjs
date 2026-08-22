// Builds the single-file playable page: inlines sim.js and game.js into the
// template. Both modules use only `export`/one `import` line, so inlining is
// a matter of stripping those keywords — no bundler required.
import { readFileSync, writeFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

const sim = read('./sim.js')
  .replace(/^export function /gm, 'function ')
  .replace(/^export const /gm, 'const ');

const game = read('./game.js')
  .replace(/import\s*\{[\s\S]*?\}\s*from\s*'\.\/sim\.js';\n/, '')
  .replace(/^export function boot/m, 'function boot');

const html = read('./index.template.html')
  .replace('{{SIM}}', () => sim)
  .replace('{{GAME}}', () => game);

writeFileSync(new URL('./steading-season-zero.html', import.meta.url), html);
console.log(`steading-season-zero.html: ${(html.length / 1024).toFixed(0)} KB`);
