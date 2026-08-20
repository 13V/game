# Status — 2026-08-20

Work stopped at the user's request. Everything produced is committed. This file records
where the work stands and what would come next.

## Where things stand

Three ideation waves were run. Each wave generated concepts across several design lenses,
then put every concept through a hostile review (Solana engineering + game economics +,
depending on the wave, gaming-regulatory or professional-advantage-player perspectives),
then scored them with a three-judge panel.

| Wave | Concepts | Critiqued | Judged | Specs | Status |
| --- | --- | --- | --- | --- | --- |
| 1 — broad, seven lenses | 21 | 21 | partial (7 of 21) | 4 | complete |
| 2 — solo-dev targeted | 12 | 9 of 12 | 12 | 2 of 3 | stopped mid-run |
| 3 — compliance gate removed | 12 | 12 | none | none | stopped after critique |

**Known gaps.** Wave 1's judge panel silently truncated and scored only 7 of 21 concepts,
so its ranking is unreliable and its four build specs went to whichever concepts topped a
partial list. Wave 2 is missing the `pve-and-coop` critique (MILLWRIGHT, BULWARK,
BLIGHTWATER have judge scores but no hostile review) and its third build spec. Wave 3 is
unjudged and unranked.

## Builder profile these were designed for

One developer. Ships Solana programs already — fluent in Anchor, Rust, PDAs, CPIs.
4–8 weeks to a public MVP. No art budget. Strategy/simulation depth. Real money in play.
No token launch; stakes and prizes in SOL/USDC.

Regulatory structuring was dropped as a design constraint and as a ranking criterion partway
through. `research/03-legal-and-economics.md` is retained as reference, not as a gate.
Removing the legal dimension from wave 2's scoring barely moved the order — the top two
concepts are the same either way.

## Wave 2 ranking (mean of three judges, legal dimension removed, out of 70)

| # | Concept | Score | Lens |
| --- | --- | --- | --- |
| 1 | MILLWRIGHT | 40.0 | pve-and-coop |
| 2 | DOCTRINE | 38.0 | wagered-strategy-a |
| 3 | BLIGHTWATER | 37.7 | pve-and-coop |
| 4 | LOCKMAKER | 35.0 | unused-primitives |
| 5 | BULWARK | 34.0 | pve-and-coop |
| 6 | REDOUBT | 31.3 | wagered-strategy-a |
| 7 | Entente | 30.0 | wagered-strategy-b |
| 8 | SOUNDING | 29.3 | unused-primitives |
| 9 | Foundry | 26.0 | wagered-strategy-b |
| 10 | Redoubt | 25.7 | wagered-strategy-b |
| 11 | STRAIN | 24.7 | unused-primitives |
| 12 | SALVO | 22.3 | wagered-strategy-a |

Build specs exist for the top two: `research/09-spec-millwright.md`,
`research/10-spec-doctrine.md`.

No concept broke 40/70. The judges were deliberately harsh, but the pattern across all three
waves is consistent: depth and cold-start resilience are achievable, economic durability past
month six is where nearly everything fails.

## Wave 3 concepts (unjudged)

Generated with asymmetric, consequential randomness available — the mechanism behind poker,
Balatro, XCOM and backgammon, where skill *is* variance management. Wave 2's compliance gate
had forced symmetric deterministic seeds, which the design panel considered sterilising.

- `variance-strategy` — ASSAY, TAPE, ATTRITION
- `house-and-oracle` — DELVE, NINE FRONTS, SEAM
- `persistent-stakes-world` — MARCHLAND, TENURE, ASSAY
- `market-native-sim` — SALTLINE, ASSAY, MYCELIA

Three of the four generators independently converged on a concept they each named **ASSAY**
— pay-per-sample exploration of a hidden field, where the information you buy is the asset.
The three variants differ substantially; the convergence is worth a look.

## What would come next

1. Judge wave 3 and rank it against wave 2 on a common rubric.
2. Fill the wave-2 gaps: the missing `pve-and-coop` critique and the third build spec.
3. Re-judge wave 1's full 21 concepts, since its ranking was built on a truncated list.
4. Pick one concept and write the program.

Workflow scripts are re-runnable from
`~/.claude/projects/-home-user-game/*/workflows/scripts/`.
