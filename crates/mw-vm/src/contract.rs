//! Contract parameters: the weekly puzzle, as generated on-chain from a
//! pre-committed seed.
//!
//! Nothing here is authored by hand after week 4. `open_contract` derives these
//! fields from a seed whose hash was committed before anyone played, which is
//! what makes the puzzle symmetric — every player receives the bit-identical
//! contract, published before play. See spec §3.2 and §4.

use crate::{VmError, MAX_FIXTURES, MAX_RECIPES};

/// What a contract asks the player to produce.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SpecKind {
    /// `qty` items, all of one type. `pattern[0]` names the type.
    Uniform,
    /// `qty` items cycling through `pattern[0..pattern_len]` in order.
    ///
    /// This is the mode that makes output *ordering* the bottleneck rather than
    /// throughput, and flipping between the two regimes by generator parameter
    /// is what stops the metagame converging.
    Sequence,
}

/// A contract-declared fixture: a source of items or a sink that consumes them.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FixtureKind {
    /// Holds one item of `item_type`, refilling `period` ticks after extraction.
    Source { item_type: u8, period: u8 },
    /// Pulls from its inward neighbour every tick.
    Sink,
}

/// A fixture placed on the grid. Fixtures are not player-placeable or removable
/// and do not count toward FOOTPRINT or COST.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Fixture {
    pub kind: FixtureKind,
    pub x: u8,
    pub y: u8,
}

impl Fixture {
    /// Cell index this fixture occupies.
    #[inline]
    pub fn index(&self) -> u16 {
        crate::idx(self.x, self.y)
    }

    /// The neighbouring cell a sink pulls from, or a source is drained into.
    ///
    /// Fixtures carry no rotation byte — the wire format is `(kind, x, y,
    /// param)` and `param` is spent on item type and period. So "inward" is
    /// derived from position: a fixture on an edge faces the interior. A
    /// fixture not on any edge has no unambiguous inward direction and is
    /// rejected by `Contract::validate`.
    pub fn inward(&self) -> Option<u16> {
        let dir = if self.x == 0 {
            crate::DIR_E
        } else if self.x as usize == crate::GRID_W - 1 {
            crate::DIR_W
        } else if self.y == 0 {
            crate::DIR_S
        } else if self.y as usize == crate::GRID_H - 1 {
            crate::DIR_N
        } else {
            return None;
        };
        crate::step(self.index(), dir)
    }
}

/// A crafting recipe. `in1 == NO_ITEM` marks a single-input recipe.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Recipe {
    pub in0: u8,
    pub in1: u8,
    pub out: u8,
    /// Ticks the stamper is occupied pressing. Spec range 2..=8.
    pub press_ticks: u8,
}

impl Recipe {
    #[inline]
    pub fn is_two_input(&self) -> bool {
        self.in1 != crate::NO_ITEM
    }
}

/// The full weekly contract.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Contract {
    pub id: u16,
    pub tick_cap: u16,
    pub component_cap: u16,
    pub work_unit_cap: u32,
    pub fixtures: [Option<Fixture>; MAX_FIXTURES],
    pub recipes: [Option<Recipe>; MAX_RECIPES],
    pub spec_kind: SpecKind,
    pub spec_qty: u16,
    pub spec_pattern: [u8; 8],
    pub spec_pattern_len: u8,
    /// 144 bits, one per cell. Set means unplaceable terrain.
    pub obstacle_mask: [u8; 18],
    pub waste_allow: u16,
}

impl Default for Contract {
    fn default() -> Self {
        Contract {
            id: 0,
            tick_cap: 400,
            component_cap: 100,
            work_unit_cap: crate::WORK_UNIT_CAP,
            fixtures: [None; MAX_FIXTURES],
            recipes: [None; MAX_RECIPES],
            spec_kind: SpecKind::Uniform,
            spec_qty: 1,
            spec_pattern: [0; 8],
            spec_pattern_len: 1,
            obstacle_mask: [0; 18],
            waste_allow: 0,
        }
    }
}

impl Contract {
    /// Whether a cell is contract-declared terrain.
    #[inline]
    pub fn is_obstacle(&self, index: u16) -> bool {
        let i = index as usize;
        (self.obstacle_mask[i / 8] >> (i % 8)) & 1 == 1
    }

    /// Mark a cell as terrain. Used by the generator and by tests.
    pub fn set_obstacle(&mut self, index: u16) {
        let i = index as usize;
        self.obstacle_mask[i / 8] |= 1 << (i % 8);
    }

    /// The fixture occupying `index`, if any.
    pub fn fixture_at(&self, index: u16) -> Option<Fixture> {
        for f in self.fixtures.iter().flatten() {
            if f.index() == index {
                return Some(*f);
            }
        }
        None
    }

    /// The item type the sink expects for the `n`-th accepted output.
    ///
    /// `n` is zero-based over accepted outputs, so `required_at(0)` is the first
    /// item the sink will take.
    pub fn required_at(&self, n: u16) -> u8 {
        match self.spec_kind {
            SpecKind::Uniform => self.spec_pattern[0],
            SpecKind::Sequence => {
                let len = self.spec_pattern_len.max(1) as u16;
                self.spec_pattern[(n % len) as usize]
            }
        }
    }

    /// Check the contract itself is coherent, independent of any blueprint.
    ///
    /// Called by the generator's vetting predicate before a contract is opened,
    /// so a seed that produces an unplayable puzzle is skipped on-chain rather
    /// than shipped to players.
    pub fn validate(&self) -> Result<(), VmError> {
        if self.spec_qty == 0 {
            return Err(VmError::EmptySpec);
        }
        let mut has_sink = false;
        for f in self.fixtures.iter().flatten() {
            if f.x as usize >= crate::GRID_W || f.y as usize >= crate::GRID_H {
                return Err(VmError::FixtureOutOfBounds);
            }
            // A fixture that is not on an edge has no unambiguous inward cell.
            if f.inward().is_none() {
                return Err(VmError::FixtureOutOfBounds);
            }
            if matches!(f.kind, FixtureKind::Sink) {
                has_sink = true;
            }
        }
        if !has_sink {
            return Err(VmError::NoSink);
        }
        Ok(())
    }
}
