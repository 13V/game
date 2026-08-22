//! Valley generation: 64 × 64 tiles of height and terrain from a 32-byte seed.
//!
//! The valley is never stored in an account and never transmitted — it *is*
//! the seed, regenerated identically by the chain and the client. That is only
//! safe because everything here is integer arithmetic over a fixed lattice:
//! value noise with an integer hash, bilinear interpolation in fixed point,
//! and thresholds. No floats, no permutation tables loaded from anywhere.

use crate::{GRID, MAX_HEIGHT, TILES};

/// Terrain type of one tile.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum TileType {
    Grass = 0,
    Forest = 1,
    Rock = 2,
    Ore = 3,
    Water = 4,
}

/// A generated valley. Fields are public so tests can hand-build synthetic
/// terrain — the worked-example test wants a known shelf and forest, not
/// whatever a seed happens to produce.
#[derive(Clone)]
pub struct Valley {
    pub height: [u8; TILES],
    pub kind: [TileType; TILES],
}

/// Murmur3-style finalizer. Wrapping integer ops only — portable across SBF,
/// WASM and native by construction.
#[inline]
fn mix(mut h: u32) -> u32 {
    h ^= h >> 16;
    h = h.wrapping_mul(0x85eb_ca6b);
    h ^= h >> 13;
    h = h.wrapping_mul(0xc2b2_ae35);
    h ^= h >> 16;
    h
}

/// Fold the 32-byte season seed into one u32 the lattice hash keys on.
fn fold_seed(seed: &[u8; 32]) -> u32 {
    let mut s = 0x9e37_79b9u32;
    let mut i = 0;
    while i < 32 {
        s = mix(s ^ u32::from_le_bytes([seed[i], seed[i + 1], seed[i + 2], seed[i + 3]]));
        i += 4;
    }
    s
}

/// Pseudorandom 0..=255 at a lattice point.
#[inline]
fn lattice(fs: u32, gx: u32, gy: u32, salt: u32) -> i32 {
    (mix(fs ^ salt ^ mix(gx.wrapping_mul(0x27d4_eb2f)).wrapping_add(mix(gy.wrapping_mul(0x1656_67b1)))) & 0xFF)
        as i32
}

/// Integer bilinear value noise, 0..=255.
fn value_noise(fs: u32, x: usize, y: usize, scale: usize, salt: u32) -> i32 {
    let (gx, gy) = ((x / scale) as u32, (y / scale) as u32);
    let fx = ((x % scale) * 256 / scale) as i32;
    let fy = ((y % scale) * 256 / scale) as i32;
    let c00 = lattice(fs, gx, gy, salt);
    let c10 = lattice(fs, gx + 1, gy, salt);
    let c01 = lattice(fs, gx, gy + 1, salt);
    let c11 = lattice(fs, gx + 1, gy + 1, salt);
    let top = c00 * (256 - fx) + c10 * fx;
    let bot = c01 * (256 - fx) + c11 * fx;
    (top * (256 - fy) + bot * fy) / (256 * 256)
}

const SALT_HEIGHT_A: u32 = 0x48_45_41;
const SALT_HEIGHT_B: u32 = 0x48_45_42;
const SALT_HEIGHT_C: u32 = 0x48_45_43;
const SALT_MOISTURE: u32 = 0x4d_4f_49;
const SALT_ORE: u32 = 0x4f_52_45;

/// Generate the valley for a season seed.
///
/// Tuning targets (asserted loosely in `tests/valley.rs`): grass is the
/// plurality, forest is common, water carves real barriers, rock rims the
/// heights, and ore is a scarce sprinkle inside rock. Thresholds are part of
/// the consensus rules — changing any constant here is a new season format.
pub fn generate(seed: &[u8; 32]) -> Valley {
    let fs = fold_seed(seed);
    let mut v = Valley { height: [0; TILES], kind: [TileType::Grass; TILES] };

    let mut i = 0usize;
    while i < TILES {
        let (x, y) = (i % GRID, i / GRID);

        // Three octaves, weighted 4/2/1 → 0..=1785. Summing octaves
        // concentrates values near the mean (central limit), which would
        // leave water and rock nearly nonexistent — so stretch contrast ×2
        // around the midpoint before mapping to 0..=15, pushing real basins
        // below the waterline and real peaks above the rock line.
        let n = value_noise(fs, x, y, 16, SALT_HEIGHT_A) * 4
            + value_noise(fs, x, y, 8, SALT_HEIGHT_B) * 2
            + value_noise(fs, x, y, 4, SALT_HEIGHT_C);
        let stretched = ((n - 893) * 2 + 893).clamp(0, 1785);
        let h = (stretched * (MAX_HEIGHT as i32 + 1) / 1786).min(MAX_HEIGHT as i32) as u8;
        v.height[i] = h;

        let moisture = value_noise(fs, x, y, 10, SALT_MOISTURE);
        v.kind[i] = if h <= 1 {
            TileType::Water
        } else if h >= 11 {
            // Peaks are rock; roughly one rock tile in eight hides ore.
            if mix(fs ^ SALT_ORE ^ (i as u32)) & 7 == 0 {
                TileType::Ore
            } else {
                TileType::Rock
            }
        } else if moisture >= 150 {
            TileType::Forest
        } else {
            TileType::Grass
        };
        i += 1;
    }
    v
}
