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

## One clock

**A kingdom day is one sunrise to the next: a minute of daylight, a minute of
dark.** Before this the simulation ran a day per second while the sky took ten
minutes to turn, so the two had nothing to do with each other — a player crossed
a whole year before the sun had set once, and testers burned through the game in
minutes. `DAY_SECONDS` is now the only clock: time advances the sky's phase, and
*crossing dawn is what makes a new day happen*. That is why the day's reckoning
— tax, harvest, who arrives, who leaves — lands in the morning. Pausing stops
the sun, because it is the same clock. The speed control multiplies both.

The constants were re-cut for a day that is two minutes rather than one second:
a year is 16 days of four seasons, the folk pay **every** morning (a tax rate's
effect on the mood lands on its own slower beat, so a harsh rate is a slow
pressure rather than a daily slap), a newcomer can arrive each day, and
buildings rise the moment they are paid for — waiting a day to see your first
farm was pacing when a day was a second and is just waiting now.

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
| Mine | 10w 6s 5g | +4 gold/day (1 worker, needs **ore** beside it) |
| Chapel | 6w 8s 4g | +1 happiness every 4 days, per chapel (no worker) |

**A year is four seasons of 30 days, and winter is the test**: farms grow 2 a
day through it instead of 4. Before seasons the game had no tension past the
first week — food climbed forever and a surplus meant nothing, so a competent
player could stop paying attention on day 20. Now the surplus is the only thing
that carries a town through thirty lean days, and the FOOD rate flips red at the
season boundary whether you were watching or not. The advice warns twelve days
out with the number you actually need. Snow covers the island for the duration
(one terrain rebuild, twice a year).

**A merchant sells supplies for gold**, always, at 12 gold for 10 wood or 20 for
10 stone. This closes the worst bug the build has had: gold could only ever
become groats and wood could only ever come from a sawmill, so spending your last
wood on farms was an *unrecoverable dead end the game never mentioned*. A modelled
player sat at 1 wood, 487 gold and 1,037 food for four hundred days, unable to
place a single building, with nothing on screen suggesting anything was wrong.
Trade is deliberately worse than a sawmill (3 gold buys 2.5 wood; a sawmill cuts
2 a day for free), so it rescues rather than replaces — and it gives gold a
second job, which makes spending it a real choice against saving for groats.

**Each year's end pays** 10 + 2 per villager in groats, celebrated, which is what
gives a run its shape.

**Festivals** are the one active spend: 20 gold buys +3 happiness, once every 10
days. Chapels and festivals together are what make a Harsh tax a strategy rather
than a slow loss — Harsh costs 2 happiness per 10 days, and one chapel returns
2.5 over the same stretch. Ore terrain existed as decoration until the mine gave
it a use; the quarry still takes rock *or* ore, but only a mine can work a seam.

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

`build.mjs` fails the build on duplicate top-level names. `sim.js` and `game.js`
are concatenated into **one module scope**, so a name declared in both is a hard
`SyntaxError` and a blank page — and `verify.mjs` cannot catch it, because there
the two are separate modules. A colour helper called `mix` shipped exactly that
way once.

`SimpleSim` intentionally diverges from the consensus `runSeason`/`LiveSim`
rules — it is tuned for clarity in the browser. The Rust core in
`crates/st-sim` remains the reference for the future on-chain season game.

## Events

Every few days something happens to the kingdom rather than because of it,
picked deterministically from the day so a valley plays the same way twice. The
ones worth having are the ones that ask a question — a pedlar's cart of timber
for gold, a family on the road wanting beds and food, riders on the ridge who
will take gold or take a barn — because a choice with a cost is the only kind
that is interesting. They sit in the right rail for two days and then the moment
passes. The rest is weather: a golden harvest, a hard frost, blight, a storm.

Half the table gates on conditions a settled town rarely meets, so the eligible
pool can shrink to a handful; the picker refuses the last three ids it used,
because a plain hash over a small pool serves the same event twice running and
that reads as a bug rather than as luck.

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

## On a phone

A phone is not a small desktop, so it does not get a shrunken one. The map keeps
the screen; the two rails become sheets that slide up over it from a tab bar,
and **one line above the tabs carries whichever of the next goal or the standing
warning matters more** — a warning always wins, because it is the one that costs
you a kingdom. Play and speed float over the map bottom-right rather than living
in the status strip, because that strip scrolls sideways and the one control
that must always be under a thumb cannot be somewhere you have to scroll to.
They fade out while a sheet is up.

One finger pans, two pinch. The offscreen layers drop from 2× to 1.5× on small
screens — they are the largest allocation in the page by far and the least
noticeable on a small display.

Two traps worth writing down, both found the hard way:

- **Headless Chromium has a minimum window width of about 500px**, so
  `--window-size=390,844` silently renders at 500 and a phone layout looks fine
  when it is not. Load the page in a 390-wide `<iframe>` instead (with
  `--allow-file-access-from-files` if you want to script it).
- **`--virtual-time-budget` does not advance CSS transitions**, so a sheet that
  slides open appears stuck shut and reads as a broken layout. Inject
  `transition: none` before screenshotting.

Every flex child in those sheets needs `min-width: 0` or `flex: none`. A
`flex: 1` child with `min-height: 0` inside an auto-height sheet collapses to
nothing, and a long line of text in a flex row refuses to shrink and shoves the
whole bar wider than the phone. Both happened.

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

## Weather

Decided at dawn with the rest of the day, from the day itself, so a valley gets
the same weather every time it is played. Rain and thunderstorms in the green
months, snowfall in winter. **Rain waters the fields** — a farm grows one extra
that day — which is why the status bar names the weather: the FOOD rate changing
for no visible reason is worse than no weather at all.

Rain and snow are screen-space particles, because they are between the viewer
and the diorama and must not pan or scale with it. Every drop goes into **one
path and one stroke call**, which is what keeps a downpour affordable now that
the island itself is a single cached blit. The gloom rides the same ambient
multiply the hour does — one pass darkens sky and island together — and a
lightning strike briefly inverts it, brightening the same multiply rather than
painting a separate white sheet over everything.

`#wx=rain|storm|snow` pins the weather and `#bolt` pins a strike at full
intensity, because a full-screen flash is exactly the kind of effect that is
impossible to judge by catching it at random.

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
