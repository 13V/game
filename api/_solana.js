// Reads an SPL token balance straight from an RPC node. This is the only place
// a holding is established, and it is deliberately server-side: a balance check
// made in the browser is a suggestion, because the browser is the attacker.
const RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
export const TOKEN_MINT = process.env.TOKEN_MINT || '';
export const TOKEN_MIN = Number(process.env.TOKEN_MIN || 100000);

// No mint configured means no gate. That is the safe default: a token that has
// not launched yet must not lock everybody out of the game.
export const gateOn = () => !!TOKEN_MINT;

export async function tokenBalance(owner) {
  if (!TOKEN_MINT) return null;
  const ask = (params) => fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTokenAccountsByOwner', params }),
  }).then((r) => r.json());

  const res = await ask([owner, { mint: TOKEN_MINT }, { encoding: 'jsonParsed' }]);
  if (res.error) throw new Error(res.error.message || 'rpc refused');
  let total = 0;
  for (const a of res.result?.value || []) {
    const amt = a.account?.data?.parsed?.info?.tokenAmount;
    if (amt && amt.uiAmount) total += Number(amt.uiAmount);
  }
  return total;
}

// The treasury's own holdings, read from the chain rather than from a config
// file, so the purse the game shows on screen is a number anybody can check.
export async function solBalance(owner) {
  const r = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [owner] }),
  }).then((x) => x.json());
  if (r.error) throw new Error(r.error.message || 'rpc refused');
  return Number(r.result?.value || 0);            // lamports
}

// Raw units and decimals, not a float: a purse is divided into ten shares and
// floats lose pennies doing it. uiAmount is for display only.
export async function tokenHolding(owner) {
  if (!TOKEN_MINT) return { raw: 0n, decimals: 0, ui: 0 };
  const r = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'getTokenAccountsByOwner',
      params: [owner, { mint: TOKEN_MINT }, { encoding: 'jsonParsed' }],
    }),
  }).then((x) => x.json());
  if (r.error) throw new Error(r.error.message || 'rpc refused');
  let raw = 0n, decimals = 0;
  for (const a of r.result?.value || []) {
    const amt = a.account?.data?.parsed?.info?.tokenAmount;
    if (!amt) continue;
    raw += BigInt(amt.amount || '0');
    decimals = Number(amt.decimals || 0);
  }
  return { raw, decimals, ui: Number(raw) / 10 ** decimals };
}
