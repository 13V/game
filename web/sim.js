// STEADING simulation — a JavaScript port of crates/st-sim, verified against
// that crate's pinned test vectors by web/verify.mjs. Every operation mirrors
// the Rust integer semantics: Math.imul for wrapping multiplication, >>>0 for
// u32 wrap, floor division on non-negative operands. If verify.mjs disagrees
// with the Rust numbers, this file is wrong, not the vectors.

export const GRID = 64;
export const TILES = GRID * GRID;
export const MAX_HEIGHT = 15;
export const MAX_PLACEMENTS = 150;
export const HORIZON_DAYS = 240;
export const BUILDING_DAY_CAP = 36000;

export const START_POP = 6, START_WOOD = 20, START_STONE = 10, START_FOOD = 15, START_COIN = 12;
export const BASE_HOUSING = 6, GROWTH_SURPLUS = 10;
export const TAX_PERIOD = 10, DEFAULT_TAX = 1, COIN_PER_EXPORT = 2, FESTIVAL_COST = 20;
export const UNREST_MAX = 10, UNREST_NO_GROWTH = 6, UNREST_EMIGRATION = 8;
export const SCALE_DEN = 20, SCALE_FLOOR = 5;

export const T = { GRASS: 0, FOREST: 1, ROCK: 2, ORE: 3, WATER: 4 };
export const K = { COTTAGE: 0, FIELD: 1, SAWMILL: 2, QUARRY: 3, MINE: 4, SMITHY: 5, ROAD: 6, MARKET: 7, DECREE: 8 };

export const KIND_INFO = {
  [K.COTTAGE]: { name: 'Cottage', wood: 4, stone: 0, coin: 2, staff: 0 },
  [K.FIELD]:   { name: 'Field',   wood: 2, stone: 0, coin: 1, staff: 4 },
  [K.SAWMILL]: { name: 'Sawmill', wood: 3, stone: 0, coin: 2, staff: 4 },
  [K.QUARRY]:  { name: 'Quarry',  wood: 5, stone: 0, coin: 3, staff: 4 },
  [K.MINE]:    { name: 'Mine',    wood: 8, stone: 4, coin: 5, staff: 4 },
  [K.SMITHY]:  { name: 'Smithy',  wood: 6, stone: 6, coin: 4, staff: 4 },
  [K.ROAD]:    { name: 'Road',    wood: 0, stone: 1, coin: 0, staff: 0 },
  [K.MARKET]:  { name: 'Market',  wood: 20, stone: 20, coin: 10, staff: 4 },
  [K.DECREE]:  { name: 'Decree',  wood: 0, stone: 0, coin: 0, staff: 0 },
};

export const idx = (x, y) => y * GRID + x;
export const xy = (i) => [i % GRID, (i / GRID) | 0];

// Orthogonal neighbours in the fixed N,E,S,W order the Rust core specifies.
export function orth(i) {
  const x = i % GRID, y = (i / GRID) | 0, out = [];
  out.push(y > 0 ? i - GRID : -1);
  out.push(x < GRID - 1 ? i + 1 : -1);
  out.push(y < GRID - 1 ? i + GRID : -1);
  out.push(x > 0 ? i - 1 : -1);
  return out;
}

export function ring8(i) {
  const x = i % GRID, y = (i / GRID) | 0, out = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (dx === 0 && dy === 0) continue;
    const nx = x + dx, ny = y + dy;
    out.push(nx >= 0 && ny >= 0 && nx < GRID && ny < GRID ? idx(nx, ny) : -1);
  }
  return out;
}

// ---------------------------------------------------------------- valley --

function mix(h) {
  h = (h ^ (h >>> 16)) >>> 0;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

function foldSeed(seed) {
  let s = 0x9e3779b9;
  for (let i = 0; i < 32; i += 4) {
    const w = (seed[i] | (seed[i + 1] << 8) | (seed[i + 2] << 16) | (seed[i + 3] << 24)) >>> 0;
    s = mix((s ^ w) >>> 0);
  }
  return s >>> 0;
}

const S_HA = 0x484541, S_HB = 0x484542, S_HC = 0x484543, S_MOIST = 0x4d4f49, S_ORE = 0x4f5245;

function lattice(fs, gx, gy, salt) {
  const a = mix(Math.imul(gx, 0x27d4eb2f) >>> 0);
  const b = mix(Math.imul(gy, 0x165667b1) >>> 0);
  return mix((fs ^ salt ^ ((a + b) >>> 0)) >>> 0) & 0xff;
}

function valueNoise(fs, x, y, scale, salt) {
  const gx = (x / scale) | 0, gy = (y / scale) | 0;
  const fx = (((x % scale) * 256) / scale) | 0;
  const fy = (((y % scale) * 256) / scale) | 0;
  const c00 = lattice(fs, gx, gy, salt), c10 = lattice(fs, gx + 1, gy, salt);
  const c01 = lattice(fs, gx, gy + 1, salt), c11 = lattice(fs, gx + 1, gy + 1, salt);
  const top = c00 * (256 - fx) + c10 * fx;
  const bot = c01 * (256 - fx) + c11 * fx;
  return ((top * (256 - fy) + bot * fy) / 65536) | 0;
}

// Generate the valley for a 32-byte seed. Height and terrain, exactly as the
// chain would derive them.
export function generateValley(seed) {
  const fs = foldSeed(seed);
  const height = new Uint8Array(TILES), kind = new Uint8Array(TILES);
  for (let i = 0; i < TILES; i++) {
    const x = i % GRID, y = (i / GRID) | 0;
    const n = valueNoise(fs, x, y, 16, S_HA) * 4 + valueNoise(fs, x, y, 8, S_HB) * 2 + valueNoise(fs, x, y, 4, S_HC);
    let st = (n - 893) * 2 + 893;
    if (st < 0) st = 0; if (st > 1785) st = 1785;
    let h = ((st * 16) / 1786) | 0;
    if (h > MAX_HEIGHT) h = MAX_HEIGHT;
    height[i] = h;
    const moist = valueNoise(fs, x, y, 10, S_MOIST);
    if (h <= 1) kind[i] = T.WATER;
    else if (h >= 11) kind[i] = (mix((fs ^ S_ORE ^ i) >>> 0) & 7) === 0 ? T.ORE : T.ROCK;
    else if (moist >= 150) kind[i] = T.FOREST;
    else kind[i] = T.GRASS;
  }
  return { height, kind };
}

// ------------------------------------------------------------------ plan --

// A placement: {x, y, kind, param}. For decrees (x,y) encode the effective
// day and param the order: high nibble type (0 tax, 1 festival), low value.
export const decreeDay = (p) => Math.max(1, p.y * GRID + p.x);
export const decreeOrder = (p) => [(p.param >> 4) & 0xf, p.param & 0xf];

export function makeDecree(day, type, value) {
  return { x: day % GRID, y: (day / GRID) | 0, kind: K.DECREE, param: ((type << 4) | (value & 0xf)) & 0xff };
}

export const planBytes = (plan) => plan.length * 4;

// Validate a plan against a valley. Returns {ok:true} or {ok:false, error, at}.
// Mirrors Sim::new: every rejection before a single day runs.
export function validatePlan(valley, plan, horizon = HORIZON_DAYS) {
  if (plan.length > MAX_PLACEMENTS) return { ok: false, error: 'too-many', at: -1 };
  const units = plan.length * horizon;
  if (units > BUILDING_DAY_CAP) return { ok: false, error: 'budget', at: -1 };
  const occupied = new Int16Array(TILES).fill(-1);
  for (let i = 0; i < plan.length; i++) {
    const p = plan[i];
    if (p.kind === K.DECREE) {
      const [dk, dv] = decreeOrder(p);
      if (dk > 1 || (dk === 0 && dv > 3)) return { ok: false, error: 'bad-decree', at: i };
      continue;
    }
    if (p.x >= GRID || p.y >= GRID) return { ok: false, error: 'bounds', at: i };
    const t = idx(p.x, p.y);
    if (valley.kind[t] === T.WATER) return { ok: false, error: 'water', at: i };
    if (occupied[t] !== -1) return { ok: false, error: 'overlap', at: i };
    if (p.kind !== K.ROAD) {
      const h = valley.height[t];
      for (const n of orth(t)) {
        if (n >= 0 && Math.abs(valley.height[n] - h) > 1) return { ok: false, error: 'steep', at: i };
      }
    }
    occupied[t] = i;
  }
  return { ok: true };
}

// Reports why one prospective placement fails, for the placement ghost.
export function placementError(valley, plan, p) {
  if (plan.length >= MAX_PLACEMENTS) return 'plan is full';
  const t = idx(p.x, p.y);
  if (valley.kind[t] === T.WATER) return 'open water';
  for (const q of plan) if (q.kind !== K.DECREE && q.x === p.x && q.y === p.y) return 'occupied';
  if (p.kind !== K.ROAD) {
    const h = valley.height[t];
    for (const n of orth(t)) if (n >= 0 && Math.abs(valley.height[n] - h) > 1) return 'too steep';
  }
  return null;
}

// ------------------------------------------------------------------- sim --

export function scaleOutput(base, dist) {
  if (base === 0) return 0;
  const d = dist < SCALE_DEN ? dist : SCALE_DEN;
  let f = SCALE_DEN - d;
  if (f < SCALE_FLOOR) f = SCALE_FLOOR;
  return ((base * f + SCALE_DEN - 1) / SCALE_DEN) | 0;
}

const UNREACHABLE = 255;

// Run a season. Returns the result plus a per-day snapshot array for the
// playback scrubber. `plan` must already validate.
export function runSeason(valley, plan, horizon = HORIZON_DAYS, opts = {}) {
  const occupied = new Int16Array(TILES).fill(-1);
  const built = new Array(plan.length).fill(false);
  const builtDay = new Array(plan.length).fill(0);
  const staff = new Array(plan.length).fill(0);
  let dist = new Uint8Array(TILES).fill(UNREACHABLE);
  let distDirty = false;

  for (let i = 0; i < plan.length; i++) {
    const p = plan[i];
    if (p.kind === K.DECREE) { built[i] = true; continue; }
    occupied[idx(p.x, p.y)] = i;
  }

  let wood = opts.startWood ?? START_WOOD, stone = opts.startStone ?? START_STONE, ore = 0;
  let food = opts.startFood ?? START_FOOD, goods = 0, coin = opts.startCoin ?? START_COIN;
  const baseHousing = opts.baseHousing ?? BASE_HOUSING;
  let pop = opts.startPop ?? START_POP, peakPop = opts.startPop ?? START_POP, unrest = 0, tax = DEFAULT_TAX;
  let famineSinceTax = false, famineDays = 0, exports_ = 0, day = 0;
  let extinctBy = null; // 'famine' | 'revolt'

  const blockedBuilt = (ti) => occupied[ti] >= 0 && built[occupied[ti]];

  const adjacent = (i, t) => {
    let n = 0;
    for (const nb of ring8(i)) if (nb >= 0 && valley.kind[nb] === t && !blockedBuilt(nb)) n++;
    return n;
  };

  const recomputeDistances = () => {
    dist = new Uint8Array(TILES).fill(UNREACHABLE);
    const queue = new Int32Array(TILES);
    let head = 0, tail = 0;
    for (let i = 0; i < plan.length; i++) {
      if (!built[i] || plan[i].kind !== K.MARKET) continue;
      for (const nb of orth(idx(plan[i].x, plan[i].y))) {
        if (nb < 0) continue;
        const o = occupied[nb];
        if (o >= 0 && built[o] && plan[o].kind === K.ROAD && dist[nb] === UNREACHABLE) {
          dist[nb] = 1; queue[tail++] = nb;
        }
      }
    }
    while (head < tail) {
      const cur = queue[head++];
      const d = dist[cur];
      if (d >= UNREACHABLE - 1) continue;
      const h = valley.height[cur];
      for (const nb of orth(cur)) {
        if (nb < 0) continue;
        const o = occupied[nb];
        const isRoad = o >= 0 && built[o] && plan[o].kind === K.ROAD;
        if (isRoad && dist[nb] === UNREACHABLE && Math.abs(valley.height[nb] - h) <= 1) {
          dist[nb] = d + 1; queue[tail++] = nb;
        }
      }
    }
  };

  const marketDistance = (i) => {
    let best = UNREACHABLE;
    for (const nb of orth(i)) {
      if (nb < 0) continue;
      const o = occupied[nb];
      if (o >= 0 && built[o]) {
        if (plan[o].kind === K.MARKET) return 0;
        if (plan[o].kind === K.ROAD && dist[nb] !== UNREACHABLE && dist[nb] < best) best = dist[nb];
      }
    }
    return best;
  };

  const capacity = () => {
    let cap = baseHousing;
    for (let i = 0; i < plan.length; i++) if (built[i] && plan[i].kind === K.COTTAGE) cap += 4;
    return cap;
  };

  const snapshots = [];

  while (day < horizon) {
    day++;
    let famineToday = false;

    // 0. decrees whose day has come, in plan order
    for (let i = 0; i < plan.length; i++) {
      const p = plan[i];
      if (p.kind !== K.DECREE || decreeDay(p) !== day) continue;
      const [dk, dv] = decreeOrder(p);
      if (dk === 0) tax = dv;
      else if (dk === 1 && coin >= FESTIVAL_COST) { coin -= FESTIVAL_COST; unrest = Math.max(0, unrest - 3); }
    }

    // 0b. tax day
    if (day % TAX_PERIOD === 0) {
      coin += pop * tax;
      if (!famineSinceTax) unrest = Math.max(0, unrest - 1);
      famineSinceTax = false;
      if (tax === 0) unrest = Math.max(0, unrest - 1);
      else if (tax === 2) unrest = Math.min(UNREST_MAX, unrest + 1);
      else if (tax === 3) unrest = Math.min(UNREST_MAX, unrest + 2);
    }

    // 1. construct: first unbuilt entry, blocking, one per day, needs hands
    if (pop > 0) {
      for (let i = 0; i < plan.length; i++) {
        if (built[i]) continue;
        const c = KIND_INFO[plan[i].kind];
        if (wood >= c.wood && stone >= c.stone && coin >= c.coin) {
          wood -= c.wood; stone -= c.stone; coin -= c.coin;
          built[i] = true; builtDay[i] = day;
          if (plan[i].kind === K.ROAD || plan[i].kind === K.MARKET) distDirty = true;
        }
        break;
      }
    }
    if (distDirty) { recomputeDistances(); distDirty = false; }

    // 2. allocate labour in plan order
    let idle = pop;
    for (let i = 0; i < plan.length; i++) {
      if (built[i]) {
        const take = Math.min(KIND_INFO[plan[i].kind].staff, idle);
        staff[i] = take; idle -= take;
      } else staff[i] = 0;
    }

    // 3. produce in plan order, warehouse updating as the walk goes
    for (let i = 0; i < plan.length; i++) {
      if (!built[i] || staff[i] === 0) continue;
      const p = plan[i], at = idx(p.x, p.y), s = staff[i];
      switch (p.kind) {
        case K.FIELD: food += Math.min(s, adjacent(at, T.GRASS)) * 2; break;
        case K.SAWMILL: wood += scaleOutput(Math.min(s, adjacent(at, T.FOREST)), marketDistance(at)); break;
        case K.QUARRY: stone += scaleOutput(Math.min(s, adjacent(at, T.ROCK)), marketDistance(at)); break;
        case K.MINE: ore += scaleOutput(Math.min(s, adjacent(at, T.ORE)), marketDistance(at)); break;
        case K.SMITHY: {
          const n = scaleOutput(Math.min(s, wood, ore), marketDistance(at));
          wood -= n; ore -= n; goods += n; break;
        }
        case K.MARKET: {
          const e = Math.min(s * 2, goods);
          goods -= e; exports_ += e; coin += e * COIN_PER_EXPORT; break;
        }
      }
    }

    // 4. consume
    const need = pop;
    if (food >= need) food -= need;
    else {
      const short = need - food;
      food = 0;
      pop -= Math.min(short, pop);
      famineDays++; famineToday = true;
      unrest = Math.min(UNREST_MAX, unrest + 1);
      famineSinceTax = true;
      if (pop === 0) extinctBy = 'famine';
    }

    // 4b. emigration: open revolt loses a fed villager a day
    if (unrest >= UNREST_EMIGRATION && pop > 0) {
      pop -= 1;
      if (pop === 0) extinctBy = 'revolt';
    }

    const extinct = pop === 0;

    // 5. grow: calm realm, surplus, a free bed
    if (!extinct && unrest < UNREST_NO_GROWTH && food >= GROWTH_SURPLUS && pop < capacity()) {
      pop += 1;
      if (pop > peakPop) peakPop = pop;
    }

    snapshots.push({
      day, pop, food, wood, stone, ore, goods, coin, unrest, tax,
      exports: exports_, famine: famineToday,
      built: built.filter((b, i) => b && plan[i].kind !== K.DECREE).length,
    });

    if (extinct) break;
  }

  let footprint = 0;
  for (let i = 0; i < plan.length; i++) if (built[i] && plan[i].kind !== K.DECREE) footprint++;

  return {
    outcome: extinctBy ? 'extinct' : 'completed',
    extinctBy,
    extinctDay: extinctBy ? day : null,
    exports: exports_,
    efficiency: ((exports_ * 100) / Math.max(peakPop, 1)) | 0,
    footprint,
    peakPop, finalPop: pop, famineDays, daysRun: day,
    buildingsBuilt: footprint,
    finalCoin: coin, finalUnrest: unrest,
    builtDay, snapshots,
  };
}

// Seed helpers for the client: a 32-byte seed from any string, via the same
// mixer (not a consensus rule — just a stable way to name valleys).
export function seedFromString(str) {
  const seed = new Uint8Array(32);
  let h = 0x9e3779b9;
  for (let i = 0; i < str.length; i++) h = mix((h ^ str.charCodeAt(i)) >>> 0);
  for (let i = 0; i < 32; i++) { h = mix(h); seed[i] = h & 0xff; }
  return seed;
}

export function seedToHex(seed) {
  return [...seed.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
