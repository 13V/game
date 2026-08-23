// DELVE — the drawn rooms.
//
// Sixteen floors, laid out by hand, at eleven by eleven. Nine by nine was one
// screen and forty-nine tiles you could stand on; this is eighty-one, which is
// two thirds more floor for the same one screen.
//
// LEGEND
//   .  floor      #  pillar      :  rubble      _  gap (nothing — you fall)
//   ?  maybe-rubble: stone here on some floors and not on others
//   @  where you wake      ^  the way out       >  a way down (exactly two)
//   e  a place a light foe may stand           E  a place a heavy may stand
//   *  a place a relic may lie
//
// Rubble is not scenery: you cannot walk it and nothing can see through it, so
// a single ':' dropped on a one-tile corridor cuts the room in half. Eight of
// these sixteen were drawn that way on the first pass and the validator caught
// every one. Every room is checked in all eight orientations with every '?'
// turned to stone, which is the worst case for everything except the '?'
// itself — so a '?' that stays floor also has to hang off something solid.

export const LEGEND = { '#': 'wall', ':': 'rubble', '_': 'gap', '.': 'floor', '?': 'maybe', '@': 'spawn', '>': 'stair', '^': 'exit', e: 'foe', E: 'heavy', '*': 'relic' };

export const ROOMS = [
  {
    id: 'larder',
    name: 'The Larder',
    // Four dead-end cells off one run. Every cell is a decision: three turns in and
    // three turns back out, with whatever followed you waiting at the mouth. The far
    // cells hold the better relics and the worse idea.
    cells: [
      '__#########',
      '_>.?###?>e#',
      '#.###@###.#',
      '#.*#?.##*.#',
      '#.#^#.#.#.#',
      '#.........#',
      '#.###.###.#',
      '#e:#E.##E.#',
      '#.#.#.#.#.#',
      '#.e.?#...e#',
      '#########__',
    ],
  },
  {
    id: 'vault',
    name: 'The Vault',
    // One door, one hoard, and a heavy standing in the doorway. The whole room is the
    // question of whether the thing in the box is worth the turns it costs to walk in
    // and walk back out again.
    cells: [
      '#########__',
      '#.@...>..e_',
      '######?#?.#',
      '#.#**#?#..#',
      '#>#*E#^.?.#',
      '#.........#',
      '#####.###.#',
      '#e#...:..E#',
      '#.#.####..#',
      '#...:e..e.#',
      '#########__',
    ],
  },
  {
    id: 'split',
    name: 'The Split',
    // Two ways across. The short one runs a spitter's lane the whole width; the long
    // one costs six extra turns and never shows you to anything.
    cells: [
      '__#######__',
      '_..@...>.e_',
      '#.#######.#',
      '#>#e??.E#.#',
      '#.#.###.#.#',
      '#.?.......#',
      '#.#.###.#e#',
      '#^#*.?:*#.#',
      '#.#######.#',
      '#..##.e..e#',
      '#########__',
    ],
  },
  {
    id: 'crossing',
    name: 'The Crossing',
    // An X of open ground with the middle bitten out. Everything can see everything
    // here except across the hole, and the hole is where the loot sits.
    cells: [
      '#####__####',
      '#.#.@...>e#',
      '#>##?.?##.#',
      '#..._e_#..#',
      '#?._____.:#',
      '##......^##',
      '#:._*_e_.?#',
      '#..#___#*.#',
      '#.##E..##.#',
      '#e..:....e#',
      '####__#####',
    ],
  },
  {
    id: 'rubblefield',
    name: 'The Rubblefield',
    // Open ground, and none of it clear. Nothing here has a straight line longer than
    // five, which makes the spitters nearly harmless and the shamblers much worse.
    cells: [
      '#########__',
      '#@#:.>:.#e#',
      '#..?#.?...#',
      '#:.#..#:#>#',
      '#..:*?#.#.#',
      '#.#.^#...*#',
      '#..?E?.#.##',
      '#?.....?e.#',
      '#e.?#.?##.#',
      '#..?..e:.e#',
      '__#########',
    ],
  },
  {
    id: 'gauntlet',
    name: 'The Gauntlet',
    // One long hall with cover down both sides. You can cross it fast in the open or
    // slowly behind the stones, and the heavies are placed so that fast is a mistake.
    cells: [
      '__#######__',
      '_...@...>e_',
      '#?#.#:#?#?#',
      '##>.......#',
      '#?#:#?#.#:#',
      '#....E...e#',
      '#:#.#?#:#?#',
      '#..^*.*...#',
      '#?#?#:#.#?#',
      '#e...e...e#',
      '__#######__',
    ],
  },
  {
    id: 'twohalls',
    name: 'Two Halls',
    // Two parallel runs joined only at the ends. Whichever one you take, whatever is
    // in the other reaches the far door at the same time you do.
    cells: [
      '###########',
      '#...@...>e#',
      '#>#########',
      '#e......??#',
      '#.#######e#',
      '#.....^...#',
      '#########.#',
      '#??..*...E#',
      '#.#######.#',
      '#e..*...e.#',
      '###########',
    ],
  },
  {
    id: 'comb',
    name: 'The Comb',
    // Teeth. You cannot walk two tiles in a line anywhere in the middle of this room,
    // so anything that charges you arrives late and out of position.
    cells: [
      '#########__',
      '#.#?@.#.>e_',
      '#>#?#.###.#',
      '#.#.?.##*.#',
      '#.#.#.#.#.#',
      '#e#...#...#',
      '#.###.###e#',
      '#.*#..?#..#',
      '#.#.#.#^#.#',
      '#.e...e..E#',
      '__#########',
    ],
  },
  {
    id: 'antechamber',
    name: 'The Antechamber',
    // A small room you must cross before the big one, with the only cover in the small
    // one. What you meet in the hall you have to meet standing in the open.
    cells: [
      '__#########',
      '_@.#?>...e#',
      '#.:?#.#.#.#',
      '#...#.##?^#',
      '###.#####e#',
      '#>.....e..#',
      '#.###*#####',
      '#E.#?.:#.*#',
      '#.#####.#.#',
      '#....e..e.#',
      '#########__',
    ],
  },
  {
    id: 'pincer',
    name: 'The Pincer',
    // Two mouths onto one floor, and they open at opposite corners. Anything that
    // wakes up in here has two ways to reach you and you have one way out.
    cells: [
      '__##___####',
      '_.@._____e#',
      '#.?#####?>#',
      '#.#*>..*#.#',
      '#.#?###.#.#',
      '#..?......#',
      '#.#####.#e#',
      '#.#E^..e#.#',
      '#..#####..#',
      '#.....e..e#',
      '#########__',
    ],
  },
  {
    id: 'spiral',
    name: 'The Spiral',
    // One route, wound in on itself. There is nothing to decide here except how fast
    // to walk it, which makes it the room where a wind-up is worst.
    cells: [
      '###########',
      '#..@...>..#',
      '#.#######*#',
      '#>#e??..#.#',
      '#.#.###.#.#',
      '#.?.#*#..e#',
      '#.#.#.#.###',
      '#.#...E.#?#',
      '#.#######.#',
      '#e...e.^.e#',
      '###########',
    ],
  },
  {
    id: 'ledges',
    name: 'The Ledges',
    // Half the floor is missing. Nothing can walk the holes and everything can shoot
    // across them, so cover and route pull in opposite directions here.
    cells: [
      '#___#####__',
      '_>.##@...e_',
      '#.?_____?>#',
      '#.?_?##_..#',
      '#.#..*#.#.#',
      '#...##...^#',
      '#e#..E..#e#',
      '#:._###_..#',
      '#.._____..#',
      '#e..*....e#',
      '__#####___#',
    ],
  },
  {
    id: 'well',
    name: 'The Well',
    // A pit in the middle of the floor with the good stone on its lip. Everything in
    // this room can see you across the hole and nothing can follow you round it.
    cells: [
      '#########__',
      '#>####@..e#',
      '#.#######>#',
      '#.#*?..*#.#',
      '#.#._?_.#.#',
      '#.?.?_^...#',
      '#e#._._.#.#',
      '#.#e...E#.#',
      '#.#######.#',
      '#e.......e#',
      '__#########',
    ],
  },
  {
    id: 'shooting',
    name: 'The Shooting Gallery',
    // Long clean lines both ways, and the only cover is the pillars you would have to
    // stop behind. This is the room the spitters were written for.
    cells: [
      '__#######__',
      '_.#@..#>#e_',
      '#.???.?...#',
      '#>.##..#..#',
      '#.#.##..#.#',
      '#.#.#*...e#',
      '#....##e#.#',
      '#..#.^.#..#',
      '#E...*...e#',
      '#......e..#',
      '__#######__',
    ],
  },
  {
    id: 'cells',
    name: 'The Cells',
    // Nine little rooms with one door each. Everything here is a corner, and every
    // corner is somewhere a heavy can pin you against.
    cells: [
      '###########',
      '#@.#e#>#..#',
      '#..#...#.?#',
      '#.##.###e.#',
      '#.>..#.#?.#',
      '###?...?#e#',
      '##...##e..#',
      '#.##.###.##',
      '#*^#E..#.*#',
      '##...#.e..#',
      '###########',
    ],
  },
  {
    id: 'causeway',
    name: 'The Causeway',
    // A neck of stone over open air, with the room's whole width on either side of it.
    // Crossing is four turns during which there is nowhere at all to stand aside.
    cells: [
      '__#######__',
      '_..@?..>.e_',
      '#.?...??..#',
      '#____.____#',
      '#____.____#',
      '#..^....e>#',
      '#____e____#',
      '#____.____#',
      '#..*...*.E#',
      '#e...e....#',
      '__#######__',
    ],
  },
];
