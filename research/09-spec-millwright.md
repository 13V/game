# MILLWRIGHT — Build Spec v1.0
**Technical director → solo Solana engineer. Execution starts Mon 2026-08-24. Target: public launch Mon 2026-09-21 (4 weeks core), module market Mon 2026-10-05 (weeks 5–6).**

---

## 0. What changed from the concept, and why

The panel's three criticisms were the same criticism: *the chain is a notary bolted to a Zachtronics clone, one dev authoring weekly content forever is the failure mode, and the module layer — the only original part — was deferred to v2 where it depended on a TEE.* Four structural changes fix all three:

1. **Modules are no longer secret, and the TEE is gone.** Sealed internals on a public chain was never real. Instead a module is a **certified compute-compression artifact**: public internals, plus an author-supplied finite transducer table that the program verifies is behaviorally equivalent. In a scored run the module executes from its table at ~4 CU/tick instead of ~800 CU/tick, and **does not consume the contract's component budget**. What you pay for is not secrecy — it is *verified compute*. The scarce resource being traded is the chain's own compute budget. That is not a notary; that is a market that cannot exist off-chain because off-chain there is no metered, adversarially-verified compute budget to compress.
2. **Verification is a single transaction.** Chunked 200-tick simulation across 5 txs with a scratch account was the largest feasibility risk (partial state, 5 landing opportunities to fail, rent churn). One tx, hard-capped at 40,000 component-ticks ≈ 960k CU against the 1,400,000 CU limit. Chunking returns only inside the ER at v2 where it costs nothing.
3. **Contracts are generated, not authored.** A pre-committed seed chain plus a deterministic generator-and-vetting function that runs *on-chain*. The dev authors 200 bytes of parameters, not a puzzle, and after week 4 authors nothing at all. Community contracts run every third week.
4. **Gameplay gas is sponsored by the dev via a sharded fee-payer relay.** $1.15/day at 1,000 DAU. This deletes the First Forge faucet, deletes the "you have 0 SOL" wall from the first session, and makes free entry a code-enforced fact rather than a claim. Also: **no Token-2022, no license NFT, no tradable asset anywhere in the system.** Licensing is pay-per-run. That removes the transfer-hook engineering *and* the entire "money's worth" UK exposure.

5. **The prize pool is funded by entries, and the honour-system ladder is gone.** The original purse was a fixed 0.75 SOL/week paid out of general revenue and deliberately *not* funded by entrants — a structure chosen to keep consideration out of the competitive path. That constraint has been dropped, so the pot is now 85% of paid entries and scales with participation. Two things follow, and neither is optional. The purse stops being a fixed cost, which flips the dev from −$130/mo to +$182/mo at 100 DAU. And the self-declared **HAND/OPEN** split has to go: an unenforced honour system survives a $12 top prize and does not survive a real one. Rating divisions replace it, because a rating is objective and a declaration is not. Full treatment in §7.

---

## 1. Tightened design

| Parameter | v1 value | Note |
|---|---|---|
| Grid | 12 × 12 = 144 cells | v2 ER: 24 × 24 |
| Blueprint | 2 bytes/cell = **288 bytes** | fits the live 1,232-byte tx limit; SIMD-0296 is not live |
| Component palette | 6 (belt, splitter, merger, buffer, gate, stamper) | v2 adds arm, sensor, welder, sorter, clock, latch, crusher, vent |
| Item types | 4 (A, B, C, D) | contract-defined recipes |
| Tick cap | contract-set, 400–800 | |
| Component cap | `floor(40,000 / tick_cap)` → 50 at 800 ticks | this *is* the CU budget, exposed as a game rule |
| Work-unit cap | **40,000 component-ticks** | ≈ 880k CU sim + ~78k overhead |
| Round length | Mon 16:00 UTC → Mon 16:00 UTC | archived ladders stay open forever, never pay prizes |
| Player count | 1 | you play the score; n=1 is a complete experience |
| Entry | **free to play, always.** Optional 0.025 SOL (~$2) opts into the prize pool for one contract | free entrants verify, score and rank normally; they are simply not paid |
| Rake | **entry 15% dev / 85% pot**; module license 10% dev / 90% author; bounty board 5%; Pass 100% | |
| Pass | 0.06 SOL/month (~$4.80) | authoring + archive + diff tool. **Never gates verification or prize eligibility.** |
| Module license | author-set, default 0.002 SOL/verified run | consumed, not accrued |
| Weekly pot | **85% of paid entries.** 55% to division pots, 45% to the frontier pool | scales with participation; costs the dev nothing (see §7) |
| Divisions | 3, by trailing rating percentile. Top 3 of each are paid | replaces HAND/OPEN — see §7.2 |
| First working solve | 20–40 min | |
| Iteration | 10–15 min per revision, 5–9 verified runs per contract | |
| Session | 35–50 min; ~2.5 h/week; Mon/Wed/Sat pattern | |
| Progression | week 1: 1 live contract. Week 12: 1 live + 11 archived ladders + ~60 certified modules | |

Three independent leaderboards (**CYCLES**, **FOOTPRINT**, **COST**) plus the Pareto frontier. No single winner. Entrants are sorted into **three rating divisions** and each division pays its own top three, so a mid-tier player competes against peers rather than against the global best. Ties break to the **earliest verified slot** — this is load-bearing; see §4.

---

## 2. Rules of play

### 2.1 Board

A 12×12 grid, cell index `i = y*12 + x`, origin top-left, directions `0=N, 1=E, 2=S, 3=W`. Cells are EMPTY, OBSTACLE (contract-set, unplaceable), or hold one player-placed component. Contract **fixtures** (SOURCEs and SINKs) sit on cells declared by the contract and are not player-placeable or removable.

Each cell holds **at most one item** except BUFFER (4).

### 2.2 Components

| # | Component | Cost | Behavior |
|---|---|---|---|
| 0 | **BELT** | 1 | Pulls one item from the cell behind it (opposite of facing) if empty. Capacity 1. |
| 1 | **SPLITTER** | 4 | Pulls from behind. Outputs alternate between the cells to its left and right (relative to facing). `param` = starting side. Holds 1 item; only the currently-selected output may pull it. Selection flips after each successful extraction. |
| 2 | **MERGER** | 4 | Pulls from left or right; when both have an item available it alternates, `param` = starting side. Outputs forward. Capacity 1. |
| 3 | **BUFFER** | 6 | FIFO, capacity 4. Pulls from behind whenever not full; the front cell may pull the head. Smooths bursts, costs zero latency when non-empty. |
| 4 | **GATE** | 8 | Data in behind, data out front, **control in from the left**. Closed by default. Every item consumed on the control side grants exactly one pass token (max 15 stored). Downstream may pull only if tokens > 0; a successful pass decrements. `param` = preload tokens (0–15). This is your counter, your synchroniser, and your one-tick delay line. |
| 5 | **STAMPER** | 12 | `param` = recipe id. Pulls its recipe's first input from behind; if the recipe has two inputs, also pulls the second from the left. When all inputs are held, presses for `P` ticks (recipe-defined, 2–8). On completion holds one output item, which the front cell may pull. May begin a new pull on the same tick its output is extracted. |

Rotation is 2 bits, `param` is 1 byte. Cell encoding: `byte0 = kind<<4 | rot<<2 | flags`, `byte1 = param`.

### 2.3 Fixtures

- **SOURCE(type T, period K)** — holds one item of type T. When extracted, it is empty and refills at the start of tick `t + K`.
- **SINK** — pulls from its adjacent inward cell every tick. If the item matches the spec's next required type, `produced++`. If not, `waste++`. Contract fails if `waste > waste_allowance` (normally 0).

### 2.4 The tick

The single most important rule, because it determines whether belts behave sanely.

At **blueprint validation** (once, before tick 1) the program builds the *pull graph* — a directed edge `d ← s` for every component `d` that can pull from cell `s` — and topologically sorts it so that **every consumer is processed before its supplier**. Cycles (belt loops) are broken at the lowest cell index. This fixed sequence is the **drain order**. Sinks are first by construction; sources last.

Each tick:
1. Clear the "extracted this tick" bit on every cell.
2. Walk the drain order. Each component attempts exactly one pull. A pull succeeds iff the destination has capacity, the source cell holds an item whose extracted-bit is clear, the source component permits extraction on that side, and any type/gate condition passes. On success the item moves and the source's extracted-bit is set.
3. Decrement stamper press timers; refill sources whose cooldown elapsed.
4. `tick++`. Halt when `produced == spec_qty` (success), or `tick == tick_cap` (failure — no score), or a full tick passes with zero item movement and zero timer activity (deadlock — failure, reported with the jam tick so the client can highlight it).

Because a consumer is always processed before its supplier, an entire belt chain shifts one tile per tick regardless of orientation. Because pulls are destination-driven and ordered, two consumers competing for one supplier resolve deterministically by drain-order position. **No floats, no hash maps, no iteration-order dependence anywhere.** This is what makes the WASM and SBF builds bit-identical.

### 2.5 Score

- **CYCLES** — tick at which the final required output is accepted.
- **FOOTPRINT** — area of the axis-aligned bounding box of all player-placed components (fixtures excluded).
- **COST** — sum of component prices, plus the certified cost of any module (see §2.7).

### 2.6 Worked example — Contract T-0

**Given:** 12×12, no obstacles. `SOURCE_A` at (0,5), type A, period 3. `SINK` at (11,5). Spec: 10 × C, waste 0. Recipe R1: A → C, press 4. Tick cap 400, component cap 100.

**Player places:** BELT facing E at (1,5)…(5,5); STAMPER param=R1 facing E at (6,5); BELT facing E at (7,5)…(10,5). 10 components. COST = 9×1 + 12 = **21**. FOOTPRINT = bbox x∈[1,10], y∈[5,5] = 10×1 = **10**.

**Drain order:** SINK(11,5), (10,5), (9,5), (8,5), (7,5), STAMPER(6,5), (5,5), (4,5), (3,5), (2,5), (1,5), SOURCE(0,5).

| Tick | Events |
|---|---|
| 1 | Belt (1,5) pulls A₀ from source. Source empty, refills start of tick 4. |
| 2–5 | A₀ walks (2,5)→(5,5), one tile per tick. |
| 4 | Belt (1,5) pulls A₁. |
| 6 | STAMPER pulls A₀ from (5,5). Press occupies ticks 6,7,8,9. |
| 7 | Belt (1,5) pulls A₂ (source refilled at 7). |
| 10 | C₀ is held by the stamper. Belt (7,5) is earlier in drain order → pulls C₀. STAMPER's turn comes after, it is now free, pulls A₁ from (5,5). Press ticks 10–13. |
| 11–13 | C₀ walks to (10,5). |
| 14 | SINK pulls C₀. **produced = 1.** |
| … | Steady state: stamper cycle = 4 ticks (press 4, reload same tick as extraction). Source period 3 is not binding. |
| 50 | 10th C accepted. **CYCLES = 50.** |

**Result: CYCLES 50 / FOOTPRINT 10 / COST 21.** A valid entry on all three ladders.

**Now optimise.** The stamper is the bottleneck at 4 ticks/item; the source is 3. Put a SPLITTER at (5,5) feeding STAMPERs at (5,4) and (5,6), merge their outputs at (7,5). Throughput becomes source-limited at 3 ticks/item: 10th C lands around tick 41. But COST rises to ~44 and FOOTPRINT to ~30. **You have just moved down the CYCLES ladder and up the other two.** That trade is the whole game. The Pareto frontier is the object players actually compete over; sole occupancy of a corner is the brag.

Then the depth arrives: with a spec of *alternating C,D* the bottleneck stops being throughput and becomes **output ordering**, and the correct architecture inverts — two parallel lanes now cost you a GATE pair and a merger phase-lock, while a single fast pipeline with a preloaded gate wins. Contracts flip between these two regimes by generator parameter, so the metagame does not converge.

### 2.7 Modules (weeks 5–6)

A **module** is a W×H rectangle of your own components (max 6×6, ≤ 30 components) with a declared **port contract**: for each port, `(side, offset, direction, item-type filter, max arrival rate)`. Internals are **public**. Value does not come from secrecy.

The author submits, alongside the internals, a **transducer table**: a deterministic automaton over `(internal state class, port-availability vector)` with ≤ 64 states and ≤ 512 bytes, plus a closure certificate. `certify_module` (a) verifies every transition target is present in the table (closure — the table is total over the declared admissible input envelope), and (b) spot-checks 64 transitions drawn deterministically from `sha256(module_key ‖ recent slot hash)` by restoring the claimed internal state and single-stepping the actual internals, asserting the table's prediction. Pass → **CERTIFIED**, with `cost` fixed to the sum of internal prices.

In a scored run, a placed module:
- occupies its W×H rect (counts toward FOOTPRINT),
- adds its certified COST,
- executes at **~4 CU/tick from the table**, not ~660 CU/tick from internals,
- **does not consume the contract's component budget.**

You may always copy the internals for free and place them yourself — but then they eat 30 of your 50 components and 30×tick_cap of your 40,000 work units. **Early contracts do not need modules; hard contracts cannot be solved without them.** That is exactly the demand curve you want: the market becomes load-bearing precisely when the game gets deep, and is correctly worthless in week 1.

Authors post a **0.25 SOL bond**. Anyone who finds a state+input where table ≠ internals submits `challenge_module` with that witness; the program re-simulates, and on a confirmed divergence decertifies the module, pays the challenger 0.15 SOL, and routes the remaining 0.10 SOL to refund the last 30 days of licensees pro rata. Certification is therefore a *bonded, challengeable credential* — the thing a centralised leaderboard cannot issue, because a centralised leaderboard's credential is worth exactly the operator's continued goodwill.

---

## 3. On-chain architecture

Rust 1.83, Anchor 0.31. One workspace, three crates: `mw-vm` (`no_std`-style core, zero deps, no float, no alloc), `mw-program` (Anchor, depends on `mw-vm`), `mw-wasm` (wasm-bindgen wrapper over the same `mw-vm`).

### 3.1 Accounts

Rent uses `(128 + data_len) × 6,960` lamports. SOL at $80.

**`Config`** — seeds `["cfg"]`, 152 B, 0.00195 SOL. Written at init and on parameter change only; **read-only in every hot path.**
```
disc[8] admin[32] relay_root[32] treasury_auth[32] seed_merkle_root[32]
next_seed_index:u16 contract_counter:u16
entry_lamports:u64      // 0.025 SOL, the opt-in price
rake_bps:u16            // 1500 = 15% dev, remainder to the pot
div_share_bps:u16       // 5500 = 55% divisions / 45% frontier
sponsor_daily_cap:u16 paused:bool bump:u8
```

**`Contract`** — seeds `["ct", contract_id:u16le]`, 240 B, 0.00256 SOL. Written **once** at open. Read-only for the entire week. Dev pays rent; closed and refunded 26 weeks after close.
```
disc[8] id:u16 author:Pubkey opens_at:i64 closes_at:i64 seed[32] seed_index:u16
grid_w:u8 grid_h:u8 tick_cap:u16 component_cap:u8 work_unit_cap:u32
fixtures[72]        // 18 × (kind, x, y, param)
recipes[32]         // 8 × (in0, in1, out, press_ticks)
spec_kind:u8 spec_qty:u16 spec_pattern[8] waste_allow:u16
obstacle_mask[18]   // 144 bits
bump:u8
```

**`Score`** — seeds `["sc", contract_id:u16le, player:Pubkey]`, 184 B, **0.00217 SOL (~$0.17), refundable**.

`ladder:u8` from the previous draft is now `division:u8`, snapshotted from `Player.division` at first verification and immutable for that contract — a player promoted mid-week competes in the division they entered. `paid:bool` records whether this entrant opted into the pot; free entrants rank normally and are skipped by `settle_pot`.
```
disc[8] player[32] contract_id:u16 runs:u16 first_slot:u64 division:u8 paid:bool
best_cycles:u16 best_cycles_slot:u64 best_cycles_hash[32]
best_fp:u16     best_fp_slot:u64     best_fp_hash[32]
best_cost:u16   best_cost_slot:u64   best_cost_hash[32]
bump:u8
```

**`Pass`** — seeds `["pass", player]`, 56 B, 0.00128 SOL, refundable on close.

**`Treasury`** — seeds `["tr", shard:u8]` where `shard = player.to_bytes()[0] & 7`. 16 B × 8 shards. Holds lamports.

**`Module`** (w5) — seeds `["mod", author, index:u16le]`, 656 B, 0.00546 SOL + 0.25 SOL bond.
```
disc[8] author[32] index:u16 w:u8 h:u8 ports[32] internals[64] cost:u16
table_len:u16 table[512] table_hash[32] license_fee:u64 bond:u64
certified:bool revoked:bool distinct_payers:u32 bump:u8
```

**`Player`** — seeds `["pl", player]`, 72 B, 0.00139 SOL, refundable on close. The only cross-contract state in the system, and the reason divisions work at all.
```
disc[8] player[32] rating:u16          // trailing percentile, 0..10000
division:u8                            // 0 = D1 Open, 1 = D2, 2 = D3
contracts_rated:u16                    // < 1 means unrated -> assigned D1
demotion_streak:u8                     // 4 consecutive low placements to demote
free_entries:u8                        // earned by beating a personal best
bump:u8
```
**Unrated wallets resolve to D1.** This is the anti-sybil property from §7.2 and it is enforced here rather than in the indexer: `contracts_rated < 1` forces `division = 0` at entry, so a fresh wallet cannot be pointed at the Apprentice pot.

**`Pot`** — seeds `["pot", contract_id:u16le]`, 56 B. Holds the contract's prize lamports. Written by `enter_contract` (many writers, one per entrant) and drained by `settle_pot`.
```
disc[8] contract_id:u16 lamports:u64 entrants:u32 settled:bool bump:u8
```
This is the one genuinely hot writable account in the design, and it is worth being explicit about why it is acceptable. At 800 paid entrants per contract spread across a week it takes roughly 800 writes — five orders of magnitude below the 12M CU per-writable-account per-block ceiling, and entries arrive over days rather than in a block. It is contended only in the sense that it has more than one writer. If a launch ever concentrates entries into minutes, shard it as `["pot", contract_id, player[0] & 3]` and have `settle_pot` sum four shards; the instruction is written to make that a one-line change.

**There is no `Run` account and there is no global leaderboard account.** Every verified run emits a `RunVerified` event carrying the 288-byte blueprint, the three scores, the module refs, and the slot. Replays are reconstructed from the blueprint by the deterministic VM, so an indexer plus Solana history is sufficient; blueprints are additionally mirrored to a public git repo hourly. A global sorted leaderboard would be one hot writable account — capped at 12M CU/block, inheriting its own local fee market, and a single point of contention. It buys nothing: the ladder is a derived view.

### 3.2 Instructions

| Ix | Signers | Key args | Writable accounts |
|---|---|---|---|
| `init_config` | admin | relay_root, seed_merkle_root, purse | Config |
| `open_contract` | admin (or permissionless after `opens_at`) | `seed_preimage[32]`, `merkle_proof`, `seed_index` | Config, Contract(init) |
| `verify_run` | player, **relay** (fee payer) | `blueprint[288]`, `ladder:u8`, `module_refs: Vec<(Pubkey_idx:u8, port_map:u8)>` (≤8) | Score(init_if_needed), relay-shard, [author…], Treasury shard |
| `enter_contract` | player | — | Pot, Player(init_if_needed), Treasury shard |
| `settle_pot` | permissionless after `closes_at` | winning Score PDAs (≤33), frontier set | Pot, Player[…], winner accounts |
| `buy_pass` | player | `months:u8` | Pass(init_if_needed), Treasury shard |
| `close_score` | player | `contract_id` | Score(close → player) |
| `publish_module` (w5) | author | internals, ports, table, closure cert | Module(init), author |
| `certify_module` (w5) | anyone | — | Module |
| `challenge_module` (w5) | challenger | `state[..]`, `input:u8` | Module, challenger |
| `post_bounty` / `settle_bounty` (w6) | poster | usdc amount, deadline, spec | Bounty PDA (non-custodial escrow) |

`open_contract` is fully deterministic: verify `sha256(preimage) == leaf`, verify the merkle proof against `Config.seed_merkle_root`, run the **generator** (a pure function `seed → Contract params`), run the **static vetting predicate** (recipe depth ∈ [1,3]; shortest source→sink Manhattan path ≥ 6; `spec_qty × min_press ≤ tick_cap × 0.7`; feed-rate/output-rate ratio ∈ [0.6, 3.0]; obstacle mask does not disconnect any source from any sink). If vetting fails, `next_seed_index++` and the caller must retry with the next preimage — the skip is on-chain, the rejected seed is revealed, and the whole thing is a pure function of a commitment made before anyone played. The dev cannot steer.

`enter_contract` transfers `Config.entry_lamports`, routes `rake_bps` to the Treasury shard and the remainder to `Pot`, and sets `Score.paid`. It consumes a `Player.free_entries` credit first if one is available, in which case the pot receives nothing and the dev takes no rake — a free entry is a genuine waiver, not a discount funded by other entrants. Entry is permitted any time before `closes_at`, including after a player has already verified runs for free.

`settle_pot` is permissionless after `closes_at` and idempotent via `Pot.settled`. It takes the candidate winners, asserts their canonicalized blueprint hashes are **pairwise distinct** (§4), drops and back-fills any duplicate, then pays 9 division slots at 50/30/20 of each division's equal share and splits the frontier pool evenly among frontier occupants. Payments are system transfers inside the instruction; the program never takes custody beyond the `Pot` PDA. It also updates each entrant's `Player.rating`, applies promotions immediately and demotions on a four-contract streak, and grants a `free_entries` credit to anyone who beat a personal best.

`verify_run` recomputes everything; the client submits no claimed scores. The program: validates the blueprint (144 cells, kind legality, obstacle collisions, fixture overlap, component count ≤ cap), rejects if `component_count × tick_cap > work_unit_cap`, builds the drain order, runs the VM, and on success updates only the axes that improved. **Ties never overwrite** — this preserves the earliest-slot tiebreak. Then it routes module fees: `licensee → author` for 90% and `licensee → Treasury[shard]` for 10%, as system transfers inside the same instruction; the program never takes custody.

### 3.3 Account contention — explicit

The 12M CU per **writable** account per block ceiling is the real throughput limit. Read-only accounts do not consume it.

- **`Contract` and `Config` are read-only in `verify_run`.** They are the only naturally-global state and they are never written during play. This is the entire contention strategy.
- **`Score` is per (player, contract).** Its writable budget is spent only by its own owner. A single verify_run is ≤ 960k CU, so one player could saturate their own Score PDA at 12 runs per block. That is not a constraint; it is a rate limit we'd want anyway.
- **`Treasury` is sharded 8 ways** by `player[0] & 7`. Each write is ≤ 30k CU (a `buy_pass` or a fee route), so 12M/30k = 400 writes/block/shard = 3,200/block ≈ 9,100/s across shards. Volume is ~0.05/s.
- **The fee-payer relay is writable and would be the real bottleneck.** A sponsored verify at 960k CU charges against the *relay's* writable budget → 12 sponsored txs per block per keypair. **Shard the relay 16 ways**, `relay_index = player[31] & 15`, derived from `Config.relay_root`; that is 192 sponsored verifies/block ≈ 550/s at 350ms slots. We need ~0.03/s at 1,000 DAU. Headroom: ~18,000×.
- **Priority fees stay near zero** because every writable account we touch is player-local or 1-of-8/1-of-16 sharded, and Solana's fee market is local to writable accounts.
- The binding constraint at real scale is not our accounts, it is our **share of the block**: a 960k-CU tx is ~1.1% of an 87.5M-CU block. At 12,000 verifies/day (2,000 DAU) that is 0.14 TPS — 0.15% of one block's CU on average. Fine. If MILLWRIGHT ever needed 50 verifies/second, the ER is the answer, not L1.

### 3.4 L1 / ER / client split

| Layer | Owns |
|---|---|
| **Client (WASM)** | The identical VM. Every simulation the player runs while designing. Editor, replay renderer, CU estimation. Zero network, zero cost, instant. |
| **L1** | Contract publication and seed reveal; the canonical VM as a public program; Score PDAs; module certification, bonds, and challenges; all money movement. |
| **ER (v2, weeks 9–12)** | 24×24 grids, 4,000 ticks, 1,152-byte blueprints — over the 1,232-byte L1 tx limit but trivial inside the ER's 64 KB. Chunked simulation at 0 SOL base fee, one 0.0001 SOL commit of the final score, 0.0003 SOL session undelegate. ~$0.03 per fully-verified large run. A Private ER is *not* required by this design and is not planned. |

---

## 4. Fairness & randomness

**The scheme.** Before launch the dev generates 260 random 32-byte seeds (five years of weeks), computes `leaf_i = sha256(i ‖ seed_i)`, builds a Merkle tree, and writes only the 32-byte root into `Config`. The full leaf list is published in the repo at launch. Each Monday, `open_contract` reveals `seed_i`, the program verifies the preimage and the Merkle path, and derives the contract by a pure deterministic function.

**Attack defeated:** *the operator authors a contract that suits a known technique of a friend, or regrinds seeds until one favours a house account.* The commitment predates all play; the generator and the vetting predicate are on-chain pure functions; skips are public and justified by a deterministic predicate, not by a solver whose output nobody can check. There is no point in the pipeline where post-hoc judgment enters.

**Symmetry.** Every player receives the **bit-identical** contract, published before anyone plays. There is **no per-player randomness anywhere in the system**: no drop tables, no crits, no variance, no matchmaking. The VM is integer-only with a statically-sorted drain order. The same 288 bytes produce the same three numbers on every machine, forever.

**Why symmetry is non-negotiable.** This was originally justified on legal grounds, and that argument is retired with §10. It survives on competitive-integrity grounds alone, and more strongly. A prize pool funded by entrants only works if every entrant is provably solving the same problem: the moment any per-player randomness exists — a different seed, a variance term in the purse, randomised matchmaking — a losing entrant has a legitimate grievance that no leaderboard can answer, and a fee-funded pot cannot survive that. **No randomness may ever be added to MILLWRIGHT.** Not cosmetic loot, not variance in the pot, not randomised division assignment. That rule is in the repo's `CONTRIBUTING.md`.

**Copy-forward.** Blueprints are public instruction arguments, so a spectator can resubmit your solution verbatim. Scores are per-player bests rather than a single-winner prize, and **ties break to the earliest verified slot**, with the program refusing to overwrite an equal score — so a copied run is *strictly non-improving against the original*. It can never outrank the player it was copied from.

That defends rank 1 and nothing else. A copier who ties the top score cannot displace its author, but **does displace the genuine runners-up**, who are the other people the pot pays. Under §7 there are roughly **33 paid positions per contract** — 9 division slots (3 divisions × top 3) plus every occupant of the Pareto frontier — so a single popular blueprint, replayed by a handful of onlookers, can take a meaningful share of the pot without one original idea in it. The frontier pool is the softer target of the two: it splits evenly among occupants, so each duplicate admitted dilutes every genuine one. The fix must therefore live where ranks are assigned, not where scores are stored.

**Deduplication rule — applied at ladder derivation, not in `verify_run`.** The `Score` PDA already stores `best_cycles_hash`, `best_fp_hash` and `best_cost_hash`: the sha256 of the canonicalized blueprint that achieved that axis's best. Ranking an axis therefore has the data it needs with no new account and no extra byte on-chain:

> For a given (contract, axis, ladder), group candidate Score PDAs by `best_<axis>_hash`. Within a group, the entry with the lowest `best_<axis>_slot` retains its position; **every other entry in the group is removed from the ranking entirely**, not demoted. Removal rather than demotion is the point — it lets the genuine third place move up into the paid slot the copy was occupying.

This costs zero CU in the hot path, adds no rent, and requires no schema change. It runs in the indexer that already derives the ladder, and identically in `settle_pot`. `verify_run` stays a pure function of the blueprint and is not made slower or more expensive.

**Why rejection at submission is still the wrong place, even with a real pot.** A trustless version would need a per-`(contract, blueprint_hash)` PDA to reject duplicates as they land: ~179 bytes, 0.00125 SOL (~$0.10) rent each, created on every distinct blueprint. The instinct is that a fee-funded pot now justifies that cost. It does not, and the reason is structural rather than a matter of scale — **the rent and the pot share a denominator**, so the ratio between them never improves:

| Weekly actives | Pot | Rent, all runs | Rent, paid entrants only |
|---|---|---|---|
| 500 | $340 | $300 (88%) | $120 (35%) |
| 1,000 | $680 | $600 (88%) | $240 (35%) |
| 2,000 | $1,360 | $1,200 (88%) | $480 (35%) |

Spending a third of the prize pool on rent to protect the prize pool is not a trade that gets better at scale. **`settle_pot` is the right place, and unlike the previous draft it is in v1.** It takes the winning Score PDAs — 9 division slots plus the frontier set, ~33 hashes — and asserts they are pairwise distinct, dropping and back-filling any duplicate. One instruction, no new accounts, run once per contract, enforced exactly where money moves. The pot is real from week one now, so this ships with the pot rather than waiting on a participation threshold.

**Canonicalization.** The hash is taken over the blueprint *after* normalization, so trivial perturbations do not launder a copy: cells are serialized in raster order; `param` is forced to 0 for kinds that ignore it; components not reachable in the pull graph from any source, and those that cannot reach any sink, are zeroed before hashing (a dead decorative belt in a corner must not mint a fresh hash). Translation is **not** normalized away, because FOOTPRINT and the fixture positions make position semantically load-bearing.

**What is left uncovered, honestly.** Canonicalization defeats padding and dead cells; it does not defeat a genuine near-duplicate — someone who reroutes one belt for an identical score. Near-duplicate detection over 288-byte blueprints is a fuzzy-matching problem with false positives that would punish convergent design, which in an optimization game is *expected* rather than suspicious: on a constrained grid two strong players routinely arrive at the same optimum independently, and that is a legitimate tie, not plagiarism. The rule deliberately catches only exact post-canonicalization matches.

The residue used to be handed to the HAND ladder's social policing. With HAND retired (§7.2) there is no honour system left to hand it to, and this is a real and acknowledged gap: a determined copier who reroutes one belt earns a frontier share they did not design. What bounds it is that the effort of disguising a copy well enough to beat canonicalization is comparable to the effort of finding a distinct frontier point honestly, and only one of those also earns a rating that promotes you into a division where the prizes are larger.

**Free entrants are ranked but not paid**, so deduplication only ever changes who receives money — never whether a run verifies, scores, or appears in its author's history.

---

## 5. Cost model (SOL = $80)

### 5.1 CU

| Instruction | CU | Notes |
|---|---|---|
| `verify_run`, typical (24 comp × 520 executed ticks) | **~353k** | 45k base + 14k validate/topo-sort + 275k sim + 6k score + 11k event + 2k hash |
| `verify_run`, worst case (50 × 800) | **~958k** | 40,000 work units × 22 CU |
| `verify_run` with 4 modules | +~28k | 4 × 4 CU/tick × 800 + 4 transfers |
| `buy_pass` | ~22k | |
| `open_contract` | ~60k | Merkle + generator + vetting |
| `close_score` | ~9k | |
| `publish_module` | ~30k | |
| `certify_module` | ~240k | 64 spot-checks × ~3k + closure scan |
| `challenge_module` | ~90k | |

VM budget target: **≤ 22 CU per component-tick**, achieved with struct-of-arrays `[u8; 144]` state, no bounds-checked indexing (fixed-size arrays with masked indices), no `HashMap`, no `Vec` in the tick loop, and the drain order precomputed into a `[u8; 144]`.

**The client sets the CU limit exactly, not by guessing.** The local WASM run returns the exact executed tick count and component count, so the request is `overhead + comps × ticks × 22`, plus 12%. Priority fees scale with the CU *requested*, so this is real money at scale and also the difference between landing and not.

### 5.2 Lamports per action

| Action | Lamports | USD |
|---|---|---|
| Base fee, 2 sigs (player + relay) | 10,000 | $0.0008 |
| Priority @ 1,000 µlamports/CU × 400k CU | 400 | $0.00003 |
| **Total per verified run** | **~10,400** | **$0.00083** |
| Score PDA rent (184 B) | 2,171,520 | $0.174 — **refundable** |
| Pass PDA rent (56 B) | 1,280,640 | $0.102 — refundable |
| Contract account rent (240 B), dev-paid weekly | 2,561,280 | $0.205 — refundable at archive |
| Module account (656 B) + bond | 5,456,640 + 250,000,000 | $0.44 + $20 — bond refundable |
| Module license, per run | 2,000,000 | $0.16 (1.8M author / 0.2M dev) |

A player's total lifetime cost to compete at the top of every ladder, forever, is **$0.00** — the relay pays gas and the Score PDA rent is paid by the relay too and refunded to the relay on `close_score`. Players spend money only on the Pass, module licenses, and bounties, none of which touch competitive access.

### 5.3 Dev cost at 1,000 DAU/day

Assume 1,000 DAU, 55% verify on a given day, 2.4 runs each = **1,320 sponsored txs/day**; ~35 new (player, contract) Score PDAs/day.

| Line | Per day | Per month |
|---|---|---|
| Sponsored tx fees (1,320 × 10,400 lamports = 0.0137 SOL) | $1.10 | $33 |
| Score PDA rent float (35 × 0.00217 SOL, recovered on close) | $0.076 outflow | ~$2 net |
| Helius Sender / staked connection, business tier | $8.20 | $250 |
| Indexer VPS + Postgres + archival replay store | $1.70 | $52 |
| Contract account rent (1/week, refundable) | — | ~$0.90 |
| **Total** | **~$11.10** | **~$338** |

At 2,000 DAU: ~$520/mo. At 100 DAU: ~$121/mo (Helius $99 tier).

`enter_contract` is **not** sponsored — a player opting into a prize pool can pay their own 5,000-lamport signature, and requiring it is a cheap sybil tax on exactly the path where money is at stake. `settle_pot` is one transaction per contract per week, paid by the dev, at roughly 33 transfers and well inside a single transaction's budget.

Sponsorship abuse bound: **12 sponsored verifies per wallet per day**, enforced by the relay (not on-chain — on-chain enforcement would need a hot counter). Beyond 12 the client falls back to self-pay at $0.0008/run, which is unlimited and which we do not care about. The relay refuses to co-sign any tx that fails local simulation, and drops any wallet with >20 simulation failures/hour.

---

## 6. Client stack

**Framework.** TypeScript, Vite, React 19, no SSR. Static bundle on Cloudflare Pages. Rendering is **canvas 2D**, not a CSS grid — the concept's CSS-grid idea is fine for a static board but wrong for a 60 fps replay scrubber. Zero art budget: a 5-colour palette, a monospace glyph per component kind drawn as vector paths, item dots. It reads as an engineering schematic on purpose. Total bundle target < 400 KB including WASM.

**The VM.** `mw-vm` compiles to `wasm32-unknown-unknown` (~90 KB) and to SBF from the same source with no `cfg` divergence in the tick loop. The **parity harness is written in week 1 before anything else** and is the single most important artifact in the project: 20,000 generated blueprints (random valid + adversarial: full loops, deadlocks, gate preloads, simultaneous contention, exact-tick-cap boundary) asserting byte-identical `(cycles, footprint, cost, per-tick state hash, jam tick)` across native / WASM / LiteSVM. It runs in CI on every commit. A parity break is a P0 that stops all other work — a divergence means players see one score locally and another on-chain, which destroys the only thing the chain is for.

**Wallet.** Solana Wallet Standard via `@solana/wallet-adapter` for Phantom / Backpack / Solflare. Plus a **"mill key"**: an ed25519 keypair generated in-browser, stored in IndexedDB, wrapped with a WebAuthn passkey (or a downloadable JSON if no passkey). It never holds funds — gameplay is sponsored — so its security requirements are "don't lose your ladder identity", not "don't lose your money". A one-click **Link Wallet** flow signs a message from a real wallet to bind the mill key to it, which is required before buying a Pass, publishing a module, or receiving royalties.

**Funding flow.** There isn't one for gameplay. For a Pass: link a real wallet, pay 0.06 SOL. If empty, a Coinbase Onramp widget for $10 minimum. Royalty and bounty payouts go to the linked wallet directly; the program never takes custody.

**Link → playing, under 60 seconds:**

| t | |
|---|---|
| 0.0 s | Replay link opens; static page + WASM stream in; the machine begins animating before the WASM finishes loading (replay frames are precomputed server-side as a 2 KB delta stream for the first paint). Score stamped on it. |
| 3 s | Below the replay: the live Pareto chart for this contract, and one button — **YOUR TURN**. |
| 6 s | Editor opens on the same contract. No wallet prompt, no account, no email. Palette on the left, contract spec pinned top-right. |
| 8–45 s | Tutorial ghost overlay lays the first three belts for you; you drag the fourth. |
| ~50 s | **SIMULATE** — the local WASM VM runs it in <4 ms and animates. It jams at tick 212, with the jamming cell outlined in red and a one-line cause. |
| minutes later | The button changes to **VERIFY ON-CHAIN**. *Only now* does the app ask for anything: "Create a mill key?" — one click, passkey, no seed phrase, no extension, no SOL. |
| +2 s | One sponsored transaction lands. Score posts. Replay URL generated and copied to clipboard. |

Time to first *input* is under 20 seconds. Time to first *verified score* is however long the puzzle takes — 6 to 40 minutes — and that is correct, because a score posted before the player has struggled is worthless to them.

**Landing layer.** Helius Sender with a staked connection (SWQoS). Fresh blockhash fetched per attempt; CU limit computed exactly from the local run; priority fee from Helius's per-account estimate floored at 1,000 µlamports/CU; retry on a re-fetched blockhash with exponential backoff up to 4 attempts over 25 s; optimistic UI showing "verifying" with the local result already displayed, replaced by the confirmed on-chain result. Every failure mode is logged with its category (stale blockhash / CU exceeded / underpriced / dropped) because at week 6 you will want the histogram.

---

## 7. Economy

**No token. Ever.** Prizes and royalties in SOL; bounties in USDC. There is nothing to speculate on, and that is the design.

### 7.1 The problem a fee-funded pot has to solve first

MILLWRIGHT has **zero variance**. Every player receives the bit-identical contract, the VM is integer-deterministic, and there is no randomness anywhere in the system — that is a deliberate property defended in §4, not an oversight. It has a consequence that matters more for the economy than for anything else:

> In poker, a weak player wins occasionally, and that is precisely what keeps them depositing. Here, the same three people win every single week, forever.

So the naive design — entry fee in, top three take the pot — dies on a schedule you can predict in advance. Week 1 everyone enters. Week 2 the other 97% work out that they cannot win. Week 4 there are twelve strong players and a $24 pot. This is ordinary adverse selection, and it bites *harder* in a deterministic game than in a gambling one, because there is no luck to redistribute and no story a losing player can tell themselves about next week.

Every structural choice below exists to make winning reachable for someone who is not top three.

### 7.2 Divisions replace HAND/OPEN

The original design split each axis into **HAND** (self-declared, unenforced, socially policed) and **OPEN** (solvers welcome). That worked because the top prize was about $12 — too little to lie for. **It does not survive a real pot.** An honour system with money on it is just a lie people tell, and there is no way to detect a solver from a blueprint.

Replace it with **three rating divisions**, assigned from a player's trailing percentile across the three axes:

| | Division | Who is in it |
|---|---|---|
| **D1** | Open | Top ~33% by rating. Solvers, bots and the strongest humans all land here. |
| **D2** | Journeyman | Middle third. |
| **D3** | Apprentice | Bottom third, and the natural home of a competent casual player. |

Each division gets an **equal share** of the division pot and pays its own top three (50/30/20). The properties that matter:

- **Divisions quarantine solvers without needing to detect them.** A solver posts world-class scores, rates into D1 immediately, and thereafter competes only with other solvers and the best humans. It cannot reach down into D2 or D3, because rating is computed from results rather than declared.
- **Rating ratchets up and decays slowly.** Promotion on a top-three division finish is immediate; demotion takes four contracts of sustained lower placement. Sandbagging costs more weeks than it earns.
- **Unrated wallets start in D1.** This is the anti-sybil property and it is cheap: a fresh wallet cannot be used to farm the Apprentice pot, because a fresh wallet is not in the Apprentice pot.

### 7.3 The frontier pool

45% of the pot is split evenly among every entrant occupying a point on the global **Pareto frontier** of (CYCLES, FOOTPRINT, COST).

This is the piece that is specific to this game rather than borrowed. With three axes in genuine tension, the frontier is not a single winner — it is typically 12–24 distinct points, and a player who ranks fortieth on every individual axis can still own a frontier point if their *combination* is unique. It pays strategic diversity rather than raw optimization, it is the single best answer to "why would I enter if I cannot beat the top three", and it is exactly the object §2.6 says players actually compete over.

It is also structurally solver-resistant in a way ranks are not. A solver pushes one axis hard and lands on one frontier point. It does not occupy fifteen.

### 7.4 Improvement pays in entries, not cash

Beat your own previous best on any axis for a contract, and **your next contract entry is free**. Not a cash prize — a fee waiver.

This is deliberate. A cash improvement pool at any realistic pot size pays about a dollar and feels like nothing, and it is farmable by sandbagging your own first submission. A free entry is worth exactly $2, is worth $2 to everyone equally, cannot be farmed for more than the entry it replaces, and converts the most common experience in the game — *I made my machine slightly better* — into a reason to come back next week.

### 7.5 The arithmetic

Entry 0.025 SOL (~$2), 15% dev rake, 85% to the pot, split 55% divisions / 45% frontier. Assumes 40% of weekly actives opt into the paid ladder; the rest play free.

| Weekly actives | Paid entrants | Pot | Per division | D1 first prize | Frontier, each | Players paid |
|---|---|---|---|---|---|---|
| 100 | 40 | $68 | $12 | $6 | $5.10 | ~15 |
| 250 | 100 | $170 | $31 | $16 | $7.65 | ~19 |
| 500 | 200 | $340 | $62 | $31 | $10.93 | ~23 |
| 1,000 | 400 | $680 | $125 | $62 | $15.30 | ~29 |
| 2,000 | 800 | $1,360 | $249 | $125 | $25.50 | ~33 |

**Read this honestly.** The top prize at 2,000 weekly actives is about $125. That is meaningful for a weekly puzzle and it is not life-changing money, and the product should never imply otherwise. What the table actually buys is the number in the last column: **roughly 30 people get paid every week instead of three**, and a further large fraction earn a free entry. That is the number that decides whether the pot survives contact with month three.

### 7.6 Faucets and sinks

**Faucets:** none. There is no minted resource. The only inbound subsidy is the dev's sponsored gas, which is a cost line, not an emission.

**Sinks (all consumption, none accrual):**
- Contract entry: 0.025 SOL, consumed, one contract, no rollover.
- Foundry Pass: 0.06 SOL/month, consumed monthly, no rollover, no resale.
- Module license: 0.002 SOL per verified run containing the module. Consumed. Not refundable, not an asset, not transferable.
- Bounty escrow: paid out or refunded; 5% to the dev on payout.

**Why it cannot death-spiral.** A death spiral needs a claim on future inflows: a yield pool, a token with an emission schedule, or a depositor class expecting appreciation. There is none. Nothing accrues, and nobody holds an asset whose value depends on new entrants. The pot is now a **pure pass-through** — 85% of what came in this week goes out this week, and if nobody enters, the pot is zero and nothing is owed. It cannot outrun revenue because it *is* revenue, and a week with eight entrants pays out a week's worth of eight entrants.

That is strictly safer than the fixed purse it replaces, which was a standing $260/month liability regardless of participation.

### 7.7 Dev revenue

Removing the fixed purse changes the shape of the business, not just its size:

| | Old (fixed $60/wk purse) | New (fee-funded pot) |
|---|---|---|
| 100 DAU | **−$130/mo** | **+$182/mo** |
| 2,000 DAU | +$4,580/mo | **+$5,879/mo** |

At 100 DAU the old model lost money *and the purse was the entire reason* — which is why it had to be switched off below 150 weekly actives, leaving early players competing for a pinned Discord post. The new model has no such hole: at eight players the pot is small because the field is small, which is correct and needs no special case.

At 2,000 DAU the entry rake adds about $1,039/month on top of Pass and module revenue.

**Top module author at 2,000 DAU** is unchanged and remains the most interesting number in the document: if the leading module captures 8% of license volume, that is 1,624 events/wk × 0.002 SOL × 90% ≈ **$234/week, $1,013/month**, paid instantly to a wallet anywhere on earth, with the split enforced by the program rather than by a revenue-share agreement the platform can rewrite. Note that this exceeds the top weekly prize by roughly eight times. **Authoring a good module is, and should remain, the highest-earning thing a player can do** — it is the only non-zero-sum way to earn here, and the one that makes everyone else's machines better.

---

## 8. Cold start — week one, eight players

Not marketing. A schedule.

**T−10 days.** The dev plays contracts C-01 through C-04 alone, posting ~40 verified runs from a `HOUSE` account, flagged in the Score PDA and **excluded from every prize and from the OPEN record**. Deliberately mid-quality: the goal is a beatable target on every axis, not an intimidating one. A ladder with 40 entries on day one is not a ghost town; a ladder with 0 is.

**T−7 days.** Hand-pick eight people. Not a demographic — eight named individuals who have publicly posted Opus Magnum, SpaceChem, Shapez, or Factorio solution GIFs in the last year and are findable. DM each one a single replay link and three sentences. **The word "crypto" does not appear. The words "web3", "token", "NFT", "earn", and "play-to-earn" never appear anywhere in the product or its copy, ever.** The offer:
- Permanent lifetime Foundry Pass.
- Their handle on the founding ladder of C-01, permanently.
- **The right to author one contract each: C-05 through C-12.** This is the actual recruitment pitch, and it directly kills the "one dev authoring forever" failure mode by making the first cohort the content pipeline in week two rather than week twenty.

Expect 3 of 8 to convert. Recruit 20 to land 8.

**Launch week, day by day:**
- **Mon 16:00 UTC** — C-01 opens by seed reveal. Discord bot posts the contract card. HOUSE has already posted a 1,340-cycle solution.
- **Mon–Tue** — every verified run auto-posts to `#runs` as an animated replay embed with the three scores. At 8 players × 6 runs that is 48 automatic posts in a week: the entire content engine, zero dev effort.
- **Wed** — the dev publishes a **teardown**: the current #1 CYCLES solution walked frame by frame, naming the trick. This is the single highest-leverage recurring artifact; it teaches the mastery curve, it converts spectators, and it costs 90 minutes. It also travels off-platform on its own.
- **Fri** — dev posts the Pareto chart with unclaimed corners circled: *"nobody has been under 34 tiles."* A specific, claimable, single-slot brag.
- **Sat** — peak play day. Bot posts a "3 slots changed hands today" summary.
- **Mon 16:00** — C-01 archives (stays open forever, never pays), C-02 opens, week-1 recognition posted.

**Week-1 success is a retention number, not a headcount:** of the 8, ≥5 verify a run in week 2 and ≥3 in week 4. Nothing else in week 1 matters. Do not build an announcement, do not do a Twitter push, do not touch the Solana Mobile dApp Store — that is a week-10 launch beat, not a growth plan.

---

## 9. Bots

**Day one, a beam-search or SAT solver beats every human on CYCLES for a simple contract.** That is what optimisation games are; the Zachtronics community has run unbounded-solver divisions for over a decade. Detection is neither possible nor desirable, and the design says so out loud on the front page.

The previous version of this section argued that bots were harmless because the maximum purse was $60 and a top prize was about $12 — less than the electricity to run a serious solver. **A fee-funded pot destroys that argument.** At 2,000 weekly actives a D1 first prize is $125 and the whole pot is $1,360/week, which is worth farming. Every defence below is structural instead.

**Divisions quarantine solvers without detecting them (§7.2).** A solver posts world-class scores, rates into D1 on its first contract, and thereafter competes only against other solvers and the strongest humans. It cannot reach into D2 or D3 because rating is computed from results, not declared. The honest framing for players: *D1 is the machine division, and everyone knows it.*

**Unrated wallets start in D1.** This is what stops the obvious attack — solve with a bot, submit from a fresh wallet, collect an Apprentice prize. A fresh wallet is never in the Apprentice pot. Farming D3 requires a wallet with four contracts of genuinely mediocre history, which costs more weeks than the prize is worth.

**Multi-accounting one solution is blocked by the §4 dedupe rule, which is now load-bearing.** Submitting the same optimal blueprint from twenty wallets to occupy twenty frontier slots is the highest-value attack on the frontier pool. Canonicalized blueprint hashes make it fail: identical post-canonicalization submissions collapse to the earliest slot and the rest are removed from the ranking entirely. That rule was arguably over-engineered when it defended a $60 purse. Against a fee-funded pot it is the thing standing between the frontier pool and a sybil farm, and it should be treated as a launch blocker rather than a nicety.

**The frontier pool is structurally solver-resistant.** A solver optimises hard along one axis and lands on one frontier point. It does not occupy fifteen. The pool pays strategic diversity, which is the one thing a single-objective optimiser is worst at producing.

**Where a bot is genuinely, deliberately paid: modules.** A solver that discovers a 5×4 sorter better than anything a human has built cashes out by certifying it and collecting 0.0018 SOL per licensed run — around $1,013/month for the leading module at 2,000 DAU, roughly eight times the top weekly prize. **So the bot operator's dominant strategy is to publish good components into the ecosystem, and everyone's machines get better.** That is not a mitigation, it is the intended equilibrium, and it is stated as policy so nobody feels cheated by it.

**Wash-trading a module** to fake popularity: a sybil paying itself loses 10% real SOL per wash plus gas. Module ranking uses **distinct payers weighted by ladder history**, not gross revenue, so wash volume moves nothing.

**Entry-fee farming is not a thing**, and this is worth stating plainly because it is the question every reader of a fee-funded design asks first. Entries are consumed, the pot is a pass-through, and there is no per-account payout, drop, emission or airdrop. Entering from N wallets costs N × $2 and returns a share of the same pot — it is strictly negative expected value unless every one of those wallets independently places, which requires N genuinely distinct top-three solutions rather than N copies of one.

**Sponsored-gas farming:** 12 sponsored verifies/wallet/day; beyond that the wallet self-pays $0.0008. The relay refuses any tx that fails simulation. Worst-case abuse is bounded by the daily relay budget, $1.10 at 1,000 DAU.

**The one genuine abuse** is a solver sniping every commission-board bounty. Mitigation: the poster selects a winner from a shortlist rather than first-past-the-post, may restrict a bounty to a division, and escrow auto-refunds after 7 days with no acceptance. Repeat sniping means posters stop posting, which is self-correcting and cheap.

---

## 10. Legal posture — superseded, out of scope

**The analysis that stood here no longer describes this design, and has been removed rather than left to mislead.**

It argued a Tier 0 posture on the grounds that *consideration is removed from every competitive path, in code* — free entry, free verification, free prize eligibility, gas paid by the operator's relay, with a purse funded from general revenue rather than from entrants. §7 replaces exactly that: entry to the prize pool now costs $2 and the pot is 85% of what entrants paid in. Whatever the right analysis of the new structure is, it is not the old one, and the old text asserted "there is no wager" in a document that now specifies one.

Two properties of the original design do survive the change, and are worth keeping on the record because they were engineered deliberately and would be expensive to recover if lost:

- **Play is still free.** Anyone can verify, score and rank without paying. The $2 buys eligibility for the pot, not access to the game.
- **Chance is still absent entirely.** The VM is integer-deterministic with a statically-sorted execution order, the weekly seed is symmetric and pre-committed, and there is no per-player randomness of any kind. §4 states that no randomness may ever be added to MILLWRIGHT; that rule was written for legal reasons but earns its place on competitive-integrity grounds alone.

Regulatory structuring was dropped as a design constraint for this project by explicit decision (see `STATUS.md`), so this section is not being rewritten. `research/03-legal-and-economics.md` is retained as reference material. Anyone reinstating that constraint later should start from §7.2's division structure and the free-entry tier, which are the two things a compliant variant would most likely be built on.

---

## 11. Four-week build plan

**Week 1 — the VM and the parity harness.** `mw-vm` in Rust: state layout, drain-order construction (Kahn, cycles broken by index), all six components, sources/sinks, spec matching, jam detection, three-axis scoring. Blueprint validator. WASM build. **The parity harness is written before the program exists** — 20,000 generated blueprints (random valid, adversarial, boundary), asserting byte-identical results across native, WASM, and LiteSVM-hosted SBF, in CI on every commit. CU instrumentation on the tick loop; tune to ≤ 22 CU/component-tick. Contract generator + static vetting predicate as pure functions with property tests. *Exit criterion: 20,000/20,000 parity, worst-case run measured under 1.0M CU in LiteSVM.*

**Week 2 — the Anchor program.** Config, Contract, Score, Pass, Treasury shards. `init_config`, `open_contract` (Merkle + reveal + generate + vet), `verify_run`, `buy_pass`, `close_score`. Full instruction-level test suite in LiteSVM including: the tie-never-overwrites rule, the work-unit cap rejection, the `pass_never_gates_competition` assertion, PDA seed collisions, and rent-refund correctness. Deploy to devnet. *Exit criterion: a devnet run verifies end to end from a CLI.*

**Week 3 — client.** Vite/React/canvas editor: place, rotate, param, copy-paste region, undo stack. Local SIMULATE with step/scrub/speed and jam highlighting. Replay renderer and permanent replay URLs. Indexer (Rust or TS, Postgres) consuming `RunVerified` events into ladders and the Pareto chart. Mill-key wallet + wallet-adapter linking. **Landing layer**: Helius Sender, exact CU limits from the local run, per-attempt blockhash, categorised failure logging. Sharded fee-payer relay (16 keys) with per-wallet rate limiting. *Exit criterion: link → verified score on devnet in one session, with a landing-failure histogram from 500 synthetic submissions.*

**Week 4 — content, polish, seed.** Tutorial contract T-0 plus C-01…C-04 parameter sets, generator seed tree committed and published. Pass purchase flow. Discord bot posting replay embeds. Mainnet deploy. Then **the dev plays the game for six days**, posting ~40 HOUSE runs, and fixes whatever that reveals — which will be the editor's ergonomics, every time. Recruit the eight. *Exit criterion: Mon 2026-09-21 16:00 UTC, C-01 opens with a populated ladder.*

**Weeks 5–6 — module market** (not MVP, but designed for from day one so it is additive, not a rewrite): `Module` account, port contracts, transducer table + closure certificate, `publish_module`, `certify_module` with 64 spot-checks, `challenge_module` with bonded refunds, module placement in the editor and in `verify_run`, royalty routing. Ship to the founding cohort first; open publicly only once ≥ 25 modules exist.

### NOT IN MVP — explicitly cut

MagicBlock ephemeral rollup and 24×24 grids (v2, weeks 9–12). Private ER / TEE (**cancelled permanently** — the transducer design removes the need). Token-2022, transfer hooks, license NFTs (**cancelled permanently** — pay-per-run has no asset). Switchboard VRF (the pre-committed Merkle seed chain is strictly better here: free, verifiable, and immune to callback latency). Chunked multi-transaction verification and the scratch account. First Forge faucet (**cancelled** — the sponsored relay supersedes it). Commission/bounty board (week 7). Community contract queue (week 8, though the founding eight author C-05…C-12 by hand from week 2). Mobile layout. Solana Mobile dApp Store. The remaining 8 components. Historical-ladder prizes (**never**). Any form of randomness (**never**).

**Slip rule:** if week 3 slips, cut the Pass and ship free — the ladder is the product and monetisation can arrive in week 6. If week 1 slips, slip everything; a VM without parity is not shippable at any date.

---

## 12. Kill criteria

Measured, dated, and decided in advance so that they are not renegotiated in the moment.

| When | Signal | Action |
|---|---|---|
| **Week 4 post-launch** | Fewer than 3 of the founding 8 verify a run in week 4 | **Stop.** The game is not fun to the exact people it was built for. Nothing downstream fixes this. |
| **Week 8** | Median verified runs per active player per contract < 3 | **Stop or redesign the scoring.** The product is the 3rd-through-9th iteration. If people solve once and leave, this is a puzzle, not an optimisation game, and it has no month three. |
| **Week 8** | D7 retention of non-recruited signups < 12% | Redesign onboarding once. If unchanged by week 12, stop. |
| **Week 12** | Fewer than 40 weekly actives | **Stop building.** Leave the program deployed and the ladder running read-only; it costs $12/month. |
| **Week 12** | Pass conversion < 6% of weekly actives | The $5 has no perceived value. Stop monetising, keep shipping content, revisit at week 20. Do not respond by gating gameplay: free play is what makes the funnel work, and the pot is opt-in precisely so gameplay never has to be sold. |
| **Week 6** | Paid opt-in < 15% of weekly actives | The pot is not motivating. Try one price cut to $1 and one round of making prizes more visible in the client. If unchanged by week 10, remove entry fees entirely and run the game free with module royalties as the only earn — that is a worse business but a working one. |
| **Week 8** | The same 3 wallets take D1 first place in ≥ 6 of 8 contracts **and** D2/D3 opt-in is falling | Divisions are not doing their job. Split into five divisions before touching anything else; if that fails, the zero-variance adverse-selection problem in §7.1 has beaten the structure and the pot should be retired. |
| **Any week** | `settle_pot` drops > 10% of candidate winners as duplicates | Copy-forward has become the dominant strategy rather than an edge case. Escalate the §4 residue from an accepted gap to a build task. |
| **Week 10 (module launch + 4)** | < 25 certified modules **or** < 15% of verified runs contain a licensed module | Cut the module market. Accept that the chain is a notary and that the revenue ceiling is ~$300/mo. This is a real outcome, not a failure — but stop paying engineering time for it. |
| **Any week** | > 4% of verify txs fail to land after 3 attempts, **or** median run CU > 1.2M | **Freeze all feature work** until fixed. Landing reliability is the product; a dropped verification reads to the player as the game stealing their work. |
| **Any time** | A parity divergence between WASM and on-chain reaches production | **P0, take the site to read-only.** The entire value proposition is that the score is not a claim. One divergence is worse than a month of downtime. |
| **Week 16, hard stop** | < 200 weekly actives **and** < $800/mo revenue | The audience thesis — that enough Zachtronics-shaped people can be reached without saying "crypto" — is falsified. Archive, open-source the VM and the program, keep the ladder running. Do not raise money to keep going; running out of money while looking for a retaining loop is the second-most-common way these die. |

**The risk that actually kills this is audience, not design.** ~3.2M daily Solana wallets, overwhelmingly present to trade. The channels that reach puzzle-game players punish or ban crypto; the channels that welcome crypto deliver people who bounce in ninety seconds because there is nothing to speculate on. There is no workaround, only a choice: this spec chooses the gamers, hides the chain completely, never says the word, and targets a few hundred devoted people and $1–5k/month. If that number is not acceptable, do not build this.