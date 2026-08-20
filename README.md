# Solana game — research & concept development

Working repository for designing an interactive game on Solana. This currently holds
research and vetted concepts, not code.

## What's here

| File | What it is |
| --- | --- |
| `research/01-solana-primitives-2026.md` | Inventory of the Solana stack as of Aug 2026 — hard limits, costs, latency, what's live vs. dead. The numbers that constrain game design. |
| `research/02-what-died-what-survived.md` | The crypto-game graveyard, the survivors, ranked failure patterns, and an honest list of what crypto does and does not add. |
| `research/03-legal-and-economics.md` | Gambling/securities constraints, 2026 US enforcement reality, sustainable economy patterns, unit economics, anti-bot. Not legal advice. |
| `research/04-wave1-concepts.md` | 21 concepts across seven design lenses, each with a hostile technical/economic/legal review. |
| `research/05-wave1-build-specs.md` | Full build specs for the four highest-scoring wave-1 concepts. |
| `research/06-gaps-and-blind-spots.md` | What the first wave systematically failed to surface, and why. |
| `research/wave1-ideas.json` | Structured source data for the above. |

## Design constraints established so far

**Throughput.** The ceiling that bites is **12M CU per writable account per block**, not the
100M block limit. A single global game-state account is the bottleneck. Shard state per player
or per match — this also gives near-zero priority fees, since Solana's fee markets are local to
writable accounts.

**Latency.** L1 is a settlement layer (400ms slots, 350ms from epoch 1020). Anything needing a
real-time loop belongs in a MagicBlock ephemeral rollup (~10ms slots, 64KB transactions,
~0.0003 SOL per session). Alpenglow shortens finality, not input latency.

**Randomness.** Any asymmetric randomness — loot rolls, crits, matchmaking variance — pushes a
wagered game out of skill-predominance in US material-element states. Symmetric randomness
(both players face a provably identical seeded board) preserves both the skill analysis and
competitive integrity. Slot hashes are validator-influenceable and unsafe where money is at stake.

**Legal.** Gambling = consideration + chance + prize; removing any one element is the design
problem. The sweepstakes/dual-currency structure is being criminalized state by state and should
not be built on. Offshore licensing confers no right to serve US players. Regulators assess what a
product functionally *is* — restructuring works, labeling does not.

**Economy.** No native token. Stakes and prizes in SOL/USDC. Payouts must be funded by a sink
tied to consumption, not by new deposits. If removing the token would kill retention, there was
no retention.

**Cold start.** The most common killer in review was not legal or technical — it was needing
synchronous concurrency nobody had a plan to acquire. A solo developer has eight players in week
one. Asynchronous and low-liquidity-tolerant designs are strongly favoured.
