//! MILLWRIGHT deterministic simulation core.
//!
//! This crate is compiled three times — into the Anchor program (SBF), into the
//! browser client (WASM), and into the native test binary — and every one of
//! them must produce bit-identical results from the same 288-byte blueprint.
//! That constraint is why this crate has no dependencies, no floating point, no
//! hash maps, and no iteration over unordered collections. Every loop runs over
//! an index range or an explicitly sorted slice.
//!
//! See `research/09-spec-millwright.md` §2 for the rules this implements and §3
//! for the account layouts these types serialize into.

#![no_std]
#![forbid(unsafe_code)]

pub mod blueprint;
pub mod canon;
pub mod contract;
pub mod sha256;
pub mod sim;

pub use blueprint::{Blueprint, Cell, Kind, BLUEPRINT_BYTES};
pub use contract::{Contract, Fixture, FixtureKind, Recipe, SpecKind};
pub use sim::{Outcome, RunResult, Score, Sim};

/// Grid width in v1. v2 moves to 24 inside an ephemeral rollup.
pub const GRID_W: usize = 12;
/// Grid height in v1.
pub const GRID_H: usize = 12;
/// Total addressable cells.
pub const CELLS: usize = GRID_W * GRID_H;
/// Alias used by the blueprint codec, which indexes cells rather than the grid.
pub const BLUEPRINT_CELLS: usize = CELLS;

/// Maximum simultaneous item types (A, B, C, D).
pub const ITEM_TYPES: u8 = 4;
/// Sentinel for "no item".
pub const NO_ITEM: u8 = 0xFF;

/// Hard ceiling on `component_count * tick_cap`, from the spec's §1 table.
///
/// This is the compute-unit budget re-expressed as a game rule: 40,000
/// component-ticks is roughly 880k CU of simulation against the 1.4M CU
/// per-transaction limit, leaving headroom for validation and account writes.
pub const WORK_UNIT_CAP: u32 = 40_000;

/// Maximum fixtures a contract may declare (`fixtures[72]` = 18 x 4 bytes).
pub const MAX_FIXTURES: usize = 18;
/// Maximum recipes a contract may declare (`recipes[32]` = 8 x 4 bytes).
pub const MAX_RECIPES: usize = 8;

/// Directions. Rotation is stored in 2 bits, so these are the only four values.
pub const DIR_N: u8 = 0;
pub const DIR_E: u8 = 1;
pub const DIR_S: u8 = 2;
pub const DIR_W: u8 = 3;

/// Errors from blueprint validation and simulation setup.
///
/// These are returned before any tick runs. A blueprint that validates is
/// guaranteed to simulate without panicking, which is what lets the on-chain
/// program run the VM with a fixed compute budget it can bound in advance.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VmError {
    /// Blueprint byte string was not exactly `BLUEPRINT_BYTES`.
    BadLength,
    /// Cell encoded a component kind outside the v1 palette.
    UnknownKind(u16),
    /// Player placed a component on a contract-declared obstacle.
    ObstacleCollision(u16),
    /// Player placed a component on a cell occupied by a fixture.
    FixtureCollision(u16),
    /// Component count exceeded the contract's `component_cap`.
    TooManyComponents { placed: u16, cap: u16 },
    /// `component_count * tick_cap` exceeded the work-unit budget.
    WorkUnitOverflow { units: u32, cap: u32 },
    /// A stamper named a recipe index the contract does not define.
    UnknownRecipe(u16),
    /// Contract declared a fixture outside the grid.
    FixtureOutOfBounds,
    /// Contract declared no sink, so no run could ever score.
    NoSink,
    /// Contract's spec quantity was zero.
    EmptySpec,
}

/// Convert a cell index to `(x, y)`.
#[inline]
pub const fn xy(idx: u16) -> (u8, u8) {
    ((idx as usize % GRID_W) as u8, (idx as usize / GRID_W) as u8)
}

/// Convert `(x, y)` to a cell index. Callers must bounds-check first.
#[inline]
pub const fn idx(x: u8, y: u8) -> u16 {
    (y as u16) * (GRID_W as u16) + (x as u16)
}

/// Step one cell in `dir`, returning `None` at the grid edge.
///
/// Returning `None` rather than wrapping is deliberate: a belt pointing off the
/// edge must starve, not pull from the opposite side of the board.
#[inline]
pub fn step(index: u16, dir: u8) -> Option<u16> {
    let (x, y) = xy(index);
    let (nx, ny) = match dir {
        DIR_N => (x as i16, y as i16 - 1),
        DIR_E => (x as i16 + 1, y as i16),
        DIR_S => (x as i16, y as i16 + 1),
        _ => (x as i16 - 1, y as i16),
    };
    if nx < 0 || ny < 0 || nx >= GRID_W as i16 || ny >= GRID_H as i16 {
        return None;
    }
    Some(idx(nx as u8, ny as u8))
}

/// The direction opposite `dir`.
#[inline]
pub const fn opposite(dir: u8) -> u8 {
    (dir + 2) & 3
}

/// The direction 90 degrees counter-clockwise from `dir` — a component's "left".
#[inline]
pub const fn left_of(dir: u8) -> u8 {
    (dir + 3) & 3
}

/// The direction 90 degrees clockwise from `dir` — a component's "right".
#[inline]
pub const fn right_of(dir: u8) -> u8 {
    (dir + 1) & 3
}
