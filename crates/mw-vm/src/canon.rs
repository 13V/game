//! Blueprint canonicalization and hashing.
//!
//! This backs the copy-forward deduplication rule in spec §4. The rule itself
//! lives in the indexer and the purse settlement script, not in `verify_run` —
//! a per-blueprint PDA would cost roughly $600/week in rent to defend a $60
//! purse. But the *hash* is computed here, by the same code on the client and
//! in the program, and is stored per-axis in the `Score` PDA.
//!
//! What canonicalization defeats:
//!
//! - Padding a copied blueprint with a decorative belt in an unused corner.
//! - Scribbling in a `param` byte that the component's kind never reads.
//! - Any difference in serialization between the WASM client and the SBF program.
//!
//! What it deliberately does **not** defeat: a genuine near-duplicate, where
//! someone reroutes one belt for an identical score. Fuzzy matching over
//! 288-byte blueprints has false positives, and in an optimization game
//! convergent design is expected rather than suspicious — on a constrained grid
//! two strong players routinely reach the same optimum independently. That is a
//! legitimate tie, not plagiarism. Only exact post-canonicalization matches are
//! caught; the residue is left to the HAND ladder's social policing.

use crate::blueprint::{Blueprint, Cell, Kind};
use crate::contract::{Contract, FixtureKind};
use crate::{CELLS, GRID_W};

/// Reduce a blueprint to the form its hash is taken over.
///
/// Three normalizations, in order:
///
/// 1. `param` is zeroed for kinds that ignore it (handled by `encode`).
/// 2. Components that cannot be reached from any source are removed.
/// 3. Components that cannot reach any sink are removed.
///
/// Translation is **not** normalized away: FOOTPRINT scores the bounding box
/// and fixtures sit at fixed cells, so position is semantically load-bearing.
/// The same machine shifted one cell right is a different machine.
pub fn canonicalize(contract: &Contract, bp: &Blueprint) -> Blueprint {
    let mut live_fwd = [false; CELLS]; // reachable from a source
    let mut live_back = [false; CELLS]; // can reach a sink

    // Forward flood from every source, along the direction items actually move.
    let mut frontier = [0u16; CELLS];
    let mut n = 0usize;
    for f in contract.fixtures.iter().flatten() {
        if matches!(f.kind, FixtureKind::Source { .. }) {
            if let Some(inward) = f.inward() {
                if !bp.cells[inward as usize].is_empty() && !live_fwd[inward as usize] {
                    live_fwd[inward as usize] = true;
                    frontier[n] = inward;
                    n += 1;
                }
            }
            // A source may also be drawn from by any adjacent component.
            for d in 0..4u8 {
                if let Some(nb) = crate::step(f.index(), d) {
                    if pulls_from(bp, nb, f.index()) && !live_fwd[nb as usize] {
                        live_fwd[nb as usize] = true;
                        frontier[n] = nb;
                        n += 1;
                    }
                }
            }
        }
    }
    while n > 0 {
        n -= 1;
        let cur = frontier[n];
        for d in 0..4u8 {
            if let Some(nb) = crate::step(cur, d) {
                if !bp.cells[nb as usize].is_empty()
                    && !live_fwd[nb as usize]
                    && pulls_from(bp, nb, cur)
                {
                    live_fwd[nb as usize] = true;
                    frontier[n] = nb;
                    n += 1;
                }
            }
        }
    }

    // Backward flood from every sink, against the direction items move.
    n = 0;
    for f in contract.fixtures.iter().flatten() {
        if matches!(f.kind, FixtureKind::Sink) {
            if let Some(inward) = f.inward() {
                if !bp.cells[inward as usize].is_empty() && !live_back[inward as usize] {
                    live_back[inward as usize] = true;
                    frontier[n] = inward;
                    n += 1;
                }
            }
        }
    }
    while n > 0 {
        n -= 1;
        let cur = frontier[n];
        for d in 0..4u8 {
            if let Some(nb) = crate::step(cur, d) {
                if !bp.cells[nb as usize].is_empty()
                    && !live_back[nb as usize]
                    && pulls_from(bp, cur, nb)
                {
                    live_back[nb as usize] = true;
                    frontier[n] = nb;
                    n += 1;
                }
            }
        }
    }

    let mut out = Blueprint::default();
    for i in 0..CELLS {
        if !bp.cells[i].is_empty() && live_fwd[i] && live_back[i] {
            let c = bp.cells[i];
            out.cells[i] = Cell {
                kind: c.kind,
                rot: c.rot & 3,
                param: if c.kind.uses_param() { c.param } else { 0 },
            };
        }
    }
    out
}

/// Whether the component at `dst` draws from cell `src`.
///
/// Mirrors `Sim::pull_sources` but works on the blueprint alone, without a
/// contract's recipe table. A two-input stamper's control side is included
/// unconditionally here: over-including makes canonicalization *conservative*,
/// which is the safe direction — it can only keep a cell that a stricter
/// analysis would drop, never drop one that matters.
fn pulls_from(bp: &Blueprint, dst: u16, src: u16) -> bool {
    let cell = bp.cells[dst as usize];
    if cell.is_empty() {
        return false;
    }
    let rot = cell.rot;
    let behind = crate::step(dst, crate::opposite(rot));
    let left = crate::step(dst, crate::left_of(rot));
    let right = crate::step(dst, crate::right_of(rot));
    match cell.kind {
        Kind::Belt | Kind::Splitter | Kind::Buffer => behind == Some(src),
        Kind::Merger => left == Some(src) || right == Some(src),
        Kind::Gate | Kind::Stamper => behind == Some(src) || left == Some(src),
        Kind::Empty => false,
    }
}

/// The canonical hash stored in `Score.best_*_hash` and used for deduplication.
///
/// Domain-separated by contract id so the same machine submitted against two
/// different contracts produces two different hashes — otherwise a blueprint
/// that happened to be optimal twice would look like a copy of itself.
pub fn blueprint_hash(contract: &Contract, bp: &Blueprint) -> [u8; 32] {
    let canon = canonicalize(contract, bp);
    let body = canon.encode();
    let mut buf = [0u8; 8 + crate::blueprint::BLUEPRINT_BYTES];
    buf[..4].copy_from_slice(b"MWBP");
    buf[4..6].copy_from_slice(&contract.id.to_le_bytes());
    buf[6] = GRID_W as u8;
    buf[7] = crate::GRID_H as u8;
    buf[8..].copy_from_slice(&body);
    crate::sha256::digest(&buf)
}
