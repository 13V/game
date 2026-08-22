//! The season simulator: 240 days of one town, deterministically.
//!
//! The day runs in a fixed order (spec §2.4): construct, allocate labour,
//! produce, consume, grow. Every walk is in plan order or ascending tile
//! index, so there is no iteration-order dependence anywhere — the property
//! that keeps the SBF, WASM and native builds bit-identical.

use crate::plan::{BuildingKind, Plan};
use crate::valley::{TileType, Valley};
use crate::{
    orth, ring8, SimError, BASE_HOUSING, COIN_PER_EXPORT, DEFAULT_TAX, FESTIVAL_COST,
    GROWTH_SURPLUS, MAX_PLACEMENTS, SCALE_DEN, SCALE_FLOOR, START_COIN, START_FOOD, START_POP,
    START_STONE, START_WOOD, TAX_PERIOD, TILES, UNREST_EMIGRATION, UNREST_MAX, UNREST_NO_GROWTH,
};

/// Why a season ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    /// Ran the full horizon. The normal case — a famine wound is survivable.
    Completed,
    /// Population hit zero. Nothing can construct, staff, or grow, so the
    /// remaining days are skipped rather than simulated as silence.
    Extinct { day: u16 },
}

/// The three ladder axes plus the diagnostics the client renders.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RunResult {
    pub outcome: Outcome,
    /// EXPORTS: goods delivered to markets over the season.
    pub exports: u32,
    /// EFFICIENCY: `exports × 100 / peak_pop`.
    pub efficiency: u32,
    /// FOOTPRINT: tiles occupied by anything actually built, roads included.
    pub footprint: u16,
    pub peak_pop: u16,
    pub final_pop: u16,
    /// Days on which at least one villager starved. The client paints these
    /// red — famine is a design error surfaced legibly, not a punishment.
    pub famine_days: u16,
    pub days_run: u16,
    pub buildings_built: u16,
    /// Treasury at season's end.
    pub final_coin: u32,
    /// Unrest at season's end, 0..=10.
    pub final_unrest: u8,
}

/// `output × max(FLOOR, 20 − dist) / 20`, rounded UP, the market-distance
/// production scaling. Ceiling division matters: with floor division a
/// two-villager quarry at the 25% floor produces `2 × 5 / 20 = 0` stone
/// forever, and the town can never afford the market that would connect it.
/// Rounding up guarantees any staffed producer with any resource makes at
/// least one unit a day — limping, not dead.
#[inline]
pub fn scale_output(base: u32, dist: u32) -> u32 {
    if base == 0 {
        return 0;
    }
    let factor = (SCALE_DEN - dist.min(SCALE_DEN)).max(SCALE_FLOOR);
    (base * factor + SCALE_DEN - 1) / SCALE_DEN
}

/// Unreachable marker in the road-distance field.
const UNREACHABLE: u8 = u8::MAX;

/// A prepared season. Construct with [`Sim::new`], then call [`Sim::run`].
pub struct Sim<'a> {
    valley: &'a Valley,
    plan: &'a Plan,
    horizon: u16,
    /// Plan index + 1 for every planned tile, 0 for none. Reserved at
    /// validation for the whole plan; whether the occupant is *built* is a
    /// separate question asked via `built`.
    occupied: [u8; TILES],
    built: [bool; MAX_PLACEMENTS],
    staff: [u16; MAX_PLACEMENTS],
    /// BFS distance over built road tiles from the nearest built market.
    dist: [u8; TILES],
    dist_dirty: bool,
    wood: u32,
    stone: u32,
    ore: u32,
    food: u32,
    goods: u32,
    coin: u32,
    unrest: u8,
    tax: u8,
    /// Whether anyone has starved since the last collection. A fed decade is
    /// forgiven a point of unrest; a hungry one is not.
    famine_since_tax: bool,
    pop: u16,
    peak_pop: u16,
    famine_days: u16,
    exports: u32,
    day: u16,
}

impl<'a> Sim<'a> {
    /// Validate a plan against a valley. Every rejection happens before a
    /// single day runs; `Ok` guarantees the run terminates within the budget
    /// and cannot panic.
    pub fn new(valley: &'a Valley, plan: &'a Plan, horizon: u16) -> Result<Sim<'a>, SimError> {
        let units = plan.len() as u32 * horizon as u32;
        if units > crate::BUILDING_DAY_CAP {
            return Err(SimError::BudgetExceeded { units, cap: crate::BUILDING_DAY_CAP });
        }

        let mut occupied = [0u8; TILES];
        let mut built = [false; MAX_PLACEMENTS];
        let mut i = 0;
        while i < plan.len() {
            let p = plan.get(i);
            if p.kind == BuildingKind::Decree {
                // No tile, no geometry — but the order must parse: type 0
                // (set tax, value 0..=3) or type 1 (festival).
                let (dk, dv) = p.decree_order();
                if dk > 1 || (dk == 0 && dv > 3) {
                    return Err(SimError::BadDecree(i as u8));
                }
                // Marked built so the construction queue never sees it; it
                // fires when its day arrives.
                built[i] = true;
                i += 1;
                continue;
            }
            let t = p.index() as usize;
            if valley.kind[t] == TileType::Water {
                return Err(SimError::OnWater(i as u8));
            }
            if occupied[t] != 0 {
                return Err(SimError::Overlap(i as u8));
            }
            if p.kind.needs_flat() {
                let h = valley.height[t] as i16;
                for n in orth(p.index()).into_iter().flatten() {
                    if (valley.height[n as usize] as i16 - h).abs() > 1 {
                        return Err(SimError::TooSteep(i as u8));
                    }
                }
            }
            occupied[t] = (i + 1) as u8;
            i += 1;
        }

        Ok(Sim {
            valley,
            plan,
            horizon,
            occupied,
            built,
            staff: [0; MAX_PLACEMENTS],
            dist: [UNREACHABLE; TILES],
            dist_dirty: false,
            wood: START_WOOD,
            stone: START_STONE,
            ore: 0,
            food: START_FOOD,
            goods: 0,
            coin: START_COIN,
            unrest: 0,
            tax: DEFAULT_TAX,
            famine_since_tax: false,
            pop: START_POP,
            peak_pop: START_POP,
            famine_days: 0,
            exports: 0,
            day: 0,
        })
    }

    /// Housing capacity: the founding camp plus 4 per built cottage.
    fn capacity(&self) -> u16 {
        let mut cap = BASE_HOUSING;
        let mut i = 0;
        while i < self.plan.len() {
            if self.built[i] && self.plan.get(i).kind == BuildingKind::Cottage {
                cap += 4;
            }
            i += 1;
        }
        cap
    }

    /// Count of 8-ring neighbours of `index` with terrain `t` and no *built*
    /// structure on them. A planned-but-unbuilt tile still counts as open
    /// ground; a built road over grass does not feed a field.
    fn adjacent(&self, index: u16, t: TileType) -> u32 {
        let mut n = 0;
        for nb in ring8(index).into_iter().flatten() {
            let ti = nb as usize;
            let occ = self.occupied[ti];
            let blocked = occ != 0 && self.built[occ as usize - 1];
            if self.valley.kind[ti] == t && !blocked {
                n += 1;
            }
        }
        n
    }

    /// Multi-source BFS from every built market across built road tiles.
    /// Edges connect orthogonally adjacent roads within ±1 height — roads
    /// climb, but not cliffs. Recomputed only when a road or market is built.
    fn recompute_distances(&mut self) {
        self.dist = [UNREACHABLE; TILES];
        let mut queue = [0u16; TILES];
        let mut head = 0usize;
        let mut tail = 0usize;

        // Seed: built road tiles orthogonally adjacent to a built market, at
        // distance 1. (A building directly beside a market scores distance 0
        // in `market_distance` without touching this field.)
        let mut i = 0;
        while i < self.plan.len() {
            if self.built[i] && self.plan.get(i).kind == BuildingKind::Market {
                for nb in orth(self.plan.get(i).index()).into_iter().flatten() {
                    let ti = nb as usize;
                    let occ = self.occupied[ti];
                    if occ != 0
                        && self.built[occ as usize - 1]
                        && self.plan.get(occ as usize - 1).kind == BuildingKind::Road
                        && self.dist[ti] == UNREACHABLE
                    {
                        self.dist[ti] = 1;
                        queue[tail] = nb;
                        tail += 1;
                    }
                }
            }
            i += 1;
        }

        while head < tail {
            let cur = queue[head];
            head += 1;
            let d = self.dist[cur as usize];
            if d >= UNREACHABLE - 1 {
                continue;
            }
            let h = self.valley.height[cur as usize] as i16;
            for nb in orth(cur).into_iter().flatten() {
                let ti = nb as usize;
                let occ = self.occupied[ti];
                let is_road = occ != 0
                    && self.built[occ as usize - 1]
                    && self.plan.get(occ as usize - 1).kind == BuildingKind::Road;
                if is_road
                    && self.dist[ti] == UNREACHABLE
                    && (self.valley.height[ti] as i16 - h).abs() <= 1
                {
                    self.dist[ti] = d + 1;
                    queue[tail] = nb;
                    tail += 1;
                }
            }
        }
    }

    /// Road distance from a building to the nearest market: 0 if directly
    /// beside one, else best adjacent road's distance, else unreachable.
    fn market_distance(&self, index: u16) -> u32 {
        let mut best = UNREACHABLE as u32;
        for nb in orth(index).into_iter().flatten() {
            let ti = nb as usize;
            let occ = self.occupied[ti];
            if occ != 0 && self.built[occ as usize - 1] {
                match self.plan.get(occ as usize - 1).kind {
                    BuildingKind::Market => return 0,
                    BuildingKind::Road if self.dist[ti] != UNREACHABLE => {
                        let d = self.dist[ti] as u32;
                        if d < best {
                            best = d;
                        }
                    }
                    _ => {}
                }
            }
        }
        best
    }


    /// Run the season.
    pub fn run(&mut self) -> RunResult {
        while self.day < self.horizon {
            self.day += 1;

            // 0. Decrees whose day has come, in plan order. Government moves
            //    before the workmen do.
            let mut i = 0;
            while i < self.plan.len() {
                let p = self.plan.get(i);
                if p.kind == BuildingKind::Decree && p.decree_day() == self.day {
                    match p.decree_order() {
                        (0, rate) => self.tax = rate,
                        (1, _) => {
                            // A festival the treasury cannot pay for simply
                            // does not happen — decrees never block the queue.
                            if self.coin >= FESTIVAL_COST {
                                self.coin -= FESTIVAL_COST;
                                self.unrest = self.unrest.saturating_sub(3);
                            }
                        }
                        _ => {}
                    }
                }
                i += 1;
            }

            // 0b. Tax day, every tenth day. The rate is the whole politics of
            //     the game in one number: 0 is relief the villagers remember,
            //     2 and 3 are resented in proportion.
            if self.day % TAX_PERIOD == 0 {
                self.coin += self.pop as u32 * self.tax as u32;
                // A decade nobody starved in is forgiven a point of unrest —
                // without this, any sustained rate above 1 is a death
                // sentence instead of a price. Rate 2 on a well-fed realm
                // nets zero: a sustainable squeeze. Rate 3 nets +1: a loan
                // against the people's patience that must be repaid with
                // relief or festivals.
                if !self.famine_since_tax {
                    self.unrest = self.unrest.saturating_sub(1);
                }
                self.famine_since_tax = false;
                match self.tax {
                    0 => self.unrest = self.unrest.saturating_sub(1),
                    2 => self.unrest = (self.unrest + 1).min(UNREST_MAX),
                    3 => self.unrest = (self.unrest + 2).min(UNREST_MAX),
                    _ => {}
                }
            }

            // 1. Construct: the first unbuilt entry, if affordable, one per
            //    day. An unaffordable entry BLOCKS — ordering a market before
            //    your sawmill stalls the whole town, which is a real and
            //    instructive mistake, not a bug. Building needs hands: an
            //    extinct or momentarily empty town constructs nothing.
            if self.pop > 0 {
                let mut i = 0;
                while i < self.plan.len() {
                    if !self.built[i] {
                        let (w, s, c) = self.plan.get(i).kind.cost();
                        if self.wood >= w && self.stone >= s && self.coin >= c {
                            self.wood -= w;
                            self.stone -= s;
                            self.coin -= c;
                            self.built[i] = true;
                            if matches!(
                                self.plan.get(i).kind,
                                BuildingKind::Road | BuildingKind::Market
                            ) {
                                self.dist_dirty = true;
                            }
                        }
                        break;
                    }
                    i += 1;
                }
            }

            if self.dist_dirty {
                self.recompute_distances();
                self.dist_dirty = false;
            }

            // 2. Allocate labour in plan order until villagers run out.
            let mut idle = self.pop;
            let mut i = 0;
            while i < self.plan.len() {
                self.staff[i] = if self.built[i] {
                    let take = self.plan.get(i).kind.staff_cap().min(idle);
                    idle -= take;
                    take
                } else {
                    0
                };
                i += 1;
            }

            // 3. Produce, in plan order. The warehouse updates as the walk
            //    goes, so a smithy listed after a sawmill uses today's wood —
            //    one more way list order is strategy.
            let mut i = 0;
            while i < self.plan.len() {
                if !self.built[i] || self.staff[i] == 0 {
                    i += 1;
                    continue;
                }
                let p = self.plan.get(i);
                let staff = self.staff[i] as u32;
                let at = p.index();
                match p.kind {
                    BuildingKind::Field => {
                        // Food is eaten at home: never market-scaled.
                        self.food += staff.min(self.adjacent(at, TileType::Grass)) * 2;
                    }
                    BuildingKind::Sawmill => {
                        let base = staff.min(self.adjacent(at, TileType::Forest));
                        self.wood += scale_output(base, self.market_distance(at));
                    }
                    BuildingKind::Quarry => {
                        let base = staff.min(self.adjacent(at, TileType::Rock));
                        self.stone += scale_output(base, self.market_distance(at));
                    }
                    BuildingKind::Mine => {
                        let base = staff.min(self.adjacent(at, TileType::Ore));
                        self.ore += scale_output(base, self.market_distance(at));
                    }
                    BuildingKind::Smithy => {
                        // Consume exactly what the scaled output needs — a
                        // disconnected smithy is slow, not wasteful.
                        let n = scale_output(
                            staff.min(self.wood).min(self.ore),
                            self.market_distance(at),
                        );
                        self.wood -= n;
                        self.ore -= n;
                        self.goods += n;
                    }
                    BuildingKind::Market => {
                        let e = (staff * 2).min(self.goods);
                        self.goods -= e;
                        self.exports += e;
                        self.coin += e * COIN_PER_EXPORT;
                    }
                    BuildingKind::Cottage | BuildingKind::Road | BuildingKind::Decree => {}
                }
                i += 1;
            }

            // 4. Consume: one food per villager; the shortfall starves.
            let need = self.pop as u32;
            if self.food >= need {
                self.food -= need;
            } else {
                let short = (need - self.food) as u16;
                self.food = 0;
                self.pop -= short.min(self.pop);
                self.famine_days += 1;
                self.unrest = (self.unrest + 1).min(UNREST_MAX);
                self.famine_since_tax = true;
            }

            // 4b. Emigration: a realm in open revolt loses a villager a day.
            //     They walk out fed — this is politics, not famine.
            if self.unrest >= UNREST_EMIGRATION && self.pop > 0 {
                self.pop -= 1;
            }

            if self.pop == 0 {
                return self.result(Outcome::Extinct { day: self.day });
            }

            // 5. Grow: surplus after meals, a free bed, and a calm realm —
            //    nobody settles in a town on the edge of revolt.
            if self.unrest < UNREST_NO_GROWTH
                && self.food >= GROWTH_SURPLUS
                && self.pop < self.capacity()
            {
                self.pop += 1;
                if self.pop > self.peak_pop {
                    self.peak_pop = self.pop;
                }
            }
        }
        self.result(Outcome::Completed)
    }

    fn result(&self, outcome: Outcome) -> RunResult {
        let mut footprint = 0u16;
        let mut built_count = 0u16;
        let mut i = 0;
        while i < self.plan.len() {
            // Decrees are pre-marked built so the queue skips them; they are
            // government, not masonry, and count toward nothing spatial.
            if self.built[i] && self.plan.get(i).kind != BuildingKind::Decree {
                footprint += 1;
                built_count += 1;
            }
            i += 1;
        }
        RunResult {
            outcome,
            exports: self.exports,
            efficiency: self.exports * 100 / self.peak_pop.max(1) as u32,
            footprint,
            peak_pop: self.peak_pop,
            final_pop: self.pop,
            famine_days: self.famine_days,
            days_run: self.day,
            buildings_built: built_count,
            final_coin: self.coin,
            final_unrest: self.unrest,
        }
    }
}
