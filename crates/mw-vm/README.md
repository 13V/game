# mw-vm

The MILLWRIGHT deterministic simulation core.

This crate is compiled three times — into the Anchor program (SBF), into the
browser client (WASM), and into the native test binary — and all three must
produce bit-identical results from the same 288-byte blueprint. That single
requirement explains every unusual choice in here:

- **No dependencies.** Nothing to drift between targets, and no feature-flag
  skew. SHA-256 is vendored for the same reason: Solana's `sol_sha256` syscall
  is cheaper on-chain but does not exist in WASM, and two implementations of the
  same digest is exactly how a client and a program end up disagreeing about a
  blueprint hash.
- **`no_std`, no allocation.** Fixed-size arrays throughout. Heap allocation
  inside a Solana instruction is a cost we can simply decline to pay.
- **No floats, no hash maps, no iteration over unordered collections.** Every
  loop runs over an index range or an explicitly sorted slice.
- **`forbid(unsafe_code)`**, and `overflow-checks` on in release.

## Layout

| Module | Contents |
| --- | --- |
| `blueprint` | The 288-byte wire format: 2 bytes per cell, 144 cells, raster order. |
| `contract` | Weekly puzzle parameters — fixtures, recipes, spec, obstacles. |
| `sim` | Pull-graph construction, drain order, the tick loop, scoring. |
| `canon` | Canonicalization and hashing, backing the copy-forward dedupe rule. |
| `sha256` | Vendored digest. |

## The tick rule

The most important thing in the crate, and the reason belts behave sanely.
At validation the simulator builds the *pull graph* — a directed edge `d <- s`
for every component `d` that can pull from cell `s` — and topologically sorts it
so **every consumer is processed before its supplier**. Cycles break at the
lowest cell index. Sinks come first by construction; sources last.

Two consequences fall out. A belt chain shifts one tile per tick regardless of
orientation, because a consumer always runs before its supplier. And two
consumers competing for one supplier resolve deterministically by drain-order
position, with no tie-break rule needed.

## Tests

`cargo test -p mw-vm` — 28 tests.

- `worked_example.rs` asserts the exact drain order and the exact
  CYCLES 50 / FOOTPRINT 10 / COST 21 from spec §2.6. If these drift, either the
  VM is wrong or the spec changed; both should fail a build, because this
  example is what every client, solver and replay renderer is calibrated
  against.
- `components.rs` covers splitter, merger, gate and buffer — including the rules
  that are easy to get subtly wrong, such as only a splitter's *currently
  selected* output being able to draw from it.
- `canon.rs` pins the deduplication properties: decorative padding and unread
  `param` bytes must not launder a copy, while translation and a changed recipe
  must produce a different hash. Includes NIST vectors for the digest.

## Not yet built

The Anchor program (`mw-program`) and the WASM wrapper (`mw-wasm`) named in
spec §3. Neither the Solana CLI nor Anchor is installed in this environment, so
the deterministic core came first — it is the part both of the others depend on,
and the part that has to be right before anything else is worth writing.
