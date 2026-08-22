//! Valley-generator tests. The generator's constants are consensus rules —
//! the chain and the client both derive the valley from the seed, so the only
//! properties worth testing are determinism and that the terrain distribution
//! stays playable across seeds.

use st_sim::valley::{generate, TileType};
use st_sim::{MAX_HEIGHT, TILES};

fn seed(n: u8) -> [u8; 32] {
    let mut s = [0u8; 32];
    s[0] = n;
    s[31] = n.wrapping_mul(37);
    s
}

#[test]
fn same_seed_same_valley() {
    let a = generate(&seed(7));
    let b = generate(&seed(7));
    assert_eq!(a.height, b.height);
    assert!(a.kind.iter().zip(b.kind.iter()).all(|(x, y)| x == y));
}

#[test]
fn different_seeds_differ() {
    let a = generate(&seed(1));
    let b = generate(&seed(2));
    assert_ne!(a.height, b.height);
}

#[test]
fn heights_stay_in_the_four_bit_range() {
    for n in 0..8u8 {
        let v = generate(&seed(n));
        assert!(v.height.iter().all(|&h| h <= MAX_HEIGHT), "seed {n}");
    }
}

#[test]
fn every_terrain_type_appears_and_grass_dominates() {
    // Playability floor, checked across several seeds: buildable grass is the
    // plurality, forest feeds sawmills, rock rims the heights, water carves
    // barriers, and ore exists at all. Exact proportions are tuning (month 5);
    // these bounds only catch a generator change that breaks the game.
    for n in 0..8u8 {
        let v = generate(&seed(n));
        let mut count = [0usize; 5];
        for k in v.kind.iter() {
            count[*k as usize] += 1;
        }
        let [grass, forest, rock, ore, water] = count;
        assert!(grass > TILES / 4, "seed {n}: grass {grass}");
        assert!(forest > 0, "seed {n}: no forest");
        assert!(rock > 0, "seed {n}: no rock");
        assert!(ore > 0, "seed {n}: no ore");
        assert!(water > 0, "seed {n}: no water");
        assert!(grass >= forest && grass >= water, "seed {n}: grass not plurality");
    }
}
