# LOCKMAKER — Build Spec v1.0
**Technical director → solo Solana engineer. Execution starts Mon 2026-08-24. Target: public launch Mon 2026-09-21 (4 weeks core), forking economy Mon 2026-10-05 (weeks 5–6).**

---

## 0. What changed from the concept, and why

The critique found one structural kill and four real bugs. All five are fixed at the root, not patched:

1. **The revenue model was self-defeating.** The wasm sim shipped to the browser is byte-identical to the on-chain verifier by design (that identity is the whole legal and trust story), so a rational picker solves free, locally, unlimited times, and pays once. A per-attempt fee taxes a behavior nobody will do. **Fix: sell access, not attempts.** Unlock a lock once (0.01 SOL), then every local run and every on-chain submission is free forever (network fee only). This makes the golf-ladder grind — the actual day-100 retention loop — free instead of punished, and it makes bots pay the same fee as humans instead of nothing.
2. **The CU estimate assumed a grid-driven sim.** Iterating 81 cells × 240 ticks is 5–10x over budget. **Fix: the VM is a program-counter-driven interpreter, not a cellular automaton.** One instruction executes per active probe per tick; CU scales with ticks × active probes (capped at 4), not grid size. This is an architecture change, not a tuning pass.
3. **The transfer hook cannot do what the concept claimed, and Token-2022 is the wrong primitive anyway.** CPI account-privilege demotion means a hook cannot create/fund a same-transaction royalty-receipt PDA without sysvar introspection, and `SetAuthority` on a non-ATA account bypasses it regardless. **Fix: there is no lock NFT and no marketplace at all.** A lock's owner is a `Pubkey` field on a PDA the program itself controls. Royalties are paid automatically on every unlock — the only way to extract value from a lock — so there is no marketplace to strip fees from, because there is no separate tradable asset. This is a stronger claim than the hook ever made, and it deletes the engineering.
4. **The 16-shard vault sharded the wrong account by four orders of magnitude, and left the actually-hot account (a single global house wallet) unsharded.** **Fix: no per-lock vault at all** — royalties route as direct system transfers inside `unlock_lock`. The genuinely global, genuinely contended account is the **house treasury**, and that is the one sharded, 8 ways, matching MILLWRIGHT's pattern applied to the account that actually needs it.
5. **The ancestry-depth-4 justification (CPI depth) was fabricated.** The real reason is economic: below 1% of a $0.80 unlock, a system transfer's own overhead exceeds the payout. That is the stated reason now.

The plagiarism problem is addressed head-on in §5, because unlike MILLWRIGHT's copy-forward risk (a spectator resubmits a *solution*, which can only tie, never win), LOCKMAKER's risk is someone resubmitting an *authored lock* itself and collecting the royalty stream — a direct theft of the thing the whole economy pays for.

---

## 1. Tightened design

| Parameter | v1 value | Note |
|---|---|---|
| Grid | 9×9 = 81 cells | 12 component types, kinds 1–12 (0 = EMPTY) |
| Lock definition | grid 162 B + entry 3 B = **165 B** | fits any tx with huge margin |
| Lock account (full, incl. bookkeeping) | **325 B** | §6 |
| PICK program | ≤24 instructions × 3 B = **≤72 B** + 1 B length prefix | 8-verb ISA, §2.2 |
| Unlock price | author-set, v1 fixed catalog default **0.01 SOL (~$0.80)**; free (0) allowed for tutorial locks | one-time, per (player, lock) |
| Attempt (submit_run) cost | **network fee only, ~$0.0004**, unlimited, forever, once unlocked | this is the fix for the structural kill |
| Rounds | **none** — locks are permanent/evergreen once published | unlike MILLWRIGHT, there is no weekly reset; a lock earns for as long as it exists |
| Royalty split (immutable in program) | author 60% / ancestry pool 15% (unfilled → author) / house 25% | root lock (no parent): author effectively gets 75% |
| Ancestry depth cap | 4 generations, 8/4/2/1% of the 15% pool | economic cutoff (dust below 1%), not a CPI-depth artifact — ships week 5+ |
| Publish cost | **0.01 SOL** total: ~0.0046 SOL rent (partly refundable) + 0.0054 SOL anti-spam surcharge (house, non-refundable) | §6, §8 |
| Component budget | 120 points, components cost 5–25 pts | SINK mandatory, exactly one, costs 25 |
| Tick cap | 240 | matches the original pitch's player-facing number |
| Max concurrent probes | 4 | bounds worst-case CU; SPLIT beyond 4 is a deterministic no-op |
| Discovery rebate | first 3 unlocks of a newly published lock refunded from that lock's own house share, capped 3/lock forever | replaces the "curation purse" (cut — recreated a prediction-market structure, §4) |
| Progression | day 1: PUSH/PULL/CUT and the first 3 components. Day 100: golf ladder (fewest instructions), component canon (named combos), composition-as-craft (a lock's revenue is a public number) | §3 |
| Session length | picking: 15–25 min, 3–5 locks, mostly free re-solves plus an occasional new unlock. Authoring: 20–45 min for a considered lock | close to the original pitch |

---

## 2. Rules of play

### 2.1 Board and probes

A 9×9 grid, cell `(x,y)`, `x,y ∈ [0,8]`. Directions: `0=N, 1=E, 2=S, 3=W`. One `ENTRY` cell (author-placed, free, exactly one) with a starting facing. Exactly one `SINK` cell (mandatory, costs 25 of the 120-point budget).

A **probe** is the picker's agent: position, facing, two u8 registers `R0`, `R1`. At the start of a run one probe spawns at `ENTRY`. The PICK program is a **program-counter-driven interpreter**: each tick, every currently-alive probe executes exactly the instruction its own PC points to, then its PC advances (or jumps, on `JMPIF`). This is the fix for the CU blowup in §0 — CU scales with `ticks × active_probes`, never with grid size, because cells are only touched when a probe is standing on them.

Run ends when: any probe enters `SINK` (**success**), `tick == 240` (**failure, no score**), or a probe enters an un-cut `SENTINEL` (**failure, immediate**).

### 2.2 The 8-verb ISA

Instruction encoding: 1 byte opcode + 2 bytes args (mostly one used) = 3 bytes/instruction, ≤24 instructions, ≤72 bytes + 1-byte length prefix.

| Verb | Args | Effect |
|---|---|---|
| **PUSH** | dir (N/E/S/W) | Face `dir`; attempt to move one cell that way. Entering a new cell triggers that cell's passive effect (below). Turning is free — PUSH is move-and-turn combined, there is no separate turn verb. |
| **PULL** | reg | Read the **dynamic state** of the component directly ahead (current facing) into register `reg`, without moving. COUNTER → its count; TIMER → `tick mod period`; anything else → 0. |
| **CUT** | dir | Permanently disarm the `SENTINEL` directly ahead in `dir`, for the rest of this run. No effect on any other component. |
| **WAIT** | — | No-op, advances one tick. Used to sit inside a `DELAY` or wait out a `TIMER`'s closed phase. |
| **SPLIT** | — | Clone the current probe (position, facing, registers) into a new independent probe that begins at the *next* instruction. No-op if 4 probes are already alive. Determinism: probes are numbered 0 (original), 1, 2, 3 in spawn order; simultaneous same-tick, same-cell effects resolve in ascending probe-id order. |
| **PROBE** | reg | Read the **static kind ID** (0–12) of the component directly ahead into `reg`, without moving or triggering it. Safe scouting — this is how you detect a `SENTINEL` before walking into it. |
| **INVERT** | reg | `reg = (reg == 0) ? 1 : 0`. |
| **JMPIF** | reg, target(0–23) | If `reg != 0`, `PC = target`; else `PC += 1`. The only branch — this is where golfing (looping instead of repeating instructions) happens. |

### 2.3 The 12 components (author-placed, cost 5–25 pts each)

| # | Component | Cost | Behavior |
|---|---|---|---|
| 1 | DEFLECTOR | 5 | Passive: rotates entering probe's facing 90° (author sets CW/CCW), pushes it one further cell in the new facing, same tick. Chain depth capped at 1 (landing on a second DEFLECTOR just stops there facing the new way — no infinite bounce). |
| 2 | ONE-WAY | 5 | Passive wall: entry allowed only from one author-set direction; other directions bounce (facing updates, position doesn't). |
| 3 | DECOY | 5 | Inert. Renders identically to SINK in the editor palette on purpose — a misdirection piece with zero mechanical effect. |
| 4 | DELAY | 6 | Passive: entering probe is stalled 2 extra ticks (its instruction execution is skipped, as an implicit WAIT) before continuing. |
| 5 | MIRROR | 8 | Passive: reflects facing per author-set orientation (`/` or `\`, i.e., N↔E or N↔W etc.). No forced extra step. |
| 6 | PLATE | 8 | Passive: entering (any side) permanently sets lock-wide flag `plate[i]` (author numbers 0–3) for the rest of the run. Referenced by GATE. |
| 7 | GATE | 10 | Closed by default. `trigger_side` (author-set direction) + optional `plate_ref` (0=none, 1–4). Entering **from** `trigger_side`: always succeeds, and — if no `plate_ref`, or the referenced plate is already set — arms `open_for_others` for the rest of this tick and the next. Entering from **any other side**: succeeds only if `open_for_others` is currently true, and consumes it (single-use). |
| 8 | COUNTER | 10 | Holds an integer 0–15 (author-set start). PULL reads it non-destructively. **Any** probe entering the cell (any side) decrements it by 1 (floor 0) as a side effect of walking through — otherwise unobstructed. |
| 9 | TIMER | 10 | Period `P` (author-set, 2–8). `phase = tick mod P`. Passable only when `phase == 0`; acts as a wall from all directions otherwise. PULL reads `phase`. |
| 10 | SPLITTER | 12 | Passive: the *next* exit from this cell alternates between two author-fixed directions regardless of the probe's PUSH argument — the cell overrides your chosen exit. Shared, persistent alternation state; simultaneous entries resolve by probe-id order (§2.2). |
| 11 | SENTINEL | 15 | Trap: entering it without a prior CUT (from an adjacent cell, any earlier tick, this run) ends the run in failure immediately. PROBE detects it safely. |
| 12 | SINK | 25 | Mandatory, exactly one per lock. Any probe entering it ends the run in success. |

### 2.4 Score

- **INSTRUCTIONS** — static length of the winning PICK program (slots used, ≤24). Not execution-traced; golfing means shortening the program, including via loops.
- **TICKS** — tick at which SINK was reached.
- **TOUCHED** — count of distinct non-empty cells (excluding ENTRY and SINK) any probe entered during the run.

Three independent per-lock leaderboards, plus **HAND** (self-declared, social) and **OPEN** (solvers explicitly welcome) divisions — see §11.

### 2.5 Worked example — lock "TIN LATCH"

**Given** (9×9, everything else EMPTY): `ENTRY (0,4)` facing E. `SENTINEL (3,4)`. `GATE (5,4)`, `trigger_side = N`, no plate reference. `SINK (7,4)`. Component budget spent: SENTINEL 15 + GATE 10 + SINK 25 = 50 of 120.

**The obvious straight-line PUSH(E) × 8 program fails twice**: it walks into the un-cut SENTINEL at tick 3 (immediate loss), and even if that were survived, it would approach the GATE from the west, which is not its trigger side, so it stays closed.

**A correct PICK program** (10 instructions, 72 B budget mostly unused):

| # | Instr | Effect | Tick | Position after |
|---|---|---|---|---|
| 1 | PUSH E | move | 1 | (1,4) |
| 2 | PUSH E | move; now facing the SENTINEL directly ahead | 2 | (2,4) |
| 3 | CUT E | permanently disarms SENTINEL(3,4) | 3 | (2,4) |
| 4 | PUSH E | enters (3,4) safely — cut is permanent | 4 | (3,4) |
| 5 | PUSH E | move | 5 | (4,4) |
| 6 | PUSH N | detour around the gate's wrong side | 6 | (4,3) |
| 7 | PUSH E | move to be north-adjacent to the gate | 7 | (5,3) |
| 8 | PUSH S | enters GATE(5,4) **from the north** = trigger side → always succeeds | 8 | (5,4) |
| 9 | PUSH E | move | 9 | (6,4) |
| 10 | PUSH E | enters SINK(7,4) → **picked** | 10 | (7,4) |

**Result: INSTRUCTIONS 10 / TICKS 10 / TOUCHED 2** (SENTINEL, GATE). A valid entry on all three ladders.

**Is it optimal?** The SENTINEL detour costs exactly 1 instruction (CUT) — cheaper than any reroute around it, so CUT-and-continue is correct. The GATE forces a 3-instruction detour (N, E, S) because `(5,3)` is the nearest north-adjacent cell reachable without new obstacles; there is no shorter approach on this layout. 10/10/2 is very likely the OPEN-division optimum for TIN LATCH — the leaderboard will confirm or refute that empirically, which is the point of shipping it, not deciding it in the spec.

---

## 3. Why it stays interesting

**Three curves, matching the original pitch's honest framing, now grounded in a concrete rule set:**

1. **Instruction golf.** A solved lock does not die — the sport is 10 instructions today, 8 next month via a JMPIF loop that revisits a SPLITTER instead of hand-writing both branches. This is the TIS-100 histogram effect, and because submit_run is free forever post-unlock, every re-attempt genuinely improves the purchase instead of costing more money (§0 fix #1).
2. **Component-interaction canon.** A strong author knows that GATE+PLATE is a lock-and-key sequencing puzzle, that a SPLITTER's alternation state persists across a run and can be pre-loaded by a throwaway SPLIT probe before the real probe arrives, that a COUNTER is destructive-on-walk but non-destructive-on-PULL (an author can build a "read the fuse, then decide" puzzle only a careful picker solves cleanly). A weak author places components without noticing they interact; a weak picker treats every cell as isolated. Day-100 players read a published grid and see the archetype ("this is a plate-gate lock-and-key with a decoy SINK-lookalike") the way a chess player reads a Sicilian.
3. **Composition as a craft with a public scoreboard.** A lock's unlock count and total royalty income are public numbers. Authors iterate toward the shape that maximizes attempts-before-first-solve without becoming unsolvable — an author who understands that SENTINEL+CUT costs the picker exactly one instruction (cheap) while a GATE detour costs three (expensive) can tune difficulty precisely, the way a level designer tunes a jump. A picker who understands the same arithmetic can estimate a lock's difficulty from its component list alone, before running anything.

**Honest caveat**, unchanged from the original: curve 3 only exists at authoring critical mass. §4 is the concrete plan for reaching it.

---

## 4. The UGC cold-start problem

The critique is right that this is worse than the concept admitted: 30–35 seed locks (one dev, one week) is 6–10 hours of committed play, not three weeks, and 1% creator conversion of a handful of week-1 players is zero authors. The fix is not marketing — it is a schedule, mirroring MILLWRIGHT's cold-start plan because the underlying problem (single-player-against-content, but the *interesting* half needs producers) is the same shape.

**T−10 days.** Dev authors 30–35 locks across a real difficulty ladder using the full component set (not just SENTINEL+GATE — SPLITTER/COUNTER/TIMER locks too, to demonstrate range). The first 8–10 are `unlock_price = 0` — free, tutorial-tier, so a brand-new player with a zero-SOL passkey wallet clears the whole onboarding ladder without ever funding anything (Kora-sponsors the network fee on free-lock actions only — see §9). This buys one week of content, not three; the plan does not pretend otherwise.

**T−7 days.** Hand-pick 8–10 named individuals findable from recent TIS-100 / Opus Magnum / Shenzhen I/O solution posts (r/tis100, Hacker News, itch.io, Lobsters). The word "crypto" does not appear in the outreach. The offer:
- A permanent "Founding Picker" credit: 200 pre-funded free unlocks on their wallet (roughly a year of engaged play at the assumed 6/month rate from §10) — this is a bounded, enumerable cost the dev pays once, not an open-ended liability.
- Their handle permanently on the founding ladder of lock #1.
- **The explicit ask: author 2–3 locks of your own in the first two weeks.** This is the actual recruitment pitch, and it is what turns the first cohort into the content pipeline in week 2 rather than leaving the dev as the sole author through week 20.

Expect 3 of 8–10 to convert into authors — the standard low-single-digit UGC conversion rate, applied deliberately to a small, hand-picked pool rather than hoped-for at scale.

**The discovery rebate (§1) is itself a cold-start mechanism**, not just a fairness patch: a brand-new author's first lock is free to try for the first 3 solvers, which removes the "why would I spend $0.80 on an unknown newcomer's lock instead of a proven classic" friction a two-sided marketplace normally has at low catalogue depth.

**Launch week**, mirroring MILLWRIGHT §8's cadence: Monday launch with the seed ladder live and HOUSE-authored locks clearly flagged and excluded from author-of-the-week recognition; daily auto-posted solve replays to a Discord `#picks` channel (zero dev effort, the entire content engine at 8–10 players); a Wednesday "teardown" post walking the current #1 INSTRUCTIONS solution frame by frame (this is the single highest-leverage recurring artifact — it teaches the golf mechanic and travels off-platform on its own); a Friday post naming an unclaimed leaderboard corner ("nobody has beaten 8 instructions on TIN LATCH").

**Week-6 kill signal** (see §13): if no lock from outside the dev and the founding cohort has been published by week 6, the thesis that authored content is the durable asset is falsified, and what remains is a solo Zachtronics clone with a payment rail — which the critique correctly notes is a worse product than the free incumbents.

---

## 5. Plagiarism and copy-forward

This is the harder version of MILLWRIGHT's copy-forward problem, correctly flagged by file 12: MILLWRIGHT's public blueprint can only be *resubmitted as a solution*, which is strictly non-improving (ties never overwrite). LOCKMAKER's public grid can be *republished as someone else's authored lock*, which steals the ongoing royalty stream itself, not just a rank. It needs a real mechanism, not a tiebreak rule.

**Mechanism: canonicalized-hash first-author-wins, plus a permissionless near-duplicate challenge.**

**Step 1 — canonicalization (closes exact, rotated, mirrored, and shifted copies in one shot).** At publish, before anything else, the program:
1. Crops the 9×9 grid to the minimal bounding box containing all non-EMPTY cells (closes simple **translation** copying — shifting the whole design by a tile).
2. Applies all 8 elements of the dihedral group D4 (4 rotations × 2 reflections) to the cropped pattern, each re-padded to a fixed reference frame (closes **rotation/mirror** copying).
3. Picks the lexicographically smallest of the 8 byte serializations as the canonical form.
4. Hashes it: `canonical_hash = sha256(canonical_bytes)`.

CU cost: 8 cheap byte-array transforms/compares (~200–500 CU each) + one `sol_sha256` syscall over ≤162 bytes (~250 CU) ≈ **~4,000 CU total** — a rounding error inside the ~150k-CU `publish_lock` budget.

**Step 2 — first-author-wins, for free, from Solana's own account semantics.** `LockHashRegistry`, seeds `["hash", canonical_hash]`, is created with an `init` constraint inside `publish_lock`. Anchor's `init` fails atomically if the account already exists. There is no comparison logic to get wrong and no race to arbitrate — the **second** publish attempt with a colliding canonical hash simply cannot land, in the same way MILLWRIGHT's "ties never overwrite" needs no judgment call. This account is permanent (never closed, even if the lock is later retracted) specifically so a rejected copier cannot retry the same design under a fresh hash by exploiting a closed-and-reopened registry slot.

**Step 3 — the case the geometry can't catch: near-duplicates.** A plagiarist who changes one DECOY's cosmetic type, or shifts one component by a tile while preserving the functional path, produces a different canonical hash and passes Step 2. This is caught by a **permissionless, bond-free, fully deterministic** instruction:

`flag_duplicate(new_lock, prior_lock)` — callable by **anyone**, including automated off-chain scanners that crawl newly published locks and diff them against the catalogue for free (search happens off-chain, where it's cheap and unbounded; the on-chain check stays O(1) regardless of catalogue size). The instruction loads both `Lock` accounts, re-derives each one's canonical form (Step 1, ~4k CU each), and counts differing cells (not raw bytes — cell-level: kind, rotation, and param must all match to count as "same"). If **≤4 of 81 cells differ (≥95% identical)**, the newer lock's `flags` bit `PLAGIARIZED` is set: `unlock_lock` on that lock now fails permanently (checked via a guard on the flag), so it earns nothing going forward. Existing PickerRecords are left alone (harmless, already-paid leaderboard entries). **No bond, because there is nothing to grief** — the threshold check is a pure deterministic comparison, not the probabilistic spot-check MILLWRIGHT's module certification needs (that one bonds because it samples 64 of an intractably large state space; this one just diffs 81 cells). A false claim simply fails the threshold and costs the caller one network fee.

CU cost: `flag_duplicate` ≈ **9,000–11,000 CU** (2× canonicalization + 81-cell diff + one flag write). Lamport cost to the flagger: base fee only, ~5,000 lamports (~$0.0004).

**What clawback does *not* do, and why.** Retroactively reversing already-collected royalties on a confirmed plagiarist requires reconstructing per-unlock payment history and is expensive and error-prone for a 4-week build. v1 **revokes future earning, does not claw back the past.** This is stated explicitly rather than hidden: the mechanism bounds the plagiarist's take at "however much they collected before someone noticed," which for a 95%-identical copy of a real lock in a small catalogue is realistically hours, not months.

**A genuine fork is protected by the same machinery, for free.** `fork_lock` (week 5+) declares its `parent` explicitly. Publish requires the fork's canonical form to differ from its declared parent's by **more** than the 4-cell threshold — an honest fork is UX-gated to be substantial (the editor tells the author "not different enough yet"), while a dishonest copy that tries to hide its lineage by *not* declaring a parent is caught by the permissionless flag against the true original instead. Trivial no-op "forks" cannot even land, because they'd collide with the parent's own `LockHashRegistry` entry at Step 2.

---

## 6. On-chain architecture

Rust, Anchor. Three crates, naming matching the house convention: `lm-vm` (`no_std`-style core, zero deps, no float, no alloc — the interpreter from §2), `lm-program` (Anchor, depends on `lm-vm`), `lm-wasm` (wasm-bindgen wrapper over the identical `lm-vm`).

### 6.1 Accounts

Rent uses `(128 + data_len) × 6,960` lamports, SOL at $80.

**`Config`** — seeds `["cfg"]`, 48 B, 0.001225 SOL. Written at init and on admin parameter change only (pause flag); **read-only in every hot path.**
```
disc[8] admin[32] house_bps:u16 ancestry_bps:u16 author_bps:u16 paused:bool bump:u8
```

**`Lock`** — seeds `["lock", author, nonce:u32le]`, **325 B**, 0.0031529 SOL (~$0.25). Author-paid at publish.
```
disc[8] author[32] parent[32]              // parent = Pubkey::default() if root
canonical_hash[32] grid[162]               // 81 cells × (kind<<4|rot<<2|flags, param)
entry_x:u8 entry_y:u8 entry_facing:u8
publish_slot:u64 unlock_price:u64
unlocks:u32 picks:u32
best_instr:u16 best_instr_slot:u64
best_ticks:u16 best_ticks_slot:u64
best_touched:u8 best_touched_slot:u64
rebate_slots_left:u8 flags:u8 bump:u8
```
Retractable (author, rent refunded) only if `unlocks == 0` and within 7 days of publish. Otherwise permanent.

**`LockHashRegistry`** — seeds `["hash", canonical_hash]`, 81 B, 0.00145464 SOL (~$0.12). **Never closed** — this is the anti-squat property from §5. Created once via `init`; the constraint itself is the plagiarism check.
```
disc[8] lock[32] author[32] publish_slot:u64 bump:u8
```

**`PickerRecord`** — seeds `["pick", lock, player]`, 112 B, 0.0016704 SOL (~$0.13), **refundable on close**. Doubles as the unlock receipt and the per-player leaderboard entry.
```
disc[8] player[32] lock[32] unlocked_slot:u64 ladder:u8
best_instr:u16 best_instr_slot:u64
best_ticks:u16 best_ticks_slot:u64
best_touched:u8 best_touched_slot:u64
solved:bool bump:u8
```

**`Treasury`** — seeds `["treasury", shard:u8]` where `shard = player.to_bytes()[0] & 7`, 9 B × 8 shards, 0.0009535 SOL each. Holds only the house's accumulated cut; swept periodically by the admin.

**There is no lock NFT, no Token-2022 mint, and no marketplace account.** Ownership is the `author: Pubkey` field on `Lock`. §0 explains why this is a stronger claim than the transfer-hook design it replaces, not a weaker one. Authorship can move via a bare `transfer_authorship(lock, new_author)`, signed by the current author — a free, non-custodial primitive two parties use however they like; an on-chain escrow for paid authorship trades is explicitly not in MVP (§12).

### 6.2 Instructions

| Ix | Signers | Key args | Writable accounts |
|---|---|---|---|
| `init_config` | admin | house_bps, ancestry_bps, author_bps | Config |
| `publish_lock` | author | `grid[162]`, entry, `unlock_price`, proof-pick program | Lock(init), LockHashRegistry(init), author |
| `fork_lock` (w5+) | author | as above + `parent: Pubkey` | Lock(init), LockHashRegistry(init), Parent(read), author |
| `unlock_lock` | player | — | Lock, PickerRecord(init_if_needed), player, author, [ancestors ≤4], Treasury[shard] |
| `submit_run` | player | `program[≤72B]`, `ladder:u8` | PickerRecord, Lock (only if improved) |
| `close_picker_record` | player | — | PickerRecord(close → player) |
| `retract_lock` | author | — | Lock(close → author, only if `unlocks==0` and <7 days old) |
| `transfer_authorship` (w5+) | author | `new_author: Pubkey` | Lock |
| `flag_duplicate` (w5+) | anyone | `new_lock`, `prior_lock` | Lock (flags only) |

`publish_lock` embeds a solvability proof: it runs the same VM the author's submitted program against the just-defined grid, inline, in the same instruction, and fails atomically if it does not reach SINK. This is the "prevents unsolvable spam" property from the original pitch, unchanged.

`unlock_lock` never accrues anything — it routes lamports as direct system transfers to `author`, up to 4 ancestor pubkeys read from `remaining_accounts` (validated against each `Lock.parent` chain, 8/4/2/1% of the `ancestry_bps` pool, unfilled generations rolling to the direct author), and the sharded `Treasury`, all inside one instruction. The program never takes custody of a lock's future earnings.

`submit_run` recomputes everything — the client submits no claimed scores, only the program bytes. It checks `PickerRecord.unlocked`, runs the VM, and updates only the axes that improved (never overwrites an equal score, same principle as MILLWRIGHT's tie rule, for the same reason: it makes copying someone's exact PICK program strictly non-improving).

### 6.3 Account contention — explicit

The 12M CU per writable account per block ceiling is the real limit, and this design corrects the original's misapplication of it (§0 point 4).

- **`Lock` is per-lock.** Worst case ~190k CU per `submit_run`/`unlock_lock` touching one lock: `12M / 190k ≈ 63` writes/block on a single lock ≈ **180/s at 350ms slots**. Even a viral lock getting 1,000 unlocks in its first day averages 0.012/s — three to four orders of magnitude under the ceiling.
- **`PickerRecord` is per (player, lock)** — contention only against oneself, effectively a self-imposed rate limit nobody needs.
- **`Treasury` is the account that actually needed sharding**, because it is hit by *every* unlock platform-wide, unlike any per-lock account. At ~14k CU per `unlock_lock` writable-Treasury cost, `12M / 14k ≈ 857` writes/block/shard × 8 shards ≈ **6,850 writes/block ≈ 19,600/s** at 350ms slots. Realistic volume at 2,000 DAU (§8) is ~0.0046/s. Headroom: **~4,200,000×**. This is the correct application of the sharding lesson the original design applied to the wrong account.
- **`Config` and `LockHashRegistry` are read-only or write-once**, never contended.
- Priority fees stay near zero everywhere because Solana's fee market is local to writable accounts and none of ours are globally hot.

### 6.4 L1 / client split

| Layer | Owns |
|---|---|
| Client (WASM) | The identical VM (§2). Every run a player makes while designing or golfing. Editor, replay renderer, canonicalization preview. Zero cost, instant. |
| L1 | Lock publication and the hash-uniqueness check; the canonical VM as a public program; PickerRecord and royalty routing; plagiarism flagging. |

No ephemeral rollup: the game is turn-based (a program is submitted, not streamed), matching the original pitch's own correct reasoning — there is no tick loop to host in real time. No VRF: the sim contains zero randomness by design (§7), so there is nothing to source it for.

---

## 7. Determinism and verification

**The VM.** `lm-vm` compiles to `wasm32-unknown-unknown` and to SBF from the identical source, no `cfg` divergence anywhere in the interpreter loop. Integer-only: u8 registers, u8/u16 counters, no floats, no hash maps, fixed-size arrays for the 81-cell grid, statically bounded loops (tick cap 240, probe cap 4, instruction cap 24). The interpreter is a straight PC-driven fetch/decode/execute loop over the ISA in §2.2 — deterministic by construction, because every verb's effect is a pure function of (grid, current probe states, registers, tick).

**Verification is one transaction.** `submit_run` takes the raw program bytes, runs the VM from scratch inside the instruction (no client-supplied scores, no partial state, no chunking across multiple transactions), and writes only the axes that improved. Worst case ≈ 240 ticks × 4 probes × ~100 CU/probe-tick (component dispatch + register ops + movement resolution) = 96,000 CU, plus ~40,000 CU overhead (grid deserialize, instruction decode, event/PDA writes) ≈ **~136,000 CU typical/worst case**, requested at ~170,000 CU with a 25% margin. This is comfortably under the 200,000 CU default per-instruction budget — no `ComputeBudget` over-request needed, which matters because priority fees scale with CU *requested*, not consumed.

**This number is a target, not a promise.** Per the critique's explicit demand, it is benchmarked in Mollusk in week 1, before any other work, exactly the way MILLWRIGHT's spec treats its own CU claim. If real component-dispatch cost lands above ~100 CU/probe-tick, the levers are the tick cap and the probe cap — game-visible, tunable constants — not new hardware, because the architecture (PC-driven, event-based, never grid-wide) already removed the 5–10x source of error the critique identified.

**The parity harness** (`lm-vm` native vs. `lm-wasm` vs. SBF under LiteSVM) is written in week 1, before the Anchor program exists: 15,000–20,000 generated PICK programs — random valid, plus adversarial (SPLIT storms at the 4-probe boundary, JMPIF loops that hit the 240-tick boundary exactly, SENTINEL-without-CUT early termination, GATE/PLATE combinations, COUNTER-to-zero edge cases) — asserting byte-identical `(picked, ticks, instructions_used, touched, per-tick state hash)` across all three targets, in CI on every commit. A divergence here is the single worst failure mode in the whole system, exactly as in MILLWRIGHT: it means a player sees one result locally and a different one on-chain.

---

## 8. Cost model (SOL = $80)

### 8.1 CU

| Instruction | CU (typical) | CU (worst case) |
|---|---|---|
| `publish_lock` (root) | ~150k | ~195k |
| `fork_lock` (w5+) | ~155k | ~200k |
| `unlock_lock` (root, no ancestry walk) | ~10k | ~14k |
| `unlock_lock` (4-generation fork, w5+) | ~16k | ~20k |
| `submit_run` | ~136k | ~190k |
| `flag_duplicate` (w5+) | ~9k | ~11k |
| `close_picker_record` | ~5k | ~6k |
| `retract_lock` | ~6k | ~8k |
| `transfer_authorship` (w5+) | ~3k | ~4k |

The client sets the CU limit from its own local WASM run's exact instruction/probe/tick trace, not a guess, for the same reason MILLWRIGHT does: requested CU is what priority fee is priced against.

### 8.2 Lamports per action

| Action | Lamports | USD |
|---|---|---|
| `submit_run` (network fee + modest priority) | ~5,300 | ~$0.00042 |
| `unlock_lock` (typical 0.01 SOL lock + fee) | 10,005,300 | ~$0.80 |
| `publish_lock` (0.01 SOL total: rent + surcharge) | 10,000,000 + fee | ~$0.80 |
| Lock rent (325 B), author-paid, refundable if retracted within 7 days & unsolved | 3,152,880 | $0.252 |
| LockHashRegistry rent (81 B), author-paid, **never refunded** | 1,454,640 | $0.116 |
| PickerRecord rent (112 B), player-paid, refundable on close | 1,670,400 | $0.133 |
| Treasury shard rent (9 B × 8), dev-paid once at deploy | 7,628,160 total | $0.61 total |

A player who never authors pays only unlock prices — **$0** in mandatory rent, since PickerRecord rent is refunded on close and the player never touches Lock or LockHashRegistry. Once a lock is unlocked, golfing it to the top of every ladder costs **~$0.0004/attempt, unlimited** — this is the direct payoff of §0's fix #1.

### 8.3 Dev cost at 1,000 DAU/day

Assume 1,000 DAU, 0.2 unlocks/DAU/day = 200 unlocks/day, ~500 `submit_run`/day (free-fee re-solving/golfing), ~5% of DAU are brand-new = 50 new players/day × up to 20 sponsored network fees each on **free tutorial locks only** = 1,000 sponsored sigs/day.

| Line | Per day | Per month |
|---|---|---|
| Kora-sponsored network fees (tutorial-only) | $0.40 | $12 |
| Helius RPC tier (no ER, low write volume — Developer/Growth) | $3.25 | $99 |
| Indexer VPS + Postgres | $1.50 | $45 |
| **Total** | **~$5.15** | **~$156** |

At 100 DAU: ~$70/month (Kora ~$1/mo, Helius starter-to-free tier, VPS $25/mo). At 2,000 DAU: ~$349/month.

---

## 9. Client stack

**Framework.** TypeScript, Vite, React, static bundle, no SSR (matches `@solana/kit` guidance in the 2026 stack, per file 01). **Canvas 2D** for the sim/replay view — not CSS grid divs, correcting the same mistake MILLWRIGHT's own concept avoided for the same reason: a smooth tick-by-tick probe-movement replay wants a scrubber, and CSS grid is the wrong tool for that even though it's fine for a static board. The editor chrome (component palette, budget counter, instruction list, leaderboard tables, lock catalogue, fork tree) stays plain DOM/CSS — zero art budget, monospace + a 5-glyph emoji set per component kind, no image assets anywhere.

**Wallet.** A passkey-wrapped in-browser keypair (mirrors MILLWRIGHT's "mill key" pattern) for gameplay identity — no seed phrase, no extension, no app store. It never custodies real value for a picker who hasn't unlocked anything. A Wallet Standard link flow (Phantom/Backpack/Solflare) is required only to pay for an unlock, publish a lock, or receive royalties.

**Funding flow.** None for the tutorial ladder: the first 8–10 seed locks are `unlock_price = 0`, and Kora sponsors their network fees, so a zero-SOL passkey wallet clears the entire onboarding path. The **first real paywall** is the first paid unlock: link a wallet, pay 0.01 SOL (existing wallet, or a card on-ramp widget ~90 seconds, the honest bottleneck — card conversion will be low, 10–20%, same caveat as every crypto-consumer product in 2026).

**Link → playing, under 60 seconds:**

| t | |
|---|---|
| 0 s | A shared lock's page opens; grid renders immediately, static, fully inspectable — no wallet prompt. |
| 3 s | An animated 30-second demo run loops, showing a probe navigating the grid via a canned program. |
| 5 s | "Try the tutorial ladder" routes a first-time visitor to a free lock. |
| 8 s | Editor-style program composer opens: drag verbs from a palette into slots, no raw bytes visible. |
| 10–40 s | Player assembles a short program, hits SIMULATE — local WASM runs it in milliseconds, animates the probe, shows exactly which tick/cell it failed at if it did. |
| ~45 s | On a real solve: "Save this run on-chain?" — first click creates the passkey identity, no SOL needed (free lock, sponsored fee). |
| ~50 s | `submit_run` lands; the instruction/tick/touched histogram appears next to the player's own numbers. |

Time to first input: under 15 seconds. Time to first free verified score: under a minute. The first payment prompt never appears before that.

---

## 10. Economy

**Where money enters:** exactly one door — a player pays to unlock a lock. Nothing else is a revenue event.

**Sinks:** unlock payments (consumed instantly, split 60/15/25, no accrual), the publish surcharge (0.0054 SOL of the 0.01 SOL publish cost, house revenue, non-refundable). There is no faucet, no emission, no token, no staking yield, and — unlike MILLWRIGHT — **no purse at all**: there is no promotional prize pool anywhere in this economy, only direct producer-to-consumer payment for content. This makes the death-spiral argument simpler than MILLWRIGHT's: there is no fixed weekly line item that can outrun revenue, because there is no line item that isn't a percentage of real, contemporaneous commerce. If revenue goes to zero, that means nobody is choosing to pay to unlock anything — a product failure, not a financial spiral, and the on-chain program keeps accepting publishes and unlocks forever regardless, for whatever it costs to keep a program deployed.

**Self-farming stays strictly loss-making**, recomputed for the new split: a root-lock author who unlocks their own lock gets back 60% (author) + 15% (unfilled ancestry, rolls to them) = 75% of what they paid — a guaranteed 25% loss. Sybil authoring gains nothing either: publishing costs 0.01 SOL and earns zero unless a human other than the author chooses to unlock it.

**Dev revenue at 100 DAU** (≈350 MAU at 3.5×, 0.2 unlocks/DAU/day):

| Stream | Monthly |
|---|---|
| Unlock house cut: 600 unlocks × 0.01 SOL × 25% | $120 |
| Publish surcharge: ~4 new locks × 0.0054 SOL | $2 |
| **Gross** | **$122** |
| less infra | −$70 |
| **Net** | **+$52/month** |

Modest, but positive from day one — the honest difference from MILLWRIGHT's −$130/month at the same DAU is that there is no purse to fund; this is a straight commerce ledger.

**Dev revenue at 2,000 DAU** (≈7,000 MAU):

| Stream | Monthly |
|---|---|
| Unlock house cut: 12,000 unlocks × 0.01 SOL × 25% | $2,400 |
| Publish surcharge: ~91 new locks × 0.0054 SOL | $36 |
| **Gross** | **$2,436** |
| less infra | −$349 |
| **Net** | **~$2,090/month** |

**Top author at 2,000 DAU:** if the leading author's catalogue captures 6% of unlock volume (720/month) on their own root locks (75% take), that's `720 × 0.01 SOL × 75% = 5.4 SOL/month ≈ $432/month` — real side income, paid instantly, enforced by the program rather than a revenue-share agreement the platform can rewrite. This is the direct answer to the critique's "author economics never clear the threshold" finding: the access model, not a bigger DAU number, is what fixes it. Back-solving, a leading author crosses **$1,000/month around ~4,600 DAU**, holding the same 6% share.

---

## 11. Bots and solvers

Under the old per-attempt model the critique correctly showed "bots are the customers" was exactly backwards — an offline solver pays once for unlimited free local search. **The access model repairs this claim rather than needing to walk it back**: unlocking a lock costs the same 0.01 SOL whether the eventual solver is a human, a SAT solver, or a beam search, because the fee is decoupled from attempt count entirely. A bot that unlocks and instantly solves 500 locks pays exactly what 500 humans doing the same would pay — **5 SOL (~$400)**, split the same way, with zero discount for automation.

**What a bot can extract for free:** nothing monetary. There is no per-attempt payout, no drop, no emission, and submitting a leaderboard-eligible score requires an already-paid `PickerRecord.unlocked == true`. **What a bot can extract at a real cost:** leaderboard rank. This is handled exactly like MILLWRIGHT's module bots, because it is the same shape of problem — two divisions sharing one verification path: **HAND** (self-declared, unenforced, social — where the community actually lives) and **OPEN** (solver output explicitly welcome — where the record lives). `PickerRecord.ladder` is set at first submission per lock and is immutable.

**Quantified:** a bot operator topping the OPEN leaderboard across 200 locks pays `200 × 0.01 SOL = 2 SOL (~$160)` for zero monetary return — a real, non-trivial cost for a purely reputational prize. There is no pool anywhere in this system for a bot to drain, by the same construction that makes self-farming loss-making (§10): money only ever moves point-to-point from a consumer who chose to spend to a producer who made something, never through an extractable common pot.

**The discovery rebate is bounded against sybil racing.** A bot could spin up fresh wallets to claim all 3 free-rebate slots on every newly published lock the instant it goes live. The maximum possible cost of this, ever, is `3 × unlock_price` **per lock**, funded only from that lock's own house share — it cannot exceed 0.03 SOL/lock and cannot touch author revenue at all. Worst case, this is bots subsidizing their own onboarding at a fixed, budgeted house cost — an accepted, self-limiting cost, not a drain.

---

## 12. Four-week build plan

**Week 1 — the VM and the parity harness.** `lm-vm` in Rust: PC-driven interpreter (§2.1–2.2, event-driven by construction, not a grid-wide scan — the direct fix for the critique's CU finding), all 12 components, the 8-verb ISA, the 4-probe cap, the 240-tick cap, canonicalization (crop + D4 + lex-min + hash, §5). CU instrumentation on the tick loop; tune toward the ≤100 CU/probe-tick target. WASM build. **The parity harness is written before the Anchor program exists**: 15,000–20,000 generated programs (random + adversarial), asserting byte-identical results across native/WASM/LiteSVM-hosted SBF, in CI on every commit. *Exit criterion: 15,000/15,000 parity, worst-case run measured under 190k CU in LiteSVM.*

**Week 2 — the Anchor program.** Config, Lock, LockHashRegistry, PickerRecord, sharded Treasury. `init_config`, `publish_lock` (single-author only — no forking yet, so the ancestry pool always rolls 100% to the author), `unlock_lock` (60%/15%-rolls-to-author/25% split, direct transfers, no shard-walking needed at this stage since there are no ancestors yet), `submit_run`, `close_picker_record`, `retract_lock`. Full LiteSVM test suite: self-farming-is-loss-making assertion, hash-collision-rejected-at-publish assertion (the plagiarism mechanism's core property), tick/probe cap enforcement, PDA seed correctness, rent-refund correctness. Deploy devnet. *Exit criterion: a devnet publish → unlock → submit_run round-trip from a CLI.*

**Week 3 — client.** Vite/React, Canvas 2D grid + probe-movement replay renderer, drag-and-drop component editor with live budget counter, visual PICK-program composer (verb palette, not raw bytes), local WASM SIMULATE with step/scrub, three-axis leaderboard UI, passkey wallet + Wallet Standard linking. **Landing layer**: Helius Sender with staked connection, exact CU limits computed from the local run, fresh blockhash per attempt, retry-with-backoff, categorized failure logging (this and the Kora self-host below are the specific items the critique flagged as unbudgeted — they get their own real time here). Self-hosted Kora relay scoped to free/tutorial-lock actions only, with per-wallet daily sponsorship caps. *Exit criterion: link → free verified score on devnet in one session, with a landing-failure histogram from 500 synthetic submissions.*

**Week 4 — content, polish, seed, launch.** Dev authors 30–35 locks across a difficulty ladder (first 8–10 free), spending the full component set deliberately (not just the worked-example subset). Recruit the 8–10 named individuals (§4). Discord bot posting solve-replay embeds. Mainnet deploy. *Exit criterion: Mon 2026-09-21, launch with a populated free ladder and the founding cohort playing.*

**Weeks 5–6 — forking economy (not MVP, additive by design).** `fork_lock` (parent-diff publish-time check, §5), ancestry royalty routing (≤4-generation walk via `remaining_accounts`, dust-cutoff justified, §1/§6), `flag_duplicate` (permissionless near-duplicate challenge, §5), `transfer_authorship`. Ship to the founding cohort first.

### NOT IN MVP — explicitly cut

Forking, ancestry royalties, and near-duplicate flagging (weeks 5–6, but exact-hash dedup via `LockHashRegistry` — the cheap, load-bearing half of §5 — **is** in the 4-week core, since it's essentially free). Authorship transfer / any paid resale escrow (week 5+; the underlying primitive is a 3-line field update, not a marketplace). Bounty locks (cut for engineering-scope reasons — a real design would need escrow, shortlist selection, and refund logic that doesn't fit a 4-week budget; not a legal decision, that analysis is out of scope here). The curation purse (**cut permanently** — replaced by the mechanical, non-predictive discovery rebate, §1). Any lock NFT, Token-2022, or Metaplex Core mint (**cut permanently** — §0 explains why the redesign doesn't need one at all). MagicBlock ephemeral rollup (not needed — turn-based, no tick loop to host). VRF (zero randomness by design — nothing to source). Mobile layout, Solana Mobile dApp Store listing. Ratings/comments beyond the three score axes. Tournaments. A global sorted leaderboard account (derived from indexed events instead, same reasoning as MILLWRIGHT §3.1 — a single global hot account buys nothing a per-lock PDA plus an indexer doesn't already give for free).

**Slip rule:** if week 3 slips, cut the landing-layer polish (optimistic UI, failure categorization) and ship a plainer retry loop — the VM and the plagiarism mechanism are the product, not the UX chrome. If week 1 slips, slip everything; a VM without parity is not shippable at any date, exactly as in MILLWRIGHT.

---

## 13. Kill criteria

Measured, dated, decided in advance.

| When | Signal | Action |
|---|---|---|
| **Week 4 post-launch** | Fewer than 5 of the founding 8–10 solve a lock in week 4 | **Stop.** The puzzle isn't fun to the exact audience it was built for; nothing downstream fixes this. |
| **Week 6** | No lock has been published by anyone outside the dev and the founding cohort | **Stop or fundamentally restructure the authoring incentive.** This is the concept's own named biggest risk, and it is measurable exactly on schedule. |
| **Week 8** | Median unlocks per active player per month < 3 | The access-model bet (§0 fix #1) isn't converting browsing into paying; redesign pricing or the tutorial-to-paid funnel once, re-check at week 12. |
| **Week 8** | D7 retention of non-recruited signups < 12% | Redesign onboarding once. If unchanged by week 12, stop. |
| **Week 12** | Fewer than 40 weekly actives | **Stop building.** Leave the program deployed, read-only; it costs under $10/month with no purse to maintain. |
| **Week 12** | Top author's monthly royalty income < $50 despite DAU tracking toward the §10 projection | The authoring incentive doesn't clear the bar even with the corrected economics — the critique's core economic concern was right at a deeper level than pricing. Stop investing in the forking/ancestry layer; the core picking loop can still stand alone. |
| **Any week** | > 4% of `unlock_lock`/`submit_run` transactions fail to land after 3 attempts, or median `submit_run` CU exceeds 190k in production | **Freeze feature work until fixed.** A dropped submission reads to the player as the game stealing their solved puzzle. |
| **Any time** | A WASM/SBF parity divergence reaches production | **P0, take the site read-only.** The entire trust story is that a local result and an on-chain result are the same number; one divergence breaks it worse than a month of downtime. |
| **Any time** | `flag_duplicate` confirms plagiarism on more than 5% of newly published locks in a rolling 30-day window | The plagiarism mechanism is deterring nothing; investigate whether the 4-cell threshold is miscalibrated before assuming the catalogue is simply full of copycats. |
| **Week 16, hard stop** | < 200 weekly actives **and** < $500/month gross revenue | The audience thesis — that a Zachtronics-adjacent puzzle audience can be reached and monetized without ever saying "earn" — is falsified. Archive, open-source `lm-vm` and the program, leave the ladder running. Do not raise money chasing a retention loop that week 16's data says isn't there. |

**The risk that actually kills this, unchanged from the concept's own honest assessment, is content, not code.** The plagiarism mechanism, the CU budget, and the access-model pricing are all now correctly engineered — but none of them manufacture authors. If the founding cohort does not become a genuine author base by week 6, the fork tree the whole royalty story depends on stays a single node with the dev's name on it, and no amount of on-chain correctness fixes that.
