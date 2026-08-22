// DELVE — the room library.
//
// Every room here was drawn by hand for a stated reason, and then MEASURED.
// That second half matters more than it sounds. The first ten rooms drawn for
// this game looked handsome and were, by instrument, worse than scattering
// blocks at random: seven of the ten bent the player's walk not at all, every
// single one left a spitter a clear seven-tile lane, and the safest tile in the
// average room could still be seen from four others — meaning there was nowhere
// in any of them to actually hide.
//
// So the library is drawn against four rules, and `npm run rooms` checks them:
//
//   ROUTE      The walk in, to the loot, and out again must be at least 1.3x
//              longer than the straight line. Loot on the spawn-to-stair axis is
//              loot that costs nothing to take.
//   NOOK       At least one tile the room can barely see — a two-deep dead end,
//              a bend, a pocket. Somewhere worth retreating to.
//   LANE       Most rooms must break every clear row and column, so that a
//              spitter is denied. The ones that do not are deliberate shooting
//              galleries, and they should feel like it.
//   SPREAD     Exposed tiles and sheltered tiles in the same room. A room where
//              every square is equally dangerous has no places in it, only space.
//
// Nine by nine, border included: nine strings of nine characters.
//
//   #  pillar      blocks movement and sight
//   :  rubble      blocks movement and sight, low — this is COVER, not grass
//   _  gap          no floor at all. Blocks feet, blocks nothing else — you can
//                   see and be shot straight across it. Cutting gaps into the
//                   edge is how a room gets a SILHOUETTE instead of being one
//                   more filled square with furniture on it.
//   .  floor
//   ?  maybe        floor most visits, fallen stone the rest. Sixteen rooms is
//                   fewer than it sounds, and a player spots a repeat faster
//                   than anyone expects; this furnishes the same room
//                   differently each time. It can never seal a room off — the
//                   checker validates with EVERY ? turned to stone.
//   @  you wake here
//   >  the stair down
//   ^  where the way out appears (plain floor on odd floors)
//   e  an enemy may stand here
//   E  a heavy may stand here — sentinels are placed here first
//   *  a relic may lie here
//
// Slots are possibilities, not guarantees. The room says where a thing CAN be;
// the depth says how many of those places get used. That is encounter design.

export const LEGEND = { '#': 'wall', ':': 'rubble', '_': 'gap', '.': 'floor', '?': 'maybe', '@': 'spawn', '>': 'stair', '^': 'exit', e: 'foe', E: 'heavy', '*': 'relic' };

export const ROOMS = [
  {
    id: 'larder',
    name: 'The Larder',
    // Four dead-end cells off one spine. Every cell is a decision: three turns
    // in and three turns back out, with whatever followed you waiting at the
    // mouth. The far cell holds the better relic and the worse idea.
    cells: [
      '__#######',
      '_@.:::>.#',
      '#._.#._e#',
      '#.*.:.*.#',
      '#.#_###.#',
      '#e:.E..E#',
      '#.#.#e#.#',
      '#^..e:e>_',
      '#######__',
    ],
  },
  {
    id: 'vault',
    name: 'The Vault',
    // One door, one relic, one heavy standing in the doorway. The whole room is
    // the question of whether the thing in the box is worth the turns it costs
    // to go in and come back out again.
    cells: [
      '#######__',
      '#@..:?>e_',
      '#._..?#.#',
      '#._#_##e#',
      '#e?#*#?.#',
      '#..#.#.E#',
      '#:...e.:#',
      '_^.e:?e>#',
      '__#######',
    ],
  },
  {
    id: 'split',
    name: 'The Split',
    // A walled chamber with the loot in it and a single mouth, wrapped in a
    // ring corridor. You can walk straight past to the stair and take nothing.
    // Almost nobody does.
    cells: [
      '__#####__',
      '_@?:>.e._',
      '#._#_#_e#',
      '#.#*?_e.#',
      '#.#..#:E#',
      '#.##.#..#',
      '#..e.?E:#',
      '_^?:.e*>_',
      '__#####__',
    ],
  },
  {
    id: 'crossing',
    name: 'The Crossing',
    // Four solid quarters, four spurs, one small hub. The hub is the only way
    // between any two arms, so it is at once the fastest route across the room
    // and the tile every arm can see into. Nothing about that is accidental.
    cells: [
      '#########',
      '#@._#e.>#',
      '#?._#.?:#',
      '#_.....##',
      '#*.:E?.e#',
      '#_.?:.e##',
      '#:.##e.e#',
      '_^>##?e*#',
      '__#######',
    ],
  },
  {
    id: 'rubblefield',
    name: 'The Rubble Field',
    // A lattice of fallen stone. Almost no long line survives it, so a spitter
    // is nearly furniture here and a husk is at its best — the room plays
    // completely differently depending on what walked into it.
    //
    // Drawn twice: the first version forgot that rubble stops feet as well as
    // eyes and walled off twenty-two tiles. Cover is a short wall, not grass.
    cells: [
      '###___#__',
      '#@.:>:.e_',
      '#:.....:#',
      '#?:.*.:e#',
      '#.?::.e.#',
      '#.:..e.E#',
      '#e?:.:.:#',
      '#^..*:e>_',
      '#######__',
    ],
  },
  {
    id: 'gauntlet',
    name: 'The Gauntlet',
    // The stair is eight tiles away and the walk is nineteen. Every bend has an
    // alcove beside it, and something is usually standing in one.
    cells: [
      '__#######',
      '_@..>.e.#',
      '#_#_#_#.#',
      '#..*..e.#',
      '#._#_#_##',
      '#...E.e*#',
      '#_#_#_#e#',
      '#^..e.e>#',
      '###___###',
    ],
  },
  {
    id: 'twohalls',
    name: 'The Two Halls',
    // A spine of fallen stone splits the room into halls joined only at the top
    // and the bottom. Everything you can see, you cannot quickly reach.
    // Committing to a side is the room, and the relic is on one of them.
    cells: [
      '__#######',
      '_@:?>..e#',
      '#.:##:?.#',
      '#..#:.?e#',
      '#e?#?.*.#',
      '#.?#:e:.#',
      '#E:##:.e#',
      '_^...E*>#',
      '__#######',
    ],
  },
  {
    id: 'comb',
    name: 'The Bone Comb',
    // Teeth running north to south with the spine at the middle. Nearly every
    // tile in here is a chokepoint, so nearly every tile is worth denying — and
    // a sentinel planted in a tooth simply has to be gone through.
    cells: [
      '#########',
      '#@_e#._*#',
      '#.#>_.#E#',
      '_._.#._.#',
      '_......e#',
      '_.#._e#.#',
      '#._.#._e#',
      '#^#E_e#>_',
      '#######__',
    ],
  },
  {
    id: 'antechamber',
    name: 'The Antechamber',
    // A quiet room. Not every floor should be a fight: a run with no breath in
    // it is exhausting rather than tense, and the calm is what makes the next
    // room land. One relic, one wanderer, and a long look at the stair.
    cells: [
      '__#######',
      '_@:?>..e#',
      '#.::.::.#',
      '#.:?..:e#',
      '#.:.*?:.#',
      '#.:?.e:e#',
      '#.::.::.#',
      '#^E.e:e>_',
      '#######__',
    ],
  },
  {
    id: 'pincer',
    name: 'The Pincer',
    // Two mouths into one middle. Whatever waits in the middle can be reached
    // from either side — and so can you. The room is a bet on which way they
    // come, made before you can see the answer.
    cells: [
      '#######__',
      '#@?_#_>e_',
      '#.?#*_?.#',
      '#.:#._:.#',
      '#E...e.E#',
      '#.:#._:.#',
      '#.?#*_.e#',
      '_^e###e>#',
      '__#######',
    ],
  },
  {
    id: 'spiral',
    name: 'The Spiral',
    // One path, wound. You can see the relic from the moment you arrive and it
    // takes fourteen turns to reach — the longest walk in the game past a wall
    // you cannot climb, with the whole room watching.
    cells: [
      '__#####__',
      '_@..>..._',
      '#._#_#_e#',
      '#.#*.?_.#',
      '#.#._#_e#',
      '#.#E..e:#',
      '#._#_.#e#',
      '_^..e.e>_',
      '__#####__',
    ],
  },
  {
    id: 'ledges',
    name: 'The Ledges',
    // Three stepped shelves with a gap in each, staggered so that no two are in
    // line. Crossing is always a diagonal, which in a game with no diagonals
    // means two turns in the open, every time.
    cells: [
      '#########',
      '#@..>..e#',
      '#_#_#._##',
      '#..*...e#',
      '#_#._#_##',
      '#E......#',
      '#_#_#e_##',
      '_^.e*.e>#',
      '__#######',
    ],
  },
  {
    id: 'well',
    name: 'The Well',
    // A ring around a solid core. Everything happens on the rim, and there is
    // always exactly one shorter way round and one longer — the entire room is
    // that one choice, made at the top with too little information.
    cells: [
      '###___#__',
      '#@:?>..e_',
      '#._#_#_.#',
      '#.#*?_:e#',
      '#.#.E_e.#',
      '#.#?._?e#',
      '#.#_e##.#',
      '#^..*.e>_',
      '#######__',
    ],
  },
  {
    id: 'shooting',
    name: 'The Long Gallery',
    // A deliberate shooting gallery: two clear lanes the length of the room and
    // very little to stand behind. This one is SUPPOSED to be a spitter's
    // paradise — a library where every room denies the spitter has not made the
    // spitter interesting, it has retired it.
    cells: [
      '__#######',
      '_@..>?.e#',
      '#.:?..:.#',
      '#?..?...#',
      '#*..E.?e#',
      '#...?.e.#',
      '#.:...:e#',
      '#^e___e>#',
      '###___###',
    ],
  },
  {
    id: 'cells',
    name: 'The Cells',
    // Six small chambers off a corridor, each with one doorway. Whatever is in
    // a chamber has to be gone in after, and whatever is in the corridor sees
    // every doorway at once.
    cells: [
      '__#######',
      '_@_*#e_.#',
      '#.:>....#',
      '#.#._.#.#',
      '#*_E#._e#',
      '#...:.e.#',
      '#.#._.#e#',
      '_^_e#E#>#',
      '__#######',
    ],
  },
  {
    id: 'causeway',
    name: 'The Causeway',
    // A narrow bridge across the middle of the room with open ground either
    // side. Anything on the bridge is exposed from both flanks; anything off it
    // is taking the long way round. There is no third option.
    cells: [
      '#########',
      '#@..:>.e#',
      '#.:..?:.#',
      '_..###..#',
      '_*..E??*#',
      '_..###e.#',
      '#.:..e:e#',
      '#^e...e>_',
      '#######__',
    ],
  },
];
