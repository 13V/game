# Backfilled PvE critiques vs. the MILLWRIGHT build spec

The `pve-and-coop` hostile review (MILLWRIGHT, BULWARK, BLIGHTWATER) was written last, after
the original run was stopped. It was pointed at the **raw concepts** in `wave2-ideas.json`, not
at `09-spec-millwright.md`, which was written later by a technical-director pass that had
already tightened much of the design. Where the two disagree, the spec is usually the newer and
better-specified artifact. This note reconciles them.

All three concepts came back **buildable-with-caveats**, at 5–6 solo-dev weeks.

## MILLWRIGHT — the winner, and the one finding that survives

**The review's central claim.** Every verified run is a public frame-by-frame replay, so the #1
blueprint is directly recoverable by watching it. With no duplicate-submission check, the
metagame collapses to: decode the top replay, resubmit it under your own wallet, claim the same
score.

**What the spec already answers (§4, "Copy-forward").** Blueprints are public instruction
arguments and verbatim resubmission is explicitly anticipated. Scores are per-player bests
rather than a single-winner prize; ties break to the **earliest verified slot**; and the program
refuses to overwrite an equal score. A copied run is therefore *strictly non-improving* — it can
never outrank the original.

**The residual gap.** The spec's defense protects rank 1. It does not protect ranks 2 and 3. A
copier who ties the top score cannot displace the original, but *can* displace the genuine
second- and third-place finishers, who are the other people the purse pays. The review's fix is
correctly targeted and cheap: store a canonicalized blueprint hash per contract and reject or
unrank an exact/near-exact match from a different wallet — on the **HAND** ladder only, leaving
**OPEN** (where solver output and copying are explicitly welcome) untouched. One account lookup
and a hash compare.

**Scale check.** The review's extraction estimate (a 1.0/0.6/0.4 SOL purse, ≈$80/$48/$32) is
drawn from the raw concept. The spec's purse is a fixed **0.75 SOL/week total, split nine ways**
across three axes and two ladders — a top prize near **$12**, which does not turn on at all until
weekly actives exceed 150. The spec also notes multi-accounting extracts exactly zero, since
there is no per-account payout and each extra account costs 0.00217 SOL in rent. So the
displacement bug is worth fixing for fairness and for the social health of the HAND ladder, not
because meaningful money is at risk.

**On solver bots.** The review treats a SAT/ILP or RL solver clearing a week's contract before
humans finish a first working solution as an extraction threat. The spec treats it as content
and routes it to a separate ladder by design. The spec's position is the stronger one — this is
the Zachtronics/gas-golfing lineage, where solver play has coexisted with human play for a
decade.

## BULWARK

**Degenerate strategy.** The swarm's 20-state FSM is published and fully auditable — a
deliberate fairness feature — so any station willing to build an offline replica plus its own
memory history turns "devise a counter-strategy against an adapting enemy" into "look up the
state, execute the precomputed order set." The headline mechanic becomes a lookup table.

**Fix.** Have the VRF that already seeds season swarm composition also perturb the FSM's
transition weights per siege *within a published, provable range* (e.g. this state resolves to
branch A with weight 60–80%, drawn and revealed pre-siege). Difficulty still cannot be secretly
softened, so the fairness pillar survives intact, but a static offline table is no longer
sufficient.

**Bots.** The Station Charter mint — fixed $40, capped at 2,000, no per-wallet limit, no auction
or gradual release — is textbook mint-sniping bait, the single best-documented extraction
pattern in crypto gaming. Needs a per-wallet cap or a gradual release before launch.

## BLIGHTWATER

**Degenerate strategy.** The blight function `B(t+1) = B(t) + k·max(0, E(t) − R)` is public with
published parameters, so the maximum sustainable aggregate extraction rate is a one-time
arithmetic problem, not an ongoing decision. A cartel that solves it once at season start and
locks pact caps has nothing left to decide for seven weeks; the stated "4–8 minutes twice a day"
degrades into a check-the-box loop.

**Bond too small.** With ticks only 3/day and no penalty for declining to join a pact, the
~$20 bond cap does not deter a late-season defector who can launder reputation with a fresh $4
charter next season.

**Fix.** Move the deterrent from the bond to the reputation ledger, and tie the flag to the
**funding wallet's charter-purchase history** rather than the disposable per-season colony PDA.
That closes the "$4 buys a clean identity" laundering path without touching the bond.

**Unbudgeted cost.** Automatic on-chain slashing needs a per-tick, per-pact compliance crank
that the concept's cost model omits entirely.

## Prior art checked

Primodium, Optimizor Club and the gas-golfing scene, Dark Forest, MagicBlock Colony, and
existing dominant-assurance-contract implementations.
