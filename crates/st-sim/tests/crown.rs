//! The crown's ledger: coin, tax, unrest, decrees. The governance triangle —
//! taxing funds expansion, overtaxing empties the realm — is the management
//! layer, and these tests pin its behaviour.

mod helpers;

use st_sim::plan::{BuildingKind as K, Placement, Plan};
use st_sim::sim::Outcome;
use st_sim::{Sim, SimError, HORIZON_DAYS, START_COIN};

fn p(x: u8, y: u8, kind: K) -> Placement {
    Placement { x, y, kind, param: 0 }
}

/// A decree scheduled for `day`: type in the high nibble, value in the low.
fn decree(day: u16, dtype: u8, value: u8) -> Placement {
    Placement {
        x: (day % 64) as u8,
        y: (day / 64) as u8,
        kind: K::Decree,
        param: (dtype << 4) | value,
    }
}

/// A stable hamlet: field first, then a cottage. Feeds itself forever.
fn hamlet() -> [Placement; 2] {
    [p(10, 10, K::Field), p(8, 10, K::Cottage)]
}

#[test]
fn taxes_fill_the_treasury() {
    let v = helpers::flat_grass();
    let plan = Plan::from_slice(&hamlet()).unwrap();
    let r = Sim::new(&v, &plan, HORIZON_DAYS).unwrap().run();
    assert_eq!(r.outcome, Outcome::Completed);
    // Default tithe of 1: ~24 collections from a town of 8–10 villagers,
    // minus 3 coin of wages. The exact figure is deterministic; the range
    // assertion survives future balance passes.
    assert!(r.final_coin > 100, "treasury {} after a season of tithes", r.final_coin);
}

#[test]
fn a_tax_holiday_earns_nothing_and_costs_wages() {
    let v = helpers::flat_grass();
    let mut items = [decree(1, 0, 0), p(10, 10, K::Field), p(8, 10, K::Cottage)];
    let plan = Plan::from_slice(&mut items).unwrap();
    let r = Sim::new(&v, &plan, HORIZON_DAYS).unwrap().run();
    assert_eq!(r.outcome, Outcome::Completed);
    // Rate 0 all season, no market: income is exactly zero, so the treasury
    // is the starting purse minus the field's and cottage's wages.
    assert_eq!(r.final_coin, START_COIN - 1 - 2);
    assert_eq!(r.final_unrest, 0, "a tax holiday keeps the realm content");
}

#[test]
fn overtaxing_empties_the_realm() {
    let v = helpers::flat_grass();
    // Punitive rate from day 1. Every collection breeds resentment: growth
    // stops at unrest 6, and at 8 a villager walks out every day — fed.
    // This is politics, not famine.
    let greedy = Plan::from_slice(&[decree(1, 0, 3), p(10, 10, K::Field), p(8, 10, K::Cottage)])
        .unwrap();
    let r = Sim::new(&v, &greedy, HORIZON_DAYS).unwrap().run();
    match r.outcome {
        Outcome::Extinct { day } => {
            assert!(day < 100, "the realm dissolved by day {day}");
        }
        other => panic!("a rate-3 realm must dissolve, got {other:?}"),
    }

    // The identical town at the default tithe completes the season.
    let fair = Plan::from_slice(&hamlet()).unwrap();
    let rf = Sim::new(&v, &fair, HORIZON_DAYS).unwrap().run();
    assert_eq!(rf.outcome, Outcome::Completed);
}

#[test]
fn festivals_buy_back_the_peoples_patience() {
    let v = helpers::flat_grass();
    let greedy = Plan::from_slice(&[decree(1, 0, 3), p(10, 10, K::Field), p(8, 10, K::Cottage)])
        .unwrap();
    let plain = Sim::new(&v, &greedy, HORIZON_DAYS).unwrap().run();

    // The same greedy crown, but a festival every twenty days. Rate 3 on a
    // ten-villager town collects 30 a cycle; the 20-coin festival gives three
    // points of patience back. The realm still resents the rate — it just
    // takes visibly longer to walk out.
    let bread_and_circuses = Plan::from_slice(&[
        decree(1, 0, 3),
        p(10, 10, K::Field),
        p(8, 10, K::Cottage),
        decree(20, 1, 0),
        decree(40, 1, 0),
        decree(60, 1, 0),
        decree(80, 1, 0),
        decree(100, 1, 0),
        decree(120, 1, 0),
    ])
    .unwrap();
    let softened = Sim::new(&v, &bread_and_circuses, HORIZON_DAYS).unwrap().run();

    assert!(
        softened.days_run > plain.days_run,
        "festivals ({} days) must outlast bare greed ({} days)",
        softened.days_run,
        plain.days_run
    );
}

#[test]
fn a_scheduled_reign_grow_cheap_then_tax_the_grown_town() {
    let v = helpers::flat_grass();
    // Fiscal policy as strategy: a tax holiday while the town grows, then a
    // heavy rate once it is large — squeezing more total coin than the flat
    // tithe, at the price of late-season unrest. This is the decree system
    // doing exactly what it is for.
    let reign = Plan::from_slice(&[
        decree(1, 0, 0),
        p(10, 10, K::Field),
        p(8, 10, K::Cottage),
        decree(60, 0, 2),
    ])
    .unwrap();
    let r = Sim::new(&v, &reign, HORIZON_DAYS).unwrap().run();
    assert_eq!(r.outcome, Outcome::Completed, "rate 2 is resented, not fatal");

    let flat = Plan::from_slice(&hamlet()).unwrap();
    let rf = Sim::new(&v, &flat, HORIZON_DAYS).unwrap().run();
    assert!(
        r.final_coin > rf.final_coin,
        "grow-then-tax ({}) should out-earn the flat tithe ({})",
        r.final_coin,
        rf.final_coin
    );
    assert!(r.final_unrest > rf.final_unrest, "and pay for it in patience");
}

#[test]
fn decrees_take_no_ground() {
    let v = helpers::flat_grass();
    let plan = Plan::from_slice(&[
        decree(1, 0, 1),
        p(10, 10, K::Field),
        p(8, 10, K::Cottage),
        decree(100, 1, 0),
    ])
    .unwrap();
    let r = Sim::new(&v, &plan, HORIZON_DAYS).unwrap().run();
    assert_eq!(r.footprint, 2, "government is not masonry");
    assert_eq!(r.buildings_built, 2);
}

#[test]
fn malformed_decrees_are_rejected_at_validation() {
    let v = helpers::flat_grass();
    let bad_type = Plan::from_slice(&[decree(1, 2, 0)]).unwrap();
    assert_eq!(Sim::new(&v, &bad_type, HORIZON_DAYS).err(), Some(SimError::BadDecree(0)));

    let bad_rate = Plan::from_slice(&[decree(1, 0, 4)]).unwrap();
    assert_eq!(Sim::new(&v, &bad_rate, HORIZON_DAYS).err(), Some(SimError::BadDecree(0)));
}

#[test]
fn markets_mint_coin_from_every_sale() {
    // The reference town from the worked example exports 69 goods; each sale
    // mints 2 coin on top of the season's taxes, so the treasury at season's
    // end dwarfs the 46 coin of wages it paid out.
    let mut v = helpers::flat_grass();
    helpers::set(&mut v, &[(13, 7), (14, 7), (15, 7), (13, 8), (15, 8)], st_sim::TileType::Forest);
    helpers::set(&mut v, &[(13, 13), (14, 13), (15, 13), (15, 12)], st_sim::TileType::Rock);
    helpers::set(&mut v, &[(13, 17), (14, 17), (15, 17), (15, 16)], st_sim::TileType::Ore);
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
    assert_eq!(r.exports, 69, "the governance layer must not disturb the pinned economy");
    assert!(r.final_coin > 500, "treasury {} from taxes plus sales", r.final_coin);
}
