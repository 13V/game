# Status — 2026-08-21

## Where things stand

Three ideation waves were run, then all 45 concepts were re-scored together on one common
rubric. **`research/11-unified-ranking.md` is the current source of truth** — it supersedes
the per-wave rankings.

| Wave | Concepts | Critiqued | In unified ranking | Specs |
| --- | --- | --- | --- | --- |
| 1 — broad, seven lenses | 21 | 21 | yes | 4 |
| 2 — solo-dev targeted | 12 | 12 | yes | 2 of top 3 |
| 3 — compliance gate removed | 12 | 12 | yes | none |

The earlier gaps are closed: wave 1's ranking had been built on a truncated judge list covering
only 7 of 21 concepts, and wave 3 had never been judged. Three judges — a strategy gamer, a solo
indie shipper, and a professional advantage player — each scored all 45 and self-verified
coverage. Legal exposure is excluded from the rubric.

## The result

**MILLWRIGHT wins at 52.3/80, and all three judges independently named it their `wouldBuild`
pick or close to it** (two named it outright; the third named DOCTRINE, which ranks 3rd).

| # | Concept | Wave | Total | Why |
| --- | --- | --- | --- | --- |
| 1 | MILLWRIGHT | 2 | 52.3 | Zachtronics-lineage optimization puzzle with a leaderboard nobody can fake. Complete game at one concurrent player. |
| 2 | LOCKMAKER | 2 | 50.0 | TIS-100 as a marketplace, with enforced ancestry royalties. |
| 3 | DOCTRINE | 2 | 48.7 | Daily rule-authoring wargame against a hidden field that re-forms every 24h, so the metagame cannot converge. |
| 4 | Entente | 2 | 47.0 | Diplomacy with a forfeit bond, fixing the genre's abandonment problem. |
| 5 | STRAIN | 2 | 47.0 | Weekly verifiable environment roll drives a breeding meta. |
| 6 | ASSAY (market-native-sim) | 3 | 46.7 | Best skill/variance ratio in the set, but 1.7/10 on economic durability. |

Wave means: **wave 2 = 46.2**, wave 3 = 36.6, wave 1 = 34.0. Wave 2 takes 11 of the top 16
places and every wave-1 concept ranks 17th or lower. Targeting the brief at the actual builder
constraints mattered far more than the design lens did.

## Builder profile these were designed for

One developer. Ships Solana programs already — fluent in Anchor, Rust, PDAs, CPIs.
4–8 weeks to a public MVP. No art budget. Strategy/simulation depth. Real money in play.
No token launch; stakes and prizes in SOL/USDC.

Regulatory structuring was dropped as a design constraint and as a ranking criterion.
`research/03-legal-and-economics.md` is retained as reference, not as a gate.

## What the judges agreed on

- **Asynchronous submission is the dividing line.** Every concept that survives scrutiny lets a
  player's turn be a file, a doctrine, or a standing order — not a body in a chair at the same
  moment as seven strangers. The concepts needing 16–60 simultaneous humans in week one are the
  ones a solo dev will never launch.
- **Stated MVP timelines are 2–4x optimistic**, consistently, by the critics' own estimates.
- **Depth and on-chain necessity are rarely the same axis.** The concepts with genuine
  strip-the-money-out depth mostly don't need a chain for the interesting part; the ones where
  the on-chain mechanic *is* the idea are the most original and collapse fastest under arithmetic.
- **Many "strategy" concepts are gambling primitives in strategy vocabulary** — crash games,
  Mines clones, DFS wrappers — and several run a 3–8% house edge against incumbents already
  running 1%.

## What would come next

1. Build spec for LOCKMAKER (rank 2) — MILLWRIGHT and DOCTRINE already have one.
2. Pick one concept and write the program.
3. Optional: the three ASSAY variants converged independently from different lenses and are
   worth reconciling into one design before discarding them.

Build specs live at `research/09-spec-millwright.md` and `research/10-spec-doctrine.md`.
