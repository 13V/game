// Minimal base58 for Solana addresses and signatures. No dependency, because a
// serverless function that pulls a package tree to decode 32 bytes is a poor
// trade — and because this must agree exactly with the encoder in the client.
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const MAP = new Map([...ALPHABET].map((c, i) => [c, i]));

export function b58decode(str) {
  if (typeof str !== 'string' || !str.length) throw new Error('empty');
  const bytes = [];
  for (const ch of str) {
    const val = MAP.get(ch);
    if (val === undefined) throw new Error('not base58');
    let carry = val;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) { bytes.push(carry & 0xff); carry >>= 8; }
  }
  for (const ch of str) { if (ch === '1') bytes.push(0); else break; }
  return Buffer.from(bytes.reverse());
}
