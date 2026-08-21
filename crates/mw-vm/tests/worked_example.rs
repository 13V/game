//! Acceptance tests against the worked example in `research/09-spec-millwright.md` §2.6.
//!
//! The spec states an exact drain order, an exact tick-by-tick event table, and
//! an exact final score of CYCLES 50 / FOOTPRINT 10 / COST 21. If any of these
//! drift, either the VM is wrong or the spec changed — both are worth failing a
//! build over, because this example is the reference every client, solver and
//! replay renderer is calibrated against.

use mw_vm::blueprint::{Blueprint, Cell, Kind};
use mw_vm::contract::{Contract, Fixture, FixtureKind, Recipe, SpecKind};
use mw_vm::sim::{Outcome, Sim};
use mw_vm::{idx, DIR_E, NO_ITEM};

/// Contract T-0: 12x12, no obstacles. SOURCE_A at (0,5) type A period 3.
/// SINK at (11,5). Spec 10 x C, waste 0. Recipe R1: A -> C, press 4.
/// Tick cap 400, component cap 100.
fn contract_t0() -> Contract {
    let mut c = Contract {
        id: 0,
        tick_cap: 400,
        component_cap: 100,
        spec_kind: SpecKind::Uniform,
        spec_qty: 10,
        waste_allow: 0,
        ..Default::default()
    };
    c.spec_pattern[0] = 2; // item type C
    c.fixtures[0] = Some(Fixture {
        kind: FixtureKind::Source { item_type: 0, period: 3 }, // type A
        x: 0,
        y: 5,
    });
    c.fixtures[1] = Some(Fixture { kind: FixtureKind::Sink, x: 11, y: 5 });
    c.recipes[1] = Some(Recipe { in0: 0, in1: NO_ITEM, out: 2, press_ticks: 4 });
    c
}

/// The player's machine: belts east along row 5, one stamper at (6,5).
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
fn drain_order_matches_spec() {
    let c = contract_t0();
    let bp = machine_t0();
    let sim = Sim::new(&c, &bp).expect("valid blueprint");

    // Spec §2.6: SINK(11,5), (10,5), (9,5), (8,5), (7,5), STAMPER(6,5),
    // (5,5), (4,5), (3,5), (2,5), (1,5), SOURCE(0,5).
    let expected: [u16; 12] = [
        idx(11, 5),
        idx(10, 5),
        idx(9, 5),
        idx(8, 5),
        idx(7, 5),
        idx(6, 5),
        idx(5, 5),
        idx(4, 5),
        idx(3, 5),
        idx(2, 5),
        idx(1, 5),
        idx(0, 5),
    ];
    assert_eq!(sim.drain_order(), &expected[..], "drain order diverged from spec §2.6");
}

#[test]
fn worked_example_scores_50_10_21() {
    let c = contract_t0();
    let bp = machine_t0();

    assert_eq!(bp.component_count(), 10, "9 belts + 1 stamper");
    assert_eq!(bp.cost(), 21, "9x1 belt + 1x12 stamper");
    assert_eq!(bp.footprint(), 10, "bbox x in [1,10], y in [5,5]");

    let mut sim = Sim::new(&c, &bp).expect("valid blueprint");
    let r = sim.run();

    assert_eq!(r.outcome, Outcome::Success, "spec's machine must complete T-0");
    let s = r.score.expect("success implies a score");
    assert_eq!(s.cycles, 50, "spec §2.6 states CYCLES = 50");
    assert_eq!(s.footprint, 10);
    assert_eq!(s.cost, 21);
    assert_eq!(r.waste, 0);
    assert_eq!(r.produced, 10);
}

#[test]
fn first_output_lands_on_tick_14() {
    // Spec's event table: "Tick 14 | SINK pulls C0. produced = 1."
    let mut c = contract_t0();
    c.spec_qty = 1;
    let bp = machine_t0();
    let mut sim = Sim::new(&c, &bp).expect("valid");
    let r = sim.run();
    assert_eq!(r.outcome, Outcome::Success);
    assert_eq!(r.score.unwrap().cycles, 14);
}

#[test]
fn steady_state_is_four_ticks_per_item() {
    // The stamper's press of 4 is the bottleneck; the source's period of 3 is
    // not binding. So output n lands at tick 14 + 4*(n-1).
    for (qty, expected) in [(1u16, 14u16), (2, 18), (3, 22), (5, 30), (10, 50)] {
        let mut c = contract_t0();
        c.spec_qty = qty;
        let bp = machine_t0();
        let mut sim = Sim::new(&c, &bp).expect("valid");
        let r = sim.run();
        assert_eq!(r.outcome, Outcome::Success, "qty {qty}");
        assert_eq!(r.score.unwrap().cycles, expected, "qty {qty}");
    }
}

#[test]
fn belt_chain_shifts_one_tile_per_tick_regardless_of_orientation() {
    // The reason consumers are ordered before suppliers. A westward chain must
    // behave exactly like an eastward one.
    let mut c = Contract {
        tick_cap: 100,
        component_cap: 100,
        spec_kind: SpecKind::Uniform,
        spec_qty: 1,
        ..Default::default()
    };
    c.spec_pattern[0] = 0; // accept type A directly, no stamper
    c.fixtures[0] = Some(Fixture {
        kind: FixtureKind::Source { item_type: 0, period: 1 },
        x: 11,
        y: 2,
    });
    c.fixtures[1] = Some(Fixture { kind: FixtureKind::Sink, x: 0, y: 2 });

    let mut bp = Blueprint::default();
    for x in 1..=10u8 {
        bp.cells[idx(x, 2) as usize] = Cell { kind: Kind::Belt, rot: mw_vm::DIR_W, param: 0 };
    }

    let mut sim = Sim::new(&c, &bp).expect("valid");
    let r = sim.run();
    assert_eq!(r.outcome, Outcome::Success);
    // 10 belts, one tile per tick, then the sink takes it on the next tick.
    assert_eq!(r.score.unwrap().cycles, 11);
}

#[test]
fn deadlock_is_detected_and_reported() {
    // A sink fed by nothing: no movement, no timers, so the run must stall
    // immediately rather than burning the full tick cap.
    let c = contract_t0();
    let bp = Blueprint::default();
    let mut sim = Sim::new(&c, &bp).expect("empty blueprint is valid, just useless");
    let r = sim.run();
    assert!(matches!(r.outcome, Outcome::Deadlock { .. }), "got {:?}", r.outcome);
    assert!(r.ticks_run < c.tick_cap, "deadlock must short-circuit");
}

#[test]
fn work_unit_cap_rejects_oversized_machines() {
    let mut c = contract_t0();
    c.tick_cap = 800;
    c.component_cap = 200;
    c.work_unit_cap = 40_000;

    // 51 components x 800 ticks = 40,800 > 40,000.
    let mut bp = Blueprint::default();
    for i in 0..51 {
        bp.cells[i] = Cell { kind: Kind::Belt, rot: DIR_E, param: 0 };
    }
    let err = Sim::new(&c, &bp).err().expect("must reject");
    assert!(
        matches!(err, mw_vm::VmError::WorkUnitOverflow { .. }),
        "got {err:?}"
    );
}

#[test]
fn stamper_with_unknown_recipe_is_rejected() {
    let c = contract_t0();
    let mut bp = machine_t0();
    bp.cells[idx(6, 5) as usize] = Cell { kind: Kind::Stamper, rot: DIR_E, param: 7 };
    assert!(matches!(
        Sim::new(&c, &bp).err().expect("must reject"),
        mw_vm::VmError::UnknownRecipe(_)
    ));
}

#[test]
fn blueprint_roundtrips_through_the_wire_format() {
    let bp = machine_t0();
    let bytes = bp.encode();
    assert_eq!(bytes.len(), 288, "must fit the 1232-byte transaction budget");
    assert_eq!(Blueprint::decode(&bytes).unwrap(), bp);
}
