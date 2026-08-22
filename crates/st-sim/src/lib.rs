//! STEADING deterministic simulation core.
//!
//! Same discipline as `mw-vm`, for the same reason: this crate is compiled
//! into the Anchor program (SBF), the browser client (WASM), and the native
//! test binary, and all three must produce bit-identical results from the same
//! seed and the same 600-byte plan. No dependencies, no floats, no hash maps,
//! no iteration over unordered collections — every loop runs an index range or
//! a plan-order walk.
//!
//! See `research/14-spec-steading.md` §2 for the rules this implements. The
//! spec's worked example is pinned as an acceptance test in
//! `tests/worked_example.rs`; if the two diverge, either the sim is wrong or
//! the spec changed, and both should fail a build.

#![no_std]
#![forbid(unsafe_code)]

pub mod plan;
pub mod sim;
pub mod valley;

pub use plan::{BuildingKind, Placement, Plan};
pub use sim::{scale_output, Outcome, RunResult, Sim};
pub use valley::{TileType, Valley};

/// Valley edge length. The world is `GRID × GRID` tiles.
pub const GRID: usize = 64;
/// Total tiles.
pub const TILES: usize = GRID * GRID;
/// Maximum height. Heights are 0..=15 — 4 bits, which is what lets the client
/// pack terrain however it likes without ever disagreeing with the chain.
pub const MAX_HEIGHT: u8 = 15;

/// Maximum placements in a plan: `150 × 4 B = 600 B`, inside the live
/// 1,232-byte transaction limit with room for accounts and signatures.
pub const MAX_PLACEMENTS: usize = 150;
/// Simulated season length.
pub const HORIZON_DAYS: u16 = 240;
/// Hard ceiling on `placements × horizon`, the CU budget as a game rule.
pub const BUILDING_DAY_CAP: u32 = 36_000;

/// Starting conditions, from spec §2.6.
pub const START_POP: u16 = 6;
pub const START_WOOD: u32 = 20;
pub const START_STONE: u32 = 10;
/// Deliberately lean: 15 food is two and a half days of meals for the
/// founding six. A plan that staffs its sawmill before its field starves the
/// hamlet by day 8, and a plan that feeds itself first thrives — the pantry is
/// sized so that the ordering lesson is dramatic rather than cosmetic.
pub const START_FOOD: u32 = 15;
/// Housing the founding camp provides before any cottage is built.
pub const BASE_HOUSING: u16 = 6;

/// Food surplus (after the day's meals) required for the town to grow.
pub const GROWTH_SURPLUS: u32 = 10;

/// Market-distance production scaling: `output × max(FLOOR, 20 − dist) / 20`.
///
/// The floor is why the game is bootstrappable at all. A market costs 20 wood
/// and 20 stone against a starting warehouse of 20 wood and 10 stone, so if
/// disconnected buildings produced *nothing* (as an earlier draft of the spec
/// said), the sawmill and quarry could never produce the materials for the
/// market that lets them produce. At 25% they limp; the lesson — a sawmill
/// with no market is mostly a decoration — survives intact.
pub const SCALE_DEN: u32 = 20;
pub const SCALE_FLOOR: u32 = 5;

/// Validation errors. All are raised before a single day is simulated, so a
/// plan that validates is guaranteed to run to completion within the budget —
/// the property that lets the on-chain program bound its compute in advance.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SimError {
    /// Plan byte string was not a multiple of 4 bytes.
    BadLength,
    /// More than `MAX_PLACEMENTS` entries.
    TooManyPlacements,
    /// Entry encoded a building kind outside the palette.
    UnknownKind(u8),
    /// Entry targeted a tile outside the valley.
    OutOfBounds(u8),
    /// Entry targeted open water.
    OnWater(u8),
    /// Two entries targeted the same tile.
    Overlap(u8),
    /// A building (not a road) on ground that is not flat enough: its tile and
    /// every in-bounds orthogonal neighbour must be within ±1 height.
    TooSteep(u8),
    /// `placements × horizon` exceeded the building-day budget.
    BudgetExceeded { units: u32, cap: u32 },
}

/// Convert a tile index to `(x, y)`.
#[inline]
pub const fn xy(idx: u16) -> (u8, u8) {
    ((idx as usize % GRID) as u8, (idx as usize / GRID) as u8)
}

/// Convert `(x, y)` to a tile index. Callers bounds-check first.
#[inline]
pub const fn idx(x: u8, y: u8) -> u16 {
    (y as u16) * (GRID as u16) + (x as u16)
}

/// The four orthogonal neighbours of a tile, `None` past the valley edge.
/// Fixed N/E/S/W order — iteration order is observable in BFS tie-breaks, so
/// it is specified once here and never varied.
#[inline]
pub fn orth(index: u16) -> [Option<u16>; 4] {
    let (x, y) = xy(index);
    [
        if y > 0 { Some(idx(x, y - 1)) } else { None },
        if (x as usize) < GRID - 1 { Some(idx(x + 1, y)) } else { None },
        if (y as usize) < GRID - 1 { Some(idx(x, y + 1)) } else { None },
        if x > 0 { Some(idx(x - 1, y)) } else { None },
    ]
}

/// The eight surrounding tiles, `None` past the edge. Resource adjacency
/// (a field's grass, a sawmill's forest) uses this neighbourhood.
#[inline]
pub fn ring8(index: u16) -> [Option<u16>; 8] {
    let (x, y) = xy(index);
    let mut out = [None; 8];
    let mut n = 0;
    let (xi, yi) = (x as i16, y as i16);
    let mut dy = -1i16;
    while dy <= 1 {
        let mut dx = -1i16;
        while dx <= 1 {
            if dx != 0 || dy != 0 {
                let (nx, ny) = (xi + dx, yi + dy);
                out[n] = if nx >= 0 && ny >= 0 && (nx as usize) < GRID && (ny as usize) < GRID {
                    Some(idx(nx as u8, ny as u8))
                } else {
                    None
                };
                n += 1;
            }
            dx += 1;
        }
        dy += 1;
    }
    out
}
