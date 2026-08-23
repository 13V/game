// DELVE — the server's half of the daily board, and nothing else.
//
// A submitted delve is A RECORD OF WHAT THE PLAYER DID — the day, their moves,
// and what they walked in with. The server replays that record through the
// same rules file the browser played by and works everything out itself:
// score, depth, whether they got out, where they died. The claim the client
// sends along is only a checksum — if it disagrees with the replay, either
// the client is stale or somebody is lying, and either way the row is refused.
//
// What this does NOT verify is the loadout itself: names on the board are not
// wallets, so the server cannot know whether this player really owned that
// mythic spear. It verifies the score is HONESTLY ACHIEVABLE with the declared
// loadout — the same bar the rest of the repo sets before real accounts exist.
import { replay, GEN_VERSION, WEAPONS, ARMOURS, TIERS, CLASSES } from '../delve/rules.js';

export const DAILY = (day) => `daily-${day}`;

// today and yesterday, UTC — a run finished just past midnight still counts
// for the day it was begun.
export function daysOpen(now = new Date()) {
  const d = (t) => new Date(t).toISOString().slice(0, 10);
  return [d(now), d(now.getTime() - 86400000)];
}

export const nameOk = (n) =>
  typeof n === 'string' && /^[A-Za-z0-9][A-Za-z0-9 _.\-]{0,22}[A-Za-z0-9]$/.test(n);

// The only charm each form can be — a client cannot staple 'guard' onto a fang.
const CHARM_EFFECTS = { fang: 'bite', crown: 'vigour', ward: 'guard', draught: 'mend', coin: 'luck' };

// Rebuild one loadout slot from whitelisted parts. The id is kept as sent —
// re-equipping the weapon you walked in with references it by id mid-run, so
// inventing a new one would break honest replays. Everything the rules READ
// (slot, form, tier, effect) is rebuilt from the whitelist, never trusted.
function cleanGear(g, slot, klass) {
  if (g == null) return null;
  if (typeof g !== 'object') return undefined;
  const forms = slot === 'weapon' ? WEAPONS : slot === 'armour' ? ARMOURS : CHARM_EFFECTS;
  if (!Object.prototype.hasOwnProperty.call(forms, g.form)) return undefined;
  // a weapon has a calling, and it must be this player's — the rules would
  // silently swap it, and then the claim would not match the replay
  if (slot === 'weapon' && WEAPONS[g.form].klass !== klass) return undefined;
  if (!TIERS.includes(g.tier)) return undefined;
  return {
    id: typeof g.id === 'string' && g.id.length <= 48 ? g.id : `${slot}-0`,
    slot,
    form: g.form,
    tier: g.tier,
    name: (typeof g.name === 'string' ? g.name.replace(/[^\w \-'.]/g, '') : g.form).slice(0, 40) || g.form,
    effect: slot === 'charm' ? CHARM_EFFECTS[g.form] : 'none',
    owned: true,
  };
}

const ACT_KINDS = new Set(['w', 'd', 'x', 'e', 'm', 'r']);
// An act is rebuilt, never passed through: the stored record is exactly
// {t, d?, id?} and nothing else, so a client cannot ride kilobytes of junk
// into the table inside its own moves.
function cleanAct(a) {
  if (!a || typeof a !== 'object' || !ACT_KINDS.has(a.t)) return null;
  if (a.t === 'm' || a.t === 'r') {
    if (!(Number.isInteger(a.d) && a.d >= 0 && a.d <= 3)) return null;
    return { t: a.t, d: a.d };
  }
  if (a.t === 'e') {
    if (!(typeof a.id === 'string' && a.id.length <= 48)) return null;
    return { t: 'e', id: a.id };
  }
  return { t: a.t };
}

// The whole gate, in one pure function, so the checks can run it without a
// server. Returns { error, status } or { row }.
export function verifyDelveRun(body, now = new Date()) {
  const { day, name, acts, loadout, claim } = body || {};
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return { error: 'bad day', status: 400 };
  if (!daysOpen(now).includes(day)) return { error: 'that day is closed — delve today\'s dungeon', status: 400 };
  if (!nameOk(name)) return { error: 'a name is 2–24 plain characters', status: 400 };
  if (!Array.isArray(acts) || acts.length === 0 || acts.length > 4000) return { error: 'bad record', status: 400 };
  const record = acts.map(cleanAct);
  if (record.some((a) => a === null)) return { error: 'bad record', status: 400 };

  let kit = null;
  let klass = 'warden';
  if (loadout != null) {
    if (typeof loadout !== 'object') return { error: 'bad loadout', status: 400 };
    if (loadout.class != null && !Object.prototype.hasOwnProperty.call(CLASSES, loadout.class)) {
      return { error: 'that is not a calling', status: 400 };
    }
    klass = loadout.class || 'warden';
    kit = {
      class: klass,
      weapon: cleanGear(loadout.weapon, 'weapon', klass),
      armour: cleanGear(loadout.armour, 'armour', klass),
      charm: cleanGear(loadout.charm, 'charm', klass),
    };
    if (Object.values(kit).some((g) => g === undefined)) return { error: 'bad loadout', status: 400 };
  }

  // the cheap refusals come before the expensive replay
  if (claim && typeof claim === 'object' && claim.gen !== GEN_VERSION) {
    return { error: `stale rules — the page plays gen ${claim.gen}, the server gen ${GEN_VERSION}. Reload.`, status: 409 };
  }

  const res = replay(DAILY(day), record, kit);
  if (res.error) return { error: `the record does not replay: ${res.error}`, status: 422 };
  const { run, summary } = res;
  if (!run.over) return { error: 'the delve is not finished — die or get out first', status: 422 };
  // the record is the run, exactly: acts past the end were never played, and a
  // stored record must re-verify to itself forever
  if (run.acts.length !== record.length) return { error: 'the record continues after the delve ended', status: 422 };

  if (claim && typeof claim === 'object'
    && (claim.score !== summary.score || claim.depth !== summary.depth || Boolean(claim.out) !== summary.out)) {
    return { error: 'the claim does not match the replay', status: 422 };
  }

  return {
    row: {
      day,
      name,
      score: summary.score,
      depth: summary.depth,
      out: summary.out,
      felled: summary.felled,
      turns: summary.turns,
      died_depth: summary.out ? null : run.depth,
      died_x: summary.out ? null : run.x,
      died_y: summary.out ? null : run.y,
      gear: summary.loadout,
      acts: record,
    },
  };
}
