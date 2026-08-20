# Economic & Legal Design Constraints — Interactive Game on Solana
**Research date: 2026-08-20.** Sources are linked inline. Items I could not tie to a primary or high-quality secondary source are marked **[UNVERIFIED]**.

> ⚠️ **NOT LEGAL ADVICE.** I am not a lawyer and this is not legal advice, nor does it create any attorney-client relationship. Gambling, securities, money-transmission, and consumer-protection law here is jurisdiction-specific, fact-specific, and moving fast (several items below are *proposed rules* or *preliminary injunctions*, not settled law). Before you take real value from a user, retain gaming/securities counsel in every jurisdiction you serve. Budget $50k–$250k for a real multi-jurisdiction opinion if you touch real-money mechanics.

---

## 1. Where the line is on gambling

### 1.1 The test: three elements
Nearly every US state (and, in different words, the UK and EU member states) defines gambling as **consideration + chance + prize**. Remove *any one* and you are, in principle, outside gambling law. Everything below is a way of removing one.

| Element | How teams remove it | Where it breaks |
|---|---|---|
| **Prize** | Cosmetic-only rewards, non-transferable, no cash-out | A secondary market you tolerate (or that a third party runs) can supply "money's worth" and re-trigger the analysis |
| **Chance** | Skill-predominant gameplay | State test varies (below); Florida bars wagering on skill games *by statute* |
| **Consideration** | Free alternative method of entry (AMOE) / sweepstakes | Actively being legislated out of existence in the US for casino-style content (§1.3) |

**Chance tests by state** ([Klein Moynihan Turco](https://kleinmoynihan.com/games-of-skill-v-games-of-chance-the-legal-analysis/), [Walters Law Group](https://www.firstamendment.com/skill-gaming-legal-guide/), [Gamma Law](https://gammalaw.com/real-money-gaming-taking-off-and-cashing-in/)):
- **Predominance test** — ~30+ states (CA, GA, IL, MI, NC, OH, PA…): skill must be >50% of outcome determination.
- **Material element test** — chance being *material* is enough to make it gambling, even if skill predominates. Much harsher.
- **Any chance test** — a handful of states: any chance element at all.
- **Outliers** — Florida prohibits wagering on skill games outright ([Ifrah Law](https://www.ifrahlaw.com/ifrah-on-igaming/gambling-on-skill-enforcement-of-gambling-laws-against-skill-games-in-outlier-states/)).

**Practical consequence:** any randomness at all — loot drops, matchmaking variance, VRF-driven crits — pushes you out of "pure skill" in material-element states. Skillz's public position is skill gaming is legal in 38+ states ([Skillz legal docs](https://docs.skillz.com/docs/legal-skillz/)); their excluded-state list is the de facto industry geofence. **[UNVERIFIED: exact excluded-state list — historically ~AZ, AR, CT, DE, LA, MT, SC, SD, TN, but verify against current Skillz T&Cs.]**

### 1.2 Structures teams actually use, ranked by risk

**Tier 0 — Lowest risk (recommended default for a small team)**
Cosmetic-only, non-transferable rewards. Premium currency purchased in fiat/USDC, spent on non-cashable items, no player-to-player value transfer. No prize of value → no gambling. Also no securities exposure (§2) and no money-transmitter exposure.

**Tier 1 — Skill wagering with geofence (Skillz model)**
Head-to-head entry fee → prize pool → rake. Requires: deterministic-seeded or symmetric-randomness matches (both players face the identical board), state-by-state geofence, age verification, responsible-gaming tooling, and a legal opinion per state. Compliance-grade geolocation is a real line item (§4.5).

**Tier 2 — Sweepstakes / dual-currency (AMOE)**
**This is the structure most under attack right now.** Do not build on it for casino-style content. Detail in §1.3.

**Tier 3 — No-loss / yield-funded prizes (PoolTogether pattern)**
Deposits stay whole; pooled yield is awarded by chance ([PoolTogether](https://medium.com/pooltogether/the-power-of-no-loss-prize-savings-1f006503f64)). Removes *loss* but **does not remove prize or chance**, and the consideration analysis is contested (many regulators treat forgone interest / time-value of deposit as consideration). Additionally drags in: securities analysis (a yield-bearing pooled instrument), money transmission, and — in 2026 — likely classification as a financial product rather than a game. Prize-linked savings accounts are legal in the US *only* under specific federal/state PLSA carve-outs for chartered depositories (American Savings Promotion Act 2014), which a game studio cannot use. **High complexity, poor risk/reward for a small team.**

**Tier 4 — Offshore license + geofence out US/UK**
Curaçao's regime changed materially: the **LOK** (National Ordinance on Games of Chance, Dec 2024) replaced the 1993 NOOGH; the **Curaçao Gaming Authority (CGA)** now licenses directly and all old master/sub-licenses expired January 2025 ([Zitadelle](https://www.zitadelleag.com/news/offshore-igaming-curacao-license-guide), [Coincub](https://coincub.com/blog/curacao-gaming-license/)). Reported cost **$50k–$200k, 6–12 months**, plus chain-analysis tooling, wallet disclosure, on-chain monitoring, FATF-aligned AML. Anjouan is the budget overflow at **$25k–$50k / 3–4 months** but is also tightening ([hazreviews](https://hazreviews.com/news/curacao-got-stricter-anjouan-got-busier-the-crypto-casino-license-map-in-2026/), [track360](https://track360.io/blog/curacao-gaming-license-gcb-operator-guide-2026)). **[UNVERIFIED: exact fee figures — these come from license-broker marketing, which systematically understates total cost.]**

> **The critical misconception:** an offshore license confers *no* right to serve US, UK, or most EU players. It is a banking/payment-processing and tax artifact, not a shield. UIGEA, the Illegal Gambling Business Act, and the Travel Act still apply, and FinCEN treats virtual currency as a UIGEA payment instrument ([CRS 97-619](https://www.congress.gov/crs-product/97-619)). Founders get personally named — see §1.3.

**Tier 5 — Prediction-market wrapper**
Only viable *as or on* a CFTC-registered DCM. Not available to a small team. See §1.4.

### 1.3 US enforcement reality, 2025–2026 — this is the important part

**Sweepstakes casinos are being criminalized state by state.** Per [InfoLawGroup, July 2026](https://www.infolawgroup.com/insights/2026/7/27/sweepstakes-casino-laws-in-2026-new-bans-proposed-legislation-and-regulatory-trends):

| State | Bill | Effective | Penalty |
|---|---|---|---|
| Indiana | HB 1052 | Jul 1, 2026 | Civil to $100,000 |
| Iowa | SF 2289 | Jul 1, 2026 | C&D + injunctive |
| Louisiana | HB 53 / HB 883 | Aug 1, 2026 | **$100k fine + up to 5 years prison** |
| Maine | LD 2007 | Mid-Jul 2026 | $10k–$100k + revocation |
| Oklahoma | SB 1589 | Nov 1, 2026 | **Felony** |
| Tennessee | HB 1885/SB 2136 | Signed May 22, 2026 | Consumer Protection Act civil penalties |
| New York | — | Apr 2026 (60-day window) | **Class E felony** |

Eight-plus states now have in-force statutory bans on the dual-currency model (CA, CT, IN, ME, MT, NJ, NY, TN per [BSN](https://brightsideofnews.com/gambling/sweepstakes-casino-ban-us-states-2026/), plus IA, LA, OK above).

**Two design details in these statutes matter enormously to you:**
1. The prohibited conduct is defined as a **"dual-currency or multi-currency system" that "simulates lottery games or casino-style gaming."** A dual-currency game that does *not* simulate casino content is generally outside these specific statutes — but is still subject to the underlying general gambling statute.
2. **Liability extends down the stack.** Louisiana and Oklahoma name *operators, platform providers, suppliers, geolocation providers, promoters, media affiliates, and support providers.* Your RNG vendor, your relayer operator, your influencer partners, and your geolocation vendor are all in scope.

**Operator enforcement:**
- **Stake.us**: Illinois Gaming Board found reason to believe it operated an illegal online casino (Feb 2026). The **LA City Attorney's civil action names founders Bijan Tehrani and Ed Craven personally**, plus suppliers Evolution, Pragmatic Play, and Hacksaw Gaming ([Casino Industry News](https://casinoindustrynews.com/news/usa/stake-casino-litigation-los-angeles/), [gamblingharm.org](https://gamblingharm.org/stake-us-lawsuits-in-multiple-states-over-alleged-illegal-online-casino/)).
- **50 state/territory AGs** petitioned DOJ (Aug 2025) to prioritize offshore enforcement via UIGEA injunctive relief, asset and domain seizures, and payment-processor/bank coordination.
- **Florida AG Uthmeier** named illegal-gambling enforcement a 2026 priority ([Deadspin](https://deadspin.com/legal-betting/florida-attorney-general-signals-tougher-enforcement-against-illegal-gambling-operators/)).

**The DFS "pick'em" cautionary tale** — most relevant precedent for "it's a game, not gambling" framing: PrizePicks paid **~$15M to the NY State Gaming Commission** and exited NY (Feb 2024); Florida, Arkansas, Michigan, and Massachusetts issued C&Ds to PrizePicks, Underdog, and Betr ([Klein Moynihan](https://kleinmoynihan.com/fantasy-sports-law-15m-penalty/), [Gaming America](https://gamingamerica.com/news/8713/florida-regulator-issues-cease-and-desist-letters-to-underdog-sports-prizepicks-and-betr)). **Lesson: regulators look at what the product functionally *is*, not at your taxonomy.** Both companies later re-entered FL with restructured peer-vs-peer formats — restructuring works, labeling does not.

### 1.4 Prediction markets — do not read Kalshi as permission

- **Third Circuit, *KalshiEX LLC v. Flaherty*, No. 25-1922 (Apr 6, 2026)** — 2-1, affirmed a preliminary injunction against New Jersey. Held sports event contracts on a CFTC-registered DCM are "swaps," and both **field preemption** ("regulation of trading on a DCM") and **conflict preemption** bar state gambling enforcement. Judge Roth dissented, invoking the presumption against preemption in gambling and noting CFTC Rule 40.11(a)(1) cuts the other way ([Holland & Knight](https://www.hklaw.com/en/insights/publications/2026/04/federal-appeals-court-cftc-jurisdiction-over-sports-event-contracts), [Paul Weiss](https://www.paulweiss.com/insights/client-memos/a-divided-third-circuit-holds-that-the-cftc-has-exclusive-jurisdiction-over-sports-related-event-contracts), [Skadden](https://www.skadden.com/insights/publications/2026/04/third-circuit-affirms-kalshis-preliminary-injunction)).
- **Contra:** Massachusetts Suffolk County Superior Court preliminary injunction against Kalshi (Jan 2026); **Nevada TRO** granted Mar 20, 2026 (Judge Woodbury) covering sports, election, *and entertainment* event contracts ([Venable](https://www.venable.com/insights/publications/2026/03/nevada-court-issues-tro-against-kalshi-as-congress), [SBC Americas](https://sbcamericas.com/2026/03/20/kalshi-tro-nevada-sportscontracts/)). The **Ninth Circuit** heard consolidated argument Apr 16, 2026 (Kalshi/Robinhood/Crypto.com v. Nevada GCB) with a panel reportedly leaning Nevada's way ([Nevada Current](https://nevadacurrent.com/2026/04/16/ninth-circuit-panel-appears-to-lean-nevadas-way-in-legal-battle-with-kalshi-crypto-com/)); Fourth Circuit argued May 7; the Sixth Circuit has an intra-circuit split. **[UNVERIFIED: whether the 9th Circuit has ruled as of 2026-08-20 — I found no decision.]**
- **CFTC:** withdrew the 2024 proposed rule; issued a **new proposed rule June 10, 2026** revising Rule 40.11 with a new procedural framework ([CRS LSB11441](https://www.congress.gov/crs-product/LSB11441)).
- **Polymarket:** acquired CFTC-licensed **QCEX for $112M** (Jul 2025) → QCX LLC DCM ([PR Newswire](https://www.prnewswire.com/news-releases/polymarket-acquires-cftc-licensed-exchange-and-clearinghouse-qcex-for-112-million-302509626.html)); CFTC no-action relief; Amended Order of Designation Nov 2025; formal application Apr 28, 2026; **a new CFTC probe opened June 2026.**

**Takeaway:** the preemption shelter attaches to *DCM registration*, which costs eight figures and years. A game with "prediction" mechanics and no DCM gets the state-gambling analysis, full stop.

### 1.5 UK
- **Gambling Act 2005** requires a prize of "money or money's worth." UKGC position: where loot-box items are **confined to the game and cannot be cashed out**, it is *unlikely to be a licensable gambling activity* ([UKGC/ABSG](https://www.gamblingcommission.gov.uk/print/lootboxes-advice-to-the-gambling-commission-from-absg), [Collyer Bristow](https://collyerbristow.com/shorter-reads/gaming-or-gambling-the-regulation-of-video-game-loot-boxes/)). The 2022 DCMS decision not to classify loot boxes as gambling still stands.
- **The cash-out is the trigger.** A tradable on-chain item with an active secondary market is "money's worth." A Solana game with transferable NFTs sits on the wrong side of the exact test the UK uses to exempt loot boxes.
- **Free-draw / prize-competition route** (Gambling Act ss.14, 339 and Sch.2): a genuinely free entry route of *equal prominence and equal chance*, or a competition requiring skill/knowledge/judgment sufficient to deter a significant proportion of entrants. This is the UK's AMOE analogue and is narrower than the US version.
- **From June 2026**: new submissions with real-money-purchasable loot boxes require **PEGI 16 minimum**; ASA requires explicit loot-box disclosure in store listings — "offers in-app purchases" is no longer sufficient ([Programming Insider](https://programminginsider.com/loot-boxes-regulation-and-where-the-line-sits-in-2026/)).
- Separately: UK **financial promotions regime** (FSMA s.21) captures qualifying cryptoasset promotions — a token marketed to UK consumers needs an authorised approver or an exemption.

### 1.6 EU
- **Belgium**: only EU state banning *all* paid loot boxes under existing gambling law; criminal fines up to **€800,000** plus imprisonment ([promise.legal](https://blog.promise.legal/lootbox-regulation-2026-game-studios/)).
- **Netherlands**: a March 2022 court decision overturned the KSA's gambling-law prohibition, so paid loot boxes are technically lawful — but the **ACM fined Epic €1.1M+ (2024)** over Fortnite in-game purchase practices under consumer law ([Franssen Tolboom](https://www.franssentolboom.nl/en/loot-boxes-an-overview-of-recent-developments/)). Consumer-protection law is now the live enforcement vector, not gambling law.
- **CPC Network guidelines** on virtual currencies and microtransactions apply existing EU consumer law directly to monetization design (pricing transparency in real currency, no obscured exchange rates, no dark patterns, withdrawal rights).
- **Digital Fairness Act** projected Q4 2026: possible full loot-box ban for minor-accessible games or mandatory parental consent EU-wide. **[UNVERIFIED — projection, not adopted text.]**

---

## 2. Securities risk of game tokens/NFTs in 2026

### 2.1 Where the SEC actually is
Three developments, in order:

1. **Project Crypto** (Chairman Atkins, Nov 2025 speech) → **Jan 28, 2026 staff statement** setting a taxonomy for tokenized securities.
2. **SEC–CFTC Joint Interpretation, March 17, 2026** (Rel. **33-11412**, [PDF](https://www.sec.gov/files/rules/interp/2026/33-11412.pdf); [press release](https://www.sec.gov/newsroom/press-releases/2026-30-sec-clarifies-application-federal-securities-laws-crypto-assets)). Classifies crypto assets into **five categories: digital commodities, digital collectibles, digital tools, stablecoins, digital securities** ([Ropes & Gray](https://www.ropesgray.com/en/insights/alerts/2026/03/sec-and-cftc-issue-landmark-joint-guidance-on-classification-of-crypto-assets), [Sullivan & Cromwell](https://www.sullcrom.com/insights/memo/2026/March/SEC-Clarifies-Application-Securities-Laws-Crypto-Assets)). **This is the single most useful document for a game studio** — "digital collectibles" and "digital tools" are the two buckets a well-designed game asset should land in.
3. **Proposed "Regulation Crypto Assets," August 18, 2026** (Rel. **33-11434**, [proposing release PDF](https://www.sec.gov/files/rules/proposed/2026/33-11434.pdf); [press release](https://www.sec.gov/newsroom/press-releases/2026-76-sec-proposes-new-regulation-crypto-assets)):
   - **Startup exemption**: up to **$5M over 4 years**, principles-based narrative disclosure only.
   - **Larger exemption**: up to **$75M per 12 months**, with financial statements + ongoing reporting.
   - **Conditional investment-contract safe harbor**: a token exits "investment contract" status once the issuer **"has completed or permanently ceased all essential managerial efforts that it represented or promised it would take under an investment contract."**
   - **Preempts state blue-sky registration** for covered offerings and certain secondary transactions.
   - **60-day comment period from Federal Register publication. This is a PROPOSAL. It is not law and may not become law in this form.**

**CLARITY Act is effectively stalled** — Senate left for August recess without a vote; prediction-market odds of 2026 passage collapsed from ~82% to ~16% ([crypto.news](https://crypto.news/clarity-act-dying-sec-regulation-crypto-replacement/), [tech-insider](https://tech-insider.org/clarity-act-2026-status/)).

### 2.2 The airdrop point most teams get wrong
The March 2026 interpretation says airdrops of **non-security** crypto assets for **no or nominal consideration** fail Howey's first prong — no investment of money, so not securities transactions. **But it expressly does not cover airdrops "where recipients perform services or provide other consideration in exchange for the tokens."**

**A points program that rewards gameplay/deposits/referrals and then converts to a token is exactly "recipients perform services."** The popular "points → token" structure is *not* the safe harbor teams assume it is. It also does not solve the *marketing* problem: if you tell players points will become a token with value, you have created the expectation of profit regardless of the mechanics.

### 2.3 Risk dial for a game token

**Raises risk sharply**
- Pre-launch sale to investors, or any sale where the pitch includes price appreciation
- Staking yield, revenue share, buyback-and-burn tied to studio revenue
- "Treasury will support the price" / market-making commitments
- Team + VC allocations with public vesting schedules and a public roadmap of studio deliverables
- Fixed/deflationary supply marketed as the value thesis
- Governance rights over an enterprise that generates profits
- Exchange listings sought and promoted by the studio

**Lowers risk**
- Token is **earned, never sold** by the issuer
- Token is **consumed and burned** on use (a consumable, not a store of value)
- Internal prices denominated in **USD** and the token is bought at a floating rate — kills the "number go up" utility narrative
- No yield, no revenue share, no dividend-like flow
- Transfer restricted or non-transferable
- No roadmap of studio "essential managerial efforts" tied to token value
- Studio revenue is fiat/USDC and independent of token price

### 2.4 Structures teams actually use

| Structure | Securities risk | Notes |
|---|---|---|
| **No token. Fiat/USDC only.** | Minimal | Correct answer for ~90% of game studios. You lose nothing except a fundraising channel. |
| **Cosmetic NFTs only, primary sale in fiat/USDC, royalty on secondary** | Low | Maps to "digital collectibles." Keep them genuinely unique, no fractionalization, no yield, no revenue share. |
| **Utility token, earned-only, burned-on-use, USD-denominated pricing** | Low–moderate | Maps to "digital tools." Never sell it yourself. |
| **Points → later airdrop** | **Moderate–high** | Contra the common belief; see §2.2. |
| **Two-token (governance + utility)** | Moderate | Photo Finish LIVE uses $CROWN (governance/staking) + $DERBY (in-game). Separation is real but concentrates securities risk in the governance token — especially with staking rewards attached. |
| **Token sale under proposed Reg CA exemption** | TBD | Not available until/unless the rule is adopted. Do not plan on it. |

### 2.5 Non-US
- **MiCA**: NFTs are out of scope **only if genuinely unique and non-fungible** (Art. 2(3)); ESMA assesses **economic substance, not the label** ([ESMA March 2025 guidelines](https://www.bdo.com.mt/en-gb/news/news-in-2025/understanding-the-esma-guidelines-on-crypto-assets-as-financial-instruments)). A 10,000-piece PFP series with fungible traits, or fractionalized NFTs, gets pulled in. A **fungible in-game token publicly offered in the EU is a "crypto-asset other than an ART or EMT"** → CASP/white-paper obligations unless a Art. 4(3) exemption (free issuance, limited network) applies.
- **Money transmission is the sleeper risk.** If you custody player fiat or crypto and permit withdrawal to third parties, you are into state MTLs (~$50k–$150k/state in surety bonds and fees, 40+ states) and potential FinCEN MSB registration for a convertible virtual currency. This kills more small teams than securities law does. Design so value flows **in** and is **consumed**, never **out to arbitrary third parties**.

---

## 3. Sustainable game economy patterns

### 3.1 Why play-to-earn fails mathematically
The identity is simple. Let **E** = total value paid out to players per period, **S** = total player spend per period, **X** = external revenue (ads, sponsorship, IP licensing), **C** = studio opex.

Sustainability requires **E ≤ S + X − C.**

P2E games set **E as a function of playtime** and **S as a function of new-user inflow**. Because playtime is elastic (farmers/bots scale it arbitrarily) and new-user inflow decelerates by definition, **E/S rises monotonically after the growth phase**, and the token must fall. Reflexivity then finishes it: earnings are denominated in the token, so a falling token drives earners out, which drives S down further.

**Axie Infinity is the canonical measurement:** Sky Mavis reported **~5× more SLP minted daily than burned**, i.e. **~18–19% monthly supply inflation**. AXS fell **~89%** from ~$160; SLP fell **~99%** from ~$0.36 to ~$0.005 ([Forkast](https://forkast.news/axie-infinity-play-to-earn-model/), [Forbes](https://www.forbes.com/sites/leeorshimron/2022/08/13/axie-infinity-pernicious-pyramid-scheme-or-gaming-breakthrough/), [Cornell Chronicle post-mortem](https://news.cornell.edu/stories/2025/09/what-crash-play-earn-game-reveals-about-the-future-of-web3)). The scholarship-manager layer added an MLM-shaped recruitment incentive on top.

**Market-wide confirmation:** ~**97% of gaming token launches underperformed in 2025** ([antier](https://www.antier.com/blogs/from-play-to-earn-to-play-and-own-the-new-blueprint-for-web3-game-development-in-2026/)). **[UNVERIFIED — secondary source, methodology not stated.]**

### 3.2 Sink/faucet design — the actual craft
Traditional MMO economies solved this decades ago and the lessons transfer directly ([RuneScape Wiki: Sink](https://runescape.wiki/w/Sink_(economy)), [Wikipedia: Gold sink](https://en.wikipedia.org/wiki/Gold_sink), [OSRS economy dev tracker](https://devtrackers.gg/osrs/p/236f5afd-old-school-economy-future-plans)):

**Faucets** (currency/items entering): quest rewards, monster drops, daily logins, PvP payouts, staking emissions.
**Sinks** (leaving): repair costs, crafting failure, consumables, market tax, listing fees, respec fees, cosmetic purchases, entry fees, breeding/fusion costs, name changes, teleport costs, death penalties.

**Design rules that hold up:**
1. **Sinks must be percentage-based, not flat.** A flat 100-gold repair is a tax on new players and a rounding error for whales. A 5% market transaction tax scales with wealth automatically. This is EVE's core mechanism.
2. **Target a sink-coverage ratio (sinks ÷ faucets) of ~0.95–1.05 at steady state.** Instrument this from day one; it is the single most important number in your telemetry. Below 0.9 → inflation; above 1.1 → players feel taxed and churn.
3. **Prefer horizontal progression (side-grades) over vertical power creep** to avoid *mudflation* — item devaluation that makes veteran achievements worthless. OSRS is the reference implementation.
4. **Every faucet needs a matching sink at the same tier.** If tier-3 raids drop tier-3 currency, tier-3 crafting must consume it.
5. **Bot-resistant faucets:** faucets must be gated by something bots can't scale — time-gated stamina, PvP results, or human-competitive scarcity — not by raw action count.
6. **Burn what you take.** A studio rake that recycles back into rewards is not a sink. A rake that is burned or converted to fiat revenue is.

### 3.3 How successful crypto games actually make money
Not from token appreciation. From **fees on player-to-player value transfer** and **direct content sales**.

**Photo Finish LIVE (Solana, Third Time Entertainment)** — best available Solana-native reference. Cumulative through Sept 2025: **$23M horse sales, $50M race fees, $9.7M track earnings, $19M stud fees**, and **7M+ USDC distributed** to track owners and $CROWN stakers ([DappRadar](https://dappradar.com/blog/photo-finish-live-horse-racing-game-solana), [Solana case study](https://solana.com/news/case-study-photo-finish-live), [Solana Compass](https://solanacompass.com/learn/breakpoint-24/bp-2024-product-keynote-the-1-game-on-solana-that-you-didnt-know-existed)). First real-money horse racing game approved on the App Store; Kentucky Derby partnership. Note the structure: **race entry fees are the largest line** — a rake on player-vs-player competition, not token emissions.

**Gods Unchained** — **$52M+ card trading volume in 2026**, **$10.64M NFT sales in May 2025**, 450k+ registered players. Revenue = primary card pack sales + secondary royalty ([cryptonews roundup](https://cryptonews.com/cryptocurrency/top-web3-games/)). **[UNVERIFIED — aggregator figures, not audited.]**

**Revenue model taxonomy that works:**

| Model | Mechanic | Why it works | Sink? |
|---|---|---|---|
| **Rake on PvP** | 5–15% of entry fees | Scales with engagement, not new users; zero-sum among players so no inflation | Yes |
| **Marketplace fee/royalty** | 2.5–10% of secondary | Monetizes churn (sellers) as well as growth | Yes |
| **Battle pass / season** | $10–20/season, ~30–60 day cadence | Predictable recurring revenue, high retention, and a *currency sink* if priced in soft currency | Yes if soft-currency priced |
| **Direct cosmetic sales** | Fiat/USDC | Zero legal complexity, infinite supply, ~100% margin | N/A (fiat leaves the economy) |
| **Consumables** | Energy, repairs, crafting mats | The most reliable sink in game design | Yes |
| **Breeding / fusion fees** | Burn two, mint one + fee | Both an item sink and a currency sink | Yes (both) |

**"Play-to-own" vs "pay-to-play":** the 2026 consensus is that ownership should be a **retention and liquidity feature** (you can exit your investment of time, which reduces churn anxiety and increases willingness to spend), **not a yield promise**. Games that survived built gameplay first and let ownership be secondary.

### 3.4 Concrete recommendation for a small team
Charge **fiat/USDC for content and season passes**, take a **rake on player-vs-player competition**, take a **royalty on secondary trades**, and emit **no token whatsoever**. That is a business. Add a token only when you have a specific, non-financial job for it that nothing else can do.

---

## 4. Unit economics of an on-chain game on Solana

**Assumption for all dollar figures: SOL ≈ $76 (mid-Aug 2026).** **[UNVERIFIED — derived from price-tracker search results dominated by prediction content; re-price before you rely on it.]** Note: all on-chain costs are fixed in SOL, so **your gas budget is a levered SOL position.** Model at $50, $150, and $400.

### 4.1 Per-transaction cost
**Current model:**
- Base fee: **5,000 lamports per signature** = 0.000005 SOL = **$0.00038** ([Helius](https://www.helius.dev/blog/solana-fees-in-theory-and-practice), [Solana docs](https://solana.com/learn/understanding-solana-transaction-fees)).
- Priority fee: `ceil(CU_price_µlamports × CU_limit ÷ 1,000,000)` lamports, **100% to the validator** under SIMD-0096 ([Figment on SIMD-123/fee sharing](https://www.figment.io/insights/simd-123-solanas-native-in-protocol-priority-fee-sharing-onchain/)). **[UNVERIFIED: one source dates the SIMD-0096 vote to July 2026; my understanding is it activated in early 2025. Verify.]**

**Worked examples (game action, 200k CU limit):**

| Priority (µlamports/CU) | Priority fee | Total tx | USD |
|---|---|---|---|
| 0 (uncontested account) | 0 | 5,000 lamports | **$0.00038** |
| 10,000 (normal) | 2,000 | 7,000 lamports | **$0.00053** |
| 50,000 (busy) | 10,000 | 15,000 lamports | **$0.00114** |
| 500,000 (congested) | 100,000 | 105,000 lamports | **$0.0080** |

Network-wide averages reported for 2026: **~$0.00025 to ~$0.013** depending on demand ([StakePoint](https://stakepoint.app/blog/solana-gas-fees-explained-why-transactions-cost-almost-nothing), [RPC Fast](https://rpcfast.com/blog/solana-transaction-fees-explained)).

**Critical architectural note:** Solana has **local fee markets** — you bid only against transactions touching the *same writable accounts*. A game with a single global-state PDA that every player writes to will see fees explode under load. **Shard your state per-player or per-match.** This is the highest-leverage cost decision you will make.

**Pending change — SIMD-0553 "Resource and Inclusion Fee"** ([proposal](https://github.com/solana-foundation/solana-improvement-documents/blob/main/proposals/0553-resource-fee-burn.md)): replaces the flat per-signature base with a **2,500-lamport flat inclusion fee to the leader** plus a **resource fee = ceil(requested_cost_units × numerator ÷ denominator)** that is **100% burned**, staged at 1/10 → 1/4 → 1/2 rates. Requested cost units sum signature verification + write-lock + instruction-data + **requested CU limit** + **requested loaded-accounts-data-size**. **Two design consequences: (a) over-requesting your CU limit will start costing real money — tighten `SetComputeUnitLimit`; (b) requesting large `loaded_accounts_data_size` now costs money too.** Document is marked **Draft, 2026-06-03; no mainnet activation date.** **[UNVERIFIED activation status.]**

### 4.2 State cost (rent)
Rent-exempt minimum = **3,480 lamports/byte/year × 2 years = 6,960 lamports/byte**, plus 128 bytes of account overhead ([Solana cookbook](https://solana.com/developers/cookbook/accounts/calculate-rent)).

| Account | Bytes | SOL | USD @ $76 |
|---|---|---|---|
| Bare system account | 0 (+128) | 0.00089088 | **$0.068** |
| SPL token account | 165 (+128) | 0.00203928 | **$0.155** |
| 200-byte player PDA | 200 (+128) | ~0.00228 | **~$0.17** |
| 1 KB match state | 1024 (+128) | ~0.00802 | **~$0.61** |

**Rent is recoverable on account close — it is working capital, not expense.** But if you sponsor account creation for 100k players at $0.17 each, that is **$17,000 of SOL locked**, and in practice most is never reclaimed. Budget it as CAC and **build account-close flows** to recycle it.

**Compressed NFTs**: **5.35 SOL to mint + store 1,000,000 cNFTs** = **~$407 at $76/SOL** (~**$0.0004 each**), versus ~12,000 SOL uncompressed ([Solana](https://solana.com/news/state-compression-compressed-nfts-solana), [Helius](https://www.helius.dev/blog/solana-nft-compression)). For any high-volume game item, **cNFTs are the only sane choice** — 2,400–24,000× cheaper.

### 4.3 Per-DAU cost model

**Assumptions:** 20 on-chain actions/DAU/day at ~$0.0008 average all-in (base + modest priority).

| DAU | Gas/day | Gas/month | Notes |
|---|---|---|---|
| 1,000 | $16 | **$480** | Trivial |
| 10,000 | $160 | **$4,800** | Now material — batch aggressively |
| 100,000 | $1,600 | **$48,000** | Must reduce on-chain action count |

**Implication: do not put every player action on chain.** Batch. Settle sessions, not moves. A well-designed hybrid puts 1–3 transactions per *session* on chain (join, settle, withdraw) rather than 20 per day, cutting the 10k-DAU line from $4,800/mo to **~$300/mo**.

### 4.4 RPC, relayer, and indexer costs

**Helius** ([pricing](https://www.helius.dev/pricing)):

| Tier | $/mo | Credits/mo | RPS | Overage |
|---|---|---|---|---|
| Free | $0 | 1M | 10 | — |
| Developer | $49 | 10M | 50 | $5/M |
| Business | $499 | 100M | 200 | $5/M |
| Professional | $999 | 200M | 500 | $5/M |
| Enterprise | Custom | 1B+ | Custom | Custom |

Add-ons: LaserStream data **$500/mo (5TB) → $4,500/mo (100TB)**; Raw Shreds **$800–$1,000/mo per IP**; **dedicated nodes from $2,900/mo**.

**Triton One** ([pricing](https://triton.one/pricing)): pay-as-you-go at **$0.08/GB bandwidth** plus per-million-request rates by category (historical queries **$10/M**), **$125 minimum prepaid**. Dedicated nodes from **$2,900/mo**; Triton claims Cloudbreak cuts a full-index node from >$3,000/mo to **~$400/mo** **[UNVERIFIED — vendor claim]**.

**Modeled RPC spend at 10,000 DAU:** 10k × 20 actions × ~30 RPC calls/action (build, simulate, send, confirm, read-back, plus UI reads) ≈ **180M calls/month**. At Helius credit weightings **[UNVERIFIED — per-method credit costs not published in my sources]** of 1–10 credits/call, that is 180M–1.8B credits → **$499/mo (Business) to Enterprise pricing**.

**Practical range: $500–$2,500/mo at 10k DAU**, and the variance is almost entirely determined by whether you **poll or stream**. Replacing confirmation polling with WebSocket/LaserStream subscriptions typically cuts call volume 5–10×.

**Self-hosted alternative:** a bare-metal Solana RPC + Geyser node runs **~$500–$1,500/mo** at Latitude/Hetzner-class providers (some sources quote **$300–$600** for a Geyser-only consumer box ([Chainstack](https://chainstack.com/best-solana-rpc-providers-in-2026/), [hivelocity](https://www.hivelocity.net/blog/solana-api-provider-helius-triton-one-alternative/)) — that is optimistic for full RPC). **[UNVERIFIED — hardware pricing varies widely.]** Crossover vs. managed is around 500M–1B credits/month, but the engineering cost of running it (snapshot management, restarts, upgrades) is ~0.25–0.5 FTE. **For a small team, stay managed until you're paying >$2k/mo.**

**Indexer**: Geyser/Yellowstone gRPC consumer → Postgres/ClickHouse. Budget **$200–$800/mo** managed database + the node/stream cost above. Use Helius DAS API instead if your data needs are NFT-shaped.

**Fee payer / gasless relayer**: **Kora** (Solana Foundation fee relayer + signing node, shipped ~April 2026) supports sponsoring transactions, paying fees in any SPL token, and TEE/KMS-backed signing ([QuickNode guide](https://www.quicknode.com/guides/solana-development/transactions/kora), [BlockEden](https://blockeden.xyz/blog/2026/04/22/solana-kora-signing-node-fee-relayer-gasless-ux-primitive/)). Alternatives: [Privy](https://docs.privy.io/wallets/gas-and-asset-management/gas/solana), [Dynamic](https://www.dynamic.xyz/docs/react/wallets/using-wallets/solana/gasless-transactions).
- **Infra cost**: ~$50–$200/mo for the relayer process itself.
- **Real cost = the sponsored fees** (§4.3) **+ drain risk.** A public fee payer is a faucet. **Mandatory:** per-user rate limits, per-day SOL caps, an **instruction allowlist** (only your program IDs), simulation before signing, and a hot wallet holding <24h of float with automated top-up.

**VRF**: Switchboard reports **<0.002 SOL/request (~$0.15)** ([Switchboard](https://switchboardxyz.medium.com/verifiable-randomness-on-solana-46f72a46d9cf)); v3 uses SGX enclaves with same-transaction callbacks. [ORAO VRF](https://orao.network/solana-vrf) reports sub-second fulfillment at basic tx fees. **At $0.15/roll, VRF is 100–400× your base tx cost — do not VRF every action.** Batch: one VRF seed per session/match, expanded deterministically client- and program-side.

### 4.5 Compliance infrastructure (only if you touch real value)
Compliance-grade geolocation reportedly runs **$0.005–$0.05 per check with $5,000–$50,000/mo minimums** (GeoComply, Xpoint, LocationSmart) **[UNVERIFIED — GeoComply does not publish pricing; figures are from an unreliable secondary source](https://tech-insider.org/igt-geocomply-vs-xpoint-vs-locationsmart-for-us-gambling-ge-en-d181/)**. IP-based geofencing (MaxMind, Digital Element) costs orders of magnitude less and is accepted by some EU/UK regulators but is **not** compliance-grade for US gaming.

**The monthly minimum is the killer.** A $5k–$50k/mo floor plus KYC vendor costs plus per-state legal opinions means the **real-money path has a ~$500k–$1M/yr fixed compliance floor before a single dollar of revenue.** This is the single strongest economic argument for Tier 0 (cosmetic-only) for a small team.

---

## 5. Anti-cheat / anti-bot / anti-sybil on a transparent chain

### 5.1 What actually works

**1. Server-authoritative hybrid — the answer for 95% of games.**
Chain = ledger of assets and settled outcomes. Your server = simulation authority and source of truth for gameplay. Player signs an intent; server validates against the real simulation; server (or a relayer) submits settlement. This is what Photo Finish LIVE and essentially every commercially successful "web3 game" actually does. It is cheap (§4.3), fast, and lets you use 25 years of conventional anti-cheat. **Cost: you must be trusted.** Mitigate with published outcome logs, VRF-seeded determinism, and periodic on-chain commitments to server state roots.

**2. Commit-reveal for hidden information.**
Both parties submit `hash(move ‖ nonce)`, then reveal. Solves the transparent-mempool problem where an opponent (or an MEV bot) reads your move before it lands. **Mandatory design detail: the forfeiture penalty for non-reveal must exceed the max gain from selectively aborting**, or players will simply not reveal when they'd lose. Pair with a reveal deadline enforced on-chain.

**3. Real VRF for randomness — never on-chain entropy.**
Use Switchboard or ORAO. **Never** derive randomness from blockhash, slot number, `Clock::unix_timestamp`, or account data — all are known to or manipulable by the leader/bundler, and this is the most common exploited bug in Solana games ([Adevar Labs on Solana randomness](https://www.adevarlabs.com/blog/on-chain-randomness-on-solana-predictability-manipulation-safer-alternatives-part-1)).

**4. Non-transferable, time-refilling resources (stamina/energy).**
This is the highest-value anti-bot mechanic in existence and it is a *game design* mechanic, not a security mechanic. It hard-caps per-account throughput, so scaling an exploit requires scaling *accounts*, which converts an unbounded software problem into a bounded economic one.

**5. Make account creation carry an unrecoverable cost.**
Solana rent (~$0.17) is **refundable on close** and therefore worth roughly **zero** as a sybil deterrent. If you want an economic floor, you need a genuinely sunk cost: a burned entry fee, a non-refundable season pass, or a bonded stake with a lockup long enough to make capital cost real. **Target: cost-to-create-account > expected-lifetime-reward-per-account.** Compute this number explicitly; if you can't, your rewards will be farmed.

**6. Staking with slashing.**
Works when the slashable stake exceeds the profit from a single detected violation *and* detection probability is high. Works well for operator-tier roles (tournament hosts, referees, oracles). Works poorly for retail players — it's user-hostile and the amounts are too small to matter.

**7. Off-chain sybil analytics.** Proven techniques ([Coronium](https://www.coronium.io/blog/sybil-defense-multi-wallet-farming), [thebulldog.law](https://www.thebulldog.law/airdrop-farming-and-sybil-accusations-legal-risks-for-users-and-protocols)):
   - **Funding-graph clustering** — trace 3–5 hops back; N wallets from one CEX withdrawal in a 72h window is a cluster.
   - **Temporal correlation** — 20 actions correlated within a 5-minute window across wallets is near-zero probability for independent users.
   - **Gas/priority-fee fingerprinting** — scripts override wallet-default fee values with identical constants.
   - **Datacenter IP clustering** — LayerZero zeroed clusters sharing single datacenter IPs.
   - Scale of the problem: the **Linea airdrop filtered ~517,000 of 1.3M eligible addresses (~40%) as sybils**.

**8. ZK proofs of gameplay — narrow but real.**
[Argus Labs' Dark Frontier](https://github.com/Argus-Labs/dark-frontier) (Dark Forest lineage) proves a player computed a valid move over hidden state without revealing it. [zkVerify](https://zkverify.io/use-cases/gaming) and Starknet-based "proof of shot" physics verification are the current experiments. **What it proves: the input satisfied the rules. What it does NOT prove: that a human produced it.** A bot generates the identical valid proof. ZK solves *hidden information* and *verifiable computation*, not *humanity*. Also: proving cost is real (cloud provers), and latency is incompatible with real-time genres today.

**9. Proof of personhood — a rate limiter, not a wall.**
World ID, Gitcoin Passport, zkSybil-style credentials ([overview](https://blog.blockxs.com/sybil-resistance-and-onchain-identity-2026/)). Raises sybil cost from ~$0 to the market price of a verified identity. That market exists and clears. Treat PoP as **one weighted signal in a score**, never as a binary gate — and note that requiring it adds a privacy/compliance surface you may not want.

### 5.2 What does not work

| Approach | Why it fails |
|---|---|
| **Blockhash/timestamp/slot randomness** | Leader- and bundler-manipulable. The #1 exploited class of bug in on-chain games. |
| **Client-side anti-cheat with a wallet-signing client** | Any client can be reimplemented; a signature is portable and the chain can't tell which binary produced it. Kernel anti-cheat is also incompatible with a browser/wallet distribution model. |
| **Fully on-chain real-time PvP with public inputs** | Opponents (and MEV bots) read your move from the mempool before it lands. Only works with commit-reveal, which adds a full round-trip of latency. |
| **Wallet-count-weighted rewards or airdrops** | Directly and mechanically rewards sybil. If reward ∝ number of addresses, you have paid people to create addresses. |
| **KYC as the sole sybil defense** | Identity rental markets clear at low prices; adds PII liability, GDPR/CCPA obligations, and conversion friction. |
| **Hardware attestation as a primary control** | Play Integrity / App Attest are useful on mobile-only distribution but have active bypass markets (rooted devices, attestation-spoofing emulators). On desktop/web it's near-useless. SGX-based TEEs have a long side-channel history — Switchboard's SGX use is fine for randomness, not for adversarial identity. |
| **"Reputation scores" as a gate** | Farmable by definition — the farmer just farms reputation first. Useful as a *weight*, useless as a *gate*. |
| **Banning by wallet address** | Address creation is free. Ban the *cost center* (the sunk stake, the paid pass, the verified identity), never the address. |

### 5.3 Recommended stack for a small team
1. **Server-authoritative simulation.** Settle to chain per session, not per action.
2. **Stamina/energy gating** on every reward-bearing loop.
3. **Batched VRF** (one seed per match, deterministically expanded).
4. **Commit-reveal** only where hidden information genuinely matters.
5. **A sunk, non-refundable cost** to enter any reward-bearing mode — priced above expected farm yield.
6. **Off-chain clustering** (funding graph + temporal + IP) run retroactively before any large distribution, with clawback rights in the ToS.
7. **No airdrop, no token.** The cheapest anti-sybil measure is having nothing worth farming.

---

## Summary: the three decisions that determine everything

1. **Do you touch real value?** If no → Tier 0 cosmetic-only design, no token, fiat/USDC revenue. You skip essentially all of §1 and §2 and a ~$500k–$1M/yr compliance floor. If yes → budget for counsel, geolocation, KYC, and a state-by-state geofence before you write gameplay code.
2. **Do you issue a token?** Almost certainly no. "Points → token" is not the safe harbor teams believe it is (§2.2), and 97% of gaming tokens underperformed in 2025. Revenue comes from rake, royalty, and season passes — none of which need a token.
3. **How much goes on chain?** Per-session settlement, not per-action. Sharded state, not a global PDA. cNFTs, not accounts. Batched VRF, not per-roll. Streaming RPC, not polling. Those five choices are worth roughly **10–20× on infrastructure cost** at 10k DAU.
