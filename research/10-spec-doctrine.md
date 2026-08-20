# DOCTRINE — Build Spec v1

**Target:** one Solana engineer, 4 weeks to first live day, 8 weeks to the paid tier decision.
**Prizes:** USDC. **No token. No NFTs. No asset sale.**
**Single biggest change from the concept doc:** v1 ships **free-to-enter with a real prize**. Consideration is removed, which deletes the entire gambling analysis, the geofence, KYC, and the MSB question from the MVP. Paid entry is a Phase-B decision gated on a metric, and when it arrives the pool is **pre-funded and fixed before entry opens**, not derived from entries.

---

## 1. Tightened design

| Parameter | Value | Why this number |
|---|---|---|
| Board | 12×12 square grid, Chebyshev distance, 8-way movement | 144 tiles keeps a single-tick on-chain re-execution inside 200k CU (see §3.7). 16×16 does not. |
| Tick budget | 200 ticks | 300 was 50% more compute for no observed decision depth; 200 forces commitment by ~tick 120. |
| Roster | 12 unit types, integer stats only | §2.2 |
| Army | ≤100 points, ≤9 units, ≥1 unit | 9-unit cap bounds per-tick cost at 18 units/battle and makes the on-chain tick fit. |
| Deployment | Player assigns each unit a tile in a 12×3 home band (36 tiles) | Doubles strategic surface for ~60 lines of UI. |
| Behavior program | 12 slots, each `(scope, condition, cond_param, action, target, priority)` = exactly 3 bytes | §2.3 |
| Role scoping | Each unit gets a role tag A/B/C at list-build; each slot targets A, B, C, or ALL | This is the design decision that makes 12 slots sufficient. Without it you need 36. |
| Doctrine wire size | **56 bytes** (1 header + 9×2 unit + 12×3 slot) | Fits trivially in a 1,232-byte L1 tx. SIMD-0296 not needed. |
| Randomness in engine | **Zero.** No PRNG, no floats, no hash-map iteration, no clock. | §4 |
| Pairing | **Double round-robin** — every pair plays twice, colors swapped, scores summed | Removes side bias structurally instead of arguing about it. |
| Field cap v1 | 400 human entrants (159,600 battles ≈ 60s on 8 vCPU) | Swiss is not in MVP. |
| Daily cycle (UTC) | 00:00 scenario reveal → 22:00 commits close → 22:00–22:30 reveal window → ~22:45 standings → 23:00 payouts pushed | 1h slack before the next scenario. |
| Re-commit | Free and unlimited until 22:00 | Deliberately flattens the deadline rush; nothing is revealed early so there is no informational reason to submit late. |
| Prize pool | **60% of trailing-30-day revenue ÷ 30, floor $25/day, single-prize cap $2,500** | Published formula. Prizes are a fraction of *realized consumption revenue*, never of today's entries. |
| Paid ranks | top 20% of eligible entrants, min 3. Weight `w_i = 10000/(i+2)`, `payout_i = pool·w_i/Σw` | At 100 entrants, $180 pool: 1st $27.4, 20th $3.7. |
| Entry price | **$0 in Phase A.** $2 USDC in Phase B, pool = 90% of trailing gross, announced ≥24h ahead. | §7, §10 |
| Rating | Glicko-2 on daily rank percentile. Bands: Novice (<1400) and Open. Permanent graduation after 3 top-10% finishes. | Solver operators exit Novice in a week; new players never face them. |
| Content cadence | Exactly one new condition, action, target selector, or unit **per week**, announced 48h ahead | The meta-reset lever. |
| Session length | Sandbox median 14 min/day; entry day 25–40 min; next-morning results review 4 min | The overnight gap is the retention mechanism. |
| Championship | Monthly, top 64 by cumulative points. Funded at 20% of trailing revenue, hard cap $2,500. | Cap is legal, not economic (§10). |

**What was deleted from the concept doc and why:**
- Per-entrant escrow PDAs with their own ATAs. At 400 entries/day peak load is ~7 tx/s against a 30M CU/s per-writable-account budget — 0.05% utilization. The sharding cost $33/day of ATA rent and 10 sweep transactions of critical daily plumbing. Single vault, one 192-byte record per entrant. (§3.5)
- Merkle-proof pull-claims. Replaced by an on-chain sorted payout table + push-by-default. (§3.4)
- MagicBlock ER/PER. There is no real-time input loop here; the only sub-second interaction is local wasm. Saying so is more credible than shoehorning it. One legitimate future use is noted in §3.6.
- "Re-execute a disputed battle on-chain." Replaced by hash-chain bisection to a single disputed **tick** (§3.7), which is the only version that actually fits.

---

## 2. Rules of play

### 2.1 The scenario

At 00:00 UTC a scenario is revealed: a 12×12 map, three objective tiles, and the deployment bands. Terrain per tile is one of:

- **Open** — move cost 1.
- **Rough** — move cost 2. Skirmishers ignore this.
- **Cover** — move cost 1; a unit standing in Cover takes −1 damage from ranged attacks, and each Cover tile on the straight line between shooter and target costs the shooter −1 damage (floor 1).
- **Wall** — impassable, blocks nothing else (there is no line-of-sight system; ranged attacks pass over Walls). Sappers can destroy a Wall in 2 ticks.

Both sides get an identical map, mirrored across the horizontal midline, so terrain is perfectly symmetric. Blue deploys in rows 9–11, Red in rows 0–2.

### 2.2 The roster (all values integer, final)

| # | Unit | Cost | HP | MP | Range | Dmg | Armor | Trait |
|---|---|---|---|---|---|---|---|---|
| 0 | Militia | 8 | 10 | 2 | 1 | 3 | 0 | +1 dmg if ≥1 friendly adjacent |
| 1 | Spear | 12 | 14 | 2 | 1 | 4 | 1 | +3 dmg vs targets with MP≥3 |
| 2 | Shield | 14 | 22 | 1 | 1 | 3 | 3 | adjacent allies get +1 armor |
| 3 | Archer | 13 | 10 | 2 | 4 | 4 | 0 | Cover penalty applies (see 2.1) |
| 4 | Ballista | 20 | 12 | 1 | 6 | 7 | 0 | min range 2; cannot fire if any enemy adjacent |
| 5 | Skirmisher | 11 | 9 | 4 | 2 | 3 | 0 | ignores Rough move cost |
| 6 | Cavalry | 18 | 16 | 4 | 1 | 6 | 1 | +50% dmg (round down) if it moved ≥3 tiles this tick |
| 7 | Sapper | 10 | 8 | 2 | 1 | 2 | 0 | SPECIAL: destroy adjacent Wall (2 ticks) or convert own Open tile to Cover (2 ticks) |
| 8 | Medic | 12 | 8 | 2 | 2 | 0 | 0 | SPECIAL: heal 3 HP to the lowest-HP damaged ally within 2 |
| 9 | Standard | 15 | 12 | 2 | 0 | 0 | 1 | allies within 3 get +1 dmg |
| 10 | Scout | 6 | 6 | 3 | 1 | 1 | 0 | counts as 2 units for objective control |
| 11 | Mortar | 22 | 10 | 1 | 5 | 5 | 0 | min range 3; fires every other tick; hits the 3×3 around target, **including friendlies**, at full damage |

Intended counter-web: swarm (Militia/Scout) ← Mortar/Archer. Cavalry/Skirmisher ← Spear. Ballista ← Cavalry rush. Shield wall ← Mortar/Sapper. Medic/Standard ← Ballista snipe. Mortar ← anything fast that closes to range 2.

### 2.3 The behavior program

Twelve slots. Each slot is `(scope, condition, cond_param, action, target, priority)` packed into 24 bits: scope 2b, condition 5b, param 4b, action 5b, target 4b, priority 4b.

**Scope:** `A | B | C | ALL` — matches the role tag the player assigned to each unit at list-build.

**Conditions (20):** `ALWAYS`, `ENEMY_WITHIN(n)`, `NO_ENEMY_WITHIN(n)`, `SELF_HP_BELOW(20/40/60/80%)`, `SELF_HP_ABOVE(...)`, `ALLIES_WITHIN_3_ATLEAST(k)`, `OUTNUMBERED_LOCAL` (enemies within 3 > allies within 3), `OUTNUMBERING_LOCAL`, `TICK_AFTER(n)`, `TICK_BEFORE(n)`, `WE_HOLD_OBJ(1/2/3/ANY)`, `THEY_HOLD_OBJ(...)`, `CONTROL_LEAD`, `CONTROL_BEHIND`, `NEAREST_ENEMY_IS(FAST|RANGED|ARMORED|SUPPORT)`, `ENEMY_IN_MY_RANGE`, `IN_COVER`, `NOT_IN_COVER`, `ROLE_X_ALIVE_ATLEAST(k)`, `ENEMY_LOSSES_ABOVE(25/50/75%)`.

**Actions (16):** `HOLD` (stay; attack if a target is in range after movement), `ADVANCE` (move toward target), `ATTACK` (move to within range of target, then attack), `RETREAT` (maximize distance from nearest enemy), `FALL_BACK_TO_COVER`, `CAPTURE` (move to within 1 of the target objective, then stop), `GUARD_OBJ` (stay within 2 of objective; attack in range), `SCREEN_ROLE(x)` (move to a tile on the line between the nearest enemy and the nearest ally of role x), `FLANK` (move to a tile adjacent to target that is adjacent to no other enemy), `REGROUP_ROLE(x)` (move toward the integer centroid of role x), `KITE` (if an enemy is within `my_range − 1`, step directly away; otherwise attack), `BLOCK_CHOKE` (move to the lowest-degree passable tile on the shortest path from the enemy centroid to our nearest objective), `SPREAD` (maximize distance to nearest ally), `FOCUS_FIRE` (attack whatever the lowest-index living ally with a target is attacking), `CHARGE_LOWEST_HP`, `SPECIAL` (unit-specific; falls through to `HOLD` for units with no special).

**Target selectors (16):** `NEAREST_ENEMY`, `LOWEST_HP_ENEMY`, `HIGHEST_DMG_ENEMY`, `NEAREST_RANGED`, `NEAREST_FAST`, `NEAREST_ARMORED`, `NEAREST_SUPPORT`, `WEAKEST_ARMOR`, `ENEMY_ON_OBJ`, `ENEMY_CENTROID`, `OBJ_1`, `OBJ_2`, `OBJ_3`, `NEAREST_OBJ`, `MOST_CONTESTED_OBJ`, `SELF`.

**Slot selection, per unit, per tick:** scan all 12 slots in index order; keep those whose scope matches the unit's role (or is `ALL`) **and** whose condition evaluates true against the frozen tick-start snapshot. Execute the survivor with the highest `priority`; ties break to the **lowest slot index**. If none fire, the published default is `ADVANCE → NEAREST_OBJ`.

### 2.4 Tick resolution order (this is the whole engine)

1. **Freeze.** Snapshot all positions, HP, and control state. Every condition and every target selector reads only the snapshot.
2. **Slot evaluation.** Each living unit picks exactly one (action, target tile-or-unit).
3. **Movement, in up to 4 substeps.** At substep *k*, every unit whose MP ≥ *k* and whose action requires movement takes one step along a BFS path computed on the frozen terrain with neighbor tie-break order **N, NE, E, SE, S, SW, W, NW**. Occupancy is re-checked against positions after substep *k−1*.
   - **Contested tile:** if two or more units intend the same tile in the same substep, **all of them stay put** for that substep. No side priority, no unit priority. This is the only conflict rule and it is color-independent.
   - **Swap:** if A steps into B's tile while B steps into A's, both stay.
   - Rough costs 2 MP, so a unit entering Rough consumes substeps *k* and *k+1*.
4. **Attacks, simultaneous.** Every unit re-resolves its target selector against **post-movement** positions. If a target is within range (and min-range/adjacency constraints are satisfied), it attacks. Damage `= max(1, base + trait_bonuses + aura_bonuses − target_armor − cover)`. All damage is computed from post-movement positions before any is applied.
5. **Apply.** Subtract all damage, then apply all Medic healing (capped at max HP), then remove every unit at ≤0 HP. Mutual kills are real: a unit that dies this tick still dealt its damage.
6. **Score.** For each objective, count sides with ≥1 living unit within Chebyshev 1 of the objective tile (Scouts count 2). If exactly one side is present, that side gains `+1` control point (`+2` if only Scouts are present and they total ≥2). If both are present, the objective is **contested** and nobody scores.
7. `tick += 1`. Battle ends at tick 200, or when one side has no living units (the survivor continues to accrue control points to tick 200 as if unopposed — so wiping the enemy early is worth a lot).

**Result:** higher control points wins. Tie → higher remaining total HP. Still tied → draw.

**Tournament scoring:** 3 points per battle win, 1 per draw, 0 per loss; every pair plays twice with colors swapped. Rank by points, then total control-point margin, then head-to-head, then **lower total army cost** (rewards efficiency), then earlier commit timestamp. Fully deterministic, published in advance.

### 2.5 Worked example — tick 47

Map "Ford". Objectives O1(2,5), O2(6,6), O3(9,7). Rough tiles across row 6 except the ford at columns 5–7. Cover at (4,4) and (8,8). Blue deploys rows 9–11.

**Blue "Ford Denial"** — Shield, 2× Spear, 2× Archer, Skirmisher, Cavalry, Scout = 99 pts, 8 units. Roles: A = Shield + Spears (line), B = Archers (fire), C = Cavalry + Skirmisher + Scout (raid).

Relevant Blue slots:
```
S0  A  ENEMY_WITHIN(2)      HOLD      NEAREST_ENEMY    prio 12
S1  A  ALWAYS               GUARD_OBJ OBJ_2            prio 4
S3  A  ALWAYS               ATTACK    NEAREST_ENEMY    prio 6
S4  B  ENEMY_IN_MY_RANGE    FOCUS_FIRE LOWEST_HP_ENEMY prio 11
S5  B  ENEMY_WITHIN(2)      KITE      NEAREST_ENEMY    prio 14
S8  C  ALWAYS               CAPTURE   NEAREST_OBJ      prio 6
```

**Red "Standard Swarm"** — 6× Militia, 2× Skirmisher, Standard = 85 pts, 9 units, all role ALL.
```
T0  ALL OUTNUMBERING_LOCAL  ATTACK    NEAREST_ENEMY    prio 10
T1  ALL ALWAYS              CAPTURE   NEAREST_OBJ      prio 5
```

**State at tick-47 freeze:**

| Unit | Tile | HP |
|---|---|---|
| B3 Spear (A) | (6,7) | 14/14 |
| B4 Spear (A) | (5,7) | 14/14 |
| B5 Archer (B) | (6,9) | 10/10 |
| B6 Skirmisher (C) | (6,8) | 9/9 |
| R1 Militia | (5,5) | 10/10 |
| R2 Militia | (6,5) | 7/10 |
| R9 Standard | (6,3) | 12/12 |

R9's aura radius is 3: Chebyshev((6,3),(5,5)) = 2 and ((6,3),(6,5)) = 2, so **R1 and R2 both have dmg 4**.

**Step 2 — slot evaluation (all against the freeze):**

- **B3 Spear** — nearest enemy R2 at Chebyshev 2. `ENEMY_WITHIN(2)` true → S0 (prio 12) beats S3 (6) and S1 (4). Action **HOLD**.
- **B4 Spear** — nearest enemy R1 at Chebyshev 2. Same → S0, **HOLD**… except S0's `HOLD` still needs a target for the attack step; R1 is at distance 2, out of range 1. *For the illustration, assume B4's doctrine sets S0 to `prio 3` — so S3 (prio 6) fires instead: **ATTACK → NEAREST_ENEMY = R1**.*
- **B5 Archer** — nearest enemy at Chebyshev 4. `ENEMY_WITHIN(2)` false, so S5 does not fire. `ENEMY_IN_MY_RANGE` (range 4) true → **S4, FOCUS_FIRE on LOWEST_HP_ENEMY = R2 (7 HP)**. No movement.
- **B6 Skirmisher** — S8, **CAPTURE → NEAREST_OBJ = O2 (6,6)**, currently at distance 2.
- **R1 Militia** — enemies within 3: B4, B3 (2). Allies within 3: R2, R9, +2 offscreen Militia (4). `OUTNUMBERING_LOCAL` true → **T0, ATTACK → NEAREST_ENEMY = B4 at (5,7)**.
- **R2 Militia** — same condition → **T0, ATTACK → NEAREST_ENEMY = B3 at (6,7)**.

**Step 3 — movement substeps.**

*Substep 1:*
- R1 needs a tile adjacent to (5,7). Candidates at distance 1 from (5,5): (5,6). Intends **(5,6)**.
- B4 needs a tile adjacent to (5,5). From (5,7) the nearest is (5,6). Intends **(5,6)**.
- → **Contested. Both stay.** R1 remains (5,5), B4 remains (5,7). The ford is jammed; neither will be in range this tick.
- R2 needs a tile adjacent to (6,7). From (6,5): (6,6) is at distance 1 and lies in direction S, which precedes SW→(5,6) and SE→(7,6) in the tie-break order. Moves to **(6,6)**.
- B6 wants to reach within 1 of (6,6). From (6,8), N=(6,7) is occupied by the stationary B3, so BFS takes NE=(7,7), which is already within 1 of O2 → moves to **(7,7)** and stops.
- B3 and B5 do not move (HOLD / in-range fire).

*Substeps 2–4:* B6 (MP 4) has satisfied `CAPTURE` and stops. R1/R2 (MP 2) have no further legal improving step — R2 is now adjacent to its target; R1 is still blocked because B4 is still standing on the only improving tile.

**Step 4 — attacks, from post-movement positions, all simultaneous:**

- **B5 Archer → R2** at (6,6): Chebyshev 3 ≤ range 4. Line (6,9)→(6,6) crosses no Cover. Damage = 4 + 0 − 0 armor − 0 cover = **4**.
- **B3 Spear → R2** at (6,6): now Chebyshev 1, in range. Spear trait needs target MP ≥ 3; Militia MP 2, so no bonus. Damage = 4 − 0 = **4**.
- **R2 → B3**: in range 1. Damage = 3 base + 1 (R9 aura, Chebyshev((6,3),(6,6)) = 3 ≤ 3) − 1 (B3 armor) = **3**.
- **R1**: B4 is at Chebyshev 2 > range 1. No attack.
- **B4**: R1 at Chebyshev 2. No attack.

**Step 5 — apply.** R2: 7 − 8 = −1 → **removed**. B3: 14 − 3 = 11. Note R2 landed its 3 damage on the tick it died; simultaneity is what makes trades honest and what makes `FOCUS_FIRE` a real decision rather than a free kill.

**Step 6 — score.** O2 at (6,6): Blue has B6 at (7,7), Chebyshev 1 → present. Red's only unit within 1 was R2, now dead → absent. **Blue +1 control point.** O1 and O3 unchanged.

The lesson a player takes from the replay panel: B3's `HOLD` at priority 12 is what let R2 walk into a two-on-one. Had S0 been `KITE` instead, R2 would have been left alive at 3 HP and B3 would be at 14. The "why did I lose" panel surfaces exactly this — the slot ID that fired, per unit, per tick.

---

## 3. On-chain architecture

Program `doctrine`, Anchor. Rent uses the 128-byte account overhead: `rent = (data_len + 128) × 6,960` lamports.

### 3.1 PDAs

| Account | Seeds | Data bytes | Rent (SOL / $80) |
|---|---|---|---|
| `Config` | `["config"]` | 208 | 0.00234 / $0.19 (once) |
| `Round` | `["round", round_id: u32 LE]` | 272 | 0.00278 / $0.22 per day |
| `RoundVault` authority | `["vault", round_id]` | 0 (PDA signer only) | — |
| Vault USDC ATA | ATA of `RoundVault` | 165 | 0.00204 / $0.16 per day |
| `Entry` | `["entry", round_id, player: Pubkey]` | 192 | 0.00223 / $0.18 per entry |
| `Payouts` | `["payouts", round_id]` | 22 + 40·K | K=80 → 3,222 B → 0.0233 / $1.87 |

**`Config` (208 B):** `authority: Pubkey(32)`, `treasury: Pubkey(32)`, `relayer: Pubkey(32)`, `usdc_mint: Pubkey(32)`, `entry_fee: u64(8)`, `pool_floor: u64(8)`, `field_cap: u16(2)`, `engine_hash: [u8;32](32)`, `param_timelock_until: i64(8)`, `flags: u8`, `bump: u8`, pad. `authority` is a Squads 2/3 multisig with a 24h execution timelock (§10 is honest about what that is and is not worth).

**`Round` (272 B):** `round_id: u32`, `scenario_commit: [u8;32]`, `scenario_seed: [u8;32]` (zero until open), `btc_height: u32`, `guaranteed_pool: u64`, `pool_funded: u64`, `entry_fee: u64`, `open_ts/close_ts/reveal_end_ts: i64 ×3`, `entrants: u32`, `reveals: u32`, `fees_collected: u64`, `standings_root: [u8;32]`, `leaves_uri: [u8;64]` (Arweave tx id), `engine_hash: [u8;32]`, `state: u8` (`Created|Open|Sealed|Settled|Swept`), `bump: u8`.

**`Entry` (192 B):** `player: Pubkey(32)`, `rent_payer: Pubkey(32)`, `round_id: u32(4)`, `commit_hash: [u8;32](32)`, `doctrine: [u8;56](56)`, `committed_at: i64(8)`, `revealed_at: i64(8)`, `fee_paid: u64(8)`, `flags: u8` (revealed / refunded / paid / house), `rank: u16(2)`, `bump: u8`, pad. **No per-entry token account.**

**`Payouts` (variable):** `round_id: u32`, `count: u16`, `total: u64`, then `count` × `(winner: Pubkey(32), amount_usdc: u64(8))` **sorted ascending by pubkey** so `claim` binary-searches in ~7 comparisons.

### 3.2 Instructions

| Ix | Signers | Args | Notes |
|---|---|---|---|
| `init_config` | authority | params | once |
| `create_round` | authority, treasury_ata | `round_id, scenario_commit[32], btc_height, guaranteed_pool, open_ts, close_ts, reveal_end_ts, engine_hash` | **Asserts `open_ts − now ≥ 86_400`** and CPI-transfers `guaranteed_pool` USDC from treasury into the round vault in the same transaction. This instruction *is* the legal structure: the prize is funded, fixed, and public a full day before anyone can enter. |
| `fund_pool` | anyone, funder_ata | `round_id, amount` | Permissionless top-up while `state == Created`. Sponsor slots use this. |
| `open_round` | anyone (crank) | `round_id, nonce[32], btc_hash[32]` | Asserts `now ≥ open_ts`, asserts `sha256(nonce ‖ btc_hash) == scenario_commit`, writes `scenario_seed = sha256(nonce ‖ btc_hash ‖ round_id)`, `state = Open`. |
| `commit` | player, relayer(fee payer) | `commit_hash[32]` | `init_if_needed` Entry (`rent_payer = relayer`). Asserts `open_ts ≤ now < close_ts`. First call CPI-transfers `entry_fee` (0 in Phase A) player_ata → vault_ata. Subsequent calls only overwrite `commit_hash`. |
| `reveal` | player, relayer | `doctrine[56], salt[16]` | Asserts `close_ts ≤ now < reveal_end_ts`, asserts `sha256(doctrine ‖ salt ‖ player ‖ round_id_le) == commit_hash`. Sets `doctrine`, `revealed`. |
| `publish_payouts` | authority | `round_id, offset, chunk[]` | `realloc` ≤10,240 B/ix. K=80 fits in one instruction. |
| `finalize_round` | authority | `round_id, standings_root[32], leaves_uri[64]` | Asserts `now ≥ reveal_end_ts`, asserts `Payouts.total == pool_funded`, `state = Settled`. |
| `push_payouts` | relayer | `round_id, start, count` | Up to 15 winners per tx: `create_idempotent` dest ATA + CPI transfer from vault, mark `Entry.paid`. |
| `claim` | player, relayer | `round_id` | Fallback. Binary-search `Payouts` for `player`, transfer, mark paid. Always available — a winner never depends on the operator. |
| `refund_entry` | anyone (crank) | `round_id, player` | If `!revealed && now > reveal_end_ts`: return `fee_paid` to player, close Entry, rent → `rent_payer`. In Phase A `fee_paid == 0` and this is pure garbage collection. |
| `close_entry` | anyone (crank) | `round_id, player` | After `reveal_end_ts + 24h` and `paid || no_payout`. Rent → `rent_payer`. |
| `sweep_round` | authority | `round_id` | After `reveal_end_ts + 14d`: unclaimed USDC → treasury, close vault ATA and Round. |
| `set_params` / `pause` | authority | | Any parameter change takes effect only after `param_timelock_until`; the pool formula and roster are published data, not on-chain params. |

### 3.3 Where things live

- **Client (browser wasm, ~150 KB gz):** the entire sandbox. Every battle a player runs while designing is local. Zero network, zero chain, zero cost.
- **Operator (native Rust, same crate):** the tournament run. 400 entrants → 159,600 battles at ~3 ms ≈ 60 s on 8 vCPU.
- **L1 Solana:** prize custody, the pre-funding proof, commit hashes, revealed doctrines, the payout table, transfers. Nothing else.
- **Arweave:** the full standings table, every battle's tick-state hash chain root, and the engine binary hash. Referenced by `leaves_uri`; the Merkle root of it is in `Round`.
- **Ephemeral rollup: not used.** No real-time loop exists. The one future use worth the dependency is a **Private ER (TEE)** for sealed submission, which would remove the reveal step entirely (§4.4). Not in v1.

### 3.4 The single-point-of-failure fix

The concept doc's "winners pull with a Merkle proof" had nowhere for the leaves to live. Two independent guarantees replace it:

1. **The payout table is an on-chain account.** A winner needs nothing but the chain to claim.
2. **The full standings are recomputable from L1 alone.** Every revealed doctrine is 56 bytes sitting in an `Entry` account. Scenario seed is in `Round`. Engine hash is in `Round`. Anyone can pull 400 accounts, run the pinned engine build, and reproduce the exact standings and the exact payout table. If the VPS, the domain, and Arweave all vanish, the tournament is still verifiable and the money is still claimable.

### 3.5 Account contention — explicit

Hot writable accounts per commit: **`Round`** (entrant counter) and **the round vault ATA** (Phase B only; in Phase A there is no transfer, so only `Round` is hot).

- Worst case is 400 commits in the final 60 s = **6.7 tx/s**.
- `commit` costs ~15,000 CU. That is **~100,000 CU/s** against the per-writable-account ceiling of **12M CU per block = 30M CU/s at 400 ms, 34.3M CU/s at 350 ms**. Utilization: **0.3%.**
- The real constraint is not CU, it is that a write-locked account serializes those transactions into one scheduler lane. At 6.7 tx/s that is irrelevant. The design breaks at roughly **3,000 commits in the final 60 seconds**, which would be the largest event of this kind ever run.
- **Escape hatch, documented but not built:** 16 shard vaults `["vault", round_id, shard: u8]` keyed by `player_pubkey[0] & 0x0F`, plus a 16-way `Round` counter. Swept at close in one transaction (16 transfers, ~180k CU, ~40 account locks — inside both the 1.4M CU and 64-lock limits). Build this if a day exceeds 1,500 entrants; not before.
- **Local fee markets** work in our favor: the priority fee on `Round`/vault reflects only our own traffic, which is ~7 tx/s. Budget 20,000 lamports priority per deadline-window tx as insurance, not necessity, and **set the CU limit to the measured p99 rather than the max** — priority fee scales with CU *requested*.
- Deliberate load-flattening: re-commit is free and unlimited, and nothing is revealed before the deadline, so there is no informational incentive to submit late. The UI shows a "safe submit" cutoff 90 s before `close_ts` and nags from T−2h.

### 3.6 The landing layer

Non-optional. `sendTransaction` with a fresh blockhash and a blind retry visibly drops entries.

- Relayer is fee payer for every player transaction. Players hold no SOL, ever.
- Blockhash from a leader-tracking RPC; CU limit set from a measured per-instruction p99 × 1.2; priority fee from `getRecentPrioritizationFees` over the exact writable set, with a floor.
- Send via **Helius Sender** plus two fallback RPCs concurrently; re-send every 2 s until confirmed or blockhash expiry; on expiry rebuild against a **durable nonce** drawn from a pool of 32 nonce accounts (rent 0.00144 SOL each, one-time).
- Client-side: the reveal transaction is auto-submitted the moment the window opens if the tab is open, with a push/email nag at T−20 min and T−5 min.

### 3.7 Fraud proof (Phase C design, week-1 CU spike)

The concept doc proposed re-executing a whole disputed battle on-chain. Budget check: BFS pathfinding alone is ~1,152 ops per unit per tick; 200 ticks × 18 units = **4.1M ops**. That does not fit in 1.4M CU and never will.

Correct design — **bisection to a single tick**:
- The runner publishes, per battle, a hash chain `h_t = sha256(h_{t−1} ‖ state_t)` where `state_t` is the packed 18-unit state (~160 bytes). The final `h_200` is a leaf under `standings_root`.
- A challenger who disagrees does an on-chain interactive bisection over 200 ticks: 8 rounds of "which half diverges", each round one tiny transaction.
- The program then re-executes **one tick**: 18 units × ~1,152 ops ≈ 20,700 ops × ~10 CU ≈ **207,000 CU** — two instructions inside one transaction, comfortably under the 1.4M cap, with the ~340-byte tick state carried in a scratch account (well under the 10,240 B/ix realloc cap).
- A successful challenge slashes an operator bond and reverts the round to re-run.

**Week 1 deliverable: build one tick for `sbf` and print the real CU number.** If it exceeds ~400k, the roster's per-tick cost is wrong and the fix (smaller board, distance-field caching, fewer units) is cheap in week 1 and impossible in month 6.

---

## 4. Fairness & randomness

### 4.1 The engine contains no randomness at all

Not "seeded randomness" — none. No PRNG, no floats, no `HashMap` iteration, no `Instant`, no threads, no `unsafe`. Enforced by `#![no_std]`, `#![forbid(unsafe_code)]`, a `clippy` deny list on float types, and a CI grep. Every tie-break in the engine is a documented total order: neighbor direction order N→NW, unit index ascending, slot index ascending.

**Attack defeated:** none directly — but this is the load-bearing fact for §10. There is no chance element to be material, so DOCTRINE survives the **material-element** and **any-chance** state tests, not merely predominance.

### 4.2 Symmetry, and why it does double duty

- Terrain is mirrored across the horizontal midline. Objectives are on the mirror line or in mirrored pairs.
- Every pairing is played **twice with colors swapped** and the scores summed.
- The one place a first-mover advantage could hide — movement conflicts — is resolved by **mutual block**: contested tile, everybody stays. No side term, no unit-cost term, no index term. Color-independent by construction.
- In double round-robin every entrant plays every other entrant exactly twice. **There are no pairing decisions to manipulate**, so matchmaking variance — the residual chance argument that bites 1v1 formats — does not exist.

Legally: symmetry means each entrant faces an identical, complete, public problem, and the outcome is a pure function of design quality. It is the same posture a chess open or a Kaggle leaderboard has, and it is stronger than any Skillz title, which relies on seeded-identical boards but still has per-match execution variance.

### 4.3 Scenario seed: committed 24h early, unpredictable to everyone including the operator

`create_round` stores `scenario_commit = sha256(operator_nonce ‖ btc_block_hash(H))` and the Bitcoin block height `H`, at least 24 hours before `open_ts`. At open, `open_round` publishes `operator_nonce` and `btc_block_hash(H)`; the program recomputes the hash and rejects a mismatch, then derives `scenario_seed = sha256(nonce ‖ btc_hash ‖ round_id)` and generates the map deterministically from it.

**Attacks defeated:**
- *Operator grinds a favorable map.* The operator's contribution is hash-committed a day early; the Bitcoin block at height H does not exist yet. Neither party can steer the result.
- *Operator leaks the map early to a confederate.* Worth close to nothing: the map is public to all entrants a full 22 hours before the deadline, and the binding constraint is the hidden field, not the map. Belt and braces: the operator's wallets are published and any entry from them is void.
- *Slot-hash grinding.* Not used anywhere. Validators cannot influence anything here.
- No VRF, no callback transaction, no oracle latency, no oracle cost.

### 4.4 Sealed submission: what commit-reveal buys and what it costs

`commit_hash = sha256(doctrine ‖ salt ‖ player ‖ round_id)` includes the player's pubkey, so a commit cannot be copied off-chain and replayed by a second wallet.

**Attack defeated — the whole reason the chain is here:** if submissions sat in a database, the operator (or anyone with DB access) could enter a doctrine at T−1 second that is a best response to the entire field. In a contest where the prize depends on beating everyone, that single suspicion is fatal and unfalsifiable. An on-chain hash with a `Clock`-enforced deadline makes late best-response structurally impossible and publicly checkable by anyone, forever.

**The cost, and the fix.** A player who misses the reveal window loses their work. In the concept doc, forfeited entries rolled into the pool — meaning the operator profited from its own infrastructure failing. That is deleted:

- **Phase A: entry is free**, so a missed reveal costs nothing but a day.
- **Phase B: a missed reveal is refunded in full, automatically, by a permissionless crank.** The pool is fixed and pre-funded, so a no-show adds nothing to it. There is no forfeiture revenue and therefore no incentive misalignment.
- Anti-griefing: more than 3 no-reveals in a rolling 30 days suspends refund eligibility (published rule).
- Defense in depth: 30-minute window, tab auto-submit, durable-nonce retry, two nags.

Note the design constraint that rules out "just auto-reveal for them": any pre-signed or escrowed reveal necessarily hands the plaintext doctrine to the operator before the deadline, which reintroduces the exact attack commit-reveal exists to kill. The only clean removal of the reveal step is a **TEE-backed Private Ephemeral Rollup** holding sealed submissions and committing them all at once at the deadline — a real Phase-C option that trades a nothing-to-trust design for a trust-the-attestation design. Not in v1.

### 4.5 Cross-target bit-identity

The browser sandbox tells the player what their doctrine does; the native runner decides who gets paid. Divergence is "the sandbox lied to me" — the single most trust-destroying bug class in this product.

- One `no_std` crate, three targets: `x86_64` (runner), `wasm32-unknown-unknown` (sandbox), `sbf` (future adjudicator).
- Differential fuzz harness: 100,000 random (map, doctrine, doctrine) triples per CI run; assert the final state hash and the full tick hash chain are byte-identical across all built targets. A single divergence fails the build.
- A golden corpus of 500 battles with committed final-state hashes lives in the repo; any engine change that alters a golden hash requires a version bump.
- `Round.engine_hash` pins the exact build that decides the round. Sandbox displays the engine hash it is running and warns loudly if it differs from today's round.

---

## 5. Cost model

SOL at **$80**. Base fee 5,000 lamports/signature.

### 5.1 Estimated CU per instruction

| Instruction | Est. CU | Request | Notes |
|---|---|---|---|
| `commit` (first, Phase B) | ~15,000 | 25,000 | Entry init CPI ~3,000 + SPL transfer CPI ~6,000 + logic |
| `commit` (re-commit / Phase A) | ~6,000 | 12,000 | write-only |
| `reveal` | ~8,000 | 15,000 | sha256 syscall over 104 B ≈ 250 CU + 56 B write |
| `publish_payouts` (3,222 B) | ~16,000 | 30,000 | realloc + memcpy |
| `finalize_round` | ~9,000 | 15,000 | |
| `push_payouts` (15 winners) | ~110,000 | 160,000 | 15 × (idempotent ATA ~2,000 + transfer ~4,500) |
| `claim` | ~20,000 | 30,000 | binary search over 3,222 B + transfer + close |
| `refund_entry` / `close_entry` | ~10,000 | 15,000 | |
| `create_round` | ~14,000 | 25,000 | includes pool funding CPI |

Always set an explicit `ComputeBudget` limit from the measured p99. Priority fee is charged on CU **requested**.

### 5.2 Lamports per player-action

| Action | Signatures | Base fee | Priority budget | Total |
|---|---|---|---|---|
| commit | 2 (player + relayer) | 10,000 | 20,000 | 30,000 λ = $0.0024 |
| reveal | 2 | 10,000 | 20,000 | 30,000 λ = $0.0024 |
| payout share (1/15 of a push tx) | ~0.1 | ~350 | ~1,300 | ~1,650 λ = $0.00013 |
| **Per entrant per day** | | | | **~61,650 λ = 0.0000617 SOL = $0.0049** |

All of it paid by the relayer. **The player never holds SOL.**

### 5.3 Rent and refunds

| Account | Bytes | Rent (SOL) | $ | Recovered |
|---|---|---|---|---|
| `Entry` | 192 | 0.002227 | $0.178 | Yes — `close_entry` at `reveal_end + 24h`, rent → relayer |
| `Round` | 272 | 0.002784 | $0.223 | Yes — `sweep_round` at +14d |
| Vault ATA | 165 | 0.002039 | $0.163 | Yes — closed at sweep |
| `Payouts` (K=80) | 3,222 | 0.023319 | $1.87 | Yes — closed at sweep |
| Nonce pool (32) | 80 each | 0.0461 total | $3.69 | One-time |

**Rolling float** = 1 day of `Entry` accounts + 14 days of round-level accounts.
At 400 entrants: `400 × 0.002227 + 14 × (0.002784 + 0.002039 + 0.023319)` = 0.891 + 0.394 = **1.285 SOL ≈ $103**. Keep 3 SOL ($240) in the relayer as working float. This is the number the original per-entrant-ATA design blew to $33/day of *unrecoverable-that-day* rent; the single-vault design makes it a rounding error.

### 5.4 Total cost per 1,000 daily entrants

| Line | Daily | Monthly |
|---|---|---|
| Signatures + priority (1,000 entrants) | $4.90 | $147 |
| Winner ATA creation (worst case 200 winners with no ATA — realistically <10%) | $3.26 | $98 |
| Rent float carrying cost | $0 (recovered) | — |
| Tournament compute: 999,000 battles @ 3 ms = 50 CPU-min → 6 min on Hetzner CCX33 (8 vCPU) | — | $65 |
| RPC: Helius Business + Sender | — | $249 |
| Static hosting + Arweave dumps (~4 MB/day) | — | $15 |
| **Total infra at 1,000 DAU** | **~$8/day** | **~$574/mo** |

At **100 DAU**: ~$0.60/day on-chain, Hetzner CX32 ($15/mo), Helius Developer ($49/mo), hosting ($10/mo) → **~$92/mo**.

The cost structure is genuinely trivial. Every real cost in this business is the prize pool and, in Phase B, counsel.

---

## 6. Client stack

**Framework:** Vite + TypeScript + Preact/signals. No React, no component library, no CSS framework. The board is a single `<canvas>` drawing unit glyphs as text in a two-colour palette (Blue #4C8FD4 / Red #D46A4C, plus terrain greys). **Zero art assets.**

**Engine:** the same Rust crate via `wasm-pack`, ~150 KB gzipped. Total app payload target **< 400 KB**.

**The doctrine builder is a table, not a node graph.** Twelve rows × five `<select>` elements plus a priority stepper. Deployment is a 12×3 grid of clickable cells. The roster picker is a list with a running point counter. This is ~2,500 lines of TS. The version that takes two months is the drag-and-drop node editor, and it is explicitly not built — dropdowns are strictly better for an ordered priority list anyway, because the ordering is the semantics.

**Replay view:** one canvas, a tick scrubber (0–200), play/pause/step. The **"why did I lose" panel** is a table with one row per tick showing, for each of your units, which slot fired and the HP delta; and a highlighted row at the tick of maximum negative swing in `(your_HP + 3×control_lead) − (their_HP + 3×their_control)`. That single computed row is the highest-value UI element in the product.

**Wallet strategy (Phase A — free entry):** **no wallet required, ever.**
- On first "Enter today", the client generates an ed25519 keypair in-browser, stores it in IndexedDB, and offers WebAuthn-PRF-encrypted backup (a passkey, one tap) so a lost device does not lose the account.
- That key signs `commit` and `reveal`. The **relayer is fee payer**, so the player needs no SOL and no funding step at all.
- "Link Phantom / Backpack" is offered but optional — it is how you get a durable cross-device identity and how you receive prizes.
- A prize winner must attach a real Solana address before payout; that is the only moment a wallet becomes mandatory, and it happens *after* they have already won something.

**Phase B funding flow:** connect Phantom/Backpack/Solflare → USDC balance check → if empty, Coinbase Onramp or MoonPay at a $10 minimum → approve $2 transfer. Still no SOL required, because the relayer remains fee payer.

**Link to playing in under 60 seconds:**

| t | Event |
|---|---|
| 0:00 | Click a shared result card: `doctrine.gg/d/8f3a` |
| 0:02 | Page painted. Today's map is rendered, the shared doctrine is loaded, no modal, no cookie banner, no wallet prompt. |
| 0:03 | Big button: **Run**. |
| 0:04 | A 200-tick battle against a named house archetype resolves in ~3 ms and plays back in 4 s. |
| 0:10 | They change one dropdown (`S5: KITE → HOLD`) and hit Run again. |
| 0:14 | Second result, different outcome, "why did I lose" row highlighted. |
| 0:20–0:50 | Three or four more iterations. This is the hook and it is entirely free and entirely local. |
| 0:52 | Banner: **"Enter today's contest — free, $180 prize pool, closes in 6h 12m."** |
| 0:55 | One click. Key generated silently, commit relayed, confirmed. |
| 0:58 | "You're in. Field so far: 63 entrants. Results at 22:45 UTC." Optional: add a passkey, add an email for the results nag. |

**Share artifact:** an SVG→PNG result card — rank, W-D-L, a one-line ASCII composition string (`SH·SP²·AR²·SK·CV·SC`), and the day's scenario name — with a link that opens *that doctrine* loaded in the sandbox. The share lands on a playable simulator, not a landing page.

---

## 7. Economy

**There is no token, no emission, no asset, no secondary market, and nothing that requires new entrants to pay old ones.** The entire mechanism is: money enters as subscriptions, sponsorships, and (Phase B) entry fees; a published fraction of *realized trailing revenue* exits as prizes; the remainder is developer income.

### 7.1 Faucets and sinks

- **Faucets:** none. No in-game currency exists. Prizes are USDC out of a pre-funded vault.
- **Sinks:** none needed, because nothing is issued.
- **Rake:** Phase A, zero (entry is free). Phase B, implied 10% (pool = 90% of trailing gross entry revenue).

### 7.2 The pool formula (published, on the front page)

```
pool_for_day_D = clamp(
    25,
    0.60 × (trailing_30d_revenue) / 30,
    2500
)
```
announced at 00:00 UTC on day D−1, funded on-chain by `create_round` before entries open, and **independent of how many people enter on day D**.

Why this cannot death-spiral: the payout is a fraction of money that has *already been collected from consumption* (subscriptions and sponsorships), not a claim on future deposits. If entrants fall, revenue falls, and the pool falls with a 30-day lag down to a $25 floor the developer funds from a fixed launch budget. It degrades smoothly. There is no cohort of asset holders who must be paid in appreciation, no token whose price is the retention mechanism, and no structure in which today's prize depends on tomorrow's sign-ups.

### 7.3 Revenue lines

1. **PRO — $9/mo or $79/yr** (ships week 6, gated on ≥150 MAU). Batch-run your doctrine against all of yesterday's revealed field; composition-distribution charts across the last 30 days; doctrine diffing; a nightly hosted hill-climb (capped CPU-minutes); personal replay archive. **Hard rule: PRO confers zero in-contest advantage** — no extra entries, no earlier information, no different scenario, and every PRO analysis is available free at reduced rate limits. This is both a product decision and a legal one (§10).
2. **Sponsored scenario days — $250–$1,000/day.** The sponsor funds that day's pool via the permissionless `fund_pool`, names the scenario, and gets a line on the results page and in the meta report. This is the Battlecode/Two Sigma/Paradigm model, which four decades of prior art say is where money in this genre actually comes from. Target: 2/week by month 4.
3. **Entry fees — Phase B only, $2.** Gated (§10).

### 7.4 What the dev earns

**At 100 DAU (Phase A):** MAU ≈ 350. PRO at a realistic 3% attach = 10 × $9 = **$90/mo**. Sponsors: $0. Revenue $90/mo → pool formula yields $1.80/day, so the **$25/day floor binds: $750/mo of prize funded out of pocket**, plus $92/mo infra. **Net −$752/mo.** This is honest and it is the point of the $6,000 launch budget line: at 100 DAU this is a funded experiment, not a business, and §12 says exactly when to stop funding it.

**At 2,000 DAU:** MAU ≈ 6,000.
- *Phase A only:* PRO 3% = 180 × $9 = $1,620/mo. Sponsors 2/wk × $400 = $3,440/mo. Revenue **$5,060/mo** → pool = $3,036/mo ($101/day), infra $574/mo. **Net ≈ $1,450/mo.** A well-loved side project.
- *Phase B (paid entry) at 2,000 daily entrants:* gross $2 × 2,000 × 30 = $120,000/mo; pool at 90% = $108,000; margin $12,000; plus PRO $1,620 and sponsors $3,440; minus infra $574 and compliance ($3–5k/mo amortized for counsel, geofence/age vendor, RG tooling, and MSB posture). **Net ≈ $11,000–13,000/mo.** State the caveat loudly: 2,000 *paid* daily entrants for a strategy-design contest would make this the largest thing of its kind ever built. Halite III, with Two Sigma's marketing behind it and free entry, drew ~4,000 players over an entire multi-month season.

**The honest planning assumption:** the subscription and sponsorships are the business; the contest is the product that makes them worth buying. Plan for that from week one rather than discovering it in month four. If PRO attach at 400+ MAU is under 1.5%, that thesis is falsified (§12).

---

## 8. Cold start — week one with 8 players

The failure mode this format has is that the reveal makes a thin field legible: everyone sees exactly how few people entered, every single day. You cannot hide a thin field in a product whose selling point is publishing the whole field. So do not hide it — **make the field real anyway.**

**Before launch (built in week 4):**
- Run the hill-climber to generate **120 house doctrines** across 14 pre-run historical scenarios, plus a written 400-word meta report for each of those 14 days. On day 1 the archive is not empty: a new player has two weeks of field data to study and 120 opponents to test against. The product's core promise — *best-respond to a field* — is delivered at n=1.
- Author **12 named campaign challenges**: "Beat CHOKEHOLD on Ford with ≤80 points", "Beat SWARM-9 while holding two objectives at tick 200". This is a complete single-player game requiring zero other humans, and it teaches the grammar in the right order.

**Every live day, the field is padded to 48:**
```
field = human_entrants + house_doctrines(48 − human_entrants, min 0)
```
House entries are labelled **HOUSE** everywhere, are ineligible for prizes, and are excluded from the "eligible entrants" count that sets the number of paid ranks. The results page says, verbatim: *"Field: 8 human, 40 house."* Never fake a human.

The house pool is not static: each night the hill-climber trains against **yesterday's real field** and replaces the weakest 20% of the house pool. So even at 8 players there is a moving population to read, the depth thesis has something to operate on, and the ranking means something. This is the direct answer to "at 6 entrants the metagame is guessing what four people will do."

**Week one, concretely:**
- **Day −3:** post a playable link (no wallet, no signup, no crypto word above the fold) in exactly four places: the Core War mailing list / `comp.lang.redcode` descendants, r/screeps, the Gladiabots Discord `#strategy` channel, and the Battlecode alumni Discord. The pitch is "Core War with a rulebook instead of assembly, new map daily, archive is open." Not a token, not an airdrop, not a launch.
- **Day 1–7:** 8 recruited players plus the dev. Every day: publish the 400-word meta report to those same four threads, and **DM each of the 8 a hand-written 3-sentence analysis of the tick where their line broke.** Eight people, twenty minutes. This is the highest-leverage hour of the week and it does not scale, which is why it must be done now.
- **Day 7:** ship the first weekly primitive, chosen by a poll of those 8. They named it; they will show up to see it break the meta.
- **Day 8–14:** the only growth mechanism is the result-card share link, because it lands on a playable simulator. Target 8 → 25.
- **Explicitly not doing:** paid ads, airdrop farming, Solana-ecosystem cross-promo, KOLs, or any channel that sources from the 3.2M daily Solana wallets. That population is the same people across pump.fun and Axiom, they convert to retained DAU at approximately zero, and this game is one of the very few crypto games whose actual audience — Zachtronics/Screeps/Core War players — exists somewhere else entirely. Reaching them requires never leading with the money.

---

## 9. Bots

**A bot is the product.** The doctrine *is* a bot; the player is writing an autonomous commander. Automating the search over doctrine space is a celebrated strategy here, exactly like GPU budget in a Kaggle simulation competition, and we ship the tools for it: a headless engine binary, nightly archive dumps (every revealed doctrine, every scenario, every result, free), and a documented submission API.

**Day one, a competent operator** writes a hill-climber or CMA-ES-style search over the 56-byte doctrine encoding, evaluates against the 120-doctrine archive plus yesterday's revealed field, and submits the argmax. That is a day of work for anyone who has done a simulation competition. It will place well.

**What it extracts, and the real failure mode.** A solver computes a best response to *yesterday's* field. But yesterday's field is what everyone else is also best-responding to, so pure solver play walks into the second-order counter. The genuine problem the critique identified is not that solvers win — it is the *correlation*: rational solver operators show up precisely on days the field is soft, which are exactly the days a new player would otherwise have had their first good result. That is the worst possible correlation for retention.

**The fix is segregation by rating, not detection.** You cannot detect solver use and should not try.
- **Novice band (rating < 1400)** has its own pool (25% of the day's total) and its own standings page. Graduation is permanent after 3 top-10% finishes in any band.
- A solver operator exits Novice within a week, by construction. New players spend their first two weeks competing with other new players, and the Open band is where the arms race lives.

**Multi-accounting** — spraying N diversified entries to buy more lottery tickets on the paid band:
- One entry per wallet, enforced by PDA seeds.
- **Prize eligibility requires ≥5 prior entries from that wallet**, published in advance. A Sybil farm must be built five days before it can earn.
- Phase B: each entry pays the full fee and full rake, so diversification is EV-negative unless the doctrines are genuinely better than the field — which is the skill being paid for. Note the correction to the concept doc: a top-heavy curve makes payoff **convex** in rank, which *increases* the value of extra independent draws for anyone with positive edge. The curve is not the bound. The bounds are the per-entry rake, the 5-entry ramp, and the house floor below.

**Field-shaping** — the sharper attack: enter 40 deliberately weak, shaped doctrines to partially author the field, then make your 41st entry a best response to a field you wrote.
- **The house floor is the structural defense.** The field always contains at least `48 − humans` doctrines the attacker does not control, drawn from a pool regenerated nightly against the real field. To author half of a 100-entrant day the attacker needs 100 aged wallets *and* still faces an uncontrolled house remainder they cannot predict.
- Every shaped entry must be **revealed publicly**. Clusters of near-identical low-quality doctrines revealing inside the same 90-second window are trivially detectable in the composition distribution we already publish daily. The published rule: clustered-submission patterns trigger prize withholding pending review, with entry refund and permanent exclusion.
- Wallet aging is honestly described in the rules as *a schedule, not a defense* — it costs an attacker patience, not money.

**Residual, stated plainly:** multi-accounting and field-shaping are bounded, not eliminated. A determined operator with capital can extract from a weak field. In Phase A the prize is $25–$180/day and the margin is far too thin to be worth anyone's time. If Phase B ever runs a high-stakes division, it is manual-review gated on payout, not automated.

---

## 10. Legal posture

*Not legal advice. This is the structural reasoning a developer should hand to counsel, not a substitute for counsel.*

**The test is consideration + chance + prize. Remove any one and it is not gambling.**

**Phase A (weeks 1–8+, the MVP) removes consideration.** Entry is free. There is no purchase requirement, no data-for-entry beyond a wallet address, no alternative-method-of-entry gymnastics because there is no paid method at all. **This is not a sweepstakes and deliberately not a Tier-2 dual-currency structure** — the 2026 sweepstakes-casino statutes in CA, CT, IN, ME, MT, NJ, NY, TN, IA, LA and OK name operators, platform providers, suppliers and promoters personally, and none of them are worth going near. Free entry plus a genuine skill contest plus a real prize is the oldest and cleanest structure in the book. The consequences are large and worth stating: **no geofence, no state-by-state opinion, no age-verification vendor, no MSB analysis, no responsible-gaming build.** What remains and is not optional: published official rules and prize terms before the first round; 18+ affirmation at payout; OFAC screening of payout addresses; US tax reporting (W-9 collection and 1099-MISC at $600 aggregate per person per year); and keeping any single prize under $5,000 and total prize value below state sweepstakes registration/bonding thresholds — hence the $2,500 hard cap on the daily pool and the monthly championship.

The one live risk in Phase A is the **PRO subscription**. If a paid subscription became effectively necessary to compete, a regulator in an aggressive state could characterize it as indirect consideration. Mitigations, all built in and all published: PRO buys analysis tools only, never entry, never extra entries, never earlier information, never a different scenario; every PRO capability exists free at a lower rate limit; the entire archive, every revealed doctrine, and the engine itself are public and free forever. Prize eligibility is identical for subscribers and non-subscribers, and the rules say so.

**Phase B (paid entry) reintroduces consideration and requires a real structure.** Chance is genuinely absent — the scenario is committed 24h early and fully revealed before submissions open, so nothing is grindable; resolution is integer-deterministic with no RNG anywhere; pairings are exhaustive double round-robin with colors swapped, so even matchmaking variance is structurally impossible. That posture survives not just the ~30 predominance states but the harsher **material-element** test and the **any-chance** states, because there is no chance element at all to be material.

But the concept doc's original money structure did not fit the carve-out it invoked. The bona fide skill-contest exemptions that make chess opens and Kaggle work condition on four things: the prize is announced in advance, the prize is **not derived from entry fees**, the prize **does not vary with the number of entries**, and the operator does not compete. A pool equal to 92% of collected fees fails three of four and lands in *pooled wagering among participants* — where the DFS "pick'em" precedent is directly on point, and PrizePicks paid ~$15M to New York and exited despite calling itself something else.

**The structural choice, enforced in code:** `create_round` refuses to open a round unless the prize pool has already been transferred into the vault, and refuses to schedule `open_ts` less than 86,400 seconds out. The pool for day D is announced at 00:00 on day D−1 and is a function of *trailing 30-day revenue*, never of day D's entries. The operator does not compete and its wallets are published. That is four of four prongs, and it is publicly verifiable on-chain rather than promised in a ToS — which is a materially stronger version of the same claim than any server-based contest can make.

**What is genuinely unresolved, honestly:**
- **Maryland and Michigan** analyze whether a *wager* was placed and largely disregard the skill/chance distinction. **Florida** bars wagering on skill contests by statute. Even with a decoupled pool, a regulator can argue that entry fees and prizes are correlated over time. Phase B geofences FL, MD, MI, plus anything counsel flags, plus OFAC jurisdictions, and requires a **written per-state opinion before the first paid entry** — sequenced deliberately so the opinion is bought with revenue that already exists, not with hope.
- **Regulators look at what a product functionally is, not at its taxonomy.** Nothing on the front page does any work; only the money structure does. The money structure here is genuinely different from pooled wagering, and that is the entire defense.
- **MSB/AML** is a separate question that the gambling analysis does not touch. Custody of USDC, cross-border payouts, and any rake is an MSB fact pattern regardless of how the chance analysis lands. In Phase A the exposure is small (paying out prizes, not holding customer balances). Before the first paid entry, get MSB counsel — not before scaling.
- **Upgrade authority is a real control point.** The claim "escrow lives in PDAs I cannot unilaterally drain" is false while a single key can upgrade the program. Mitigation: upgrade authority moves to a Squads 2/3 multisig with a 24-hour execution timelock at launch, and the members are published. The honest limit: for a solo developer, a 2/3 with two friends is a delay-and-publicity mechanism, not a guarantee, and the front page says so rather than implying otherwise.
- **UK:** no tradable assets exist. Doctrines are copyable public data, not NFTs; there is no secondary market and nothing to have "money's worth." Cash prizes to UK residents in Phase B is a separate licensing question and UK is geofenced from paid entry at launch.

**Distribution posture:** web-first. The Solana Mobile dApp Store is a launch channel. Google Play's ban on *promoting or glamorizing earnings* and Steam's blockchain policy are both survivable only by never leading with the money — which is also the only path to the audience this game actually wants (§8). That is not a workaround for the acquisition contradiction; it is a choice of audience, made deliberately.

---

## 11. Four-week build plan

**Week 0 (3 days, before any code): grammar on paper.** Play 30 battles by hand on a spreadsheet against pre-written doctrines. Tune unit costs and the condition/action menus until no single archetype wins more than 40% of hand-played matchups. The critique is right that this is a language-design problem, not an engineering one, and Gladiabots spent years here. Three days of paper plus the automated dominance monitor (week 4) plus the weekly primitive cadence is the affordable version of that.

**Week 1 — engine.**
- `no_std` Rust core: 12×12 grid, 4 terrain types, 12 units, 20 conditions, 16 actions, 16 target selectors, role scoping, simultaneous tick resolution per §2.4, 200 ticks, integers only.
- Three build targets: `x86_64`, `wasm32`, `sbf`.
- **CU spike (non-negotiable):** compile one tick for `sbf` and print the real number. If a single tick exceeds ~400k CU, fix it now (cache BFS distance fields per objective, reduce max units) — this decides whether the fraud proof can ever ship.
- Differential fuzz harness: 100k random triples, assert byte-identical final state and tick hash chain across all targets. 500-battle golden corpus with committed hashes.
- Tick hash chain (`h_t = sha256(h_{t−1} ‖ state_t)`) emitted by the runner from day one, so Phase-C bisection needs no engine change later.

**Week 2 — client.**
- Roster picker with point/unit budget; 12×3 deployment grid; 12-row slot table; Run.
- Canvas replay with tick scrubber; **"why did I lose" panel** with the max-swing tick highlighted.
- Archive browser, fork-from-share-link, share-card renderer.
- 12 campaign challenges with house opponents.
- No wallet code at all this week. The whole thing must be a great free toy before anything touches a chain.

**Week 3 — chain + runner.**
- Anchor program: all instructions in §3.2, with tests covering every deadline edge (commit at `close_ts − 1`, reveal at `reveal_end_ts`, double reveal, hash mismatch, re-commit after reveal, refund path, unclaimed sweep).
- Relayer service: fee-payer, 32-account durable-nonce pool, Helius Sender + two fallback RPCs, retry ladder, per-instruction CU-limit table from measured p99.
- Tournament runner: double round-robin ≤400, standings, payout-curve computation, `publish_payouts`, `finalize_round`, `push_payouts` batching at 15/tx, Arweave dump.
- Results publisher, meta-report generator, share-card server.

**Week 4 — content, rules, and seven live days.**
- Hill-climber; generate 120 house doctrines and 14 pre-run historical scenarios with meta reports.
- **Automated dominance monitor:** nightly, search for a doctrine that beats ≥70% of the entire archive and is beaten by nothing in it. If found, the grammar has a dominant strategy and the roster is patched before launch.
- Official rules page, prize terms, W-9/1099 flow, OFAC screening on payout addresses, 18+ payout affirmation.
- Run **seven complete live days end to end** with the 8 recruits, on mainnet, with real (small) USDC prizes. Fix what breaks.

**Weeks 5–8 (post-MVP, in order):** PRO billing (gated on ≥150 MAU) → Glicko-2 rating and Novice band → sponsored-day tooling → Swiss pairing (only if a day exceeds 400 entrants).

### NOT IN MVP — explicit
Paid entry. Geofence, KYC, age vendor, RG tooling. BPF fraud-proof adjudicator (design locked, CU measured, not shipped). Swiss pairing. Masters/high-stakes division. PRO subscription billing. ELO/rating bands. Mobile app. MagicBlock ER or PER. Merkle-proof claims (superseded by the on-chain payout table). Fog of war. Team/alliance formats. Any roster content beyond the launch 12. Any token, NFT, or tradable item, ever. Steam or Epic. Native mobile wallets beyond WalletConnect-less browser signing.

---

## 12. Kill criteria

Each is measured, dated, and has a decision attached. Check them on a schedule, not on a feeling.

| # | Signal | Threshold | Decision |
|---|---|---|---|
| 1 | **D7 retention**, first cohort of ≥50 non-seeded players | < 15% at day 45 | The daily ritual does not hold. Stop the contest, keep the sandbox as a free toy, stop spending. |
| 2 | **Median daily human entrants** | < 20 at day 60, with the archive and house field live | The field-size floor was not cleared. Kill the prize pool; the contest never becomes what it promises. |
| 3 | **Sandbox → entry conversion** | < 8% of players who run ≥5 battles at day 45 | The free toy and the contest are two different products. Ship the toy, drop the contest. |
| 4 | **Meta staleness** | Jensen–Shannon divergence of the top-10 composition distribution < 0.05 across 14 consecutive days, *and* the weekly primitive drop fails to move it above 0.10 within 7 days | The depth thesis — best-response to an evolving field — is empirically false. This is the one that invalidates the whole concept, and it is directly measurable from data we already publish. |
| 5 | **Archetype dominance** | Any single composition archetype places top-20% on > 40% of days over a rolling 21-day window | The grammar is broken. Two weeks of roster/condition surgery. Twice in a row → kill. |
| 6 | **PRO attach** | < 1.5% of MAU at day 90 with ≥400 MAU | The subscription-is-the-business thesis is false, and with it the only path to revenue that does not require the Phase-B legal spend. Reduce to a hobby budget. |
| 7 | **Sponsorship** | Zero paid sponsored days by day 120 despite ≥10 outbound pitches | The Battlecode funding model does not transfer. Combined with #6, stop. |
| 8 | **Engine trust** | More than one production sandbox/runner divergence after week 6 | Halt prizes immediately, re-fuzz, publish a post-mortem. A third → stop; a contest nobody trusts has no product. |
| 9 | **Runway** | Cumulative net spend > $6,000 with no criterion above cleared | Out of money before finding the loop is the most common cause of death in this category. Stop at the number, not at the feeling. |
| 10 | **Phase B gate (not a kill, a permission)** | ≥250 median daily human entrants for 21 consecutive days **and** a written multi-state opinion in hand | Only then does paid entry open. Never before. |