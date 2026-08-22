# Status — 2026-08-22

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

## Open items on the winner

`research/12-spec-review-notes.md` reconciles the backfilled PvE critiques against the build
specs. One finding against MILLWRIGHT survives that reconciliation and should be fixed before
build: verbatim blueprint copying cannot displace rank 1 (earliest-slot tie-break) but **can**
displace ranks 2 and 3, who are also paid from the purse. Fix is a canonicalized blueprint hash
per contract, rejected or unranked on an exact match from a different wallet, on the HAND ladder
only — one account lookup and a hash compare. The OPEN ladder deliberately welcomes copied and
solver-authored solutions and should be left alone.

## Direction

**STEADING is the concept being built** — the user chose the voxel town direction (competitive
economy sim, new game, 4–6 month scope accepted) with a tiny-world diorama art style and a
medieval kingdom theme. MILLWRIGHT remains the top-ranked concept from the bake-off and its
core is implemented; it is paused, not discarded.

## Code

`crates/st-sim` — STEADING month 1 of the six-month plan: the deterministic season simulator,
headless, per the spec's build order (sim first, ugly 2D client month 2, voxel renderer only in
month 3). Valley generation from a 32-byte seed (integer value noise, contrast-stretched),
the 600-byte ordered plan, the five-step day loop, market-distance BFS over roads, famine,
growth, and the three scoring axes. **19 tests passing**, including acceptance tests pinning
the spec's worked example bit-for-bit: the pantry lesson (same three buildings — sawmill-first
is extinct on day 8, field-first thrives for 240 days) and the reference town at
EXPORTS 69 / EFFICIENCY 181 / FOOTPRINT 30.

Two spec bugs were found and fixed by building it:

- **v1.0's scaling rule made the game unbootstrappable.** A building with no road to a market
  produced nothing, but the market costs 20 wood + 20 stone against starting stores of
  20 wood + 10 stone — industry could never produce the materials for the market that would
  let it produce. Now: food is exempt (eaten at home), everything else runs at a 25% floor.
- **Floor division starved the floor.** A two-villager quarry at 25% made `2×5/20 = 0` stone
  forever. The scaling rounds up: any staffed producer with any resource makes at least one
  unit a day.

The crown's ledger (spec v1.2) is implemented on top: coin, wages, taxes every tenth day,
unrest with fed-decade forgiveness, emigration at open revolt, festivals, and decrees riding
in the same 600-byte plan — `(x,y)` reused as the effective day, so a plan is a reign:
placements plus fiscal policy over time. 27 st-sim tests. Balance discovery already banked:
without forgiveness, rate 2 was extinction on day 137 rather than a price.

Persistence assumption, per the user's "same floating island" direction: within a season the
island is yours; across seasons the land re-rolls (anti-speculation and fair-start both need
it) but the dynasty persists — house, heraldry, guild rank, chronicle. If truly persistent
cross-season land is wanted instead, the incumbent-snowball problem needs its own design pass.

Next per the build plan: month 2's deliberately ugly 2D debug client, and the month-2 kill
question — does the dev want to play a 31st season?

`crates/mw-vm` — the MILLWRIGHT deterministic simulation core, the piece the Anchor program
and the WASM client both depend on and the piece that must be bit-identical across SBF, WASM
and native. No dependencies, `no_std`, no floats, no hash maps, `forbid(unsafe_code)`.
**28 tests passing**, including an exact reproduction of the spec's worked example
(drain order, and CYCLES 50 / FOOTPRINT 10 / COST 21).

Not yet written: `mw-program` (Anchor) and `mw-wasm`. Neither the Solana CLI nor Anchor is
installed in this environment.

Two things surfaced while building it, both recorded in code:

- **A sink now stops accepting once the contract is fulfilled.** With two sinks on a board both
  could accept within one tick, pushing `produced` past `spec_qty` — an order of ten delivering
  eleven. The spec's halt condition is `produced == spec_qty`.
- **Fixtures must sit on a grid edge.** The wire format is `(kind, x, y, param)` with no rotation
  byte and `param` spent on item type and period, so a sink's inward direction is derived from
  its position. Interior fixtures would need two more bits. This constrains contract generation
  and is documented in `contract.rs`.

## STEADING — added outside the ranked set

`research/14-spec-steading.md`. A competitive voxel town-economy sim: identical valley for
everyone, 240 simulated days, 150 building placements submitted as a 600-byte ordered plan that
the chain re-simulates. Scored on EXPORTS / EFFICIENCY / FOOTPRINT with the same divisions-and-
frontier pot as MILLWRIGHT.

It did not come from the 45-concept bake-off and has not been through the judge panel, so it
carries less evidence than the other three specs. Two things about it are worth keeping in view:

- **Town and land games have the worst survival record in the research**, and the cause is
  specific: selling land creates a creditor class that must be paid in appreciation forever.
  The spec's §0 removes the failure mode by never selling land and resetting seasons weekly.
- **It is a thinner business than MILLWRIGHT** — roughly $1k/month at 2,000 weekly actives
  against MILLWRIGHT's $5k, because there is no Pass and no module market. Six months of build
  for one-fifth the revenue. What it buys is the only acquisition channel in the whole research
  file that does not require saying "crypto": timelapses people want to post.

The build plan front-loads the risk deliberately — the deterministic sim in month 1, an
intentionally ugly 2D client in month 2 to answer *is the economy fun*, and the voxel renderer
only in month 3. The month-2 kill criterion is the cheapest exit in the plan and the one most
likely to be rationalised away.

## The playable build

`web/` holds a fully playable single-file browser build, published as an artifact. It has been
through two player-feedback pivots, both in the direction of simplicity:

1. **Plan-then-watch → live city-builder.** The original client mirrored the on-chain shape
   (author a 150-placement plan, run the 240-day season, read the results). Feedback: confusing.
   Rebuilt as a live game — time flows a day per second, you click to build, and the town answers.
2. **Consensus rules → SimpleSim.** Still confusing: too many resources (coin, wood, stone, ore,
   goods, food, exports) and too much hidden math (adjacency scaling, market distance, tithe
   forgiveness). Feedback, verbatim: *"should have basic supplies, supplies are used to build
   buildings, they make money, more house more populations more workers more tax, not enough
   farms they starve."* The browser game now runs exactly that ruleset — `SimpleSim` in
   `web/game.js`: four supplies (food/wood/stone/gold), five buildings (farm/house/sawmill/
   quarry/market), tax every 10th day, happiness in one meter, gold swaps to groats. The whole
   rulebook fits in `web/README.md` in one table and one paragraph.

3. **Flat sprites → voxel volumes.** The user supplied a reference image for the building art —
   chunky isometric voxel diorama: timber-framed houses with exposed dark beams and stepped
   thatch roofs, raised farm beds planted with standing crop voxels, cube-canopy trees. The
   renderer's buildings had been two quads and a roof polygon. They are now composed from real
   isometric cuboids on one shared voxel grid (`vpt`/`vbox`/`vhouse` in `web/game.js`), so they
   carry volume and hold up at every zoom. `#sprites` raises one of each building side by side
   for art review.

4. **Three edges of the screen → one reading order.** The rules were simple but the screen was not:
   supplies lived in the right rail, prices in the left rail as letter codes (`12w 10s 6g`), time
   along the bottom, and the effect of a building only in a hover tooltip — so playing meant
   scanning three edges and decoding. The interface now answers one question in each fixed place.
   A **status bar** carries all five supplies with today's *rate* beside each, so `FOOD 30 −4/day`
   in red states the famine rule before it lands. `advice()` in the right rail names the single most
   urgent problem in a sentence and what to do about it — including the one rule that previously
   had no visible sign at all, that a building nobody can staff produces nothing. The left rail
   shows one goal at a time with a progress bar. Build cards carry effect and price inline in the
   same icons as the status bar, red on whatever you are short of. A first-run card states the aim
   in four steps. **Quick start** was also founding a hamlet that starved — one farm feeds exactly
   four folk — so it now founds two farms and a sawmill and leaves the house as the player's move.

5. **Numbers going up → a reward loop.** The rules were legible and the screen was legible, but
   nothing *paid*: goals ticked off in grey, groats came only from a manual 50-gold swap, and a
   good day looked exactly like a bad one. Every goal is now a quest that pays ⟡ groats, the
   settlement climbs a visible rank (Camp → Hamlet → Village → Town → City → Kingdom, worth
   10 → 120 ⟡, taken from peak population so a famine cannot demote you), and past the written
   ladder the quests generate themselves every ten folk so the chase never ends. The town shows
   its work: each staffed building lifts its yield off its own roof daily, tax day throws gold
   over the town, and a banner names every reward. A fallen kingdom keeps what it earned and the
   end screen says so. Two charters were added at 140 and 260 ⟡ to give the groats somewhere to
   go worth saving for.

6. **A world with an hour in it.** The island was lit by one fixed midday. It now runs a sky clock
   of its own — five minutes of daylight, five minutes of night, decoupled from the speed control
   entirely, because a simulated day is one second at 1x and a sunrise at that pace is a strobe.
   A gold voxel sun and a cratered pale voxel moon take half the arc each, riding a shallow high
   path over a band of `SKY_ROOM` added above the island for them to hang in. Drawing them
   correctly needed one piece of arithmetic worth keeping: a box N tiles wide is not a cube at N
   units of z, because a tile spans 22px across and a height unit is 6px tall — `ZC = TH / HZ`
   is the conversion, and without it a sky body is a squashed slab. Night is a single multiply pass over the finished frame, so
   sky and island change hour together; only the things that make their own light are painted
   after it. Every building lights up when it gets dark — warm windows either side of the door, a
   lantern on a post at the corner of a farm, a brazier on the quarry cut, and a pool of lamplight
   under each. The buildable-ground overlay moved to the lit side of the pass, since it is the one
   overlay you build by.

7. **A sky, and more to build in it.** The stage was parchment behind a parchment UI, which is
   why the sun read as a wash rather than a sun; it now has a real sky — blue overhead, warm down
   where the island floats, with an additive band at dawn and dusk for the fire that a multiply
   pass cannot produce — plus three drifting voxel clouds that cross once per cycle. The sun is a
   plain orange cube with a tight corona. On the content side: a **mine** finally gives the
   gold-flecked ore terrain a use (+4 gold a day, ore adjacency only), a **chapel** lifts the mood
   every four days, and a **festival** button spends 20 gold for 3 happiness once every 10 days —
   between them, a harsh tax becomes a strategy instead of a slow loss. Five more quests, two more
   charters at 200 and 420 groats, and the ladder now runs to 26 folk and 300 gold.

8. **The dead end, and the missing tension.** Modelling a competent player over 480 days turned up
   the worst bug the build has carried: a run could reach 1 wood, 487 gold and 1,037 food and be
   **permanently unable to place another building**, with nothing on screen saying so. Gold could
   only ever become groats and wood could only ever come from a sawmill, so spending your last
   wood on farms ended the game silently. A merchant now sells wood and stone for gold — priced
   below a sawmill so it rescues rather than replaces, and giving gold a second job that makes
   spending it a genuine choice against saving for groats. The same model showed the other half of
   the problem: food climbed forever and a surplus bought nothing, so there was no reason to keep
   playing after the first week. A year is now four seasons and **winter halves what farms grow**,
   which turns the surplus into the thing that carries a town through thirty lean days; the island
   goes under snow for the duration and the advice warns twelve days out with the number you need.
   Each year's end pays groats and is celebrated, giving a run a shape. `build.mjs` now fails on
   duplicate top-level names between the two inlined files — a colour helper called `mix` collided
   with one in `sim.js` and shipped a blank page, which `verify.mjs` structurally cannot catch.

The JS port of the consensus `st-sim` rules stays in `web/sim.js`, still proven equivalent by
`web/verify.mjs` (replays every pinned Rust vector, including byte-for-byte terrain
distributions for eight seeds) — the browser game uses its valley generator, while the full
rules remain the reference for the on-chain season game. The groat-to-token swap is framed
in-game as the next milestone, not faked — artifact pages have no network egress, so a live
on-chain swap cannot run there; it belongs to the Anchor program milestone.

## What would come next

1. `mw-program`: the Anchor program — `verify_run`, `open_contract`, `Score` PDAs. Needs the
   Solana toolchain installed.
2. `mw-wasm`: the wasm-bindgen wrapper, so the client simulates locally against the same VM.
3. A differential test asserting the WASM and native builds agree bit-for-bit on a corpus of
   blueprints — the property the whole architecture rests on and the one thing not yet tested.
4. Optional: the three ASSAY variants converged independently from different lenses and are
   worth reconciling into one design before discarding them.

Build specs live at `research/09-spec-millwright.md` and `research/10-spec-doctrine.md`.
