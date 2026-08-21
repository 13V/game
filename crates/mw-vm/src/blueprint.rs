//! Blueprint encoding: the 288 bytes a player actually submits.
//!
//! Two bytes per cell, 144 cells, raster order. This is sized to fit inside the
//! live 1,232-byte transaction limit alongside signatures and account metas —
//! SIMD-0296's 4,096-byte transactions are not activated, so 288 is the budget
//! we have, not the budget we would like.
//!
//! Encoding, per `research/09-spec-millwright.md` §2.2:
//! ```text
//! byte0 = kind << 4 | rot << 2 | flags
//! byte1 = param
//! ```

use crate::{VmError, BLUEPRINT_CELLS};

/// Bytes in a serialized blueprint.
pub const BLUEPRINT_BYTES: usize = crate::CELLS * 2;

/// Component kinds in the v1 palette.
///
/// The discriminants are wire format — they are what `byte0 >> 4` decodes to —
/// so they may never be reordered or renumbered. v2 appends arm, sensor,
/// welder, sorter, clock, latch, crusher and vent at 7..=14.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum Kind {
    /// Nothing placed here.
    Empty = 0xF,
    /// Pulls one item from the cell behind it. Capacity 1. Cost 1.
    Belt = 0,
    /// Pulls from behind, alternates output between left and right. Cost 4.
    Splitter = 1,
    /// Pulls from left or right alternately, outputs forward. Cost 4.
    Merger = 2,
    /// FIFO, capacity 4. Cost 6.
    Buffer = 3,
    /// Gated pass-through; control input on the left mints pass tokens. Cost 8.
    Gate = 4,
    /// Runs a recipe over one or two inputs. Cost 12.
    Stamper = 5,
}

impl Kind {
    /// Decode from the high nibble of `byte0`.
    #[inline]
    pub fn from_nibble(n: u8) -> Option<Kind> {
        Some(match n {
            0 => Kind::Belt,
            1 => Kind::Splitter,
            2 => Kind::Merger,
            3 => Kind::Buffer,
            4 => Kind::Gate,
            5 => Kind::Stamper,
            0xF => Kind::Empty,
            _ => return None,
        })
    }

    /// COST-ladder price of one instance. Fixtures are free; empty cells cost nothing.
    #[inline]
    pub const fn price(self) -> u16 {
        match self {
            Kind::Belt => 1,
            Kind::Splitter => 4,
            Kind::Merger => 4,
            Kind::Buffer => 6,
            Kind::Gate => 8,
            Kind::Stamper => 12,
            Kind::Empty => 0,
        }
    }

    /// Whether this kind reads `param` at all.
    ///
    /// Canonicalization zeroes `param` for kinds that ignore it, so that two
    /// otherwise identical blueprints cannot be given different hashes by
    /// scribbling in a field nothing reads. See `canon`.
    #[inline]
    pub const fn uses_param(self) -> bool {
        matches!(self, Kind::Splitter | Kind::Merger | Kind::Gate | Kind::Stamper)
    }

    /// Item capacity of the cell when occupied by this kind.
    #[inline]
    pub const fn capacity(self) -> u8 {
        match self {
            Kind::Buffer => 4,
            Kind::Empty => 0,
            _ => 1,
        }
    }
}

/// One decoded cell.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Cell {
    pub kind: Kind,
    /// Facing, 0=N 1=E 2=S 3=W.
    pub rot: u8,
    /// Kind-specific parameter: starting side, preload tokens, or recipe id.
    pub param: u8,
}

impl Cell {
    /// An unoccupied cell.
    pub const EMPTY: Cell = Cell { kind: Kind::Empty, rot: 0, param: 0 };

    #[inline]
    pub fn is_empty(&self) -> bool {
        matches!(self.kind, Kind::Empty)
    }
}

/// A decoded 12x12 blueprint.
///
/// Deliberately a fixed-size array rather than a `Vec`: this type is
/// constructed inside a Solana instruction where heap allocation is a cost we
/// can simply decline to pay.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Blueprint {
    pub cells: [Cell; BLUEPRINT_CELLS],
}

impl Default for Blueprint {
    fn default() -> Self {
        Blueprint { cells: [Cell::EMPTY; BLUEPRINT_CELLS] }
    }
}

impl Blueprint {
    /// Decode 288 bytes into cells.
    ///
    /// Rejects unknown kinds here rather than at simulation time so that the
    /// program can charge a caller for a malformed blueprint without having
    /// built a pull graph first.
    pub fn decode(bytes: &[u8]) -> Result<Blueprint, VmError> {
        if bytes.len() != BLUEPRINT_BYTES {
            return Err(VmError::BadLength);
        }
        let mut bp = Blueprint::default();
        for i in 0..BLUEPRINT_CELLS {
            let b0 = bytes[i * 2];
            let b1 = bytes[i * 2 + 1];
            let kind = Kind::from_nibble(b0 >> 4).ok_or(VmError::UnknownKind(i as u16))?;
            bp.cells[i] = Cell { kind, rot: (b0 >> 2) & 3, param: b1 };
        }
        Ok(bp)
    }

    /// Encode back to 288 bytes. `decode(encode(b)) == b` for every valid `b`.
    pub fn encode(&self) -> [u8; BLUEPRINT_BYTES] {
        let mut out = [0u8; BLUEPRINT_BYTES];
        for i in 0..BLUEPRINT_CELLS {
            let c = self.cells[i];
            let nib = match c.kind {
                Kind::Belt => 0,
                Kind::Splitter => 1,
                Kind::Merger => 2,
                Kind::Buffer => 3,
                Kind::Gate => 4,
                Kind::Stamper => 5,
                Kind::Empty => 0xF,
            };
            out[i * 2] = (nib << 4) | ((c.rot & 3) << 2);
            out[i * 2 + 1] = if c.kind.uses_param() { c.param } else { 0 };
        }
        out
    }

    /// Number of placed components.
    pub fn component_count(&self) -> u16 {
        let mut n = 0u16;
        for i in 0..BLUEPRINT_CELLS {
            if !self.cells[i].is_empty() {
                n += 1;
            }
        }
        n
    }

    /// Sum of component prices. This is the COST ladder axis, before modules.
    pub fn cost(&self) -> u16 {
        let mut c = 0u16;
        for i in 0..BLUEPRINT_CELLS {
            c = c.saturating_add(self.cells[i].kind.price());
        }
        c
    }

    /// Area of the axis-aligned bounding box of placed components.
    ///
    /// Fixtures are excluded by construction — they are not in the blueprint.
    /// An empty blueprint has footprint 0.
    pub fn footprint(&self) -> u16 {
        let (mut min_x, mut min_y, mut max_x, mut max_y) = (u8::MAX, u8::MAX, 0u8, 0u8);
        let mut any = false;
        for i in 0..BLUEPRINT_CELLS {
            if self.cells[i].is_empty() {
                continue;
            }
            any = true;
            let (x, y) = crate::xy(i as u16);
            if x < min_x {
                min_x = x;
            }
            if y < min_y {
                min_y = y;
            }
            if x > max_x {
                max_x = x;
            }
            if y > max_y {
                max_y = y;
            }
        }
        if !any {
            return 0;
        }
        ((max_x - min_x) as u16 + 1) * ((max_y - min_y) as u16 + 1)
    }
}
