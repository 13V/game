// The quarter library, and whether four of them can be trusted to compose.
//
// A quarter is authored in NW form — spine to the east and to the south. The
// rule is: every open cell must reach one of those two edges FROM INSIDE the
// quarter, so that it reaches the always-open spine, and through the spine
// everything else. Four quarters that each pass compose into a connected floor
// without a single global check. See quarters.js for why the other three
// corners come free.
import { QUARTERS } from './quarters.js';

const Q_OPEN = new Set(['.', '*', 'e', 'E', '>', '^', '@']);
const qOpen = (ch) => Q_OPEN.has(ch);
const Q_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function checkQuarter(g) {
  if (!Array.isArray(g) || g.length !== QS || g.some((r) => r.length !== QS)) return [`not ${QS}x${QS}`];
  const errs = [];
  const open = [];
  for (let y = 0; y < QS; y++) for (let x = 0; x < QS; x++) if (qOpen(g[y][x])) open.push([x, y]);
  if (!open.length) return ['solid — a quarter with no floor is a dead corner'];

  // flood inward from the two edges that touch the spine
  const touch = open.filter(([x, y]) => x === QS - 1 || y === QS - 1);
  if (!touch.length) return ['nothing on the spine edges — this corner can never be entered'];
  const seen = new Set(touch.map(([x, y]) => `${x},${y}`));
  const q = touch.slice();
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of Q_DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx > QS - 1 || ny > QS - 1) continue;
      if (!qOpen(g[ny][nx]) || seen.has(`${nx},${ny}`)) continue;
      seen.add(`${nx},${ny}`); q.push([nx, ny]);
    }
  }
  if (seen.size !== open.length) errs.push(`${open.length - seen.size} cells never reach the spine`);

  // and a furnishing that stays floor needs something solid to hang off
  for (let y = 0; y < QS; y++) for (let x = 0; x < QS; x++) {
    if (g[y][x] !== '?' || x === QS - 1 || y === QS - 1) continue;
    const anchored = Q_DIRS.some(([dx, dy]) => {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx > QS - 1 || ny > QS - 1) return false;
      return g[ny][nx] !== '?' && qOpen(g[ny][nx]) && seen.has(`${nx},${ny}`);
    });
    if (!anchored) errs.push(`the furnishing at ${x},${y} can be cut off by the others`);
  }
  return errs;
}

export function checkQuarters(list = QUARTERS) {
  const out = [];
  const ids = new Set();
  for (const q of list) {
    const errs = checkQuarter(q.cells);
    if (ids.has(q.id)) errs.push('duplicate id');
    ids.add(q.id);
    if (errs.length) out.push({ id: q.id, errs });
  }
  return out;
}

// Is every hand-drawn room actually playable?
//
// Hand-authored content is easy to get subtly wrong in ways that look fine on
// the page: a hole in the border, a relic sealed inside a wall, a corner that
// rubble quietly closed off. The first ten rooms drawn for this game had four
// such faults between them and every one of them looked correct.
//
// Test-only. The game never calls this; the build never ships it.
// Rooms are CHAMBERS — 11x11 — not floors. When the floors grew to 44x44 this
// kept importing W and H and started insisting every room was 44 rows deep.
import { CW as W, CH as H, QS, DIRS, parseRoom, variantOf, VARIANTS, passable, reachableFrom } from './rules.js';
const idx = (x, y) => y * W + x;
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
    const maybeSet = new Set(t.maybe.map(([x, y]) => `${x},${y}`));
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
    // A furnishing that stays floor must have something solid to hang off: a
    // neighbour that is open however the other furnishings fall. Without this
    // the dice can strand it, and the all-stone check is blind to it.
    for (const [mx, my] of t.maybe) {
      const anchored = DIRS.some(([dx, dy]) => {
        const nx = mx + dx, ny = my + dy;
        return !maybeSet.has(`${nx},${ny}`) && passable(t.tiles, nx, ny) && seen[idx(nx, ny)];
      });
      if (!anchored) errs.push(`variant ${v}: the furnishing at ${mx},${my} can be cut off by the others`);
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
