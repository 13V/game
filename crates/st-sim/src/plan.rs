//! The plan: an ordered list of at most 150 placements, 4 bytes each.
//!
//! List order is load-bearing three times over (spec §2.2): it is the build
//! order, the staffing priority, and the construction queue. One field, three
//! jobs, 600 bytes — which is why order is preserved by canonicalization and
//! why reordering two entries is a genuinely different plan.

use crate::{SimError, GRID, MAX_PLACEMENTS};

/// The medieval building palette. Discriminants are wire format — what the
/// third byte of a placement decodes to — and may never be renumbered.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum BuildingKind {
    /// +4 housing. 4 wood.
    Cottage = 0,
    /// Food from adjacent grass. 2 wood. Food is consumed locally and is the
    /// one product exempt from market-distance scaling.
    Field = 1,
    /// Wood from adjacent forest. 3 wood.
    Sawmill = 2,
    /// Stone from adjacent rock. 5 wood.
    Quarry = 3,
    /// Ore from adjacent ore veins. 8 wood, 4 stone.
    Mine = 4,
    /// Wood + ore → goods. 6 wood, 6 stone.
    Smithy = 5,
    /// Connectivity. 1 stone. The only piece with no flatness requirement.
    Road = 6,
    /// Exports goods; the anchor every distance is measured to. 20 wood, 20 stone.
    Market = 7,
}

impl BuildingKind {
    #[inline]
    pub fn from_byte(b: u8) -> Option<BuildingKind> {
        Some(match b {
            0 => BuildingKind::Cottage,
            1 => BuildingKind::Field,
            2 => BuildingKind::Sawmill,
            3 => BuildingKind::Quarry,
            4 => BuildingKind::Mine,
            5 => BuildingKind::Smithy,
            6 => BuildingKind::Road,
            7 => BuildingKind::Market,
            _ => return None,
        })
    }

    /// Construction cost as `(wood, stone)`.
    #[inline]
    pub const fn cost(self) -> (u32, u32) {
        match self {
            BuildingKind::Cottage => (4, 0),
            BuildingKind::Field => (2, 0),
            BuildingKind::Sawmill => (3, 0),
            BuildingKind::Quarry => (5, 0),
            BuildingKind::Mine => (8, 4),
            BuildingKind::Smithy => (6, 6),
            BuildingKind::Road => (0, 1),
            BuildingKind::Market => (20, 20),
        }
    }

    /// Maximum villagers assigned. Cottages and roads take none.
    #[inline]
    pub const fn staff_cap(self) -> u16 {
        match self {
            BuildingKind::Cottage | BuildingKind::Road => 0,
            _ => 4,
        }
    }

    /// Whether placement requires flat ground (tile and orthogonal neighbours
    /// within ±1 height). Roads instead climb: their traversal edges connect
    /// adjacent road tiles within ±1, checked at BFS time.
    #[inline]
    pub const fn needs_flat(self) -> bool {
        !matches!(self, BuildingKind::Road)
    }
}

/// One placement. `param` is reserved in v1 and carried for the wire format.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Placement {
    pub x: u8,
    pub y: u8,
    pub kind: BuildingKind,
    pub param: u8,
}

impl Placement {
    #[inline]
    pub fn index(&self) -> u16 {
        crate::idx(self.x, self.y)
    }
}

/// A decoded plan. Fixed-size storage — this is constructed inside a Solana
/// instruction, where heap allocation is a cost we decline to pay.
#[derive(Clone)]
pub struct Plan {
    items: [Placement; MAX_PLACEMENTS],
    len: usize,
}

impl Plan {
    pub const EMPTY_SLOT: Placement =
        Placement { x: 0, y: 0, kind: BuildingKind::Road, param: 0 };

    /// Build from a slice of placements. Tests use this; the program decodes.
    pub fn from_slice(items: &[Placement]) -> Result<Plan, SimError> {
        if items.len() > MAX_PLACEMENTS {
            return Err(SimError::TooManyPlacements);
        }
        let mut plan = Plan { items: [Self::EMPTY_SLOT; MAX_PLACEMENTS], len: items.len() };
        let mut i = 0;
        while i < items.len() {
            plan.items[i] = items[i];
            i += 1;
        }
        Ok(plan)
    }

    /// Decode the wire format: `(x, y, kind, param)` × N, N ≤ 150.
    ///
    /// Only structural validity is checked here — geometry (bounds are checked,
    /// but water, overlap, slope) is the simulator's job, because it needs the
    /// valley to judge.
    pub fn decode(bytes: &[u8]) -> Result<Plan, SimError> {
        if bytes.len() % 4 != 0 {
            return Err(SimError::BadLength);
        }
        let n = bytes.len() / 4;
        if n > MAX_PLACEMENTS {
            return Err(SimError::TooManyPlacements);
        }
        let mut plan = Plan { items: [Self::EMPTY_SLOT; MAX_PLACEMENTS], len: n };
        let mut i = 0;
        while i < n {
            let (x, y, k, param) =
                (bytes[i * 4], bytes[i * 4 + 1], bytes[i * 4 + 2], bytes[i * 4 + 3]);
            if x as usize >= GRID || y as usize >= GRID {
                return Err(SimError::OutOfBounds(i as u8));
            }
            let kind = BuildingKind::from_byte(k).ok_or(SimError::UnknownKind(i as u8))?;
            plan.items[i] = Placement { x, y, kind, param };
            i += 1;
        }
        Ok(plan)
    }

    /// Encode back to wire bytes. `decode(encode(p)) == p` for every valid plan.
    pub fn encode(&self, out: &mut [u8; MAX_PLACEMENTS * 4]) -> usize {
        let mut i = 0;
        while i < self.len {
            let p = self.items[i];
            out[i * 4] = p.x;
            out[i * 4 + 1] = p.y;
            out[i * 4 + 2] = p.kind as u8;
            out[i * 4 + 3] = p.param;
            i += 1;
        }
        self.len * 4
    }

    #[inline]
    pub fn len(&self) -> usize {
        self.len
    }

    #[inline]
    pub fn is_empty(&self) -> bool {
        self.len == 0
    }

    #[inline]
    pub fn get(&self, i: usize) -> Placement {
        self.items[i]
    }

    pub fn items(&self) -> &[Placement] {
        &self.items[..self.len]
    }
}
