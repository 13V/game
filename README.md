# Solana game — research & concept development

Working repository for designing an interactive game on Solana. Holds the research and vetted
concepts behind the design, plus `crates/mw-vm` — the deterministic simulation core for
MILLWRIGHT, the highest-ranked concept.

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
| `research/*.json` | Structured source data behind the above. |

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
