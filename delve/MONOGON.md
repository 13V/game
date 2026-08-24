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
