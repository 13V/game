# Solana Game-Dev Stack Inventory — as of 2026-08-20

## 0. Executive verdict (what actually constrains a game)

| Constraint | Real number | Consequence |
|---|---|---|
| L1 slot time | 400ms → **350ms at epoch 1020 (~2026-08-21)** | L1 is a settlement layer, not a game loop |
| Per-writable-account block budget | **12M CU/block** (unchanged by SIMD-0286) | A single global game-state account is your throughput ceiling, not the 100M block limit. **Shard state per-player/per-match or you will hit this.** |
| Tx size | **1,232 bytes** (4,096 pending, SIMD-0296, not activated) | Batch actions are size-bound, not CU-bound |
| Accounts per tx | 64 locks (ALT-resolved) | Hard cap on how many entities one instruction can touch |
| Real-time path | MagicBlock ER, **~10ms slots, 64KB txs** | The only production answer for <100ms loops |

**Design rule that follows from the numbers:** put the tick loop in an ephemeral rollup, shard L1 state per player, settle at match end.

---

## 1. Base L1 characteristics

### Slot time / consensus
- **Current mainnet slot: 400ms → 350ms.** SIMD-0525 activated at slot 440,208,000 (epoch 1019); parameter takes effect **epoch 1020, ~2026-08-21**. Four staged 50ms decrements to a 200ms target, each requiring supermajority stake opt-in. ([cryptoslate](https://cryptoslate.com/solana-is-slashing-per-block-compute-limits-so-its-new-350ms-speed-boost-doesnt-overload-the-network/), [cryptobriefing](https://cryptobriefing.com/solana-slot-time-reduction-350ms-testnet/))
- **Per-second compute held flat at ~250M CU/s.** Block CU scales *down* as slots shorten: 400ms=100M, **350ms=87.5M**, 300ms=75M (devnet), 250ms=62.5M (testnet), 200ms=50M. Do not assume shorter slots = more throughput.
- **Alpenglow: NOT shipped to mainnet.** Replaces TowerBFT+PoH with **Votor** (SIMD-0326) and later **Rotor**. Target **~150ms finality** vs today's ~400ms pre-confirmation / 12.8s TowerBFT finality. Prereqs already active: BLS Pubkey Mgmt SIMD-0387 (2026-07-08), Validator Admission Ticket SIMD-0357 (2026-07-22). Ships via **Agave 4.3**; solana.com says "Q3 2026", press reporting says October 2026. Agave 4.3 is at **4.3.0-beta.0 (2026-08-14)**, still marked not-for-production. Rotor is a *later* phase. ([solana.com/upgrades/alpenglow](https://solana.com/upgrades/alpenglow))
- **Game impact:** Alpenglow does not give you a 150ms game loop. It shortens *finality*, which matters for cash-out/settlement UX and cross-rollup bridging, not for input latency.

### Compute limits
- Default **200,000 CU per instruction**; explicit request required beyond that.
- **Max 1,400,000 CU per transaction** (hard ceiling).
- **Max 100M CU per block** — SIMD-0286 activated **epoch 1009, 2026-07-29** (60M → 100M, +66%). ([solanacompass](https://solanacompass.com/news/solana-raises-mainnet-block-compute-limit-66-to-100m-cus-with-simd-0286-at))
- **Max 12M CU per writable account per block — unchanged.** This is the real per-game limit.
- Max block account-data delta: 100MB.
- Heap 32KB default, up to 256KB via ComputeBudget. Stack frame 4KB. **CPI depth 4.** Max instruction trace 64.

### Account size & rent
- **Max account size 10 MiB (10,485,760 bytes).**
- **Realloc capped at 10,240 bytes per instruction** — growing a big leaderboard/world account takes many txs.
- **Rent collection is abolished; rent-exemption deposits are not.** ~6,960 lamports/byte including a 128-byte header. Concretely: 165-byte token account ≈ **0.00204 SOL**; a full 10 MiB account ≈ **~73 SOL**. Rent is recoverable on account close — treat it as a refundable deposit, and design session/match accounts to be closed.
- SIMD-0433 (accepted): program data accounts auto-extend on upgrade.

### Fees & fee markets
- **Base fee: 5,000 lamports per signature (0.000005 SOL)**, 50% burned. A 1-sig gameplay tx is ~$0.0004 at SOL ≈ $80.
- **Priority fee = ceil(CU_price_microlamports × CU_limit ÷ 1e6) lamports**, **100% to validator** (SIMD-0096). Critically: it scales with the CU limit you *request*, not what you consume — over-requesting CUs costs real money.
- **Fee markets are local to writable accounts.** You compete only with txs touching your accounts. A game with per-player PDAs sees near-zero priority fees; a game with one hot global account inherits its own congestion.
- Practical 2026 ranges: 10k–50k microlamports/CU normal, 100k–1M under congestion. ([Helius local fee markets](https://www.helius.dev/blog/solana-local-fee-markets))

### Transaction landing
- **Jito is effectively the network:** 95%+ of active stake runs Jito-Solana by mid-2026; Jito tips are 60%+ of all priority-fee volume. Bundles = up to **5 txs, atomic, same slot** — usable for multi-step game actions that must not partially apply.
- **SWQoS / staked connections** are the reliability lever, not fees alone. Helius **Sender** dual-routes via staked connections + Jito auction; default 6 TPS on all plans.
- Five compounding failure modes: stale blockhash, undersized CU budget, mispriced fee, late packet, blind retry loop. Budget engineering time for a landing layer — a naive `sendTransaction` loop will visibly drop player actions.
- ([RPC Fast: landing](https://rpcfast.com/blog/how-to-land-transactions-solana), [Helius zero-slot](https://www.helius.dev/blog/zero-slot))

### Pending L1 changes worth tracking
- **SIMD-0296 larger transactions: 1,232 → 4,096 bytes.** Status: **pending feature activation, targeted Agave v4.2, NOT live.** Delivered via new **v1 transaction format (SIMD-0385)**, leading byte `129`, which moves ComputeBudget config into the tx header and **does not support ALTs** (unneeded at 4KB). Legacy/v0 unaffected. ([solana.com/upgrades/larger-transaction-sizes](https://solana.com/upgrades/larger-transaction-sizes))
- Proposal to raise max accounts referenced per tx, riding on 100M CU blocks + 4KB txs. Not accepted/activated.

---

## 2. MagicBlock Ephemeral Rollups — the real-time layer

**Status: live on mainnet and devnet, production traffic, actively developed.** `ephemeral-rollups-sdk` **0.16.2 (crate 2026-07-22, npm 2026-07-23)** — shipping every few weeks.

### Model
Accounts are **delegated** (ownership temporarily transferred to a delegation program). A non-voting MagicBlock validator JIT-clones them into a temporary SVM runtime. Writes happen at ER speed; state is **committed** back to L1 periodically and on **undelegation**. Every L1 account is *readable* in the ER; only **delegated** accounts are writable, atomically, within the ER.

### Hard numbers ([runtime-limits](https://docs.magicblock.gg/pages/ephemeral-rollups-ers/introduction/runtime-limits.md))
| | ER | L1 |
|---|---|---|
| Slot time | **~10 ms** (not guaranteed — never hardcode) | 400/350 ms |
| CU per instruction | 200,000 | 200,000 |
| CU per tx | 1,400,000 | 1,400,000 |
| **Tx size** | **64 KB** | 1,232 B |
| Max account | 10 MiB | 10 MiB |

The **64 KB transaction size is the underrated feature** — full game-state commits, large move batches, and inline proofs fit without ALT gymnastics. Applies **only** when *all* writable accounts are delegated; anything routed to L1 reverts to 1,232 bytes.

### Pricing ([pricing](https://docs.magicblock.gg/pages/overview/additional-information/pricing.md))
Public nodes: **0 SOL base fee per ER tx**, **0.0003 SOL per ER session** (charged at undelegation), **0.0001 SOL per commit** to Solana. Dedicated nodes = custom enterprise pricing (MEV protection, predictable capacity). This is the cheapest real-time execution on Solana by a wide margin — gameplay is effectively free, you pay for settlement.

### Regions & products
Validators in **Asia, EU, US, and a TEE-backed region**, mainnet + devnet. Product surface (from official docs index):
- **Ephemeral Rollups (ERs)** and **Private ERs (PERs)** — TEE-backed, for hidden information (fog of war, sealed bids, hands of cards)
- **Ephemeral SPL Tokens** — SPL transfers at ER speed, plus stealth pools / private payments
- **Solana VRF** (see §5)
- **Magic Actions** — trigger base-layer execution *while accounts remain delegated*
- **Cranks** — time-based on-chain instruction automation (tick timers, decay, respawn, season rollover)
- **Session Keys** — scoped delegated signing
- **Magic Router** — routes each tx to ER or L1 automatically based on delegation state

### Real usage
- **Supersize.gg**: sends a tx every **~30ms**, lands every **~50ms**. Real-time PvP, fully on-chain.
- **Generals** (MagicBlock's own reference game, open source), **Colony** (Solana Mobile Seeker).
- Non-game: Flash Trade perps, dTelecom, Pyth Lazer feeds — the ER validator is battle-tested outside gaming too.
- ER validator was **open-sourced** (a16z-backed). Four "Solana Blitz" hackathons run in 2026 alone.

### Gotchas — read these before committing
1. **The delegated account must already exist on L1.** You cannot create state inside the ER from nothing.
2. **Programs are cloned, not delegated.** Program upgrades don't propagate instantly; version your logic.
3. **Composability breaks during delegation.** Other L1 programs can *read* your delegated account but cannot write it. Any DeFi/marketplace integration that mutates game state must wait for undelegation, or go through Magic Actions.
4. **Slot time is not a guarantee.** Docs explicitly warn against logic depending on 10ms.
5. **Trust model is not documented in the FAQ.** Fraud proofs, data availability, what happens when the ER validator goes down, and undelegation-under-failure are **not answered in public docs** — treat the ER as a *trusted, low-latency sequencer with L1 settlement*, and assume you need an escape hatch. **Ask MagicBlock directly before shipping player funds through it.** — **UNVERIFIED**
6. **BOLT (their ECS framework) looks abandoned:** crate `bolt-lang` last stable **0.2.4 (2025-07-23)**, with **0.2.5 and 0.2.6 yanked**, and BOLT does **not appear in the current MagicBlock docs product index**. Do not build on BOLT. Whether it is formally deprecated is **UNVERIFIED**.

---

## 3. Other SVM scaling paths

| Path | 2026 status | Verdict for a new game |
|---|---|---|
| **MagicBlock ER** | Live, mainnet, real traffic | **Default choice.** Same accounts, same programs, no bridge. |
| **Sonic SVM** | **Alive.** First "chain extension" on Solana, explicitly gaming/attention-economy positioned; testnet operational Apr 2026; acquired + open-sourced ForgeX_tools Mar 2026; SONIC token narrative described as "mixed" | Viable but you inherit a separate chain, separate liquidity, separate wallet story. Only if their BD/distribution is the point. |
| **Eclipse** | **Alive but bleeding.** SVM L2 on Ethereum, mainnet beta since Nov 2024; **TVL down ~95% from 2025 peak**; pivoting to an "application-centric" model | **Do not start here in 2026.** |
| **SOON** | SVM L2 stack ("Decoupled SVM"), deploy SVM rollups on any L1 | Niche; no game-specific advantage over ER. |
| **Termina network extensions** | Framework/blueprint vendor for Solana NEs (rollups, validiums, hybrids) | Enterprise/appchain path. Heavy. |

**Bottom line:** the SVM-alt-chain thesis lost to ephemeral rollups for games. Staying on Solana L1 + ER keeps you in one liquidity pool, one wallet ecosystem, one indexer.

---

## 4. Randomness / VRF

| Option | Cost | Latency | Security | Verdict |
|---|---|---|---|---|
| **MagicBlock VRF (in ER)** | **Free** | **<50 ms** | Oracle-based; inherits ER trust model | Best for in-match rolls (crits, loot ticks) |
| **MagicBlock VRF (L1)** | **0.0008 SOL** / **0.0005 SOL** | **<500 ms** / **1–2 s** | Oracle | Best price/latency on L1. Claimed ~4x cheaper than alternatives at 5 req/min |
| **Switchboard On-Demand** | ~0.002 SOL (**2022-era figure — UNVERIFIED for 2026**) | Commit→reveal, examples wait **~3s** / ≥1 slot | **Commit-reveal bound to a Solana slothash** + SGX enclaves (SRS v3, callback in same tx). Strongest public security story | Use for high-value draws / audited loot boxes. crate `switchboard-on-demand` **0.13.0 (2026-06-09)**, npm `@switchboard-xyz/on-demand` **3.10.6 (2026-07-30)** — actively maintained |
| **ORAO VRF** | **~0.001 SOL** base + request-account rent (**refunded on fulfillment** since v0.4.0) | **Sub-second**, priority-tx upgraded; Callback VRF live on mainnet | EdDSA multi-node byzantine quorum | Solid, cheap, simple. npm `@orao-network/solana-vrf` **0.8.0 (2026-01-26)** — slower cadence but alive. 20,000+ users |
| **SlotHashes sysvar** | Free | 0 | **Leader-manipulable, and predictable to anyone reading the same sysvar in the same slot** | **Never** for anything with value. Cosmetic only. |
| **Pyth Entropy** | — | — | — | **NOT AVAILABLE ON SOLANA.** Entropy is EVM-only. Do not plan around it. ([pyth.network/entropy](https://www.pyth.network/entropy)) |

**Critical implementation rule (from Switchboard's own docs):** *take collateral at commit time, not reveal time.* Otherwise players simply never reveal losing outcomes. This applies to every commit-reveal VRF.

---

## 5. Solana Actions & Blinks — **effectively dead as a distribution channel**

**No formal deprecation notice exists**, and solana.com still documents Actions/Blinks. But the package evidence is unambiguous:

| Package | Latest | Last published |
|---|---|---|
| `@solana/actions` | 1.6.6 | **2024-11-05** |
| `@solana/actions-spec` | 2.4.2 | **2024-10-24** |
| `@dialectlabs/blinks` | 0.22.5 | **2025-04-04** |

- **X never natively unfurled Blinks.** Rendering always required a Phantom/Backpack/Dialect browser extension plus registration in Dialect's registry (`dial.to/registry`, manual email review to hello@dialect.to). Mobile X = no Blinks, ever.
- Dialect's own CEO characterized Blinks as **pre-product-market-fit in end-user usage**; Blockworks reported a persistent discoverability failure.
- **What replaced it:** nothing 1:1. The live analogues in 2026 are **Solana Pay** (Seeker/Collector Crypt promos ran on it), the **Solana Mobile dApp Store** (1,561 apps, 0% platform fee), and **x402** (Linux Foundation x402 Foundation opened 2026-07-14; Solana Foundation a founding premier member; **35M+ txs, $10M+ volume on Solana**) for machine/agent payments.

**Recommendation: do not architect any acquisition or virality loop around Blinks.** Build a normal web client + dApp Store listing.

---

## 6. Wallet / UX

### Embedded wallets
- **Privy** — acquired by **Stripe (June 2025)**. Consumer-focused embedded wallets; Solana supported but a secondary chain behind EVM. Purpose-built fee-payer support for gasless. Best default for consumer games wanting card-on-ramp adjacency.
- **Turnkey** — TEE signing at the curve layer, full attestation, **sub-150ms signing**, per-signature pricing. **Explicitly no paymaster infrastructure** — you must pair it with a relayer.
- **Dynamic** — best when EVM is primary and Solana is secondary; multi-wallet aggregation + embedded fallback.
- **Openfort** — ships **gasless on Solana** natively.
- Reference point: pump.fun's one-tap UX = embedded wallet + gasless, no popups.

### Gasless / fee relayers
- **Kora** — Solana Foundation's official fee relayer / signing node, **shipped April 2026**. Sponsors fees, lets users **pay fees in any SPL token** (USDC, BONK, your game token), outsources signing to TEEs/KMS vaults. Repo `solana-foundation/kora`; main branch is the integration branch, **audit status tracked per commit/tag — verify the tag you deploy**. This is the single most important 2026 UX primitive for games: **players never need SOL**.
- ([solana.com/docs/tools/kora](https://solana.com/docs/tools/kora/getting-started), [QuickNode guide](https://www.quicknode.com/guides/solana-development/transactions/kora))

### Session keys / delegated signing
- **MagicBlock Session Keys** — full docs suite (program integration, React provider/context, `useSessionKeyManager`). This is the standard "sign once, play for an hour" pattern. `@magicblock-labs/gum-react-sdk` **3.0.10 (2025-11-26)** — maintained but slow cadence.
- Solana has **no native account abstraction**. Session keys, batching, and scoped delegation are all program-level PDA patterns you implement yourself or borrow.

### Mobile
- **Mobile Wallet Adapter is the recommended path** (not the Seed Vault SDK directly). `@solana-mobile/mobile-wallet-adapter-protocol` **2.3.0 (2026-08-17)** — actively released.
- **Seeker: shipped, 200K+ units** across 50+ countries; hardware **Seed Vault** + Seed Vault Wallet (built with Solflare), fingerprint + double-tap to sign.
- **SMS opened to all Android OEMs at MWC 2026** — Seed Vault, Seeker Wallet, dApp Store now licensable by any manufacturer. This is the bigger deal than the phone itself.
- **dApp Store: 1,561 apps** (from ~700 in March 2026), **0% platform fee**, $5B+ onchain volume, 500+ dApps in the Seeker ecosystem. A genuinely uncontested distribution channel vs. Apple/Google.

---

## 7. Assets

### Metaplex Core — **default for game NFTs**
- `mpl-core` npm **1.10.0 (2026-04-16)**. Single-account asset model. **~0.0029 SOL per asset vs ~0.022 SOL for Token Metadata (~80% cheaper)**.
- Plugin system (freeze, transfer delegate, attributes, royalties) is the right fit for equipment/skins/characters.

### Compressed NFTs (Bubblegum V2) — **still recommended, with caveats**
- `mpl-bubblegum` npm **5.1.0 (2026-08-17)**, crate **3.0.0 (2026-04-21)** — very actively maintained.
- **V2 adds: Freeze/Thaw, Soulbound, MPL-Core collections, royalty enforcement, permanent delegates, LeafSchemaV2.** Soulbound + freeze are directly useful for non-tradeable achievements and equipped-item locks.
- **V2 uses Core collections and is NOT compatible with V1 trees or Token Metadata collections.** Migration is not free.
- **Economics:** 1M assets in one Merkle tree ≈ **~$500** vs 1M Core/TM accounts ≈ **$15,000–30,000** in rent.
- **Hard dependency: you cannot read a cNFT without a DAS-API RPC.** No `getAccountInfo` path. This is a vendor dependency (Helius/Triton/QuickNode) baked into your client.
- **Rule of thumb 2026:** Core for anything a player equips/trades frequently; Bubblegum V2 for mass-issued items, seasonal drops, achievements, quest rewards.

### ZK Compression (Light Protocol) — **the cheaper option for raw state**
- Compressed accounts cost **~1000x less** than standard accounts; ATA creation **0.0000053 SOL vs ~0.002 SOL** (~400x). Mint accounts ~200x cheaper, token accounts ~100x. Works with SPL and Token-2022 mints; supported by Phantom and Backpack.
- Use when you need millions of *arbitrary* per-player records (inventories, quest flags, ladder positions), not just NFTs. Same indexer dependency caveat.

### Token-2022 / token extensions
`spl-token-2022` crate **11.0.0 (2026-05-08)**, `@solana-program/token-2022` **0.15.0 (2026-08-13)**. Game-relevant extensions:
- **Transfer Hook** — arbitrary program executes on every transfer. Enables soulbinding, level-gated trading, in-game tax. **Also the standard honeypot primitive** — expect marketplace/wallet friction and user suspicion.
- **Permanent Delegate** — irrevocable authority to move/burn any holder's tokens. Enables item confiscation, anti-cheat clawback, consumables burned server-side. **Also the engine behind 2026's largest automated rug-pull family.** Using it will get your token flagged by scam detectors. Use only with very loud disclosure.
- **Metadata / Metadata Pointer** — on-mint metadata, no extra account.
- **Transfer Fees** — automatic royalty/sink on every trade.
- **Confidential Transfers / Confidential Balances** — **live on mainnet** via the ZK ElGamal Proof program. But: requires **per-account ElGamal keypair setup**, and **cannot be combined with Transfer Hook** (hooks need to read the amount; confidential transfers encrypt it). Realistically **too heavy for consumer games** in 2026.
- **Wallet support is still uneven** — Backpack good, Phantom partial. Test every extension in every wallet you support.

---

## 8. Program dev tooling — **major discontinuity in 2026, do not use old tutorials**

### Anchor — **1.0 shipped April 2026; 2.0 in RC**
- crates: `anchor-lang` **1.1.2 stable (2026-06-26)**, **2.0.0-rc.1 (2026-08-12)**
- npm: **`@anchor-lang/core` 1.1.2** — **the package was renamed. `@coral-xyz/anchor` is frozen at 0.32.1 (2025-10-10) and is legacy.**
- Anchor 1.0 breaking changes: package rename; **CLI no longer shells out to the `solana` binary** (native `balance`/`airdrop`/`address`/`deploy`); **Surfpool replaces `solana-test-validator`** as the default backend for `anchor test`/`anchor localnet`; **LiteSVM is the default test template**; **duplicate mutable accounts now error by default** (opt in with the `dup` constraint); legacy IDL instructions replaced by **Program Metadata**; program AccountInfo removed from CPI context; `#[error_code]` once per program; new `Migration<'info, From, To>` account type for data-layout migrations; CLI lifecycle hooks.
- Anchor 1.0.0 targeted **Solana 3.x** (recommended CLI 3.1.10). `solana-program`/`solana-sdk` are now at **4.1.0 (2026-07-28)**. **Which Solana major Anchor 1.1/2.0 targets is UNVERIFIED — check before pinning.**
- ([anchor-lang.com 1.0.0 release notes](https://www.anchor-lang.com/docs/updates/release-notes/1-0-0))

### Low-level frameworks
- **Pinocchio 0.11.2 (2026-06-09)** — zero-dependency, no `solana-program`, unopinionated, minimal CU. Use for the hot path (per-tick state mutation) where every CU is money. 850K downloads.
- **Steel 4.0.9 (2026-06-16)** — macros/patterns over `solana-program`; middle ground between Anchor ergonomics and native control. 140K downloads.
- **Native Rust** — `solana-program` 4.1.0 / `solana-sdk` 4.1.0. Still viable, more boilerplate.
- Anza published tooling for **analyzing sBPF assembly** for optimization (Aug 2026).

### Testing — **`solana-test-validator` is over**
- **LiteSVM** — crate **0.15.2 (2026-07-31)**, npm **1.3.0 (2026-07-13)**. In-process SVM, milliseconds per test. **Now Anchor's default test template.** Adding Transactions V1 support.
- **Mollusk 0.15.0 (2026-08-10)**, plus `0.15.0-agave-4.3.0-beta.0` prereleases tracking Alpenglow. Instruction-level harness with CU benchmarking — **use this to measure CU regressions in CI**, which directly maps to per-player cost.
- **Surfpool v1.5.0** (from `txtx`, now under solana-foundation) — drop-in `solana-test-validator` replacement with **JIT mainnet account fetching**, time manipulation, balance/state overrides, custom Surfnet RPC methods, and Infrastructure-as-Code deployment. Now the **Anchor default**. crates.io `surfpool` 0.1.0 is a placeholder — install via the official channel, not cargo.
- **`solana-bankrun` npm 0.4.0 (2024-10-17) — dead.** Superseded by LiteSVM.

### IDL / codegen
- **Codama 0.13.1 (2026-08-19)** — successor to Kinobi, extremely active (four releases in three days). Generates Rust + `@solana/kit`-native TS clients from IDL. Kinobi is dead.

---

## 9. Client / game-engine integration

### Web/TS — **use `@solana/kit`**
| Package | Latest | Date | Verdict |
|---|---|---|---|
| **`@solana/kit`** | **7.1.1** (canary 8.0.0) | **2026-08-18** | **Official recommendation.** solana.com: *"@solana/kit is the recommended TypeScript SDK"*, *"New apps should use @solana/kit"*. Tree-shakeable, plugin-based. **New React hooks** (`useAirdrop`, `usePayer`, `useIdentity`, `usePlanTransaction`, `useSendTransaction`), decoupled signing/sending. |
| `@solana/web3.js` | 1.98.4 | 2025-07-31 | **Legacy.** Maintenance only. |
| `@solana/web3.js` (rc) | **3.0.0-rc.2** | 2026-06-19 | **Migration bridge only** — rebuilds the v1 class API on Kit internals. Use if you have a large v1 codebase; do not start here. |
| `gill` | 0.14.0 | **2025-11-07** | **~9 months stale.** Was the friendly Kit wrapper; not mentioned in current official docs. **Do not adopt for a new project.** |
| `@solana/wallet-adapter-react` | 0.15.39 | **2025-06-10** | **~14 months stale.** Replaced by **Wallet Standard discovery via `@solana/kit-plugin-wallet`**. Wallet Standard is at 1.1.6 and shipping. |

### Unity — **works, but the core is stale; verify before betting on it**
- **Solana.Unity-SDK by MagicBlock** — Unity Asset Store **Verified Solution**, full RPC coverage, wallet, NFT, Anchor client codegen, Orca/Jupiter DEX integration. GitHub shows 2026 activity (open issues April 2026); latest tagged release cited as v1.2.9.
- **Red flag:** the underlying NuGet packages have not been republished since **2024-02-26** (`Solana.Unity.Rpc` / `Solana.Unity.Wallet` **2.6.1.3**; `Solana.Unity.Anchor` 0.2.17), total ~34K downloads. Distribution is via UPM/git rather than NuGet, so this isn't conclusive, but the C# core is not moving at the pace of the TS stack. **Budget for maintaining a fork.** Whether the SDK is actively maintained versus in caretaker mode is **UNVERIFIED** — GitHub API access was blocked from this environment.

### Godot
- Community-maintained by **ZenRepublic and Virus-Axel**: wallet adapter integration, transactions, RPC, Anchor client codegen. Not first-party. Assume you own it.

### React Native / mobile
- **Mobile Wallet Adapter 2.3.0 (2026-08-17)** — the supported path. Android-first; MWA on iOS remains structurally weaker.

### Go
- `solana-go` (gagliardetto) for backend/authoritative servers; Solana Go received base58 encode/decode optimizations in Aug 2026.

---

## 10. Data / indexing

- **DAS API** — the Digital Asset Standard read API. **Mandatory** for compressed NFTs and Core assets. Offered by Helius, Triton, QuickNode. This is a *hard* third-party dependency for any cNFT-based game.
- **Yellowstone gRPC (Dragon's Mouth)** — the de-facto geyser streaming standard, from Triton. Multiple providers.
- **Helius LaserStream** — **note the accuracy trap:** it is marketed as a Yellowstone drop-in with historical replay, auto-reconnect and multi-region failover, but reporting also describes it as a **proprietary protocol with its own SDK, wire format, and subscription API that is not Yellowstone-compatible**. **Validate compatibility yourself before assuming portability.**
- **Pricing (2026):** Helius tiers **$0 / $49 / $499 / $999**, plus **LaserStream data add-ons $500–$6,000/mo after the April 2026 pricing change**. Real-time streaming is a five-figure-per-year line item at scale. Budget it from day one.
- **Webhooks** — Helius (parsed/enhanced), QuickNode, Triton. Fine for low-frequency events (mint, trade, quest completion); not for a game loop.
- **Geyser plugins** — self-host if you run your own validator; otherwise use a provider.
- Solana Foundation now publishes **near-real-time RPC comparisons across Alchemy, Helius, QuickNode, Triton One** at solana.com/data — use it to pick.

---

## 11. Oracles / price feeds (game economies)

- **Pyth Core** — pull/on-demand price updates posted on-chain by the consumer. `pyth-solana-receiver-sdk` **2.0.0 (2026-06-15)**. **Core upgrades scheduled 2026-07-31 and 2026-08-26 16:00 UTC are reported to require API keys for Core users — verify this before it breaks your feed.** (**UNVERIFIED**, but high operational risk.)
- **Pyth Pro (formerly Pyth Lazer)** — subscription feed, **updates up to 1ms**. Integrated with MagicBlock ERs. Only relevant if your economy is genuinely price-sensitive tick-to-tick.
- **Switchboard On-Demand feeds** — by early 2026: **3M+ on-chain oracle updates, 550+ unique feeds, 53 distinct programs** on Solana. Custom feed definitions (arbitrary APIs) make it the better fit for *non-price* game oracles — tournament results, sports, off-chain events.
- **MagicBlock Oracle** — first-party oracle for use inside ERs (docs: `tools/oracle`).

**Design note:** if your game economy pegs anything to SOL/USD, you are importing oracle latency + a manipulation surface into your gameplay. Prefer a game-internal unit of account and touch oracles only at cash-in/cash-out boundaries.

---

## 12. Shipped in the last 12 months that changes what's possible

1. **SIMD-0286: 60M → 100M CU blocks** (mainnet epoch 1009, 2026-07-29). More parallel gameplay txs per block — but **not** more per hot account.
2. **SIMD-0525: 400ms → 350ms slots** (mainnet epoch 1020, ~2026-08-21), staged to 200ms. Meaningfully tighter L1 confirmation for turn-based play.
3. **Anchor 1.0 (April 2026)** — package rename, Surfpool + LiteSVM defaults, Program Metadata replacing legacy IDL. Every pre-2026 Anchor tutorial is now wrong.
4. **Kora shipped (April 2026)** — official Solana fee relayer; players can transact with zero SOL and pay fees in your game token. Biggest single UX unlock for games.
5. **Bubblegum V2** — Core collections, **soulbound**, freeze/thaw, permanent delegate, royalty enforcement on compressed assets. Achievements and equipped-item locks are now native.
6. **Confidential Balances live on mainnet** via ZK ElGamal Proof program — encrypted balances/amounts.
7. **MagicBlock ER 64KB transactions + Private ERs (TEE)** — hidden-information games (poker, fog of war, sealed-bid auctions) become buildable on-chain rather than off-chain-with-commitments.
8. **Solana Mobile Stack opened to all Android OEMs (MWC 2026)** + Seeker 200K+ units + dApp Store 1,561 apps at 0% fee. A real, un-taxed mobile distribution channel.
9. **`@solana/kit` 7.x with React hooks** (Aug 2026) — the TS client story finally settled.
10. **x402 → Linux Foundation (2026-07-14)**, Solana Foundation founding premier member; **35M+ txs on Solana**. Agent/machine payments as a first-class rail.
11. **Solana Attestation Service** — live, with Civic, Solid, Solana ID, Trusta Labs building on it. Directly usable for **anti-sybil, achievement verification, anti-cheat reputation**. Caveat: schema standards are still inconsistent and low-quality attestations are manipulable.
12. **Alpenglow prerequisites activated** (SIMD-0387 Jul 8, SIMD-0357 Jul 22) — consensus rewrite is close but **not live**.

---

## 13. DEAD / DEPRECATED — do not use

| Thing | Status |
|---|---|
| **`@coral-xyz/anchor`** | Legacy. Frozen 0.32.1 (2025-10-10). Renamed to `@anchor-lang/core`. |
| **`solana-test-validator`** | Replaced by **Surfpool** as Anchor's default. |
| **`solana-bankrun`** | Dead (npm 0.4.0, Oct 2024). Use **LiteSVM**. |
| **Kinobi** | Replaced by **Codama**. |
| **`@solana/web3.js` v1** | Legacy/maintenance. Use `@solana/kit`. |
| **`@solana/wallet-adapter-*`** | Stale (Jun 2025). Use Wallet Standard + `@solana/kit-plugin-wallet`. |
| **`gill`** | Stale ~9mo (Nov 2025); absent from official docs. |
| **Solana Actions / Blinks** | Zombie. Packages unpublished since 2024–early-2025. Never natively supported by X. No formal deprecation, but **treat as dead**. |
| **MagicBlock BOLT (ECS)** | Crate stale since Jul 2025 with two yanked releases; absent from current docs product index. **Do not build on it.** |
| **Pyth Entropy on Solana** | **Does not exist.** EVM-only. |
| **Bubblegum V1 trees / Token Metadata collections** | Not forward-compatible with V2. |
| **SlotHashes randomness for value** | Was never safe; still isn't. |
| **Eclipse as a game-launch target** | Alive but −95% TVL. |
| **Rent collection** | Abolished. Rent-*exemption* deposits remain. |

---

## 14. Explicitly UNVERIFIED

- MagicBlock ER **trust model**: fraud proofs, data availability guarantees, validator-failure/undelegation recovery, decentralization roadmap. Not in public docs; the FAQ does not answer it. **Blocking question before shipping player funds.**
- Whether MagicBlock **BOLT** is formally deprecated (inferred from yanked crates + docs absence).
- **Switchboard On-Demand 2026 per-request SOL cost** — the widely-cited "~0.002 SOL" is a 2022 figure.
- **Solana.Unity-SDK maintenance intensity** — GitHub API was blocked from this environment; NuGet core packages last published 2024-02-26.
- **Pyth Core API-key requirement** after the 2026-07-31 / 2026-08-26 upgrades.
- **Anchor 1.1.x / 2.0 target Solana major version** (1.0 targeted 3.x; solana-sdk is now 4.1.0).
- **Alpenglow mainnet date** — solana.com says "Q3 2026", press says October 2026. Agave 4.3 is still beta.
- **Whether the 12M CU per-writable-account cap scales down with slot time** under SIMD-0525.
- SOL price used for dollar conversions (~$80, inferred from July 2026 reporting) — recompute with live price.
- **LaserStream ↔ Yellowstone wire compatibility** — sources contradict.

---

## Sources

Protocol/L1: [solana.com/upgrades/alpenglow](https://solana.com/upgrades/alpenglow) · [solana.com/upgrades/100m-cu-blocks](https://solana.com/upgrades/100m-cu-blocks) · [solana.com/upgrades/larger-transaction-sizes](https://solana.com/upgrades/larger-transaction-sizes) · [cryptoslate SIMD-0525](https://cryptoslate.com/solana-is-slashing-per-block-compute-limits-so-its-new-350ms-speed-boost-doesnt-overload-the-network/) · [cryptobriefing 350ms](https://cryptobriefing.com/solana-slot-time-reduction-350ms-testnet/) · [solanacompass SIMD-0286](https://solanacompass.com/news/solana-raises-mainnet-block-compute-limit-66-to-100m-cus-with-simd-0286-at) · [Changelog 2026-08-13](https://solana.com/news/solana-changelog-august-13-2026) · [Changelog 2026-08-06](https://solana.com/news/solana-changelog-august-6-2026) · [Ecosystem Roundup Jul 2026](https://solana.com/news/solana-ecosystem-roundup-july-2026) · [Compute Budget docs](https://solana.com/docs/core/fees/compute-budget) · [Helius local fee markets](https://www.helius.dev/blog/solana-local-fee-markets) · [SIMD-0296](https://github.com/solana-foundation/solana-improvement-documents/blob/main/proposals/0296-larger-transactions.md)

MagicBlock: [runtime-limits](https://docs.magicblock.gg/pages/ephemeral-rollups-ers/introduction/runtime-limits.md) · [pricing](https://docs.magicblock.gg/pages/overview/additional-information/pricing.md) · [VRF pricing](https://docs.magicblock.gg/pages/verifiable-randomness-functions-vrfs/introduction/pricing.md) · [FAQ](https://docs.magicblock.gg/pages/ephemeral-rollups-ers/introduction/faq.md) · [docs index](https://docs.magicblock.gg/llms.txt) · [Supersize](https://www.magicblock.xyz/blog/supersize) · [ER effect](https://www.magicblock.xyz/blog/the-ephemeral-rollup-effect) · [Blockworks: open-sourced validator](https://blockworks.co/news/solana-gaming-startup-open-sources-validator)

Randomness/oracles: [Switchboard randomness tutorial](https://docs.switchboard.xyz/docs-by-chain/solana-svm/randomness/randomness-tutorial) · [ORAO VRF](https://orao.network/solana-vrf) · [ORAO GitHub](https://github.com/orao-network/solana-vrf) · [Pyth Entropy](https://www.pyth.network/entropy) · [Pyth on Solana](https://docs.pyth.network/price-feeds/core/push-feeds/solana) · [Adevar: on-chain randomness risks](https://www.adevarlabs.com/blog/on-chain-randomness-on-solana-predictability-manipulation-safer-alternatives-part-1)

Tooling/clients: [Anchor 1.0.0 release notes](https://www.anchor-lang.com/docs/updates/release-notes/1-0-0) · [Solana JS SDK docs](https://solana.com/docs/clients/official/javascript) · [Migrating to Kit](https://solana.com/docs/frontend/web3-compat) · [Surfpool docs](https://solana.com/docs/tools/surfpool) · [Helius: Surfpool](https://www.helius.dev/blog/surfpool) · [Helius: Pinocchio](https://www.helius.dev/blog/pinocchio) · [Game SDKs](https://solana.com/docs/clients/community/game-sdks) · [Solana.Unity-SDK](https://github.com/magicblock-labs/Solana.Unity-SDK) · npm registry + crates.io API (version/date data queried 2026-08-20)

Assets: [Bubblegum V2](https://developers.metaplex.com/smart-contracts/bubblegum-v2) · [Bubblegum V2 FAQ](https://www.metaplex.com/docs/smart-contracts/bubblegum-v2/faq) · [Metaplex Core](https://www.metaplex.com/docs/smart-contracts/core) · [DAS API](https://www.metaplex.com/docs/dev-tools/das-api) · [Token Extensions](https://solana.com/docs/tokens/extensions) · [Transfer Hook guide](https://solana.com/developers/guides/token-extensions/transfer-hook) · [Helius: Token-2022](https://www.helius.dev/blog/what-is-token-2022) · [ZK Compression](https://www.zkcompression.com/home) · [permanent-delegate abuse](https://dev.to/ohmygod/solanas-permanent-delegate-burn-scam-how-token-2022-extensions-power-2026s-largest-automated-rug-4579)

UX/wallets/mobile/infra: [Kora docs](https://solana.com/docs/tools/kora/getting-started) · [Kora repo](https://github.com/solana-foundation/kora) · [BlockEden: Kora analysis](https://blockeden.xyz/blog/2026/04/22/solana-kora-signing-node-fee-relayer-gasless-ux-primitive/) · [Openfort: best Solana wallets 2026](https://www.openfort.io/blog/best-solana-wallets-for-developers) · [Turnkey: Solana wallets](https://www.turnkey.com/blog/best-solana-wallets-dapp-developers) · [SMS goes global](https://blog.solanamobile.com/post/sms-goes-global-and-season-2-wrapup) · [MWA/Seed Vault docs](https://docs.solanamobile.com/developers/seed-vault) · [dApp Store growth](https://cryptobriefing.com/solana-mobile-dapp-store-96-apps-week/) · [Helius sending txs](https://www.helius.dev/docs/sending-transactions/overview) · [Helius zero-slot](https://www.helius.dev/blog/zero-slot) · [Chainstack: Helius overview 2026](https://chainstack.com/helius-rpc-provider-a-practical-overview/) · [Subglow gRPC pricing](https://subglow.io/subglow-vs-helius) · [Solana Attestation Service](https://solana.com/news/solana-attestation-service) · [Actions/Blinks docs](https://solana.com/docs/tools/actions) · [Blockworks: blinks discoverability](https://blockworks.com/news/lightspeed-newsletter-solana-blinks-twitter) · [Dialect blink registry](https://docs.dialect.to/blinks/blinks-provider/blink-registry) · [Sonic SVM](https://www.sonicsvm.org/) · [Eclipse](https://www.eclipse.xyz/) · [Termina network extensions](https://www.termina.technology/post/network-extensions-2)
