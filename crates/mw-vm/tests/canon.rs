//! Tests for blueprint canonicalization and hashing.
//!
//! These pin down the copy-forward deduplication rule from spec §4. The rule is
//! applied by the indexer and the purse settlement script, but the hash it keys
//! on is computed here — by the same code in the WASM client and the SBF
//! program — so the properties below are the actual security boundary.

use mw_vm::blueprint::{Blueprint, Cell, Kind};
use mw_vm::canon::{blueprint_hash, canonicalize};
use mw_vm::contract::{Contract, Fixture, FixtureKind, Recipe, SpecKind};
use mw_vm::sim::Sim;
use mw_vm::{idx, sha256, DIR_E, DIR_N, NO_ITEM};

fn contract_t0() -> Contract {
    let mut c = Contract {
        id: 0,
        tick_cap: 400,
        component_cap: 100,
        spec_kind: SpecKind::Uniform,
        spec_qty: 10,
        ..Default::default()
    };
    c.spec_pattern[0] = 2;
    c.fixtures[0] = Some(Fixture {
        kind: FixtureKind::Source { item_type: 0, period: 3 },
        x: 0,
        y: 5,
    });
    c.fixtures[1] = Some(Fixture { kind: FixtureKind::Sink, x: 11, y: 5 });
    c.recipes[1] = Some(Recipe { in0: 0, in1: NO_ITEM, out: 2, press_ticks: 4 });
    c
}

fn machine_t0() -> Blueprint {
    let mut bp = Blueprint::default();
    for x in 1..=5u8 {
        bp.cells[idx(x, 5) as usize] = Cell { kind: Kind::Belt, rot: DIR_E, param: 0 };
    }
    bp.cells[idx(6, 5) as usize] = Cell { kind: Kind::Stamper, rot: DIR_E, param: 1 };
    for x in 7..=10u8 {
        bp.cells[idx(x, 5) as usize] = Cell { kind: Kind::Belt, rot: DIR_E, param: 0 };
    }
    bp
}

#[test]
fn sha256_matches_nist_vectors() {
    assert_eq!(
        sha256::digest(b""),
        [
            0xe3, 0xb0, 0xc4, 0x42, 0x98, 0xfc, 0x1c, 0x14, 0x9a, 0xfb, 0xf4, 0xc8, 0x99, 0x6f,
            0xb9, 0x24, 0x27, 0xae, 0x41, 0xe4, 0x64, 0x9b, 0x93, 0x4c, 0xa4, 0x95, 0x99, 0x1b,
            0x78, 0x52, 0xb8, 0x55
        ]
    );
    assert_eq!(
        sha256::digest(b"abc"),
        [
            0xba, 0x78, 0x16, 0xbf, 0x8f, 0x01, 0xcf, 0xea, 0x41, 0x41, 0x40, 0xde, 0x5d, 0xae,
            0x22, 0x23, 0xb0, 0x03, 0x61, 0xa3, 0x96, 0x17, 0x7a, 0x9c, 0xb4, 0x10, 0xff, 0x61,
            0xf2, 0x00, 0x15, 0xad
        ]
    );
    // Two-block message: exercises the second padding block.
    assert_eq!(
        sha256::digest(b"abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"),
        [
            0x24, 0x8d, 0x6a, 0x61, 0xd2, 0x06, 0x38, 0xb8, 0xe5, 0xc0, 0x26, 0x93, 0x0c, 0x3e,
            0x60, 0x39, 0xa3, 0x3c, 0xe4, 0x59, 0x64, 0xff, 0x21, 0x67, 0xf6, 0xec, 0xed, 0xd4,
            0x19, 0xdb, 0x06, 0xc1
        ]
    );
}

#[test]
fn identical_blueprints_hash_identically() {
    let c = contract_t0();
    assert_eq!(
        blueprint_hash(&c, &machine_t0()),
        blueprint_hash(&c, &machine_t0())
    );
}

#[test]
fn decorative_padding_does_not_launder_a_copy() {
    // The obvious dodge: copy someone's machine, drop a belt in an unused
    // corner, submit it as your own. The corner belt touches no source and
    // reaches no sink, so canonicalization removes it and the hash still
    // matches the original.
    let c = contract_t0();
    let original = machine_t0();

    let mut padded = machine_t0();
    padded.cells[idx(0, 0) as usize] = Cell { kind: Kind::Belt, rot: DIR_N, param: 0 };
    padded.cells[idx(1, 0) as usize] = Cell { kind: Kind::Belt, rot: DIR_E, param: 0 };

    assert_ne!(original, padded, "the raw blueprints genuinely differ");
    assert_eq!(
        blueprint_hash(&c, &original),
        blueprint_hash(&c, &padded),
        "dead cells must not mint a fresh hash"
    );
}

#[test]
fn padding_still_costs_the_copier_on_two_axes() {
    // Canonicalization is for identity, not for scoring. A padded copy ties on
    // CYCLES but is strictly worse on FOOTPRINT and COST, so the dodge is not
    // free even before deduplication looks at it.
    let c = contract_t0();
    let original = machine_t0();
    let mut padded = machine_t0();
    padded.cells[idx(0, 0) as usize] = Cell { kind: Kind::Belt, rot: DIR_N, param: 0 };

    let a = Sim::new(&c, &original).unwrap().run().score.unwrap();
    let b = Sim::new(&c, &padded).unwrap().run().score.unwrap();

    assert_eq!(a.cycles, b.cycles, "padding does not change throughput");
    assert!(b.cost > a.cost, "padding costs COST");
    assert!(b.footprint > a.footprint, "padding costs FOOTPRINT");
}

#[test]
fn param_on_a_kind_that_ignores_it_is_normalized_away() {
    // A belt never reads `param`. Scribbling in it must not produce a new hash.
    let c = contract_t0();
    let original = machine_t0();
    let mut scribbled = machine_t0();
    scribbled.cells[idx(3, 5) as usize].param = 0xAB;

    assert_eq!(
        blueprint_hash(&c, &original),
        blueprint_hash(&c, &scribbled),
        "unread param bytes must not affect identity"
    );
}

#[test]
fn param_on_a_kind_that_reads_it_does_change_identity() {
    // A stamper's param names its recipe. Two different recipes are two
    // different machines, and must hash differently.
    let mut c = contract_t0();
    c.recipes[2] = Some(Recipe { in0: 0, in1: NO_ITEM, out: 2, press_ticks: 6 });

    let a = machine_t0();
    let mut b = machine_t0();
    b.cells[idx(6, 5) as usize].param = 2;

    assert_ne!(blueprint_hash(&c, &a), blueprint_hash(&c, &b));
}

#[test]
fn translation_is_not_normalized_away() {
    // FOOTPRINT scores the bounding box and fixtures sit at fixed cells, so
    // position is load-bearing. The same shape one row up is a different
    // machine — and in this contract, a broken one.
    let c = contract_t0();
    let original = machine_t0();

    let mut shifted = Blueprint::default();
    for x in 1..=5u8 {
        shifted.cells[idx(x, 4) as usize] = Cell { kind: Kind::Belt, rot: DIR_E, param: 0 };
    }
    shifted.cells[idx(6, 4) as usize] = Cell { kind: Kind::Stamper, rot: DIR_E, param: 1 };
    for x in 7..=10u8 {
        shifted.cells[idx(x, 4) as usize] = Cell { kind: Kind::Belt, rot: DIR_E, param: 0 };
    }

    assert_ne!(blueprint_hash(&c, &original), blueprint_hash(&c, &shifted));
}

#[test]
fn hash_is_domain_separated_by_contract() {
    // The same machine submitted against two contracts must not look like a
    // copy of itself.
    let a = contract_t0();
    let mut b = contract_t0();
    b.id = 7;
    assert_ne!(blueprint_hash(&a, &machine_t0()), blueprint_hash(&b, &machine_t0()));
}

#[test]
fn canonicalization_keeps_every_load_bearing_cell() {
    // Nothing on the working path may be stripped: canonicalizing the spec's
    // machine must leave all ten components in place.
    let c = contract_t0();
    let canon = canonicalize(&c, &machine_t0());
    assert_eq!(canon.component_count(), 10);
}

#[test]
fn a_genuinely_different_machine_hashes_differently() {
    // The split-and-merge variant from spec §2.6's "now optimise" paragraph.
    let c = contract_t0();
    let mut alt = machine_t0();
    alt.cells[idx(5, 5) as usize] = Cell { kind: Kind::Splitter, rot: DIR_E, param: 0 };
    assert_ne!(blueprint_hash(&c, &machine_t0()), blueprint_hash(&c, &alt));
}
