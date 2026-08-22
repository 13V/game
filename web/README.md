# web — the playable STEADING client

A single-file browser build of the game: plan a kingdom on a floating voxel
island, run the deterministic 240-day season, mint groats, build the empire.

| File | What it is |
| --- | --- |
| `sim.js` | JavaScript port of `crates/st-sim`. Same integer semantics (`Math.imul`, `>>>0`, floor division); same rules, same numbers. |
| `verify.mjs` | The parity harness. Replays every vector the Rust test suite pins — the worked example, the reference town, the crown tests, and byte-for-byte terrain distributions for eight seeds. `node web/verify.mjs` must print ALL PARITY CHECKS PASS before any release. |
| `game.js` | Renderer and app: canvas isometric terrain with an offscreen cache, painter's-algorithm sprites, picking, planning, decrees, playback, the empire layer. |
| `index.template.html` | Page shell: markup, styles, and the `{{SIM}}`/`{{GAME}}` inline slots. |
| `build.mjs` | Inlines the two modules into `steading-season-zero.html`, the single file that ships. |

## Debug fragments

`#v=<name>` picks a valley by seed string; `#demo` seeds a starter hamlet and
runs the season (add `plain` to skip the results overlay); `#z=<f>` zooms, with
`t=<x>,<y>` to centre a tile; `#empire` opens the empire panel. Used by the
headless-chromium screenshot checks.

## The empire and the token

Completed seasons mint groats — one per export above the valley's settled best,
plus a first-completion treasury conversion at 10 coin per groat. Groats buy
charters: permanent start-condition upgrades applied through `runSeason`'s
opts (defaults untouched, so parity vectors still bind). Balances persist in
localStorage. The groat-to-token swap on Solana is the next milestone per
`research/14-spec-steading.md`; the page says so plainly rather than faking a
transaction, because a published artifact has no network egress by design.
