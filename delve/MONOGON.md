# The Monogon set

DELVE's dungeon art comes from the **Monogon Dungeon Crawler pack** by Max Parata
(itch.io Source Pack). The pack is NOT in this repository — only our conversion of it.

## Rebuilding

    python3 delve/tools/build_monogon.py path/to/DungeonCrawler_Source.vox > delve/monogon.js
    node delve/build.mjs

`delve/monogon.js` is generated; never edit it by hand.

## How the conversion works

The pack is a MagicaVoxel scene of 284 objects built at roughly ten voxels to the
unit — almost exactly DELVE's own voxel density, which is why the art drops in at
native scale instead of being resampled.

- `tools/voxlib.py` reads the `.vox` chunk format (SIZE / XYZI / RGBA).
- `tools/vox2delve.py` converts a model to DELVE's ASCII voxel layers, hollows out
  sealed interiors (three quarters of a solid block is never seen), RLE-compresses
  each row, and finds the fire in a palette so braziers glow without being told.
- `tools/build_monogon.py` picks the models, slices the big modular blocks into
  per-tile pieces, and wraps the thin brick wall panels around solid tiles —
  Monogon builds walls for a camera that stands in the room, DELVE looks down on
  them.

`expandRLE` in `models.js` unpacks a model the first time it is drawn; the sprite
cache means that happens once per model, not once per frame.

## Licence

Commercial use is permitted under the pack's licence, with attribution. The raw
`.vox`/`.fbx` files are deliberately not committed — redistributing the assets
themselves is not permitted, and is not needed: the converter reads a copy you own.

## The 3D renderer

DELVE is moving to a true 3D renderer (perspective camera, real lights and cast
shadows) while keeping every rule intact — `rules.js` is untouched, so runs still
replay byte-identically and the server can still verify the daily leaderboard.

- `vendor/three.bundle.js` is three.js (MIT, r185) flattened into ONE inlinable
  script by `tools/bundle_three.mjs`. The game ships as a single HTML file under a
  CSP with no external hosts, so a CDN is not an option and two ES modules that
  import each other are not either. The rewrite is exact rather than a guess:
  core's exports become a namespace, the module's import becomes a destructure of
  it, and both export blocks — including the flattened `export * from` — come out.
- `mesh3d.js` melts a voxel model into ONE mesh: only faces with nothing against
  them survive, each carries its colour in the vertices, and the result is cached
  per model. A wall is melted once however many times it is built into a floor.

Re-bundle three.js with:

    node delve/tools/bundle_three.mjs > delve/vendor/three.bundle.js
