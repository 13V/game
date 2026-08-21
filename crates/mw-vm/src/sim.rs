//! The deterministic simulator.
//!
//! The tick rule is the single most important thing in the game, because it is
//! what determines whether belts behave sanely. Restated from spec §2.4:
//!
//! At validation the program builds the *pull graph* — a directed edge
//! `d <- s` for every component `d` that can pull from cell `s` — and
//! topologically sorts it so that **every consumer is processed before its
//! supplier**. Cycles are broken at the lowest cell index. That fixed sequence
//! is the drain order. Sinks come first by construction; sources last.
//!
//! Because a consumer is always processed before its supplier, an entire belt
//! chain shifts one tile per tick regardless of orientation. Because pulls are
//! destination-driven and ordered, two consumers competing for one supplier
//! resolve deterministically by drain-order position.
//!
//! No floats, no hash maps, no iteration-order dependence anywhere. That is
//! what makes the WASM and SBF builds bit-identical.

use crate::blueprint::{Blueprint, Kind};
use crate::contract::{Contract, FixtureKind, Recipe};
use crate::{VmError, CELLS, NO_ITEM};

/// Runtime state of one cell.
///
/// One flat struct for every kind rather than an enum of variants: the fields
/// a given kind ignores stay zero, and in exchange the hot loop never branches
/// on a discriminant to find a field.
#[derive(Debug, Clone, Copy)]
struct CellState {
    /// Held items. BUFFER uses all four as a FIFO; every other kind uses slot 0.
    items: [u8; 4],
    /// Number of items held.
    len: u8,
    /// BUFFER FIFO head offset into `items`.
    head: u8,
    /// Extracted-this-tick bit, cleared at the top of every tick.
    extracted: bool,
    /// SPLITTER output side / MERGER input side selector: 0 = left, 1 = right.
    toggle: u8,
    /// GATE pass tokens, capped at 15.
    tokens: u8,
    /// STAMPER press ticks remaining. Zero means idle.
    press: u8,
    /// STAMPER held inputs.
    in0: u8,
    in1: u8,
    /// SOURCE: tick at which this refills. Zero means "full now".
    refill_at: u16,
}

impl CellState {
    const EMPTY: CellState = CellState {
        items: [NO_ITEM; 4],
        len: 0,
        head: 0,
        extracted: false,
        toggle: 0,
        tokens: 0,
        press: 0,
        in0: NO_ITEM,
        in1: NO_ITEM,
        refill_at: 0,
    };

    #[inline]
    fn push(&mut self, item: u8, cap: u8) -> bool {
        if self.len >= cap {
            return false;
        }
        let slot = ((self.head + self.len) % 4) as usize;
        self.items[slot] = item;
        self.len += 1;
        true
    }

    #[inline]
    fn pop(&mut self) -> u8 {
        if self.len == 0 {
            return NO_ITEM;
        }
        let item = self.items[self.head as usize];
        self.items[self.head as usize] = NO_ITEM;
        self.head = (self.head + 1) % 4;
        self.len -= 1;
        item
    }
}

/// Why a run stopped.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    /// Produced the full spec. This is the only outcome that scores.
    Success,
    /// Hit `tick_cap` without completing the spec.
    TimedOut,
    /// A full tick passed with zero item movement and zero timer activity.
    ///
    /// Reported with the tick so the client can highlight the jam. A jam is a
    /// design error, not a loss condition to be punished — surfacing *where* it
    /// stalled is most of the debugging experience.
    Deadlock { tick: u16 },
    /// The sink was handed an item the spec did not ask for, more times than
    /// `waste_allow` permits.
    Wasted { tick: u16 },
}

/// The three independent ladder axes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Score {
    /// Tick at which the final required output was accepted.
    pub cycles: u16,
    /// Area of the bounding box of placed components.
    pub footprint: u16,
    /// Sum of component prices.
    pub cost: u16,
}

/// Result of a full run.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RunResult {
    pub outcome: Outcome,
    /// Present only when `outcome == Success`.
    pub score: Option<Score>,
    /// Items accepted by sinks.
    pub produced: u16,
    /// Items rejected by sinks.
    pub waste: u16,
    /// Ticks actually simulated. Bounded by `tick_cap`, and the basis of the
    /// compute-unit estimate the program charges against its budget.
    pub ticks_run: u16,
}

/// A prepared simulation. Construct with [`Sim::new`], then call [`Sim::run`].
pub struct Sim<'a> {
    contract: &'a Contract,
    bp: &'a Blueprint,
    state: [CellState; CELLS],
    drain: [u16; CELLS],
    drain_len: usize,
    tick: u16,
    produced: u16,
    waste: u16,
    moved: bool,
    timer_activity: bool,
}

impl<'a> Sim<'a> {
    /// Validate a blueprint against a contract and build the drain order.
    ///
    /// Every rejection here happens before a single tick runs, so a caller that
    /// gets `Ok` back knows the run will terminate within `tick_cap` and cannot
    /// panic.
    pub fn new(contract: &'a Contract, bp: &'a Blueprint) -> Result<Sim<'a>, VmError> {
        contract.validate()?;

        let placed = bp.component_count();
        if placed > contract.component_cap {
            return Err(VmError::TooManyComponents { placed, cap: contract.component_cap });
        }
        let units = placed as u32 * contract.tick_cap as u32;
        if units > contract.work_unit_cap {
            return Err(VmError::WorkUnitOverflow { units, cap: contract.work_unit_cap });
        }

        for i in 0..CELLS {
            let cell = bp.cells[i];
            if cell.is_empty() {
                continue;
            }
            let index = i as u16;
            if contract.is_obstacle(index) {
                return Err(VmError::ObstacleCollision(index));
            }
            if contract.fixture_at(index).is_some() {
                return Err(VmError::FixtureCollision(index));
            }
            if matches!(cell.kind, Kind::Stamper) {
                let r = cell.param as usize;
                if r >= crate::MAX_RECIPES || contract.recipes[r].is_none() {
                    return Err(VmError::UnknownRecipe(index));
                }
            }
        }

        let mut sim = Sim {
            contract,
            bp,
            state: [CellState::EMPTY; CELLS],
            drain: [0; CELLS],
            drain_len: 0,
            tick: 0,
            produced: 0,
            waste: 0,
            moved: false,
            timer_activity: false,
        };
        sim.init_state();
        sim.build_drain_order();
        Ok(sim)
    }

    /// The drain order, for tests and for the client's debug overlay.
    pub fn drain_order(&self) -> &[u16] {
        &self.drain[..self.drain_len]
    }

    fn init_state(&mut self) {
        for i in 0..CELLS {
            let index = i as u16;
            if let Some(f) = self.contract.fixture_at(index) {
                if let FixtureKind::Source { item_type, .. } = f.kind {
                    // Sources start full, so tick 1 can draw immediately.
                    self.state[i].items[0] = item_type;
                    self.state[i].len = 1;
                }
                continue;
            }
            let cell = self.bp.cells[i];
            match cell.kind {
                Kind::Splitter | Kind::Merger => self.state[i].toggle = cell.param & 1,
                Kind::Gate => self.state[i].tokens = cell.param.min(15),
                _ => {}
            }
        }
    }

    /// Cells this cell pulls from. At most two: data and control, or two inputs.
    fn pull_sources(&self, index: u16) -> ([u16; 2], usize) {
        let i = index as usize;
        let mut out = [0u16; 2];
        let mut n = 0;

        if let Some(f) = self.contract.fixture_at(index) {
            if matches!(f.kind, FixtureKind::Sink) {
                if let Some(s) = f.inward() {
                    out[0] = s;
                    n = 1;
                }
            }
            // Sources pull from nothing, and so finish first in the DFS.
            return (out, n);
        }

        let cell = self.bp.cells[i];
        let rot = cell.rot;
        let push = |d: u8, out: &mut [u16; 2], n: &mut usize| {
            if let Some(s) = crate::step(index, d) {
                out[*n] = s;
                *n += 1;
            }
        };
        match cell.kind {
            Kind::Belt | Kind::Splitter | Kind::Buffer => {
                push(crate::opposite(rot), &mut out, &mut n);
            }
            Kind::Merger => {
                push(crate::left_of(rot), &mut out, &mut n);
                push(crate::right_of(rot), &mut out, &mut n);
            }
            Kind::Gate => {
                push(crate::opposite(rot), &mut out, &mut n);
                push(crate::left_of(rot), &mut out, &mut n);
            }
            Kind::Stamper => {
                push(crate::opposite(rot), &mut out, &mut n);
                let r = self.recipe_of(index);
                if r.map(|r| r.is_two_input()).unwrap_or(false) {
                    push(crate::left_of(rot), &mut out, &mut n);
                }
            }
            Kind::Empty => {}
        }
        (out, n)
    }

    #[inline]
    fn recipe_of(&self, index: u16) -> Option<Recipe> {
        let cell = self.bp.cells[index as usize];
        if !matches!(cell.kind, Kind::Stamper) {
            return None;
        }
        self.contract.recipes.get(cell.param as usize).copied().flatten()
    }

    #[inline]
    fn is_node(&self, index: u16) -> bool {
        self.contract.fixture_at(index).is_some() || !self.bp.cells[index as usize].is_empty()
    }

    /// Iterative DFS producing a topological order with consumers before suppliers.
    ///
    /// Start nodes are visited in ascending cell index and back edges are
    /// skipped, which is what "cycles are broken at the lowest cell index"
    /// means operationally. Recursion is avoided so the SBF stack depth stays
    /// flat regardless of chain length.
    fn build_drain_order(&mut self) {
        let mut color = [0u8; CELLS]; // 0 white, 1 gray, 2 black
        let mut finish = [0u16; CELLS];
        let mut n = 0usize;
        let mut stack = [(0u16, 0u8); CELLS];

        for start in 0..CELLS as u16 {
            if !self.is_node(start) || color[start as usize] != 0 {
                continue;
            }
            let mut sp = 0usize;
            stack[0] = (start, 0);
            color[start as usize] = 1;
            loop {
                let (node, edge) = stack[sp];
                let (srcs, ns) = self.pull_sources(node);
                if (edge as usize) < ns {
                    stack[sp].1 += 1;
                    let s = srcs[edge as usize];
                    // A gray target is a back edge: skip it, breaking the cycle.
                    if self.is_node(s) && color[s as usize] == 0 {
                        color[s as usize] = 1;
                        sp += 1;
                        stack[sp] = (s, 0);
                    }
                } else {
                    color[node as usize] = 2;
                    finish[n] = node;
                    n += 1;
                    if sp == 0 {
                        break;
                    }
                    sp -= 1;
                }
            }
        }

        // Suppliers finish before their consumers, so reverse for drain order.
        for i in 0..n {
            self.drain[i] = finish[n - 1 - i];
        }
        self.drain_len = n;
    }

    /// Attempt to take one item out of `from` on behalf of `puller`.
    ///
    /// The *supplier* decides: each kind exposes its held item on exactly one
    /// side (two, alternating, for a splitter) and may attach a condition. This
    /// is why a belt cannot be read from behind and a gate cannot be drained
    /// without tokens.
    fn try_extract(&mut self, from: u16, puller: u16) -> Option<u8> {
        let fi = from as usize;
        if self.state[fi].extracted {
            return None;
        }

        if let Some(f) = self.contract.fixture_at(from) {
            return match f.kind {
                // A source exposes its item to any adjacent puller.
                FixtureKind::Source { period, .. } => {
                    if self.state[fi].len == 0 {
                        return None;
                    }
                    let item = self.state[fi].pop();
                    self.state[fi].extracted = true;
                    self.state[fi].refill_at = self.tick.saturating_add(period as u16);
                    Some(item)
                }
                FixtureKind::Sink => None,
            };
        }

        let cell = self.bp.cells[fi];
        let rot = cell.rot;
        match cell.kind {
            Kind::Belt | Kind::Merger | Kind::Buffer => {
                if crate::step(from, rot) != Some(puller) || self.state[fi].len == 0 {
                    return None;
                }
                let item = self.state[fi].pop();
                self.state[fi].extracted = true;
                Some(item)
            }
            Kind::Gate => {
                if crate::step(from, rot) != Some(puller)
                    || self.state[fi].len == 0
                    || self.state[fi].tokens == 0
                {
                    return None;
                }
                let item = self.state[fi].pop();
                self.state[fi].tokens -= 1;
                self.state[fi].extracted = true;
                Some(item)
            }
            Kind::Splitter => {
                // Only the currently selected output may draw; selection flips
                // after each successful extraction.
                let side = if self.state[fi].toggle == 0 {
                    crate::left_of(rot)
                } else {
                    crate::right_of(rot)
                };
                if crate::step(from, side) != Some(puller) || self.state[fi].len == 0 {
                    return None;
                }
                let item = self.state[fi].pop();
                self.state[fi].toggle ^= 1;
                self.state[fi].extracted = true;
                Some(item)
            }
            Kind::Stamper => {
                if crate::step(from, rot) != Some(puller) || self.state[fi].len == 0 {
                    return None;
                }
                let item = self.state[fi].pop();
                self.state[fi].extracted = true;
                Some(item)
            }
            Kind::Empty => None,
        }
    }

    /// One component's action for this tick.
    fn act(&mut self, index: u16) {
        let i = index as usize;

        if let Some(f) = self.contract.fixture_at(index) {
            if let FixtureKind::Sink = f.kind {
                // Once the spec is met the contract is fulfilled, and a second
                // sink acting later in the same tick must not accept an
                // eleventh item against an order of ten. Without this guard
                // `produced` can overshoot `spec_qty` on a multi-sink board.
                if self.produced >= self.contract.spec_qty {
                    return;
                }
                if let Some(src) = f.inward() {
                    if let Some(item) = self.try_extract(src, index) {
                        self.moved = true;
                        if item == self.contract.required_at(self.produced) {
                            self.produced += 1;
                        } else {
                            self.waste += 1;
                        }
                    }
                }
            }
            return;
        }

        let cell = self.bp.cells[i];
        let rot = cell.rot;
        match cell.kind {
            Kind::Belt | Kind::Splitter => {
                if self.state[i].len >= cell.kind.capacity() {
                    return;
                }
                if let Some(src) = crate::step(index, crate::opposite(rot)) {
                    if let Some(item) = self.try_extract(src, index) {
                        self.state[i].push(item, cell.kind.capacity());
                        self.moved = true;
                    }
                }
            }
            Kind::Buffer => {
                if self.state[i].len >= 4 {
                    return;
                }
                if let Some(src) = crate::step(index, crate::opposite(rot)) {
                    if let Some(item) = self.try_extract(src, index) {
                        self.state[i].push(item, 4);
                        self.moved = true;
                    }
                }
            }
            Kind::Merger => {
                if self.state[i].len >= 1 {
                    return;
                }
                // Try the selected side first, then the other. Whichever side
                // yields, selection moves to the opposite one, so a merger fed
                // from both sides strictly alternates.
                let first = if self.state[i].toggle == 0 {
                    crate::left_of(rot)
                } else {
                    crate::right_of(rot)
                };
                let second = crate::opposite(first);
                for (n, d) in [first, second].into_iter().enumerate() {
                    if let Some(src) = crate::step(index, d) {
                        if let Some(item) = self.try_extract(src, index) {
                            self.state[i].push(item, 1);
                            self.state[i].toggle = if n == 0 {
                                self.state[i].toggle ^ 1
                            } else {
                                self.state[i].toggle
                            };
                            self.moved = true;
                            return;
                        }
                    }
                }
            }
            Kind::Gate => {
                // Control first: every item consumed on the left mints one pass
                // token. Then the data pull, which is independent of tokens —
                // tokens gate extraction *out* of the gate, not into it.
                if let Some(ctrl) = crate::step(index, crate::left_of(rot)) {
                    if self.state[i].tokens < 15 {
                        if self.try_extract(ctrl, index).is_some() {
                            self.state[i].tokens += 1;
                            self.moved = true;
                        }
                    }
                }
                if self.state[i].len == 0 {
                    if let Some(src) = crate::step(index, crate::opposite(rot)) {
                        if let Some(item) = self.try_extract(src, index) {
                            self.state[i].push(item, 1);
                            self.moved = true;
                        }
                    }
                }
            }
            Kind::Stamper => {
                let recipe = match self.recipe_of(index) {
                    Some(r) => r,
                    None => return,
                };
                // Output must be clear before a new press can start, but inputs
                // may be drawn on the same tick the output is extracted —
                // the front cell is earlier in drain order, so by the time the
                // stamper acts its output slot is already free.
                if self.state[i].len == 0 && self.state[i].press == 0 {
                    if self.state[i].in0 == NO_ITEM {
                        if let Some(src) = crate::step(index, crate::opposite(rot)) {
                            if let Some(item) = self.try_extract(src, index) {
                                if item == recipe.in0 {
                                    self.state[i].in0 = item;
                                    self.moved = true;
                                } else {
                                    // Wrong type: the item is destroyed rather
                                    // than jamming the machine forever.
                                    self.waste += 1;
                                    self.moved = true;
                                }
                            }
                        }
                    }
                    if recipe.is_two_input() && self.state[i].in1 == NO_ITEM {
                        if let Some(src) = crate::step(index, crate::left_of(rot)) {
                            if let Some(item) = self.try_extract(src, index) {
                                if item == recipe.in1 {
                                    self.state[i].in1 = item;
                                    self.moved = true;
                                } else {
                                    self.waste += 1;
                                    self.moved = true;
                                }
                            }
                        }
                    }
                    let ready = self.state[i].in0 != NO_ITEM
                        && (!recipe.is_two_input() || self.state[i].in1 != NO_ITEM);
                    if ready {
                        self.state[i].in0 = NO_ITEM;
                        self.state[i].in1 = NO_ITEM;
                        self.state[i].press = recipe.press_ticks.max(1);
                        self.timer_activity = true;
                    }
                }
            }
            Kind::Empty => {}
        }
    }

    /// Run to completion. Returns as soon as the spec is met, the cap is hit,
    /// the machine deadlocks, or waste exceeds the allowance.
    pub fn run(&mut self) -> RunResult {
        let cap = self.contract.tick_cap;
        loop {
            if self.tick >= cap {
                return self.result(Outcome::TimedOut);
            }
            self.tick += 1;

            // Sources refill at the start of the tick they come due, so an item
            // extracted on tick t with period K is available again on t+K.
            for i in 0..CELLS {
                if let Some(FixtureKind::Source { item_type, .. }) =
                    self.contract.fixture_at(i as u16).map(|f| f.kind)
                {
                    if self.state[i].len == 0
                        && self.state[i].refill_at != 0
                        && self.state[i].refill_at <= self.tick
                    {
                        self.state[i].items[0] = item_type;
                        self.state[i].head = 0;
                        self.state[i].len = 1;
                        self.state[i].refill_at = 0;
                        self.timer_activity = true;
                    }
                }
            }

            for i in 0..CELLS {
                self.state[i].extracted = false;
            }
            self.moved = false;
            self.timer_activity = false;

            for k in 0..self.drain_len {
                self.act(self.drain[k]);
            }

            // Presses advance at the end of the tick, so a press started on
            // tick t occupies t..t+press-1 and its output appears on t+press.
            for i in 0..CELLS {
                if self.state[i].press > 0 {
                    self.state[i].press -= 1;
                    self.timer_activity = true;
                    if self.state[i].press == 0 {
                        if let Some(r) = self.recipe_of(i as u16) {
                            self.state[i].push(r.out, 1);
                        }
                    }
                }
            }

            if self.waste > self.contract.waste_allow {
                return self.result(Outcome::Wasted { tick: self.tick });
            }
            if self.produced >= self.contract.spec_qty {
                return self.result(Outcome::Success);
            }
            if !self.moved && !self.timer_activity {
                return self.result(Outcome::Deadlock { tick: self.tick });
            }
        }
    }

    fn result(&self, outcome: Outcome) -> RunResult {
        let score = if matches!(outcome, Outcome::Success) {
            Some(Score {
                cycles: self.tick,
                footprint: self.bp.footprint(),
                cost: self.bp.cost(),
            })
        } else {
            None
        };
        RunResult {
            outcome,
            score,
            produced: self.produced,
            waste: self.waste,
            ticks_run: self.tick,
        }
    }
}
