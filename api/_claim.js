// Verifies a Phantom-signed vault claim. The wallet signs a plain-text message
// entirely offline; this is the only place its authenticity is established, so
// everything the rest of the API trusts about "who is calling" comes from here.
import { createPublicKey, verify } from 'node:crypto';
import { b58decode } from './_b58.js';

// an ed25519 raw public key wrapped in the SPKI header node's crypto expects
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const MAX_AGE_MS = 10 * 60 * 1000;

export function verifyClaim({ address, message, signature }) {
  if (typeof address !== 'string' || typeof message !== 'string' || typeof signature !== 'string') {
    return 'address, message and signature are all required';
  }
  if (message.length > 2000) return 'message too long';

  let key, sig;
  try {
    const raw = b58decode(address);
    if (raw.length !== 32) return 'that is not a Solana address';
    key = createPublicKey({ key: Buffer.concat([SPKI_PREFIX, raw]), format: 'der', type: 'spki' });
    sig = b58decode(signature);
    if (sig.length !== 64) return 'that is not an ed25519 signature';
  } catch { return 'address or signature is not valid base58'; }

  if (!verify(null, Buffer.from(message, 'utf8'), key, sig)) return 'the signature does not match';

  // The message names its own signer and its own age, so a signature captured
  // from one player cannot be replayed against another address or next week.
  const owner = /^owner:\s*(\S+)$/m.exec(message);
  if (!owner || owner[1] !== address) return 'the message does not name this address';
  const at = /^at:\s*(\S+)$/m.exec(message);
  const when = at ? Date.parse(at[1]) : NaN;
  if (!Number.isFinite(when)) return 'the message is not dated';
  if (Math.abs(Date.now() - when) > MAX_AGE_MS) return 'that claim has expired — sign again';

  return null;
}
