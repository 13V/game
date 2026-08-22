//! Acceptance tests against the worked example in `research/14-spec-steading.md` §2.6.
//!
//! The spec's example states exact outcomes for two orderings of the same
//! three buildings, and an exact score for the full-chain reference town. If
//! these drift, either the sim is wrong or the spec changed — both should fail
//! a build, because this example is what the client's tutorial and every
//! replay is calibrated against.

mod helpers;

use st_sim::plan::{BuildingKind as K, Placement, Plan};
use st_sim::sim::Outcome;
use st_sim::valley::TileType;
use st_sim::{Sim, HORIZON_DAYS};

fn p(x: u8, y: u8, kind: K) -> Placement {
    Placement { x, y, kind, param: 0 }
}

/// Plan A from §2.6: sawmill first. The mistake.
fn plan_sawmill_first() -> Plan {
    Plan::from_slice(&[
        p(12, 8, K::Sawmill),
        p(14, 9, K::Field),
        p(13, 10, K::Cottage),
    ])
    .unwrap()
}

/// Plan B from §2.6: the same three buildings, fed first.
fn plan_field_first() -> Plan {
    Plan::from_slice(&[
        p(14, 9, K::Field),
        p(13, 10, K::Cottage),
        p(12, 8, K::Sawmill),
    ])
    .unwrap()
}

#[test]
fn sawmill_first_starves_the_hamlet_by_day_8() {
    let valley = helpers::shelf();
    let r = Sim::new(&valley, &plan_sawmill_first(), HORIZON_DAYS).unwrap().run();

    // The death spiral is caused by the staffing rule itself: as villagers
    // starve, the sawmill — first in the list — keeps its four workers and
    // the field loses its last farmhand. List order is who eats.
    assert_eq!(r.outcome, Outcome::Extinct { day: 8 }, "spec §2.6: extinct on day 8");
    assert_eq!(r.famine_days, 3);
    assert_eq!(r.final_pop, 0);
    assert_eq!(r.peak_pop, 6, "never grew — food never reached the growth surplus");
    assert_eq!(r.days_run, 8, "extinction short-circuits the remaining days");
    assert_eq!(r.buildings_built, 3);
}

#[test]
fn field_first_thrives_with_the_same_three_buildings() {
    let valley = helpers::shelf();
    let r = Sim::new(&valley, &plan_field_first(), HORIZON_DAYS).unwrap().run();

    assert_eq!(r.outcome, Outcome::Completed);
    assert_eq!(r.peak_pop, 10, "grows to the cottage-extended cap");
    assert_eq!(r.final_pop, 8, "settles at what one field can feed");
    assert_eq!(r.famine_days, 2, "the overshoot past sustainable pop, then stable");
    assert_eq!(r.days_run, HORIZON_DAYS);
}

/// The §2.6 reference town: fields and cottages first, then industry, roads,
/// a market, and the goods chain. Every number here is a regression pin — the
/// sim is deterministic, so any change is a rules change.
#[test]
fn full_chain_reference_town() {
    let mut v = helpers::flat_grass();
    helpers::set(&mut v, &[(13, 7), (14, 7), (15, 7), (13, 8), (15, 8)], TileType::Forest);
    helpers::set(&mut v, &[(13, 13), (14, 13), (15, 13), (15, 12)], TileType::Rock);
    helpers::set(&mut v, &[(13, 17), (14, 17), (15, 17), (15, 16)], TileType::Ore);

    let plan = Plan::from_slice(&[
        p(10, 10, K::Field),
        p(8, 10, K::Cottage),
        p(10, 12, K::Field),
        p(8, 12, K::Cottage),
        p(14, 8, K::Sawmill),
        p(8, 14, K::Cottage),
        p(14, 12, K::Quarry),
        p(6, 10, K::Cottage),
        p(10, 14, K::Field),
        p(6, 12, K::Cottage),
        p(10, 8, K::Field),
        p(6, 14, K::Cottage),
        p(13, 10, K::Road),
        p(14, 10, K::Road),
        p(14, 9, K::Road),
        p(14, 11, K::Road),
        p(12, 10, K::Market),
        p(6, 8, K::Cottage),
        p(8, 8, K::Cottage),
        p(13, 11, K::Road),
        p(13, 12, K::Road),
        p(12, 12, K::Road),
        p(12, 13, K::Road),
        p(12, 14, K::Road),
        p(12, 15, K::Road),
        p(12, 16, K::Road),
        p(13, 16, K::Road),
        p(14, 16, K::Mine),
        p(16, 10, K::Smithy),
        p(15, 10, K::Road),
    ])
    .unwrap();

    let r = Sim::new(&v, &plan, HORIZON_DAYS).unwrap().run();
    assert_eq!(r.outcome, Outcome::Completed);
    assert_eq!(r.exports, 69, "EXPORTS — the goods chain works end to end");
    assert_eq!(r.efficiency, 181, "exports × 100 / peak_pop");
    assert_eq!(r.footprint, 30, "every placement was affordable and built");
    assert_eq!(r.buildings_built, 30);
    assert_eq!(r.peak_pop, 38);
    assert_eq!(r.final_pop, 32);
    assert_eq!(r.famine_days, 2);
}

#[test]
fn the_sim_is_deterministic() {
    let valley = helpers::shelf();
    let a = Sim::new(&valley, &plan_field_first(), HORIZON_DAYS).unwrap().run();
    let b = Sim::new(&valley, &plan_field_first(), HORIZON_DAYS).unwrap().run();
    assert_eq!(a, b);
}
