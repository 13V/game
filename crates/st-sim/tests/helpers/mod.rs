//! Shared test terrain: hand-built valleys with known geography, because the
//! worked example wants a specific shelf and forest, not whatever a seed
//! happens to produce. Synthetic valleys are also how the rules get tested in
//! isolation from the generator.

use st_sim::valley::{TileType, Valley};
use st_sim::{idx, TILES};

/// A flat grass plain at height 3 — the neutral canvas every rules test
/// starts from.
pub fn flat_grass() -> Valley {
    Valley { height: [3; TILES], kind: [TileType::Grass; TILES] }
}

pub fn set(v: &mut Valley, tiles: &[(u8, u8)], t: TileType) {
    for &(x, y) in tiles {
        v.kind[idx(x, y) as usize] = t;
    }
}

/// The worked-example valley from spec §2.6: a grass shelf with a forest
/// stand to the north-west and a rock face further east.
pub fn shelf() -> Valley {
    let mut v = flat_grass();
    // Five forest tiles ringing the sawmill site at (12,8).
    set(&mut v, &[(11, 7), (12, 7), (13, 7), (11, 8), (13, 8)], TileType::Forest);
    // Four rock tiles by the quarry site at (17,9).
    set(&mut v, &[(16, 9), (17, 8), (18, 9), (17, 10)], TileType::Rock);
    v
}
