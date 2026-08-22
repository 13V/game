# web — the playable STEADING client

A single-file browser build of the game: a live city-builder on a floating
voxel island. Time flows a day per second; you place buildings and the folk
answer. The loop in one breath: **supplies build buildings · farms feed folk ·
houses grow the town · folk pay tax · gold swaps to groats.**

| File | What it is |
| --- | --- |
| `sim.js` | JavaScript port of `crates/st-sim`: the valley generator and the consensus-exact `runSeason` path (same integer semantics — `Math.imul`, `>>>0`, floor division), plus `LiveSim`, the incremental variant. The browser game only uses the valley generator from here. |
| `verify.mjs` | The parity harness. Replays every vector the Rust test suite pins — the worked example, the reference town, the crown tests, and byte-for-byte terrain distributions for eight seeds. `node web/verify.mjs` must print ALL PARITY CHECKS PASS before any release. |
| `game.js` | The game: `SimpleSim` (the deliberately small live ruleset below), the canvas isometric renderer with an offscreen terrain cache, picking, objectives, and the empire layer. |
| `index.template.html` | Page shell: markup, styles, and the `{{SIM}}`/`{{GAME}}` inline slots. |
| `build.mjs` | Inlines the two modules into `steading-season-zero.html`, the single file that ships. |

## SimpleSim — the whole rulebook

Four supplies: **food, wood, stone, gold**. Five buildings, paid on placement,
one raised per day in placement order:

| Building | Cost | Does |
| --- | --- | --- |
| Farm | 3w | +4 food/day (1 worker) |
| House | 4w | +4 beds |
| Sawmill | 5w 2g | +2 wood/day (1 worker, needs forest beside it) |
| Quarry | 8w 3g | +2 stone/day (1 worker, needs rock beside it) |
| Market | 12w 10s 6g | +3 gold/day (1 worker) |

Each day the folk eat 1 food each; an empty pantry means hunger, unhappiness,
and a starvation every second hungry day. Every 10th day each folk pays the
tax rate (Low 0 / Fair 1 / Harsh 2 gold); Low cheers them, Harsh sours them,
and at rock-bottom happiness a family leaves. Fed folk with a free bed move in
every third day. Workers staff buildings in placement order, so more houses →
more folk → more staffed buildings and more tax. That's everything.

Balance scenarios live in the session scratchpad test (`simtest.mjs` pattern):
an idle start starves out around day 14; a farm-house-sawmill hamlet that keeps
sowing farms grows and banks gold indefinitely.

`SimpleSim` intentionally diverges from the consensus `runSeason`/`LiveSim`
rules — it is tuned for clarity in the browser. The Rust core in
`crates/st-sim` remains the reference for the future on-chain season game.

## Debug fragments

`#v=<name>` picks a valley by seed string; `#demo&d=<days>` seeds a starter
hamlet, steps that many days, pauses, and centres the camera on the hamlet;
`#plain` skips the first-visit help; `#z=<f>` zooms, with `t=<x>,<y>` to centre
a tile; `#empire` opens the empire panel. Used by the headless-chromium
screenshot checks.

## The empire and the token

Gold swaps to groats in the Empire panel (50 gold → 5 ⟡). Groats persist in
localStorage across valleys and buy charters: permanent start-condition
bonuses for every later settlement. The groat-to-token swap on Solana is the
next milestone per `research/14-spec-steading.md`; the page says so plainly
rather than faking a transaction, because a published artifact has no network
egress by design.
