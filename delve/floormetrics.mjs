// What does a floor actually DO to the player?
//
// "This level feels samey" is not a bug report you can act on. These are the
// numbers that turn it into one. The load-bearing measure is the DETOUR FACTOR:
// if the shortest walk from where you wake to the stair is a straight line, the
// geometry of the room is decoration and nothing more.
//
//   node delve/floormetrics.mjs [runs]
import { pathToFileURL } from 'node:url';
import {
  genFloor, W, H, idx, DIRS, walkable, blocksSight, WALL, RUBBLE, FLOOR, STAIRS, EXIT,
  rng, floorSeed, hasExit, KINDS, makeRelic, hpBonus,
} from './rules.js';

// The generator this replaced, kept HERE rather than in the ruleset so the
// improvement can be measured side by side instead of remembered. It scattered
// five to nine blocks at random and retried until everything was reachable.
const pick = (r, list) => list[Math.floor(r() * list.length)];
const roll = (r, n) => Math.floor(r() * n);
const dist = (a2, b2) => Math.abs(a2[0] - b2[0]) + Math.abs(a2[1] - b2[1]);
const kkey = ([x, y]) => `${x},${y}`;
function freeSpot(r, open, taken, away, minAway) {
  const ok = open.filter((p) => !taken.has(kkey(p)) && dist(p, away) >= minAway);
  return ok.length ? pick(r, ok) : null;
}
function bestiaryFor(depth) {
  if (depth <= 1) return ['husk'];
  if (depth <= 3) return ['husk', 'husk', 'spitter'];
  if (depth <= 6) return ['husk', 'spitter', 'spitter', 'sentinel'];
  return ['husk', 'spitter', 'sentinel', 'sentinel'];
}
function reachable(t, from, targets) {
  const d = bfs(t, from);
  return targets.every(([x, y]) => d[y * W + x] >= 0);
}
function scatterTry(r, depth, lenient = false) {
  const t = new Uint8Array(W * H).fill(FLOOR);
  for (let x = 0; x < W; x++) { t[idx(x, 0)] = WALL; t[idx(x, H - 1)] = WALL; }
  for (let y = 0; y < H; y++) { t[idx(0, y)] = WALL; t[idx(W - 1, y)] = WALL; }

  const clutter = 5 + roll(r, 5) + Math.min(4, Math.floor(depth / 3));
  for (let i = 0; i < clutter; i++) {
    const x = 1 + roll(r, W - 2), y = 1 + roll(r, H - 2);
    t[idx(x, y)] = r() < 0.55 ? WALL : RUBBLE;
  }

  const open = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (t[idx(x, y)] === FLOOR) open.push([x, y]);
  if (open.length < 30) return lenient ? null : null;

  // the player starts near one corner, the stair sits far from it
  const start = open.filter(([x, y]) => x + y <= 6);
  const far = open.filter(([x, y]) => x + y >= 10);
  if (!start.length || !far.length) return null;
  const pos = pick(r, start);
  const stair = pick(r, far);
  if (stair[0] === pos[0] && stair[1] === pos[1]) return null;
  t[idx(stair[0], stair[1])] = STAIRS;

  let exit = null;
  if (hasExit(depth)) {
    const spots = open.filter(([x, y]) => dist([x, y], pos) > 3 && dist([x, y], stair) > 2);
    if (!spots.length) return null;
    exit = pick(r, spots);
    t[idx(exit[0], exit[1])] = EXIT;
  }

  const taken = new Set([kkey(pos), kkey(stair)]);
  if (exit) taken.add(kkey(exit));

  // relics on the ground, more of them the deeper you are
  const relics = [];
  const nRelics = (r() < 0.52 ? 1 : 0) + (depth >= 7 && r() < 0.18 ? 1 : 0);
  for (let i = 0; i < nRelics; i++) {
    const spot = freeSpot(r, open, taken, pos, 2);
    if (!spot) break;
    taken.add(kkey(spot));
    relics.push({ x: spot[0], y: spot[1], relic: makeRelic(r, depth) });
  }

  // enemies, never adjacent to where you appear
  const enemies = [];
  const roster = bestiaryFor(depth);
  const nFoes = Math.min(7, 1 + Math.floor(depth * 0.7) + (r() < 0.4 ? 1 : 0));
  for (let i = 0; i < nFoes; i++) {
    const spot = freeSpot(r, open, taken, pos, 3);
    if (!spot) break;
    taken.add(kkey(spot));
    const kind = pick(r, roster);
    enemies.push({
      id: i, kind, x: spot[0], y: spot[1],
      hp: KINDS[kind].hp + hpBonus(depth), cool: 0, intent: null,
    });
  }

  if (!reachable(t, pos, [stair, exit].filter(Boolean).concat(relics.map((p) => [p.x, p.y])))) return null;
  return { tiles: t, pos, stair, exit, relics, enemies, depth };
}

export function scatterFloor(seed, depth) {
  const r = rng(floorSeed(seed, depth));
  for (let attempt = 0; attempt < 40; attempt++) {
    const f = scatterTry(r, depth);
    if (f) return f;
  }
  return scatterTry(rng(floorSeed(seed, depth) ^ 0x9e37), depth, true);
}


const key = (x, y) => y * W + x;

export function walkTiles(t) {
  const out = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (walkable(t, x, y)) out.push([x, y]);
  return out;
}

export function bfs(t, from) {
  const d = new Int16Array(W * H).fill(-1);
  d[key(from[0], from[1])] = 0;
  const q = [from];
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (!walkable(t, nx, ny) || d[key(nx, ny)] >= 0) continue;
      d[key(nx, ny)] = d[key(x, y)] + 1;
      q.push([nx, ny]);
    }
  }
  return d;
}

// A chokepoint is a walkable tile that, removed, splits the room in two. It is
// the single most useful thing a level can contain: a place worth standing, a
// place worth avoiding, and a place an enemy can deny you.
export function chokepoints(t) {
  const tiles = walkTiles(t);
  if (tiles.length < 3) return [];
  const reach = (skip) => {
    const start = tiles.find(([x, y]) => !(x === skip[0] && y === skip[1]));
    const seen = new Set([`${start[0]},${start[1]}`]);
    const q = [start];
    while (q.length) {
      const [x, y] = q.shift();
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (!walkable(t, nx, ny)) continue;
        if (nx === skip[0] && ny === skip[1]) continue;
        const k = `${nx},${ny}`;
        if (seen.has(k)) continue;
        seen.add(k); q.push([nx, ny]);
      }
    }
    return seen.size;
  };
  return tiles.filter((p) => reach(p) < tiles.length - 1);
}

// The longest unbroken run a spitter could ever fire down. Long lines make the
// spitter terrifying; a room with none makes it furniture.
export function longestLine(t) {
  let best = 0;
  for (const [dx, dy] of [[1, 0], [0, 1]]) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let n = 0, cx = x, cy = y;
      while (!blocksSight(t, cx, cy)) { n++; cx += dx; cy += dy; }
      best = Math.max(best, n);
    }
  }
  return best;
}

// The lane a SPITTER actually has. longestLine counts any run that sight passes
// through, but a GAP is see-through and unstandable — so a row of holes measured
// as a full-width lane that no bolt could ever hit anything in. At 9x9 there was
// barely a gap-row in the library and it did not matter; at 11x11 it made the
// causeway, which is mostly open air, read as the most dangerous room here.
//
// This counts only the tiles in a clear run that something could be STANDING on,
// which is what a spitter is actually shooting at.
export function longestLane(t) {
  let best = 0;
  const scan = (cells) => {
    let n = 0;
    for (const [x, y] of cells) {
      if (blocksSight(t, x, y)) { best = Math.max(best, n); n = 0; }
      else if (walkable(t, x, y)) n++;
    }
    best = Math.max(best, n);
  };
  for (let y = 0; y < H; y++) scan(Array.from({ length: W }, (_, x) => [x, y]));
  for (let x = 0; x < W; x++) scan(Array.from({ length: H }, (_, y) => [x, y]));
  return best;
}

// How much of the room is next to something you can hide behind. The outer wall
// does not count: it is on every floor ever made, so crediting it measures the
// border rather than the level, and reports 75% cover for a nearly empty room.
const onBorder = (x, y) => x === 0 || y === 0 || x === W - 1 || y === H - 1;
export function coverFraction(t) {
  const tiles = walkTiles(t);
  const covered = tiles.filter(([x, y]) =>
    DIRS.some(([dx, dy]) => !onBorder(x + dx, y + dy) && blocksSight(t, x + dx, y + dy)));
  return covered.length / Math.max(1, tiles.length);
}

// A tile is a GOOD place to stand if it is safe from some directions and not
// others — that is what makes choosing where to stand a decision. A tile with
// cover on every side is a hole; a tile with none is open ground.
export function decisionTiles(t) {
  const tiles = walkTiles(t);
  return tiles.filter(([x, y]) => {
    const blocked = DIRS.filter(([dx, dy]) => !onBorder(x + dx, y + dy) && blocksSight(t, x + dx, y + dy)).length;
    return blocked >= 1 && blocked <= 2;
  }).length;
}

// Distinct open regions of 4+ tiles — "rooms within the room". A floor with one
// undifferentiated blob has no places, only space.
export function openRegions(t) {
  const seen = new Set();
  const regions = [];
  for (const [x, y] of walkTiles(t)) {
    const k = `${x},${y}`;
    if (seen.has(k)) continue;
    const q = [[x, y]], cell = [];
    seen.add(k);
    while (q.length) {
      const [cx, cy] = q.shift();
      cell.push([cx, cy]);
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx, ny = cy + dy;
        const nk = `${nx},${ny}`;
        if (!walkable(t, nx, ny) || seen.has(nk)) continue;
        seen.add(nk); q.push([nx, ny]);
      }
    }
    regions.push(cell.length);
  }
  return regions.sort((a, b) => b - a);
}

// How many tiles a given tile can be shot from, counting outward in all four
// directions until something stops the eye. This is the number that decides
// whether a tile is a good place to stand.
export function exposure(t, x, y) {
  let n = 0;
  for (const [dx, dy] of DIRS) {
    let cx = x + dx, cy = y + dy;
    while (!blocksSight(t, cx, cy)) { n++; cx += dx; cy += dy; }
  }
  return n;
}

// The spread of that number across the room. A room where every tile is equally
// exposed has no PLACES in it — nowhere is safer than anywhere else, so there
// is never a reason to prefer one tile over another, and that is the difference
// between a board and a room. High spread is the whole goal of drawing walls.
export function exposureSpread(t) {
  const tiles = walkTiles(t);
  const vals = tiles.map(([x, y]) => exposure(t, x, y));
  const mean = vals.reduce((a2, b2) => a2 + b2, 0) / Math.max(1, vals.length);
  const sd = Math.sqrt(vals.reduce((a2, v) => a2 + (v - mean) ** 2, 0) / Math.max(1, vals.length));
  return { mean, sd, min: Math.min(...vals), max: Math.max(...vals) };
}

// The walk a player actually takes: in, pick the loot up, out again. Measuring
// the straight line to the stair flattered rooms whose loot is off to one side.
export function routeDetour(f) {
  const t = f.tiles;
  const legs = [f.pos];
  if (f.relics.length) legs.push([f.relics[0].x, f.relics[0].y]);
  if (f.exit) legs.push(f.exit);
  else {
    const from = bfs(t, legs[legs.length - 1]);
    const opts = (f.stairs || [f.stair]).filter(([x, y]) => from[key(x, y)] >= 0);
    if (!opts.length) return null;
    legs.push(opts.reduce((b2, p) => (from[key(p[0], p[1])] < from[key(b2[0], b2[1])] ? p : b2)));
  }
  let walked = 0, straight = 0;
  for (let i = 0; i + 1 < legs.length; i++) {
    const d = bfs(t, legs[i]);
    const step = d[key(legs[i + 1][0], legs[i + 1][1])];
    if (step < 0) return null;
    walked += step;
    straight += Math.abs(legs[i][0] - legs[i + 1][0]) + Math.abs(legs[i][1] - legs[i + 1][1]);
  }
  return straight > 0 ? walked / straight : 1;
}

export function measureFloor(f) {
  const t = f.tiles;
  const d = bfs(t, f.pos);
  const stairDist = d[key(f.stair[0], f.stair[1])];
  const manhattan = Math.abs(f.stair[0] - f.pos[0]) + Math.abs(f.stair[1] - f.pos[1]);
  const walls = [...t].filter((v) => v === WALL).length - (2 * W + 2 * H - 4);
  const rubble = [...t].filter((v) => v === RUBBLE).length;
  const regions = openRegions(t);
  const chokes = chokepoints(t);
  return {
    detour: manhattan > 0 ? stairDist / manhattan : 1,
    stairDist, manhattan,
    innerWalls: walls, rubble,
    chokes: chokes.length,
    cover: coverFraction(t),
    longestLine: longestLine(t),
    biggestRegion: regions[0] || 0,
    regions: regions.length,
    decisions: decisionTiles(t),
    spread: exposureSpread(t).sd,
    exposeMax: exposureSpread(t).max,
    exposeMin: exposureSpread(t).min,
    route: routeDetour(f) ?? 1,
    walkable: walkTiles(t).length,
    // Inert means the room shaped NEITHER the walk nor the sightlines. The
    // first version tested only the walk, and so called a hall of pillars inert
    // — when what a hall of pillars does is shape where you can be shot from.
    inert: (routeDetour(f) ?? 1) < 1.15 && exposureSpread(t).sd < 1.8,
  };
}

// Two floors that differ only in where the noise landed still FEEL the same. A
// structural signature ignores exact positions and asks what shape the room is.
export function signature(f) {
  const m = measureFloor(f);
  return [
    Math.min(4, Math.round(m.detour * 2)),
    Math.min(3, m.chokes),
    Math.round(m.cover * 5),
    Math.min(4, Math.round(m.longestLine / 2)),
    Math.min(3, m.regions),
    Math.min(4, Math.floor(m.innerWalls / 3)),
  ].join('-');
}

export function report(label, gen, n = 400) {
  const ms = [], sigs = new Map();
  for (let i = 0; i < n; i++) {
    const f = gen(i);
    ms.push(measureFloor(f));
    const s = signature(f);
    sigs.set(s, (sigs.get(s) || 0) + 1);
  }
  const avg = (k) => ms.reduce((a, m) => a + m[k], 0) / ms.length;
  const top = [...sigs.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    label,
    'route detour': avg('route').toFixed(2) + '×',
    'exposure spread': avg('spread').toFixed(2),
    'safest tile sees': avg('exposeMin').toFixed(1),
    'worst tile sees': avg('exposeMax').toFixed(1),
    'inert floors': Math.round(ms.filter((m) => m.inert).length / ms.length * 100) + '%',
    chokepoints: avg('chokes').toFixed(2),
    'longest line': avg('longestLine').toFixed(1),
    'line varies': (Math.max(...ms.map((m) => m.longestLine)) - Math.min(...ms.map((m) => m.longestLine))),
    'open regions': avg('regions').toFixed(2),
    'distinct shapes': sigs.size,
    'most common': Math.round(top[1] / n * 100) + '%',
  };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const N = Number(process.argv[2] || 400);
  const rows = [];
  for (const depth of [1, 4, 8, 12]) {
    rows.push(report(`scattered  d${depth}`, (i) => scatterFloor(`m-${i}`, depth), N));
    rows.push(report(`DRAWN      d${depth}`, (i) => genFloor(`m-${i}`, depth), N));
  }
  console.table(rows);
  console.log('\nWhat these mean:');
  console.log('  route detour      the walk in, to the loot, and out — 1.00× means the room bent nothing');
  console.log('  exposure spread   how much safer the safe tiles are than the exposed ones.');
  console.log('                    Near zero means the room has no PLACES, only space.');
  console.log('  inert floors      shaped neither the walk nor the sightlines');
  console.log('  line varies       spread of the longest sightline across floors. 0 = every room');
  console.log('                    threatens a spitter exactly as much as every other room.');
  console.log('  distinct shapes   how many structurally different rooms it can make at all');
}

// ---------------------------------------------------------- per-room report --
// Which of the hand-drawn rooms is actually doing work? Averaged over all eight
// orientations, because a room that only works one way up is a room that will
// disappoint seven times out of eight.
export async function roomReport() {
  const { ROOMS } = await import('./rooms.js');
  const { parseRoom, variantOf, VARIANTS } = await import('./rules.js');
  const rows = [];
  for (const room of ROOMS) {
    const parsed = parseRoom(room);
    const ms = [];
    for (let v = 0; v < VARIANTS; v++) {
      const t = variantOf(parsed, v);
      const fake = {
        tiles: t.tiles, pos: t.spawn[0], stair: t.stair[0],
        exit: t.exit[0] || null, relics: t.relics.slice(0, 1).map(([x, y]) => ({ x, y })),
      };
      const sp = exposureSpread(t.tiles);
      ms.push({
        route: routeDetour(fake) ?? 1, sd: sp.sd, min: sp.min, max: sp.max,
        line: longestLane(t.tiles), chokes: chokepoints(t.tiles).length,
        walk: walkTiles(t.tiles).length,
        foes: t.foes.length + t.heavies.length, relics: t.relics.length,
      });
    }
    const avg = (k) => ms.reduce((a, m) => a + m[k], 0) / ms.length;
    rows.push({
      room: room.id,
      'route': avg('route').toFixed(2) + '×',
      'spread': avg('sd').toFixed(2),
      'nook': avg('min').toFixed(1),
      'exposed': avg('max').toFixed(1),
      'line': avg('line').toFixed(1),
      'chokes': avg('chokes').toFixed(1),
      'tiles': avg('walk').toFixed(0),
      'foe slots': ms[0].foes,
      'relic slots': ms[0].relics,
      verdict: avg('route') < 1.25 && avg('sd') < 2.8 ? 'LAZY'
        : avg('min') > 2.5 ? 'no nook'
        : avg('line') >= 9 ? 'open line'
        : 'good',
    });
  }
  return rows;
}
