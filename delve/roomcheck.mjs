// Is every hand-drawn room actually playable?
//
// Hand-authored content is easy to get subtly wrong in ways that look fine on
// the page: a hole in the border, a relic sealed inside a wall, a corner that
// rubble quietly closed off. The first ten rooms drawn for this game had four
// such faults between them and every one of them looked correct.
//
// Test-only. The game never calls this; the build never ships it.
import { W, H, idx, parseRoom, variantOf, VARIANTS, passable, reachableFrom } from './rules.js';
import { ROOMS, LEGEND } from './rooms.js';

// Everything a room promises must actually be walkable to, in every one of its
// eight orientations. A room that fails this does not get to ship — the old
// generator "solved" this by rolling again up to forty times, which is how you
// end up with forty rooms that all look like the safest possible room.
export function checkRoom(room) {
  const errs = [];
  if (!Array.isArray(room.cells) || room.cells.length !== H) {
    errs.push(`must be ${H} rows, has ${room.cells ? room.cells.length : 0}`);
    return errs;
  }
  room.cells.forEach((row, y) => {
    if (row.length !== W) errs.push(`row ${y} is ${row.length} wide, must be ${W}`);
    [...row].forEach((ch, x) => {
      if (!(ch in LEGEND)) errs.push(`row ${y} col ${x}: unknown glyph "${ch}"`);
      const edge = y === 0 || y === H - 1 || x === 0 || x === W - 1;
      if (edge && ch !== '#' && ch !== '_') {
        errs.push(`row ${y} col ${x}: the border must be wall or gap, found "${ch}"`);
      }
    });
  });
  if (errs.length) return errs;

  const flat = room.cells.join('');
  const count = (ch) => [...flat].filter((c) => c === ch).length;
  if (count('@') !== 1) errs.push(`needs exactly one @, has ${count('@')}`);
  if (count('>') !== 2) errs.push(`needs exactly two > — the choice of door is the game, has ${count('>')}`);
  if (count('^') < 1) errs.push('needs at least one ^ — every room must say where the way out goes');
  if (count('*') < 1) errs.push('needs at least one * — a floor with nothing to walk to is a corridor');
  if (count('e') + count('E') < 1) errs.push('needs at least one e or E');

  const parsed = parseRoom(room);
  for (let v = 0; v < VARIANTS; v++) {
    const t = variantOf(parsed, v);
    for (const [mx, my] of t.maybe) t.tiles[idx(mx, my)] = 2;   // worst case: all stone
    const seen = reachableFrom(t.tiles, t.spawn[0]);
    const named = [
      ['stair', t.stair], ['exit', t.exit], ['relic slot', t.relics],
      ['enemy slot', t.foes], ['heavy slot', t.heavies],
    ];
    for (const [what, list] of named) {
      for (const [x, y] of list) {
        if (!seen[idx(x, y)]) errs.push(`variant ${v}: ${what} at ${x},${y} cannot be reached from the spawn`);
      }
    }
    // an orphan pocket of floor is a room that looks bigger than it is
    let orphans = 0;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      if (passable(t.tiles, x, y) && !seen[idx(x, y)]) orphans++;
    }
    if (orphans) errs.push(`variant ${v}: ${orphans} floor tiles are walled off from the rest of the room`);
    if (v === 0 && errs.length > 8) break;   // one broken room does not need fifty lines
  }
  return errs;
}

export function checkLibrary(rooms = ROOMS) {
  const out = [];
  const ids = new Set();
  for (const r of rooms) {
    if (ids.has(r.id)) out.push({ id: r.id, errs: ['duplicate id'] });
    ids.add(r.id);
    const errs = checkRoom(r);
    if (errs.length) out.push({ id: r.id, errs });
  }
  return out;
}
