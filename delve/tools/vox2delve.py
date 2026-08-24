"""Monogon .vox -> DELVE model source.

DELVE models are ASCII voxel layers with a single-char palette. Monogon models use
at most 16 colours each, so every model gets its own char map drawn from a printable
set. Layers are RLE'd because a 10x10x20 wall is 2,000 characters raw and most of
that is empty air or an unbroken run of one stone.
"""
import sys, json
sys.path.insert(0, __import__('os').path.dirname(__file__))
from voxlib import read_vox

CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+=/*<>?!@$%^&~'

def hollow(vox):
    """Drop voxels sealed on all six sides — a quarter of a solid block is skin."""
    occ = {(v[0], v[1], v[2]) for v in vox}
    out = []
    for v in vox:
        x, y, z = v[0], v[1], v[2]
        if all((x+dx, y+dy, z+dz) in occ for dx, dy, dz in
               ((1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1))):
            continue
        out.append(v)
    return out

def rle(row):
    """'aaa..bb' -> 'a3.2b2'; single chars stay bare."""
    out, i = [], 0
    while i < len(row):
        ch = row[i]
        n = 1
        while i + n < len(row) and row[i+n] == ch: n += 1
        out.append(ch if n == 1 else f'{ch}{n}')
        i += n
    return ''.join(out)

def convert(model, pal, name, drop_interior=True, trim=True, swap_axes=True):
    """Return a dict ready to emit as a DELVE model.

    MagicaVoxel is Z-up with Y as depth; DELVE layers are z-major with (x,y) per layer,
    also Z-up. Axes line up directly.
    """
    vox = hollow(model['vox']) if drop_interior else list(model['vox'])
    if not vox: return None
    xs = [v[0] for v in vox]; ys = [v[1] for v in vox]; zs = [v[2] for v in vox]
    x0, x1 = (min(xs), max(xs)) if trim else (0, model['size'][0]-1)
    y0, y1 = (min(ys), max(ys)) if trim else (0, model['size'][1]-1)
    z0, z1 = (min(zs), max(zs)) if trim else (0, model['size'][2]-1)
    w, d, h = x1-x0+1, y1-y0+1, z1-z0+1
    used = sorted({v[3] for v in vox})
    if len(used) > len(CHARS): raise ValueError(f'{name}: {len(used)} colours')
    cmap = {ci: CHARS[k] for k, ci in enumerate(used)}
    grid = [[['.'] * w for _ in range(d)] for _ in range(h)]
    for (x, y, z, ci) in vox:
        grid[z-z0][y-y0][x-x0] = cmap[ci]
    layers = [[rle(''.join(row)) for row in layer] for layer in grid]
    f = model.get('lift', 1.0)
    def col(ci):
        r, g, b = pal[ci][:3]
        return '#%02x%02x%02x' % tuple(min(255, round(v * f)) for v in (r, g, b))
    palette = {cmap[ci]: col(ci) for ci in used}
    # Which of a model's colours are FIRE: bright, warm, and much lighter than
    # the model's own average. Guessing the palette characters by hand meant
    # writing glow: 'GHI' and hoping; this asks the art instead.
    def lum(hexcol):
        n = int(hexcol[1:], 16)
        return (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255
    def warm(hexcol):
        n = int(hexcol[1:], 16)
        r, g, b = (n >> 16) & 255, (n >> 8) & 255, n & 255
        return r > 170 and g > 110 and r - b > 60
    avg = sum(lum(c) for c in palette.values()) / max(1, len(palette))
    glow = ''.join(ch for ch, col in palette.items() if warm(col) and lum(col) > avg + 0.20)
    return {'name': name, 'w': w, 'd': d, 'h': h, 'pal': palette, 'rle': layers,
            'voxels': len(vox), 'glow': glow}

def js_model(m, extra=''):
    if m.get('glow') and 'glow:' not in extra:
        tint = ', '.join(f"{ch}:'#ffd08a'" for ch in m['glow'])
        extra += f"\n    glow: '{m['glow']}', glowStrength: 0.55, glowTint: {{ {tint} }},"
    pal = ', '.join(f"{k}:'{v}'" for k, v in m['pal'].items())
    layers = ',\n      '.join('[' + ', '.join(f"'{r}'" for r in layer) + ']' for layer in m['rle'])
    return (f"  {m['name']}: {{\n    pal: {{ {pal} }},{extra}\n"
            f"    rle: [\n      {layers},\n    ],\n  }},\n")

def slice_model(model, tile=10):
    """Cut a big Monogon block into per-tile columns of voxels.

    Monogon builds at ~10 voxels per unit, so a 50x50 block is 5x5 tiles. DELVE
    draws per tile, so each tile gets its own little model — which also buys
    free variety: twenty-five different floor stones out of one block.
    """
    sx, sy, sz = model['size']
    cells = {}
    for (x, y, z, ci) in model['vox']:
        key = (x // tile, y // tile)
        cells.setdefault(key, []).append((x % tile, y % tile, z, ci))
    out = {}
    for key, vox in cells.items():
        out[key] = {'size': (tile, tile, sz), 'vox': vox}
    return out

def cap(model, zmax):
    """Keep only the top zmax voxel courses — a 5-unit cube becomes a wall."""
    zs = [v[2] for v in model['vox']]
    if not zs: return model
    top = max(zs)
    keep = [v for v in model['vox'] if v[2] > top - zmax]
    lo = min(v[2] for v in keep) if keep else 0
    return {'size': (model['size'][0], model['size'][1], zmax),
            'vox': [(v[0], v[1], v[2]-lo, v[3]) for v in keep]}

def face_of(model, axis='y', at=None):
    """Flatten a thin panel to a 2D face: {(u, z): colorIndex}."""
    vox = model['vox']
    if at is None:
        vals = [v[1] if axis == 'y' else v[0] for v in vox]
        at = min(vals)
    face = {}
    for (x, y, z, ci) in vox:
        if (y if axis == 'y' else x) != at: continue
        u = x if axis == 'y' else y
        face[(u, z)] = ci
    return face

def brick_block(panel, top, tile=10, height=16, u0=0):
    """A solid DELVE wall tile wearing Monogon brick on all four sides.

    Monogon's walls are thin panels meant to be stood up in 3D; DELVE's walls
    are solid tiles seen from above. So the panel's FACE is wrapped around a
    block and capped with a floor stone, which is the same wall the artist drew
    — just built for a different camera.
    """
    face = face_of(panel, 'y')
    zs = [z for (_, z) in face]
    if not zs: return None
    zmax = max(zs)
    grid = {}
    for z in range(height):
        sz = zmax - (height - 1 - z)              # read the panel from its top down
        for x in range(tile):
            for y in range(tile):
                edge_y = y == 0 or y == tile - 1
                edge_x = x == 0 or x == tile - 1
                if not (edge_x or edge_y): continue
                u = (u0 + (x if edge_y else y)) % 50
                ci = face.get((u, sz))
                if ci is None: ci = face.get((u, max(0, sz - 1)))
                if ci is not None: grid[(x, y, z)] = ci
    # the cap: a floor stone's top course, so a wall reads as built, not extruded
    tvox = [v for v in top['vox'] if v[2] == max(w[2] for w in top['vox'])]
    tmin_x = min(v[0] for v in tvox); tmin_y = min(v[1] for v in tvox)
    for (x, y, z, ci) in tvox:
        gx, gy = (x - tmin_x) % tile, (y - tmin_y) % tile
        grid[(gx, gy, height - 1)] = ci
    vox = [(x, y, z, ci) for (x, y, z), ci in grid.items()]
    return {'size': (tile, tile, height), 'vox': vox}
