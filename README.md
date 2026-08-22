# Solana game — research & concept development

Working repository for designing an interactive game on Solana. Holds the research and vetted
concepts behind the design, plus two deterministic simulation cores: `crates/mw-vm`
(MILLWRIGHT, the highest-ranked concept from the bake-off) and `crates/st-sim` (STEADING,
the voxel kingdom-economy sim chosen to build).

## What's here

| File | What it is |
| --- | --- |
| `STATUS.md` | Where the work stands, known gaps, and what comes next. Start here. |
| `research/01-solana-primitives-2026.md` | Inventory of the Solana stack as of Aug 2026 — hard limits, costs, latency, what's live vs. dead. The numbers that constrain game design. |
| `research/02-what-died-what-survived.md` | The crypto-game graveyard, the survivors, ranked failure patterns, and an honest list of what crypto does and does not add. |
| `research/03-legal-and-economics.md` | Gambling/securities constraints, 2026 US enforcement reality, sustainable economy patterns, unit economics, anti-bot. Reference only — not treated as a design gate. Not legal advice. |
| `research/04-wave1-concepts.md` | Wave 1: 21 concepts across seven broad design lenses, each with a hostile review. |
| `research/05-wave1-build-specs.md` | Build specs for four wave-1 concepts. |
| `research/06-gaps-and-blind-spots.md` | What wave 1 systematically failed to surface, and why. |
| `research/07-wave2-concepts.md` | Wave 2: 12 concepts targeted at the solo-dev profile, ranked by a three-judge panel. |
| `research/08-wave3-concepts.md` | Wave 3: 12 concepts generated with asymmetric randomness available. Critiqued but unjudged. |
| `research/09-spec-millwright.md` | Build spec — MILLWRIGHT (wave 2, rank 1). |
| `research/10-spec-doctrine.md` | Build spec — DOCTRINE (wave 2, rank 2). |
| `research/11-unified-ranking.md` | **All 45 concepts from all three waves, re-scored on one common rubric by three judges.** Supersedes the per-wave rankings. |
| `research/12-spec-review-notes.md` | Backfilled PvE critiques reconciled against the build specs — including the one live fix outstanding on MILLWRIGHT. |
| `research/13-spec-lockmaker.md` | Build spec — LOCKMAKER (rank 2). |
| `research/14-spec-steading.md` | Build spec — STEADING, the competitive voxel kingdom-economy sim in the tiny-world diorama style. **The concept chosen to build**; v1.1 is synced to the implemented `st-sim` crate. |
| `research/*.json` | Structured source data behind the above. |
| `web/` | **The playable game** — single-file browser build with a parity-verified JS port of the sim. See `web/README.md`. |

## Design constraints established so far

**Throughput.** The ceiling that bites is **12M CU per writable account per block**, not the
100M block limit. A single global game-state account is the bottleneck. Shard state per player
or per match — this also gives near-zero priority fees, since Solana's fee markets are local to
writable accounts.

**Latency.** L1 is a settlement layer (400ms slots, 350ms from epoch 1020). Anything needing a
real-time loop belongs in a MagicBlock ephemeral rollup (~10ms slots, 64KB transactions,
~0.0003 SOL per session). Alpenglow shortens finality, not input latency.

**Randomness.** Slot hashes are validator-influenceable and unsafe where money is at stake;
use commit-reveal for two-party or a VRF (Switchboard On-Demand, ORAO) where a callback and
1-2 slots of latency are acceptable. Symmetric randomness — both players facing a provably
identical seeded board — protects competitive integrity, but it is not required: regulatory
structuring was dropped as a design constraint partway through, which restores asymmetric,
consequential randomness. That matters mechanically, since it is the engine behind poker,
Balatro, XCOM and backgammon, where the skill *is* variance management. Wave-3 concepts assume
it is available; wave-2 concepts were generated before the constraint was lifted.

**Economy.** No native token. Stakes and prizes in SOL/USDC. Payouts must be funded by a sink
tied to consumption, not by new deposits. If removing the token would kill retention, there was
no retention.

**Cold start.** The most common killer in review was not legal or technical — it was needing
synchronous concurrency nobody had a plan to acquire. A solo developer has eight players in week
one. Asynchronous and low-liquidity-tolerant designs are strongly favoured.

## The competition, and the gate

`web/rules.js` has no DOM in it and no drawing, and that is the entire point:
the browser runs it to play, and the serverless function in `/api` runs **the
same file** to re-simulate a submitted reign. A leaderboard that takes the
client's word for a number is one `curl` away from being won by somebody who
never played, and a second copy of the rules on the server would drift from this
one inside a week.

**The competition is a season, not an endurance test.** Sixty days for everyone,
on the same island. Replaying alone stops a fabricated score but it does not
stop grinding — without a fixed horizon the winner is whoever left the tab open
longest, which is not a game. Anything past day sixty is replayed for honesty
and then ignored for scoring, so a 200-day reign and a 60-day one score
identically.

A submission is therefore a **record of what the player did** — every placement,
demolition, tax change, festival, trade and event answer, each tagged with the
day it happened — and never a score. `/api/run` replays it, checks each
placement was legal and affordable at the moment it was made, and works the
score out itself: **peak folk × 1,000 + gold**. Only an improvement is kept, so
resubmitting a worse reign cannot cost you your place. Today's and yesterday's
valleys are accepted and no others, so nobody grinds a week-old island.

`node scripts/replay.test.mjs` plays a 90-day reign, replays it, and demands the
two agree on every field down to the coin — plus the five records that must be
refused. It earned its keep immediately: `peakPop` was being kept by the
*interface*, so a reign replayed on the server scored as though it had never
grown and every submission would have come back as four folk. It lives in the
rules now.

**The gate.** Five minutes of play, then a wallet holding 100,000 of the token.
The page asks `GET /api/pass` on load whether a gate exists at all before it
counts anything down — no token configured, or no backend reachable, means no
countdown and no modal. It used to count regardless, so every build so far
showed a five-minute timer promising an interruption that was never coming, and
connecting a wallet did nothing to it because nothing had asked. Connecting now
settles it on the spot when a gate is live, and the countdown itself is the
unlock button, so a holder never has to sit the demo out first.
Be plain about what that is: the game is one HTML file running in the player's
browser, so a determined player edits past it in a minute, or saves the page and
opens it offline. **A gate written in the browser is a courtesy, not a lock** —
the modal says so too, rather than only this file. What is genuinely enforced is
the competition: `/api/run` reads the balance from a Solana node itself, and
re-reads it on every submission rather than trusting a pass, because somebody
can hold, pass, and sell a minute later.

### What cheating this still allows, and what it does not

| Attack | Stopped by |
| --- | --- |
| Posting a score you did not earn | there is no score field. The server replays the record and computes it |
| Editing the game to get free resources | every placement is re-checked for legality and affordability *at the moment it was made* |
| Replaying somebody else's record as your own | the claim names its own signer, and the signature is over that |
| Reusing an old signature next week | the claim carries a timestamp, good for ten minutes |
| Submitting a 400-day reign a second after the valley opens | days cost real time, so the wall clock caps how many could have passed |
| Grinding for hours to out-last everyone | the season is fixed at 60 days |
| Throwing a thousand records at the replayer | one submission per address per 20 seconds, records capped at 4,000 acts |
| Farming a week-old island you have already solved | today's and yesterday's valleys only |

**Not stopped: a bot that plays the game well.** Server-side replay means an
automated player has to play a legal game — it cannot fabricate one — but a
legal game played by a script is still a legal game, and no amount of
client-side cleverness changes that from a page the player controls. The fixed
season limits what automation buys (there is no grinding advantage left, only a
skill one), and the token gate raises the cost of running many wallets. That is
the honest extent of it.

`TOKEN_MINT` unset means **no gate at all**. That is the deliberate default — a
token that has not launched must never lock everybody out of the game, and the
artifact build has no network egress, so it could not check anyway.

| Variable | Meaning |
| --- | --- |
| `TOKEN_MINT` | the SPL mint. Unset = no gate |
| `TOKEN_MIN` | how much must be held (default 100000) |
| `SOLANA_RPC_URL` | an RPC node. **Server-side only** — the browser never sees it |

## Deploying

The game is one self-contained HTML file. `node web/build.mjs` writes it twice:
`web/steading-season-zero.html`, whose name is bound to the published artifact
URL and must not change, and `public/index.html`, which is what gets served.

**Live at `game-hazel-omega.vercel.app`.** `vercel.json` sets the build command, the output directory and the
headers. Import the repository and it deploys as a static site with one
serverless function. Two environment variables are needed for the vault to
persist, both from Supabase → Project Settings → API:

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | the **service role** key, never the anon key |

Without them `/api/vault` answers 503 and the client falls back to
`localStorage` — the game never depends on a backend it may not have.

**`npm run check` builds, replays the parity vectors, and then loads the built
page under the production headers to assert it still boots.** That last step
exists because leaving `script-src` out of the CSP shipped a blank shell to
production: with no `script-src`, `default-src 'self'` applies to scripts and
blocks the inline module the entire game lives in. Byte-identical output and
correct headers both looked fine — a header that changes *runtime* behaviour is
invisible to either. `scripts/serve-local.mjs` serves `public/index.html` with
the headers read out of `vercel.json` itself, so the policy is always tested as
configured rather than as remembered.

The policy allows `'unsafe-inline'` scripts, which a single-file inline app
requires, and `chrome-extension:`/`moz-extension:` so a wallet injecting a
provider script into the page is not blocked by `default-src`.
`frame-ancestors 'none'` and `X-Frame-Options: DENY` are the headers that
actually matter on a page where somebody connects a wallet: they stop it being
framed for clickjacking.

**Database.** `supabase/schema.sql` creates one table. Row level security is on
with **no policies at all**, so the anon key — the one that ships to browsers —
can neither read nor write it; verified, not assumed:

```
write with the anon key → 401  new row violates row-level security policy
read  with the anon key → []   no rows visible
```

Everything goes through `/api/vault`, which holds the service-role key
server-side and verifies an ed25519 signature before it touches a row.
`node scripts/vault-api.test.mjs` runs the whole chain — real keypair, real signature,
real round trip — including the cases that must fail: a tampered message, a
forged signature, a claim replayed against another address, an expired claim,
and out-of-range values.

The test lives in `scripts/`, **not** in `api/`, and refuses to run unless
invoked directly. Vercel turns every module under `api/` into a serverless
function and imports it while bundling, so a test with top-level side effects
placed there executes on every deployment — this one did, and wrote two junk
rows straight into the production leaderboard before anyone looked.

**What the signature does and does not buy.** It stops one player writing to
another player's row, which is what a shared board needs. It cannot stop a
player posting an inflated balance for an address they control, because the
game simulates in the browser. Balances become trustworthy only when the chain
re-simulates the plan — that is the entire point of the Anchor program in
`research/14-spec-steading.md`, and it is not built yet. The schema says so too,
so nobody reads this table as an anti-cheat.

## The wallet

Phantom injects its provider into the page, so `connect()` and `signMessage()`
are extension calls with no network behind them and they work even where the
page has no egress at all. What does not work without egress is everything past
that: no RPC node means no balance and no transaction, and the page says exactly
that rather than mocking one.

The wallet's job today is identity. Connecting names the vault's owner; signing
produces a real ed25519 signature over the balance, and that signed message is
the precise payload the Anchor program will verify when the groat token ships.
The claim carries the owner's own address and a timestamp, so a signature
captured from one player cannot be replayed against another address or a week
later.
