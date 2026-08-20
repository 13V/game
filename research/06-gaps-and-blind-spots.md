## Missing concepts

**1. Leviathan — cooperative PvE**
*Pitch:* One program-controlled boss with a public HP bar sits on L1 for a week; ten thousand players chip at it asynchronously, damage is a signed transaction, and the loot table is verifiable before anyone swings.
*Why it belonged:* All 21 concepts are zero-sum transfer, which is exactly why all 21 die to extraction and adverse selection — a cooperative-vs-system design is the only shape where money entering is purchase, not predation, and where 40 concurrent players is a raid rather than a dead lobby.

**2. Seedbound — run-based roguelike deckbuilder, single-player**
*Pitch:* A daily Balatro-shaped run whose seed is derived from a slot hash, so every player gets the bit-identical run and the leaderboard is a fair comparison nobody could reroll.
*Why it belonged:* The panel's sharpest observation is that no concept here plays differently on day 100 than day 1; a run-based progression game is the answer, it needs zero opponents to be fun, and the one thing it genuinely needs from Solana — public commitment to a seed and a score before anyone plays — costs a hash.

**3. Odds On — provably-fair gacha / collection**
*Pitch:* A collection game that publishes its drop table onchain and proves every single pull against a VRF, so "the house cannot tune your luck, and here is the receipt" is the product rather than a disclaimer.
*Why it belonged:* Gacha is the largest revenue mechanic in mobile gaming and its defining pathology is opaque rates under active regulatory attack; nobody in the set used verifiable randomness (Switchboard/ORAO) at all, and this is the one genre where the chain fixes a real consumer grievance instead of just escrowing a wager.

**4. Sundial — asynchronous correspondence strategy with clans**
*Pitch:* A 24-hour-per-move turn-based territory war played by clans, chess.com-style: one transaction per move, plain L1, no rollup, no crank, no session keys, no lobby.
*Why it belonged:* Every concept in the set requires synchronous concurrency it has no plan to acquire, and asynchronous play is the only multiplayer structure that is *more* fun with 200 players spread across timezones than with 200 online at once — plus it is the one shape whose entire chain footprint is the obvious cheap primitive the second judge said nobody proposed.

**5. Chisel — UGC with enforced authorship royalties**
*Pitch:* Players author levels, authorship is timestamped onchain, and a Token-2022 transfer hook pays the creator automatically every time someone pays to play theirs — Mario Maker where the credit is not revocable by the publisher.
*Why it belonged:* Content cost is the reason small teams run out of game, authored-content curves are entirely absent from the set, and "the platform cannot delist you or stop paying you" is a durable creator-acquisition pitch that no Web2 UGC platform can make; Copycat gestures at this for build names but never for actual authored content.

**6. Terrarium — cozy idle, mobile-first, Blink-distributed**
*Pitch:* A shared garden with eight neighbors that grows while you are gone, where the only interaction is gifting and watering, and the whole thing installs from a Blink dropped in a feed.
*Why it belonged:* The set has no non-competitive game, no idle/incremental (the genre with the best D30 retention in mobile and near-zero server cost), no audience outside young male competitive players, and no distribution thesis beyond "a link spreads in a chat" — this is one concept that fixes all four, and it is the only one that could plausibly ship to the Solana dApp Store as a normal app.

## Unused primitives worth naming

State compression / cNFTs (collection at fractions of a cent), Token-2022 transfer hooks (enforced creator royalties), VRF (auditable randomness), Solana Attestation Service (used as decoration in two docs, load-bearing in none), Blinks/Actions (distribution *into* existing feeds), and Solana Mobile as a channel. Every one of these is cheap, permanent, and needs no ephemeral rollup.

## The single biggest blind spot

The set asked exactly one question of the chain — "what can it do that a server can't?" — and accepted exactly one answer, "hold money between adversaries," which mechanically forces every concept into zero-sum PvP and hands all 21 the identical death by bots, adverse selection, and 2026 gambling enforcement. Nobody asked the retention question first, which is why there is no progression, no authored content, no PvE, no solo play, and nothing anyone would open on day 30 without a wager attached. The chain's other genuine capabilities — cheap permanent public authorship, verifiable randomness, and unrevocable creator payouts, which make cooperation, collection, and UGC work rather than gambling — went completely unused, so the exercise never tested whether a Solana game can be fun before it is financialized.
