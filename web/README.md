# web — the playable STEADING client

A single-file browser build of the game: a live city-builder on a floating
voxel island. Time flows a day per second; you place buildings and the folk
answer. The loop in one breath: **supplies build buildings · farms feed folk ·
houses grow the town · folk pay tax · gold swaps to groats.**

| File | What it is |
| --- | --- |
| `sim.js` | JavaScript port of `crates/st-sim`: the valley generator and the consensus-exact `runSeason` path (same integer semantics — `Math.imul`, `>>>0`, floor division), plus `LiveSim`, the incremental variant. The browser game only uses the valley generator from here. |
| `verify.mjs` | The parity harness. Replays every vector the Rust test suite pins — the worked example, the reference town, the crown tests, and byte-for-byte terrain distributions for eight seeds. `node web/verify.mjs` must print ALL PARITY CHECKS PASS before any release. |
| `game.js` | The game: `SimpleSim` (the deliberately small live ruleset below), the canvas isometric renderer with an offscreen terrain cache, the voxel sprite kit (below), picking, objectives, and the empire layer. |
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
an idle start starves out around day 14; a two-farm hamlet that keeps sowing
farms grows and banks gold indefinitely. **Quick start** founds two farms and a
sawmill for exactly that reason — one farm feeding four folk only breaks even,
and a button meant to rescue a lost player must not hand them a famine.

`SimpleSim` intentionally diverges from the consensus `runSeason`/`LiveSim`
rules — it is tuned for clarity in the browser. The Rust core in
`crates/st-sim` remains the reference for the future on-chain season game.

## The reward loop

Nothing in the game is learned for free: the teaching ladder and the reward
ladder are the same ladder.

- **Quests pay.** Each of the ten quests in the left rail pays ⟡ groats on
  completion (8 → 35, escalating), and past the tenth `endlessQuest()` generates
  another every ten folk, so the chase never runs out. `claimed` lives in the
  save, so a quest pays once per valley and reloading cannot farm it.
- **Settlement ranks pay more.** Camp → Hamlet → Village → Town → City →
  Kingdom, at 6/10/16/24/34 folk, worth 10 → 120 ⟡. Rank is taken from
  `peakPop`, the high-water mark, so a famine costs you villagers but never a
  title you already won. The badge and its progress bar sit at the head of the
  status bar.
- **The town shows its work.** Every staffed building lifts its yield off its
  own roof each day (`+4` over a farm, `+2` over a sawmill); tax day throws a
  spray of gold over the town and a `+N gold` float. All of it is drawn in
  screen space after the camera transform so the text stays legible at any zoom,
  and it is suppressed above 3× speed where it would be a blizzard.
- **Losing still banks something.** The fallen screen reports the rank reached,
  the peak population, and the groats earned — which are kept, because groats
  are empire-wide and charters are bought with them.

`checkRewards()` is the single gate: it runs once per simulated day and once per
action that could complete something (placing, demolishing, swapping, loading).
Debug fragments fabricate kingdoms, so `state.quiet` lets them advance a rank
for display without ever minting a groat — `#party` is the one exception, and
exists to photograph the effects.

## Reading the screen

The interface answers three questions in three fixed places, and nothing has to
be looked up anywhere else:

- **What do I have?** The status bar carries all five supplies with today's
  **rate** beside each — `FOOD 30 −4/day` in red is the whole famine rule made
  visible before it happens. `rates()` mirrors the production step of
  `stepDay()` exactly and must be kept in step with it. Food never shows a blank
  rate: breaking even is its own warning, since one more mouth tips it negative.
- **What is going on?** `advice()` names the single most urgent problem in one
  sentence and says what to do about it, in the order the problems kill you:
  no farm → food falling → idle buildings → unhappiness → no beds → no wood.
  It surfaces the one rule with no other visible sign, that a building with
  nobody to staff it produces nothing.
- **What do I do next?** One goal at a time in the left rail, with a progress
  bar on the numeric ones and the two after it greyed below.

Build cards carry the effect and the price inline — the same icons as the
status bar, turning red on the resource you are short of — so a price is never
a letter code to decode. Keys `1`–`5` pick a building, `X` demolishes, space
runs and stops the days.

## Day and night

A simulated day is one second at 1x, far too fast to light a world by, so the
sky keeps its own clock and ignores the speed control entirely: **five minutes
of daylight, five minutes of night**, always. It runs whether or not the days
are running, so a paused kingdom still sits somewhere in an afternoon. `phase`
is 0 at sunrise, 0.25 at noon, 0.5 at sunset, 0.75 at midnight — the sun owns
the first half of the cycle and the moon the second, half an arc each. Ten
minutes of sky is far too slow to redraw every frame, so the phase is bucketed
and a repaint happens only when it has visibly moved.

The whole of night is **one multiply pass over the finished frame**. `AMBIENT`
is a colour ramp keyed on phase; white leaves midday untouched and every other
hour is that colour darkening and tinting sky and island together, which is what
dusk actually does to a landscape. Only the things that make their own light —
stars, moon, sun, the windows — are painted after it, and so stay bright against
it. That is also why the buildable-ground overlay is drawn on the far side of
the pass: it is the one overlay you build by, and nightfall must not hide it.

Sun and moon are voxels like everything else — one cube each, gold and pale.
**A box N tiles wide is not a cube at N units of z**: a tile spans `TW = 22`
across but a height unit is only `HZ = 6` tall, so the same number in both makes
a squashed slab. `ZC = TH / HZ` is the conversion, and `vcube()` is the only
correct way to draw one; anything in the sky should use it.

They ride one shallow arc high over the island (`ARC_X`/`ARC_Y`/`ARC_CY`) rather
than a horizon-to-horizon one, because a floating island has no horizon and they
belong in the sky, not beside the land. `SKY_ROOM` is a band of empty world above
the island that exists solely so the arc has somewhere to be: without it the
highest peak reaches the top of the canvas and the sun has nowhere to go but on
it. Both bodies are world-anchored, so a clearance that holds at one zoom holds
at every zoom, which is what lets them be drawn safely over the finished frame.

At night every building lights up: warm squares in the walls either side of the
door, a lantern on a post at the corner of a farm, a brazier still burning on a
quarry cut, and a pool of lamplight on the ground under each. Lamps are culled
against the viewport — each glow is a fresh gradient, and a 200-building kingdom
should not pay for the ones nobody can see.

## The voxel sprite kit

Everything on the island is composed from isometric cuboids on one shared voxel
grid, so buildings carry real volume instead of reading as flat sprites. `vpt()`
projects a local voxel coordinate; `vbox()` paints one cuboid's three visible
faces (left `+y`, right `+x`, then the top) at fixed shading factors so the whole
island shares a single light direction; `vshadow()` drops a soft contact ellipse.

Local sprite coordinates are **tile units measured from the tile centre** — a
full tile spans `-0.5..0.5` in x and y — and `z` counts terrain height units
(`HZ` px each). That keeps sprites resolution-independent: they stay correct at
every zoom without a second set of numbers.

`vhouse()` is the shared building shell: a stone footing course, a plaster body,
timber corner posts and a mid rail, a recessed door, and a stepped gable roof
whose courses narrow in `y` as they rise, so the roof reads as rows of thatch.
The five buildings are that shell plus a distinguishing prop — the market takes
an orange roof, a pale awning and a pennant; the sawmill a brown roof and a
stack of cut timber on its near side; the quarry skips the shell entirely for a
terraced cut and dressed blocks; the farm is a raised soil bed with timber
edging and rows of standing crop voxels. Trees are a trunk plus a cube canopy
capped by a smaller cube.

## Debug fragments

`#v=<name>` picks a valley by seed string; `#demo&d=<days>` seeds a starter
hamlet, steps that many days, pauses, and centres the camera on the hamlet;
`#sprites` raises one of every building side by side and zooms in, for art
review; `#plain` skips the first-visit guide, `#guide` forces it open; `#z=<f>` zooms, with `t=<x>,<y>` to
centre a tile; `#hour=<0..1>` pins the sky at one moment and freezes it (0 dawn, 0.25 noon, 0.55 dusk, 0.8 midnight); an explicit `#z=` stops `#demo` zooming in, so the whole island and the sky over it can be photographed together; `#empire` opens the empire panel; `#party` re-enables rewards and effects under `#demo`, which are otherwise suppressed. Used by the headless-chromium
screenshot checks.

## The empire and the token

Gold swaps to groats in the Empire panel (50 gold → 5 ⟡). Groats persist in
localStorage across valleys and buy charters: permanent start-condition
bonuses for every later settlement. The groat-to-token swap on Solana is the
next milestone per `research/14-spec-steading.md`; the page says so plainly
rather than faking a transaction, because a published artifact has no network
egress by design.
