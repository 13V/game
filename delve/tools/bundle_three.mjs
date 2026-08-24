// Flattens three.js's two ES modules into ONE script that can be inlined.
//
// DELVE ships as a single HTML file under a strict CSP with no external hosts,
// so three.js cannot be fetched from a CDN and cannot stay as two modules that
// import each other. Both builds are minified with the same regular shape —
// core ends in one `export{...}`, module starts with one `import{...}from
// "./three.core.min.js"` and ends in its own `export{...}` — so the rewrite is
// exact rather than a guess: core's exports become a namespace object, the
// module's import becomes a destructure of it, and the module's exports become
// the value of one IIFE.
//
//   node delve/tools/bundle_three.mjs > delve/vendor/three.bundle.js
import { readFileSync } from 'node:fs';

const here = new URL('../vendor/', import.meta.url);
const core = readFileSync(new URL('three.core.min.js', here), 'utf8');
const mod = readFileSync(new URL('three.module.min.js', here), 'utf8');

// A minified build can carry MORE than one export block: three.module also
// re-exports the whole of core (`export * from` flattened into 245 bare names
// that are not even in the module's scope). Every block is cut out; the LAST
// one — the module's own locals, written `local as Exported` — is what the
// namespace is built from. The forwarded names need no handling at all,
// because core is spread into the result anyway.
const takeExports = (src, label) => {
  // The forwarding block is a RE-export — `export{A,B}from"./three.core.min.js";`
  // — so the optional `from"..."` clause has to come out with it, or a bare
  // `from"..."` is left behind and the whole bundle is a syntax error.
  const blocks = [...src.matchAll(/export\s*\{([^}]*)\}\s*(?:from\s*"[^"]*"\s*)?;?/g)];
  if (!blocks.length) throw new Error(`${label}: no export block`);
  const last = blocks[blocks.length - 1];
  const pairs = last[1].split(',').filter((s) => s.trim()).map((s) => {
    const [local, exported] = s.trim().split(/\s+as\s+/);
    return [local.trim(), (exported || local).trim()];
  });
  let body = src;
  for (const b of [...blocks].reverse()) body = body.slice(0, b.index) + body.slice(b.index + b[0].length);
  return { body, pairs };
};

const c = takeExports(core, 'three.core');
const m = takeExports(mod, 'three.module');

// the module's single import, rewritten to read from core's namespace
const imp = mod.match(/^import\s*\{([^}]*)\}\s*from\s*"\.\/three\.core\.min\.js"\s*;/m);
if (!imp) throw new Error('three.module: no import from three.core');
const binds = imp[1].split(',').map((s) => {
  const [exported, local] = s.trim().split(/\s+as\s+/);
  return `${exported.trim()}: ${(local || exported).trim()}`;
}).join(',');

// A FUNCTION replacer, never a string: minified three.js uses `$` in its
// generated names, and in a string replacement `$'` means "insert everything
// after the match" — which silently pasted the rest of the library back in.
const modBody = m.body.replace(imp[0], () => `const {${binds}} = __THREE_CORE__;`);

process.stdout.write(`// three.js r${/REVISION\s*=\s*"([^"]+)"/.exec(core)?.[1] || '?'} — MIT, see vendor/THREE-LICENSE.txt
// Bundled for inlining by delve/tools/bundle_three.mjs. Do not edit.
const THREE = (() => {
const __THREE_CORE__ = (() => {
${c.body}
return {${c.pairs.map(([l, e]) => `${e}: ${l}`).join(',')}};
})();
${modBody}
return Object.assign({}, __THREE_CORE__, {${m.pairs.map(([l, e]) => `${e}: ${l}`).join(',')}});
})();
`);
