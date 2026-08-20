# MILLWRIGHT — Build Spec v1.0
**Technical director → solo Solana engineer. Execution starts Mon 2026-08-24. Target: public launch Mon 2026-09-21 (4 weeks core), module market Mon 2026-10-05 (weeks 5–6).**

---

## 0. What changed from the concept, and why

The panel's three criticisms were the same criticism: *the chain is a notary bolted to a Zachtronics clone, one dev authoring weekly content forever is the failure mode, and the module layer — the only original part — was deferred to v2 where it depended on a TEE.* Four structural changes fix all three:

1. **Modules are no longer secret, and the TEE is gone.** Sealed internals on a public chain was never real. Instead a module is a **certified compute-compression artifact**: public internals, plus an author-supplied finite transducer table that the program verifies is behaviorally equivalent. In a scored run the module executes from its table at ~4 CU/tick instead of ~800 CU/tick, and **does not consume the contract's component budget**. What you pay for is not secrecy — it is *verified compute*. The scarce resource being traded is the chain's own compute budget. That is not a notary; that is a market that cannot exist off-chain because off-chain there is no metered, adversarially-verified compute budget to compress.
2. **Verification is a single transaction.** Chunked 200-tick simulation across 5 txs with a scratch account was the largest feasibility risk (partial state, 5 landing opportunities to fail, rent churn). One tx, hard-capped at 40,000 component-ticks ≈ 960k CU against the 1,400,000 CU limit. Chunking returns only inside the ER at v2 where it costs nothing.
3. **Contracts are generated, not authored.** A pre-committed seed chain plus a deterministic generator-and-vetting function that runs *on-chain*. The dev authors 200 bytes of parameters, not a puzzle, and after week 4 authors nothing at all. Community contracts run every third week.
4. **Gameplay gas is sponsored by the dev via a sharded fee-payer relay.** $1.15/day at 1,000 DAU. This deletes the First Forge faucet, deletes the "you have 0 SOL" wall from the first session, and makes free entry a code-enforced fact rather than a claim. Also: **no Token-2022, no license NFT, no tradable asset anywhere in the system.** Licensing is pay-per-run. That removes the transfer-hook engineering *and* the entire "money's worth" UK exposure.

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
| Stake | **zero** | no entry fee, no wager, no deposit, ever |
| Rake | module license 10% dev / 90% author; bounty board 5%; Pass 100% | |
| Pass | 0.06 SOL/month (~$4.80) | authoring + archive + diff tool. **Never gates verification or prize eligibility.** |
| Module license | author-set, default 0.002 SOL/verified run | consumed, not accrued |
| Weekly purse | fixed 0.75 SOL, published rule, general revenue | ~$60/wk. Deliberately trivial (see §9) |
| First working solve | 20–40 min | |
| Iteration | 10–15 min per revision, 5–9 verified runs per contract | |
| Session | 35–50 min; ~2.5 h/week; Mon/Wed/Sat pattern | |
| Progression | week 1: 1 live contract. Week 12: 1 live + 11 archived ladders + ~60 certified modules | |

Three independent leaderboards (**CYCLES**, **FOOTPRINT**, **COST**) plus the Pareto frontier. No single winner. Two ladders per axis: **HAND** (self-declared, unenforced) and **OPEN** (solvers welcome). Ties break to the **earliest verified slot** — this is load-bearing; see §4.

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
next_seed_index:u16 contract_counter:u16 purse_lamports:u64
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
```
disc[8] player[32] contract_id:u16 runs:u16 first_slot:u64 ladder:u8
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

**There is no `Run` account and there is no global leaderboard account.** Every verified run emits a `RunVerified` event carrying the 288-byte blueprint, the three scores, the module refs, and the slot. Replays are reconstructed from the blueprint by the deterministic VM, so an indexer plus Solana history is sufficient; blueprints are additionally mirrored to a public git repo hourly. A global sorted leaderboard would be one hot writable account — capped at 12M CU/block, inheriting its own local fee market, and a single point of contention. It buys nothing: the ladder is a derived view.

### 3.2 Instructions

| Ix | Signers | Key args | Writable accounts |
|---|---|---|---|
| `init_config` | admin | relay_root, seed_merkle_root, purse | Config |
| `open_contract` | admin (or permissionless after `opens_at`) | `seed_preimage[32]`, `merkle_proof`, `seed_index` | Config, Contract(init) |
| `verify_run` | player, **relay** (fee payer) | `blueprint[288]`, `ladder:u8`, `module_refs: Vec<(Pubkey_idx:u8, port_map:u8)>` (≤8) | Score(init_if_needed), relay-shard, [author…], Treasury shard |
| `buy_pass` | player | `months:u8` | Pass(init_if_needed), Treasury shard |
| `close_score` | player | `contract_id` | Score(close → player) |
| `publish_module` (w5) | author | internals, ports, table, closure cert | Module(init), author |
| `certify_module` (w5) | anyone | — | Module |
| `challenge_module` (w5) | challenger | `state[..]`, `input:u8` | Module, challenger |
| `post_bounty` / `settle_bounty` (w6) | poster | usdc amount, deadline, spec | Bounty PDA (non-custodial escrow) |

`open_contract` is fully deterministic: verify `sha256(preimage) == leaf`, verify the merkle proof against `Config.seed_merkle_root`, run the **generator** (a pure function `seed → Contract params`), run the **static vetting predicate** (recipe depth ∈ [1,3]; shortest source→sink Manhattan path ≥ 6; `spec_qty × min_press ≤ tick_cap × 0.7`; feed-rate/output-rate ratio ∈ [0.6, 3.0]; obstacle mask does not disconnect any source from any sink). If vetting fails, `next_seed_index++` and the caller must retry with the next preimage — the skip is on-chain, the rejected seed is revealed, and the whole thing is a pure function of a commitment made before anyone played. The dev cannot steer.

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

**Why symmetry protects the legal posture.** The chance prong of consideration/chance/prize needs chance *in the determination of the outcome*. A seed that is identical for all participants and published before play is not chance in the outcome — it is the definition of the task, the way a chess problem's position is not chance. This matters specifically because the **material element** test (~a dozen states) bites even when skill predominates, so long as chance is *material*. There is nothing for it to bite on here, so we never have to argue predominance. This is worth more than any prize structure we could design, and it is the reason **no randomness may ever be added to MILLWRIGHT** — not cosmetic loot, not variance in the purse, not randomised matchmaking. That rule is in the repo's `CONTRIBUTING.md`.

**Copy-forward.** Blueprints are public instruction arguments, so a spectator can resubmit your solution verbatim. This is deliberately harmless: scores are per-player bests, not a single-winner prize, and **ties break to the earliest verified slot**, with the program refusing to overwrite an equal score. A copied run is therefore *strictly non-improving* — it can never outrank the original. Reading and stealing ideas from other people's solutions is a designed feature of the genre; verbatim copying is simply pointless. Sealed submission via a Private ER is a v3 consideration, not a v1 problem.

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

**Faucets:** none. There is no minted resource. The only inbound subsidy is the dev's sponsored gas, which is a cost line, not an emission.

**Sinks (all consumption, none accrual):**
- Foundry Pass: 0.06 SOL/month, consumed monthly, no rollover, no resale.
- Module license: 0.002 SOL per verified run containing the module. Consumed. Not refundable, not an asset, not transferable.
- Bounty escrow: paid out or refunded; 5% to the dev on payout.

**Why it cannot death-spiral.** A death spiral needs a claim on future inflows: a yield pool, a token with an emission schedule, or a depositor class expecting appreciation. There is none. Nothing accrues. Nobody holds an asset whose value depends on new entrants. The purse is a **fixed 0.75 SOL/week from general revenue, capped, published as a rule** — it is not funded from entrant money and does not scale with participation, so it physically cannot outrun revenue. The failure mode available to this economy is "revenue goes to zero and the dev stops paying for Helius", which is a business failing, not a spiral: the ladder keeps running on a $12 VPS and the on-chain program keeps accepting verifications forever, for free, with or without the dev.

**Dev revenue at 100 DAU** (≈ 380 MAU, 12% Pass conversion = 46 passes):

| Stream | Monthly |
|---|---|
| Pass: 46 × 0.06 SOL | $221 |
| Module licenses: ~1,100 events/mo × 0.002 SOL × 10% | $18 |
| Bounties: 8/mo × $30 × 5% | $12 |
| **Gross** | **$251** |
| less infra | −$121 |
| less purse (0.75 SOL/wk) | −$260 |
| **Net** | **−$130/mo** |

Honest: at 100 DAU this loses money, and the purse is the reason. **The purse does not turn on until weekly actives exceed 150**; before that, weekly recognition is a pinned Discord post and a permanent ladder entry, which at n=8 is worth more than $60 anyway.

**Dev revenue at 2,000 DAU** (≈ 6,500 MAU, 12% Pass conversion = 780; weekly verified runs ≈ 18,500; licensed-module attach rate 1.1):

| Stream | Monthly |
|---|---|
| Pass: 780 × 0.06 SOL | $3,744 |
| Module licenses: 20,300/wk × 0.002 SOL × 10% × 4.33 | $1,408 |
| Bounties: 120/mo × $35 × 5% | $210 |
| **Gross** | **$5,362** |
| less infra | −$520 |
| less purse | −$260 |
| **Net** | **~$4,580/mo** |

**Top module author at 2,000 DAU:** if the leading module captures 8% of license volume, that is 1,624 events/wk × 0.002 SOL × 90% = 2.92 SOL/wk ≈ **$234/week, $1,013/month**, paid instantly to a wallet anywhere on earth, with the split enforced by the program rather than by a revenue-share agreement the platform can rewrite. That single number is the honest answer to "what does the chain add here", and it is one person, not a creator economy.

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

**Day one, a beam-search or SAT solver beats every human on CYCLES for a simple contract.** That is what optimisation games are; the Zachtronics community has run unbounded-solver divisions for over a decade. Detection is neither possible nor desirable. The design says so out loud on the front page.

**Structure:** two ladders sharing one verification path. **HAND** — self-declared, unenforced, socially policed, where the community actually lives. **OPEN** — anything goes, solver output explicitly welcome, where the record lives. `ladder:u8` is set per Score PDA at first verification and is immutable for that contract. Purse splits 60/40 HAND/OPEN.

**What a bot can extract:** the maximum possible purse is 0.75 SOL/week ≈ $60, split nine ways across three axes and two ladders. A top prize is roughly **$12**. Running a serious solver costs more than that in electricity. There is no per-account payout, no drop, no emission, and no airdrop — **multi-accounting extracts exactly zero**, and each additional account costs 0.00217 SOL in Score PDA rent. The economic surface a bot could farm is, by construction, not worth farming.

**Where a bot *is* paid:** modules. A solver that discovers a 5×4 sorter better than anything a human has built cashes out by certifying it and collecting 0.0018 SOL per licensed run — at scale, four figures a month. **So the bot operator's dominant strategy is to publish good components into the ecosystem, and everyone's machines get better.** That is not a mitigation, it is the intended equilibrium, and it is stated as policy so nobody feels cheated by it.

**Wash-trading a module** to fake popularity: a sybil paying itself loses 10% real SOL per wash plus gas. Additionally, module ranking uses **distinct payers weighted by ladder history**, not gross revenue, so wash volume moves nothing.

**Sponsored-gas farming:** 12 sponsored verifies/wallet/day; beyond that the wallet self-pays $0.0008. The relay refuses tx that fail simulation. Worst case bound on abuse is the daily relay budget, which is $1.10 at 1,000 DAU.

**The one genuine abuse** is a solver sniping every commission-board bounty. Mitigation: the poster selects a winner from a shortlist rather than first-past-the-post, may mark a bounty HAND-only, and escrow auto-refunds after 7 days with no acceptance. Repeat sniping means posters stop posting, which is self-correcting and cheap.

---

## 10. Legal posture

*Not legal advice. Get a written memo from US gaming counsel before the first purse pays out, and again before the module market opens.*

Apply the three prongs. **Consideration is removed from every competitive path, in code.** Entry to any contract, unlimited verification, ladder placement, and purse eligibility are free; gas is paid by the operator's relay, so a player with a zero-balance wallet is a first-class competitor. `verify_run` **never reads the `Pass` account** and prize eligibility is computed from Score PDAs alone — that assertion is a unit test named `pass_never_gates_competition`, and it is the load-bearing fact, because regulators assess what a product functionally is, not what it is labelled. **Chance is removed entirely:** the VM is integer-deterministic with a statically-sorted execution order; the weekly seed is symmetric, pre-committed, published before play, and derived by a pure on-chain function; there is no per-player randomness of any kind. With zero chance in the outcome, even the material-element states have nothing to bite on, and Florida's statutory bar on wagering on skill games is not engaged because there is no wager. **Prize exists** (a small SOL purse), which is fine: prize alone is a contest, not gambling.

**The structural choice** is Tier 0 with a free-entry skill-contest layer — the least ambitious posture available and deliberately so. No sweepstakes or dual-currency structure (Tier 2 is under active criminalisation in at least ten states with operator, supplier, and promoter liability, and Louisiana attaches up to five years). No yield-funded prizes. No offshore licence. No prediction contracts. **No geofence is required for the game**; the front end blocks OFAC-sanctioned jurisdictions as ordinary hygiene, nothing more.

The non-gambling exposures are ordinary commerce. The module marketplace is a **software licensing marketplace**: the program is non-custodial, lamports route atomically from licensee to author inside one instruction, and the developer never holds user funds, which keeps the analysis in the FinCEN 2019 non-custodial-software lane rather than the MSB lane. The bounty board is a services marketplace with non-custodial escrow. **Nothing in the system is a transferable asset** — licenses are pay-per-run with no NFT, no Token-2022, no secondary market — which is what keeps us clear of the UK "money's worth" test that catches Solana games with tradable NFTs, and clear of any securities analysis of a royalty stream.

**Genuinely unresolved, listed honestly:**
1. **Purse funding optics.** The purse comes from general revenue at a published fixed rate, but a regulator could squint at Pass revenue → purse and see entrant money. Mitigation: the rate is fixed and capped regardless of participation, Pass holders have no eligibility advantage, and the accounting is published. If counsel is uncomfortable, fund the purse exclusively from module/bounty rake, which is commerce revenue with no entrant nexus. That switch is a one-line config change and should be pre-drafted.
2. **Archived ladders must never pay a prize.** If they ever did, the Pass (which unlocks archives) would become consideration for a contest. This is a permanent product constraint, not a preference.
3. **Author payouts and tax reporting.** Pseudonymous wallets make W-9 collection impractical. Cap cumulative uncollected-KYC author payouts at **$600/calendar year per wallet** in program logic; above that the payout accrues to a claim PDA that requires a completed W-9 through the front end before release. This is the least-bad answer and it is imperfect.
4. **State contest-registration statutes.** A handful of states have prize-promotion registration/bonding thresholds (commonly $5,000+ prize value). At 0.75 SOL/week we are two orders of magnitude below every one of them, but that changes if the purse ever grows — so the purse growing is a legal decision, not a marketing one.

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
| **Week 12** | Pass conversion < 6% of weekly actives | The $5 has no perceived value. Stop monetising, keep shipping content, revisit at week 20. Do not respond by gating gameplay — that trades the legal posture for pennies. |
| **Week 10 (module launch + 4)** | < 25 certified modules **or** < 15% of verified runs contain a licensed module | Cut the module market. Accept that the chain is a notary and that the revenue ceiling is ~$300/mo. This is a real outcome, not a failure — but stop paying engineering time for it. |
| **Any week** | > 4% of verify txs fail to land after 3 attempts, **or** median run CU > 1.2M | **Freeze all feature work** until fixed. Landing reliability is the product; a dropped verification reads to the player as the game stealing their work. |
| **Any time** | A parity divergence between WASM and on-chain reaches production | **P0, take the site to read-only.** The entire value proposition is that the score is not a claim. One divergence is worse than a month of downtime. |
| **Week 16, hard stop** | < 200 weekly actives **and** < $800/mo revenue | The audience thesis — that enough Zachtronics-shaped people can be reached without saying "crypto" — is falsified. Archive, open-source the VM and the program, keep the ladder running. Do not raise money to keep going; running out of money while looking for a retaining loop is the second-most-common way these die. |

**The risk that actually kills this is audience, not design.** ~3.2M daily Solana wallets, overwhelmingly present to trade. The channels that reach puzzle-game players punish or ban crypto; the channels that welcome crypto deliver people who bounce in ninety seconds because there is nothing to speculate on. There is no workaround, only a choice: this spec chooses the gamers, hides the chain completely, never says the word, and targets a few hundred devoted people and $1–5k/month. If that number is not acceptable, do not build this.