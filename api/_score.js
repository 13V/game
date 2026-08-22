// Re-runs a submitted reign from its own record of what the player did, using
// the very same rules file the browser played by, and reports what it actually
// scored. Nothing the client says about its own result is believed.
import { generateValley, seedFromString, idx, GRID } from '../web/sim.js';
import { SimpleSim, B, KIND_ORDER, K_CHAPEL, TRADE, terrainProblemFor, MAX_BUILD } from '../web/rules.js';

export const MAX_ACTS = 4000, MAX_DAYS = 600;

// Peak folk carries the reign; gold is the tie-break. One sentence to explain,
// which is what a competition score has to be.
export const scoreOf = (sim) => sim.peakPop * 1000 + Math.max(0, sim.gold);

export function replay(seed, acts) {
  if (typeof seed !== 'string' || seed.length > 64) return { error: 'bad seed' };
  if (!Array.isArray(acts) || acts.length > MAX_ACTS) return { error: 'bad record' };

  const valley = generateValley(seedFromString(seed));
  const sim = new SimpleSim(valley);
  const kinds = new Set([...KIND_ORDER, K_CHAPEL]);

  let lastDay = 0;
  for (const a of acts) {
    if (!Array.isArray(a) || typeof a[0] !== 'number' || a[0] < 0 || a[0] > MAX_DAYS) return { error: 'bad act' };
    if (a[0] < lastDay) return { error: 'the record is out of order' };
    lastDay = a[0];
  }

  const byDay = new Map();
  for (const a of acts) {
    if (!byDay.has(a[0])) byDay.set(a[0], []);
    byDay.get(a[0]).push(a);
  }

  for (let day = 0; day <= lastDay; day++) {
    for (const a of byDay.get(day) || []) {
      const [, op, p1, p2, p3] = a;
      if (op === 'b') {
        if (!kinds.has(p3)) return { error: 'no such building' };
        if (p1 < 0 || p2 < 0 || p1 >= GRID || p2 >= GRID) return { error: 'off the island' };
        // every placement has to be one the player was actually allowed to make
        if (terrainProblemFor(valley, sim, p1, p2, p3)) return { error: 'illegal placement' };
        if (sim.place(p1, p2, p3)) return { error: 'could not afford it' };
      } else if (op === 'x') {
        sim.demolish(p1, p2);
      } else if (op === 't') {
        if (p1 === 0 || p1 === 1 || p1 === 2) sim.setTax(p1);
      } else if (op === 'f') {
        sim.festival();
      } else if (op === 'y') {
        const t = TRADE[p1];
        if (t) sim.buy(t.id);
      } else if (op === 'e') {
        // an event answer only lands if that event was really pending that day
        const ev = sim.evId;
        if (ev) sim.answerEvent(p1);
      } else {
        return { error: 'unknown act' };
      }
    }
    if (sim.fallen) break;
    sim.stepDay();
    sim.rollEvent();
  }
  return { sim, score: scoreOf(sim), days: sim.day, peakPop: sim.peakPop, gold: sim.gold };
}
