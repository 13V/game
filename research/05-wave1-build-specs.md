

# SPEC: Split or Bust

# Split or Bust — Build Spec v1.0
**Tech Director build spec · 2026-08-20 · target: engineer starts Monday**

---

## 0. What changed from the winning concept (and why)

| Critique finding | Fix in this spec |
|---|---|
| 100/6 has no integer symmetric profile | **5 seats.** Focal point 20 each = exactly 100. Internal accounting in basis points (pot = 10,000 bp) so every split is exact. |
| Rollover → divergent escalation → permanent lockup | **No rollover, ever.** A bust pays the *entire* pot to the lowest claimer. Every round clears. |
| Every player is a long-run loser; 22% hold | **Zero rake, zero real money.** Each round is exactly conserved (100 in, 100 out). Sum of all season scores = 0 by construction. |
| Equal split is the boring equilibrium | **The ante equals the equal share.** Ante 20, pot 100. Playing 20 nets exactly zero. You cannot climb the ladder without taking a position. The safe play is a null action. |
| Gambling / MTL / escheatment stack | Chips are per-season, non-purchasable, non-transferable, non-cashable, not an SPL mint. Consideration prong removed. |
| Telegram TON-exclusivity bans the funnel | **No Mini App, no bot, no Blinks.** PWA + OG-unfurling permalinks + server-rendered PNG. Nothing platform-owned to ban. |
| ER over-specified by 5 orders of magnitude, costs 12% of revenue | **Plain L1. No MagicBlock anything in v1.** 0.6 TPS at 50k DAU. |
| Sybil farms 5 of 6 seats | Nothing to farm — chips have no exit. Ranked ladder is matchmade + SAS-gated; private tables are unranked by definition. |
| Six-person acquisition unit | **Bot seats.** A table runs 5-handed with up to 2 labelled bots. Minimum viable friend group is 3. |

---

## 1. Tightened design

**Table:** 5 seats. 14 rounds. One round per day, resolving 21:00 UTC. Season = 14 days.

**Chips:** each seat is granted exactly **28,000 bp** at season start (14 × 2,000 ante). No other issuance. Season score = final balance − 28,000. Non-transferable, non-purchasable, non-cashable, never leaves the Table account.

**Round:** everyone antes 2,000 bp → pot = 10,000 bp. Each player secretly picks an integer claim `c ∈ [0,100]` (UI: percent; on-chain: `c × 100` bp).

**Resolution** (`S` = sum of *revealed* claims):

| Case | Payout |
|---|---|
| `S ≤ 100` | Each revealer gets `100c` bp. The remainder `(100−S)×100` bp goes to the **highest** revealed claim (split evenly among ties, leftover bp assigned by ascending seat index). |
| `S ≥ 101` | **BUST.** Entire 10,000 bp pot to the **lowest** revealed claim (split evenly among ties). Everyone else gets 0. |
| Abstainers (no reveal) | 0, always. Ante stays in the pot. Counted as GHOST on the profile and the card. |
| All 5 abstain | Pot burns. Only chip-destroying path in the game. |

**Why this is a game and not a coordination puzzle:**

- Against four honest 20s, claiming 21 → sum 101 → bust → the four at 20 split the pot at 25 each (+5); you get 0 (−20). **Unilateral greed from the focal point is self-punishing.**
- Claiming 19 → sum 99 → you get 19, the four 20s split the leftover point. **Unilateral timidity loses too.**
- Now suppose one player is a known hog and will claim 25. Opponents sum to 85. Claim 15 → safe, net −5. Claim **16** → sum 101 → bust, and *you are the lowest* → you take the whole pot, **net +80**. This is the **Snipe**: deliberately tip the table over while holding the lowest hand. It requires reading exactly one person correctly.
- Two players attempting the snipe: the higher one eats −20. Contested and legible.

Two winning roles, both named on the share card: **HOG** (took the remainder on a clean round) and **SNIPER** (took the pot on a bust). The loser is named too: whoever claimed highest on a bust.

**Progression:** season percentile → persistent rating (off-chain, Elo-lite on percentile) → cosmetic unlocks. No power, no chips, no gameplay effect purchasable at any tier.

**Player cost:** $0. Optional Season Pass $4.99/season, table branding $9.99, card skins $1.99–3.99.

---

## 2. On-chain architecture

Single Anchor program, `splitbust`. Anchor **1.1.2** (`@anchor-lang/core` — *not* `@coral-xyz/anchor`). No ER, no delegation, no CPI beyond system program. CPI depth 1.

### 2.1 Accounts

**`Config`** — seeds `["config"]`, **96 B**, rent 0.001559 SOL. Written once at deploy, **read-only in every gameplay instruction** (passed non-mut → takes no write lock).
```
disc 8 | admin Pubkey 32 | crank_authority Pubkey 32 | season u16 2
resolve_hour_utc u8 1 | paused u8 1 | bump u8 1 | _rsv 19
```

**`Player`** — seeds `["player", authority]`, **108 B**, rent 0.001643 SOL (~$0.13).
```
disc 8 | authority Pubkey 32 | created_slot u64 8 | attestation Pubkey 32
lifetime_rounds u32 4 | lifetime_hog u32 4 | lifetime_snipes u32 4
lifetime_ghosts u32 4 | seasons u16 2 | flags u8 1 | bump u8 1 | _rsv 8
```
`attestation` = SAS credential account (Civic uniqueness) or `Pubkey::default()` for unranked. Written by `register_player` and `record_season` only — **never** during a round.

**`Table`** — seeds `["table", table_id.to_le_bytes()]` where `table_id: u64` is client-random. **640 B**, rent 0.005345 SOL (~$0.43), refunded to host on `close_table`.
```
disc 8 | table_id u64 8 | season u16 2 | host Pubkey 32
seats [Pubkey;5] 160
seat_count u8 | visibility u8 | bot_mask u8 | rounds_total u8
phase u8 | commit_round u8 | reveal_round u8            (7 B)
commit_deadline i64 8 | reveal_deadline i64 8
chips [u32;5] 20
slots [RoundSlot;2] 336        // 2-deep ring, see §2.3
last_result 29                 // kind u8 | claims [u8;5] | sum u16 | winners_mask u8 | payouts [u32;5]
ghost_counts [u8;5] 5 | bump u8 1 | _rsv 16

RoundSlot (168 B) = round u8 | commits [[u8;32];5] 160 | claims [u8;5] 5 | mask_c u8 | mask_r u8
```
**Deliberately not on-chain:** full 14-round claim history (emitted as events, indexed off-chain), leaderboard, ratings, salts, card renders. The chain stores only what resolution arithmetic requires.

**`SessionToken`** — seeds `["session", authority, session_key]`, **120 B**, rent 0.001726 SOL. `authority 32 | session_key 32 | expires i64 8 | table Pubkey 32 | bump | _rsv 7`. Scoped to one table, one instruction (`submit_turn`), 7-day expiry. ~40 lines in-program; do **not** pull `@magicblock-labs/gum-react-sdk` (3.0.10, Nov 2025, slow cadence) for this.

### 2.2 Instructions

| ix | signers | args | writes | ~CU |
|---|---|---|---|---|
| `init_config` | admin | crank_authority, resolve_hour | Config | 10k |
| `register_player` | authority (+ Kora payer) | — | Player (init) | 12k |
| `open_session` | authority (+ payer) | session_key, expires, table | SessionToken (init) | 12k |
| `create_table` | host (+ payer) | table_id u64, visibility u8, bot_mask u8 | Table (init) | 30k |
| `join_table` | joiner (+ payer) | — | Table | 9k |
| `start_season` | any seated player *or* crank | — | Table | 8k |
| **`submit_turn`** | session_key *or* authority (+ payer) | `commit: [u8;32]`, `reveal_claim: u8`, `reveal_salt: [u8;32]`, `has_reveal: bool` | Table | **11k** |
| `resolve_round` | **permissionless** | — | Table | **18k** |
| `record_season` | crank_authority | seat_idx, summary | Player | 9k |
| `close_table` | host, after season | — | Table (close) | 6k |

CU budgets requested: `submit_turn` 20,000, `resolve_round` 30,000. Priority fees scale with the *requested* limit (SIMD-0096), so do not over-request. Mollusk benches gate these in CI (§9 W1).

### 2.3 The one-transaction-per-day state machine

Rounds overlap by design so a player never has to show up twice:

```
21:00 D0 ──── commit window round N ────► 21:00 D1 ──── reveal window round N ────► 21:00 D2
                                          └──── commit window round N+1 ──────────┘
```
At any wall-clock moment a player owes exactly one action: **reveal round N−1 and commit round N, in the same instruction** (`submit_turn`). `slots[N % 2]` holds the committing round; `slots[(N-1) % 2]` holds the revealing round. `resolve_round` fires at `reveal_deadline`, clears the stale slot, and advances. Steady state: **1 tx/player/day, 1 resolution card/day, 1 crank tx/table/day.**

### 2.4 Contention / parallel execution

- **There is no global writable account.** `Config` is never mutated after deploy and is always passed read-only. There is no counter, no registry, no leaderboard account, no vault.
- Every gameplay tx takes exactly **one write lock: the Table PDA**. `register_player`/`open_session`/`record_season` take one Player-or-Session lock and never co-occur with a round.
- `table_id` is a client-generated random `u64`, so table creation does not serialize on anything.
- At **10,000 concurrent tables**: 50,000 `submit_turn` + 10,000 `resolve_round` per day = **0.69 TPS across 10,000 disjoint write locks.** A single Table sees at most 6 writes/day ≈ 80k CU — against a 12M CU/writable-account/block cap that is 0.7% of one block's budget for a whole day.
- Local fee markets therefore price every table at the floor. Set CU price 5,000 µlamports as pure landing insurance, not contention pricing.
- Accounts per tx: 5 (Table, Player, payer, session, sysvar). No ALT needed, no 64-lock pressure, and we fit the 1,232-byte legacy tx limit with ~900 bytes to spare (SIMD-0296's 4KB is irrelevant to us).

### 2.5 L1 / ER / off-chain split

- **L1:** all four account types, all state that determines a payout. That is the whole game.
- **Ephemeral rollup:** **none.** Justification: the game is one action per player per 24 hours; ER session (0.0003 SOL) + commit (0.0001 SOL) fees would exceed L1 signature costs by ~10×, and the ER trust model (fraud proofs, DA, undelegation-under-validator-failure) is undocumented. Revisit only for Blitz mode (§6) and only as a **Private ER**, where the TEE buys a real feature (no reveal step) rather than latency nobody asked for.
- **Off-chain (Postgres + object store, fed by Helius webhooks on program logs):** full claim history, ladder, ratings, collusion detection, encrypted salt escrow (opt-in), push notifications, share-card PNGs. The chain is the source of truth; every off-chain view is derivable from emitted events.

---

## 3. Randomness & fairness

**There is no randomness in this game.** No VRF, no SlotHashes, no oracle, no commit-reveal *for entropy*. The only cryptographic requirement is sealed simultaneous commitment. Anyone who reaches for a VRF here is adding a vendor dependency to a deterministic game.

**Commitment:**
```
H = blake3( "SPLITBUST_v1" || program_id || table_pda || round_u8
          || player_pubkey || claim_u8 || salt_32 )
```
`salt` = 32 bytes from `crypto.getRandomValues`, stored in IndexedDB and (opt-in only) as an AES-GCM blob server-side under a key derived from a passkey-gated signature.

| Attack a player will actually try | Why it fails |
|---|---|
| Brute-force the 101-value claim space from the on-chain hash | 32-byte salt → 2²⁵⁶ preimages per claim |
| Copy a rival's commitment to mirror their claim | `player_pubkey` is in the preimage; a copied hash can never be opened by you |
| Replay your own commitment across rounds/tables | `table_pda` + `round` bound in |
| **Never reveal a losing claim** (the classic) | Ante is taken at commit, per Switchboard's own rule. Abstention pays 0 and forfeits 2,000 bp with zero payout eligibility. Revealing *any* claim weakly dominates abstaining. |
| Watch partial reveals, then abstain to deny a sniper | Real residual. The reveal itself is forced by the hash — the only free choice left is abstain-vs-reveal. Cost to the abstainer is −2,000 bp and a public GHOST marker vs the sniper's +8,000. We accept it, and `ghost_rate` is a launch kill-criterion (§10). Eliminated in v2 by a Private ER where there is no reveal step. |
| Crank censors an unfavourable resolution | `resolve_round` is **permissionless** after `reveal_deadline`. Any player can resolve their own table. The crank is a convenience, never an authority. |
| Server learns your claim early | Server never holds a plaintext salt unless the player explicitly enables auto-reveal escrow (default off, labelled in plain language). |
| Leader/RPC front-run | Solana has no public mempool; commits are hashes; by reveal time every commit is already binding. |

If a future variant needs entropy (e.g. a randomized wildcard seat), use **MagicBlock VRF on L1** (0.0005–0.0008 SOL, <500ms–2s) or **Switchboard On-Demand** (slothash-bound commit-reveal + SGX) for anything with a prize attached. **Never SlotHashes.**

---

## 4. Cost model

SOL at **$80** (recompute at build time; the landscape figure is inferred).

**Per action:**

| Action | Sigs | Base fee | Priority (5,000 µL × CU) | Total lamports | USD |
|---|---|---|---|---|---|
| `submit_turn` | 2 (session key + Kora payer) | 10,000 | 100 | **10,100** | $0.00081 |
| `resolve_round` | 1 (crank) | 5,000 | 150 | **5,150** | $0.00041 |
| `register_player` (once) | 2 | 10,000 | + rent 1,642,560 | 1,652,660 | $0.132 |
| `open_session` (per 7 days) | 2 | 10,000 | + rent 1,726,080 | 1,736,180 | $0.139 ← refunded on close |
| `create_table` (once/table) | 2 | 10,000 | + rent 5,345,280 | 5,355,430 | $0.428 ← refunded on close |

**Per player per day (steady state):** `submit_turn` 10,100 + 1/5 of `resolve_round` 1,030 = **11,130 lamports = $0.00089/DAU/day.**

**Per 1,000 DAU/day:** 11.13M lamports = 0.01113 SOL = **$0.89/day = $27/month.**

**One-time acquisition cost per user:** $0.13 sunk (Player PDA rent, permanent) + $0.28 recoverable (session + amortized table rent, reclaimed on season close). Budget **$0.15 net per new user in on-chain cost.**

**Full stack at 50,000 DAU / 10,000 concurrent tables:**

| Line | Monthly |
|---|---|
| `submit_turn` fees (Kora-sponsored) | $1,215 |
| `resolve_round` crank fees (10k/day) | $124 |
| New-account rent, net of reclaim, at 8% monthly churn-in | $600 |
| Helius RPC + webhooks, Business tier | $499 |
| **LaserStream / Yellowstone streaming** | **$0 — not needed at 0.7 TPS. Explicitly declined; it is a $500–6,000/mo trap for a game that writes 60k txs/day.** |
| Turnkey signing (~$0.0001/sig × 1.5M) | $150 |
| Kora VM + KMS | $60 |
| App/API/DB/render (Fly.io + Neon + R2) | $600 |
| **Total** | **≈ $3,250/mo = $0.065 per DAU per month** |

No DAS-API dependency (no cNFTs in v1), so we are not hostage to an indexer vendor for reads — `getAccountInfo` on a Table PDA returns the entire live game state in one call.

---

## 5. Client stack

- **PWA.** React 19 + Vite + TypeScript. No Unity (Solana.Unity-SDK's C# core hasn't been republished to NuGet since 2024-02-26 — budget a fork, and we don't need one for a slider).
- **`@solana/kit` 7.1.1** with the new React hooks (`usePayer`, `usePlanTransaction`, `useSendTransaction`). Not web3.js v1, not the v3 rc bridge (no legacy codebase to migrate), not `gill` (9 months stale, absent from docs).
- **Codama 0.13.1** generates the TS client from the Anchor IDL. Kinobi is dead.
- **Wallet discovery:** Wallet Standard via `@solana/kit-plugin-wallet`. Not `@solana/wallet-adapter-*` (stale since 2025-06).
- **Embedded wallet: Turnkey.** Passkey → TEE signing at the curve layer, sub-150ms, per-signature pricing, full attestation. Turnkey explicitly ships no paymaster — which is fine, because:
- **Fee relayer: Kora** (solana-foundation, shipped Apr 2026). Pin a released tag and verify audit status *for that tag* — main is the integration branch. Policy: whitelist `splitbust` program id + the 4 gameplay discriminators; require a signer with an existing `Player` PDA; cap 10 sponsored txs/day/Player and 3 account creations/day/IP; hard daily lamport ceiling with automatic degrade-to-user-pays.
- **Landing layer** (budget a week of engineering — a naive `sendTransaction` loop visibly drops player actions): fresh blockhash every 30s, CU price from a rolling 75th-percentile sampler on our own program's accounts, bounded 3-attempt retry with exponential backoff, staked-connection routing via Helius Sender. Jito bundles only for the season-close batch (5-tx atomic close + rent reclaim). At 350ms slots (epoch 1020, ~2026-08-21) a confirm lands in ~700ms.
- **Mobile:** PWA + **Solana Mobile dApp Store** listing (1,561 apps, 0% platform fee, uncontested channel). MWA 2.3.0 for external Android wallets. iOS = Add-to-Home-Screen + Web Push (16.4+). No native builds in v1.
- **Share artifact:** server-rendered 1200×1200 PNG (satori + resvg-js), permalink `/r/<table_id>/<round>` with OG tags. Unfurls natively in iMessage, WhatsApp, Telegram, Discord, X. **No Telegram Mini App, no bot, no Blinks/Actions** — nothing owned by a platform that can ban us.

**Link → playing, cold, under 60 seconds:**

| t | |
|---|---|
| 0:00 | Tap `/t/<id>` from a group chat. Static shell < 150KB critical JS. |
| 0:03 | Live "3/5 seats" counter, faces of who's already in, the one-sentence rule. |
| 0:08 | "Take a seat" → WebAuthn / Face ID. Turnkey mints the wallet. No seed phrase, no "network", no "SOL", no chain vocabulary anywhere in the UI. |
| 0:12 | 20-second bot round starts **immediately**, while `register_player` + `open_session` relay in the background. You claim 40, the sum comes back 118, you bust. You now know the game. |
| 0:38 | `join_table` lands (second and final biometric prompt). |
| 0:50 | Drag the slider, tap Claim. `submit_turn` confirms in ~700ms via the session key. **Zero prompts for the next 7 days.** |
| 0:56 | Prefilled share card, back to the chat. |

---

## 6. Economy

**Faucet:** exactly 28,000 bp per seat per season, granted at `start_season`. Nothing else mints chips, ever. There is no mint account, no SPL token, no LP, no market.

**Sinks:** none required. Every round is exactly conserved: 10,000 bp in, 10,000 bp out. The single leak is an all-ghost round (10,000 bp burned), which is bounded and self-limiting.

**Why it cannot death-spiral, in one line:** total chips in a table are pinned at 5 × 28,000 = 140,000 for the whole season, and Σ(season scores) = 0 identically. There is no emission, no yield, no faucet/sink balance to get wrong, and no exchange rate to collapse. The only decayable resource in this game is attention.

**Rake:** zero. There is no pot of value to take a cut of. This is the single change that deletes the entire gambling/MTL/escheatment stack from the critique.

**Team revenue:**

| SKU | Price | Notes |
|---|---|---|
| Season Pass | $4.99 / 14-day season | Animated resolution card, card frames, post-season analytics ("your claim distribution vs the table", bust rate vs ladder) |
| Table Branding | $9.99 one-time per table | Custom name + art on **every share card that table ever produces**. This is the one SKU whose value scales with the viral loop, because the card is the ad. |
| Card skins | $1.99–3.99 | |

Nothing purchasable touches chips, claims, ordering, matchmaking, or resolution. Stripe web checkout on the PWA (2.9% + 30¢); no app-store cut on Android via the dApp Store (0%).

**Month 6, with arithmetic.** Assume 40,000 DAU / 8,000 concurrent tables:

- Season Pass at 4% attach: 1,600 × $4.99 = $7,984/season × 2.14 seasons/mo = **$17,086**
- Branding on 2% of ~2,000 new tables/mo: **$400**
- Skins at 1.5% × $2.99: **$1,794**
- Gross **$19,280**, less 3.5% payment fees = **$18,606**
- Infra at 40k DAU ≈ **$2,700**
- **Contribution ≈ $15,900/mo ≈ $190k/yr.**

Read that honestly: at 40k DAU this funds two people, not a studio. The number to manage in month 6 is not margin, it is D30 — and the mechanic is thin (one integer per day). The month-6 retention plan is **Blitz mode** (5-minute rounds, identical rules — this is the actual retention product and the only place a Private ER earns its keep), plus variant rule packs (7-seat, "Hog tax" where the remainder is halved, "double-or-nothing bust") and the cross-table ladder. If Blitz does not move D30, this is a six-week novelty and should be treated as one.

---

## 7. Anti-bot / anti-cheat

**Day one, a bot tries four things.**

1. **Mass passkey wallets to farm the ladder.** Nothing to farm: chips are non-transferable and have no exit; the prize is a rank and a cosmetic. Ranked ladder requires an SAS credential (Civic uniqueness) written to `Player.attestation`; unattested accounts play unlimited private tables and score 0 ranked. Cost of a uniqueness credential exceeds the value of a card frame.
2. **Collude 4-of-5 to feed one account** (4 claim 0, target claims 100, +80/round). **Structurally unfixable in a 5-player claim game — do not pretend otherwise.** The defence is not prevention, it's seating: **ranked seats are matchmade, never self-selected.** You cannot choose who you sit with on the ladder. Private tables are self-selected and unranked, where collusion is called "playing with your friends." Backstop: off-chain detector flags tables where a seat's mean claim < 3 over ≥5 rounds, or season-score Gini > 0.75; flagged tables are excluded from the ladder and participants lose ranked eligibility for one season.
3. **Grief the Kora fee budget.** Every sponsored tx costs us 10,000 lamports and the attacker 0 — so gate it at three layers: the program rejects a second `submit_turn` in the same round (junk txs fail pre-flight simulation and Kora refuses to sign), Kora policy caps 10 sponsored txs/day per Player PDA, and Player PDA creation costs either a passkey attestation + hCaptcha or 0.002 SOL self-paid. Daily lamport ceiling with auto-degrade.
4. **Play optimally in private tables.** Fine — **bots are a feature here.** House bots fill empty seats so a 3-friend group can start immediately, are visibly labelled, are excluded from ranked, and play a published mixed strategy. This directly attacks the critique's hardest problem (the acquisition unit is a group, not a player): minimum viable group drops from 5 to 3.

**Claim cheating:** impossible by construction. Commitments are cryptographic, resolution is a deterministic pure function on-chain, and there is no hidden server state to manipulate. There is no anti-cheat surface, only an anti-sybil one.

---

## 8. Legal posture

*Not legal advice; retain counsel before any prize with cash value.* The structural choice that removes essentially all of the exposure the critique priced at $1–3M is that **chips can never be bought and can never be cashed out** — no stake, no rake, no pot of value, no token, no mint, no transferability, no secondary market, no custody of player funds. That removes the consideration prong of the prize/chance/consideration test and with it the state gambling analysis, the FinCEN MSB + 40-state MTL footprint, and the unclaimed-property/escheatment problem that an indefinitely-held pot would have created. The Season Pass is an ordinary cosmetic subscription governed by ordinary consumer law (ROSCA, California ADRA, EU right of withdrawal) — real obligations, but cheap and standard. There is no token and nothing sold with an expectation of profit, so the securities question does not arise. Residual real exposure: sweepstakes law the moment we run a tournament with a prize of cash value (AMOE plus state registration, and we would then be back in the world the critique described), COPPA and a 13+ gate, GDPR/CCPA on the off-chain claim history, and app-store review flagging a game about greed as gambling-adjacent — so self-rate 17+, use zero casino iconography, and never render a chip as a currency symbol. **The single line an engineer must not cross: the moment chips become purchasable or cashable, every item in the critique's legal section returns in full.**

---

## 9. MVP cut line — 4 weeks

**Week 1 — Program.** Anchor 1.1.2 scaffold (note: duplicate mutable accounts now error by default; Program Metadata replaces legacy IDL; every pre-2026 tutorial is wrong). Four accounts, ten instructions, blake3 commitment, resolver extracted as a pure `fn resolve(claims: [Option<u8>;5]) -> [u32;5]`. Tests: LiteSVM unit suite (Anchor's default template), **100k-case property fuzz over all claim vectors asserting Σpayouts ∈ {10000, 0}**, Surfpool localnet with time manipulation to fast-forward `commit_deadline`. **Mollusk CU benches in CI with hard gates: `submit_turn` ≤ 15k, `resolve_round` ≤ 25k — a CU regression is a per-player cost regression.**
*Deliverable: devnet deploy, a full 14-round season played end-to-end by a test script.*

**Week 2 — Infra.** Codama-generated TS client. Turnkey passkey wallet flow. Kora deployed on a pinned audited tag with the policy in §5. Session-key PDA + 7-day scoped signing. Crank worker (resolve + advance, permissionless fallback documented). Landing layer with blockhash refresh, CU-price sampler, bounded retry. Helius webhook → Postgres event indexer with replay-from-slot.
*Deliverable: a table resolves itself unattended for 3 consecutive days on devnet.*

**Week 3 — Client.** PWA: create/join, live seat counter, slider + Claim, one-tap reveal+commit, resolution card, 14-round history, Web Push at commit-open and resolve. Share-card renderer + OG permalinks. Bot seats.
*Deliverable: play a full season on a phone with no wallet knowledge.*

**Week 4 — Onboarding, edges, closed beta.** 20-second bot tutorial. Sub-60s cold-start path instrumented and measured. Ghost/abstain edges, all-ghost burn, tie handling, season close + rent reclaim. Telemetry for every kill-criterion in §10. **25 real friend-group tables in closed beta.**

**Explicitly NOT in the MVP:** any real money, USDC, token, or mint · rake · ranked ladder, SAS attestation, ratings · NFTs of any kind (Metaplex Core trophies, Bubblegum V2 soulbound badges) · **any MagicBlock product** (ER, Private ER, VRF, Cranks, Ephemeral SPL, Session Keys SDK) · Telegram Mini App or bot · Blinks/Actions · Discord bot · Blitz mode · variant rule packs · Season Pass, branding, and skins (build the paywall only if week-4 beta retains) · native iOS/Android · Unity/Godot · ZK compression · any DAS-API dependency · geofencing · in-app chat (the group chat *is* the chat).

---

## 10. Kill criteria

Cohort: the 25 closed-beta tables plus the first 500 public tables. Measure at **day 21 post-launch**. These are stop conditions, not dashboards.

| # | Metric | Kill threshold | What it disproves |
|---|---|---|---|
| **1** | **Season completion rate** — tables reaching round 14 with ≥4 live human seats | **< 40%** | The only question the MVP exists to answer: do five friends voluntarily play 14 rounds for zero money? **This one alone is fatal.** |
| 2 | D7 turn participation — round-1 players still submitting at round 7 | < 65% | Daily cadence is too slow / too thin |
| 3 | Ghost rate (seat-rounds with no reveal) | > 12% | The two-rounds-in-flight commit-reveal UX failed; either escrow-by-default or go Private ER |
| 4 | Organic seat fill — new-to-product players per new table | < 1.4 | The empty-seat counter is not recruiting. The entire distribution thesis is dead. |
| 5 | Share-card CTR (unique link opens ÷ cards rendered) | < 8% | The bust card is not an ad, and it was the whole plan |
| 6 | Median within-table claim variance at round 10 | **< 4 points** | **Design failure, distinct from retention:** the table solved itself into the equal split and there is nothing left to argue about. The Hog/Sniper tension did not materialize. |

**Rule:** #1 below threshold → stop. Any two of #2–#6 → stop. 

**Positive gate:** if season completion ≥ 60% **and** organic seat fill ≥ 2.0, the next build is **Blitz mode**, not monetization.


# SPEC: Vaultbreak

# Vaultbreak — Build Spec v1.0
**Status:** approved for build, 4-week MVP, devnet, score-only
**Date:** 2026-08-20 · **TD sign-off required before Week 2 on the two UNVERIFIED items in §2.6**

---

## 0. What changed from the bake-off doc, and why

The concept's on-chain justification (score 8.7) was the best in the set. Its money layer scored 1.0 and the critique is correct that it is fatal: a public, deterministic, positive-EV vault with a queue is Fomo3D with card art, and the rational defender publishes an unsolvable vault and farms failed-attempt fees at zero risk.

**We delete the money layer permanently. Not deferred — deleted.** No player-funded prize pool, no attempt fee, no defender bounty, no rake, no token. Vaults hold nothing.

What survives is the thing that actually scored: *the byte/lock/CU budget is a real puzzle and the transaction signature is a receipt no Web2 game can hand you.* That receipt is worth exactly as much with 0 USDC at stake. Vaultbreak becomes an authored, deterministic constraint-optimization game — Curta × Advent of Code × code golf — monetized as a **$15 season pass and cosmetics**, i.e. a store, not a market.

Three further corrections, all load-bearing:

1. **The signature tutorial beat was physically impossible and is re-derived in §1.3.** 67 account locks cannot occur inside 1,232 bytes. Bytes bind first, always. The ALT is not a power-up that raises the lock ceiling; it is the *only* mechanism by which >~33 accounts is reachable at all, and it *relieves* the byte meter. The puzzle is rebuilt around that fact.
2. **"Probes return one bit" is theater on public L1 state** — anyone can `getAccountInfo` the vault. So we do not sell hidden information. We sell *optimization under a public, verifiable constraint*, where knowing the answer and fitting the answer in 1,232 bytes are different problems. No Private ER needed, no undocumented trust model in the critical path.
3. **Jito bundles and ephemeral rollups were mutually exclusive as specified.** We use neither. Co-op is two signers in one transaction — atomic by construction, on L1, costs 65 bytes. See §1.4.

---

## 1. Tightened design

### 1.1 The loop

| | |
|---|---|
| Unit of play | One **heist** = one Solana transaction |
| Execution length | 1 slot (350 ms after epoch 1020) |
| Planning length | Untimed. Median session 8–20 min |
| Players | 1 (async competitive), optional 2 for co-op vaults |
| Cost per attempt | **0 to the player.** ~5,125 lamports (~$0.0004) sponsored by Kora |
| Season | 13 weeks, 128 vaults, $15 USDC pass |
| Free tier | 3 tutorial vaults + 1 daily "Front Door" vault, no pass, no leaderboard |

You open a vault. Its guard configuration is fully public — you can read it with `getAccountInfo`, and we publish it in the UI. Solving it is not the hard part. **Fitting the solution inside the transaction is the hard part.**

You drag instruction cards into a plan strip carrying four live counters, all computed exactly client-side by real message serialization:

```
BYTES   1,281 / 1,232   ← over
LOCKS      31 / 64
CU        214k / 1,400k
DEPTH       2 / 4        ← CPI depth
```

Hit RUN. The transaction lands. Each instruction lights green or red in sequence from the tx logs; one red and the whole thing reverts. Reversion is the dramatic beat and it is free.

### 1.2 Two leaderboards, and the second one is the game

- **SOLVED** — did you crack it. Binary. ~60% of pass holders reach this on a median vault.
- **PAR** — your `(bytes, cu, locks)` triple versus the author's reference solution. This is the retention loop. Solving is one evening; beating par is a week. Par is published only after 100 global solves, so the first week is genuine discovery.

Ranking key: `bytes ASC, cu ASC, locks ASC, elapsed_slots ASC`. Elapsed slots are measured **from your own instance's `opened_slot`**, not wall-clock — so there is no latency race, colocation is worth zero, and a searcher's staked connection buys nothing (see §7).

### 1.3 The corrected constraint model

Legacy/v0 transaction, 1 signer, exact wire arithmetic:

```
signature count byte              1
signature                        64
version byte (v0)                 1
message header                    3
account-keys compact-u16          1
static account keys          32 × N
recent blockhash                 32
instruction count byte            1
per instruction        1 + 1 + k + 1 + d
ALT section count byte            1
per lookup table       32 + 1 + w + 1 + r
                            ─────────────
                          ≤ 1,232 total
```

Fixed floor = **103 bytes**. That leaves 1,129.

- A **static** account costs **32 bytes** and 1 lock.
- An **ALT-resolved** account costs **1 byte** and 1 lock, plus **34 bytes per table** amortized.
- Signers and (conservatively, see §2.6) program IDs **must be static**.

Consequences the design is built on:
- With zero ALTs and zero instruction data, the hard ceiling is **~33 accounts**, not 64. The critique is right.
- The ALT is the *bridge* between the two meters: it converts byte pressure into lock pressure at a 31-byte-per-account discount with a 34-byte entry cost. **Two tables only pay off past ~3 accounts each.**
- Therefore par budgets are authored so that **instruction data and static-key count bind before locks**. Cards carry heavy payloads on purpose: `bypass(code:[u8;32])` is 41 bytes of data; `route(a,b,u64,u64)` is 25.

**Corrected tutorial beat (Vault 03, "Front Door"):**

```
plan: begin, cut_power, pick_lock(2), route, crack
BYTES 1,281 / 1,232   ← 49 over, strip glows red
```
You drag in the **stack_alt** card. Six read-only accounts (vault spec, two sysvars, three prop-program state accounts) collapse from 32 bytes to 1 byte each: −186 bytes, +34 for the table header.
```
BYTES 1,129 / 1,232   LOCKS 31/64   CU 214k/1,400k
RUN → green green green green green
```
Net −152 bytes. Arithmetic checks. The player has now internalized ALTs by hitting the wall, not by reading a doc.

### 1.4 Cards (MVP set: 12)

| Card | Program | Bytes (data) | CU est. | Role |
|---|---|---|---|---|
| `begin_heist` | core | 8 | 3,000 | Mandatory first ix; resets instance state |
| `probe(i)` | guards | 9 | 2,500 | Reads a guard bit into state |
| `pick_lock(n)` | guards | 9 | 4,000 | Flips tumbler n if precondition met |
| `cut_power` | guards | 8 | 2,000 | Disables one guard class for the rest of the tx |
| `bypass(code)` | guards | 40 | 6,500 | sha256 preimage check; expensive in bytes |
| `flash_borrow(amt)` | vb_credit | 16 | 11,000 | Scans Instructions sysvar, requires matching repay |
| `flash_repay(amt)` | vb_credit | 16 | 7,000 | Must appear later in the same tx |
| `route(a,b,in,min)` | vb_swap | 25 | 12,000 | Toy constant-product AMM, u128 math |
| `stack_alt` | *(not an ix)* | 0 | +~200/acct | An address lookup table attached to the message |
| `accomplice` | core | 8 | 3,500 | Requires a 2nd signer; +65 bytes, unlocks co-op vaults |
| `overclock` | ComputeBudget | 5 | 0 | `SetComputeUnitLimit`; over-requesting costs priority fee |
| `crack` | core | 12 | 60k–110k | Terminal ix; verifies + scores. **Cost scales with your plan length** |

`crack` deliberately costs more the longer your plan is (§2.4). Your plan's own audit is part of its budget. That is what makes CU a *binding* meter rather than decoration.

### 1.5 Progression

128 vaults / season, 5 tiers, unlocked by solve count (not by payment):

| Tier | Vaults | Par bytes | Par CU | Par locks | Gate |
|---|---|---|---|---|---|
| 1 Doorway | 24 | 900–1,100 | ≤150k | ≤20 | tutorial |
| 2 Lobby | 32 | 1,150–1,220 | ≤300k | ≤28 | 8 solves |
| 3 Deposit Box | 32 | ≤1,232, 1 ALT req. | ≤600k | ≤40 | 30 solves |
| 4 Sub-Basement | 28 | ≤1,232, 2 ALT req. | ≤1.0M | ≤55 | 60 solves |
| 5 The Score | 12 | ≤1,232, CPI depth 4 | ≤1.35M | ≤62 | 90 solves; 4 are co-op-only |

Difficulty curve: tier 1 solvable without ALTs; tier 3 is unsolvable without them; tier 5 requires flash-loan composition *and* ALT packing *and* CU management simultaneously.

---

## 2. On-chain architecture

### 2.1 Programs

| Program | Purpose | Upgrade authority |
|---|---|---|
| `vb_core` | Seasons, vault specs, instances, scoring, `crack` | 3-of-5 Squads multisig + 48h timelock from S1 |
| `vb_guards` | Guard opcodes (`probe`/`pick_lock`/`cut_power`/`bypass`) | same |
| `vb_swap` | Toy constant-product AMM. Deployed **immutable** | none (burned) |
| `vb_credit` | Toy flash-lender, enforced via Instructions sysvar. **Immutable** | none (burned) |

`vb_swap` and `vb_credit` being separately-deployed immutable programs is what makes composability real without routing anyone's money through Jupiter — which also deletes a regulatory surface (§8).

### 2.2 Accounts

All sizes include the 8-byte Anchor discriminator. Rent = `(128 + len) × 6,960` lamports.

**`Season`** — seeds `["season", season_id: u16]`
```
disc 8 | season_id u16 2 | authority Pk 32 | start_slot u64 8 | end_slot u64 8
seed_commitment [u8;32] 32 | seed_revealed [u8;32] 32 | revealed bool 1
vault_count u16 2 | badge_tree Pk 32 | bump u8 1
```
**158 B → 0.00199 SOL ($0.16)**. Written ~3× per season. Read-only in every gameplay tx.

**`VaultSpec`** — seeds `["vault", season_id: u16, index: u16]` — immutable after `verify_vault`
```
disc 8 | season u16 2 | index u16 2 | author Pk 32 | open_slot u64 8 | close_slot u64 8
guard_program Pk 32 | par_bytes u16 2 | par_cu u32 4 | par_locks u8 1
ref_solution_sig [u8;64] 64 | variant_domain u32 4 | flags u8 1
solves u32 4 | verified bool 1 | bytecode_len u16 2 | bytecode [u8;512] 512
```
**687 B → 0.00567 SOL ($0.45)**, paid by the author, refundable on season close. `solves` is the only mutable field post-verification — see §2.5 for why that is not a hot-account problem.

**`Instance`** — seeds `["inst", season_id: u16, player: Pubkey]` — **one per player per season, reused across all 128 vaults**
```
disc 8 | season u16 2 | player Pk 32 | solved_bitmap u128 16 | current_vault u16 2
variant u32 4 | opened_slot u64 8 | attempts u32 4 | state [u8;32] 32 | bump u8 1
```
**109 B → 0.00165 SOL ($0.13)**, paid once, closable and fully refunded at season end.

This single decision is what makes the cost model work: **per-vault accounts would have cost $146/day of sponsored rent at 1,000 DAU.** Per-vault results live off-chain in the indexer; the transaction itself is the permanent proof.

**`Pass`** — seeds `["pass", season_id: u16, player: Pubkey]`
```
disc 8 | season u16 2 | player Pk 32 | purchased_slot u64 8 | tier u8 1 | bump u8 1
```
**52 B → 0.00125 SOL**. Soulbound by construction (a PDA, no transfer instruction exists). The Bubblegum V2 soulbound cNFT badge is cosmetic only and is **never read on-chain** — deliberately, because a Merkle proof at tree depth 14 costs 128–448 bytes and would be catastrophic inside a byte-budgeted gameplay transaction.

**`TopBoard`** — seeds `["top", vault: Pubkey]` — optional, ships Week 5
```
disc 8 | vault Pk 32 | entries [{player Pk 32, bytes u16 2, cu u32 4, slots u64 8}; 16] 736
```
**776 B → 0.00629 SOL**. Written only on a top-16 improvement: ~16·H(n) ≈ 144 writes for a vault with 5,000 solvers. Negligible contention.

### 2.3 Instructions

| Instruction | Signer | Args | Writes |
|---|---|---|---|
| `init_season` | authority | `season_id, start, end, seed_commitment` | Season |
| `publish_vault` | author | `index, bytecode, par_*, open, close, flags` | VaultSpec |
| `verify_vault` | author | *(none — must be the terminal ix of a tx that also cracks the vault)* | VaultSpec.verified |
| `reveal_seed` | authority | `seed: [u8;32]`, asserts `sha256(seed) == commitment` | Season |
| `buy_pass` | player | `season_id` + USDC transfer to sharded treasury ATA | Pass |
| `open_instance` | player | `season_id` | Instance |
| `select_vault` | player | `vault_index` | Instance (resets state, sets variant + opened_slot) |
| `begin_heist` | player | — | Instance.state, attempts |
| `probe / pick_lock / cut_power / bypass` | player | see §1.4 | Instance.state |
| `flash_borrow / flash_repay / route` | player | see §1.4 | Instance.state (read-mostly) |
| `crack` | player (+ accomplice) | `declared_alts: u8` | Instance.solved_bitmap, VaultSpec.solves |
| `close_instance` | player | — | closes Instance, refunds rent |

**`verify_vault` is the anti-griefing mechanism.** A vault is unplayable until its author has landed a transaction that both solves it and calls `verify_vault`. This structurally kills the unsolvable-vault problem — the exact analogue of the fee-farm equilibrium that killed the money design, arriving through a different door.

### 2.4 On-chain scoring (the non-obvious part)

`crack` must measure the player's own transaction. It can, exactly:

- **Locks**: iterate `sysvar::instructions` with `load_instruction_at_checked(i)`, union the `AccountMeta` pubkeys. Gives the exact resolved account count.
- **CU**: read `sol_remaining_compute_units()` at `crack` entry; parse the `ComputeBudget111…` instruction from the same sysvar to recover the requested limit. `consumed ≈ requested − remaining + crack_cost`.
- **Bytes**: the sysvar returns *resolved* pubkeys, so it cannot distinguish static from ALT-sourced keys. Fix: **every ALT used must be passed to `crack` as a read-only account.** The program reads the table (entries kept sorted at creation), binary-searches each resolved key for membership, and reconstructs the exact wire size from `(n_static, n_tables, n_indices, n_signers, Σ ix data)`. 64 keys × log₂(32) ≈ 320 32-byte compares ≈ **6k CU**.

Total `crack` cost ≈ `18,000 + 2,600 × n_instructions + 200 × n_alt_accounts`, landing at **60k–110k CU** for a 6–20 card plan. Superlinear-feeling audit cost is intentional: it is what makes the CU meter trade against plan length.

The client mirrors this arithmetic in TypeScript by serializing the actual message, so the meters are exact *before* submission. Zero surprises at RUN.

### 2.5 L1 / ER / off-chain split, and the contention story

**Everything in the solve path is L1. We do not use an ephemeral rollup, and that is a design decision, not an omission: the ER's 64 KB transaction limit would delete the game.** The constraint *is* the product. This also resolves the original doc's contradiction (Jito bundles are an L1 leader-auction mechanism and cannot coexist with delegated ER accounts) by needing neither — co-op is two signers in one L1 transaction.

*(v2 only, flagged: an ER "Sprint" time-trial mode. Blocked on MagicBlock answering fraud proofs / DA / undelegation-under-validator-failure. No player funds would ever route through it, since there are none.)*

**Off-chain:** leaderboards, replays, the simulator, puzzle authoring, cosmetics metadata.

**Account contention — the answer:**

| Account | Writers | Frequency | Verdict |
|---|---|---|---|
| `Instance` | exactly 1 player | every gameplay tx | **Perfectly sharded.** A player would need ~50 tx/slot to approach 12M CU/block on their own PDA |
| `VaultSpec.solves` | all solvers of one vault | only on first solve | ~5k writes over a 13-week window; even a launch spike of 500 solves/min is 3/slot |
| `Season`, `VaultSpec.bytecode` | authority | ~never | read-only in gameplay |
| Treasury USDC ATA | all buyers | pass purchase only | **Sharded into 8 ATAs by `player[0] & 7`.** Unsharded, a 10k launch spike is ~2,400 transfers/block at ~5k CU — clears in 5 blocks but spikes the local fee market. Shard it anyway |

**There is no global writable account in the gameplay path.** Priority fees stay at floor because we never compete with ourselves. This is the whole reason the cost model in §4 works.

### 2.6 Blocking verification items (do these Monday morning)

1. **Can a program ID be resolved from an address lookup table?** We assume **no** and require program IDs to be static. If the runtime permits it, tier 3–5 par budgets loosen by ~128 bytes each and must be re-authored. Test on Surfpool in the first two hours. *(UNVERIFIED)*
2. **Which Solana major do Anchor 1.1.2 / 2.0.0-rc.1 target?** Anchor 1.0 targeted Solana 3.x; `solana-sdk` is at 4.1.0. Pin nothing until confirmed. *(UNVERIFIED)*
3. Does the 12M CU/writable-account/block cap scale down under SIMD-0525's shorter slots? Does not change our design (we are nowhere near it) but affects headroom claims. *(UNVERIFIED)*

---

## 3. Randomness & fairness

**There is no randomness in the solve path, and no VRF.** Every vault is authored, deterministic, and fully public. That is a deliberate inversion of the original design and it removes the chance element from the legal analysis (§8) at the same time as it removes the searcher's edge (§7).

The one genuine fairness problem in a public-transaction puzzle game is **solution replay**: transactions are public, so the second solver copies the first solver's instruction bytes.

**Solution: per-player cost-invariant variants** (the Advent of Code model).

```
variant = u32::from_le_bytes(sha256(season.seed_revealed || vault.index || player)[0..4])
          % vault.variant_domain
```

- `variant_domain` is 2³² for tier 3+, 2¹⁶ for tiers 1–2.
- A variant is a **cost-preserving relabeling**: it permutes account roles, rotates guard constants, reorders tumblers, and rotates the `bypass` preimage. The *shape* of the solution transfers between players — that is learning, and we want it. The exact bytes never do.
- **CI invariant (mandatory, Week 1):** a property test asserts that the reference solution's `(bytes, cu, locks)` triple is **identical across 10,000 sampled variants** for every published vault. A vault whose variance is non-zero cannot be published. This is what makes wallet-grinding pointless.

**Attacks and why they fail:**

| Attack | Defense |
|---|---|
| Replay the #1 player's transaction bytes | Different variant → guard checks fail → revert |
| Grind wallets for an easy variant | Variants are provably cost-identical; and each instance requires a $15 pass |
| Front-run the first solve for leaderboard glory | Rank uses **elapsed slots from your own `opened_slot`**, so there is no global race to win |
| Studio rigs a vault after seeing early solves | `seed_commitment` published at season start, `seed_revealed` at vault close; variants are underivable-but-committed until reveal |
| Buy a solution off-chain | Structure transfers, bytes do not. And we publish all reference solutions at vault close anyway — the write-up is the content (Curta model) |

**Explicitly not used:** SlotHashes (leader-manipulable, predictable within the slot), MagicBlock VRF, ORAO, Switchboard. Switchboard On-Demand stays on the shelf for a possible v2 "Blind Vault" mode where one guard threshold is unknown; even there, commit-reveal by the studio suffices because nothing of value is at stake.

---

## 4. Cost model

SOL assumed at **$80**. Recompute at build time.

**Per gameplay transaction** (1 signature, per-player PDA ⇒ no fee-market competition):

```
base fee                        5,000 lamports
priority @ 500 µlam/CU × 250k CU  125 lamports
                                ─────
                                5,125 lamports = 0.000005125 SOL = $0.00041
```

Client requests `measured_CU × 1.1`. Priority fee scales with the CU limit you *request*, not what you burn (SIMD-0096) — over-requesting is a real cost and the `overclock` card teaches exactly this.

**Per instruction, CU:** `begin` 3k · `probe` 2.5k · `pick_lock` 4k · `cut_power` 2k · `bypass` 6.5k · `flash_borrow` 11k · `flash_repay` 7k · `route` 12k · CPI overhead ~1.3k each · `crack` 60k–110k. Typical 6-card tier-3 heist: **180k–260k CU**. Tier-5 with depth-4 CPI: 900k–1.3M.

**Per player per day:** ~12 on-chain submissions (the other 40 iterations happen free in the local simulator) = **61,500 lamports = $0.0049**.

**1,000 DAU, monthly:**

| Line | Cost |
|---|---|
| Sponsored transaction fees (Kora) | **$147/mo** |
| Instance rent float (1,000 × 0.00165 SOL, refundable) | $132 one-time |
| Helius Business RPC + DAS | $499/mo |
| Streaming (webhooks at MVP scale; **not** LaserStream — that is $500–$6,000/mo and we don't need it until ~20k DAU) | $0 |
| The Range simulator (2 × c7g.large) | $120/mo |
| Postgres + web hosting + CDN | $200/mo |
| **Total** | **~$970/mo + $132 float** |

**Per-DAU-per-day fully loaded: $0.032.** Fees are 15% of that; infrastructure is the cost, not the chain.

At 20,000 DAU: fees $2,940/mo, RPC/streaming ~$3,500/mo (LaserStream tier), simulator ~$800/mo → **~$7,300/mo**, or $0.012/DAU/day. Costs scale sublinearly.

---

## 5. Client stack

**Framework:** Next.js 15 / React 19. DOM + CSS + Framer Motion for the plan strip. **No Unity** — the Solana.Unity-SDK's C# core has not been republished to NuGet since 2024-02-26 and this is a card UI, not a 3D game. Zero reason to take that maintenance risk.

**Solana client:** `@solana/kit` 7.1.1 with the new React hooks (`usePayer`, `usePlanTransaction`, `useSendTransaction`). Wallet discovery via **Wallet Standard** (`@solana/kit-plugin-wallet`) — **not** `@solana/wallet-adapter-*`, which is 14 months stale. Generated TS clients from the Anchor IDL via **Codama 0.13.1**. Not `gill`, not `@coral-xyz/anchor`, not web3.js v1.

**Programs:** Anchor `1.1.2` (`@anchor-lang/core`) for `vb_core`. **Pinocchio 0.11.2 for `vb_guards`** — it is the hot path, called 5–20× per transaction, and every CU is a design constraint the player feels. Tests: **LiteSVM** (Anchor's default template). CU regression gates in CI: **Mollusk 0.15.0**, failing the build on >3% CU drift on any card, because a CU regression silently invalidates every published par.

**Local validator:** Surfpool (Anchor's default; `solana-test-validator` is over).

**The Range** — the simulator, and the single most important non-obvious piece of the client:
- Byte / lock / CPI-depth counters are computed **locally in TS** by exactly serializing the v0 message. No round trip, updates on every drag.
- CU is returned by a stateless Rust/axum service embedding `litesvm` 0.15.2, p99 < 10 ms, per-instruction breakdown + logs.
- Unlimited free iteration. Only RUN touches the chain. This is what makes the golf metagame affordable.

**Wallet & onboarding — link to playing in under 60 seconds:**

```
0:00  Link opens. Board renders with NO wallet: a live ticker of strangers'
      heists resolving, each row linking to the real Solscan transaction.
0:08  "Try the Front Door." Vault 03 loads, 5 cards pre-dealt.
0:14  Drag 4 cards. Byte meter hits 1,281/1,232 and glows red.
0:26  Drag stack_alt. 1,129/1,232. Green.
0:31  RUN → Privy embedded wallet created silently (passkey, no seed phrase),
      Kora sponsors the fee. No popup, no SOL, no approval modal.
0:38  Five instructions light green in sequence.
0:41  Transaction signature, with an explorer link. That is the receipt.
0:45  Vault 04 unlocked. 15 seconds of budget left over.
```

Kora is pinned to a specific audited tag (audit status is tracked per-commit; the main branch is the integration branch — **do not deploy main**). Sponsorship is rate-limited to 60 tx/hour per Privy-verified identity with a daily SOL budget alarm at $25.

---

## 6. Economy

**There is no in-game currency, no token, no faucet, and no player-to-player value transfer.** A game with no faucet cannot inflate, and a game with no player-funded pool cannot be farmed. The economy is a store.

**In:**
| Source | Price | Notes |
|---|---|---|
| Season pass | $15 USDC / 13 weeks | Card on-ramp via Privy; gates `open_instance` + all 128 vaults |
| Cosmetic card skins | $3–$12 | Metaplex Core, ~0.0029 SOL/asset mint cost, 5% royalty plugin |
| Vault-author deposit | 0.00567 SOL | Refunded at season close |

**Out:** nothing. No prizes, no payouts, no yield.

**Rake: 0%.** The only take is a 5% secondary royalty on cosmetics.

**Sinks:** none needed. This is the point. The failure mode of P2E is that value enters only through new-user inflow; here there is no value circulating to inflate.

**Break-even arithmetic (honest):**

$15 / 13 weeks = **$1.15 per pass-holder per week.**

| DAU | Pass conversion | Monthly revenue | Monthly cost | Result |
|---|---|---|---|---|
| 1,000 | 25% | $1,250 | $970 infra | +$280 — **does not pay a single engineer** |
| 5,000 | 30% | $7,500 | $2,400 | +$5,100 |
| 20,000 | 35% | $35,000 | $7,300 | +$27,700 |
| 50,000 | 35% | $87,500 | $15,000 | +$72,500 |

Add cosmetics ARPU of ~$4/season from 20% of pass holders: +9% revenue.

**Break-even against a 3-person team ($45k/mo fully loaded) is ~18,000–20,000 DAU at 33% conversion.** That is the number this project lives or dies on and it should be on the wall.

**Month 6 (season 2 ships, season 3 authored):** the only real risk is **content supply**. 128 vaults/season is ~10/week of authoring, and if a vault costs 6+ engineer-hours the treadmill is unaffordable (see §10). The answer is the **player-authored vault editor**, gated by `verify_vault` (you must solve your own vault on-chain to publish it) and ranked by a stump-rate metric. Target: 40% player-authored content in season 3, 70% in season 4. Precedent: Trackmania, Mario Maker, Portal 2 Workshop — all of which outlived their first-party content by years.

**Why it cannot death-spiral:** there are no emissions, no yield, no float, and no counterparty. A 50% MAU drop halves revenue and changes nothing structurally; costs are ~fixed infra that scales down with usage. The failure mode available to us is churn, which is a normal game problem, not a monetary collapse.

---

## 7. Anti-bot / anti-cheat

**Bots are welcome. There is nothing to extract.** No vault holds value, so the entire Fomo3D failure mode — a colocated searcher clearing every profitable listing within one slot — has no object. This is the single largest structural win from deleting the money.

What a bot does on day one: writes a solver that enumerates card orderings against the byte/CU/lock constraint and lands a near-par transaction in minutes. Good. That is a legitimate way to play, and it is *exactly* our target user.

| Vector | Response |
|---|---|
| Solver bot beats humans on par | **Machine division.** Declare your solver, publish the repo, compete on a separate board. First-party sponsored: we want the solvers, and their write-ups are marketing |
| Latency / colocation advantage | Structurally worth zero. Ranking uses elapsed slots from *your* `opened_slot`. Staked connections buy nothing |
| Copying the leader's transaction | Per-player cost-invariant variants (§3) |
| Sybil farming the leaderboard | One `Instance` per `Pass`; `Pass` costs $15; free-tier vaults have no leaderboard |
| Kora fee-sponsorship abuse (wallets are free) | Sponsorship keyed to Privy-verified identity, 60 tx/hr, and free tier is limited to 4 vaults that carry no ranking |
| Selling solutions off-chain | Variants make exact bytes non-transferable; and we publish every reference solution at vault close ourselves |

**The board saturates, and that is fine.** Par is a bounded optimum — once someone hits it, nobody beats it, and ties break on earliest elapsed slot. The competition is *reaching* par, which is a human-scale problem for the first weeks of every vault.

---

## 8. Legal posture

*Not legal advice; this is the structural argument counsel should be asked to check.*

We have deliberately removed all three gambling elements rather than arguing about the third. **Consideration** exists ($15 pass) but **prize** does not — there is no payout, no prize pool, and no player-funded pot — and **chance** does not, because every vault is deterministic, authored, and publicly readable, with per-player variants derived by a committed hash rather than a randomness oracle. The original design's own defense ("deterministic and therefore skill-predominant") was contradicted by the Switchboard commit-reveal sitting two bullets above it; we resolved that by deleting the randomness rather than the argument. The pass is a paid product delivering a fixed, disclosed set of content — the same legal object as a puzzle-book purchase or a Steam game — not a wager, and because we never escrow player funds (the only PDA-held value is a player's own refundable rent), the money-transmission and state-MTL analysis that would have cost $1M+ and 18–36 months does not arise. There is no token, no expectation of profit from the efforts of others, and no secondary market we operate, so the Howey analysis on cosmetics is the ordinary consumer-goods one. The toy `vb_swap` / `vb_credit` programs are our own immutable contracts holding no real assets, which keeps the flash-loan mechanic while removing the broker/adviser surface that routing retail users through a live Jupiter route would have created. Two consequences worth naming: (a) mobile distribution **reopens** — Apple and Google both permit paid puzzle games, so the Solana dApp Store (1,561 apps, 0% fee) becomes an addition rather than our only channel; (b) the day we add a cash prize pool, sweepstakes and skill-contest law re-enters in every state, so any season prize in year one is non-cash (hardware, soulbound trophies) or sponsor-funded under published skill-contest rules. Budget for counsel: **$15k–$30k** for a structure review and consumer-terms work, versus the $250k–$1M+ the money design required.

---

## 9. MVP cut line — 4 weeks

Team: 2 Rust, 1 frontend, 1 designer/puzzle author. Target: **devnet, score-only, 100 external playtesters.**

**Week 1 — Programs**
- Verify §2.6 item 1 (ALT program IDs) in the first two hours. Re-author par budgets if it flips.
- `vb_core` (Anchor 1.1.2) + `vb_guards` (Pinocchio): Season, VaultSpec, Instance, Pass.
- On-chain measurement in `crack`: Instructions-sysvar lock union, ALT membership binary search, exact wire-size reconstruction, `sol_remaining_compute_units`.
- Variant derivation + **cost-invariance property test over 10,000 variants** (build-blocking).
- LiteSVM suite; Mollusk CU benchmarks wired into CI with a 3% drift gate.
- Ship to Surfpool → devnet by Friday.

**Week 2 — The Range and the strip**
- TS exact-serializer library (bytes/locks/CPI depth), unit-tested against real `getTransaction` sizes.
- Rust/axum + LiteSVM simulator, p99 < 10 ms.
- Plan strip UI: drag-drop, four live meters, red-state, submit path.
- Instruction-by-instruction green/red resolution animation driven by tx logs. **This is the product. It must be gorgeous.**

**Week 3 — Content and composition**
- 12 cards, `vb_swap` + `vb_credit` deployed immutable, flash borrow/repay pairing via Instructions sysvar.
- ALT card, co-op 2-signer card, 4 co-op vaults.
- 27 authored vaults (3 tutorial + 24 tier-1/2) with reference solutions and CI-verified pars.
- **Replay viewer:** paste any signature → rendered plan + meters + green/red timeline. Half the retention lives here.

**Week 4 — Onboarding and measurement**
- Privy embedded wallet (passkey), Kora relayer pinned to an audited tag, rate limits, budget alarms.
- Indexer: Helius webhooks → Postgres → leaderboards (SOLVED + PAR).
- The <60s onboarding script (§5), instrumented at every beat.
- Playtest with 100 external testers. Instrument every kill metric in §10 from day one.

**Explicitly NOT in the MVP:**
USDC or money of any kind · season pass purchase flow · cosmetics / Metaplex Core · Bubblegum badges · DAS API dependency · marketplace · ephemeral rollups · Private ERs · Jito bundles · any VRF or oracle · real Jupiter or lending-pool CPIs · player-authored vault editor · Machine division · on-chain `TopBoard` · mobile / dApp Store · tiers 3–5 · LaserStream / Yellowstone gRPC · Unity · account-data-size ("heat") meter · Sprint mode.

**The one question the MVP answers:** *do people resubmit a vault they have already solved, purely to shave bytes?* If yes, the golf metagame exists and this is a game. If no, it is a puzzle they finish once, and no amount of content fixes that.

---

## 10. Kill criteria

Measured on the Week-4 devnet cohort (n ≥ 100) and re-measured at mainnet weeks 6 and 12. **Any single trigger stops the project.**

| # | Metric | Kill threshold |
|---|---|---|
| 1 | **Golf re-engagement** — % of solvers who resubmit an already-solved vault to improve their score, within 30 days | **< 12%.** The metagame does not exist; the game is one-and-done |
| 2 | D1 / D7 retention of tutorial completers | **D1 < 25% or D7 < 10%** at week 4 with content available |
| 3 | Median attempts-per-solve | **< 2.5** (no iteration → no golf) or **> 40 with solve rate < 15%** (opaque, not hard) |
| 4 | Share rate — outbound clicks per solve on the replay/receipt | **< 3%.** No organic loop, and paid acquisition cannot carry a $15 pass at these margins |
| 5 | Free → pass conversion, mainnet week 6 | **< 8%.** Unit economics never reach the ~18k DAU break-even |
| 6 | Authoring cost per vault, week 10 | **> 6 engineer-hours** sustained. The season-2 treadmill is unaffordable; either pivot to fully player-authored or stop |
| 7 | Tutorial funnel | **< 45%** of link-openers reach a green RUN. The 60-second script is the whole acquisition thesis |
| 8 | Player-authored vaults published and verified, mainnet week 12 | **< 30.** UGC will not carry season 3, and first-party content alone does not close |

Metric #1 is the real one. Everything else is a leading indicator of it.


# SPEC: Blindside

# Blindside — Build Spec v1.0
**Date:** 2026-08-20 · **Status:** approved for 4-week MVP · **Owner:** TD
**SOL price assumption: $80.** Recompute §4 with live price before committing budget.

---

## 0. What changed from the bake-off pitch

The panel's three lethal objections were the continuous slider, the Vickrey/shill hole, and the Private-ER (TEE) dependency. All three are removed, and the mechanic survives intact.

| Pitch | Spec | Why |
|---|---|---|
| Continuous 0–100% slider | **3 discrete buttons: 20 / 45 / 80 energy** (keys 1/2/3, gamepad ◻/△/○, touch: three thumb buttons) | Inputtable with a thumb already on a stick. Also makes touch viable, which the slider never was. |
| Vickrey, second price, losers pay 0 | **First price. Winner pays their own bid. Ties: all tied bidders pay, crate splits N ways at 1/N duration; N≥4 the crate detonates and nobody gets it.** | A shill who overbids now *wins and pays*. Shilling becomes self-punishing rather than leveraged. Ties turn the lattice's mass-tie problem into the most exciting outcome in the game. |
| Private ER / TEE hides bids | **Plain ER + commit–reveal with a 3.0s commit window and a 0.5s reveal window, escrow-by-penalty.** Bids become permanently public at resolution. | Deletes the undocumented-trust-model dependency and the "TEE guards what the HUD prints one tick later" objection. Hiding is explicitly a **3.5-second mechanic**, not a privacy guarantee. |
| 20 players | **8 players** | Queue math (§10). 20-player needs ~7–12k DAU just to have a queue. |
| Death unspecified | **Death = energy hits 0.** Respawn `min(50, energy_at_death + 20)`, delay `2.0s + 0.5s × prior_deaths` (cap 4.5s), killer gains +15 energy, you drop your pickup. | Closes the "suicide to refill your wallet" exploit: dying feeds your killer, costs you the item you just bought, and puts you across the map. |
| Regen 8/s, dash 25 @0.9s | **Regen 10/s (suppressed 1.0s after taking damage), dash 15 @1.2s cd** | Old numbers made combat outrun regen 3.4×, so only passive players could afford interesting bids. Now sustainable spend ≈ 120/crate-cycle. |
| MagicBlock VRF for spawns | **Zero VRF. Zero chance anywhere.** | Design and legal both. |

---

## 1. Tightened design

**Format.** 8 players, free-for-all, one 48m × 32m top-down arena, **4:00 match** = 7,200 ticks @ 30Hz. Twin-stick move + aim, hitscan-free projectiles.

**Energy (0–100, u16 fixed-point ×100).** It is your health bar, your dash meter, and your wallet. There is no separate HP.

| Flow | Value |
|---|---|
| Regen | +10/s, suppressed for 1.0s after taking damage |
| Kill reward | +15 (capped at 100) |
| Respawn floor | `min(50, energy_at_death + 20)` |
| Dash | −15, 1.2s cooldown |
| Base weapon hit | −8 (5 shots/s, projectile 26 m/s → **2.5s TTK**) |
| Shotgun hit | −7 × 5 pellets, 1.5 shots/s, falloff past 9m |
| Bid | −20 / −45 / −80 on resolution, only if you win |

Long TTK is deliberate: damage is a **tax on your bidding power**, not a kill timer. Getting shot while standing in a crate radius is how you get outbid.

**Crate cycle (every 12s, first at 0:12 → 20 crates/match).**

```
T+0.0  crate lands, kind already shown on HUD since T−2.0 (deterministic, see §3)
T+0.0 → T+3.0   COMMIT WINDOW. Anyone inside the 5m radius may press 1/2/3 once.
                Client sends commit_bid(sha256(level‖salt‖pubkey‖match_id‖crate_idx)).
                Everyone sees WHO has committed. Nobody sees WHAT.
T+3.0 → T+3.5   REVEAL WINDOW. Client auto-sends reveal_bid(level, salt), 3× redundant.
T+3.5           RESOLUTION. All bids become permanently public.
T+3.5 → T+12.0  8.5s of clean combat.
```

**Bid validity rules (the tension):**
- You may only press a level you can afford **at press time**.
- If your energy drops below your committed level before resolution, **your bid voids** and you pay nothing and get nothing. This is why shooting people standing in the crate is now a primary tactic.
- If you commit and fail to reveal, you forfeit **80 energy or all of it, whichever is less**, and get nothing. Non-reveal is strictly dominated. Salt is deterministic (§3) so a page reload does not lose it.
- Leaving the 5m radius before T+3.0 voids your commit for free.

**Pickups.** 12s duration. Shotgun (above) / Shield (−50% incoming) / Speed (+35% move, dash cost 8). Split crates give `floor(12/N)` seconds, min 3s.

**Progression curve.** No power progression — competitive integrity is non-negotiable. Cosmetic + ladder only.
- XP = 100/match + 25/crate won + 10/kill. Typical match ≈ 250 XP.
- Account level N requires `500 + 120·N` XP; level 50 = 178,000 XP ≈ **712 matches ≈ 60 hours**.
- Season pass: 40 tiers × 1,200 XP = 48,000 XP over 60 days = **192 matches = 3.2 matches/day**. That number *is* the retention target; every content decision is measured against it.

---

## 2. On-chain architecture

### 2.1 The one decision that drives everything

**Delegate the lobby, not the match.** A `LobbyState` account is delegated to the ER once and stays delegated for hours, rolling match after match inside the ER. This:
- amortises MagicBlock's 0.0003 SOL/session fee across ~10 matches (§4 — this is the difference between a viable and an unviable unit economy);
- eliminates the critique's delegation-latency blocker entirely — **one account is delegated, not 21**, and it happens once per lobby, not once per queue pop;
- means zero L1 round-trips inside the player-visible flow.

Per-player in-match state lives **inside** `LobbyState`, not in separate accounts. `PlayerProfile` accounts stay on L1, undelegated, and are touched only at settle.

### 2.2 Accounts

All PDAs owned by program `BLNDS…` (single program, Anchor 1.1.2 / `@anchor-lang/core`).

```
GameConfig            seeds: ["config"]                              L1, read-only during play
  disc 8 | authority 32 | matchmaker 32 | season_id u16 2
  bid_lattice [u8;3] 3 | tick_hz u8 1 | match_ticks u16 2
  crate_interval_ticks u16 2 | commit_ticks u8 1 | reveal_ticks u8 1
  paused bool 1 | _pad 3                                             = 88 bytes
  rent 0.00150 SOL

PlayerProfile         seeds: ["player", wallet]                      L1, per-player
  disc 8 | owner 32 | created_slot 8 | matches u32 4 | wins u32 4
  kills u32 4 | crates_won u32 4 | energy_spent u64 8 | xp u64 8
  elo_x100 i32 4 | season_id u16 2 | flags u8 1 | _pad 1
  session_key 32 | session_expiry i64 8 | reserved 32                = 160 bytes
  rent 0.00200 SOL  ($0.16, refundable on close)

LobbyState            seeds: ["lobby", region u8, lobby_id u32 le]   L1-created → ER-DELEGATED
  disc 8 | lobby_id u32 4 | region u8 1 | status u8 1
  seed_commit [u8;32] 32 | seed [u8;32] 32 | lock_slot u64 8
  match_index u32 4 | tick u32 4 | crate_index u8 1 | _pad 3
  crate { pos_x i16, pos_y i16, land_tick u32, close_tick u32,
          kind u8, radius_cm u16, _pad u8 }                    16
  bids [8] × { commitment [u8;32], level u8, revealed bool,
               commit_tick u32, flags u8, _pad u8 }         40   = 320
  players [8] × { wallet 32, pos_x i16, pos_y i16, vel_x i16,
                  vel_y i16, aim u16, energy u16, last_dash_tick u32,
                  last_hit_tick u32, last_input_tick u32,
                  pickup_kind u8, pickup_expiry u32, kills u16,
                  deaths u16, crates_won u8, respawn_tick u32,
                  xp_delta u32, flags u8, _pad u8 }          80   = 640
  projectiles [48] × { x i16, y i16, vx i16, vy i16,
                       owner u8, kind u8, expiry_tick u32 }   16   = 768
  event_ring [128] × 8                                              = 1024
  reserved                                                          = ~1200
                                                        allocated  = 4,096 bytes
  rent 0.02940 SOL ($2.35, refundable, held only while lobby is alive)
```

**Deliberately absent:** any per-match permanent record account, any global counter, any leaderboard account. A `MatchResult` PDA at 416 bytes costs $0.30 of unrecoverable rent; at 750 matches/day that is **$82,000/year of permanent on-chain storage for data nobody reads on-chain.** Match history is an `emit!` event captured by the indexer. This is a hard rule in the code-review checklist.

Positions are **i16 centimetres** — 48m arena = 4,800cm, fits with 6× headroom. All sim math is fixed-point i32; **no floats anywhere in the sim crate**, enforced by a `#![deny(float_arithmetic)]` lint.

### 2.3 Instructions

**L1 (Solana mainnet)**

| ix | signer | args | CU (est) |
|---|---|---|---|
| `init_config` | authority | config fields | 8k |
| `create_profile` | player wallet (fee-payer: Kora) | — | 12k |
| `set_session_key` | player wallet | `session: Pubkey, expiry: i64` | 9k |
| `open_lobby` | matchmaker | `region: u8, lobby_id: u32, seed_commit: [u8;32]` | 16k |
| `lock_seed` | matchmaker | `server_nonce: [u8;32]` (+ SlotHashes sysvar) | 6k |
| `delegate_lobby` | matchmaker | — (CPI → delegation program) | 30k |
| `settle_batch` | matchmaker | `match_index: u32` — reads committed LobbyState, writes 8 PlayerProfiles, `emit!(MatchSettled)` | 55k |
| `close_lobby` | matchmaker | — undelegate + close, rent → rent vault | 20k |
| `void_lobby` | **anyone**, after `now > last_commit_slot + 200` | — force-undelegate escape hatch | 22k |
| `purchase` | wallet or session key | `sku: u16` — USDC → treasury shard | 25k |
| `mint_achievement` | authority | Bubblegum V2 soulbound, batched off-path, **post-MVP** | 45k |

**ER (executed while `LobbyState` is delegated)**

| ix | signer | args | CU (est) |
|---|---|---|---|
| `join_lobby` | session key | `slot_hint: u8` | 6k |
| `submit_input` | session key | `tick: u32, mv: (i8,i8), aim: u16, buttons: u8` — also advances sim to `tick` if not yet advanced (first writer of a tick pays) | 4k + advance |
| `advance` (crank, 5Hz backstop) | crank authority | `max_ticks: u8 ≤ 4` | 4 × 45k = 180k |
| `commit_bid` | session key | `crate_index: u8, commitment: [u8;32]` | 4k |
| `reveal_bid` | session key | `crate_index: u8, level: u8, salt: [u8;32]` | 5k |
| `resolve_crate` | crank or any session key | `crate_index: u8` | 12k |
| `rollover_match` | crank | — settles in-ER, resets tick, keeps delegation | 18k |

`advance` for one tick: 8 players integrate + 48 projectiles + uniform-grid broadphase (8m cells, 6×4 grid) + collision + energy = **~45,000 CU**, well inside the 200k/ix cap. `advance` at 30Hz = **1.35M CU/s per lobby**. Per-lobby ER throughput is fine; **per-node concurrent-lobby capacity is the unknown** — see §9 week 0.

Client input rate is **20Hz**, sim runs at 30Hz, missing ticks repeat the last input. 8 players × 20 = **160 ER tx/s per lobby**. Supersize.gg publishes ~33 tx/s/player sustained, so this is within demonstrated envelope.

### 2.4 Parallel execution / contention

| Account | Written by | Contention |
|---|---|---|
| `LobbyState` | Only inside the ER during play. On L1: `open`, `delegate`, `commit` (1×/match), `undelegate`, `close`. | **Consumes zero L1 block budget while live.** One commit per 4-minute match ≈ 20k CU against a 12M CU/writable-account/block ceiling. Non-issue by construction. |
| `PlayerProfile` | `settle_batch`, once per player per match | Distinct account per player. 8 profiles in one tx = 8 distinct write locks. Two concurrent lobbies never share a writable account. |
| `GameConfig` | Never during gameplay. Upgrades require `paused = true`. | Read-only → no lock. |
| Treasury | `purchase` only | **Sharded into 8 PDAs** `["treasury", buyer.key[0] & 7]`, swept to a cold vault daily. Prevents a single write lock during a launch-day sale spike. |
| Global counters | **Do not exist.** | A `total_matches` counter PDA is a global write lock and is banned. Aggregates are derived by the indexer from `MatchSettled` events. |

`match_id` is never allocated from a counter: it is `(lobby_id, match_index)`, both local to `LobbyState`.

Local fee markets mean a game built entirely on per-lobby and per-player PDAs sees **near-zero priority fees** — we are never competing with anyone else's writes.

### 2.5 State placement

| Where | What |
|---|---|
| **L1** | Identity (`PlayerProfile`), config, lifetime stats, USDC treasury, cosmetics (Core / Bubblegum V2, post-MVP) |
| **ER** | The entire game loop: positions, energy, projectiles, bid commitments, crate state, in-match scoring |
| **Off-chain** | Matchmaking queue, ELO calculation, bots, telemetry, match history, leaderboards, replay, anti-collusion detection, client-side prediction |

---

## 3. Randomness & fairness

**There is no randomness in outcomes. This is a structural property, not a policy.**

**Crate schedule & spawns.**
```
seed = sha256(server_nonce ‖ SlotHashes[lock_slot])
crate_k.kind  = CRATE_KINDS[ sha256(seed ‖ "kind" ‖ k)[0] % 3 ]
crate_k.pos   = arena_ring_point( sha256(seed ‖ "pos" ‖ k) )   // never within 6m of a spawn
spawn_i       = symmetric_8_ring( rotate_by( sha256(seed ‖ "spawn")[0] % 8 ) )
```
`server_nonce` is committed as `seed_commit = sha256(server_nonce)` in `open_lobby`, **before the roster is known**. `lock_seed` reveals the nonce and mixes in a SlotHash we do not control. Both are emitted in `MatchSettled`, so any player can recompute the entire 20-crate schedule of any match they ever played and verify it.

*Attack: we grind `server_nonce` to favour a player.* Blocked — the commit predates the roster, and the SlotHash contribution is not ours.
*Attack: a validator grinds the SlotHash.* Blocked in effect — crate kinds and positions affect all 8 players **symmetrically**, and each crate's kind is displayed 2 seconds before it lands. There is no per-player edge to steer toward, so grinding buys nothing.

**No VRF is used anywhere.** MagicBlock's in-ER VRF is free and <50ms and we still do not use it, because a chance-free product is worth more than spawn variety (§8). If a loot box is ever built, it goes to Switchboard On-Demand with **collateral taken at commit, not reveal** — but it is not in this product.

**The auction.** Fairness rests on commit–reveal, not on trusting us or MagicBlock:

- `salt = sha256(ed25519_sign(session_key, "blindside-salt-v1" ‖ lobby ‖ match_index ‖ crate_index))` — deterministic, so a page reload recovers it; unguessable, because it requires the session key.
- Commitment is `sha256(level ‖ salt ‖ pubkey ‖ match_id ‖ crate_index)`. 32-byte salt → not brute-forceable despite only 3 possible levels.
- **Reveals are rejected before the commit window closes.** Otherwise an early reveal leaks to a late committer.
- Reveal *order* is irrelevant: a commitment binds you, so watching others reveal buys you nothing.
- Non-reveal costs 80 energy (or all of it) and yields nothing → strictly dominated.

*Residual risk, stated plainly:* the ER sequencer is trusted for liveness and censorship-resistance. It cannot change a committed value, but it could censor a reveal to force the penalty. Mitigations: reveals are sent 3× over a 0.5s window (ER txs are free); `void_lobby` is callable by anyone after ~70s of no commits, undelegates, and voids the match with no ladder change. **This escape hatch is acceptable only because no player funds are ever inside a match** — which is exactly why §8's posture is load-bearing on the architecture, not just the legal filing.

---

## 4. Cost model

**Per player action: 0 lamports.** Every gameplay action (`submit_input`, `commit_bid`, `reveal_bid`) is an ER transaction. MagicBlock public nodes charge **0 SOL base fee per ER tx**. All player cost is per-session and per-commit.

**Per lobby (assume 10 matches per delegation, ~45 min of play):**

| Item | SOL | Note |
|---|---|---|
| `open_lobby` + `lock_seed` + `delegate_lobby` (3 sigs) | 0.000015 | 5,000 lamports/sig |
| ER session fee | 0.000300 | charged once at undelegation |
| `close_lobby` (1 sig) | 0.000005 | |
| Priority fees | ~0.000005 | per-lobby PDAs → near-zero local fee market; budgeted 10× observed |
| **Per-lobby fixed** | **0.000325** | |
| Per match: 1 ER commit | 0.000100 | |
| Per match: `settle_batch` (1 sig) | 0.000005 | 8 profile writes, ~55k CU, 11 accounts, 352 bytes — no ALT needed |
| **Per match** | **0.000105** | |

**Per match all-in:** `0.000105 + 0.000325/10` = **0.0001375 SOL = $0.011** → **$0.00138 per player-match.**

If you delegate per-match instead of per-lobby, this is **0.000430 SOL = $0.034/match**, a **3.1× cost increase**. That single architectural choice is the difference between a positive and negative unit economy (§6).

**One-time per registered player:** `create_profile` rent 0.00200 SOL = **$0.16**, refundable on close but not refunded in practice. Profiles are created lazily — **only when a player queues their first real (non-bot) match**, so tutorial-only visitors cost $0.00.

**Rent float (not cost):** 200 concurrent lobbies × 0.0294 SOL = 5.88 SOL ≈ **$470** held, fully recovered on close.

**Per 1,000 DAU/day** (assume 6 matches/DAU/day = 750 matches/day at 8p, 15% new users):

| Line | $/day |
|---|---|
| Chain (750 × $0.011) | 8.25 |
| New profiles (150 × $0.16) | 24.00 |
| Helius RPC — $49 tier is sufficient at this scale (webhooks + occasional `getAccountInfo`) | 1.63 |
| ER RPC (MagicBlock public node) | 0.00 |
| Kora relayer VM | 1.33 |
| Matchmaker + bot fleet (2 × c7g.xlarge) | 8.33 |
| **Total** | **$43.54/day = $0.0436/DAU/day** |

Steady state (new-user share falls to 4%): **$0.026/DAU/day = $0.79/DAU/month**, of which **$0.25 is chain**.

**At 10,000 DAU:** chain $82.50/day, Helius $999 tier + LaserStream/gRPC add-on $500 = $50/day, servers $25/day, profiles $64/day → **$222/day = $0.022/DAU/day = $0.67/DAU/month**.

**Fee relaying.** Kora (Solana Foundation, shipped April 2026) sponsors every L1 signature; players never hold SOL and never see a fee. Kora costs us only the sponsored lamports (already counted) plus the VM. Pin and verify the audited tag you deploy — `main` is the integration branch.

**Anti-pattern we are avoiding, quantified:** requesting a 1.4M CU limit on a 55k CU tx would multiply our priority fee 25×, because priority fee scales with the CU limit *requested*, not consumed. Every instruction ships with a measured `ComputeBudget` limit set from Mollusk CI benchmarks + 20%.

---

## 5. Client stack

**Engine.** TypeScript + **PixiJS v8** (WebGL2), Vite. Not Unity: the Solana.Unity-SDK's NuGet core has not been republished since 2024-02-26 and we would be maintaining a fork; more importantly a Unity WebGL build cannot hit the <60s cold-start funnel.

**The single most important engineering decision:** the sim is **one Rust crate, `blindside-sim`** — `no_std`, fixed-point i32, zero floats, zero allocation. It is compiled twice:
1. into the Anchor program (authoritative, runs in the ER),
2. to **wasm** via `wasm-bindgen` for client-side prediction.

Determinism is not hoped for, it is tested: a golden input log replayed through native, LiteSVM, and wasm must produce byte-identical state hashes, asserted in CI. Rollback netcode keeps 30 ticks (1.0s) of history and reconciles against ER account state on every read.

**Network.** `@solana/kit` **7.1.1** — not `@solana/web3.js` v1 (legacy), not `gill` (9 months stale), not `@solana/wallet-adapter-react` (14 months stale; external wallets go through Wallet Standard via `@solana/kit-plugin-wallet`). TS client generated from the IDL by **Codama 0.13.1**. Magic Router handles ER-vs-L1 tx routing by delegation state.

**Wallet.** Privy embedded wallet (email/Google → wallet in ~2s, no popup, no extension, no seed phrase). One Privy signature issues an **ed25519 session key** held in browser memory + IndexedDB, scoped to our program, 6h expiry, revocable from settings. Every ER transaction is signed locally with zero prompts. External wallets (Phantom/Backpack/Solflare) are supported via Wallet Standard for players who want them, but are never on the default path.

**The 60-second funnel — the chain is not allowed to appear in it.**

```
0:00  Link opens. Pixi canvas + wasm sim loading (target bundle ≤ 2.5 MB gzip).
0:03  "PLAY" — one button. No wallet, no account, no download, no chain.
0:05  Tutorial match vs 7 bots, running 100% LOCAL in the wasm sim. No RPC call has been made.
0:20  Movement + dash taught by doing. First crate lands. HUD shows kind + three buttons + 3s clock.
0:35  Player presses 80 at 94 energy, wins the shotgun, has 14 energy, is dash-rushed and dies
      holding the best weapon in the match. This four-second beat is the entire product.
0:50  Second bot match. Player presses 20, loses the crate, then kills the guy who spent 80.
1:05  "Queue against real people?" → Privy email OTP or Google (~2s) → Kora pays create_profile
      → one signature issues the session key → queue.
1:15  Queue pops in ≤ 8s (bot backfill guaranteed). Live match.
```

Chain contact happens at **1:05, not 0:00**. Everything before that is a normal free web game.

**Mobile.** Responsive web: virtual left stick, right-thumb aim, three bid buttons stacked under the right thumb. **The discrete lattice is what makes touch possible at all** — a slider was never shippable on mobile. Solana Mobile dApp Store listing (0% platform fee, 1,561 apps, uncontested channel) is a post-MVP two-day task, not an MVP item.

---

## 6. Economy

**No token. Ever.** The record is unambiguous: 95% average drawdown across the cohort, 93% of web3 game projects dead. There is nothing in this design a token does.

**Faucets (money in) — USDC only:**
| SKU | Price | Notes |
|---|---|---|
| Seasonal pass | $6.99 / 60 days | 40 tiers, cosmetic only |
| Skin packs | $2.99 – $9.99 | Metaplex Core (~0.0029 SOL/mint = $0.23) |
| Community lobby | $19/mo | Persistent named lobby, custom rules, private leaderboard — sold to Discords and creators |
| Hosted tournament | $49/event | Bracket, spectator page, no prize pool from us |

**Sinks:** all purchases are terminal transfers to treasury. Achievements are **soulbound Bubblegum V2** (~$500 per million assets vs $15–30k for regular accounts) — deliberately non-transferable so competitive performance never mints a tradeable asset.

**Rake: zero. Wagering: none. Cashout: none.** Money enters and does not leave. That is the whole economy.

### The arithmetic, honestly

At 10,000 DAU, 4% monthly pass conversion:

```
Revenue    400 × $6.99                          =  $2,796
         + skins at ~40% of pass revenue        =  $1,118
         + 150 community lobbies × $19          =  $2,850
         + 20 tournaments × $49                 =  $  980
                                          total =  $7,744 / month

Variable   10,000 × $0.67                       =  $6,700 / month   ← per-lobby delegation
Fixed      RPC $999 + gRPC $500 + servers $750
           + Kora $40 + misc $400               =  $2,689 / month
                                          total =  $9,389 / month

                                       MARGIN   =  −$1,645 / month
```

**At 10,000 DAU this loses money.** Break-even is **≈ 13,500 DAU**. The same game on a Web2 authoritative server has variable cost near $0.02/DAU/month and breaks even at ~4,000 DAU.

**The chain multiplies our break-even DAU by roughly 3.4×.** That is the honest central number of this business and it should be on the wall. It is survivable only because (a) per-lobby delegation already cut the chain line by 3.1× versus the naive design, and (b) the B2B lines (lobbies, tournaments) convert at ~100× the rate of a $6.99 pass on the same audience and carry near-zero marginal chain cost.

**Why it cannot death-spiral.** There is no emission, no yield, no holder base, no floor to defend, no "earn" to inflate. The failure mode of a token game — new-buyer inflow stops, so payouts stop, so players leave, so inflow stops — has no analogue here. The only spiral surface is the Core-skin secondary market. Controls: skins confer zero gameplay advantage; no "limited to N" scarcity marketing; we never buy back, never quote a floor, never operate a marketplace.

**Month 6.** Pass conversion decays 4% → ~2.5% without new content. The content cadence that holds it is **1 pass + 6 skins per 60 days = 1 artist FTE**. That, not the blockchain, is the actual constraint on the business, and it should be staffed before launch, not after.

---

## 7. Anti-bot / anti-cheat

**Day one, a bot does this:** headless Node client, runs the same wasm sim, reads ER state (public), aim-locks with perfect leading, dodges projectiles frame-perfectly, and computes bid EV from every opponent's exact energy.

**The correct frame: there is nothing to cheat *at*.** All state is on-chain and authoritative. Wallhacks are meaningless because the map is public by design. Speed hacks are impossible because the program integrates movement. Damage hacks are impossible because the program applies it. The only threat is **superhuman play**, so we defend against *advantage*, not against automation.

1. **On-chain input-rate cap.** `submit_input` rejects `tick - last_input_tick < 1` (hard 30/s) and clamps per-tick aim delta to 30°/tick (900°/s), which is roughly the fastest human flick. Enforced in the program, so it binds every client including ours.
2. **Aim assist parity.** Every human gets modest snap-assist. The bot's aiming edge collapses to noise rather than being a category difference.
3. **The auction is un-optimisable — and this is free.** Three discrete levels, simultaneously and cryptographically hidden for 3.5 seconds. A bot's information advantage over a human is *zero* in the only decision that decides the match. The change that made the mechanic inputtable is the same change that made it bot-resistant.
4. **Nothing is farmable.** No token, no cashable reward, no per-match payout, no drop with resale value (achievements are soulbound). A bot farm earns ELO and a soulbound icon. The absence of an earn mechanic *is* the anti-cheat, and it is worth more than any detection system we could build.
5. **Ranked identity.** Ranked ladder above Bronze requires one **Solana Attestation Service** attestation (Civic). Unranked stays fully permissionless — one human, one ranked identity; anyone can play. Post-MVP.
6. **Collusion.** Two friends soft-teaming is the only real exploit. Every match's full bid and damage record is public in `MatchSettled`, so detection is a batch job off the event stream: directed-damage graphs plus bid correlation. Penalty is a ranked queue ban. Cheap precisely because everything is public.
7. **Bots are first-class and desirable.** Server-run bots backfill every queue to 8. They are **always labelled with a bot icon in the HUD and on the scoreboard** — non-negotiable. Three difficulty tiers, matched to lobby MMR, swapped out for humans at match rollover inside the lobby (no mid-match joins).

---

## 8. Legal posture

*(Not legal advice. Get counsel before launch.)*

The base product deliberately fails the sweepstakes triad on two of three legs: there is **no chance** (crate kinds and positions are deterministic from a pre-committed seed, verifiable by any player post-match, and zero VRF is used anywhere in the game) and **no prize** (nothing won in a match is transferable, cashable, or convertible — achievements are soulbound Bubblegum V2 by construction, not by policy). Consideration exists, because people buy passes; that is ordinary consumer commerce, which brings consumer-protection, refund, disclosure, tax, and age-gating (COPPA/UK Children's Code) obligations and nothing more. On securities: there is no token, no revenue share, no staking, no expectation of profit from our efforts, and no promise of appreciation; Metaplex Core skins are transferable and will develop a secondary market, so the single structural rule is that **we never make a market** — no buybacks, no floor support, no scarcity marketing, and no path whatsoever from competitive performance to a tradeable asset, because that path re-imports the entire prize analysis we spent the design avoiding. Under MiCA, non-redeemable cosmetics sit outside EMT/ART. No geofencing is required in the base product, which is the actual point of having no rake. If entry-fee tournaments are ever built, they are a separate product with a separate entity and separate counsel — the chance-free property is necessary but nowhere near sufficient, as the Pennsylvania Supreme Court's 2026-06-15 skill-games ruling and the 2026 state cease-and-desist wave make clear, and "skill-predominant" is not a defence in every state. The structural choice that minimises everything: **money enters as a purchase and never leaves.**

---

## 9. MVP cut line — 4 weeks

### Week 0 (2 days, runs in parallel with hiring/setup) — **GO/NO-GO**
- Five blocking questions to MagicBlock, in writing: (1) sustained tx/s per delegated account on a public node; (2) concurrent delegated-account capacity per node; (3) exact behaviour of a delegated account when the ER validator dies mid-session and the recovery path; (4) whether Magic Actions can write *undelegated* L1 accounts while a session is live; (5) dedicated-node pricing at 200 concurrent lobbies.
- **Load test before writing any game code:** 8 headless clients × 20 tx/s against one delegated 4KB devnet account for 4 minutes. Measure p50/p99 submit→state-visible.
- **Kill gate: if p99 > 150ms, or if a single node cannot hold 20 concurrent lobbies, stop.** The design has no fallback that preserves 30Hz.

### Week 1 — the sim
`blindside-sim` crate: `no_std`, fixed-point i32, `deny(float_arithmetic)`. Movement, dash, projectiles, energy, damage, death, respawn, uniform-grid broadphase. Property test: identical input log → identical state hash across native / LiteSVM / wasm. Anchor 1.1.2 program skeleton, Surfpool localnet, LiteSVM test template. **Mollusk CU benchmark in CI with a hard 60,000 CU budget for a single `advance` tick — the build fails on regression.**

### Week 2 — the ER (this is the week the project lives or dies)
`LobbyState`, `open_lobby` / `lock_seed` / `delegate_lobby` / `close_lobby` / `void_lobby`. `submit_input` + `advance` crank. Pixi client with wasm prediction and rollback. **Deliverable: two humans moving and shooting each other on devnet ER at 30Hz with p99 < 150ms.** If it does not feel like a normal shooter, escalate immediately.

### Week 3 — the auction
`commit_bid` / `reveal_bid` / `resolve_crate` with the deterministic salt derivation. Deterministic seed and 20-crate schedule with client-side verification. HUD: three bid buttons, energy bar, per-player committed-but-hidden indicator, resolution banner, tie/detonate feedback. Three pickups. Bots: behaviour tree, three tiers, server-run headless clients using the real session-key path.

### Week 4 — the funnel
Privy, Kora, session keys, matchmaking queue with bot backfill, `rollover_match`, `settle_batch`, tutorial script (the 0:35 beat is scripted and tuned by hand). Telemetry (PostHog + a `MatchSettled` indexer off Helius webhooks). Deploy to mainnet ER. **50-person closed playtest.**

### Explicitly NOT in the MVP
Private ERs / TEE / any hidden-information guarantee beyond the 3.5s commit window · VRF of any kind · any token · cosmetics, skins, Core mints, purchases, treasury, USDC · Bubblegum achievements · ranked ELO · seasons and the pass · pacts and betrayal · dead-player spectator view and clipping · mobile touch controls · dApp Store listing · Solana Attestation Service gating · community lobbies and tournaments · anti-collusion detection · Unity or native clients · 20-player mode · a second arena · parties, friends, chat · replay export · localisation · a persistent lobby browser.

The MVP ships **one arena, 8 players, 3 crate types, 4-minute matches, bots, and the bid button.** Nothing else.

---

## 10. Kill criteria

| # | Gate | Measure | Kill threshold |
|---|---|---|---|
| 1 | **Week 0, ER envelope** | p99 submit→visible, 8 clients × 20Hz, 4 min | > 150ms, or < 20 concurrent lobbies/node → **stop, or move the sim off-chain and keep the chain for identity/assets only** |
| 2 | **Week 1, CU** | Mollusk `advance` single tick | > 100,000 CU → the 30Hz loop is unaffordable, redesign or stop |
| 3 | **Week 5, the core feeling** | Of players who lose a fight within 4s of winning a crate at level 3 (bid 80), the % who queue again within 60s. n ≥ 50 playtesters, ≥ 400 such events | ≥ 60% = the design works. **< 45% = overbidding-then-dying is annoying, not exhilarating, and the entire concept is wrong. Kill.** This is the primary gate and it costs nothing to run. |
| 4 | **Week 5, auction non-degeneracy** | Distribution of bid levels across ≥ 10,000 crates | Any single level > 70% of all bids → there is a dominant strategy and the auction is decoration. Redesign the lattice or kill. |
| 5 | **Launch +30d, retention** | D1 / D7 on ≥ 500 new users | D1 < 25% or D7 < 8% → kill |
| 6 | **Launch +30d, queue viability** | Median queue time at regional peak, **bot backfill disabled** | > 25s → 8-player is unviable; drop to 4-player, or kill |
| 7 | **Launch +30d, honesty check** | % of live matches containing ≥ 4 bots | > 40% sustained → the game is a single-player game with extra steps. Kill or relaunch as PvE. |
| 8 | **Month 3, business** | Paying conversion of MAU; ARPDAU | Conversion < 1.5%, or ARPDAU < $0.022 (= steady-state variable cost) → the unit economy is negative and does not improve with scale. **Kill, or strip the chain and relaunch Web2.** |
| 9 | **Any week, sequencer** | Share of matches ending in `void_lobby` | > 2% in any 7-day window → the ER dependency is not shippable. Move the loop to an authoritative server; keep L1 for identity and cosmetics. |

Gates 1 and 3 are the real ones. Gate 1 is answerable in two days for the cost of one engineer, before a line of game code exists. Gate 3 is answerable in week five for the cost of fifty playtesters. **Both must be run before anyone writes the cosmetics pipeline.**


# SPEC: Ghostline

# Ghostline — Build Spec v1.0
**Tech lead:** — · **Date:** 2026-08-20 · **Target start:** Monday 2026-08-24 · **SOL reference price: $80** (recompute all $ figures at deploy)

---

## 0. What changed from the bake-off concept

Three things in the winning pitch are load-bearing and wrong. This spec keeps the game and replaces the money layer, the CU architecture, and the trust story.

| Killed | Replaced with | Why |
|---|---|---|
| 1v1 "beat my 41.203" cash challenge | Fixed-entry **daily banded pool**, top 50% paid | Adverse selection makes posting a challenge −EV for everyone but the WR holder. 1v1Me shut this exact product on 2024-11-01 with that post-mortem. Free (unstaked) challenge links stay — they're the viral loop, not the revenue. |
| "L1 re-simulates the lap in a single 1.4M CU tx" | ER-witnessed sim + **segmented L1 re-sim (15 ix / 3 tx) as a dispute path only** | 200k CU/instruction was ignored; realistic tick is ~1,800 CU, not 400. Full lap = ~2.4M CU. Happy path never re-sims. |
| "60Hz authoritative sim on the ER" | **30Hz deterministic local sim; the ER is a notary, not a game loop**, ingesting 1-second input frames | Removes all latency dependence on a ~10ms slot time MagicBlock explicitly refuses to guarantee, and gives a real reason the ER exists: it timestamps input arrival. |
| "no anti-cheat needed, the chain decides" | **Two divisions.** Bots welcome and *funded* in the Open division; Human division is gated and we publicly own being the referee for humanness only | A bit-exact sim shipped to every client is TAS-able, full stop. There is no on-chain fix. Pretending otherwise is the fatal error. |

The chain proves **"this input log produces 44.812s on this geometry under physics v7."** It does not and cannot prove a human produced the log. Every claim in this spec respects that line.

---

## 1. Tightened design

**The game (unchanged, and it is the good part).** Top-down drift racer. One car. Three inputs: steer, throttle+brake, handbrake. 40–50s lap, 45s reference. A rival ghost drives beside you; a split bar reads ±0.001s against them and updates at every checkpoint. Retry is instant and free. Sessions are 20–60 laps.

**Simulation.** 30 Hz fixed timestep (33.333ms), 1,350 ticks per 45s lap. Client renders 60fps by interpolating between sim states. Input is a 1-byte packed frame per tick: `steer:4 (signed −8..7)`, `throttle:2`, `brake:1`, `handbrake:1`. Steering slew, tire slip and grip curves live *inside* the sim, so the input stream is small and RLE-compressible (typical lap: **420–900 bytes** encoded as `(byte, run_len:u8)` pairs; hard cap 1,536 bytes, over-cap logs are rejected at commit).

**The money product: daily banded pools.**

| Parameter | Value |
|---|---|
| Pool shape | 1 track × 1 skill band × 1 day |
| Opens | 00:00 UTC (geometry revealed at open, never before) |
| Closes | 20:00 UTC · Settles 20:30 UTC |
| Entry | **0.05 SOL** or **2.00 USDC** (fixed; one free AMOE entry per attested account per day) |
| Attempts per entry | Unlimited within the window; best time counts |
| Rake | **8%** of pot. Creator share = **1% of the pot, paid out of our 8%** (we net 7%) |
| Paid places | **Top 50%** of the band |
| Bot division | "Ghost Lab": free entry, **fixed 1.0 SOL/day sponsored purse**, top 10 paid. Purse does not scale with entrants → sybil-proof by construction |

**Bands** (gap to that track's all-time human WR, recomputed daily from trailing-7-day personal best):

| Band | Gap to WR | Expected share of field |
|---|---|---|
| Bronze | > 12% | 40% |
| Silver | 8–12% | 27% |
| Gold | 4–8% | 20% |
| Diamond | 1.5–4% | 10% |
| Ace | < 1.5% | 3% |

Banding is the second half of the adverse-selection fix: a shark cannot buy into a beginner pool, and a fast player entering a slow band is auto-promoted the moment their time lands (see §7.6).

**Payout table**, 100-entrant band, 0.05 SOL entry, pot after rake = **4.60 SOL**:

| Rank | Each (SOL) | × entry | Subtotal |
|---|---|---|---|
| 1 | 0.400 | 8.0× | 0.400 |
| 2 | 0.280 | 5.6× | 0.280 |
| 3 | 0.220 | 4.4× | 0.220 |
| 4–10 (7) | 0.140 | 2.8× | 0.980 |
| 11–25 (15) | 0.086 | 1.7× | 1.290 |
| 26–50 (25) | 0.057 | 1.14× | 1.430 |
| 51–100 | 0 | — | 0 |
| | | | **4.600** |

Median *paying* finisher (rank ~25) recovers 1.7×; rank 50 recovers 1.14×. Deliberately flat. The point is that a competent player who shows up loses money slowly (§6), not that anyone hits a jackpot. Scaled to any N by the same six-tier proportions; pools under 20 entrants merge upward into the adjacent band at close.

**Per-account payout cap in the Human division: 20× entry per day (1.0 SOL).** Caps the value of defeating the humanness gate.

**Progression.** No XP, no levels, no token. Your progression *is* your gap-to-WR and your band. The only unlockable is cosmetic (liveries, horns; Metaplex Core, ~0.0029 SOL/asset, sold for $3–5 USDC, no resale value promised).

**Tracks.** 3 at MVP, +1/week from a community submission queue. Each track's geometry is committed by hash 90 days in advance and revealed only at pool open (§3).

---

## 2. On-chain architecture

### 2.1 Programs

| Program | Framework | Role |
|---|---|---|
| `ghostline_core` | Anchor **1.1.2** (`@anchor-lang/core`, *not* `@coral-xyz/anchor`) | Config, schedule, tracks, pools, entries, delegation, settlement, claims, disputes. Cold/warm path. |
| `ghostline_sim` | **Pinocchio 0.11.2** | Pure deterministic physics. Exposes `verify_segment` (CPI'd by core during disputes) and nothing else. Zero state. |

`ghostline_sim` is the **same Rust crate** as the wasm client build (§5). Version identity is enforced on-chain by `physics_hash`.

### 2.2 Accounts

Byte counts are data length; rent = `(len + 128) × 6,960` lamports.

**`Config`** — seeds `["config"]`
```
disc                8    admin               32   treasury            32
sas_schema          32   physics_program     32   physics_hash        32
er_validator_id     32   physics_version      2   rake_bps            2
creator_bps         2    dispute_bond         8   dispute_window_slots 4
er_timeout_slots    4    payout_cap_mult      2   paused              1
denylist_root      32    bump                1
```
**252 B → 0.00264 SOL**

**`Schedule`** — seeds `["schedule", epoch_90d: u16]` — 90 × 32-byte commitments
```
disc 8 · epoch 2 · start_day u32 4 · commits [[u8;32]; 90] 2880 · bump 1
```
**2,895 B → 0.02103 SOL** (one per 90 days)

**`Track`** — seeds `["track", track_id: u32]`
```
disc 8 · track_id 4 · author 32 · geometry_hash 32 · geometry_acct 32
checkpoint_count 1 · reveal_slot 8 · wr_time_ms 4 · wr_holder 32
status 1 · bump 1
```
**155 B → 0.00197 SOL**

**`TrackGeometry`** — seeds `["geo", track_id]` — variable, ≤ 9,216 B (polyline segments + surface class + checkpoint planes, all Q16.16). Written once at reveal via 8 realloc+append txs (10,240 B/ix realloc cap). **8 KB → 0.05793 SOL ≈ $4.63**, one-time per track, closable.

**`Pool`** — seeds `["pool", track_id: u32, day_index: u32, band: u8]`
```
disc 8 · track 32 · day_index 4 · band 1 · division 1
entry_amount 8 · entry_mint 32 · open_slot 8 · close_slot 8 · settle_slot 8
physics_version 2 · geometry_hash 32 · shard_count u16 2
entrants u32 4 · pot u64 8 · rake_taken u64 8
merkle_root 32 · state u8 1 · bump 1
```
**200 B → 0.00228 SOL**. `entrants`/`pot` are **written only at close** (aggregated from shards), never during entry.

**`PoolShard`** — seeds `["shard", pool, idx: u16]` · `idx = u16::from_le_bytes(player[0..2]) % shard_count`
```
disc 8 · pool 32 · idx 2 · entrants u32 4 · pot u64 8 · swept bool 1 · bump 1
```
**56 B → 0.00128 SOL**. Each shard owns a vault: native SOL held in the shard PDA itself, or an SPL ATA owned by the shard PDA for USDC. **This is the contention fix — see §2.5.**

**`Entry`** — seeds `["entry", pool, player]`
```
disc 8 · pool 32 · player 32 · shard 2 · paid_amount 8
best_time_ms u32 4 · best_run_hash 32 · run_count u16 2
physics_version 2 · attestation 32 · client_attest 32
entropy_score u16 2 · flags u8 1 · claimed bool 1 · bump 1
```
**192 B → 0.00223 SOL ≈ $0.178**, refunded to the player on `close_entry`.

**`RunState`** — seeds `["run", entry]` — the only account written at tick rate, and only inside the ER
```
disc 8 · entry 32 · tick u32 4 · pos_x/pos_y i32 8 · vel_x/vel_y i32 8
heading i32 4 · ang_vel i32 4 · slip_f/slip_r i32 8 · rpm i32 4
checkpoint_mask u32 4 · lap_start_tick u32 4 · input_hash 32
frame_seq u32 4 · bump 1
```
**129 B → 0.00179 SOL**, closed at session end.

**`SimCursor`** — seeds `["cursor", dispute]` — dispute-only, mirrors `RunState` + `tick_target`, **137 B**.

**`Dispute`** — seeds `["dispute", entry]`
```
disc 8 · entry 32 · challenger 32 · bond u64 8 · log_acct 32
claimed_time u32 4 · opened_slot 8 · state u8 1 · bump 1
```
**125 B**. **`RunLog`** — seeds `["log", entry]` — ≤1,536 B, created and rent-funded by the challenger out of the bond (**0.01158 SOL**).

### 2.3 Instructions

| Ix | Signers | Args | Writes | ~CU |
|---|---|---|---|---|
| `init_config` | admin | Config fields | Config | 10k |
| `commit_schedule` | admin | `epoch`, `[u8;32] × 90` | Schedule | 22k |
| `reveal_track` | admin | `day_index`, `track_id`, `salt[32]`, geometry chunk | Track, TrackGeometry | 45k/chunk |
| `open_pool` | admin (crank) | `track_id`, `day_index`, `band`, `entry_amount`, `shard_count` | Pool | 14k |
| **`enter_pool`** | **player** (fee payer = Kora) | `band`, `attestation`, `client_attest` | Entry(init), RunState(init), PoolShard, shard vault | **38k** |
| `delegate_run` | player *or* session key | — | Entry, RunState → delegation program | 28k |
| **`er_frame`** *(ER only)* | session key | `frame_seq u32`, `inputs [u8;30]` | RunState | **56k** |
| **`er_finish_lap`** *(ER only)* | session key | `final_state`, `checkpoint_mask` | RunState, Entry | **24k** |
| `commit_run` *(ER→L1)* | session key | — | Entry (L1) | 15k L1 |
| `undelegate_run` | player or crank | — | Entry, RunState | 30k |
| `force_undelegate` | anyone, after `er_timeout_slots` | — | Entry, RunState | 32k |
| `close_pool` | crank | — | Pool, all PoolShards (16 txs) | 18k + 9k/shard |
| `sweep_shard` | crank | `idx` | PoolShard vault → settlement vault | 12k |
| `post_root` | admin | `merkle_root`, `ranking_uri` | Pool | 9k |
| **`claim`** | player | `rank u32`, `amount u64`, `proof [[u8;32]; ≤15]` | Entry, shard vault → player | **17k** |
| `close_entry` | player | — | Entry, RunState (rent → player) | 8k |
| `open_dispute` | anyone | `claimed_time`, bond, log chunks | Dispute, RunLog | 20k × 2 tx |
| `resim_segment` | anyone | `start_tick`, `n_ticks ≤ 96` | SimCursor (CPI → `ghostline_sim`) | **181k** |
| `resolve_dispute` | anyone | — | Entry, Dispute, bond distribution | 25k |

### 2.4 Where state lives

| State | L1 | Ephemeral rollup | Off-chain |
|---|---|---|---|
| Config, Schedule, Track | ✅ authoritative | read-only clone | — |
| TrackGeometry | ✅ (needed for dispute re-sim) | read-only clone | CDN mirror (content-addressed) |
| Pool, PoolShard, **all vaults / the pot** | ✅ **never delegated** | ❌ | — |
| Entry | ✅ home; delegated during a session | ✅ writable during session | indexed mirror |
| RunState | ✅ home (must pre-exist — ER gotcha #1) | ✅ written every frame | — |
| Input logs (full) | only on dispute | committed hash only | **primary storage**: our archive + player's client + public S3 mirror, content-addressed by `best_run_hash` |
| Ghost replays, leaderboards, entropy scores | ❌ | ❌ | Postgres + CDN, all verifiable against on-chain hashes |

**Safety invariant: money never enters the ER.** Only lap times do. If the ER validator dies mid-session, `force_undelegate` recovers `Entry` after `er_timeout_slots` (7,200 slots ≈ 42 min at 350ms) and the pool settles on the last committed best time. Uncommitted laps are void; this is in the posted rules and is why we commit at least every 10 minutes. **ER failure costs you a lap, never your stake.** MagicBlock's fraud-proof / DA / validator-failure model remains undocumented (landscape §14) — this architecture is designed so that we do not need the answer before shipping. Ask them anyway before mainnet.

### 2.5 Parallel execution / contention

The per-writable-account budget is **12M CU per block, unchanged by SIMD-0286** and unaffected by the 100M block limit. This is the constraint that kills naive designs.

| Account class | Writers | Contention |
|---|---|---|
| `Entry`, `RunState` | exactly one player | **zero** — the entire gameplay path touches only per-player PDAs, in the ER, at 0 SOL base fee |
| `PoolShard` + its vault | ~1/16 of a band's field, once each at entry, once at claim | **warm.** 38k CU/entry → 12M/38k = **315 entries per shard per block**; 16 shards → **5,040 entries per 350ms block = 14,400/s** |
| `Pool` | 3 writes/day (open, close, post_root) | **cold** |
| Settlement vault | 16 sweeps/day, serialized, off the hot path | cold |
| `Config`, `Schedule`, `Track` | admin only | cold |

Peak real demand at 25k DAU: ~3,000 entries clustered in the 10 minutes after pool open = **5/s**. Headroom ≈ 2,800×. `shard_count` is a per-pool field, launched at 16, raisable to 256 without a program upgrade.

Because fee markets are **local to writable accounts**, and our writable set is per-player PDAs plus 16 shards, Ghostline pays near-floor priority fees regardless of what the rest of Solana is doing. Any design with a single global leaderboard account would have inherited its own congestion and capped at ~315 actions/block network-wide.

### 2.6 Physics-version skew (the silent fund-loss bug)

Programs are **cloned, not delegated**, into the ER; upgrades do not propagate atomically. Mitigations, all mandatory:

1. `Config.physics_hash` = blake3 of the deployed `ghostline_sim` sBPF binary. `Config.physics_version: u16`.
2. `open_pool` stamps `physics_version` into `Pool`. `enter_pool` stamps it into `Entry`. `resim_segment` **rejects** any `Entry` whose `physics_version` ≠ the currently deployed one — a stale entry is refunded, never adjudicated under different physics.
3. Physics upgrades are permitted **only** in the 20:30–00:00 UTC maintenance window between pool settle and next pool open. Enforced by an admin-side guard and a CI deploy gate.
4. At each pool open a canary run executes a golden input log in the ER and on L1 and asserts identical output hashes. Mismatch → pool opens `paused`, alert fires.

---

## 3. Randomness & fairness

**There is no VRF, no `SlotHashes`, and no chance element anywhere in Ghostline.** That is a legal design decision (§8) and a fairness one. The randomness question here is not "who wins the roll" — it is **"who chose today's track, and when did they know its geometry?"**

**Attack.** The operator (us) picks tomorrow's track to favour a whale or an insider, or leaks the geometry so someone gets 30 days of offline optimization on a track everyone else sees for the first time at 00:00 UTC.

**Scheme — hash-chain schedule commitment, 90 days ahead.**

```
For day i:  H_i = blake3( track_id_i ‖ geometry_bytes_i ‖ salt_i )   , salt_i ← 32 random bytes
Schedule account holds [H_0 .. H_89], written once, immutable, 90 days before H_0's pool.
At 00:00 UTC on day i:  reveal_track(i, track_id_i, salt_i, geometry_bytes_i)
                        assert blake3(...) == Schedule.commits[i]
```

Why this resists the attack:
- **We cannot substitute a track** after seeing who registered — the hash is fixed 90 days out and the reveal is checked on-chain.
- **We cannot leak geometry usefully without leaking it publicly** — the commitment reveals nothing (geometry is high-entropy and salted), so an insider tip is a plain-text file we can be caught distributing, not an inference from on-chain data.
- **No leader manipulability**, because no slot hash, block hash, or timestamp feeds any outcome. The SlotHashes sysvar attack surface does not exist here.
- **Determinism preserved end to end**: same inputs + same geometry + same physics version = same time, on wasm, on sBPF, forever.

**Residual risk, stated plainly:** *we* know the geometry in advance. Therefore team and contractor wallets are permanently barred from the Human division, enforced on-chain by `Config.denylist_root` (a merkle root of banned pubkeys checked in `enter_pool`), and the roster is published. There is no cryptographic fix for "the operator knows the map"; there is only exclusion and disclosure.

**Ties** are broken by earliest `commit_run` slot, then by lexicographic pubkey — fully deterministic, no oracle.

**Dispute adjudication (the only place the chain re-runs physics).** Within `dispute_window_slots` (250,000 ≈ 24.3h at 350ms) anyone may bond **0.25 SOL**, upload the input log (2 txs; they obtain it from the public archive, verified against `Entry.best_run_hash`), and force a full L1 re-simulation:

- 1,350 ticks ÷ 96 ticks/instruction = **15 instructions**
- 96 × 1,800 CU + 8k overhead = **181k CU/ix** (under the 200k per-instruction cap)
- 15 × 181k = **2.72M CU** → **3 transactions** (7 ix + 7 ix + 1 ix), state carried in `SimCursor`
- Total fee at 20k µlamports/CU: 15,000 base + ~54,400 priority ≈ **0.00007 SOL ≈ $0.006**

If the re-sim time ≠ `Entry.best_time_ms`, the entry is voided, its payout redistributed, and the bond is returned plus a 0.05 SOL bounty from the rake. Otherwise the bond is forfeited to the pot. Payouts above 0.25 SOL are held for the full dispute window before `claim` unlocks.

---

## 4. Cost model

**Per-transaction CU and lamports** (priority at 20,000 µlamports/CU, a conservative 2026 normal-conditions figure for uncontended local fee markets):

| Action | CU limit requested | Base | Priority | Total lamports |
|---|---|---|---|---|
| `enter_pool` | 45,000 | 5,000 | 900 | **5,900** |
| `delegate_run` | 35,000 | 5,000 | 700 | **5,700** |
| ER `er_frame` × 45/lap | 60,000 | 0 | 0 | **0** |
| `commit_run` × 4/session | — | — | — | **400,000** (0.0001 SOL/commit) |
| `undelegate_run` + ER session fee | 35,000 | 5,000 | 700 | **305,700** (0.0003 SOL session) |
| `claim` (50% of entrants) | 25,000 | 5,000 | 500 | **5,500** |
| `close_entry` | 12,000 | 5,000 | 240 | **5,240** (returns 0.00402 SOL rent) |

**Per paying player, per day:** 5,900 + 5,700 + 400,000 + 305,700 + (0.5 × 5,500) + 5,240 = **725,290 lamports = 0.000725 SOL ≈ $0.058**

**Free players cost effectively nothing.** Practice is 100% client-local — no ER session, no chain, no wallet. The ER is engaged only after `enter_pool`. This is a deliberate change from the pitch and it is what makes a large free funnel affordable.

**Per 1,000 DAU per day** (35% paid conversion = 350 paying):

| Line | Cost/day |
|---|---|
| On-chain + ER (350 × $0.058) | **$20.30** |
| Kora fee sponsorship (included above; we pay all base+priority) | — |
| Kora relayer node (1 × 2vCPU VM, $40/mo) | $1.33 |
| Helius RPC + DAS ($49/mo dev tier; ~4k L1 tx/day, no LaserStream yet) | $1.63 |
| Postgres + API + ghost archive (Fly.io/Neon, $80/mo) | $2.67 |
| CDN (900 KB wasm brotli→320 KB + 8 KB geometry + ghosts ≈ 400 GB/mo, R2) | $0.50 |
| **Total** | **$26.43/day** |

**Revenue at 1,000 DAU:** 350 × 0.05 SOL = 17.5 SOL handle/day; rake 8% = 1.4 SOL, minus 1% creator share (0.175 SOL) = **1.225 SOL/day net = $98/day**.
**Contribution margin: $71.57/day ≈ $2,147/mo at 1k DAU.**

**At 25,000 DAU** (30% conversion, avg entry 0.06 SOL): handle 450 SOL/day = $36,000/day; net rake 7% = **31.5 SOL/day = $2,520/day = $75,600/mo**. Costs: on-chain 7,500 × 0.000725 = 5.44 SOL/day = $435/day; infra tier up to Helius $499/mo + LaserStream $500/mo + $300/mo hosting = ~$44/day. **Total cost ~$479/day = $14,370/mo. Net $61,000/mo before headcount.**

**Cost sensitivity, honestly:** 96% of our on-chain cost is two MagicBlock line items — the **0.0003 SOL session fee** and **0.0001 SOL per commit**. Commits are the tunable knob; 4/session is chosen so that an ER failure costs at most 10 minutes of laps. If MagicBlock changes public-node pricing, our unit economics move ~1:1. Get a dedicated-node quote before mainnet.

---

## 5. Client stack

**Rendering: TypeScript + WebGL2, custom renderer (~30 KB).** No Unity — the Solana.Unity-SDK's C# core has not been republished to NuGet since 2024-02-26 and maintenance intensity is unverified; we are not budgeting for a fork of a stack we don't need. The entire scene is a track polygon, a car sprite, N ghost sprites, and a UI overlay. PixiJS v8 is a fallback if the custom renderer costs more than 3 days.

**Physics: one Rust crate, `ghostline-sim`, `#![no_std]`, compiled twice.**
- Q16.16 fixed point on `i32`, `i64` intermediates for multiplies. **Zero floating point anywhere.**
- `sin`/`cos` from a 1,024-entry Q16.16 LUT with linear interpolation. `sqrt` by integer Newton–Raphson, 4 iterations, fixed count.
- Targets: `wasm32-unknown-unknown` (client) and sBPF via Pinocchio (`ghostline_sim`).
- **Bit-identity is enforced, not hoped for:**
  1. CI differential fuzz — 100,000 random input logs run through `wasmtime` and through Mollusk, assert byte-equal state hashes each tick. Any divergence fails the build.
  2. Post-build wasm opcode scan rejects any `f32.*` / `f64.*` opcode in the shipped module.
  3. Mollusk 0.15.0 CU benchmark gate: per-tick CU > 2,000 fails CI. CU regression is cost regression and dispute-path regression simultaneously.

**Chain client:** `@solana/kit` **7.1.1** + **Codama 0.13.1**-generated TS clients from the Anchor IDL / Program Metadata. Wallet Standard discovery via `@solana/kit-plugin-wallet` for power users bringing Phantom/Backpack. Not `@solana/web3.js` v1, not `gill`, not `@solana/wallet-adapter-*`.

**Wallet:** **Openfort** embedded wallets (Google / Apple / email; ships gasless on Solana natively), **Turnkey** as the evaluated fallback. **Explicitly not Privy** — Stripe-owned since June 2025, and Stripe's prohibited-business list covers skill-based wagering absent written approval; we would be building the funnel on a vendor who will terminate us at the exact moment money starts moving. Assume every wallet/on-ramp vendor runs the same diligence: **plan for crypto-only funding, no card on-ramp.**

**Fees:** self-hosted **Kora** relayer (Solana Foundation, shipped April 2026), pinned to a specific audited tag — not `main`. Sponsors 100% of base + priority fees. Phase 2 adds USDC fee payment.

**Session keys:** MagicBlock session keys, 60-minute scope, restricted to `er_frame` / `er_finish_lap` on the caller's own `Entry` and `RunState`. **Magic Router** handles ER-vs-L1 routing by delegation state.

**Link → playing, budgeted to 12 seconds (spec is <60s):**

| t | Event |
|---|---|
| 0.0s | Tap `ghostline.gg/c/7f2a`. Static page, no auth, no install. |
| 0.4s | HTML + JS shell (120 KB brotli) parsed; loading screen shows the rival's ghost line drawing itself. |
| 2.8s | `ghostline-sim.wasm` (900 KB → 320 KB brotli) instantiated; track geometry 8 KB; rival ghost 620 B. |
| 3.2s | First frame. **Driving. No wallet, no chain, no account, no cost to us.** |
| ~60s | Lap 1 done, they lose by half a screen. Laps 2–4, instant free retries. |
| ~150s | Prompt: "Put it on the board?" Google login → Openfort wallet in ~6s → one signature issues a 60-min session key. Kora sponsors; balance is 0 SOL and nobody notices. |
| ~180s | First scored lap: 45 `er_frame` txs at 1/s stream to the ER during the lap. Player perceives nothing different, which is the point. |
| Later | Funding (0.05 SOL / 2 USDC) is deliberately deferred past minute 5, or skipped entirely via the free AMOE entry. |

---

## 6. Economy

**There is no token. There will never be a token.** Everything is priced in SOL or USDC. Nothing is emitted. This removes the failure mode that killed Axie, STEPN, Star Atlas and the rest of the graveyard: a pot funded by emissions is a pot funded by future buyers, and it dies when they stop arriving.

**Faucets (value in):**
1. Pool entries — 0.05 SOL / 2 USDC per player per day.
2. Cosmetic purchases — $3–5 USDC, Metaplex Core (~0.0029 SOL/asset).
3. Our own sponsored purses — 1.0 SOL/day into Ghost Lab (a cost, not revenue).

**Sinks (value out):** pool payouts (92% of pot), the 8% rake, cosmetic mints (pure burn — Core assets are transferable but we promise no resale value and run no marketplace).

**The critical property: every pool settles to exactly zero.** `pot_out + rake = pot_in`, same day, enforced by the settlement merkle root summing to the shard-vault balance. There is no accumulating liability, no treasury that must appreciate, no yield anyone is owed. **A death spiral requires an obligation that outlives the day; there isn't one.**

**Player-side arithmetic.** A daily entrant faces expected loss = rake = 8% of 0.05 SOL = **0.004 SOL/day = $0.32/day = $9.60/month**, with a bounded worst case of $4/day. Top-50% payouts mean roughly half of all sessions end positive-or-flat, which is the retention-critical number. Compare: mobile racing ARPPU is $8–20/mo, and those players get nothing back. Our monetization is *cheaper than free-to-play* for the median payer.

**The 1% creator share is a subsidy, not a sink — and it is farmable.** Wash-trading it (self-entering your own track across sybil wallets) is profitable the moment your creator share exceeds the spread. Fixes, all shipped before creator payouts turn on:
- Creator share comes out of **our 8%**, never the pot, and is capped at **2 SOL/track/day**.
- Creator share is **zero on any pool with fewer than 40 distinct SAS-attested entrants**.
- Creators are barred from entering their own tracks' Human-division pools (`Config.denylist_root`).
- Payouts vest 7 days, revocable on a confirmed wash finding.

**Month 6, concretely.** Target 25,000 DAU / 30% conversion → **$75,600/mo net rake + ~$2,000/mo cosmetics**. Costs $14,400/mo infra + 4 people ≈ $60,000/mo → **~$3,000/mo net.** That is *marginal*, and it is the honest number: at 8% rake on a $4 entry, you need volume that only pump.fun has actually sustained on Solana. The realistic month-6 case is 5,000 DAU → $15,000/mo net rake against $4,000/mo infra — funds the servers, not the team. **The business case rests entirely on the free game retaining well enough to grow the funnel, which is why §10's kill criteria are weighted toward retention and not toward revenue.**

**What we do NOT do:** no rake on head-to-head anything, no deposit bonuses, no loss-rebates, no VIP tiers, no loyalty currency, no "house" position of any kind. We never take the other side of a player's entry.

---

## 7. Anti-bot / anti-cheat

**Day one, what a bot does — and it will work.** Download the wasm, extract the deterministic sim (it is a `no_std` Rust module with a 5-bit input and a scalar objective), run CMA-ES or MCTS against it overnight, produce a tick-perfect 1,350-byte input log that beats every human on the track by 1–3 seconds, replay it through the client at 1× real time. The chain will verify the log produces the time, because it does. **There is no on-chain defence. Anyone who tells you otherwise has not thought about it.** Trackmania — 100 Hz deterministic physics with built-in replay validation — still had to ship a client-side Competition Patch recording anti-injection metadata, and TMInterface/TMX exist anyway.

Our response is structural, in descending order of honesty:

**7.1 Ghost Lab makes the attacker a content supplier.** The Open division has free entry, welcomes bots explicitly, and pays a **fixed 1.0 SOL/day sponsored purse** to the top 10. Because the purse does not scale with entrants, sybil has no return. Optimizer players get a leaderboard, a WR ghost that ships in the client, and public credit. This converts the single strongest attacker on the board from a predator into a free content pipeline: the TAS line becomes the aspirational ghost humans chase.

**7.2 One human, one paid ladder account.** Human-division entry requires a Solana Attestation Service attestation from Civic (schema pinned in `Config.sas_schema`), checked in `enter_pool`. Cost to sybil = one real government ID per account. Note the landscape caveat: SAS schema standards are inconsistent and low-quality attestations are manipulable — this raises the cost, it does not close the door.

**7.3 Input provenance.** Each 1-second input frame is signed by the session key from inside the client's attested context, and `Entry.client_attest` stores the digest. This is client-side and therefore extractable; its value is that it forces an attacker to drive inputs through our client rather than a headless harness. That is an engineering tax, not a wall. We say so.

**7.4 Same-day reveal + real-time replay caps iteration.** Geometry is unknown until 00:00 UTC; the pool closes at 20:00. The ER ingests inputs at 1 Hz against advancing ER slots, so **an attempt costs one real lap of wall-clock time** — you cannot submit 10,000 optimizer candidates, only replay your best. This does not stop a determined optimizer (offline search is free); it stops the naive one and compresses the search budget from unbounded to 20 hours.

**7.5 We are the referee for humanness, and we say it on the front page.** A server-side classifier scores each committed log on steering power spectrum, tick-alignment, reaction-time distribution and micro-correction jitter. Every entry's `entropy_score` and the model version are published on-chain in `Entry`. Payouts over 0.25 SOL hold 24h for review. Flagged entries get a public reason code and an appeal path. **The trustless claim is narrowed to exactly what is true: the chain proves the time, we adjudicate the human.** Any spec that claims otherwise is lying, and lying here is what makes the wager indefensible.

**7.6 Automatic promotion into the shark tank.** A time landing >4% better than the account's trailing-7-day gap-to-WR force-promotes it to **Ace** for the next 14 days. A bot that beats 7.2 and 7.5 is playing world-record humans within one day, for the same entry price, against the same pot — and its per-account payout is capped at **20× entry = 1.0 SOL/day ≈ $80**, which is below the cost of sourcing verified identities at scale.

**7.7 Dispute path** (§3) exists so that *anyone*, not just us, can void a fraudulent time by re-running it on L1 for $0.006. This catches client-side sim tampering (wrong physics version, forged state) — a different attack from TAS, and one the chain genuinely does solve.

**Net position:** bots are unstoppable and therefore invited, funded, and segregated. The paid ladder's integrity rests on identity + statistics + economic caps, all of which are off-chain, all of which are disclosed.

---

## 8. Legal posture

*This is an engineering document, not legal advice; nothing here substitutes for counsel.* Ghostline's paid product is a **fixed-entry, skill-only, paid-entry prize contest** — pari-mutuel in shape, with no chance element anywhere (deterministic physics, no VRF, no loot, no randomised outcomes) and no house position on any contest. That is the strongest available structural posture, and it is deliberately *not* the one the bake-off concept proposed: we killed peer-to-peer staking with a rake because a 5% spread on a two-party wager reads as bookmaking in several states, whereas a fixed contest entry reads closer to the Skillz tournament model. It does not clear the field. The Pennsylvania Supreme Court held on **2026-06-15** that skill games are gambling devices under state law; Tennessee rejects skill claims outright; Maryland, Louisiana and New York have issued cease-and-desists against unlicensed skill/sweepstakes operators; roughly a dozen states restrict cash skill gaming, and Louisiana/Oklahoma-style 2026 statutes reach suppliers and geolocation vendors, not just operators — and 2026 enforcement has been naming founders personally. Because the escrow program adjudicates the contest, the deployed program is plausibly the "device" and the deployer the operator, so we assume operator obligations rather than arguing platform neutrality. The mitigations we build rather than argue: **a free AMOE entry into every paid pool** (one per attested account per day, identical prize eligibility) which is the standard sweepstakes-state cure; **per-state geofencing at the entry instruction and at the client**, launch-blocked in PA, TN, AZ, AR, CT, DE, FL, LA, MT, SD and all non-US jurisdictions until opinioned; **age and identity verification via SAS/Civic** before any paid entry; responsible-play deposit and time limits; **crypto-only funding, no card on-ramp** (which we would lose anyway — see §5); and contest-registration/bonding review in NY, FL and RI once any pool's prize pool crosses statutory thresholds. Securities exposure is minimised by construction: **no token, ever**; cosmetics are non-yield-bearing Metaplex Core assets sold at a fixed price with no buyback, no revenue share, no secondary market operated by us, and no appreciation representation. Budget **$50k–$250k for a multi-state opinion before any real-money switch**, and treat that opinion as a precondition to revenue, not a later chore. **The money layer ships in month 4 at the earliest; months 1–3 are free-only, worldwide, with no wager surface at all** — which is also the only period in which we can cheaply learn whether the free game is good enough to justify the spend.

---

## 9. MVP cut line — 4 weeks

**Week 1 — the simulator.**
`ghostline-sim` crate: Q16.16 fixed-point 2D car model (longitudinal + lateral tire slip, handbrake state machine, heading integration via LUT trig), track polyline collision, checkpoint planes, RLE input codec. Two build targets (wasm32 + sBPF/Pinocchio). `wasmtime` harness. **Mollusk 0.15.0 CU bench (gate: ≤2,000 CU/tick).** **Differential fuzz wasm↔LiteSVM, 100k logs, byte-equal or CI red.** wasm float-opcode scanner. One track, no renderer. *Exit: `cargo test` green, CU report published, zero divergence.*

**Week 2 — the game. This is the gate.**
WebGL2 renderer, 30 Hz sim + 60 fps interpolation, car + track + ghost sprites, **the split bar** (gets the most polish time in the whole project), instant retry, session summary. Three hand-built tracks. Ghost record/playback from local storage. **Entirely local — no chain, no wallet, no account.** *Exit: five people outside the team each drive ≥25 laps in one sitting without being asked to. If that does not happen, stop the project here; every remaining week is worthless without it.*

**Week 3 — the chain.**
`ghostline_core` (Anchor 1.1.2): Config, Schedule, Track, TrackGeometry, Pool, PoolShard (16 shards + per-shard vaults), Entry, RunState. Instructions `init_config` → `commit_schedule` → `reveal_track` → `open_pool` → `enter_pool` → `close_pool` → `sweep_shard` → `post_root` → `claim` → `close_entry`. `ghostline_sim` `verify_segment` + `SimCursor` (primitive only, no dispute UI). LiteSVM unit tests, **Surfpool** local, Codama TS client, devnet deploy. *Exit: a 50-wallet scripted pool opens, fills, closes, settles and pays out on devnet.*

**Week 4 — integration.**
Openfort embedded wallet + Google login. Self-hosted Kora relayer (pinned tag) sponsoring all fees. MagicBlock delegation: `delegate_run` / `er_frame` / `er_finish_lap` / `commit_run` / `undelegate_run` / `force_undelegate`, session keys, Magic Router. Postgres mirror + ghost archive + leaderboard API. Entropy-check v0 (offline notebook against captured logs, **not enforcing**). Challenge-link share flow. One devnet pool running end-to-end, daily, on test USDC. *Exit: link → driving in <15s measured on a cold cable connection; 100 devnet entries settled correctly across 3 consecutive days.*

**Explicitly NOT in the MVP:**
real money · mainnet · any US player · geofencing · SAS/Civic gating · the Human/Open division split (one flat devnet division) · **skill bands** (single flat leaderboard) · dispute UI and bonding · creator payouts and the track submission queue · track editor · cosmetics / Metaplex Core / any NFT · mobile or Solana dApp Store build · DAS indexing (nothing compressed exists yet) · tournaments · Kora SPL-token fee payment (SOL sponsorship only) · LaserStream or any streaming tier · Private ERs · confidential transfers · security audit · legal opinion · any token, ever.

---

## 10. Kill criteria

Evaluated at **T+90 days** from public free launch, or immediately when a hard trigger fires. Any single failure kills the stated layer; two failures kill the project.

| # | Signal | Threshold | Action |
|---|---|---|---|
| 1 | **D7 retention, free game**, ≥5,000 first-session players | **< 12%** | **Kill the project.** The judges scored `funWithoutToken` at 8 — if that is wrong, nothing downstream matters. |
| 2 | **Median laps per first session** | **< 12** | Kill. The split-bar retry loop is the entire thesis; under 12 laps it is not hooking. |
| 3 | **Paid conversion of D7-retained players**, after 4 weeks of a live paid ladder | **< 15%** | Kill the money layer. Ship free + cosmetics, cut headcount to 2. |
| 4 | **Human-division entropy flag rate** on paid entries | **> 3%**, or **1 confirmed TAS payout** | Kill the Human division immediately. Refund the open pools. Run Ghost Lab only. |
| 5 | **Band churn** — players finishing outside the paid ranks 3 consecutive days who never enter again | **> 45%** | Adverse selection has reappeared in pool form. Flatten payouts to top 70% or kill the money layer. |
| 6 | **Net rake per DAU per month** at ≥5,000 DAU | **< $1.50** | Unit economics never clear the compliance bill. Kill the money layer before spending on the opinion. |
| 7 | **Legal** — any state AG contact, or opinion scope exceeding **$250k**, or **>8 US states** unservable | any | Kill the money layer permanently. Free game + cosmetics only, worldwide. |
| 8 | **wasm↔sBPF divergence** found in production after any physics deploy | **1 occurrence** | Halt all pools, void and refund every in-flight pool, no settlement until the differential fuzz corpus reproduces and covers it. Non-negotiable — a single divergence invalidates every result the program has ever adjudicated. |
| 9 | **MagicBlock ER**: unrecovered `force_undelegate` events | **> 0.5% of sessions** in any 7-day window | Move the notary function to L1 (1 commit per lap, ~0.0001 SOL) and re-price, or stop. |

**The one-line version:** ship the free game first, measure criteria 1 and 2 before spending a dollar on legal, and be willing to run Ghostline as a free racing game with cosmetics forever — because that is the outcome the evidence currently favours, and it is not a bad one.
