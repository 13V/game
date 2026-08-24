#!/usr/bin/env python3
"""Turn the Monogon Dungeon voxel pack into DELVE models.

    python3 delve/tools/build_monogon.py <DungeonCrawler_Source.vox>  > delve/monogon.js

The pack is a MagicaVoxel scene of 284 objects built at ten voxels to the unit —
almost exactly DELVE's own voxel density, which is why the art drops in at native
scale rather than being resampled. Big modular blocks are sliced into per-tile
pieces (a 50x50 floor plate is twenty-five different floor stones), and the thin
brick wall panels are wrapped around solid tiles, because Monogon builds walls for
a 3D camera and DELVE looks down on them.

Nothing from the pack is redistributed: this reads a copy you own and emits our
own model format.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from voxlib import read_vox
from vox2delve import convert, js_model, slice_model, cap, brick_block

SRC = sys.argv[1] if len(sys.argv) > 1 else 'DungeonCrawler_Source.vox'
models, pal = read_vox(SRC)

out = []          # (name, model, extra-props)

# ---- the ground ------------------------------------------------------------
# Three sandstone plates, each cut into tiles; only the top courses survive,
# because a floor is a surface and the rest is never seen.
FLOOR_SRC = [(257, 'a'), (259, 'b'), (261, 'c')]
floor_names = []
for src, tag in FLOOR_SRC:
    sl = slice_model(models[src])
    for k, key in enumerate([(0, 0), (1, 2), (2, 4), (3, 1), (4, 3)]):
        if key not in sl: continue
        name = f'mgFloor{tag}{k}'
        out.append((name, cap(sl[key], 3), "\n    scale: 1, height: 0.16,"))
        floor_names.append(name)

# ---- the walls -------------------------------------------------------------
# Brick panels wrapped around a tile and capped with a flagstone.
top_stone = slice_model(models[257])[(2, 2)]
wall_names = []
for k, (panel, u0) in enumerate([(210, 0), (213, 0), (220, 0), (229, 0),
                                 (210, 20), (213, 20), (220, 20), (229, 20)]):
    b = brick_block(models[panel], top_stone, height=16, u0=u0)
    if not b: continue
    name = f'mgWall{k}'
    out.append((name, b, "\n    scale: 1, height: 1.35, moss: '#6f7f4a', mossy: 7,"))
    wall_names.append(name)

# ---- the cast --------------------------------------------------------------
# One armoured delver in four faction colours: the callings, already painted.
KNIGHTS = {'warden': 146, 'lancer': 144, 'breaker': 145, 'feral': 147}

def brighten(model, f=1.34):
    """Lift a figure out of the floor it stands on.

    The knights are painted for a lit 3D scene; DELVE multiplies a dark torch
    map over everything, and dark armour on warm stone disappears. Raising the
    figure's own palette is the cheapest fix that keeps its shading intact."""
    return {'size': model['size'], 'vox': model['vox'], 'lift': f}

for name, i in KNIGHTS.items():
    out.append((f'mg_{name}', brighten(models[i]),
                "\n    scale: 1.05, height: 2.23, outline: true,"))
out.append(('mgKnight', brighten(models[148]), "\n    scale: 1.05, height: 2.23, outline: true,"))

# ---- the furniture of a dungeon --------------------------------------------
# The things that make a corridor a hall: fire on the walls, columns down the
# sides, statues standing watch, and a rug where somebody meant you to walk.
GLOW = ''    # the converter finds the fire in a palette on its own
PIECES = [
    ('mgBrazier', 161, "\n    scale: 0.8, height: 1.5," + GLOW, 1.0),
    ('mgSconce',   89, "\n    scale: 0.62, height: 0.95," + GLOW, 1.0),
    ('mgFirebowl',104, "\n    scale: 0.7, height: 0.55," + GLOW, 1.0),
    ('mgColumn',  230, "\n    scale: 0.55, height: 2.9,", 1.0),
    ('mgColumn2', 190, "\n    scale: 0.55, height: 2.5,", 1.0),
    ('mgPillar',  188, "\n    scale: 0.8, height: 2.2,", 1.0),
    ('mgPillar2', 186, "\n    scale: 0.8, height: 2.2,", 1.0),
    ('mgStatue',  148, "\n    scale: 0.95, height: 2.0, outline: true,", 1.15),
    ('mgStair',   219, "\n    scale: 1.6, height: 1.5,", 1.0),
    ('mgArch',    224, "\n    scale: 1.6, height: 2.4,", 1.0),
    ('mgBarrel',  173, "\n    scale: 0.55, height: 0.75,", 1.1),
    ('mgCrate',   172, "\n    scale: 0.55, height: 0.7,", 1.1),
    ('mgRugR',    134, "\n    scale: 1.5, height: 0.05,", 1.2),
    ('mgRugG',    112, "\n    scale: 1.5, height: 0.05,", 1.2),
    ('mgRugB',    128, "\n    scale: 1.5, height: 0.05,", 1.2),
    ('mgBars',    215, "\n    scale: 1.5, height: 1.9,", 1.0),
    ('mgVine',    155, "\n    scale: 0.8, height: 0.9,", 1.0),
    ('mgBench',   182, "\n    scale: 0.9, height: 0.5,", 1.05),
    # The hangings. Modelled FLAT, one voxel thick, because MagicaVoxel lays a
    # scene out on the ground — they are meant to be stood upright against a
    # wall, which is what the hall builder does with them.
    # crimson with gold trim — the hangings from the reference hall
    ('mgBanner1', 129, "\n    scale: 1.0, height: 0.03,", 1.2),
    ('mgBanner2', 130, "\n    scale: 1.0, height: 0.03,", 1.2),
    ('mgBanner3', 133, "\n    scale: 1.0, height: 0.03,", 1.2),
    ('mgBanner4', 134, "\n    scale: 1.0, height: 0.03,", 1.2),
    ('mgBannerBig', 131, "\n    scale: 1.0, height: 0.03,", 1.2),
    ('mgBannerG',  112, "\n    scale: 1.0, height: 0.03,", 1.2),
    ('mgBannerB',  128, "\n    scale: 1.0, height: 0.03,", 1.2),
    ('mgPlinth',  158, "\n    scale: 0.8, height: 0.55,", 1.0),
    ('mgPlinth2', 159, "\n    scale: 0.85, height: 0.6,", 1.0),
    ('mgAltar',    74, "\n    scale: 1.1, height: 0.9,", 1.05),
]
for name, i, extra, lift in PIECES:
    if i < len(models):
        m = dict(models[i]); m['lift'] = lift
        out.append((name, m, extra))

# ---- emit ------------------------------------------------------------------
body = ''
for name, m, extra in out:
    c = convert(m, pal, name)
    if c: body += js_model(c, extra)

print('// DELVE — the Monogon Dungeon set.')
print('//')
print('// Generated by delve/tools/build_monogon.py from the Monogon Dungeon Crawler')
print('// pack (Max Parata). Do not edit by hand: re-run the tool.')
print('//')
print('// Each model is RLE\'d by row — a wall is two thousand characters raw and most')
print('// of it is one unbroken run of stone. expandRLE in models.js unpacks them the')
print('// first time a model is drawn, and the sprite cache means that happens once.')
print('export const MONOGON = {')
print(body, end='')
print('};')
sys.stderr.write(f'{len(out)} models emitted\n')
