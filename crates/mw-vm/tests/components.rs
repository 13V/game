//! Per-component behaviour tests.
//!
//! The worked-example test covers belts and stampers because that is what the
//! spec's T-0 machine uses. These cover the other four, and in particular the
//! rules that are easy to get subtly wrong: that only a splitter's *currently
//! selected* output may draw from it, and that a gate is closed until control
//! items mint pass tokens.

use mw_vm::blueprint::{Blueprint, Cell, Kind};
use mw_vm::contract::{Contract, Fixture, FixtureKind, SpecKind};
use mw_vm::sim::{Outcome, Sim};
use mw_vm::{idx, DIR_E, DIR_N, DIR_S};

/// A contract whose sink accepts item type A directly, so tests exercise
/// transport rather than crafting.
fn transport_contract(qty: u16) -> Contract {
    Contract {
        tick_cap: 300,
        component_cap: 100,
        spec_kind: SpecKind::Uniform,
        spec_qty: qty,
        ..Default::default()
    }
}

fn belt(rot: u8) -> Cell {
    Cell { kind: Kind::Belt, rot, param: 0 }
}

#[test]
fn buffer_smooths_a_line_and_delivers_in_fifo_order() {
    let mut c = transport_contract(5);
    c.fixtures[0] = Some(Fixture {
        kind: FixtureKind::Source { item_type: 0, period: 1 },
        x: 0,
        y: 5,
    });
    c.fixtures[1] = Some(Fixture { kind: FixtureKind::Sink, x: 11, y: 5 });

    let mut bp = Blueprint::default();
    bp.cells[idx(1, 5) as usize] = belt(DIR_E);
    bp.cells[idx(2, 5) as usize] = Cell { kind: Kind::Buffer, rot: DIR_E, param: 0 };
    for x in 3..=10u8 {
        bp.cells[idx(x, 5) as usize] = belt(DIR_E);
    }

    let r = Sim::new(&c, &bp).unwrap().run();
    assert_eq!(r.outcome, Outcome::Success);
    assert_eq!(r.produced, 5);
}

/// Splitter at (2,5) fed from the west, sending items up column 2 to a sink at
/// the top edge and down column 2 to a sink at the bottom edge.
fn splitter_setup(build_left: bool, build_right: bool) -> (Contract, Blueprint) {
    let mut c = transport_contract(4);
    c.fixtures[0] = Some(Fixture {
        kind: FixtureKind::Source { item_type: 0, period: 1 },
        x: 0,
        y: 5,
    });
    c.fixtures[1] = Some(Fixture { kind: FixtureKind::Sink, x: 2, y: 0 });
    c.fixtures[2] = Some(Fixture { kind: FixtureKind::Sink, x: 2, y: 11 });

    let mut bp = Blueprint::default();
    bp.cells[idx(1, 5) as usize] = belt(DIR_E);
    // Facing east: left output is north, right output is south.
    bp.cells[idx(2, 5) as usize] = Cell { kind: Kind::Splitter, rot: DIR_E, param: 0 };

    if build_left {
        for y in 1..=4u8 {
            bp.cells[idx(2, y) as usize] = belt(DIR_N);
        }
    }
    if build_right {
        for y in 6..=10u8 {
            bp.cells[idx(2, y) as usize] = belt(DIR_S);
        }
    }
    (c, bp)
}

#[test]
fn splitter_alternates_between_both_outputs() {
    let (c, bp) = splitter_setup(true, true);
    let r = Sim::new(&c, &bp).unwrap().run();
    assert_eq!(r.outcome, Outcome::Success, "both branches open");
    // Both sinks can accept within a single tick, so this also pins down that
    // a fulfilled contract stops accepting rather than overshooting.
    assert_eq!(r.produced, 4);
}

#[test]
fn splitter_stalls_when_the_selected_side_has_no_consumer() {
    // param = 0 selects the left (north) output. With only the south branch
    // built, nothing may draw from the splitter, and it holds its item forever.
    // This is the rule "only the currently-selected output may pull it".
    let (c, bp) = splitter_setup(false, true);
    let r = Sim::new(&c, &bp).unwrap().run();
    assert!(
        matches!(r.outcome, Outcome::Deadlock { .. }),
        "expected deadlock, got {:?}",
        r.outcome
    );
    assert_eq!(r.produced, 0);
}

#[test]
fn merger_draws_from_both_sides() {
    let mut c = transport_contract(4);
    c.fixtures[0] = Some(Fixture {
        kind: FixtureKind::Source { item_type: 0, period: 1 },
        x: 2,
        y: 0,
    });
    c.fixtures[1] = Some(Fixture {
        kind: FixtureKind::Source { item_type: 0, period: 1 },
        x: 2,
        y: 11,
    });
    c.fixtures[2] = Some(Fixture { kind: FixtureKind::Sink, x: 11, y: 5 });

    let mut bp = Blueprint::default();
    // North feed running down into the merger's left side.
    for y in 1..=4u8 {
        bp.cells[idx(2, y) as usize] = belt(DIR_S);
    }
    // South feed running up into the merger's right side.
    for y in 6..=10u8 {
        bp.cells[idx(2, y) as usize] = belt(DIR_N);
    }
    bp.cells[idx(2, 5) as usize] = Cell { kind: Kind::Merger, rot: DIR_E, param: 0 };
    for x in 3..=10u8 {
        bp.cells[idx(x, 5) as usize] = belt(DIR_E);
    }

    let r = Sim::new(&c, &bp).unwrap().run();
    assert_eq!(r.outcome, Outcome::Success);
    assert_eq!(r.produced, 4);
}

/// Source feeding a gate whose control line is optionally fed from the north.
fn gate_setup(preload: u8, feed_control: bool, qty: u16) -> (Contract, Blueprint) {
    let mut c = transport_contract(qty);
    c.fixtures[0] = Some(Fixture {
        kind: FixtureKind::Source { item_type: 0, period: 1 },
        x: 0,
        y: 5,
    });
    c.fixtures[1] = Some(Fixture { kind: FixtureKind::Sink, x: 11, y: 5 });
    if feed_control {
        // Control items arrive from the top edge, down column 2 into the gate's left side.
        c.fixtures[2] = Some(Fixture {
            kind: FixtureKind::Source { item_type: 0, period: 1 },
            x: 2,
            y: 0,
        });
    }

    let mut bp = Blueprint::default();
    bp.cells[idx(1, 5) as usize] = belt(DIR_E);
    // Facing east: data in from the west, out to the east, control in from the north.
    bp.cells[idx(2, 5) as usize] = Cell { kind: Kind::Gate, rot: DIR_E, param: preload };
    for x in 3..=10u8 {
        bp.cells[idx(x, 5) as usize] = belt(DIR_E);
    }
    if feed_control {
        for y in 1..=4u8 {
            bp.cells[idx(2, y) as usize] = belt(DIR_S);
        }
    }
    (c, bp)
}

#[test]
fn gate_is_closed_by_default() {
    let (c, bp) = gate_setup(0, false, 1);
    let r = Sim::new(&c, &bp).unwrap().run();
    assert!(
        matches!(r.outcome, Outcome::Deadlock { .. }),
        "a gate with no tokens must never release, got {:?}",
        r.outcome
    );
    assert_eq!(r.produced, 0);
}

#[test]
fn gate_preload_passes_exactly_that_many_items() {
    // Three preloaded tokens, three items through, then it shuts.
    let (c, bp) = gate_setup(3, false, 3);
    let r = Sim::new(&c, &bp).unwrap().run();
    assert_eq!(r.outcome, Outcome::Success);
    assert_eq!(r.produced, 3);

    // Asking for a fourth with the same three tokens must stall.
    let (c4, bp4) = gate_setup(3, false, 4);
    let r4 = Sim::new(&c4, &bp4).unwrap().run();
    assert!(
        matches!(r4.outcome, Outcome::Deadlock { .. }),
        "expected the gate to shut after three, got {:?}",
        r4.outcome
    );
    assert_eq!(r4.produced, 3);
}

#[test]
fn control_items_mint_pass_tokens() {
    // No preload, but a live control line: the gate opens once per control item
    // consumed, so the machine runs indefinitely.
    let (c, bp) = gate_setup(0, true, 5);
    let r = Sim::new(&c, &bp).unwrap().run();
    assert_eq!(r.outcome, Outcome::Success, "control line should keep the gate fed");
    assert_eq!(r.produced, 5);
}

#[test]
fn wrong_item_type_at_the_sink_is_waste() {
    // Sink wants C, source makes A, and there is no stamper to convert. With a
    // waste allowance of zero the run must fail rather than quietly score.
    let mut c = transport_contract(1);
    c.spec_pattern[0] = 2; // C
    c.waste_allow = 0;
    c.fixtures[0] = Some(Fixture {
        kind: FixtureKind::Source { item_type: 0, period: 1 },
        x: 0,
        y: 5,
    });
    c.fixtures[1] = Some(Fixture { kind: FixtureKind::Sink, x: 11, y: 5 });

    let mut bp = Blueprint::default();
    for x in 1..=10u8 {
        bp.cells[idx(x, 5) as usize] = belt(DIR_E);
    }

    let r = Sim::new(&c, &bp).unwrap().run();
    assert!(matches!(r.outcome, Outcome::Wasted { .. }), "got {:?}", r.outcome);
    assert_eq!(r.produced, 0);
    assert_eq!(r.waste, 1);
}

#[test]
fn sequence_specs_require_output_ordering() {
    // The regime flip from spec §2.6: with an alternating spec, throughput is
    // no longer the bottleneck. A line that delivers only type A cannot satisfy
    // an A,B,A,B spec no matter how fast it runs.
    let mut c = transport_contract(4);
    c.spec_kind = SpecKind::Sequence;
    c.spec_pattern[0] = 0; // A
    c.spec_pattern[1] = 1; // B
    c.spec_pattern_len = 2;
    c.waste_allow = 0;
    c.fixtures[0] = Some(Fixture {
        kind: FixtureKind::Source { item_type: 0, period: 1 },
        x: 0,
        y: 5,
    });
    c.fixtures[1] = Some(Fixture { kind: FixtureKind::Sink, x: 11, y: 5 });

    let mut bp = Blueprint::default();
    for x in 1..=10u8 {
        bp.cells[idx(x, 5) as usize] = belt(DIR_E);
    }

    let r = Sim::new(&c, &bp).unwrap().run();
    // First A is accepted; the second A is waste because the spec wanted B.
    assert!(matches!(r.outcome, Outcome::Wasted { .. }), "got {:?}", r.outcome);
    assert_eq!(r.produced, 1);
}
