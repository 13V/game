// End-to-end test for the vault API. Generates a real ed25519 keypair, signs a
// real claim, and drives the handler against whatever SUPABASE_URL points at —
// so run it against a scratch project, not production, since it writes a row.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/vault-api.test.mjs
//
// No credential is stored in this repository. Both come from the environment.
import { generateKeyPairSync, sign as edSign } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { verifyClaim } from '../api/_claim.js';
import handler from '../api/vault.js';

// This file lives OUTSIDE api/ on purpose. Vercel turns every module under
// api/ into a serverless function and imports it while bundling, so a test
// with top-level side effects placed there runs on every deployment — this one
// did, and wrote two junk rows into the production leaderboard before anyone
// noticed. Belt and braces: it also refuses to do anything unless run directly.
const invokedDirectly = process.argv[1]
  && pathToFileURL(process.argv[1]).href === import.meta.url;
if (!invokedDirectly) {
  console.error('vault-api.test.mjs is a script, not a module — run it directly');
  process.exit(2);
}
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first');
  process.exit(2);
}

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const b58 = (bytes) => {
  const d = [];
  for (const b of bytes) { let c = b; for (let i = 0; i < d.length; i++) { c += d[i] << 8; d[i] = c % 58; c = (c / 58) | 0; } while (c) { d.push(c % 58); c = (c / 58) | 0; } }
  let out = ''; for (const b of bytes) { if (b === 0) out += '1'; else break; }
  for (let i = d.length - 1; i >= 0; i--) out += B58[d[i]];
  return out;
};
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const raw = publicKey.export({ format: 'der', type: 'spki' }).subarray(12);
const address = b58(raw);
const body = ['KINGDOM — vault claim', `owner: ${address}`, 'groats: 42 minted lifetime',
  'charters: granary,timber', `at: ${new Date().toISOString()}`].join('\n');
const signature = b58(edSign(null, Buffer.from(body, 'utf8'), privateKey));

let pass = 0, fail = 0;
const t = (name, cond) => { if (cond) { pass++; console.log('ok  ', name); } else { fail++; console.log('FAIL', name); } };

t('a real signature verifies', verifyClaim({ address, message: body, signature }) === null);
t('a tampered message is rejected', !!verifyClaim({ address, message: body + ' ', signature }));
t('a wrong address is rejected', !!verifyClaim({ address: b58(Buffer.alloc(32, 9)), message: body, signature }));
t('a replay against another address is rejected',
  !!verifyClaim({ address, message: body.replace(/owner: \S+/, 'owner: ' + b58(Buffer.alloc(32, 3))), signature }));
const old = body.replace(/at: .*/, 'at: ' + new Date(Date.now() - 3600e3).toISOString());
t('a stale claim is rejected', /expired/.test(verifyClaim({ address, message: old, signature: b58(edSign(null, Buffer.from(old, 'utf8'), privateKey)) }) || ''));
t('garbage base58 is rejected', !!verifyClaim({ address: '0OIl', message: body, signature }));

const call = (req) => new Promise((res) => {
  const r = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; }, end(b) { res({ code: this.statusCode, body: JSON.parse(b) }); } };
  handler(req, r);
});

const w = await call({ method: 'POST', query: {}, body: { address, message: body, signature,
  vault: { groats: 42, lifetime: 137, charters: ['granary', 'timber'], best_pop: 26 } } });
t('POST writes to supabase', w.code === 200 && w.body.vault && w.body.vault.lifetime === 137);
const g = await call({ method: 'GET', query: { address } });
t('GET reads it back', g.code === 200 && g.body.vault && g.body.vault.best_pop === 26);
const forged = await call({ method: 'POST', query: {}, body: { address, message: body, signature: b58(Buffer.alloc(64, 1)), vault: { groats: 99999 } } });
t('a forged signature cannot write', forged.code === 401);
const neg = await call({ method: 'POST', query: {}, body: { address, message: body, signature, vault: { groats: -5, lifetime: 1e15, charters: 'nope' } } });
t('nonsense values are clamped', neg.code === 200 && neg.body.vault.groats === 0 && neg.body.vault.lifetime === 1e9 && Array.isArray(neg.body.vault.charters));
const board = await call({ method: 'GET', query: { board: '1' } });
t('the board lists vaults', board.code === 200 && Array.isArray(board.body.board) && board.body.board.length >= 1);
// tidy up after itself — this table is a live leaderboard
await fetch(`${process.env.SUPABASE_URL}/rest/v1/vaults?address=eq.${address}`, {
  method: 'DELETE',
  headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
});
console.log(`\n${fail ? 'FAILURES: ' + fail : 'ALL API CHECKS PASS'}  (${pass} passed, test row removed)`);
process.exit(fail ? 1 : 0);
