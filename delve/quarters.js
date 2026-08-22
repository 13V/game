// DELVE — the quarter library.
//
// Sixteen hand-drawn rooms turned eight ways is a hundred and twenty-eight
// boards, and a player recognises a repeat by the third sighting, so it plays
// like sixteen. This is the answer to that, and it needs no new art: the rooms
// are SLICED, and the slices recombine.
//
// THE GEOMETRY
//
//     # # # # # # # # #      A 9x9 floor is a border, a SPINE — the middle row
//     # N N N s N N N #      and middle column of the interior, thirteen tiles
//     # N N N s N N N #      that are always open — and four 3x3 quarters.
//     # N N N s N N N #
//     # s s s s s s s #      Each quarter touches the spine along exactly two
//     # S S S s S S S #      of its edges.
//     # S S S s S S S #
//     # S S S s S S S #
//     # # # # # # # # #
//
// THE THEOREM
//
// If every open cell in a quarter reaches one of those two edges FROM INSIDE
// THE QUARTER, it reaches the spine; and the spine reaches everything. So four
// separately-valid quarters compose into a connected floor. Always. No global
// check, no retry loop — the old generator rolled the dice up to forty times
// hoping for a floor that worked, and a generator that retries until it likes
// the answer quietly prefers the safest possible answer.
//
// (Two open groups inside one quarter that BOTH touch the spine are fine: they
// are joined to each other through the spine. The check allows that on purpose.)
//
// EIGHT PLACEMENTS, ALL FREE
//
// Quarters are authored in NW form — spine to the east and to the south. The
// other three corners are reflections, and a reflection maps those two edges
// onto whichever two edges touch the spine there. The transpose swaps east with
// south, so it is NW form too. One validation, eight placements, all provably
// connected.
//
// LEGEND — as rooms.js, plus the tags, which are hints and not commitments:
//   .  floor      #  pillar      :  rubble      _  gap      ?  maybe-rubble
//   *  a good place for loot     e  a good place for something to stand
//   >  a good place for a stair
// The assembler decides what actually goes where, because a floor needs exactly
// one spawn and exactly two stairs and no single quarter can promise that.

export const QUARTERS = [
  { id: 'antechamber-E', cells: ["e..",".::","e:."] },
  { id: 'antechamber-N', cells: [".:?",".::",".:?"] },
  { id: 'antechamber-S', cells: [".e.",".::",".:?"] },
  { id: 'antechamber-W', cells: [">e:",".::","e:e"] },
  { id: 'causeway-E', cells: ["e.>",".:?","..#"] },
  { id: 'causeway-N', cells: ["...",".:.","..#"] },
  { id: 'causeway-S', cells: [".e.",".:.","..#"] },
  { id: 'causeway-W', cells: [">e.","e:e",".e#"] },
  { id: 'cells-E', cells: ["._e","...",".#."] },
  { id: 'cells-N', cells: ["._*",".:>",".#."] },
  { id: 'cells-S', cells: ["._e",".#.","..."] },
  { id: 'cells-W', cells: [">#e","e#.",".e."] },
  { id: 'comb-E', cells: ["*_.","e#.","._."] },
  { id: 'comb-N', cells: ["._e",".#>","._."] },
  { id: 'comb-S', cells: [".#e","._.",".#."] },
  { id: 'comb-W', cells: [">#e","e_.",".#e"] },
  { id: 'crossing-E', cells: [">.e",":?.","#.."] },
  { id: 'crossing-N', cells: [".._","?._","_.."] },
  { id: 'crossing-S', cells: [".>#",":.#","_.?"] },
  { id: 'crossing-W', cells: ["*e?","e.e","#e."] },
  { id: 'gauntlet-E', cells: [".e.",".#_",".e."] },
  { id: 'gauntlet-N', cells: ["...","_#_","..*"] },
  { id: 'gauntlet-S', cells: ["...","_#_","..."] },
  { id: 'gauntlet-W', cells: [">e.","e#_","*e."] },
  { id: 'larder-E', cells: [".>:","e_.",".*."] },
  { id: 'larder-N', cells: ["..:","._.",".*."] },
  { id: 'larder-S', cells: ["...",".#.","e:."] },
  { id: 'larder-W', cells: [">e:",".#e","e.."] },
  { id: 'ledges-E', cells: ["e..","#_.","e.."] },
  { id: 'ledges-S', cells: ["..e","_#_","e.."] },
  { id: 'ledges-W', cells: [">e.","#_e","..."] },
  { id: 'pincer-E', cells: ["e>_",".?_",".:_"] },
  { id: 'pincer-N', cells: [".?_",".?#",".:#"] },
  { id: 'pincer-S', cells: [".e#",".?#",".:#"] },
  { id: 'pincer-W', cells: [">e#","e._",".:_"] },
  { id: 'rubblefield-E', cells: ["e.:",":..","e:."] },
  { id: 'rubblefield-N', cells: ["..:",":..","?:."] },
  { id: 'rubblefield-S', cells: ["...","e?:",".:."] },
  { id: 'rubblefield-W', cells: [">e:",":.:","e.e"] },
  { id: 'shooting-E', cells: ["e.?",".:.","..."] },
  { id: 'shooting-N', cells: ["...",".:?","?.."] },
  { id: 'shooting-S', cells: [".e_",".:.","..."] },
  { id: 'shooting-W', cells: [">e_","e:.",".e."] },
  { id: 'spiral-E', cells: ["...","e_#","._?"] },
  { id: 'spiral-N', cells: ["...","._#",".#*"] },
  { id: 'spiral-S', cells: ["...","._#",".#e"] },
  { id: 'spiral-W', cells: [">e.","e#.",":e."] },
  { id: 'split-E', cells: [".e.","e_#",".e_"] },
  { id: 'split-N', cells: [".?:","._#",".#*"] },
  { id: 'split-S', cells: [".?:","..e",".##"] },
  { id: 'split-W', cells: [">*e",":e?","..#"] },
  { id: 'twohalls-E', cells: ["e..",".?:","e?."] },
  { id: 'twohalls-N', cells: [".:?",".:#","..#"] },
  { id: 'twohalls-S', cells: ["...","e:#",".?#"] },
  { id: 'twohalls-W', cells: [">*e","e.:",".:e"] },
  { id: 'vault-E', cells: ["e>?",".#?","e##"] },
  { id: 'vault-N', cells: ["...","._.","._#"] },
  { id: 'vault-S', cells: ["..e",":..","..#"] },
  { id: 'vault-W', cells: [">e?",":.e","e.#"] },
  { id: 'well-E', cells: ["e..","._#","e:_"] },
  { id: 'well-N', cells: [".:?","._#",".#*"] },
  { id: 'well-S', cells: ["...",".#_",".#?"] },
  { id: 'well-W', cells: [">e.",".##","e?_"] },
];
