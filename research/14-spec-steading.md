# STEADING — Build Spec v1.1

**A competitive voxel kingdom-economy sim in the tiny-world diorama style.** Everyone gets the identical valley — a miniature medieval world floating on its slab of earth. You have 240 simulated days to raise the best-run holding in it. Six months, one developer.

v1.1 syncs this document to the implemented `st-sim` crate: the palette takes its medieval names, the production-scaling rule is amended (the v1.0 rule made the game unbootstrappable — see §2.4), and §2.6's worked example now carries the exact numbers the acceptance tests pin.

---

## 0. What this is, and the trap it is built to avoid

Town and land games have the **worst survival record in crypto gaming**, and the cause is specific rather than diffuse. Ember Sword took **$200M+ in land-sale pledges** and shut in May 2025 citing lack of funding — it sold $200M of land for a game that did not exist. Mini Royale: Nations was one of the most-played Solana games of 2022–23, and its post-mortem is one sentence: *when the land trade stopped, so did the reason to log in.* Failure pattern #3 in `02-what-died-what-survived.md`, ranked by kill count: *"Selling assets before shipping a game. Selling to speculators creates a creditor class that must be paid in appreciation forever, which is a permanent tax on every future design decision."*

**The killer is selling the land, not building the town.** Every one of those deaths runs through a land sale, not through a city-builder loop. So:

> **No land is ever sold. No plot, parcel, deed, or tile is ever a tradable asset. There is no persistent world to speculate on.** Seasons reset. The valley is regenerated from a new seed every week and the old one is archived read-only.

That single constraint removes the entire documented failure mode, and everything below is designed around its consequence: if there is no land to sell, the money has to come from somewhere else. It comes from entries into a prize pool, exactly as in `09-spec-millwright.md` §7.

**What this is not.** It is not a cozy builder. Townscaper and Banished are wonderful *because* nothing is at stake, and bolting a prize pool onto that feeling would ruin it. STEADING is a competitive optimisation game that happens to be beautiful. A player who wants a home should be told to play something else, on the front page, in those words.

---

## 1. Tightened design

| Parameter | v1 value | Note |
|---|---|---|
| Valley | 64 × 64 tiles, height 0–15 | generated from a 32-byte seed, never stored |
| Season | Mon 16:00 UTC → Mon 16:00 UTC | archived valleys stay playable forever, never pay |
| Simulated horizon | **240 days** | one sim day ≈ 0.4 s at default playback |
| Placement cap | **150 buildings** | `150 × 240 = 36,000 building-days ≈ 720k CU` |
| Building-day budget | **36,000** | this *is* the CU budget, exposed as a game rule |
| Plan wire format | **600 bytes** — 150 × `(x, y, kind, param)` | fits the live 1,232-byte tx limit |
| Building palette | 8 (cottage, field, sawmill, quarry, mine, smithy, road, market) | v2 adds bridge, granary, chapel, harbour |
| Player count | 1 | you play the valley; n=1 is a complete experience |
| Entry | **free to play, always.** Optional 0.025 SOL (~$2) opts into the pot | free entrants rank normally, are simply not paid |
| Pot | 85% of paid entries; 55% divisions / 45% frontier | identical structure to MILLWRIGHT §7 |
| Divisions | 3, by trailing rating. Unrated wallets resolve to D1 | quarantines solvers without detecting them |
| Starting stores | 6 villagers, 20 wood, 10 stone, **15 food** | 2.5 days of meals — lean on purpose, see §2.6 |
| First working town | 30–50 min | |
| Iteration | 15–25 min per revision, 6–12 submissions per season | |
| Session | 45–70 min; ~3 h/week | |

Three independent ladders — **EXPORTS**, **EFFICIENCY**, **FOOTPRINT** — plus the Pareto frontier. No single winner. Ties break to the earliest verified slot.

---

## 2. Rules of play

### 2.1 The valley

64 × 64 tiles. Each tile has a **height** (0–15) and a **type**: `GRASS`, `FOREST`, `ROCK`, `ORE`, `WATER`. Both are derived from the season seed by a pure integer function that runs identically on chain and in the client — value noise with a fixed permutation table, no floats, thresholded into types. The valley is never stored in an account and never transmitted; it *is* the seed.

**Height is a simulation input, not decoration.** This is what earns the third dimension:

- A building may be placed only where its tile and all four orthogonal neighbours are within **±1 height**. Flat land is a genuinely scarce resource, and the valley generator is tuned so it is.
- `ROAD` may climb ±1 per tile. A road cannot cross `WATER` without a bridge (v2), so rivers are real barriers that split the valley into regions.
- `WATER` is unbuildable.

If you strip height out and the game still plays the same, you have paid for a 3D renderer to draw a 2D game. Here you cannot: the flat-land constraint is the primary spatial pressure, and terracing your town across a slope is the skill the whole thing is named for.

### 2.2 The plan is a list, and its order does three jobs

A submission is an ordered list of at most 150 placements, `(x, y, kind, param)`, 4 bytes each. **List order is load-bearing three times over**, which is why the format is this compact and why it is the only thing a player submits:

1. **Build order.** Buildings are constructed one at a time, in list order, as resources allow. What you build first is the single largest strategic decision in the game.
2. **Staffing priority.** Population is allocated to buildings in list order each day. When you have 40 citizens and demand for 60, the buildings earlier in your list are staffed and the later ones idle.
3. **Construction queue.** A building whose cost cannot yet be paid blocks the queue rather than being skipped. Ordering a 40-wood market before your lumber camp stalls the whole town, and that is a real and instructive mistake.

One field, three jobs, 600 bytes.

### 2.3 Buildings

| # | Building | Cost | Staff | Per day |
|---|---|---|---|---|
| 0 | **COTTAGE** | 4 wood | — | +4 housing |
| 1 | **FIELD** | 2 wood | ≤4 | `min(staff, adjacent GRASS) × 2` food — **never market-scaled**; food is eaten at home |
| 2 | **SAWMILL** | 3 wood | ≤4 | `min(staff, adjacent FOREST)` wood, market-scaled |
| 3 | **QUARRY** | 5 wood | ≤4 | `min(staff, adjacent ROCK)` stone, market-scaled |
| 4 | **MINE** | 8 wood, 4 stone | ≤4 | `min(staff, adjacent ORE)` ore, market-scaled |
| 5 | **SMITHY** | 6 wood, 6 stone | ≤4 | wood + ore → goods, market-scaled; consumes exactly what the scaled output needs, so a distant smithy is slow, not wasteful |
| 6 | **ROAD** | 1 stone | — | connectivity only; the one piece with no flatness rule — roads climb ±1 per tile |
| 7 | **MARKET** | 20 wood, 20 stone | ≤4 | exports up to `staff × 2` goods → EXPORTS |

"Adjacent" means the 8 surrounding tiles, counting only tiles with no *built* structure on them. A field ringed by grass is worth four times one wedged against a cliff — and a road laid over grass stops feeding the field beside it, which is a real trade the road-builder makes.

### 2.4 The day

Each simulated day, in this exact order:

1. **Construct.** The *first unbuilt entry* in the plan, if its cost is affordable and at least one villager lives — one building per day, maximum. An unaffordable entry **blocks the queue** rather than being skipped: ordering the market before the quarry that pays for it stalls the whole town, and the acceptance suite pins a town that goes extinct having built nothing at all for exactly this mistake.
2. **Allocate labour.** Built buildings claim up to 4 villagers each, in plan order, until villagers run out.
3. **Produce**, in plan order, warehouse updating as the walk goes — a smithy listed after the sawmill uses today's wood. Non-food output is scaled by road distance to the nearest market: `output × max(5, 20 − dist) / 20`, **rounded up**.
4. **Consume.** One food per villager. The shortfall starves, one villager per missing meal, and the day is marked famine.
5. **Grow.** Food ≥ 10 after meals and a free bed → +1 villager.

**Two amendments over v1.0, both forced by arithmetic:**

- *v1.0 said a building with no road to a market produces nothing.* That made the game unbootstrappable: the market costs 20 wood + 20 stone against starting stores of 20 wood + 10 stone, so the sawmill and quarry could never produce the materials for the market that would let them produce. Disconnected production now runs at a **25% floor** — limping, not dead — and **food is exempt entirely**, because it is eaten at home, not sold.
- *The scaling rounds up, not down.* With floor division a two-villager quarry at the 25% floor makes `2 × 5 / 20 = 0` stone forever. Ceiling division guarantees any staffed producer with any resource makes at least one unit a day.

**Failure is famine, and it is visible.** A town that outgrows its fields collapses in a way you can watch and rewind to — the client paints famine days red. It is a design error surfaced legibly, the same role deadlock plays in MILLWRIGHT.

### 2.5 Score

- **EXPORTS** — total goods delivered to markets over 240 days.
- **EFFICIENCY** — `EXPORTS × 100 / peak_population`. Rewards a lean town.
- **FOOTPRINT** — tiles occupied by any building, roads included.

These are in genuine tension, which is the whole game. Maximising EXPORTS wants sprawl: every ore vein mined, every citizen housed and working. Maximising EFFICIENCY wants a small elite town sitting on the richest tiles. Maximising FOOTPRINT wants density, which means terracing onto awkward ground and paying in road distance. **No town wins all three, and sole occupancy of a corner is the brag.**

### 2.6 Worked example — the pantry lesson

Pinned bit-for-bit by `st-sim/tests/worked_example.rs`. The valley is a grass shelf at height 3 with a forest stand ringing (12,8) and a rock face further east. Starting stores: 6 villagers, 20 wood, 10 stone, 15 food — two and a half days of meals.

**Plan A — the mistake.** `SAWMILL(12,8), FIELD(14,9), COTTAGE(13,10)`.

| Day | What happens |
|---|---|
| 1 | Sawmill built. All 4 available villagers walk into it. Disconnected, it cuts **1 wood/day** at the 25% floor. Pantry 15 → 9. |
| 2 | Field built — but the sawmill is *earlier in the list*, so it keeps its 4 workers and the field gets the remaining 2: **4 food/day against 6 eaten**. |
| 3 | Cottage built. Nobody can afford to live in it. |
| 6 | Pantry empty. The first villager starves. |
| 7 | 5 villagers left. Staffing walks the list: sawmill takes 4, **the field gets 1**. Two food against five mouths — three starve. |
| 8 | Two villagers left, both in the sawmill, none in the field. Nothing to eat. **The hamlet is extinct on day 8**, 3 famine days, having built all three buildings. |

The death spiral is the staffing rule itself: as villagers die, the sawmill — first in the list — keeps its workers and the field loses its last farmhand. **List order is who eats.**

**Plan B — the same three buildings, fed first.** `FIELD(14,9), COTTAGE(13,10), SAWMILL(12,8)`.

Day 1 the field takes all four villagers: 8 food against 6 eaten. Day 2 the cottage raises the housing cap to 10; the surplus pantry starts growing the town by a villager a day. Day 3 the sawmill is built and staffs from the *growth*. Population peaks at 10, overshoots what one field feeds, loses two villagers across two famine days, and settles at **8 villagers, stable for the rest of the season**. Completed, 240 days.

Same three buildings. Order alone is extinction on day 8 versus a thriving hamlet — that is the whole §2.2 argument played out in one comparison, and it is the client's first tutorial.

**Then the depth arrives.** The reference town in the same test file — 6 fields, 8 cottages, sawmill, quarry, roads, a market, a mine, a smithy, 30 placements — completes the season at **EXPORTS 69 / EFFICIENCY 181 / FOOTPRINT 30**, peak population 38. Those numbers are deliberately mediocre: the roads route past the quarry and cost it a rock face, the smithy sits at distance 4, and the mine at distance 8 loses 40% of its output to the road. Every one of those is a placement decision a better player beats.

---

## 3. Why it stays interesting

**What a strong player knows that a weak one does not**, in the order they learn it:

1. **Distance scaling dominates everything.** New players optimise adjacency; strong players optimise market placement first and let adjacency fall where it may.
2. **The build order is the strategy, and it is front-loaded.** The first ten entries decide the season. Everything after day 150 is marginal because there are only 240 days.
3. **Population is a cost, not a resource.** The instinct is to grow. The correct play on most valleys is to stop growing early and staff a smaller town perfectly, which is also how you win EFFICIENCY.
4. **Terrain reading.** Judging from a valley's height map where the one good market site is, before placing a single building, is the highest skill in the game and the hardest to automate.

**The metagame cannot converge**, because the valley generator flips between regimes by seed parameter: a fragmented valley split by rivers rewards multiple small clusters and punishes a central market, while an open plain inverts it. A player who has memorised one build order loses on the other.

---

## 4. Determinism and the wire format

Same discipline as `mw-vm`, and for the same reason: the sim is compiled to SBF, WASM and native, and all three must agree bit-for-bit or the score is a claim rather than a fact.

- Integer only. No floats anywhere, including the valley generator.
- No hash maps, no iteration over unordered collections. Every loop runs an index range or a plan-order walk.
- Distance scaling uses integer floor division, specified once and never "improved".
- BFS over roads uses a fixed-capacity queue walked in ascending tile index.
- `no_std`, no allocation, `forbid(unsafe_code)`, overflow checks on in release.

**No randomness, ever.** Not weather, not disasters, not variance in yields. A prize pool funded by entrants only works if every entrant is provably solving the same problem; the moment a random famine exists, a losing entrant has a grievance no leaderboard can answer. This is the same rule MILLWRIGHT §4 states, and it is in `CONTRIBUTING.md` for the same reason.

**Copy-forward** is handled exactly as in MILLWRIGHT §4: the canonical hash of a plan is taken after normalisation — placements beyond the first that target an occupied tile are dropped, unreachable buildings are dropped, and `param` is zeroed for kinds that ignore it. Deduplication runs at ladder derivation and in `settle_pot`, not in `verify_plan`. Plan *order* is preserved by canonicalisation, because reordering is a genuine strategic difference rather than a disguise.

---

## 5. On-chain architecture

Three crates, mirroring the MILLWRIGHT workspace: `st-sim` (deterministic core, zero deps), `st-program` (Anchor), `st-wasm` (wasm-bindgen over the same core).

**`Season`** — seeds `["ss", season_id:u16le]`, 120 B. Written once at open, read-only all week.
```
disc[8] id:u16 author[32] opens_at:i64 closes_at:i64 seed[32]
horizon_days:u16 placement_cap:u8 building_day_cap:u32 bump:u8
```

**`Town`** — seeds `["tw", season_id:u16le, player]`, 216 B, refundable.
```
disc[8] player[32] season_id:u16 submissions:u16 first_slot:u64
division:u8 paid:bool
best_exports:u32  best_exports_slot:u64  best_exports_hash[32]
best_effic:u32    best_effic_slot:u64    best_effic_hash[32]
best_footprint:u16 best_fp_slot:u64      best_fp_hash[32]
bump:u8
```

**`Player`** and **`Pot`** are unchanged from MILLWRIGHT §3.1 — rating, division, free entries; and the per-season prize pot. Reuse the accounts and the `enter_contract` / `settle_pot` instructions verbatim; the payout structure is identical and there is no reason to invent a second one.

| Ix | Signers | Key args | Writable |
|---|---|---|---|
| `open_season` | permissionless after `opens_at` | `seed_preimage[32]`, merkle proof | Config, Season(init) |
| `verify_plan` | player, relay (fee payer) | `plan[≤600]` | Town(init_if_needed), relay shard |
| `enter_season` | player | — | Pot, Player, Treasury shard |
| `settle_pot` | permissionless after `closes_at` | winning Town PDAs (≤33) | Pot, Player[…], winners |

**No global leaderboard account.** Every verified plan emits a `PlanVerified` event carrying the 600-byte plan, the three scores and the slot. Ladders are derived by an indexer. A sorted on-chain leaderboard would be one hot writable account against the 12M CU per-account per-block ceiling, and it buys nothing.

**Account contention.** `Town` PDAs are per-player, so `verify_plan` — the only high-frequency instruction — has no shared writable account at all and therefore sees near-zero priority fees. `Pot` is the one multi-writer account, taking roughly one write per paid entrant per season, spread over a week. Shard it as `["pot", season_id, player[0] & 3]` if entries ever concentrate.

---

## 6. Cost model (SOL = $80)

| | |
|---|---|
| `verify_plan` CU | ~720k sim + ~90k validation and BFS ≈ **810k** of 1.4M |
| Plan transaction | 600 B plan + accounts ≈ 780 B of 1,232 |
| `verify_plan` lamports | 5,000 base + ~8,000 priority ≈ **$0.001**, dev-sponsored |
| `Town` rent | 0.00246 SOL (~$0.20), refundable on close |
| `Season` rent | 0.00173 SOL, dev-paid, refunded after archive |
| Valley storage | **$0** — regenerated from the seed |
| Sponsored gas at 1,000 DAU | ~$1.30/day |
| RPC + indexer + VPS | ~$140/month at 1,000 DAU |

`enter_season` is not sponsored: a player opting into a prize pool can pay their own signature, and requiring it is a cheap sybil tax on the one path where money is at stake.

---

## 7. Client stack — the voxel part

**Framework.** TypeScript, Vite, **WebGPU with a WebGL2 fallback**, no engine. Three.js is tempting and wrong here: the renderer needs exactly one thing — a chunked voxel mesher — and a general scene graph costs more in bundle size and fought abstractions than it saves.

**Art direction: the tiny world.** The valley renders as a **floating diorama** — the 64×64 slab sits in a void with its earth exposed: extruded side walls showing soil over stratified rock, a slight bevel at the rim, a soft shadow beneath. Tiny Glade and Townscaper are the reference points; the feeling is a miniature medieval kingdom on a table, not a landscape you stand inside. What sells the miniature at zero art budget:

- **Warm pastel palette, 16 colours total**, flat vertex colours. Timber-framed cottages read from four colours: plaster, beam, thatch, shadow. The market gets a two-colour striped awning. Water is a flat translucent plane with a lighter rim where it meets land.
- **Baked ambient occlusion in vertex colour** and one warm directional light. AO in the creases is most of what makes voxels read as "miniature" rather than "Minecraft".
- **Static villagers** — two-voxel figures standing at staffed buildings, positions deterministic from the sim state. No rigging, no animation, and the town still reads as alive; a famine day empties the dooryards, which is the state surfacing in the art.
- **Trees are three stacked boxes, boulders are two, ore glints as single bright voxels.** Nothing has a model. Everything is generated in code.
- Camera: orbit at 30–40° elevation with close dolly. Depth-of-field tilt-shift is a v2 post pass; at v1 the miniature feel comes from AO, palette and the diorama rim.

**Rendering.** The valley is 64 × 64 × 16, split into 8 × 8 chunks. Greedy meshing per chunk, remeshed only on the chunks a placement touches. Flat vertex colours, no textures, no UV maps, no normal maps, one directional light and ambient occlusion baked into vertex colour. **No models, no rigging, no animation** — a house is a box with a prism roof, generated in code. This is the entire art budget, and it is why voxel was the right choice: it is the only 3D style where "no artist" is a viable answer rather than an excuse.

**Target: under 1.5 MB total including WASM.**

**The client runs the identical sim.** Place, hit play, watch 240 days run at 60 fps in about 90 seconds, scrub the timeline, see the day famine started painted red, rewind, adjust. Unlimited, instant, offline, free. Submission is only for *scoring* — and this is the same property that makes LOCKMAKER's pricing work: never charge per attempt when the client can verify locally, because you are taxing only the players who have not realised they needn't pay.

**Wallet and funding.** Embedded wallet created silently on first visit, no seed phrase, no connect dialog. Gameplay gas is sponsored, so a new player never sees a balance. Linking a real wallet is required only to receive a payout.

**Link to playing in under 60 s:** a shared link opens on someone's town replaying at 4× while the WASM streams in; the season's valley renders in about 400 ms; one button, **YOUR VALLEY**.

---

## 8. Economy

**No token. Ever. No land sale. Ever.** Prizes in SOL. Read §0 again before proposing either.

Structure is identical to MILLWRIGHT §7 and deliberately not re-derived — with the divisions wearing their guild names: **D1 Guildmaster** (open; solvers land here), **D2 Journeyman**, **D3 Apprentice**. Otherwise: free play always, $2 opts into the season pot, pot is 85% of entries, 55% to three rating divisions paying top three each, 45% split evenly among Pareto-frontier occupants, beating a personal best earns a free entry next season. Roughly **33 paid positions per season instead of 3**, which is what makes it survive month three in a zero-variance game.

| Weekly actives | Paid entrants | Pot | D1 first | Frontier each | Paid |
|---|---|---|---|---|---|
| 250 | 100 | $170 | $16 | $7.65 | ~19 |
| 1,000 | 400 | $680 | $62 | $15.30 | ~29 |
| 2,000 | 800 | $1,360 | $125 | $25.50 | ~33 |

**The honest gap versus MILLWRIGHT: there is no module market here**, and that matters more than it first looks. MILLWRIGHT's best earner is not a prize winner — it is the author of a popular module, at roughly $1,013/month, eight times the top weekly prize. That is its only non-zero-sum earn, and STEADING as specified has no equivalent. The natural candidate is **shared blueprints**: a named, licensable sub-layout — a market-and-road hub, a terraced farm cluster — that other players drop into their valley for a small fee, with the author paid per verified use. It is not in v1 because it is a month of work, but the absence should be treated as a known hole in the economy rather than a feature that was considered and rejected.

**Dev revenue** at 2,000 weekly actives: entry rake ~$240/week ($1,039/month), less ~$140/month infra. Materially thinner than MILLWRIGHT's, because there is no Pass and no module rake. **This is a $1k/month business at 2,000 actives, not a $5k one.** Say that out loud before committing six months.

---

## 9. Cold start

Identical to MILLWRIGHT's, and it works for the same structural reason: **n = 1 is a complete game.** There is no matchmaking, no lobby, no opponent, and no shared mutable state. Eight players and eight thousand play the same way; only the ladder gets shorter.

**T−14 days.** The dev plays seasons S-01 to S-04 alone from a `HOUSE` account, flagged and excluded from every prize, posting 30–40 verified towns. Deliberately mid-quality: a beatable target on every axis. A ladder with 40 entries on day one is not a ghost town.

**T−7 days.** Hand-pick eight people who have publicly posted Factorio, Dwarf Fortress, Timberborn or Zachtronics screenshots in the last year and are findable by name. DM each a replay link and three sentences. **The word "crypto" does not appear**, and the words "web3", "token", "NFT" and "earn" never appear anywhere in the product or its copy, ever.

**Week one.** Every verified town auto-posts to `#valleys` as a 6-second timelapse GIF with its three scores. At 8 players × 6 submissions that is 48 automatic posts — the entire content engine, zero dev effort. A voxel timelapse is *substantially* more shareable than MILLWRIGHT's schematic, and that is the one place where the six-month art investment pays back on acquisition rather than on feel.

---

## 10. Bots

A search over 150 placements on a 64 × 64 valley is astronomically large, but it decomposes — market siting, then regional clusters, then ordering — and a competent beam search with a good evaluation function will beat strong humans within a season or two. Assume it. Do not attempt detection.

Defences are structural and identical to MILLWRIGHT §9: **divisions quarantine solvers** without detecting them, since a solver rates into D1 immediately and cannot reach D2 or D3; **unrated wallets resolve to D1**, so a fresh wallet cannot be pointed at the Apprentice pot; **canonical plan hashes** stop one optimal plan being submitted from twenty wallets to farm the frontier pool.

**The frontier pool is the real defence.** A solver optimises a scalar. Pointed at EXPORTS it produces one sprawling town and occupies one frontier point. It does not produce fifteen distinct trade-offs, and the pool pays exactly the thing a single-objective optimiser is worst at.

**Sponsored-gas farming:** 12 sponsored verifies per wallet per day, then self-pay. The relay refuses any transaction failing local simulation.

---

## 11. Six-month build plan

Ordered so that the riskiest thing is proven first and the prettiest thing last — the opposite of the instinct, and the reason most voxel projects die with a beautiful renderer and no game.

**Month 1 — `st-sim`.** The deterministic core, headless, no graphics whatsoever. Valley generator, plan decoding, construction queue, labour allocation, production with road BFS, consumption, growth, famine, scoring. Full test suite including a worked-example acceptance test in the shape of `mw-vm`'s. *Exit criterion: a CLI that takes a seed and a plan and prints three scores, plus a fuzz corpus of 10,000 random plans that never panics and never overflows.*

**Month 2 — is it fun?** A deliberately ugly 2D top-down canvas debug client. Coloured squares, no voxels, no camera. Place, run, scrub, tweak. **The dev plays it for two weeks.** This is the month where the project dies cheaply if the economy is not interesting, and skipping it to write a renderer first is the single most common way a project like this wastes six months. *Exit criterion: the dev has played 30 seasons and wants to play a 31st.*

**Month 3 — the voxel renderer.** Chunked greedy mesher, orbit camera, raycast picking, placement ghosts, the timelapse recorder. Only now, and only because month 2 said the game underneath was worth looking at.

**Month 4 — the program.** Anchor: `open_season`, `verify_plan`, `enter_season`, `settle_pot`, Player and Pot reused from MILLWRIGHT. LiteSVM suite. **Differential test: 10,000 plans through native, WASM and SBF, asserting bit-identical scores.** Devnet. *Exit criterion: link → verified score on devnet in one session.*

**Month 5 — balance and the landing layer.** Valley generator tuning across regimes, building cost pass, Helius Sender with exact CU limits and categorised failure logging, sharded fee-payer relay, indexer, replay URLs, Discord bot.

**Month 6 — content, polish, launch.** Tutorial valleys, seed tree committed and published, mainnet deploy, then the dev plays for a week and fixes whatever that reveals — which will be the placement ergonomics, every time. Recruit the eight.

**Not in v1:** shared blueprints and the licensing market (§8's known hole), bridges and harbours, seasons longer than 240 days, multi-valley trade, any persistent world, mobile, MagicBlock (turn-based, nothing to host), VRF (no randomness by design).

---

## 12. Kill criteria

| When | Signal | Action |
|---|---|---|
| **End of month 2** | The dev does not want to play a 31st season on the ugly client | **Stop.** Four months and a renderer will not make a boring economy interesting. This is the cheapest exit in the plan and the one most likely to be rationalised away. |
| **End of month 2** | Median first-town survival is not a *legible* failure — players cannot tell why the town died | Redesign the feedback before writing any renderer. An opaque sim is unplayable however pretty. |
| **Week 4 post-launch** | Fewer than 3 of the founding 8 submit in week 4 | **Stop.** Not fun to the exact people it was built for. |
| **Week 8** | Median submissions per active per season < 3 | **Stop or redesign scoring.** The product is the 4th-through-10th iteration. Solve-once-and-leave means it is a puzzle, not an optimisation game. |
| **Week 8** | The same 3 wallets take D1 first in ≥ 6 of 8 seasons **and** D2/D3 opt-in is falling | Divisions are failing. Split to five; if that fails, retire the pot. |
| **Week 12** | Fewer than 40 weekly actives | **Stop building.** Leave it deployed read-only at $12/month. |
| **Any week** | A parity divergence between WASM and SBF reaches production | **P0, read-only immediately.** The value proposition is that the score is not a claim. |
| **Month 9** | < 200 weekly actives **and** < $600/month | Archive, open-source the sim and the program, keep the ladder running. Do not raise to keep going. |

**The risk that kills this is scope, not design.** MILLWRIGHT is four weeks and this is six months for a *thinner* business — roughly $1k/month at 2,000 actives against MILLWRIGHT's $5k, because there is no Pass and no module market. The six months buys one thing: a game people want to look at, and timelapses they want to post. That is a real asset and it is the only acquisition channel in the whole research file that does not require saying "crypto". Whether it is worth 5× the build time and 5× the runway is a decision to make **now**, in advance, and not in month four with a half-finished renderer.
