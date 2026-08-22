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
