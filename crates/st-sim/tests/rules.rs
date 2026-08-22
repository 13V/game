//! Rules tests: validation, the wire format, market-distance scaling, and the
//! collapse cases the worked example does not reach.

mod helpers;

use st_sim::plan::{BuildingKind as K, Placement, Plan};
use st_sim::sim::Outcome;
use st_sim::valley::TileType;
use st_sim::{idx, scale_output, Sim, SimError, HORIZON_DAYS};

fn p(x: u8, y: u8, kind: K) -> Placement {
    Placement { x, y, kind, param: 0 }
}

// ---------------------------------------------------------------- scaling --

#[test]
fn market_scaling_follows_the_spec_formula() {
    // output × max(5, 20 − dist) / 20, rounded up.
    assert_eq!(scale_output(4, 0), 4, "beside the market: full rate");
    assert_eq!(scale_output(4, 10), 2, "half way out: half rate");
    assert_eq!(scale_output(4, 15), 1, "at the floor");
    assert_eq!(scale_output(4, 255), 1, "disconnected: floor, not zero");
    assert_eq!(scale_output(8, 255), 2);
    assert_eq!(scale_output(0, 0), 0, "no staff or no resource is still nothing");
}

#[test]
fn scaling_rounds_up_so_the_floor_is_never_zero() {
    // The bootstrap guarantee: with floor division a two-villager quarry at
    // 25% would make 2×5/20 = 0 stone forever, and the market that would
    // connect it could never be afforded.
    assert_eq!(scale_output(1, 255), 1);
    assert_eq!(scale_output(2, 255), 1);
    assert_eq!(scale_output(4, 4), 4, "ceil(4 × 16 / 20) = ceil(3.2)");
}

// ------------------------------------------------------------- validation --

#[test]
fn water_is_unbuildable() {
    let mut v = helpers::flat_grass();
    helpers::set(&mut v, &[(5, 5)], TileType::Water);
    let plan = Plan::from_slice(&[p(5, 5, K::Cottage)]).unwrap();
    assert_eq!(Sim::new(&v, &plan, HORIZON_DAYS).err(), Some(SimError::OnWater(0)));
}

#[test]
fn two_placements_cannot_share_a_tile() {
    let v = helpers::flat_grass();
    let plan = Plan::from_slice(&[p(5, 5, K::Field), p(5, 5, K::Cottage)]).unwrap();
    assert_eq!(Sim::new(&v, &plan, HORIZON_DAYS).err(), Some(SimError::Overlap(1)));
}

#[test]
fn buildings_need_flat_ground_but_roads_climb() {
    let mut v = helpers::flat_grass();
    // A two-step cliff east of (5,5).
    v.height[idx(6, 5) as usize] = 5;

    let build = Plan::from_slice(&[p(5, 5, K::Cottage)]).unwrap();
    assert_eq!(Sim::new(&v, &build, HORIZON_DAYS).err(), Some(SimError::TooSteep(0)));

    let road = Plan::from_slice(&[p(5, 5, K::Road)]).unwrap();
    assert!(Sim::new(&v, &road, HORIZON_DAYS).is_ok(), "roads have no flatness rule");
}

#[test]
fn the_building_day_budget_is_enforced() {
    let v = helpers::flat_grass();
    // 150 placements × 300 days = 45,000 > 36,000.
    let mut items = [p(0, 0, K::Road); 150];
    let mut i = 0u16;
    while (i as usize) < 150 {
        items[i as usize] = p((i % 50) as u8, (i / 50) as u8, K::Road);
        i += 1;
    }
    let plan = Plan::from_slice(&items).unwrap();
    assert_eq!(
        Sim::new(&v, &plan, 300).err(),
        Some(SimError::BudgetExceeded { units: 45_000, cap: 36_000 })
    );
    assert!(Sim::new(&v, &plan, 240).is_ok(), "at the cap exactly: 36,000 units");
}

// ------------------------------------------------------------ wire format --

#[test]
fn plan_roundtrips_through_the_wire_format() {
    let plan = Plan::from_slice(&[
        p(14, 9, K::Field),
        p(13, 10, K::Cottage),
        p(12, 8, K::Sawmill),
        p(0, 63, K::Road),
    ])
    .unwrap();
    let mut buf = [0u8; st_sim::MAX_PLACEMENTS * 4];
    let n = plan.encode(&mut buf);
    assert_eq!(n, 16, "4 bytes per placement");
    let back = Plan::decode(&buf[..n]).unwrap();
    assert_eq!(back.items(), plan.items());
}

#[test]
fn decode_rejects_garbage() {
    assert_eq!(Plan::decode(&[0, 0, 0]).err(), Some(SimError::BadLength));
    assert_eq!(Plan::decode(&[64, 0, 0, 0]).err(), Some(SimError::OutOfBounds(0)));
    assert_eq!(Plan::decode(&[0, 0, 8, 0]).err(), Some(SimError::UnknownKind(0)));
    let too_many = [0u8; 151 * 4];
    assert_eq!(Plan::decode(&too_many).err(), Some(SimError::TooManyPlacements));
}

// ---------------------------------------------------------------- collapse --

#[test]
fn a_town_with_no_food_goes_extinct_quickly() {
    let valley = helpers::shelf();
    // All industry, no field: 15 food feeds 6 villagers for 2.5 days.
    let plan = Plan::from_slice(&[p(12, 8, K::Sawmill)]).unwrap();
    let r = Sim::new(&valley, &plan, HORIZON_DAYS).unwrap().run();
    match r.outcome {
        Outcome::Extinct { day } => assert!(day <= 5, "starved out fast, day {day}"),
        other => panic!("expected extinction, got {other:?}"),
    }
    assert!(r.days_run < HORIZON_DAYS, "extinction short-circuits");
}

#[test]
fn an_unaffordable_entry_blocks_the_queue() {
    let v = helpers::flat_grass();
    // Market first: 20 wood + 20 stone against a starting 20 wood + 10 stone.
    // Nothing behind it can build, so the town runs out its pantry having
    // built nothing at all — ordering a market before the quarry that pays
    // for it is a real and instructive mistake.
    let plan = Plan::from_slice(&[
        p(12, 10, K::Market),
        p(10, 10, K::Field),
        p(8, 10, K::Cottage),
    ])
    .unwrap();
    let r = Sim::new(&v, &plan, HORIZON_DAYS).unwrap().run();
    assert_eq!(r.buildings_built, 0, "the market blocked the whole queue");
    assert!(matches!(r.outcome, Outcome::Extinct { .. }));
}

#[test]
fn growth_is_capped_by_housing() {
    let v = helpers::flat_grass();
    // Two fields, no cottage: plenty of food, nowhere to live.
    let plan = Plan::from_slice(&[p(10, 10, K::Field), p(10, 12, K::Field)]).unwrap();
    let r = Sim::new(&v, &plan, HORIZON_DAYS).unwrap().run();
    assert_eq!(r.outcome, Outcome::Completed);
    assert_eq!(r.peak_pop, st_sim::BASE_HOUSING, "the founding camp is the cap");
    assert_eq!(r.famine_days, 0);
}
