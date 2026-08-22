// KINGDOM — the rules, and nothing else.
//
// This file has no DOM in it and no drawing, which is the whole point: the
// browser runs it to play, and the serverless function in /api runs THE SAME
// FILE to re-simulate a submitted run and work out what it really scored. A
// leaderboard that takes the client's word for a number is one curl away from
// being won by somebody who never played, and a second copy of the rules on the
// server would drift from this one within a week. One file, both places.
import { GRID, TILES, T, K, idx, ring8 } from './sim.js';

export function jhash(x, y, s) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 2246822519)) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0; h = Math.imul(h, 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

// ------------------------------------------------------------------ rules --
// One kingdom day IS one sunrise to the next: a minute of daylight, a minute of
// dark. Before this the sim ran a day per second while the sky took ten minutes
// to turn, so the two clocks had nothing to do with each other and a player
// crossed a whole year before the sun had set once. Now the day on screen is
// the day you can see out of the window, and everything the day settles — tax,
// harvest, who arrives, who leaves — is settled at dawn.
export const DAY_SECONDS = 120;
export const YEAR_DAYS = 16, SEASON_DAYS = 4;   // four seasons of four days
export const TAX_EVERY = 1;           // the folk pay every morning
export const MOOD_EVERY = 3;          // ...but a tax rate only sours or sweetens slowly
export const GROWTH_EVERY = 1, HAP_RECOVER = 2;
export const MAX_BUILD = 200;
export const SWAP_GOLD = 50, SWAP_GROATS = 5;

// Everything a building is, in one row. Costs are paid when you place it.
// SimpleSim owns its own building ids past the consensus enum in sim.js.
export const K_CHAPEL = 9;
export const CHAPEL_EVERY = 2;        // days between a chapel lifting the mood
export const FEST_COST = 20, FEST_HAP = 3, FEST_EVERY = 3;

// Things that happen to a kingdom rather than because of it. Some are simply
// weather; the ones worth having are the ones that ask you something, because a
// choice with a cost is the only kind that is interesting. They are picked
// deterministically from the day, so a valley plays the same way twice.
export const EVENT_EVERY = 4, EVENT_EXPIRES = 2, EVENT_FIRST = 3;

export const EVENTS = [
  { id: 'pedlar', title: 'A pedlar at the gate',
    text: 'His cart is heavy with seasoned timber and he would rather not haul it back down the hill.',
    can: (s) => s.gold >= 16,
    choices: [
      { label: 'Buy the load', note: '16 gold → 25 wood',
        run: (s) => { s.gold -= 16; s.wood += 25; return 'the pedlar leaves lighter, and richer'; } },
      { label: 'Send him on', run: () => 'the cart rattles away down the hill' },
    ] },
  { id: 'quarryman', title: 'A quarryman between jobs',
    text: 'He has fourteen dressed blocks on a sledge and no wall left to build.',
    can: (s) => s.gold >= 22,
    choices: [
      { label: 'Take the stone', note: '22 gold → 14 stone',
        run: (s) => { s.gold -= 22; s.stone += 14; return 'the sledge is unloaded in the square' },
      },
      { label: 'No work here', run: () => 'the quarryman shrugs and walks on' },
    ] },
  { id: 'wanderers', title: 'A family on the road',
    text: 'Three of them, footsore, asking for a roof. They would eat, and they would work.',
    can: (s) => s.capacity() - s.pop >= 3 && s.food >= 20,
    choices: [
      { label: 'Take them in', note: '+3 folk · −12 food',
        run: (s) => { s.pop += 3; s.food -= 12; return 'three newcomers are given beds' } },
      { label: 'Turn them away', note: '−1 happiness',
        run: (s) => { s.hap = Math.max(0, s.hap - 1); return 'the family walks on, and the folk say nothing' } },
    ] },
  { id: 'bandits', title: 'Riders on the ridge',
    text: 'Armed, unhurried, and counting your rooftops.',
    can: (s) => s.pop >= 6,
    choices: [
      { label: 'Pay them off', note: '−25 gold',
        run: (s) => { s.gold = Math.max(0, s.gold - 25); return 'the riders take their price and go' } },
      { label: 'Bar the gates', note: '−20 wood · −1 happiness',
        run: (s) => { s.wood = Math.max(0, s.wood - 20); s.hap = Math.max(0, s.hap - 1); return 'they burn a barn and ride off' } },
    ] },
  { id: 'bard', title: 'A bard at the door',
    text: 'He offers a night of songs for his supper and a little silver.',
    can: (s) => s.gold >= 14 && s.hap < 10,
    choices: [
      { label: 'Let him sing', note: '−14 gold · +2 happiness',
        run: (s) => { s.gold -= 14; s.hap = Math.min(10, s.hap + 2); return 'they sing until the fire burns low' } },
      { label: 'Not tonight', run: () => 'the bard finds another door' },
    ] },
  { id: 'harvest', title: 'A golden harvest',
    text: 'Every field came in heavy.', can: (s) => !s.isWinter(),
    run: (s) => { s.food += 18; return 'a golden harvest — the barns are full' } },
  { id: 'frost', title: 'A hard frost',
    text: 'It got into the stores.', can: (s) => s.isWinter() && s.food > 14,
    run: (s) => { s.food = Math.max(0, s.food - 14); return 'a hard frost spoils what was in the store' } },
  { id: 'gift', title: 'A gift from the old crown',
    text: 'A rider brings a purse and no explanation.',
    run: (s) => { s.gold += 22; return 'a purse of 22 gold arrives from nowhere' } },
  { id: 'blight', title: 'Blight in the north field',
    text: 'It will pass, but not before it has eaten.', can: (s) => s.food > 16,
    run: (s) => { s.food = Math.max(0, s.food - 15); return 'blight takes 15 from the pantry' } },
  { id: 'foundling', title: 'A foundling at the gate',
    text: 'Nobody claims the child, so everybody does.', can: (s) => s.capacity() - s.pop >= 1,
    run: (s) => { s.pop += 1; return 'a foundling is taken in — the kingdom grows by one' } },
  { id: 'storm', title: 'A storm off the sea',
    text: 'It strips the roofs and scatters the woodpile.', can: (s) => s.wood > 14,
    run: (s) => { s.wood = Math.max(0, s.wood - 12); return 'a storm scatters 12 wood down the hillside' } },
  { id: 'pilgrims', title: 'Pilgrims pass through',
    text: 'They bless the fields and ask for nothing.', can: (s) => s.hap < 10,
    run: (s) => { s.hap = Math.min(10, s.hap + 2); return 'pilgrims bless the fields and move on' } },
];
export const EVENT_BY_ID = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

// Four seasons to a year, and the last of them is hard: farms grow half as much
// through winter. Before this the game had no tension past the first week —
// food climbed forever and a surplus meant nothing. Now a surplus is the only
// thing that carries a town through thirty lean days.
export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
export const FARM_SUMMER = 4, FARM_WINTER = 2;

// Gold could only ever become groats, and wood could only ever come from a
// sawmill — so spending your last wood on farms was an unrecoverable dead end
// that the game never mentioned. A merchant will always sell you supplies.
export const TRADE = [
  { id: 'wood', give: 12, get: 10, what: 'wood' },
  { id: 'stone', give: 20, get: 10, what: 'stone' },
];

export const B = {
  [K.FIELD]:   { name: 'Farm',    wood: 3,  stone: 0,  gold: 0, worker: 1, blurb: 'grows 4 food a day' },
  [K.COTTAGE]: { name: 'House',   wood: 4,  stone: 0,  gold: 0, worker: 0, blurb: '4 beds · folk move in' },
  [K.SAWMILL]: { name: 'Sawmill', wood: 5,  stone: 0,  gold: 2, worker: 1, blurb: '+2 wood · by the forest' },
  [K.QUARRY]:  { name: 'Quarry',  wood: 8,  stone: 0,  gold: 3, worker: 1, blurb: '+2 stone · by the rock' },
  [K.MARKET]:  { name: 'Market',  wood: 12, stone: 10, gold: 6, worker: 1, blurb: '+3 gold a day' },
  [K.MINE]:    { name: 'Mine',    wood: 10, stone: 6,  gold: 5, worker: 1, blurb: '+4 gold · by the ore' },
  [K_CHAPEL]:  { name: 'Chapel',  wood: 6,  stone: 8,  gold: 4, worker: 0, blurb: '+1 mood every 4 days' },
};
export const KIND_ORDER = [K.FIELD, K.COTTAGE, K.SAWMILL, K.QUARRY, K.MARKET, K.MINE, K_CHAPEL];

export class SimpleSim {
  constructor(valley, bonus = {}) {
    this.valley = valley;
    this.day = 0; this.year = 1;
    this.pop = 4 + (bonus.startPop || 0);
    this.baseBeds = 6 + (bonus.baseBeds || 0);
    this.food = 30 + (bonus.startFood || 0);
    this.wood = 14 + (bonus.startWood || 0);
    this.stone = 0 + (bonus.startStone || 0);
    this.gold = 10 + (bonus.startGold || 0);
    this.hap = 6 + (bonus.startHap || 0); this.tax = 1; this.hungry = 0;
    this.fallen = null;            // 'starved' | 'left'
    this.famineToday = false;
    this.entries = [];             // {x, y, kind, built, builtDay}
    this.staff = [];
    this.occupied = new Int32Array(TILES).fill(-1);
    // reward bookkeeping: quests already paid for, and the high-water mark that
    // decides your rank — a famine costs you folk, never a rank you earned
    this.claimed = [];
    this.peakPop = this.pop;
    this.tierAt = 0;
    this.earned = 0;               // groats this valley has paid out
    this.festDay = -FEST_EVERY;    // last festival, so the first is free to hold
    this.feasts = 0;
    this.evId = null; this.evDay = 0; this.evLast = 0; this.evPrev = [];
    this.weather = 'clear';
  }

  // Decided at dawn with the rest of the day, from the day itself, so a valley
  // gets the same weather every time it is played.
  pickWeather() {
    const r = jhash(this.day * 13 + 7, this.year * 17 + 5, 421) % 100;
    if (this.isWinter()) return r < 34 ? 'snow' : 'clear';
    if (r < 9) return 'storm';
    if (r < 32) return 'rain';
    return 'clear';
  }

  season() { return Math.floor((this.day % YEAR_DAYS) / SEASON_DAYS); }
  isWinter() { return this.season() === 3; }
  // rain is worth having: the fields drink, and the FOOD rate says so
  farmYield() {
    return (this.isWinter() ? FARM_WINTER : FARM_SUMMER) + (this.weather === 'rain' ? 1 : 0);
  }
  winterIn() {
    const d = this.day % YEAR_DAYS;
    return d >= SEASON_DAYS * 3 ? 0 : SEASON_DAYS * 3 - d;
  }

  buy(id) {
    const t = TRADE.find((x) => x.id === id);
    if (this.gold < t.give) return `needs ${t.give} gold`;
    this.gold -= t.give;
    this[t.what] += t.get;
    return null;
  }

  capacity() {
    let beds = this.baseBeds;
    for (const e of this.entries) if (e.built && e.kind === K.COTTAGE) beds += 4;
    return beds;
  }

  restaff() {
    let free = this.pop;
    this.staff = this.entries.map((e) => {
      if (!e.built || !B[e.kind].worker || free <= 0) return 0;
      free -= 1; return 1;
    });
  }

  place(x, y, kind) {
    if (this.fallen) return 'the kingdom has fallen';
    if (this.entries.length >= MAX_BUILD) return 'the kingdom is at its limit';
    const t = idx(x, y);
    if (this.occupied[t] !== -1) return 'occupied';
    const c = B[kind];
    if (this.wood < c.wood) return `needs ${c.wood} wood`;
    if (this.stone < c.stone) return `needs ${c.stone} stone`;
    if (this.gold < c.gold) return `needs ${c.gold} gold`;
    this.wood -= c.wood; this.stone -= c.stone; this.gold -= c.gold;
    this.entries.push({ x, y, kind, built: true, builtDay: this.day });
    this.occupied[t] = this.entries.length - 1;
    this.restaff();
    return null;
  }

  demolish(x, y) {
    const i = this.occupied[idx(x, y)];
    if (i === -1) return null;
    const e = this.entries[i], c = B[e.kind];
    if (!e.built) { this.wood += c.wood; this.stone += c.stone; this.gold += c.gold; }
    else { this.wood += c.wood >> 1; this.stone += c.stone >> 1; this.gold += c.gold >> 1; }
    this.entries.splice(i, 1);
    this.occupied.fill(-1);
    for (let k = 0; k < this.entries.length; k++) this.occupied[idx(this.entries[k].x, this.entries[k].y)] = k;
    this.restaff();
    return e.kind;
  }

  setTax(r) { this.tax = r; }

  // Rolling and answering an event both change state, so both have to live in
  // the rules rather than in the interface — otherwise a replayed reign and a
  // played one diverge the first time something happens.
  rollEvent() {
    if (this.fallen) return null;
    if (this.evId) {
      if (this.day - this.evDay >= EVENT_EXPIRES) {
        const gone = EVENT_BY_ID[this.evId];
        this.evId = null;
        return { expired: gone };
      }
      return null;
    }
    if (this.day < EVENT_FIRST || this.day - this.evLast < EVENT_EVERY) return null;
    const recent = this.evPrev || [];
    let pool = EVENTS.filter((e) => (!e.can || e.can(this)) && !recent.includes(e.id));
    if (!pool.length) pool = EVENTS.filter((e) => !e.can || e.can(this));
    if (!pool.length) return null;
    const ev = pool[jhash(this.day * 7 + 3, this.year * 31 + this.pop, 613) % pool.length];
    this.evLast = this.day;
    this.evPrev = [...recent, ev.id].slice(-3);
    if (ev.choices) { this.evId = ev.id; this.evDay = this.day; return { raised: ev }; }
    return { instant: ev, msg: ev.run(this) };
  }

  answerEvent(i) {
    const ev = EVENT_BY_ID[this.evId];
    if (!ev || !ev.choices || !ev.choices[i]) return null;
    const msg = ev.choices[i].run(this);
    this.evId = null;
    return msg;
  }

  // A festival is the one thing you can spend gold on to buy goodwill outright —
  // the counterweight that makes a harsh tax a choice rather than a mistake.
  festivalIn() { return Math.max(0, FEST_EVERY - (this.day - this.festDay)); }
  festival() {
    if (this.gold < FEST_COST) return `needs ${FEST_COST} gold`;
    if (this.festivalIn() > 0) return `the last feast was too recent`;
    this.gold -= FEST_COST;
    this.hap = Math.min(10, this.hap + FEST_HAP);
    this.festDay = this.day;
    return null;
  }

  stepDay() {
    const ev = [];
    let taxTake = 0, died = false;
    this.day++; this.famineToday = false;
    const wasWeather = this.weather;
    this.weather = this.pickWeather();
    if (this.weather !== wasWeather && this.weather !== 'clear') {
      ev.push(this.weather === 'storm' ? 'thunder over the water, and the rain comes sideways'
        : this.weather === 'snow' ? 'snow falls all day and settles on the roofs'
        : 'rain on the fields — the crops drink deep');
    }
    this.restaff();
    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i];
      if (!e.built || !this.staff[i]) continue;
      if (e.kind === K.FIELD) this.food += this.farmYield();
      else if (e.kind === K.SAWMILL) this.wood += 2;
      else if (e.kind === K.QUARRY) this.stone += 2;
      else if (e.kind === K.MARKET) this.gold += 3;
      else if (e.kind === K.MINE) this.gold += 4;
    }
    // chapels comfort the folk whatever else is happening
    if (this.day % CHAPEL_EVERY === 0) {
      let ch = 0;
      for (const e of this.entries) if (e.built && e.kind === K_CHAPEL) ch++;
      if (ch) this.hap = Math.min(10, this.hap + ch);
    }
    if (this.food >= this.pop) { this.food -= this.pop; this.hungry = 0; }
    else {
      this.food = 0; this.hungry++; this.famineToday = true;
      this.hap = Math.max(0, this.hap - 2);
      ev.push('the pantry is empty — the folk go hungry');
      if (this.hungry % 2 === 0 && this.pop > 0) { this.pop--; died = true; ev.push('a villager starves'); }
    }
    // the morning's takings
    const take = this.pop * this.tax;
    taxTake = take;
    if (take > 0) { this.gold += take; ev.push(`the folk pay — ${take} gold this morning`); }
    // a rate takes time to be felt, so its mood cost lands on its own slower beat
    if (this.day % MOOD_EVERY === 0) {
      if (this.tax === 0) this.hap = Math.min(10, this.hap + 1);
      if (this.tax === 2) this.hap = Math.max(0, this.hap - 1);
      if (this.hap <= 1 && this.pop > 0) { this.pop--; died = true; ev.push('a family slips away in the night — the tax bites too hard'); }
    }
    if (this.hungry === 0 && this.day % HAP_RECOVER === 0 && this.hap < 6) this.hap++;
    if (this.day % GROWTH_EVERY === 0 && this.hungry === 0 && this.hap >= 4
        && this.food > this.pop * 2 && this.pop < this.capacity()) {
      // One a day was a hard ceiling, so a player could build far faster than
      // anyone could arrive to work it — thirty-odd buildings standing idle with
      // fifty beds empty. A deep pantry and beds waiting now brings two.
      let arrive = 1;
      if (this.food > this.pop * 4 && this.capacity() - this.pop >= 2) arrive = 2;
      arrive = Math.min(arrive, this.capacity() - this.pop);
      this.pop += arrive;
      ev.push(arrive === 2 ? 'two newcomers settle — word of the kingdom spreads'
        : 'a newcomer settles — the kingdom grows');
    }
    this.restaff();
    let yearEnded = false;
    if (this.day % YEAR_DAYS === 0) { this.year++; yearEnded = true; ev.push(`year ${this.year} dawns over the valley`); }
    // The high-water mark decides your rank AND your competition score, so it
    // belongs to the rules. It used to be kept by the interface, which meant a
    // reign replayed on the server scored as though it had never grown.
    if (this.pop > this.peakPop) this.peakPop = this.pop;
    if (this.pop <= 0) this.fallen = this.hungry > 0 ? 'starved' : 'left';
    return { events: ev, yearEnded, taxTake, died };
  }

  serialize() {
    const { day, year, pop, baseBeds, food, wood, stone, gold, hap, tax, hungry, peakPop, tierAt, earned,
      festDay, feasts, evId, evDay, evLast, evPrev, weather } = this;
    return JSON.stringify({ v: 3, day, year, pop, baseBeds, food, wood, stone, gold, hap, tax, hungry,
      peakPop, tierAt, earned, festDay, feasts, evId, evDay, evLast, evPrev, weather,
      claimed: this.claimed, entries: this.entries });
  }

  // v2 saves predate the rewards; they load with an empty ledger, so a kingdom
  // begun before this collects its quest groats from where it stands.
  static restore(valley, json) {
    const d = JSON.parse(json);
    if (d.v !== 2 && d.v !== 3) throw new Error('old save');
    const s = new SimpleSim(valley);
    for (const k of ['day', 'year', 'pop', 'baseBeds', 'food', 'wood', 'stone', 'gold', 'hap', 'tax', 'hungry']) s[k] = d[k];
    s.claimed = d.claimed || [];
    s.peakPop = d.peakPop || d.pop;
    s.tierAt = d.tierAt || 0;
    s.earned = d.earned || 0;
    s.festDay = d.festDay == null ? -FEST_EVERY : d.festDay;
    s.feasts = d.feasts || 0;
    s.evId = d.evId || null; s.evDay = d.evDay || 0; s.evLast = d.evLast || 0;
    s.evPrev = Array.isArray(d.evPrev) ? d.evPrev : [];
    s.weather = d.weather || 'clear';
    s.entries = d.entries;
    s.occupied.fill(-1);
    for (let k = 0; k < s.entries.length; k++) s.occupied[idx(s.entries[k].x, s.entries[k].y)] = k;
    s.restaff();
    return s;
  }
}

// Legality without a DOM behind it. game.js wraps this with the live state; the
// API calls it directly to check that every placement in a submitted run was
// one the player was actually allowed to make.
export function terrainProblemFor(valley, sim, x, y, kind) {
  const t = idx(x, y);
  const adj = (want) => {
    let n = 0;
    for (const nb of ring8(t)) if (nb >= 0 && valley.kind[nb] === want) n++;
    return n;
  };
  if (sim.entries.length >= MAX_BUILD) return 'the kingdom is at its limit';
  if (sim.occupied[t] !== -1) return 'occupied';
  if (valley.kind[t] === T.WATER) return 'open water';
  if (valley.kind[t] === T.ROCK || valley.kind[t] === T.ORE) return 'bare rock — build on grass';
  if (kind === K.SAWMILL && adj(T.FOREST) === 0) return 'needs forest beside it';
  if (kind === K.QUARRY && adj(T.ROCK) + adj(T.ORE) === 0) return 'needs rock beside it';
  if (kind === K.MINE && adj(T.ORE) === 0) return 'needs a seam of ore beside it';
  return null;
}
